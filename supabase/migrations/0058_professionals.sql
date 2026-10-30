-- =============================================================================
-- Ultra Hero · 0058 · Profissionais e serviços (Etapa 3 da vitrine do hero)
--   Decisões do responsável (docs/decisions/hero-showcase.md): profissionais (nutricionista,
--   personal…) são CONTAS REAIS com papel próprio (`professional`), perfil, serviços com preço e
--   caixa de pedidos. Contratar = item no carrinho com pagamento simulado, como os produtos; gera
--   pedido de serviço para o profissional. No app das lojas a contratação some (app-nas-lojas.md).
--
-- Tabelas
--   professionals              perfil público (só aprovados aparecem): especialidade, registro
--                              (CRN/CREF/… + UF), selo de registro conferido, bio, cidades/online.
--   professional_verifications nota do admin sobre a conferência do registro (só o admin lê).
--   professional_services      serviços com preço (sessão em minutos ou plano em semanas; online,
--                              presencial ou os dois). O profissional edita; o admin pode desativar.
--   professional_suggestions   "sugeridos" ligados pelo admin a herói, receita ou programa. Chave
--                              primária própria (id): nada de tabela-ponte na chave (lição da 0055).
--   service_cart_items         serviços no carrinho (1 de cada; preço visto guardado).
--   service_orders             pedido de serviço (preço e título congelados), situação e tempos.
--   service_order_events       histórico: mudanças de situação e recados do profissional ao cliente.
--   professional_tap_counters  indicador agregado (dia, profissional, herói, origem, ação): sem
--                              pessoa, sem FK (lição da 0055), só o service role soma.
-- Situação do pedido (mesma regra de src/lib/professionals/rules.ts)
--   pending → accepted | declined (profissional) · pending → cancelled (cliente)
--   accepted → scheduled (recado obrigatório) | completed | cancelled (profissional, com recado)
--   scheduled → scheduled (remarcar) | completed | cancelled (profissional, com recado)
--   admin: qualquer situação aberta → cancelled (recado obrigatório, auditado)
--   A 1ª resposta do profissional (aceitar/recusar) grava first_response_at (tempo de resposta).
-- Papel: app_role ganha 'professional'. O valor novo NÃO é usado nesta migração (o Postgres não
--   deixa usar um valor de enum criado na mesma transação): só as funções, em tempo de execução,
--   gravam role_assignments com ele (aceite do convite, aprovação, conta de acesso rápido).
--   O portal (/profissional) e a RLS usam my_professional_id() (perfil ligado à conta).
-- Convite: reaproveita invitations (coluna professional_id; checks por texto) e accept_invitation
--   ganha o ramo do profissional.
-- Regras gerais: idempotente; search_path fixo; grants explícitos; RLS ligada; políticas com
--   (select ...); nenhuma função nova executável pelo visitante (S14 segue com 17); escrita só por
--   RPC; toda escrita do admin auditada (admin_audit).
-- =============================================================================

-- ---------------------------------------------------------------- 1) papel
alter type public.app_role add value if not exists 'professional';

alter table public.role_assignments drop constraint if exists role_assignments_scope_type_check;
alter table public.role_assignments add constraint role_assignments_scope_type_check
  check (scope_type in ('global', 'seller_org', 'creator', 'professional'));

-- ---------------------------------------------------------------- 2) tabelas
create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 500 and photo_url ~ '^(/|https://)')),
  specialty text not null check (specialty in ('nutritionist', 'personal_trainer', 'physiotherapist', 'psychologist')),
  registry_type text not null check (registry_type in ('CRN', 'CREF', 'CREFITO', 'CRP')),
  registry_number text not null check (registry_number ~ '^[0-9A-Za-z./-]{2,20}$'),
  registry_uf text not null check (registry_uf in ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')),
  bio text not null default '' check (char_length(bio) <= 2000),
  cities text[] not null default '{}' check (cardinality(cities) <= 10),
  online boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  registry_verified boolean not null default false,
  approved_at timestamptz,
  is_demo boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- aprovado = registro conferido
  constraint professionals_approved_verified check (status <> 'approved' or registry_verified)
);
create index if not exists professionals_public_idx on public.professionals (specialty, sort_order) where status = 'approved';
drop trigger if exists trg_professionals_updated on public.professionals;
create trigger trg_professionals_updated before update on public.professionals
  for each row execute function public.set_updated_at();

create table if not exists public.professional_verifications (
  professional_id uuid primary key references public.professionals (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 1000),
  verified_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  kind text not null check (kind in ('session', 'plan')),
  mode text not null check (mode in ('online', 'in_person', 'both')),
  duration_minutes int check (duration_minutes between 15 and 480),
  plan_weeks int check (plan_weeks between 1 and 52),
  price_cents int not null check (price_cents between 500 and 10000000),
  is_active boolean not null default true,
  admin_disabled boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_services_shape check (
    (kind = 'session' and duration_minutes is not null and plan_weeks is null) or
    (kind = 'plan' and plan_weeks is not null))
);
create index if not exists professional_services_pro_idx on public.professional_services (professional_id, sort_order);
drop trigger if exists trg_professional_services_updated on public.professional_services;
create trigger trg_professional_services_updated before update on public.professional_services
  for each row execute function public.set_updated_at();

