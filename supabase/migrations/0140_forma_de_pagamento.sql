-- =============================================================================
-- 0140 — Forma de pagamento: Valor, Permuta e Performance, combináveis (pedido de 08/11/2026)
--   "A criação da oportunidade e negócio pode não ser apenas financeiro, mas pode ser permuta [...] Negócio e
--   oportunidade pode ser na verdade por valor, permuta ou performance."
--   Decisões do dono (08/11/2026): pode combinar (ex.: R$ 5.000 + kit de produtos; valor fixo + 10% das vendas);
--   permuta = o que oferece (obrigatório) + valor estimado total em R$ (opcional: nota fiscal e Projeção);
--   performance = regra (% das vendas, R$ por venda ou R$ por cadastro) + como mede (cupom, link) + estimativa total
--   em R$ (opcional); a Projeção mostra permuta e performance à parte (os números grandes seguem só em dinheiro).
--
--   Formato único (jsonb "compensation"), conferido por compensation_valid:
--     {"money": bool, "barter": null | {"offer": texto 3–300, "value_cents": null | 1..1e10},
--      "performance": null | {"kind": "percent"|"per_sale"|"per_lead", "rate": % (0,01–100, 2 casas) ou centavos,
--                             "measure": texto 2–200, "estimate_cents": null | 1..1e10}}
--   Pelo menos uma forma marcada. "money": false = sem dinheiro: os campos de valor ficam vazios e os fluxos de
--   negociação aceitam acordo sem valor (só permuta/performance). Tudo que já existia vira "só valor".
--   Valores de permuta e performance seguem a regra de sempre: só quem lê valores (marca, Adm) vê os números; gestor,
--   equipe e Hero veem o tipo e as descrições.
-- =============================================================================

-- 1) regra comum ------------------------------------------------------------------------------------------------------
create or replace function public.compensation_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare b jsonb; f jsonb; k text; r numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('money', 'barter', 'performance') then return false; end if;
  end loop;
  if jsonb_typeof(p -> 'money') is distinct from 'boolean' then return false; end if;
  if p ? 'barter' and jsonb_typeof(p -> 'barter') not in ('object', 'null') then return false; end if;
  if p ? 'performance' and jsonb_typeof(p -> 'performance') not in ('object', 'null') then return false; end if;
  b := case when jsonb_typeof(p -> 'barter') = 'object' then p -> 'barter' end;
  f := case when jsonb_typeof(p -> 'performance') = 'object' then p -> 'performance' end;
  if not (p ->> 'money')::boolean and b is null and f is null then return false; end if;
  if b is not null then
    for k in select jsonb_object_keys(b) loop
      if k not in ('offer', 'value_cents') then return false; end if;
    end loop;
    if jsonb_typeof(b -> 'offer') is distinct from 'string' or char_length(b ->> 'offer') not between 3 and 300
       or (b ->> 'offer') <> btrim(b ->> 'offer') then
      return false;
    end if;
    if b ? 'value_cents' and jsonb_typeof(b -> 'value_cents') <> 'null' then
      if jsonb_typeof(b -> 'value_cents') <> 'number' then return false; end if;
      r := (b ->> 'value_cents')::numeric;
      if r <> trunc(r) or r < 1 or r > 10000000000 then return false; end if;
    end if;
  end if;
  if f is not null then
    for k in select jsonb_object_keys(f) loop
      if k not in ('kind', 'rate', 'measure', 'estimate_cents') then return false; end if;
    end loop;
    if (f ->> 'kind') is null or (f ->> 'kind') not in ('percent', 'per_sale', 'per_lead') then return false; end if;
    if jsonb_typeof(f -> 'rate') is distinct from 'number' then return false; end if;
    r := (f ->> 'rate')::numeric;
    if f ->> 'kind' = 'percent' then
      if r <= 0 or r > 100 or round(r, 2) <> r then return false; end if;
    elsif r <> trunc(r) or r < 1 or r > 10000000000 then
      return false;
    end if;
    if jsonb_typeof(f -> 'measure') is distinct from 'string' or char_length(f ->> 'measure') not between 2 and 200
       or (f ->> 'measure') <> btrim(f ->> 'measure') then
      return false;
    end if;
    if f ? 'estimate_cents' and jsonb_typeof(f -> 'estimate_cents') <> 'null' then
      if jsonb_typeof(f -> 'estimate_cents') <> 'number' then return false; end if;
      r := (f ->> 'estimate_cents')::numeric;
      if r <> trunc(r) or r < 1 or r > 10000000000 then return false; end if;
    end if;
  end if;
  return true;
end $$;
revoke execute on function public.compensation_valid(jsonb) from public, anon;
grant execute on function public.compensation_valid(jsonb) to authenticated, service_role;

-- número inteiro como inteiro (30000.0 → 30000); o resto fica como veio (a regra recusa)
create or replace function public.compensation_int(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p is null then 'null'::jsonb
              when jsonb_typeof(p) = 'number' and (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric) then to_jsonb((p #>> '{}')::numeric::bigint)
              else p end
$$;
revoke execute on function public.compensation_int(jsonb) from public, anon;
grant execute on function public.compensation_int(jsonb) to authenticated, service_role;

-- forma canônica (todas as chaves, textos aparados) ou erro invalid_compensation; null → "só valor"
create or replace function public.compensation_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb; b jsonb; f jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{"money": true, "barter": null, "performance": null}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'invalid_compensation' using errcode = '22023'; end if;
  b := case when jsonb_typeof(p -> 'barter') = 'object' then p -> 'barter' end;
  f := case when jsonb_typeof(p -> 'performance') = 'object' then p -> 'performance' end;
  v := jsonb_build_object(
    'money', p -> 'money',
    'barter', case when b is null then null else jsonb_build_object(
      'offer', to_jsonb(btrim(coalesce(b ->> 'offer', ''))),
      'value_cents', public.compensation_int(b -> 'value_cents')) end,
    'performance', case when f is null then null else jsonb_build_object(
      'kind', f -> 'kind',
      'rate', case when f ->> 'kind' in ('per_sale', 'per_lead') then public.compensation_int(f -> 'rate') else coalesce(f -> 'rate', 'null'::jsonb) end,
      'measure', to_jsonb(btrim(coalesce(f ->> 'measure', ''))),
      'estimate_cents', public.compensation_int(f -> 'estimate_cents')) end);
  if (p ? 'barter' and b is null and jsonb_typeof(p -> 'barter') <> 'null')
     or (p ? 'performance' and f is null and jsonb_typeof(p -> 'performance') <> 'null')
     or not public.compensation_valid(v) then
    raise exception 'invalid_compensation' using errcode = '22023';
  end if;
  return v;
end $$;
revoke execute on function public.compensation_clean(jsonb) from public, anon;
grant execute on function public.compensation_clean(jsonb) to authenticated, service_role;

-- leitura rápida: tem dinheiro? quanto de permuta e de performance (estimados, total)?
create or replace function public.compensation_money(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce((p ->> 'money')::boolean, true)
$$;
create or replace function public.compensation_barter_cents(p jsonb)
returns bigint language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p -> 'barter' -> 'value_cents') = 'number' then (p -> 'barter' ->> 'value_cents')::numeric::bigint end, 0)
$$;
create or replace function public.compensation_perf_cents(p jsonb)
returns bigint language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p -> 'performance' -> 'estimate_cents') = 'number' then (p -> 'performance' ->> 'estimate_cents')::numeric::bigint end, 0)
$$;
revoke execute on function public.compensation_money(jsonb) from public, anon;
revoke execute on function public.compensation_barter_cents(jsonb) from public, anon;
revoke execute on function public.compensation_perf_cents(jsonb) from public, anon;
grant execute on function public.compensation_money(jsonb) to authenticated, service_role;
grant execute on function public.compensation_barter_cents(jsonb) to authenticated, service_role;
grant execute on function public.compensation_perf_cents(jsonb) to authenticated, service_role;

-- 2) negócio da agência ----------------------------------------------------------------------------------------------
-- substitui compensation_type/performance_pct (0128: um tipo só, performance só com %) pela forma combinável
alter table public.deals add column if not exists compensation jsonb not null default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.deals drop constraint if exists deals_compensation_check;
alter table public.deals add constraint deals_compensation_check check (public.compensation_valid(compensation));

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'compensation_type') then
    execute $q$
      update public.deals set compensation = case compensation_type
        when 'barter' then '{"money": false, "barter": {"offer": "A combinar", "value_cents": null}, "performance": null}'::jsonb
        when 'performance' then jsonb_build_object('money', false, 'barter', null, 'performance',
          jsonb_build_object('kind', 'percent', 'rate', coalesce(nullif(performance_pct, 0), 1), 'measure', 'A combinar', 'estimate_cents', null))
        else '{"money": true, "barter": null, "performance": null}'::jsonb end
      where compensation_type <> 'fixed'
    $q$;
  end if;
end $$;

drop function if exists public.deal_set_compensation(uuid, text, numeric);
alter table public.deals drop constraint if exists deals_compensation_type_check;
alter table public.deals drop constraint if exists deals_performance_pct_check;
alter table public.deals drop column if exists compensation_type;
alter table public.deals drop column if exists performance_pct;

