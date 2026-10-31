-- =============================================================================
-- Groscove Ultra · 0064 · Gestão: fundação (agência, marcas, convites, avisos, documentos)
-- docs/requisitos/gestao-spec-tecnica.md, Etapa A. Cenários S74 e S80.
-- Idempotente. Valores novos de enum só em corpo plpgsql (o runner remoto usa uma transação só);
-- checks, políticas e funções sql comparam role::text. S14 segue 17 (nada novo para anon).
-- Hierarquia da agência: admin > manager > staff (só o Adm da agência vê valores, etapas C e F).
-- =============================================================================

-- 1) papéis e escopos ------------------------------------------------------------
alter type public.app_role add value if not exists 'agency';
alter type public.app_role add value if not exists 'brand';
alter type public.actor_type add value if not exists 'agency';
alter type public.actor_type add value if not exists 'brand';

alter table public.role_assignments drop constraint if exists role_assignments_scope_type_check;
alter table public.role_assignments add constraint role_assignments_scope_type_check
  check (scope_type in ('global', 'seller_org', 'creator', 'professional', 'agency', 'brand', 'talent'));

-- 2) agências --------------------------------------------------------------------
create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status text not null default 'active',
  timezone text not null default 'America/Sao_Paulo',
  relationship_alert_days smallint not null default 30,
  contact_email text,
  is_demo boolean not null default false,
  created_by uuid constraint agencies_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_slug_uq unique (slug),
  constraint agencies_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint agencies_name_check check (char_length(btrim(name)) between 2 and 80),
  constraint agencies_status_check check (status in ('active', 'suspended')),
  constraint agencies_alert_days_check check (relationship_alert_days between 7 and 365),
  constraint agencies_email_check check (contact_email is null or (contact_email = lower(contact_email)
    and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254))
);

-- 3) equipe da agência -----------------------------------------------------------
create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint agency_members_agency_fk references public.agencies (id) on delete cascade,
  user_id uuid not null constraint agency_members_user_fk references auth.users (id) on delete cascade,
  role text not null,
  display_name text not null,
  job_title text,
  invited_by uuid constraint agency_members_invited_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint agency_members_uq unique (agency_id, user_id),
  constraint agency_members_role_check check (role in ('admin', 'manager', 'staff')),
  constraint agency_members_name_check check (char_length(btrim(display_name)) between 1 and 80),
  constraint agency_members_title_check check (job_title is null or char_length(job_title) <= 80)
);
-- D10: uma agência ativa por pessoa
create unique index if not exists agency_members_one_active_idx on public.agency_members (user_id) where revoked_at is null;
create index if not exists agency_members_agency_idx on public.agency_members (agency_id, role) where revoked_at is null;

-- 4) marcas da agência e equipe da marca ------------------------------------------
create table if not exists public.agency_brands (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint agency_brands_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint agency_brands_brand_fk references public.brands (id) on delete restrict,
  status text not null default 'active',
  account_manager_id uuid constraint agency_brands_manager_fk references auth.users (id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid constraint agency_brands_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_brands_uq unique (agency_id, brand_id),
  constraint agency_brands_status_check check (status in ('active', 'archived'))
);
-- D18: uma agência ativa por marca (transferência só pelo admin geral, arquivando o vínculo anterior)
create unique index if not exists agency_brands_one_active_idx on public.agency_brands (brand_id) where status = 'active';
create index if not exists agency_brands_agency_idx on public.agency_brands (agency_id, status);

create table if not exists public.brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null constraint brand_members_brand_fk references public.brands (id) on delete cascade,
  user_id uuid not null constraint brand_members_user_fk references auth.users (id) on delete cascade,
  role text not null default 'staff',
  display_name text not null,
  job_title text,
  invited_by uuid constraint brand_members_invited_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint brand_members_uq unique (brand_id, user_id),
  constraint brand_members_role_check check (role in ('owner', 'staff')),
  constraint brand_members_name_check check (char_length(btrim(display_name)) between 1 and 80),
  constraint brand_members_title_check check (job_title is null or char_length(job_title) <= 80)
);
create index if not exists brand_members_user_idx on public.brand_members (user_id) where revoked_at is null;

-- 5) convites (checks por texto; os valores novos do enum não são usados aqui) -----
alter table public.invitations add column if not exists agency_id uuid constraint invitations_agency_fk references public.agencies (id) on delete cascade;
alter table public.invitations add column if not exists brand_id uuid constraint invitations_brand_fk references public.brands (id) on delete cascade;
alter table public.invitations add column if not exists member_role text;
alter table public.invitations drop constraint if exists invitations_member_role_check;
alter table public.invitations add constraint invitations_member_role_check
  check (member_role is null or member_role in ('admin', 'manager', 'staff', 'owner'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role::text in ('creator', 'seller', 'professional', 'agency', 'brand'));
alter table public.invitations drop constraint if exists invitations_scope;
alter table public.invitations add constraint invitations_scope check (
  (role::text = 'seller' and seller_org_id is not null and creator_profile_id is null and professional_id is null
     and agency_id is null and brand_id is null and member_role is null) or
  (role::text = 'creator' and creator_profile_id is not null and seller_org_id is null and professional_id is null
     and agency_id is null and brand_id is null and member_role is null) or
  (role::text = 'professional' and professional_id is not null and seller_org_id is null and creator_profile_id is null
     and agency_id is null and brand_id is null and member_role is null) or
  (role::text = 'agency' and agency_id is not null and member_role in ('admin', 'manager', 'staff')
     and brand_id is null and seller_org_id is null and creator_profile_id is null and professional_id is null) or
  (role::text = 'brand' and brand_id is not null and agency_id is not null and member_role in ('owner', 'staff')
     and seller_org_id is null and creator_profile_id is null and professional_id is null));
-- (a 0065 recria este check com o ramo do talento: role 'creator' + talent_id)
create index if not exists invitations_agency_idx on public.invitations (agency_id) where agency_id is not null;
create index if not exists invitations_brand_idx on public.invitations (brand_id) where brand_id is not null;
-- revogação em massa por e-mail + escopo (remover membro, convite novo substitui o anterior)
create index if not exists invitations_pending_email_idx on public.invitations (lower(email::text), role) where status = 'pending';

-- 6) caixa de notificações (sino dos portais) -------------------------------------
create table if not exists public.inbox_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint inbox_notifications_user_fk references auth.users (id) on delete cascade,
  kind text not null,
  params jsonb not null default '{}'::jsonb,
  link text not null,
  agency_id uuid constraint inbox_notifications_agency_fk references public.agencies (id) on delete cascade,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint inbox_notifications_kind_check check (kind in (
    'member_joined', 'brand_member_joined',
    'talent_consent_given', 'talent_consent_revoked',
    'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
    'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
    'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
    'calendar_event_added', 'commercial_date_published',
    'relationship_alert', 'task_overdue', 'payout_updated')),
  constraint inbox_notifications_link_check check (link ~ '^/[A-Za-z0-9/_?=&%#.-]*$' and char_length(link) <= 300),
  -- D16: aviso nunca carrega valor
  constraint inbox_notifications_params_check check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 2048
    and not (params ?| array['amount', 'amount_cents', 'fee_cents', 'total_cents', 'value', 'price', 'commission', 'budget'])),
  constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
    ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry'))
);
create unique index if not exists inbox_notifications_dedupe_idx on public.inbox_notifications (dedupe_key) where dedupe_key is not null;
create index if not exists inbox_notifications_user_idx on public.inbox_notifications (user_id, created_at desc);
create index if not exists inbox_notifications_unread_idx on public.inbox_notifications (user_id) where read_at is null;

