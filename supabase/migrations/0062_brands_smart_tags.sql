-- =============================================================================
-- Ultra Hero · 0062 · Marcas, produtos externos e Smart Tags nas imagens
--   Programas, treinos, perfis e posts viram vitrine de marcas: o visitante toca numa marca ou num
--   produto marcado na foto e vai para a página EXTERNA da marca (nada é vendido no app).
--
-- Decisão de modelagem: produto de marca é outro conceito, diferente de products (loja simulada do
--   app, com estoque, vendedor, moderação e carrinho). Aqui só existe nome, foto, descrição, link
--   externo e preço opcional (informativo). Por isso tabelas novas:
--   brands                    marca (nome, slug, logo, site, status, relação padrão, is_demo)
--   brand_products            produto externo da marca (link https, preço opcional)
--   creator_brands            herói ↔ marca, com o tipo de relação
--   content_brands            conteúdo/post ↔ marca citada
--   content_brand_products    conteúdo/post ↔ produto recomendado (bloco sob o conteúdo)
--   program_brand_products    programa ↔ equipamento/produto recomendado
--   media_smart_tags          marcação na foto: posição em % (x, y), lado do rótulo e a URL da foto
--                             no momento da marcação (foto trocada = marcação some até o admin rever)
--   brand_click_counters      cliques somados por dia, alvo e origem (sem pessoa, sem IP, sem FK)
--
-- Relações: sponsor (patrocinador), mentioned (marca mencionada), identified (produto identificado).
--   Nada de patrocínio inventado: o seed só tem marcas fictícias (is_demo), só com "produto
--   identificado" e só em fotos de banco de imagem (sem a pessoa real nelas).
-- Leitura pública: só linha ativa, de marca ativa, de herói ativo e de conteúdo/programa no ar.
--   Escrita: só por RPC do admin (security definer, is_admin() no início), sempre auditada.
-- Regras gerais: idempotente; search_path fixo; grants explícitos; RLS ligada; políticas com
--   (select ...); chave primária própria (id) em toda tabela-ponte (lição da 0055, PGRST201);
--   nenhuma função nova executável pelo visitante (S14 segue com 17).
-- =============================================================================

-- ---------------------------------------------------------------- 0) validadores (uso interno)
-- Link externo: só https, host com domínio, sem usuário/senha, sem espaço, até 500 caracteres.
create or replace function public.brand_https_url_ok(p_url text)
returns boolean language sql immutable set search_path = public as $$
  select p_url is not null and length(p_url) <= 500
    and p_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{2,5})?([/?#][^[:space:]<>"]*)?$'
$$;
revoke execute on function public.brand_https_url_ok(text) from public;
grant execute on function public.brand_https_url_ok(text) to anon, authenticated, service_role;

-- Imagem/logo: arquivo do próprio site (/brands/...) ou link https.
create or replace function public.brand_image_url_ok(p_url text)
returns boolean language sql immutable set search_path = public as $$
  select p_url is null
    or p_url ~ '^/brands/[a-z0-9][a-z0-9/_-]{0,80}\.(svg|png|webp|jpg)$'
    or public.brand_https_url_ok(p_url)
$$;
revoke execute on function public.brand_image_url_ok(text) from public;
grant execute on function public.brand_image_url_ok(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 1) marcas e produtos
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  logo_url text,
  site_url text not null,
  status text not null default 'active',
  default_relationship text not null default 'mentioned',
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_slug_uq unique (slug),
  constraint brands_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint brands_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint brands_logo_check check (public.brand_image_url_ok(logo_url)),
  constraint brands_site_check check (public.brand_https_url_ok(site_url)),
  constraint brands_status_check check (status in ('active', 'inactive')),
  constraint brands_relationship_check check (default_relationship in ('sponsor', 'mentioned', 'identified'))
);

create table if not exists public.brand_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  image_url text,
  description text not null default '',
  external_url text not null,
  price_cents int,
  currency text not null default 'BRL',
  status text not null default 'active',
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_products_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint brand_products_description_check check (char_length(description) <= 280),
  constraint brand_products_image_check check (public.brand_image_url_ok(image_url)),
  constraint brand_products_url_check check (public.brand_https_url_ok(external_url)),
  constraint brand_products_price_check check (price_cents is null or price_cents between 0 and 100000000),
  constraint brand_products_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint brand_products_status_check check (status in ('active', 'inactive'))
);
create index if not exists brand_products_brand_idx on public.brand_products (brand_id);

-- ---------------------------------------------------------------- 2) ligações (chave própria)
create table if not exists public.creator_brands (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  relationship text not null,
  status text not null default 'active',
  sort_order smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_brands_uq unique (creator_id, brand_id),
  constraint creator_brands_relationship_check check (relationship in ('sponsor', 'mentioned', 'identified')),
  constraint creator_brands_status_check check (status in ('active', 'inactive')),
  constraint creator_brands_sort_check check (sort_order between 1 and 12)
);
create index if not exists creator_brands_brand_idx on public.creator_brands (brand_id);