-- quem pode: o Adm (lê e ajusta os valores); o gestor só ao lançar o negócio da agência (ainda "só valor", sem pedido
-- da marca) — depois disso gestor e equipe veem a forma sem números e quem ajusta é o Adm
create or replace function public.deal_compensation_set(p_deal uuid, p_compensation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_before jsonb; v_after jsonb; v_request uuid;
begin
  select d.agency_id, d.compensation, d.request_id into v_agency, v_before, v_request from public.deals d where d.id = p_deal for update;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.agency_can(v_agency, 'admin')
          or (public.agency_can(v_agency, 'manager') and v_request is null
              and v_before = '{"money": true, "barter": null, "performance": null}'::jsonb)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_after := public.compensation_clean(p_compensation);
  if v_after is distinct from v_before then
    update public.deals set compensation = v_after, updated_at = now() where id = p_deal;
    perform public.audit_log('deal.compensation', 'deal', p_deal::text, jsonb_build_object('compensation', v_before),
      jsonb_build_object('compensation', v_after), null, 'agency'::public.actor_type);
  end if;
  return v_after;
end $$;
revoke execute on function public.deal_compensation_set(uuid, jsonb) from public, anon;
grant execute on function public.deal_compensation_set(uuid, jsonb) to authenticated, service_role;

-- 0128 (sem uso nas telas desde a 0139): mesma regra, agora pela forma nova (sem dinheiro = fora da soma)
create or replace function public.finance_projection(p_agency uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talents uuid[]; v_mine jsonb; v_segments jsonb; v_agency_total jsonb;
begin
  if not public.works_on_platform() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_agency is not null and not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(array_agg(t.id), '{}'::uuid[]) into v_talents from public.talent_profiles t
  left join public.creator_profiles c on c.id = t.creator_id where t.user_id = auth.uid() or c.user_id = auth.uid();

  with fees as (
    select f.fee_cents, f.talent_id, d.agency_id, d.owner_id, d.outcome, d.closed_at, t.segments
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id join public.talent_profiles t on t.id = f.talent_id
    where not d.is_demo and public.compensation_money(d.compensation)
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
    where not d.is_demo and public.compensation_money(d.compensation)
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
    where d.agency_id = p_agency and not d.is_demo and public.compensation_money(d.compensation);
  end if;

  return jsonb_build_object('mine', v_mine, 'segments', v_segments, 'agency', v_agency_total,
    'my_segments', (select coalesce(jsonb_agg(distinct s), '[]'::jsonb) from public.talent_profiles t, unnest(t.segments) s where t.id = any (v_talents)));
end $$;
revoke execute on function public.finance_projection(uuid) from public, anon;
grant execute on function public.finance_projection(uuid) to authenticated, service_role;
-- 3) leitura sem números (gestor, equipe, Hero): tipo e descrições, sem R$ nem % --------------------------------------
create or replace function public.compensation_public(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then p else jsonb_build_object(
    'money', p -> 'money',
    'barter', case when jsonb_typeof(p -> 'barter') = 'object' then (p -> 'barter') || '{"value_cents": null}'::jsonb end,
    'performance', case when jsonb_typeof(p -> 'performance') = 'object' then (p -> 'performance') || '{"rate": null, "estimate_cents": null}'::jsonb end) end
$$;
revoke execute on function public.compensation_public(jsonb) from public, anon;
grant execute on function public.compensation_public(jsonb) to authenticated, service_role;

-- 4) campanha da marca: forma de pagamento do valor oferecido; negociação (0106) aceita acordo sem dinheiro -----------
alter table public.campaign_request_budgets add column if not exists compensation jsonb not null default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.campaign_request_budgets drop constraint if exists campaign_request_budgets_compensation_check;
alter table public.campaign_request_budgets add constraint campaign_request_budgets_compensation_check check (
  public.compensation_valid(compensation)
  and (public.compensation_money(compensation) or (budget_min_cents is null and budget_max_cents is null and value_model = 'fixo' and max_heroes is null)));

CREATE OR REPLACE FUNCTION public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb; v_brief jsonb; v_locked boolean := false;
  v_call_agency uuid; v_model text; v_maxh int; v_has_budget boolean; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if p_id is not null then
    -- 0089: a campanha de um acordo de chamada é da agência vencedora (que pode não ser a agência ativa da marca)
    select r.agency_id into v_call_agency from public.campaign_requests r
    where r.id = p_id and r.brand_id = p_brand and r.brand_call_id is not null and public.campaign_request_brand_call_ok(r.id, r.agency_id);
    if v_call_agency is not null then v_agency := v_call_agency; end if;
  end if;
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  if p_id is not null then
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.brand_id = p_brand and r.origin = 'brand') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.status = 'draft') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if public.brand_member_of(p_brand) <> 'owner' and exists (select 1 from public.campaign_requests r where r.id = p_id and r.approval_status = 'pending') then
      raise exception 'awaiting_approval' using errcode = 'P0001';
    end if;
    v_locked := exists (select 1 from public.sponsorship_proposals q where q.request_id = p_id and q.status = 'agreed')
             or exists (select 1 from public.brand_call_proposals q where q.request_id = p_id and q.status = 'agreed');
  end if;
  begin
    if p_data ? 'talent_id' then v_talent := nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid; end if;
    v_period_start := nullif(btrim(coalesce(p_data ->> 'period_start', '')), '')::date;
    v_period_end := nullif(btrim(coalesce(p_data ->> 'period_end', '')), '')::date;
    v_desired := nullif(btrim(coalesce(p_data ->> 'desired_at', '')), '')::timestamptz;
    v_duration := nullif(btrim(coalesce(p_data ->> 'duration_minutes', '')), '')::int;
    v_min := nullif(btrim(coalesce(p_data ->> 'budget_min_cents', '')), '')::bigint;
    v_max := nullif(btrim(coalesce(p_data ->> 'budget_max_cents', '')), '')::bigint;
    v_maxh := nullif(btrim(coalesce(p_data ->> 'max_heroes', '')), '')::int;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_segments from jsonb_array_elements_text(coalesce(p_data -> 'segment_ids', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_ages from jsonb_array_elements_text(coalesce(p_data -> 'target_age_bands', '[]'::jsonb)) x;
    select coalesce(array_agg(upper(x)), '{}'::text[]) into v_states from jsonb_array_elements_text(coalesce(p_data -> 'target_states', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  -- 0096: modelo de valor (fixo | por_heroi). Sem a chave, vale o já gravado. Por Hero: valor > 0 e máximo de Heros (1 a 50).
  v_has_budget := p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note' or p_data ? 'value_model' or p_data ? 'max_heroes';
  v_model := coalesce(nullif(btrim(coalesce(p_data ->> 'value_model', '')), ''),
                      (select b.value_model from public.campaign_request_budgets b where b.request_id = p_id), 'fixo');
  if not (p_data ? 'max_heroes') then v_maxh := (select b.max_heroes from public.campaign_request_budgets b where b.request_id = p_id); end if;
  -- 0140: forma de pagamento (valor, permuta, performance). Sem dinheiro: sem valor, modelo fixo, sem máximo.
  v_has_budget := v_has_budget or p_data ? 'compensation';
  v_comp := case when p_data ? 'compensation' then public.compensation_clean(p_data -> 'compensation')
                 else coalesce((select b.compensation from public.campaign_request_budgets b where b.request_id = p_id), '{"money": true, "barter": null, "performance": null}'::jsonb) end;
  if not public.compensation_money(v_comp) then v_min := null; v_max := null; v_model := 'fixo'; v_maxh := null; end if;
  if v_has_budget and not v_locked then
    if v_model = 'por_heroi' then
      v_min := null;
    else
      v_maxh := null;
    end if;
    perform public.value_terms_check(v_model, v_max, v_maxh);
  end if;
  v_deliverables := coalesce(p_data -> 'deliverables', '[]'::jsonb);
  v_brief := coalesce(p_data -> 'brief', '{}'::jsonb);
  if not public.campaign_brief_valid(v_brief) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_talent is not null and not public.talent_brand_card_ok(v_talent, v_agency)
     and not (p_id is not null and exists (select 1 from public.campaign_requests r join public.sponsorship_opportunities o on o.id = r.sponsorship_id
                                           where r.id = p_id and o.talent_id = v_talent and o.agency_id = v_agency))
     and not (p_id is not null and exists (select 1 from public.brand_call_proposals q join public.brand_call_proposal_talents t on t.proposal_id = q.id
                                           where q.request_id = p_id and q.agency_id = v_agency and t.talent_id = v_talent)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if cardinality(v_segments) > 0 and exists (select 1 from unnest(v_segments) s where not exists (select 1 from public.talent_segments g where g.id = s and g.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if p_id is null then
      insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, product, target_audience, target_age_bands,
                                            target_states, region_note, period_start, period_end, desired_at, duration_minutes, format, location, networks,
                                            deliverables, segment_ids, notes, brief)
      values (v_agency, p_brand, 'brand', auth.uid(), v_talent, btrim(coalesce(p_data ->> 'title', '')), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'product', '')), btrim(coalesce(p_data ->> 'target_audience', '')), v_ages, v_states,
              btrim(coalesce(p_data ->> 'region_note', '')), v_period_start, v_period_end, v_desired, v_duration, nullif(p_data ->> 'format', ''),
              btrim(coalesce(p_data ->> 'location', '')), v_networks, v_deliverables, v_segments, btrim(coalesce(p_data ->> 'notes', '')), v_brief)
      returning id into v_id;
    else
      update public.campaign_requests set
        talent_id = case when p_data ? 'talent_id' then v_talent else talent_id end,
        title = case when p_data ? 'title' then btrim(coalesce(p_data ->> 'title', '')) else title end,
        objective = case when p_data ? 'objective' then nullif(p_data ->> 'objective', '') else objective end,
        product = case when p_data ? 'product' then btrim(coalesce(p_data ->> 'product', '')) else product end,
        target_audience = case when p_data ? 'target_audience' then btrim(coalesce(p_data ->> 'target_audience', '')) else target_audience end,
        target_age_bands = case when p_data ? 'target_age_bands' then v_ages else target_age_bands end,
        target_states = case when p_data ? 'target_states' then v_states else target_states end,
        region_note = case when p_data ? 'region_note' then btrim(coalesce(p_data ->> 'region_note', '')) else region_note end,
        period_start = case when p_data ? 'period_start' then v_period_start else period_start end,
        period_end = case when p_data ? 'period_end' then v_period_end else period_end end,
        desired_at = case when p_data ? 'desired_at' then v_desired else desired_at end,
        duration_minutes = case when p_data ? 'duration_minutes' then v_duration else duration_minutes end,
        format = case when p_data ? 'format' then nullif(p_data ->> 'format', '') else format end,
        location = case when p_data ? 'location' then btrim(coalesce(p_data ->> 'location', '')) else location end,
        networks = case when p_data ? 'networks' then v_networks else networks end,
        deliverables = case when p_data ? 'deliverables' then v_deliverables else deliverables end,
        segment_ids = case when p_data ? 'segment_ids' then v_segments else segment_ids end,
        notes = case when p_data ? 'notes' then btrim(coalesce(p_data ->> 'notes', '')) else notes end,
        brief = case when p_data ? 'brief' then v_brief else brief end
      where id = p_id returning id into v_id;
    end if;
    -- valor oferecido pela marca; na campanha de um patrocínio (0088) ou chamada (0089) acordados, fica o valor do acordo
    if not v_locked and v_has_budget then
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, value_model, max_heroes, updated_by, compensation)
      values (v_agency, p_brand, v_id, v_min, v_max, btrim(coalesce(p_data ->> 'budget_note', '')), v_model, v_maxh, auth.uid(), v_comp)
      on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
        note = excluded.note, value_model = excluded.value_model, max_heroes = excluded.max_heroes, updated_by = excluded.updated_by,
        compensation = excluded.compensation;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end $function$;
revoke execute on function public.brand_request_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.brand_request_save(uuid, uuid, jsonb) to authenticated, service_role;

-- negócio nasce com a forma de pagamento da campanha (pedido da marca, chamada, patrocínio, Onda)
create or replace function public.deals_compensation_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if new.request_id is not null and new.compensation = '{"money": true, "barter": null, "performance": null}'::jsonb then
    select b.compensation into v from public.campaign_request_budgets b where b.request_id = new.request_id;
    if v is not null then new.compensation := v; end if;
  end if;
  return new;
end $$;
revoke execute on function public.deals_compensation_trg() from public, anon, authenticated;
drop trigger if exists trg_deals_compensation on public.deals;
create trigger trg_deals_compensation before insert on public.deals for each row execute function public.deals_compensation_trg();

alter table public.deal_offer_rounds add column if not exists compensation jsonb;
update public.deal_offer_rounds set compensation = '{"money": true, "barter": null, "performance": null}'::jsonb where compensation is null;
alter table public.deal_offer_rounds alter column compensation set default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.deal_offer_rounds alter column compensation set not null;
alter table public.deal_offer_rounds drop constraint if exists deal_offer_rounds_compensation_check;
alter table public.deal_offer_rounds drop constraint if exists deal_offer_rounds_amount_check;
alter table public.deal_offer_rounds drop constraint if exists deal_offer_rounds_value_check;
alter table public.deal_offer_rounds add constraint deal_offer_rounds_compensation_check check (public.compensation_valid(compensation));
alter table public.deal_offer_rounds add constraint deal_offer_rounds_amount_check check (
  (action = 'decline' and amount_cents is null)
  or (action <> 'decline' and case when public.compensation_money(compensation) then amount_cents between 1 and 10000000000 else amount_cents is null end));
alter table public.deal_offer_rounds add constraint deal_offer_rounds_value_check check (
  (action = 'decline' and value_model is null and max_heroes is null)
  or (action <> 'decline' and ((value_model = 'fixo' and max_heroes is null)
       or (value_model = 'por_heroi' and max_heroes between 1 and 50 and public.compensation_money(compensation)))));

CREATE OR REPLACE FUNCTION public.deal_offer_brand_terms(p_deal uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select jsonb_build_object('source', 'counter', 'amount_cents', r.amount_cents, 'value_model', r.value_model, 'max_heroes', r.max_heroes,
                               'period_start', r.period_start, 'period_end', r.period_end, 'compensation', r.compensation)
     from public.deal_offer_rounds r where r.deal_id = p_deal and r.side = 'brand' and r.action = 'counter' order by r.seq desc limit 1),
    (select jsonb_build_object('source', 'request', 'amount_cents', nullif(b.budget_max_cents, 0), 'value_model', coalesce(b.value_model, 'fixo'),
                               'max_heroes', case when b.value_model = 'por_heroi' then b.max_heroes end,
                               'period_start', q.period_start, 'period_end', case when q.period_start is not null then q.period_end end,
                               'compensation', coalesce(b.compensation, '{"money": true, "barter": null, "performance": null}'::jsonb))
     from public.deals d join public.campaign_requests q on q.id = d.request_id
     left join public.campaign_request_budgets b on b.request_id = q.id where d.id = p_deal))
$function$;
revoke execute on function public.deal_offer_brand_terms(uuid) from public, anon, authenticated;
grant execute on function public.deal_offer_brand_terms(uuid) to service_role;

drop function if exists public.deal_offer_terms_check(bigint, text, int, date, date);
create or replace function public.deal_offer_terms_check(p_amount bigint, p_model text, p_max int, p_start date, p_end date, p_comp jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_end is not null and (p_start is null or p_end < p_start) then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- 0140: sem dinheiro (só permuta/performance) a rodada não leva valor e o modelo é fixo
  if not public.compensation_money(p_comp) then
    if p_amount is not null or p_model is distinct from 'fixo' or p_max is not null then raise exception 'invalid_input' using errcode = '22023'; end if;
    return;
  end if;
  perform public.value_terms_check(p_model, p_amount, p_max);
  if p_amount is null or p_amount < 1 or (p_model = 'fixo' and p_max is not null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.deal_offer_terms_check(bigint, text, int, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.deal_offer_terms_check(bigint, text, int, date, date, jsonb) to service_role;

drop function if exists public.deal_offer_record(uuid, text, text, bigint, text, int, date, date, text);
CREATE OR REPLACE FUNCTION public.deal_offer_record(p_deal uuid, p_side text, p_action text, p_amount bigint, p_model text, p_max integer, p_start date, p_end date, p_note text, p_comp jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deals%rowtype; v_seq int; v_label text; v_stage text; v_brand text; v_params jsonb; v_status text; v_round uuid;
begin
  select * into d from public.deals where id = p_deal for update;
  v_label := case when p_side = 'agency' then public.actor_label(d.agency_id, null) else public.actor_label(null, d.brand_id) end;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.deal_offer_rounds r where r.deal_id = d.id;
  insert into public.deal_offer_rounds (deal_id, request_id, agency_id, brand_id, seq, side, action, amount_cents, value_model, max_heroes,
                                        period_start, period_end, note, actor_id, actor_label, compensation)
  values (d.id, d.request_id, d.agency_id, d.brand_id, v_seq, p_side, p_action, p_amount, p_model, p_max,
          case when p_action <> 'decline' then p_start end, case when p_action <> 'decline' then p_end end, p_note, auth.uid(), v_label,
          coalesce(case when p_action <> 'decline' then p_comp end, '{"money": true, "barter": null, "performance": null}'::jsonb))
  returning id into v_round;

  if p_action = 'accept' then
    -- valor oferecido = acordado; em dois passos para o gatilho da 0096 não dividir o valor por Hero
    if exists (select 1 from public.campaign_request_budgets b where b.request_id = d.request_id) then
      update public.campaign_request_budgets set value_model = 'fixo', max_heroes = null, budget_min_cents = null, budget_max_cents = p_amount, compensation = p_comp, updated_by = auth.uid()
      where request_id = d.request_id;
    else
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, value_model, max_heroes, updated_by, compensation)
      values (d.agency_id, d.brand_id, d.request_id, null, p_amount, 'fixo', null, auth.uid(), p_comp);
    end if;
    if p_model = 'por_heroi' then
      update public.campaign_request_budgets set value_model = 'por_heroi', max_heroes = p_max where request_id = d.request_id;
    else
      update public.campaign_request_budgets set budget_min_cents = p_amount where request_id = d.request_id;
    end if;
    if p_start is not null then
      update public.campaign_requests set period_start = p_start, period_end = coalesce(p_end, p_start) where id = d.request_id;
      update public.deals set expected_start = p_start, expected_end = coalesce(p_end, p_start) where id = d.id;
    end if;
    -- 0140: o negócio passa a ter a forma de pagamento acordada
    update public.deals set compensation = p_comp where id = d.id;
    perform public.deal_max_heroes_check(d.id);
    v_stage := 'negotiation';
  elsif p_action = 'counter' then
    v_stage := case when p_side = 'agency' then 'proposal_sent' else 'negotiation' end;
  end if;
  if v_stage is not null and public.deal_stage_index(d.stage) < public.deal_stage_index(v_stage) then
    update public.deals set stage = v_stage, stage_changed_at = now() where id = d.id;
  end if;

  v_status := case p_action when 'accept' then 'accepted' when 'counter' then 'countered' else 'declined' end;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (d.agency_id, 'deal', d.id, 'system', 'offer_' || v_status || '|' || p_side, auth.uid(), v_label);
  perform public.audit_log('deal.offer_' || p_action, 'deal', d.id::text, jsonb_build_object('agency_id', d.agency_id, 'stage', d.stage),
    jsonb_build_object('agency_id', d.agency_id, 'brand_id', d.brand_id, 'side', p_side, 'action', p_action, 'round_id', v_round, 'seq', v_seq),
    nullif(p_note, ''), case when p_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', d.agency_id) end);

  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  v_params := jsonb_build_object('deal', left(d.title, 120), 'brand', left(coalesce(v_brand, ''), 120), 'status', v_status);
  if p_side = 'agency' then
    perform public.inbox_notify_brand(d.brand_id, false, 'proposal_received', '/marca/campanhas/' || d.request_id::text || '#deal-offer',
      v_params, d.agency_id, 'deal', d.id, 'offer:' || v_round::text);
  else
    perform public.inbox_notify_agency(d.agency_id, 'admin', 'proposal_decided', '/agencia/negocios/' || d.id::text || '#deal-offer',
      v_params, 'deal', d.id, 'offer:' || v_round::text);
  end if;
  return case when p_action = 'accept' then 'agreed' else v_status end;
end $function$;
revoke execute on function public.deal_offer_record(uuid, text, text, bigint, text, int, date, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.deal_offer_record(uuid, text, text, bigint, text, int, date, date, text, jsonb) to service_role;

drop function if exists public.agency_deal_offer_reply(uuid, text, bigint, text, int, date, date, text);
CREATE OR REPLACE FUNCTION public.agency_deal_offer_reply(p_deal uuid, p_action text, p_amount_cents bigint DEFAULT NULL::bigint, p_value_model text DEFAULT NULL::text, p_max_heroes integer DEFAULT NULL::integer, p_period_start date DEFAULT NULL::date, p_period_end date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_agency uuid; v_note text := btrim(coalesce(p_note, '')); v_state jsonb; v_terms jsonb; v_amount bigint; v_model text; v_max int;
        v_start date; v_end date; v_comp jsonb;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform public.deal_offer_open_check(p_deal);
  v_state := public.deal_offer_state(p_deal);
  if (v_state ->> 'turn') is distinct from 'agency' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_action = 'accept' then
    v_terms := public.deal_offer_brand_terms(p_deal);
    v_amount := (v_terms ->> 'amount_cents')::bigint; v_model := coalesce(v_terms ->> 'value_model', 'fixo'); v_max := (v_terms ->> 'max_heroes')::int;
    v_start := (v_terms ->> 'period_start')::date; v_end := (v_terms ->> 'period_end')::date;
    v_comp := case when jsonb_typeof(v_terms -> 'compensation') = 'object' then v_terms -> 'compensation' else '{"money": true, "barter": null, "performance": null}'::jsonb end;
    -- sem valor da marca não há o que aceitar: contraproposta (0140: a não ser que a proposta seja só permuta/performance)
    if public.compensation_money(v_comp) and (v_amount is null or v_amount < 1) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  else
    -- 0140: a contraproposta traz a forma de pagamento (sem informar: só valor, como antes)
    v_comp := public.compensation_clean(p_compensation);
    if public.compensation_money(v_comp) then
      v_amount := p_amount_cents; v_model := coalesce(p_value_model, 'fixo'); v_max := case when v_model = 'por_heroi' then p_max_heroes end;
    else
      v_amount := null; v_model := 'fixo'; v_max := null;
    end if;
    v_start := p_period_start; v_end := case when p_period_start is not null then coalesce(p_period_end, p_period_start) end;
    perform public.deal_offer_terms_check(v_amount, v_model, v_max, v_start, v_end, v_comp);
  end if;
  return public.deal_offer_record(p_deal, 'agency', p_action, v_amount, v_model, v_max, v_start, v_end, v_note, v_comp);
end $function$;
revoke execute on function public.agency_deal_offer_reply(uuid, text, bigint, text, int, date, date, text, jsonb) from public, anon;
grant execute on function public.agency_deal_offer_reply(uuid, text, bigint, text, int, date, date, text, jsonb) to authenticated, service_role;

drop function if exists public.brand_deal_offer_reply(uuid, text, bigint, text, int, date, date, text);
CREATE OR REPLACE FUNCTION public.brand_deal_offer_reply(p_deal uuid, p_action text, p_amount_cents bigint DEFAULT NULL::bigint, p_value_model text DEFAULT NULL::text, p_max_heroes integer DEFAULT NULL::integer, p_period_start date DEFAULT NULL::date, p_period_end date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deals%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_state jsonb; r public.deal_offer_rounds%rowtype;
        v_amount bigint; v_model text; v_max int; v_start date; v_end date; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  v_role := case when d.id is null or not d.brand_visible then null else public.brand_member_of(d.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'counter', 'decline') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform public.deal_offer_open_check(p_deal);
  v_state := public.deal_offer_state(p_deal);
  if (v_state ->> 'turn') is distinct from 'brand' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select * into r from public.deal_offer_rounds x where x.deal_id = p_deal order by x.seq desc limit 1;
  if p_action = 'accept' then
    v_amount := r.amount_cents; v_model := r.value_model; v_max := r.max_heroes; v_start := r.period_start; v_end := r.period_end;
    v_comp := coalesce(r.compensation, '{"money": true, "barter": null, "performance": null}'::jsonb);
  elsif p_action = 'counter' then
    v_comp := public.compensation_clean(p_compensation);
    if public.compensation_money(v_comp) then
      v_amount := p_amount_cents; v_model := coalesce(p_value_model, 'fixo'); v_max := case when v_model = 'por_heroi' then p_max_heroes end;
    else
      v_amount := null; v_model := 'fixo'; v_max := null;
    end if;
    v_start := p_period_start; v_end := case when p_period_start is not null then coalesce(p_period_end, p_period_start) end;
    perform public.deal_offer_terms_check(v_amount, v_model, v_max, v_start, v_end, v_comp);
  end if;
  return public.deal_offer_record(p_deal, 'brand', p_action, v_amount, v_model, v_max, v_start, v_end, v_note, v_comp);
end $function$;
revoke execute on function public.brand_deal_offer_reply(uuid, text, bigint, text, int, date, date, text, jsonb) from public, anon;
grant execute on function public.brand_deal_offer_reply(uuid, text, bigint, text, int, date, date, text, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.deal_offer_rounds_json(p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deals%rowtype; v_viewer text; v_values boolean := false; v_can boolean := false; v_role text; v_state jsonb; v_open boolean;
        v_origin text; v_terms jsonb; v_agreed jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_can(d.agency_id, 'staff') and (public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids())) then
    v_viewer := 'agency'; v_values := public.agency_can(d.agency_id, 'admin');
  elsif d.brand_visible then
    v_role := public.brand_member_of(d.brand_id);
    if v_role is not null then v_viewer := 'brand'; v_values := true; end if;
  end if;
  if v_viewer is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select q.origin into v_origin from public.campaign_requests q where q.id = d.request_id;
  v_state := public.deal_offer_state(d.id);
  v_open := d.stage <> 'closed' and d.outcome is null and public.deal_stage_index(d.stage) < 8 and coalesce(v_origin = 'brand', false) and d.brand_visible;
  v_can := coalesce(v_open and v_values and (v_state ->> 'turn') = v_viewer and (v_viewer = 'agency' or v_role = 'owner'), false);
  v_terms := public.deal_offer_brand_terms(d.id);
  select jsonb_build_object('amount_cents', r.amount_cents, 'value_model', r.value_model, 'max_heroes', r.max_heroes, 'period_start', r.period_start,
                            'period_end', r.period_end, 'side', r.side, 'created_at', r.created_at, 'compensation', r.compensation)
    into v_agreed from public.deal_offer_rounds r where r.deal_id = d.id and r.action = 'accept' order by r.seq desc limit 1;
  if not v_values then
    v_terms := v_terms - 'amount_cents';
    v_agreed := v_agreed - 'amount_cents';
    -- 0140: sem permissão para valores, a forma de pagamento vai sem números
    if v_terms ? 'compensation' then v_terms := jsonb_set(v_terms, '{compensation}', coalesce(public.compensation_public(v_terms -> 'compensation'), 'null'::jsonb)); end if;
    if v_agreed ? 'compensation' then v_agreed := jsonb_set(v_agreed, '{compensation}', coalesce(public.compensation_public(v_agreed -> 'compensation'), 'null'::jsonb)); end if;
  end if;
  return jsonb_build_object('enabled', coalesce(v_origin = 'brand', false), 'viewer', v_viewer, 'values', v_values, 'open', v_open, 'can_reply', v_can,
    'role', v_role, 'turn', case when v_open then v_state -> 'turn' else 'null'::jsonb end, 'agreed', (v_state ->> 'agreed')::boolean,
    'last_action', v_state -> 'last_action', 'last_side', v_state -> 'last_side', 'brand_terms', v_terms, 'agreed_terms', v_agreed,
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
                 'amount_cents', case when v_values then r.amount_cents end, 'value_model', r.value_model, 'max_heroes', r.max_heroes,
                 'period_start', r.period_start, 'period_end', r.period_end, 'note', case when v_values then r.note else '' end,
                 'actor_label', r.actor_label, 'created_at', r.created_at,
                 'compensation', case when v_values then r.compensation else public.compensation_public(r.compensation) end) order by r.seq), '[]'::jsonb)
               from public.deal_offer_rounds r where r.deal_id = d.id));
end $function$;
revoke execute on function public.deal_offer_rounds_json(uuid) from public, anon;
grant execute on function public.deal_offer_rounds_json(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.deal_value_terms(p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deals%rowtype; b public.campaign_request_budgets%rowtype; v_admin boolean; v_model text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null or not public.agency_can(d.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(d.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(d.agency_id, 'admin');
  if d.request_id is not null then select * into b from public.campaign_request_budgets where request_id = d.request_id; end if;
  v_model := coalesce(b.value_model, 'fixo');
  return jsonb_build_object('value_model', v_model, 'max_heroes', b.max_heroes,
    'active_heroes', (select count(*) from public.deal_talents t where t.deal_id = p_deal and t.status not in ('removed', 'declined')),
    'has_value', b.budget_max_cents is not null,
    'value_cents', case when v_admin then b.budget_max_cents end,
    'ceiling_cents', case when v_admin then public.value_ceiling_cents(v_model, b.budget_max_cents, b.max_heroes) end,
    'compensation', case when v_admin then d.compensation else public.compensation_public(d.compensation) end);
end $function$;
revoke execute on function public.deal_value_terms(uuid) from public, anon;
grant execute on function public.deal_value_terms(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_budget_change_answer(p_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.budget_change_requests%rowtype; r public.campaign_requests%rowtype; d public.deals%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_label text; v_final bigint; e jsonb; v_ps date; v_pe date; v_new_ps date; v_new_pe date; v_dates_applied boolean := false; v_lines text;
        v_plan jsonb; v_applied jsonb := '[]'::jsonb; v_kind_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('confirm', 'decline') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.budget_change_requests where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(c.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'proposed' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_label := public.actor_label(c.agency_id, c.brand_id);
  if p_decision = 'decline' then
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.budget_change_requests set status = 'brand_declined', brand_note = v_note, brand_by = auth.uid(), brand_label = v_label, brand_at = now() where id = c.id;
    perform public.budget_change_log(c.id, 'brand', 'rejected', false, v_label, null, null, v_note);
    perform public.budget_change_notify(c.id, 'rejected', 'agency_admin');
    return 'brand_declined';
  end if;

  select * into r from public.campaign_requests where id = c.request_id for update;
  select * into d from public.deals where id = c.deal_id for update;
  if d.id is null or d.stage = 'closed' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  v_final := coalesce(c.counter_cents, c.requested_cents);
  v_plan := coalesce(c.plan, '{}'::jsonb);

  -- a) verba da campanha e por creator (o pedido é o caminho que passa pela trava)
  insert into public.brand_budgets (brand_id, request_id, deal_talent_id, total_cents, updated_by)
  values (c.brand_id, c.request_id, null, v_final, auth.uid())
  on conflict (request_id, deal_talent_id) do update set total_cents = excluded.total_cents, updated_by = excluded.updated_by;
  for e in select value from jsonb_array_elements(c.talent_cents) loop
    if exists (select 1 from public.deal_talents dt where dt.id = (e ->> 'deal_talent_id')::uuid and dt.deal_id = d.id) then
      insert into public.brand_budgets (brand_id, request_id, deal_talent_id, total_cents, updated_by)
      values (c.brand_id, c.request_id, (e ->> 'deal_talent_id')::uuid, (e ->> 'cents')::bigint, auth.uid())
      on conflict (request_id, deal_talent_id) do update set total_cents = excluded.total_cents, updated_by = excluded.updated_by;
    end if;
  end loop;
  v_applied := v_applied || '["budget"]'::jsonb;
  -- b) valor oferecido à agência
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, updated_by)
  values (r.agency_id, r.brand_id, r.id, null, v_final, auth.uid())
  on conflict (request_id) do update set budget_max_cents = excluded.budget_max_cents,
    budget_min_cents = case when public.campaign_request_budgets.budget_min_cents is null then null else least(public.campaign_request_budgets.budget_min_cents, excluded.budget_max_cents) end,
    updated_by = excluded.updated_by, updated_at = now(),
    compensation = jsonb_set(public.campaign_request_budgets.compensation, '{money}', 'true'::jsonb);
  -- 0140: verba em dinheiro acordada → a forma de pagamento passa a ter dinheiro (permuta/performance continuam)
  update public.deals set compensation = jsonb_set(compensation, '{money}', 'true'::jsonb) where id = d.id and not public.compensation_money(compensation);
  v_applied := v_applied || '["offered"]'::jsonb;
  -- c) período previsto (campanha e negócio), se o plano trouxe e as datas fecham
  if jsonb_typeof(v_plan -> 'period_start') = 'string' or jsonb_typeof(v_plan -> 'period_end') = 'string' then
    v_ps := (v_plan ->> 'period_start')::date; v_pe := (v_plan ->> 'period_end')::date;
    v_new_ps := coalesce(v_ps, r.period_start); v_new_pe := coalesce(v_pe, r.period_end);
    if v_new_ps is null or v_new_pe is null or v_new_pe >= v_new_ps then
      update public.campaign_requests set period_start = v_new_ps, period_end = v_new_pe where id = r.id;
      if (coalesce(v_ps, d.expected_start) is null or coalesce(v_pe, d.expected_end) is null or coalesce(v_pe, d.expected_end) >= coalesce(v_ps, d.expected_start)) then
        update public.deals set expected_start = coalesce(v_ps, expected_start), expected_end = coalesce(v_pe, expected_end) where id = d.id;
      end if;
      v_dates_applied := true;
      v_applied := v_applied || '["dates"]'::jsonb;
    end if;
  end if;
  -- d) entregas pedidas (o pedido; os entregáveis contratados não mudam sozinhos)
  if jsonb_typeof(v_plan -> 'deliverables') = 'array' then
    update public.campaign_requests set deliverables = v_plan -> 'deliverables' where id = r.id;
    v_applied := v_applied || '["deliverables"]'::jsonb;
  end if;

  -- e) o que não é automático vira tarefa da agência (nada contratado é apagado)
  select string_agg(case x ->> 'action' when 'remove' then 'Remover: ' when 'add' then 'Adicionar: ' end || btrim(x ->> 'name')
                    || case when coalesce(btrim(x ->> 'note'), '') <> '' then ' — ' || btrim(x ->> 'note') else '' end, E'\n')
    into v_lines from jsonb_array_elements(coalesce(v_plan -> 'creators', '[]'::jsonb)) x where x ->> 'action' in ('remove', 'add');
  if v_lines is not null then
    perform public.budget_change_task(d.id, 'Realinhamento da verba: creators', 'Mudanças combinadas com a marca (nada foi removido automaticamente):' || E'\n' || v_lines);
  end if;
  if jsonb_typeof(v_plan -> 'deliverables') = 'array' then
    select string_agg((x ->> 'quantity') || '× ' || (x ->> 'kind') || coalesce(' (' || (x ->> 'network') || ')', ''), E'\n') into v_lines
    from jsonb_array_elements(v_plan -> 'deliverables') x;
    perform public.budget_change_task(d.id, 'Realinhamento da verba: entregas',
      'Entregas combinadas (o pedido da campanha já foi atualizado; ajuste os entregáveis dos creators):' || E'\n' || coalesce(v_lines, '—'));
  end if;
  if jsonb_typeof(v_plan -> 'perks') = 'array' and jsonb_array_length(v_plan -> 'perks') > 0 then
    select string_agg('• ' || btrim(x #>> '{}'), E'\n') into v_lines from jsonb_array_elements(v_plan -> 'perks') x;
    perform public.budget_change_task(d.id, 'Realinhamento da verba: contrapartidas', 'Contrapartidas combinadas:' || E'\n' || v_lines);
  end if;
  if coalesce(btrim(v_plan ->> 'schedule_note'), '') <> '' or ((v_plan ? 'period_start' or v_plan ? 'period_end') and not v_dates_applied
       and (jsonb_typeof(v_plan -> 'period_start') = 'string' or jsonb_typeof(v_plan -> 'period_end') = 'string')) then
    perform public.budget_change_task(d.id, 'Realinhamento da verba: datas e etapas',
      coalesce(nullif(btrim(v_plan ->> 'schedule_note'), ''), 'Revise as datas: o período combinado não coube no previsto.')
      || case when v_dates_applied then E'\n' || 'O período previsto da campanha já foi atualizado.' else '' end);
  end if;
  perform public.budget_change_task(d.id, 'Realinhamento da verba: termos e financeiro',
    'A marca confirmou a nova verba e o realinhamento. Atualize termos, cachês e lançamentos conforme o pedido (o valor fica no pedido, visível só para o Adm).'
    || case when coalesce(btrim(v_plan ->> 'note'), '') <> '' then E'\n' || 'Nota: ' || btrim(v_plan ->> 'note') else '' end);

  update public.budget_change_requests set status = 'confirmed', final_cents = v_final, brand_note = v_note, brand_by = auth.uid(), brand_label = v_label, brand_at = now() where id = c.id;
  perform public.budget_change_log(c.id, 'brand', 'confirmed', false, v_label,
    jsonb_build_object('reserved_cents', c.before_reserved_cents, 'offered_cents', c.before_offered_cents, 'period_start', r.period_start, 'period_end', r.period_end),
    jsonb_build_object('final_cents', v_final, 'applied', v_applied, 'plan', v_plan), v_note);
  perform public.budget_change_notify(c.id, 'confirmed', 'agency_manager');
  perform public.budget_change_notify(c.id, 'confirmed', 'brand_all');
  return 'confirmed';
end $function$;
revoke execute on function public.brand_budget_change_answer(uuid, text, text) from public, anon;
grant execute on function public.brand_budget_change_answer(uuid, text, text) to authenticated, service_role;

-- 5) chamada da marca: forma de pagamento da chamada e das propostas; acordo sem dinheiro -----------------------------
alter table public.brand_calls add column if not exists compensation jsonb not null default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.brand_calls drop constraint if exists brand_calls_compensation_check;
alter table public.brand_calls add constraint brand_calls_compensation_check check (
  public.compensation_valid(compensation)
  and (public.compensation_money(compensation) or (budget_cents is null and budget_display = 'open' and value_model = 'fixo' and max_heroes is null)));

alter table public.brand_call_proposals add column if not exists compensation jsonb not null default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.brand_call_proposals add column if not exists agreed_compensation jsonb;
update public.brand_call_proposals set agreed_compensation = compensation where status = 'agreed' and agreed_compensation is null;
alter table public.brand_call_proposals drop constraint if exists brand_call_proposals_compensation_check;
alter table public.brand_call_proposals add constraint brand_call_proposals_compensation_check check (
  public.compensation_valid(compensation) and (agreed_compensation is null or public.compensation_valid(agreed_compensation))
  and (public.compensation_money(compensation) or (amount_cents is null and value_model = 'fixo' and max_heroes is null)));
alter table public.brand_call_proposals drop constraint if exists brand_call_proposals_sent_check;
alter table public.brand_call_proposals add constraint brand_call_proposals_sent_check check (
  (status in ('draft', 'closed') or sent_at is not null) and (sent_at is null or amount_cents is not null or not public.compensation_money(compensation)));
alter table public.brand_call_proposals drop constraint if exists brand_call_proposals_agreed_check;
alter table public.brand_call_proposals add constraint brand_call_proposals_agreed_check check (
  (status = 'agreed') = (agreed_at is not null)
  and (status <> 'agreed' or ((agreed_cents is not null or not public.compensation_money(coalesce(agreed_compensation, compensation)))
                              and agreed_deliverables is not null and agreed_side in ('agency', 'brand'))));

alter table public.brand_call_rounds add column if not exists compensation jsonb;
update public.brand_call_rounds set compensation = '{"money": true, "barter": null, "performance": null}'::jsonb where compensation is null;
alter table public.brand_call_rounds alter column compensation set default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.brand_call_rounds alter column compensation set not null;
alter table public.brand_call_rounds drop constraint if exists brand_call_rounds_compensation_check;
alter table public.brand_call_rounds drop constraint if exists brand_call_rounds_amount_check;
alter table public.brand_call_rounds drop constraint if exists brand_call_rounds_value_check;
alter table public.brand_call_rounds add constraint brand_call_rounds_compensation_check check (public.compensation_valid(compensation));
alter table public.brand_call_rounds add constraint brand_call_rounds_amount_check check (
  (action = 'decline' and amount_cents is null)
  or (action <> 'decline' and case when public.compensation_money(compensation) then amount_cents between 1 and 10000000000 else amount_cents is null end));
alter table public.brand_call_rounds add constraint brand_call_rounds_value_check check (
  (action = 'decline' and value_model is null and max_heroes is null)
  or (action <> 'decline' and ((value_model = 'fixo' and max_heroes is null)
       or (value_model = 'por_heroi' and max_heroes between 1 and 50 and public.compensation_money(compensation)))));

CREATE OR REPLACE FUNCTION public.brand_call_save(p_brand uuid, p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; c public.brand_calls%rowtype; v_id uuid := p_id; v_start date; v_end date; v_respond timestamptz; v_budget bigint; v_creators int;
        v_networks text[]; v_niches text[]; v_agencies uuid[]; v_public jsonb; v_deliv jsonb; v_audience text; v_display text; v_model text; v_maxh int;
        v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_id is not null then
    select * into c from public.brand_calls where id = v_id and brand_id = p_brand for update;
    if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if c.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if v_role <> 'owner' and c.approval_status = 'pending' then raise exception 'awaiting_approval' using errcode = 'P0001'; end if;
  end if;
  begin
    v_start := nullif(btrim(coalesce(p_data ->> 'starts_on', '')), '')::date;
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_on', '')), '')::date, v_start);
    v_respond := nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz;
    v_budget := nullif(btrim(coalesce(p_data ->> 'budget_cents', '')), '')::bigint;
    v_creators := coalesce(nullif(btrim(coalesce(p_data ->> 'creators_wanted', '')), '')::int, 1);
    v_maxh := nullif(btrim(coalesce(p_data ->> 'max_heroes', '')), '')::int;
    select coalesce(array_agg(distinct lower(btrim(x))), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
    select coalesce(array_agg(n order by o), '{}'::text[]) into v_niches from (
      select distinct on (lower(regexp_replace(btrim(x), '\s+', ' ', 'g'))) regexp_replace(btrim(x), '\s+', ' ', 'g') as n, o
      from jsonb_array_elements_text(coalesce(p_data -> 'niches', '[]'::jsonb)) with ordinality e(x, o) where btrim(x) <> ''
      order by lower(regexp_replace(btrim(x), '\s+', ' ', 'g')), o) s;
    select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_agencies from jsonb_array_elements_text(coalesce(p_data -> 'agency_ids', '[]'::jsonb)) x where btrim(x) <> '';
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_public := public.sponsorship_audience_clean(jsonb_strip_nulls(jsonb_build_object('target_audience', p_data -> 'target_audience',
    'target_age_bands', p_data -> 'target_age_bands', 'target_states', p_data -> 'target_states', 'region_note', p_data -> 'region_note')));
  v_deliv := coalesce(p_data -> 'deliverables', '[]'::jsonb);
  v_audience := coalesce(nullif(p_data ->> 'audience', ''), 'my_agencies');
  v_display := coalesce(nullif(p_data ->> 'budget_display', ''), case when v_budget is null then 'open' else 'exact' end);
  -- 0096: modelo de valor. Por Hero: o valor é por Hero (nunca 'aberto') e o máximo é obrigatório.
  v_model := coalesce(nullif(btrim(coalesce(p_data ->> 'value_model', '')), ''), 'fixo');
  -- 0140: forma de pagamento. Sem dinheiro (só permuta/performance): sem verba, modelo fixo, sem máximo.
  v_comp := case when p_data ? 'compensation' then public.compensation_clean(p_data -> 'compensation')
                 when v_id is not null then c.compensation else '{"money": true, "barter": null, "performance": null}'::jsonb end;
  if not public.compensation_money(v_comp) then v_budget := null; v_display := 'open'; v_model := 'fixo'; v_maxh := null; end if;
  if v_model = 'por_heroi' then
    perform public.value_terms_check(v_model, v_budget, v_maxh);
    if v_display = 'open' then v_display := 'exact'; end if;
  elsif v_model = 'fixo' then
    v_maxh := null;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_start is null or v_audience not in ('my_agencies', 'selected', 'all') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_audience = 'selected' and exists (select 1 from unnest(v_agencies) g where not exists (select 1 from public.agencies a where a.id = g and a.status = 'active')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if v_id is null then
      insert into public.brand_calls (brand_id, title, objective, description, starts_on, ends_on, location, target_audience, target_age_bands, target_states,
                                      region_note, deliverables, creators_wanted, niches, networks, budget_cents, budget_display, respond_by, audience, value_model, max_heroes, created_by, compensation)
      values (p_brand, regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g'), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'description', '')), v_start, v_end, btrim(coalesce(p_data ->> 'location', '')),
              coalesce(v_public ->> 'target_audience', ''),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
              coalesce(v_public ->> 'region_note', ''), v_deliv, v_creators, v_niches, v_networks, v_budget, v_display, v_respond, v_audience, v_model, v_maxh, auth.uid(), v_comp)
      returning id into v_id;
    else
      update public.brand_calls set title = regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g'), objective = nullif(p_data ->> 'objective', ''),
        description = btrim(coalesce(p_data ->> 'description', '')), starts_on = v_start, ends_on = v_end, location = btrim(coalesce(p_data ->> 'location', '')),
        target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', ''), deliverables = v_deliv, creators_wanted = v_creators, niches = v_niches, networks = v_networks,
        budget_cents = v_budget, budget_display = v_display, respond_by = v_respond, audience = v_audience,
        value_model = v_model, max_heroes = v_maxh, compensation = v_comp
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid_input' using errcode = '22023';
  end;
  delete from public.brand_call_targets g where g.call_id = v_id and (v_audience <> 'selected' or not (g.agency_id = any (v_agencies)));
  if v_audience = 'selected' then
    insert into public.brand_call_targets (call_id, agency_id, brand_id) select v_id, g, p_brand from unnest(v_agencies) g
    on conflict (call_id, agency_id) do nothing;
  end if;
  perform public.audit_log('brand_call.save', 'brand_call', v_id::text, null,
    jsonb_build_object('brand_id', p_brand, 'audience', v_audience, 'agencies', case when v_audience = 'selected' then to_jsonb(v_agencies) end), null,
    'brand'::public.actor_type);
  return v_id;
end $function$;
revoke execute on function public.brand_call_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.brand_call_save(uuid, uuid, jsonb) to authenticated, service_role;

drop function if exists public.brand_call_terms_check(bigint, jsonb);
create or replace function public.brand_call_terms_check(p_amount bigint, p_deliverables jsonb, p_comp jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_deliverables is null or not public.campaign_deliverables_valid(p_deliverables) or jsonb_array_length(p_deliverables) < 1 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- 0140: valor só quando há dinheiro; sem dinheiro a rodada não leva valor
  if public.compensation_money(p_comp) then
    if p_amount is null or p_amount < 1 or p_amount > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  elsif p_amount is not null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.brand_call_terms_check(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.brand_call_terms_check(bigint, jsonb, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.agency_brand_call_proposal_save(p_call uuid, p_agency uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.brand_calls%rowtype; p public.brand_call_proposals%rowtype; v_admin boolean; e jsonb; v_pos int := 0; v_talent uuid; v_kit text;
        v_all jsonb := '[]'::jsonb; v_amount bigint; v_by date; v_note text; v_ids uuid[] := '{}'::uuid[];
        v_model text; v_maxh int; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'talents') <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') or not public.brand_call_agency_ok(p_call, p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  select * into c from public.brand_calls where id = p_call for update;
  if c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if c.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.brand_call_proposals x where x.call_id = p_call and x.agency_id = p_agency and x.status = 'agreed') then
    raise exception 'already_agreed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.brand_call_proposals x where x.call_id = p_call and x.agency_id = p_agency and x.status = 'open') then
    raise exception 'already_negotiating' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_data -> 'talents') not between 1 and 50 then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_amount := nullif(btrim(coalesce(p_data ->> 'amount_cents', '')), '')::bigint;
    v_by := nullif(btrim(coalesce(p_data ->> 'deliver_by', '')), '')::date;
    v_maxh := nullif(btrim(coalesce(p_data ->> 'max_heroes', '')), '')::int;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_note := btrim(coalesce(p_data ->> 'note', ''));
  for e in select value from jsonb_array_elements(p_data -> 'talents') loop
    begin
      v_talent := (e ->> 'talent_id')::uuid;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    if v_talent is null or v_talent = any (v_ids) then raise exception 'invalid_input' using errcode = '22023'; end if;
    if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    -- só creators liberados para marcas (consentimento vigente + liberado no catálogo)
    if not public.talent_brand_card_ok(v_talent, p_agency) then raise exception 'consent_required' using errcode = 'P0001'; end if;
    if jsonb_typeof(e -> 'deliverables') <> 'array' or not public.campaign_deliverables_valid(e -> 'deliverables') or jsonb_array_length(e -> 'deliverables') < 1 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_ids := v_ids || v_talent;
    v_all := v_all || (e -> 'deliverables');
  end loop;
  select * into p from public.brand_call_proposals x where x.call_id = p_call and x.agency_id = p_agency and x.status = 'draft' for update;
  -- 0140: forma de pagamento da proposta (só o Adm muda; sem nada, a da chamada). Sem dinheiro: sem valor, modelo fixo.
  v_comp := case when v_admin and p_data ? 'compensation' then public.compensation_clean(p_data -> 'compensation')
                 else coalesce(p.compensation, c.compensation) end;
  -- 0096: modelo de valor da proposta (só o Adm muda; o gestor mantém o que já estava). Por Hero precisa do máximo e cabe no máximo.
  if not public.compensation_money(v_comp) then
    v_amount := null; v_model := 'fixo'; v_maxh := null;
  elsif v_admin then
    v_model := coalesce(nullif(btrim(coalesce(p_data ->> 'value_model', '')), ''), 'fixo');
    if v_model not in ('fixo', 'por_heroi') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_model = 'por_heroi' then
      if v_maxh is null or v_maxh < 1 or v_maxh > 50 then raise exception 'max_heroes_required' using errcode = '22023'; end if;
      if v_amount is not null and v_amount < 1 then raise exception 'value_per_hero_required' using errcode = '22023'; end if;
      if cardinality(v_ids) > v_maxh then raise exception 'max_heroes' using errcode = 'P0001'; end if;
    else
      v_maxh := null;
    end if;
  else
    v_model := coalesce(p.value_model, 'fixo'); v_maxh := p.max_heroes;
    if v_model = 'por_heroi' and cardinality(v_ids) > v_maxh then raise exception 'max_heroes' using errcode = 'P0001'; end if;
  end if;
  begin
    if p.id is null then
      insert into public.brand_call_proposals (call_id, brand_id, agency_id, status, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, created_by, updated_by, compensation)
      values (p_call, c.brand_id, p_agency, 'draft', case when v_admin then v_amount end, v_model, v_maxh, public.brand_call_sum_deliverables(v_all), v_by, v_note, auth.uid(), auth.uid(), v_comp)
      returning * into p;
    else
      update public.brand_call_proposals set amount_cents = case when v_admin or not public.compensation_money(v_comp) then v_amount else amount_cents end,
        compensation = v_comp,
        value_model = v_model, max_heroes = v_maxh,
        deliverables = public.brand_call_sum_deliverables(v_all), deliver_by = v_by, note = v_note, updated_by = auth.uid()
      where id = p.id returning * into p;
    end if;
    delete from public.brand_call_proposal_talents t where t.proposal_id = p.id;
    for e in select value from jsonb_array_elements(p_data -> 'talents') loop
      v_pos := v_pos + 1;
      v_kit := btrim(coalesce(e ->> 'media_kit_url', ''));
      insert into public.brand_call_proposal_talents (proposal_id, call_id, agency_id, brand_id, talent_id, position, deliverables, media_kit_url)
      values (p.id, p_call, p_agency, c.brand_id, (e ->> 'talent_id')::uuid, v_pos, e -> 'deliverables', v_kit);
    end loop;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('brand_call.proposal_save', 'brand_call', p_call::text, null,
    jsonb_build_object('agency_id', p_agency, 'proposal_id', p.id, 'talents', to_jsonb(v_ids)), null, public.talent_audit_actor('agency', p_agency));
  return p.id;
end $function$;
revoke execute on function public.agency_brand_call_proposal_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.agency_brand_call_proposal_save(uuid, uuid, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agency_brand_call_proposal_send(p_proposal uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_round uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or not public.agency_can(p.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p.call_id for update;
  if p.status <> 'draft' or c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if c.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  -- 0140: valor só é exigido quando a proposta tem dinheiro
  if public.compensation_money(p.compensation) then
    if p.amount_cents is null then raise exception 'amount_required' using errcode = '22023'; end if;
    perform public.value_terms_check(p.value_model, p.amount_cents, p.max_heroes);
  end if;
  if p.value_model = 'por_heroi' and (select count(*) from public.brand_call_proposal_talents t where t.proposal_id = p.id) > p.max_heroes then
    raise exception 'max_heroes' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.brand_call_proposal_talents t where t.proposal_id = p.id) or jsonb_array_length(p.deliverables) = 0 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- creators que perderam a liberação depois do rascunho: não vão
  if exists (select 1 from public.brand_call_proposal_talents t where t.proposal_id = p.id and not public.talent_brand_card_ok(t.talent_id, p.agency_id)) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, state, actor_id, actor_label, compensation)
  values (p.id, p.call_id, p.brand_id, p.agency_id, 1, 'agency', 'propose', p.amount_cents, p.value_model, p.max_heroes, p.deliverables, p.deliver_by, left(p.note, 500), 'sent', auth.uid(),
          public.actor_label(p.agency_id, null), p.compensation)
  returning id into v_round;
  update public.brand_call_proposals set sent_by = auth.uid() where id = p.id;
  perform public.audit_log('brand_call.proposal_send', 'brand_call', p.call_id::text, null, jsonb_build_object('agency_id', p.agency_id, 'proposal_id', p.id), null,
    public.talent_audit_actor('agency', p.agency_id));
  return public.brand_call_round_apply(v_round);
end $function$;
revoke execute on function public.agency_brand_call_proposal_send(uuid) from public, anon;
grant execute on function public.agency_brand_call_proposal_send(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_call_round_apply(p_round uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.brand_call_rounds%rowtype; p public.brand_call_proposals%rowtype; v_other text;
begin
  select * into r from public.brand_call_rounds where id = p_round;
  select * into p from public.brand_call_proposals where id = r.proposal_id for update;
  update public.brand_call_rounds set state = 'sent' where id = r.id;
  v_other := case when r.side = 'brand' then 'agency' else 'brand' end;
  if r.action = 'decline' then
    update public.brand_call_proposals set status = 'declined', awaiting = null, ended_at = now(), rounds = rounds + 1,
      end_reason = case when r.side = 'brand' then 'declined_brand' else 'declined_agency' end
    where id = p.id;
    perform public.brand_call_negotiation_notify(p.id, v_other, 'declined', 'bcall-round:' || r.id::text);
    return 'declined';
  end if;
  update public.brand_call_proposals set amount_cents = r.amount_cents, value_model = r.value_model, max_heroes = r.max_heroes, compensation = r.compensation, deliverables = r.deliverables, deliver_by = r.deliver_by,
    rounds = rounds + 1, sent_at = coalesce(sent_at, now()), status = 'open', awaiting = v_other
  where id = p.id;
  if r.action = 'accept' then
    perform public.brand_call_agree(p.id, r.side);
    return 'agreed';
  end if;
  perform public.brand_call_negotiation_notify(p.id, v_other, case when r.action = 'propose' then 'proposed' else 'countered' end, 'bcall-round:' || r.id::text);
  return 'open';
end $function$;
revoke execute on function public.brand_call_round_apply(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_round_apply(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.brand_call_agree(p_proposal uuid, p_side text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_request uuid; v_talent uuid; v_names text; v_agency text; v_notes text;
        r record; v_brand text;
begin
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  select * into c from public.brand_calls where id = p.call_id;
  update public.brand_call_proposals set status = 'agreed', awaiting = null, agreed_cents = amount_cents, agreed_value_model = value_model, agreed_max_heroes = max_heroes, agreed_compensation = compensation, agreed_deliverables = deliverables,
    agreed_deliver_by = deliver_by, agreed_side = p_side, agreed_at = now(), sent_at = coalesce(sent_at, now())
  where id = p.id returning * into p;
  -- 0096: não se acorda com mais Heros que o máximo da proposta
  if p.value_model = 'por_heroi' and (select count(*) from public.brand_call_proposal_talents t where t.proposal_id = p.id) > p.max_heroes then
    raise exception 'max_heroes' using errcode = 'P0001';
  end if;
  -- vínculo: a campanha precisa de agency_brands; quem não atende a marca entra por projeto (arquivado, D18 intacta)
  insert into public.agency_brands (agency_id, brand_id, status) values (p.agency_id, p.brand_id, 'archived')
  on conflict (agency_id, brand_id) do nothing;
  select t.talent_id into v_talent from public.brand_call_proposal_talents t where t.proposal_id = p.id order by t.position limit 1;
  select string_agg(tp.display_name, ', ' order by t.position) into v_names
  from public.brand_call_proposal_talents t join public.talent_profiles tp on tp.id = t.talent_id where t.proposal_id = p.id;
  select a.name into v_agency from public.agencies a where a.id = p.agency_id;
  v_notes := left(concat_ws(E'\n',
    'Chamada da marca: ' || c.title || ' — proposta acordada com ' || coalesce(v_agency, ''),
    case when v_names is not null then 'Creators: ' || v_names end,
    case when p.agreed_deliver_by is not null then 'Prazo de entrega: ' || to_char(p.agreed_deliver_by, 'DD/MM/YYYY') end,
    case when p.note <> '' then 'Observações da agência: ' || p.note end,
    case when c.description <> '' then c.description end), 2000);
  begin
    insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, period_start, period_end, format, location, networks,
                                          deliverables, notes, target_audience, target_age_bands, target_states, region_note, brand_call_id)
    values (p.agency_id, p.brand_id, 'brand', coalesce(c.published_by, c.created_by), v_talent, left(c.title, 120), coalesce(c.objective, 'other'),
            c.starts_on, c.ends_on, case when c.location <> '' then 'in_person' end, c.location, c.networks, p.agreed_deliverables, v_notes,
            c.target_audience, c.target_age_bands, c.target_states, c.region_note, c.id)
    returning id into v_request;
  exception when check_violation or not_null_violation or foreign_key_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  -- a campanha herda modelo, valor e máximo do acordo
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, value_model, max_heroes, updated_by, compensation)
  values (p.agency_id, p.brand_id, v_request, case when p.agreed_value_model = 'por_heroi' then null else p.agreed_cents end, p.agreed_cents,
          'Chamada da marca — valor acordado', p.agreed_value_model, p.agreed_max_heroes, auth.uid(), p.agreed_compensation)
  on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
    note = excluded.note, value_model = excluded.value_model, max_heroes = excluded.max_heroes, updated_by = excluded.updated_by,
    compensation = excluded.compensation;
  update public.brand_call_proposals set request_id = v_request where id = p.id;
  perform public.audit_log('brand_call.agree', 'brand_call', c.id::text, null,
    jsonb_build_object('brand_id', p.brand_id, 'agency_id', p.agency_id, 'proposal_id', p.id, 'side', p_side, 'request_id', v_request), null,
    case when p_side = 'agency' then public.talent_audit_actor('agency', p.agency_id) else 'brand'::public.actor_type end);
  perform public.brand_call_negotiation_notify(p.id, case when p_side = 'agency' then 'brand' else 'agency' end, 'agreed', 'bcall-agreed:' || p.id::text);
  -- creators da proposta vencedora: foram escolhidos (sem valor)
  select b.name into v_brand from public.brands b where b.id = p.brand_id;
  for r in select t.talent_id from public.brand_call_proposal_talents t where t.proposal_id = p.id loop
    perform public.inbox_notify(public.talent_user_id(r.talent_id), 'brand_call_decided', '/creator/escritorio/oportunidades',
      jsonb_build_object('title', left(c.title, 120), 'brand', left(coalesce(v_brand, ''), 120), 'status', 'chosen'),
      p.agency_id, 'brand_call', c.id, 'bcall-chosen:' || p.id::text || ':' || r.talent_id::text);
  end loop;
end $function$;
revoke execute on function public.brand_call_agree(uuid, text) from public, anon, authenticated;
grant execute on function public.brand_call_agree(uuid, text) to service_role;

drop function if exists public.brand_call_reply(uuid, text, bigint, jsonb, date, text, text, integer);
CREATE OR REPLACE FUNCTION public.brand_call_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_deliverables jsonb, p_deliver_by date, p_note text, p_value_model text DEFAULT NULL::text, p_max_heroes integer DEFAULT NULL::integer, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_deliv jsonb; v_by date; v_round uuid; v_seq int; v_model text; v_maxh int; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or p.sent_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(p.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.brand_calls where id = p.call_id;
  if p.status <> 'open' or p.awaiting <> 'brand' or c.decided_at is not null or c.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.brand_call_rounds r where r.proposal_id = p.id and r.state = 'pending_owner') then
    raise exception 'awaiting_approval' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    -- 0140: a contraproposta pode mudar a forma de pagamento (sem informar, fica a atual); sem dinheiro, sem valor
    v_comp := case when p_compensation is null then p.compensation else public.compensation_clean(p_compensation) end;
    v_amount := case when public.compensation_money(v_comp) then p_amount_cents end; v_deliv := p_deliverables; v_by := p_deliver_by;
    perform public.brand_call_terms_check(v_amount, v_deliv, v_comp);
    -- 0096: a contraproposta pode mudar o modelo e o máximo (sem informar, ficam como estão)
    v_model := case when public.compensation_money(v_comp) then coalesce(nullif(btrim(coalesce(p_value_model, '')), ''), p.value_model) else 'fixo' end;
    v_maxh := case when v_model = 'por_heroi' then coalesce(p_max_heroes, p.max_heroes) end;
    if public.compensation_money(v_comp) then perform public.value_terms_check(v_model, v_amount, v_maxh); end if;
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_deliv := p.deliverables; v_by := p.deliver_by;
    v_model := p.value_model; v_maxh := p.max_heroes; v_comp := p.compensation;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = p.id;
  -- recusar não compromete dinheiro: a equipe recusa direto; aceitar e contrapropor da equipe esperam o dono
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, state, actor_id, actor_label, compensation)
  values (p.id, p.call_id, p.brand_id, p.agency_id, v_seq, 'brand', p_action, v_amount, v_model, v_maxh, v_deliv, v_by, v_note,
          case when v_role = 'owner' or p_action = 'decline' then 'sent' else 'pending_owner' end, auth.uid(), public.actor_label(null, p.brand_id), coalesce(v_comp, '{"money": true, "barter": null, "performance": null}'::jsonb))
  returning id into v_round;
  perform public.audit_log('brand_call.brand_reply', 'brand_call', p.call_id::text, null,
    jsonb_build_object('brand_id', p.brand_id, 'agency_id', p.agency_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' or p_action = 'decline' then
    return public.brand_call_round_apply(v_round);
  end if;
  perform public.brand_call_negotiation_notify(p.id, 'brand_owners', 'approval', 'bcall-approval:' || v_round::text);
  return 'pending_owner';
end $function$;
revoke execute on function public.brand_call_reply(uuid, text, bigint, jsonb, date, text, text, integer, jsonb) from public, anon;
grant execute on function public.brand_call_reply(uuid, text, bigint, jsonb, date, text, text, integer, jsonb) to authenticated, service_role;

drop function if exists public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text, text, integer);
CREATE OR REPLACE FUNCTION public.agency_brand_call_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_deliverables jsonb, p_deliver_by date, p_note text, p_value_model text DEFAULT NULL::text, p_max_heroes integer DEFAULT NULL::integer, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_note text := btrim(coalesce(p_note, '')); v_amount bigint; v_deliv jsonb; v_by date;
        v_round uuid; v_seq int; v_model text; v_maxh int; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or p.sent_at is null or not public.agency_can(p.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_action = 'decline' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into c from public.brand_calls where id = p.call_id;
  if p.status <> 'open' or p.awaiting <> 'agency' or c.decided_at is not null or c.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    -- 0140: a contraproposta pode mudar a forma de pagamento (sem informar, fica a atual); sem dinheiro, sem valor
    v_comp := case when p_compensation is null then p.compensation else public.compensation_clean(p_compensation) end;
    v_amount := case when public.compensation_money(v_comp) then p_amount_cents end; v_deliv := p_deliverables; v_by := p_deliver_by;
    perform public.brand_call_terms_check(v_amount, v_deliv, v_comp);
    -- 0096: a contraproposta pode mudar o modelo e o máximo (sem informar, ficam como estão)
    v_model := case when public.compensation_money(v_comp) then coalesce(nullif(btrim(coalesce(p_value_model, '')), ''), p.value_model) else 'fixo' end;
    v_maxh := case when v_model = 'por_heroi' then coalesce(p_max_heroes, p.max_heroes) end;
    if public.compensation_money(v_comp) then perform public.value_terms_check(v_model, v_amount, v_maxh); end if;
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_deliv := p.deliverables; v_by := p.deliver_by;
    v_model := p.value_model; v_maxh := p.max_heroes; v_comp := p.compensation;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = p.id;
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, state, actor_id, actor_label, compensation)
  values (p.id, p.call_id, p.brand_id, p.agency_id, v_seq, 'agency', p_action, v_amount, v_model, v_maxh, v_deliv, v_by, v_note, 'sent', auth.uid(), public.actor_label(p.agency_id, null), coalesce(v_comp, '{"money": true, "barter": null, "performance": null}'::jsonb))
  returning id into v_round;
  perform public.audit_log('brand_call.agency_reply', 'brand_call', p.call_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), public.talent_audit_actor('agency', p.agency_id));
  return public.brand_call_round_apply(v_round);
end $function$;
revoke execute on function public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text, text, integer, jsonb) from public, anon;
grant execute on function public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text, text, integer, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_call_decide(p_id uuid, p_action text, p_proposals uuid[], p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_pick uuid[]; q record; v_round uuid; v_seq int; v_agreed int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p_id for update;
  v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('contract', 'close', 'cancel') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if c.decided_at is not null or c.status not in ('draft', 'open', 'closed') or (c.status = 'draft' and p_action <> 'cancel') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select count(*) into v_agreed from public.brand_call_proposals x where x.call_id = p_id and x.status = 'agreed';
  if p_action = 'cancel' then
    if v_agreed > 0 then raise exception 'has_agreement' using errcode = 'P0001'; end if;
    perform public.brand_call_close_out(p_id, 'cancelled', v_note);
    return;
  end if;
  if p_action = 'contract' then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_pick from unnest(coalesce(p_proposals, '{}'::uuid[])) x;
    if cardinality(v_pick) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    for q in select x.* from public.brand_call_proposals x where x.id = any (v_pick) for update loop
      if q.call_id <> p_id then raise exception 'not_found' using errcode = 'P0002'; end if;
    end loop;
    if (select count(*) from public.brand_call_proposals x where x.id = any (v_pick) and x.call_id = p_id) <> cardinality(v_pick) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.brand_call_proposals x where x.id = any (v_pick)
               and not (x.status = 'agreed' or (x.status = 'open' and x.awaiting = 'brand'
                        and not exists (select 1 from public.brand_call_rounds r where r.proposal_id = x.id and r.state = 'pending_owner')))) then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    -- aceita, nas condições da última rodada da agência, cada escolhida que ainda não tinha acordo
    for q in select x.* from public.brand_call_proposals x where x.id = any (v_pick) and x.status = 'open' order by x.sent_at loop
      select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = q.id;
      -- 0140: o aceite leva também modelo, máximo e forma de pagamento da proposta (antes ia sem o modelo)
      insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, compensation, deliverables, deliver_by, note, state, actor_id, actor_label)
      values (q.id, q.call_id, q.brand_id, q.agency_id, v_seq, 'brand', 'accept', q.amount_cents, q.value_model, q.max_heroes, q.compensation, q.deliverables, q.deliver_by, v_note, 'sent', auth.uid(),
              public.actor_label(null, q.brand_id))
      returning id into v_round;
      perform public.brand_call_round_apply(v_round);
    end loop;
    perform public.brand_call_close_out(p_id, 'contracted', v_note);
    return;
  end if;
  -- encerrar: com acordo vira contratada
  perform public.brand_call_close_out(p_id, case when v_agreed > 0 then 'contracted' else 'closed' end, v_note);
end $function$;
revoke execute on function public.brand_call_decide(uuid, text, uuid[], text) from public, anon;
grant execute on function public.brand_call_decide(uuid, text, uuid[], text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_call_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id', c.id, 'brand_id', c.brand_id, 'brand_name', b.name, 'brand_logo_url', b.logo_url, 'title', c.title, 'objective', c.objective,
    'description', c.description, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'location', c.location,
    'public', jsonb_build_object('target_audience', c.target_audience, 'target_age_bands', to_jsonb(c.target_age_bands),
                                 'target_states', to_jsonb(c.target_states), 'region_note', c.region_note),
    'deliverables', c.deliverables, 'creators_wanted', c.creators_wanted, 'niches', to_jsonb(c.niches), 'networks', to_jsonb(c.networks),
    'budget_display', c.budget_display, 'value_model', c.value_model, 'compensation', c.compensation, 'max_heroes', c.max_heroes, 'respond_by', c.respond_by, 'status', c.status, 'closed_reason', c.closed_reason,
    'published_at', c.published_at, 'decided_at', c.decided_at, 'decision_note', c.decision_note, 'created_at', c.created_at)
  from public.brand_calls c join public.brands b on b.id = c.brand_id where c.id = p_id
$function$;
revoke execute on function public.brand_call_json(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_json(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.brand_call_rounds_json(p_proposal uuid, p_values boolean, p_sent_only boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
      'amount_cents', case when p_values then r.amount_cents end, 'value_model', r.value_model, 'max_heroes', r.max_heroes, 'deliverables', r.deliverables, 'deliver_by', r.deliver_by, 'note', r.note, 'state', r.state,
      'actor_label', r.actor_label, 'created_at', r.created_at, 'reviewed_label', r.reviewed_label, 'reviewed_at', r.reviewed_at,
      'review_note', r.review_note,
      'compensation', case when p_values then r.compensation else public.compensation_public(r.compensation) end) order by r.seq), '[]'::jsonb)
  from public.brand_call_rounds r where r.proposal_id = p_proposal and (not p_sent_only or r.state = 'sent')
$function$;
revoke execute on function public.brand_call_rounds_json(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.brand_call_rounds_json(uuid, boolean, boolean) to service_role;

CREATE OR REPLACE FUNCTION public.brand_call_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.brand_calls%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p_id;
  v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'role', v_role,
    'call', public.brand_call_json(c.id) || jsonb_build_object('budget_cents', c.budget_cents, 'audience', c.audience, 'approval_status', c.approval_status,
      'approval_requested_label', c.approval_requested_label, 'approval_requested_at', c.approval_requested_at, 'approval_request_note', c.approval_request_note,
      'approval_requested_by_me', c.approval_requested_by = auth.uid(), 'approval_decided_label', c.approval_decided_label,
      'approval_decided_at', c.approval_decided_at, 'approval_decision_note', c.approval_decision_note),
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.name), '[]'::jsonb)
                from public.brand_call_targets g join public.agencies a on a.id = g.agency_id where g.call_id = c.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'agency_id', q.agency_id, 'agency_name', a.name, 'status', q.status, 'awaiting', q.awaiting,
        'amount_cents', q.amount_cents, 'value_model', q.value_model, 'max_heroes', q.max_heroes,
        'agreed_value_model', q.agreed_value_model, 'agreed_max_heroes', q.agreed_max_heroes, 'deliverables', q.deliverables, 'deliver_by', q.deliver_by, 'note', q.note, 'rounds', q.rounds, 'sent_at', q.sent_at,
        'compensation', q.compensation, 'agreed_compensation', q.agreed_compensation,
        'agreed_cents', q.agreed_cents, 'agreed_deliverables', q.agreed_deliverables, 'agreed_deliver_by', q.agreed_deliver_by, 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'request_id', q.request_id,
        'pending_owner', exists (select 1 from public.brand_call_rounds r where r.proposal_id = q.id and r.state = 'pending_owner'),
        'talents', public.brand_call_proposal_talents_json(q.id, true),
        'history', public.brand_call_rounds_json(q.id, true, false))
      order by (q.status = 'agreed') desc, (q.status = 'open') desc, q.sent_at), '[]'::jsonb)
      from public.brand_call_proposals q join public.agencies a on a.id = q.agency_id where q.call_id = c.id and q.sent_at is not null));
end $function$;
revoke execute on function public.brand_call_detail(uuid) from public, anon;
grant execute on function public.brand_call_detail(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agency_brand_call_detail(p_id uuid, p_agency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.brand_calls%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') or not public.brand_call_agency_ok(p_id, p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from public.brand_calls where id = p_id;
  v_admin := public.agency_can(p_agency, 'admin');
  return jsonb_build_object(
    'can_values', v_admin,
    'call', public.brand_call_json(c.id) || jsonb_build_object('budget_cents', public.brand_call_budget_for_agency(c.id, v_admin),
      'compensation', case when v_admin then c.compensation else public.compensation_public(c.compensation) end),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting,
        'amount_cents', case when v_admin then q.amount_cents end, 'has_amount', q.amount_cents is not null, 'value_model', q.value_model, 'max_heroes', q.max_heroes,
        'agreed_value_model', q.agreed_value_model, 'agreed_max_heroes', q.agreed_max_heroes, 'deliverables', q.deliverables,
        'deliver_by', q.deliver_by, 'note', q.note, 'rounds', q.rounds, 'sent_at', q.sent_at,
        'agreed_cents', case when v_admin then q.agreed_cents end, 'agreed_deliverables', q.agreed_deliverables, 'agreed_deliver_by', q.agreed_deliver_by,
        'agreed_side', q.agreed_side, 'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason,
        'compensation', case when v_admin then q.compensation else public.compensation_public(q.compensation) end,
        'agreed_compensation', case when v_admin then q.agreed_compensation else public.compensation_public(q.agreed_compensation) end,
        'talents', public.brand_call_proposal_talents_json(q.id, false),
        'history', public.brand_call_rounds_json(q.id, v_admin, true))
      order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc), '[]'::jsonb)
      from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency),
    'interests', (select coalesce(jsonb_agg(jsonb_build_object('talent_id', i.talent_id, 'name', t.display_name, 'message', i.message, 'created_at', i.updated_at)
        order by i.updated_at desc), '[]'::jsonb)
      from public.brand_call_interests i join public.talent_profiles t on t.id = i.talent_id where i.call_id = c.id and i.agency_id = p_agency),
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.display_name,
        'networks', (select coalesce(jsonb_agg(distinct a.network), '[]'::jsonb) from public.talent_social_accounts a where a.talent_id = t.id),
        'interested', exists (select 1 from public.brand_call_interests i where i.call_id = c.id and i.talent_id = t.id))
      order by t.display_name), '[]'::jsonb)
      from public.talent_profiles t where t.agency_id = p_agency and public.talent_brand_card_ok(t.id, p_agency)));
end $function$;
revoke execute on function public.agency_brand_call_detail(uuid, uuid) from public, anon;
grant execute on function public.agency_brand_call_detail(uuid, uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.talent_brand_calls()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_talent uuid; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  select t.agency_id into v_agency from public.talent_profiles t where t.id = v_talent and t.archived_at is null;
  if v_agency is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg((public.brand_call_json(c.id) - 'brand_id' - 'decision_note' - 'value_model' - 'max_heroes') || jsonb_build_object(
      'my_networks', (select coalesce(jsonb_agg(distinct a.network), '[]'::jsonb) from public.talent_social_accounts a where a.talent_id = v_talent),
      'compensation', public.compensation_public(c.compensation),
      'my_interest', (select jsonb_build_object('message', i.message, 'at', i.updated_at) from public.brand_call_interests i where i.call_id = c.id and i.talent_id = v_talent),
      'chosen', exists (select 1 from public.brand_call_proposal_talents x join public.brand_call_proposals q on q.id = x.proposal_id
                        where x.call_id = c.id and x.talent_id = v_talent and q.status = 'agreed'))
    order by (c.status = 'open' and c.respond_by >= now()) desc, c.respond_by), '[]'::jsonb)
    from public.brand_calls c
    where c.status <> 'draft' and public.brand_call_agency_ok(c.id, v_agency)
      and ((c.status = 'open' and c.respond_by >= now())
           or exists (select 1 from public.brand_call_interests i where i.call_id = c.id and i.talent_id = v_talent)
           or exists (select 1 from public.brand_call_proposal_talents x where x.call_id = c.id and x.talent_id = v_talent)));
