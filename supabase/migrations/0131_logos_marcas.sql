-- =============================================================================
-- 0131 — Logos do universo de marcas (07/11/2026).
--
-- Decisões (aprovadas pelo responsável: "pode fazer tudo com os logos"):
--   • Cada marca importada ganha o melhor logo disponível, guardado no próprio app (public/brands/m/<slug>.*):
--     vetor oficial (SVG do Wikimedia Commons, conferido pelo site oficial da marca), senão o ícone do site, senão
--     fica sem imagem (a tela mostra as iniciais). Só preenche quem ainda está sem logo.
--   • Trocar o logo: a Groscove (gestor+) e a própria marca (dono ou equipe). O arquivo enviado vai para o bucket
--     público brand-logos (só o servidor grava, com o service role); brand_logo_set confere quem pode.
-- =============================================================================

-- quem pode trocar o logo da marca
create or replace function public.brand_logo_can_edit(p_brand uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or (public.groscove_agency_id() is not null and public.agency_can(public.groscove_agency_id(), 'manager'))
    or exists (select 1 from public.brand_members m where m.brand_id = p_brand and m.user_id = auth.uid() and m.revoked_at is null))
$$;
revoke execute on function public.brand_logo_can_edit(uuid) from public, anon;
grant execute on function public.brand_logo_can_edit(uuid) to authenticated, service_role;

