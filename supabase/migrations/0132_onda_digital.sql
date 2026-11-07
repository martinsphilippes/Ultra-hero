-- =============================================================================
-- 0132 — Onda Digital no portal da marca (07/11/2026; roteiro aprovado pelo responsável).
--
-- A Onda Digital é um produto da Groscove: várias páginas publicam juntas, de forma sincronizada, o post que a
-- marca deseja (para engajar ou vender). A marca entende o produto numa página própria do portal e pede a onda;
-- o pedido chega à Groscove e vira negócio no funil.
--
-- Decisões (aprovadas):
--   • Conteúdo da página no banco (não no código), para a Groscove atualizar sem programador: perfis das páginas
--     (Instagram e X), portais de imprensa por área, cases e pacotes. Fonte: apresentação "Onda Digital"
--     (seguidores de novembro de 2026).
--   • Quem vê: quem é de marca (dono ou equipe), a Groscove e o admin geral. Outras agências, Heroes e consumidores
--     não.
--   • Pedido "Quero entrar na onda": onda (pacote ou "me ajudem a escolher"), para quê, quando, o assunto, verba
--     (opcional) e as páginas (opcional). A Groscove cria o post, a marca aprova antes de subir; prazo, formatos e
--     valores são combinados na negociação.
--   • O pedido vira negócio no funil da Groscove quando a marca é atendida por ela; os gestores recebem o aviso no
--     sino. A marca acompanha o andamento: Recebido → Em conversa → Proposta → Na onda! (ou Encerrado).
--   • Aviso único no sino de quem é de marca hoje: "Novidade da Groscove: Onda Digital" (0133, depois que a página
--     estiver no ar).
-- =============================================================================

-- 1) quem vê a Onda Digital ---------------------------------------------------------------------------------------------
create or replace function public.onda_viewer()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or public.is_groscove_member()
    or exists (select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
               where m.user_id = auth.uid() and m.revoked_at is null and not b.is_demo))
$$;
revoke execute on function public.onda_viewer() from public, anon;
grant execute on function public.onda_viewer() to authenticated, service_role;

-- 2) conteúdo ---------------------------------------------------------------------------------------------------------
create table if not exists public.onda_profiles (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('instagram', 'x')),
  handle text not null check (handle ~ '^[a-z0-9._]{1,40}$'),
  followers bigint not null check (followers >= 0),
  avatar_url text check (avatar_url is null or avatar_url ~ '^/onda-digital/[a-z0-9-]{1,60}\.webp$' or public.brand_https_url_ok(avatar_url)),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (network, handle)
);
create table if not exists public.onda_portals (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('noticias', 'negocios', 'moda', 'entretenimento', 'musica', 'tecnologia', 'financas', 'cultura_afro')),
  name text not null check (char_length(name) between 1 and 60),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (area, name)
);
create table if not exists public.onda_cases (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null check (char_length(brand_name) between 1 and 60),
  brand_id uuid references public.brands (id) on delete set null,
  category text references public.brand_categories (slug) on update cascade on delete set null,
  description text not null check (char_length(description) between 1 and 300),
  -- [{"k": "reach"|"impressions"|"impacts"|"feed_reach", "v": número, "plus": true?}]
  metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(metrics) = 'array'),
  sort_order int not null default 0,
  active boolean not null default true
);
create table if not exists public.onda_packages (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  scope text not null check (char_length(scope) between 2 and 120),
  description text not null check (char_length(description) between 2 and 300),
  sort_order int not null default 0,
  active boolean not null default true
);

do $$
declare t text;
begin
  foreach t in array array['onda_profiles', 'onda_portals', 'onda_cases', 'onda_packages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.onda_viewer()))', t || '_select', t);
  end loop;
end $$;

-- 3) pedidos ----------------------------------------------------------------------------------------------------------
create table if not exists public.onda_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  package text references public.onda_packages (slug) on update cascade on delete set null,
  purpose text not null check (purpose in ('launch', 'realtime', 'events', 'influencers', 'conversion', 'opportunity', 'awareness')),
  when_kind text not null default 'tbd' check (when_kind in ('now', 'date', 'tbd')),
  when_date date,
  subject text not null check (char_length(btrim(subject)) between 2 and 1000),
  budget_cents bigint check (budget_cents is null or budget_cents between 0 and 100000000000),
  profile_ids uuid[] not null default '{}' check (cardinality(profile_ids) <= 60),
  status text not null default 'received' check (status in ('received', 'talking', 'proposal', 'live', 'closed')),
  deal_id uuid references public.deals (id) on delete set null,
  status_changed_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((when_kind = 'date') = (when_date is not null))
);
create index if not exists onda_requests_brand_idx on public.onda_requests (brand_id, created_at desc);
create index if not exists onda_requests_status_idx on public.onda_requests (status, created_at desc);
alter table public.onda_requests enable row level security;
revoke all on public.onda_requests from public, anon, authenticated;
grant select on public.onda_requests to authenticated;
grant all on public.onda_requests to service_role;
drop policy if exists onda_requests_select on public.onda_requests;
create policy onda_requests_select on public.onda_requests for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]) or (select public.is_groscove_member()));

