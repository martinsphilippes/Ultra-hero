-- =============================================================================
-- Groscove Ultra · 0065 · Gestão: casting e media kit
-- docs/requisitos/gestao-spec-tecnica.md, Etapa B. Cenários S75 e S80.
-- Idempotente e reaplicável numa transação só. Sem coluna de valor. S14 segue 17 (nada novo para anon).
-- O creator não lê talent_profiles: o escritório usa talent_my_context() (lista fechada de campos).
-- Conta demo nunca vira talento de agência real (talent_user_id ignora a conta demo fora da agência demo).
-- =============================================================================

-- 1) segmentos ---------------------------------------------------------------------
create table if not exists public.talent_segments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_segments_agency_fk references public.agencies (id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_segments_uq unique (agency_id, slug),
  constraint talent_segments_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  constraint talent_segments_name_check check (char_length(btrim(name)) between 2 and 60)
);

-- 2) talentos (lado privado da agência; 1:1 opcional com creator_profiles) --------------
create table if not exists public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_profiles_agency_fk references public.agencies (id) on delete restrict,
  creator_id uuid constraint talent_profiles_creator_fk references public.creator_profiles (id) on delete set null,
  user_id uuid constraint talent_profiles_user_fk references auth.users (id) on delete set null,
  display_name text not null,
  city text,
  state text,
  country text not null default 'BR',
  manager_id uuid constraint talent_profiles_manager_fk references auth.users (id) on delete set null,
  commercial_status text not null default 'prospect',
  availability text not null default 'available',
  availability_note text not null default '',
  contact_email text,
  contact_phone text,
  internal_notes text not null default '',
  last_contact_at timestamptz,
  consent_at timestamptz,
  consent_version text,
  consent_revoked_at timestamptz,
  catalog_visible boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid constraint talent_profiles_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint talent_profiles_creator_uq unique (creator_id),
  constraint talent_profiles_user_uq unique (user_id),
  constraint talent_profiles_one_login check (creator_id is null or user_id is null),
  constraint talent_profiles_name_check check (char_length(btrim(display_name)) between 2 and 80),
  constraint talent_profiles_state_check check (state is null or state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  constraint talent_profiles_country_check check (country ~ '^[A-Z]{2}$'),
  constraint talent_profiles_city_check check (city is null or char_length(city) <= 60),
  constraint talent_profiles_status_check check (commercial_status in ('prospect', 'active', 'paused', 'inactive')),
  constraint talent_profiles_availability_check check (availability in ('available', 'limited', 'unavailable')),
  constraint talent_profiles_av_note_check check (char_length(availability_note) <= 280),
  constraint talent_profiles_email_check check (contact_email is null or (contact_email = lower(contact_email) and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254)),
  constraint talent_profiles_phone_check check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{8,20}$'),
  constraint talent_profiles_notes_check check (char_length(internal_notes) <= 2000),
  constraint talent_profiles_consent_version_check check (consent_version is null or consent_version ~ '^[0-9A-Za-z._-]{1,20}$'),
  constraint talent_profiles_catalog_consent check (not catalog_visible or (consent_at is not null and consent_revoked_at is null and archived_at is null))
);
create index if not exists talent_profiles_agency_idx on public.talent_profiles (agency_id, commercial_status) where archived_at is null;
create index if not exists talent_profiles_manager_idx on public.talent_profiles (manager_id) where archived_at is null;
create index if not exists talent_profiles_contact_idx on public.talent_profiles (agency_id, last_contact_at) where archived_at is null;

create table if not exists public.talent_segment_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_segment_links_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint talent_segment_links_talent_fk references public.talent_profiles (id) on delete cascade,
  segment_id uuid not null constraint talent_segment_links_segment_fk references public.talent_segments (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint talent_segment_links_uq unique (talent_id, segment_id)
);
create index if not exists talent_segment_links_segment_idx on public.talent_segment_links (segment_id);

