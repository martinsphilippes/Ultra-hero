-- =============================================================================
-- Groscove Ultra · 0066 · Gestão: proposta da marca, pipeline, consulta ao creator e confirmação
-- docs/requisitos/gestao-spec-tecnica.md, Etapa C (prioridade 1 do núcleo comercial). Cenários S76 e S80.
-- Idempotente e reaplicável numa transação só. S14 segue 17 (nada novo para anon).
-- Fluxo: a marca escolhe o creator no catálogo autorizado, consulta a disponibilidade comercial e envia a
-- proposta (briefing + valor oferecido); a agência recebe o negócio, consulta o creator (com cachê definido
-- pelo Adm), o creator aceita ou recusa no escritório, a agência confirma os termos (negócio "aprovado").
-- Valores (orçamento da marca, cachê) ficam em tabelas próprias: gestor e colaborador leem 0 linhas delas.
-- A proposta formal da agência à marca e o motor de comissão entram na etapa seguinte (0067+).
-- =============================================================================

-- 1) formato dos entregáveis desejados pela marca ([{kind, quantity, network?}], sem chave de valor) ------
create or replace function public.campaign_deliverables_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; q numeric;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 30 then return false; end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('kind', 'quantity', 'network') then return false; end if;
    end loop;
    if (e ->> 'kind') is null or (e ->> 'kind') not in ('post','reels','stories','video','short','live','event','ugc','other') then return false; end if;
    if jsonb_typeof(e -> 'quantity') <> 'number' then return false; end if;
    q := (e ->> 'quantity')::numeric;
    if q <> trunc(q) or q < 1 or q > 100 then return false; end if;
    if e ? 'network' and jsonb_typeof(e -> 'network') <> 'null'
       and (jsonb_typeof(e -> 'network') <> 'string' or (e ->> 'network') not in ('instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other')) then
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke execute on function public.campaign_deliverables_valid(jsonb) from public, anon;
grant execute on function public.campaign_deliverables_valid(jsonb) to authenticated, service_role;

-- 2) disponibilidade comercial do talento (o que a marca pode ver: só períodos "disponível") ----------------
create table if not exists public.talent_availability (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_availability_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint talent_availability_talent_fk references public.talent_profiles (id) on delete cascade,
  kind text not null default 'available',
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  created_by uuid constraint talent_availability_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_availability_kind_check check (kind in ('available', 'blocked')),
  constraint talent_availability_range_check check (ends_on >= starts_on and ends_on <= starts_on + 366),
  constraint talent_availability_note_check check (char_length(note) <= 200)
);
create index if not exists talent_availability_talent_idx on public.talent_availability (talent_id, starts_on);

-- 3) proposta/briefing da marca (sem valor: o oferecido vai para campaign_request_budgets) ---------------------
create table if not exists public.campaign_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_requests_agency_fk references public.agencies (id) on delete restrict,
  brand_id uuid not null constraint campaign_requests_brand_fk references public.brands (id) on delete restrict,
  origin text not null,
  created_by uuid constraint campaign_requests_created_by_fk references auth.users (id) on delete set null,
  -- creator desejado pela marca (escolhido no catálogo); a agência pode sugerir outros no negócio
  talent_id uuid constraint campaign_requests_talent_fk references public.talent_profiles (id) on delete set null,
  title text not null default '',
  objective text,
  product text not null default '',
  target_audience text not null default '',
  target_age_bands text[] not null default '{}',
  target_states text[] not null default '{}',
  region_note text not null default '',
  period_start date,
  period_end date,
  desired_at timestamptz,
  duration_minutes integer,
  format text,
  location text not null default '',
  networks text[] not null default '{}',
  deliverables jsonb not null default '[]'::jsonb,
  segment_ids uuid[] not null default '{}',
  notes text not null default '',
  status text not null default 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_requests_origin_check check (origin in ('brand', 'agency')),
  constraint campaign_requests_title_check check (char_length(title) <= 120),
  constraint campaign_requests_objective_check check (objective is null or objective in ('awareness', 'engagement', 'conversion', 'launch', 'content', 'event', 'other')),
  constraint campaign_requests_texts_check check (char_length(product) <= 300 and char_length(target_audience) <= 500
    and char_length(region_note) <= 200 and char_length(notes) <= 2000 and char_length(location) <= 200),
  constraint campaign_requests_ages_check check (target_age_bands <@ array['13-17','18-24','25-34','35-44','45-54','55+']::text[]),
  constraint campaign_requests_states_check check (cardinality(target_states) <= 27),
  constraint campaign_requests_period_check check (period_end is null or period_start is null or period_end >= period_start),
  constraint campaign_requests_duration_check check (duration_minutes is null or duration_minutes between 15 and 14400),
  constraint campaign_requests_format_check check (format is null or format in ('remote', 'in_person', 'hybrid')),
  constraint campaign_requests_networks_check check (networks <@ array['instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other']::text[]),
  constraint campaign_requests_deliverables_check check (public.campaign_deliverables_valid(deliverables)),
  constraint campaign_requests_status_check check (status in ('draft', 'submitted', 'converted', 'declined', 'cancelled')),
  constraint campaign_requests_submitted_check check (status in ('draft', 'cancelled') or submitted_at is not null),
  constraint campaign_requests_agency_brand_fk foreign key (agency_id, brand_id) references public.agency_brands (agency_id, brand_id)
);
alter table public.campaign_requests drop constraint if exists campaign_requests_submitted_check;
alter table public.campaign_requests add constraint campaign_requests_submitted_check check (status in ('draft', 'cancelled') or submitted_at is not null);
create index if not exists campaign_requests_brand_idx on public.campaign_requests (brand_id, updated_at desc);
create index if not exists campaign_requests_agency_idx on public.campaign_requests (agency_id, status);

-- 4) negócio (nenhuma coluna de valor; lido também por marca e creator) --------------------------------------
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deals_agency_fk references public.agencies (id) on delete restrict,
  brand_id uuid not null constraint deals_brand_fk references public.brands (id) on delete restrict,
  request_id uuid constraint deals_request_fk references public.campaign_requests (id) on delete set null,
  title text not null,
  stage text not null default 'briefing_received',
  outcome text,
  owner_id uuid constraint deals_owner_fk references auth.users (id) on delete set null,
  created_by uuid constraint deals_created_by_fk references auth.users (id) on delete set null,
  brand_visible boolean not null default true,
  talent_brief text not null default '',
  segment_ids uuid[] not null default '{}',
  expected_start date,
  expected_end date,
  stage_changed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  contract_confirmed_at timestamptz,
  closed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_request_uq unique (request_id),
  constraint deals_title_check check (char_length(btrim(title)) between 3 and 120),
  constraint deals_stage_check check (stage in ('briefing_received','qualification','shortlist','consultation','proposal_prep',
    'proposal_sent','negotiation','approved','contracting','production','approval','delivery','closed')),
  constraint deals_outcome_check check (outcome is null or outcome in ('won', 'lost', 'cancelled')),
  constraint deals_outcome_closed check ((stage = 'closed') = (outcome is not null)),
  constraint deals_brief_check check (char_length(talent_brief) <= 3000),
  constraint deals_period_check check (expected_end is null or expected_start is null or expected_end >= expected_start),
  constraint deals_agency_brand_fk foreign key (agency_id, brand_id) references public.agency_brands (agency_id, brand_id)
);
create index if not exists deals_agency_stage_idx on public.deals (agency_id, stage, stage_changed_at desc);
create index if not exists deals_owner_idx on public.deals (owner_id) where stage <> 'closed';
create index if not exists deals_brand_idx on public.deals (brand_id, updated_at desc);

create table if not exists public.deal_team (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_team_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_team_deal_fk references public.deals (id) on delete cascade,
  user_id uuid not null constraint deal_team_user_fk references auth.users (id) on delete cascade,
  added_by uuid constraint deal_team_added_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint deal_team_uq unique (deal_id, user_id)
);
create index if not exists deal_team_user_idx on public.deal_team (user_id);

create table if not exists public.deal_talents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_talents_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_talents_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid not null constraint deal_talents_talent_fk references public.talent_profiles (id) on delete restrict,
  status text not null default 'suggested',
  reasons jsonb not null default '[]'::jsonb,
  terms_ready boolean not null default false,
  suggested_by uuid constraint deal_talents_suggested_by_fk references auth.users (id) on delete set null,
  consulted_by uuid constraint deal_talents_consulted_by_fk references auth.users (id) on delete set null,
  consulted_at timestamptz,
  respond_by timestamptz,
  responded_at timestamptz,
  response_note text not null default '',
  response_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_talents_uq unique (deal_id, talent_id),
  constraint deal_talents_status_check check (status in ('suggested','consulted','interested','talk_requested','declined','proposed','contracted','removed')),
  constraint deal_talents_reasons_check check (jsonb_typeof(reasons) = 'array' and jsonb_array_length(reasons) <= 10),
  constraint deal_talents_note_check check (char_length(response_note) <= 500),
  constraint deal_talents_channel_check check (response_channel is null or response_channel in ('app', 'agency_record')),
  constraint deal_talents_consulted_check check (status in ('suggested', 'removed') or consulted_at is not null)
);
create index if not exists deal_talents_talent_idx on public.deal_talents (talent_id, status);

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deliverables_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deliverables_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deliverables_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint deliverables_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deliverables_talent_fk references public.talent_profiles (id) on delete restrict,
  kind text not null,
  network text,
  title text not null default '',
  brief text not null default '',
  due_at timestamptz,
  publish_at timestamptz,
  status text not null default 'planned',
  submission_url text,
  submission_document_id uuid constraint deliverables_submission_doc_fk references public.documents (id) on delete set null,
  submission_note text not null default '',
  submitted_at timestamptz,
  revision smallint not null default 0,
  brand_feedback text not null default '',
  decided_at timestamptz,
  decided_by uuid constraint deliverables_decided_by_fk references auth.users (id) on delete set null,
  decided_side text,
  published_url text,
  published_at timestamptz,
  proof_url text,
  proof_document_id uuid constraint deliverables_proof_doc_fk references public.documents (id) on delete set null,
  proof_at timestamptz,
  created_by uuid constraint deliverables_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_kind_check check (kind in ('post','reels','stories','video','short','live','event','ugc','other')),
  constraint deliverables_network_check check (network is null or network in ('instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other')),
  constraint deliverables_texts_check check (char_length(title) <= 120 and char_length(brief) <= 1000
    and char_length(submission_note) <= 1000 and char_length(brand_feedback) <= 1000),
  constraint deliverables_status_check check (status in ('planned','in_production','submitted','changes_requested','approved','published','proof_submitted','done','cancelled')),
  constraint deliverables_urls_check check ((submission_url is null or public.brand_https_url_ok(submission_url))
    and (published_url is null or public.brand_https_url_ok(published_url)) and (proof_url is null or public.brand_https_url_ok(proof_url))),
  constraint deliverables_side_check check (decided_side is null or decided_side in ('brand', 'agency'))
);
create index if not exists deliverables_deal_idx on public.deliverables (deal_id, status);
create index if not exists deliverables_talent_idx on public.deliverables (talent_id, due_at);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint activities_agency_fk references public.agencies (id) on delete cascade,
  subject_type text not null,
  deal_id uuid constraint activities_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid constraint activities_talent_fk references public.talent_profiles (id) on delete cascade,
  subject_brand_id uuid constraint activities_brand_fk references public.brands (id) on delete cascade,
  kind text not null,
  body text not null default '',
  reason_codes text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  author_id uuid constraint activities_author_fk references auth.users (id) on delete set null,
  author_label text not null default '',
  created_at timestamptz not null default now(),
  constraint activities_reason_codes_check check (reason_codes <@ array['price','talents','deliverables','timeline','scope','other']::text[]),
  constraint activities_subject_check check (
    (subject_type = 'deal' and deal_id is not null and talent_id is null and subject_brand_id is null) or
    (subject_type = 'talent' and talent_id is not null and deal_id is null and subject_brand_id is null) or
    (subject_type = 'brand' and subject_brand_id is not null and deal_id is null and talent_id is null)),
  constraint activities_kind_check check (kind in ('call', 'meeting', 'message', 'email', 'note', 'stage_change', 'system')),
  constraint activities_body_check check (char_length(body) <= 4000),
  constraint activities_label_check check (char_length(author_label) <= 80)
);
create index if not exists activities_deal_idx on public.activities (deal_id, occurred_at desc) where deal_id is not null;
create index if not exists activities_talent_idx on public.activities (talent_id, occurred_at desc) where talent_id is not null;
create index if not exists activities_brand_idx on public.activities (subject_brand_id, occurred_at desc) where subject_brand_id is not null;

create table if not exists public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_messages_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_messages_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_messages_deal_fk references public.deals (id) on delete cascade,
  channel text not null,
  talent_id uuid constraint deal_messages_talent_fk references public.talent_profiles (id) on delete cascade,
  author_id uuid constraint deal_messages_author_fk references auth.users (id) on delete set null,
  author_side text not null,
  author_label text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint deal_messages_channel_check check (channel in ('brand_agency', 'talent_agency')),
  constraint deal_messages_talent_check check ((channel = 'talent_agency') = (talent_id is not null)),
  constraint deal_messages_side_check check (author_side in ('agency', 'brand', 'talent')),
  constraint deal_messages_body_check check (char_length(btrim(body)) between 1 and 4000),
  constraint deal_messages_label_check check (char_length(author_label) <= 80)
);
create index if not exists deal_messages_deal_idx on public.deal_messages (deal_id, channel, created_at);

