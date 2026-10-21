-- 0021: produtos Ultra.e Life (marca própria, com imagem real) e alocação direta produto↔herói.
-- Fonte dos dados: site da marca (ultra-branding-analysis.replit.app) e loja oficial, em 21/10/2026.
-- As compras no Ultra Hero continuam simuladas; a loja oficial fica em attributes.external_url.
-- Nota: o CHECK de product_categories.kind não é alterado (exigiria DROP, que o conector remoto
-- não executa); as categorias novas usam kind 'lifestyle' e se distinguem pelo code.

-- 1) Fornecedor: a marca, como operação própria (não fictícia).
insert into public.seller_organizations (id, slug, name, kind, description, logo_url, is_fictional)
values (public.seed_uuid('seller:ultrae'), 'ultra-e-life', 'Ultra.e Life', 'own',
  'Marca própria de suplementação e hidratação. Loja oficial em selvaje.lojavirtualnuvem.com.br. No Ultra Hero as compras continuam simuladas.',
  '/products/e-creatina-po.jpg', false)
on conflict (id) do update set name = excluded.name, description = excluded.description, logo_url = excluded.logo_url, is_fictional = excluded.is_fictional;

-- 2) Categorias ingestíveis (exigem food_info ao publicar).
insert into public.product_categories (id, code, name, kind, is_food, sort_order) values
  (public.seed_uuid('cat:supplement'), 'supplement', '{"pt-BR":"Suplementos","en":"Supplements","es":"Suplementos"}', 'lifestyle', true, 50),
  (public.seed_uuid('cat:beverage'), 'beverage', '{"pt-BR":"Hidratação","en":"Hydration","es":"Hidratación"}', 'lifestyle', true, 60)
on conflict (id) do update set name = excluded.name, is_food = excluded.is_food, sort_order = excluded.sort_order;

