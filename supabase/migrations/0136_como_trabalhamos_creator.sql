-- =============================================================================
-- 0136 — Como trabalhamos (guia do creator: "Direcionamento de Reuniões com Creators", Groscove Group)
--   O creator do casting diz quais dos quatro formatos fazem sentido (CPA com links e cupons, publi post, projeto
--   autoral com captação de patrocínio, eventos e experiências), responde às ações abertas da agência (Black Friday
--   2026), envia o projeto autoral e marca os universos e as marcas que já conhece ou quer explorar. A equipe da
--   agência do casting vê tudo na ficha do creator; gestor+ dá andamento ao projeto autoral.
--   Indicação nunca é aprovação de campanha: nada aqui cria negócio, cachê ou contrato.
--   Leitura e escrita só pelas funções abaixo (tabelas sem acesso direto do app).
-- =============================================================================

-- 1) sinais do creator (formatos, universos e marcas) -----------------------------------------------------------------
create table if not exists public.talent_relationship (
  talent_id uuid primary key constraint talent_relationship_talent_fk references public.talent_profiles (id) on delete cascade,
  formats jsonb not null default '{}'::jsonb,
  universes text[] not null default '{}',
  brands_known uuid[] not null default '{}',
  brands_explore uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint talent_relationship_formats_obj check (jsonb_typeof(formats) = 'object'),
  constraint talent_relationship_sizes check (cardinality(universes) <= 16 and cardinality(brands_known) <= 80 and cardinality(brands_explore) <= 80)
);