create table if not exists public.content_brands (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  relationship text not null,
  status text not null default 'active',
  sort_order smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_brands_uq unique (content_id, brand_id),
  constraint content_brands_relationship_check check (relationship in ('sponsor', 'mentioned', 'identified')),
  constraint content_brands_status_check check (status in ('active', 'inactive')),
  constraint content_brands_sort_check check (sort_order between 1 and 8)
);
create index if not exists content_brands_brand_idx on public.content_brands (brand_id);

create table if not exists public.content_brand_products (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  brand_product_id uuid not null references public.brand_products (id) on delete cascade,
  status text not null default 'active',
  sort_order smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_brand_products_uq unique (content_id, brand_product_id),
  constraint content_brand_products_status_check check (status in ('active', 'inactive')),
  constraint content_brand_products_sort_check check (sort_order between 1 and 8)
);
create index if not exists content_brand_products_product_idx on public.content_brand_products (brand_product_id);

create table if not exists public.program_brand_products (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  brand_product_id uuid not null references public.brand_products (id) on delete cascade,
  note text not null default '',
  status text not null default 'active',
  sort_order smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_brand_products_uq unique (program_id, brand_product_id),
  constraint program_brand_products_note_check check (char_length(note) <= 160),
  constraint program_brand_products_status_check check (status in ('active', 'inactive')),
  constraint program_brand_products_sort_check check (sort_order between 1 and 8)
);
create index if not exists program_brand_products_product_idx on public.program_brand_products (brand_product_id);

create table if not exists public.media_smart_tags (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  -- qual imagem do conteúdo: hoje só a capa/foto do post ('cover')
  media_key text not null default 'cover',
  -- URL da imagem quando a marcação foi feita: se a foto mudar, a marcação não aparece
  media_url text,
  brand_product_id uuid not null references public.brand_products (id) on delete cascade,
  x_pct numeric(5, 2) not null,
  y_pct numeric(5, 2) not null,
  label_side text not null default 'right',
  status text not null default 'active',
  sort_order smallint not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_smart_tags_media_check check (media_key in ('cover')),
  constraint media_smart_tags_url_check check (media_url is null or char_length(media_url) <= 500),
  constraint media_smart_tags_x_check check (x_pct between 0 and 100),
  constraint media_smart_tags_y_check check (y_pct between 0 and 100),
  constraint media_smart_tags_side_check check (label_side in ('left', 'right', 'top', 'bottom')),
  constraint media_smart_tags_status_check check (status in ('active', 'inactive')),
  constraint media_smart_tags_sort_check check (sort_order between 1 and 8)
);
create index if not exists media_smart_tags_content_idx on public.media_smart_tags (content_id, sort_order);
create index if not exists media_smart_tags_product_idx on public.media_smart_tags (brand_product_id);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['brands', 'brand_products', 'creator_brands', 'content_brands', 'content_brand_products', 'program_brand_products', 'media_smart_tags'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 3) grants e RLS
do $$
declare t text;
begin
  foreach t in array array['brands', 'brand_products', 'creator_brands', 'content_brands', 'content_brand_products', 'program_brand_products', 'media_smart_tags'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    -- admin lê tudo (inclusive desativado); escreve só pelas RPCs
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

drop policy if exists brands_select_public on public.brands;
create policy brands_select_public on public.brands for select to anon, authenticated
  using (status = 'active');

drop policy if exists brand_products_select_public on public.brand_products;
create policy brand_products_select_public on public.brand_products for select to anon, authenticated
  using (status = 'active' and exists (select 1 from public.brands b where b.id = brand_products.brand_id and b.status = 'active'));

drop policy if exists creator_brands_select_public on public.creator_brands;
create policy creator_brands_select_public on public.creator_brands for select to anon, authenticated
  using (status = 'active'
    and exists (select 1 from public.brands b where b.id = creator_brands.brand_id and b.status = 'active')
    and exists (select 1 from public.creator_profiles c where c.id = creator_brands.creator_id and c.status = 'active'));

drop policy if exists content_brands_select_public on public.content_brands;
create policy content_brands_select_public on public.content_brands for select to anon, authenticated
  using (status = 'active'
    and exists (select 1 from public.brands b where b.id = content_brands.brand_id and b.status = 'active')
    and exists (select 1 from public.content c where c.id = content_brands.content_id and public.content_is_live(c.status, c.publish_at)));

drop policy if exists content_brand_products_select_public on public.content_brand_products;
create policy content_brand_products_select_public on public.content_brand_products for select to anon, authenticated
  using (status = 'active'
    and exists (select 1 from public.brand_products p join public.brands b on b.id = p.brand_id
                where p.id = content_brand_products.brand_product_id and p.status = 'active' and b.status = 'active')
    and exists (select 1 from public.content c where c.id = content_brand_products.content_id and public.content_is_live(c.status, c.publish_at)));

drop policy if exists program_brand_products_select_public on public.program_brand_products;
create policy program_brand_products_select_public on public.program_brand_products for select to anon, authenticated
  using (status = 'active'
    and exists (select 1 from public.brand_products p join public.brands b on b.id = p.brand_id
                where p.id = program_brand_products.brand_product_id and p.status = 'active' and b.status = 'active')
    and exists (select 1 from public.programs pg where pg.id = program_brand_products.program_id and pg.status = 'published'));

drop policy if exists media_smart_tags_select_public on public.media_smart_tags;
create policy media_smart_tags_select_public on public.media_smart_tags for select to anon, authenticated
  using (status = 'active'
    and exists (select 1 from public.brand_products p join public.brands b on b.id = p.brand_id
                where p.id = media_smart_tags.brand_product_id and p.status = 'active' and b.status = 'active')
    and exists (select 1 from public.content c where c.id = media_smart_tags.content_id and public.content_is_live(c.status, c.publish_at)));

-- ---------------------------------------------------------------- 4) contador de cliques
-- Cliques para fora (marca ou produto), somados por dia (Brasília), alvo e origem. Sem pessoa, sem
-- IP e sem FK (chave própria; alvo apagado deixa a contagem órfã, que o painel ignora).
create table if not exists public.brand_click_counters (
  id bigint generated always as identity primary key,
  day date not null,
  target_kind text not null,
  target_id uuid not null,
  source text not null,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  constraint brand_click_counters_kind_check check (target_kind in ('brand', 'product')),
  constraint brand_click_counters_source_check check (source in ('strip', 'tag', 'card', 'recommended')),
  constraint brand_click_counters_uq unique (day, target_kind, target_id, source)
);
create index if not exists brand_click_counters_target_idx on public.brand_click_counters (target_kind, target_id, day desc);
revoke all on table public.brand_click_counters from public, anon, authenticated;
grant all on table public.brand_click_counters to service_role;
alter table public.brand_click_counters enable row level security;
-- nenhuma política: só o service role (que ignora a RLS) lê e soma

