-- 0067 · Gestão P1b: agenda integrada (agência, marca e creator) e feed .ics por pessoa.
-- Idempotente (create if not exists / or replace / drop if exists). Depende da 0066.
--
-- Decisões (spec 5.6 e PROMPT MESTRE, prioridade 1):
--   • uma tabela de eventos por agência (calendar_events). Eventos "de sistema" nascem e se mantêm por gatilho a
--     partir do negócio: campanha confirmada (um evento por creator confirmado, visível à marca e ao creator), prazo
--     de resposta da consulta (só o creator), prazo e publicação de cada entregável. Nada é digitado duas vezes;
--   • eventos manuais (reunião, gravação, outro) são da agência: gestor+ cria; o colaborador só nos negócios dele.
--     Cada evento diz se a marca e/ou o creator veem; a agenda pessoal do creator nunca entra aqui (D11);
--   • data comercial: a agência publica uma oportunidade (ex.: "Dia das Mães: propostas até 20/04") para todas
--     as marcas atendidas ou para uma marca; avisa pelo sino (commercial_date_published);
--   • feed .ics: um token por pessoa (hash no banco, token devolvido uma vez), resolvido pelo service role com
--     as mesmas regras da RLS (a função assume o papel authenticated da pessoa). Sem valores em evento algum.

-- 1) tabela -------------------------------------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint calendar_events_agency_fk references public.agencies (id) on delete cascade,
  kind text not null constraint calendar_events_kind_check check (kind in ('campaign', 'deliverable', 'consult_deadline', 'meeting', 'recording', 'commercial_date', 'other')),
  title text not null constraint calendar_events_title_check check (char_length(btrim(title)) between 1 and 160),
  subtitle text not null default '' constraint calendar_events_subtitle_check check (char_length(subtitle) <= 160),
  description text not null default '' constraint calendar_events_description_check check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '' constraint calendar_events_location_check check (char_length(location) <= 200),
  brand_id uuid constraint calendar_events_brand_fk references public.brands (id) on delete set null,
  deal_id uuid constraint calendar_events_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid constraint calendar_events_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid constraint calendar_events_talent_fk references public.talent_profiles (id) on delete cascade,
  deliverable_id uuid constraint calendar_events_deliverable_fk references public.deliverables (id) on delete cascade,
  source text not null default 'manual' constraint calendar_events_source_check check (source in ('manual', 'system')),
  source_key text constraint calendar_events_source_key_check check (source_key is null or char_length(source_key) <= 120),
  visible_to_brand boolean not null default false,
  visible_to_talent boolean not null default false,
  created_by uuid constraint calendar_events_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_range_check check (ends_at >= starts_at and ends_at - starts_at <= interval '62 days'),
  constraint calendar_events_system_key_check check ((source = 'system') = (source_key is not null)),
  constraint calendar_events_commercial_check check (kind <> 'commercial_date' or (deal_id is null and talent_id is null and visible_to_brand))
);
create unique index if not exists calendar_events_source_key_uq on public.calendar_events (agency_id, source_key) where source_key is not null;
create index if not exists calendar_events_agency_starts_idx on public.calendar_events (agency_id, starts_at);
create index if not exists calendar_events_deal_idx on public.calendar_events (deal_id) where deal_id is not null;
create index if not exists calendar_events_talent_idx on public.calendar_events (talent_id, starts_at) where talent_id is not null;
create index if not exists calendar_events_brand_idx on public.calendar_events (brand_id, starts_at) where brand_id is not null;

