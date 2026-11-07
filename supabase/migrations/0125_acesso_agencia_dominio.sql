-- =============================================================================
-- 0125 — Reunião Groscove (06/11/2026), lote B: entrada na agência pelo domínio do e-mail, cadastro PJ de cada
-- colaborador, níveis e segmentos.
--
-- Decisões:
--   • Agência não nasce mais por autosserviço. Quem escolhe "Agência" no cadastro e tem e-mail de um domínio
--     autorizado (agencies.email_domains; a Groscove usa groscovegroup.com e groscoveultra.com) cria login e senha
--     normalmente e envia um PEDIDO DE ACESSO (agency_access_requests) com CNPJ, cargo, nível e o aceite do Termo
--     do Parceiro. Os Adms da agência recebem o aviso e aceitam (escolhendo o nível de acesso) ou recusam no portal.
--     É o "convite invertido" pedido pela Groscove. O admin da plataforma continua podendo criar agência.
--   • Cada colaborador é PJ: agency_members ganha cnpj, nível (junior < pleno < senior) e a versão do termo aceita.
--     Quem já é membro completa esses dados no primeiro acesso ao portal (member_complete_profile).
--   • Cargo é livre (a própria pessoa escreve); o nível de ACESSO (Adm, Gestor, Equipe) continua com os Adms.
--   • Níveis também para equipes de marca e para o Hero (autodeclarado: como a pessoa se sente, não os números).
--   • Segmentos: os 10 territórios do Calendário Groscove (sem "feriados"), até 4 por Hero (perfil e casting).
-- =============================================================================

-- 1) domínios de e-mail da agência ---------------------------------------------------------------------------------
alter table public.agencies add column if not exists email_domains text[] not null default '{}';
alter table public.agencies drop constraint if exists agencies_email_domains_check;
alter table public.agencies add constraint agencies_email_domains_check check (cardinality(email_domains) <= 10);
create index if not exists agencies_email_domains_idx on public.agencies using gin (email_domains);
update public.agencies set email_domains = array['groscovegroup.com', 'groscoveultra.com']
where slug = 'groscove' and cardinality(email_domains) = 0;

-- 2) níveis e cadastro PJ ---------------------------------------------------------------------------------------------
create or replace function public.member_level_valid(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or p in ('junior', 'pleno', 'senior')
$$;

alter table public.agency_members add column if not exists cnpj text;
alter table public.agency_members add column if not exists level text;
alter table public.agency_members add column if not exists terms_version text;
alter table public.agency_members drop constraint if exists agency_members_cnpj_check;
alter table public.agency_members add constraint agency_members_cnpj_check check (cnpj is null or cnpj ~ '^\d{14}$');
alter table public.agency_members drop constraint if exists agency_members_level_check;
alter table public.agency_members add constraint agency_members_level_check check (public.member_level_valid(level));

alter table public.brand_members add column if not exists level text;
alter table public.brand_members drop constraint if exists brand_members_level_check;
alter table public.brand_members add constraint brand_members_level_check check (public.member_level_valid(level));

-- territórios que valem como segmento do Hero (os do calendário, sem feriados)
create or replace function public.hero_segments_valid(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select p is null or (cardinality(p) <= 4 and p <@ array['futebol', 'esporte', 'entretenimento', 'musica', 'geek_tech',
                                                         'social', 'saude', 'varejo', 'moda', 'sustentabilidade']::text[])
$$;

alter table public.creator_profiles add column if not exists level text;
alter table public.creator_profiles add column if not exists segments text[] not null default '{}';
alter table public.creator_profiles drop constraint if exists creator_profiles_level_check;
alter table public.creator_profiles add constraint creator_profiles_level_check check (public.member_level_valid(level));
alter table public.creator_profiles drop constraint if exists creator_profiles_segments_check;
alter table public.creator_profiles add constraint creator_profiles_segments_check check (public.hero_segments_valid(segments));

alter table public.talent_profiles add column if not exists level text;
alter table public.talent_profiles add column if not exists segments text[] not null default '{}';
alter table public.talent_profiles drop constraint if exists talent_profiles_level_check;
alter table public.talent_profiles add constraint talent_profiles_level_check check (public.member_level_valid(level));
alter table public.talent_profiles drop constraint if exists talent_profiles_segments_check;
alter table public.talent_profiles add constraint talent_profiles_segments_check check (public.hero_segments_valid(segments));
create index if not exists talent_profiles_segments_idx on public.talent_profiles using gin (segments);

-- 3) avisos novos ---------------------------------------------------------------------------------------------------
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
  -- 0125
  'agency_access_requested', 'agency_access_decided'));

alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   -- 0125
   'access_request'));

