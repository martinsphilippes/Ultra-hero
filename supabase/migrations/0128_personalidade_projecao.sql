-- =============================================================================
-- 0128 — Reunião Groscove (06/11/2026), lote E: teste de personalidade, tipo de pagamento por projeto e projeção.
--
-- Decisões:
--   • Teste de personalidade (16 tipos, 4 eixos: E/I, S/N, T/F, J/P) para quem trabalha na plataforma: agência,
--     marca e Hero (o consumidor comum não). O questionário é próprio do Ultra; o resultado (tipo + pontuação
--     por eixo) fica em personality_results. A pessoa vê o dela; os Adms da agência veem o da equipe
--     (Funcionários).
--   • Cada projeto (negócio) diz como paga: permuta, valor fixo ou performance (% sobre o resultado).
--   • Projeção: soma dos cachês dos últimos 12 meses (negócios fechados) + o que está em aberto no pipeline, por
--     segmento do Calendário Groscove ("projeção no seu segmento") e para a pessoa ("projeção para você").
-- =============================================================================

-- 1) teste de personalidade ------------------------------------------------------------------------------------------
create table if not exists public.personality_results (
  user_id uuid primary key references auth.users (id) on delete cascade,
  type text not null check (type ~ '^[EI][SN][TF][JP]$'),
  scores jsonb not null default '{}'::jsonb,
  taken_at timestamptz not null default now()
);
alter table public.personality_results enable row level security;
revoke all on public.personality_results from public, anon, authenticated;
grant select on public.personality_results to authenticated;
grant all on public.personality_results to service_role;
drop policy if exists personality_results_select on public.personality_results;
create policy personality_results_select on public.personality_results for select to authenticated
  using (user_id = (select auth.uid())
    or exists (select 1 from public.agency_members m where m.user_id = personality_results.user_id and m.revoked_at is null
               and m.agency_id = any ((select public.my_agency_ids('admin'))::uuid[]))
    or (select public.is_platform_admin()));

-- quem trabalha na plataforma (agência, marca ou Hero); o consumidor comum não faz o teste
create or replace function public.works_on_platform()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.agency_members m where m.user_id = auth.uid() and m.revoked_at is null)
    or exists (select 1 from public.brand_members m where m.user_id = auth.uid() and m.revoked_at is null)
    or exists (select 1 from public.creator_profiles c where c.user_id = auth.uid())
    or exists (select 1 from public.creator_team_members m where m.user_id = auth.uid() and m.status = 'active')
    or exists (select 1 from public.talent_profiles t where t.user_id = auth.uid())
    or public.is_platform_admin())
$$;
revoke execute on function public.works_on_platform() from public, anon;
grant execute on function public.works_on_platform() to authenticated, service_role;

create or replace function public.personality_save(p_type text, p_scores jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.works_on_platform() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type is null or p_type !~ '^[EI][SN][TF][JP]$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  insert into public.personality_results (user_id, type, scores, taken_at) values (auth.uid(), p_type, p_scores, now())
  on conflict (user_id) do update set type = excluded.type, scores = excluded.scores, taken_at = now();
  return true;
end $$;
revoke execute on function public.personality_save(text, jsonb) from public, anon;
grant execute on function public.personality_save(text, jsonb) to authenticated, service_role;

-- 2) como o projeto paga ---------------------------------------------------------------------------------------------
alter table public.deals add column if not exists compensation_type text not null default 'fixed';
alter table public.deals drop constraint if exists deals_compensation_type_check;
alter table public.deals add constraint deals_compensation_type_check check (compensation_type in ('barter', 'fixed', 'performance'));
alter table public.deals add column if not exists performance_pct numeric(5, 2);
alter table public.deals drop constraint if exists deals_performance_pct_check;
alter table public.deals add constraint deals_performance_pct_check check (performance_pct is null or performance_pct between 0 and 100);

create or replace function public.deal_set_compensation(p_deal uuid, p_type text, p_pct numeric default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_agency uuid;
begin
  select d.agency_id into v_agency from public.deals d where d.id = p_deal;
  if v_agency is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type is null or p_type not in ('barter', 'fixed', 'performance') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_type = 'performance' and (p_pct is null or p_pct <= 0 or p_pct > 100) then raise exception 'performance_pct_required' using errcode = '22023'; end if;
  update public.deals set compensation_type = p_type, performance_pct = case when p_type = 'performance' then p_pct end where id = p_deal;
  return true;
end $$;
revoke execute on function public.deal_set_compensation(uuid, text, numeric) from public, anon;
grant execute on function public.deal_set_compensation(uuid, text, numeric) to authenticated, service_role;

-- 3) projeção --------------------------------------------------------------------------------------------------------
-- cachê por Hero em negócio: fechados nos últimos 12 meses (realizado) e abertos (em andamento)
create or replace function public.finance_projection(p_agency uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talents uuid[]; v_mine jsonb; v_segments jsonb; v_agency_total jsonb;
begin
  if not public.works_on_platform() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_agency is not null and not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- "para você": Hero (os talentos ligados à conta) ou, na agência, os negócios em que a pessoa é responsável
  select coalesce(array_agg(t.id), '{}'::uuid[]) into v_talents from public.talent_profiles t
  left join public.creator_profiles c on c.id = t.creator_id where t.user_id = auth.uid() or c.user_id = auth.uid();

  with fees as (
    select f.fee_cents, f.talent_id, d.agency_id, d.owner_id, d.outcome, d.closed_at, t.segments
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id join public.talent_profiles t on t.id = f.talent_id
    where not d.is_demo and d.compensation_type <> 'barter'
  ), scoped as (
    select * from fees where (p_agency is null or agency_id = p_agency)
  )
  select jsonb_build_object(
      'won_12m', coalesce(sum(fee_cents) filter (where outcome = 'won' and closed_at > now() - interval '12 months'), 0),
      'open', coalesce(sum(fee_cents) filter (where outcome is null), 0))
    into v_mine
  from scoped
  where talent_id = any (v_talents) or (p_agency is not null and owner_id = auth.uid());

  with fees as (
    select f.fee_cents, d.outcome, d.closed_at, t.segments
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id join public.talent_profiles t on t.id = f.talent_id
    where not d.is_demo and d.compensation_type <> 'barter'
  )
  select coalesce(jsonb_agg(jsonb_build_object('segment', s, 'won_12m', won, 'open', open) order by won + open desc), '[]'::jsonb) into v_segments
  from (select s, sum(fee_cents) filter (where outcome = 'won' and closed_at > now() - interval '12 months') as won,
               sum(fee_cents) filter (where outcome is null) as open
        from fees, unnest(segments) s group by s) x
  where coalesce(won, 0) + coalesce(open, 0) > 0;

  if p_agency is not null and public.agency_can(p_agency, 'manager') then
    select jsonb_build_object(
        'won_12m', coalesce(sum(f.fee_cents) filter (where d.outcome = 'won' and d.closed_at > now() - interval '12 months'), 0),
        'open', coalesce(sum(f.fee_cents) filter (where d.outcome is null), 0))
      into v_agency_total
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id
    where d.agency_id = p_agency and not d.is_demo and d.compensation_type <> 'barter';
  end if;

  return jsonb_build_object('mine', v_mine, 'segments', v_segments, 'agency', v_agency_total,
    'my_segments', (select coalesce(jsonb_agg(distinct s), '[]'::jsonb) from public.talent_profiles t, unnest(t.segments) s where t.id = any (v_talents)));
end $$;
revoke execute on function public.finance_projection(uuid) from public, anon;
grant execute on function public.finance_projection(uuid) to authenticated, service_role;
