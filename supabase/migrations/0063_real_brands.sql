-- =============================================================================
-- Groscove Ultra · 0063 · Marcas reais no lugar das de exemplo (decisão do responsável, que tem a
-- documentação e a autorização das marcas). Saem as 5 marcas fictícias da 0062 (com seus produtos,
-- marcações e vínculos, por cascata); entram Nike, PUMA, ASICS, Yonex e C6 Bank com logo e site
-- oficiais, ligadas ao Neymar como patrocinadoras (o exemplo do pedido), produtos com link para a
-- loja oficial e Smart Tags nas fotos de treino dele. Tudo editável no admin (Marcas e produtos).
-- Idempotente: reaplicar não duplica nem desfaz edições (marca/produto existente fica como está).
-- =============================================================================

-- 1) fora as marcas de exemplo (produtos, marcações e vínculos vão junto)
delete from public.brands where is_demo;

-- 2) marcas reais
insert into public.brands (id, slug, name, logo_url, site_url, status, default_relationship, is_demo)
select public.seed_uuid('brand:' || s.slug), s.slug, s.name, '/brands/' || s.slug || '.svg', s.site, 'active', 'sponsor', false
from (values
  ('nike', 'Nike', 'https://www.nike.com.br/'),
  ('puma', 'PUMA', 'https://br.puma.com/'),
  ('asics', 'ASICS', 'https://www.asics.com/br/pt-br/'),
  ('yonex', 'Yonex', 'https://www.yonex.com/'),
  ('c6-bank', 'C6 Bank', 'https://www.c6bank.com.br/')
) as s (slug, name, site)
where not exists (select 1 from public.brands b where b.slug = s.slug)
on conflict do nothing;

-- 3) produtos (compra no site oficial da marca)
insert into public.brand_products (id, brand_id, name, image_url, description, external_url, price_cents, currency, status, is_demo)
select public.seed_uuid('brand_product:' || s.key), b.id, s.name, null, s.description, s.url, null, 'BRL', 'active', false
from (values
  ('nike-chuteira', 'nike', 'Chuteira de campo Nike', 'A chuteira dos treinos em campo.', 'https://www.nike.com.br/busca?q=chuteira%20campo'),
  ('nike-camisa-treino', 'nike', 'Camisa de treino Nike Dri-FIT', 'Camisa leve que seca rápido, para treino e jogo.', 'https://www.nike.com.br/busca?q=camisa%20dri-fit%20futebol'),
  ('nike-shorts', 'nike', 'Shorts de treino Nike', 'Shorts leve com cós elástico para treinar e correr.', 'https://www.nike.com.br/busca?q=shorts%20futebol'),
  ('asics-corrida', 'asics', 'Tênis de corrida ASICS', 'Amortecimento para as primeiras corridas e os treinos longos.', 'https://www.asics.com/br/pt-br/search?q=tenis%20corrida'),
  ('puma-corrida', 'puma', 'Tênis de corrida PUMA', 'Leve e responsivo para os tiros e o intervalado.', 'https://br.puma.com/search?q=tenis%20corrida')
) as s (key, brand, name, description, url)
join public.brands b on b.slug = s.brand
on conflict do nothing;

-- 4) Neymar ↔ marcas (patrocinadoras, na ordem do pedido)
insert into public.creator_brands (id, creator_id, brand_id, relationship, status, sort_order)
select public.seed_uuid('creator_brand:neymar-' || s.brand), c.id, b.id, 'sponsor', 'active', s.sort
from (values ('nike', 1::smallint), ('puma', 2::smallint), ('asics', 3::smallint), ('yonex', 4::smallint), ('c6-bank', 5::smallint)) as s (brand, sort)
join public.creator_profiles c on c.slug = 'neymar'
join public.brands b on b.slug = s.brand
on conflict do nothing;

-- 5) Smart Tags nas fotos de treino do Neymar (posição em % da foto)
insert into public.media_smart_tags (id, content_id, media_key, media_url, brand_product_id, x_pct, y_pct, label_side, status, sort_order, is_demo)
select public.seed_uuid('smart_tag:' || s.key), ct.id, 'cover', ct.cover_url, public.seed_uuid('brand_product:' || s.product), s.x, s.y, s.side, 'active', s.sort, false
from (values
  ('tenis-camisa', 'como-escolher-o-tenis-de-corrida-t8', 'nike-camisa-treino', 48.60, 20.00, 'right', 1::smallint),
  ('tenis-shorts', 'como-escolher-o-tenis-de-corrida-t8', 'nike-shorts', 48.00, 63.00, 'left', 2::smallint),
  ('tenis-chuteira', 'como-escolher-o-tenis-de-corrida-t8', 'nike-chuteira', 72.00, 87.00, 'left', 3::smallint),
  ('caminhada-camisa', 'caminhada-corrida-semana-1-t4', 'nike-camisa-treino', 60.40, 23.30, 'left', 1::smallint),
  ('caminhada-shorts', 'caminhada-corrida-semana-1-t4', 'nike-shorts', 73.80, 62.30, 'right', 2::smallint),
  ('caminhada-chuteira', 'caminhada-corrida-semana-1-t4', 'nike-chuteira', 56.80, 88.90, 'left', 3::smallint)
) as s (key, content, product, x, y, side, sort)
join public.content ct on ct.slug = s.content and ct.cover_url is not null
where exists (select 1 from public.brand_products p where p.id = public.seed_uuid('brand_product:' || s.product))
on conflict do nothing;

-- 6) produtos recomendados sob esses posts
insert into public.content_brand_products (id, content_id, brand_product_id, status, sort_order)
select public.seed_uuid('content_brand_product:' || s.key), ct.id, public.seed_uuid('brand_product:' || s.product), 'active', s.sort
from (values
  ('tenis-asics', 'como-escolher-o-tenis-de-corrida-t8', 'asics-corrida', 1::smallint),
  ('tenis-puma', 'como-escolher-o-tenis-de-corrida-t8', 'puma-corrida', 2::smallint),
  ('caminhada-asics', 'caminhada-corrida-semana-1-t4', 'asics-corrida', 1::smallint),
  ('caminhada-camisa', 'caminhada-corrida-semana-1-t4', 'nike-camisa-treino', 2::smallint)
) as s (key, content, product, sort)
join public.content ct on ct.slug = s.content
where exists (select 1 from public.brand_products p where p.id = public.seed_uuid('brand_product:' || s.product))
on conflict do nothing;

-- 7) equipamentos recomendados nos programas do Neymar
insert into public.program_brand_products (id, program_id, brand_product_id, note, status, sort_order)
select public.seed_uuid('program_brand_product:' || s.key), pg.id, public.seed_uuid('brand_product:' || s.product), s.note, 'active', s.sort
from (values
  ('sofa-asics', 'do-sofa-aos-5-km', 'asics-corrida', 'O tênis para sair do sofá e chegar aos 5 km.', 1::smallint),
  ('sofa-camisa', 'do-sofa-aos-5-km', 'nike-camisa-treino', 'Leve e seca rápido nos treinos.', 2::smallint),
  ('intervalado-puma', 'primeiro-intervalado', 'puma-corrida', 'Responsivo para os tiros do intervalado.', 1::smallint),
  ('intervalado-shorts', 'primeiro-intervalado', 'nike-shorts', 'Liberdade de movimento nos tiros.', 2::smallint)
) as s (key, program, product, note, sort)
join public.programs pg on pg.slug = s.program
where exists (select 1 from public.brand_products p where p.id = public.seed_uuid('brand_product:' || s.product))
on conflict do nothing;