end $function$;
revoke execute on function public.talent_brand_calls() from public, anon;
grant execute on function public.talent_brand_calls() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agency_brand_calls(p_agency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  return (select coalesce(jsonb_agg(public.brand_call_json(c.id) || jsonb_build_object(
      'budget_cents', public.brand_call_budget_for_agency(c.id, v_admin),
      'compensation', case when v_admin then c.compensation else public.compensation_public(c.compensation) end,
      'view_status', case when c.status = 'cancelled' then 'cancelled'
                          when exists (select 1 from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency and q.status = 'agreed') then 'won'
                          when c.status = 'contracted' then 'lost'
                          when c.status = 'closed' then 'closed'
                          when c.respond_by < now() then 'expired' else 'open' end,
      'interests', (select count(*) from public.brand_call_interests i where i.call_id = c.id and i.agency_id = p_agency),
      'proposal', (select jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting)
                   from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency
                   order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc limit 1))
    order by (c.status = 'open' and c.respond_by >= now()) desc, c.respond_by), '[]'::jsonb)
    from public.brand_calls c where c.status <> 'draft' and public.brand_call_agency_ok(c.id, p_agency));
end $function$;
revoke execute on function public.agency_brand_calls(uuid) from public, anon;
grant execute on function public.agency_brand_calls(uuid) to authenticated, service_role;