-- avisos: tipos e entidade novos
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
  -- 0132
  'onda_digital_news', 'onda_request_received', 'onda_request_updated'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   'access_request',
   'casting_request', 'profile_claim',
   -- 0132
   'onda_request'));

-- 4) leitura da página (o logo do case vem da marca, mesmo fora da vitrine) -----------------------------------------------
create or replace function public.onda_content()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.onda_viewer() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'network', p.network, 'handle', p.handle, 'followers', p.followers,
        'avatar_url', p.avatar_url) order by p.network, p.sort_order, p.followers desc)
      from public.onda_profiles p where p.active), '[]'::jsonb),
    'portals', coalesce((select jsonb_agg(jsonb_build_object('area', p.area, 'name', p.name) order by p.sort_order, p.name)
      from public.onda_portals p where p.active), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand_name, 'logo_url', b.logo_url, 'category', c.category,
        'description', c.description, 'metrics', c.metrics) order by c.sort_order)
      from public.onda_cases c left join public.brands b on b.id = c.brand_id where c.active), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('slug', k.slug, 'name', k.name, 'scope', k.scope, 'description', k.description) order by k.sort_order)
      from public.onda_packages k where k.active), '[]'::jsonb));
end $$;
revoke execute on function public.onda_content() from public, anon;
grant execute on function public.onda_content() to authenticated, service_role;

-- 5) a marca pede a onda ------------------------------------------------------------------------------------------------
create or replace function public.onda_request_create(p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_g uuid := public.groscove_agency_id(); v_deal uuid; v_owner uuid; v_brand public.brands%rowtype;
        v_package text := nullif(btrim(coalesce(p_data ->> 'package', '')), '');
        v_purpose text := btrim(coalesce(p_data ->> 'purpose', ''));
        v_when text := coalesce(nullif(btrim(coalesce(p_data ->> 'when_kind', '')), ''), 'tbd');
        v_date date; v_subject text := left(btrim(coalesce(p_data ->> 'subject', '')), 1000);
        v_budget bigint; v_profiles uuid[]; v_package_name text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_brand from public.brands where id = p_brand;
  if v_brand.id is null or v_brand.is_demo or public.brand_member_of(p_brand) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_package is not null and not exists (select 1 from public.onda_packages k where k.slug = v_package and k.active) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_purpose not in ('launch', 'realtime', 'events', 'influencers', 'conversion', 'opportunity', 'awareness') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_when not in ('now', 'date', 'tbd') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_when = 'date' then
    begin v_date := (p_data ->> 'when_date')::date; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_date is null or v_date < current_date or v_date > current_date + 730 then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  if char_length(v_subject) < 2 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if nullif(p_data ->> 'budget_cents', '') is not null then
    begin v_budget := (p_data ->> 'budget_cents')::bigint; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_budget < 0 or v_budget > 100000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  if jsonb_typeof(p_data -> 'profile_ids') = 'array' then
    select coalesce(array_agg(distinct p.id), '{}') into v_profiles from public.onda_profiles p
    where p.active and p.id::text in (select jsonb_array_elements_text(p_data -> 'profile_ids'));
  end if;
  -- no máximo 5 pedidos por marca em 24 h (evita pedidos repetidos sem querer)
  if (select count(*) from public.onda_requests r where r.brand_id = p_brand and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.onda_requests (brand_id, requested_by, package, purpose, when_kind, when_date, subject, budget_cents, profile_ids)
  values (p_brand, auth.uid(), v_package, v_purpose, v_when, v_date, v_subject, v_budget, coalesce(v_profiles, '{}'))
  returning id into v_id;
  select k.name into v_package_name from public.onda_packages k where k.slug = v_package;

  -- vira negócio no funil da Groscove quando ela atende a marca
  if v_g is not null and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id
                                 where ab.agency_id = v_g and ab.brand_id = p_brand and ab.status = 'active' and a.status = 'active') then
    select ab.account_manager_id into v_owner from public.agency_brands ab where ab.agency_id = v_g and ab.brand_id = p_brand;
    if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = v_g and m.user_id = v_owner and m.revoked_at is null) then
      v_owner := null;
    end if;
    insert into public.deals (agency_id, brand_id, title, stage, owner_id, created_by, brand_visible, talent_brief, expected_start, expected_end, is_demo)
    values (v_g, p_brand, left('Onda Digital — ' || coalesce(v_package_name, 'a definir'), 120), 'briefing_received', v_owner, auth.uid(), true,
            left(v_subject, 3000), v_date, v_date, public.agency_is_demo(v_g))
    returning id into v_deal;
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
    values (v_g, 'deal', v_deal, 'system', 'briefing_received', auth.uid(), public.actor_label(v_g, p_brand));
    update public.onda_requests set deal_id = v_deal where id = v_id;
  end if;

  if v_g is not null then
    perform public.inbox_notify_agency(v_g, 'manager', 'onda_request_received', '/agencia/onda-digital#pedido-' || v_id::text,
      jsonb_build_object('brand', left(v_brand.name, 80), 'title', coalesce(v_package_name, 'none')), 'onda_request', v_id, 'onda_req:' || v_id::text);
  end if;
  perform public.audit_log('onda.request', 'onda_request', v_id::text, null,
    jsonb_build_object('brand_id', p_brand, 'package', v_package, 'purpose', v_purpose, 'when_kind', v_when, 'deal_id', v_deal), null, 'brand');
  return v_id;