create table if not exists public.professional_suggestions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  creator_id uuid references public.creator_profiles (id) on delete cascade,
  content_id uuid references public.content (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint professional_suggestions_one_target check (num_nonnulls(creator_id, content_id, program_id) = 1),
  constraint professional_suggestions_creator_uq unique (professional_id, creator_id),
  constraint professional_suggestions_content_uq unique (professional_id, content_id),
  constraint professional_suggestions_program_uq unique (professional_id, program_id)
);
create index if not exists professional_suggestions_creator_idx on public.professional_suggestions (creator_id) where creator_id is not null;
create index if not exists professional_suggestions_content_idx on public.professional_suggestions (content_id) where content_id is not null;
create index if not exists professional_suggestions_program_idx on public.professional_suggestions (program_id) where program_id is not null;

create table if not exists public.service_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_id uuid not null references public.professional_services (id) on delete cascade,
  price_cents_seen int not null check (price_cents_seen >= 0),
  added_at timestamptz not null default now(),
  constraint service_cart_items_uq unique (user_id, service_id)
);

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  professional_id uuid not null references public.professionals (id) on delete restrict,
  service_id uuid references public.professional_services (id) on delete set null,
  client_label text not null default '' check (char_length(client_label) <= 80),
  title_snapshot text not null,
  kind_snapshot text not null check (kind_snapshot in ('session', 'plan')),
  mode_snapshot text not null check (mode_snapshot in ('online', 'in_person', 'both')),
  duration_minutes_snapshot int,
  plan_weeks_snapshot int,
  price_cents int not null check (price_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'scheduled', 'completed', 'declined', 'cancelled')),
  schedule_note text not null default '' check (char_length(schedule_note) <= 500),
  first_response_at timestamptz,
  closed_at timestamptz,
  -- sempre simulado: nenhum pagamento existe
  is_demo boolean not null default true check (is_demo),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_orders_user_idx on public.service_orders (user_id, created_at desc);
create index if not exists service_orders_pro_idx on public.service_orders (professional_id, status, created_at desc);
drop trigger if exists trg_service_orders_updated on public.service_orders;
create trigger trg_service_orders_updated before update on public.service_orders
  for each row execute function public.set_updated_at();

create table if not exists public.service_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.service_orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('consumer', 'professional', 'admin', 'system')),
  actor_id uuid,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists service_order_events_order_idx on public.service_order_events (order_id, created_at);

create table if not exists public.professional_tap_counters (
  id bigint generated always as identity primary key,
  day date not null,
  professional_id uuid not null,
  creator_id uuid,
  source text not null check (source in ('receita', 'alimentacao', 'perfil', 'lista', 'programa')),
  action text not null check (action in ('ver_perfil', 'contratar')),
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  constraint professional_tap_counters_uq unique nulls not distinct (day, professional_id, creator_id, source, action)
);

-- convites: professional_id + checks por texto (o valor novo do enum não pode ser usado aqui)
alter table public.invitations add column if not exists professional_id uuid references public.professionals (id) on delete cascade;
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role::text in ('creator', 'seller', 'professional'));
alter table public.invitations drop constraint if exists invitations_scope;
alter table public.invitations add constraint invitations_scope check (
  (role::text = 'seller' and seller_org_id is not null and creator_profile_id is null and professional_id is null) or
  (role::text = 'creator' and creator_profile_id is not null and seller_org_id is null and professional_id is null) or
  (role::text = 'professional' and professional_id is not null and seller_org_id is null and creator_profile_id is null));

-- ---------------------------------------------------------------- 3) grants (escrita só pelas RPCs)
revoke all on table public.professionals, public.professional_verifications, public.professional_services,
  public.professional_suggestions, public.service_cart_items, public.service_orders, public.service_order_events,
  public.professional_tap_counters from public, anon, authenticated;
grant select on table public.professionals, public.professional_services, public.professional_suggestions to anon, authenticated;
grant select on table public.professional_verifications, public.service_cart_items, public.service_orders, public.service_order_events to authenticated;
grant all on table public.professionals, public.professional_verifications, public.professional_services,
  public.professional_suggestions, public.service_cart_items, public.service_orders, public.service_order_events,
  public.professional_tap_counters to service_role;

-- ---------------------------------------------------------------- 4) helper
-- Perfil profissional da conta logada (qualquer situação; as RPCs conferem a situação).
create or replace function public.my_professional_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.professionals p where p.user_id = auth.uid() limit 1
$$;
revoke execute on function public.my_professional_id() from public, anon;
grant execute on function public.my_professional_id() to authenticated, service_role;

-- ---------------------------------------------------------------- 5) RLS
alter table public.professionals enable row level security;
alter table public.professional_verifications enable row level security;
alter table public.professional_services enable row level security;
alter table public.professional_suggestions enable row level security;
alter table public.service_cart_items enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_order_events enable row level security;
alter table public.professional_tap_counters enable row level security;

drop policy if exists professionals_select_public on public.professionals;
create policy professionals_select_public on public.professionals for select to anon, authenticated
  using (status = 'approved');