-- formato de "audience" (pontos-base): {"gender": {"female", "male", "other"}, "age": {faixas}, "top_states": [UF], "top_countries": [ISO]}
-- cada grupo soma no máximo 10000; até 5 estados e 5 países; nenhuma outra chave
create or replace function public.talent_audience_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; r record; s numeric; n numeric; e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    v := p -> k;
    if k in ('gender', 'age') then
      if jsonb_typeof(v) <> 'object' then return false; end if;
      s := 0;
      for r in select key, value from jsonb_each(v) loop
        if k = 'gender' and r.key not in ('female', 'male', 'other') then return false; end if;
        if k = 'age' and r.key not in ('13-17', '18-24', '25-34', '35-44', '45-54', '55+') then return false; end if;
        if jsonb_typeof(r.value) <> 'number' then return false; end if;
        n := (r.value #>> '{}')::numeric;
        if n <> trunc(n) or n < 0 or n > 10000 then return false; end if;
        s := s + n;
      end loop;
      if s > 10000 then return false; end if;
    elsif k in ('top_states', 'top_countries') then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 5 then return false; end if;
      for e in select value from jsonb_array_elements(v) loop
        if jsonb_typeof(e) <> 'string' then return false; end if;
        if k = 'top_states' and (e #>> '{}') not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then
          return false;
        end if;
        if k = 'top_countries' and (e #>> '{}') !~ '^[A-Z]{2}$' then return false; end if;
      end loop;
      if (select count(distinct x) from jsonb_array_elements_text(v) x) <> jsonb_array_length(v) then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke execute on function public.talent_audience_ok(jsonb) from public, anon;
grant execute on function public.talent_audience_ok(jsonb) to authenticated, service_role;

create table if not exists public.talent_social_accounts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_social_accounts_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint talent_social_accounts_talent_fk references public.talent_profiles (id) on delete cascade,
  network text not null,
  handle text not null,
  url text,
  followers integer,
  avg_views integer,
  avg_reach integer,
  engagement_bp integer,          -- 2,35% = 235 (pontos-base)
  audience jsonb not null default '{}'::jsonb,
  source text not null default 'declared',
  as_of date not null,
  declared_by uuid constraint talent_social_accounts_declared_by_fk references auth.users (id) on delete set null,
  declared_side text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_social_accounts_uq unique (talent_id, network, handle),
  constraint talent_social_accounts_network_check check (network in ('instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other')),
  constraint talent_social_accounts_handle_check check (char_length(handle) between 1 and 60 and handle !~ '\s'),
  constraint talent_social_accounts_url_check check (url is null or public.brand_https_url_ok(url)),
  constraint talent_social_accounts_followers_check check (followers is null or followers between 0 and 1000000000),
  constraint talent_social_accounts_views_check check (avg_views is null or avg_views between 0 and 1000000000),
  constraint talent_social_accounts_reach_check check (avg_reach is null or avg_reach between 0 and 1000000000),
  constraint talent_social_accounts_eng_check check (engagement_bp is null or engagement_bp between 0 and 10000),
  constraint talent_social_accounts_audience_check check (jsonb_typeof(audience) = 'object' and pg_column_size(audience) <= 4096),
  constraint talent_social_accounts_audience_shape check (public.talent_audience_ok(audience)),
  constraint talent_social_accounts_source_check check (source in ('declared', 'integration')),
  constraint talent_social_accounts_side_check check (declared_side in ('talent', 'agency', 'integration'))
);
create index if not exists talent_social_accounts_talent_idx on public.talent_social_accounts (talent_id);

create table if not exists public.media_kits (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint media_kits_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint media_kits_talent_fk references public.talent_profiles (id) on delete cascade,
  headline text not null default '',
  about text not null default '',
  visible_fields text[] not null default '{headline,about,segments,networks,followers}',
  share_token_hash text,
  share_expires_at timestamptz,
  share_revoked_at timestamptz,
  share_created_by uuid constraint media_kits_share_created_by_fk references auth.users (id) on delete set null,
  share_created_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  updated_by uuid constraint media_kits_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_kits_talent_uq unique (talent_id),
  constraint media_kits_token_uq unique (share_token_hash),
  constraint media_kits_headline_check check (char_length(headline) <= 140),
  constraint media_kits_about_check check (char_length(about) <= 1500),
  constraint media_kits_fields_check check (visible_fields <@ array['photo','headline','about','location','segments','networks',
    'followers','views','reach','engagement','audience','brands','agency_contact']::text[]),
  constraint media_kits_token_check check (share_token_hash is null or share_token_hash ~ '^[0-9a-f]{64}$'),
  constraint media_kits_share_shape check ((share_token_hash is null) = (share_expires_at is null)),
  constraint media_kits_views_check check (view_count >= 0)
);

-- 3) convites de talento sem página pública (papel creator + talent_id) ------------------
alter table public.invitations add column if not exists talent_id uuid constraint invitations_talent_fk references public.talent_profiles (id) on delete cascade;
alter table public.invitations drop constraint if exists invitations_scope;
alter table public.invitations add constraint invitations_scope check (
  (role::text = 'seller' and seller_org_id is not null and creator_profile_id is null and professional_id is null
     and agency_id is null and brand_id is null and member_role is null and talent_id is null) or
  (role::text = 'creator' and creator_profile_id is not null and seller_org_id is null and professional_id is null
     and agency_id is null and brand_id is null and member_role is null and talent_id is null) or
  -- talento sem página: entra pelo convite da agência (escopo talent)
  (role::text = 'creator' and talent_id is not null and agency_id is not null and creator_profile_id is null
     and seller_org_id is null and professional_id is null and brand_id is null and member_role is null) or
  (role::text = 'professional' and professional_id is not null and seller_org_id is null and creator_profile_id is null
     and agency_id is null and brand_id is null and member_role is null and talent_id is null) or
  (role::text = 'agency' and agency_id is not null and member_role in ('admin', 'manager', 'staff')
     and brand_id is null and seller_org_id is null and creator_profile_id is null and professional_id is null and talent_id is null) or
  (role::text = 'brand' and brand_id is not null and agency_id is not null and member_role in ('owner', 'staff')
     and seller_org_id is null and creator_profile_id is null and professional_id is null and talent_id is null));
create index if not exists invitations_talent_idx on public.invitations (talent_id) where talent_id is not null;

-- 4) documentos de talento ------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_talent_fk') then
    alter table public.documents add constraint documents_talent_fk foreign key (talent_id) references public.talent_profiles (id) on delete cascade;
  end if;
end $$;
create index if not exists documents_talent_idx on public.documents (talent_id) where talent_id is not null;

-- 5) escopo copiado do talento (o valor enviado é ignorado; em documents só confere) -------
create or replace function public.fill_talent_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid;
begin
  if new.talent_id is null then return new; end if;
  select t.agency_id into v_agency from public.talent_profiles t where t.id = new.talent_id;
  if v_agency is null then raise exception 'talent_not_found' using errcode = 'P0002'; end if;
  if 'check_only' = any (tg_argv) then
    if new.agency_id is distinct from v_agency then raise exception 'talent_agency_mismatch' using errcode = '22023'; end if;
  else
    new.agency_id := v_agency;
  end if;
  return new;
end $$;
revoke execute on function public.fill_talent_scope() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['talent_segment_links', 'talent_social_accounts', 'media_kits'] loop
    execute format('drop trigger if exists trg_%1$s_scope on public.%1$I', t);
    execute format('create trigger trg_%1$s_scope before insert or update of talent_id, agency_id on public.%1$I for each row execute function public.fill_talent_scope()', t);
  end loop;
end $$;
drop trigger if exists trg_documents_talent_scope on public.documents;
create trigger trg_documents_talent_scope before insert or update of talent_id, agency_id on public.documents
  for each row when (new.talent_id is not null) execute function public.fill_talent_scope('check_only');