-- feed .ics por pessoa (hash do token; o token só volta uma vez)
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique constraint calendar_feeds_user_fk references auth.users (id) on delete cascade,
  token_hash text not null unique constraint calendar_feeds_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_fetched_at timestamptz,
  fetch_count int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['calendar_events', 'calendar_feeds'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
  end loop;
  drop trigger if exists trg_calendar_events_updated on public.calendar_events;
  create trigger trg_calendar_events_updated before update on public.calendar_events for each row execute function public.set_updated_at();
end $$;

-- 2) escopo: tudo o que o evento referencia precisa ser da mesma agência ---------------------------------------------
create or replace function public.fill_event_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid; v_brand uuid; v_talent uuid; v_deal uuid;
begin
  if new.deal_talent_id is not null then
    select dt.deal_id, dt.talent_id into v_deal, v_talent from public.deal_talents dt where dt.id = new.deal_talent_id;
    if v_deal is null then raise exception 'deal_talent_not_found' using errcode = 'P0002'; end if;
    if new.deal_id is not null and new.deal_id <> v_deal then raise exception 'deal_mismatch' using errcode = '22023'; end if;
    new.deal_id := v_deal;
    new.talent_id := v_talent;
  end if;
  if new.deliverable_id is not null then
    select x.deal_id, x.talent_id, x.deal_talent_id into v_deal, v_talent, new.deal_talent_id from public.deliverables x where x.id = new.deliverable_id;
    if v_deal is null then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
    new.deal_id := v_deal; new.talent_id := v_talent;
  end if;
  if new.deal_id is not null then
    select d.agency_id, d.brand_id into v_agency, v_brand from public.deals d where d.id = new.deal_id;
    if v_agency is null then raise exception 'deal_not_found' using errcode = 'P0002'; end if;
    if v_agency <> new.agency_id then raise exception 'deal_agency_mismatch' using errcode = '22023'; end if;
    new.brand_id := v_brand;
  end if;
  if new.talent_id is not null and not exists (select 1 from public.talent_profiles t where t.id = new.talent_id and t.agency_id = new.agency_id) then
    raise exception 'talent_agency_mismatch' using errcode = '22023';
  end if;
  if new.brand_id is not null and new.deal_id is null
     and not exists (select 1 from public.agency_brands ab where ab.agency_id = new.agency_id and ab.brand_id = new.brand_id and ab.status = 'active') then
    raise exception 'brand_not_linked' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.fill_event_scope() from public, anon, authenticated;
drop trigger if exists trg_calendar_events_scope on public.calendar_events;
create trigger trg_calendar_events_scope before insert or update on public.calendar_events for each row execute function public.fill_event_scope();