-- 4) pedidos de acesso -----------------------------------------------------------------------------------------------
create table if not exists public.agency_access_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(full_name) between 2 and 80),
  cnpj text not null check (cnpj ~ '^\d{14}$'),
  job_title text not null check (char_length(job_title) between 2 and 80),
  level text not null check (level in ('junior', 'pleno', 'senior')),
  terms_version text not null check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  granted_role text check (granted_role is null or granted_role in ('admin', 'manager', 'staff')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agency_access_requests_open_idx on public.agency_access_requests (user_id) where status = 'pending';
create index if not exists agency_access_requests_agency_idx on public.agency_access_requests (agency_id, status, created_at desc);
alter table public.agency_access_requests enable row level security;
revoke all on public.agency_access_requests from public, anon, authenticated;
grant select on public.agency_access_requests to authenticated;
grant all on public.agency_access_requests to service_role;
drop policy if exists agency_access_requests_select on public.agency_access_requests;
create policy agency_access_requests_select on public.agency_access_requests for select to authenticated
  using (user_id = (select auth.uid()) or agency_id = any ((select public.my_agency_ids('admin'))::uuid[])
         or (select public.is_platform_admin()));

-- domínio do e-mail da pessoa logada → agência que aceita esse domínio (a mais antiga, se houver mais de uma)
create or replace function public.agency_for_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.agencies a
  where a.status = 'active' and lower(split_part(btrim(coalesce(p_email, '')), '@', 2)) = any (a.email_domains)
  order by a.created_at limit 1
$$;
revoke execute on function public.agency_for_email(text) from public, anon, authenticated;
grant execute on function public.agency_for_email(text) to service_role;

-- domínio autorizado? (a tela de cadastro avisa antes de criar a conta; não revela o nome da agência)
create or replace function public.agency_email_domain_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.agency_for_email(p_email) is not null
$$;
revoke execute on function public.agency_email_domain_allowed(text) from public;
grant execute on function public.agency_email_domain_allowed(text) to anon, authenticated, service_role;

-- estado do pedido da pessoa logada: {domain_ok, agency, request:{status, created_at, decision_note}}
create or replace function public.my_agency_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_agency uuid; r public.agency_access_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  v_agency := public.agency_for_email(v_email);
  select * into r from public.agency_access_requests q where q.user_id = auth.uid() order by q.created_at desc limit 1;
  return jsonb_build_object(
    'domain_ok', v_agency is not null,
    'email', v_email,
    'agency', (select a.name from public.agencies a where a.id = v_agency),
    'member', exists (select 1 from public.agency_members m where m.user_id = auth.uid() and m.revoked_at is null),
    'request', case when r.id is null then null else jsonb_build_object('id', r.id, 'status', r.status, 'created_at', r.created_at,
                    'decision_note', r.decision_note, 'full_name', r.full_name, 'job_title', r.job_title, 'level', r.level) end);
end $$;
revoke execute on function public.my_agency_access() from public, anon;
grant execute on function public.my_agency_access() to authenticated, service_role;

-- envia (ou reenvia, depois de recusado) o pedido de acesso
create or replace function public.agency_access_request(p_full_name text, p_cnpj text, p_job_title text, p_level text, p_terms_version text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v_agency uuid; v_id uuid;
        v_name text := left(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), 80);
        v_job text := left(regexp_replace(btrim(coalesce(p_job_title, '')), '\s+', ' ', 'g'), 80);
        v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('agency_access:' || v_uid::text));
  select u.email into v_email from auth.users u where u.id = v_uid;
  v_agency := public.agency_for_email(v_email);
  if v_agency is null then raise exception 'domain_not_allowed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.agency_members m where m.user_id = v_uid and m.revoked_at is null) then
    raise exception 'agency_member_elsewhere' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 2 then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_job) < 2 then raise exception 'job_title_required' using errcode = '22023'; end if;
  if not public.cnpj_valid(v_cnpj) then raise exception 'invalid_cnpj' using errcode = '22023'; end if;
  if p_level is null or p_level not in ('junior', 'pleno', 'senior') then raise exception 'level_required' using errcode = '22023'; end if;
  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'terms_required' using errcode = '22023'; end if;
  -- o termo aceito fica registrado como o de qualquer parceiro
  perform public.accept_partner_terms(p_terms_version);

  select q.id into v_id from public.agency_access_requests q where q.user_id = v_uid and q.status = 'pending';
  if v_id is not null then
    update public.agency_access_requests set full_name = v_name, cnpj = v_cnpj, job_title = v_job, level = p_level,
      terms_version = p_terms_version, agency_id = v_agency, email = v_email, updated_at = now()
    where id = v_id;
    return v_id;
  end if;
  if (select count(*) from public.agency_access_requests q where q.user_id = v_uid and q.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.agency_access_requests (agency_id, user_id, email, full_name, cnpj, job_title, level, terms_version)
  values (v_agency, v_uid, v_email, v_name, v_cnpj, v_job, p_level, p_terms_version) returning id into v_id;
  perform public.inbox_notify_agency(v_agency, 'admin', 'agency_access_requested', '/agencia/equipe#pedidos',
    jsonb_build_object('name', v_name, 'job', v_job), 'access_request', v_id, 'access_req:' || v_id::text);
  perform public.audit_log('agency.access_requested', 'agency_access_request', v_id::text, null,
    jsonb_build_object('agency', v_agency), null, 'agency');
  return v_id;
end $$;
revoke execute on function public.agency_access_request(text, text, text, text, text) from public, anon;
grant execute on function public.agency_access_request(text, text, text, text, text) to authenticated, service_role;

-- Adm aceita (com o nível de acesso) ou recusa
create or replace function public.agency_access_decide(p_request uuid, p_approve boolean, p_role text default 'staff', p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.agency_access_requests%rowtype; v_role text := coalesce(p_role, 'staff');
        v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.agency_access_requests where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(r.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  if v_role not in ('admin', 'manager', 'staff') then raise exception 'invalid_input' using errcode = '22023'; end if;

  if p_approve then
    if exists (select 1 from public.agency_members m where m.user_id = r.user_id and m.revoked_at is null) then
      raise exception 'agency_member_elsewhere' using errcode = 'P0001';
    end if;
    insert into public.agency_members (agency_id, user_id, role, display_name, job_title, cnpj, level, terms_version, invited_by)
    values (r.agency_id, r.user_id, v_role, r.full_name, r.job_title, r.cnpj, r.level, r.terms_version, auth.uid())
    on conflict (agency_id, user_id) do update
      set role = excluded.role, display_name = excluded.display_name, job_title = excluded.job_title, cnpj = excluded.cnpj,
          level = excluded.level, terms_version = excluded.terms_version, revoked_at = null, invited_by = excluded.invited_by;
    perform set_config('app.trusted', 'on', true);
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (r.user_id, 'agency', 'agency', r.agency_id, auth.uid())
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform set_config('app.trusted', 'off', true);
    -- o passo "Agência" do cadastro fecha: a pessoa entra direto no portal
    update public.account_onboardings set completed_at = now(), result_id = r.agency_id
    where user_id = r.user_id and kind = 'agency' and completed_at is null;
  end if;

  update public.agency_access_requests
     set status = case when p_approve then 'approved' else 'rejected' end, granted_role = case when p_approve then v_role end,
         decided_by = auth.uid(), decided_at = now(), decision_note = v_note, updated_at = now()
   where id = r.id;
  perform public.inbox_notify(r.user_id, 'agency_access_decided', case when p_approve then '/agencia' else '/primeiro-acesso' end,
    jsonb_build_object('approved', p_approve, 'agency', (select a.name from public.agencies a where a.id = r.agency_id)),
    r.agency_id, 'access_request', r.id, 'access_dec:' || r.id::text);
  perform public.inbox_notify_agency(r.agency_id, 'admin', 'member_joined', '/agencia/equipe',
    jsonb_build_object('name', r.full_name), 'access_request', r.id, case when p_approve then 'access_join:' || r.id::text end)
  where p_approve;
  perform public.audit_log(case when p_approve then 'agency.access_approved' else 'agency.access_rejected' end,
    'agency_access_request', r.id::text, null, jsonb_build_object('role', v_role), null, 'agency');
  return true;
end $$;
revoke execute on function public.agency_access_decide(uuid, boolean, text, text) from public, anon;
grant execute on function public.agency_access_decide(uuid, boolean, text, text) to authenticated, service_role;

-- 5) agência por autosserviço só para o admin da plataforma (as outras entram por pedido de acesso) -------------------
create or replace function public.onboarding_agency_by_request()
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.is_platform_admin()
$$;
revoke execute on function public.onboarding_agency_by_request() from public, anon;
grant execute on function public.onboarding_agency_by_request() to authenticated, service_role;

-- a RPC de criar agência recusa o passo self-service de quem não é admin da plataforma
create or replace function public.onboarding_create_agency(p_name text, p_cnpj text, p_contact_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype; v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''); v_email text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
begin
  o := public.onboarding_take('agency');
  if o.source = 'self' and not public.is_platform_admin() then raise exception 'agency_by_request' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'name_required' using errcode = '22023'; end if;
  if v_cnpj is not null and not public.cnpj_valid(v_cnpj) then raise exception 'invalid_cnpj' using errcode = '22023'; end if;
  if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.agency_members m where m.user_id = auth.uid() and m.revoked_at is null) then
    raise exception 'agency_member_elsewhere' using errcode = 'P0001';
  end if;
  insert into public.agencies (slug, name, contact_email, cnpj, created_by)
  values (public.free_slug(v_name, 'agency'), v_name, v_email, v_cnpj, auth.uid()) returning id into v_id;
  perform public.agency_seed_defaults(v_id);
  insert into public.agency_members (agency_id, user_id, role, display_name, invited_by)
  values (v_id, auth.uid(), 'admin', public.my_display_name(), auth.uid());
  perform set_config('app.trusted', 'on', true);
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'agency', 'agency', v_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  update public.account_onboardings set completed_at = now(), result_id = v_id where id = o.id;
  perform public.audit_log('onboarding.agency', 'agency', v_id::text, null, jsonb_build_object('name', v_name, 'cnpj', v_cnpj is not null), null, 'agency');
  return v_id;
end $$;
revoke execute on function public.onboarding_create_agency(text, text, text) from public, anon;
grant execute on function public.onboarding_create_agency(text, text, text) to authenticated, service_role;

-- 6) o próprio colaborador completa (e depois edita) o cadastro: nome, CNPJ, cargo, nível e o termo ----------------
create or replace function public.member_complete_profile(p_full_name text, p_cnpj text, p_job_title text, p_level text, p_terms_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_name text := left(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), 80);
        v_job text := left(regexp_replace(btrim(coalesce(p_job_title, '')), '\s+', ' ', 'g'), 80);
        v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.agency_members m where m.user_id = auth.uid() and m.revoked_at is null) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_job) < 2 then raise exception 'job_title_required' using errcode = '22023'; end if;
  if not public.cnpj_valid(v_cnpj) then raise exception 'invalid_cnpj' using errcode = '22023'; end if;
  if p_level is null or p_level not in ('junior', 'pleno', 'senior') then raise exception 'level_required' using errcode = '22023'; end if;
  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'terms_required' using errcode = '22023'; end if;
  perform public.accept_partner_terms(p_terms_version);
  update public.agency_members set display_name = v_name, job_title = v_job, cnpj = v_cnpj, level = p_level,
    terms_version = p_terms_version
  where user_id = auth.uid() and revoked_at is null;
  return true;