-- 5) tabelas de VALOR (só Adm e admin geral; exceções: a marca lê o próprio orçamento, o creator o próprio cachê) --
create table if not exists public.campaign_request_budgets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_request_budgets_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint campaign_request_budgets_brand_fk references public.brands (id) on delete cascade,
  request_id uuid not null constraint campaign_request_budgets_request_fk references public.campaign_requests (id) on delete cascade,
  budget_min_cents bigint,
  budget_max_cents bigint,
  note text not null default '',
  updated_by uuid constraint campaign_request_budgets_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_request_budgets_request_uq unique (request_id),
  constraint campaign_request_budgets_range_check check (
    (budget_min_cents is null or budget_min_cents between 0 and 10000000000) and
    (budget_max_cents is null or budget_max_cents between 0 and 10000000000) and
    (budget_min_cents is null or budget_max_cents is null or budget_min_cents <= budget_max_cents)),
  constraint campaign_request_budgets_note_check check (char_length(note) <= 300)
);

create table if not exists public.deal_talent_fees (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_talent_fees_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_talent_fees_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint deal_talent_fees_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deal_talent_fees_talent_fk references public.talent_profiles (id) on delete restrict,
  fee_cents bigint not null,
  currency text not null default 'BRL',
  set_by uuid constraint deal_talent_fees_set_by_fk references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_talent_fees_dt_uq unique (deal_talent_id),
  constraint deal_talent_fees_fee_check check (fee_cents between 0 and 10000000000),
  constraint deal_talent_fees_currency_check check (currency = 'BRL')
);

-- 6) documentos de pedido e de negócio -----------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_request_fk') then
    alter table public.documents add constraint documents_request_fk foreign key (request_id) references public.campaign_requests (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_deal_fk') then
    alter table public.documents add constraint documents_deal_fk foreign key (deal_id) references public.deals (id) on delete cascade;
  end if;
end $$;
create index if not exists documents_request_idx on public.documents (request_id) where request_id is not null;
create index if not exists documents_deal_idx on public.documents (deal_id) where deal_id is not null;

-- 7) gatilhos de escopo e de cascata -------------------------------------------------------------------------
-- filhas de negócio: agency_id (e brand_id) copiados do negócio; talento de outra agência recusado (D9)
create or replace function public.fill_deal_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid; v_brand uuid; v_talent_agency uuid;
begin
  if new.deal_id is null then return new; end if;
  select d.agency_id, d.brand_id into v_agency, v_brand from public.deals d where d.id = new.deal_id;
  if v_agency is null then raise exception 'deal_not_found' using errcode = 'P0002'; end if;
  new.agency_id := v_agency;
  if 'with_brand' = any (tg_argv) then new.brand_id := v_brand; end if;
  if 'with_talent' = any (tg_argv) then
    if new.talent_id is not null then
      select t.agency_id into v_talent_agency from public.talent_profiles t where t.id = new.talent_id;
      if v_talent_agency is distinct from v_agency then raise exception 'talent_agency_mismatch' using errcode = '22023'; end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fill_deal_scope() from public, anon, authenticated;

-- entregável: talent_id vem do par deal_talents (que precisa ser do mesmo negócio)
create or replace function public.fill_deliverable_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_deal uuid; v_talent uuid; v_agency uuid; v_brand uuid;
begin
  select dt.deal_id, dt.talent_id into v_deal, v_talent from public.deal_talents dt where dt.id = new.deal_talent_id;
  if v_deal is null then raise exception 'deal_talent_not_found' using errcode = 'P0002'; end if;
  if new.deal_id is distinct from v_deal then raise exception 'deal_mismatch' using errcode = '22023'; end if;
  select d.agency_id, d.brand_id into v_agency, v_brand from public.deals d where d.id = v_deal;
  new.agency_id := v_agency; new.brand_id := v_brand; new.talent_id := v_talent;
  return new;
end $$;
revoke execute on function public.fill_deliverable_scope() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['deal_team', 'deal_talents', 'activities', 'deal_messages', 'campaign_request_budgets', 'deal_talent_fees'] loop
    execute format('drop trigger if exists trg_%1$s_scope on public.%1$I', t);
  end loop;
  create trigger trg_deal_team_scope before insert or update of deal_id on public.deal_team for each row execute function public.fill_deal_scope();
  create trigger trg_deal_talents_scope before insert or update of deal_id, talent_id on public.deal_talents for each row execute function public.fill_deal_scope('with_talent');
  create trigger trg_activities_scope before insert or update of deal_id on public.activities for each row execute function public.fill_deal_scope();
  create trigger trg_deal_messages_scope before insert or update of deal_id, talent_id on public.deal_messages for each row execute function public.fill_deal_scope('with_brand', 'with_talent');
  create trigger trg_deal_talent_fees_scope before insert or update of deal_id, talent_id on public.deal_talent_fees for each row execute function public.fill_deal_scope('with_talent');
end $$;
drop trigger if exists trg_deliverables_scope on public.deliverables;
create trigger trg_deliverables_scope before insert or update of deal_id, deal_talent_id on public.deliverables
  for each row execute function public.fill_deliverable_scope();
drop trigger if exists trg_documents_deal_scope on public.documents;
create trigger trg_documents_deal_scope before insert or update of deal_id, talent_id on public.documents
  for each row when (new.deal_id is not null) execute function public.fill_deal_scope('with_brand', 'with_talent');
-- orçamento do pedido: agência e marca copiadas do pedido
create or replace function public.fill_request_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid; v_brand uuid;
begin
  select r.agency_id, r.brand_id into v_agency, v_brand from public.campaign_requests r where r.id = new.request_id;
  if v_agency is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  new.agency_id := v_agency; new.brand_id := v_brand;
  return new;
end $$;
revoke execute on function public.fill_request_scope() from public, anon, authenticated;
drop trigger if exists trg_campaign_request_budgets_scope on public.campaign_request_budgets;
create trigger trg_campaign_request_budgets_scope before insert or update of request_id on public.campaign_request_budgets
  for each row execute function public.fill_request_scope();
drop trigger if exists trg_talent_availability_scope on public.talent_availability;
create trigger trg_talent_availability_scope before insert or update of talent_id, agency_id on public.talent_availability
  for each row execute function public.fill_talent_scope();
-- documento de pedido: a marca e a agência vêm do pedido (confere)
create or replace function public.check_document_request_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid; v_brand uuid;
begin
  select r.agency_id, r.brand_id into v_agency, v_brand from public.campaign_requests r where r.id = new.request_id;
  if v_agency is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if new.agency_id is distinct from v_agency or new.brand_id is distinct from v_brand then raise exception 'request_scope_mismatch' using errcode = '22023'; end if;
  return new;
end $$;
revoke execute on function public.check_document_request_scope() from public, anon, authenticated;
drop trigger if exists trg_documents_request_scope on public.documents;
create trigger trg_documents_request_scope before insert or update of request_id, agency_id, brand_id on public.documents
  for each row when (new.request_id is not null) execute function public.check_document_request_scope();

-- creator recusou ou saiu: os entregáveis dele ainda não produzidos são cancelados (definição única da contagem)
create or replace function public.deal_talents_status_cascade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('declined', 'removed') and old.status is distinct from new.status then
    update public.deliverables set status = 'cancelled' where deal_talent_id = new.id and status in ('planned', 'in_production');
  end if;
  return new;
end $$;
revoke execute on function public.deal_talents_status_cascade() from public, anon, authenticated;
drop trigger if exists trg_deal_talents_cascade on public.deal_talents;
create trigger trg_deal_talents_cascade after update of status on public.deal_talents for each row execute function public.deal_talents_status_cascade();

-- contato registrado com o talento atualiza "último contato" (alerta de relacionamento)
create or replace function public.activities_touch_contact()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.talent_id is not null and new.kind in ('call', 'meeting', 'message', 'email') then
    update public.talent_profiles set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at) where id = new.talent_id;
  end if;
  return new;
end $$;
revoke execute on function public.activities_touch_contact() from public, anon, authenticated;
drop trigger if exists trg_activities_contact on public.activities;
create trigger trg_activities_contact after insert on public.activities for each row execute function public.activities_touch_contact();

-- 8) updated_at, grants e RLS -----------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['talent_availability', 'campaign_requests', 'deals', 'deal_team', 'deal_talents', 'deliverables', 'activities', 'deal_messages',
                           'campaign_request_budgets', 'deal_talent_fees'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
    if t not in ('deal_team', 'activities', 'deal_messages') then
      execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
      execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;

-- 9) funções auxiliares (3.2) ----------------------------------------------------------------------------------
create or replace function public.my_staff_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d.id), '{}'::uuid[]) from public.deals d
  where d.agency_id = any (public.my_agency_ids('staff'))
    and (d.owner_id = auth.uid() or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = auth.uid()))
$$;
create or replace function public.my_talent_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.deal_id), '{}'::uuid[]) from public.deal_talents dt
  where dt.talent_id = public.my_talent_id() and dt.consulted_at is not null
$$;
create or replace function public.my_talent_brand_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct d.brand_id), '{}'::uuid[]) from public.deals d where d.id = any (public.my_talent_deal_ids())
$$;
create or replace function public.my_talent_deal_talent_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.id), '{}'::uuid[]) from public.deal_talents dt
  where dt.talent_id = public.my_talent_id() and dt.consulted_at is not null
$$;
create or replace function public.my_brand_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d.id), '{}'::uuid[]) from public.deals d
  where d.brand_visible and d.brand_id = any (public.my_brand_ids(false))
$$;
-- creators que a marca pode conhecer: o que ela mesma pediu, e os propostos/contratados a partir da proposta
create or replace function public.my_brand_deal_talent_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.id), '{}'::uuid[]) from public.deal_talents dt
  join public.deals d on d.id = dt.deal_id
  where d.id = any (public.my_brand_deal_ids()) and dt.status in ('proposed', 'contracted')
    and d.stage in ('proposal_sent','negotiation','approved','contracting','production','approval','delivery','closed')
$$;
do $$
declare f text;
begin
  foreach f in array array['public.my_staff_deal_ids()', 'public.my_talent_deal_ids()', 'public.my_talent_brand_ids()', 'public.my_talent_deal_talent_ids()',
                           'public.my_brand_deal_ids()', 'public.my_brand_deal_talent_ids()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ordem das 13 etapas e a etapa vista pela marca
create or replace function public.deal_stage_index(p_stage text)
returns int language sql immutable set search_path = '' as $$
  select array_position(array['briefing_received','qualification','shortlist','consultation','proposal_prep','proposal_sent','negotiation',
                              'approved','contracting','production','approval','delivery','closed'], p_stage)
$$;
create or replace function public.deal_brand_status(p_stage text, p_outcome text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_stage = 'closed' then case when p_outcome = 'won' then 'done' else 'cancelled' end
    when public.deal_stage_index(p_stage) <= 2 then 'received'
    when public.deal_stage_index(p_stage) <= 5 then 'building'
    when public.deal_stage_index(p_stage) <= 7 then 'proposal'
    when public.deal_stage_index(p_stage) <= 9 then 'contracting'
    else 'running' end
$$;
-- movimento manual permitido? (porteiras só pelas RPCs próprias; espelho de src/lib/agency/stages.ts)
create or replace function public.deal_stage_can(p_role text, p_is_owner boolean, p_from text, p_to text)
returns boolean language sql immutable set search_path = '' as $$
  select public.deal_stage_index(p_from) is not null and public.deal_stage_index(p_to) is not null
    and p_from <> p_to and p_to <> 'closed' and p_from <> 'closed'
    and p_to not in ('proposal_sent', 'approved', 'production')
    and (public.agency_role_rank(p_role) >= 2 or (p_role = 'staff' and coalesce(p_is_owner, false)))
    -- de produção em diante não volta para antes da produção
    and not (public.deal_stage_index(p_from) >= 10 and public.deal_stage_index(p_to) < 10)
    -- aprovado/contratando só avançam ou reabrem pela RPC própria
    and not (p_from in ('approved', 'contracting') and public.deal_stage_index(p_to) < 8)
$$;
revoke execute on function public.deal_stage_index(text) from public, anon;
grant execute on function public.deal_stage_index(text) to authenticated, service_role;
revoke execute on function public.deal_brand_status(text, text) from public, anon;
grant execute on function public.deal_brand_status(text, text) to authenticated, service_role;
revoke execute on function public.deal_stage_can(text, boolean, text, text) from public, anon;
grant execute on function public.deal_stage_can(text, boolean, text, text) to authenticated, service_role;

-- escopo de escrita da agência sobre um negócio: sem acesso → not_found; sem papel (gestor+, ou colaborador
-- responsável/da equipe quando p_owner_ok) → forbidden; fechado → invalid_stage quando p_open_only. Devolve a agência.
create or replace function public.deal_write_scope(p_deal uuid, p_owner_ok boolean default false, p_open_only boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_stage text; v_mine boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.agency_id, d.stage, (d.owner_id = auth.uid() or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = auth.uid()))
    into v_agency, v_stage, v_mine from public.deals d where d.id = p_deal for update;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_agency, 'manager') then
    if not (p_owner_ok and coalesce(v_mine, false)) then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if p_open_only and v_stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  return v_agency;
end $$;
revoke execute on function public.deal_write_scope(uuid, boolean, boolean) from public, anon, authenticated;

-- nome de quem age (membro da agência, da marca ou talento), para author_label
create or replace function public.actor_label(p_agency uuid, p_brand uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  select left(coalesce(
    (select m.display_name from public.agency_members m where m.agency_id = p_agency and m.user_id = auth.uid() and m.revoked_at is null),
    (select bm.display_name from public.brand_members bm where bm.brand_id = p_brand and bm.user_id = auth.uid() and bm.revoked_at is null),
    (select t.display_name from public.talent_profiles t where t.id = public.my_talent_id()),
    (select p.display_name from public.profiles p where p.id = auth.uid()), ''), 80)
$$;
revoke execute on function public.actor_label(uuid, uuid) from public, anon, authenticated;

-- 10) políticas de leitura (3.3) ------------------------------------------------------------------------------
-- disponibilidade: agência e o próprio talento (a marca lê só o "disponível" por RPC)
drop policy if exists talent_availability_select_agency on public.talent_availability;
create policy talent_availability_select_agency on public.talent_availability for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists talent_availability_select_talent on public.talent_availability;
create policy talent_availability_select_talent on public.talent_availability for select to authenticated
  using (talent_id = (select public.my_talent_id()));

-- pedidos: gestor+ tudo menos rascunho da marca; colaborador os dos negócios dele; marca os próprios (origem marca,
-- inclusive rascunho) e os de origem agência cujo negócio está visível
drop policy if exists campaign_requests_select_agency on public.campaign_requests;
create policy campaign_requests_select_agency on public.campaign_requests for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) and not (origin = 'brand' and status = 'draft'));
drop policy if exists campaign_requests_select_staff on public.campaign_requests;
create policy campaign_requests_select_staff on public.campaign_requests for select to authenticated
  using (exists (select 1 from public.deals d where d.request_id = campaign_requests.id and d.id = any ((select public.my_staff_deal_ids())::uuid[])));
