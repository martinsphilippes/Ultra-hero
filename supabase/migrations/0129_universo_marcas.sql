-- =============================================================================
-- 0129 — Universo de marcas da Groscove (07/11/2026): categorias, dados internos, domínios de e-mail e o login da
-- marca ligado à marca certa.
--
-- Decisões (aprovadas pelo responsável):
--   • 16 categorias: as 11 da Lista oficial ("Alimentos e Bebidas" vira "Gastronomia e Bebidas") + Viagem e
--     Turismo, Higiene e Limpeza, Infantil e Brinquedos, Pet, Presentes e Flores. A Groscove muda a categoria de
--     qualquer marca.
--   • Dados internos da marca (CPA, CPA Influencer, código MID, telefone e e-mail oficiais) ficam em brand_internal:
--     só quem é da Groscove (ou admin da plataforma) vê; nem a marca nem outras agências.
--   • brands.email_domains: domínios do e-mail corporativo da marca (do site oficial). Quem se cadastra como Marca
--     com e-mail desse domínio vê "Você é da <marca>?" e pede o acesso; a Groscove aprova e a pessoa entra como Dono
--     (o primeiro) ou Equipe, sem criar marca nova. E-mail pessoal (gmail, hotmail…) nunca liga sozinho. Dá para
--     pedir também pelo nome da marca (sem domínio igual); a Groscove confere antes de aprovar.
--   • Marca já existente não nasce de novo pelo cadastro (onboarding_create_brand recusa com brand_exists_claim).
-- =============================================================================

-- 1) categorias -------------------------------------------------------------------------------------------------------
create table if not exists public.brand_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  sort_order int not null default 0
);
alter table public.brand_categories enable row level security;
revoke all on public.brand_categories from public, anon, authenticated;
grant select on public.brand_categories to authenticated;
grant all on public.brand_categories to service_role;
drop policy if exists brand_categories_select on public.brand_categories;
create policy brand_categories_select on public.brand_categories for select to authenticated using (true);

insert into public.brand_categories (slug, name, sort_order) values
  ('moda', 'Moda e Acessórios', 1), ('beleza', 'Beleza e Cosméticos', 2), ('tecnologia', 'Tecnologia e Financeiro', 3),
  ('casa', 'Casa e Decoração', 4), ('entretenimento', 'Entretenimento e Mídia', 5), ('gastronomia', 'Gastronomia e Bebidas', 6),
  ('varejo', 'Varejo e E-commerce', 7), ('saude', 'Saúde e Bem-estar', 8), ('mobilidade', 'Mobilidade e Transporte', 9),
  ('automotivo', 'Automotivo', 10), ('educacao', 'Educação', 11), ('viagem', 'Viagem e Turismo', 12),
  ('higiene', 'Higiene e Limpeza', 13), ('infantil', 'Infantil e Brinquedos', 14), ('pet', 'Pet', 15), ('presentes', 'Presentes e Flores', 16)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

alter table public.brands add column if not exists category text references public.brand_categories (slug) on update cascade on delete set null;
alter table public.brands add column if not exists email_domains text[] not null default '{}';
alter table public.brands drop constraint if exists brands_email_domains_check;
alter table public.brands add constraint brands_email_domains_check check (cardinality(email_domains) <= 10);
create index if not exists brands_email_domains_idx on public.brands using gin (email_domains);
create index if not exists brands_category_idx on public.brands (category);

-- quem é da Groscove (qualquer nível) — vê os dados internos
create or replace function public.is_groscove_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.is_platform_admin()
    or (public.groscove_agency_id() is not null and public.agency_can(public.groscove_agency_id(), 'staff')))
$$;
revoke execute on function public.is_groscove_member() from public, anon;
grant execute on function public.is_groscove_member() to authenticated, service_role;