drop policy if exists professionals_select_own on public.professionals;
create policy professionals_select_own on public.professionals for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists professional_verifications_select_admin on public.professional_verifications;
create policy professional_verifications_select_admin on public.professional_verifications for select to authenticated
  using ((select public.is_admin()));

drop policy if exists professional_services_select_public on public.professional_services;
create policy professional_services_select_public on public.professional_services for select to anon, authenticated
  using (is_active and not admin_disabled
         and exists (select 1 from public.professionals p where p.id = professional_services.professional_id and p.status = 'approved'));
drop policy if exists professional_services_select_own on public.professional_services;
create policy professional_services_select_own on public.professional_services for select to authenticated
  using (professional_id = (select public.my_professional_id()) or (select public.is_admin()));

drop policy if exists professional_suggestions_select_public on public.professional_suggestions;
create policy professional_suggestions_select_public on public.professional_suggestions for select to anon, authenticated
  using (exists (select 1 from public.professionals p where p.id = professional_suggestions.professional_id and p.status = 'approved'));
drop policy if exists professional_suggestions_select_admin on public.professional_suggestions;
create policy professional_suggestions_select_admin on public.professional_suggestions for select to authenticated
  using ((select public.is_admin()));

drop policy if exists service_cart_items_select_own on public.service_cart_items;
create policy service_cart_items_select_own on public.service_cart_items for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists service_orders_select_party on public.service_orders;
create policy service_orders_select_party on public.service_orders for select to authenticated
  using (user_id = (select auth.uid()) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));

drop policy if exists service_order_events_select_party on public.service_order_events;
create policy service_order_events_select_party on public.service_order_events for select to authenticated
  using (exists (select 1 from public.service_orders o where o.id = service_order_events.order_id
                 and (o.user_id = (select auth.uid()) or o.professional_id = (select public.my_professional_id()) or (select public.is_admin()))));
-- professional_tap_counters: nenhuma política (só o service role lê e soma)

-- ---------------------------------------------------------------- 6) validação comum
-- Normaliza e confere os campos de um serviço vindos da tela (jsonb). Devolve a linha pronta.
create or replace function public.professional_service_fields(p_data jsonb)
returns public.professional_services language plpgsql stable set search_path = public as $$
declare r public.professional_services;
begin
  r.title := btrim(coalesce(p_data ->> 'title', ''));
  r.description := btrim(coalesce(p_data ->> 'description', ''));
  r.kind := coalesce(p_data ->> 'kind', 'session');
  r.mode := coalesce(p_data ->> 'mode', 'online');
  r.price_cents := (p_data ->> 'price_cents')::int;
  r.is_active := coalesce((p_data ->> 'is_active')::boolean, true);
  r.sort_order := coalesce((p_data ->> 'sort_order')::int, 100);
  if r.kind = 'session' then
    r.duration_minutes := (p_data ->> 'duration_minutes')::int;
    r.plan_weeks := null;
  else
    r.plan_weeks := (p_data ->> 'plan_weeks')::int;
    r.duration_minutes := nullif(p_data ->> 'duration_minutes', '')::int;
  end if;
  if r.price_cents is null or char_length(r.title) < 3 then raise exception 'invalid_service' using errcode = '22023'; end if;
  return r;
end $$;
revoke execute on function public.professional_service_fields(jsonb) from public, anon, authenticated;
grant execute on function public.professional_service_fields(jsonb) to service_role;

-- ---------------------------------------------------------------- 7) portal do profissional
-- Perfil: o que o profissional edita (especialidade, tipo de registro, slug e situação são do admin).
-- Mudar número ou UF do registro tira o selo "registro conferido" até o admin conferir de novo.
create or replace function public.professional_save_profile(p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare p public.professionals%rowtype; v_number text; v_uf text; v_cities text[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.professionals where user_id = auth.uid() for update;
  if not found then raise exception 'not_professional' using errcode = '42501'; end if;
  if p.status = 'suspended' then raise exception 'professional_suspended' using errcode = '42501'; end if;
  v_number := btrim(coalesce(p_data ->> 'registry_number', p.registry_number));
  v_uf := upper(btrim(coalesce(p_data ->> 'registry_uf', p.registry_uf)));
  v_cities := coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p_data -> 'cities', '[]')) x
                             where btrim(x) <> '' and char_length(btrim(x)) <= 60), '{}');
  update public.professionals set
    name = btrim(coalesce(p_data ->> 'name', p.name)),
    photo_url = nullif(btrim(coalesce(p_data ->> 'photo_url', '')), ''),
    bio = btrim(coalesce(p_data ->> 'bio', '')),
    cities = v_cities,
    online = coalesce((p_data ->> 'online')::boolean, p.online),
    registry_number = v_number,
    registry_uf = v_uf,
    registry_verified = case when v_number is distinct from p.registry_number or v_uf is distinct from p.registry_uf then false else p.registry_verified end,
    -- aprovado com registro novo volta para análise
    status = case when p.status = 'approved' and (v_number is distinct from p.registry_number or v_uf is distinct from p.registry_uf) then 'pending' else p.status end
  where id = p.id;
end $$;
revoke execute on function public.professional_save_profile(jsonb) from public, anon;
grant execute on function public.professional_save_profile(jsonb) to authenticated, service_role;