-- Soma 1 clique. Só alvo ativo e origem conhecida; fora disso não faz nada. Security invoker: quem
-- executa é o service role (POST /api/brand-clicks); anon e authenticated não executam.
create or replace function public.brand_click_bump(p_kind text, p_target uuid, p_source text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_kind is null or p_target is null or p_source is null
     or p_kind not in ('brand', 'product') or p_source not in ('strip', 'tag', 'card', 'recommended') then
    return false;
  end if;
  if p_kind = 'brand' and not exists (select 1 from public.brands where id = p_target and status = 'active') then return false; end if;
  if p_kind = 'product' and not exists (select 1 from public.brand_products where id = p_target and status = 'active') then return false; end if;
  insert into public.brand_click_counters as s (day, target_kind, target_id, source, count)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_kind, p_target, p_source, 1)
  on conflict on constraint brand_click_counters_uq do update set count = s.count + 1, updated_at = now();
  return true;
end $$;
revoke execute on function public.brand_click_bump(text, uuid, text) from public, anon, authenticated;
grant execute on function public.brand_click_bump(text, uuid, text) to service_role;

-- ---------------------------------------------------------------- 5) RPCs do admin (auditadas)
-- Cria (p_id nulo) ou edita uma marca. p_data: name, slug, logo_url, site_url, status,
-- default_relationship, is_demo.
create or replace function public.admin_brand_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.brand_https_url_ok(p_data->>'site_url') then raise exception 'invalid_url' using errcode = '22023'; end if;
  if not public.brand_image_url_ok(nullif(btrim(coalesce(p_data->>'logo_url', '')), '')) then raise exception 'invalid_image' using errcode = '22023'; end if;
  if p_id is not null then
    select to_jsonb(b) - 'created_at' - 'updated_at' into v_before from public.brands b where b.id = p_id;
    if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  begin
    if p_id is null then
      insert into public.brands (slug, name, logo_url, site_url, status, default_relationship, is_demo, created_by)
      values (lower(btrim(p_data->>'slug')), btrim(p_data->>'name'), nullif(btrim(coalesce(p_data->>'logo_url', '')), ''), btrim(p_data->>'site_url'),
              coalesce(p_data->>'status', 'active'), coalesce(p_data->>'default_relationship', 'mentioned'), coalesce((p_data->>'is_demo')::boolean, false), auth.uid())
      returning id into v_id;
    else
      update public.brands set
        slug = lower(btrim(p_data->>'slug')), name = btrim(p_data->>'name'),
        logo_url = nullif(btrim(coalesce(p_data->>'logo_url', '')), ''), site_url = btrim(p_data->>'site_url'),
        status = coalesce(p_data->>'status', status), default_relationship = coalesce(p_data->>'default_relationship', default_relationship),
        is_demo = coalesce((p_data->>'is_demo')::boolean, is_demo)
      where id = p_id returning id into v_id;
    end if;
  exception
    when unique_violation then raise exception 'duplicate_slug' using errcode = '23505';
    when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select to_jsonb(b) - 'created_at' - 'updated_at' into v_after from public.brands b where b.id = v_id;
  if v_before is distinct from v_after then
    perform public.audit_log(case when p_id is null then 'brand.create' else 'brand.update' end, 'brand', v_id::text, v_before, v_after, null);
  end if;
  return v_id;
end $$;
revoke execute on function public.admin_brand_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_brand_save(uuid, jsonb) to authenticated, service_role;

-- Apaga a marca (produtos, ligações e marcações saem junto, em cascata). Fica o retrato na auditoria.
create or replace function public.admin_brand_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(b) - 'created_at' - 'updated_at'
         || jsonb_build_object('products', (select count(*) from public.brand_products p where p.brand_id = b.id))
    into v_before from public.brands b where b.id = p_id;
  if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.brands where id = p_id;
  perform public.audit_log('brand.delete', 'brand', p_id::text, v_before, null, null);