-- 2) dados internos (só a Groscove) -------------------------------------------------------------------------------------
create table if not exists public.brand_internal (
  brand_id uuid primary key references public.brands (id) on delete cascade,
  cpa text check (cpa is null or char_length(cpa) <= 80),
  cpa_influencer text check (cpa_influencer is null or char_length(cpa_influencer) <= 80),
  mid text check (mid is null or char_length(mid) <= 40),
  official_phone text check (official_phone is null or char_length(official_phone) <= 120),
  official_email text check (official_email is null or char_length(official_email) <= 254),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.brand_internal enable row level security;
revoke all on public.brand_internal from public, anon, authenticated;
grant select on public.brand_internal to authenticated;
grant all on public.brand_internal to service_role;
drop policy if exists brand_internal_select on public.brand_internal;
create policy brand_internal_select on public.brand_internal for select to authenticated using ((select public.is_groscove_member()));

-- domínio de e-mail pessoal: nunca liga a uma marca
create or replace function public.email_domain_generic(p_domain text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(coalesce(p_domain, '')) in ('gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
    'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'mac.com', 'bol.com.br', 'uol.com.br', 'terra.com.br',
    'ig.com.br', 'globo.com', 'globomail.com', 'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'yandex.com', 'gmx.com')
$$;

-- a Groscove (gestor+) edita a marca: nome, categoria, site, logo, domínios e os dados internos
create or replace function public.brand_admin_save(p_brand uuid, p_data jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_g uuid := public.groscove_agency_id(); v_domains text[];
begin
  if not (public.is_platform_admin() or (v_g is not null and public.agency_can(v_g, 'manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.brands b where b.id = p_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_data ? 'email_domains' then
    select coalesce(array_agg(distinct d), '{}') into v_domains
    from (select lower(btrim(x)) d from jsonb_array_elements_text(p_data -> 'email_domains') x) s
    where d ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and not public.email_domain_generic(d);
  end if;
  if p_data ? 'site_url' and not public.brand_https_url_ok(btrim(p_data ->> 'site_url')) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if p_data ? 'logo_url' and not public.brand_image_url_ok(nullif(btrim(p_data ->> 'logo_url'), '')) then raise exception 'invalid_image' using errcode = '22023'; end if;
  if p_data ? 'category' and nullif(p_data ->> 'category', '') is not null
     and not exists (select 1 from public.brand_categories c where c.slug = p_data ->> 'category') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform set_config('app.trusted', 'on', true);
  update public.brands set
    name = case when p_data ? 'name' and char_length(btrim(p_data ->> 'name')) between 1 and 60 then btrim(p_data ->> 'name') else name end,
    category = case when p_data ? 'category' then nullif(p_data ->> 'category', '') else category end,
    site_url = case when p_data ? 'site_url' then btrim(p_data ->> 'site_url') else site_url end,
    logo_url = case when p_data ? 'logo_url' then nullif(btrim(p_data ->> 'logo_url'), '') else logo_url end,
    email_domains = case when p_data ? 'email_domains' then v_domains else email_domains end
  where id = p_brand;
  if p_data ?| array['cpa', 'cpa_influencer', 'mid', 'official_phone', 'official_email'] then
    insert into public.brand_internal (brand_id, cpa, cpa_influencer, mid, official_phone, official_email, updated_by)
    values (p_brand, nullif(btrim(p_data ->> 'cpa'), ''), nullif(btrim(p_data ->> 'cpa_influencer'), ''), nullif(btrim(p_data ->> 'mid'), ''),
            nullif(btrim(p_data ->> 'official_phone'), ''), nullif(lower(btrim(p_data ->> 'official_email')), ''), auth.uid())
    on conflict (brand_id) do update set cpa = excluded.cpa, cpa_influencer = excluded.cpa_influencer, mid = excluded.mid,
      official_phone = excluded.official_phone, official_email = excluded.official_email, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('brand.admin_save', 'brand', p_brand::text, null, p_data - 'cpa' - 'cpa_influencer' - 'mid', null, 'agency');
  return true;
end $$;
revoke execute on function public.brand_admin_save(uuid, jsonb) from public, anon;
grant execute on function public.brand_admin_save(uuid, jsonb) to authenticated, service_role;

-- 3) login da marca ligado à marca certa ------------------------------------------------------------------------------
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
  -- 0129
  'brand_login_requested', 'brand_login_decided'));

create table if not exists public.brand_access_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(full_name) between 2 and 80),
  job_title text check (job_title is null or char_length(job_title) <= 80),
  domain_matches boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  granted_role text check (granted_role is null or granted_role in ('owner', 'staff')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists brand_access_requests_open_idx on public.brand_access_requests (user_id) where status = 'pending';
create index if not exists brand_access_requests_status_idx on public.brand_access_requests (status, created_at desc);
alter table public.brand_access_requests enable row level security;
revoke all on public.brand_access_requests from public, anon, authenticated;
grant select on public.brand_access_requests to authenticated;
grant all on public.brand_access_requests to service_role;
drop policy if exists brand_access_requests_select on public.brand_access_requests;
create policy brand_access_requests_select on public.brand_access_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_groscove_member()));

-- "Você é da <marca>?": marcas do domínio do e-mail da pessoa (corporativo) ou pelo nome digitado (mín. 3 letras)
create or replace function public.brand_login_candidates(p_name text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_domain text; v_key text := public.brand_name_key(p_name);
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  v_domain := split_part(v_email, '@', 2);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url, 'site_url', b.site_url,
      'category', (select c.name from public.brand_categories c where c.slug = b.category),
      'domain_matches', (not public.email_domain_generic(v_domain) and v_domain = any (b.email_domains))) as x
    from public.brands b
    where not b.is_demo and b.approval_status = 'approved'
      and ((not public.email_domain_generic(v_domain) and v_domain = any (b.email_domains))
           or (char_length(v_key) >= 3 and public.brand_name_key(b.name) like '%' || v_key || '%'))
    order by (not public.email_domain_generic(v_domain) and v_domain = any (b.email_domains)) desc, b.name limit 8) s), '[]'::jsonb);
