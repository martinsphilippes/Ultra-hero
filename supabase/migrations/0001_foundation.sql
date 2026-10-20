-- =============================================================================
-- Ultra Hero · 0001 · Fundação
-- Extensões, enums, identidade, papéis, parceiros, convites, auditoria, settings.
-- Convenções:
--   * Toda tabela tem RLS (políticas em 0007_rls.sql).
--   * Funções "security definer" fixam search_path para evitar hijack.
--   * Nada aqui representa operação real: a POC é 100% demonstrativa.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------- enums ------
create type public.app_role as enum ('consumer', 'creator', 'seller', 'admin');
create type public.pillar as enum ('routine', 'training', 'nutrition', 'gastronomy');
create type public.content_type as enum ('video', 'recipe', 'workout', 'guide', 'article');
create type public.content_status as enum ('draft', 'published', 'archived');
create type public.review_status as enum ('none', 'in_review', 'returned', 'approved', 'rejected');
create type public.completion_mode as enum ('manual', 'auto');
create type public.media_provider as enum ('none', 'embed_youtube', 'embed_vimeo', 'cloudflare_stream', 'mux', 'upload');
create type public.access_level as enum ('free', 'premium');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.partner_status as enum ('pending', 'active', 'suspended');
create type public.enrollment_status as enum ('active', 'completed', 'abandoned');
create type public.subscription_status as enum ('active', 'cancelled', 'expired');
create type public.product_status as enum ('draft', 'published', 'archived');
create type public.availability as enum ('available', 'unavailable');
create type public.moderation_status as enum ('clear', 'hidden', 'suspended');
create type public.link_status as enum ('suggested', 'validated', 'suspended', 'rejected');
create type public.order_status as enum ('confirmed', 'in_progress', 'completed', 'partially_completed', 'cancelled', 'failed');
create type public.fulfillment_status as enum ('awaiting', 'preparing', 'ready_for_dispatch', 'in_transit', 'delivered', 'cancelled', 'failed');
create type public.actor_type as enum ('consumer', 'creator', 'seller', 'admin', 'system');
create type public.locale_code as enum ('pt-BR', 'en', 'es');

-- ---------------------------------------------------------------- utils ------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- unaccent não é immutable; wrapper para uso em colunas geradas/índices
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict
set search_path = public, extensions as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;

create or replace function public.slugify(p text)
returns text language sql immutable parallel safe strict
set search_path = public, extensions as $$
  select trim(both '-' from regexp_replace(lower(public.f_unaccent(p)), '[^a-z0-9]+', '-', 'g'))
$$;

-- ---------------------------------------------------------------- settings ---
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

-- ---------------------------------------------------------------- identity ---
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  locale public.locale_code,
  theme text not null default 'system' check (theme in ('dark', 'light', 'system')),
  timezone text,
  onboarding_completed boolean not null default false,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  scope_type text not null default 'global' check (scope_type in ('global', 'seller_org', 'creator')),
  scope_id uuid,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (user_id, role, scope_id)
);
create index role_assignments_user_idx on public.role_assignments (user_id) where revoked_at is null;

-- ---------------------------------------------------------------- parceiros --
create table public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique,
  name text not null,
  headline text,
  bio text,
  pillars public.pillar[] not null default '{}',
  avatar_url text,
  cover_url text,
  is_fictional boolean not null default true,
  status public.partner_status not null default 'active',
  socials jsonb not null default '{}'::jsonb,
  rights_note text,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_creator_profiles_updated before update on public.creator_profiles
  for each row execute function public.set_updated_at();

create table public.seller_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('own', 'partner')),
  description text,
  logo_url text,
  status public.partner_status not null default 'active',
  is_fictional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_seller_orgs_updated before update on public.seller_organizations
  for each row execute function public.set_updated_at();

create table public.seller_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.seller_organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (org_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  role public.app_role not null check (role in ('creator', 'seller')),
  seller_org_id uuid references public.seller_organizations (id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles (id) on delete cascade,
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_scope check (
    (role = 'seller' and seller_org_id is not null and creator_profile_id is null) or
    (role = 'creator' and creator_profile_id is not null and seller_org_id is null)
  )
);

-- ---------------------------------------------------------------- auditoria --
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_type public.actor_type not null default 'admin',
  action text not null,
  resource_type text not null,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  justification text,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit (created_at desc);
create index admin_audit_resource_idx on public.admin_audit (resource_type, resource_id);

create or replace function public.audit_log(
  p_action text, p_resource_type text, p_resource_id text,
  p_before jsonb default null, p_after jsonb default null, p_justification text default null,
  p_actor_type public.actor_type default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_type public.actor_type;
begin
  v_type := coalesce(p_actor_type, case
    when auth.uid() is null then 'system'::public.actor_type
    when public.is_admin() then 'admin'::public.actor_type
    else 'consumer'::public.actor_type end);
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data, justification)
  values (auth.uid(), v_type, p_action, p_resource_type, p_resource_id, p_before, p_after, p_justification);
end $$;

-- ---------------------------------------------------------------- helpers de papel
-- security definer para não recursar em RLS de role_assignments
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.role_assignments r
    where r.user_id = auth.uid() and r.role = 'admin' and r.revoked_at is null)
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.role_assignments r
    where r.user_id = auth.uid() and r.role = p_role and r.revoked_at is null)
$$;

create or replace function public.my_creator_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.creator_profiles c
  where c.user_id = auth.uid() and c.status = 'active'
  limit 1
$$;

create or replace function public.my_seller_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.org_id from public.seller_memberships m
  join public.seller_organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.revoked_at is null and o.status = 'active'