end $$;
revoke execute on function public.admin_brand_delete(uuid) from public, anon;
grant execute on function public.admin_brand_delete(uuid) to authenticated, service_role;

-- Cria (p_id nulo) ou edita um produto. p_data: brand_id, name, image_url, description,
-- external_url, price_cents (nulo = sem preço), currency, status, is_demo.
create or replace function public.admin_brand_product_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_id uuid; v_brand uuid; v_price int;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_brand := (p_data->>'brand_id')::uuid;
    v_price := nullif(p_data->>'price_cents', '')::int;
  exception when others then
    raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_brand is null or not exists (select 1 from public.brands where id = v_brand) then raise exception 'invalid_brand' using errcode = '22023'; end if;
  if not public.brand_https_url_ok(p_data->>'external_url') then raise exception 'invalid_url' using errcode = '22023'; end if;
  if not public.brand_image_url_ok(nullif(btrim(coalesce(p_data->>'image_url', '')), '')) then raise exception 'invalid_image' using errcode = '22023'; end if;
  if p_id is not null then
    select to_jsonb(p) - 'created_at' - 'updated_at' into v_before from public.brand_products p where p.id = p_id;
    if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  begin
    if p_id is null then
      insert into public.brand_products (brand_id, name, image_url, description, external_url, price_cents, currency, status, is_demo, created_by)
      values (v_brand, btrim(p_data->>'name'), nullif(btrim(coalesce(p_data->>'image_url', '')), ''), btrim(coalesce(p_data->>'description', '')),
              btrim(p_data->>'external_url'), v_price, upper(coalesce(nullif(p_data->>'currency', ''), 'BRL')),
              coalesce(p_data->>'status', 'active'), coalesce((p_data->>'is_demo')::boolean, false), auth.uid())
      returning id into v_id;
    else
      update public.brand_products set
        brand_id = v_brand, name = btrim(p_data->>'name'), image_url = nullif(btrim(coalesce(p_data->>'image_url', '')), ''),
        description = btrim(coalesce(p_data->>'description', '')), external_url = btrim(p_data->>'external_url'),
        price_cents = v_price, currency = upper(coalesce(nullif(p_data->>'currency', ''), currency)),
        status = coalesce(p_data->>'status', status), is_demo = coalesce((p_data->>'is_demo')::boolean, is_demo)
      where id = p_id returning id into v_id;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid_input' using errcode = '22023';
  end;
  select to_jsonb(p) - 'created_at' - 'updated_at' into v_after from public.brand_products p where p.id = v_id;
  if v_before is distinct from v_after then
    perform public.audit_log(case when p_id is null then 'brand_product.create' else 'brand_product.update' end, 'brand_product', v_id::text, v_before, v_after, null);
  end if;
  return v_id;
end $$;
revoke execute on function public.admin_brand_product_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_brand_product_save(uuid, jsonb) to authenticated, service_role;

create or replace function public.admin_brand_product_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(p) - 'created_at' - 'updated_at' into v_before from public.brand_products p where p.id = p_id;
  if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.brand_products where id = p_id;
  perform public.audit_log('brand_product.delete', 'brand_product', p_id::text, v_before, null, null);
end $$;
revoke execute on function public.admin_brand_product_delete(uuid) from public, anon;
grant execute on function public.admin_brand_product_delete(uuid) to authenticated, service_role;

-- Marcas do herói: troca a lista inteira. p_items = [{"brand_id", "relationship", "status"}], na
-- ordem (até 12, sem repetir). Lista vazia tira todas.
create or replace function public.admin_creator_brands_save(p_creator uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_item jsonb; v_brand uuid; v_ids uuid[] := '{}'; v_i int := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 12 then raise exception 'too_many_items' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_brand := (v_item->>'brand_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_brand is null or v_brand = any (v_ids) then raise exception 'duplicate_item' using errcode = '22023'; end if;
    if not exists (select 1 from public.brands where id = v_brand) then raise exception 'invalid_brand' using errcode = '22023'; end if;
    if coalesce(v_item->>'relationship', '') not in ('sponsor', 'mentioned', 'identified') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if coalesce(v_item->>'status', 'active') not in ('active', 'inactive') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_ids := v_ids || v_brand;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('brand_id', brand_id, 'relationship', relationship, 'status', status) order by sort_order), '[]'::jsonb)
    into v_before from public.creator_brands where creator_id = p_creator;
  delete from public.creator_brands where creator_id = p_creator and not (brand_id = any (v_ids));
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    insert into public.creator_brands (creator_id, brand_id, relationship, status, sort_order)
    values (p_creator, (v_item->>'brand_id')::uuid, v_item->>'relationship', coalesce(v_item->>'status', 'active'), v_i)
    on conflict on constraint creator_brands_uq do update
      set relationship = excluded.relationship, status = excluded.status, sort_order = excluded.sort_order;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('brand_id', brand_id, 'relationship', relationship, 'status', status) order by sort_order), '[]'::jsonb)
    into v_after from public.creator_brands where creator_id = p_creator;
  if v_before is distinct from v_after then
    perform public.audit_log('creator.brands', 'creator', p_creator::text, jsonb_build_object('brands', v_before), jsonb_build_object('brands', v_after), null);
  end if;
  return v_i;
