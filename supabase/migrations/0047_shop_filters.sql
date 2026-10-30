-- =============================================================================
-- Ultra Hero · 0047 · Filtros da aba Comprar (configuráveis pelo admin)
--   A loja (/shop) ganha uma linha de chips no topo: "Tudo" (fixo, só no app) + os filtros
--   desta tabela, na ordem definida pelo admin. Cada filtro mostra os produtos de QUALQUER uma
--   das categorias ligadas (shop_filter_categories) OU os escolhidos à mão (shop_filter_products).
--   A visibilidade do produto não muda: continua a da loja (publicado, sem moderação, fornecedor
--   ativo, pela RLS de products). Filtro sem produto visível fica escondido pelo app.
--
-- Rótulos: jsonb {"pt-BR","en","es"}, como product_categories.name.
-- Leitura pública: políticas simples de SELECT (só filtros ativos e os vínculos deles) para
--   anon e authenticated; escrita só do admin, pela RLS com (select is_admin()).
-- Auditoria: gatilho security definer grava em admin_audit cada insert/update/delete feito por
--   admin (sem execute para ninguém: a lista do S14 continua com 17 funções para o visitante).
-- Seed: Suplementos → categoria supplement; Alimentação → meal + ingredient_kit; Tênis, Surf e
--   Futebol sem categoria equivalente (ficam escondidos até o admin ligar produtos).
-- Regras: nada de drop de tabela; search_path fixo; grants explícitos; RLS ligada; idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabelas
create table if not exists public.shop_filters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40 and slug <> 'tudo'),
  name jsonb not null
    check (jsonb_typeof(name) = 'object' and char_length(btrim(coalesce(name ->> 'pt-BR', ''))) between 1 and 40),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_filters_order_idx on public.shop_filters (sort_order, slug);

drop trigger if exists trg_shop_filters_updated on public.shop_filters;
create trigger trg_shop_filters_updated before update on public.shop_filters
  for each row execute function public.set_updated_at();

create table if not exists public.shop_filter_categories (
  filter_id uuid not null references public.shop_filters (id) on delete cascade,
  category_id uuid not null references public.product_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (filter_id, category_id)
);
create index if not exists shop_filter_categories_category_idx on public.shop_filter_categories (category_id);

create table if not exists public.shop_filter_products (
  filter_id uuid not null references public.shop_filters (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (filter_id, product_id)
);
create index if not exists shop_filter_products_product_idx on public.shop_filter_products (product_id);

-- ---------------------------------------------------------------- 2) grants
revoke all on table public.shop_filters, public.shop_filter_categories, public.shop_filter_products from public, anon, authenticated;
grant select on table public.shop_filters, public.shop_filter_categories, public.shop_filter_products to anon;
grant select, insert, update, delete on table public.shop_filters, public.shop_filter_categories, public.shop_filter_products to authenticated;
grant all on table public.shop_filters, public.shop_filter_categories, public.shop_filter_products to service_role;

-- ---------------------------------------------------------------- 3) RLS
alter table public.shop_filters enable row level security;
alter table public.shop_filter_categories enable row level security;
alter table public.shop_filter_products enable row level security;

-- leitura pública: só filtros ativos (o admin vê todos pela política de escrita, que é FOR ALL)
drop policy if exists shop_filters_select_active on public.shop_filters;
create policy shop_filters_select_active on public.shop_filters for select to anon, authenticated
  using (is_active);
drop policy if exists shop_filters_admin on public.shop_filters;
create policy shop_filters_admin on public.shop_filters for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists shop_filter_categories_select_active on public.shop_filter_categories;
create policy shop_filter_categories_select_active on public.shop_filter_categories for select to anon, authenticated
  using (exists (select 1 from public.shop_filters f where f.id = shop_filter_categories.filter_id and f.is_active));
drop policy if exists shop_filter_categories_admin on public.shop_filter_categories;
create policy shop_filter_categories_admin on public.shop_filter_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists shop_filter_products_select_active on public.shop_filter_products;
create policy shop_filter_products_select_active on public.shop_filter_products for select to anon, authenticated
  using (exists (select 1 from public.shop_filters f where f.id = shop_filter_products.filter_id and f.is_active));
drop policy if exists shop_filter_products_admin on public.shop_filter_products;
create policy shop_filter_products_admin on public.shop_filter_products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------- 4) auditoria das mudanças do admin
-- resource_id é sempre o id do filtro (os vínculos não têm id próprio), para a trilha ficar junta.
create or replace function public.shop_filters_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  -- via jsonb: as três tabelas têm colunas diferentes (new.id não existe nos vínculos)
  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', tg_table_name || '.' || lower(tg_op), 'shop_filter',
          case when tg_table_name = 'shop_filters' then v_row ->> 'id' else v_row ->> 'filter_id' end,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.shop_filters_audit() from public, anon, authenticated;
grant execute on function public.shop_filters_audit() to service_role;

drop trigger if exists trg_audit_shop_filters on public.shop_filters;
create trigger trg_audit_shop_filters after insert or update or delete on public.shop_filters
  for each row execute function public.shop_filters_audit();
drop trigger if exists trg_audit_shop_filter_categories on public.shop_filter_categories;
create trigger trg_audit_shop_filter_categories after insert or delete on public.shop_filter_categories
  for each row execute function public.shop_filters_audit();
drop trigger if exists trg_audit_shop_filter_products on public.shop_filter_products;
create trigger trg_audit_shop_filter_products after insert or delete on public.shop_filter_products
  for each row execute function public.shop_filters_audit();

-- ---------------------------------------------------------------- 5) seed (não sobrescreve edição do admin)
insert into public.shop_filters (id, slug, name, sort_order) values
  (public.seed_uuid('shopfilter:suplementos'), 'suplementos', '{"pt-BR":"Suplementos","en":"Supplements","es":"Suplementos"}', 10),
  (public.seed_uuid('shopfilter:alimentacao'), 'alimentacao', '{"pt-BR":"Alimentação","en":"Food","es":"Alimentación"}', 20),
  (public.seed_uuid('shopfilter:tenis'), 'tenis', '{"pt-BR":"Tênis","en":"Tennis","es":"Tenis"}', 30),
  (public.seed_uuid('shopfilter:surf'), 'surf', '{"pt-BR":"Surf","en":"Surf","es":"Surf"}', 40),
  (public.seed_uuid('shopfilter:futebol'), 'futebol', '{"pt-BR":"Futebol","en":"Football","es":"Fútbol"}', 50)
on conflict do nothing;

-- só liga as categorias quando o filtro é o do seed (o slug pode ter sido reaproveitado pelo admin)
insert into public.shop_filter_categories (filter_id, category_id)
select f.id, c.id
from (values ('suplementos', 'supplement'), ('alimentacao', 'meal'), ('alimentacao', 'ingredient_kit')) as m (slug, code)
join public.shop_filters f on f.slug = m.slug and f.id = public.seed_uuid('shopfilter:' || m.slug)
join public.product_categories c on c.code = m.code
on conflict do nothing;

-- O PostgREST passa a enxergar as tabelas novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