-- 6) patrocínio: forma de pagamento de cada cota (o que a marca paga) e das propostas; acordo sem dinheiro ------------
alter table public.sponsorship_tiers add column if not exists compensation jsonb not null default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.sponsorship_tiers drop constraint if exists sponsorship_tiers_compensation_check;
alter table public.sponsorship_tiers add constraint sponsorship_tiers_compensation_check check (
  public.compensation_valid(compensation) and (public.compensation_money(compensation) or price_cents is null));

alter table public.sponsorship_proposals add column if not exists compensation jsonb not null default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.sponsorship_proposals add column if not exists agreed_compensation jsonb;
update public.sponsorship_proposals set agreed_compensation = compensation where status = 'agreed' and agreed_compensation is null;
alter table public.sponsorship_proposals alter column amount_cents drop not null;
alter table public.sponsorship_proposals drop constraint if exists sponsorship_proposals_amount_check;
alter table public.sponsorship_proposals add constraint sponsorship_proposals_amount_check check (
  (amount_cents is null or amount_cents between 1 and 10000000000) and (asked_cents is null or asked_cents between 1 and 10000000000));
alter table public.sponsorship_proposals drop constraint if exists sponsorship_proposals_compensation_check;
alter table public.sponsorship_proposals add constraint sponsorship_proposals_compensation_check check (
  public.compensation_valid(compensation) and (agreed_compensation is null or public.compensation_valid(agreed_compensation))
  and case when public.compensation_money(compensation) then amount_cents is not null else amount_cents is null end);