end $$;
revoke execute on function public.admin_creator_brands_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_creator_brands_save(uuid, jsonb) to authenticated, service_role;

-- Equipamentos recomendados do programa: p_items = [{"brand_product_id", "note", "status"}] (até 8).
create or replace function public.admin_program_brand_products_save(p_program uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_item jsonb; v_product uuid; v_ids uuid[] := '{}'; v_i int := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.programs where id = p_program) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 8 then raise exception 'too_many_items' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product := (v_item->>'brand_product_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_product is null or v_product = any (v_ids) then raise exception 'duplicate_item' using errcode = '22023'; end if;
    if not exists (select 1 from public.brand_products where id = v_product) then raise exception 'invalid_product' using errcode = '22023'; end if;
    if char_length(btrim(coalesce(v_item->>'note', ''))) > 160 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if coalesce(v_item->>'status', 'active') not in ('active', 'inactive') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_ids := v_ids || v_product;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('brand_product_id', brand_product_id, 'note', note, 'status', status) order by sort_order), '[]'::jsonb)
    into v_before from public.program_brand_products where program_id = p_program;
  delete from public.program_brand_products where program_id = p_program and not (brand_product_id = any (v_ids));
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    insert into public.program_brand_products (program_id, brand_product_id, note, status, sort_order)
    values (p_program, (v_item->>'brand_product_id')::uuid, btrim(coalesce(v_item->>'note', '')), coalesce(v_item->>'status', 'active'), v_i)
    on conflict on constraint program_brand_products_uq do update
      set note = excluded.note, status = excluded.status, sort_order = excluded.sort_order;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('brand_product_id', brand_product_id, 'note', note, 'status', status) order by sort_order), '[]'::jsonb)
    into v_after from public.program_brand_products where program_id = p_program;
  if v_before is distinct from v_after then
    perform public.audit_log('program.brand_products', 'program', p_program::text, jsonb_build_object('products', v_before), jsonb_build_object('products', v_after), null);
  end if;
  return v_i;
end $$;
revoke execute on function public.admin_program_brand_products_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_program_brand_products_save(uuid, jsonb) to authenticated, service_role;

-- Marcas citadas e produtos recomendados do conteúdo/post (troca as duas listas inteiras).
-- p_brands = [{"brand_id", "relationship", "status"}] (até 8); p_products = [{"brand_product_id", "status"}] (até 8).
create or replace function public.admin_content_brand_links_save(p_content uuid, p_brands jsonb, p_products jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_item jsonb; v_id uuid; v_brands uuid[] := '{}'; v_products uuid[] := '{}'; v_i int;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.content where id = p_content) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_brands is null or jsonb_typeof(p_brands) <> 'array' or p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if jsonb_array_length(p_brands) > 8 or jsonb_array_length(p_products) > 8 then raise exception 'too_many_items' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_brands) loop
    begin v_id := (v_item->>'brand_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_id is null or v_id = any (v_brands) then raise exception 'duplicate_item' using errcode = '22023'; end if;
    if not exists (select 1 from public.brands where id = v_id) then raise exception 'invalid_brand' using errcode = '22023'; end if;
    if coalesce(v_item->>'relationship', '') not in ('sponsor', 'mentioned', 'identified') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if coalesce(v_item->>'status', 'active') not in ('active', 'inactive') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_brands := v_brands || v_id;
  end loop;
  for v_item in select value from jsonb_array_elements(p_products) loop
    begin v_id := (v_item->>'brand_product_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_id is null or v_id = any (v_products) then raise exception 'duplicate_item' using errcode = '22023'; end if;
    if not exists (select 1 from public.brand_products where id = v_id) then raise exception 'invalid_product' using errcode = '22023'; end if;
    if coalesce(v_item->>'status', 'active') not in ('active', 'inactive') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_products := v_products || v_id;
  end loop;

  select jsonb_build_object(
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand_id', brand_id, 'relationship', relationship, 'status', status) order by sort_order), '[]'::jsonb)
               from public.content_brands where content_id = p_content),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('brand_product_id', brand_product_id, 'status', status) order by sort_order), '[]'::jsonb)
                 from public.content_brand_products where content_id = p_content)) into v_before;

  delete from public.content_brands where content_id = p_content and not (brand_id = any (v_brands));
  v_i := 0;
  for v_item in select value from jsonb_array_elements(p_brands) loop
    v_i := v_i + 1;
    insert into public.content_brands (content_id, brand_id, relationship, status, sort_order)
    values (p_content, (v_item->>'brand_id')::uuid, v_item->>'relationship', coalesce(v_item->>'status', 'active'), v_i)
    on conflict on constraint content_brands_uq do update set relationship = excluded.relationship, status = excluded.status, sort_order = excluded.sort_order;
  end loop;
  delete from public.content_brand_products where content_id = p_content and not (brand_product_id = any (v_products));
  v_i := 0;
  for v_item in select value from jsonb_array_elements(p_products) loop
    v_i := v_i + 1;
    insert into public.content_brand_products (content_id, brand_product_id, status, sort_order)
    values (p_content, (v_item->>'brand_product_id')::uuid, coalesce(v_item->>'status', 'active'), v_i)
    on conflict on constraint content_brand_products_uq do update set status = excluded.status, sort_order = excluded.sort_order;
  end loop;

  select jsonb_build_object(
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand_id', brand_id, 'relationship', relationship, 'status', status) order by sort_order), '[]'::jsonb)
               from public.content_brands where content_id = p_content),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('brand_product_id', brand_product_id, 'status', status) order by sort_order), '[]'::jsonb)
                 from public.content_brand_products where content_id = p_content)) into v_after;
  if v_before is distinct from v_after then
    perform public.audit_log('content.brand_links', 'content', p_content::text, v_before, v_after, null);
  end if;
  return jsonb_array_length(p_brands) + jsonb_array_length(p_products);