-- 3) eventos de sistema: recalculados a partir do negócio ---------------------------------------------------------
-- Um evento por creator confirmado (campanha), um por prazo de resposta aberto (consulta), dois por entregável
-- (prazo de entrega; publicação). Mantém pelo source_key; apaga o que deixou de valer. Negócio perdido/cancelado
-- limpa os eventos de sistema; ganho mantém o histórico.
create or replace function public.calendar_sync_deal(p_deal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; r record; v_keys text[] := '{}'::text[]; v_key text; v_id uuid; v_new boolean;
        v_start timestamptz; v_end timestamptz; v_all_day boolean; v_brand text; v_req public.campaign_requests%rowtype; v_to uuid;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null then return; end if;
  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  if d.request_id is not null then select * into v_req from public.campaign_requests where id = d.request_id; end if;
  if d.stage = 'closed' and d.outcome is distinct from 'won' then
    delete from public.calendar_events e where e.deal_id = p_deal and e.source = 'system';
    return;
  end if;
  -- a) campanha confirmada: etapas 8..13 (ganho), um evento por creator confirmado/contratado
  if public.deal_stage_index(d.stage) >= 8 and d.expected_start is not null then
    if v_req.desired_at is not null then
      v_start := v_req.desired_at; v_end := v_req.desired_at + make_interval(mins => coalesce(v_req.duration_minutes, 120)); v_all_day := false;
    else
      v_start := d.expected_start::timestamp at time zone coalesce((select a.timezone from public.agencies a where a.id = d.agency_id), 'America/Sao_Paulo');
      v_end := (coalesce(d.expected_end, d.expected_start) + 1)::timestamp at time zone coalesce((select a.timezone from public.agencies a where a.id = d.agency_id), 'America/Sao_Paulo');
      v_all_day := true;
    end if;
    for r in select dt.id, dt.talent_id, t.display_name from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id
             where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted') loop
      v_key := 'campaign:' || r.id::text; v_keys := v_keys || v_key;
      v_new := not exists (select 1 from public.calendar_events e where e.agency_id = d.agency_id and e.source_key = v_key);
      insert into public.calendar_events (agency_id, kind, title, subtitle, description, starts_at, ends_at, all_day, location, brand_id, deal_id, deal_talent_id,
                                          talent_id, source, source_key, visible_to_brand, visible_to_talent, created_by)
      -- sem o brief interno: o evento é visível à marca (o creator lê o brief em talent_opportunities)
      values (d.agency_id, 'campaign', d.title, r.display_name, '', v_start, v_end, v_all_day, coalesce(v_req.location, ''), d.brand_id, p_deal, r.id,
              r.talent_id, 'system', v_key, true, true, null)
      on conflict (agency_id, source_key) where source_key is not null do update set title = excluded.title, subtitle = excluded.subtitle,
        description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at, all_day = excluded.all_day, location = excluded.location
      returning id into v_id;
      if v_new then
        v_to := public.talent_user_id(r.talent_id);
        perform public.inbox_notify(v_to, 'calendar_event_added', '/creator/escritorio/agenda',
          jsonb_build_object('date', to_char(v_start, 'YYYY-MM-DD'), 'deal', d.title, 'brand', v_brand), d.agency_id, 'event', v_id, 'event:' || v_key);
      end if;
    end loop;
  end if;
  -- b) prazo de resposta da consulta (só o creator; some quando ele responde ou o prazo passa)
  for r in select dt.id, dt.talent_id, dt.respond_by, t.display_name from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id
           where dt.deal_id = p_deal and dt.status = 'consulted' and dt.respond_by is not null and dt.respond_by > now() loop
    v_key := 'consult:' || r.id::text; v_keys := v_keys || v_key;
    insert into public.calendar_events (agency_id, kind, title, subtitle, starts_at, ends_at, all_day, brand_id, deal_id, deal_talent_id, talent_id, source, source_key,
                                        visible_to_brand, visible_to_talent)
    values (d.agency_id, 'consult_deadline', d.title, r.display_name, r.respond_by, r.respond_by, false, d.brand_id, p_deal, r.id, r.talent_id, 'system', v_key, false, true)
    on conflict (agency_id, source_key) where source_key is not null do update set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
  end loop;
  -- c) entregáveis (prazo: creator; publicação: marca e creator). Entregável cancelado não tem evento.
  for r in select x.id, x.deal_talent_id, x.talent_id, x.kind, x.title, x.due_at, x.publish_at, t.display_name
           from public.deliverables x join public.talent_profiles t on t.id = x.talent_id
           where x.deal_id = p_deal and x.status <> 'cancelled' and public.deal_stage_index(d.stage) >= 8 loop
    if r.due_at is not null then
      v_key := 'deliverable:' || r.id::text || ':due'; v_keys := v_keys || v_key;
      insert into public.calendar_events (agency_id, kind, title, subtitle, starts_at, ends_at, all_day, brand_id, deal_id, deal_talent_id, talent_id, deliverable_id, source, source_key,
                                          visible_to_brand, visible_to_talent)
      values (d.agency_id, 'deliverable', coalesce(nullif(r.title, ''), r.kind) || ' · ' || d.title, r.display_name, r.due_at, r.due_at, false, d.brand_id, p_deal, r.deal_talent_id, r.talent_id, r.id,
              'system', v_key, false, true)
      on conflict (agency_id, source_key) where source_key is not null do update set title = excluded.title, subtitle = excluded.subtitle, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
    end if;
    if r.publish_at is not null then
      v_key := 'deliverable:' || r.id::text || ':publish'; v_keys := v_keys || v_key;
      insert into public.calendar_events (agency_id, kind, title, subtitle, starts_at, ends_at, all_day, brand_id, deal_id, deal_talent_id, talent_id, deliverable_id, source, source_key,
                                          visible_to_brand, visible_to_talent)
      values (d.agency_id, 'deliverable', coalesce(nullif(r.title, ''), r.kind) || ' · ' || d.title, r.display_name, r.publish_at, r.publish_at, false, d.brand_id, p_deal, r.deal_talent_id, r.talent_id, r.id,
              'system', v_key, true, true)
      on conflict (agency_id, source_key) where source_key is not null do update set title = excluded.title, subtitle = excluded.subtitle, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
    end if;
  end loop;
  delete from public.calendar_events e where e.deal_id = p_deal and e.source = 'system' and not (e.source_key = any (v_keys));