-- 6) updated_at, grants e RLS ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['talent_segments', 'talent_profiles', 'talent_segment_links', 'talent_social_accounts', 'media_kits'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
    if t <> 'talent_segment_links' then
      execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
      execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;

-- 7) funções auxiliares ----------------------------------------------------------------
-- QUEM AGE COMO O TALENTO: login próprio (sem página) ou usuário do herói ligado (não suspenso).
-- Conta demo só age como talento de agência demo (D6: a heroi@ é a página real do Érick Jacquin).
-- Interna (sem execute para authenticated): devolve id de usuário de outra pessoa.
create or replace function public.talent_user_id(p_talent uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.talent_profiles t
  join public.agencies a on a.id = t.agency_id
  left join public.creator_profiles c on c.id = t.creator_id and c.status <> 'suspended'
  join auth.users u on u.id = coalesce(t.user_id, c.user_id)
  where t.id = p_talent
    and (a.is_demo or coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') <> 'true')
$$;
revoke execute on function public.talent_user_id(uuid) from public, anon, authenticated;
grant execute on function public.talent_user_id(uuid) to service_role;

-- talento do usuário logado (D10: no máximo um)
create or replace function public.my_talent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.talent_profiles t
  join public.agencies a on a.id = t.agency_id and a.status = 'active'
  left join public.creator_profiles c on c.id = t.creator_id
  where t.archived_at is null and auth.uid() is not null
    and (t.user_id = auth.uid() or c.user_id = auth.uid())
    and public.talent_user_id(t.id) = auth.uid()
  order by t.created_at limit 1
$$;

-- agência do talento do usuário logado (o creator lê o nome da agência e os segmentos dela)
create or replace function public.my_talent_agency_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.agency_id from public.talent_profiles t where t.id = public.my_talent_id()
$$;

revoke execute on function public.my_talent_id() from public, anon;
grant execute on function public.my_talent_id() to authenticated, service_role;
revoke execute on function public.my_talent_agency_id() from public, anon;
grant execute on function public.my_talent_agency_id() to authenticated, service_role;

-- escopo de escrita da agência sobre um talento: sem acesso à agência → not_found (não diz que existe);
-- membro sem o papel mínimo → forbidden; arquivado → talent_archived. Devolve a agência. Interna.
create or replace function public.talent_write_scope(p_talent uuid, p_min text, p_allow_archived boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_archived timestamptz;
begin
  select t.agency_id, t.archived_at into v_agency, v_archived from public.talent_profiles t where t.id = p_talent for update;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_agency, p_min) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_archived is not null and not p_allow_archived then raise exception 'talent_archived' using errcode = 'P0001'; end if;
  return v_agency;
end $$;
revoke execute on function public.talent_write_scope(uuid, text, boolean) from public, anon, authenticated;

-- quem age: o próprio talento ('talent') ou GES+ da agência dele ('agency'). Interna.
create or replace function public.talent_actor_side(p_talent uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_talent is not null and p_talent = public.my_talent_id() then return 'talent'; end if;
  perform public.talent_write_scope(p_talent, 'manager');
  return 'agency';
end $$;
revoke execute on function public.talent_actor_side(uuid) from public, anon, authenticated;

create or replace function public.talent_audit_actor(p_side text, p_agency uuid)
returns public.actor_type language plpgsql stable security definer set search_path = '' as $$
begin
  if p_side = 'talent' then return 'creator'; end if;
  if public.agency_role_of(p_agency) is null then return 'admin'; end if;
  return 'agency';
end $$;
revoke execute on function public.talent_audit_actor(text, uuid) from public, anon, authenticated;

-- 8) políticas de leitura ----------------------------------------------------------------
-- o creator lê a agência do próprio talento (nome, contato)
drop policy if exists agencies_select_talent on public.agencies;
create policy agencies_select_talent on public.agencies for select to authenticated
  using (id = (select public.my_talent_agency_id()));

drop policy if exists talent_segments_select_agency on public.talent_segments;
create policy talent_segments_select_agency on public.talent_segments for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists talent_segments_select_talent on public.talent_segments;
create policy talent_segments_select_talent on public.talent_segments for select to authenticated
  using (active and agency_id = (select public.my_talent_agency_id()));

-- talent_profiles: só a agência (sem política para o creator; ele usa talent_my_context)
drop policy if exists talent_profiles_select_agency on public.talent_profiles;
create policy talent_profiles_select_agency on public.talent_profiles for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));

drop policy if exists talent_segment_links_select_agency on public.talent_segment_links;
create policy talent_segment_links_select_agency on public.talent_segment_links for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists talent_segment_links_select_talent on public.talent_segment_links;
create policy talent_segment_links_select_talent on public.talent_segment_links for select to authenticated
  using (talent_id = (select public.my_talent_id()));

drop policy if exists talent_social_accounts_select_agency on public.talent_social_accounts;
create policy talent_social_accounts_select_agency on public.talent_social_accounts for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists talent_social_accounts_select_talent on public.talent_social_accounts;
create policy talent_social_accounts_select_talent on public.talent_social_accounts for select to authenticated
  using (talent_id = (select public.my_talent_id()));

drop policy if exists media_kits_select_agency on public.media_kits;
create policy media_kits_select_agency on public.media_kits for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists media_kits_select_talent on public.media_kits;
create policy media_kits_select_talent on public.media_kits for select to authenticated
  using (talent_id = (select public.my_talent_id()));

-- convites: o gestor vê também os de talento (nunca os de equipe)
drop policy if exists invitations_select_agency_manager on public.invitations;
create policy invitations_select_agency_manager on public.invitations for select to authenticated
  using ((brand_id is not null or talent_id is not null) and agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));

-- documentos: ramo de talento (a 0066 recria com pedido e negócio)
drop policy if exists documents_select_agency on public.documents;
create policy documents_select_agency on public.documents for select to authenticated
  using (not restricted and status <> 'archived' and agency_id = any ((select public.my_agency_ids('staff'))::uuid[])
         and scope_type in ('agency', 'brand', 'talent'));
drop policy if exists documents_select_talent on public.documents;
create policy documents_select_talent on public.documents for select to authenticated
  using (share_talent and status = 'ready' and talent_id = (select public.my_talent_id()));