drop policy if exists campaign_requests_select_brand on public.campaign_requests;
create policy campaign_requests_select_brand on public.campaign_requests for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and (origin = 'brand' or exists (select 1 from public.deals d where d.request_id = campaign_requests.id and d.brand_visible)));

drop policy if exists deals_select_agency on public.deals;
create policy deals_select_agency on public.deals for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists deals_select_staff on public.deals;
create policy deals_select_staff on public.deals for select to authenticated
  using (id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deals_select_brand on public.deals;
create policy deals_select_brand on public.deals for select to authenticated
  using (brand_visible and brand_id = any ((select public.my_brand_ids(false))::uuid[]));
drop policy if exists deals_select_talent on public.deals;
create policy deals_select_talent on public.deals for select to authenticated
  using (id = any ((select public.my_talent_deal_ids())::uuid[]));

drop policy if exists deal_team_select_agency on public.deal_team;
create policy deal_team_select_agency on public.deal_team for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));

-- deal_talents: só a agência (o creator usa talent_opportunities; a marca, brand_campaign_detail)
drop policy if exists deal_talents_select_agency on public.deal_talents;
create policy deal_talents_select_agency on public.deal_talents for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));

drop policy if exists deliverables_select_agency on public.deliverables;
create policy deliverables_select_agency on public.deliverables for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deliverables_select_talent on public.deliverables;
create policy deliverables_select_talent on public.deliverables for select to authenticated
  using (deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]));
drop policy if exists deliverables_select_brand on public.deliverables;
create policy deliverables_select_brand on public.deliverables for select to authenticated
  using (deal_talent_id = any ((select public.my_brand_deal_talent_ids())::uuid[]));

drop policy if exists activities_select_agency on public.activities;
create policy activities_select_agency on public.activities for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists activities_select_staff on public.activities;
create policy activities_select_staff on public.activities for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[])
         and (subject_type <> 'deal' or deal_id = any ((select public.my_staff_deal_ids())::uuid[])));

drop policy if exists deal_messages_select_agency on public.deal_messages;
create policy deal_messages_select_agency on public.deal_messages for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deal_messages_select_brand on public.deal_messages;
create policy deal_messages_select_brand on public.deal_messages for select to authenticated
  using (channel = 'brand_agency' and deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
drop policy if exists deal_messages_select_talent on public.deal_messages;
create policy deal_messages_select_talent on public.deal_messages for select to authenticated
  using (channel = 'talent_agency' and talent_id = (select public.my_talent_id()) and deal_id = any ((select public.my_talent_deal_ids())::uuid[]));

-- valor: Adm (e admin geral); a marca lê só o próprio orçamento de pedido de origem marca; o creator o próprio cachê
drop policy if exists campaign_request_budgets_select_agency on public.campaign_request_budgets;
create policy campaign_request_budgets_select_agency on public.campaign_request_budgets for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists campaign_request_budgets_select_brand on public.campaign_request_budgets;
create policy campaign_request_budgets_select_brand on public.campaign_request_budgets for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and exists (select 1 from public.campaign_requests r where r.id = campaign_request_budgets.request_id and r.origin = 'brand'));
drop policy if exists deal_talent_fees_select_agency on public.deal_talent_fees;
create policy deal_talent_fees_select_agency on public.deal_talent_fees for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists deal_talent_fees_select_talent on public.deal_talent_fees;
create policy deal_talent_fees_select_talent on public.deal_talent_fees for select to authenticated
  using (deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]));

-- marcas: o creator lê nome/logo das marcas dos negócios em que foi consultado (mesmo "inactive")
drop policy if exists brands_select_talent on public.brands;
create policy brands_select_talent on public.brands for select to authenticated
  using (id = any ((select public.my_talent_brand_ids())::uuid[]));

-- documentos: forma final (0064 + talento + pedido + negócio)
drop policy if exists documents_select_agency_admin on public.documents;
create policy documents_select_agency_admin on public.documents for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[])
         and (scope_type <> 'request' or exists (select 1 from public.campaign_requests r where r.id = documents.request_id)));
drop policy if exists documents_select_agency on public.documents;
create policy documents_select_agency on public.documents for select to authenticated
  using (not restricted and status <> 'archived' and agency_id = any ((select public.my_agency_ids('staff'))::uuid[])
         and (scope_type in ('agency', 'brand', 'talent')
              or (scope_type = 'deal' and (agency_id = any ((select public.my_agency_ids('manager'))::uuid[])
                                           or deal_id = any ((select public.my_staff_deal_ids())::uuid[])))
              or (scope_type = 'request' and exists (select 1 from public.campaign_requests r where r.id = documents.request_id))));
drop policy if exists documents_select_brand on public.documents;
create policy documents_select_brand on public.documents for select to authenticated
  using (share_brand and status = 'ready' and brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and (deal_id is null or deal_id = any ((select public.my_brand_deal_ids())::uuid[])));