end $$;
revoke execute on function public.brand_login_candidates(text) from public, anon;
grant execute on function public.brand_login_candidates(text) to authenticated, service_role;

create or replace function public.brand_login_request(p_brand uuid, p_full_name text, p_job_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_email text; v_domain text; v_id uuid; v_brand public.brands%rowtype;
        v_name text := left(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), 80);
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v_brand from public.brands where id = p_brand and not is_demo and approval_status = 'approved';
  if v_brand.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(v_name) < 2 then raise exception 'name_required' using errcode = '22023'; end if;
  if exists (select 1 from public.brand_members m where m.brand_id = p_brand and m.user_id = auth.uid() and m.revoked_at is null) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  v_domain := split_part(v_email, '@', 2);
  update public.brand_access_requests set status = 'cancelled' where user_id = auth.uid() and status = 'pending';
  insert into public.brand_access_requests (brand_id, user_id, email, full_name, job_title, domain_matches)
  values (p_brand, auth.uid(), v_email, v_name, nullif(left(btrim(coalesce(p_job_title, '')), 80), ''),
          not public.email_domain_generic(v_domain) and v_domain = any (v_brand.email_domains))
  returning id into v_id;
  if public.groscove_agency_id() is not null then
    perform public.inbox_notify_agency(public.groscove_agency_id(), 'manager', 'brand_login_requested', '/agencia/marcas#logins',
      jsonb_build_object('name', v_name, 'brand', left(v_brand.name, 80)), 'brand', p_brand, 'brand_login:' || v_id::text);
  end if;
  return v_id;
end $$;
revoke execute on function public.brand_login_request(uuid, text, text) from public, anon;
grant execute on function public.brand_login_request(uuid, text, text) to authenticated, service_role;

create or replace function public.my_brand_login_request()
returns jsonb language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('id', r.id, 'status', r.status, 'brand', b.name, 'created_at', r.created_at)
          from public.brand_access_requests r join public.brands b on b.id = r.brand_id
          where r.user_id = auth.uid() and r.status in ('pending', 'rejected') order by r.created_at desc limit 1)
$$;
revoke execute on function public.my_brand_login_request() from public, anon;
grant execute on function public.my_brand_login_request() to authenticated, service_role;

create or replace function public.brand_login_inbox()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'brand', b.name, 'brand_id', b.id, 'logo_url', b.logo_url,
      'full_name', r.full_name, 'job_title', r.job_title, 'email', r.email, 'domain_matches', r.domain_matches, 'created_at', r.created_at,
      'has_owner', exists (select 1 from public.brand_members m where m.brand_id = b.id and m.role = 'owner' and m.revoked_at is null))
    order by r.created_at)
    from public.brand_access_requests r join public.brands b on b.id = r.brand_id where r.status = 'pending'), '[]'::jsonb);
end $$;
revoke execute on function public.brand_login_inbox() from public, anon;
grant execute on function public.brand_login_inbox() to authenticated, service_role;

