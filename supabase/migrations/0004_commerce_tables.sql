-- =============================================================================
-- Ultra Hero · 0004 · Comércio demonstrativo: tabelas (catálogo, moderação, vínculos,
-- carrinho, destinos fictícios, pedidos de teste). 100% simulado.
-- =============================================================================

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name jsonb not null,                 -- {"pt-BR":..,"en":..,"es":..}
  kind text not null check (kind in ('meal', 'ingredient_kit', 'training_accessory', 'lifestyle')),
  is_food boolean not null default false,
  sort_order int not null default 100
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_org_id uuid not null references public.seller_organizations (id) on delete restrict,
  category_id uuid not null references public.product_categories (id) on delete restrict,
  slug text not null unique,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) >= 10),
  image_url text not null,
  price_cents_demo int not null check (price_cents_demo >= 0),
  product_type text not null check (product_type in ('physical', 'kit', 'digital')),
  attributes jsonb not null default '{}'::jsonb,
  food_info jsonb,                     -- {"ingredients":[],"allergens":[],"storage":"..."} para alimentos
  status public.product_status not null default 'draft',
  availability public.availability not null default 'available',
  moderation_status public.moderation_status not null default 'clear',
  moderation_reason text,
  demo_stock int check (demo_stock is null or demo_stock >= 0),
  version int not null default 1,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce(description, ''))), 'B')
  ) stored
);
create index products_seller_idx on public.products (seller_org_id);
create index products_catalog_idx on public.products (status, moderation_status, availability) where status = 'published';
create index products_search_idx on public.products using gin (search);
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- Histórico de versões do produto (antes/depois) — base para auditoria e suspensão de vínculos.
create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  changed_fields text[] not null default '{}',
  significant boolean not null default false,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, version)
);

create table public.product_moderation (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  action text not null check (action in ('hide', 'suspend', 'clear')),
  reason text,
  admin_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Vínculo conteúdo–produto com estado próprio; só admin valida.
create table public.content_product_links (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status public.link_status not null default 'suggested',
  suggested_by uuid references auth.users (id) on delete set null,
  suggested_by_creator uuid references public.creator_profiles (id) on delete set null,
  note text,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  product_version_at_validation int,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, product_id)
);
create trigger trg_cpl_updated before update on public.content_product_links
  for each row execute function public.set_updated_at();

-- Produto "regular" para compra de teste.
create or replace function public.product_is_purchasable(p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p join public.seller_organizations o on o.id = p.seller_org_id
    where p.id = p_product and p.status = 'published' and p.availability = 'available'
      and p.moderation_status = 'clear' and o.status = 'active'
      and (p.demo_stock is null or p.demo_stock > 0))
$$;

-- Versionamento + suspensão automática de vínculos em mudança significativa.
create or replace function public.products_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_changed text[] := '{}'; v_significant boolean := false;
begin
  if old.title is distinct from new.title then v_changed := array_append(v_changed, 'title'); v_significant := true; end if;
  if old.category_id is distinct from new.category_id then v_changed := array_append(v_changed, 'category_id'); v_significant := true; end if;
  if old.product_type is distinct from new.product_type then v_changed := array_append(v_changed, 'product_type'); v_significant := true; end if;
  if old.attributes is distinct from new.attributes then v_changed := array_append(v_changed, 'attributes'); v_significant := true; end if;
  if old.food_info is distinct from new.food_info then v_changed := array_append(v_changed, 'food_info'); v_significant := true; end if;
  if old.description is distinct from new.description then v_changed := array_append(v_changed, 'description'); end if;
  if old.image_url is distinct from new.image_url then v_changed := array_append(v_changed, 'image_url'); end if;
  if old.price_cents_demo is distinct from new.price_cents_demo then v_changed := array_append(v_changed, 'price_cents_demo'); end if;
  if old.availability is distinct from new.availability then v_changed := array_append(v_changed, 'availability'); end if;
  if old.status is distinct from new.status then v_changed := array_append(v_changed, 'status'); end if;
  if old.demo_stock is distinct from new.demo_stock then v_changed := array_append(v_changed, 'demo_stock'); end if;

  -- fornecedor não reativa produto suspenso/oculto pelo admin
  if old.moderation_status is distinct from new.moderation_status and not public.is_admin() then
    new.moderation_status := old.moderation_status;
    new.moderation_reason := old.moderation_reason;
  end if;

  if cardinality(v_changed) = 0 then return new; end if;

  new.version := old.version + 1;
  insert into public.product_versions (product_id, version, snapshot, changed_fields, significant, changed_by)
  values (old.id, old.version, to_jsonb(old) - 'search', v_changed, v_significant, auth.uid());

  if v_significant then
    update public.content_product_links
    set status = 'suspended', suspended_reason = 'product_significant_change:' || array_to_string(v_changed, ',')
    where product_id = old.id and status = 'validated';
  end if;

  -- preço/disponibilidade: auditados, não invalidam vínculo
  if v_changed && array['price_cents_demo', 'availability'] then
    insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
    values (auth.uid(), (case when public.is_admin() then 'admin' else 'seller' end)::public.actor_type, 'product.update', 'product', old.id::text,
      jsonb_build_object('price_cents_demo', old.price_cents_demo, 'availability', old.availability),
      jsonb_build_object('price_cents_demo', new.price_cents_demo, 'availability', new.availability));
  end if;
  return new;
end $$;
create trigger trg_products_before_update before update on public.products
  for each row execute function public.products_before_update();