-- 11) RPCs: proposta da marca ------------------------------------------------------------------------------------
create or replace function public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  if p_id is not null then
    -- D19: o pedido precisa ser desta marca, de origem marca e ainda rascunho
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.brand_id = p_brand and r.origin = 'brand') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.status = 'draft') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  end if;
  begin
    if p_data ? 'talent_id' then v_talent := nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid; end if;
    v_period_start := nullif(btrim(coalesce(p_data ->> 'period_start', '')), '')::date;
    v_period_end := nullif(btrim(coalesce(p_data ->> 'period_end', '')), '')::date;
    v_desired := nullif(btrim(coalesce(p_data ->> 'desired_at', '')), '')::timestamptz;
    v_duration := nullif(btrim(coalesce(p_data ->> 'duration_minutes', '')), '')::int;
    v_min := nullif(btrim(coalesce(p_data ->> 'budget_min_cents', '')), '')::bigint;
    v_max := nullif(btrim(coalesce(p_data ->> 'budget_max_cents', '')), '')::bigint;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_segments from jsonb_array_elements_text(coalesce(p_data -> 'segment_ids', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_ages from jsonb_array_elements_text(coalesce(p_data -> 'target_age_bands', '[]'::jsonb)) x;
    select coalesce(array_agg(upper(x)), '{}'::text[]) into v_states from jsonb_array_elements_text(coalesce(p_data -> 'target_states', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_deliverables := coalesce(p_data -> 'deliverables', '[]'::jsonb);
  -- o creator desejado precisa estar no catálogo autorizado da agência que atende a marca
  if v_talent is not null and not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = v_agency
                                          and t.catalog_visible and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if cardinality(v_segments) > 0 and exists (select 1 from unnest(v_segments) s where not exists (select 1 from public.talent_segments g where g.id = s and g.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if p_id is null then
      insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, product, target_audience, target_age_bands,
                                            target_states, region_note, period_start, period_end, desired_at, duration_minutes, format, location, networks,
                                            deliverables, segment_ids, notes)
      values (v_agency, p_brand, 'brand', auth.uid(), v_talent, btrim(coalesce(p_data ->> 'title', '')), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'product', '')), btrim(coalesce(p_data ->> 'target_audience', '')), v_ages, v_states,
              btrim(coalesce(p_data ->> 'region_note', '')), v_period_start, v_period_end, v_desired, v_duration, nullif(p_data ->> 'format', ''),
              btrim(coalesce(p_data ->> 'location', '')), v_networks, v_deliverables, v_segments, btrim(coalesce(p_data ->> 'notes', '')))
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
        notes = case when p_data ? 'notes' then btrim(coalesce(p_data ->> 'notes', '')) else notes end
      where id = p_id returning id into v_id;
    end if;
    -- valor oferecido pela marca (tabela de valor: a marca lê o próprio; gestor e colaborador não leem)
    if p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note' then
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
      values (v_agency, p_brand, v_id, v_min, v_max, btrim(coalesce(p_data ->> 'budget_note', '')), auth.uid())
      on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
        note = excluded.note, updated_by = excluded.updated_by;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end $$;

-- envio: cria o negócio na mesma transação e avisa a agência
create or replace function public.brand_request_submit(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_deal uuid; v_owner uuid; v_brand_name text; v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(btrim(r.title)) < 3 or r.objective is null or r.period_start is null or cardinality(r.networks) = 0
     or jsonb_array_length(r.deliverables) = 0 then
    raise exception 'request_incomplete' using errcode = '22023';
  end if;
  if not exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id
                 where ab.agency_id = r.agency_id and ab.brand_id = r.brand_id and ab.status = 'active' and a.status = 'active') then
    raise exception 'brand_not_linked' using errcode = 'P0001';
  end if;
  select ab.account_manager_id into v_owner from public.agency_brands ab where ab.agency_id = r.agency_id and ab.brand_id = r.brand_id;
  if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = r.agency_id and m.user_id = v_owner and m.revoked_at is null) then
    v_owner := null;
  end if;
  insert into public.deals (agency_id, brand_id, request_id, title, stage, owner_id, created_by, brand_visible, segment_ids, expected_start, expected_end, is_demo)
  values (r.agency_id, r.brand_id, r.id, btrim(r.title), 'briefing_received', v_owner, auth.uid(), true, r.segment_ids, r.period_start,
          coalesce(r.period_end, r.period_start), public.agency_is_demo(r.agency_id))
  returning id into v_deal;
  -- o creator desejado entra sugerido no negócio (a agência decide se consulta)
  if r.talent_id is not null then
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    values (r.agency_id, v_deal, r.talent_id, 'suggested', auth.uid(), '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb)
    on conflict (deal_id, talent_id) do nothing;
  end if;
  update public.campaign_requests set status = 'converted', submitted_at = now() where id = p_id;
  select b.name into v_brand_name from public.brands b where b.id = r.brand_id;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (r.agency_id, 'deal', v_deal, 'system', 'briefing_received', auth.uid(), v_label);
  perform public.audit_log('request.submit', 'campaign_request', p_id::text, null,
    jsonb_build_object('agency_id', r.agency_id, 'brand_id', r.brand_id, 'deal_id', v_deal, 'talent_id', r.talent_id), null, 'brand'::public.actor_type);
  perform public.inbox_notify_agency(r.agency_id, 'manager', 'briefing_received', '/agencia/negocios/' || v_deal::text,
    jsonb_build_object('brand', v_brand_name, 'deal', btrim(r.title)), 'deal', v_deal, 'briefing:' || v_deal::text);
  if v_owner is not null and not public.agency_can(r.agency_id, 'manager') then
    perform public.inbox_notify(v_owner, 'briefing_received', '/agencia/negocios/' || v_deal::text,
      jsonb_build_object('brand', v_brand_name, 'deal', btrim(r.title)), r.agency_id, 'deal', v_deal, 'briefing:' || v_deal::text || ':' || v_owner::text);
  end if;
  return v_deal;
end $$;

-- a marca cancela a própria proposta enquanto a agência ainda não confirmou
create or replace function public.brand_request_cancel(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_deal public.deals%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  if r.status = 'draft' then
    update public.campaign_requests set status = 'cancelled', decided_at = now() where id = p_id;
    return;
  end if;
  select * into v_deal from public.deals d where d.request_id = p_id for update;
  if r.status <> 'converted' or v_deal.id is null or public.deal_stage_index(v_deal.stage) >= 8 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.deals set stage = 'closed', outcome = 'cancelled', stage_changed_at = now(), closed_at = now() where id = v_deal.id;
  update public.deal_talents set status = 'removed' where deal_id = v_deal.id and status not in ('declined', 'removed');
  update public.campaign_requests set status = 'cancelled', decided_at = now() where id = p_id;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (r.agency_id, 'deal', v_deal.id, 'stage_change', btrim(p_note), auth.uid(), public.actor_label(r.agency_id, r.brand_id));
  perform public.audit_log('deal.stage', 'deal', v_deal.id::text, jsonb_build_object('agency_id', r.agency_id, 'stage', v_deal.stage),
    jsonb_build_object('agency_id', r.agency_id, 'stage', 'closed', 'outcome', 'cancelled'), btrim(p_note), 'brand'::public.actor_type);
  perform public.inbox_notify_agency(r.agency_id, 'manager', 'campaign_status_changed', '/agencia/negocios/' || v_deal.id::text,
    jsonb_build_object('deal', v_deal.title, 'status', 'cancelled'), 'deal', v_deal.id, 'cancel:' || v_deal.id::text);
end $$;

-- 12) RPCs: negócio (agência) ------------------------------------------------------------------------------------
create or replace function public.agency_deal_create(p_agency uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request uuid; v_deal uuid; v_title text; v_start date; v_end date; v_owner uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.status = 'active') or not public.agency_can(p_agency, 'staff') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = p_brand and ab.status = 'active') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_title := btrim(coalesce(p_data ->> 'title', ''));
  begin
    v_start := nullif(btrim(coalesce(p_data ->> 'expected_start', '')), '')::date;
    v_end := nullif(btrim(coalesce(p_data ->> 'expected_end', '')), '')::date;
    if p_data ? 'owner_id' then v_owner := nullif(btrim(coalesce(p_data ->> 'owner_id', '')), '')::uuid; end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  -- colaborador vira o responsável; gestor+ escolhe (membro ativo da agência)
  if not public.agency_can(p_agency, 'manager') then v_owner := auth.uid(); end if;
  v_owner := coalesce(v_owner, auth.uid());
  if not exists (select 1 from public.agency_members m where m.agency_id = p_agency and m.user_id = v_owner and m.revoked_at is null)
     and not (v_owner = auth.uid() and public.is_platform_admin()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    insert into public.campaign_requests (agency_id, brand_id, origin, created_by, title, notes, status, submitted_at, period_start, period_end)
    values (p_agency, p_brand, 'agency', auth.uid(), v_title, btrim(coalesce(p_data ->> 'notes', '')), 'converted', now(), v_start, v_end)
    returning id into v_request;
    insert into public.deals (agency_id, brand_id, request_id, title, stage, owner_id, created_by, brand_visible, talent_brief, expected_start, expected_end, is_demo)
    values (p_agency, p_brand, v_request, v_title, 'briefing_received', v_owner, auth.uid(), false, btrim(coalesce(p_data ->> 'talent_brief', '')),
            v_start, v_end, public.agency_is_demo(p_agency))
    returning id into v_deal;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (p_agency, 'deal', v_deal, 'system', 'deal_created', auth.uid(), public.actor_label(p_agency));
  perform public.audit_log('deal.create', 'deal', v_deal::text, null,
    jsonb_build_object('agency_id', p_agency, 'brand_id', p_brand, 'owner_id', v_owner), null, public.talent_audit_actor('agency', p_agency));
  if v_owner <> auth.uid() then
    perform public.inbox_notify(v_owner, 'deal_assigned', '/agencia/negocios/' || v_deal::text, jsonb_build_object('deal', v_title), p_agency, 'deal', v_deal, null);
  end if;
  return v_deal;
end $$;

create or replace function public.agency_deal_update(p_deal uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_before jsonb; v_after jsonb; v_owner uuid; v_start date; v_end date; v_segments uuid[]; v_is_manager boolean;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, true);
  v_is_manager := public.agency_can(v_agency, 'manager');
  select jsonb_build_object('agency_id', d.agency_id, 'title', d.title, 'talent_brief', d.talent_brief, 'owner_id', d.owner_id,
                            'expected_start', d.expected_start, 'expected_end', d.expected_end, 'segment_ids', to_jsonb(d.segment_ids))
    into v_before from public.deals d where d.id = p_deal;
  begin
    v_start := nullif(btrim(coalesce(p_data ->> 'expected_start', '')), '')::date;
    v_end := nullif(btrim(coalesce(p_data ->> 'expected_end', '')), '')::date;
    if p_data ? 'owner_id' then v_owner := nullif(btrim(coalesce(p_data ->> 'owner_id', '')), '')::uuid; end if;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_segments from jsonb_array_elements_text(coalesce(p_data -> 'segment_ids', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if p_data ? 'owner_id' and not v_is_manager then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = v_agency and m.user_id = v_owner and m.revoked_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_data ? 'segment_ids' and exists (select 1 from unnest(v_segments) s where not exists (select 1 from public.talent_segments g where g.id = s and g.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    update public.deals set
      title = case when p_data ? 'title' then btrim(coalesce(p_data ->> 'title', '')) else title end,
      talent_brief = case when p_data ? 'talent_brief' then btrim(coalesce(p_data ->> 'talent_brief', '')) else talent_brief end,
      owner_id = case when p_data ? 'owner_id' then v_owner else owner_id end,
      expected_start = case when p_data ? 'expected_start' then v_start else expected_start end,
      expected_end = case when p_data ? 'expected_end' then v_end else expected_end end,
      segment_ids = case when p_data ? 'segment_ids' then v_segments else segment_ids end
    where id = p_deal;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select jsonb_build_object('agency_id', d.agency_id, 'title', d.title, 'talent_brief', d.talent_brief, 'owner_id', d.owner_id,
                            'expected_start', d.expected_start, 'expected_end', d.expected_end, 'segment_ids', to_jsonb(d.segment_ids))
    into v_after from public.deals d where d.id = p_deal;
  if v_before is distinct from v_after then
    perform public.audit_log('deal.update', 'deal', p_deal::text, v_before, v_after, null, public.talent_audit_actor('agency', v_agency));
    if (v_after ->> 'owner_id') is distinct from (v_before ->> 'owner_id') and (v_after ->> 'owner_id') is not null then
      perform public.inbox_notify((v_after ->> 'owner_id')::uuid, 'deal_assigned', '/agencia/negocios/' || p_deal::text,
        jsonb_build_object('deal', v_after ->> 'title'), v_agency, 'deal', p_deal, null);
    end if;
  end if;
end $$;

create or replace function public.agency_deal_team_set(p_deal uuid, p_user_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_ids uuid[]; v_before uuid[]; v_new uuid; v_title text;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_user_ids, '{}'::uuid[])) x where x is not null;
  if cardinality(v_ids) > 10 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.agency_members m where m.agency_id = v_agency and m.user_id = x and m.revoked_at is null)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(t.user_id), '{}'::uuid[]) into v_before from public.deal_team t where t.deal_id = p_deal;
  select d.title into v_title from public.deals d where d.id = p_deal;
  delete from public.deal_team t where t.deal_id = p_deal and not (t.user_id = any (v_ids));
  insert into public.deal_team (agency_id, deal_id, user_id, added_by) select v_agency, p_deal, x, auth.uid() from unnest(v_ids) x
  on conflict (deal_id, user_id) do nothing;
  perform public.audit_log('deal.team', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'team', to_jsonb(v_before)),
    jsonb_build_object('agency_id', v_agency, 'team', to_jsonb(v_ids)), null, public.talent_audit_actor('agency', v_agency));
  foreach v_new in array v_ids loop
    if not (v_new = any (v_before)) and v_new <> auth.uid() then
      perform public.inbox_notify(v_new, 'deal_assigned', '/agencia/negocios/' || p_deal::text, jsonb_build_object('deal', v_title), v_agency, 'deal', p_deal, null);
    end if;
  end loop;
end $$;

-- mudança de etapa manual (as porteiras proposal_sent/approved/production só pelas RPCs próprias)
create or replace function public.agency_deal_move(p_deal uuid, p_to text, p_outcome text default null, p_note text default null, p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_role text; v_owner boolean; v_note text := btrim(coalesce(p_note, '')); v_prev text;
begin
  v_agency := public.deal_write_scope(p_deal, true, false);
  select * into d from public.deals where id = p_deal;
  v_role := coalesce(public.agency_role_of(v_agency), case when public.is_platform_admin() then 'admin' end);
  v_owner := d.owner_id = auth.uid() or exists (select 1 from public.deal_team t where t.deal_id = p_deal and t.user_id = auth.uid());
  if p_to = 'closed' then
    if p_outcome not in ('won', 'lost', 'cancelled') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if d.stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
    if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_outcome = 'won' then
      if d.stage <> 'delivery' and not (coalesce(p_force, false) and public.agency_can(v_agency, 'admin')) then raise exception 'stage_gate' using errcode = 'P0001'; end if;
      if exists (select 1 from public.deliverables x where x.deal_id = p_deal and x.status not in ('done', 'cancelled'))
         and not (coalesce(p_force, false) and public.agency_can(v_agency, 'admin')) then
        raise exception 'deliverables_open' using errcode = 'P0001';
      end if;
    else
      if char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
      if public.deal_stage_index(d.stage) >= 10 and not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
    end if;
    update public.deals set stage = 'closed', outcome = p_outcome, stage_changed_at = now(), closed_at = now() where id = p_deal;
  elsif d.stage = 'closed' then
    -- reabrir: só o Adm, com nota; volta para a etapa informada (antes de fechar)
    if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
    if public.deal_stage_index(p_to) is null or p_to in ('proposal_sent', 'production') then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.deals set stage = p_to, outcome = null, stage_changed_at = now(), closed_at = null where id = p_deal;
  else
    if not public.deal_stage_can(v_role, v_owner, d.stage, p_to) then
      if p_to in ('proposal_sent', 'approved', 'production') then raise exception 'stage_gate' using errcode = 'P0001'; end if;
      if public.deal_stage_index(p_to) is null then raise exception 'invalid_input' using errcode = '22023'; end if;
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if public.deal_stage_index(p_to) < public.deal_stage_index(d.stage) and char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
    update public.deals set stage = p_to, stage_changed_at = now() where id = p_deal;
  end if;
  v_prev := d.stage;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', p_deal, 'stage_change', v_note, auth.uid(), public.actor_label(v_agency));
  perform public.audit_log('deal.stage', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'stage', v_prev, 'outcome', d.outcome),
    jsonb_build_object('agency_id', v_agency, 'stage', p_to, 'outcome', p_outcome), nullif(v_note, ''), public.talent_audit_actor('agency', v_agency));
  if d.brand_visible and public.deal_brand_status(v_prev, d.outcome) is distinct from public.deal_brand_status(p_to, p_outcome) then
    perform public.inbox_notify_brand(d.brand_id, false, 'campaign_status_changed', '/marca/campanhas/' || d.request_id::text,
      jsonb_build_object('deal', d.title, 'status', public.deal_brand_status(p_to, p_outcome)), v_agency, 'deal', p_deal,
      'status:' || p_deal::text || ':' || public.deal_brand_status(p_to, p_outcome));
  end if;
end $$;

-- elenco sugerido (shortlist): acrescenta ou mantém; remove só os ainda "sugeridos"
create or replace function public.agency_shortlist_set(p_deal uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; e jsonb; v_talent uuid; v_ids uuid[] := '{}'::uuid[]; v_stage text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, false);
  select d.stage into v_stage from public.deals d where d.id = p_deal;
  if public.deal_stage_index(v_stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  for e in select value from jsonb_array_elements(p_items) loop
    begin v_talent := (e ->> 'talent_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = v_agency and t.archived_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if e ? 'reasons' and (jsonb_typeof(e -> 'reasons') <> 'array' or jsonb_array_length(e -> 'reasons') > 10
       or exists (select 1 from jsonb_array_elements(e -> 'reasons') r where jsonb_typeof(r) <> 'object'
                  or (r ->> 'code') not in ('segment','region','audience_age','network','availability','brand_choice'))) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_ids := v_ids || v_talent;
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    values (v_agency, p_deal, v_talent, 'suggested', auth.uid(), coalesce(e -> 'reasons', '[]'::jsonb))
    on conflict (deal_id, talent_id) do update set reasons = case when e ? 'reasons' then excluded.reasons else public.deal_talents.reasons end;
  end loop;
  delete from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'suggested' and not (dt.talent_id = any (v_ids));
  if v_stage in ('briefing_received', 'qualification') and cardinality(v_ids) > 0 then
    update public.deals set stage = 'shortlist', stage_changed_at = now() where id = p_deal;
  end if;
  perform public.audit_log('deal.shortlist', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency, 'talents', to_jsonb(v_ids)), null,
    public.talent_audit_actor('agency', v_agency));
end $$;

create or replace function public.agency_activity_add(p_subject_type text, p_subject_id uuid, p_kind text, p_body text, p_occurred_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind not in ('call', 'meeting', 'message', 'email', 'note') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if char_length(v_body) between 1 and 4000 is not true then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_occurred_at is null or p_occurred_at > now() + interval '1 day' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_subject_type = 'deal' then
    v_agency := public.deal_write_scope(p_subject_id, true, false);
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, occurred_at, author_id, author_label)
    values (v_agency, 'deal', p_subject_id, p_kind, v_body, p_occurred_at, auth.uid(), public.actor_label(v_agency)) returning id into v_id;
  elsif p_subject_type = 'talent' then
    select t.agency_id into v_agency from public.talent_profiles t where t.id = p_subject_id;
    if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
    insert into public.activities (agency_id, subject_type, talent_id, kind, body, occurred_at, author_id, author_label)
    values (v_agency, 'talent', p_subject_id, p_kind, v_body, p_occurred_at, auth.uid(), public.actor_label(v_agency)) returning id into v_id;
  elsif p_subject_type = 'brand' then
    select ab.agency_id into v_agency from public.agency_brands ab where ab.brand_id = p_subject_id and ab.status = 'active'
      and ab.agency_id = any (public.my_agency_ids('staff')) limit 1;
    if v_agency is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    insert into public.activities (agency_id, subject_type, subject_brand_id, kind, body, occurred_at, author_id, author_label)
    values (v_agency, 'brand', p_subject_id, p_kind, v_body, p_occurred_at, auth.uid(), public.actor_label(v_agency)) returning id into v_id;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return v_id;
end $$;

-- conversa registrada: marca↔agência e talento↔agência (nunca valores: a tela avisa)
create or replace function public.deal_message_post(p_deal uuid, p_channel text, p_talent uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_side text; v_id uuid; v_body text := btrim(coalesce(p_body, '')); v_label text; v_to uuid; r record;
        v_dedupe text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_channel not in ('brand_agency', 'talent_agency') or char_length(v_body) not between 1 and 4000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids()) then
    v_side := 'agency';
  elsif p_channel = 'brand_agency' and d.brand_visible and public.brand_member_of(d.brand_id) is not null then
    v_side := 'brand';
  elsif p_channel = 'talent_agency' and p_talent = public.my_talent_id() and d.id = any (public.my_talent_deal_ids()) then
    v_side := 'talent';
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_channel = 'talent_agency' then
    if p_talent is null or not exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.talent_id = p_talent and dt.consulted_at is not null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  if d.stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  v_label := public.actor_label(d.agency_id, d.brand_id);
  insert into public.deal_messages (agency_id, brand_id, deal_id, channel, talent_id, author_id, author_side, author_label, body)
  values (d.agency_id, d.brand_id, p_deal, p_channel, case when p_channel = 'talent_agency' then p_talent end, auth.uid(), v_side, v_label, v_body)
  returning id into v_id;
  v_dedupe := 'msg:' || p_deal::text || ':' || p_channel || ':' || to_char(now(), 'YYYYMMDDHH24');
  if v_side = 'agency' then
    if p_channel = 'brand_agency' then
      perform public.inbox_notify_brand(d.brand_id, false, 'message_received', '/marca/campanhas/' || d.request_id::text,
        jsonb_build_object('deal', d.title, 'name', v_label), d.agency_id, 'deal', p_deal, v_dedupe);
    else
      v_to := public.talent_user_id(p_talent);
      select dt.id into r from public.deal_talents dt where dt.deal_id = p_deal and dt.talent_id = p_talent;
      perform public.inbox_notify(v_to, 'message_received', '/creator/escritorio/oportunidades/' || r.id::text,
        jsonb_build_object('deal', d.title, 'name', v_label), d.agency_id, 'deal_talent', r.id, v_dedupe || ':' || coalesce(v_to::text, ''));
    end if;
  else
    -- marca ou talento → responsável do negócio (senão gestores e Adm)
    if d.owner_id is not null and exists (select 1 from public.agency_members m where m.agency_id = d.agency_id and m.user_id = d.owner_id and m.revoked_at is null) then
      perform public.inbox_notify(d.owner_id, 'message_received', '/agencia/negocios/' || p_deal::text || '/conversa',
        jsonb_build_object('deal', d.title, 'name', v_label), d.agency_id, 'deal', p_deal, v_dedupe || ':' || d.owner_id::text);
    else
      perform public.inbox_notify_agency(d.agency_id, 'manager', 'message_received', '/agencia/negocios/' || p_deal::text || '/conversa',
        jsonb_build_object('deal', d.title, 'name', v_label), 'deal', p_deal, v_dedupe);
    end if;
  end if;
  return v_id;
end $$;

-- cachê do creator (tabela de valor): só o Adm; o creator vê o próprio depois de consultado
create or replace function public.agency_fee_set(p_deal_talent uuid, p_fee_cents bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; d public.deals%rowtype; v_before bigint; v_to uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into dt from public.deal_talents where id = p_deal_talent for update;
  if dt.id is null or not public.agency_can(dt.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(dt.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_fee_cents is null or p_fee_cents < 0 or p_fee_cents > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = dt.deal_id;
  if public.deal_stage_index(d.stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if dt.status in ('declined', 'removed') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select f.fee_cents into v_before from public.deal_talent_fees f where f.deal_talent_id = p_deal_talent;
  insert into public.deal_talent_fees (agency_id, deal_id, deal_talent_id, talent_id, fee_cents, set_by, set_at)
  values (dt.agency_id, dt.deal_id, dt.id, dt.talent_id, p_fee_cents, auth.uid(), now())
  on conflict (deal_talent_id) do update set fee_cents = excluded.fee_cents, set_by = excluded.set_by, set_at = now();
  update public.deal_talents set terms_ready = true where id = p_deal_talent;
  -- cachê mudou depois do "tenho interesse": o creator precisa confirmar de novo
  if v_before is not null and v_before <> p_fee_cents and dt.status in ('interested', 'talk_requested', 'proposed') then
    update public.deal_talents set status = 'consulted', responded_at = null where id = p_deal_talent;
    v_to := public.talent_user_id(dt.talent_id);
    perform public.inbox_notify(v_to, 'opportunity_updated', '/creator/escritorio/oportunidades/' || dt.id::text,
      jsonb_build_object('deal', d.title, 'status', 'fee_changed'), dt.agency_id, 'deal_talent', dt.id, null);
  end if;
  -- auditoria sem o número (o valor mora na tabela de valor)
  perform public.audit_log('deal_talent.fee', 'deal_talent', p_deal_talent::text, jsonb_build_object('agency_id', dt.agency_id, 'had_fee', v_before is not null),
    jsonb_build_object('agency_id', dt.agency_id, 'had_fee', true), null, public.talent_audit_actor('agency', dt.agency_id));
end $$;

-- escopo e cronograma dos entregáveis (sem valor)
create or replace function public.agency_deliverables_save(p_deal uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; e jsonb; v_id uuid; v_dt uuid; v_ids uuid[] := '{}'::uuid[]; v_due timestamptz; v_publish timestamptz; v_stage text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, true);
  select d.stage into v_stage from public.deals d where d.id = p_deal;
  for e in select value from jsonb_array_elements(p_items) loop
    begin
      v_id := nullif(btrim(coalesce(e ->> 'id', '')), '')::uuid;
      v_dt := (e ->> 'deal_talent_id')::uuid;
      v_due := nullif(btrim(coalesce(e ->> 'due_at', '')), '')::timestamptz;
      v_publish := nullif(btrim(coalesce(e ->> 'publish_at', '')), '')::timestamptz;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    -- D19: o par precisa ser deste negócio e não ter saído
    if not exists (select 1 from public.deal_talents dt where dt.id = v_dt and dt.deal_id = p_deal and dt.status not in ('declined', 'removed')) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_id is not null and not exists (select 1 from public.deliverables x where x.id = v_id and x.deal_id = p_deal) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    begin
      if v_id is null then
        insert into public.deliverables (agency_id, brand_id, deal_id, deal_talent_id, talent_id, kind, network, title, brief, due_at, publish_at, created_by)
        select d.agency_id, d.brand_id, p_deal, v_dt, dt.talent_id, coalesce(e ->> 'kind', ''), nullif(e ->> 'network', ''), btrim(coalesce(e ->> 'title', '')),
               btrim(coalesce(e ->> 'brief', '')), v_due, v_publish, auth.uid()
        from public.deals d join public.deal_talents dt on dt.id = v_dt where d.id = p_deal
        returning id into v_id;
      else
        update public.deliverables set deal_talent_id = v_dt, kind = coalesce(e ->> 'kind', kind), network = nullif(e ->> 'network', ''),
          title = btrim(coalesce(e ->> 'title', '')), brief = btrim(coalesce(e ->> 'brief', '')), due_at = v_due, publish_at = v_publish
        where id = v_id and status in ('planned', 'in_production');
      end if;
    exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
    end;
    v_ids := v_ids || v_id;
  end loop;
  -- os planejados que saíram da lista são cancelados (nunca apagados: histórico)
  update public.deliverables set status = 'cancelled' where deal_id = p_deal and status = 'planned' and not (id = any (v_ids));
  perform public.audit_log('deal.deliverables', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency, 'count', cardinality(v_ids)), null,
    public.talent_audit_actor('agency', v_agency));
end $$;

-- consulta de interesse: só creators com cachê definido; avisa (push) quem tem login
create or replace function public.agency_consult_talents(p_deal uuid, p_deal_talent_ids uuid[], p_respond_by timestamptz, p_message text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; r record; v_count int := 0; v_to uuid; v_label text; v_msg text := btrim(coalesce(p_message, ''));
begin
  v_agency := public.deal_write_scope(p_deal, false);
  select * into d from public.deals where id = p_deal;
  if public.deal_stage_index(d.stage) >= 8 or d.stage = 'proposal_sent' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if p_respond_by is null or p_respond_by <= now() or p_respond_by > now() + interval '30 days' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_deal_talent_ids is null or cardinality(p_deal_talent_ids) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_deal_talent_ids) x where not exists (select 1 from public.deal_talents dt where dt.id = x and dt.deal_id = p_deal)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.deal_talents dt where dt.id = any (p_deal_talent_ids) and not dt.terms_ready) then
    raise exception 'fee_missing' using errcode = 'P0001';
  end if;
  v_label := public.actor_label(v_agency);
  for r in select dt.* from public.deal_talents dt where dt.id = any (p_deal_talent_ids) and dt.status in ('suggested', 'declined') loop
    update public.deal_talents set status = 'consulted', consulted_by = auth.uid(), consulted_at = now(), respond_by = p_respond_by,
      responded_at = null, response_note = '', response_channel = null where id = r.id;
    if v_msg <> '' then
      insert into public.deal_messages (agency_id, brand_id, deal_id, channel, talent_id, author_id, author_side, author_label, body)
      values (v_agency, d.brand_id, p_deal, 'talent_agency', r.talent_id, auth.uid(), 'agency', v_label, v_msg);
    end if;
    v_to := public.talent_user_id(r.talent_id);
    perform public.inbox_notify(v_to, 'opportunity_received', '/creator/escritorio/oportunidades/' || r.id::text,
      jsonb_build_object('deal', d.title, 'brand', (select b.name from public.brands b where b.id = d.brand_id), 'date', to_char(p_respond_by, 'YYYY-MM-DD')),
      v_agency, 'deal_talent', r.id, 'consult:' || r.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if public.deal_stage_index(d.stage) < 4 then update public.deals set stage = 'consultation', stage_changed_at = now() where id = p_deal; end if;
  perform public.audit_log('deal.consult', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', v_agency, 'count', v_count, 'respond_by', p_respond_by), null, public.talent_audit_actor('agency', v_agency));
  return v_count;
end $$;

-- resposta do creator (aceitar, recusar com motivo, pedir conversa)
create or replace function public.talent_opportunity_respond(p_deal_talent uuid, p_response text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; d public.deals%rowtype; v_note text := btrim(coalesce(p_note, '')); v_name text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into dt from public.deal_talents where id = p_deal_talent for update;
  if dt.id is null or dt.talent_id is distinct from public.my_talent_id() or dt.consulted_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_response not in ('interested', 'declined', 'talk_requested') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if dt.status not in ('consulted', 'talk_requested') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_response = 'declined' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = dt.deal_id;
  if d.stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  update public.deal_talents set status = p_response, responded_at = now(), response_note = v_note, response_channel = 'app' where id = p_deal_talent;
  select t.display_name into v_name from public.talent_profiles t where t.id = dt.talent_id;
  perform public.audit_log('deal_talent.respond', 'deal_talent', p_deal_talent::text, jsonb_build_object('agency_id', dt.agency_id, 'status', dt.status),
    jsonb_build_object('agency_id', dt.agency_id, 'status', p_response), nullif(v_note, ''), 'creator'::public.actor_type);
  if d.owner_id is not null and exists (select 1 from public.agency_members m where m.agency_id = d.agency_id and m.user_id = d.owner_id and m.revoked_at is null) then
    perform public.inbox_notify(d.owner_id, 'opportunity_answered', '/agencia/negocios/' || d.id::text || '/creators',
      jsonb_build_object('deal', d.title, 'talent', v_name, 'status', p_response), d.agency_id, 'deal_talent', dt.id, null);
  end if;
  perform public.inbox_notify_agency(d.agency_id, 'manager', 'opportunity_answered', '/agencia/negocios/' || d.id::text || '/creators',
    jsonb_build_object('deal', d.title, 'talent', v_name, 'status', p_response), 'deal_talent', dt.id, 'answer:' || dt.id::text || ':' || p_response || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
end $$;

-- resposta registrada pela agência (só talento sem login)
create or replace function public.agency_record_talent_response(p_deal_talent uuid, p_response text, p_note text, p_document uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; v_agency uuid; v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into dt from public.deal_talents where id = p_deal_talent for update;
  if dt.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(dt.deal_id, false);
  if public.talent_user_id(dt.talent_id) is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
  if p_response not in ('interested', 'declined', 'talk_requested') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if dt.status not in ('consulted', 'talk_requested') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) < 5 or char_length(v_note) > 500 then raise exception 'note_required' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from public.documents x where x.id = p_document and x.agency_id = v_agency
                                            and (x.talent_id = dt.talent_id or x.deal_id = dt.deal_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.deal_talents set status = p_response, responded_at = now(), response_note = v_note, response_channel = 'agency_record' where id = p_deal_talent;
  perform public.audit_log('deal_talent.respond', 'deal_talent', p_deal_talent::text, jsonb_build_object('agency_id', v_agency, 'status', dt.status),
    jsonb_build_object('agency_id', v_agency, 'status', p_response, 'channel', 'agency_record', 'document_id', p_document), v_note,
    public.talent_audit_actor('agency', v_agency));
end $$;

create or replace function public.agency_deal_talent_set_status(p_deal_talent uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; v_agency uuid; d public.deals%rowtype; v_to uuid;
begin
  select * into dt from public.deal_talents where id = p_deal_talent for update;
  if dt.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(dt.deal_id, false);
  if p_status <> 'removed' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if dt.status in ('contracted', 'removed') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = dt.deal_id;
  if dt.status = 'proposed' and public.deal_stage_index(d.stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  update public.deal_talents set status = 'removed' where id = p_deal_talent;
  perform public.audit_log('deal_talent.status', 'deal_talent', p_deal_talent::text, jsonb_build_object('agency_id', v_agency, 'status', dt.status),
    jsonb_build_object('agency_id', v_agency, 'status', 'removed'), null, public.talent_audit_actor('agency', v_agency));
  if dt.consulted_at is not null then
    v_to := public.talent_user_id(dt.talent_id);
    perform public.inbox_notify(v_to, 'opportunity_updated', '/creator/escritorio/oportunidades/' || dt.id::text,
      jsonb_build_object('deal', d.title, 'status', 'removed'), v_agency, 'deal_talent', dt.id, null);
  end if;
end $$;

-- confirmação dos termos comerciais pela agência (Adm): a campanha fica "aprovada". Os creators interessados
-- viram "propostos" (contratados na etapa do contrato). Trava por talento: dois negócios não reservam o mesmo
-- período do mesmo creator (schedule_conflict; o Adm pode forçar com justificativa).
create or replace function public.agency_deal_confirm(p_deal uuid, p_note text default null, p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; r record; v_note text := btrim(coalesce(p_note, '')); v_count int := 0; v_to uuid; v_brand text;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if public.deal_stage_index(d.stage) < 4 or public.deal_stage_index(d.stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.status in ('interested', 'proposed')) then
    raise exception 'no_talents' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.status in ('interested', 'proposed') and not dt.terms_ready) then
    raise exception 'fee_missing' using errcode = 'P0001';
  end if;
  if coalesce(p_force, false) and char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  for r in select dt.id, dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status in ('interested', 'proposed') order by dt.talent_id loop
    perform pg_advisory_xact_lock(hashtext('talent_schedule:' || r.talent_id::text));
    if d.expected_start is not null and not coalesce(p_force, false) and exists (
         select 1 from public.deal_talents o join public.deals od on od.id = o.deal_id
         where o.talent_id = r.talent_id and o.deal_id <> p_deal and o.status in ('proposed', 'contracted')
           and public.deal_stage_index(od.stage) between 8 and 12 and od.expected_start is not null
           and daterange(od.expected_start, coalesce(od.expected_end, od.expected_start), '[]') && daterange(d.expected_start, coalesce(d.expected_end, d.expected_start), '[]')) then
      raise exception 'schedule_conflict' using errcode = 'P0001';
    end if;
    update public.deal_talents set status = 'proposed' where id = r.id;
    v_count := v_count + 1;
  end loop;
  update public.deal_talents set status = 'removed' where deal_id = p_deal and status in ('suggested', 'consulted', 'talk_requested');
  update public.deals set stage = 'approved', stage_changed_at = now(), confirmed_at = now(), brand_visible = true where id = p_deal;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', p_deal, 'stage_change', v_note, auth.uid(), public.actor_label(v_agency));
  perform public.audit_log('deal.confirm', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'stage', d.stage),
    jsonb_build_object('agency_id', v_agency, 'stage', 'approved', 'talents', v_count, 'forced', coalesce(p_force, false)), nullif(v_note, ''),
    public.talent_audit_actor('agency', v_agency));
  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  perform public.inbox_notify_brand(d.brand_id, false, 'campaign_status_changed', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title, 'status', 'contracting'), v_agency, 'deal', p_deal, 'status:' || p_deal::text || ':contracting');
  for r in select dt.id, dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'proposed' loop
    v_to := public.talent_user_id(r.talent_id);
    perform public.inbox_notify(v_to, 'opportunity_updated', '/creator/escritorio/oportunidades/' || r.id::text,
      jsonb_build_object('deal', d.title, 'brand', v_brand, 'status', 'confirmed'), v_agency, 'deal_talent', r.id, 'confirm:' || r.id::text);
  end loop;
end $$;

-- 13) RPCs: disponibilidade comercial ----------------------------------------------------------------------------
create or replace function public.talent_availability_save(p_talent uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_side text; v_agency uuid; v_id uuid; v_start date; v_end date; v_kind text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_side := public.talent_actor_side(p_talent);
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if p_id is not null and not exists (select 1 from public.talent_availability a where a.id = p_id and a.talent_id = p_talent) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    v_start := (p_data ->> 'starts_on')::date; v_end := (p_data ->> 'ends_on')::date;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_kind := coalesce(nullif(p_data ->> 'kind', ''), 'available');
  if (select count(*) from public.talent_availability a where a.talent_id = p_talent) >= 60 and p_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    if p_id is null then
      insert into public.talent_availability (agency_id, talent_id, kind, starts_on, ends_on, note, created_by)
      values (v_agency, p_talent, v_kind, v_start, v_end, btrim(coalesce(p_data ->> 'note', '')), auth.uid()) returning id into v_id;
    else
      update public.talent_availability set kind = v_kind, starts_on = v_start, ends_on = v_end, note = btrim(coalesce(p_data ->> 'note', ''))
      where id = p_id returning id into v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('talent.availability', 'talent', p_talent::text, null,
    jsonb_build_object('agency_id', v_agency, 'kind', v_kind, 'starts_on', v_start, 'ends_on', v_end), null, public.talent_audit_actor(v_side, v_agency));
  return v_id;
end $$;

create or replace function public.talent_availability_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row record; v_side text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select a.id, a.talent_id, a.agency_id into v_row from public.talent_availability a where a.id = p_id;
  if v_row.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_side := public.talent_actor_side(v_row.talent_id);
  delete from public.talent_availability where id = p_id;
  perform public.audit_log('talent.availability_delete', 'talent', v_row.talent_id::text, jsonb_build_object('agency_id', v_row.agency_id, 'id', p_id), null, null,
    public.talent_audit_actor(v_side, v_row.agency_id));
end $$;

-- 14) leituras fechadas: catálogo da marca, detalhe do creator, campanha da marca, oportunidades do creator ------
-- campos do kit autorizados (consentimento vigente) para a marca: sem notas internas, sem valores
create or replace function public.talent_public_card(p_talent uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', t.id, 'name', t.display_name, 'availability', t.availability,
    'photo_url', case when 'photo' = any (k.visible_fields) then c.avatar_url end,
    'headline', case when 'headline' = any (k.visible_fields) then k.headline end,
    'about', case when 'about' = any (k.visible_fields) then k.about end,
    'city', case when 'location' = any (k.visible_fields) then t.city end,
    'state', case when 'location' = any (k.visible_fields) then t.state end,
    'segments', case when 'segments' = any (k.visible_fields) then (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.sort_order), '[]')
                 from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id and s.active where l.talent_id = t.id) end,
    'networks', case when 'networks' = any (k.visible_fields) then (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'network', a.network, 'handle', a.handle, 'url', a.url, 'source', a.source, 'as_of', a.as_of, 'declared_side', a.declared_side,
                 'declared_at', a.updated_at::date,
                 'followers', case when 'followers' = any (k.visible_fields) then a.followers end,
                 'avg_views', case when 'views' = any (k.visible_fields) then a.avg_views end,
                 'avg_reach', case when 'reach' = any (k.visible_fields) then a.avg_reach end,
                 'engagement_bp', case when 'engagement' = any (k.visible_fields) then a.engagement_bp end,
                 'audience', case when 'audience' = any (k.visible_fields) and a.audience <> '{}'::jsonb then a.audience end)) order by a.followers desc nulls last), '[]')
                 from public.talent_social_accounts a where a.talent_id = t.id) end,
    'brands', case when 'brands' = any (k.visible_fields) and c.id is not null then (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'logo_url', b.logo_url) order by cb.sort_order), '[]')
               from public.creator_brands cb join public.brands b on b.id = cb.brand_id and b.status = 'active' where cb.creator_id = c.id and cb.status = 'active') end,
    'has_public_page', c.id is not null, 'hero_slug', c.slug))
  from public.talent_profiles t
  left join public.media_kits k on k.talent_id = t.id
  left join public.creator_profiles c on c.id = t.creator_id and c.status = 'active'
  where t.id = p_talent