-- 7) documentos (bucket privado agency-docs) -----------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint documents_agency_fk references public.agencies (id) on delete cascade,
  scope_type text not null,
  -- restrict: "set null" violaria documents_scope_shape (escopos brand/request exigem brand_id)
  brand_id uuid constraint documents_brand_fk references public.brands (id) on delete restrict,
  talent_id uuid,          -- FK documents_talent_fk na 0065
  request_id uuid,         -- FK documents_request_fk na 0066
  deal_id uuid,            -- FK documents_deal_fk na 0066
  -- sem deliverable_id: deliverables aponta para documents (duas FKs); FK de volta tornaria o embed ambíguo (PGRST201)
  kind text not null,
  title text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  restricted boolean not null default false,
  share_brand boolean not null default false,
  share_talent boolean not null default false,
  status text not null default 'pending',
  uploaded_by uuid constraint documents_uploaded_by_fk references auth.users (id) on delete set null,
  uploader_side text not null,
  retention_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint documents_path_uq unique (storage_path),
  constraint documents_scope_check check (scope_type in ('agency', 'brand', 'talent', 'request', 'deal')),
  constraint documents_scope_shape check (
    (scope_type = 'agency' and brand_id is null and talent_id is null and request_id is null and deal_id is null) or
    (scope_type = 'brand' and brand_id is not null and talent_id is null and request_id is null and deal_id is null) or
    (scope_type = 'talent' and talent_id is not null and brand_id is null and request_id is null and deal_id is null) or
    (scope_type = 'request' and request_id is not null and brand_id is not null and deal_id is null) or
    (scope_type = 'deal' and deal_id is not null)),
  constraint documents_kind_check check (kind in ('contract', 'brief_attachment', 'proof', 'submission', 'report', 'media', 'other')),
  constraint documents_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint documents_mime_check check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  constraint documents_size_check check (size_bytes between 1 and 20971520),
  -- caminho por escopo: <agency_id>/<scope_type>/<id do escopo>/<document_id>.<ext>
  constraint documents_path_check check (storage_path ~ ('^' || agency_id::text || '/' || scope_type || '/'
    || coalesce(deal_id, request_id, talent_id, brand_id, agency_id)::text || '/' || id::text || '\.(pdf|jpg|png|webp)$')),
  constraint documents_status_check check (status in ('pending', 'ready', 'archived')),
  constraint documents_side_check check (uploader_side in ('agency', 'brand', 'talent')),
  -- contrato tem preço: só o Adm (e as partes, pelos flags de compartilhamento)
  constraint documents_contract_restricted check (kind <> 'contract' or restricted),
  -- contrato do creator (talent_id, com o cachê) nunca vai à marca; o da marca (sem talent_id, com o total) nunca ao creator
  constraint documents_contract_share check (kind <> 'contract'
    or (talent_id is not null and not share_brand) or (talent_id is null and not share_talent))
);
create index if not exists documents_agency_idx on public.documents (agency_id, scope_type, created_at desc);
create index if not exists documents_brand_idx on public.documents (brand_id) where brand_id is not null;

-- 8) push do escritório do creator (fila da 0054) -----------------------------------
alter table public.notification_preferences add column if not exists office_updates boolean not null default false;
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('hero_post', 'achievement', 'program_completed', 'streak_reminder', 'auction_outbid', 'office'));

create or replace function public.push_allowed(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.channel_push and case p_kind
      when 'hero_post' then p.hero_posts
      when 'achievement' then p.achievements
      when 'program_completed' then p.achievements
      when 'streak_reminder' then p.streak_reminders
      when 'auction_outbid' then p.auction_outbid
      when 'office' then p.office_updates
      else false end
    from public.notification_preferences p where p.user_id = p_user
  ), false)
$$;

-- 9) updated_at, grants e RLS das tabelas novas -------------------------------------
do $$
declare t text;
begin
  foreach t in array array['agencies', 'agency_members', 'agency_brands', 'brand_members', 'documents', 'inbox_notifications'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    if t <> 'inbox_notifications' then
      execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
      execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;

-- 10) funções auxiliares de papel (security definer: leem como dono, sem recursão de RLS) --
-- conta de demonstração (painel público de login); mesmo critério de health.is_demo_user (0038)
create or replace function public.is_demo_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.raw_app_meta_data ->> 'ultra_hero_demo' from auth.users u where u.id = auth.uid()), '') = 'true'
$$;

-- admin geral do módulo: admin da plataforma com conta real (D6)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() and not public.is_demo_account()
$$;

create or replace function public.agency_role_rank(p_role text)
returns int language sql immutable set search_path = '' as $$
  select case p_role when 'staff' then 1 when 'manager' then 2 when 'admin' then 3 else 0 end
$$;

-- papel do usuário logado na agência (null se não é membro ativo ou a agência está suspensa)
create or replace function public.agency_role_of(p_agency uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.agency_members m
  join public.agencies a on a.id = m.agency_id and a.status = 'active'
  where m.agency_id = p_agency and m.user_id = auth.uid() and m.revoked_at is null
$$;

-- pode pelo menos p_min? (admin geral real sempre pode: suporte; conta demo com papel admin NÃO)
create or replace function public.agency_can(p_agency uuid, p_min text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_agency is not null and (public.is_platform_admin()
    or public.agency_role_rank(public.agency_role_of(p_agency)) >= greatest(public.agency_role_rank(p_min), 1))
$$;

-- agência de demonstração? (RPCs de escrita recusam com demo_locked o que a D6 trava)
create or replace function public.agency_is_demo(p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.is_demo from public.agencies a where a.id = p_agency), false)
$$;

create or replace function public.is_agency_admin(p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.agency_can(p_agency, 'admin')
$$;

-- agências em que o usuário tem pelo menos p_min (para políticas: (select public.my_agency_ids('manager')))
create or replace function public.my_agency_ids(p_min text default 'staff')
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.agency_id), '{}'::uuid[])
  from public.agency_members m join public.agencies a on a.id = m.agency_id and a.status = 'active'
  where m.user_id = auth.uid() and m.revoked_at is null
    and public.agency_role_rank(m.role) >= greatest(public.agency_role_rank(p_min), 1)
$$;

-- papel do usuário na marca ('owner' | 'staff' | null); a marca precisa estar vinculada a agência ativa
create or replace function public.brand_member_of(p_brand uuid)
returns text language sql stable security definer set search_path = '' as $$
  select bm.role from public.brand_members bm
  where bm.brand_id = p_brand and bm.user_id = auth.uid() and bm.revoked_at is null
    and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
                where ab.brand_id = bm.brand_id and ab.status = 'active')
$$;

create or replace function public.my_brand_ids(p_owner_only boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct bm.brand_id), '{}'::uuid[]) from public.brand_members bm
  where bm.user_id = auth.uid() and bm.revoked_at is null and (not p_owner_only or bm.role = 'owner')
    and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
                where ab.brand_id = bm.brand_id and ab.status = 'active')
$$;

-- marcas vinculadas às agências do usuário (qualquer papel). p_active_only = true para o que é da equipe da
-- marca (brand_members, convites): só o vínculo ativo, que é único por marca (D18).
create or replace function public.my_agency_brand_ids(p_active_only boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ab.brand_id), '{}'::uuid[]) from public.agency_brands ab
  where ab.agency_id = any (public.my_agency_ids('staff')) and (not p_active_only or ab.status = 'active')
$$;

-- agências vinculadas às marcas do usuário
create or replace function public.my_brand_agency_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ab.agency_id), '{}'::uuid[]) from public.agency_brands ab
  where ab.status = 'active' and ab.brand_id = any (public.my_brand_ids(false))
$$;