-- Validação mínima para publicar (fornecedor publica direto; moderação é posterior).
create or replace function public.products_validate_publish()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    if new.image_url is null or new.image_url = '' then raise exception 'product_requires_image'; end if;
    if exists (select 1 from public.product_categories c where c.id = new.category_id and c.is_food)
       and (new.food_info is null or not (new.food_info ? 'ingredients') or not (new.food_info ? 'allergens') or not (new.food_info ? 'storage')) then
      raise exception 'food_product_requires_food_info';
    end if;
    if new.published_at is null then new.published_at := now(); end if;
  end if;
  if new.status = 'archived' and new.archived_at is null then new.archived_at := now(); end if;
  return new;
end $$;
create trigger trg_products_validate before insert or update on public.products
  for each row execute function public.products_validate_publish();

-- Moderação administrativa (ocultar/suspender/liberar) com auditoria.
create or replace function public.admin_moderate_product(p_product uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_status public.moderation_status;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_status := case p_action when 'hide' then 'hidden' when 'suspend' then 'suspended' when 'clear' then 'clear' else null end;
  if v_status is null then raise exception 'invalid_action'; end if;
  select jsonb_build_object('moderation_status', moderation_status, 'moderation_reason', moderation_reason) into v_before from public.products where id = p_product;
  update public.products set moderation_status = v_status, moderation_reason = case when v_status = 'clear' then null else p_reason end where id = p_product;
  insert into public.product_moderation (product_id, action, reason, admin_id) values (p_product, p_action, p_reason, auth.uid());
  perform public.audit_log('product.moderate', 'product', p_product::text, v_before, jsonb_build_object('moderation_status', v_status), p_reason);
end $$;

create or replace function public.admin_set_link_status(p_link uuid, p_status public.link_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_version int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(l) into v_before from public.content_product_links l where id = p_link;
  if v_before is null then raise exception 'link_not_found'; end if;
  select version into v_version from public.products where id = (v_before ->> 'product_id')::uuid;
  update public.content_product_links
  set status = p_status, note = coalesce(p_note, note),
      validated_by = case when p_status = 'validated' then auth.uid() else validated_by end,
      validated_at = case when p_status = 'validated' then now() else validated_at end,
      product_version_at_validation = case when p_status = 'validated' then v_version else product_version_at_validation end,
      suspended_reason = case when p_status = 'suspended' then coalesce(p_note, 'admin') else null end
  where id = p_link;
  perform public.audit_log('link.set_status', 'content_product_link', p_link::text, v_before, jsonb_build_object('status', p_status), p_note);
end $$;

-- ---------------------------------------------------------------- carrinho ---
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity int not null check (quantity between 1 and 20),
  added_at timestamptz not null default now(),
  primary key (cart_id, product_id)
);

-- Destinos fictícios predefinidos (nunca endereço real nem geolocalização).
create table public.demo_destinations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name jsonb not null,
  zone text not null check (zone in ('local', 'regional', 'national')),
  description jsonb,
  sort_order int not null default 100,
  is_active boolean not null default true
);

-- Regras de frete mock (por zona). Valores demonstrativos.
create table public.demo_shipping_rules (
  zone text primary key,
  base_cents int not null check (base_cents >= 0),
  per_seller_cents int not null default 0 check (per_seller_cents >= 0),
  eta_days_min int not null default 1,
  eta_days_max int not null default 5,
  free_over_cents int
);

-- ---------------------------------------------------------------- pedidos ----
create table public.test_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  destination_snapshot jsonb not null,
  subtotal_cents int not null check (subtotal_cents >= 0),
  shipping_cents int not null check (shipping_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  status public.order_status not null default 'confirmed',
  is_demo boolean not null default true check (is_demo),
  confirmed_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_expires_at timestamptz not null default now() + interval '90 days',
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index test_orders_user_idx on public.test_orders (user_id, created_at desc);
create index test_orders_retention_idx on public.test_orders (retention_expires_at) where anonymized_at is null;
create trigger trg_test_orders_updated before update on public.test_orders
  for each row execute function public.set_updated_at();

create table public.test_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.test_orders (id) on delete cascade,
  seller_org_id uuid not null references public.seller_organizations (id) on delete restrict,
  seller_name_snapshot text not null,
  status public.fulfillment_status not null default 'awaiting',
  shipping_cents_snapshot int not null default 0,
  destination_zone text not null,
  eta_days int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_org_id)
);
create index test_fulfillments_seller_idx on public.test_fulfillments (seller_org_id, created_at desc);
create trigger trg_test_fulfillments_updated before update on public.test_fulfillments
  for each row execute function public.set_updated_at();

create table public.test_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.test_orders (id) on delete cascade,
  fulfillment_id uuid not null references public.test_fulfillments (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  seller_org_id uuid not null references public.seller_organizations (id) on delete restrict,
  title_snapshot text not null,
  image_snapshot text,
  price_cents_snapshot int not null check (price_cents_snapshot >= 0),
  quantity int not null check (quantity > 0),
  product_version_snapshot int
);
create index test_order_items_order_idx on public.test_order_items (order_id);
create index test_order_items_seller_idx on public.test_order_items (seller_org_id);

create table public.fulfillment_events (
  id bigint generated always as identity primary key,
  fulfillment_id uuid not null references public.test_fulfillments (id) on delete cascade,
  from_status public.fulfillment_status,
  to_status public.fulfillment_status not null,
  actor_type public.actor_type not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index fulfillment_events_f_idx on public.fulfillment_events (fulfillment_id, created_at);

-- Interesse comercial (métrica distinta de pedido de teste e de receita).
create table public.product_interest (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  product_id uuid not null references public.products (id) on delete cascade,
  source text not null check (source in ('content_link', 'catalog', 'recommendation', 'search')),
  created_at timestamptz not null default now()
);