-- 9) segmentos iniciais (nomes editáveis pela agência; dados, não i18n) -------------------
create or replace function public.agency_seed_defaults(p_agency uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_agency is null then return; end if;
  insert into public.talent_segments (agency_id, slug, name, sort_order)
  values (p_agency, 'fitness', 'Fitness e musculação', 10),
         (p_agency, 'corrida', 'Corrida e endurance', 20),
         (p_agency, 'esportes', 'Esportes e alto rendimento', 30),
         (p_agency, 'nutricao', 'Nutrição e alimentação saudável', 40),
         (p_agency, 'gastronomia', 'Gastronomia e culinária', 50),
         (p_agency, 'bem-estar', 'Bem-estar e saúde mental', 60),
         (p_agency, 'rotina', 'Rotina, sono e produtividade', 70),
         (p_agency, 'lifestyle', 'Lifestyle e viagens', 80),
         (p_agency, 'beleza', 'Beleza e autocuidado', 90),
         (p_agency, 'familia', 'Maternidade, paternidade e família', 100)
  on conflict (agency_id, slug) do nothing;
end $$;
revoke execute on function public.agency_seed_defaults(uuid) from public, anon, authenticated;
grant execute on function public.agency_seed_defaults(uuid) to service_role;

do $$
declare r record;
begin
  for r in select a.id from public.agencies a loop
    perform public.agency_seed_defaults(r.id);
  end loop;
end $$;

-- 10) RPCs do casting ---------------------------------------------------------------------
create or replace function public.agency_talent_save(p_id uuid, p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_before jsonb; v_after jsonb; v_manager uuid; v_email text; v_phone text; v_state text; v_country text;
  v_city text; v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_id is not null then
    -- D19: a linha precisa ser da agência informada
    select to_jsonb(t) - 'created_at' - 'updated_at' - 'internal_notes' into v_before
    from public.talent_profiles t where t.id = p_id and t.agency_id = p_agency;
    if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public.talent_write_scope(p_id, 'manager');
  else
    if not exists (select 1 from public.agencies a where a.id = p_agency and a.status = 'active') or not public.agency_can(p_agency, 'staff') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    -- agência demo é pública: no máximo 20 talentos (o seed tem 6; o botão do admin restaura)
    if public.agency_is_demo(p_agency) and (select count(*) from public.talent_profiles t where t.agency_id = p_agency) >= 20 then
      raise exception 'demo_limit' using errcode = 'P0001';
    end if;
  end if;

  begin
    if p_data ? 'manager_id' then v_manager := nullif(btrim(coalesce(p_data ->> 'manager_id', '')), '')::uuid; end if;
    if p_data ? 'last_contact_at' then v_last := nullif(btrim(coalesce(p_data ->> 'last_contact_at', '')), '')::timestamptz; end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_manager is not null and not exists (select 1 from public.agency_members m where m.agency_id = p_agency and m.user_id = v_manager
                                           and m.revoked_at is null and m.role in ('admin', 'manager')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_last is not null and v_last > now() + interval '1 day' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_email := nullif(lower(btrim(coalesce(p_data ->> 'contact_email', ''))), '');
  if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_phone := nullif(btrim(coalesce(p_data ->> 'contact_phone', '')), '');
  v_state := nullif(upper(btrim(coalesce(p_data ->> 'state', ''))), '');
  v_country := coalesce(nullif(upper(btrim(coalesce(p_data ->> 'country', ''))), ''), 'BR');
  v_city := nullif(btrim(coalesce(p_data ->> 'city', '')), '');

  begin
    if p_id is null then
      insert into public.talent_profiles (agency_id, display_name, city, state, country, manager_id, commercial_status, availability,
                                          availability_note, contact_email, contact_phone, internal_notes, last_contact_at, is_demo, created_by)
      values (p_agency, btrim(coalesce(p_data ->> 'display_name', '')), v_city, v_state, v_country, v_manager,
              coalesce(nullif(p_data ->> 'commercial_status', ''), 'prospect'), coalesce(nullif(p_data ->> 'availability', ''), 'available'),
              btrim(coalesce(p_data ->> 'availability_note', '')), v_email, v_phone, btrim(coalesce(p_data ->> 'internal_notes', '')),
              v_last, public.agency_is_demo(p_agency), auth.uid())
      returning id into v_id;
    else
      update public.talent_profiles set
        display_name = case when p_data ? 'display_name' then btrim(coalesce(p_data ->> 'display_name', '')) else display_name end,
        city = case when p_data ? 'city' then v_city else city end,
        state = case when p_data ? 'state' then v_state else state end,
        country = case when p_data ? 'country' then v_country else country end,
        manager_id = case when p_data ? 'manager_id' then v_manager else manager_id end,
        commercial_status = case when p_data ? 'commercial_status' then p_data ->> 'commercial_status' else commercial_status end,
        availability = case when p_data ? 'availability' then p_data ->> 'availability' else availability end,
        availability_note = case when p_data ? 'availability_note' then btrim(coalesce(p_data ->> 'availability_note', '')) else availability_note end,
        contact_email = case when p_data ? 'contact_email' then v_email else contact_email end,
        contact_phone = case when p_data ? 'contact_phone' then v_phone else contact_phone end,
        internal_notes = case when p_data ? 'internal_notes' then btrim(coalesce(p_data ->> 'internal_notes', '')) else internal_notes end,
        last_contact_at = case when p_data ? 'last_contact_at' then v_last else last_contact_at end
      where id = p_id returning id into v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;

  select to_jsonb(t) - 'created_at' - 'updated_at' - 'internal_notes' into v_after from public.talent_profiles t where t.id = v_id;
  if v_before is distinct from v_after then
    perform public.audit_log(case when p_id is null then 'talent.create' else 'talent.update' end, 'talent', v_id::text,
      v_before, v_after, null, public.talent_audit_actor('agency', p_agency));
  end if;
  return v_id;
end $$;

create or replace function public.agency_talent_set_segments(p_talent uuid, p_segment_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_ids uuid[]; v_before uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_segment_ids, '{}'::uuid[])) x where x is not null;
  if cardinality(v_ids) > 5 then raise exception 'too_many_segments' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_ids) x
             where not exists (select 1 from public.talent_segments s where s.id = x and s.agency_id = v_agency and s.active)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(l.segment_id order by l.segment_id), '{}'::uuid[]) into v_before
  from public.talent_segment_links l where l.talent_id = p_talent;
  delete from public.talent_segment_links l where l.talent_id = p_talent and not (l.segment_id = any (v_ids));
  insert into public.talent_segment_links (agency_id, talent_id, segment_id)
  select v_agency, p_talent, x from unnest(v_ids) x
  on conflict (talent_id, segment_id) do nothing;
  perform public.audit_log('talent.segments', 'talent', p_talent::text,
    jsonb_build_object('agency_id', v_agency, 'segments', to_jsonb(v_before)),
    jsonb_build_object('agency_id', v_agency, 'segments', to_jsonb(v_ids)), null, public.talent_audit_actor('agency', v_agency));
end $$;

create or replace function public.agency_talent_link_creator(p_talent uuid, p_creator uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_user uuid; v_creator_user uuid; v_before uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  -- D6: nenhum herói real em agência inventada
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  select t.user_id, t.creator_id into v_user, v_before from public.talent_profiles t where t.id = p_talent;
  if p_creator is null then
    update public.talent_profiles set creator_id = null where id = p_talent;
  else
    if v_user is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
    select c.user_id into v_creator_user from public.creator_profiles c where c.id = p_creator and c.status = 'active';
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.talent_profiles t where t.creator_id = p_creator and t.id <> p_talent) then
      raise exception 'creator_already_in_casting' using errcode = 'P0001';
    end if;
    -- D10: o dono do herói já tem talento próprio (login sem página)
    if v_creator_user is not null and exists (select 1 from public.talent_profiles t where t.user_id = v_creator_user) then
      raise exception 'user_has_talent' using errcode = 'P0001';
    end if;
    begin
      update public.talent_profiles set creator_id = p_creator where id = p_talent;
    exception when unique_violation then raise exception 'creator_already_in_casting' using errcode = 'P0001';
    end;
  end if;
  if v_before is distinct from p_creator then
    perform public.audit_log('talent.link_creator', 'talent', p_talent::text,
      jsonb_build_object('agency_id', v_agency, 'creator_id', v_before), jsonb_build_object('agency_id', v_agency, 'creator_id', p_creator),
      null, public.talent_audit_actor('agency', v_agency));
  end if;
end $$;

create or replace function public.agency_talent_archive(p_talent uuid, p_justification text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'admin');
  if char_length(btrim(coalesce(p_justification, ''))) < 5 then raise exception 'justification_required' using errcode = '22023'; end if;
  -- (a 0066 acrescenta a trava de negócio aberto: talent_has_open_deals)
  update public.talent_profiles set archived_at = now(), catalog_visible = false where id = p_talent;
  update public.media_kits set share_revoked_at = now()
  where talent_id = p_talent and share_token_hash is not null and share_revoked_at is null;
  update public.invitations set status = 'revoked', revoked_at = now() where talent_id = p_talent and status = 'pending';
  perform public.audit_log('talent.archive', 'talent', p_talent::text, jsonb_build_object('agency_id', v_agency, 'archived', false),
    jsonb_build_object('agency_id', v_agency, 'archived', true), btrim(p_justification), public.talent_audit_actor('agency', v_agency));