$$;
revoke execute on function public.talent_public_card(uuid) from public, anon, authenticated;

-- catálogo autorizado da agência que atende a marca (só com consentimento + liberado + não indisponível)
create or replace function public.brand_talent_search(p_brand uuid, p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid; f jsonb := coalesce(p_filters, '{}'::jsonb); v_segment uuid; v_state text; v_network text; v_min int; v_avail text; v_q text; out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then return '[]'::jsonb; end if;
  begin
    v_segment := nullif(btrim(coalesce(f ->> 'segment_id', '')), '')::uuid;
    v_min := nullif(btrim(coalesce(f ->> 'min_followers', '')), '')::int;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_state := nullif(upper(btrim(coalesce(f ->> 'state', ''))), '');
  v_network := nullif(lower(btrim(coalesce(f ->> 'network', ''))), '');
  v_avail := nullif(btrim(coalesce(f ->> 'availability', '')), '');
  v_q := nullif(btrim(coalesce(f ->> 'q', '')), '');
  select coalesce(jsonb_agg(card || jsonb_build_object('matched', matched, 'insufficient_data', insufficient) order by (card ->> 'name')), '[]'::jsonb) into out
  from (
    select public.talent_public_card(t.id) as card,
      -- filtros atendidos (só entre campos visíveis do kit)
      (select coalesce(jsonb_agg(m), '[]'::jsonb) from (
         select 'segment' as m where v_segment is not null and 'segments' = any (k.visible_fields)
           and exists (select 1 from public.talent_segment_links l where l.talent_id = t.id and l.segment_id = v_segment)
         union all select 'state' where v_state is not null and 'location' = any (k.visible_fields) and t.state = v_state
         union all select 'network' where v_network is not null and 'networks' = any (k.visible_fields)
           and exists (select 1 from public.talent_social_accounts a where a.talent_id = t.id and a.network = v_network)
         union all select 'followers' where v_min is not null and 'followers' = any (k.visible_fields) and 'networks' = any (k.visible_fields)
           and exists (select 1 from public.talent_social_accounts a where a.talent_id = t.id and a.followers >= v_min)
         union all select 'availability' where v_avail is not null and t.availability = v_avail) x) as matched,
      -- menos de 2 dados declarados e visíveis: "dados insuficientes"
      ((case when 'segments' = any (k.visible_fields) and exists (select 1 from public.talent_segment_links l where l.talent_id = t.id) then 1 else 0 end)
       + (case when 'location' = any (k.visible_fields) and t.state is not null then 1 else 0 end)
       + (case when 'networks' = any (k.visible_fields) and exists (select 1 from public.talent_social_accounts a where a.talent_id = t.id) then 1 else 0 end)
       + (case when 'audience' = any (k.visible_fields) and exists (select 1 from public.talent_social_accounts a where a.talent_id = t.id and a.audience <> '{}'::jsonb
                 and a.as_of >= current_date - interval '12 months') then 1 else 0 end)) < 2 as insufficient
    from public.talent_profiles t
    left join public.media_kits k on k.talent_id = t.id
    left join public.creator_profiles c on c.id = t.creator_id
    where t.agency_id = v_agency and t.catalog_visible and t.archived_at is null and t.consent_at is not null and t.consent_revoked_at is null
      and t.availability <> 'unavailable' and (c.id is null or c.status = 'active')
      and (v_q is null or t.display_name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
      and (v_segment is null or ('segments' = any (k.visible_fields) and exists (select 1 from public.talent_segment_links l where l.talent_id = t.id and l.segment_id = v_segment)))
      and (v_state is null or ('location' = any (k.visible_fields) and t.state = v_state))
      and (v_network is null or ('networks' = any (k.visible_fields) and exists (select 1 from public.talent_social_accounts a where a.talent_id = t.id and a.network = v_network)))
      and (v_min is null or ('followers' = any (k.visible_fields) and 'networks' = any (k.visible_fields)
                             and exists (select 1 from public.talent_social_accounts a where a.talent_id = t.id and a.followers >= v_min)))
      and (v_avail is null or t.availability = v_avail)
    limit 50) s;
  return out;
end $$;

-- detalhe do creator para a marca: o cartão + os períodos comercialmente disponíveis (nunca a agenda privada)
create or replace function public.brand_talent_detail(p_brand uuid, p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid; v_card jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if not exists (select 1 from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
                 where t.id = p_talent and t.agency_id = v_agency and t.catalog_visible and t.archived_at is null
                   and t.consent_at is not null and t.consent_revoked_at is null and (c.id is null or c.status = 'active')) then
    return null;
  end if;
  v_card := public.talent_public_card(p_talent);
  return v_card || jsonb_build_object(
    'availability_periods', (select coalesce(jsonb_agg(jsonb_build_object('starts_on', a.starts_on, 'ends_on', a.ends_on, 'note', a.note) order by a.starts_on), '[]')
                              from public.talent_availability a where a.talent_id = p_talent and a.kind = 'available' and a.ends_on >= current_date),
    'blocked_periods', (select coalesce(jsonb_agg(jsonb_build_object('starts_on', a.starts_on, 'ends_on', a.ends_on) order by a.starts_on), '[]')
                         from public.talent_availability a where a.talent_id = p_talent and a.kind = 'blocked' and a.ends_on >= current_date),
    'agency', (select jsonb_build_object('id', a.id, 'name', a.name) from public.agencies a where a.id = v_agency));
end $$;

-- campanha vista pela marca: pedido, situação, creators (o desejado sempre; os demais a partir da confirmação)
create or replace function public.brand_campaign_detail(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; d public.deals%rowtype; v_brand_status text; v_visible_dt uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null or (public.brand_member_of(r.brand_id) is null and not public.is_platform_admin()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where request_id = p_request;
  if r.origin = 'agency' and (d.id is null or not d.brand_visible) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_brand_status := case when d.id is null then case when r.status = 'cancelled' then 'cancelled' else 'draft' end
                         else public.deal_brand_status(d.stage, d.outcome) end;
  v_visible_dt := public.my_brand_deal_talent_ids();
  return jsonb_build_object(
    'request', jsonb_build_object('id', r.id, 'title', r.title, 'objective', r.objective, 'product', r.product, 'target_audience', r.target_audience,
      'target_age_bands', to_jsonb(r.target_age_bands), 'target_states', to_jsonb(r.target_states), 'region_note', r.region_note,
      'period_start', r.period_start, 'period_end', r.period_end, 'desired_at', r.desired_at, 'duration_minutes', r.duration_minutes,
      'format', r.format, 'location', r.location, 'networks', to_jsonb(r.networks), 'deliverables', r.deliverables, 'notes', r.notes,
      'status', r.status, 'submitted_at', r.submitted_at, 'created_at', r.created_at, 'talent_id', r.talent_id, 'origin', r.origin),
    'brand_status', v_brand_status,
    'deal', case when d.id is null then null else jsonb_build_object('id', d.id, 'title', d.title, 'stage_changed_at', d.stage_changed_at,
      'expected_start', d.expected_start, 'expected_end', d.expected_end, 'confirmed_at', d.confirmed_at, 'closed_at', d.closed_at, 'outcome', d.outcome) end,
    -- o creator desejado pela marca aparece sempre (ela escolheu); os demais só depois da confirmação
    'requested_talent', case when r.talent_id is null then null else public.talent_public_card(r.talent_id) end,
    'talents', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(
        public.talent_public_card(dt.talent_id) || jsonb_build_object('deal_talent_id', dt.id, 'status', dt.status) order by dt.created_at), '[]')
      from public.deal_talents dt where dt.deal_id = d.id and dt.id = any (v_visible_dt)) end,
    'deliverables', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'network', x.network,
        'title', x.title, 'due_at', x.due_at, 'publish_at', x.publish_at, 'status', x.status, 'talent_name', t.display_name) order by x.due_at nulls last), '[]')
      from public.deliverables x join public.talent_profiles t on t.id = x.talent_id where x.deal_id = d.id and x.deal_talent_id = any (v_visible_dt)) end);