end $$;
revoke execute on function public.onda_request_create(uuid, jsonb) from public, anon;
grant execute on function public.onda_request_create(uuid, jsonb) to authenticated, service_role;

-- 6) a Groscove acompanha e avança a etapa -------------------------------------------------------------------------------
create or replace function public.onda_request_inbox()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'brand_id', b.id, 'brand', b.name, 'logo_url', b.logo_url, 'package', k.name, 'purpose', r.purpose,
      'when_kind', r.when_kind, 'when_date', r.when_date, 'subject', r.subject, 'budget_cents', r.budget_cents,
      'profiles', (select coalesce(jsonb_agg(p.network || ':' || p.handle order by p.network, p.followers desc), '[]'::jsonb)
                   from public.onda_profiles p where p.id = any (r.profile_ids)),
      'status', r.status, 'deal_id', r.deal_id, 'created_at', r.created_at,
      'requested_by', coalesce((select m.display_name from public.brand_members m where m.brand_id = r.brand_id and m.user_id = r.requested_by), ''),
      'email', (select u.email from auth.users u where u.id = r.requested_by))
    order by (r.status in ('closed', 'live')), r.created_at desc)
    from public.onda_requests r join public.brands b on b.id = r.brand_id left join public.onda_packages k on k.slug = r.package), '[]'::jsonb);
end $$;
revoke execute on function public.onda_request_inbox() from public, anon;
grant execute on function public.onda_request_inbox() to authenticated, service_role;