end $$;
revoke execute on function public.admin_content_brand_links_save(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_content_brand_links_save(uuid, jsonb, jsonb) to authenticated, service_role;

-- Smart Tags da capa/foto do conteúdo: troca a lista inteira. p_tags = [{"brand_product_id",
-- "x_pct", "y_pct", "label_side", "status"}] (até 8). A URL da capa atual fica gravada em cada tag.
create or replace function public.admin_content_smart_tags_save(p_content uuid, p_tags jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_item jsonb; v_product uuid; v_x numeric; v_y numeric; v_cover text; v_i int := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select cover_url into v_cover from public.content where id = p_content;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_cover is null then raise exception 'no_image' using errcode = '22023'; end if;
  if p_tags is null or jsonb_typeof(p_tags) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if jsonb_array_length(p_tags) > 8 then raise exception 'too_many_items' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_tags) loop
    begin
      v_product := (v_item->>'brand_product_id')::uuid;
      v_x := (v_item->>'x_pct')::numeric;
      v_y := (v_item->>'y_pct')::numeric;
    exception when others then
      raise exception 'invalid_input' using errcode = '22023';
    end;
    if v_product is null or v_x is null or v_y is null or v_x < 0 or v_x > 100 or v_y < 0 or v_y > 100 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if not exists (select 1 from public.brand_products where id = v_product) then raise exception 'invalid_product' using errcode = '22023'; end if;
    if coalesce(v_item->>'label_side', 'right') not in ('left', 'right', 'top', 'bottom') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if coalesce(v_item->>'status', 'active') not in ('active', 'inactive') then raise exception 'invalid_input' using errcode = '22023'; end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('brand_product_id', brand_product_id, 'x_pct', x_pct, 'y_pct', y_pct, 'label_side', label_side, 'status', status, 'media_url', media_url) order by sort_order), '[]'::jsonb)
    into v_before from public.media_smart_tags where content_id = p_content and media_key = 'cover';
  delete from public.media_smart_tags where content_id = p_content and media_key = 'cover';
  for v_item in select value from jsonb_array_elements(p_tags) loop
    v_i := v_i + 1;
    insert into public.media_smart_tags (content_id, media_key, media_url, brand_product_id, x_pct, y_pct, label_side, status, sort_order)
    values (p_content, 'cover', v_cover, (v_item->>'brand_product_id')::uuid, round((v_item->>'x_pct')::numeric, 2), round((v_item->>'y_pct')::numeric, 2),
            coalesce(v_item->>'label_side', 'right'), coalesce(v_item->>'status', 'active'), v_i);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('brand_product_id', brand_product_id, 'x_pct', x_pct, 'y_pct', y_pct, 'label_side', label_side, 'status', status, 'media_url', media_url) order by sort_order), '[]'::jsonb)
    into v_after from public.media_smart_tags where content_id = p_content and media_key = 'cover';
  if v_before is distinct from v_after then
    perform public.audit_log('content.smart_tags', 'content', p_content::text, jsonb_build_object('tags', v_before), jsonb_build_object('tags', v_after), null);
  end if;
  return v_i;
end $$;
revoke execute on function public.admin_content_smart_tags_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_content_smart_tags_save(uuid, jsonb) to authenticated, service_role;

-- Cliques por marca e produto no período (1..90 dias, Brasília): só contagens, nenhuma pessoa.
create or replace function public.admin_brand_clicks(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 90); v_since date; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_since := (now() at time zone 'America/Sao_Paulo')::date - (v_days - 1);
  select jsonb_build_object(
    'window_days', v_days,
    -- marca: cliques na própria marca + nos produtos dela
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'clicks', x.n) order by x.n desc, b.name)
       from (select coalesce(p.brand_id, c.target_id) as brand_id, sum(c.count)::int as n
             from public.brand_click_counters c
             left join public.brand_products p on c.target_kind = 'product' and p.id = c.target_id
             where c.day >= v_since and (c.target_kind = 'brand' or p.id is not null)
             group by 1) x
       join public.brands b on b.id = x.brand_id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'brand_id', p.brand_id, 'clicks', s.n) order by s.n desc, p.name)
       from (select c.target_id, sum(c.count)::int n from public.brand_click_counters c
             where c.target_kind = 'product' and c.day >= v_since group by c.target_id) s
       join public.brand_products p on p.id = s.target_id), '[]'::jsonb),
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, sum(count)::int n from public.brand_click_counters where day >= v_since group by source) s), '{}'::jsonb)
  ) into v;
  return v;