-- 3) Os sete produtos. Ingredientes só os informados pela marca; o resto remete ao rótulo oficial.
-- (três inserts para caber nos blocos que o conector remoto aceita)
insert into public.products (id, seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, demo_stock, published_at) values
  (public.seed_uuid('product:ue-water-citrus'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:beverage'), 'e-water-citrus', 'e.water Citrus (pack 6 latas)',
   'O primeiro ritual. Água funcional com eletrólitos, feita para hidratação real no seu dia. Lata sparkling de 473 ml, sabor Citrus, com eletrólitos (sódio e potássio), 60 mg de cafeína e vitaminas B3, B5 e B6. Pack com 6 latas.',
   '/products/e-water-citrus.jpg', 6990, 'physical', '{"brand":"Ultra.e Life","format":"lata sparkling 473 ml","pack":6,"flavor":"citrus","external_url":"https://selvaje.lojavirtualnuvem.com.br/produtos/e-water-citrus-ultra-hidratacao-performance-agua-suplementar-pro-copia-hhs1w/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["água gaseificada","eletrólitos: sódio e potássio","cafeína: 60 mg por lata","vitaminas B3, B5 e B6","demais ingredientes: ver rótulo oficial"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now()),
  (public.seed_uuid('product:ue-water-tangerina'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:beverage'), 'e-water-tangerina', 'e.water Tangerina (pack 6 latas)',
   'A mesma base, outro ritmo. A expressão cítrica do e.water para acompanhar um ritual de hidratação que cabe no seu dia. Lata sparkling de 473 ml, sabor tangerina, com eletrólitos e vitaminas. Pack com 6 latas.',
   '/products/e-water-tangerina.jpg', 6990, 'physical', '{"brand":"Ultra.e Life","format":"lata sparkling 473 ml","pack":6,"flavor":"tangerina","external_url":"https://selvaje.lojavirtualnuvem.com.br/produtos/e-water-agua-suplementar-ultra-hidratante-alta-performance-pro-10mm1/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["água gaseificada","eletrólitos","vitaminas","demais ingredientes: ver rótulo oficial"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now())
on conflict (id) do update set title = excluded.title, description = excluded.description, image_url = excluded.image_url,
  price_cents_demo = excluded.price_cents_demo, attributes = excluded.attributes, food_info = excluded.food_info, category_id = excluded.category_id;

insert into public.products (id, seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, demo_stock, published_at) values
  (public.seed_uuid('product:ue-creatina-gummy'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:supplement'), 'e-creatina-gummy', 'e.creatina Gummy (60 gomas)',
   'A prática que sustenta. Creatina monohidratada em gomas para uma dose diária simples: 3 g por porção (2 gomas), sabor frutas vermelhas, embalagem com 60 unidades.',
   '/products/e-creatina-gummy.jpg', 8990, 'physical', '{"brand":"Ultra.e Life","format":"gomas","units":60,"serving":"2 gomas (3 g)","launch":true,"external_url":"https://selvaje.lojavirtualnuvem.com.br/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["creatina monohidratada (3 g por porção de 2 gomas)","demais ingredientes: ver rótulo oficial"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now()),
  (public.seed_uuid('product:ue-creatina-po'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:supplement'), 'e-creatina-po', 'e.creatina Pó (monohidratada)',
   'O essencial, em pó. Creatina monohidratada em pó para quem prefere uma rotina diária simples e direta. Formato e condições comerciais na loja oficial.',
   '/products/e-creatina-po.jpg', 8990, 'physical', '{"brand":"Ultra.e Life","format":"pó","external_url":"https://selvaje.lojavirtualnuvem.com.br/produtos/creatina-em-po-monohidratada-765kf/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["creatina monohidratada"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now())
on conflict (id) do update set title = excluded.title, description = excluded.description, image_url = excluded.image_url,
  price_cents_demo = excluded.price_cents_demo, attributes = excluded.attributes, food_info = excluded.food_info, category_id = excluded.category_id;

insert into public.products (id, seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, demo_stock, published_at) values
  (public.seed_uuid('product:ue-focus'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:supplement'), 'e-focus', 'e.focus (cápsulas)',
   'Atenção com método. Suplementação em cápsulas para acompanhar uma rotina de atenção e presença. Composição completa no rótulo e na loja oficial.',
   '/products/e-focus.jpg', 8990, 'physical', '{"brand":"Ultra.e Life","format":"cápsulas","external_url":"https://selvaje.lojavirtualnuvem.com.br/produtos/e-focus-capsulas-suplemento-10zpr/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["ver rótulo oficial"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now()),
  (public.seed_uuid('product:ue-daily'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:supplement'), 'e-daily', 'e.daily (cápsulas)',
   'A base do dia. Uma entrada diária em cápsulas para acompanhar a consistência da rotina. Composição completa no rótulo e na loja oficial.',
   '/products/e-daily.jpg', 8990, 'physical', '{"brand":"Ultra.e Life","format":"cápsulas","external_url":"https://selvaje.lojavirtualnuvem.com.br/produtos/e-daily-capsulas-suplemento-sam4e/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["ver rótulo oficial"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now()),
  (public.seed_uuid('product:ue-melatonina'), public.seed_uuid('seller:ultrae'), public.seed_uuid('cat:supplement'), 'e-melatonina', 'e.melatonina (cápsulas)',
   'Um ritual de desaceleração. Cápsulas de melatonina para o fim do dia. Composição completa no rótulo e na loja oficial.',
   '/products/e-melatonina.jpg', 8990, 'physical', '{"brand":"Ultra.e Life","format":"cápsulas","external_url":"https://selvaje.lojavirtualnuvem.com.br/produtos/e-melatonina-capsulas-suplemento-3b0vb/"}'::jsonb || '{"source":"ultra-branding-analysis.replit.app, 21/10/2026"}'::jsonb, '{"ingredients":["melatonina","demais ingredientes: ver rótulo oficial"],"allergens":["ver rótulo oficial"],"storage":"Conservar em local seco e fresco, ao abrigo da luz. Ver rótulo oficial."}', 'published', 'available', 50, now())
on conflict (id) do update set title = excluded.title, description = excluded.description, image_url = excluded.image_url,
  price_cents_demo = excluded.price_cents_demo, attributes = excluded.attributes, food_info = excluded.food_info, category_id = excluded.category_id;

-- 4) Alocação direta produto↔herói ("produtos do herói"), além do vínculo por conteúdo que já existe.
-- Reusa link_status: suggested (herói sugere), validated (admin aprova, aparece), suspended/rejected (some).
create table if not exists public.creator_products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status public.link_status not null default 'suggested',
  note text check (note is null or char_length(note) <= 500),
  sort_order int not null default 100,
  created_by uuid references auth.users (id) on delete set null,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, product_id)
);
create index if not exists creator_products_product_idx on public.creator_products (product_id);
alter table public.creator_products enable row level security;
revoke all on table public.creator_products from anon, authenticated;
grant select on table public.creator_products to anon, authenticated;
grant insert, delete on table public.creator_products to authenticated;
grant all on table public.creator_products to service_role;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_creator_products_updated' and tgrelid = 'public.creator_products'::regclass) then
    create trigger trg_creator_products_updated before update on public.creator_products for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_policies where tablename = 'creator_products' and policyname = 'creator_products_select') then
    create policy creator_products_select on public.creator_products for select to anon, authenticated
      using (status = 'validated' or (select public.is_admin()) or creator_id = (select public.my_creator_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'creator_products' and policyname = 'creator_products_insert') then
    create policy creator_products_insert on public.creator_products for insert to authenticated
      with check ((select public.is_admin())
                  or (creator_id = (select public.my_creator_id()) and status = 'suggested' and created_by = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'creator_products' and policyname = 'creator_products_delete') then
    create policy creator_products_delete on public.creator_products for delete to authenticated
      using ((select public.is_admin()) or (creator_id = (select public.my_creator_id()) and status = 'suggested'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'creator_products' and policyname = 'creator_products_update_admin') then
    create policy creator_products_update_admin on public.creator_products for update to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- Admin define o status (validated/suspended/rejected) com auditoria; criar e aprovar numa só chamada.
create or replace function public.admin_set_creator_product(p_creator uuid, p_product uuid, p_status public.link_status, p_note text default null, p_sort int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('validated', 'suspended', 'rejected') then raise exception 'invalid_status'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'creator_not_found'; end if;
  if not exists (select 1 from public.products where id = p_product) then raise exception 'product_not_found'; end if;
  select to_jsonb(cp) into v_before from public.creator_products cp where creator_id = p_creator and product_id = p_product;
  insert into public.creator_products (creator_id, product_id, status, note, sort_order, created_by, validated_by, validated_at)
  values (p_creator, p_product, p_status, v_note, coalesce(p_sort, 100), auth.uid(),
          case when p_status = 'validated' then auth.uid() end, case when p_status = 'validated' then now() end)
  on conflict (creator_id, product_id) do update
    set status = excluded.status,
        note = coalesce(excluded.note, public.creator_products.note),
        sort_order = coalesce(p_sort, public.creator_products.sort_order),
        validated_by = case when excluded.status = 'validated' then auth.uid() else public.creator_products.validated_by end,
        validated_at = case when excluded.status = 'validated' then now() else public.creator_products.validated_at end
  returning id into v_id;
  perform public.audit_log('creator_product.set_status', 'creator_product', v_id::text, v_before,
    jsonb_build_object('creator_id', p_creator, 'product_id', p_product, 'status', p_status, 'sort_order', p_sort), v_note);
  return v_id;
end $$;
revoke execute on function public.admin_set_creator_product(uuid, uuid, public.link_status, text, int) from public, anon;
grant execute on function public.admin_set_creator_product(uuid, uuid, public.link_status, text, int) to authenticated, service_role;

-- 5) Todos os heróis recebem os sete produtos, já validados (ordem fixa da vitrine da marca).
insert into public.creator_products (creator_id, product_id, status, sort_order, validated_at)
select c.id, p.id, 'validated',
       case p.slug when 'e-water-citrus' then 10 when 'e-water-tangerina' then 20 when 'e-creatina-gummy' then 30 when 'e-creatina-po' then 40
                   when 'e-focus' then 50 when 'e-daily' then 60 else 70 end,
       now()
from public.creator_profiles c
cross join public.products p
where p.seller_org_id = public.seed_uuid('seller:ultrae')
on conflict (creator_id, product_id) do nothing;