end $$;

-- oportunidades do creator: só os próprios pares consultados; nunca critérios internos, outros creators ou valores
create or replace function public.talent_opportunities(p_deal_talent uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
        'confirmed_at', d.confirmed_at),
      'request', case when r.id is null then null else jsonb_build_object('objective', r.objective, 'product', r.product, 'desired_at', r.desired_at,
        'duration_minutes', r.duration_minutes, 'format', r.format, 'location', r.location, 'networks', to_jsonb(r.networks), 'deliverables', r.deliverables,
        'notes', case when r.origin = 'brand' then r.notes else '' end) end,
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
end $$;

-- 15) documentos (0065 + pedido e negócio) ---------------------------------------------------------------------
create or replace function public.document_reserve(p_agency uuid, p_scope_type text, p_scope_id uuid, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid(); v_kind text; v_title text; v_mime text; v_size bigint; v_ext text; v_path text;
  v_side text; v_restricted boolean := false; v_share_brand boolean := false; v_share_talent boolean := false;
  v_brand uuid; v_talent uuid; v_request uuid; v_deal uuid; v_is_admin boolean; v_is_manager boolean; d public.deals%rowtype; r public.campaign_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  v_kind := coalesce(p_meta ->> 'kind', 'other');
  v_title := btrim(coalesce(p_meta ->> 'title', ''));
  v_mime := coalesce(p_meta ->> 'mime_type', '');
  begin v_size := (p_meta ->> 'size_bytes')::bigint; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
  v_ext := case v_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null then raise exception 'invalid_file_type' using errcode = '22023'; end if;
  if v_size is null or v_size < 1 or v_size > 20971520 then raise exception 'file_too_large' using errcode = '22023'; end if;
  if v_kind not in ('contract', 'brief_attachment', 'proof', 'submission', 'report', 'media', 'other') then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_is_admin := public.agency_can(p_agency, 'admin');
  v_is_manager := public.agency_can(p_agency, 'manager');

  if p_scope_type = 'agency' then
    if p_scope_id is distinct from p_agency then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not v_is_manager then raise exception 'forbidden' using errcode = '42501'; end if;
    v_side := 'agency';
  elsif p_scope_type = 'brand' then
    v_brand := p_scope_id;
    if not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = v_brand and ab.status = 'active') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_is_manager then
      v_side := 'agency'; v_share_brand := coalesce((p_meta ->> 'share_brand')::boolean, false);
    elsif public.brand_member_of(v_brand) is not null then
      v_side := 'brand'; v_share_brand := true;
      if v_kind = 'contract' then raise exception 'forbidden' using errcode = '42501'; end if;
    else
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_scope_type = 'talent' then
    v_talent := p_scope_id;
    if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_is_manager then
      v_side := 'agency'; v_share_talent := coalesce((p_meta ->> 'share_talent')::boolean, false);
    elsif v_talent = public.my_talent_id() then
      v_side := 'talent'; v_share_talent := true;
      if v_kind = 'contract' then raise exception 'forbidden' using errcode = '42501'; end if;
    elsif public.agency_can(p_agency, 'staff') then
      raise exception 'forbidden' using errcode = '42501';
    else
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  elsif p_scope_type = 'request' then
    -- anexo de briefing: membro da marca (no próprio pedido) ou gestor+
    select * into r from public.campaign_requests where id = p_scope_id and agency_id = p_agency;
    if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_request := r.id; v_brand := r.brand_id;
    if public.brand_member_of(r.brand_id) is not null and r.origin = 'brand' then
      v_side := 'brand'; v_share_brand := true;
      if v_kind not in ('brief_attachment', 'media', 'other') then raise exception 'forbidden' using errcode = '42501'; end if;
    elsif v_is_manager then
      v_side := 'agency'; v_share_brand := coalesce((p_meta ->> 'share_brand')::boolean, false);
    elsif public.agency_can(p_agency, 'staff') then
      raise exception 'forbidden' using errcode = '42501';
    else
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  elsif p_scope_type = 'deal' then
    select * into d from public.deals where id = p_scope_id and agency_id = p_agency;
    if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_deal := d.id; v_brand := d.brand_id;
    if v_is_manager or d.id = any (public.my_staff_deal_ids()) then
      v_side := 'agency'; v_share_brand := coalesce((p_meta ->> 'share_brand')::boolean, false);
      if p_meta ? 'talent_id' then
        v_talent := nullif(btrim(coalesce(p_meta ->> 'talent_id', '')), '')::uuid;
        if v_talent is not null and not exists (select 1 from public.deal_talents dt where dt.deal_id = d.id and dt.talent_id = v_talent) then
          raise exception 'not_found' using errcode = 'P0002';
        end if;
        v_share_talent := coalesce((p_meta ->> 'share_talent')::boolean, false);
      end if;
    elsif d.brand_visible and public.brand_member_of(d.brand_id) is not null then
      v_side := 'brand'; v_share_brand := true;
      if v_kind not in ('brief_attachment', 'media', 'other') then raise exception 'forbidden' using errcode = '42501'; end if;
    elsif d.id = any (public.my_talent_deal_ids()) then
      v_side := 'talent'; v_talent := public.my_talent_id(); v_share_talent := true;
      if v_kind not in ('submission', 'proof', 'media', 'other') then raise exception 'forbidden' using errcode = '42501'; end if;
    elsif public.agency_can(p_agency, 'staff') then
      raise exception 'forbidden' using errcode = '42501';
    else
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if v_kind = 'contract' then
    if not v_is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
    v_restricted := true;
    if v_talent is not null then v_share_brand := false; else v_share_talent := false; end if;
  elsif v_side = 'agency' and v_is_admin then
    v_restricted := coalesce((p_meta ->> 'restricted')::boolean, false);
  end if;

  v_path := p_agency::text || '/' || p_scope_type || '/' || p_scope_id::text || '/' || v_id::text || '.' || v_ext;
  begin
    insert into public.documents (id, agency_id, scope_type, brand_id, talent_id, request_id, deal_id, kind, title, storage_path, mime_type, size_bytes,
                                  restricted, share_brand, share_talent, status, uploaded_by, uploader_side)
    values (v_id, p_agency, p_scope_type, v_brand, v_talent, v_request, v_deal, v_kind, v_title, v_path, v_mime, v_size,
            v_restricted, v_share_brand, v_share_talent, 'pending', auth.uid(), v_side);
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