alter table public.sponsorship_proposals drop constraint if exists sponsorship_proposals_agreed_check;
alter table public.sponsorship_proposals add constraint sponsorship_proposals_agreed_check check (
  (status = 'agreed') = (agreed_at is not null)
  and (status <> 'agreed' or ((agreed_cents is not null or not public.compensation_money(coalesce(agreed_compensation, compensation)))
                              and agreed_perks is not null and agreed_side in ('agency', 'brand'))));

alter table public.sponsorship_rounds add column if not exists compensation jsonb;
update public.sponsorship_rounds set compensation = '{"money": true, "barter": null, "performance": null}'::jsonb where compensation is null;
alter table public.sponsorship_rounds alter column compensation set default '{"money": true, "barter": null, "performance": null}'::jsonb;
alter table public.sponsorship_rounds alter column compensation set not null;
alter table public.sponsorship_rounds drop constraint if exists sponsorship_rounds_compensation_check;
alter table public.sponsorship_rounds drop constraint if exists sponsorship_rounds_amount_check;
alter table public.sponsorship_rounds add constraint sponsorship_rounds_compensation_check check (public.compensation_valid(compensation));
alter table public.sponsorship_rounds add constraint sponsorship_rounds_amount_check check (
  (action = 'decline' and amount_cents is null)
  or (action <> 'decline' and case when public.compensation_money(compensation) then amount_cents between 1 and 10000000000 else amount_cents is null end));