$$;

create or replace function public.is_seller_of(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_org in (select public.my_seller_org_ids())
$$;

-- ---------------------------------------------------------------- novo usuário
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_bootstrap_admin boolean;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (id) do nothing;

  -- toda conta nova é consumidora, nível gratuito
  insert into public.role_assignments (user_id, role, scope_type)
  values (new.id, 'consumer', 'global') on conflict do nothing;

  -- admin de bootstrap: lista controlada em app_settings (auditável), nunca por autoatendimento
  select exists (
    select 1 from public.app_settings s
    where s.key = 'bootstrap_admin_emails' and s.value ? lower(coalesce(new.email, ''))
  ) into v_is_bootstrap_admin;
  if v_is_bootstrap_admin then
    insert into public.role_assignments (user_id, role, scope_type)
    values (new.id, 'admin', 'global') on conflict do nothing;
    insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, after_data)
    values (new.id, 'system', 'role.bootstrap_admin', 'user', new.id::text, jsonb_build_object('email', lower(new.email)));
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- convites ---
create or replace function public.admin_create_invitation(
  p_email text, p_role public.app_role,
  p_seller_org_id uuid default null, p_creator_profile_id uuid default null, p_days int default 7
) returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('creator', 'seller') then raise exception 'invalid_role'; end if;
  if p_role = 'seller' and p_seller_org_id is null then raise exception 'seller_invitation_requires_org'; end if;
  if p_role = 'creator' and p_creator_profile_id is null then raise exception 'creator_invitation_requires_profile'; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, seller_org_id, creator_profile_id, token_hash, expires_at, created_by)
  values (lower(p_email), p_role,
          case when p_role = 'seller' then p_seller_org_id end,
          case when p_role = 'creator' then p_creator_profile_id end,
          encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;

  perform public.audit_log('invitation.create', 'invitation', v_id::text, null,
    jsonb_build_object('email', lower(p_email), 'role', p_role, 'seller_org_id', p_seller_org_id, 'creator_profile_id', p_creator_profile_id));
  return query select v_id, v_token;
end $$;

create or replace function public.admin_revoke_invitation(p_id uuid, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invitations set status = 'revoked', revoked_at = now()
  where id = p_id and status = 'pending';
  if not found then raise exception 'invitation_not_pending'; end if;
  perform public.audit_log('invitation.revoke', 'invitation', p_id::text, null, null, p_justification);
end $$;

-- Uso único, com expiração, e-mail precisa bater com a conta autenticada.
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.invitations%rowtype; v_email text; v_uid uuid;
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

  if v_inv.role = 'seller' then
    insert into public.seller_memberships (org_id, user_id) values (v_inv.seller_org_id, v_uid)
    on conflict (org_id, user_id) do update set revoked_at = null;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'seller', 'seller_org', v_inv.seller_org_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  else
    update public.creator_profiles set user_id = v_uid
    where id = v_inv.creator_profile_id and (user_id is null or user_id = v_uid);
    if not found then raise exception 'creator_profile_already_linked'; end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'creator', v_inv.creator_profile_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  end if;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform public.audit_log('invitation.accept', 'invitation', v_inv.id::text, null,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid), null, 'consumer');
  return jsonb_build_object('role', v_inv.role, 'scope_id', coalesce(v_inv.seller_org_id, v_inv.creator_profile_id));
end $$;

-- Suspensão de parceiro revoga a operação sem apagar histórico.
create or replace function public.admin_set_seller_status(p_org uuid, p_status public.partner_status, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(o) into v_before from public.seller_organizations o where id = p_org;
  update public.seller_organizations set status = p_status where id = p_org;
  perform public.audit_log('seller.set_status', 'seller_organization', p_org::text, v_before,
    jsonb_build_object('status', p_status), p_justification);
end $$;

create or replace function public.admin_set_creator_status(p_creator uuid, p_status public.partner_status, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(c) into v_before from public.creator_profiles c where id = p_creator;
  update public.creator_profiles set status = p_status where id = p_creator;
  perform public.audit_log('creator.set_status', 'creator_profile', p_creator::text, v_before,
    jsonb_build_object('status', p_status), p_justification);
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_active boolean, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'admin' and p_user = auth.uid() and not p_active then raise exception 'cannot_remove_own_admin'; end if;
  if p_active then
    insert into public.role_assignments (user_id, role, scope_type, granted_by)
    values (p_user, p_role, 'global', auth.uid())
    on conflict (user_id, role, scope_id) do update set revoked_at = null, granted_by = auth.uid();
  else
    update public.role_assignments set revoked_at = now() where user_id = p_user and role = p_role and revoked_at is null;
  end if;
  perform public.audit_log('role.set', 'user', p_user::text, null,
    jsonb_build_object('role', p_role, 'active', p_active), p_justification);
end $$;

-- ---------------------------------------------------------------- grants -----
grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin(), public.has_role(public.app_role), public.my_creator_id(),
  public.my_seller_org_ids(), public.is_seller_of(uuid), public.setting(text) to anon, authenticated;
grant execute on function public.accept_invitation(text), public.admin_create_invitation(text, public.app_role, uuid, uuid, int),
  public.admin_revoke_invitation(uuid, text), public.admin_set_seller_status(uuid, public.partner_status, text),
  public.admin_set_creator_status(uuid, public.partner_status, text), public.admin_set_role(uuid, public.app_role, boolean, text)
  to authenticated;
revoke execute on function public.audit_log(text, text, text, jsonb, jsonb, text, public.actor_type) from public, anon, authenticated;