-- a Groscove (gestor+) aprova: o primeiro vira Dono, os seguintes Equipe (ou o papel escolhido)
create or replace function public.brand_login_decide(p_request uuid, p_approve boolean, p_role text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.brand_access_requests%rowtype; v_g uuid := public.groscove_agency_id(); v_role text;
begin
  if not (public.is_platform_admin() or (v_g is not null and public.agency_can(v_g, 'manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.brand_access_requests where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  if p_approve then
    if exists (select 1 from public.brand_members m where m.user_id = r.user_id and m.role = 'owner' and m.revoked_at is null and m.brand_id <> r.brand_id)
       and coalesce(p_role, '') <> 'staff' then
      raise exception 'brand_already_owned' using errcode = 'P0001';
    end if;
    v_role := coalesce(nullif(p_role, ''), case when exists (select 1 from public.brand_members m where m.brand_id = r.brand_id and m.role = 'owner' and m.revoked_at is null) then 'staff' else 'owner' end);
    if v_role not in ('owner', 'staff') then raise exception 'invalid_input' using errcode = '22023'; end if;
    perform set_config('app.trusted', 'on', true);
    insert into public.brand_members (brand_id, user_id, role, display_name, job_title, invited_by)
    values (r.brand_id, r.user_id, v_role, r.full_name, r.job_title, auth.uid())
    on conflict (brand_id, user_id) do update set role = excluded.role, revoked_at = null, display_name = excluded.display_name;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (r.user_id, 'brand', 'brand', r.brand_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform set_config('app.trusted', 'off', true);
    update public.account_onboardings set completed_at = now(), result_id = r.brand_id
    where user_id = r.user_id and kind = 'brand' and completed_at is null;
  end if;
  update public.brand_access_requests set status = case when p_approve then 'approved' else 'rejected' end,
    granted_role = case when p_approve then v_role end, decided_by = auth.uid(), decided_at = now() where id = r.id;
  perform public.inbox_notify(r.user_id, 'brand_login_decided', case when p_approve then '/marca' else '/primeiro-acesso' end,
    jsonb_build_object('brand', (select left(b.name, 80) from public.brands b where b.id = r.brand_id), 'approved', p_approve),
    null, 'brand', r.brand_id, 'brand_login_dec:' || r.id::text);
  perform public.audit_log(case when p_approve then 'brand.login_approved' else 'brand.login_rejected' end, 'brand', r.brand_id::text,
    null, jsonb_build_object('user_id', r.user_id, 'role', v_role, 'domain_matches', r.domain_matches), null, 'agency');
  return true;
end $$;
revoke execute on function public.brand_login_decide(uuid, boolean, text) from public, anon;
grant execute on function public.brand_login_decide(uuid, boolean, text) to authenticated, service_role;

-- 4) marca que já existe não nasce de novo pelo cadastro ----------------------------------------------------------------
create or replace function public.onboarding_create_brand(p_name text, p_cnpj text, p_segment text, p_site_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype; v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''); v_segment text := nullif(btrim(coalesce(p_segment, '')), '');
        v_site text := btrim(coalesce(p_site_url, ''));
begin
  o := public.onboarding_take('brand');
  if char_length(v_name) not between 2 and 60 then raise exception 'name_required' using errcode = '22023'; end if;
  if v_cnpj is not null and not public.cnpj_valid(v_cnpj) then raise exception 'invalid_cnpj' using errcode = '22023'; end if;
  if v_segment is not null and char_length(v_segment) > 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.brand_https_url_ok(v_site) then raise exception 'invalid_url' using errcode = '22023'; end if;
  -- 0129: a marca já está no universo da Groscove → pedir acesso a ela, não criar outra
  if exists (select 1 from public.brands b where not b.is_demo and b.approval_status <> 'rejected'
             and (public.brand_name_key(b.name) = public.brand_name_key(v_name) or (v_cnpj is not null and b.cnpj = v_cnpj))) then
    raise exception 'brand_exists_claim' using errcode = 'P0001';
  end if;
  insert into public.brands (slug, name, site_url, status, self_managed, cnpj, segment, created_by)
  values (public.free_slug(v_name, 'brand'), v_name, v_site, 'inactive', true, v_cnpj, v_segment, auth.uid()) returning id into v_id;
  insert into public.brand_members (brand_id, user_id, role, display_name, invited_by)
  values (v_id, auth.uid(), 'owner', public.my_display_name(), auth.uid());
  perform set_config('app.trusted', 'on', true);
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'brand', 'brand', v_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  if o.agency_id is not null and exists (select 1 from public.agencies a where a.id = o.agency_id and a.status = 'active' and not a.is_demo) then
    insert into public.agency_brands (agency_id, brand_id, status, created_by) values (o.agency_id, v_id, 'active', auth.uid())
    on conflict (agency_id, brand_id) do update set status = 'active';
    perform public.inbox_notify_agency(o.agency_id, 'manager', 'brand_member_joined', '/agencia/marcas/' || v_id::text,
      jsonb_build_object('name', public.my_display_name(), 'brand', v_name), 'brand', v_id, 'brand_onboarded:' || v_id::text);
  end if;
  update public.account_onboardings set completed_at = now(), result_id = v_id where id = o.id;
  perform public.audit_log('onboarding.brand', 'brand', v_id::text, null,
    jsonb_build_object('name', v_name, 'cnpj', v_cnpj is not null, 'segment', v_segment, 'agency_id', o.agency_id), null, 'brand');
  return v_id;
end $$;
revoke execute on function public.onboarding_create_brand(text, text, text, text) from public, anon;
grant execute on function public.onboarding_create_brand(text, text, text, text) to authenticated, service_role;