-- Serviço próprio: cria (até 12) ou edita. Desativado pelo admin continua desativado.
create or replace function public.professional_save_service(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pro uuid; p public.professionals%rowtype; r public.professional_services; v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.professionals where user_id = auth.uid();
  if not found then raise exception 'not_professional' using errcode = '42501'; end if;
  if p.status = 'suspended' then raise exception 'professional_suspended' using errcode = '42501'; end if;
  v_pro := p.id;
  r := public.professional_service_fields(p_data);
  if p_id is null then
    if (select count(*) from public.professional_services where professional_id = v_pro) >= 12 then
      raise exception 'too_many_services' using errcode = 'P0001';
    end if;
    insert into public.professional_services (professional_id, title, description, kind, mode, duration_minutes, plan_weeks, price_cents, is_active, sort_order)
    values (v_pro, r.title, r.description, r.kind, r.mode, r.duration_minutes, r.plan_weeks, r.price_cents, r.is_active, r.sort_order)
    returning id into v_id;
    return v_id;
  end if;
  update public.professional_services set title = r.title, description = r.description, kind = r.kind, mode = r.mode,
    duration_minutes = r.duration_minutes, plan_weeks = r.plan_weeks, price_cents = r.price_cents, is_active = r.is_active,
    sort_order = r.sort_order
  where id = p_id and professional_id = v_pro;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return p_id;
end $$;
revoke execute on function public.professional_save_service(uuid, jsonb) from public, anon;
grant execute on function public.professional_save_service(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- 8) situação do pedido
-- Regra pura (mesma de src/lib/professionals/rules.ts): pode o ator levar de p_from a p_to?
create or replace function public.service_order_can(p_actor text, p_from text, p_to text)
returns boolean language sql immutable set search_path = public as $$
  select case p_actor
    when 'professional' then (p_from, p_to) in (('pending', 'accepted'), ('pending', 'declined'),
      ('accepted', 'scheduled'), ('accepted', 'completed'), ('accepted', 'cancelled'),
      ('scheduled', 'scheduled'), ('scheduled', 'completed'), ('scheduled', 'cancelled'))
    when 'consumer' then (p_from, p_to) = ('pending', 'cancelled')
    when 'admin' then p_from in ('pending', 'accepted', 'scheduled') and p_to = 'cancelled'
    else false end
$$;
revoke execute on function public.service_order_can(text, text, text) from public, anon;
grant execute on function public.service_order_can(text, text, text) to authenticated, service_role;

-- Muda a situação (p_to) e/ou deixa um recado (p_note). p_to nulo = só recado (profissional ou admin).
-- Recado obrigatório: agendar/remarcar (≥ 3), recusar/cancelar pelo profissional e cancelar pelo admin (≥ 5).
create or replace function public.service_order_update(p_order uuid, p_to text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype; v_uid uuid := auth.uid(); v_actor text; v_pro public.professionals%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.service_orders where id = p_order for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_pro from public.professionals where id = o.professional_id;
  if v_pro.user_id = v_uid then v_actor := 'professional';
  elsif o.user_id = v_uid then v_actor := 'consumer';
  elsif public.is_admin() then v_actor := 'admin';
  else raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_actor = 'professional' and v_pro.status = 'suspended' then raise exception 'professional_suspended' using errcode = '42501'; end if;
  if char_length(v_note) > 1000 then raise exception 'note_too_long' using errcode = '22023'; end if;

  if p_to is null then
    if v_actor = 'consumer' then raise exception 'forbidden' using errcode = '42501'; end if;
    if o.status in ('completed', 'declined', 'cancelled') then raise exception 'order_closed' using errcode = 'P0001'; end if;
    if char_length(v_note) < 1 then raise exception 'note_required' using errcode = '22023'; end if;
    insert into public.service_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
    values (o.id, o.status, o.status, v_actor, v_uid, v_note);
    if v_actor = 'admin' then
      perform public.audit_log('service_order.note', 'service_order', o.id::text, null, jsonb_build_object('status', o.status), v_note);
    end if;
    return o.status;
  end if;

  if not public.service_order_can(v_actor, o.status, p_to) then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if p_to = 'scheduled' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  if v_actor in ('professional', 'admin') and p_to in ('declined', 'cancelled') and char_length(v_note) < 5 then
    raise exception 'note_required' using errcode = '22023';
  end if;

  update public.service_orders set
    status = p_to,
    schedule_note = case when p_to = 'scheduled' then left(v_note, 500) else schedule_note end,
    first_response_at = case when v_actor = 'professional' and first_response_at is null then now() else first_response_at end,
    closed_at = case when p_to in ('completed', 'declined', 'cancelled') then now() else closed_at end
  where id = o.id;
  insert into public.service_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
  values (o.id, o.status, p_to, v_actor, v_uid, v_note);
  if v_actor = 'admin' then
    perform public.audit_log('service_order.transition', 'service_order', o.id::text,
      jsonb_build_object('status', o.status), jsonb_build_object('status', p_to, 'professional_id', o.professional_id), v_note);
  end if;
  return p_to;
end $$;
revoke execute on function public.service_order_update(uuid, text, text) from public, anon;
grant execute on function public.service_order_update(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 9) carrinho e contratação
-- Serviço que dá para contratar: ativo, não desativado pelo admin e de profissional aprovado.
create or replace function public.service_is_hireable(p_service uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.professional_services s join public.professionals p on p.id = s.professional_id
                 where s.id = p_service and s.is_active and not s.admin_disabled and p.status = 'approved')
$$;
revoke execute on function public.service_is_hireable(uuid) from public, anon;
grant execute on function public.service_is_hireable(uuid) to authenticated, service_role;

-- Põe (p_add) ou tira um serviço do carrinho. Devolve quantos serviços ficaram (máx. 10).
create or replace function public.service_cart_set(p_service uuid, p_add boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_price int; v_owner uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not p_add then
    delete from public.service_cart_items where user_id = v_uid and service_id = p_service;
    return (select count(*) from public.service_cart_items where user_id = v_uid);
  end if;
  if coalesce((public.setting('commerce.enabled'))::boolean, true) is false then raise exception 'commerce_disabled'; end if;
  if not public.service_is_hireable(p_service) then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
  select s.price_cents, p.user_id into v_price, v_owner
  from public.professional_services s join public.professionals p on p.id = s.professional_id where s.id = p_service;
  if v_owner = v_uid then raise exception 'own_service' using errcode = 'P0001'; end if;
  if (select count(*) from public.service_cart_items where user_id = v_uid and service_id <> p_service) >= 10 then
    raise exception 'too_many_services' using errcode = 'P0001';
  end if;
  insert into public.service_cart_items (user_id, service_id, price_cents_seen) values (v_uid, p_service, v_price)
  on conflict (user_id, service_id) do update set price_cents_seen = excluded.price_cents_seen;
  return (select count(*) from public.service_cart_items where user_id = v_uid);
end $$;
revoke execute on function public.service_cart_set(uuid, boolean) from public, anon;
grant execute on function public.service_cart_set(uuid, boolean) to authenticated, service_role;

-- Checkout com serviços (atômico): produtos pelo checkout_cart de sempre (só se houver produto) e
-- um pedido de serviço por serviço do carrinho, com preço e título congelados. p_services traz o
-- preço que a pessoa viu ([{service_id, price_cents}]); serviço fora do ar ou com preço diferente
-- recusa tudo (nada é gravado). Pagamento: nenhum (simulado, como os produtos).
create or replace function public.checkout_with_services(p_destination uuid, p_expected jsonb default '[]'::jsonb,
  p_accept_changes boolean default false, p_services jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_has_products boolean; v_order uuid; v_ids uuid[] := '{}'; v_label text; v_seen int; r record; v_new uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if coalesce((public.setting('commerce.enabled'))::boolean, true) is false then raise exception 'commerce_disabled'; end if;
  perform 1 from public.service_cart_items where user_id = v_uid for update;
  v_has_products := exists (select 1 from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = v_uid);
  if not v_has_products and not exists (select 1 from public.service_cart_items where user_id = v_uid) then
    raise exception 'cart_empty';
  end if;

  for r in select sci.service_id, s.price_cents from public.service_cart_items sci
           join public.professional_services s on s.id = sci.service_id where sci.user_id = v_uid loop
    if not public.service_is_hireable(r.service_id) then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
    select (e ->> 'price_cents')::int into v_seen from jsonb_array_elements(coalesce(p_services, '[]')) e
    where (e ->> 'service_id') = r.service_id::text limit 1;
    if v_seen is distinct from r.price_cents then raise exception 'service_price_changed' using errcode = 'P0001'; end if;
  end loop;

  if v_has_products then
    v_order := public.checkout_cart(p_destination, p_expected, p_accept_changes);
  end if;

  -- o profissional vê só o primeiro nome e a inicial do sobrenome
  select btrim(split_part(coalesce(p.display_name, ''), ' ', 1) ||
         case when position(' ' in btrim(coalesce(p.display_name, ''))) > 0
              then ' ' || left(btrim(split_part(btrim(p.display_name), ' ', -1)), 1) || '.' else '' end)
  into v_label from public.profiles p where p.id = v_uid;

  for r in select s.* from public.service_cart_items sci join public.professional_services s on s.id = sci.service_id
           where sci.user_id = v_uid order by sci.added_at loop
    insert into public.service_orders (user_id, professional_id, service_id, client_label, title_snapshot, kind_snapshot, mode_snapshot,
      duration_minutes_snapshot, plan_weeks_snapshot, price_cents)
    values (v_uid, r.professional_id, r.id, left(coalesce(v_label, ''), 80), r.title, r.kind, r.mode, r.duration_minutes, r.plan_weeks, r.price_cents)
    returning id into v_new;
    insert into public.service_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
    values (v_new, null, 'pending', 'system', null, '');
    v_ids := v_ids || v_new;
  end loop;
  delete from public.service_cart_items where user_id = v_uid;
  return jsonb_build_object('order_id', v_order, 'service_order_ids', to_jsonb(v_ids));
end $$;
revoke execute on function public.checkout_with_services(uuid, jsonb, boolean, jsonb) from public, anon;
grant execute on function public.checkout_with_services(uuid, jsonb, boolean, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- 10) admin (auditado)
-- Cria/edita o perfil. A situação muda só em admin_professional_set_status.
create or replace function public.admin_professional_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.professionals%rowtype; v_id uuid; v_cities text[];
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_cities := coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p_data -> 'cities', '[]')) x
                             where btrim(x) <> '' and char_length(btrim(x)) <= 60), '{}');
  if p_id is null then
    insert into public.professionals (slug, name, photo_url, specialty, registry_type, registry_number, registry_uf, bio, cities, online, sort_order)
    values (btrim(p_data ->> 'slug'), btrim(p_data ->> 'name'), nullif(btrim(coalesce(p_data ->> 'photo_url', '')), ''),
      p_data ->> 'specialty', p_data ->> 'registry_type', btrim(p_data ->> 'registry_number'), upper(btrim(p_data ->> 'registry_uf')),
      btrim(coalesce(p_data ->> 'bio', '')), v_cities, coalesce((p_data ->> 'online')::boolean, true), coalesce((p_data ->> 'sort_order')::int, 100))
    returning id into v_id;
    perform public.audit_log('professional.create', 'professional', v_id::text, null,
      (select to_jsonb(x) from public.professionals x where x.id = v_id), null);
    return v_id;
  end if;
  select * into p from public.professionals where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.professionals set slug = btrim(p_data ->> 'slug'), name = btrim(p_data ->> 'name'),
    photo_url = nullif(btrim(coalesce(p_data ->> 'photo_url', '')), ''), specialty = p_data ->> 'specialty',
    registry_type = p_data ->> 'registry_type', registry_number = btrim(p_data ->> 'registry_number'),
    registry_uf = upper(btrim(p_data ->> 'registry_uf')), bio = btrim(coalesce(p_data ->> 'bio', '')), cities = v_cities,
    online = coalesce((p_data ->> 'online')::boolean, true), sort_order = coalesce((p_data ->> 'sort_order')::int, p.sort_order)
  where id = p_id;
  perform public.audit_log('professional.update', 'professional', p_id::text, to_jsonb(p),
    (select to_jsonb(x) from public.professionals x where x.id = p_id), null);
  return p_id;