end $$;
revoke execute on function public.calendar_sync_deal(uuid) from public, anon, authenticated;

create or replace function public.calendar_sync_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_deal uuid;
begin
  -- cada tabela tem o seu caminho (a expressão com new.deal_id não compila para deals)
  if tg_table_name = 'deals' then
    v_deal := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_op = 'DELETE' then
    v_deal := old.deal_id;
  else
    v_deal := new.deal_id;
  end if;
  if v_deal is not null then perform public.calendar_sync_deal(v_deal); end if;
  return null;
end $$;
revoke execute on function public.calendar_sync_trigger() from public, anon, authenticated;
drop trigger if exists trg_deals_calendar on public.deals;
create trigger trg_deals_calendar after insert or update of stage, outcome, title, expected_start, expected_end, talent_brief on public.deals
  for each row execute function public.calendar_sync_trigger();
drop trigger if exists trg_deal_talents_calendar on public.deal_talents;
create trigger trg_deal_talents_calendar after insert or update of status, respond_by, responded_at on public.deal_talents
  for each row execute function public.calendar_sync_trigger();
drop trigger if exists trg_deliverables_calendar on public.deliverables;
create trigger trg_deliverables_calendar after insert or update of status, title, kind, due_at, publish_at or delete on public.deliverables
  for each row execute function public.calendar_sync_trigger();

-- 4) leitura ----------------------------------------------------------------------------------------------------
-- agências que atendem as minhas marcas (datas comerciais)
create or replace function public.my_brand_served_agency_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ab.agency_id), '{}'::uuid[]) from public.agency_brands ab
  join public.agencies a on a.id = ab.agency_id and a.status = 'active'
  where ab.status = 'active' and ab.brand_id = any (public.my_brand_ids(false))
$$;
revoke execute on function public.my_brand_served_agency_ids() from public, anon;
grant execute on function public.my_brand_served_agency_ids() to authenticated, service_role;

drop policy if exists calendar_events_select_agency on public.calendar_events;
create policy calendar_events_select_agency on public.calendar_events for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
-- colaborador: eventos dos negócios dele e os da agência sem negócio nem creator (reuniões gerais, datas comerciais)
drop policy if exists calendar_events_select_staff on public.calendar_events;
create policy calendar_events_select_staff on public.calendar_events for select to authenticated
  using (deal_id = any ((select public.my_staff_deal_ids())::uuid[])
         or (deal_id is null and talent_id is null and agency_id = any ((select public.my_agency_ids('staff'))::uuid[])));
-- marca: o que foi marcado como visível, em negócio que ela vê; datas comerciais da agência que a atende
drop policy if exists calendar_events_select_brand on public.calendar_events;
create policy calendar_events_select_brand on public.calendar_events for select to authenticated
  using (visible_to_brand and (
           (deal_id is not null and deal_id = any ((select public.my_brand_deal_ids())::uuid[]))
        or (deal_id is null and kind = 'commercial_date' and agency_id = any ((select public.my_brand_served_agency_ids())::uuid[])
            and (brand_id is null or brand_id = any ((select public.my_brand_ids(false))::uuid[])))));