-- 2) ações abertas da agência para o casting (ex.: Black Friday 2026) ---------------------------------------------------
create table if not exists public.creator_actions (
  key text primary key constraint creator_actions_key_check check (key ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  agency_id uuid not null constraint creator_actions_agency_fk references public.agencies (id) on delete cascade,
  title text not null constraint creator_actions_title_check check (char_length(title) between 3 and 80),
  summary text not null default '' constraint creator_actions_summary_check check (char_length(summary) <= 600),
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  calendar_event_id uuid constraint creator_actions_event_fk references public.calendar_events (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint creator_actions_dates check (ends_on >= starts_on)
);

create table if not exists public.talent_action_responses (
  talent_id uuid not null constraint talent_action_responses_talent_fk references public.talent_profiles (id) on delete cascade,
  action_key text not null constraint talent_action_responses_action_fk references public.creator_actions (key) on delete cascade,
  interest text not null constraint talent_action_responses_interest_check check (interest in ('yes', 'no', 'depends')),
  categories text not null default '' constraint talent_action_responses_categories_check check (char_length(categories) <= 300),
  availability text not null default '' constraint talent_action_responses_availability_check check (char_length(availability) <= 500),
  notes text not null default '' constraint talent_action_responses_notes_check check (char_length(notes) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (talent_id, action_key)
);
create index if not exists talent_action_responses_action_idx on public.talent_action_responses (action_key, updated_at desc);

-- 3) projeto autoral (formato 3) -----------------------------------------------------------------------------------------
create table if not exists public.creator_project_ideas (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null constraint creator_project_ideas_talent_fk references public.talent_profiles (id) on delete cascade,
  agency_id uuid not null constraint creator_project_ideas_agency_fk references public.agencies (id) on delete cascade,
  title text not null constraint creator_project_ideas_title_check check (char_length(title) between 3 and 120),
  concept text not null constraint creator_project_ideas_concept_check check (char_length(concept) between 10 and 1500),
  audience text not null default '' constraint creator_project_ideas_audience_check check (char_length(audience) <= 500),
  format text not null default '' constraint creator_project_ideas_format_check check (char_length(format) <= 300),
  location text not null default '' constraint creator_project_ideas_location_check check (char_length(location) <= 200),
  timeline text not null default '' constraint creator_project_ideas_timeline_check check (char_length(timeline) <= 200),
  stage text not null default '' constraint creator_project_ideas_stage_check check (char_length(stage) <= 300),
  partners text not null default '' constraint creator_project_ideas_partners_check check (char_length(partners) <= 500),
  needs text not null default '' constraint creator_project_ideas_needs_check check (char_length(needs) <= 500),
  status text not null default 'received'
    constraint creator_project_ideas_status_check check (status in ('received', 'studying', 'prospecting', 'paused', 'closed')),
  team_note text not null default '' constraint creator_project_ideas_team_note_check check (char_length(team_note) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists creator_project_ideas_talent_idx on public.creator_project_ideas (talent_id, created_at desc);
create index if not exists creator_project_ideas_agency_idx on public.creator_project_ideas (agency_id, status, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['talent_relationship', 'creator_actions', 'talent_action_responses', 'creator_project_ideas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- 4) avisos: tipos e entidade novos ----------------------------------------------------------------------------------------
alter table public.inbox_notifications drop constraint if exists inbox_notifications_kind_check;
alter table public.inbox_notifications add constraint inbox_notifications_kind_check check (kind in (
  'member_joined', 'brand_member_joined',
  'talent_consent_given', 'talent_consent_revoked',
  'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
  'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
  'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
  'calendar_event_added', 'commercial_date_published',
  'relationship_alert', 'task_overdue', 'payout_updated',
  'internal_approval_requested', 'internal_approval_decided', 'shortlist_sent', 'shortlist_decided',
  'invoice_submitted', 'invoice_reviewed', 'payout_scheduled', 'budget_exceeded',
  'usage_rights_expiring', 'deliverable_comment',
  'task_due_soon',
  'sponsorship_published', 'sponsorship_interest', 'sponsorship_decided',
  'sponsorship_negotiation',
  'brand_call_published', 'brand_call_interest', 'brand_call_negotiation', 'brand_call_decided', 'brand_call_review',
  'budget_change', 'payment_reported', 'payment_reviewed', 'payment_due', 'payment_plan',
  'roadmap_due_soon', 'roadmap_overdue',
  'payout_due',
  'hero_account_linked', 'brand_access_granted',
  'agency_access_requested', 'agency_access_decided',
  'casting_access_requested', 'casting_access_decided',
  'brand_approval_requested', 'brand_approval_decided',
  'profile_claim_requested', 'profile_claim_decided',
  'brand_login_requested', 'brand_login_decided',
  'onda_digital_news', 'onda_request_received', 'onda_request_updated',
  -- 0136
  'creator_idea_received', 'creator_idea_updated', 'creator_action_answered'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   'access_request',
   'casting_request', 'profile_claim',
   'onda_request',
   -- 0136
   'creator_idea'));

-- 5) validação dos formatos ------------------------------------------------------------------------------------------------
create or replace function public.creator_formats_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare r record; v_out jsonb := '{}'::jsonb; v_interest text; v_note text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  for r in select key, value from jsonb_each(p) loop
    if r.key not in ('cpa', 'publi', 'project', 'events') or jsonb_typeof(r.value) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_interest := r.value ->> 'interest';
    v_note := btrim(coalesce(r.value ->> 'note', ''));
    if v_interest is null or v_interest not in ('yes', 'no', 'maybe') or char_length(v_note) > 300 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_object(r.key, jsonb_build_object('interest', v_interest, 'note', v_note));
  end loop;
  return v_out;
end $$;
revoke execute on function public.creator_formats_clean(jsonb) from public, anon;
grant execute on function public.creator_formats_clean(jsonb) to authenticated, service_role;

-- 6) o creator: lê o que já disse e as ações abertas ------------------------------------------------------------------------
create or replace function public.creator_guide_mine()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid := public.my_talent_id(); v_agency uuid; v_rel public.talent_relationship%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_t is null then return null; end if;
  select t.agency_id into v_agency from public.talent_profiles t where t.id = v_t;
  select * into v_rel from public.talent_relationship r where r.talent_id = v_t;
  return jsonb_build_object(
    'talent_id', v_t,
    'groscove', v_agency is not distinct from public.groscove_agency_id(),
    'formats', coalesce(v_rel.formats, '{}'::jsonb),
    'universes', to_jsonb(coalesce(v_rel.universes, '{}'::text[])),
    'brands_known', to_jsonb(coalesce(v_rel.brands_known, '{}'::uuid[])),
    'brands_explore', to_jsonb(coalesce(v_rel.brands_explore, '{}'::uuid[])),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('key', a.key, 'title', a.title, 'summary', a.summary,
        'starts_on', a.starts_on, 'ends_on', a.ends_on, 'event_id', a.calendar_event_id,
        'response', (select jsonb_build_object('interest', r.interest, 'categories', r.categories, 'availability', r.availability,
                       'notes', r.notes, 'updated_at', r.updated_at)
                     from public.talent_action_responses r where r.talent_id = v_t and r.action_key = a.key))
        order by a.ends_on, a.key)
      from public.creator_actions a
      where a.agency_id = v_agency and a.active and current_date between a.starts_on and a.ends_on), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'status', i.status,
        'created_at', i.created_at, 'updated_at', i.updated_at) order by i.created_at desc)
      from public.creator_project_ideas i where i.talent_id = v_t), '[]'::jsonb));
