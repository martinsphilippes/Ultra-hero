-- =============================================================================
-- Ultra Hero · 0027 · Receitas estruturadas (fase 1 do módulo de receitas)
--   A receita continua sendo um content (type = 'recipe'); o que era JSON livre em content_bodies.body
--   passa a ter tabelas próprias (detalhes, ingredientes, etapas, mídia, nutrição, versões), com
--   escrita só por RPC e leitura pela RLS. Desenho: docs/decisions/recipes-module.md (seção 3).
--   Decisões do responsável refletidas aqui: revisão de receitas desligada por padrão (o admin liga
--   por tipo, auditado); bloqueio da etapa demonstrativa no banco (can_access_content); contas demo
--   sem regra especial de upload, só a cota diária por herói (na 0028).
-- Ordem: 1) tabelas e índices · 2) grants e RLS · 3) configurações · 4) gatilhos e guardas ·
--        5) redefinições de funções existentes · 6) RPCs novas · 7) leitura pública (catálogo).
-- Regras: nada de drop/truncate; create ... if not exists; políticas com (select ...); toda função
-- com search_path fixo; security definer só nas RPCs e gatilhos listados, sempre sem execute para
-- anon (nenhuma entra na lista pública do S14); colunas protegidas só mudam com app.trusted.
-- =============================================================================

-- ================================================================ 1) tabelas e índices

-- ---------------------------------------------------------------- categorias (só o admin escreve)
create table if not exists public.recipe_categories (
  code text primary key check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) <= 40),
  name jsonb not null check (jsonb_typeof(name) = 'object' and name ? 'pt-BR'),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- taxonomia aprovada pelo responsável (P5); o admin ajusta depois por admin_upsert_recipe_category
insert into public.recipe_categories (code, name, sort_order) values
  ('cafe-da-manha', '{"pt-BR":"Café da manhã","en":"Breakfast","es":"Desayuno"}', 10),
  ('almoco', '{"pt-BR":"Almoço","en":"Lunch","es":"Almuerzo"}', 20),
  ('jantar', '{"pt-BR":"Jantar","en":"Dinner","es":"Cena"}', 30),
  ('lanche', '{"pt-BR":"Lanche","en":"Snack","es":"Merienda"}', 40),
  ('sobremesa', '{"pt-BR":"Sobremesa","en":"Dessert","es":"Postre"}', 50),
  ('molhos-e-bases', '{"pt-BR":"Molhos e bases","en":"Sauces and basics","es":"Salsas y bases"}', 60),
  ('marmitas', '{"pt-BR":"Marmitas","en":"Meal prep","es":"Viandas"}', 70),
  ('sopas', '{"pt-BR":"Sopas","en":"Soups","es":"Sopas"}', 80),
  ('saladas', '{"pt-BR":"Saladas","en":"Salads","es":"Ensaladas"}', 90),
  ('bebidas', '{"pt-BR":"Bebidas","en":"Drinks","es":"Bebidas"}', 100)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- mídia (antes, por causa das FKs compostas)
-- mime e bytes vêm de storage.objects.metadata (recipe_register_media), nunca do cliente.
create table if not exists public.recipe_media (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  role text not null check (role in ('gallery', 'step')),
  position smallint not null default 1 check (position between 1 and 40),
  storage_path text not null unique check (storage_path ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes between 1 and 5242880),
  width smallint check (width between 1 and 8000),     -- só dica de layout
  height smallint check (height between 1 and 8000),
  alt_text text check (length(alt_text) <= 200),
  caption text check (length(caption) <= 200),
  rights_confirmed_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_media_id_content_uq unique (id, content_id)
);
create index if not exists recipe_media_content_idx on public.recipe_media (content_id, role, position);
create index if not exists recipe_media_creator_idx on public.recipe_media (creator_id);
create index if not exists recipe_media_created_by_idx on public.recipe_media (created_by) where created_by is not null;

-- ---------------------------------------------------------------- detalhes 1:1 (metadados públicos do card e do filtro)
create table if not exists public.recipe_details (
  content_id uuid primary key references public.content (id) on delete cascade,
  servings smallint check (servings between 1 and 100),
  yield_text text check (length(yield_text) <= 60),
  prep_minutes smallint check (prep_minutes between 0 and 1440),
  cook_minutes smallint check (cook_minutes between 0 and 1440),
  rest_minutes smallint check (rest_minutes between 0 and 2880),
  total_minutes smallint check (total_minutes between 1 and 4320),
  -- total >= prep + cook + rest é exigido para publicar (recipe_assert_publishable, código 'times'),
  -- não como check: o backfill copia os tempos atuais sem corrigir (P5)
  story text check (length(story) <= 4000),
  diets text[] not null default '{}' check (diets <@ array['vegetarian', 'vegan', 'pescatarian', 'lactose_free', 'gluten_free', 'low_sugar', 'low_sodium']::text[]),
  allergens text[] not null default '{}' check (allergens <@ array['peanut', 'tree_nuts', 'milk', 'egg', 'wheat', 'soy', 'fish', 'shellfish', 'sesame']::text[]),
  allergens_declared boolean not null default false,   -- false = "não informado"; true + '{}' = "nenhum"
  allergen_notes text check (length(allergen_notes) <= 300),
  cover_media_id uuid,
  rating_count int not null default 0 check (rating_count >= 0),   -- sem contas demo
  rating_sum int not null default 0 check (rating_sum >= 0),
  schema_version smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_details_allergens_ck check (allergens_declared or cardinality(allergens) = 0),
  constraint recipe_details_cover_fk foreign key (cover_media_id, content_id)
    references public.recipe_media (id, content_id) on delete set null (cover_media_id)
);
create index if not exists recipe_details_diets_idx on public.recipe_details using gin (diets);
create index if not exists recipe_details_allergens_idx on public.recipe_details using gin (allergens);
create index if not exists recipe_details_total_idx on public.recipe_details (total_minutes, content_id);
-- FK composta (cover_media_id, content_id): índice com o mesmo prefixo, para o advisor
-- unindexed_foreign_keys e para o set null quando a mídia sai
create index if not exists recipe_details_cover_content_idx on public.recipe_details (cover_media_id, content_id) where cover_media_id is not null;

-- ---------------------------------------------------------------- protegido 1:1 (só com acesso): nota do chef e termos de busca
create table if not exists public.recipe_extras (
  content_id uuid primary key references public.content (id) on delete cascade,
  chef_note text check (length(chef_note) <= 600),
  ingredient_terms tsvector,   -- nomes de ingredientes e substituições
  updated_at timestamptz not null default now()
);
create index if not exists recipe_extras_terms_idx on public.recipe_extras using gin (ingredient_terms);

create table if not exists public.recipe_category_links (
  content_id uuid not null references public.content (id) on delete cascade,
  category_code text not null references public.recipe_categories (code) on update cascade,
  primary key (content_id, category_code)
);
create index if not exists recipe_category_links_cat_idx on public.recipe_category_links (category_code);

-- ---------------------------------------------------------------- ingredientes
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),   -- vem do cliente (crypto.randomUUID)
  content_id uuid not null references public.content (id) on delete cascade,
  position smallint not null check (position between 1 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  quantity numeric(10,3) check (quantity > 0 and quantity <= 100000),
  unit text check (unit in ('g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit', 'clove', 'bunch', 'sprig', 'fillet', 'slice', 'leaf', 'pinch', 'can', 'package')),
  quantity_text text check (length(quantity_text) <= 60),   -- não deu para separar: não recalcula
  to_taste boolean not null default false,
  optional boolean not null default false,
  note text check (length(note) <= 200),
  substitutions jsonb not null default '[]'
    check (jsonb_typeof(substitutions) = 'array' and jsonb_array_length(substitutions) <= 5),
  source_qty text,   -- texto original do backfill
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_ingredients_qty_ck check (
    (to_taste and quantity is null and unit is null and quantity_text is null)
    or (not to_taste and quantity is not null and quantity_text is null)
    or (not to_taste and quantity is null and unit is null)),
  constraint recipe_ingredients_pos_uq unique (content_id, position) deferrable initially deferred,
  constraint recipe_ingredients_id_content_uq unique (id, content_id)
);

-- ---------------------------------------------------------------- etapas
create table if not exists public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  position smallint not null check (position between 1 and 40),
  instruction text not null check (length(btrim(instruction)) between 1 and 1200),
  duration_seconds int check (duration_seconds between 1 and 86400),
  temperature_c smallint check (temperature_c between -30 and 320),
  tip text check (length(tip) <= 400),
  image_media_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_steps_pos_uq unique (content_id, position) deferrable initially deferred,
  constraint recipe_steps_id_content_uq unique (id, content_id),
  constraint recipe_steps_image_fk foreign key (image_media_id, content_id)
    references public.recipe_media (id, content_id) on delete set null (image_media_id)
);
create index if not exists recipe_steps_image_content_idx on public.recipe_steps (image_media_id, content_id) where image_media_id is not null;

create table if not exists public.recipe_step_ingredients (   -- Modo Cozinha
  content_id uuid not null,
  step_id uuid not null,
  ingredient_id uuid not null,
  primary key (step_id, ingredient_id),
  constraint recipe_step_ingredients_step_fk foreign key (step_id, content_id) references public.recipe_steps (id, content_id) on delete cascade,
  constraint recipe_step_ingredients_ingredient_fk foreign key (ingredient_id, content_id) references public.recipe_ingredients (id, content_id) on delete cascade
);
create index if not exists recipe_step_ingredients_content_idx on public.recipe_step_ingredients (content_id);
create index if not exists recipe_step_ingredients_ingredient_idx on public.recipe_step_ingredients (ingredient_id);
-- as FKs compostas apontam para (id, content_id): índices pelas colunas na ordem da FK
create index if not exists recipe_step_ingredients_step_content_idx on public.recipe_step_ingredients (step_id, content_id);
create index if not exists recipe_step_ingredients_ingredient_content_idx on public.recipe_step_ingredients (ingredient_id, content_id);

-- ---------------------------------------------------------------- nutrição
create table if not exists public.recipe_nutrition (
  content_id uuid primary key references public.content (id) on delete cascade,
  kcal numeric(8,1) check (kcal between 0 and 100000),
  protein_g numeric(8,1) check (protein_g between 0 and 100000),
  carbs_g numeric(8,1) check (carbs_g between 0 and 100000),
  fat_g numeric(8,1) check (fat_g between 0 and 100000),
  fiber_g numeric(8,1) check (fiber_g between 0 and 100000),
  sodium_mg numeric(8,1) check (sodium_mg between 0 and 100000),
  source text not null default 'chef' check (source in ('chef', 'nutritionist', 'food_table', 'lab')),
  source_note text check (length(source_note) <= 200),
  validated boolean not null default false,
  validated_by text check (length(validated_by) <= 120),
  validated_at date,
  validation_note text check (length(validation_note) <= 300),
  validated_by_user uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint recipe_nutrition_validated_ck check (not validated or (validated_by is not null and validated_at is not null))
);
create index if not exists recipe_nutrition_validator_idx on public.recipe_nutrition (validated_by_user) where validated_by_user is not null;

-- ---------------------------------------------------------------- versões (snapshot imutável)
create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  version_no int not null check (version_no >= 1),
  reason text not null check (reason in ('submit', 'publish', 'schedule', 'admin_publish', 'admin_edit', 'restore_point')),
  snapshot jsonb not null,   -- {content, details, extras, categories, ingredients, steps, step_ingredients, media, nutrition, video} ou {legacy_body}
  snapshot_hash text not null,
  changed_sections text[] not null default '{}',   -- seções diferentes da versão anterior ("alterações")
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recipe_versions_content_no_uq unique (content_id, version_no)
);
create index if not exists recipe_versions_created_by_idx on public.recipe_versions (created_by) where created_by is not null;

alter table public.content_reviews add column if not exists requested_publish_at timestamptz;
alter table public.content_reviews add column if not exists version_id uuid references public.recipe_versions (id) on delete set null;
create index if not exists content_reviews_version_idx on public.content_reviews (version_id) where version_id is not null;
-- quem arquivou: o herói restaura só o que ele arquivou (coluna protegida pela guarda de colunas)
alter table public.content add column if not exists archived_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_archived_by_check') then
    alter table public.content add constraint content_archived_by_check check (archived_by is null or archived_by in ('admin', 'creator'));
  end if;
end $$;
create index if not exists content_recipe_live_idx on public.content (published_at desc, id)
  where type = 'recipe' and status = 'published';

-- ---------------------------------------------------------------- regra de revisão por tipo (desligada em todos)
alter table public.content_type_settings add column if not exists review_required boolean not null default false;