drop function if exists public.sponsorship_terms_check(bigint, text[]);
create or replace function public.sponsorship_terms_check(p_amount bigint, p_perks text[], p_comp jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if not public.sponsorship_proposal_perks_valid(p_perks) then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- 0140: valor só quando há dinheiro; permuta/performance sem dinheiro não levam valor
  if public.compensation_money(p_comp) then
    if p_amount is null or p_amount < 1 or p_amount > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  elsif p_amount is not null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.sponsorship_terms_check(bigint, text[], jsonb) from public, anon, authenticated;
grant execute on function public.sponsorship_terms_check(bigint, text[], jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.agency_sponsorship_save(p_agency uuid, p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before public.sponsorship_opportunities%rowtype; v_id uuid := p_id; v_talent uuid; v_start timestamptz; v_end timestamptz; v_respond timestamptz;
        v_all_day boolean; v_title text; v_audience text; v_perks text[]; v_networks text[]; v_brands uuid[]; v_has_responses boolean := false;
        v_admin boolean; v_tiers jsonb; e jsonb; v_pos int := 0; v_tier_id uuid; v_keep uuid[] := '{}'::uuid[]; v_tname text; v_tperks text[];
        v_tslots int; v_tprice bigint; v_old public.sponsorship_tiers%rowtype; v_public jsonb;
        v_hero jsonb; v_publish boolean; v_status text; v_t record; v_tmodel text; v_tcomp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  if v_id is not null then
    select * into v_before from public.sponsorship_opportunities o where o.id = v_id and o.agency_id = p_agency for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.status not in ('draft', 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_has_responses := exists (select 1 from public.sponsorship_responses r where r.opportunity_id = v_id);
  end if;
  v_tiers := case when jsonb_typeof(p_data -> 'tiers') = 'array' then p_data -> 'tiers' end;
  if p_data ? 'tiers' and (v_tiers is null or jsonb_array_length(v_tiers) not between 1 and 3) then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_start := coalesce(nullif(btrim(coalesce(p_data ->> 'starts_at', '')), '')::timestamptz, v_before.starts_at);
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_at', '')), '')::timestamptz, v_before.ends_at, v_start);
    v_respond := coalesce(nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz, v_before.respond_by);
    v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
    v_publish := case when p_data ? 'publish' and jsonb_typeof(p_data -> 'publish') <> 'null' then (p_data ->> 'publish')::boolean end;
    if v_tiers is not null then
      -- contrapartidas gerais = união das cotas (na ordem, sem repetir, até 10)
      select coalesce((array_agg(x order by f))[1:10], '{}'::text[]) into v_perks
      from (select distinct on (lower(btrim(x))) btrim(x) as x, (t.n * 100 + e2.m) as f
            from jsonb_array_elements(v_tiers) with ordinality t(v, n)
            cross join lateral jsonb_array_elements_text(coalesce(t.v -> 'perks', '[]'::jsonb)) with ordinality e2(x, m)
            where btrim(x) <> '' order by lower(btrim(x)), (t.n * 100 + e2.m)) s;
    elsif p_data ? 'perks' then
      select coalesce(array_agg(btrim(x) order by n), '{}'::text[]) into v_perks
      from jsonb_array_elements_text(p_data -> 'perks') with ordinality as e(x, n) where btrim(x) <> '';
    else v_perks := coalesce(v_before.perks, '{}'::text[]); end if;
    if p_data ? 'networks' then
      select coalesce(array_agg(distinct lower(btrim(x))), '{}'::text[]) into v_networks from jsonb_array_elements_text(p_data -> 'networks') x;
    else v_networks := coalesce(v_before.networks, '{}'::text[]); end if;
    if p_data ? 'brand_ids' then
      select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_brands from jsonb_array_elements_text(p_data -> 'brand_ids') x where btrim(x) <> '';
    end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_title := btrim(coalesce(p_data ->> 'title', v_before.title, ''));
  v_audience := coalesce(nullif(p_data ->> 'audience', ''), v_before.audience, 'all');
  -- público do evento (mesmos campos da campanha); ausente = mantém
  v_public := case when p_data ?| array['target_audience', 'target_age_bands', 'target_states', 'region_note'] then
    coalesce(public.sponsorship_audience_clean(jsonb_strip_nulls(jsonb_build_object('target_audience', p_data -> 'target_audience',
      'target_age_bands', p_data -> 'target_age_bands', 'target_states', p_data -> 'target_states', 'region_note', p_data -> 'region_note'))),
      '{}'::jsonb) end;
  -- Hero (0095): ficha do casting, Hero da plataforma fora do casting (a ficha nasce aqui) ou Hero digitado
  if p_data ? 'hero' and jsonb_typeof(p_data -> 'hero') <> 'null' then
    if jsonb_typeof(p_data -> 'hero') <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_hero := p_data -> 'hero';
    select f.out_talent into v_talent from public.agency_hero_ficha(p_agency, v_hero, 'sponsorship', coalesce(v_id::text, 'new')) f;
  end if;
  -- situação final: criando, ausente = publica (formato antigo) e false = rascunho; rascunho publica com publish=true; aberta segue aberta
  v_status := case when v_before.id is null then (case when coalesce(v_publish, true) then 'open' else 'draft' end)
                   when v_before.status = 'open' then 'open'
                   when v_publish is true then 'open' else 'draft' end;
  if v_talent is null or v_start is null or v_respond is null or v_audience not in ('all', 'selected') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_has_responses and v_talent <> v_before.talent_id then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- CONSENTIMENTO: exigido para a oportunidade ficar visível às marcas (aberta); rascunho não precisa
  if v_status = 'open' then
    select (t.consent_at is not null and t.consent_revoked_at is null) as consent_ok, c.id as cid, c.status as cstatus into v_t
    from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id where t.id = v_talent;
    if not v_t.consent_ok then raise exception 'consent_required' using errcode = 'P0001'; end if;
    if v_t.cid is not null and v_t.cstatus <> 'active' then raise exception 'hero_inactive' using errcode = 'P0001'; end if;
  end if;
  -- prazo para responder: no futuro (ao criar, ao mudar e ao publicar um rascunho)
  if (v_before.id is null or v_respond is distinct from v_before.respond_by or (v_before.status = 'draft' and v_status = 'open')) and v_respond <= now() then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if v_respond > v_end then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_audience = 'selected' then
    if v_brands is null then
      select coalesce(array_agg(g.brand_id), '{}'::uuid[]) into v_brands from public.sponsorship_targets g where g.opportunity_id = v_id;
    end if;
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_brands
    from (select unnest(v_brands) as x union select r.brand_id from public.sponsorship_responses r where r.opportunity_id = v_id
          union select q.brand_id from public.sponsorship_proposals q where q.opportunity_id = v_id) s;
    if cardinality(v_brands) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_brands) b where not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = b and ab.status = 'active')) then
      raise exception 'brand_not_linked' using errcode = 'P0001';
    end if;
  end if;
  begin
    if v_id is null then
      insert into public.sponsorship_opportunities (agency_id, talent_id, title, description, location, starts_at, ends_at, all_day, expected_reach, perks, networks,
                                                    respond_by, audience, status, created_by)
      values (p_agency, v_talent, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_start, v_end, v_all_day, btrim(coalesce(p_data ->> 'expected_reach', '')), v_perks, v_networks, v_respond, v_audience, v_status, auth.uid())
      returning id into v_id;
    else
      update public.sponsorship_opportunities set talent_id = v_talent, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        expected_reach = case when p_data ? 'expected_reach' then btrim(coalesce(p_data ->> 'expected_reach', '')) else expected_reach end,
        perks = v_perks, networks = v_networks, respond_by = v_respond, audience = v_audience, status = v_status
      where id = v_id;
    end if;
    if v_public is not null then
      update public.sponsorship_opportunities set target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', '')
      where id = v_id;
    end if;
    -- cotas
    if v_tiers is not null then
      for e in select value from jsonb_array_elements(v_tiers) loop
        v_pos := v_pos + 1;
        if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
        begin
          v_tier_id := nullif(btrim(coalesce(e ->> 'id', '')), '')::uuid;
          v_tname := regexp_replace(btrim(coalesce(e ->> 'name', '')), '\s+', ' ', 'g');
          select coalesce(array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g') order by n), '{}'::text[]) into v_tperks
          from jsonb_array_elements_text(coalesce(e -> 'perks', '[]'::jsonb)) with ordinality q(x, n) where btrim(x) <> '';
          v_tslots := coalesce(nullif(btrim(coalesce(e ->> 'slots', '')), '')::int, 1);
          v_tprice := nullif(btrim(coalesce(e ->> 'price_cents', '')), '')::bigint;
          v_tmodel := nullif(btrim(coalesce(e ->> 'value_model', '')), '');
        exception when others then raise exception 'invalid_input' using errcode = '22023';
        end;
        -- 0140: forma de pagamento da cota (o que a marca paga: valor, permuta, performance) — como o preço, só o Adm define
        v_tcomp := case when v_admin and e ? 'compensation' then public.compensation_clean(e -> 'compensation') end;
        if v_tcomp is not null and not public.compensation_money(v_tcomp) then v_tprice := null; end if;
        -- 0108: modelo de valor da cota (fixo do evento | por marca)
        if v_tmodel is not null and v_tmodel not in ('fixo', 'por_marca') then raise exception 'invalid_input' using errcode = '22023'; end if;
        v_old := null;
        if v_tier_id is not null then
          select * into v_old from public.sponsorship_tiers t where t.id = v_tier_id and t.opportunity_id = v_id for update;
          if v_old.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
          -- vagas não descem abaixo dos acordos já fechados
          if v_tslots < public.sponsorship_tier_agreed(v_old.id) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
          -- com acordo fechado, o modelo da cota não muda (mudaria o que já foi combinado)
          if v_admin and v_tmodel is not null and v_tmodel <> v_old.value_model and public.sponsorship_tier_agreed(v_old.id) > 0 then
            raise exception 'invalid_state' using errcode = 'P0001';
          end if;
          update public.sponsorship_tiers set position = v_pos, name = v_tname, perks = v_tperks, slots = v_tslots,
            price_cents = case when v_admin then v_tprice else price_cents end,
            value_model = case when v_admin then coalesce(v_tmodel, value_model) else value_model end,
            compensation = coalesce(v_tcomp, compensation),
            price_updated_by = case when v_admin and v_tprice is distinct from price_cents then auth.uid() else price_updated_by end,
            price_updated_at = case when v_admin and v_tprice is distinct from price_cents then now() else price_updated_at end
          where id = v_old.id;
        else
          insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, price_cents, perks, slots, price_updated_by, price_updated_at, value_model, compensation)
          values (v_id, p_agency, v_pos, v_tname, case when v_admin then v_tprice end, v_tperks, v_tslots,
                  case when v_admin and v_tprice is not null then auth.uid() end, case when v_admin and v_tprice is not null then now() end,
                  case when v_admin then coalesce(v_tmodel, 'por_marca') else 'por_marca' end, coalesce(v_tcomp, '{"money": true, "barter": null, "performance": null}'::jsonb))
          returning id into v_tier_id;
        end if;
        v_keep := v_keep || v_tier_id;
      end loop;
      -- cota com proposta (de qualquer situação) não sai
      if exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep))
                 and exists (select 1 from public.sponsorship_proposals q where q.tier_id = t.id)) then
        raise exception 'invalid_state' using errcode = 'P0001';
      end if;
      delete from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep));
    elsif not exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id) then
      insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, perks, slots) values (v_id, p_agency, 1, 'Cota única', v_perks, 1);
    end if;
  exception when check_violation or not_null_violation or unique_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_audience = 'selected' then
    delete from public.sponsorship_targets g where g.opportunity_id = v_id and not (g.brand_id = any (v_brands));
    insert into public.sponsorship_targets (opportunity_id, brand_id, agency_id) select v_id, b, p_agency from unnest(v_brands) b
    on conflict (opportunity_id, brand_id) do nothing;
  else
    delete from public.sponsorship_targets g where g.opportunity_id = v_id;
  end if;
  perform public.sponsorship_sync_event(v_id);
  perform public.audit_log('sponsorship.save', 'sponsorship', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('agency_id', p_agency, 'talent_id', v_before.talent_id, 'starts_at', v_before.starts_at,
      'respond_by', v_before.respond_by, 'audience', v_before.audience) end,
    jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent, 'starts_at', v_start, 'respond_by', v_respond, 'audience', v_audience,
      'brands', case when v_audience = 'selected' then to_jsonb(v_brands) else null end,
      'tiers', (select count(*) from public.sponsorship_tiers t where t.opportunity_id = v_id), 'status', v_status), null,
    public.talent_audit_actor('agency', p_agency));
  if v_status = 'open' and (v_before.id is null or v_before.status = 'draft') then
    perform public.audit_log('sponsorship.publish', 'sponsorship', v_id::text, null, jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent), null,
      public.talent_audit_actor('agency', p_agency));
  end if;
  perform public.sponsorship_notify_audience(v_id);
  return v_id;
end $function$;
revoke execute on function public.agency_sponsorship_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.agency_sponsorship_save(uuid, uuid, jsonb) to authenticated, service_role;

drop function if exists public.brand_sponsorship_propose(uuid, uuid, uuid, text, bigint, text[], text, jsonb);
CREATE OR REPLACE FUNCTION public.brand_sponsorship_propose(p_id uuid, p_brand uuid, p_tier uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text, p_audience jsonb, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.sponsorship_opportunities%rowtype; t public.sponsorship_tiers%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_id uuid; v_round uuid; v_label text; v_audience jsonb; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.sponsorship_brand_in_audience(p_id, p_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.sponsorship_tiers where id = p_tier and opportunity_id = p_id;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept_asked', 'propose') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_audience := public.sponsorship_audience_clean(p_audience);
  if o.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if o.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = p_id and q.brand_id = p_brand and q.status = 'agreed') then
    raise exception 'already_agreed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = p_id and q.brand_id = p_brand and q.status in ('draft', 'open')) then
    raise exception 'already_negotiating' using errcode = 'P0001';
  end if;
  if public.sponsorship_tier_agreed(t.id) >= t.slots then raise exception 'tier_full' using errcode = 'P0001'; end if;
  if p_action = 'accept_asked' then
    -- 0108: por marca = o valor pedido; fixo do evento = a parte que falta ÷ vagas que sobram
    -- 0140: aceitar a cota como ela é = a forma de pagamento da cota (sem dinheiro, sem valor)
    v_comp := t.compensation;
    if public.compensation_money(v_comp) then
      v_amount := public.sponsorship_tier_ask(t.id);
      if v_amount is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    end if;
    v_perks := t.perks;
    if cardinality(v_perks) = 0 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  else
    -- 0140: a marca diz como paga (sem informar, a forma da cota); sem dinheiro, sem valor
    v_comp := case when p_compensation is null then t.compensation else public.compensation_clean(p_compensation) end;
    v_amount := case when public.compensation_money(v_comp) then p_amount_cents end;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks, v_comp);
    -- 0108: no valor fixo do evento a marca diz quanto cobre (até o total da cota)
    if t.value_model = 'fixo' and t.price_cents is not null and v_amount > t.price_cents then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  v_label := public.actor_label(o.agency_id, p_brand);
  insert into public.sponsorship_proposals (opportunity_id, tier_id, agency_id, brand_id, status, asked_cents, amount_cents, perks, created_by, compensation)
  values (p_id, t.id, o.agency_id, p_brand, 'draft', public.sponsorship_tier_ask(t.id), v_amount, v_perks, auth.uid(), v_comp)
  returning id into v_id;
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, audience, note, state, actor_id, actor_label, compensation)
  values (v_id, p_id, o.agency_id, p_brand, 1, 'brand', p_action, v_amount, v_perks, v_audience, v_note, case when v_role = 'owner' then 'sent' else 'pending_owner' end,
          auth.uid(), v_label, v_comp)
  returning id into v_round;
  perform public.audit_log('sponsorship.propose', 'sponsorship', p_id::text, null,
    jsonb_build_object('agency_id', o.agency_id, 'brand_id', p_brand, 'proposal_id', v_id, 'tier_id', t.id, 'action', p_action, 'pending_owner', v_role <> 'owner'),
    nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' then
    perform public.sponsorship_round_apply(v_round);
  else
    perform public.sponsorship_negotiation_notify(v_id, 'brand_owners', 'approval', 'sponsor-approval:' || v_round::text);
  end if;
  return v_id;
end $function$;
revoke execute on function public.brand_sponsorship_propose(uuid, uuid, uuid, text, bigint, text[], text, jsonb, jsonb) from public, anon;
grant execute on function public.brand_sponsorship_propose(uuid, uuid, uuid, text, bigint, text[], text, jsonb, jsonb) to authenticated, service_role;

drop function if exists public.brand_sponsorship_reply(uuid, text, bigint, text[], text, jsonb);
CREATE OR REPLACE FUNCTION public.brand_sponsorship_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text, p_audience jsonb, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_round uuid; v_seq int; v_audience jsonb; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.sponsorship_proposals where id = p_proposal for update;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(p.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into o from public.sponsorship_opportunities where id = p.opportunity_id;
  if p.status <> 'open' or p.awaiting <> 'brand' or o.decided_at is not null or o.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sponsorship_rounds r where r.proposal_id = p.id and r.state = 'pending_owner') then
    raise exception 'awaiting_approval' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    v_comp := case when p_compensation is null then p.compensation else public.compensation_clean(p_compensation) end;
    v_amount := case when public.compensation_money(v_comp) then p_amount_cents end;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks, v_comp);
    v_audience := public.sponsorship_audience_clean(p_audience);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_perks := p.perks; v_comp := p.compensation;
    if public.sponsorship_tier_agreed(p.tier_id) >= (select t.slots from public.sponsorship_tiers t where t.id = p.tier_id) then
      raise exception 'tier_full' using errcode = 'P0001';
    end if;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.sponsorship_rounds r where r.proposal_id = p.id;
  -- recusar não compromete dinheiro: a equipe recusa direto; aceitar e contrapropor pela equipe esperam o dono
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, audience, note, state, actor_id, actor_label, compensation)
  values (p.id, p.opportunity_id, p.agency_id, p.brand_id, v_seq, 'brand', p_action, v_amount, v_perks, v_audience, v_note,
          case when v_role = 'owner' or p_action = 'decline' then 'sent' else 'pending_owner' end, auth.uid(), public.actor_label(p.agency_id, p.brand_id), coalesce(v_comp, '{"money": true, "barter": null, "performance": null}'::jsonb))
  returning id into v_round;
  perform public.audit_log('sponsorship.brand_reply', 'sponsorship', p.opportunity_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'brand_id', p.brand_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' or p_action = 'decline' then
    return public.sponsorship_round_apply(v_round);
  end if;
  perform public.sponsorship_negotiation_notify(p.id, 'brand_owners', 'approval', 'sponsor-approval:' || v_round::text);
  return 'pending_owner';
end $function$;
revoke execute on function public.brand_sponsorship_reply(uuid, text, bigint, text[], text, jsonb, jsonb) from public, anon;
grant execute on function public.brand_sponsorship_reply(uuid, text, bigint, text[], text, jsonb, jsonb) to authenticated, service_role;

drop function if exists public.agency_sponsorship_reply(uuid, text, bigint, text[], text);
CREATE OR REPLACE FUNCTION public.agency_sponsorship_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text, p_compensation jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_round uuid; v_seq int; v_comp jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.sponsorship_proposals where id = p_proposal for update;
  if p.id is null or p.sent_at is null or not public.agency_can(p.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_action = 'decline' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into o from public.sponsorship_opportunities where id = p.opportunity_id;
  if p.status <> 'open' or p.awaiting <> 'agency' or o.decided_at is not null or o.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    v_comp := case when p_compensation is null then p.compensation else public.compensation_clean(p_compensation) end;
    v_amount := case when public.compensation_money(v_comp) then p_amount_cents end;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks, v_comp);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_perks := p.perks; v_comp := p.compensation;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.sponsorship_rounds r where r.proposal_id = p.id;
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, note, state, actor_id, actor_label, compensation)
  values (p.id, p.opportunity_id, p.agency_id, p.brand_id, v_seq, 'agency', p_action, v_amount, v_perks, v_note, 'sent', auth.uid(), public.actor_label(p.agency_id, null), coalesce(v_comp, '{"money": true, "barter": null, "performance": null}'::jsonb))
  returning id into v_round;
  perform public.audit_log('sponsorship.agency_reply', 'sponsorship', p.opportunity_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'brand_id', p.brand_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''),
    public.talent_audit_actor('agency', p.agency_id));
  return public.sponsorship_round_apply(v_round);