end $$;
revoke execute on function public.creator_guide_mine() from public, anon;
grant execute on function public.creator_guide_mine() to authenticated, service_role;

-- 7) o creator: formatos, universos, ação e projeto autoral -----------------------------------------------------------------
create or replace function public.creator_formats_save(p_formats jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid := public.my_talent_id(); v_clean jsonb;
begin
  if auth.uid() is null or v_t is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_clean := public.creator_formats_clean(p_formats);
  insert into public.talent_relationship (talent_id, formats, updated_at, updated_by)
  values (v_t, v_clean, now(), auth.uid())
  on conflict (talent_id) do update
    set formats = public.talent_relationship.formats || excluded.formats, updated_at = now(), updated_by = auth.uid();
end $$;
revoke execute on function public.creator_formats_save(jsonb) from public, anon;
grant execute on function public.creator_formats_save(jsonb) to authenticated, service_role;

create or replace function public.creator_universes_save(p_universes text[], p_known uuid[], p_explore uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid := public.my_talent_id(); v_u text[]; v_k uuid[]; v_e uuid[];
begin
  if auth.uid() is null or v_t is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if cardinality(coalesce(p_universes, '{}')) > 16 or cardinality(coalesce(p_known, '{}')) > 80 or cardinality(coalesce(p_explore, '{}')) > 80 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select coalesce(array_agg(c.slug order by c.sort_order), '{}') into v_u
  from public.brand_categories c where c.slug = any (coalesce(p_universes, '{}'));
  select coalesce(array_agg(b.id order by b.name), '{}') into v_k
  from public.brands b where b.id = any (coalesce(p_known, '{}')) and not b.is_demo and b.approval_status = 'approved';
  select coalesce(array_agg(b.id order by b.name), '{}') into v_e
  from public.brands b where b.id = any (coalesce(p_explore, '{}')) and not b.is_demo and b.approval_status = 'approved';
  insert into public.talent_relationship (talent_id, universes, brands_known, brands_explore, updated_at, updated_by)
  values (v_t, v_u, v_k, v_e, now(), auth.uid())
  on conflict (talent_id) do update
    set universes = excluded.universes, brands_known = excluded.brands_known, brands_explore = excluded.brands_explore,
        updated_at = now(), updated_by = auth.uid();
end $$;
revoke execute on function public.creator_universes_save(text[], uuid[], uuid[]) from public, anon;
grant execute on function public.creator_universes_save(text[], uuid[], uuid[]) to authenticated, service_role;

create or replace function public.creator_action_respond(p_action text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid := public.my_talent_id(); v_a public.creator_actions%rowtype; v_agency uuid; v_name text;
        v_interest text; v_categories text; v_availability text; v_notes text;
begin
  if auth.uid() is null or v_t is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.agency_id, t.display_name into v_agency, v_name from public.talent_profiles t where t.id = v_t;
  select * into v_a from public.creator_actions a where a.key = p_action;
  if v_a.key is null or v_a.agency_id <> v_agency then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_a.active or current_date not between v_a.starts_on and v_a.ends_on then raise exception 'action_closed' using errcode = 'P0001'; end if;
  v_interest := p_data ->> 'interest';
  v_categories := btrim(coalesce(p_data ->> 'categories', ''));
  v_availability := btrim(coalesce(p_data ->> 'availability', ''));
  v_notes := btrim(coalesce(p_data ->> 'notes', ''));
  if v_interest is null or v_interest not in ('yes', 'no', 'depends')
     or char_length(v_categories) > 300 or char_length(v_availability) > 500 or char_length(v_notes) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.talent_action_responses (talent_id, action_key, interest, categories, availability, notes, updated_at, updated_by)
  values (v_t, v_a.key, v_interest, v_categories, v_availability, v_notes, now(), auth.uid())
  on conflict (talent_id, action_key) do update
    set interest = excluded.interest, categories = excluded.categories, availability = excluded.availability,
        notes = excluded.notes, updated_at = now(), updated_by = auth.uid();
  -- a equipe (gestor+) recebe um aviso por creator e ação (a primeira resposta; mudanças aparecem na ficha)
  perform public.inbox_notify_agency(v_agency, 'manager', 'creator_action_answered', '/agencia/casting/acoes/' || v_a.key,
    jsonb_build_object('talent', left(v_name, 80), 'action', v_a.title, 'interest', v_interest), 'talent', v_t,
    'creator_action:' || v_a.key || ':' || v_t::text);
end $$;
revoke execute on function public.creator_action_respond(text, jsonb) from public, anon;
grant execute on function public.creator_action_respond(text, jsonb) to authenticated, service_role;

create or replace function public.creator_idea_submit(p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_t uuid := public.my_talent_id(); v_agency uuid; v_name text; v_id uuid;
        v_title text; v_concept text; v_audience text; v_format text; v_location text; v_timeline text;
        v_stage text; v_partners text; v_needs text;
begin
  if auth.uid() is null or v_t is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_title := btrim(coalesce(p_data ->> 'title', ''));
  v_concept := btrim(coalesce(p_data ->> 'concept', ''));
  v_audience := btrim(coalesce(p_data ->> 'audience', ''));
  v_format := btrim(coalesce(p_data ->> 'format', ''));
  v_location := btrim(coalesce(p_data ->> 'location', ''));
  v_timeline := btrim(coalesce(p_data ->> 'timeline', ''));
  v_stage := btrim(coalesce(p_data ->> 'stage', ''));
  v_partners := btrim(coalesce(p_data ->> 'partners', ''));
  v_needs := btrim(coalesce(p_data ->> 'needs', ''));
  if char_length(v_title) not between 3 and 120 or char_length(v_concept) not between 10 and 1500
     or char_length(v_audience) > 500 or char_length(v_format) > 300 or char_length(v_location) > 200
     or char_length(v_timeline) > 200 or char_length(v_stage) > 300 or char_length(v_partners) > 500 or char_length(v_needs) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- no máximo 5 projetos por creator em 24 h (evita envio repetido sem querer)
  if (select count(*) from public.creator_project_ideas i where i.talent_id = v_t and i.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select t.agency_id, t.display_name into v_agency, v_name from public.talent_profiles t where t.id = v_t;
  insert into public.creator_project_ideas (talent_id, agency_id, title, concept, audience, format, location, timeline, stage, partners,
                                            needs, created_by, updated_by)
  values (v_t, v_agency, v_title, v_concept, v_audience, v_format, v_location, v_timeline, v_stage, v_partners, v_needs, auth.uid(), auth.uid())
  returning id into v_id;
  perform public.inbox_notify_agency(v_agency, 'manager', 'creator_idea_received', '/agencia/casting/' || v_t::text || '/relacionamento#projetos-autorais',
    jsonb_build_object('talent', left(v_name, 80), 'title', left(v_title, 80)), 'creator_idea', v_id, 'creator_idea:' || v_id::text);
  perform public.audit_log('creator.idea_submit', 'creator_idea', v_id::text, null, jsonb_build_object('talent_id', v_t), null, 'creator');
  return v_id;
end $$;
revoke execute on function public.creator_idea_submit(jsonb) from public, anon;
grant execute on function public.creator_idea_submit(jsonb) to authenticated, service_role;

-- 8) a equipe da agência: ficha do creator, formatos na reunião, andamento do projeto e respostas da ação ---------------------
create or replace function public.talent_relationship_team(p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid; v_rel public.talent_relationship%rowtype;
begin
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent and t.archived_at is null;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_rel from public.talent_relationship r where r.talent_id = p_talent;
  return jsonb_build_object(
    'formats', coalesce(v_rel.formats, '{}'::jsonb),
    'universes', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name) order by c.sort_order)
      from public.brand_categories c where c.slug = any (coalesce(v_rel.universes, '{}'))), '[]'::jsonb),
    'brands_known', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url) order by b.name)
      from public.brands b where b.id = any (coalesce(v_rel.brands_known, '{}'))), '[]'::jsonb),
    'brands_explore', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url) order by b.name)
      from public.brands b where b.id = any (coalesce(v_rel.brands_explore, '{}'))), '[]'::jsonb),
    'updated_at', v_rel.updated_at,
    'actions', coalesce((select jsonb_agg(jsonb_build_object('key', a.key, 'title', a.title, 'ends_on', a.ends_on,
        'interest', r.interest, 'categories', r.categories, 'availability', r.availability, 'notes', r.notes, 'updated_at', r.updated_at)
        order by r.updated_at desc)
      from public.talent_action_responses r join public.creator_actions a on a.key = r.action_key
      where r.talent_id = p_talent), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'concept', i.concept, 'audience', i.audience,
        'format', i.format, 'location', i.location, 'timeline', i.timeline, 'stage', i.stage, 'partners', i.partners, 'needs', i.needs,
        'status', i.status, 'team_note', i.team_note, 'created_at', i.created_at, 'updated_at', i.updated_at) order by i.created_at desc)
      from public.creator_project_ideas i where i.talent_id = p_talent), '[]'::jsonb),
    'can_manage', public.agency_can(v_agency, 'manager'));