-- ---------------------------------------------------------------- avaliações (ligadas) e comentários (modelados, desligados)
create table if not exists public.recipe_ratings (
  content_id uuid not null references public.content (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  is_demo boolean not null default false,   -- preenchido pelo gatilho (app_metadata.ultra_hero_demo); fora do grant
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (content_id, user_id)
);
create index if not exists recipe_ratings_user_idx on public.recipe_ratings (user_id);

create table if not exists public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,   -- texto livre: sai com a conta
  body text not null check (length(btrim(body)) between 2 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  moderation_reason text check (length(moderation_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipe_comments_queue_idx on public.recipe_comments (status, created_at) where status = 'pending';
create index if not exists recipe_comments_content_idx on public.recipe_comments (content_id, created_at desc) where status = 'approved';
create index if not exists recipe_comments_content_fk_idx on public.recipe_comments (content_id);
create index if not exists recipe_comments_user_idx on public.recipe_comments (user_id);
create index if not exists recipe_comments_moderator_idx on public.recipe_comments (moderated_by) where moderated_by is not null;

-- ---------------------------------------------------------------- ingrediente ↔ produto (modelado; tela e fila na fase 5)
create table if not exists public.recipe_ingredient_products (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  ingredient_id uuid not null,
  product_id uuid not null references public.products (id) on delete cascade,
  status public.link_status not null default 'suggested',
  note text check (length(note) <= 200),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  product_version_at_validation int,
  suspended_reason text check (length(suspended_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_ingredient_products_ingredient_fk foreign key (ingredient_id, content_id)
    references public.recipe_ingredients (id, content_id) on delete cascade,
  constraint recipe_ingredient_products_uq unique (ingredient_id, product_id)
);
create unique index if not exists recipe_ingredient_products_one_validated
  on public.recipe_ingredient_products (ingredient_id) where status = 'validated';
create index if not exists recipe_ingredient_products_product_idx on public.recipe_ingredient_products (product_id);
create index if not exists recipe_ingredient_products_content_idx on public.recipe_ingredient_products (content_id);
create index if not exists recipe_ingredient_products_ingredient_content_idx on public.recipe_ingredient_products (ingredient_id, content_id);
create index if not exists recipe_ingredient_products_validator_idx on public.recipe_ingredient_products (validated_by) where validated_by is not null;
-- nenhum vínculo é semeado por migração

-- ---------------------------------------------------------------- lista de compras pessoal
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  ingredient_id uuid references public.recipe_ingredients (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  quantity numeric(10,3) check (quantity > 0),
  unit text check (unit in ('g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit', 'clove', 'bunch', 'sprig', 'fillet', 'slice', 'leaf', 'pinch', 'can', 'package')),
  quantity_text text check (length(quantity_text) <= 60),
  product_id uuid references public.products (id) on delete set null,   -- só pelo gatilho, a partir do vínculo validado
  checked boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- constraint (e não índice parcial) para o upsert do PostgREST; NULLs são distintos, então itens
  -- avulsos (sem ingrediente) não colidem
  constraint shopping_list_items_ingredient_uq unique (user_id, ingredient_id)
);
create index if not exists shopping_list_items_user_idx on public.shopping_list_items (user_id, content_id, position);
create index if not exists shopping_list_items_ingredient_idx on public.shopping_list_items (ingredient_id) where ingredient_id is not null;
create index if not exists shopping_list_items_content_idx on public.shopping_list_items (content_id) where content_id is not null;
create index if not exists shopping_list_items_product_idx on public.shopping_list_items (product_id) where product_id is not null;

-- ---------------------------------------------------------------- histórico (opt-in) e preferência
create table if not exists public.user_recipe_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  history_enabled boolean not null default false,
  history_enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.recipe_view_history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  viewed_at timestamptz not null default now(),   -- último acesso; nada mais é guardado
  primary key (user_id, content_id)
);
create index if not exists recipe_view_history_recent_idx on public.recipe_view_history (user_id, viewed_at desc);
create index if not exists recipe_view_history_retention_idx on public.recipe_view_history (viewed_at);
create index if not exists recipe_view_history_content_idx on public.recipe_view_history (content_id);

-- ---------------------------------------------------------------- chef: especialidades e credenciais (P7)
alter table public.creator_profiles add column if not exists specialties text[] not null default '{}';
alter table public.creator_profiles add column if not exists credentials text;
alter table public.creator_profiles add column if not exists credentials_approved_at timestamptz;   -- protegida: só o admin (RPC)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creator_profiles_specialties_check') then
    alter table public.creator_profiles add constraint creator_profiles_specialties_check check (cardinality(specialties) <= 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'creator_profiles_credentials_check') then
    alter table public.creator_profiles add constraint creator_profiles_credentials_check check (credentials is null or length(credentials) <= 300);
  end if;
  -- foto de receita nunca vira avatar ou capa do perfil (o proxy serviria a mídia fora da receita)
  if not exists (select 1 from pg_constraint where conname = 'creator_profiles_media_prefix_ck') then
    alter table public.creator_profiles add constraint creator_profiles_media_prefix_ck
      check (coalesce(avatar_url, '') not like '/media/recipe/%' and coalesce(cover_url, '') not like '/media/recipe/%') not valid;
    alter table public.creator_profiles validate constraint creator_profiles_media_prefix_ck;
  end if;
end $$;

-- ---------------------------------------------------------------- updated_at
create or replace trigger trg_recipe_categories_updated before update on public.recipe_categories for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_media_updated before update on public.recipe_media for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_details_updated before update on public.recipe_details for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_extras_updated before update on public.recipe_extras for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_ingredients_updated before update on public.recipe_ingredients for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_steps_updated before update on public.recipe_steps for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_nutrition_updated before update on public.recipe_nutrition for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_ratings_updated before update on public.recipe_ratings for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_comments_updated before update on public.recipe_comments for each row execute function public.set_updated_at();
create or replace trigger trg_recipe_ingredient_products_updated before update on public.recipe_ingredient_products for each row execute function public.set_updated_at();
create or replace trigger trg_shopping_list_items_updated before update on public.shopping_list_items for each row execute function public.set_updated_at();
create or replace trigger trg_user_recipe_prefs_updated before update on public.user_recipe_prefs for each row execute function public.set_updated_at();

-- ================================================================ 2) grants e RLS
-- Toda tabela nova nasce sem nada para public/anon/authenticated (o Supabase concede ALL por padrão);
-- depois o mínimo, por coluna onde indicado. Escrita nas tabelas da receita: só por RPC.
do $$ declare t text;
begin
  foreach t in array array['recipe_categories', 'recipe_media', 'recipe_details', 'recipe_extras', 'recipe_category_links',
                           'recipe_ingredients', 'recipe_steps', 'recipe_step_ingredients', 'recipe_nutrition', 'recipe_versions',
                           'recipe_ratings', 'recipe_comments', 'recipe_ingredient_products', 'shopping_list_items',
                           'user_recipe_prefs', 'recipe_view_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- leitura pública (card e filtro): categorias, detalhes, vínculos de categoria e galeria
grant select on table public.recipe_categories, public.recipe_details, public.recipe_category_links, public.recipe_media to anon, authenticated;
-- protegidas: só com acesso (A(c)) ou do dono/admin
grant select on table public.recipe_extras, public.recipe_ingredients, public.recipe_steps, public.recipe_step_ingredients,
  public.recipe_nutrition, public.recipe_versions, public.recipe_ingredient_products to authenticated;
-- avaliações: a pessoa só escolhe a receita e as estrelas (user_id e is_demo vêm do banco)
grant select, delete on table public.recipe_ratings to authenticated;
grant insert (content_id, stars) on table public.recipe_ratings to authenticated;
grant update (stars) on table public.recipe_ratings to authenticated;
-- comentários: o autor nunca aparece ao público (sem user_id no grant)
grant select (id, content_id, body, created_at) on table public.recipe_comments to anon;
grant select (id, content_id, body, created_at, status) on table public.recipe_comments to authenticated;
grant insert (content_id, body) on table public.recipe_comments to authenticated;
grant delete on table public.recipe_comments to authenticated;
-- lista de compras: product_id fica fora (o gatilho preenche a partir do vínculo validado)
grant select, delete on table public.shopping_list_items to authenticated;
grant insert (content_id, ingredient_id, name, quantity, unit, quantity_text, checked, position) on table public.shopping_list_items to authenticated;
grant update (name, quantity, unit, quantity_text, checked, position) on table public.shopping_list_items to authenticated;
grant select, insert, update, delete on table public.user_recipe_prefs to authenticated;
grant select, delete on table public.recipe_view_history to authenticated;
grant insert (content_id, viewed_at) on table public.recipe_view_history to authenticated;
grant update (viewed_at) on table public.recipe_view_history to authenticated;

-- Tradução publicada não expõe mais o corpo ao visitante (correção): título e resumo por coluna;
-- o corpo traduzido sai pela RPC content_localized_body, que confere can_access_content.
revoke select on table public.content_localizations from anon, authenticated;
grant select (content_id, locale, title, summary, status, updated_at) on table public.content_localizations to anon, authenticated;

-- Legenda: L(c) = conteúdo no ar (content_is_live), ou do herói dono, ou admin;
--          A(c) = can_access_content (plano, módulo e etapa de receitas; dono e admin passam).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_categories' and policyname = 'recipe_categories_select') then
    create policy recipe_categories_select on public.recipe_categories for select to anon, authenticated
      using (active or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_details' and policyname = 'recipe_details_select') then
    create policy recipe_details_select on public.recipe_details for select to anon, authenticated
      using (exists (select 1 from public.content c where c.id = content_id
                       and (public.content_is_live(c.status, c.publish_at) or c.creator_id = (select public.my_creator_id())))
             or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_category_links' and policyname = 'recipe_category_links_select') then
    create policy recipe_category_links_select on public.recipe_category_links for select to anon, authenticated
      using (exists (select 1 from public.content c where c.id = content_id
                       and (public.content_is_live(c.status, c.publish_at) or c.creator_id = (select public.my_creator_id())))
             or (select public.is_admin()));
  end if;
  -- galeria: L(c); foto de etapa: A(c); o herói vê todas as próprias
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_media' and policyname = 'recipe_media_select') then
    create policy recipe_media_select on public.recipe_media for select to anon, authenticated
      using ((role = 'gallery' and exists (select 1 from public.content c where c.id = content_id and public.content_is_live(c.status, c.publish_at)))
             or (role = 'step' and public.can_access_content(content_id))
             or creator_id = (select public.my_creator_id())
             or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_extras' and policyname = 'recipe_extras_select') then
    create policy recipe_extras_select on public.recipe_extras for select to authenticated using (public.can_access_content(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_ingredients' and policyname = 'recipe_ingredients_select') then
    create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated using (public.can_access_content(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_steps' and policyname = 'recipe_steps_select') then
    create policy recipe_steps_select on public.recipe_steps for select to authenticated using (public.can_access_content(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_step_ingredients' and policyname = 'recipe_step_ingredients_select') then
    create policy recipe_step_ingredients_select on public.recipe_step_ingredients for select to authenticated using (public.can_access_content(content_id));
  end if;
  -- a interface só mostra os números quando validados; a linha segue a regra de acesso
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_nutrition' and policyname = 'recipe_nutrition_select') then
    create policy recipe_nutrition_select on public.recipe_nutrition for select to authenticated using (public.can_access_content(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_versions' and policyname = 'recipe_versions_select') then
    create policy recipe_versions_select on public.recipe_versions for select to authenticated
      using ((select public.is_admin()) or exists (select 1 from public.content c where c.id = content_id and c.creator_id = (select public.my_creator_id())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_ingredient_products' and policyname = 'recipe_ingredient_products_select') then
    create policy recipe_ingredient_products_select on public.recipe_ingredient_products for select to authenticated
      using ((status = 'validated' and public.can_access_content(content_id))
             or (select public.is_admin())
             or exists (select 1 from public.content c where c.id = content_id and c.creator_id = (select public.my_creator_id())));
  end if;
end $$;

-- ================================================================ 3) configurações
-- Chaves novas (kill switch de upload incluso); public_settings (seção 5) passa a expô-las.
insert into public.app_settings (key, value, description) values
  ('recipes.ratings_enabled', 'true'::jsonb, 'Avaliação por estrelas nas receitas (quem concluiu a receita).'),
  ('recipes.comments_enabled', 'false'::jsonb, 'Comentários em receitas (modelados; desligados até haver moderação na interface).'),
  ('recipes.uploads_enabled', 'true'::jsonb, 'Kill switch do envio de fotos de receitas pelos heróis.')
on conflict (key) do nothing;

-- A regra do tipo falha fechada: tipo sem linha em content_type_settings exige revisão.
create or replace function public.content_review_required(p_type public.content_type)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select s.review_required from public.content_type_settings s where s.type = p_type), true)
$$;
revoke execute on function public.content_review_required(public.content_type) from public, anon;
grant execute on function public.content_review_required(public.content_type) to authenticated, service_role;

-- Chave booleana pública ligada? Valor ausente ou malformado conta como desligado.
create or replace function public.recipe_setting_on(p_key text)
returns boolean language sql stable set search_path = public as $$
  select coalesce(public.public_settings() -> p_key = 'true'::jsonb, false)
$$;
revoke execute on function public.recipe_setting_on(text) from public, anon;
grant execute on function public.recipe_setting_on(text) to authenticated, service_role;

-- Avaliar exige: avaliações ligadas, acesso à receita, ser receita, não ser o chef e ter concluído.
-- Invoker: usa a RLS de quem avalia (lê as próprias conclusões).
create or replace function public.recipe_rating_allowed(p_content uuid)
returns boolean language sql stable set search_path = public as $$
  select public.recipe_setting_on('recipes.ratings_enabled')
    and public.can_access_content(p_content)
    and exists (select 1 from public.content c where c.id = p_content and c.type = 'recipe'
                  and c.creator_id is distinct from public.my_creator_id())
    and exists (select 1 from public.completions x where x.user_id = auth.uid() and x.content_id = p_content)
$$;
revoke execute on function public.recipe_rating_allowed(uuid) from public, anon;
grant execute on function public.recipe_rating_allowed(uuid) to authenticated, service_role;

do $$ begin
  -- avaliações: só as próprias (o agregado público fica em recipe_details)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_ratings' and policyname = 'recipe_ratings_select') then
    create policy recipe_ratings_select on public.recipe_ratings for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_ratings' and policyname = 'recipe_ratings_insert') then
    create policy recipe_ratings_insert on public.recipe_ratings for insert to authenticated
      with check (user_id = (select auth.uid()) and public.recipe_rating_allowed(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_ratings' and policyname = 'recipe_ratings_update') then
    create policy recipe_ratings_update on public.recipe_ratings for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.recipe_rating_allowed(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_ratings' and policyname = 'recipe_ratings_delete') then
    create policy recipe_ratings_delete on public.recipe_ratings for delete to authenticated using (user_id = (select auth.uid()));
  end if;
  -- comentários: público vê aprovados de receita no ar; autor vê os próprios; entram como pendentes
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_comments' and policyname = 'recipe_comments_select') then
    create policy recipe_comments_select on public.recipe_comments for select to anon, authenticated
      using ((status = 'approved' and exists (select 1 from public.content c where c.id = content_id and public.content_is_live(c.status, c.publish_at)))
             or user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_comments' and policyname = 'recipe_comments_insert') then
    create policy recipe_comments_insert on public.recipe_comments for insert to authenticated
      with check (user_id = (select auth.uid()) and public.recipe_setting_on('recipes.comments_enabled') and public.can_access_content(content_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_comments' and policyname = 'recipe_comments_delete') then
    create policy recipe_comments_delete on public.recipe_comments for delete to authenticated using (user_id = (select auth.uid()));
  end if;
  -- lista de compras: dado pessoal, nem o admin lê
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopping_list_items' and policyname = 'shopping_list_items_select') then
    create policy shopping_list_items_select on public.shopping_list_items for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopping_list_items' and policyname = 'shopping_list_items_insert') then
    create policy shopping_list_items_insert on public.shopping_list_items for insert to authenticated
      with check (user_id = (select auth.uid()) and (content_id is null or public.can_access_content(content_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopping_list_items' and policyname = 'shopping_list_items_update') then
    create policy shopping_list_items_update on public.shopping_list_items for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()) and (content_id is null or public.can_access_content(content_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopping_list_items' and policyname = 'shopping_list_items_delete') then
    create policy shopping_list_items_delete on public.shopping_list_items for delete to authenticated using (user_id = (select auth.uid()));
  end if;
  -- histórico opcional: só a própria pessoa; gravar exige a preferência ligada e receita visível
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_recipe_prefs' and policyname = 'user_recipe_prefs_own') then
    create policy user_recipe_prefs_own on public.user_recipe_prefs for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_view_history' and policyname = 'recipe_view_history_select') then
    create policy recipe_view_history_select on public.recipe_view_history for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_view_history' and policyname = 'recipe_view_history_delete') then
    create policy recipe_view_history_delete on public.recipe_view_history for delete to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_view_history' and policyname = 'recipe_view_history_insert') then
    create policy recipe_view_history_insert on public.recipe_view_history for insert to authenticated
      with check (user_id = (select auth.uid())
                  and exists (select 1 from public.user_recipe_prefs p where p.user_id = (select auth.uid()) and p.history_enabled)
                  and exists (select 1 from public.content c where c.id = content_id and c.type = 'recipe'
                                and (public.content_is_live(c.status, c.publish_at) or c.creator_id = (select public.my_creator_id()))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_view_history' and policyname = 'recipe_view_history_update') then
    create policy recipe_view_history_update on public.recipe_view_history for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid())
                  and exists (select 1 from public.user_recipe_prefs p where p.user_id = (select auth.uid()) and p.history_enabled)
                  and exists (select 1 from public.content c where c.id = content_id and c.type = 'recipe'
                                and (public.content_is_live(c.status, c.publish_at) or c.creator_id = (select public.my_creator_id()))));
  end if;
end $$;

-- ================================================================ 4) gatilhos e guardas

-- Tipo do ator para a auditoria das RPCs novas (herói aparece como 'creator', não 'consumer').
create or replace function public.audit_actor()
returns public.actor_type language sql stable set search_path = public as $$
  select (case when auth.uid() is null then 'system'
               when public.is_admin() then 'admin'
               when public.my_creator_id() is not null then 'creator'
               else 'consumer' end)::public.actor_type
$$;
revoke execute on function public.audit_actor() from public, anon;
grant execute on function public.audit_actor() to authenticated, service_role;

-- ---------------------------------------------------------------- regra de revisão: só muda pela RPC auditada
-- O update direto que /admin/content/settings já fazia não era auditado: esta coluna só muda com
-- app.trusted (admin_set_review_required); nem o admin escreve direto.
create or replace function public.content_type_settings_review_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.review_required is distinct from old.review_required and not public.is_trusted_call() then
    raise exception 'review_required_protected' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_type_settings_review_guard() from public, anon;
grant execute on function public.content_type_settings_review_guard() to authenticated, service_role;
create or replace trigger trg_a_content_type_settings_review before update on public.content_type_settings
  for each row execute function public.content_type_settings_review_guard();

-- ---------------------------------------------------------------- content: tipo travado para receita
-- Receita tem tabelas próprias: virar outro tipo (ou outro tipo virar receita) deixaria dados órfãos.
-- Os demais tipos seguem mudando como antes (a 0017 libera no rascunho); para mudar, o herói duplica.
create or replace function public.content_type_lock()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.type is distinct from old.type and (old.type = 'recipe' or new.type = 'recipe') then
    raise exception 'type_locked' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_type_lock() from public, anon;
grant execute on function public.content_type_lock() to authenticated, service_role;
create or replace trigger trg_content_type_lock before update on public.content
  for each row execute function public.content_type_lock();

-- ---------------------------------------------------------------- checklist de publicação da receita
-- Devolve os códigos que faltam, na ordem fixa que a interface espelha (src/lib/recipes/codes.ts).
-- Recebe os campos de content como argumento porque o gatilho BEFORE precisa avaliar a linha nova.
create or replace function public.recipe_publishable_missing(p_content uuid, p_title text, p_summary text, p_cover_url text,
  p_license text, p_creator uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare d public.recipe_details%rowtype; v text[] := '{}'; v_provider public.media_provider; v_ref text;
begin
  select * into d from public.recipe_details where content_id = p_content;
  if nullif(btrim(coalesce(p_title, '')), '') is null then v := array_append(v, 'title'); end if;
  if nullif(btrim(coalesce(p_summary, '')), '') is null then v := array_append(v, 'summary'); end if;
  -- foto enviada exige texto alternativo; sem foto, vale a capa já preenchida (placeholder das antigas)
  if not (case when d.cover_media_id is not null
               then exists (select 1 from public.recipe_media m where m.id = d.cover_media_id and nullif(btrim(coalesce(m.alt_text, '')), '') is not null)
               else nullif(btrim(coalesce(p_cover_url, '')), '') is not null end) then
    v := array_append(v, 'cover');
  end if;
  if exists (select 1 from public.recipe_media m where m.content_id = p_content and m.role = 'gallery'
               and nullif(btrim(coalesce(m.alt_text, '')), '') is null) then
    v := array_append(v, 'gallery_alt');
  end if;
  if d.servings is null then v := array_append(v, 'servings'); end if;
  if d.total_minutes is null then v := array_append(v, 'total_minutes');
  elsif d.total_minutes < coalesce(d.prep_minutes, 0) + coalesce(d.cook_minutes, 0) + coalesce(d.rest_minutes, 0) then
    v := array_append(v, 'times');
  end if;
  if not exists (select 1 from public.recipe_ingredients i where i.content_id = p_content) then v := array_append(v, 'ingredients'); end if;
  if not exists (select 1 from public.recipe_steps s where s.content_id = p_content) then v := array_append(v, 'steps'); end if;
  if not exists (select 1 from public.recipe_category_links l join public.recipe_categories k on k.code = l.category_code
                 where l.content_id = p_content and k.active) then
    v := array_append(v, 'category');
  end if;
  if not coalesce(d.allergens_declared, false) then v := array_append(v, 'allergens'); end if;
  select b.media_provider, nullif(btrim(coalesce(b.media_ref, '')), '') into v_provider, v_ref
  from public.content_bodies b where b.content_id = p_content;
  if v_provider is not null and not public.media_license_compatible(v_provider, p_license) then v := array_append(v, 'license'); end if;
  -- vídeo do Stream só com envio do próprio herói, não descartado e sem uso em outro conteúdo (0026)
  if v_provider = 'cloudflare_stream' and (
       v_ref is null
       or not exists (select 1 from public.stream_uploads s where s.uid = v_ref and s.creator_id = p_creator and s.discarded_at is null
                        and (s.content_id is null or s.content_id = p_content))
       or exists (select 1 from public.content_bodies b2 where b2.media_provider = 'cloudflare_stream' and b2.media_ref = v_ref and b2.content_id <> p_content)) then
    v := array_append(v, 'stream');
  end if;
  return v;
end $$;
revoke execute on function public.recipe_publishable_missing(uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.recipe_publishable_missing(uuid, text, text, text, text, uuid) to service_role;

create or replace function public.recipe_assert_publishable(p_content uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare c public.content%rowtype; v text[];
begin
  select * into c from public.content where id = p_content;
  if not found then raise exception 'content_not_found'; end if;
  v := public.recipe_publishable_missing(p_content, c.title, c.summary, c.cover_url, c.media_license_kind, c.creator_id);
  if cardinality(v) > 0 then raise exception 'recipe_incomplete: %', array_to_string(v, ',') using errcode = '23514'; end if;
end $$;
revoke execute on function public.recipe_assert_publishable(uuid) from public, anon, authenticated;
grant execute on function public.recipe_assert_publishable(uuid) to service_role;

-- Toda entrada no ar de uma receita passa pelo checklist: publicação do herói, aprovação do admin e
-- admin_set_content_status (inclusive a conferência do uid do Stream). As 8 receitas que já estão no
-- ar não são afetadas até serem republicadas.
create or replace function public.content_recipe_publishable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  v := public.recipe_publishable_missing(new.id, new.title, new.summary, new.cover_url, new.media_license_kind, new.creator_id);
  if cardinality(v) > 0 then raise exception 'recipe_incomplete: %', array_to_string(v, ',') using errcode = '23514'; end if;
  return new;
end $$;
revoke execute on function public.content_recipe_publishable() from public, anon;
grant execute on function public.content_recipe_publishable() to authenticated, service_role;
create or replace trigger trg_content_recipe_publishable before update on public.content
  for each row when (new.type = 'recipe' and new.status = 'published' and old.status is distinct from 'published')
  execute function public.content_recipe_publishable();

-- ---------------------------------------------------------------- versões (snapshot imutável)
-- Snapshot sem campos voláteis (datas, agregados de avaliação, validação da nutrição), para que o
-- hash igual signifique conteúdo igual. Não repete hash; calcula as seções que mudaram.
create or replace function public.recipe_snapshot(p_content uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; v_hash text; v_prev public.recipe_versions%rowtype; v_no int; v_id uuid; v_changed text[];
begin
  select jsonb_build_object(
    'content', jsonb_build_object('title', c.title, 'summary', c.summary, 'tags', to_jsonb(c.tags), 'difficulty', c.difficulty,
                                  'pillar', c.pillar, 'disclaimer_kind', c.disclaimer_kind, 'cover_url', c.cover_url,
                                  'duration_minutes', c.duration_minutes, 'media_license_kind', c.media_license_kind,
                                  'media_license_ref', c.media_license_ref, 'media_credit', c.media_credit),
    'details', (select to_jsonb(d) - 'content_id' - 'created_at' - 'updated_at' - 'rating_count' - 'rating_sum'
                from public.recipe_details d where d.content_id = c.id),
    'extras', (select jsonb_build_object('chef_note', x.chef_note) from public.recipe_extras x where x.content_id = c.id),
    'categories', coalesce((select jsonb_agg(l.category_code order by l.category_code) from public.recipe_category_links l where l.content_id = c.id), '[]'::jsonb),
    'ingredients', coalesce((select jsonb_agg(to_jsonb(i) - 'content_id' - 'created_at' - 'updated_at' order by i.position)
                             from public.recipe_ingredients i where i.content_id = c.id), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(to_jsonb(s) - 'content_id' - 'created_at' - 'updated_at' order by s.position)
                       from public.recipe_steps s where s.content_id = c.id), '[]'::jsonb),
    'step_ingredients', coalesce((select jsonb_agg(jsonb_build_object('step_id', si.step_id, 'ingredient_id', si.ingredient_id) order by si.step_id, si.ingredient_id)
                                  from public.recipe_step_ingredients si where si.content_id = c.id), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(to_jsonb(m) - 'content_id' - 'creator_id' - 'created_by' - 'created_at' - 'updated_at' - 'rights_confirmed_at'
                                        order by m.role, m.position, m.id)
                       from public.recipe_media m where m.content_id = c.id), '[]'::jsonb),
    'nutrition', (select to_jsonb(n) - 'content_id' - 'updated_at' - 'validated' - 'validated_by' - 'validated_at' - 'validation_note' - 'validated_by_user'
                  from public.recipe_nutrition n where n.content_id = c.id),
    'video', (select jsonb_build_object('provider', b.media_provider, 'ref', b.media_ref) from public.content_bodies b where b.content_id = c.id))
  into v_snap
  from public.content c where c.id = p_content;
  if v_snap is null then raise exception 'content_not_found'; end if;
  -- uma numeração por receita: envio e publicação concorrentes esperam aqui
  perform pg_advisory_xact_lock(hashtext('recipe_versions:' || p_content::text));
  v_hash := md5(v_snap::text);
  select * into v_prev from public.recipe_versions where content_id = p_content and reason <> 'restore_point' order by version_no desc limit 1;
  if found and v_prev.snapshot_hash = v_hash then return v_prev.id; end if;
  select array_agg(k order by k) into v_changed from jsonb_object_keys(v_snap) as k
  where v_prev.id is null or (v_snap -> k) is distinct from (v_prev.snapshot -> k);
  select coalesce(max(version_no), 0) + 1 into v_no from public.recipe_versions where content_id = p_content;
  insert into public.recipe_versions (content_id, version_no, reason, snapshot, snapshot_hash, changed_sections, created_by)
  values (p_content, v_no, p_reason, v_snap, v_hash, coalesce(v_changed, '{}'), auth.uid())
  returning id into v_id;
  perform public.audit_log('recipe.version', 'content', p_content::text, null,
    jsonb_build_object('version_id', v_id, 'version_no', v_no, 'reason', p_reason, 'changed_sections', coalesce(v_changed, '{}')),
    null, public.audit_actor());
  return v_id;
end $$;
revoke execute on function public.recipe_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.recipe_snapshot(uuid, text) to service_role;

-- Ao entrar no ar (ou mudar a data de um agendado), a versão publicada vira snapshot imutável.
create or replace function public.content_recipe_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recipe_snapshot(new.id,
    case when public.is_admin() then 'admin_publish'
         when new.publish_at is not null and new.publish_at > now() then 'schedule'
         else 'publish' end);
  return null;
end $$;
revoke execute on function public.content_recipe_version() from public, anon;
grant execute on function public.content_recipe_version() to authenticated, service_role;
create or replace trigger trg_d_content_recipe_version after update on public.content
  for each row when (new.type = 'recipe' and new.status = 'published'
                     and (old.status is distinct from 'published' or old.publish_at is distinct from new.publish_at))
  execute function public.content_recipe_version();

-- Capa servida pelo proxy de receitas só com foto de galeria do MESMO conteúdo (vale para todo tipo:
-- um artigo não pega emprestada a foto de rascunho de outra receita).
create or replace function public.content_recipe_cover()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if new.cover_url is null or new.cover_url not like '/media/recipe/%' then return new; end if;
  if tg_op = 'UPDATE' and new.cover_url is not distinct from old.cover_url then return new; end if;
  v_id := substr(new.cover_url, length('/media/recipe/') + 1);
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists (select 1 from public.recipe_media m where m.id = v_id::uuid and m.content_id = new.id and m.role = 'gallery') then
    raise exception 'cover_not_owned' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_recipe_cover() from public, anon;
grant execute on function public.content_recipe_cover() to authenticated, service_role;
create or replace trigger trg_e_content_recipe_cover before insert or update on public.content
  for each row execute function public.content_recipe_cover();

-- ---------------------------------------------------------------- corpo da receita estruturada
-- Depois da primeira gravação estruturada (há recipe_details), o body vira o marcador
-- {kind:'recipe',schema:2} e só funções confiáveis o regravam. Trocar o vídeo (media_*) continua
-- livre e sujeito à guarda do Stream da 0026. Receita antiga sem detalhes não é afetada.
create or replace function public.content_bodies_recipe_managed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  if public.is_trusted_call() then return new; end if;
  if exists (select 1 from public.content c join public.recipe_details d on d.content_id = c.id
             where c.id = new.content_id and c.type = 'recipe') then
    raise exception 'recipe_body_managed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_bodies_recipe_managed() from public, anon;
grant execute on function public.content_bodies_recipe_managed() to authenticated, service_role;
create or replace trigger trg_d_content_bodies_recipe_managed before insert or update on public.content_bodies
  for each row execute function public.content_bodies_recipe_managed();

-- ---------------------------------------------------------------- herói: especialidades e credenciais (P7)
-- O herói edita especialidades; credenciais ele só PEDE (creator_credentials_requests, fora da linha
-- pública, como creator_rights_private). creator_profiles.credentials é legível por qualquer visitante,
-- então só recebe o texto quando o admin aprova (admin_set_creator_credentials, sob app.trusted).
create or replace trigger trg_a_creator_profiles_guard before update on public.creator_profiles
  for each row execute function public.guard_protected_columns('{headline,bio,avatar_url,cover_url,socials,specialties}');
create table if not exists public.creator_credentials_requests (
  creator_id uuid primary key references public.creator_profiles (id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 300),
  updated_at timestamptz not null default now()
);
alter table public.creator_credentials_requests enable row level security;
revoke all on table public.creator_credentials_requests from anon, authenticated;
grant select, delete on table public.creator_credentials_requests to authenticated;
grant insert (creator_id, text) on table public.creator_credentials_requests to authenticated;
grant update (text) on table public.creator_credentials_requests to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_credentials_requests' and policyname = 'creator_credentials_requests_owner') then
    create policy creator_credentials_requests_owner on public.creator_credentials_requests for all to authenticated
      using (creator_id = (select public.my_creator_id()) or (select public.is_admin()))
      with check (creator_id = (select public.my_creator_id()) or (select public.is_admin()));
  end if;
end $$;
create or replace trigger trg_creator_credentials_requests_updated before update on public.creator_credentials_requests
  for each row execute function public.set_updated_at();
-- Pedido novo, editado ou retirado: o texto aprovado sai do perfil público até nova aprovação.
create or replace function public.creator_credentials_request_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid := coalesce(new.creator_id, old.creator_id); v_prev text := current_setting('app.trusted', true);
begin
  if tg_op = 'UPDATE' and new.text is not distinct from old.text then return null; end if;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles set credentials = null, credentials_approved_at = null
  where id = v_creator and (credentials is not null or credentials_approved_at is not null);
  perform set_config('app.trusted', coalesce(nullif(v_prev, ''), 'off'), true);
  return null;
end $$;
revoke execute on function public.creator_credentials_request_changed() from public, anon;
grant execute on function public.creator_credentials_request_changed() to authenticated, service_role;
create or replace trigger trg_creator_credentials_request_changed after insert or update or delete on public.creator_credentials_requests
  for each row execute function public.creator_credentials_request_changed();
create or replace function public.creator_credentials_reset()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.credentials is distinct from old.credentials and not public.is_trusted_call() then
    new.credentials_approved_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.creator_credentials_reset() from public, anon;
grant execute on function public.creator_credentials_reset() to authenticated, service_role;
create or replace trigger trg_b_creator_credentials before update on public.creator_profiles
  for each row execute function public.creator_credentials_reset();

-- ---------------------------------------------------------------- nutrição: só o admin valida
-- Fora de admin, funções confiáveis e sistema: aceita a única mudança "validated_by_user → nulo"
-- (cascata da exclusão de conta), recusa qualquer outra mudança na validação e derruba a validação
-- quando um número ou a origem muda (a nota da fonte não derruba).
create or replace function public.recipe_nutrition_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if tg_op = 'INSERT' then
    if new.validated or new.validated_by is not null or new.validated_at is not null or new.validation_note is not null or new.validated_by_user is not null then
      raise exception 'nutrition_validation_forbidden' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.validated_by_user is null and old.validated_by_user is not null
     and (to_jsonb(new) - 'validated_by_user' - 'updated_at') = (to_jsonb(old) - 'validated_by_user' - 'updated_at') then
    return new;
  end if;
  if new.validated is distinct from old.validated or new.validated_by is distinct from old.validated_by
     or new.validated_at is distinct from old.validated_at or new.validation_note is distinct from old.validation_note
     or new.validated_by_user is distinct from old.validated_by_user then
    raise exception 'nutrition_validation_forbidden' using errcode = '42501';
  end if;
  if (new.kcal, new.protein_g, new.carbs_g, new.fat_g, new.fiber_g, new.sodium_mg, new.source)
     is distinct from (old.kcal, old.protein_g, old.carbs_g, old.fat_g, old.fiber_g, old.sodium_mg, old.source) then
    new.validated := false; new.validated_by := null; new.validated_at := null; new.validation_note := null; new.validated_by_user := null;
  end if;
  return new;
end $$;
revoke execute on function public.recipe_nutrition_guard() from public, anon;
grant execute on function public.recipe_nutrition_guard() to authenticated, service_role;
create or replace trigger trg_a_recipe_nutrition_guard before insert or update on public.recipe_nutrition
  for each row execute function public.recipe_nutrition_guard();

-- ---------------------------------------------------------------- versões imutáveis
-- UPDATE só quando a única mudança é created_by virando nulo (exclusão da conta do autor);
-- DELETE só em cascata (o conteúdo pai já não existe). Definer: a RLS de quem apaga não esconde o pai.
create or replace function public.recipe_versions_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.created_by is null and (to_jsonb(old) - 'created_by') = (to_jsonb(new) - 'created_by') then return new; end if;
    raise exception 'version_immutable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.content c where c.id = old.content_id) then return old; end if;
  raise exception 'version_immutable' using errcode = '42501';
end $$;
revoke execute on function public.recipe_versions_immutable() from public, anon;
grant execute on function public.recipe_versions_immutable() to authenticated, service_role;
create or replace trigger trg_a_recipe_versions_immutable before update or delete on public.recipe_versions
  for each row execute function public.recipe_versions_immutable();

-- ---------------------------------------------------------------- avaliações e comentários
-- Só em receita (o grant deixa escolher qualquer content_id).
create or replace function public.recipe_social_type()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.content c where c.id = new.content_id and c.type = 'recipe') then
    raise exception 'not_recipe' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.recipe_social_type() from public, anon;
grant execute on function public.recipe_social_type() to authenticated, service_role;
create or replace trigger trg_recipe_social_type before insert on public.recipe_ratings
  for each row execute function public.recipe_social_type();
create or replace trigger trg_recipe_social_type before insert on public.recipe_comments
  for each row execute function public.recipe_social_type();

-- is_demo vem da conta (app_metadata gravado pelo servidor), não do cliente; chaves imutáveis.
create or replace function public.recipe_ratings_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.content_id is distinct from old.content_id or new.user_id is distinct from old.user_id then
      raise exception 'rating_immutable_keys' using errcode = '42501';
    end if;
    new.is_demo := old.is_demo;
    return new;
  end if;
  new.is_demo := coalesce((select u.raw_app_meta_data ->> 'ultra_hero_demo' from auth.users u where u.id = new.user_id), '') = 'true';
  return new;
end $$;
revoke execute on function public.recipe_ratings_before() from public, anon;
grant execute on function public.recipe_ratings_before() to authenticated, service_role;
create or replace trigger trg_b_recipe_ratings_before before insert or update on public.recipe_ratings
  for each row execute function public.recipe_ratings_before();

-- Agregado público (contagem e soma) em recipe_details, sem as avaliações de contas demo.
create or replace function public.recipe_ratings_aggregate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_content uuid; dc int := 0; ds int := 0;
begin
  if tg_op = 'DELETE' then v_content := old.content_id; else v_content := new.content_id; end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if not old.is_demo then dc := dc - 1; ds := ds - old.stars; end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if not new.is_demo then dc := dc + 1; ds := ds + new.stars; end if;
  end if;
  if dc <> 0 or ds <> 0 then
    update public.recipe_details set rating_count = greatest(rating_count + dc, 0), rating_sum = greatest(rating_sum + ds, 0)
    where content_id = v_content;
  end if;
  return null;
end $$;
revoke execute on function public.recipe_ratings_aggregate() from public, anon;
grant execute on function public.recipe_ratings_aggregate() to authenticated, service_role;
create or replace trigger trg_recipe_ratings_aggregate after insert or update or delete on public.recipe_ratings
  for each row execute function public.recipe_ratings_aggregate();

-- Comentário não é editado; a moderação passa pela RPC. A cascata da exclusão de conta zera moderated_by.
create or replace function public.recipe_comments_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if new.moderated_by is null and old.moderated_by is not null
     and (to_jsonb(new) - 'moderated_by' - 'updated_at') = (to_jsonb(old) - 'moderated_by' - 'updated_at') then
    return new;
  end if;
  raise exception 'comment_immutable' using errcode = '42501';
end $$;
revoke execute on function public.recipe_comments_guard() from public, anon;
grant execute on function public.recipe_comments_guard() to authenticated, service_role;
create or replace trigger trg_a_recipe_comments_guard before update on public.recipe_comments
  for each row execute function public.recipe_comments_guard();

-- ---------------------------------------------------------------- ingrediente ↔ produto: mudança relevante suspende
-- Mesmos campos "significativos" de products_before_update (0004); preço e disponibilidade não suspendem.
create or replace function public.products_recipe_links_suspend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.title, old.category_id, old.product_type, old.attributes, old.food_info)
     is distinct from (new.title, new.category_id, new.product_type, new.attributes, new.food_info) then
    update public.recipe_ingredient_products
    set status = 'suspended', suspended_reason = 'product_significant_change'
    where product_id = new.id and status = 'validated';
  end if;
  return null;
end $$;
revoke execute on function public.products_recipe_links_suspend() from public, anon;
grant execute on function public.products_recipe_links_suspend() to authenticated, service_role;
create or replace trigger trg_z_products_recipe_links after update on public.products
  for each row execute function public.products_recipe_links_suspend();

-- ---------------------------------------------------------------- lista de compras
-- product_id sai do vínculo validado do ingrediente (o cliente nem tem grant na coluna); item de
-- ingrediente fica preso à receita dele; no máximo 300 itens por pessoa (lock por pessoa).
create or replace function public.shopping_list_items_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_content uuid;
begin
  if tg_op = 'INSERT' and new.ingredient_id is not null then
    select i.content_id into v_content from public.recipe_ingredients i where i.id = new.ingredient_id;
    if new.content_id is null then new.content_id := v_content;
    elsif new.content_id is distinct from v_content then raise exception 'ingredient_mismatch' using errcode = '22023';
    end if;
  end if;
  new.product_id := (select p.product_id from public.recipe_ingredient_products p
                     where p.ingredient_id = new.ingredient_id and p.status = 'validated' limit 1);
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('shopping:' || new.user_id::text));
    if (select count(*) from public.shopping_list_items s where s.user_id = new.user_id) >= 300
       and not exists (select 1 from public.shopping_list_items s where s.user_id = new.user_id and s.ingredient_id = new.ingredient_id) then
      raise exception 'shopping_list_full' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.shopping_list_items_before() from public, anon;
grant execute on function public.shopping_list_items_before() to authenticated, service_role;
create or replace trigger trg_a_shopping_list_items_before before insert or update on public.shopping_list_items
  for each row execute function public.shopping_list_items_before();

-- ---------------------------------------------------------------- histórico opcional
create or replace function public.user_recipe_prefs_before()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.history_enabled and (tg_op = 'INSERT' or not old.history_enabled) then new.history_enabled_at := now();
  elsif not new.history_enabled then new.history_enabled_at := null;
  -- registro do consentimento: só o banco grava a data; o titular não a reescreve
  elsif new.history_enabled then new.history_enabled_at := old.history_enabled_at;
  end if;
  return new;
end $$;
revoke execute on function public.user_recipe_prefs_before() from public, anon;
grant execute on function public.user_recipe_prefs_before() to authenticated, service_role;
create or replace trigger trg_a_user_recipe_prefs_before before insert or update on public.user_recipe_prefs
  for each row execute function public.user_recipe_prefs_before();

-- viewed_at vem sempre do relógio do banco quando o cliente grava: data futura escaparia da
-- retenção de 90 dias. Sistema (sem auth.uid) e funções confiáveis ficam livres (testes, jobs).
create or replace function public.recipe_view_history_before()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_trusted_call() then new.viewed_at := now(); end if;
  return new;
end $$;
revoke execute on function public.recipe_view_history_before() from public, anon;
grant execute on function public.recipe_view_history_before() to authenticated, service_role;
create or replace trigger trg_a_recipe_view_history_before before insert or update on public.recipe_view_history
  for each row execute function public.recipe_view_history_before();

-- Desligar o histórico apaga tudo na mesma transação.
create or replace function public.user_recipe_prefs_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.history_enabled and not new.history_enabled then
    delete from public.recipe_view_history where user_id = new.user_id;
  end if;
  return null;
end $$;
revoke execute on function public.user_recipe_prefs_after() from public, anon;
grant execute on function public.user_recipe_prefs_after() to authenticated, service_role;
create or replace trigger trg_user_recipe_prefs_after after update on public.user_recipe_prefs
  for each row execute function public.user_recipe_prefs_after();

-- ================================================================ 5) redefinições de funções existentes

-- ---------------------------------------------------------------- can_access_content (mesma assinatura e grants)
-- A etapa demonstrativa de receitas (0024) passa a valer no banco: sem linha em recipe_onboarding a
-- receita não abre (corpo, ingredientes, etapas, extras, nutrição, foto de etapa, lista, avaliação,
-- progresso). Admin e o herói dono são checados antes e não são afetados.
create or replace function public.can_access_content(p_content uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c public.content%rowtype;
begin
  select * into c from public.content where id = p_content;
  if not found then return false; end if;
  if public.is_admin() then return true; end if;
  if c.creator_id is not null and c.creator_id = public.my_creator_id() then return true; end if;
  if not public.content_is_live(c.status, c.publish_at) then return false; end if;
  if c.access_level is null then return false; end if;              -- sem regra: indisponível
  if auth.uid() is null then return false; end if;                   -- visitante não consome
  if c.type = 'recipe' and not exists (select 1 from public.recipe_onboarding o where o.user_id = auth.uid()) then return false; end if;
  if c.access_level = 'free' then return true; end if;
  return c.required_module_id in (select public.user_entitled_modules(auth.uid()));
end $$;

-- ---------------------------------------------------------------- public_settings (mesma assinatura e grants)
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('commerce.enabled', 'ai.enabled', 'experiment.open', 'ai.provider', 'video.provider', 'ai.rate_limit_per_hour',
                'transport.minutes_per_step', 'recipes.ratings_enabled', 'recipes.comments_enabled', 'recipes.uploads_enabled')
$$;

-- ---------------------------------------------------------------- publicar pelo herói, agora com agendamento
-- Regras da 0026 mais: regra de revisão do tipo ligada → 'review_required' (o herói envia à revisão);
-- p_publish_at nulo publica agora, senão precisa estar entre agora + 1 min e agora + 365 dias
-- ('invalid_publish_at'); a auditoria leva a data. O checklist da receita vem do gatilho
-- trg_content_recipe_publishable. "Agendada" = published com publish_at no futuro.
create or replace function public.creator_publish_content(p_content uuid, p_publish_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid;
        v_provider public.media_provider; v_ref text; v_round int;
        v_feedback constant text := 'Publicação direta pelo herói';
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if public.content_review_required(c.type) then raise exception 'review_required'; end if;
  if p_publish_at is not null and (p_publish_at < now() + interval '1 minute' or p_publish_at > now() + interval '365 days') then
    raise exception 'invalid_publish_at' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(c.title, '')), '') is null then raise exception 'missing_title'; end if;
  select b.media_provider, nullif(btrim(coalesce(b.media_ref, '')), '') into v_provider, v_ref
  from public.content_bodies b where b.content_id = p_content;
  if not found then raise exception 'missing_body'; end if;
  if c.type = 'video' and (v_provider = 'none' or v_ref is null) then raise exception 'missing_media'; end if;
  perform public.content_assert_media_license(p_content);
  if v_provider = 'cloudflare_stream' and not exists (
    select 1 from public.stream_uploads s where s.uid = v_ref and s.creator_id = v_creator and s.discarded_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- checagens feitas: só agora liga o sinalizador, e desliga antes de qualquer outra coisa
  perform set_config('app.trusted', 'on', true);
  update public.content
  set status = 'published', review_status = 'approved',
      published_at = coalesce(p_publish_at, now()), publish_at = p_publish_at,
      access_level = coalesce(access_level, 'free')
  where id = p_content;
  perform set_config('app.trusted', 'off', true);

  update public.content_reviews
  set decision = 'approved', feedback = v_feedback, decided_by = v_uid, decided_at = now()
  where content_id = p_content and decision = 'in_review';
  if not found then
    select coalesce(max(round), 0) + 1 into v_round from public.content_reviews where content_id = p_content;
    insert into public.content_reviews (content_id, round, submitted_by, decision, feedback, decided_by, decided_at, requested_publish_at)
    values (p_content, v_round, v_uid, 'approved', v_feedback, v_uid, now(), p_publish_at);
  end if;

  perform public.audit_log('content.creator_publish', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'access_level', c.access_level, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'published', 'review_status', 'approved', 'access_level', coalesce(c.access_level, 'free'),
                       'media_provider', v_provider, 'media_license_kind', c.media_license_kind, 'publish_at', p_publish_at),
    null, 'creator');
  if p_publish_at is not null then
    return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'published', 'publish_at', p_publish_at);
  end if;
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'published');
end $$;
revoke execute on function public.creator_publish_content(uuid, timestamptz) from public, anon;
grant execute on function public.creator_publish_content(uuid, timestamptz) to authenticated, service_role;

-- A chamada antiga (1 parâmetro) continua resolvendo para esta, que delega publicando agora.
create or replace function public.creator_publish_content(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.creator_publish_content(p_content, null::timestamptz);
end $$;
revoke execute on function public.creator_publish_content(uuid) from public, anon;
grant execute on function public.creator_publish_content(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- envio à revisão com data sugerida
-- Regras da 0010 mais: receita passa pelo checklist e vira a versão 'submit' (ligada à rodada);
-- data sugerida na mesma janela da publicação; auditoria content.submit. A versão de 1 parâmetro
-- delega com data nula, para nenhuma receita ser enviada sem checklist.
create or replace function public.submit_content_for_review(p_content uuid, p_requested_publish_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_round int; v_version uuid;
begin
  select * into c from public.content where id = p_content for update;
  if not found then raise exception 'content_not_found'; end if;
  if not (public.is_admin() or (c.creator_id is not null and c.creator_id = public.my_creator_id())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'draft' then raise exception 'only_drafts_can_be_submitted'; end if;
  if c.review_status = 'in_review' then raise exception 'already_in_review'; end if;
  if coalesce(c.title, '') = '' or c.pillar is null then raise exception 'content_incomplete'; end if;
  if p_requested_publish_at is not null
     and (p_requested_publish_at < now() + interval '1 minute' or p_requested_publish_at > now() + interval '365 days') then
    raise exception 'invalid_publish_at' using errcode = '22023';
  end if;
  if c.type = 'recipe' then
    perform public.recipe_assert_publishable(p_content);
    v_version := public.recipe_snapshot(p_content, 'submit');
  end if;
  select coalesce(max(round), 0) + 1 into v_round from public.content_reviews where content_id = p_content;
  insert into public.content_reviews (content_id, round, submitted_by, requested_publish_at, version_id)
  values (p_content, v_round, auth.uid(), p_requested_publish_at, v_version);
  perform set_config('app.trusted', 'on', true);
  update public.content set review_status = 'in_review' where id = p_content;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.submit', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status),
    jsonb_build_object('review_status', 'in_review', 'round', v_round, 'requested_publish_at', p_requested_publish_at, 'version_id', v_version),
    null, public.audit_actor());
end $$;
revoke execute on function public.submit_content_for_review(uuid, timestamptz) from public, anon;
grant execute on function public.submit_content_for_review(uuid, timestamptz) to authenticated, service_role;

create or replace function public.submit_content_for_review(p_content uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.submit_content_for_review(p_content, null::timestamptz);
end $$;
revoke execute on function public.submit_content_for_review(uuid) from public, anon;
grant execute on function public.submit_content_for_review(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- arquivar pelo admin registra quem arquivou
-- Cópia da 0017 mais archived_by: 'admin' ao arquivar e nulo ao sair do arquivado.
create or replace function public.admin_set_content_status(p_content uuid, p_status public.content_status, p_justification text, p_publish_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('status', status, 'publish_at', publish_at, 'archived_by', archived_by) into v_before from public.content where id = p_content;
  if p_status = 'published' then perform public.content_assert_media_license(p_content); end if;
  v_at := case when p_status = 'published' and p_publish_at is not null and p_publish_at > now() then p_publish_at end;
  update public.content set status = p_status,
    archived_at = case when p_status = 'archived' then now() else null end,
    archived_by = case when p_status = 'archived' then 'admin' else null end,
    publish_at = v_at,   -- rascunho/arquivado descartam o agendamento
    published_at = case when p_status <> 'published' then published_at
                        when v_at is not null then v_at
                        when published_at is null or published_at > now() then now()
                        else published_at end
  where id = p_content;
  perform public.audit_log('content.set_status', 'content', p_content::text, v_before, jsonb_build_object('status', p_status, 'publish_at', v_at), p_justification);
end $$;

-- ---------------------------------------------------------------- retenção: histórico de receitas em 90 dias
create or replace function public.run_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int; n3 int; n4 int; n5 int; n6 int;
begin
  delete from public.analytics_events where expires_at < now(); get diagnostics n1 = row_count;
  update public.test_orders set user_id = null, destination_snapshot = destination_snapshot - 'name', anonymized_at = now()
  where retention_expires_at < now() and anonymized_at is null
    and not exists (select 1 from public.retention_exceptions e where e.scope_type = 'test_order' and e.scope_id = test_orders.id::text and e.closed_at is null);
  get diagnostics n2 = row_count;
  delete from public.admin_audit where created_at < now() - interval '365 days'; get diagnostics n3 = row_count;
  delete from public.recommendation_runs where created_at < now() - interval '30 days'; get diagnostics n4 = row_count;
  delete from public.retention_jobs where ran_at < now() - interval '365 days'; get diagnostics n5 = row_count;
  delete from public.recipe_view_history where viewed_at < now() - interval '90 days'; get diagnostics n6 = row_count;
  insert into public.retention_jobs (job, affected, details)
  values ('daily', n1 + n2 + n3 + n4 + n6, jsonb_build_object('analytics_deleted', n1, 'orders_anonymized', n2, 'audit_deleted', n3,
                                                          'recommendation_runs_deleted', n4, 'recipe_history_deleted', n6));
  return jsonb_build_object('analytics_deleted', n1, 'orders_anonymized', n2, 'audit_deleted', n3, 'recommendation_runs_deleted', n4,
                            'recipe_history_deleted', n6);
end $$;

-- ---------------------------------------------------------------- exclusão de conta (LGPD) com dados de receitas
-- Cópia integral da 0010 mais: apaga avaliações, comentários, lista, histórico e preferência da pessoa
-- e zera as autorias que ficam (versões, mídia, moderação, validação de nutrição e de vínculo).
create or replace function public.anonymize_user_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.trusted', 'on', true);
  update public.profiles set display_name = 'Usuário removido', avatar_url = null, timezone = null, anonymized_at = now() where id = p_user;
  delete from public.user_interests where user_id = p_user;
  delete from public.not_interested where user_id = p_user;
  delete from public.user_recommendations where user_id = p_user;
  delete from public.favorites where user_id = p_user;
  delete from public.custom_lists where user_id = p_user;
  delete from public.content_progress where user_id = p_user;
  delete from public.cart_items where cart_id in (select id from public.carts where user_id = p_user);
  delete from public.product_interest where user_id = p_user;
  update public.analytics_events set user_id = null, anon_id = null where user_id = p_user;
  update public.feedback set user_id = null where user_id = p_user;
  update public.test_orders set user_id = null, destination_snapshot = destination_snapshot - 'name', anonymized_at = now()
  where user_id = p_user and anonymized_at is null;
  update public.recommendation_runs set user_id = null where user_id = p_user;
  delete from public.recipe_ratings where user_id = p_user;
  delete from public.recipe_comments where user_id = p_user;
  delete from public.shopping_list_items where user_id = p_user;
  delete from public.recipe_view_history where user_id = p_user;
  delete from public.user_recipe_prefs where user_id = p_user;
  update public.recipe_versions set created_by = null where created_by = p_user;
  update public.recipe_media set created_by = null where created_by = p_user;
  update public.recipe_comments set moderated_by = null where moderated_by = p_user;
  update public.recipe_nutrition set validated_by_user = null where validated_by_user = p_user;
  update public.recipe_ingredient_products set validated_by = null where validated_by = p_user;
  -- herói que exclui a própria conta: o perfil público fica (conteúdo assinado), sem usuário. Sem
  -- isto o set null da cascata batia na guarda de colunas (user_id é protegida) e a exclusão falhava.
  update public.creator_profiles set user_id = null where user_id = p_user;
  -- Mesma razão: created_by é protegida em content (herói que criou pelo app ou duplicou receita) e
  -- em products (vendedor que cadastrou). Zerar aqui, ainda sob app.trusted, evita a falha da cascata.
  update public.content set created_by = null where created_by = p_user;
  update public.products set created_by = null where created_by = p_user;
  perform set_config('app.trusted', 'off', true);
end $$;

-- ---------------------------------------------------------------- limpeza do Stream nunca apaga receita
-- Mesmas assinaturas e grants da 0026. draft_id só para rascunho de VÍDEO; para outro tipo (receita
-- com vídeo do Stream, rascunho nunca publicado do mesmo herói) o descarte tira só a mídia do corpo.
create or replace function public.stream_cleanup_candidates(p_cutoff timestamptz, p_limit int)
returns table (uid text, draft_id uuid, referenced boolean)
language sql stable set search_path = public as $$
  select s.uid,
         (select c.id from public.content c join public.content_bodies b on b.content_id = c.id
          where b.media_provider = 'cloudflare_stream' and b.media_ref = s.uid and c.creator_id = s.creator_id
            and c.type = 'video' and c.status = 'draft' and c.published_at is null and (s.content_id is null or c.id = s.content_id)
          order by c.created_at limit 1),
         exists (select 1 from public.content_bodies b where b.media_provider = 'cloudflare_stream' and b.media_ref = s.uid)
  from public.stream_uploads s
  where s.discarded_at is null and s.provider_deleted_at is null and s.expires_at < p_cutoff
    and not exists (
      select 1 from public.content_bodies b join public.content c on c.id = b.content_id
      where b.media_provider = 'cloudflare_stream' and b.media_ref = s.uid
        and (c.status <> 'draft' or c.published_at is not null))
    and not exists (
      select 1 from public.content c
      where c.id = s.content_id and (c.status <> 'draft' or c.published_at is not null))
  order by s.checked_at asc nulls first, s.expires_at asc
  limit least(greatest(coalesce(p_limit, 0), 0), 500)
$$;

create or replace function public.stream_cleanup_discard(p_uid text, p_draft uuid)
returns boolean language plpgsql set search_path = public as $$
declare s public.stream_uploads%rowtype; c public.content%rowtype; r record;
begin
  select * into s from public.stream_uploads where uid = p_uid for update;
  if not found or s.discarded_at is not null or s.provider_deleted_at is not null then return false; end if;
  -- conteúdo do envio que já esteve no ar nunca entra (mesma regra da fila)
  if exists (select 1 from public.content x where x.id = s.content_id and (x.status <> 'draft' or x.published_at is not null)) then
    return false;
  end if;
  -- algum conteúdo que está ou esteve no ar usa o uid
  if exists (select 1 from public.content_bodies b join public.content x on x.id = b.content_id
             where b.media_provider = 'cloudflare_stream' and b.media_ref = p_uid
               and (x.status <> 'draft' or x.published_at is not null)) then
    return false;
  end if;

  if p_draft is null then
    -- só sobra corpo de rascunho nunca publicado, do mesmo herói e que não é vídeo (receita): o
    -- conteúdo fica, sem o vídeo (como sistema, sem tocar em body); qualquer outro uso barra
    if exists (select 1 from public.content_bodies b join public.content x on x.id = b.content_id
               where b.media_provider = 'cloudflare_stream' and b.media_ref = p_uid
                 and (x.type = 'video' or x.creator_id is distinct from s.creator_id
                      or (s.content_id is not null and s.content_id <> x.id))) then
      return false;
    end if;
    for r in select x.id, x.media_license_kind from public.content_bodies b join public.content x on x.id = b.content_id
             where b.media_provider = 'cloudflare_stream' and b.media_ref = p_uid
             for update of x loop
      -- sem mídia, a licença precisa ser compatível com 'none' (0017)
      if r.media_license_kind not in ('platform_demo', 'own') then
        update public.content set media_license_kind = 'own' where id = r.id;
      end if;
      update public.content_bodies set media_provider = 'none', media_ref = null where content_id = r.id;
      perform public.audit_log('content.cleanup_media', 'content', r.id::text, jsonb_build_object('media_ref', p_uid), null, null, 'system');
    end loop;
  else
    select * into c from public.content where id = p_draft for update;
    if not found or c.type <> 'video' or c.status <> 'draft' or c.published_at is not null or c.creator_id is distinct from s.creator_id
       or (s.content_id is not null and s.content_id <> p_draft)
       or not exists (select 1 from public.content_bodies b
                      where b.content_id = p_draft and b.media_provider = 'cloudflare_stream' and b.media_ref = p_uid)
       or exists (select 1 from public.content_bodies b
                  where b.media_provider = 'cloudflare_stream' and b.media_ref = p_uid and b.content_id <> p_draft) then
      return false;
    end if;
    begin
      delete from public.content where id = p_draft;
    exception when foreign_key_violation then
      return false; -- entrou num programa ou foi concluído por alguém: fica
    end;
    perform public.audit_log('content.cleanup_discard', 'content', p_draft::text,
      jsonb_build_object('status', c.status, 'slug', c.slug, 'title', c.title, 'media_ref', p_uid),
      null, null, 'system');
  end if;

  update public.stream_uploads set discarded_at = now() where uid = p_uid;
  return true;
end $$;

-- ---------------------------------------------------------------- corpo traduzido só com acesso
-- O select de content_localizations perdeu a coluna body (seção 2); quem pode consumir o conteúdo
-- lê o corpo traduzido publicado por aqui. Admin e herói dono leem também o rascunho da tradução.
create or replace function public.content_localized_body(p_content uuid, p_locale public.locale_code)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null or not public.can_access_content(p_content) then return null; end if;
  select l.body into v from public.content_localizations l
  where l.content_id = p_content and l.locale = p_locale
    and (l.status = 'published' or public.is_admin()
         or exists (select 1 from public.content c where c.id = p_content and c.creator_id = public.my_creator_id()));
  return v;
end $$;
revoke execute on function public.content_localized_body(uuid, public.locale_code) from public, anon;
grant execute on function public.content_localized_body(uuid, public.locale_code) to authenticated, service_role;

-- ================================================================ 6) RPCs novas
-- Todas security definer, search_path fixo, sem execute para public/anon. As do herói começam como a
-- 0025: uid nulo → 'unauthenticated'; conteúdo alheio ou inexistente → 'forbidden'. Toda escrita em
-- tabela filha filtra por content_id e confere o resultado.

-- ---------------------------------------------------------------- leitura do payload (internas)
-- Erro sempre como 'invalid_payload: <caminho>' (ex.: ingredients.3.unit), que a action traduz.
create or replace function public.recipe_payload_text(p_obj jsonb, p_key text, p_max int, p_path text, p_required boolean default false)
returns text language plpgsql immutable set search_path = public as $$
declare v jsonb := p_obj -> p_key; s text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if p_required then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
    return null;
  end if;
  if jsonb_typeof(v) <> 'string' then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
  s := btrim(v #>> '{}');
  if length(s) > p_max or (p_required and s = '') then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
  return nullif(s, '');
end $$;

create or replace function public.recipe_payload_num(p_obj jsonb, p_key text, p_min numeric, p_max numeric, p_path text,
  p_integer boolean default false, p_required boolean default false)
returns numeric language plpgsql immutable set search_path = public as $$
declare v jsonb := p_obj -> p_key; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if p_required then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
    return null;
  end if;
  if jsonb_typeof(v) <> 'number' then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
  n := (v #>> '{}')::numeric;
  if n < p_min or n > p_max or (p_integer and n <> trunc(n)) then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
  return n;
end $$;

create or replace function public.recipe_payload_bool(p_obj jsonb, p_key text, p_default boolean, p_path text)
returns boolean language plpgsql immutable set search_path = public as $$
declare v jsonb := p_obj -> p_key;
begin
  if v is null or jsonb_typeof(v) = 'null' then return p_default; end if;
  if jsonb_typeof(v) <> 'boolean' then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
  return (v #>> '{}')::boolean;
end $$;

create or replace function public.recipe_payload_uuid(p_obj jsonb, p_key text, p_path text, p_required boolean default false)
returns uuid language plpgsql immutable set search_path = public as $$
declare v jsonb := p_obj -> p_key; s text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if p_required then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
    return null;
  end if;
  s := lower(v #>> '{}');
  if jsonb_typeof(v) <> 'string' or s !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_payload: %', p_path using errcode = '22023';
  end if;
  return s::uuid;
end $$;

-- Lista de textos (etiquetas ou códigos): sem repetição, na ordem recebida; p_allowed nulo = livre.
create or replace function public.recipe_payload_list(p_obj jsonb, p_key text, p_allowed text[], p_max_items int, p_max_len int, p_path text)
returns text[] language plpgsql immutable set search_path = public as $$
declare v jsonb := p_obj -> p_key; e jsonb; s text; r text[] := '{}';
begin
  if v is null or jsonb_typeof(v) = 'null' then return r; end if;
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > p_max_items then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
  for e in select x from jsonb_array_elements(v) as x loop
    if jsonb_typeof(e) <> 'string' then raise exception 'invalid_payload: %', p_path using errcode = '22023'; end if;
    s := btrim(e #>> '{}');
    if s = '' or length(s) > p_max_len or (p_allowed is not null and not (s = any (p_allowed))) then
      raise exception 'invalid_payload: %', p_path using errcode = '22023';
    end if;
    if not (s = any (r)) then r := array_append(r, s); end if;
  end loop;
  return r;
end $$;

do $$ declare f text;
begin
  foreach f in array array['public.recipe_payload_text(jsonb, text, int, text, boolean)', 'public.recipe_payload_num(jsonb, text, numeric, numeric, text, boolean, boolean)',
                           'public.recipe_payload_bool(jsonb, text, boolean, text)', 'public.recipe_payload_uuid(jsonb, text, text, boolean)',
                           'public.recipe_payload_list(jsonb, text, text[], int, int, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- gravar a receita inteira (atômico)
-- Quem: dono com rascunho fora de revisão, ou admin (pode editar a publicada → versão 'admin_edit').
-- Lock da linha antes de comparar updated_at ('stale_draft'). Ordem: corpo/restore_point →
-- categorias → ingredientes → etapas → metadados de mídia → detalhes → extras → nutrição → content →
-- vídeo (sem trusted: a guarda do Stream roda como o herói) → marcador do corpo (trusted).
create or replace function public.recipe_save(p_content uuid, p_payload jsonb, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.content%rowtype;
  v_uid uuid := auth.uid(); v_admin boolean; v_creator uuid;
  v_marker constant jsonb := '{"kind": "recipe", "schema": 2}'::jsonb;
  v_units constant text[] := array['g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit', 'clove', 'bunch', 'sprig', 'fillet', 'slice', 'leaf', 'pinch', 'can', 'package'];
  v_diet_codes constant text[] := array['vegetarian', 'vegan', 'pescatarian', 'lactose_free', 'gluten_free', 'low_sugar', 'low_sodium'];
  v_allergen_codes constant text[] := array['peanut', 'tree_nuts', 'milk', 'egg', 'wheat', 'soy', 'fish', 'shellfish', 'sesame'];
  v_body jsonb; v_c jsonb; v_d jsonb; v_n jsonb; v_v jsonb; v_e jsonb; v_s jsonb; v_list jsonb; v_pairs jsonb := '[]'::jsonb;
  v_i int; v_j int; v_p text; v_id uuid; v_owner uuid; v_rows int;
  v_title text; v_summary text; v_tags text[]; v_difficulty text; v_pillar text; v_disclaimer text;
  v_license text; v_license_ref text; v_credit text;
  v_servings numeric; v_yield text; v_prep numeric; v_cook numeric; v_rest numeric; v_total numeric; v_story text;
  v_diets text[]; v_allergens text[]; v_declared boolean; v_allergen_notes text; v_cover uuid;
  v_cats text[] := '{}'; v_cat text; v_chef_note text;
  v_ing_ids uuid[] := '{}'; v_step_ids uuid[] := '{}'; v_terms text := '';
  v_name text; v_qty numeric; v_unit text; v_qtext text; v_taste boolean; v_opt boolean; v_note text; v_subs jsonb;
  v_sname text; v_sqty numeric; v_sunit text; v_sqtext text; v_snote text;
  v_instr text; v_dur numeric; v_temp numeric; v_tip text; v_img uuid; v_ref_id uuid;
  v_pos numeric; v_alt text; v_caption text;
  v_old_n public.recipe_nutrition%rowtype; v_has_n boolean; v_n_changed boolean;
  v_kcal numeric; v_prot numeric; v_carb numeric; v_fat numeric; v_fib numeric; v_sod numeric; v_src text; v_src_note text;
  v_provider text; v_ref text; v_cover_url text; v_updated timestamptz;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_admin := public.is_admin();
  v_creator := public.my_creator_id();
  -- lock antes de comparar updated_at: envio, publicação e a própria gravação serializam aqui
  select * into c from public.content where id = p_content for update;
  if not found or not (v_admin or (v_creator is not null and c.creator_id = v_creator)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.type <> 'recipe' then raise exception 'not_recipe' using errcode = '22023'; end if;
  if not v_admin and (c.status <> 'draft' or c.review_status = 'in_review') then
    raise exception 'content_not_editable' using errcode = '42501';
  end if;
  if p_expected_updated_at is distinct from c.updated_at then raise exception 'stale_draft'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_payload: payload' using errcode = '22023'; end if;
  -- reordenar troca posições entre linhas: a unicidade só é conferida no fim desta função
  set constraints public.recipe_ingredients_pos_uq, public.recipe_steps_pos_uq deferred;

  -- ---- corpo: receita antiga guarda o corpo v1 numa versão restore_point antes de qualquer escrita
  select b.body into v_body from public.content_bodies b where b.content_id = p_content for update;
  if not found then
    perform set_config('app.trusted', 'on', true);
    insert into public.content_bodies (content_id, body) values (p_content, v_marker);
    perform set_config('app.trusted', 'off', true);
  elsif v_body is distinct from v_marker
        and not exists (select 1 from public.recipe_versions where content_id = p_content and reason = 'restore_point') then
    insert into public.recipe_versions (content_id, version_no, reason, snapshot, snapshot_hash, created_by)
    select p_content, coalesce(max(version_no), 0) + 1, 'restore_point', jsonb_build_object('legacy_body', v_body),
           md5(jsonb_build_object('legacy_body', v_body)::text), v_uid
    from public.recipe_versions where content_id = p_content;
  end if;

  -- ---- content (validação; a escrita vem depois dos detalhes, por causa da capa)
  v_c := coalesce(p_payload -> 'content', '{}'::jsonb);
  if jsonb_typeof(v_c) <> 'object' then raise exception 'invalid_payload: content' using errcode = '22023'; end if;
  v_title := public.recipe_payload_text(v_c, 'title', 140, 'content.title', true);
  v_summary := public.recipe_payload_text(v_c, 'summary', 600, 'content.summary');
  v_tags := public.recipe_payload_list(v_c, 'tags', null, 12, 30, 'content.tags');
  v_difficulty := public.recipe_payload_text(v_c, 'difficulty', 20, 'content.difficulty');
  if v_difficulty is not null and v_difficulty not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'invalid_payload: content.difficulty' using errcode = '22023';
  end if;
  v_pillar := coalesce(public.recipe_payload_text(v_c, 'pillar', 20, 'content.pillar'), c.pillar::text);
  if v_pillar not in ('routine', 'training', 'nutrition', 'gastronomy') then raise exception 'invalid_payload: content.pillar' using errcode = '22023'; end if;
  v_disclaimer := public.recipe_payload_text(v_c, 'disclaimer_kind', 20, 'content.disclaimer_kind');
  if v_disclaimer is not null and v_disclaimer not in ('general', 'training', 'nutrition', 'none') then
    raise exception 'invalid_payload: content.disclaimer_kind' using errcode = '22023';
  end if;
  v_license := coalesce(public.recipe_payload_text(v_c, 'media_license_kind', 30, 'content.media_license_kind'), c.media_license_kind);
  if v_license not in ('platform_demo', 'own', 'licensed', 'third_party_embed') then
    raise exception 'invalid_payload: content.media_license_kind' using errcode = '22023';
  end if;
  v_license_ref := public.recipe_payload_text(v_c, 'media_license_ref', 300, 'content.media_license_ref');
  v_credit := public.recipe_payload_text(v_c, 'media_credit', 160, 'content.media_credit');

  -- ---- detalhes (validação; o salvamento parcial aceita receita incompleta)
  v_d := coalesce(p_payload -> 'details', '{}'::jsonb);
  if jsonb_typeof(v_d) <> 'object' then raise exception 'invalid_payload: details' using errcode = '22023'; end if;
  v_servings := public.recipe_payload_num(v_d, 'servings', 1, 100, 'details.servings', true);
  v_yield := public.recipe_payload_text(v_d, 'yield_text', 60, 'details.yield_text');
  v_prep := public.recipe_payload_num(v_d, 'prep_minutes', 0, 1440, 'details.prep_minutes', true);
  v_cook := public.recipe_payload_num(v_d, 'cook_minutes', 0, 1440, 'details.cook_minutes', true);
  v_rest := public.recipe_payload_num(v_d, 'rest_minutes', 0, 2880, 'details.rest_minutes', true);
  v_total := public.recipe_payload_num(v_d, 'total_minutes', 1, 4320, 'details.total_minutes', true);
  v_story := public.recipe_payload_text(v_d, 'story', 4000, 'details.story');
  v_diets := public.recipe_payload_list(v_d, 'diets', v_diet_codes, 7, 20, 'details.diets');
  v_allergens := public.recipe_payload_list(v_d, 'allergens', v_allergen_codes, 9, 20, 'details.allergens');
  v_declared := public.recipe_payload_bool(v_d, 'allergens_declared', false, 'details.allergens_declared');
  if not v_declared and cardinality(v_allergens) > 0 then raise exception 'invalid_payload: details.allergens_declared' using errcode = '22023'; end if;
  v_allergen_notes := public.recipe_payload_text(v_d, 'allergen_notes', 300, 'details.allergen_notes');
  v_cover := public.recipe_payload_uuid(v_d, 'cover_media_id', 'details.cover_media_id');

  -- ---- categorias (até 3, só as ativas)
  v_list := coalesce(p_payload -> 'categories', '[]'::jsonb);
  if jsonb_typeof(v_list) <> 'array' then raise exception 'invalid_payload: categories' using errcode = '22023'; end if;
  if jsonb_array_length(v_list) > 3 then raise exception 'too_many_categories' using errcode = '22023'; end if;
  for v_e in select x from jsonb_array_elements(v_list) as x loop
    if jsonb_typeof(v_e) <> 'string' then raise exception 'invalid_payload: categories' using errcode = '22023'; end if;
    v_cat := v_e #>> '{}';
    if not exists (select 1 from public.recipe_categories k where k.code = v_cat and k.active) then
      raise exception 'invalid_category' using errcode = '22023';
    end if;
    if not (v_cat = any (v_cats)) then v_cats := array_append(v_cats, v_cat); end if;
  end loop;
  delete from public.recipe_category_links where content_id = p_content and not (category_code = any (v_cats));
  insert into public.recipe_category_links (content_id, category_code) select p_content, x from unnest(v_cats) as x
  on conflict do nothing;

  -- ---- ingredientes: upsert pelo id do cliente; id de outra receita é 'forbidden'; ausentes saem
  v_list := coalesce(p_payload -> 'ingredients', '[]'::jsonb);
  if jsonb_typeof(v_list) <> 'array' then raise exception 'invalid_payload: ingredients' using errcode = '22023'; end if;
  if jsonb_array_length(v_list) > 60 then raise exception 'too_many_ingredients' using errcode = '22023'; end if;
  for v_e, v_i in select t.e, (t.o - 1)::int from jsonb_array_elements(v_list) with ordinality as t(e, o) loop
    v_p := 'ingredients.' || v_i;
    if jsonb_typeof(v_e) <> 'object' then raise exception 'invalid_payload: %', v_p using errcode = '22023'; end if;
    v_id := public.recipe_payload_uuid(v_e, 'id', v_p || '.id', true);
    if v_id = any (v_ing_ids) then raise exception 'invalid_payload: %.id', v_p using errcode = '22023'; end if;
    v_name := public.recipe_payload_text(v_e, 'name', 120, v_p || '.name', true);
    v_qty := public.recipe_payload_num(v_e, 'quantity', 0.001, 100000, v_p || '.quantity');
    v_unit := public.recipe_payload_text(v_e, 'unit', 20, v_p || '.unit');
    if v_unit is not null and not (v_unit = any (v_units)) then raise exception 'invalid_payload: %.unit', v_p using errcode = '22023'; end if;
    v_qtext := public.recipe_payload_text(v_e, 'quantity_text', 60, v_p || '.quantity_text');
    v_taste := public.recipe_payload_bool(v_e, 'to_taste', false, v_p || '.to_taste');
    v_opt := public.recipe_payload_bool(v_e, 'optional', false, v_p || '.optional');
    v_note := public.recipe_payload_text(v_e, 'note', 200, v_p || '.note');
    if v_taste and (v_qty is not null or v_unit is not null or v_qtext is not null) then
      raise exception 'invalid_payload: %.to_taste', v_p using errcode = '22023';
    end if;
    if v_qty is not null and v_qtext is not null then raise exception 'invalid_payload: %.quantity_text', v_p using errcode = '22023'; end if;
    if v_qty is null and v_unit is not null then raise exception 'invalid_payload: %.unit', v_p using errcode = '22023'; end if;
    v_s := coalesce(v_e -> 'substitutions', '[]'::jsonb);
    if jsonb_typeof(v_s) <> 'array' or jsonb_array_length(v_s) > 5 then
      raise exception 'invalid_payload: %.substitutions', v_p using errcode = '22023';
    end if;
    v_subs := '[]'::jsonb;
    for v_v, v_j in select t.e, (t.o - 1)::int from jsonb_array_elements(v_s) with ordinality as t(e, o) loop
      if jsonb_typeof(v_v) <> 'object' then raise exception 'invalid_payload: %.substitutions.%', v_p, v_j using errcode = '22023'; end if;
      v_sname := public.recipe_payload_text(v_v, 'name', 120, v_p || '.substitutions.' || v_j || '.name', true);
      v_sqty := public.recipe_payload_num(v_v, 'quantity', 0.001, 100000, v_p || '.substitutions.' || v_j || '.quantity');
      v_sunit := public.recipe_payload_text(v_v, 'unit', 20, v_p || '.substitutions.' || v_j || '.unit');
      if v_sunit is not null and (v_sqty is null or not (v_sunit = any (v_units))) then
        raise exception 'invalid_payload: %.substitutions.%.unit', v_p, v_j using errcode = '22023';
      end if;
      v_sqtext := public.recipe_payload_text(v_v, 'quantity_text', 60, v_p || '.substitutions.' || v_j || '.quantity_text');
      v_snote := public.recipe_payload_text(v_v, 'note', 200, v_p || '.substitutions.' || v_j || '.note');
      v_subs := v_subs || jsonb_build_array(jsonb_build_object('name', v_sname, 'quantity', v_sqty, 'unit', v_sunit,
                                                               'quantity_text', v_sqtext, 'note', v_snote));
      v_terms := v_terms || ' ' || v_sname;
    end loop;
    select i.content_id into v_owner from public.recipe_ingredients i where i.id = v_id;
    if found and v_owner <> p_content then raise exception 'forbidden' using errcode = '42501'; end if;
    insert into public.recipe_ingredients (id, content_id, position, name, quantity, unit, quantity_text, to_taste, optional, note, substitutions)
    values (v_id, p_content, v_i + 1, v_name, v_qty, v_unit, v_qtext, v_taste, v_opt, v_note, v_subs)
    on conflict (id) do update set position = excluded.position, name = excluded.name, quantity = excluded.quantity, unit = excluded.unit,
      quantity_text = excluded.quantity_text, to_taste = excluded.to_taste, optional = excluded.optional, note = excluded.note,
      substitutions = excluded.substitutions
    where public.recipe_ingredients.content_id = p_content;
    v_ing_ids := array_append(v_ing_ids, v_id);
    v_terms := v_terms || ' ' || v_name;
  end loop;
  delete from public.recipe_ingredients where content_id = p_content and not (id = any (v_ing_ids));

  -- ---- etapas (+ ingredientes de cada etapa e foto de etapa; FKs compostas garantem a mesma receita)
  v_list := coalesce(p_payload -> 'steps', '[]'::jsonb);
  if jsonb_typeof(v_list) <> 'array' then raise exception 'invalid_payload: steps' using errcode = '22023'; end if;
  if jsonb_array_length(v_list) > 40 then raise exception 'too_many_steps' using errcode = '22023'; end if;
  for v_e, v_i in select t.e, (t.o - 1)::int from jsonb_array_elements(v_list) with ordinality as t(e, o) loop
    v_p := 'steps.' || v_i;
    if jsonb_typeof(v_e) <> 'object' then raise exception 'invalid_payload: %', v_p using errcode = '22023'; end if;
    v_id := public.recipe_payload_uuid(v_e, 'id', v_p || '.id', true);
    if v_id = any (v_step_ids) then raise exception 'invalid_payload: %.id', v_p using errcode = '22023'; end if;
    v_instr := public.recipe_payload_text(v_e, 'instruction', 1200, v_p || '.instruction', true);
    v_dur := public.recipe_payload_num(v_e, 'duration_seconds', 1, 86400, v_p || '.duration_seconds', true);
    v_temp := public.recipe_payload_num(v_e, 'temperature_c', -30, 320, v_p || '.temperature_c', true);
    v_tip := public.recipe_payload_text(v_e, 'tip', 400, v_p || '.tip');
    v_img := public.recipe_payload_uuid(v_e, 'image_media_id', v_p || '.image_media_id');
    v_s := coalesce(v_e -> 'ingredient_ids', '[]'::jsonb);
    if jsonb_typeof(v_s) <> 'array' then raise exception 'invalid_payload: %.ingredient_ids', v_p using errcode = '22023'; end if;
    for v_v in select x from jsonb_array_elements(v_s) as x loop
      v_ref_id := public.recipe_payload_uuid(jsonb_build_object('v', v_v), 'v', v_p || '.ingredient_ids', true);
      if not (v_ref_id = any (v_ing_ids)) then raise exception 'invalid_payload: %.ingredient_ids', v_p using errcode = '22023'; end if;
      v_pairs := v_pairs || jsonb_build_array(jsonb_build_object('s', v_id, 'i', v_ref_id));
    end loop;
    select s.content_id into v_owner from public.recipe_steps s where s.id = v_id;
    if found and v_owner <> p_content then raise exception 'forbidden' using errcode = '42501'; end if;
    insert into public.recipe_steps (id, content_id, position, instruction, duration_seconds, temperature_c, tip, image_media_id)
    values (v_id, p_content, v_i + 1, v_instr, v_dur::int, v_temp::smallint, v_tip, v_img)
    on conflict (id) do update set position = excluded.position, instruction = excluded.instruction, duration_seconds = excluded.duration_seconds,
      temperature_c = excluded.temperature_c, tip = excluded.tip, image_media_id = excluded.image_media_id
    where public.recipe_steps.content_id = p_content;
    v_step_ids := array_append(v_step_ids, v_id);
  end loop;
  delete from public.recipe_steps where content_id = p_content and not (id = any (v_step_ids));
  delete from public.recipe_step_ingredients where content_id = p_content;
  insert into public.recipe_step_ingredients (content_id, step_id, ingredient_id)
  select distinct p_content, (x ->> 's')::uuid, (x ->> 'i')::uuid from jsonb_array_elements(v_pairs) as x;

  -- ---- metadados da mídia (texto alternativo, legenda, ordem): só da própria receita
  v_list := p_payload -> 'media';
  if v_list is not null and jsonb_typeof(v_list) <> 'null' then
    if jsonb_typeof(v_list) <> 'array' then raise exception 'invalid_payload: media' using errcode = '22023'; end if;
    for v_e, v_i in select t.e, (t.o - 1)::int from jsonb_array_elements(v_list) with ordinality as t(e, o) loop
      v_p := 'media.' || v_i;
      if jsonb_typeof(v_e) <> 'object' then raise exception 'invalid_payload: %', v_p using errcode = '22023'; end if;
      v_id := public.recipe_payload_uuid(v_e, 'id', v_p || '.id', true);
      v_pos := public.recipe_payload_num(v_e, 'position', 1, 40, v_p || '.position', true);
      v_alt := public.recipe_payload_text(v_e, 'alt_text', 200, v_p || '.alt_text');
      v_caption := public.recipe_payload_text(v_e, 'caption', 200, v_p || '.caption');
      update public.recipe_media set position = coalesce(v_pos::smallint, position), alt_text = v_alt, caption = v_caption
      where id = v_id and content_id = p_content;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'media_not_owned' using errcode = '42501'; end if;
    end loop;
  end if;

  -- ---- detalhes (capa de outra receita viola a FK composta)
  insert into public.recipe_details (content_id, servings, yield_text, prep_minutes, cook_minutes, rest_minutes, total_minutes, story,
                                     diets, allergens, allergens_declared, allergen_notes, cover_media_id)
  values (p_content, v_servings::smallint, v_yield, v_prep::smallint, v_cook::smallint, v_rest::smallint, v_total::smallint, v_story,
          v_diets, v_allergens, v_declared, v_allergen_notes, v_cover)
  on conflict (content_id) do update set servings = excluded.servings, yield_text = excluded.yield_text, prep_minutes = excluded.prep_minutes,
    cook_minutes = excluded.cook_minutes, rest_minutes = excluded.rest_minutes, total_minutes = excluded.total_minutes, story = excluded.story,
    diets = excluded.diets, allergens = excluded.allergens, allergens_declared = excluded.allergens_declared,
    allergen_notes = excluded.allergen_notes, cover_media_id = excluded.cover_media_id;

  -- ---- extras (protegidos): nota do chef e termos de busca dos ingredientes
  v_list := coalesce(p_payload -> 'extras', '{}'::jsonb);
  if jsonb_typeof(v_list) <> 'object' then raise exception 'invalid_payload: extras' using errcode = '22023'; end if;
  v_chef_note := public.recipe_payload_text(v_list, 'chef_note', 600, 'extras.chef_note');
  insert into public.recipe_extras (content_id, chef_note, ingredient_terms)
  values (p_content, v_chef_note, to_tsvector('simple', public.f_unaccent(v_terms)))
  on conflict (content_id) do update set chef_note = excluded.chef_note, ingredient_terms = excluded.ingredient_terms;

  -- ---- nutrição: null remove; a validação é do admin e cai quando os números ou a origem mudam
  if p_payload ? 'nutrition' then
    v_n := p_payload -> 'nutrition';
    if jsonb_typeof(v_n) = 'null' then
      delete from public.recipe_nutrition where content_id = p_content;
    elsif jsonb_typeof(v_n) <> 'object' then
      raise exception 'invalid_payload: nutrition' using errcode = '22023';
    else
      if v_n ?| array['validated', 'validated_by', 'validated_at', 'validation_note', 'validated_by_user'] and not v_admin then
        raise exception 'nutrition_validation_forbidden' using errcode = '42501';
      end if;
      v_kcal := round(public.recipe_payload_num(v_n, 'kcal', 0, 100000, 'nutrition.kcal'), 1);
      v_prot := round(public.recipe_payload_num(v_n, 'protein_g', 0, 100000, 'nutrition.protein_g'), 1);
      v_carb := round(public.recipe_payload_num(v_n, 'carbs_g', 0, 100000, 'nutrition.carbs_g'), 1);
      v_fat := round(public.recipe_payload_num(v_n, 'fat_g', 0, 100000, 'nutrition.fat_g'), 1);
      v_fib := round(public.recipe_payload_num(v_n, 'fiber_g', 0, 100000, 'nutrition.fiber_g'), 1);
      v_sod := round(public.recipe_payload_num(v_n, 'sodium_mg', 0, 100000, 'nutrition.sodium_mg'), 1);
      v_src := coalesce(public.recipe_payload_text(v_n, 'source', 20, 'nutrition.source'), 'chef');
      if v_src not in ('chef', 'nutritionist', 'food_table', 'lab') then raise exception 'invalid_payload: nutrition.source' using errcode = '22023'; end if;
      v_src_note := public.recipe_payload_text(v_n, 'source_note', 200, 'nutrition.source_note');
      select * into v_old_n from public.recipe_nutrition where content_id = p_content;
      v_has_n := found;
      v_n_changed := v_has_n and (v_kcal, v_prot, v_carb, v_fat, v_fib, v_sod, v_src)
                     is distinct from (v_old_n.kcal, v_old_n.protein_g, v_old_n.carbs_g, v_old_n.fat_g, v_old_n.fiber_g, v_old_n.sodium_mg, v_old_n.source);
      insert into public.recipe_nutrition (content_id, kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source, source_note)
      values (p_content, v_kcal, v_prot, v_carb, v_fat, v_fib, v_sod, v_src, v_src_note)
      on conflict (content_id) do update set kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, sodium_mg = excluded.sodium_mg, source = excluded.source, source_note = excluded.source_note;
      -- para o herói o gatilho já derrubou; o admin passa pelo gatilho, então derruba aqui
      if v_admin and v_n_changed then
        update public.recipe_nutrition set validated = false, validated_by = null, validated_at = null, validation_note = null, validated_by_user = null
        where content_id = p_content;
      end if;
    end if;
  end if;

  -- ---- content: campos editoriais, tempo total e capa a partir da foto escolhida
  v_cover_url := case when v_cover is not null then '/media/recipe/' || v_cover::text
                      when c.cover_url like '/media/recipe/%' then null
                      else c.cover_url end;
  update public.content
  set title = v_title, summary = v_summary, tags = v_tags, difficulty = v_difficulty, pillar = v_pillar::public.pillar,
      disclaimer_kind = v_disclaimer, media_license_kind = v_license, media_license_ref = v_license_ref, media_credit = v_credit,
      duration_minutes = v_total::int, cover_url = v_cover_url
  where id = p_content;

  -- ---- vídeo: ausente mantém o atual; update separado e SEM trusted (a guarda do Stream da 0026
  -- roda com o uid do herói: uid alheio dá 'stream_media_forbidden')
  if p_payload ? 'video' and jsonb_typeof(p_payload -> 'video') <> 'null' then
    v_v := p_payload -> 'video';
    if jsonb_typeof(v_v) <> 'object' then raise exception 'invalid_payload: video' using errcode = '22023'; end if;
    v_provider := public.recipe_payload_text(v_v, 'provider', 30, 'video.provider', true);
    if v_provider not in ('none', 'embed_youtube', 'embed_vimeo', 'cloudflare_stream') then
      raise exception 'invalid_payload: video.provider' using errcode = '22023';
    end if;
    v_ref := public.recipe_payload_text(v_v, 'ref', 300, 'video.ref');
    if v_provider = 'none' then v_ref := null;
    elsif v_ref is null then raise exception 'invalid_payload: video.ref' using errcode = '22023';
    end if;
    update public.content_bodies set media_provider = v_provider::public.media_provider, media_ref = v_ref where content_id = p_content;
  end if;

  -- ---- por último, como função confiável: o corpo vira o marcador (o v1 já está no restore_point)
  perform set_config('app.trusted', 'on', true);
  update public.content_bodies set body = v_marker where content_id = p_content and body is distinct from v_marker;
  perform set_config('app.trusted', 'off', true);
  set constraints public.recipe_ingredients_pos_uq, public.recipe_steps_pos_uq immediate;

  -- admin editando receita no ar: continua publicável e vira versão própria
  if c.status = 'published' then
    perform public.recipe_assert_publishable(p_content);
    perform public.recipe_snapshot(p_content, 'admin_edit');
  end if;
  select updated_at into v_updated from public.content where id = p_content;
  return jsonb_build_object('updated_at', v_updated);
end $$;
revoke execute on function public.recipe_save(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.recipe_save(uuid, jsonb, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------- registrar a foto enviada ao Storage
-- mime e bytes vêm de storage.objects.metadata do objeto do próprio usuário (o cliente não decide);
-- largura e altura são só dica. Cota diária por herói com lock (P3: contas demo seguem só a cota).
create or replace function public.recipe_register_media(p_content uuid, p_path text, p_role text, p_alt text, p_rights boolean,
  p_width int, p_height int)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid; v_meta jsonb; v_mime text; v_size bigint;
        v_parts text[]; v_ext text; v_total int; v_gallery int; v_count bigint; v_bytes bigint; v_id uuid; v_pos int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.type <> 'recipe' then raise exception 'not_recipe' using errcode = '22023'; end if;
  if c.status <> 'draft' or c.review_status = 'in_review' then raise exception 'content_not_editable' using errcode = '42501'; end if;
  if not public.recipe_setting_on('recipes.uploads_enabled') then raise exception 'uploads_disabled'; end if;
  if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  v_parts := string_to_array(p_path, '/');
  if v_parts[1] <> v_creator::text or v_parts[2] <> p_content::text then raise exception 'invalid_path' using errcode = '22023'; end if;
  if p_role is null or p_role not in ('gallery', 'step') then raise exception 'invalid_payload: role' using errcode = '22023'; end if;
  if p_rights is not true then raise exception 'rights_required' using errcode = '22023'; end if;
  if p_alt is not null and length(btrim(p_alt)) > 200 then raise exception 'invalid_payload: alt_text' using errcode = '22023'; end if;
  if (p_width is not null and p_width not between 1 and 8000) or (p_height is not null and p_height not between 1 and 8000) then
    raise exception 'invalid_payload: size' using errcode = '22023';
  end if;
  if to_regclass('storage.objects') is null then raise exception 'object_not_found'; end if;
  execute 'select coalesce(metadata, ''{}''::jsonb) from storage.objects where bucket_id = $1 and name = $2 and owner_id = $3'
    into v_meta using 'recipe-media', p_path, v_uid::text;
  if v_meta is null then raise exception 'object_not_found'; end if;
  v_mime := v_meta ->> 'mimetype';
  v_ext := substring(p_path from '\.([a-z]+)$');
  if v_mime is null or not ((v_mime = 'image/jpeg' and v_ext = 'jpg') or (v_mime = 'image/png' and v_ext = 'png') or (v_mime = 'image/webp' and v_ext = 'webp')) then
    raise exception 'invalid_mime' using errcode = '22023';
  end if;
  v_size := case when (v_meta ->> 'size') ~ '^[0-9]{1,12}$' then (v_meta ->> 'size')::bigint end;
  if v_size is null or v_size < 1 or v_size > 5242880 then raise exception 'too_large' using errcode = '22023'; end if;
  if exists (select 1 from public.recipe_media m where m.storage_path = p_path) then raise exception 'already_registered' using errcode = '23505'; end if;
  select count(*), count(*) filter (where m.role = 'gallery') into v_total, v_gallery from public.recipe_media m where m.content_id = p_content;
  if v_total >= 30 or (p_role = 'gallery' and v_gallery >= 12) then raise exception 'too_many_media'; end if;
  -- mesma regra da política de insert: menos de 50 objetos e de 100 MB nas últimas 24 h, sem contar este
  perform pg_advisory_xact_lock(hashtext('recipe_media:' || v_creator::text));
  execute 'select count(*), coalesce(sum(case when (metadata ->> ''size'') ~ ''^[0-9]{1,12}$'' then (metadata ->> ''size'')::bigint else 0 end), 0) '
          'from storage.objects where bucket_id = $1 and owner_id = $2 and created_at > now() - interval ''1 day'' and name <> $3'
    into v_count, v_bytes using 'recipe-media', v_uid::text, p_path;
  if v_count >= 50 or v_bytes >= 104857600 then raise exception 'upload_quota_exceeded'; end if;
  select least(coalesce(max(m.position), 0) + 1, 40) into v_pos from public.recipe_media m where m.content_id = p_content and m.role = p_role;
  insert into public.recipe_media (content_id, creator_id, role, position, storage_path, mime, bytes, width, height, alt_text, rights_confirmed_at, created_by)
  values (p_content, c.creator_id, p_role, v_pos, p_path, v_mime, v_size::int, p_width::smallint, p_height::smallint, nullif(btrim(p_alt), ''), now(), v_uid)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.recipe_register_media(uuid, text, text, text, boolean, int, int) from public, anon;
grant execute on function public.recipe_register_media(uuid, text, text, text, boolean, int, int) to authenticated, service_role;

-- Apaga a linha (capa e foto de etapa viram nulas pelas FKs) e devolve o caminho; o app apaga o
-- objeto no Storage e, se falhar, a limpeza diária o recolhe como órfão.
create or replace function public.recipe_delete_media(p_media uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid; v_path text; v_content uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select m.content_id into v_content from public.recipe_media m where m.id = p_media;
  select * into c from public.content where id = v_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'draft' or c.review_status = 'in_review' then raise exception 'content_not_editable' using errcode = '42501'; end if;
  delete from public.recipe_media where id = p_media and content_id = c.id returning storage_path into v_path;
  if v_path is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.cover_url = '/media/recipe/' || p_media::text then
    update public.content set cover_url = null where id = c.id;
  end if;
  return jsonb_build_object('path', v_path);
end $$;
revoke execute on function public.recipe_delete_media(uuid) from public, anon;
grant execute on function public.recipe_delete_media(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- ciclo de vida pelo herói
-- Retirar da revisão: fecha a rodada como devolvida e volta a rascunho editável.
create or replace function public.creator_withdraw_review(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.review_status <> 'in_review' then raise exception 'not_in_review'; end if;
  update public.content_reviews set decision = 'returned', feedback = 'Retirado pelo herói', decided_by = v_uid, decided_at = now()
  where content_id = p_content and decision = 'in_review';
  perform set_config('app.trusted', 'on', true);
  update public.content set review_status = 'none' where id = p_content;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.creator_withdraw', 'content', p_content::text,
    jsonb_build_object('review_status', c.review_status), jsonb_build_object('review_status', 'none'), null, 'creator');
  return jsonb_build_object('id', c.id, 'review_status', 'none');
end $$;
revoke execute on function public.creator_withdraw_review(uuid) from public, anon;
grant execute on function public.creator_withdraw_review(uuid) to authenticated, service_role;

-- Arquivar o próprio conteúdo (qualquer status, menos já arquivado). Em revisão, fecha a rodada.
create or replace function public.creator_archive_content(p_content uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status = 'archived' then raise exception 'already_archived'; end if;
  if c.review_status = 'in_review' then
    update public.content_reviews set decision = 'returned', feedback = 'Arquivada pelo herói', decided_by = v_uid, decided_at = now()
    where content_id = p_content and decision = 'in_review';
  end if;
  perform set_config('app.trusted', 'on', true);
  update public.content
  set status = 'archived', archived_at = now(), archived_by = 'creator', publish_at = null,
      review_status = case when c.review_status = 'in_review' then 'none'::public.review_status else c.review_status end
  where id = p_content;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.creator_archive', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'archived', 'archived_by', 'creator'), nullif(btrim(coalesce(p_reason, '')), ''), 'creator');
  return jsonb_build_object('id', c.id, 'status', 'archived');
end $$;
revoke execute on function public.creator_archive_content(uuid, text) from public, anon;
grant execute on function public.creator_archive_content(uuid, text) to authenticated, service_role;

-- Restaurar: só o que o próprio herói arquivou; volta a rascunho. O que o admin arquivou é trava dele.
create or replace function public.creator_restore_content(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'archived' then raise exception 'not_archived'; end if;
  if c.archived_by is distinct from 'creator' then raise exception 'archived_by_admin'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.content set status = 'draft', review_status = 'none', archived_at = null, archived_by = null where id = p_content;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.creator_restore', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'archived_by', c.archived_by), jsonb_build_object('status', 'draft'), null, 'creator');
  return jsonb_build_object('id', c.id, 'status', 'draft');
end $$;
revoke execute on function public.creator_restore_content(uuid) from public, anon;
grant execute on function public.creator_restore_content(uuid) to authenticated, service_role;

-- Excluir: só rascunho de receita que nunca foi ao ar (modelo de creator_discard_video_draft).
-- Devolve os caminhos das fotos (o app apaga no Storage) e o uid do Stream deste rascunho, se houver.
create or replace function public.creator_delete_recipe_draft(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid; v_paths text[]; v_provider public.media_provider; v_ref text; v_owned text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.type <> 'recipe' then raise exception 'not_recipe' using errcode = '22023'; end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if c.published_at is not null then raise exception 'already_published'; end if;
  if c.review_status = 'in_review' then raise exception 'content_not_editable' using errcode = '42501'; end if;
  select coalesce(array_agg(m.storage_path order by m.storage_path), '{}') into v_paths from public.recipe_media m where m.content_id = p_content;
  select b.media_provider, b.media_ref into v_provider, v_ref from public.content_bodies b where b.content_id = p_content;
  if v_provider = 'cloudflare_stream' then
    select s.uid into v_owned from public.stream_uploads s
    where s.uid = v_ref and s.creator_id = v_creator and s.discarded_at is null and (s.content_id is null or s.content_id = p_content)
      and not exists (select 1 from public.content_bodies b2 where b2.media_provider = 'cloudflare_stream' and b2.media_ref = v_ref and b2.content_id <> p_content)
    for update of s;
  end if;
  begin
    delete from public.content where id = p_content;
  exception when foreign_key_violation then
    raise exception 'content_in_use';
  end;
  if v_owned is not null then update public.stream_uploads set discarded_at = now() where uid = v_owned; end if;
  perform public.audit_log('content.creator_delete', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'slug', c.slug, 'title', c.title, 'media_paths', to_jsonb(v_paths), 'media_ref', v_ref),
    null, null, 'creator');
  return jsonb_build_object('id', c.id, 'paths', to_jsonb(v_paths), 'uid', v_owned);
end $$;
revoke execute on function public.creator_delete_recipe_draft(uuid) from public, anon;
grant execute on function public.creator_delete_recipe_draft(uuid) to authenticated, service_role;

-- Duplicar: novo rascunho com ids novos (detalhes, extras, categorias, ingredientes, etapas e nutrição
-- sem validação). Não copia mídia, vídeo, vínculos, avaliações nem versões. Origem arquivada pelo
-- admin ou rejeitada é trava ('source_locked'): duplicar não pode contorná-la.
create or replace function public.creator_duplicate_recipe(p_content uuid, p_title text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid; v_new uuid := gen_random_uuid(); v_title text;
        v_ing jsonb; v_steps jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.type <> 'recipe' then raise exception 'not_recipe' using errcode = '22023'; end if;
  if (c.status = 'archived' and c.archived_by is distinct from 'creator') or c.review_status = 'rejected' then raise exception 'source_locked'; end if;
  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null or length(v_title) > 140 then raise exception 'invalid_payload: title' using errcode = '22023'; end if;
  if p_slug is null or length(p_slug) > 120 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'invalid_slug' using errcode = '22023'; end if;
  begin
    insert into public.content (id, slug, creator_id, pillar, type, source_locale, title, summary, cover_url, duration_minutes, difficulty, tags,
                                disclaimer_kind, media_license_kind, status, review_status, created_by)
    values (v_new, p_slug, c.creator_id, c.pillar, 'recipe', c.source_locale, v_title, c.summary,
            case when c.cover_url like '/media/recipe/%' then null else c.cover_url end, c.duration_minutes, c.difficulty, c.tags,
            c.disclaimer_kind, case when c.media_license_kind in ('platform_demo', 'own') then c.media_license_kind else 'platform_demo' end,
            'draft', 'none', v_uid);
  exception when unique_violation then
    raise exception 'slug_taken';
  end;
  perform set_config('app.trusted', 'on', true);
  insert into public.content_bodies (content_id, body) values (v_new, '{"kind": "recipe", "schema": 2}'::jsonb);
  perform set_config('app.trusted', 'off', true);
  insert into public.recipe_details (content_id, servings, yield_text, prep_minutes, cook_minutes, rest_minutes, total_minutes, story,
                                     diets, allergens, allergens_declared, allergen_notes)
  select v_new, d.servings, d.yield_text, d.prep_minutes, d.cook_minutes, d.rest_minutes, d.total_minutes, d.story,
         d.diets, d.allergens, d.allergens_declared, d.allergen_notes
  from public.recipe_details d where d.content_id = p_content;
  insert into public.recipe_extras (content_id, chef_note, ingredient_terms)
  select v_new, x.chef_note, x.ingredient_terms from public.recipe_extras x where x.content_id = p_content;
  insert into public.recipe_category_links (content_id, category_code)
  select v_new, l.category_code from public.recipe_category_links l where l.content_id = p_content;
  -- mapa id antigo → id novo (as etapas apontam para os ingredientes pelo id)
  select jsonb_object_agg(i.id::text, gen_random_uuid()) into v_ing from public.recipe_ingredients i where i.content_id = p_content;
  select jsonb_object_agg(s.id::text, gen_random_uuid()) into v_steps from public.recipe_steps s where s.content_id = p_content;
  insert into public.recipe_ingredients (id, content_id, position, name, quantity, unit, quantity_text, to_taste, optional, note, substitutions, source_qty)
  select (v_ing ->> i.id::text)::uuid, v_new, i.position, i.name, i.quantity, i.unit, i.quantity_text, i.to_taste, i.optional, i.note, i.substitutions, i.source_qty
  from public.recipe_ingredients i where i.content_id = p_content;
  insert into public.recipe_steps (id, content_id, position, instruction, duration_seconds, temperature_c, tip)
  select (v_steps ->> s.id::text)::uuid, v_new, s.position, s.instruction, s.duration_seconds, s.temperature_c, s.tip
  from public.recipe_steps s where s.content_id = p_content;
  insert into public.recipe_step_ingredients (content_id, step_id, ingredient_id)
  select v_new, (v_steps ->> si.step_id::text)::uuid, (v_ing ->> si.ingredient_id::text)::uuid
  from public.recipe_step_ingredients si where si.content_id = p_content;
  insert into public.recipe_nutrition (content_id, kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source, source_note)
  select v_new, n.kcal, n.protein_g, n.carbs_g, n.fat_g, n.fiber_g, n.sodium_mg, n.source, n.source_note
  from public.recipe_nutrition n where n.content_id = p_content;
  perform public.audit_log('content.creator_duplicate', 'content', v_new::text, jsonb_build_object('source_id', p_content),
    jsonb_build_object('slug', p_slug, 'title', v_title), null, 'creator');
  return v_new;
end $$;
revoke execute on function public.creator_duplicate_recipe(uuid, text, text) from public, anon;
grant execute on function public.creator_duplicate_recipe(uuid, text, text) to authenticated, service_role;

-- Restaurar uma versão no rascunho: reconstrói as tabelas pelo próprio recipe_save. A mídia volta só
-- se a linha ainda existir; a nutrição volta sem validação; o vídeo do Stream só se o envio ainda vale.
-- O restore_point (corpo v1) não tem estrutura para reconstruir: 'version_not_restorable'.
create or replace function public.creator_restore_recipe_version(p_version uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.recipe_versions%rowtype; c public.content%rowtype; v_creator uuid; v_s jsonb; v_payload jsonb; v_video jsonb;
        v_updated timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into v from public.recipe_versions where id = p_version;
  if not found then raise exception 'version_not_found'; end if;
  select * into c from public.content where id = v.content_id for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'version_not_found'; end if;
  if c.status <> 'draft' or c.review_status = 'in_review' then raise exception 'content_not_editable' using errcode = '42501'; end if;
  v_s := v.snapshot;
  if not (v_s ? 'ingredients') then raise exception 'version_not_restorable'; end if;
  v_video := v_s -> 'video';
  if v_video ->> 'provider' = 'cloudflare_stream' and not exists (
       select 1 from public.stream_uploads s where s.uid = v_video ->> 'ref' and s.creator_id = v_creator and s.discarded_at is null
         and (s.content_id is null or s.content_id = c.id)) then
    v_video := null;
  end if;
  v_payload := jsonb_build_object(
    'content', coalesce(v_s -> 'content', '{}'::jsonb) - 'cover_url' - 'duration_minutes',
    'details', coalesce(v_s -> 'details', '{}'::jsonb) - 'schema_version' - 'cover_media_id'
               || jsonb_build_object('cover_media_id',
                    case when exists (select 1 from public.recipe_media m where m.id::text = v_s -> 'details' ->> 'cover_media_id' and m.content_id = c.id)
                         then v_s -> 'details' -> 'cover_media_id' end),
    'extras', coalesce(v_s -> 'extras', '{}'::jsonb),
    'categories', coalesce((select jsonb_agg(k) from jsonb_array_elements_text(v_s -> 'categories') as k
                            where exists (select 1 from public.recipe_categories rc where rc.code = k and rc.active)), '[]'::jsonb),
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object('id', e -> 'id', 'name', e -> 'name', 'quantity', e -> 'quantity', 'unit', e -> 'unit',
                                                                 'quantity_text', e -> 'quantity_text', 'to_taste', e -> 'to_taste', 'optional', e -> 'optional',
                                                                 'note', e -> 'note', 'substitutions', e -> 'substitutions') order by (e ->> 'position')::int)
                             from jsonb_array_elements(v_s -> 'ingredients') as e), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', e -> 'id', 'instruction', e -> 'instruction', 'duration_seconds', e -> 'duration_seconds',
                                                           'temperature_c', e -> 'temperature_c', 'tip', e -> 'tip',
                                                           'image_media_id', case when exists (select 1 from public.recipe_media m where m.id::text = e ->> 'image_media_id' and m.content_id = c.id)
                                                                                  then e -> 'image_media_id' end,
                                                           'ingredient_ids', coalesce((select jsonb_agg(si -> 'ingredient_id') from jsonb_array_elements(v_s -> 'step_ingredients') as si
                                                                                       where si ->> 'step_id' = e ->> 'id'), '[]'::jsonb))
                                        order by (e ->> 'position')::int)
                       from jsonb_array_elements(v_s -> 'steps') as e), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', e -> 'id', 'position', e -> 'position', 'alt_text', e -> 'alt_text', 'caption', e -> 'caption'))
                       from jsonb_array_elements(v_s -> 'media') as e
                       where exists (select 1 from public.recipe_media m where m.id::text = e ->> 'id' and m.content_id = c.id)), '[]'::jsonb),
    'nutrition', coalesce(v_s -> 'nutrition', 'null'::jsonb));
  if v_video is not null and jsonb_typeof(v_video) = 'object' then v_payload := v_payload || jsonb_build_object('video', v_video); end if;
  perform public.recipe_save(c.id, v_payload, c.updated_at);
  perform set_config('app.trusted', 'on', true);
  update public.recipe_nutrition set validated = false, validated_by = null, validated_at = null, validation_note = null, validated_by_user = null
  where content_id = c.id and (validated or validated_by is not null);
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('recipe.version_restore', 'content', c.id::text, null,
    jsonb_build_object('version_id', v.id, 'version_no', v.version_no), null, 'creator');
  select updated_at into v_updated from public.content where id = c.id;
  return jsonb_build_object('updated_at', v_updated);
end $$;
revoke execute on function public.creator_restore_recipe_version(uuid) from public, anon;
grant execute on function public.creator_restore_recipe_version(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- ingrediente ↔ produto (herói sugere, admin valida)
create or replace function public.creator_suggest_ingredient_product(p_ingredient uuid, p_product uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_content uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select i.content_id into v_content from public.recipe_ingredients i join public.content c on c.id = i.content_id
  where i.id = p_ingredient and c.creator_id = v_creator;
  if v_creator is null or v_content is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.products p where p.id = p_product) then raise exception 'product_not_found'; end if;
  if p_note is not null and length(btrim(p_note)) > 200 then raise exception 'invalid_payload: note' using errcode = '22023'; end if;
  insert into public.recipe_ingredient_products (content_id, ingredient_id, product_id, status, note)
  values (v_content, p_ingredient, p_product, 'suggested', nullif(btrim(p_note), ''))
  on conflict (ingredient_id, product_id) do nothing
  returning id into v_id;
  if v_id is null then
    select l.id into v_id from public.recipe_ingredient_products l where l.ingredient_id = p_ingredient and l.product_id = p_product;
  end if;
  return v_id;
end $$;
revoke execute on function public.creator_suggest_ingredient_product(uuid, uuid, text) from public, anon;
grant execute on function public.creator_suggest_ingredient_product(uuid, uuid, text) to authenticated, service_role;

create or replace function public.creator_withdraw_ingredient_product(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  delete from public.recipe_ingredient_products l using public.content c
  where l.id = p_link and c.id = l.content_id and c.creator_id = public.my_creator_id() and l.status = 'suggested';
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke execute on function public.creator_withdraw_ingredient_product(uuid) from public, anon;
grant execute on function public.creator_withdraw_ingredient_product(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- indicadores do herói (agregados e aproximados)
-- Visitantes distintos por dia em content.view (sem eventos sem pessoa e sem as visitas do próprio
-- chef), favoritos e nota (sem contas demo). Janela de 1 a 90 dias. A interface rotula "aproximado".
create or replace function public.creator_recipe_stats(p_days int default 30)
returns table (content_id uuid, visitors int, favorites int, rating_count int, rating_avg numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_creator uuid; v_chef_user uuid; v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  if v_creator is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select cp.user_id into v_chef_user from public.creator_profiles cp where cp.id = v_creator;
  return query
  select c.id,
         (select count(distinct (coalesce(e.user_id::text, e.anon_id), (e.created_at at time zone 'UTC')::date))::int
            from public.analytics_events e
           where e.event_name = 'content.view' and e.properties ->> 'content_id' = c.id::text
             and e.created_at >= now() - make_interval(days => v_days)
             and (e.user_id is not null or e.anon_id is not null)
             and e.user_id is distinct from v_chef_user),
         (select count(*)::int from public.favorites f where f.content_id = c.id),
         coalesce(d.rating_count, 0),
         case when coalesce(d.rating_count, 0) > 0 then round(d.rating_sum::numeric / d.rating_count, 2) end
  from public.content c left join public.recipe_details d on d.content_id = c.id
  where c.creator_id = v_creator and c.type = 'recipe'
  order by c.created_at desc, c.id;
end $$;
revoke execute on function public.creator_recipe_stats(int) from public, anon;
grant execute on function public.creator_recipe_stats(int) to authenticated, service_role;

-- ---------------------------------------------------------------- admin
-- Regra de revisão por tipo (P1: desligada por padrão; o admin liga sem deploy, com justificativa).
create or replace function public.admin_set_review_required(p_type public.content_type, p_on boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_on is null then raise exception 'invalid_payload: on' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'justification_required' using errcode = '22023'; end if;
  select s.review_required into v_before from public.content_type_settings s where s.type = p_type for update;
  if not found then raise exception 'type_not_found'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.content_type_settings set review_required = p_on where type = p_type;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content_type.review_required', 'content_type', p_type::text,
    jsonb_build_object('review_required', v_before), jsonb_build_object('review_required', p_on), btrim(p_reason));
end $$;
revoke execute on function public.admin_set_review_required(public.content_type, boolean, text) from public, anon;
grant execute on function public.admin_set_review_required(public.content_type, boolean, text) to authenticated, service_role;

-- Valida (ou suspende/rejeita) o vínculo ingrediente ↔ produto; validar suspende o validado anterior.
create or replace function public.admin_set_ingredient_product(p_link uuid, p_status public.link_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare l public.recipe_ingredient_products%rowtype; v_version int; v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('validated', 'suspended', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into l from public.recipe_ingredient_products where id = p_link for update;
  if not found then raise exception 'link_not_found'; end if;
  if p_status = 'validated' then
    update public.recipe_ingredient_products set status = 'suspended', suspended_reason = 'replaced'
    where ingredient_id = l.ingredient_id and status = 'validated' and id <> p_link;
  end if;
  select p.version into v_version from public.products p where p.id = l.product_id;
  update public.recipe_ingredient_products
  set status = p_status, note = coalesce(v_note, note),
      validated_by = case when p_status = 'validated' then auth.uid() else validated_by end,
      validated_at = case when p_status = 'validated' then now() else validated_at end,
      product_version_at_validation = case when p_status = 'validated' then v_version else product_version_at_validation end,
      suspended_reason = case when p_status = 'suspended' then coalesce(v_note, 'admin') else null end
  where id = p_link;
  perform public.audit_log('recipe_ingredient_product.set_status', 'recipe_ingredient_product', p_link::text,
    jsonb_build_object('status', l.status), jsonb_build_object('status', p_status, 'product_version', v_version), v_note);
end $$;
revoke execute on function public.admin_set_ingredient_product(uuid, public.link_status, text) from public, anon;
grant execute on function public.admin_set_ingredient_product(uuid, public.link_status, text) to authenticated, service_role;

-- Validação da nutrição (RB-08): responsável e data obrigatórios para validar.
create or replace function public.admin_validate_recipe_nutrition(p_content uuid, p_validated boolean, p_by text, p_at date, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.recipe_nutrition%rowtype; v_by text := nullif(btrim(coalesce(p_by, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into n from public.recipe_nutrition where content_id = p_content for update;
  if not found then raise exception 'nutrition_not_found'; end if;
  if coalesce(p_validated, false) and (v_by is null or p_at is null) then raise exception 'nutrition_validation_incomplete' using errcode = '23514'; end if;
  if v_by is not null and length(v_by) > 120 then raise exception 'invalid_payload: validated_by' using errcode = '22023'; end if;
  update public.recipe_nutrition
  set validated = coalesce(p_validated, false),
      validated_by = case when p_validated then v_by end,
      validated_at = case when p_validated then p_at end,
      validation_note = left(nullif(btrim(coalesce(p_note, '')), ''), 300),
      validated_by_user = case when p_validated then auth.uid() end
  where content_id = p_content;
  perform public.audit_log('recipe_nutrition.validate', 'content', p_content::text,
    jsonb_build_object('validated', n.validated, 'validated_by', n.validated_by, 'validated_at', n.validated_at),
    jsonb_build_object('validated', coalesce(p_validated, false), 'validated_by', case when p_validated then v_by end,
                       'validated_at', case when p_validated then p_at end),
    left(nullif(btrim(coalesce(p_note, '')), ''), 300));
end $$;
revoke execute on function public.admin_validate_recipe_nutrition(uuid, boolean, text, date, text) from public, anon;
grant execute on function public.admin_validate_recipe_nutrition(uuid, boolean, text, date, text) to authenticated, service_role;

create or replace function public.admin_upsert_recipe_category(p_code text, p_name jsonb, p_sort int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_code is null or p_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_code) > 40 then raise exception 'invalid_category' using errcode = '22023'; end if;
  if p_name is null or jsonb_typeof(p_name) <> 'object' or not (p_name ? 'pt-BR') then raise exception 'invalid_payload: name' using errcode = '22023'; end if;
  select to_jsonb(k) into v_before from public.recipe_categories k where k.code = p_code;
  insert into public.recipe_categories (code, name, sort_order, active)
  values (p_code, p_name, coalesce(p_sort, 100), coalesce(p_active, true))
  on conflict (code) do update set name = excluded.name,
    sort_order = coalesce(p_sort, public.recipe_categories.sort_order), active = coalesce(p_active, public.recipe_categories.active);
  perform public.audit_log('recipe_category.upsert', 'recipe_category', p_code, v_before,
    jsonb_build_object('name', p_name, 'sort_order', p_sort, 'active', p_active));
end $$;
revoke execute on function public.admin_upsert_recipe_category(text, jsonb, int, boolean) from public, anon;
grant execute on function public.admin_upsert_recipe_category(text, jsonb, int, boolean) to authenticated, service_role;

-- Moderação de comentário (modelado; ligado só quando houver tela). Motivo obrigatório fora de 'approved'.
create or replace function public.admin_moderate_recipe_comment(p_comment uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.recipe_comments%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected', 'hidden') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if p_decision <> 'approved' and (v_reason is null or length(v_reason) < 3) then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.recipe_comments where id = p_comment for update;
  if not found then raise exception 'comment_not_found'; end if;
  update public.recipe_comments set status = p_decision, moderated_by = auth.uid(), moderated_at = now(), moderation_reason = left(v_reason, 300)
  where id = p_comment;
  perform public.audit_log('recipe_comment.moderate', 'recipe_comment', p_comment::text,
    jsonb_build_object('status', r.status), jsonb_build_object('status', p_decision), v_reason);
end $$;
revoke execute on function public.admin_moderate_recipe_comment(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_recipe_comment(uuid, text, text) to authenticated, service_role;

-- Credenciais do chef (P7): o herói pede em creator_credentials_requests; aprovar copia o texto
-- do pedido para o perfil público; reprovar limpa texto e data do perfil (o pedido fica para o herói).
create or replace function public.admin_set_creator_credentials(p_creator uuid, p_approved boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare cp public.creator_profiles%rowtype; v_text text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into cp from public.creator_profiles where id = p_creator for update;
  if not found then raise exception 'creator_not_found'; end if;
  select nullif(btrim(r.text), '') into v_text from public.creator_credentials_requests r where r.creator_id = p_creator;
  if coalesce(p_approved, false) and v_text is null then raise exception 'credentials_empty'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles
  set credentials = case when p_approved then v_text end, credentials_approved_at = case when p_approved then now() end
  where id = p_creator;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('creator.credentials', 'creator_profile', p_creator::text,
    jsonb_build_object('credentials', cp.credentials, 'credentials_approved_at', cp.credentials_approved_at),
    jsonb_build_object('approved', coalesce(p_approved, false), 'credentials', case when p_approved then v_text end),
    nullif(btrim(coalesce(p_reason, '')), ''));
end $$;
revoke execute on function public.admin_set_creator_credentials(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_creator_credentials(uuid, boolean, text) to authenticated, service_role;

-- ================================================================ 7) leitura pública: catálogo de receitas
-- Security invoker (a RLS de quem chama vale), fora do S14. Só o que está no ar, inclusive para o
-- dono e o admin. Busca por título/resumo/etiquetas (GIN), título (trigram), nome do chef e, para
-- quem está logado, nomes de ingredientes (recipe_extras, A(c): só o que a pessoa pode abrir).
-- plpgsql em vez de sql: o ramo de ingredientes não pode ser planejado para o visitante (sem grant).
-- Ordenação: relevance (offset até 480), recent e quick (cursor por chave).
create or replace function public.recipe_catalog(p_query text default null, p_categories text[] default null, p_max_minutes int default null,
  p_difficulty text default null, p_diets text[] default null, p_exclude_allergens text[] default null, p_creator uuid default null,
  p_sort text default 'relevance', p_cursor text default null, p_limit int default 24)
returns table (content_id uuid, rank real, cursor text)
language plpgsql stable set search_path = public, extensions as $$
#variable_conflict use_column
declare v_q text := nullif(btrim(coalesce(p_query, '')), ''); v_tsq tsquery; v_like text; v_ing uuid[] := '{}';
        v_limit int := least(greatest(coalesce(p_limit, 24), 1), 48); v_sort text := coalesce(p_sort, 'relevance');
        v_offset int := 0; v_cur_ts timestamptz; v_cur_num int; v_cur_id uuid;
begin
  if v_sort not in ('relevance', 'recent', 'quick') then v_sort := 'relevance'; end if;
  if v_q is not null then
    v_tsq := plainto_tsquery('simple', public.f_unaccent(v_q));
    v_like := '%' || replace(replace(replace(public.f_unaccent(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if auth.uid() is not null then
      select coalesce(array_agg(x.content_id), '{}') into v_ing from public.recipe_extras x where x.ingredient_terms @@ v_tsq;
    end if;
  end if;
  if nullif(p_cursor, '') is not null then
    begin
      if v_sort = 'relevance' then v_offset := least(greatest(p_cursor::int, 0), 480);
      elsif v_sort = 'recent' then v_cur_ts := split_part(p_cursor, '|', 1)::timestamptz; v_cur_id := split_part(p_cursor, '|', 2)::uuid;
      else v_cur_num := split_part(p_cursor, '|', 1)::int; v_cur_id := split_part(p_cursor, '|', 2)::uuid;
      end if;
    exception when others then
      raise exception 'invalid_cursor' using errcode = '22023';
    end;
  end if;
  return query
  with cand as (
    select c.id, c.published_at, c.is_featured, c.search, c.creator_id, c.difficulty
    from public.content c
    -- status = 'published' repetido de propósito: content_is_live não é expandida pelo planejador,
    -- e só com o predicado explícito o índice parcial content_recipe_live_idx entra no plano
    where c.type = 'recipe' and c.status = 'published' and public.content_is_live(c.status, c.publish_at)
      and (v_q is null
           or c.search @@ v_tsq
           or public.f_unaccent(c.title) ilike v_like
           or c.id = any (v_ing)
           or exists (select 1 from public.creator_profiles cp where cp.id = c.creator_id and public.f_unaccent(cp.name) ilike v_like))
  ), f as (
    select cand.id, cand.published_at, cand.is_featured, coalesce(d.total_minutes, 32767)::int as total,
           (case when v_q is null then 0 else ts_rank(cand.search, v_tsq) end)::real as r
    from cand join public.recipe_details d on d.content_id = cand.id
    where (p_categories is null or cardinality(p_categories) = 0
           or exists (select 1 from public.recipe_category_links l where l.content_id = cand.id and l.category_code = any (p_categories)))
      and (p_max_minutes is null or d.total_minutes <= p_max_minutes)
      and (p_difficulty is null or cand.difficulty = p_difficulty)
      and (p_diets is null or d.diets @> p_diets)
      and (p_exclude_allergens is null or cardinality(p_exclude_allergens) = 0
           or (d.allergens_declared and not (d.allergens && p_exclude_allergens)))
      and (p_creator is null or cand.creator_id = p_creator)
  ), g as (
    select f.*, row_number() over (order by f.r desc, f.is_featured desc, f.published_at desc, f.id) as rn from f
  )
  select g.id, g.r,
         case v_sort when 'relevance' then g.rn::text
                     when 'recent' then g.published_at::text || '|' || g.id::text
                     else g.total::text || '|' || g.id::text end
  from g
  where (v_sort <> 'recent' or v_cur_id is null or (g.published_at, g.id) < (v_cur_ts, v_cur_id))
    and (v_sort <> 'quick' or v_cur_id is null or (g.total, g.id) > (v_cur_num, v_cur_id))
  order by case when v_sort = 'relevance' then g.rn end asc,
           case when v_sort = 'recent' then g.published_at end desc, case when v_sort = 'recent' then g.id end desc,
           case when v_sort = 'quick' then g.total end asc, case when v_sort = 'quick' then g.id end asc
  offset (case when v_sort = 'relevance' then v_offset else 0 end)
  limit (case when v_sort = 'relevance' and v_offset >= 480 then 0 else v_limit end);
end $$;
revoke execute on function public.recipe_catalog(text, text[], int, text, text[], text[], uuid, text, text, int) from public;
grant execute on function public.recipe_catalog(text, text[], int, text, text[], text[], uuid, text, text, int) to anon, authenticated, service_role;