end $$;
revoke execute on function public.member_complete_profile(text, text, text, text, text) from public, anon;
grant execute on function public.member_complete_profile(text, text, text, text, text) to authenticated, service_role;

-- 7) segmentos e nível do Hero (o próprio Hero no perfil; a agência no casting) ------------------------------------------
create or replace function public.hero_set_segments(p_segments text[], p_level text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_segments text[] := coalesce((select array_agg(distinct s) from unnest(coalesce(p_segments, '{}'::text[])) s), '{}'::text[]);
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.hero_segments_valid(v_segments) then raise exception 'invalid_segments' using errcode = '22023'; end if;
  if not public.member_level_valid(p_level) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.creator_profiles set segments = v_segments, level = p_level where user_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.talent_profiles set segments = v_segments, level = coalesce(p_level, level) where user_id = auth.uid();
  return true;
end $$;
revoke execute on function public.hero_set_segments(text[], text) from public, anon;
grant execute on function public.hero_set_segments(text[], text) to authenticated, service_role;

create or replace function public.talent_set_segments(p_talent uuid, p_segments text[], p_level text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_segments text[] := coalesce((select array_agg(distinct s) from unnest(coalesce(p_segments, '{}'::text[])) s), '{}'::text[]);
begin
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if v_agency is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.hero_segments_valid(v_segments) then raise exception 'invalid_segments' using errcode = '22023'; end if;
  if not public.member_level_valid(p_level) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.talent_profiles set segments = v_segments, level = p_level where id = p_talent;
  return true;
end $$;
revoke execute on function public.talent_set_segments(uuid, text[], text) from public, anon;
grant execute on function public.talent_set_segments(uuid, text[], text) to authenticated, service_role;

-- nível de quem é da equipe de uma marca (a própria pessoa)
create or replace function public.brand_member_set_level(p_level text, p_job_title text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_job text := nullif(left(regexp_replace(btrim(coalesce(p_job_title, '')), '\s+', ' ', 'g'), 80), '');
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.member_level_valid(p_level) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.brand_members set level = p_level, job_title = coalesce(v_job, job_title) where user_id = auth.uid() and revoked_at is null;
  return found;
end $$;
revoke execute on function public.brand_member_set_level(text, text) from public, anon;
grant execute on function public.brand_member_set_level(text, text) to authenticated, service_role;