end $function$;
revoke execute on function public.agency_sponsorship_reply(uuid, text, bigint, text[], text, jsonb) from public, anon;
grant execute on function public.agency_sponsorship_reply(uuid, text, bigint, text[], text, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sponsorship_round_apply(p_round uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.sponsorship_rounds%rowtype; p public.sponsorship_proposals%rowtype; v_other text;
begin
  select * into r from public.sponsorship_rounds where id = p_round;
  select * into p from public.sponsorship_proposals where id = r.proposal_id for update;
  update public.sponsorship_rounds set state = 'sent' where id = r.id;
  v_other := case when r.side = 'brand' then 'agency' else 'brand' end;
  -- a marca entrou na negociação: a resposta dela vira "quer patrocinar" (a agência vê no painel)
  if r.side = 'brand' and r.action <> 'decline' then
    insert into public.sponsorship_responses (opportunity_id, agency_id, brand_id, response, message, responded_by, responded_label)
    values (p.opportunity_id, p.agency_id, p.brand_id, 'interested', left(r.note, 500), r.actor_id, r.actor_label)
    on conflict (opportunity_id, brand_id) do update set response = 'interested', responded_by = excluded.responded_by,
      responded_label = excluded.responded_label, responded_at = now()
      where public.sponsorship_responses.response = 'declined';
  end if;
  if r.action = 'decline' then
    update public.sponsorship_proposals set status = 'declined', awaiting = null, ended_at = now(),
      end_reason = case when r.side = 'brand' then 'declined_brand' else 'declined_agency' end, rounds = rounds + 1
    where id = p.id;
    perform public.sponsorship_negotiation_notify(p.id, v_other, 'declined', 'sponsor-round:' || r.id::text);
    return 'declined';
  end if;
  update public.sponsorship_proposals set amount_cents = r.amount_cents, perks = r.perks, compensation = r.compensation, rounds = rounds + 1, sent_at = coalesce(sent_at, now()),
    status = 'open', awaiting = v_other
  where id = p.id;
  if r.action in ('accept_asked', 'accept') then
    perform public.sponsorship_agree(p.id, r.side);
    return 'agreed';
  end if;
  perform public.sponsorship_negotiation_notify(p.id, v_other, case when r.action = 'propose' then 'proposed' else 'countered' end, 'sponsor-round:' || r.id::text);
  return 'open';
end $function$;
revoke execute on function public.sponsorship_round_apply(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_round_apply(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.sponsorship_agree(p_proposal uuid, p_side text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype; t public.sponsorship_tiers%rowtype;
        x public.sponsorship_responses%rowtype; v_request uuid; v_status text; v_notes text; v_brand_name text; r record; v_agreed int; v_audience jsonb;
begin
  select * into p from public.sponsorship_proposals where id = p_proposal for update;
  select * into t from public.sponsorship_tiers where id = p.tier_id for update;
  select * into o from public.sponsorship_opportunities where id = p.opportunity_id;
  if public.sponsorship_tier_agreed(t.id) >= t.slots then raise exception 'tier_full' using errcode = 'P0001'; end if;
  update public.sponsorship_proposals set status = 'agreed', awaiting = null, agreed_cents = amount_cents, agreed_perks = perks, agreed_compensation = compensation, agreed_side = p_side,
    agreed_at = now(), sent_at = coalesce(sent_at, now())
  where id = p.id returning * into p;
  -- acordo conta como vencedora (a resposta da 0085 vira interesse, se ainda não era)
  select * into x from public.sponsorship_responses where opportunity_id = o.id and brand_id = p.brand_id for update;
  if x.id is null then
    insert into public.sponsorship_responses (opportunity_id, agency_id, brand_id, response, responded_by, responded_label, outcome, decided_at)
    values (o.id, o.agency_id, p.brand_id, 'interested', p.created_by,
            coalesce((select left(bm.display_name, 80) from public.brand_members bm where bm.brand_id = p.brand_id and bm.user_id = p.created_by), ''), 'won', now())
    returning * into x;
  else
    update public.sponsorship_responses set response = 'interested', outcome = 'won', decided_at = now() where id = x.id returning * into x;
  end if;
  -- campanha: atualiza o rascunho que já existe (0085) ou cria um novo; contrapartidas no checklist, cota nas notas
  v_notes := left(concat_ws(E'\n',
    'Patrocínio acordado: ' || o.title || ' — cota ' || t.name,
    case when o.expected_reach <> '' then 'Alcance esperado: ' || o.expected_reach end,
    'Contrapartidas acordadas: ' || array_to_string(p.agreed_perks, '; '),
    case when o.description <> '' then o.description end), 2000);
  -- público: o último indicado pela marca nesta negociação, senão o do evento
  select r2.audience into v_audience from public.sponsorship_rounds r2 where r2.proposal_id = p.id and r2.state = 'sent' and r2.audience is not null
  order by r2.seq desc limit 1;
  v_audience := coalesce(v_audience, jsonb_build_object('target_audience', o.target_audience, 'target_age_bands', to_jsonb(o.target_age_bands),
                                                        'target_states', to_jsonb(o.target_states), 'region_note', o.region_note));
  select c.status into v_status from public.campaign_requests c where c.id = coalesce(p.request_id, x.request_id);
  if v_status = 'draft' then
    v_request := coalesce(p.request_id, x.request_id);
    update public.campaign_requests c set brief = (case when jsonb_typeof(c.brief) = 'object' then c.brief else '{}'::jsonb end) || jsonb_build_object('checks', to_jsonb(p.agreed_perks)),
      notes = v_notes, approval_status = case when c.approval_status = 'returned' then 'none' else c.approval_status end,
      target_audience = case when c.target_audience = '' then left(coalesce(v_audience ->> 'target_audience', ''), 500) else c.target_audience end,
      target_age_bands = case when cardinality(c.target_age_bands) = 0
        then coalesce((select array_agg(z) from jsonb_array_elements_text(coalesce(v_audience -> 'target_age_bands', '[]')) z), '{}'::text[]) else c.target_age_bands end,
      target_states = case when cardinality(c.target_states) = 0
        then coalesce((select array_agg(z) from jsonb_array_elements_text(coalesce(v_audience -> 'target_states', '[]')) z), '{}'::text[]) else c.target_states end,
      region_note = case when c.region_note = '' then left(coalesce(v_audience ->> 'region_note', ''), 200) else c.region_note end
    where c.id = v_request;
  elsif v_status is not null and v_status <> 'cancelled' then
    v_request := coalesce(p.request_id, x.request_id);   -- já enviada: segue no pipeline; só o valor oferecido é atualizado
  else
    v_request := public.sponsorship_campaign_draft(o.id, p.brand_id, coalesce(p.created_by, auth.uid()), p.agreed_perks, v_notes, v_audience);
  end if;
  -- 0140: a campanha herda a forma de pagamento acordada (sem dinheiro: sem valor, modelo fixo)
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by, value_model, max_heroes, compensation)
  values (o.agency_id, p.brand_id, v_request, p.agreed_cents, p.agreed_cents, left('Patrocínio acordado — cota ' || t.name, 300), auth.uid(), 'fixo', null, p.agreed_compensation)
  on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
    note = excluded.note, updated_by = excluded.updated_by, value_model = excluded.value_model, max_heroes = excluded.max_heroes,
    compensation = excluded.compensation;
  -- campanha já enviada (negócio existe): o negócio passa a ter a forma acordada
  update public.deals set compensation = p.agreed_compensation where request_id = v_request and p.agreed_compensation is not null;
  update public.sponsorship_proposals set request_id = v_request where id = p.id;
  update public.sponsorship_responses set request_id = v_request where id = x.id;
  perform public.audit_log('sponsorship.agree', 'sponsorship', o.id::text, null,
    jsonb_build_object('agency_id', o.agency_id, 'brand_id', p.brand_id, 'proposal_id', p.id, 'tier_id', t.id, 'side', p_side, 'request_id', v_request),
    null, case when p_side = 'agency' then public.talent_audit_actor('agency', o.agency_id) else 'brand'::public.actor_type end);
  -- avisos: a outra parte; o creator (patrocinada por esta marca)
  perform public.sponsorship_negotiation_notify(p.id, case when p_side = 'agency' then 'brand' else 'agency' end, 'agreed', 'sponsor-agreed:' || p.id::text);
  select b.name into v_brand_name from public.brands b where b.id = p.brand_id;
  perform public.inbox_notify(public.talent_user_id(o.talent_id), 'sponsorship_decided', '/creator/escritorio/agenda',
    jsonb_build_object('title', left(o.title, 120), 'status', 'sponsored', 'brand', left(coalesce(v_brand_name, ''), 120)),
    o.agency_id, 'sponsorship', o.id, 'sponsor-agreed:' || p.id::text || ':talent');
  -- cota esgotada: as outras propostas vivas dela são encerradas (com aviso)
  v_agreed := public.sponsorship_tier_agreed(t.id);
  if v_agreed >= t.slots then
    for r in update public.sponsorship_proposals q set status = 'closed', awaiting = null, ended_at = now(), end_reason = 'tier_full'
             where q.tier_id = t.id and q.status in ('draft', 'open') returning q.id loop
      perform public.sponsorship_negotiation_notify(r.id, 'brand', 'closed', 'sponsor-closed:' || r.id::text);
    end loop;
  end if;
  -- todas as cotas esgotadas: patrocinada (mesmo caminho da decisão)
  if o.decided_at is null and not exists (select 1 from public.sponsorship_tiers z where z.opportunity_id = o.id and public.sponsorship_tier_agreed(z.id) < z.slots) then
    perform public.sponsorship_close_out(o.id, 'sponsor',
      (select array_agg(distinct q.brand_id) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'agreed'), '',
      case when p_side = 'agency' then public.talent_audit_actor('agency', o.agency_id) else 'brand'::public.actor_type end);
  end if;
end $function$;
revoke execute on function public.sponsorship_agree(uuid, text) from public, anon, authenticated;
grant execute on function public.sponsorship_agree(uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.agency_sponsorship_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.sponsorship_opportunities%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not public.agency_can(o.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(o.agency_id, 'admin');
  return jsonb_build_object(
    'can_values', v_admin,
    'opportunity', jsonb_build_object('id', o.id, 'agency_id', o.agency_id, 'talent_id', o.talent_id,
      'talent_name', (select t.display_name from public.talent_profiles t where t.id = o.talent_id),
      'hero', public.sponsorship_hero_json(o.talent_id, false),
      'title', o.title, 'description', o.description, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day,
      'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks), 'networks', to_jsonb(o.networks), 'respond_by', o.respond_by,
      'audience', o.audience, 'status', o.status, 'closed_reason', o.closed_reason, 'decision_note', o.decision_note, 'decided_at', o.decided_at,
      'decided_label', (select m.display_name from public.agency_members m where m.agency_id = o.agency_id and m.user_id = o.decided_by),
      'created_at', o.created_at, 'public', public.sponsorship_public_json(o.id),
      'target_ids', (select coalesce(jsonb_agg(g.brand_id), '[]'::jsonb) from public.sponsorship_targets g where g.opportunity_id = o.id)),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'position', z.position, 'name', z.name, 'perks', to_jsonb(z.perks), 'slots', z.slots,
        'price_cents', case when v_admin then z.price_cents end, 'has_price', z.price_cents is not null,
        'value_model', z.value_model, 'ask_cents', case when v_admin then public.sponsorship_tier_ask(z.id) end,
        'covered_cents', case when v_admin then public.sponsorship_tier_covered(z.id) end,
        'agreed', public.sponsorship_tier_agreed(z.id),
        'has_proposals', exists (select 1 from public.sponsorship_proposals q where q.tier_id = z.id),
        'compensation', case when v_admin then z.compensation else public.compensation_public(z.compensation) end) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'brand_id', q.brand_id, 'brand_name', b.name, 'tier_id', q.tier_id,
        'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting, 'perks', to_jsonb(q.perks), 'rounds', q.rounds,
        'asked_cents', case when v_admin then q.asked_cents end, 'amount_cents', case when v_admin then q.amount_cents end,
        'agreed_cents', case when v_admin then q.agreed_cents end, 'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id,
        'compensation', case when v_admin then q.compensation else public.compensation_public(q.compensation) end,
        'agreed_compensation', case when v_admin then q.agreed_compensation else public.compensation_public(q.agreed_compensation) end,
        'history', public.sponsorship_rounds_json(q.id, v_admin, true))
      order by (q.status = 'open' and q.awaiting = 'agency') desc, (q.status = 'open') desc, q.sent_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.sent_at is not null),
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand_id', b.id, 'name', b.name, 'response', r.response, 'message', coalesce(r.message, ''),
        'responded_label', coalesce(r.responded_label, ''), 'responded_at', r.responded_at, 'outcome', r.outcome, 'request_id', r.request_id,
        'request_status', c.status, 'deal_id', d.id)
      order by case r.response when 'interested' then 0 when 'declined' then 2 else 1 end, r.responded_at, b.name), '[]'::jsonb)
      from (select distinct x as brand_id from public.sponsorship_audience_brands(o.id) x) s
      join public.brands b on b.id = s.brand_id
      left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = b.id
      left join public.campaign_requests c on c.id = r.request_id
      left join public.deals d on d.request_id = c.id));
end $function$;
revoke execute on function public.agency_sponsorship_detail(uuid) from public, anon;
grant execute on function public.agency_sponsorship_detail(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agency_sponsorships(p_agency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'talent_id', o.talent_id, 'talent_name', t.display_name, 'hero', public.sponsorship_hero_json(o.talent_id, false),
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'location', o.location, 'respond_by', o.respond_by,
      'status', o.status, 'closed_reason', o.closed_reason, 'audience', o.audience, 'decided_at', o.decided_at,
      'audience_count', (select count(*) from public.sponsorship_audience_brands(o.id)),
      'interested', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'interested'),
      'declined', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'declined'),
      'negotiating', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'open'),
      'awaiting_agency', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'open' and q.awaiting = 'agency'),
      'agreed', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'agreed'),
      'tiers', (select count(*) from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'missing_price', (select count(*) from public.sponsorship_tiers z where z.opportunity_id = o.id and z.price_cents is null and public.compensation_money(z.compensation)),
      'winners', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb) from public.sponsorship_responses r join public.brands b on b.id = r.brand_id
                  where r.opportunity_id = o.id and r.outcome = 'won'))
    order by (o.status = 'open') desc, (o.status = 'draft') desc, o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o join public.talent_profiles t on t.id = o.talent_id
    where o.agency_id = p_agency);
end $function$;
revoke execute on function public.agency_sponsorships(uuid) from public, anon;
grant execute on function public.agency_sponsorships(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_sponsorships(p_brand uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'description', o.description, 'location', o.location,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'networks', to_jsonb(o.networks), 'respond_by', o.respond_by, 'public', public.sponsorship_public_json(o.id),
      'status', case when o.status = 'cancelled' then 'cancelled'
                     when r.outcome = 'won' then 'won'
                     when o.status in ('sponsored', 'closed') then 'closed'
                     when o.respond_by < now() then 'expired' else 'open' end,
      'agency_name', (select a.name from public.agencies a where a.id = o.agency_id),
      'timezone', (select a.timezone from public.agencies a where a.id = o.agency_id),
      'talent', (select jsonb_build_object('id', t.id, 'name', t.display_name, 'in_catalog', public.talent_brand_card_ok(t.id, o.agency_id),
                   'photo_url', case when public.talent_brand_card_ok(t.id, o.agency_id) then public.talent_public_card(t.id) ->> 'photo_url' end)
                 from public.talent_profiles t where t.id = o.talent_id),
      'hero', public.sponsorship_hero_json(o.talent_id, true),
      'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
                  'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots,
                  'value_model', z.value_model, 'ask_cents', public.sponsorship_tier_ask(z.id), 'compensation', z.compensation) order by z.position), '[]'::jsonb)
                from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'negotiation', (select jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting, 'tier_name', z.name,
                        'pending_owner', exists (select 1 from public.sponsorship_rounds x where x.proposal_id = q.id and x.state = 'pending_owner'))
                      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
                      where q.opportunity_id = o.id and q.brand_id = p_brand order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc limit 1),
      'my_response', case when r.id is null then null else jsonb_build_object('response', r.response, 'message', r.message, 'responded_label', r.responded_label,
        'responded_at', r.responded_at, 'request_id', r.request_id, 'outcome', r.outcome) end)
    order by (o.status = 'open' and o.respond_by >= now()) desc, o.starts_at), '[]'::jsonb)
    from public.sponsorship_opportunities o
    left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = p_brand
    where public.sponsorship_brand_in_audience(o.id, p_brand) or r.id is not null);