end $$;
revoke execute on function public.admin_professional_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_professional_save(uuid, jsonb) to authenticated, service_role;

-- Aprova (exige registro conferido), deixa pendente ou suspende (nota obrigatória). A conferência do
-- registro (checkbox) e a nota ficam em professional_verifications. Aprovar uma conta ligada garante o papel.
create or replace function public.admin_professional_set_status(p_id uuid, p_status text, p_verified boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p public.professionals%rowtype; v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending', 'approved', 'suspended') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'approved' and not coalesce(p_verified, false) then raise exception 'registry_not_verified' using errcode = 'P0001'; end if;
  if p_status = 'suspended' and char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(v_note) > 1000 then raise exception 'note_too_long' using errcode = '22023'; end if;
  select * into p from public.professionals where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.professionals set status = p_status, registry_verified = coalesce(p_verified, false),
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
  where id = p_id;
  insert into public.professional_verifications (professional_id, note, verified_by, updated_at)
  values (p_id, v_note, auth.uid(), now())
  on conflict (professional_id) do update set note = excluded.note, verified_by = excluded.verified_by, updated_at = now();
  if p_status = 'approved' and p.user_id is not null then
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (p.user_id, 'professional', 'professional', p_id, auth.uid())
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  end if;
  perform public.audit_log('professional.set_status', 'professional', p_id::text,
    jsonb_build_object('status', p.status, 'registry_verified', p.registry_verified),
    jsonb_build_object('status', p_status, 'registry_verified', coalesce(p_verified, false)), nullif(v_note, ''));
end $$;
revoke execute on function public.admin_professional_set_status(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_professional_set_status(uuid, text, boolean, text) to authenticated, service_role;

-- Serviços pelo admin: cria/edita qualquer campo, inclusive desativar (admin_disabled).
create or replace function public.admin_professional_service_save(p_id uuid, p_professional uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.professional_services%rowtype; r public.professional_services; v_id uuid;
  v_disabled boolean := coalesce((p_data ->> 'admin_disabled')::boolean, false);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  r := public.professional_service_fields(p_data);
  if p_id is null then
    if not exists (select 1 from public.professionals where id = p_professional) then raise exception 'not_found' using errcode = 'P0002'; end if;
    insert into public.professional_services (professional_id, title, description, kind, mode, duration_minutes, plan_weeks, price_cents, is_active, admin_disabled, sort_order)
    values (p_professional, r.title, r.description, r.kind, r.mode, r.duration_minutes, r.plan_weeks, r.price_cents, r.is_active, v_disabled, r.sort_order)
    returning id into v_id;
    perform public.audit_log('professional_service.create', 'professional_service', v_id::text, null,
      (select to_jsonb(x) from public.professional_services x where x.id = v_id), null);
    return v_id;
  end if;
  select * into s from public.professional_services where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.professional_services set title = r.title, description = r.description, kind = r.kind, mode = r.mode,
    duration_minutes = r.duration_minutes, plan_weeks = r.plan_weeks, price_cents = r.price_cents, is_active = r.is_active,
    admin_disabled = v_disabled, sort_order = r.sort_order
  where id = p_id;
  perform public.audit_log('professional_service.update', 'professional_service', p_id::text, to_jsonb(s),
    (select to_jsonb(x) from public.professional_services x where x.id = p_id), nullif(btrim(coalesce(p_data ->> 'note', '')), ''));
  return p_id;
end $$;
revoke execute on function public.admin_professional_service_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.admin_professional_service_save(uuid, uuid, jsonb) to authenticated, service_role;

-- Liga/desliga um profissional como "sugerido" de um herói, receita ou programa.
create or replace function public.admin_professional_suggestion_set(p_professional uuid, p_target text, p_target_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_target not in ('creator', 'content', 'program') then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not exists (select 1 from public.professionals where id = p_professional) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_on then
    if (p_target = 'creator' and not exists (select 1 from public.creator_profiles where id = p_target_id))
       or (p_target = 'content' and not exists (select 1 from public.content where id = p_target_id))
       or (p_target = 'program' and not exists (select 1 from public.programs where id = p_target_id)) then
      raise exception 'invalid_target' using errcode = '22023';
    end if;
    insert into public.professional_suggestions (professional_id, creator_id, content_id, program_id, created_by)
    values (p_professional, case when p_target = 'creator' then p_target_id end, case when p_target = 'content' then p_target_id end,
            case when p_target = 'program' then p_target_id end, auth.uid())
    on conflict do nothing;
    get diagnostics v_rows = row_count;
  else
    delete from public.professional_suggestions where professional_id = p_professional
      and ((p_target = 'creator' and creator_id = p_target_id) or (p_target = 'content' and content_id = p_target_id)
           or (p_target = 'program' and program_id = p_target_id));
    get diagnostics v_rows = row_count;
  end if;
  if v_rows > 0 then
    perform public.audit_log(case when p_on then 'professional.suggest' else 'professional.unsuggest' end, 'professional', p_professional::text,
      null, jsonb_build_object('target', p_target, 'target_id', p_target_id), null);
  end if;
end $$;
revoke execute on function public.admin_professional_suggestion_set(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.admin_professional_suggestion_set(uuid, text, uuid, boolean) to authenticated, service_role;

-- Convite para a conta do profissional (mesmo mecanismo de invitations; o link só existe na resposta).
create or replace function public.admin_invite_professional(p_email text, p_professional uuid, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.professionals where id = p_professional) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.professionals where id = p_professional and user_id is not null) then
    raise exception 'professional_already_linked' using errcode = 'P0001';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, professional_id, token_hash, expires_at, created_by)
  values (lower(btrim(p_email)), 'professional', p_professional, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;
  perform public.audit_log('invitation.create', 'invitation', v_id::text, null,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', 'professional', 'professional_id', p_professional));
  return query select v_id, v_token;
end $$;
revoke execute on function public.admin_invite_professional(text, uuid, int) from public, anon;
grant execute on function public.admin_invite_professional(text, uuid, int) to authenticated, service_role;

-- Aceite do convite (0012 + ramo do profissional): liga a conta ao perfil e grava o papel.
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
  if v_inv.role::text = 'seller' and exists (select 1 from public.seller_organizations o where o.id = v_inv.seller_org_id and o.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role::text = 'creator' and exists (select 1 from public.creator_profiles c where c.id = v_inv.creator_profile_id and c.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role::text = 'professional' and exists (select 1 from public.professionals p where p.id = v_inv.professional_id and p.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;

  perform set_config('app.trusted', 'on', true);
  if v_inv.role::text = 'seller' then
    insert into public.seller_memberships (org_id, user_id) values (v_inv.seller_org_id, v_uid)
    on conflict (org_id, user_id) do update set revoked_at = null;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'seller', 'seller_org', v_inv.seller_org_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
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
  end if;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform public.audit_log('invitation.accept', 'invitation', v_inv.id::text, null,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid), null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  return jsonb_build_object('role', v_inv.role, 'scope_id', coalesce(v_inv.seller_org_id, v_inv.creator_profile_id, v_inv.professional_id));
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- ---------------------------------------------------------------- 11) indicador (service role)
-- Soma 1 toque por dia (Brasília), profissional aprovado, herói (opcional), origem e ação.
create or replace function public.professional_tap_bump(p_professional uuid, p_creator uuid, p_source text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.professionals where id = p_professional and status = 'approved') then return; end if;
  if p_creator is not null and not exists (select 1 from public.creator_profiles where id = p_creator) then return; end if;
  insert into public.professional_tap_counters (day, professional_id, creator_id, source, action, count)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_professional, p_creator, p_source, p_action, 1)
  on conflict on constraint professional_tap_counters_uq do update set count = professional_tap_counters.count + 1, updated_at = now();
end $$;
revoke execute on function public.professional_tap_bump(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.professional_tap_bump(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- 12) LGPD: conta anonimizada
-- Pedidos ficam (o profissional mantém o histórico), sem o nome nem o vínculo com a pessoa.
create or replace function public.service_orders_forget_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.service_orders set user_id = null, client_label = '' where user_id = new.id;
  delete from public.service_cart_items where user_id = new.id;
  return new;
end $$;
revoke execute on function public.service_orders_forget_user() from public, anon, authenticated;
grant execute on function public.service_orders_forget_user() to service_role;

drop trigger if exists trg_service_orders_forget_user on public.profiles;
create trigger trg_service_orders_forget_user after update of anonymized_at on public.profiles
  for each row when (new.anonymized_at is not null and old.anonymized_at is null)
  execute function public.service_orders_forget_user();

-- ---------------------------------------------------------------- 13) seed: 2 profissionais de exemplo
-- Nomes inventados, aprovados, com 2–3 serviços e sugeridos a heróis/receitas/programa. Sem conta
-- ligada: a conta de acesso rápido é criada pelo admin (docs/decisions/hero-showcase.md, Etapa 3).
-- Reaplicar não sobrescreve edição do admin (on conflict do nothing).
insert into public.professionals (id, slug, name, specialty, registry_type, registry_number, registry_uf, bio, cities, online,
  status, registry_verified, approved_at, is_demo, sort_order)
values
  (public.seed_uuid('professional:nina-horta'), 'nina-horta', 'Nina Horta', 'nutritionist', 'CRN', '3-00001', 'SP',
   'Nutricionista focada em comida de verdade para quem treina: cardápios simples, marmitas da semana e ajustes para cada rotina.',
   '{"São Paulo"}', true, 'approved', true, now(), true, 10),
  (public.seed_uuid('professional:teo-folego'), 'teo-folego', 'Téo Fôlego', 'personal_trainer', 'CREF', '000001-G', 'RJ',
   'Personal trainer de corrida e força: planos curtos, progressão segura e acompanhamento online semana a semana.',
   '{"Rio de Janeiro"}', true, 'approved', true, now(), true, 20)
on conflict (id) do nothing;

insert into public.professional_services (id, professional_id, title, description, kind, mode, duration_minutes, plan_weeks, price_cents, sort_order)
select public.seed_uuid('professional_service:' || s.key), public.seed_uuid('professional:' || s.pro), s.title, s.description,
       s.kind, s.mode, s.minutes, s.weeks, s.price, s.sort
from (values
  ('nina-consulta', 'nina-horta', 'Consulta online de nutrição', 'Conversa de 60 minutos sobre rotina, objetivos e preferências, com orientações por escrito no fim.', 'session', 'online', 60, null::int, 18000, 10),
  ('nina-plano', 'nina-horta', 'Plano alimentar de 4 semanas', 'Cardápio montado para você, lista de compras semanal e um retorno por mensagem a cada semana.', 'plan', 'online', null::int, 4, 39000, 20),
  ('nina-retorno', 'nina-horta', 'Retorno de acompanhamento', 'Revisão de 30 minutos do plano e ajustes no cardápio.', 'session', 'online', 30, null::int, 9000, 30),
  ('teo-avaliacao', 'teo-folego', 'Avaliação física online', 'Teste de mobilidade, histórico de treino e metas, em 45 minutos por vídeo.', 'session', 'online', 45, null::int, 12000, 10),
  ('teo-plano', 'teo-folego', 'Plano de treino de 4 semanas', 'Treinos de força e corrida montados para a sua agenda, com ajustes semanais.', 'plan', 'online', null::int, 4, 29000, 20),
  ('teo-aula', 'teo-folego', 'Aula presencial de corrida', 'Uma hora de técnica de corrida e educativos, no Rio de Janeiro.', 'session', 'in_person', 60, null::int, 15000, 30)
) as s (key, pro, title, description, kind, mode, minutes, weeks, price, sort)
where exists (select 1 from public.professionals p where p.id = public.seed_uuid('professional:' || s.pro))
on conflict (id) do nothing;

-- sugeridos: Nina para o Jacquin e duas receitas dele; Téo para Neymar, João Fonseca e um programa de força
insert into public.professional_suggestions (id, professional_id, creator_id, content_id, program_id)
select public.seed_uuid('professional_suggestion:' || s.key), public.seed_uuid('professional:' || s.pro),
       (select cp.id from public.creator_profiles cp where cp.slug = s.hero),
       (select c.id from public.content c where c.slug = s.recipe),
       (select pg.id from public.programs pg where pg.slug = s.program)
from (values
  ('nina-jacquin', 'nina-horta', 'erick-jacquin', null, null),
  ('nina-bowl', 'nina-horta', null, 'bowl-de-frango-grelhado-com-legumes-assados-g1', null),
  ('nina-salmao', 'nina-horta', null, 'salmao-ao-forno-com-batata-doce-g5', null),
  ('teo-neymar', 'teo-folego', 'neymar', null, null),
  ('teo-fonseca', 'teo-folego', 'joao-fonseca', null, null),
  ('teo-forca', 'teo-folego', null, null, 'base-de-forca-4-semanas')
) as s (key, pro, hero, recipe, program)
where exists (select 1 from public.professionals p where p.id = public.seed_uuid('professional:' || s.pro))
  and num_nonnulls((select cp.id from public.creator_profiles cp where cp.slug = s.hero),
                   (select c.id from public.content c where c.slug = s.recipe),
                   (select pg.id from public.programs pg where pg.slug = s.program)) = 1
on conflict do nothing;

-- O PostgREST passa a enxergar as tabelas e funções novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