end $$;

create or replace function public.agency_invite_talent(p_talent uuid, p_email text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_t record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  select t.user_id, t.creator_id into v_t from public.talent_profiles t where t.id = p_talent;
  if v_t.user_id is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
  if v_t.creator_id is not null then raise exception 'talent_has_creator' using errcode = 'P0001'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  -- convite novo substitui os pendentes do mesmo talento
  update public.invitations i set status = 'revoked', revoked_at = now() where i.status = 'pending' and i.talent_id = p_talent;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, agency_id, talent_id, token_hash, expires_at, created_by)
  values (v_email, 'creator', v_agency, p_talent, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;
  perform public.audit_log('invitation.create', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'talent_id', p_talent, 'email', v_email), null, public.talent_audit_actor('agency', v_agency));
  return query select v_id, v_token;
end $$;

-- grava o consentimento (comum ao talento e ao registro pela agência)
create or replace function public.talent_consent_apply(p_talent uuid, p_on boolean, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_on then
    update public.talent_profiles set consent_at = now(), consent_version = p_version, consent_revoked_at = null where id = p_talent;
  else
    update public.talent_profiles set consent_revoked_at = now(), catalog_visible = false
    where id = p_talent and consent_at is not null and consent_revoked_at is null;
    -- revogar o consentimento revoga o link público do kit
    update public.media_kits set share_revoked_at = now()
    where talent_id = p_talent and share_token_hash is not null and share_revoked_at is null;
  end if;
end $$;
revoke execute on function public.talent_consent_apply(uuid, boolean, text) from public, anon, authenticated;

create or replace function public.talent_set_consent(p_on boolean, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id(); v_t record; v_version text := btrim(coalesce(p_version, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_talent is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_on is null or (p_on and v_version !~ '^[0-9A-Za-z._-]{1,20}$') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.agency_id, t.manager_id, t.display_name, t.consent_at, t.consent_revoked_at into v_t
  from public.talent_profiles t where t.id = v_talent for update;
  -- nada muda: não audita nem avisa de novo
  if (p_on and v_t.consent_at is not null and v_t.consent_revoked_at is null)
     or (not p_on and (v_t.consent_at is null or v_t.consent_revoked_at is not null)) then
    if p_on then update public.talent_profiles set consent_version = v_version where id = v_talent; end if;
    return;
  end if;
  perform public.talent_consent_apply(v_talent, p_on, v_version);
  perform public.audit_log('talent.consent', 'talent', v_talent::text,
    jsonb_build_object('agency_id', v_t.agency_id, 'consent', not p_on),
    jsonb_build_object('agency_id', v_t.agency_id, 'consent', p_on, 'version', case when p_on then v_version end), null, 'creator');
  -- avisa o gestor responsável (membro ativo) ou, sem ele, os gestores e o Adm
  if v_t.manager_id is not null and exists (select 1 from public.agency_members m where m.agency_id = v_t.agency_id
                                            and m.user_id = v_t.manager_id and m.revoked_at is null) then
    perform public.inbox_notify(v_t.manager_id, case when p_on then 'talent_consent_given' else 'talent_consent_revoked' end,
      '/agencia/casting/' || v_talent::text, jsonb_build_object('talent', v_t.display_name), v_t.agency_id, 'talent', v_talent, null);
  else
    perform public.inbox_notify_agency(v_t.agency_id, 'manager', case when p_on then 'talent_consent_given' else 'talent_consent_revoked' end,
      '/agencia/casting/' || v_talent::text, jsonb_build_object('talent', v_t.display_name), 'talent', v_talent, null);
  end if;
end $$;

create or replace function public.agency_talent_record_consent(p_talent uuid, p_version text, p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_version text := btrim(coalesce(p_version, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  -- com login, só o próprio talento consente
  if public.talent_user_id(p_talent) is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
  if v_version !~ '^[0-9A-Za-z._-]{1,20}$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- termo assinado: documento pronto do mesmo talento
  if not exists (select 1 from public.documents d where d.id = p_document and d.talent_id = p_talent
                 and d.scope_type = 'talent' and d.status = 'ready') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.talent_consent_apply(p_talent, true, v_version);
  perform public.audit_log('talent.consent', 'talent', p_talent::text, jsonb_build_object('agency_id', v_agency),
    jsonb_build_object('agency_id', v_agency, 'consent', true, 'version', v_version, 'document_id', p_document), null,
    public.talent_audit_actor('agency', v_agency));
end $$;

create or replace function public.agency_talent_set_catalog(p_talent uuid, p_visible boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_t record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  select t.consent_at, t.consent_revoked_at, t.catalog_visible into v_t from public.talent_profiles t where t.id = p_talent;
  if coalesce(p_visible, false) and (v_t.consent_at is null or v_t.consent_revoked_at is not null) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  if v_t.catalog_visible = coalesce(p_visible, false) then return; end if;
  update public.talent_profiles set catalog_visible = coalesce(p_visible, false) where id = p_talent;
  perform public.audit_log('talent.catalog', 'talent', p_talent::text, jsonb_build_object('agency_id', v_agency, 'catalog_visible', v_t.catalog_visible),
    jsonb_build_object('agency_id', v_agency, 'catalog_visible', coalesce(p_visible, false)), null, public.talent_audit_actor('agency', v_agency));
end $$;

-- redes declaradas: source sempre 'declared' (nunca vem do cliente); 'integration' não é gravável por usuário
create or replace function public.talent_social_save(p_talent uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_side text; v_agency uuid; v_id uuid; v_before jsonb; v_after jsonb; v_network text; v_handle text; v_url text;
  v_followers int; v_views int; v_reach int; v_eng int; v_audience jsonb; v_as_of date;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_side := public.talent_actor_side(p_talent);
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if p_id is not null then
    -- D19: a conta precisa ser deste talento
    select to_jsonb(a) - 'created_at' - 'updated_at' into v_before from public.talent_social_accounts a
    where a.id = p_id and a.talent_id = p_talent for update;
    if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before ->> 'source' <> 'declared' then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif (select count(*) from public.talent_social_accounts a where a.talent_id = p_talent) >= 15 then
    raise exception 'too_many_networks' using errcode = 'P0001';
  end if;
  v_network := lower(btrim(coalesce(p_data ->> 'network', '')));
  v_handle := regexp_replace(btrim(coalesce(p_data ->> 'handle', '')), '^@', '');
  v_url := nullif(btrim(coalesce(p_data ->> 'url', '')), '');
  begin
    v_followers := nullif(btrim(coalesce(p_data ->> 'followers', '')), '')::int;
    v_views := nullif(btrim(coalesce(p_data ->> 'avg_views', '')), '')::int;
    v_reach := nullif(btrim(coalesce(p_data ->> 'avg_reach', '')), '')::int;
    v_eng := nullif(btrim(coalesce(p_data ->> 'engagement_bp', '')), '')::int;
    v_as_of := (p_data ->> 'as_of')::date;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_as_of is null or v_as_of > current_date or v_as_of < current_date - interval '2 years' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_audience := case when p_data ? 'audience' and jsonb_typeof(p_data -> 'audience') = 'object' then p_data -> 'audience'
                     when not (p_data ? 'audience') or jsonb_typeof(p_data -> 'audience') = 'null' then '{}'::jsonb end;
  if v_audience is null or not public.talent_audience_ok(v_audience) then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    if p_id is null then
      insert into public.talent_social_accounts (agency_id, talent_id, network, handle, url, followers, avg_views, avg_reach, engagement_bp,
                                                 audience, source, as_of, declared_by, declared_side)
      values (v_agency, p_talent, v_network, v_handle, v_url, v_followers, v_views, v_reach, v_eng, v_audience, 'declared', v_as_of,
              auth.uid(), v_side)
      returning id into v_id;
    else
      update public.talent_social_accounts set network = v_network, handle = v_handle, url = v_url, followers = v_followers,
        avg_views = v_views, avg_reach = v_reach, engagement_bp = v_eng, audience = v_audience, source = 'declared', as_of = v_as_of,
        declared_by = auth.uid(), declared_side = v_side
      where id = p_id returning id into v_id;
    end if;
  exception
    when unique_violation then raise exception 'duplicate_network' using errcode = '23505';
    when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select to_jsonb(a) - 'created_at' - 'updated_at' into v_after from public.talent_social_accounts a where a.id = v_id;
  perform public.audit_log('talent.social_save', 'talent_social_account', v_id::text,
    case when v_before is null then null else v_before || jsonb_build_object('agency_id', v_agency) end,
    v_after || jsonb_build_object('agency_id', v_agency), null, public.talent_audit_actor(v_side, v_agency));
  return v_id;
end $$;

create or replace function public.talent_social_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row record; v_side text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select a.id, a.talent_id, a.agency_id, a.source, a.network, a.handle into v_row from public.talent_social_accounts a where a.id = p_id;
  if v_row.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_side := public.talent_actor_side(v_row.talent_id);
  if v_row.source <> 'declared' then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.talent_social_accounts where id = p_id;
  perform public.audit_log('talent.social_delete', 'talent_social_account', p_id::text,
    jsonb_build_object('agency_id', v_row.agency_id, 'talent_id', v_row.talent_id, 'network', v_row.network, 'handle', v_row.handle), null, null,
    public.talent_audit_actor(v_side, v_row.agency_id));
end $$;

-- media kit -----------------------------------------------------------------------------
create or replace function public.media_kit_save(p_talent uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text; v_agency uuid; v_fields text[]; v_before jsonb; v_after jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_side := public.talent_actor_side(p_talent);
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if p_data ? 'visible_fields' then
    if jsonb_typeof(p_data -> 'visible_fields') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_data -> 'visible_fields') e where jsonb_typeof(e) <> 'string') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct x), '{}'::text[]) into v_fields from jsonb_array_elements_text(p_data -> 'visible_fields') x;
  end if;
  select jsonb_build_object('headline', k.headline, 'about', k.about, 'visible_fields', to_jsonb(k.visible_fields)) into v_before
  from public.media_kits k where k.talent_id = p_talent for update;
  begin
    insert into public.media_kits (agency_id, talent_id, headline, about, visible_fields, updated_by)
    values (v_agency, p_talent, btrim(coalesce(p_data ->> 'headline', '')), btrim(coalesce(p_data ->> 'about', '')),
            coalesce(v_fields, '{headline,about,segments,networks,followers}'::text[]), auth.uid())
    on conflict (talent_id) do update set
      headline = case when p_data ? 'headline' then excluded.headline else public.media_kits.headline end,
      about = case when p_data ? 'about' then excluded.about else public.media_kits.about end,
      visible_fields = case when p_data ? 'visible_fields' then excluded.visible_fields else public.media_kits.visible_fields end,
      updated_by = auth.uid();
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select jsonb_build_object('headline', k.headline, 'about', k.about, 'visible_fields', to_jsonb(k.visible_fields)) into v_after
  from public.media_kits k where k.talent_id = p_talent;
  if v_before is distinct from v_after then
    perform public.audit_log('media_kit.save', 'talent', p_talent::text,
      case when v_before is null then null else v_before || jsonb_build_object('agency_id', v_agency) end,
      v_after || jsonb_build_object('agency_id', v_agency), null, public.talent_audit_actor(v_side, v_agency));
  end if;
end $$;

-- gera o link público: o token só existe nesta resposta; o banco guarda o SHA-256
create or replace function public.media_kit_share(p_talent uuid, p_days int default 30)
returns text language plpgsql security definer set search_path = '' as $$
declare v_side text; v_agency uuid; v_t record; v_token text; v_expires timestamptz;
begin
  v_side := public.talent_actor_side(p_talent);
  select t.agency_id, t.consent_at, t.consent_revoked_at into v_t from public.talent_profiles t where t.id = p_talent;
  v_agency := v_t.agency_id;
  -- D6: agência demo não tem kit público (a tela mostra só a prévia)
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if v_t.consent_at is null or v_t.consent_revoked_at is not null then raise exception 'consent_required' using errcode = 'P0001'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(days => p_days);
  insert into public.media_kits (agency_id, talent_id, share_token_hash, share_expires_at, share_revoked_at, share_created_by,
                                 share_created_at, view_count, last_viewed_at, updated_by)
  values (v_agency, p_talent, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, null, auth.uid(), now(), 0, null, auth.uid())
  on conflict (talent_id) do update set share_token_hash = excluded.share_token_hash, share_expires_at = excluded.share_expires_at,
    share_revoked_at = null, share_created_by = excluded.share_created_by, share_created_at = excluded.share_created_at,
    view_count = 0, last_viewed_at = null;
  perform public.audit_log('media_kit.share', 'talent', p_talent::text, null,
    jsonb_build_object('agency_id', v_agency, 'days', p_days, 'expires_at', v_expires), null, public.talent_audit_actor(v_side, v_agency));
  return v_token;
end $$;

create or replace function public.media_kit_revoke(p_talent uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text; v_agency uuid;
begin
  v_side := public.talent_actor_side(p_talent);
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  update public.media_kits set share_revoked_at = now()
  where talent_id = p_talent and share_token_hash is not null and share_revoked_at is null;
  if found then
    perform public.audit_log('media_kit.revoke', 'talent', p_talent::text, null, jsonb_build_object('agency_id', v_agency, 'revoked', true), null,
      public.talent_audit_actor(v_side, v_agency));
  end if;
end $$;

-- /kit/<token> (D5): só service role; volátil porque soma a visita; nunca valores
create or replace function public.media_kit_resolve(p_token text, p_count boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.media_kits%rowtype; t public.talent_profiles%rowtype; c public.creator_profiles%rowtype;
        f text[]; v jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.media_kits where share_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or k.share_revoked_at is not null or k.share_expires_at <= now() then return null; end if;
  select * into t from public.talent_profiles where id = k.talent_id;
  if t.archived_at is not null or t.consent_at is null or t.consent_revoked_at is not null then return null; end if;
  -- agência suspensa ou de demonstração: sem kit público (D5/D6)
  if not exists (select 1 from public.agencies a where a.id = t.agency_id and a.status = 'active' and not a.is_demo) then return null; end if;
  if t.creator_id is not null then select * into c from public.creator_profiles where id = t.creator_id and status = 'active'; end if;
  f := k.visible_fields;
  v := jsonb_build_object('name', t.display_name, 'fields', to_jsonb(f), 'expires_at', k.share_expires_at);
  if 'photo' = any (f) then v := v || jsonb_build_object('photo_url', c.avatar_url); end if;
  if 'headline' = any (f) then v := v || jsonb_build_object('headline', k.headline); end if;
  if 'about' = any (f) then v := v || jsonb_build_object('about', k.about); end if;
  if 'location' = any (f) then v := v || jsonb_build_object('city', t.city, 'state', t.state); end if;
  if 'segments' = any (f) then v := v || jsonb_build_object('segments', (select coalesce(jsonb_agg(s.name order by s.sort_order), '[]')
      from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id and s.active where l.talent_id = t.id)); end if;
  if 'networks' = any (f) then
    v := v || jsonb_build_object('networks', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'network', a.network, 'handle', a.handle, 'url', a.url, 'source', a.source, 'as_of', a.as_of,
      'declared_side', a.declared_side, 'declared_at', a.updated_at::date,
      'followers', case when 'followers' = any (f) then a.followers end,
      'avg_views', case when 'views' = any (f) then a.avg_views end,
      'avg_reach', case when 'reach' = any (f) then a.avg_reach end,
      'engagement_bp', case when 'engagement' = any (f) then a.engagement_bp end,
      'audience', case when 'audience' = any (f) and a.audience <> '{}'::jsonb then a.audience end)) order by a.followers desc nulls last), '[]')
      from public.talent_social_accounts a where a.talent_id = t.id));
  end if;
  if 'brands' = any (f) and c.id is not null then v := v || jsonb_build_object('brands', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'logo_url', b.logo_url) order by cb.sort_order), '[]')
      from public.creator_brands cb join public.brands b on b.id = cb.brand_id and b.status = 'active'
      where cb.creator_id = c.id and cb.status = 'active')); end if;
  if 'agency_contact' = any (f) then v := v || (select jsonb_build_object('agency', a.name, 'agency_email', a.contact_email) from public.agencies a where a.id = t.agency_id); end if;
  if p_count then update public.media_kits set view_count = view_count + 1, last_viewed_at = now() where id = k.id; end if;
  return v;