end $function$;
revoke execute on function public.brand_sponsorships(uuid) from public, anon;
grant execute on function public.brand_sponsorships(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_sponsorship_negotiation(p_id uuid, p_brand uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.sponsorship_opportunities%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not (public.sponsorship_brand_in_audience(p_id, p_brand)
                          or exists (select 1 from public.sponsorship_responses r where r.opportunity_id = p_id and r.brand_id = p_brand)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'role', v_role,
    'can_propose', o.status = 'open' and o.respond_by >= now()
      and not exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = o.id and q.brand_id = p_brand and q.status in ('draft', 'open', 'agreed')),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
        'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots,
        'value_model', z.value_model, 'ask_cents', public.sponsorship_tier_ask(z.id), 'compensation', z.compensation) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'tier_id', q.tier_id, 'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting,
        'asked_cents', q.asked_cents, 'amount_cents', q.amount_cents, 'perks', to_jsonb(q.perks), 'agreed_cents', q.agreed_cents,
        'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side, 'agreed_at', q.agreed_at, 'ended_at', q.ended_at,
        'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id, 'created_at', q.created_at,
        'compensation', q.compensation, 'agreed_compensation', q.agreed_compensation,
        'history', public.sponsorship_rounds_json(q.id, true, false))
      order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.brand_id = p_brand));
end $function$;
revoke execute on function public.brand_sponsorship_negotiation(uuid, uuid) from public, anon;
grant execute on function public.brand_sponsorship_negotiation(uuid, uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sponsorship_rounds_json(p_proposal uuid, p_values boolean, p_sent_only boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
      'amount_cents', case when p_values then r.amount_cents end, 'perks', to_jsonb(r.perks), 'audience', r.audience, 'note', r.note, 'state', r.state,
      'actor_label', r.actor_label, 'created_at', r.created_at, 'reviewed_label', r.reviewed_label, 'reviewed_at', r.reviewed_at,
      'review_note', r.review_note,
      'compensation', case when p_values then r.compensation else public.compensation_public(r.compensation) end) order by r.seq), '[]'::jsonb)
  from public.sponsorship_rounds r where r.proposal_id = p_proposal and (not p_sent_only or r.state = 'sent')
$function$;
revoke execute on function public.sponsorship_rounds_json(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.sponsorship_rounds_json(uuid, boolean, boolean) to service_role;

CREATE OR REPLACE FUNCTION public.talent_sponsorships()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_talent uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at,
      'all_day', o.all_day, 'respond_by', o.respond_by, 'status', o.status, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'public', public.sponsorship_public_json(o.id),
      'sponsors', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb)
                   from public.sponsorship_responses r join public.brands b on b.id = r.brand_id where r.opportunity_id = o.id and r.outcome = 'won'),
      'agreements', (select coalesce(jsonb_agg(jsonb_build_object('brand', b.name, 'tier', z.name, 'perks', to_jsonb(q.agreed_perks),
                       'compensation', public.compensation_public(q.agreed_compensation)) order by q.agreed_at), '[]'::jsonb)
                     from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
                     where q.opportunity_id = o.id and q.status = 'agreed'))
    order by o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o where o.talent_id = v_talent and o.status not in ('cancelled', 'draft'));
end $function$;
revoke execute on function public.talent_sponsorships() from public, anon;
grant execute on function public.talent_sponsorships() to authenticated, service_role;

-- 6b) Hero: a forma de pagamento do negócio (sem números) na oportunidade dele ----------------------------------------
CREATE OR REPLACE FUNCTION public.talent_opportunities(p_deal_talent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_talent uuid := public.my_talent_id();
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', dt.id, 'status', dt.status, 'consulted_at', dt.consulted_at, 'respond_by', dt.respond_by, 'responded_at', dt.responded_at,
      'response_note', dt.response_note, 'terms_ready', dt.terms_ready,
      'deal', jsonb_build_object('id', d.id, 'title', d.title, 'talent_brief', d.talent_brief, 'expected_start', d.expected_start, 'expected_end', d.expected_end,
        'status', case when d.stage = 'closed' then coalesce(d.outcome, 'cancelled') when public.deal_stage_index(d.stage) >= 10 then 'running'
                       when public.deal_stage_index(d.stage) >= 8 then 'confirmed' else 'open' end,
        'confirmed_at', d.confirmed_at, 'compensation', public.compensation_public(d.compensation)),
      'request', case when r.id is null then null else jsonb_build_object('objective', r.objective, 'product', r.product, 'desired_at', r.desired_at,
        'duration_minutes', r.duration_minutes, 'format', r.format, 'location', r.location, 'networks', to_jsonb(r.networks), 'deliverables', r.deliverables,
        'notes', case when r.origin = 'brand' then r.notes else '' end, 'brief', r.brief) end,
      'brand', jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url),
      'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'network', x.network, 'title', x.title, 'brief', x.brief,
          'due_at', x.due_at, 'publish_at', x.publish_at, 'status', x.status) order by x.due_at nulls last), '[]')
        from public.deliverables x where x.deal_talent_id = dt.id and x.status <> 'cancelled')
    ) order by dt.consulted_at desc), '[]'::jsonb)
    from public.deal_talents dt
    join public.deals d on d.id = dt.deal_id
    join public.brands b on b.id = d.brand_id
    left join public.campaign_requests r on r.id = d.request_id
    where dt.talent_id = v_talent and dt.consulted_at is not null and dt.status <> 'removed' and (p_deal_talent is null or dt.id = p_deal_talent));
end $function$;
revoke execute on function public.talent_opportunities(uuid) from public, anon;
grant execute on function public.talent_opportunities(uuid) to authenticated, service_role;

-- 7) projeção (0139): dinheiro como antes + permuta e performance estimadas à parte -----------------------------------
-- Dinheiro (fechado / em negociação / aberto) só onde a forma de pagamento tem dinheiro. Permuta e performance entram
-- pelo valor estimado (total do negócio, da proposta ou da chamada; na cota de patrocínio, por marca × vagas livres),
-- somando fechado + em negociação + aberto. No negócio, a estimativa se divide entre os Heros ativos (para "para você"
-- e "no seu segmento"). Cotas: as vagas livres descontam acordos E propostas em negociação (antes contavam duas vezes),
-- e na cota de valor fixo do evento o aberto é o que falta cobrir (o preço já é o total da cota). Sem contar duas vezes:
-- negócio que nasceu de patrocínio acordado não repete a permuta/performance do acordo, e chamada com acordo sai do
-- "aberto" (o acordado segue para o negócio).
create or replace function public.campaign_projection(p_agency uuid default null, p_year int default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_member boolean := p_agency is not null; v_admin boolean := false; v_talents uuid[]; v_seg text[];
        v_from date; v_to date; v_pref uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_member then
    if not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    v_admin := public.agency_can(p_agency, 'admin');
  end if;
  if p_year is not null then
    if p_year not between 2000 and 2100 then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_from := make_date(p_year, 1, 1);
    v_to := make_date(p_year + 1, 1, 1);
  end if;

  -- "para você": na agência, os Heros que a pessoa cuida; fora dela, os talentos da própria conta (o Hero)
  if v_member then
    select coalesce(array_agg(t.id), '{}') into v_talents from public.talent_profiles t
    where t.agency_id = p_agency and t.manager_id = auth.uid() and t.archived_at is null;
  else
    select coalesce(array_agg(t.id), '{}') into v_talents from public.talent_profiles t
    left join public.creator_profiles c on c.id = t.creator_id
    where t.user_id = auth.uid() or c.user_id = auth.uid();
    if cardinality(v_talents) = 0 then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  v_pref := coalesce(p_agency, (select t.agency_id from public.talent_profiles t where t.id = any (v_talents) order by t.created_at limit 1));

  select coalesce(array_agg(distinct public.projection_key(s.name)), '{}') into v_seg
  from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
  where l.talent_id = any (v_talents) and s.active;
  if v_member and cardinality(v_seg) = 0 then
    select coalesce(array_agg(distinct public.projection_key(s.name)), '{}') into v_seg
    from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
    join public.talent_profiles t on t.id = l.talent_id
    where t.agency_id = p_agency and t.archived_at is null and s.active;
  end if;

  with seg as (
    select l.talent_id, array_agg(distinct public.projection_key(s.name)) as keys
    from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
    group by l.talent_id
  ), tier_load as (
    -- cotas de oportunidades abertas: vagas livres = vagas − acordos − propostas em negociação
    select tr.id, tr.price_cents, tr.value_model, tr.compensation, o.talent_id, o.agency_id,
           coalesce(o.starts_at::date, o.respond_by::date, o.created_at::date) as day,
           greatest(tr.slots - count(q.id) filter (where q.status in ('agreed', 'open')), 0)::bigint as free,
           coalesce(sum(q.agreed_cents) filter (where q.status = 'agreed'), 0) + coalesce(sum(q.amount_cents) filter (where q.status = 'open'), 0) as taken
    from public.sponsorship_tiers tr join public.sponsorship_opportunities o on o.id = tr.opportunity_id
    left join public.sponsorship_proposals q on q.tier_id = tr.id
    where o.status = 'open'
    group by tr.id, o.id
  ), deal_est as (
    select d.id, d.agency_id, d.owner_id,
           case when d.outcome = 'won' then coalesce(d.expected_start::date, d.closed_at::date, d.created_at::date)
                else coalesce(d.expected_start::date, d.created_at::date) end as day,
           public.compensation_barter_cents(d.compensation) as barter, public.compensation_perf_cents(d.compensation) as perf
    from public.deals d
    where not d.is_demo and (d.outcome = 'won' or d.outcome is null)
      and public.compensation_barter_cents(d.compensation) + public.compensation_perf_cents(d.compensation) > 0
      -- negócio de patrocínio acordado: a permuta/performance já conta no acordo (abaixo)
      and not exists (select 1 from public.sponsorship_proposals q where q.request_id = d.request_id and q.status = 'agreed')
  ), deal_people as (
    -- estimativa do negócio dividida entre os Heros ativos (sem Hero: uma linha sem Hero)
    select e.*, h.talent_id, count(*) over (partition by e.id) as n, row_number() over (partition by e.id order by h.talent_id) as rn
    from deal_est e
    left join lateral (select dt.talent_id from public.deal_talents dt where dt.deal_id = e.id and dt.status not in ('removed', 'declined')) h on true
  ), items as (
    -- negócios fechados (ganhos), com dinheiro
    select 'won'::text as bucket, f.fee_cents::bigint as cents,
           coalesce(d.expected_start::date, d.closed_at::date, d.created_at::date) as day,
           f.talent_id, d.agency_id, d.owner_id, g.keys
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id left join seg g on g.talent_id = f.talent_id
    where not d.is_demo and public.compensation_money(d.compensation) and d.outcome = 'won'
    union all
    -- negócios em negociação, com dinheiro
    select 'open', f.fee_cents::bigint, coalesce(d.expected_start::date, d.created_at::date), f.talent_id, d.agency_id, d.owner_id, g.keys
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id left join seg g on g.talent_id = f.talent_id
    where not d.is_demo and public.compensation_money(d.compensation) and d.outcome is null
    union all
    -- negócios: permuta e performance estimadas
    select 'barter', p.barter / p.n + case when p.rn = 1 then p.barter % p.n else 0 end, p.day, p.talent_id, p.agency_id, p.owner_id, g.keys
    from deal_people p left join seg g on g.talent_id = p.talent_id where p.barter > 0
    union all
    select 'performance', p.perf / p.n + case when p.rn = 1 then p.perf % p.n else 0 end, p.day, p.talent_id, p.agency_id, p.owner_id, g.keys
    from deal_people p left join seg g on g.talent_id = p.talent_id where p.perf > 0
    union all
    -- patrocínio fechado: valor acordado e estimativas do acordo
    select x.bucket, x.cents, coalesce(o.starts_at::date, q.agreed_at::date, q.created_at::date), o.talent_id, o.agency_id, null::uuid, g.keys
    from public.sponsorship_proposals q join public.sponsorship_opportunities o on o.id = q.opportunity_id
    left join seg g on g.talent_id = o.talent_id
    cross join lateral (values ('won', q.agreed_cents::bigint), ('barter', public.compensation_barter_cents(q.agreed_compensation)),
                               ('performance', public.compensation_perf_cents(q.agreed_compensation))) x(bucket, cents)
    where q.status = 'agreed'
    union all
    -- patrocínio em negociação
    select x.bucket, x.cents, coalesce(o.starts_at::date, q.created_at::date), o.talent_id, o.agency_id, null::uuid, g.keys
    from public.sponsorship_proposals q join public.sponsorship_opportunities o on o.id = q.opportunity_id
    left join seg g on g.talent_id = o.talent_id
    cross join lateral (values ('open', q.amount_cents::bigint), ('barter', public.compensation_barter_cents(q.compensation)),
                               ('performance', public.compensation_perf_cents(q.compensation))) x(bucket, cents)
    where q.status = 'open' and o.status = 'open'
    union all
    -- cotas ainda livres: por marca = preço × vagas livres; fixo do evento = o que falta cobrir; estimativas por marca × vagas livres
    select x.bucket, x.cents, l.day, l.talent_id, l.agency_id, null::uuid, g.keys
    from tier_load l left join seg g on g.talent_id = l.talent_id
    cross join lateral (values
      ('available', case when not public.compensation_money(l.compensation) or l.price_cents is null or l.free = 0 then 0
                         when l.value_model = 'fixo' then greatest(l.price_cents - l.taken, 0)
                         else l.price_cents * l.free end),
      ('barter', public.compensation_barter_cents(l.compensation) * l.free),
      ('performance', public.compensation_perf_cents(l.compensation) * l.free)) x(bucket, cents)
    union all
    -- chamadas abertas das marcas: verba (por Hero = verba × máximo) e estimativas
    select x.bucket, x.cents, coalesce(c.starts_on::date, c.respond_by::date, c.created_at::date), null::uuid, null::uuid, null::uuid,
           (select array_agg(public.projection_key(n)) from unnest(c.niches) n)
    from public.brand_calls c
    cross join lateral (values
      ('available', case when not public.compensation_money(c.compensation) then 0
                         when c.value_model = 'por_heroi' then c.budget_cents::bigint * coalesce(c.max_heroes, 1) else c.budget_cents::bigint end),
      ('barter', public.compensation_barter_cents(c.compensation)),
      ('performance', public.compensation_perf_cents(c.compensation))) x(bucket, cents)
    -- chamada com acordo: o que foi acordado segue para o negócio (não conta de novo como aberto)
    where c.status = 'open' and not exists (select 1 from public.brand_call_proposals q where q.call_id = c.id and q.status = 'agreed')
  ), scoped as (
    select * from items where coalesce(cents, 0) > 0 and (v_from is null or (day >= v_from and day < v_to))
  ), names as (
    select distinct on (public.projection_key(s.name)) public.projection_key(s.name) as k, s.name
    from public.talent_segments s where s.active
    order by public.projection_key(s.name), (s.agency_id is distinct from v_pref), s.name
  ), per_segment as (
    select k, coalesce(sum(cents) filter (where bucket = 'won'), 0) as won, coalesce(sum(cents) filter (where bucket = 'open'), 0) as open,
           coalesce(sum(cents) filter (where bucket = 'available'), 0) as available,
           coalesce(sum(cents) filter (where bucket = 'barter'), 0) as barter, coalesce(sum(cents) filter (where bucket = 'performance'), 0) as performance
    from scoped, unnest(keys) k where k is not null group by k
  ), buckets as (
    select 'mine' as scope, s.* from scoped s where s.talent_id = any (v_talents) or (v_member and s.agency_id = p_agency and s.owner_id = auth.uid())
    union all select 'segment', s.* from scoped s where s.keys && v_seg
    union all select 'platform', s.* from scoped s
    union all select 'agency', s.* from scoped s where v_admin and s.agency_id = p_agency
  ), totals as (
    select sc.scope, jsonb_build_object(
      'won', coalesce(sum(b.cents) filter (where b.bucket = 'won'), 0), 'open', coalesce(sum(b.cents) filter (where b.bucket = 'open'), 0),
      'available', coalesce(sum(b.cents) filter (where b.bucket = 'available'), 0),
      'barter', coalesce(sum(b.cents) filter (where b.bucket = 'barter'), 0), 'performance', coalesce(sum(b.cents) filter (where b.bucket = 'performance'), 0)) as v
    from (values ('mine'), ('segment'), ('platform'), ('agency')) sc(scope) left join buckets b on b.scope = sc.scope
    group by sc.scope
  )
  select jsonb_build_object(
    'year', p_year,
    'mine', (select v from totals where scope = 'mine'),
    'segment', (select v from totals where scope = 'segment'),
    'platform', (select v from totals where scope = 'platform'),
    'agency', case when v_admin then (select v from totals where scope = 'agency') end,
    'segments', coalesce((select jsonb_agg(jsonb_build_object('name', n.name, 'won', x.won, 'open', x.open, 'available', x.available,
                                                              'barter', x.barter, 'performance', x.performance, 'mine', x.k = any (v_seg))
                                           order by x.won + x.open + x.available desc, x.barter + x.performance desc, n.name)
                          from per_segment x join names n on n.k = x.k), '[]'::jsonb),
    'my_segments', coalesce((select jsonb_agg(n.name order by n.name) from names n where n.k = any (v_seg)), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(y order by y) from (select distinct extract(year from day)::int as y from items
                       where day is not null and coalesce(cents, 0) > 0) z), '[]'::jsonb))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.campaign_projection(uuid, int) from public, anon;
grant execute on function public.campaign_projection(uuid, int) to authenticated, service_role;

notify pgrst, 'reload schema';