-- agência do vínculo ativo da marca (única, D18)
create or replace function public.brand_active_agency(p_brand uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select ab.agency_id from public.agency_brands ab
  join public.agencies a on a.id = ab.agency_id and a.status = 'active'
  where ab.brand_id = p_brand and ab.status = 'active' limit 1
$$;

-- tipos de aviso que viram push (só para o escritório do creator; 7.2)
create or replace function public.inbox_kind_pushes(p_kind text)
returns boolean language sql immutable set search_path = '' as $$
  select p_kind in ('message_received', 'opportunity_received', 'opportunity_updated', 'contract_acceptance_requested',
                    'contract_confirmed', 'task_assigned', 'deliverable_decided', 'calendar_event_added', 'task_overdue', 'payout_updated')
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_demo_account()', 'public.is_platform_admin()', 'public.agency_role_rank(text)', 'public.agency_role_of(uuid)',
    'public.agency_can(uuid, text)', 'public.agency_is_demo(uuid)', 'public.is_agency_admin(uuid)', 'public.my_agency_ids(text)',
    'public.brand_member_of(uuid)', 'public.my_brand_ids(boolean)', 'public.my_agency_brand_ids(boolean)',
    'public.my_brand_agency_ids()', 'public.brand_active_agency(uuid)', 'public.inbox_kind_pushes(text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 11) políticas de leitura -------------------------------------------------------
-- admin geral real (nunca conta demo, D6)
do $$
declare t text;
begin
  foreach t in array array['agencies', 'agency_members', 'agency_brands', 'brand_members', 'documents'] loop
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
  end loop;
end $$;

drop policy if exists agencies_select_member on public.agencies;
create policy agencies_select_member on public.agencies for select to authenticated
  using (id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists agencies_select_brand on public.agencies;
create policy agencies_select_brand on public.agencies for select to authenticated
  using (id = any ((select public.my_brand_agency_ids())::uuid[]));

drop policy if exists agency_members_select_agency on public.agency_members;
create policy agency_members_select_agency on public.agency_members for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));

drop policy if exists agency_brands_select_agency on public.agency_brands;
create policy agency_brands_select_agency on public.agency_brands for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists agency_brands_select_brand on public.agency_brands;
create policy agency_brands_select_brand on public.agency_brands for select to authenticated
  using (status = 'active' and brand_id = any ((select public.my_brand_ids(false))::uuid[]));

drop policy if exists brand_members_select_agency on public.brand_members;
create policy brand_members_select_agency on public.brand_members for select to authenticated
  using (brand_id = any ((select public.my_agency_brand_ids(true))::uuid[]));
drop policy if exists brand_members_select_brand on public.brand_members;
create policy brand_members_select_brand on public.brand_members for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- marcas: a pública (status = 'active') da 0062 não muda; membro e agência leem também a "inactive"
drop policy if exists brands_select_member on public.brands;
create policy brands_select_member on public.brands for select to authenticated
  using (id = any ((select public.my_brand_ids(false))::uuid[]));
drop policy if exists brands_select_agency on public.brands;
create policy brands_select_agency on public.brands for select to authenticated
  using (id = any ((select public.my_agency_brand_ids())::uuid[]));

-- convites: Adm da agência vê todos da agência; gestor só os de marca; dono da marca os da própria marca
drop policy if exists invitations_select_agency_admin on public.invitations;
create policy invitations_select_agency_admin on public.invitations for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists invitations_select_agency_manager on public.invitations;
create policy invitations_select_agency_manager on public.invitations for select to authenticated
  using (brand_id is not null and agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists invitations_select_brand_owner on public.invitations;
create policy invitations_select_brand_owner on public.invitations for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(true))::uuid[]) and agency_id = any ((select public.my_brand_agency_ids())::uuid[]));
-- D6: conta demo não lê convite de agência/marca (restritiva: soma com as permissivas existentes)
drop policy if exists invitations_hide_from_demo on public.invitations;
create policy invitations_hide_from_demo on public.invitations as restrictive for select to authenticated
  using ((agency_id is null and brand_id is null) or not (select public.is_demo_account()));
-- D6/D7: conta demo (inclusive admin@demo, que tem brands_select_admin) não lista marca "inactive" de agência:
-- seria a carteira de clientes da agência real. Vê as ativas (públicas) e as do próprio escopo (agência demo).
drop policy if exists brands_hide_agency_from_demo on public.brands;
create policy brands_hide_agency_from_demo on public.brands as restrictive for select to authenticated
  using (status = 'active' or not (select public.is_demo_account())
         or id = any ((select public.my_brand_ids(false))::uuid[]) or id = any ((select public.my_agency_brand_ids())::uuid[]));
-- D6: conta demo (inclusive admin@demo) não lê a auditoria do módulo
drop policy if exists admin_audit_hide_agency_from_demo on public.admin_audit;
create policy admin_audit_hide_agency_from_demo on public.admin_audit as restrictive for select to authenticated
  using (not (select public.is_demo_account())
         or coalesce(after_data ->> 'agency_id', before_data ->> 'agency_id') is null);

-- avisos: cada um lê só os próprios (o admin geral também; sem _select_admin)
drop policy if exists inbox_notifications_select_own on public.inbox_notifications;
create policy inbox_notifications_select_own on public.inbox_notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- documentos (forma da 0064; a 0065/0066 recriam com os ramos de talento, pedido e negócio)
drop policy if exists documents_select_agency_admin on public.documents;
create policy documents_select_agency_admin on public.documents for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists documents_select_agency on public.documents;
create policy documents_select_agency on public.documents for select to authenticated
  using (not restricted and status <> 'archived' and agency_id = any ((select public.my_agency_ids('staff'))::uuid[])
         and scope_type in ('agency', 'brand'));
drop policy if exists documents_select_brand on public.documents;
create policy documents_select_brand on public.documents for select to authenticated
  using (share_brand and status = 'ready' and brand_id = any ((select public.my_brand_ids(false))::uuid[]) and deal_id is null);
-- quem enviou só enxerga a própria reserva enquanto envia (necessário para a política de insert do Storage)
drop policy if exists documents_select_uploader on public.documents;
create policy documents_select_uploader on public.documents for select to authenticated
  using (uploaded_by = (select auth.uid()) and status = 'pending' and not restricted);