-- creator: só o que é dele e marcado como visível
drop policy if exists calendar_events_select_talent on public.calendar_events;
create policy calendar_events_select_talent on public.calendar_events for select to authenticated
  using (visible_to_talent and talent_id = (select public.my_talent_id()));
-- feed: cada um lê só o próprio registro (sem o hash servir para nada: o token não é recuperável)
drop policy if exists calendar_feeds_select_own on public.calendar_feeds;
create policy calendar_feeds_select_own on public.calendar_feeds for select to authenticated using (user_id = (select auth.uid()));

-- 5) RPCs: eventos manuais e datas comerciais -------------------------------------------------------------------
create or replace function public.agency_event_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_kind text; v_deal uuid; v_talent uuid; v_brand uuid; v_start timestamptz; v_end timestamptz; v_all_day boolean;
        v_title text; v_vb boolean; v_vt boolean; v_label text; v_to uuid; r record; v_before public.calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_id is not null then
    select * into v_before from public.calendar_events e where e.id = v_id and e.agency_id = p_agency;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.source = 'system' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    -- quem pode mexer no evento como ele está hoje (não só como ficaria depois): colaborador só no negócio dele
    if v_before.deal_id is not null then perform public.deal_write_scope(v_before.deal_id, true);
    elsif not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  v_kind := coalesce(nullif(p_data ->> 'kind', ''), v_before.kind, 'meeting');
  if v_kind not in ('meeting', 'recording', 'commercial_date', 'other') then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_deal := case when p_data ? 'deal_id' then nullif(btrim(coalesce(p_data ->> 'deal_id', '')), '')::uuid else v_before.deal_id end;
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_brand := case when p_data ? 'brand_id' then nullif(btrim(coalesce(p_data ->> 'brand_id', '')), '')::uuid else v_before.brand_id end;
    v_start := coalesce((p_data ->> 'starts_at')::timestamptz, v_before.starts_at);
    v_end := coalesce((p_data ->> 'ends_at')::timestamptz, v_before.ends_at, v_start);
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
  v_title := btrim(coalesce(p_data ->> 'title', v_before.title, ''));
  v_vb := coalesce((p_data ->> 'visible_to_brand')::boolean, v_before.visible_to_brand, false);
  v_vt := coalesce((p_data ->> 'visible_to_talent')::boolean, v_before.visible_to_talent, false);
  if v_kind = 'commercial_date' or v_before.kind = 'commercial_date' then
    -- publicação para as marcas: só gestor+, sem negócio nem creator, sempre visível à marca (e não vira outra coisa)
    if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_before.kind = 'commercial_date' and v_kind <> 'commercial_date' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_deal := null; v_talent := null; v_vb := true; v_vt := false;
  elsif v_deal is not null then
    perform public.deal_write_scope(v_deal, true);
  elsif not public.agency_can(p_agency, 'manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- sem negócio, a marca não vê (só data comercial); sem creator, o creator não vê
  if v_deal is null and v_kind <> 'commercial_date' then v_vb := false; end if;
  if v_talent is null then v_vt := false; end if;
  if v_start is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    if v_id is null then
      insert into public.calendar_events (agency_id, kind, title, description, starts_at, ends_at, all_day, location, brand_id, deal_id, talent_id, source, visible_to_brand, visible_to_talent, created_by)
      values (p_agency, v_kind, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), v_start, v_end, v_all_day, left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_brand, v_deal, v_talent, 'manual', v_vb, v_vt, auth.uid())
      returning id into v_id;
    else
      update public.calendar_events set kind = v_kind, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        brand_id = v_brand, deal_id = v_deal, talent_id = v_talent, visible_to_brand = v_vb, visible_to_talent = v_vt
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('calendar.event', 'calendar_event', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('agency_id', p_agency, 'kind', v_before.kind, 'starts_at', v_before.starts_at) end,
    jsonb_build_object('agency_id', p_agency, 'kind', v_kind, 'starts_at', v_start, 'visible_to_brand', v_vb, 'visible_to_talent', v_vt), null,
    public.talent_audit_actor('agency', p_agency));
  -- avisos: creator (evento visível a ele, novo ou que ficou visível), marcas (data comercial nova)
  if v_vt and v_talent is not null and (v_before.id is null or not v_before.visible_to_talent) then
    v_to := public.talent_user_id(v_talent);
    perform public.inbox_notify(v_to, 'calendar_event_added', '/creator/escritorio/agenda', jsonb_build_object('date', to_char(v_start, 'YYYY-MM-DD'), 'title', v_title),
      p_agency, 'event', v_id, 'event:' || v_id::text);
  end if;
  if v_kind = 'commercial_date' and v_before.id is null then
    for r in select ab.brand_id from public.agency_brands ab where ab.agency_id = p_agency and ab.status = 'active' and (v_brand is null or ab.brand_id = v_brand) loop
      perform public.inbox_notify_brand(r.brand_id, false, 'commercial_date_published', '/marca/agenda',
        jsonb_build_object('date', to_char(v_start, 'YYYY-MM-DD'), 'title', v_title), p_agency, 'commercial_date', v_id, 'cdate:' || v_id::text || ':' || r.brand_id::text);
    end loop;
  end if;
  return v_id;