end $$;
revoke execute on function public.admin_brand_clicks(int) from public, anon;
grant execute on function public.admin_brand_clicks(int) to authenticated, service_role;

-- ---------------------------------------------------------------- 6) imagens das marcas (bucket público)
-- O admin envia logo/foto de produto pelo servidor (service role); nada é escrito pela API com JWT.
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0062: schema storage ausente; bucket brand-media não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('brand-media', 'brand-media', true, 1572864, array['image/webp', 'image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
end $$;

-- ---------------------------------------------------------------- 7) seed de demonstração (is_demo)
-- Marcas e produtos FICTÍCIOS (nomes inventados, logos SVG próprios em public/brands, links
-- example.com). Nenhum patrocínio: só "produto identificado", e marcações só em fotos de banco de
-- imagem (copo d'água, prato, faca e chaira) — nunca sobre a pessoa real. Reaplicar não sobrescreve o
-- que o admin editou: marca/produto existente fica como está; ligações só entram se o admin nunca
-- mexeu naquele herói/programa/conteúdo (auditoria).
-- (marca ou produto que o admin apagou não volta ao reaplicar)
insert into public.brands (id, slug, name, logo_url, site_url, status, default_relationship, is_demo)
select public.seed_uuid('brand:' || s.slug), s.slug, s.name, '/brands/' || s.slug || '.svg', 'https://example.com/' || s.slug, 'active', 'identified', true
from (values
  ('volta-sports', 'Volta Sports'),
  ('kairo-footwear', 'Kairo Footwear'),
  ('mare-surf-co', 'Maré Surf Co.'),
  ('brasa-cozinha', 'Brasa Cozinha'),
  ('pulse-watch', 'Pulse Watch')
) as s (slug, name)
where not exists (select 1 from public.admin_audit a where a.action = 'brand.delete' and a.resource_id = public.seed_uuid('brand:' || s.slug)::text)
on conflict do nothing;

insert into public.brand_products (id, brand_id, name, image_url, description, external_url, price_cents, currency, status, is_demo)
select public.seed_uuid('brand_product:' || s.key), public.seed_uuid('brand:' || s.brand), s.name, s.image, s.description, s.url, s.price, 'BRL', 'active', true
from (values
  ('volta-copo', 'volta-sports', 'Copo de treino 400 ml', '/brands/products/volta-copo.svg',
   'Copo de vidro reforçado para a água do dia a dia e do pós-treino.', 'https://example.com/volta-sports/copo-de-treino-400', 4990),
  ('volta-garrafa', 'volta-sports', 'Garrafa térmica 750 ml', '/brands/products/volta-garrafa.svg',
   'Mantém a água gelada por horas; cabe no porta-copos da bicicleta.', 'https://example.com/volta-sports/garrafa-termica-750', 8990),
  ('pulse-run', 'pulse-watch', 'Relógio Pulse Run', '/brands/products/pulse-run.svg',
   'Relógio de corrida com frequência cardíaca e lembrete de hidratação.', 'https://example.com/pulse-watch/pulse-run', null),
  ('kairo-leve', 'kairo-footwear', 'Tênis Kairo Leve', '/brands/products/kairo-leve.svg',
   'Tênis leve para caminhada e corrida curta, com amortecimento macio.', 'https://example.com/kairo-footwear/kairo-leve', 39990),
  ('mare-lycra', 'mare-surf-co', 'Lycra Maré UV50', '/brands/products/mare-lycra.svg',
   'Lycra de manga longa com proteção UV50 para o mar e a piscina.', 'https://example.com/mare-surf-co/lycra-uv50', 15990),
  ('brasa-faca', 'brasa-cozinha', 'Faca do chef 20 cm', '/brands/products/brasa-faca.svg',
   'Lâmina de aço inox com cabo antiderrapante; a faca coringa da cozinha.', 'https://example.com/brasa-cozinha/faca-do-chef-20', 18990),
  ('brasa-chaira', 'brasa-cozinha', 'Chaira de aço 25 cm', '/brands/products/brasa-chaira.svg',
   'Alinha o fio da faca entre as afiações; uso rápido antes de cortar.', 'https://example.com/brasa-cozinha/chaira-25', 7990),
  ('brasa-prato', 'brasa-cozinha', 'Prato raso de cerâmica 27 cm', '/brands/products/brasa-prato.svg',
   'Prato de cerâmica fosca, vai ao micro-ondas e à lava-louças.', 'https://example.com/brasa-cozinha/prato-raso-27', 5990),
  ('brasa-tabua', 'brasa-cozinha', 'Tábua de corte de bambu', '/brands/products/brasa-tabua.svg',
   'Tábua firme e leve, com canaleta para o caldo dos alimentos.', 'https://example.com/brasa-cozinha/tabua-bambu', 6990)
) as s (key, brand, name, image, description, url, price)
where exists (select 1 from public.brands b where b.id = public.seed_uuid('brand:' || s.brand))
  and not exists (select 1 from public.admin_audit a where a.action = 'brand_product.delete' and a.resource_id = public.seed_uuid('brand_product:' || s.key)::text)
on conflict do nothing;

-- herói ↔ marca: só "produto identificado" (há produto da marca marcado numa foto dele)
insert into public.creator_brands (id, creator_id, brand_id, relationship, status, sort_order)
select public.seed_uuid('creator_brand:' || s.key), c.id, public.seed_uuid('brand:' || s.brand), 'identified', 'active', s.sort
from (values
  ('jacquin-brasa', 'erick-jacquin', 'brasa-cozinha', 1::smallint),
  ('medina-volta', 'gabriel-medina', 'volta-sports', 1::smallint),
  ('medina-brasa', 'gabriel-medina', 'brasa-cozinha', 2::smallint)
) as s (key, hero, brand, sort)
join public.creator_profiles c on c.slug = s.hero
where exists (select 1 from public.brands b where b.id = public.seed_uuid('brand:' || s.brand))
  and not exists (select 1 from public.admin_audit a where a.action = 'creator.brands' and a.resource_id = c.id::text)
on conflict do nothing;

-- Smart Tags em fotos de banco de imagem dos posts (posição em % da foto)
insert into public.media_smart_tags (id, content_id, media_key, media_url, brand_product_id, x_pct, y_pct, label_side, status, sort_order, is_demo)
select public.seed_uuid('smart_tag:' || s.key), ct.id, 'cover', ct.cover_url, public.seed_uuid('brand_product:' || s.product), s.x, s.y, s.side, 'active', s.sort, true
from (values
  ('facas-faca', 'afiar-e-cuidar-das-facas-g7', 'brasa-faca', 46.00, 63.00, 'left', 1::smallint),
  ('facas-chaira', 'afiar-e-cuidar-das-facas-g7', 'brasa-chaira', 83.00, 59.50, 'top', 2::smallint),
  ('hidratacao-copo', 'hidratacao-quanto-beber-de-verdade-n2', 'volta-copo', 66.00, 68.00, 'left', 1::smallint),
  ('pre-pos-prato', 'pre-e-pos-treino-o-basico-sem-exagero-n9', 'brasa-prato', 15.00, 31.00, 'right', 1::smallint)
) as s (key, content, product, x, y, side, sort)
join public.content ct on ct.slug = s.content and ct.cover_url is not null
where exists (select 1 from public.brand_products p where p.id = public.seed_uuid('brand_product:' || s.product))
  and not exists (select 1 from public.admin_audit a where a.action = 'content.smart_tags' and a.resource_id = ct.id::text)
on conflict do nothing;

-- produtos recomendados sob o conteúdo
insert into public.content_brand_products (id, content_id, brand_product_id, status, sort_order)
select public.seed_uuid('content_brand_product:' || s.key), ct.id, public.seed_uuid('brand_product:' || s.product), 'active', s.sort
from (values
  ('hidratacao-garrafa', 'hidratacao-quanto-beber-de-verdade-n2', 'volta-garrafa', 1::smallint),
  ('hidratacao-copo', 'hidratacao-quanto-beber-de-verdade-n2', 'volta-copo', 2::smallint),
  ('facas-faca', 'afiar-e-cuidar-das-facas-g7', 'brasa-faca', 1::smallint),
  ('facas-chaira', 'afiar-e-cuidar-das-facas-g7', 'brasa-chaira', 2::smallint)
) as s (key, content, product, sort)
join public.content ct on ct.slug = s.content
where exists (select 1 from public.brand_products p where p.id = public.seed_uuid('brand_product:' || s.product))
  and not exists (select 1 from public.admin_audit a where a.action = 'content.brand_links' and a.resource_id = ct.id::text)
on conflict do nothing;

-- equipamentos recomendados em 2 programas
insert into public.program_brand_products (id, program_id, brand_product_id, note, status, sort_order)
select public.seed_uuid('program_brand_product:' || s.key), pg.id, public.seed_uuid('brand_product:' || s.product), s.note, 'active', s.sort
from (values
  ('hidratacao-garrafa', 'hidratacao-e-energia', 'volta-garrafa', 'Para levar a água para o treino e o dia todo.', 1::smallint),
  ('hidratacao-relogio', 'hidratacao-e-energia', 'pulse-run', 'Lembrete de beber água e o ritmo do treino no pulso.', 2::smallint),
  ('hidratacao-tenis', 'hidratacao-e-energia', 'kairo-leve', 'Para as caminhadas e trotes do programa.', 3::smallint),
  ('facas-faca', 'tecnicas-de-faca-e-mise-en-place', 'brasa-faca', 'A faca das técnicas de corte do programa.', 1::smallint),
  ('facas-tabua', 'tecnicas-de-faca-e-mise-en-place', 'brasa-tabua', 'Base firme para o mise en place.', 2::smallint),
  ('facas-chaira', 'tecnicas-de-faca-e-mise-en-place', 'brasa-chaira', 'Mantém o fio entre uma afiação e outra.', 3::smallint)
) as s (key, program, product, note, sort)
join public.programs pg on pg.slug = s.program
where exists (select 1 from public.brand_products p where p.id = public.seed_uuid('brand_product:' || s.product))
  and not exists (select 1 from public.admin_audit a where a.action = 'program.brand_products' and a.resource_id = pg.id::text)
on conflict do nothing;