create or replace function public.brand_logo_set(p_brand uuid, p_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.brand_logo_can_edit(p_brand) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.brands b where b.id = p_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.brand_image_url_ok(v_url) then raise exception 'invalid_image' using errcode = '22023'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.brands set logo_url = v_url where id = p_brand;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('brand.logo_set', 'brand', p_brand::text, null, jsonb_build_object('logo_url', v_url), null, 'brand');
  return true;
end $$;
revoke execute on function public.brand_logo_set(uuid, text) from public, anon;
grant execute on function public.brand_logo_set(uuid, text) to authenticated, service_role;

-- bucket público; nenhuma escrita pela API (só o service role)
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0131: schema storage ausente; bucket brand-logos não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('brand-logos', 'brand-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
end $$;

-- logos importados (gerado a partir da busca de 07/11/2026); só onde ainda não há logo
-- @@LOGOS@@
update public.brands b set logo_url = v.url
from (values
  ('99', '/brands/m/99.png'),
  ('Adidas', '/brands/m/adidas.svg'),
  ('Amaro', '/brands/m/amaro.png'),
  ('Amazon', '/brands/m/amazon.svg'),
  ('Amazon Prime', '/brands/m/amazon-prime.svg'),
  ('Ambev', '/brands/m/ambev.svg'),
  ('Ame', '/brands/m/ame.png'),
  ('Americanas', '/brands/m/americanas.png'),
  ('Amil', '/brands/m/amil.svg'),
  ('Amobeleza', '/brands/m/amobeleza.png'),
  ('Anhanguera', '/brands/m/anhanguera.png'),
  ('ASUS', '/brands/m/asus.png'),
  ('Aurora Alimentos', '/brands/m/aurora-alimentos.png'),
  ('Azul Linhas Aéreas', '/brands/m/azul-linhas-aereas.svg'),
  ('Babaloo', '/brands/m/babaloo.png'),
  ('Banco Original', '/brands/m/banco-original.svg'),
  ('Beleza na Web', '/brands/m/beleza-na-web.png'),
  ('Bet Nacional', '/brands/m/bet-nacional.png'),
  ('Beyoung', '/brands/m/beyoung.png'),
  ('Bis', '/brands/m/bis.png'),
  ('BlaBlaCar', '/brands/m/blablacar.png'),
  ('Bradesco Saúde', '/brands/m/bradesco-saude.png'),
  ('Burger King', '/brands/m/burger-king.png'),
  ('Buser', '/brands/m/buser.svg'),
  ('BusOn', '/brands/m/buson.png'),
  ('C&A', '/brands/m/c-a.png'),
  ('Calvin Klein', '/brands/m/calvin-klein.svg'),
  ('Chandon', '/brands/m/chandon.png'),
  ('Chevrolet', '/brands/m/chevrolet.svg'),
  ('Cigana Beleza', '/brands/m/cigana-beleza.png'),
  ('ClickBus', '/brands/m/clickbus.png'),
  ('Clube da Borracha', '/brands/m/clube-da-borracha.png'),
  ('Coca-Cola', '/brands/m/coca-cola.svg'),
  ('CompraCerta', '/brands/m/compracerta.png'),
  ('Contém 1g', '/brands/m/contem-1g.png'),
  ('Continental', '/brands/m/continental.png'),
  ('Converse', '/brands/m/converse.svg'),
  ('Dafiti', '/brands/m/dafiti.jpg'),
  ('Diesel', '/brands/m/diesel.svg'),
  ('DJI', '/brands/m/dji.svg'),
  ('Dr. Consulta', '/brands/m/dr-consulta.png'),
  ('Drogal', '/brands/m/drogal.png'),
  ('Droga Raia', '/brands/m/droga-raia.png'),
  ('Drogaria Pacheco', '/brands/m/drogaria-pacheco.png'),
  ('Drogaria São Paulo', '/brands/m/drogaria-sao-paulo.png'),
  ('Dudalina', '/brands/m/dudalina.png'),
  ('Electrolux', '/brands/m/electrolux.png'),
  ('Ellus', '/brands/m/ellus.png'),
  ('Estoque', '/brands/m/estoque.png'),
  ('Eudora', '/brands/m/eudora.png'),
  ('Extra', '/brands/m/extra.png'),
  ('Fiat', '/brands/m/fiat.png'),
  ('Fila', '/brands/m/fila.svg'),
  ('Fleury', '/brands/m/fleury.png'),
  ('Foxtons', '/brands/m/foxtons.png'),
  ('Frutap', '/brands/m/frutap.png'),
  ('Gafa', '/brands/m/gafa.png'),
  ('Garoto', '/brands/m/garoto.png'),
  ('Giuseppe Zanotti', '/brands/m/giuseppe-zanotti.png'),
  ('Globoplay', '/brands/m/globoplay.png'),
  ('Gran Cursos', '/brands/m/gran-cursos.png'),
  ('GrandVision', '/brands/m/grandvision.png'),
  ('Habib''s', '/brands/m/habib-s.png'),
  ('Hapvida', '/brands/m/hapvida.png'),
  ('Havan', '/brands/m/havan.png'),
  ('Heineken', '/brands/m/heineken.png'),
  ('Heinz', '/brands/m/heinz.png'),
  ('Hellmann''s', '/brands/m/hellmann-s.jpg'),
  ('Honda', '/brands/m/honda.png'),
  ('Hope', '/brands/m/hope.png'),
  ('Hotel Unique', '/brands/m/hotel-unique.png'),
  ('Hype', '/brands/m/hype.jpg'),
  ('iFood', '/brands/m/ifood.png'),
  ('Imaginarium', '/brands/m/imaginarium.png'),
  ('Infinix', '/brands/m/infinix.png'),
  ('Integralmedica', '/brands/m/integralmedica.png'),
  ('iPlace', '/brands/m/iplace.png'),
  ('Itaú', '/brands/m/itau.png'),
  ('John John', '/brands/m/john-john.png'),
  ('Kérastase', '/brands/m/kerastase.png'),
  ('KitchenAid', '/brands/m/kitchenaid.png'),
  ('Lacoste', '/brands/m/lacoste.png'),
  ('Lacta', '/brands/m/lacta.png'),
  ('Lancôme', '/brands/m/lancome.png'),
  ('Le Creuset', '/brands/m/le-creuset.png'),
  ('Le Lis', '/brands/m/le-lis.png'),
  ('Lenovo', '/brands/m/lenovo.png'),
  ('Leroy Merlin', '/brands/m/leroy-merlin.png'),
  ('Levi''s', '/brands/m/levi-s.png'),
  ('Lindt', '/brands/m/lindt.png'),
  ('Litet', '/brands/m/litet.png'),
  ('Live!', '/brands/m/live.png'),
  ('Localiza', '/brands/m/localiza.png'),
  ('L''Oréal', '/brands/m/l-oreal.png'),
  ('Mademsa', '/brands/m/mademsa.png'),
  ('Magalu', '/brands/m/magalu.png'),
  ('Maria Filó', '/brands/m/maria-filo.png'),
  ('McDonald''s', '/brands/m/mcdonald-s.png'),
  ('Mercado Livre', '/brands/m/mercado-livre.png'),
  ('Midea', '/brands/m/midea.png'),
  ('Multilaser', '/brands/m/multilaser.png'),
  ('Multishow', '/brands/m/multishow.png'),
  ('Natura', '/brands/m/natura.png'),
  ('Nescafé Dolce Gusto', '/brands/m/nescafe-dolce-gusto.png'),
  ('Nespresso', '/brands/m/nespresso.png'),
  ('Nestlé', '/brands/m/nestle.png'),
  ('Neutrogena', '/brands/m/neutrogena.png'),
  ('New Balance', '/brands/m/new-balance.svg'),
  ('Nike', '/brands/m/nike.png'),
  ('Nivea', '/brands/m/nivea.png'),
  ('Nova Brasil FM', '/brands/m/nova-brasil-fm.png'),
  ('Nubank', '/brands/m/nubank.png'),
  ('Nuuvem', '/brands/m/nuuvem.png'),
  ('NV', '/brands/m/nv.png'),
  ('O Boticário', '/brands/m/o-boticario.png'),
  ('Opaque', '/brands/m/opaque.png'),
  ('Osklen', '/brands/m/osklen.png'),
  ('Outback Steakhouse', '/brands/m/outback-steakhouse.png'),
  ('PagBank', '/brands/m/pagbank.png'),
  ('Pague Menos', '/brands/m/pague-menos.png'),
  ('Pandora', '/brands/m/pandora.png'),
  ('Panvel', '/brands/m/panvel.png'),
  ('Paris 6', '/brands/m/paris-6.jpg'),
  ('P&G', '/brands/m/p-g.png'),
  ('Philips Walita', '/brands/m/philips-walita.png'),
  ('PneuStore', '/brands/m/pneustore.png'),
  ('Polishop', '/brands/m/polishop.png'),
  ('Polyvox', '/brands/m/polyvox.png'),
  ('Ponto Frio', '/brands/m/ponto-frio.png'),
  ('Positiv.a', '/brands/m/positiv-a.png'),
  ('Positivo', '/brands/m/positivo.png'),
  ('Prevent Senior', '/brands/m/prevent-senior.png'),
  ('Puma', '/brands/m/puma.png'),
  ('Quem Disse Berenice', '/brands/m/quem-disse-berenice.png'),
  ('Red Bull', '/brands/m/red-bull.png'),
  ('Renner', '/brands/m/renner.png'),
  ('Republic Records', '/brands/m/republic-records.png'),
  ('Reserva', '/brands/m/reserva.png'),
  ('Reserva Mini', '/brands/m/reserva-mini.png'),
  ('Riachuelo', '/brands/m/riachuelo.png'),
  ('Ri Happy', '/brands/m/ri-happy.png'),
  ('Sadia', '/brands/m/sadia.png'),
  ('Salinas Rio', '/brands/m/salinas-rio.png'),
  ('Sallve', '/brands/m/sallve.png'),
  ('Sam''s Club', '/brands/m/sam-s-club.png'),
  ('Samsung', '/brands/m/samsung.png'),
  ('Santander', '/brands/m/santander.png'),
  ('Sawary Jeans', '/brands/m/sawary-jeans.png'),
  ('Sem Parar', '/brands/m/sem-parar.png'),
  ('Sephora', '/brands/m/sephora.png'),
  ('Shein', '/brands/m/shein.png'),
  ('Shiseido', '/brands/m/shiseido.png'),
  ('Shopee', '/brands/m/shopee.png'),
  ('Skinceuticals', '/brands/m/skinceuticals.png'),
  ('Sky Bar', '/brands/m/sky-bar.png'),
  ('Sodimac', '/brands/m/sodimac.png'),
  ('Sony Music', '/brands/m/sony-music.png'),
  ('Sorriso', '/brands/m/sorriso.png'),
  ('SulAmérica', '/brands/m/sulamerica.png'),
  ('Swift', '/brands/m/swift.png'),
  ('Tembici', '/brands/m/tembici.png'),
  ('Tinder', '/brands/m/tinder.png'),
  ('Tok & Stok', '/brands/m/tok-stok.png'),
  ('Toshiba', '/brands/m/toshiba.png'),
  ('Totanka', '/brands/m/totanka.png'),
  ('Tramontina', '/brands/m/tramontina.svg'),
  ('Trident', '/brands/m/trident.png'),
  ('Trocafone', '/brands/m/trocafone.png'),
  ('Uber', '/brands/m/uber.png'),
  ('Ultrafarma', '/brands/m/ultrafarma.png'),
  ('Umbro', '/brands/m/umbro.png'),
  ('Unidas', '/brands/m/unidas.png'),
  ('Unimed', '/brands/m/unimed.png'),
  ('Universal Music', '/brands/m/universal-music.png'),
  ('UOL Esporte', '/brands/m/uol-esporte.png'),
  ('UOL Play', '/brands/m/uol-play.png'),
  ('Vans', '/brands/m/vans.png'),
  ('Virgin Music Group', '/brands/m/virgin-music-group.png'),
  ('VOSS', '/brands/m/voss.png'),
  ('Warner Music Group', '/brands/m/warner-music-group.png'),
  ('Webcontinental', '/brands/m/webcontinental.png'),
  ('Weleda', '/brands/m/weleda.png'),
  ('World Tennis', '/brands/m/world-tennis.png'),
  ('Youcom', '/brands/m/youcom.png'),
  ('YSL Beauty', '/brands/m/ysl-beauty.png'),
  ('Zé Delivery', '/brands/m/ze-delivery.png'),
  ('Zee.Dog', '/brands/m/zee-dog.png'),
  ('Zee.Now', '/brands/m/zee-now.png'),
  ('Zorba', '/brands/m/zorba.png')
) as v(name, url)
where public.brand_name_key(b.name) = public.brand_name_key(v.name) and not b.is_demo
  and (b.logo_url is null or b.logo_url like '/brands/m/%');