end $$;
revoke execute on function public.media_kit_resolve(text, boolean) from public, anon, authenticated;
grant execute on function public.media_kit_resolve(text, boolean) to service_role;

-- escritório do creator: só estes campos do próprio talento (nunca notas internas, situação comercial,
-- último contato, gestor por id ou quem criou)
create or replace function public.talent_my_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id(); v jsonb;
begin
  if v_talent is null then return null; end if;
  select jsonb_build_object(
    'id', t.id, 'display_name', t.display_name, 'city', t.city, 'state', t.state,
    'availability', t.availability, 'availability_note', t.availability_note,
    'consent_at', t.consent_at, 'consent_version', t.consent_version, 'consent_revoked_at', t.consent_revoked_at,
    'catalog_visible', t.catalog_visible, 'has_public_page', t.creator_id is not null,
    'agency', a.name, 'agency_is_demo', a.is_demo,
    'manager', (select m.display_name from public.agency_members m
                where m.agency_id = t.agency_id and m.user_id = t.manager_id and m.revoked_at is null))
  into v
  from public.talent_profiles t join public.agencies a on a.id = t.agency_id
  where t.id = v_talent;
  return v;
end $$;

-- 11) revogar convite (0064 + ramo do talento) ---------------------------------------------
create or replace function public.agency_invitation_revoke(p_id uuid, p_justification text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv record; v_allowed boolean := false; v_actor public.actor_type;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select i.id, i.role::text as role, i.agency_id, i.brand_id, i.talent_id, i.member_role, i.status into v_inv
  from public.invitations i where i.id = p_id for update;
  if v_inv.id is null or v_inv.agency_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_inv.role = 'agency' then
    v_allowed := public.agency_can(v_inv.agency_id, 'admin');
  elsif v_inv.role = 'brand' then
    v_allowed := public.agency_can(v_inv.agency_id, 'manager')
      or coalesce(v_inv.member_role = 'staff' and public.brand_member_of(v_inv.brand_id) = 'owner', false);
  elsif v_inv.role = 'creator' and v_inv.talent_id is not null then
    v_allowed := public.agency_can(v_inv.agency_id, 'manager');
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

-- 12) aceite de convite (0058 + 0064 + ramo do talento) -------------------------------------
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
  -- D6: conta demo não entra em agência real (nem na marca nem no casting dela)
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
  elsif v_inv.role::text = 'creator' and v_inv.talent_id is not null then
    -- talento sem página pública (D2). D10: no máximo um talento por pessoa (próprio ou pelo herói)
    if exists (select 1 from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
               where t.id <> v_inv.talent_id and (t.user_id = v_uid or c.user_id = v_uid)) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'user_has_talent';
    end if;
    update public.talent_profiles set user_id = v_uid
    where id = v_inv.talent_id and agency_id = v_inv.agency_id and creator_id is null and archived_at is null
      and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'talent_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'talent', v_inv.talent_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'talent'; v_scope_id := v_inv.talent_id;
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
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid, 'agency_id', v_inv.agency_id, 'brand_id', v_inv.brand_id,
                       'talent_id', v_inv.talent_id), null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  return jsonb_build_object('role', v_inv.role, 'scope_type', v_scope_type, 'scope_id', v_scope_id);
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- 13) documentos (0064 + escopo de talento) -------------------------------------------------
create or replace function public.document_reserve(p_agency uuid, p_scope_type text, p_scope_id uuid, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid(); v_kind text; v_title text; v_mime text; v_size bigint; v_ext text; v_path text;
  v_side text; v_restricted boolean := false; v_share_brand boolean := false; v_share_talent boolean := false;
  v_brand uuid; v_talent uuid; v_is_admin boolean; v_is_manager boolean;
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
  elsif p_scope_type = 'talent' then
    v_talent := p_scope_id;
    if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_is_manager then
      v_side := 'agency';
      v_share_talent := coalesce((p_meta ->> 'share_talent')::boolean, false);
    elsif v_talent = public.my_talent_id() then
      -- o próprio creator envia sempre compartilhado com ele mesmo e nunca restrito
      v_side := 'talent'; v_share_talent := true;
      if v_kind = 'contract' then raise exception 'forbidden' using errcode = '42501'; end if;
    elsif public.agency_can(p_agency, 'staff') then
      raise exception 'forbidden' using errcode = '42501';
    else
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    -- pedido e negócio (0066) entram com a própria migração
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- contrato tem preço: só o Adm da agência (ou o admin geral); nasce restrito
  if v_kind = 'contract' then
    if not v_is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
    v_restricted := true;
    -- contrato do talento (com o cachê) nunca vai à marca; o da marca (com o total) nunca ao talento
    if v_talent is not null then v_share_brand := false; else v_share_talent := false; end if;
  elsif v_side = 'agency' and v_is_admin then
    v_restricted := coalesce((p_meta ->> 'restricted')::boolean, false);
  end if;

  v_path := p_agency::text || '/' || p_scope_type || '/' || p_scope_id::text || '/' || v_id::text || '.' || v_ext;
  begin
    insert into public.documents (id, agency_id, scope_type, brand_id, talent_id, kind, title, storage_path, mime_type, size_bytes,
                                  restricted, share_brand, share_talent, status, uploaded_by, uploader_side)
    values (v_id, p_agency, p_scope_type, v_brand, v_talent, v_kind, v_title, v_path, v_mime, v_size,
            v_restricted, v_share_brand, v_share_talent, 'pending', auth.uid(), v_side);
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

-- document_confirm: o creator também confirma o próprio envio (auditado como creator)
create or replace function public.document_confirm(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.id, d.agency_id, d.storage_path, d.status, d.uploaded_by, d.uploader_side, d.scope_type, d.kind, d.title into v_doc
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
    case when v_doc.uploader_side = 'talent' then 'creator'
         when public.agency_role_of(v_doc.agency_id) is not null then 'agency'
         when public.is_platform_admin() then 'admin' else 'brand' end::public.actor_type);
end $$;

-- 14) agência de demonstração (0064 + casting fictício). p_emails ganha "talent" (opcional: sem a
--     chave, o casting não é semeado). Reexecutar restaura talentos, redes, segmentos e media kits.
create or replace function public.agency_demo_seed(p_agency uuid, p_emails jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid; v_staff uuid; v_owner uuid; v_talent_user uuid; v_brand uuid := public.seed_uuid('demo:brand:exemplo-marca');
  k text; v_uid uuid; v_meta text; v_ids jsonb := '{}'::jsonb; r record; v_tid uuid; v_seed_ids uuid[] := '{}'::uuid[];
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

  -- dados da agência demo voltam ao padrão
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

  -- casting fictício (0065): 6 talentos sem página, nomes claramente de exemplo; o primeiro é o da talento@
  if v_talent_user is not null then
    for r in select * from (values
        ('talento-exemplo', 'Talento Exemplo', 'São Paulo', 'SP', 'active', 'available', array['fitness', 'rotina'],
         'Treinos curtos e rotina possível para quem trabalha o dia todo.', 'instagram', 'talento.exemplo', 48200, 23100, 31800, 412, 'tiktok', 'talentoexemplo', 91500, 120400, null::int, 538),
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
    end loop;
    -- talentos criados por visitantes somem; os do seed voltam ao estado inicial
    delete from public.talent_profiles t where t.agency_id = p_agency and not (t.id = any (v_seed_ids));
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_talent_user, 'creator', 'talent', public.seed_uuid('demo:talent:talento-exemplo'), p_actor)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  end if;

  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data, justification)
  values (p_actor, 'admin', 'demo.agency_seed', 'agency', p_agency::text, null,
          jsonb_build_object('agency_id', p_agency, 'admin', v_admin, 'staff', v_staff, 'brand_owner', v_owner, 'brand', v_brand,
                             'talent', v_talent_user, 'talents', cardinality(v_seed_ids)), null);
  return jsonb_build_object('agency', p_agency, 'brand', v_brand, 'talents', cardinality(v_seed_ids)) || v_ids;