create or replace function public.onda_request_set_status(p_request uuid, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.onda_requests%rowtype; v_g uuid := public.groscove_agency_id(); v_package_name text;
begin
  if not (public.is_platform_admin() or (v_g is not null and public.agency_can(v_g, 'manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('received', 'talking', 'proposal', 'live', 'closed') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into r from public.onda_requests where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status = p_status then return true; end if;
  update public.onda_requests set status = p_status, status_changed_by = auth.uid(), status_changed_at = now() where id = r.id;
  select k.name into v_package_name from public.onda_packages k where k.slug = r.package;
  perform public.inbox_notify_brand(r.brand_id, false, 'onda_request_updated', '/marca/onda-digital#pedidos',
    jsonb_build_object('status', p_status, 'title', coalesce(v_package_name, '')), v_g, 'onda_request', r.id,
    'onda_upd:' || r.id::text || ':' || p_status);
  perform public.audit_log('onda.request_status', 'onda_request', r.id::text, jsonb_build_object('status', r.status),
    jsonb_build_object('status', p_status), null, 'agency');
  return true;
end $$;
revoke execute on function public.onda_request_set_status(uuid, text) from public, anon;
grant execute on function public.onda_request_set_status(uuid, text) to authenticated, service_role;

-- 7) conteúdo da apresentação "Onda Digital" (seguidores de novembro de 2026) ------------------------------------------
insert into public.onda_packages (slug, name, scope, description, sort_order) values
  ('sol-e-agua-fresca', 'Sol e Água Fresca', '5 páginas', 'Para entrar na onda: um assunto em 5 páginas ao mesmo tempo.', 1),
  ('surfa-com-a-gente', 'Surfa com a Gente', '10 páginas + 2 portais', 'Conversa nas páginas e presença na imprensa.', 2),
  ('sol-torando', 'Sol Torando', '20 páginas + 5 portais', 'Alcance nacional, com creators como opcional.', 3),
  ('sereia', 'Sereia', 'todas as páginas + todos os portais + creators', 'A onda inteira, em todos os pontos.', 4)
on conflict (slug) do nothing;

insert into public.onda_profiles (network, handle, followers, avatar_url, sort_order)
select 'instagram', h, f, '/onda-digital/av-' || replace(h, '_', '-') || '.webp', n
from (values ('choquei', 26000000, 1), ('alfinetei', 25000000, 2), ('hugogloss', 22000000, 3), ('sincerooficial', 21000000, 4),
  ('ginaindelicada', 12000000, 5), ('sobremundo', 10000000, 6), ('nazareamarga', 9000000, 7), ('gossipdodia', 9000000, 8),
  ('fofoquei', 7000000, 9), ('tobemisso', 7000000, 10), ('centraldafama', 6000000, 11), ('perrengue_chique', 5000000, 12),
  ('subcelebrities', 5000000, 13), ('sobrefunk', 5000000, 14), ('viralizou', 5000000, 15), ('tricotei', 4000000, 16),
  ('cutucadas', 3000000, 17), ('rainhamatos', 3000000, 18), ('nanarude', 3000000, 19), ('babados', 2000000, 20),
  ('migasualoka', 2000000, 21), ('instacinefilos', 1000000, 22), ('garotxdoblog', 1000000, 23), ('xuxanave', 1000000, 24),
  ('geshow', 1000000, 25), ('instasurreal', 1000000, 26), ('lacerda', 892000, 27), ('otarian0', 85000, 28)) v(h, f, n)
on conflict (network, handle) do nothing;
insert into public.onda_profiles (network, handle, followers, avatar_url, sort_order)
select 'x', h, f, '/onda-digital/av-' || replace(h, '_', '-') || '.webp', n
from (values ('choquei', 9500000, 1), ('luscas', 6800000, 2), ('nazareamarga', 4700000, 3), ('oemputecido', 2700000, 4),
  ('cleytu', 2000000, 5), ('alfinetei', 1300000, 6), ('lacerda', 1300000, 7), ('itspedrito', 1000000, 8),
  ('soueunavida', 438000, 9), ('luquinha', 397000, 10), ('garotxdoblogofc', 257000, 11), ('xuxanave', 171000, 12),
  ('vittor', 115000, 13), ('nanarude', 65000, 14)) v(h, f, n)
on conflict (network, handle) do nothing;

insert into public.onda_portals (area, name, sort_order)
select a, n, o from (values
  ('noticias', 'UOL', 1), ('noticias', 'O Globo', 2), ('noticias', 'G1', 3), ('noticias', 'Terra', 4), ('noticias', 'Estadão', 5), ('noticias', 'R7', 6), ('noticias', 'iG', 7),
  ('negocios', 'Exame', 11), ('negocios', 'Forbes', 12), ('negocios', 'Época Negócios', 13), ('negocios', 'PEGN', 14), ('negocios', 'StartSe', 15),
  ('moda', 'Vogue', 21), ('moda', 'Elle', 22), ('moda', 'Marie Claire', 23), ('moda', 'Glamour', 24), ('moda', 'Capricho', 25),
  ('entretenimento', 'Billboard', 31), ('entretenimento', 'Metrópoles', 32), ('entretenimento', 'Purepeople', 33), ('entretenimento', 'Omelete', 34),
  ('entretenimento', 'O Fuxico', 35), ('entretenimento', 'RD1', 36),
  ('musica', 'Portal Popline', 41), ('musica', 'KondZilla', 42),
  ('tecnologia', 'Tecnoblog', 51), ('tecnologia', 'Canaltech', 52), ('tecnologia', 'Olhar Digital', 53), ('tecnologia', 'Tecmundo', 54),
  ('financas', 'InfoMoney', 61), ('financas', 'Valor', 62),
  ('cultura_afro', 'Geledés', 71), ('cultura_afro', 'Mídia Negra', 72), ('cultura_afro', 'Portal Negro', 73), ('cultura_afro', 'Notícias Negras', 74)) v(a, n, o)
on conflict (area, name) do nothing;

do $$
begin
  if exists (select 1 from public.onda_cases) then return; end if;
  insert into public.onda_cases (brand_name, brand_id, category, description, metrics, sort_order)
  select v.brand_name,
         (select b.id from public.brands b where not b.is_demo and public.brand_name_key(b.name) = any (v.keys) order by array_position(v.keys, public.brand_name_key(b.name)) limit 1),
         v.category, v.description, v.metrics::jsonb, v.n
  from (values
    ('Prime Video', array['primevideo', 'amazonprimevideo', 'amazonprime'], 'entretenimento', 'Divulgação do reality Game dos Clones.',
      '[{"k":"reach","v":55900000},{"k":"impressions","v":94300000}]', 1),
    ('Guaraná Antarctica', array['guaranaantarctica'], 'gastronomia', 'Divulgação do clipe Jingle Bell & Natal Rock, criado em parceria com Paula Fernandes.',
      '[{"k":"reach","v":27200000},{"k":"impressions","v":28100000}]', 2),
    ('Magalu', array['magalu', 'magazineluiza'], 'varejo', 'Amplificação dos conteúdos da Lu.',
      '[{"k":"reach","v":26600000},{"k":"impressions","v":29300000}]', 3),
    ('Brahma', array['brahma'], 'gastronomia', 'Divulgação do #ArenaBrahma.',
      '[{"k":"reach","v":25500000},{"k":"impressions","v":28000000}]', 4),
    ('Globoplay', array['globoplay'], 'entretenimento', 'Divulgação de novos conteúdos.',
      '[{"k":"reach","v":11000000},{"k":"impressions","v":20000000}]', 5),
    ('Skol', array['skol'], 'gastronomia', 'Ação que colocou várias hashtags sobre churrasco nos trending topics do Twitter.',
      '[{"k":"impressions","v":1700000}]', 6),
    ('Google', array['google'], 'tecnologia', 'Divulgação do Google Files no Instagram Stories e no Twitter.',
      '[{"k":"reach","v":3600000},{"k":"impressions","v":7000000}]', 7),
    ('Oreo', array['oreo'], 'gastronomia', 'Divulgação do projeto Faz de Contos.',
      '[{"k":"reach","v":9600000},{"k":"impressions","v":17400000}]', 8),
    ('Brahma', array['brahma'], 'gastronomia', 'Divulgação do programa O Próximo Número 1 Villa Mix.',
      '[{"k":"reach","v":11900000},{"k":"impressions","v":15500000}]', 9),
    ('Telecine', array['telecine'], 'entretenimento', 'Divulgação de novos conteúdos.',
      '[{"k":"reach","v":6300000},{"k":"impressions","v":11300000}]', 10),
    ('Mercado Pago', array['mercadopago'], 'tecnologia', 'Ação de Black Friday.',
      '[{"k":"reach","v":7900000},{"k":"impressions","v":11000000}]', 11),
    ('Santander', array['santander'], 'tecnologia', 'Divulgação do projeto #AGenteBanca, que apoiou donos de bancas de jornais a investirem em negócios alternativos.',
      '[{"k":"reach","v":8800000},{"k":"impressions","v":14200000}]', 12),
    ('TIM', array['tim'], 'tecnologia', 'Divulgação da #ShowDeVantagens e sorteio no Twitter.',
      '[{"k":"impressions","v":15500000}]', 13),
    ('Seara', array['seara'], 'gastronomia', 'Divulgação da ação da marca no Mestre do Sabor.',
      '[{"k":"reach","v":25700000},{"k":"impressions","v":27100000}]', 14),
    ('Ame', array['ame', 'amedigital'], 'tecnologia', 'Ação de Black Friday: desconto divulgado em todas as páginas, mais de 35M de impactos e estoque de Vodka Absolut zerado.',
      '[{"k":"impacts","v":35000000,"plus":true}]', 15),
    ('Serasa', array['serasa', 'serasaexperian'], 'tecnologia', 'Ação do Feirão Limpa Nome, atingindo mais de 6 milhões de contas no Instagram. Contratado: 1 post.',
      '[{"k":"feed_reach","v":13.67}]', 16)
  ) v(brand_name, keys, category, description, metrics, n);
end $$;