-- 16) agência de demonstração (0065 + campanha de exemplo) -----------------------------------------------------
-- Marca Esportiva Exemplo pede ao Atleta Exemplo a campanha "Lançamento de linha esportiva": negócio em
-- consulta, creator consultado com cachê definido, 2 entregáveis planejados e uma mensagem. Reexecutar restaura.
create or replace function public.agency_demo_seed(p_agency uuid, p_emails jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid; v_staff uuid; v_owner uuid; v_talent_user uuid; v_brand uuid := public.seed_uuid('demo:brand:exemplo-marca');
  k text; v_uid uuid; v_meta text; v_ids jsonb := '{}'::jsonb; r record; v_tid uuid; v_seed_ids uuid[] := '{}'::uuid[];
  v_request uuid := public.seed_uuid('demo:request:lancamento'); v_deal uuid := public.seed_uuid('demo:deal:lancamento'); v_dt uuid := public.seed_uuid('demo:deal_talent:lancamento');
  v_talent uuid := public.seed_uuid('demo:talent:talento-exemplo');
begin
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.is_demo) then
    raise exception 'not_demo_agency' using errcode = 'P0001';
  end if;
  if p_emails is null or jsonb_typeof(p_emails) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  foreach k in array array['admin', 'staff', 'brand_owner', 'talent'] loop
    if k = 'talent' and not (p_emails ? 'talent') then continue; end if;
    v_uid := null; v_meta := null;
    select u.id, coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') into v_uid, v_meta
    from auth.users u where lower(u.email::text) = lower(btrim(coalesce(p_emails ->> k, '')));
    if v_uid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_meta <> 'true' then raise exception 'not_demo_account' using errcode = 'P0001'; end if;
    v_ids := v_ids || jsonb_build_object(k, v_uid);
  end loop;
  v_admin := (v_ids ->> 'admin')::uuid; v_staff := (v_ids ->> 'staff')::uuid; v_owner := (v_ids ->> 'brand_owner')::uuid;
  v_talent_user := (v_ids ->> 'talent')::uuid;

  update public.agencies set name = 'Agência Exemplo (demonstração)', status = 'active', timezone = 'America/Sao_Paulo',
    relationship_alert_days = 30, contact_email = null
  where id = p_agency;
  perform public.agency_seed_defaults(p_agency);
  update public.talent_segments s set active = true, name = d.name, sort_order = d.sort_order
  from (values ('fitness', 'Fitness e musculação', 10), ('corrida', 'Corrida e endurance', 20), ('esportes', 'Esportes e alto rendimento', 30),
               ('nutricao', 'Nutrição e alimentação saudável', 40), ('gastronomia', 'Gastronomia e culinária', 50),
               ('bem-estar', 'Bem-estar e saúde mental', 60), ('rotina', 'Rotina, sono e produtividade', 70),
               ('lifestyle', 'Lifestyle e viagens', 80), ('beleza', 'Beleza e autocuidado', 90),
               ('familia', 'Maternidade, paternidade e família', 100)) as d(slug, name, sort_order)
  where s.agency_id = p_agency and s.slug = d.slug;
  insert into public.agency_members (id, agency_id, user_id, role, display_name, job_title)
  values (public.seed_uuid('demo:agency_member:admin'), p_agency, v_admin, 'admin', 'Adm da agência (exemplo)', 'Diretoria'),
         (public.seed_uuid('demo:agency_member:staff'), p_agency, v_staff, 'staff', 'Colaborador (exemplo)', 'Operação')
  on conflict (agency_id, user_id) do update set role = excluded.role, display_name = excluded.display_name,
    job_title = excluded.job_title, revoked_at = null;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_admin, 'agency', 'agency', p_agency, p_actor), (v_staff, 'agency', 'agency', p_agency, p_actor)
  on conflict (user_id, role, scope_id) do update set revoked_at = null;

  insert into public.brands (id, slug, name, logo_url, site_url, status, default_relationship, is_demo, created_by)
  values (v_brand, 'exemplo-marca', 'Marca Esportiva Exemplo', null, 'https://example.com/', 'inactive', 'sponsor', false, p_actor)
  on conflict (id) do update set name = excluded.name, status = 'inactive';
  insert into public.agency_brands (id, agency_id, brand_id, status, account_manager_id, is_demo, created_by)
  values (public.seed_uuid('demo:agency_brand:exemplo-marca'), p_agency, v_brand, 'active', v_staff, true, p_actor)
  on conflict (agency_id, brand_id) do update set status = 'active', account_manager_id = excluded.account_manager_id, is_demo = true;
  insert into public.brand_members (id, brand_id, user_id, role, display_name, job_title)
  values (public.seed_uuid('demo:brand_member:owner'), v_brand, v_owner, 'owner', 'Representante da marca (exemplo)', 'Marketing')
  on conflict (brand_id, user_id) do update set role = 'owner', display_name = excluded.display_name, revoked_at = null;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_owner, 'brand', 'brand', v_brand, p_actor)
  on conflict (user_id, role, scope_id) do update set revoked_at = null;

  if v_talent_user is not null then
    -- negócios de exemplo saem antes do casting (FK restrict de talento)
    delete from public.deals d where d.agency_id = p_agency;
    delete from public.campaign_requests r where r.agency_id = p_agency;
    for r in select * from (values
        ('talento-exemplo', 'Atleta Exemplo', 'São Paulo', 'SP', 'active', 'available', array['fitness', 'esportes'],
         'Treinos curtos e rotina possível para quem trabalha o dia todo.', 'instagram', 'atleta.exemplo', 48200, 23100, 31800, 412, 'tiktok', 'atletaexemplo', 91500, 120400, null::int, 538),
        ('bia-treinos', 'Bia Treinos (exemplo)', 'Rio de Janeiro', 'RJ', 'active', 'limited', array['fitness', 'corrida'],
         'Corrida de rua e força para iniciantes.', 'instagram', 'biatreinos.exemplo', 127000, 54000, 80200, 365, 'youtube', 'biatreinosexemplo', 38000, 21000, null::int, null::int),
        ('chef-leo', 'Chef Leo (exemplo)', 'Belo Horizonte', 'MG', 'active', 'available', array['gastronomia', 'nutricao'],
         'Receitas rápidas com ingredientes de feira.', 'instagram', 'chefleo.exemplo', 64300, 30500, 41200, 297, 'tiktok', 'chefleoexemplo', 152000, 210000, null::int, 611),
        ('rafa-corre', 'Rafa Corre (exemplo)', 'Curitiba', 'PR', 'prospect', 'available', array['corrida', 'esportes'],
         'Maratonista amador e conteúdo sobre provas.', 'instagram', 'rafacorre.exemplo', 21800, 9400, 14100, 520, 'youtube', 'rafacorreexemplo', null::int, null::int, null::int, null::int),
        ('nina-bem-estar', 'Nina Bem-estar (exemplo)', 'Salvador', 'BA', 'paused', 'unavailable', array['bem-estar', 'beleza'],
         'Autocuidado, sono e respiração.', 'instagram', 'ninabemestar.exemplo', 88900, 40100, 57600, 284, 'tiktok', 'ninabemestarexemplo', 45200, 60300, null::int, 402),
        ('familia-souza', 'Família Souza (exemplo)', 'Porto Alegre', 'RS', 'active', 'available', array['familia', 'lifestyle'],
         'Rotina de família com crianças pequenas.', 'instagram', 'familiasouza.exemplo', 154000, 70300, 98500, 233, 'youtube', 'familiasouzaexemplo', 72000, 33000, null::int, null::int)
      ) as s(key, name, city, state, status, availability, segments, about, n1, h1, f1, v1, r1, e1, n2, h2, f2, v2, r2, e2)
    loop
      v_tid := public.seed_uuid('demo:talent:' || r.key);
      v_seed_ids := v_seed_ids || v_tid;
      insert into public.talent_profiles (id, agency_id, user_id, display_name, city, state, country, manager_id, commercial_status, availability,
                                          availability_note, contact_email, contact_phone, internal_notes, last_contact_at, consent_at,
                                          consent_version, consent_revoked_at, catalog_visible, is_demo, created_by, archived_at)
      values (v_tid, p_agency, case when r.key = 'talento-exemplo' then v_talent_user end, r.name, r.city, r.state, 'BR', v_admin, r.status, r.availability,
              '', null, null, 'Dados fictícios de demonstração.', now() - interval '12 days', now(), '2026-10', null,
              r.status = 'active', true, p_actor, null)
      on conflict (id) do update set agency_id = excluded.agency_id, user_id = excluded.user_id, creator_id = null,
        display_name = excluded.display_name, city = excluded.city, state = excluded.state, country = 'BR', manager_id = excluded.manager_id,
        commercial_status = excluded.commercial_status, availability = excluded.availability, availability_note = '',
        contact_email = null, contact_phone = null, internal_notes = excluded.internal_notes, last_contact_at = excluded.last_contact_at,
        consent_at = excluded.consent_at, consent_version = excluded.consent_version, consent_revoked_at = null,
        catalog_visible = excluded.catalog_visible, is_demo = true, archived_at = null;
      delete from public.talent_segment_links l where l.talent_id = v_tid;
      insert into public.talent_segment_links (agency_id, talent_id, segment_id)
      select p_agency, v_tid, s.id from public.talent_segments s where s.agency_id = p_agency and s.slug = any (r.segments);
      delete from public.talent_social_accounts a where a.talent_id = v_tid;
      insert into public.talent_social_accounts (agency_id, talent_id, network, handle, url, followers, avg_views, avg_reach, engagement_bp,
                                                 audience, source, as_of, declared_by, declared_side)
      values (p_agency, v_tid, r.n1, r.h1, null, r.f1, r.v1, r.r1, r.e1,
              '{"gender": {"female": 6100, "male": 3700, "other": 200}, "age": {"18-24": 2400, "25-34": 4300, "35-44": 2100, "45-54": 800, "55+": 400}, "top_states": ["SP", "RJ", "MG"], "top_countries": ["BR", "PT"]}'::jsonb,
              'declared', current_date, null, 'agency'),
             (p_agency, v_tid, r.n2, r.h2, null, r.f2, r.v2, r.r2, r.e2, '{}'::jsonb, 'declared', current_date, null, 'agency');
      insert into public.media_kits (agency_id, talent_id, headline, about, visible_fields, share_token_hash, share_expires_at, share_revoked_at,
                                     share_created_by, share_created_at, view_count, last_viewed_at)
      values (p_agency, v_tid, r.name || ' · ' || r.city, r.about,
              '{photo,headline,about,location,segments,networks,followers,views,engagement,audience,agency_contact}'::text[],
              null, null, null, null, null, 0, null)
      on conflict (talent_id) do update set headline = excluded.headline, about = excluded.about, visible_fields = excluded.visible_fields,
        share_token_hash = null, share_expires_at = null, share_revoked_at = null, share_created_by = null, share_created_at = null,
        view_count = 0, last_viewed_at = null;
      -- disponibilidade comercial de exemplo: próximos 3 meses, com um bloqueio no meio
      delete from public.talent_availability a where a.talent_id = v_tid;
      insert into public.talent_availability (agency_id, talent_id, kind, starts_on, ends_on, note, created_by)
      values (p_agency, v_tid, 'available', current_date + 7, current_date + 90, 'Agenda aberta para campanhas', p_actor),
             (p_agency, v_tid, 'blocked', current_date + 30, current_date + 37, '', p_actor);
    end loop;
    delete from public.talent_profiles t where t.agency_id = p_agency and not (t.id = any (v_seed_ids));
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_talent_user, 'creator', 'talent', v_talent, p_actor)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;

    -- campanha de exemplo: proposta da marca → negócio em consulta → creator consultado (cachê definido pelo Adm)
    insert into public.campaign_requests (id, agency_id, brand_id, origin, created_by, talent_id, title, objective, product, target_audience, target_age_bands,
      target_states, period_start, period_end, desired_at, duration_minutes, format, location, networks, deliverables, segment_ids, notes, status, submitted_at)
    values (v_request, p_agency, v_brand, 'brand', v_owner, v_talent, 'Lançamento de linha esportiva', 'launch', 'Linha esportiva Exemplo Pro (tênis e camisetas)',
      'Pessoas de 18 a 34 anos que treinam 3 vezes por semana', array['18-24', '25-34'], array['SP', 'RJ'], current_date + 21, current_date + 35,
      (current_date + 21)::timestamp + interval '10 hours', 240, 'hybrid', 'Estúdio da marca em São Paulo + conteúdo remoto', array['instagram', 'tiktok'],
      '[{"kind": "reels", "quantity": 2, "network": "instagram"}, {"kind": "stories", "quantity": 6, "network": "instagram"}, {"kind": "video", "quantity": 1, "network": "tiktok"}]'::jsonb,
      (select coalesce(array_agg(s.id), '{}'::uuid[]) from public.talent_segments s where s.agency_id = p_agency and s.slug in ('fitness', 'esportes')),
      'Queremos mostrar a linha em treinos reais, sem roteiro engessado. Dados fictícios de demonstração.', 'converted', now() - interval '3 days');
    insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
    values (p_agency, v_brand, v_request, 1500000, 2500000, 'Valor de exemplo (simulado)', v_owner);
    insert into public.deals (id, agency_id, brand_id, request_id, title, stage, owner_id, created_by, brand_visible, talent_brief, segment_ids, expected_start, expected_end,
      stage_changed_at, is_demo)
    values (v_deal, p_agency, v_brand, v_request, 'Lançamento de linha esportiva', 'consultation', v_staff, v_owner, true,
      'Dois reels de treino com a linha nova, seis stories de bastidores e um vídeo no TikTok. Gravação híbrida: um dia no estúdio da marca.',
      (select coalesce(array_agg(s.id), '{}'::uuid[]) from public.talent_segments s where s.agency_id = p_agency and s.slug in ('fitness', 'esportes')),
      current_date + 21, current_date + 35, now() - interval '2 days', true);
    insert into public.deal_talents (id, agency_id, deal_id, talent_id, status, reasons, terms_ready, suggested_by, consulted_by, consulted_at, respond_by)
    values (v_dt, p_agency, v_deal, v_talent, 'consulted', '[{"code": "brand_choice", "met": true, "detail": []}, {"code": "segment", "met": true, "detail": ["fitness"]}]'::jsonb,
            true, v_owner, v_staff, now() - interval '1 day', now() + interval '6 days');
    insert into public.deal_talent_fees (agency_id, deal_id, deal_talent_id, talent_id, fee_cents, set_by)
    values (p_agency, v_deal, v_dt, v_talent, 1200000, v_admin);
    insert into public.deliverables (agency_id, brand_id, deal_id, deal_talent_id, talent_id, kind, network, title, brief, due_at, publish_at, created_by)
    values (p_agency, v_brand, v_deal, v_dt, v_talent, 'reels', 'instagram', 'Reels: treino com a linha nova', 'Treino de 30 s mostrando o tênis em uso.',
            (current_date + 28)::timestamp + interval '18 hours', (current_date + 30)::timestamp + interval '12 hours', v_staff),
           (p_agency, v_brand, v_deal, v_dt, v_talent, 'video', 'tiktok', 'Vídeo: bastidores do estúdio', 'Dia de gravação no estúdio da marca.',
            (current_date + 32)::timestamp + interval '18 hours', (current_date + 34)::timestamp + interval '12 hours', v_staff);
    insert into public.deal_messages (agency_id, brand_id, deal_id, channel, talent_id, author_id, author_side, author_label, body)
    values (p_agency, v_brand, v_deal, 'brand_agency', null, v_owner, 'brand', 'Representante da marca (exemplo)', 'Olá! Enviamos o briefing do lançamento. Podemos gravar no nosso estúdio em SP.'),
           (p_agency, v_brand, v_deal, 'brand_agency', null, v_staff, 'agency', 'Colaborador (exemplo)', 'Recebido! Já consultamos o Atleta Exemplo e voltamos até sexta.'),
           (p_agency, v_brand, v_deal, 'talent_agency', v_talent, v_staff, 'agency', 'Colaborador (exemplo)', 'Oi! Chegou uma campanha de lançamento esportivo com a sua cara. Dá uma olhada e me diz se topa.');
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label, occurred_at)
    values (p_agency, 'deal', v_deal, 'system', 'briefing_received', v_owner, 'Representante da marca (exemplo)', now() - interval '3 days'),
           (p_agency, 'deal', v_deal, 'call', 'Alinhamento com a marca sobre datas do estúdio.', v_staff, 'Colaborador (exemplo)', now() - interval '2 days');
  end if;

  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data, justification)
  values (p_actor, 'admin', 'demo.agency_seed', 'agency', p_agency::text, null,
          jsonb_build_object('agency_id', p_agency, 'admin', v_admin, 'staff', v_staff, 'brand_owner', v_owner, 'brand', v_brand,
                             'talent', v_talent_user, 'talents', cardinality(v_seed_ids)), null);
  return jsonb_build_object('agency', p_agency, 'brand', v_brand, 'talents', cardinality(v_seed_ids)) || v_ids;