end $$;

create or replace function public.agency_event_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into e from public.calendar_events where id = p_id;
  if e.id is null or not public.agency_can(e.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.source = 'system' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if e.deal_id is not null then perform public.deal_write_scope(e.deal_id, true);
  elsif not public.agency_can(e.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.calendar_events where id = p_id;
  perform public.audit_log('calendar.event_delete', 'calendar_event', p_id::text, jsonb_build_object('agency_id', e.agency_id, 'kind', e.kind, 'starts_at', e.starts_at), null, null,
    public.talent_audit_actor('agency', e.agency_id));
end $$;

-- 6) feed .ics por pessoa ---------------------------------------------------------------------------------------
create or replace function public.calendar_feed_create()
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.calendar_feeds (user_id, token_hash) values (auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, rotated_at = now(), revoked_at = null;
  return v_token;
end $$;

create or replace function public.calendar_feed_revoke()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  update public.calendar_feeds set revoked_at = now() where user_id = auth.uid();
end $$;

-- eventos que uma pessoa vê, calculados com as mesmas regras das políticas acima (o feed não tem sessão:
-- não dá para assumir o papel dela dentro de uma função security definer, então a regra é espelhada aqui;
-- S77 confere a paridade para creator e marca)
create or replace function public.calendar_events_for_user(p_user uuid)
returns setof public.calendar_events language sql stable security definer set search_path = '' as $$
  with agencies_m as (
    select m.agency_id, public.agency_role_rank(m.role) as rank from public.agency_members m
    join public.agencies a on a.id = m.agency_id and a.status = 'active' where m.user_id = p_user and m.revoked_at is null),
  staff_deals as (
    select d.id from public.deals d join agencies_m am on am.agency_id = d.agency_id and am.rank = 1
    where d.owner_id = p_user or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = p_user)),
  brands_m as (
    select distinct bm.brand_id from public.brand_members bm where bm.user_id = p_user and bm.revoked_at is null
      and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active' where ab.brand_id = bm.brand_id and ab.status = 'active')),
  brand_deals as (select d.id from public.deals d where d.brand_visible and d.brand_id in (select brand_id from brands_m)),
  served as (select distinct ab.agency_id from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
             where ab.status = 'active' and ab.brand_id in (select brand_id from brands_m)),
  talent as (select t.id from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active'
             where t.archived_at is null and public.talent_user_id(t.id) = p_user order by t.created_at limit 1),
  -- admin geral (conta real): tudo, como a política _select_admin
  platform_admin as (select exists (select 1 from public.role_assignments r join auth.users u on u.id = r.user_id
                                    where r.user_id = p_user and r.role::text = 'admin' and r.scope_type = 'global' and r.revoked_at is null
                                      and coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') not in ('true', 't')) as ok)
  select e.* from public.calendar_events e
  where (select ok from platform_admin)
     or e.agency_id in (select agency_id from agencies_m where rank >= 2)
     or e.deal_id in (select id from staff_deals)
     or (e.deal_id is null and e.talent_id is null and e.agency_id in (select agency_id from agencies_m))
     or (e.visible_to_brand and ((e.deal_id is not null and e.deal_id in (select id from brand_deals))
                                 or (e.deal_id is null and e.kind = 'commercial_date' and e.agency_id in (select agency_id from served) and (e.brand_id is null or e.brand_id in (select brand_id from brands_m)))))
     or (e.visible_to_talent and e.talent_id = (select id from talent))
$$;
revoke execute on function public.calendar_events_for_user(uuid) from public, anon, authenticated;

create or replace function public.calendar_feed_resolve(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.calendar_feeds%rowtype; out jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into f from public.calendar_feeds where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if f.id is null or f.revoked_at is not null then return null; end if;
  update public.calendar_feeds set last_fetched_at = now(), fetch_count = fetch_count + 1 where id = f.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'subtitle', e.subtitle, 'description', e.description,
           'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day, 'location', e.location, 'updated_at', e.updated_at,
           'deal_id', e.deal_id, 'brand', (select b.name from public.brands b where b.id = e.brand_id)) order by e.starts_at), '[]'::jsonb)
  into out from public.calendar_events_for_user(f.user_id) e
  where e.starts_at >= now() - interval '90 days' and e.starts_at <= now() + interval '366 days';
  return jsonb_build_object('user_id', f.user_id, 'events', out);
end $$;
revoke execute on function public.calendar_feed_resolve(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_resolve(text) to service_role;

-- 7) demonstração: reunião com a marca, data comercial e os eventos de sistema do negócio -----------------------------
create or replace function public.agency_demo_seed_calendar(p_agency uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_brand uuid := public.seed_uuid('demo:brand:exemplo-marca'); v_deal uuid := public.seed_uuid('demo:deal:lancamento');
        v_tz text := coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo');
begin
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.is_demo) then return; end if;
  delete from public.calendar_events e where e.agency_id = p_agency and e.source = 'manual';
  if exists (select 1 from public.deals d where d.id = v_deal) then
    insert into public.calendar_events (agency_id, kind, title, description, starts_at, ends_at, all_day, location, brand_id, deal_id, source, visible_to_brand, visible_to_talent, created_by)
    values (p_agency, 'meeting', 'Alinhamento do lançamento com a marca', 'Datas do estúdio e roteiro dos reels. Dados fictícios de demonstração.',
            ((current_date + 3)::timestamp + interval '10 hours') at time zone v_tz, ((current_date + 3)::timestamp + interval '11 hours') at time zone v_tz, false,
            'Chamada de vídeo', v_brand, v_deal, 'manual', true, false, p_actor);
    perform public.calendar_sync_deal(v_deal);
  end if;
  insert into public.calendar_events (agency_id, kind, title, description, starts_at, ends_at, all_day, brand_id, source, visible_to_brand, visible_to_talent, created_by)
  values (p_agency, 'commercial_date', 'Dia do Consumidor: propostas até esta data', 'Campanhas para março com os creators do casting. Dados fictícios de demonstração.',
          ((current_date + 45)::timestamp) at time zone v_tz, ((current_date + 46)::timestamp) at time zone v_tz, true, null, 'manual', true, false, p_actor);
end $$;
revoke execute on function public.agency_demo_seed_calendar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agency_demo_seed_calendar(uuid, uuid) to service_role;

-- 8) execução ------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.agency_event_save(uuid, uuid, jsonb)', 'public.agency_event_delete(uuid)', 'public.calendar_feed_create()', 'public.calendar_feed_revoke()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