end $$;
revoke execute on function public.agency_demo_seed(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.agency_demo_seed(uuid, jsonb, uuid) to service_role;

-- 14b) papéis de talento de outras pessoas ficam fora do alcance da conta demo (como os de agência e marca)
drop policy if exists role_assignments_hide_agency_from_demo on public.role_assignments;
create policy role_assignments_hide_agency_from_demo on public.role_assignments as restrictive for select to authenticated
  using (not (select public.is_demo_account()) or (role::text not in ('agency', 'brand') and scope_type <> 'talent')
         or user_id = (select auth.uid()));

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz, roles text[], anonymized boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at,
         coalesce((select array_agg(r.role::text order by r.role) from public.role_assignments r
                   where r.user_id = u.id and r.revoked_at is null
                     and (not public.is_demo_account() or (r.role::text not in ('agency', 'brand') and r.scope_type <> 'talent')
                          or r.user_id = auth.uid())), '{}'),
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
                     and (not public.is_demo_account() or (r.role::text not in ('agency', 'brand') and r.scope_type <> 'talent')
                          or r.user_id = auth.uid())), '[]'::jsonb),
         p.anonymized_at is not null,
         u.banned_until
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin() and u.id = p_id
$$;
revoke execute on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated, service_role;

-- 15) execução das RPCs de usuário (nenhuma para anon: S14 segue 17) -------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.agency_talent_save(uuid, uuid, jsonb)', 'public.agency_talent_set_segments(uuid, uuid[])',
    'public.agency_talent_link_creator(uuid, uuid)', 'public.agency_talent_archive(uuid, text)',
    'public.agency_invite_talent(uuid, text, int)', 'public.talent_set_consent(boolean, text)',
    'public.agency_talent_record_consent(uuid, text, uuid)', 'public.agency_talent_set_catalog(uuid, boolean)',
    'public.talent_social_save(uuid, uuid, jsonb)', 'public.talent_social_delete(uuid)',
    'public.media_kit_save(uuid, jsonb)', 'public.media_kit_share(uuid, int)', 'public.media_kit_revoke(uuid)',
    'public.talent_my_context()', 'public.agency_invitation_revoke(uuid, text)',
    'public.document_reserve(uuid, text, uuid, jsonb)', 'public.document_confirm(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