end $$;
revoke execute on function public.talent_relationship_team(uuid) from public, anon;
grant execute on function public.talent_relationship_team(uuid) to authenticated, service_role;

create or replace function public.talent_formats_save_team(p_talent uuid, p_formats jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_clean jsonb;
begin
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent and t.archived_at is null;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_clean := public.creator_formats_clean(p_formats);
  insert into public.talent_relationship (talent_id, formats, updated_at, updated_by)
  values (p_talent, v_clean, now(), auth.uid())
  on conflict (talent_id) do update
    set formats = public.talent_relationship.formats || excluded.formats, updated_at = now(), updated_by = auth.uid();
end $$;
revoke execute on function public.talent_formats_save_team(uuid, jsonb) from public, anon;
grant execute on function public.talent_formats_save_team(uuid, jsonb) to authenticated, service_role;

create or replace function public.creator_idea_update(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_i public.creator_project_ideas%rowtype; v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v_i from public.creator_project_ideas i where i.id = p_id;
  if v_i.id is null or not public.agency_can(v_i.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('received', 'studying', 'prospecting', 'paused', 'closed') or char_length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.creator_project_ideas set status = p_status, team_note = v_note, updated_at = now(), updated_by = auth.uid() where id = p_id;
  if p_status <> v_i.status then
    perform public.inbox_notify(public.talent_user_id(v_i.talent_id), 'creator_idea_updated', '/heroi/como-trabalhamos#projeto-autoral',
      jsonb_build_object('title', left(v_i.title, 80), 'status', p_status), v_i.agency_id, 'creator_idea', v_i.id, null);
  end if;
  perform public.audit_log('creator.idea_update', 'creator_idea', p_id::text, jsonb_build_object('status', v_i.status),
    jsonb_build_object('status', p_status), null, 'agency');
end $$;
revoke execute on function public.creator_idea_update(uuid, text, text) from public, anon;
grant execute on function public.creator_idea_update(uuid, text, text) to authenticated, service_role;

create or replace function public.creator_action_answers(p_action text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_a public.creator_actions%rowtype;
begin
  select * into v_a from public.creator_actions a where a.key = p_action;
  if v_a.key is null or not public.agency_can(v_a.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'action', jsonb_build_object('key', v_a.key, 'title', v_a.title, 'summary', v_a.summary, 'starts_on', v_a.starts_on,
      'ends_on', v_a.ends_on, 'active', v_a.active, 'event_id', v_a.calendar_event_id),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('talent_id', t.id, 'name', t.display_name, 'photo_url', t.photo_url,
        'interest', r.interest, 'categories', r.categories, 'availability', r.availability, 'notes', r.notes, 'updated_at', r.updated_at)
        order by case r.interest when 'yes' then 0 when 'depends' then 1 else 2 end, r.updated_at desc)
      from public.talent_action_responses r join public.talent_profiles t on t.id = r.talent_id
      where r.action_key = v_a.key and t.agency_id = v_a.agency_id and t.archived_at is null), '[]'::jsonb));
end $$;
revoke execute on function public.creator_action_answers(text) from public, anon;
grant execute on function public.creator_action_answers(text) to authenticated, service_role;

-- 9) os universos para o creator (categorias e marcas aprovadas, sem dado interno) ------------------------------------------
create or replace function public.creator_universe_catalog()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or (public.my_talent_id() is null and not public.is_groscove_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name) order by c.sort_order)
      from public.brand_categories c), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url, 'category', b.category) order by b.name)
      from public.brands b where not b.is_demo and b.approval_status = 'approved' and b.category is not null), '[]'::jsonb));
end $$;
revoke execute on function public.creator_universe_catalog() from public, anon;
grant execute on function public.creator_universe_catalog() to authenticated, service_role;

-- 10) a primeira ação: Black Friday 2026 da Groscove (janela até o fim do ano) ----------------------------------------------
insert into public.creator_actions (key, agency_id, title, summary, starts_on, ends_on, calendar_event_id)
select 'black-friday-2026', g.id, 'Black Friday 2026',
       'A Groscove está organizando uma frente de Black Friday com algumas marcas e um calendário de conteúdos. Diga se tem interesse, as categorias que fazem sentido e a sua disponibilidade. As possibilidades são formalizadas por e-mail, marca a marca.',
       date '2026-11-01', date '2026-12-31',
       (select e.id from public.calendar_events e where e.scope = 'platform' and e.title = 'Black Friday'
          and e.starts_at::date = date '2026-11-27' order by e.created_at limit 1)
from public.agencies g where g.slug = 'groscove'
on conflict (key) do nothing;