end $$;
revoke execute on function public.agency_demo_seed(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.agency_demo_seed(uuid, jsonb, uuid) to service_role;

-- 17) execução das RPCs de usuário (nenhuma para anon: S14 segue 17) --------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.brand_request_save(uuid, uuid, jsonb)', 'public.brand_request_submit(uuid)', 'public.brand_request_cancel(uuid, text)',
    'public.agency_deal_create(uuid, uuid, jsonb)', 'public.agency_deal_update(uuid, jsonb)', 'public.agency_deal_team_set(uuid, uuid[])',
    'public.agency_deal_move(uuid, text, text, text, boolean)', 'public.agency_shortlist_set(uuid, jsonb)',
    'public.agency_activity_add(text, uuid, text, text, timestamptz)', 'public.deal_message_post(uuid, text, uuid, text)',
    'public.agency_fee_set(uuid, bigint)', 'public.agency_deliverables_save(uuid, jsonb)',
    'public.agency_consult_talents(uuid, uuid[], timestamptz, text)', 'public.talent_opportunity_respond(uuid, text, text)',
    'public.agency_record_talent_response(uuid, text, text, uuid)', 'public.agency_deal_talent_set_status(uuid, text)',
    'public.agency_deal_confirm(uuid, text, boolean)', 'public.talent_availability_save(uuid, uuid, jsonb)', 'public.talent_availability_delete(uuid)',
    'public.brand_talent_search(uuid, jsonb)', 'public.brand_talent_detail(uuid, uuid)', 'public.brand_campaign_detail(uuid)',
    'public.talent_opportunities(uuid)', 'public.document_reserve(uuid, text, uuid, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