-- 12) avisos: funções internas ---------------------------------------------------
-- grava um aviso (dedupe opcional) e, se o tipo empurra e o link é do escritório, enfileira o push
create or replace function public.inbox_notify(p_user uuid, p_kind text, p_link text, p_params jsonb default '{}'::jsonb,
  p_agency uuid default null, p_entity_type text default null, p_entity_id uuid default null, p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user is null then return null; end if;
  insert into public.inbox_notifications (user_id, kind, params, link, agency_id, entity_type, entity_id, dedupe_key)
  values (p_user, p_kind, coalesce(p_params, '{}'::jsonb), p_link, p_agency, p_entity_type, p_entity_id, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is not null and public.inbox_kind_pushes(p_kind) and p_link like '/creator/escritorio%' then
    perform public.push_enqueue(p_user, 'office', 'office:' || v_id::text, jsonb_build_object('notification_id', v_id), now());
  end if;
  return v_id;
end $$;

-- avisa os membros ativos da agência com pelo menos p_min_role (dedupe por pessoa)
create or replace function public.inbox_notify_agency(p_agency uuid, p_min_role text, p_kind text, p_link text,
  p_params jsonb default '{}'::jsonb, p_entity_type text default null, p_entity_id uuid default null, p_dedupe text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_count int := 0;
begin
  for r in select m.user_id from public.agency_members m
           where m.agency_id = p_agency and m.revoked_at is null
             and public.agency_role_rank(m.role) >= greatest(public.agency_role_rank(p_min_role), 1) loop
    if public.inbox_notify(r.user_id, p_kind, p_link, p_params, p_agency, p_entity_type, p_entity_id,
                           case when p_dedupe is null then null else p_dedupe || ':' || r.user_id::text end) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- avisa os membros ativos da marca (só os donos, se p_owner_only)
create or replace function public.inbox_notify_brand(p_brand uuid, p_owner_only boolean, p_kind text, p_link text,
  p_params jsonb default '{}'::jsonb, p_agency uuid default null, p_entity_type text default null, p_entity_id uuid default null,
  p_dedupe text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_count int := 0;
begin
  for r in select bm.user_id from public.brand_members bm
           where bm.brand_id = p_brand and bm.revoked_at is null and (not p_owner_only or bm.role = 'owner') loop
    if public.inbox_notify(r.user_id, p_kind, p_link, p_params, p_agency, p_entity_type, p_entity_id,
                           case when p_dedupe is null then null else p_dedupe || ':' || r.user_id::text end) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

revoke execute on function public.inbox_notify(uuid, text, text, jsonb, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.inbox_notify(uuid, text, text, jsonb, uuid, text, uuid, text) to service_role;
revoke execute on function public.inbox_notify_agency(uuid, text, text, text, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.inbox_notify_agency(uuid, text, text, text, jsonb, text, uuid, text) to service_role;
revoke execute on function public.inbox_notify_brand(uuid, boolean, text, text, jsonb, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.inbox_notify_brand(uuid, boolean, text, text, jsonb, uuid, text, uuid, text) to service_role;

-- marcar como lidas (null = todas as próprias)
create or replace function public.inbox_mark_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  update public.inbox_notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.inbox_mark_read(uuid[]) from public, anon;
grant execute on function public.inbox_mark_read(uuid[]) to authenticated, service_role;

-- 13) RPCs de equipe da agência ------------------------------------------------
create or replace function public.agency_email_ok(p_email text)
returns boolean language sql immutable set search_path = '' as $$
  select p_email is not null and char_length(p_email) <= 254 and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;
revoke execute on function public.agency_email_ok(text) from public, anon;
grant execute on function public.agency_email_ok(text) to authenticated, service_role;

create or replace function public.agency_invite_member(p_agency uuid, p_email text, p_role text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_role is null or p_role not in ('admin', 'manager', 'staff') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.agency_members m join auth.users u on u.id = m.user_id
             where m.agency_id = p_agency and m.revoked_at is null and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  -- convite novo substitui o anterior do mesmo e-mail para a mesma agência
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.agency_id = p_agency and i.brand_id is null and lower(i.email::text) = v_email;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, agency_id, member_role, token_hash, expires_at, created_by)
  values (v_email, 'agency', p_agency, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;
  perform public.audit_log('agency.member_invite', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', p_agency, 'email', v_email, 'member_role', p_role), null,
    case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
  return query select v_id, v_token;
end $$;

create or replace function public.agency_member_set_role(p_agency uuid, p_user uuid, p_role text, p_justification text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_current text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_role is null or p_role not in ('admin', 'manager', 'staff') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_justification, ''))) < 5 then raise exception 'justification_required' using errcode = '22023'; end if;
  -- trava a agência: duas trocas simultâneas não deixam a agência sem Adm
  perform 1 from public.agencies a where a.id = p_agency for update;
  select m.role into v_current from public.agency_members m
  where m.agency_id = p_agency and m.user_id = p_user and m.revoked_at is null for update;
  if v_current is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_current = p_role then return; end if;
  if v_current = 'admin' and (select count(*) from public.agency_members m
                              where m.agency_id = p_agency and m.role = 'admin' and m.revoked_at is null) <= 1 then
    raise exception 'last_agency_admin' using errcode = 'P0001';
  end if;
  update public.agency_members set role = p_role where agency_id = p_agency and user_id = p_user and revoked_at is null;
  perform public.audit_log('agency.member_role', 'agency_member', p_user::text,
    jsonb_build_object('agency_id', p_agency, 'role', v_current), jsonb_build_object('agency_id', p_agency, 'role', p_role),
    btrim(p_justification), case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
end $$;

create or replace function public.agency_member_remove(p_agency uuid, p_user uuid, p_justification text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_current text; v_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_justification, ''))) < 5 then raise exception 'justification_required' using errcode = '22023'; end if;
  perform 1 from public.agencies a where a.id = p_agency for update;
  select m.role into v_current from public.agency_members m
  where m.agency_id = p_agency and m.user_id = p_user and m.revoked_at is null for update;
  if v_current is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_current = 'admin' and (select count(*) from public.agency_members m
                              where m.agency_id = p_agency and m.role = 'admin' and m.revoked_at is null) <= 1 then
    raise exception 'last_agency_admin' using errcode = 'P0001';
  end if;
  update public.agency_members set revoked_at = now() where agency_id = p_agency and user_id = p_user and revoked_at is null;
  update public.role_assignments set revoked_at = now()
  where user_id = p_user and role::text = 'agency' and scope_id = p_agency and revoked_at is null;
  -- convites pendentes da mesma pessoa para esta agência deixam de valer
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user;
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.agency_id = p_agency and i.brand_id is null and lower(i.email::text) = v_email;
  perform public.audit_log('agency.member_remove', 'agency_member', p_user::text,
    jsonb_build_object('agency_id', p_agency, 'role', v_current), jsonb_build_object('agency_id', p_agency, 'removed', true),
    btrim(p_justification), case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
end $$;

create or replace function public.agency_member_update_self(p_display_name text, p_job_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_display_name, '')); v_title text := nullif(btrim(coalesce(p_job_title, '')), '');
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 80 or char_length(coalesce(v_title, '')) > 80 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.agency_members set display_name = v_name, job_title = v_title where user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.agency_settings_save(p_agency uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb; v_tz text; v_days int; v_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select jsonb_build_object('agency_id', a.id, 'name', a.name, 'timezone', a.timezone, 'relationship_alert_days', a.relationship_alert_days,
                            'contact_email', a.contact_email)
    into v_before from public.agencies a where a.id = p_agency for update;
  if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  v_tz := coalesce(nullif(btrim(p_data ->> 'timezone'), ''), v_before ->> 'timezone');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  begin
    v_days := coalesce((p_data ->> 'relationship_alert_days')::int, (v_before ->> 'relationship_alert_days')::int);
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_email := nullif(lower(btrim(coalesce(p_data ->> 'contact_email', ''))), '');
  if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  begin
    update public.agencies set
      name = coalesce(nullif(btrim(p_data ->> 'name'), ''), name),
      timezone = v_tz, relationship_alert_days = v_days,
      contact_email = case when p_data ? 'contact_email' then v_email else contact_email end
    where id = p_agency;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select jsonb_build_object('agency_id', a.id, 'name', a.name, 'timezone', a.timezone, 'relationship_alert_days', a.relationship_alert_days,
                            'contact_email', a.contact_email)
    into v_after from public.agencies a where a.id = p_agency;
  if v_after is distinct from v_before then
    perform public.audit_log('agency.settings', 'agency', p_agency::text, v_before, v_after, null,
      case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
  end if;
end $$;

-- 14) RPCs de marcas da agência e equipe da marca -------------------------------
create or replace function public.agency_brand_create(p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_slug text; v_demo boolean; v_manager uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.brand_https_url_ok(btrim(coalesce(p_data ->> 'site_url', ''))) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if not public.brand_image_url_ok(nullif(btrim(coalesce(p_data ->> 'logo_url', '')), '')) then raise exception 'invalid_image' using errcode = '22023'; end if;
  v_demo := public.agency_is_demo(p_agency);
  v_slug := lower(btrim(coalesce(p_data ->> 'slug', '')));
  if v_demo then
    if v_slug !~ '^exemplo-' then v_slug := left('exemplo-' || v_slug, 60); end if;
    if (select count(*) from public.agency_brands ab where ab.agency_id = p_agency) >= 10 then
      raise exception 'demo_limit' using errcode = 'P0001';
    end if;
  end if;
  v_manager := nullif(p_data ->> 'account_manager_id', '')::uuid;
  if v_manager is not null and not exists (select 1 from public.agency_members m
      where m.agency_id = p_agency and m.user_id = v_manager and m.revoked_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    -- D7: marca criada pela agência nasce "inactive" (marca ativa é legível por anon)
    insert into public.brands (slug, name, logo_url, site_url, status, default_relationship, is_demo, created_by)
    values (v_slug, btrim(coalesce(p_data ->> 'name', '')), nullif(btrim(coalesce(p_data ->> 'logo_url', '')), ''),
            btrim(p_data ->> 'site_url'), 'inactive', 'sponsor', false, auth.uid())
    returning id into v_id;
  exception
    when unique_violation then raise exception 'duplicate_slug' using errcode = '23505';
    when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  insert into public.agency_brands (agency_id, brand_id, status, account_manager_id, is_demo, created_by)
  values (p_agency, v_id, 'active', v_manager, v_demo, auth.uid());
  perform public.audit_log('agency.brand_create', 'brand', v_id::text, null,
    jsonb_build_object('agency_id', p_agency, 'slug', v_slug, 'name', btrim(p_data ->> 'name')), null,
    case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
  return v_id;
end $$;

create or replace function public.agency_brand_link(p_agency uuid, p_brand uuid, p_on boolean, p_account_manager uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_brand record; v_other uuid; v_before text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  select b.id, b.status, b.is_demo into v_brand from public.brands b where b.id = p_brand for update;
  if v_brand.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- marca "inactive" só é visível para quem já tem vínculo (ou o admin geral)
  if v_brand.status <> 'active' and not public.is_platform_admin()
     and not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = p_brand) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_brand.is_demo then raise exception 'demo_brand' using errcode = 'P0001'; end if;
  if p_account_manager is not null and not exists (select 1 from public.agency_members m
      where m.agency_id = p_agency and m.user_id = p_account_manager and m.revoked_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select ab.status into v_before from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = p_brand;
  if coalesce(p_on, false) then
    select ab.agency_id into v_other from public.agency_brands ab
    where ab.brand_id = p_brand and ab.status = 'active' and ab.agency_id <> p_agency;
    if v_other is not null then
      if not public.is_platform_admin() then raise exception 'brand_linked_elsewhere' using errcode = 'P0001'; end if;
      -- transferência (D18): só o admin geral, arquivando o vínculo anterior na mesma transação
      update public.agency_brands set status = 'archived' where brand_id = p_brand and agency_id = v_other and status = 'active';
      update public.invitations i set status = 'revoked', revoked_at = now()
      where i.status = 'pending' and i.brand_id = p_brand and i.agency_id = v_other;
    end if;
    insert into public.agency_brands (agency_id, brand_id, status, account_manager_id, created_by)
    values (p_agency, p_brand, 'active', p_account_manager, auth.uid())
    on conflict (agency_id, brand_id) do update
      set status = 'active', account_manager_id = coalesce(excluded.account_manager_id, public.agency_brands.account_manager_id);
  else
    update public.agency_brands set status = 'archived' where agency_id = p_agency and brand_id = p_brand and status = 'active';
  end if;
  perform public.audit_log('agency.brand_link', 'brand', p_brand::text,
    jsonb_build_object('agency_id', p_agency, 'status', v_before, 'transferred_from', v_other),
    jsonb_build_object('agency_id', p_agency, 'status', case when coalesce(p_on, false) then 'active' else 'archived' end), null,
    case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
end $$;

create or replace function public.agency_invite_brand_member(p_agency uuid, p_brand uuid, p_email text, p_role text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- só a agência do vínculo ativo (o único, D18) convida a equipe da marca
  if not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = p_brand and ab.status = 'active') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_role is null or p_role not in ('owner', 'staff') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.brand_members bm join auth.users u on u.id = bm.user_id
             where bm.brand_id = p_brand and bm.revoked_at is null and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.brand_id = p_brand and lower(i.email::text) = v_email;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, agency_id, brand_id, member_role, token_hash, expires_at, created_by)
  values (v_email, 'brand', p_agency, p_brand, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;
  perform public.audit_log('brand.member_invite', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', p_agency, 'brand_id', p_brand, 'email', v_email, 'member_role', p_role), null,
    case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
  return query select v_id, v_token;
end $$;

create or replace function public.brand_invite_member(p_brand uuid, p_email text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.brand_members bm join auth.users u on u.id = bm.user_id
             where bm.brand_id = p_brand and bm.revoked_at is null and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.brand_id = p_brand and lower(i.email::text) = v_email;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, agency_id, brand_id, member_role, token_hash, expires_at, created_by)
  values (v_email, 'brand', v_agency, p_brand, 'staff', encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;
  perform public.audit_log('brand.member_invite', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'brand_id', p_brand, 'email', v_email, 'member_role', 'staff'), null, 'brand'::public.actor_type);
  return query select v_id, v_token;
end $$;

create or replace function public.brand_member_remove(p_brand uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_role text; v_email text; v_by_owner boolean; v_actor public.actor_type;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_by_owner := coalesce(public.brand_member_of(p_brand) = 'owner', false);
  if not v_by_owner and not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  perform 1 from public.brands b where b.id = p_brand for update;
  select bm.role into v_role from public.brand_members bm where bm.brand_id = p_brand and bm.user_id = p_user and bm.revoked_at is null for update;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role = 'owner' and (select count(*) from public.brand_members bm
                           where bm.brand_id = p_brand and bm.role = 'owner' and bm.revoked_at is null) <= 1 then
    raise exception 'last_brand_owner' using errcode = 'P0001';
  end if;
  update public.brand_members set revoked_at = now() where brand_id = p_brand and user_id = p_user and revoked_at is null;
  update public.role_assignments set revoked_at = now()
  where user_id = p_user and role::text = 'brand' and scope_id = p_brand and revoked_at is null;
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user;
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.brand_id = p_brand and lower(i.email::text) = v_email;
  v_actor := case when v_by_owner then 'brand' when public.agency_role_of(v_agency) is null then 'admin' else 'agency' end::public.actor_type;
  perform public.audit_log('brand.member_remove', 'brand_member', p_user::text,
    jsonb_build_object('agency_id', v_agency, 'brand_id', p_brand, 'role', v_role),
    jsonb_build_object('agency_id', v_agency, 'brand_id', p_brand, 'removed', true), null, v_actor);
end $$;

-- revoga convite pendente (escopo derivado do próprio convite, D19)
create or replace function public.agency_invitation_revoke(p_id uuid, p_justification text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv record; v_allowed boolean := false; v_actor public.actor_type;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select i.id, i.role::text as role, i.agency_id, i.brand_id, i.member_role, i.status into v_inv
  from public.invitations i where i.id = p_id for update;
  if v_inv.id is null or v_inv.agency_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_inv.role = 'agency' then
    v_allowed := public.agency_can(v_inv.agency_id, 'admin');
  elsif v_inv.role = 'brand' then
    v_allowed := public.agency_can(v_inv.agency_id, 'manager')
      or coalesce(v_inv.member_role = 'staff' and public.brand_member_of(v_inv.brand_id) = 'owner', false);
  end if;
  -- sem permissão no escopo do convite: não diz que ele existe
  if not coalesce(v_allowed, false) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_inv.status <> 'pending' then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  update public.invitations set status = 'revoked', revoked_at = now() where id = p_id;
  v_actor := case when public.agency_role_of(v_inv.agency_id) is not null then 'agency'
                  when public.brand_member_of(v_inv.brand_id) is not null then 'brand' else 'admin' end::public.actor_type;
  perform public.audit_log('invitation.revoke', 'invitation', p_id::text,
    jsonb_build_object('agency_id', v_inv.agency_id, 'status', 'pending'), jsonb_build_object('agency_id', v_inv.agency_id, 'status', 'revoked'),
    nullif(btrim(coalesce(p_justification, '')), ''), v_actor);
end $$;

-- 15) aceite de convite (0058 + ramos de agência e marca) ------------------------
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.invitations%rowtype; v_email text; v_uid uuid; v_name text; v_scope_type text; v_scope_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_inv.status <> 'pending' then raise exception 'invitation_invalid'; end if;
  if v_inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation_expired';
  end if;
  if lower(v_inv.email::text) <> v_email then raise exception 'invitation_email_mismatch'; end if;
  if v_inv.role::text = 'seller' and exists (select 1 from public.seller_organizations o where o.id = v_inv.seller_org_id and o.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role::text = 'creator' and exists (select 1 from public.creator_profiles c where c.id = v_inv.creator_profile_id and c.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role::text = 'professional' and exists (select 1 from public.professionals p where p.id = v_inv.professional_id and p.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  -- D6: conta demo não entra em agência real (nem na marca dela)
  if v_inv.agency_id is not null and not public.agency_is_demo(v_inv.agency_id) and public.is_demo_account() then
    raise exception 'demo_account_forbidden';
  end if;
  if v_inv.agency_id is not null and exists (select 1 from public.agencies a where a.id = v_inv.agency_id and a.status <> 'active') then
    raise exception 'partner_suspended';
  end if;
  v_name := left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = v_uid)), ''), split_part(v_email, '@', 1)), 80);

  perform set_config('app.trusted', 'on', true);
  if v_inv.role::text = 'seller' then
    insert into public.seller_memberships (org_id, user_id) values (v_inv.seller_org_id, v_uid)
    on conflict (org_id, user_id) do update set revoked_at = null;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'seller', 'seller_org', v_inv.seller_org_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'seller_org'; v_scope_id := v_inv.seller_org_id;
  elsif v_inv.role::text = 'professional' then
    if exists (select 1 from public.professionals where user_id = v_uid and id <> v_inv.professional_id) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'professional_profile_already_linked';
    end if;
    update public.professionals set user_id = v_uid
    where id = v_inv.professional_id and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'professional_profile_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, v_inv.role, 'professional', v_inv.professional_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'professional'; v_scope_id := v_inv.professional_id;
  elsif v_inv.role::text = 'agency' then
    -- D10: uma agência ativa por pessoa
    if exists (select 1 from public.agency_members m where m.user_id = v_uid and m.revoked_at is null and m.agency_id <> v_inv.agency_id) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'agency_member_elsewhere';
    end if;
    insert into public.agency_members (agency_id, user_id, role, display_name, invited_by)
    values (v_inv.agency_id, v_uid, v_inv.member_role, v_name, v_inv.created_by)
    -- membro ativo: o convite não mexe no papel (troca só por agency_member_set_role, que guarda o último Adm);
    -- membro removido: volta com o papel do convite
    on conflict (agency_id, user_id) do update
      set role = case when public.agency_members.revoked_at is null then public.agency_members.role else excluded.role end,
          revoked_at = null, updated_at = now();
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'agency', 'agency', v_inv.agency_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform public.inbox_notify_agency(v_inv.agency_id, 'admin', 'member_joined', '/agencia/equipe',
      jsonb_build_object('name', v_name), 'agency', v_inv.agency_id, 'member_joined:' || v_inv.id::text);
    v_scope_type := 'agency'; v_scope_id := v_inv.agency_id;
  elsif v_inv.role::text = 'brand' then
    if not exists (select 1 from public.agency_brands ab where ab.agency_id = v_inv.agency_id and ab.brand_id = v_inv.brand_id and ab.status = 'active') then
      perform set_config('app.trusted', 'off', true);
      raise exception 'brand_not_linked';
    end if;
    insert into public.brand_members (brand_id, user_id, role, display_name, invited_by)
    values (v_inv.brand_id, v_uid, v_inv.member_role, v_name, v_inv.created_by)
    -- mesma regra: nunca rebaixa membro ativo (o último dono continua dono)
    on conflict (brand_id, user_id) do update
      set role = case when public.brand_members.revoked_at is null then public.brand_members.role else excluded.role end,
          revoked_at = null, updated_at = now();
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'brand', 'brand', v_inv.brand_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform public.inbox_notify_brand(v_inv.brand_id, true, 'brand_member_joined', '/marca/equipe',
      jsonb_build_object('name', v_name), v_inv.agency_id, 'brand', v_inv.brand_id, 'brand_member_joined:' || v_inv.id::text);
    perform public.inbox_notify_agency(v_inv.agency_id, 'manager', 'brand_member_joined', '/agencia/marcas/' || v_inv.brand_id::text,
      jsonb_build_object('name', v_name, 'brand', (select b.name from public.brands b where b.id = v_inv.brand_id)),
      'brand', v_inv.brand_id, 'brand_member_joined_agency:' || v_inv.id::text);
    v_scope_type := 'brand'; v_scope_id := v_inv.brand_id;
  else
    update public.creator_profiles set user_id = v_uid
    where id = v_inv.creator_profile_id and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'creator_profile_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'creator', v_inv.creator_profile_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'creator'; v_scope_id := v_inv.creator_profile_id;
  end if;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform public.audit_log('invitation.accept', 'invitation', v_inv.id::text, null,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid, 'agency_id', v_inv.agency_id, 'brand_id', v_inv.brand_id), null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  return jsonb_build_object('role', v_inv.role, 'scope_type', v_scope_type, 'scope_id', v_scope_id);
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- 16) documentos -----------------------------------------------------------------
-- reserva: o banco escolhe o caminho; o cliente envia o arquivo direto ao Storage e depois confirma
create or replace function public.document_reserve(p_agency uuid, p_scope_type text, p_scope_id uuid, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid(); v_kind text; v_title text; v_mime text; v_size bigint; v_ext text; v_path text;
  v_side text; v_restricted boolean := false; v_share_brand boolean := false; v_share_talent boolean := false;
  v_brand uuid; v_is_admin boolean; v_is_manager boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- agência de demonstração é pública: sem envio de arquivos (cota e conteúdo de terceiros)
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
      v_side := 'agency';
      v_share_brand := coalesce((p_meta ->> 'share_brand')::boolean, false);
    elsif public.brand_member_of(v_brand) is not null then
      -- a marca envia sempre compartilhado com ela mesma e nunca restrito
      v_side := 'brand'; v_share_brand := true;
      if v_kind = 'contract' then raise exception 'forbidden' using errcode = '42501'; end if;
    else
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    -- talento (0065), pedido e negócio (0066) entram com as próprias migrações
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- contrato tem preço: só o Adm da agência (ou o admin geral); nasce restrito
  if v_kind = 'contract' then
    if not v_is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
    v_restricted := true; v_share_talent := false;
  elsif v_side = 'agency' and v_is_admin then
    v_restricted := coalesce((p_meta ->> 'restricted')::boolean, false);
  end if;

  v_path := p_agency::text || '/' || p_scope_type || '/' || p_scope_id::text || '/' || v_id::text || '.' || v_ext;
  begin
    insert into public.documents (id, agency_id, scope_type, brand_id, kind, title, storage_path, mime_type, size_bytes,
                                  restricted, share_brand, share_talent, status, uploaded_by, uploader_side)
    values (v_id, p_agency, p_scope_type, v_brand, v_kind, v_title, v_path, v_mime, v_size,
            v_restricted, v_share_brand, v_share_talent, 'pending', auth.uid(), v_side);
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

create or replace function public.document_confirm(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.id, d.agency_id, d.storage_path, d.status, d.uploaded_by, d.scope_type, d.kind, d.title into v_doc
  from public.documents d where d.id = p_id for update;
  if v_doc.id is null or v_doc.uploaded_by is distinct from auth.uid() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if to_regclass('storage.objects') is not null then
    if not exists (select 1 from storage.objects o where o.bucket_id = 'agency-docs' and o.name = v_doc.storage_path) then
      raise exception 'file_missing' using errcode = 'P0001';
    end if;
  end if;
  update public.documents set status = 'ready' where id = p_id;
  perform public.audit_log('document.upload', 'document', p_id::text, null,
    jsonb_build_object('agency_id', v_doc.agency_id, 'scope_type', v_doc.scope_type, 'kind', v_doc.kind, 'title', v_doc.title), null,
    case when public.agency_role_of(v_doc.agency_id) is not null then 'agency' when public.is_platform_admin() then 'admin' else 'brand' end::public.actor_type);
end $$;

create or replace function public.document_archive(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc record; v_ok boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.id, d.agency_id, d.kind, d.restricted, d.status, d.uploaded_by into v_doc from public.documents d where d.id = p_id for update;
  if v_doc.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_doc.kind = 'contract' or v_doc.restricted then
    v_ok := public.agency_can(v_doc.agency_id, 'admin');
  else
    v_ok := coalesce(v_doc.uploaded_by = auth.uid(), false) or public.agency_can(v_doc.agency_id, 'manager');
  end if;
  if not coalesce(v_ok, false) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'ready' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.documents set status = 'archived', archived_at = now() where id = p_id;
  perform public.audit_log('document.archive', 'document', p_id::text, jsonb_build_object('agency_id', v_doc.agency_id, 'status', 'ready'),
    jsonb_build_object('agency_id', v_doc.agency_id, 'status', 'archived'), nullif(btrim(coalesce(p_reason, '')), ''),
    case when public.agency_role_of(v_doc.agency_id) is not null then 'agency' when public.is_platform_admin() then 'admin' else 'brand' end::public.actor_type);
end $$;

create or replace function public.document_set_sharing(p_id uuid, p_share_brand boolean, p_share_talent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc record; v_brand boolean; v_talent boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.id, d.agency_id, d.kind, d.restricted, d.scope_type, d.talent_id, d.share_brand, d.share_talent into v_doc
  from public.documents d where d.id = p_id for update;
  if v_doc.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_doc.agency_id, case when v_doc.kind = 'contract' or v_doc.restricted then 'admin' else 'manager' end) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_brand := coalesce(p_share_brand, false);
  v_talent := coalesce(p_share_talent, false);
  -- escopo talento nunca vai à marca; escopo de agência ou marca não tem talento
  if v_doc.scope_type = 'talent' then v_brand := false; end if;
  if v_doc.scope_type in ('agency', 'brand') then v_talent := false; end if;
  if v_doc.scope_type = 'agency' then v_brand := false; end if;
  begin
    update public.documents set share_brand = v_brand, share_talent = v_talent where id = p_id;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('document.sharing', 'document', p_id::text,
    jsonb_build_object('agency_id', v_doc.agency_id, 'share_brand', v_doc.share_brand, 'share_talent', v_doc.share_talent),
    jsonb_build_object('agency_id', v_doc.agency_id, 'share_brand', v_brand, 'share_talent', v_talent), null,
    case when public.agency_role_of(v_doc.agency_id) is null then 'admin' else 'agency' end::public.actor_type);
end $$;

-- 17) admin geral --------------------------------------------------------------------
-- padrões da agência (segmentos na 0065, datas comerciais na 0068); idempotente
create or replace function public.agency_seed_defaults(p_agency uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_agency is null then return; end if;
  -- 0064: nada a semear ainda
end $$;
revoke execute on function public.agency_seed_defaults(uuid) from public, anon, authenticated;
grant execute on function public.agency_seed_defaults(uuid) to service_role;

create or replace function public.admin_agency_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_before jsonb; v_after jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_id is not null then
    select to_jsonb(a) - 'created_at' - 'updated_at' into v_before from public.agencies a where a.id = p_id for update;
    if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  if nullif(btrim(coalesce(p_data ->> 'contact_email', '')), '') is not null
     and not public.agency_email_ok(lower(btrim(p_data ->> 'contact_email'))) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  begin
    if p_id is null then
      insert into public.agencies (slug, name, status, is_demo, contact_email, created_by)
      values (lower(btrim(coalesce(p_data ->> 'slug', ''))), btrim(coalesce(p_data ->> 'name', '')), coalesce(p_data ->> 'status', 'active'),
              coalesce((p_data ->> 'is_demo')::boolean, false), nullif(lower(btrim(coalesce(p_data ->> 'contact_email', ''))), ''), auth.uid())
      returning id into v_id;
      perform public.agency_seed_defaults(v_id);
    else
      update public.agencies set
        slug = coalesce(nullif(lower(btrim(p_data ->> 'slug')), ''), slug),
        name = coalesce(nullif(btrim(p_data ->> 'name'), ''), name),
        status = coalesce(p_data ->> 'status', status),
        is_demo = coalesce((p_data ->> 'is_demo')::boolean, is_demo),
        contact_email = case when p_data ? 'contact_email' then nullif(lower(btrim(coalesce(p_data ->> 'contact_email', ''))), '') else contact_email end
      where id = p_id returning id into v_id;
    end if;
  exception
    when unique_violation then raise exception 'duplicate_slug' using errcode = '23505';
    when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select to_jsonb(a) - 'created_at' - 'updated_at' into v_after from public.agencies a where a.id = v_id;
  if v_before is distinct from v_after then
    perform public.audit_log(case when p_id is null then 'agency.create' else 'agency.update' end, 'agency', v_id::text,
      case when v_before is null then null else v_before || jsonb_build_object('agency_id', v_id) end,
      v_after || jsonb_build_object('agency_id', v_id), null, 'admin'::public.actor_type);
  end if;
  return v_id;
end $$;

-- 0062 + travas do módulo: marca vinculada a agência, com membros ou com documentos não é apagada
create or replace function public.admin_brand_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(b) - 'created_at' - 'updated_at'
         || jsonb_build_object('products', (select count(*) from public.brand_products p where p.brand_id = b.id))
    into v_before from public.brands b where b.id = p_id;
  if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.agency_brands ab where ab.brand_id = p_id) then
    raise exception 'brand_linked_to_agency' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.brand_members bm where bm.brand_id = p_id) then
    raise exception 'brand_has_members' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.documents d where d.brand_id = p_id) then
    raise exception 'brand_has_documents' using errcode = 'P0001';
  end if;
  delete from public.brands where id = p_id;
  perform public.audit_log('brand.delete', 'brand', p_id::text, v_before, null, null);
end $$;
revoke execute on function public.admin_brand_delete(uuid) from public, anon;
grant execute on function public.admin_brand_delete(uuid) to authenticated, service_role;

-- agência de demonstração (só service role; criada pelo botão do admin geral, nunca por migração, D6).
-- p_emails = {"admin": ..., "staff": ..., "brand_owner": ...}; cada e-mail precisa ser conta demo.
-- Reexecutar não duplica e restaura papéis e vínculos.
create or replace function public.agency_demo_seed(p_agency uuid, p_emails jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid; v_staff uuid; v_owner uuid; v_brand uuid := public.seed_uuid('demo:brand:exemplo-marca');
  k text; v_uid uuid; v_meta text; v_ids jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.is_demo) then
    raise exception 'not_demo_agency' using errcode = 'P0001';
  end if;
  if p_emails is null or jsonb_typeof(p_emails) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  foreach k in array array['admin', 'staff', 'brand_owner'] loop
    select u.id, coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') into v_uid, v_meta
    from auth.users u where lower(u.email::text) = lower(btrim(coalesce(p_emails ->> k, '')));
    if v_uid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_meta <> 'true' then raise exception 'not_demo_account' using errcode = 'P0001'; end if;
    v_ids := v_ids || jsonb_build_object(k, v_uid);
  end loop;
  v_admin := (v_ids ->> 'admin')::uuid; v_staff := (v_ids ->> 'staff')::uuid; v_owner := (v_ids ->> 'brand_owner')::uuid;

  -- dados da agência demo voltam ao padrão
  update public.agencies set name = 'Agência Exemplo (demonstração)', status = 'active', timezone = 'America/Sao_Paulo',
    relationship_alert_days = 30, contact_email = null
  where id = p_agency;
  -- equipe fixa da agência demo (papéis voltam ao seed)
  insert into public.agency_members (id, agency_id, user_id, role, display_name, job_title)
  values (public.seed_uuid('demo:agency_member:admin'), p_agency, v_admin, 'admin', 'Adm da agência (exemplo)', 'Diretoria'),
         (public.seed_uuid('demo:agency_member:staff'), p_agency, v_staff, 'staff', 'Colaborador (exemplo)', 'Operação')
  on conflict (agency_id, user_id) do update set role = excluded.role, display_name = excluded.display_name,
    job_title = excluded.job_title, revoked_at = null;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_admin, 'agency', 'agency', p_agency, p_actor), (v_staff, 'agency', 'agency', p_agency, p_actor)
  on conflict (user_id, role, scope_id) do update set revoked_at = null;

  -- marca fictícia (inactive: não aparece no app; o caráter fictício fica em agency_brands.is_demo)
  insert into public.brands (id, slug, name, logo_url, site_url, status, default_relationship, is_demo, created_by)
  values (v_brand, 'exemplo-marca', 'Marca Exemplo', null, 'https://example.com/', 'inactive', 'sponsor', false, p_actor)
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

  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data, justification)
  values (p_actor, 'admin', 'demo.agency_seed', 'agency', p_agency::text, null,
          jsonb_build_object('agency_id', p_agency, 'admin', v_admin, 'staff', v_staff, 'brand_owner', v_owner, 'brand', v_brand), null);
  return jsonb_build_object('agency', p_agency, 'brand', v_brand) || v_ids;
end $$;
revoke execute on function public.agency_demo_seed(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.agency_demo_seed(uuid, jsonb, uuid) to service_role;

-- execução das RPCs de usuário (nenhuma para anon: S14 segue 17)
do $$
declare f text;
begin
  foreach f in array array[
    'public.agency_invite_member(uuid, text, text, int)', 'public.agency_member_set_role(uuid, uuid, text, text)',
    'public.agency_member_remove(uuid, uuid, text)', 'public.agency_member_update_self(text, text)',
    'public.agency_settings_save(uuid, jsonb)', 'public.agency_brand_create(uuid, jsonb)',
    'public.agency_brand_link(uuid, uuid, boolean, uuid)', 'public.agency_invite_brand_member(uuid, uuid, text, text, int)',
    'public.brand_invite_member(uuid, text, int)', 'public.brand_member_remove(uuid, uuid)',
    'public.agency_invitation_revoke(uuid, text)', 'public.document_reserve(uuid, text, uuid, jsonb)',
    'public.document_confirm(uuid)', 'public.document_archive(uuid, text)', 'public.document_set_sharing(uuid, boolean, boolean)',
    'public.admin_agency_save(uuid, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke execute on function public.push_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.push_allowed(uuid, text) to service_role;


-- 18b) conta pública de demonstração (admin@demo e as demais): o papel admin dela é de vitrine.
--      Não promove nem rebaixa conta real, não cria nem revoga convite, não mexe em marca atendida por
--      agência real e não vê papéis de agência/marca de outras pessoas (revisão de segurança da etapa A).
create or replace function public.guard_demo_role_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_target uuid;
begin
  if not public.is_demo_account() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_target := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if v_target is distinct from auth.uid()
     and coalesce((select u.raw_app_meta_data ->> 'ultra_hero_demo' from auth.users u where u.id = v_target), '') <> 'true' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_role_assignments_demo_guard on public.role_assignments;
create trigger trg_role_assignments_demo_guard before insert or update or delete on public.role_assignments
  for each row execute function public.guard_demo_role_writes();

create or replace function public.guard_demo_invitation_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_demo_account() then return new; end if;
  -- convite dá acesso real a quem aceita: conta demo não cria; revogar também não
  if tg_op = 'INSERT' or (new.status = 'revoked' and old.status is distinct from 'revoked') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_invitations_demo_guard on public.invitations;
create trigger trg_invitations_demo_guard before insert or update on public.invitations
  for each row execute function public.guard_demo_invitation_writes();

-- marca atendida por agência real: conta demo não edita, não publica, não apaga, não mexe nos produtos
create or replace function public.brand_in_real_agency(p_brand uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id
                 where ab.brand_id = p_brand and not a.is_demo)
$$;
create or replace function public.guard_demo_brand_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_demo_account() and public.brand_in_real_agency(old.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
-- (função separada: em plpgsql o campo brand_id só existe em brand_products)
create or replace function public.guard_demo_brand_product_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_demo_account() then
    if (tg_op <> 'DELETE' and public.brand_in_real_agency(new.brand_id))
       or (tg_op <> 'INSERT' and public.brand_in_real_agency(old.brand_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_brands_demo_guard on public.brands;
create trigger trg_brands_demo_guard before update or delete on public.brands
  for each row execute function public.guard_demo_brand_writes();
drop trigger if exists trg_brand_products_demo_guard on public.brand_products;
create trigger trg_brand_products_demo_guard before insert or update or delete on public.brand_products
  for each row execute function public.guard_demo_brand_product_writes();

revoke execute on function public.guard_demo_role_writes() from public, anon, authenticated;
revoke execute on function public.guard_demo_invitation_writes() from public, anon, authenticated;
revoke execute on function public.guard_demo_brand_writes() from public, anon, authenticated;
revoke execute on function public.guard_demo_brand_product_writes() from public, anon, authenticated;
revoke execute on function public.brand_in_real_agency(uuid) from public, anon;
grant execute on function public.brand_in_real_agency(uuid) to authenticated, service_role;

-- papéis de agência e marca de outras pessoas ficam fora do alcance da conta demo (o admin@demo lê
-- role_assignments pela política do admin)
drop policy if exists role_assignments_hide_agency_from_demo on public.role_assignments;
create policy role_assignments_hide_agency_from_demo on public.role_assignments as restrictive for select to authenticated
  using (not (select public.is_demo_account()) or role::text not in ('agency', 'brand') or user_id = (select auth.uid()));

-- mesmas listas do admin (0007 e 0015), sem os papéis de agência/marca para a conta demo
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz, roles text[], anonymized boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at,
         coalesce((select array_agg(r.role::text order by r.role) from public.role_assignments r
                   where r.user_id = u.id and r.revoked_at is null
                     and (not public.is_demo_account() or r.role::text not in ('agency', 'brand') or r.user_id = auth.uid())), '{}'),
         p.anonymized_at is not null
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin()
    and (p_search is null or u.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
  order by u.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;
revoke execute on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated, service_role;

create or replace function public.admin_get_user(p_id uuid)
returns table (id uuid, email text, display_name text, avatar_url text, locale public.locale_code, timezone text,
               created_at timestamptz, last_sign_in_at timestamptz, roles jsonb, anonymized boolean,
               banned_until timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, p.avatar_url, p.locale, p.timezone, u.created_at, u.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id))
                   from public.role_assignments r where r.user_id = u.id and r.revoked_at is null
                     and (not public.is_demo_account() or r.role::text not in ('agency', 'brand') or r.user_id = auth.uid())), '[]'::jsonb),
         p.anonymized_at is not null,
         u.banned_until
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin() and u.id = p_id
$$;
revoke execute on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated, service_role;

-- 18) Storage: bucket privado agency-docs ------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0064: schema storage ausente; bucket e políticas de agency-docs não foram criados';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('agency-docs', 'agency-docs', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  -- leitura (URL assinada): a RLS de documents decide
  execute 'drop policy if exists agency_docs_select on storage.objects';
  execute $sql$
    create policy agency_docs_select on storage.objects for select to authenticated
      using (bucket_id = 'agency-docs'
             and exists (select 1 from public.documents d where d.storage_path = storage.objects.name and d.status <> 'archived'))
  $sql$;
  -- envio: só para uma reserva "pending" do próprio usuário, feita há menos de 1 hora
  execute 'drop policy if exists agency_docs_insert on storage.objects';
  execute $sql$
    create policy agency_docs_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'agency-docs'
                  and exists (select 1 from public.documents d where d.storage_path = storage.objects.name
                              and d.status = 'pending' and d.uploaded_by = (select auth.uid())
                              and d.created_at > now() - interval '1 hour'))
  $sql$;
end $$;

-- 19) Realtime do sino (RLS: cada um recebe só as próprias linhas) ---------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbox_notifications') then
    alter publication supabase_realtime add table public.inbox_notifications;
  end if;
end $$;

-- 20) seed: a agência real (nome editável em Configurações). Sem marcas, sem membros. -------
insert into public.agencies (id, slug, name)
values (public.seed_uuid('agency:groscove'), 'groscove', 'Agência Groscove')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
