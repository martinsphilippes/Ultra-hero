-- =============================================================================
-- Groscove Ultra · 0123 · Página pública (aba Heróis) para os heróis importados do "Casting Groscove 2027" · cenário S125
-- Pedido do dono (informado do risco de uso de imagem): criar e PUBLICAR agora a página pública de cada herói que a 0122
-- importou para o casting da agência Groscove. Migração de DADOS; idempotente; nada de drop de tabela/coluna; nenhuma
-- função nova executável por anon (S14 segue 18).
--
-- Decisões (sem perguntar ao responsável):
--   • Quem: a mesma agência da 0122 (ATIVA, não demo, cujo admin não revogado tem o e-mail 'agencia@gmail.com'); sem
--     ela, nada acontece. Talentos dessa agência não arquivados, não demo, SEM página (creator_id null) e com foto do
--     casting (photo_url '/casting/<slug>.(webp|jpg|png)'): o CHECK da 0122 só aceita esse caminho local ou https, e só
--     a importação grava caminho local; então essa é a marca robusta do lote (não depende do texto do documento).
--   • Como: o mesmo núcleo do botão "Criar página pública" da ficha (0112 talent_page_create — página já ligada ao
--     talento por talent_profiles.creator_id, que é o vínculo que "Heróis da agência" e "publicar em nome" usam via
--     agency_hero_ids). agency_talent_create_page exige sessão; aqui chamamos o núcleo interno, como a 0122 fez.
--     Talento já com login próprio (conta existente ligada na importação ou convite já aceito): o núcleo passa o login
--     para o herói da MESMA pessoa (regra da 0112). Se a conta já tem outro herói (has_hero), o nome é pulado e listado.
--   • Página: slug = o da foto (/casting/anitta.webp → anitta; slug de menos de 3 letras, como "pk", usa o @ do
--     Instagram, "pkdelas", em vez do "pk-creator" do free_slug); nome = nome do casting; foto (avatar_url) = a foto do
--     casting; capa vazia (o card e a página já têm superfície lisa sem capa); headline = categoria em pt-BR (mapa
--     abaixo); bio = os temas do documento ("MPB · Música autoral · Turnês internacionais"; sem temas, sem bio);
--     is_fictional = false; rights_status 'pending' (sem titular): o público não vê selo (só herói fictício ganha selo)
--     e a agência/admin veem o aviso interno "Registrar autorização de imagem" (needsImageAuthorization); status
--     'active' = publicada na aba Heróis. sort_order 1000 + página do documento: os heróis editoriais (10–80) seguem
--     na frente e o lote entra na ordem do documento.
--   • Pilares (obrigatório 1–4; o app só tem routine, training, nutrition, gastronomy — pilares de bem-estar): segmento
--     Esporte → training; todos os outros segmentos (Música, Influência, Atuação, Apresentação, Humor, Moda/Modelo,
--     Fotografia, Imprensa digital, Negócios) → routine (rotina/estilo de vida, o pilar neutro). Os temas acrescentam:
--     Fitness/Corrida/Esporte/Futebol/Surfe/Jiu-jitsu/Emagrecimento/Motociclismo → training; Alimentação/Nutrição →
--     nutrition; Gastronomia/Culinária/Receitas → gastronomy.
--   • Colisão de slug: slug já usado por OUTRA pessoa → sufixo -2, -3… (free_slug). Mesmo slug E mesmo nome (a mesma
--     pessoa — ex.: Anitta e Neymar já são heróis editoriais desde a 0044) com a página existente real, sem titular e
--     fora de qualquer casting: NÃO cria uma segunda página; liga o talento à página existente (sem mexer em conteúdo,
--     foto ou direitos dela). Se essa página não puder ser ligada (tem titular, é de outro casting, é fictícia ou o
--     talento já tem login), o nome é pulado com o motivo 'same_person_page_exists' (melhor que duas páginas da mesma
--     pessoa na aba Heróis).
--   • Reivindicação: o aceite (accept_invitation_core, 0091, sem mudança) lê talent_profiles.creator_id NA HORA do
--     aceite; com página, a conta vira titular dela (creator_profiles.user_id + papel creator escopo creator). Então a
--     página criada DEPOIS do convite já é coberta — o convite pendente da 0122 continua valendo (S125 confere).
--   • Categorias do herói (chips da aba, 0049) são curadoria do admin: não são criadas aqui.
--   • Idempotente: só pega talento sem página; rodar de novo não cria nada. Resumo em audit_log 'casting.publish'
--     (cada página também tem o 'agency.hero.create' do núcleo).
-- =============================================================================

-- categoria do selo (documento, em inglês) → headline em pt-BR
create or replace function public.casting_category_headline(p_category text)
returns text language sql immutable set search_path = '' as $$
  select case lower(btrim(coalesce(p_category, '')))
    when 'influencer' then 'Influenciador(a) digital'
    when 'digital influencer' then 'Influenciador(a) digital'
    when 'musical artist' then 'Artista musical'
    when 'singer' then 'Cantor(a)'
    when 'actress' then 'Atriz'
    when 'actor' then 'Ator'
    when 'model' then 'Modelo'
    when 'miss / model' then 'Miss e modelo'
    when 'tv host' then 'Apresentador(a) de TV'
    when 'photographer' then 'Fotógrafo(a)'
    when 'comedian' then 'Humorista'
    when 'football player' then 'Jogador de futebol'
    when 'businessman' then 'Empresário'
    when 'event' then 'Festa e coletivo'
    when 'cosplayer' then 'Cosplayer'
    when 'dancer' then 'Dançarino(a)'
    when 'surfer' then 'Surfista'
    when 'artistic swimmers' then 'Nado artístico'
    when 'motorcycle racer' then 'Piloto de motovelocidade'
    when '' then null
    else btrim(p_category) end
$$;
revoke execute on function public.casting_category_headline(text) from public, anon, authenticated;
grant execute on function public.casting_category_headline(text) to service_role;

-- segmento do casting + temas → pilares (1 a 4, sem repetir, segmento primeiro)
create or replace function public.casting_pillars(p_segment text, p_topics text[])
returns text[] language sql immutable set search_path = '' as $$
  with t as (select lower(array_to_string(coalesce(p_topics, '{}'::text[]), '|')) as s),
  c(p, o) as (
    select case when p_segment = 'esportes' then 'training' else 'routine' end, 1
    union all select 'training', 2 from t where t.s ~ '(fitness|corrida|esporte|futebol|surf|jiu-jitsu|emagrecimento|motociclismo|treino)'
    union all select 'nutrition', 3 from t where t.s ~ '(aliment|nutri)'
    union all select 'gastronomy', 4 from t where t.s ~ '(gastronom|culin|receita|cozinha)'
  )
  select array_agg(p order by o) from (select distinct on (p) p, o from c order by p, o) x
$$;
revoke execute on function public.casting_pillars(text, text[]) from public, anon, authenticated;
grant execute on function public.casting_pillars(text, text[]) to service_role;

-- publica as páginas (interno; devolve o resumo)
create or replace function public.casting_groscove_2027_publish(p_admin_email text default 'agencia@gmail.com')
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_agency uuid; r record; v_base text; v_slug text; v_seg text; v_id uuid; v_page jsonb; v_existing record; v_bio text;
  n_created int := 0; n_linked int := 0; n_suffixed int := 0; v_skipped jsonb := '[]'::jsonb;
begin
  select m.agency_id into v_agency
  from public.agency_members m
  join auth.users u on u.id = m.user_id
  join public.agencies a on a.id = m.agency_id
  where lower(u.email::text) = lower(btrim(p_admin_email)) and m.role = 'admin' and m.revoked_at is null and a.status = 'active'
    and not public.agency_is_demo(a.id)
  order by a.created_at limit 1;
  if v_agency is null then
    return jsonb_build_object('agency', null, 'note', 'agência não encontrada: nada a publicar');
  end if;

  for r in
    select t.id, t.display_name, t.user_id, t.photo_url, t.category_label, t.topics,
           substring(t.photo_url from '^/casting/([a-z0-9]+(?:-[a-z0-9]+)*)\.(?:webp|jpg|png)$') as photo_slug,
           coalesce(substring(t.internal_notes from '\(p\. ([0-9]+),'), '0')::int as doc_page
    from public.talent_profiles t
    where t.agency_id = v_agency and t.archived_at is null and not t.is_demo and t.creator_id is null
      and t.photo_url ~ '^/casting/'
    order by doc_page, t.display_name
  loop
    begin
      select s.slug into v_seg from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
      where l.talent_id = r.id order by s.sort_order limit 1;
      v_base := left(coalesce(r.photo_slug, public.slugify(r.display_name)), 50);

      -- a mesma pessoa já tem página (mesmo slug e mesmo nome): liga em vez de duplicar, quando dá
      select c.id, c.user_id, c.is_fictional, c.status::text as status,
             exists (select 1 from public.talent_profiles t2 where t2.creator_id = c.id) as in_casting
      into v_existing
      from public.creator_profiles c
      where c.slug = v_base and public.slugify(c.name) = public.slugify(r.display_name);
      if v_existing.id is not null then
        if v_existing.user_id is not null or v_existing.in_casting or v_existing.is_fictional or v_existing.status <> 'active'
           or r.user_id is not null then
          raise exception 'same_person_page_exists' using errcode = 'P0001';
        end if;
        perform set_config('app.trusted', 'on', true);
        update public.talent_profiles set creator_id = v_existing.id where id = r.id and creator_id is null;
        perform set_config('app.trusted', 'off', true);
        perform public.audit_log('agency.hero.link', 'creator_profile', v_existing.id::text, null,
          jsonb_build_object('agency', v_agency, 'talent_id', r.id, 'slug', v_base, 'source', 'Casting Groscove 2027'), null, 'system');
        n_linked := n_linked + 1;
        continue;
      end if;

      -- slug curto demais (ex.: "PK" → free_slug daria "pk-creator"): usa o @ do Instagram (pkdelas)
      if char_length(v_base) < 3 then
        v_base := coalesce((select left(nullif(public.slugify(a.handle), ''), 50) from public.talent_social_accounts a
                            where a.talent_id = r.id and a.network = 'instagram' order by a.created_at limit 1), v_base);
      end if;
      v_slug := public.free_slug(v_base, 'creator');
      if v_slug <> v_base then n_suffixed := n_suffixed + 1; end if;
      v_bio := nullif(array_to_string(r.topics, ' · '), '');
      v_page := jsonb_build_object('slug', v_slug, 'pillars', to_jsonb(public.casting_pillars(v_seg, r.topics)),
                                   'headline', public.casting_category_headline(r.category_label), 'bio', v_bio);
      v_id := public.talent_page_create(r.id, v_agency, v_page);
      -- o núcleo cria como 'authorized' pela agência; aqui a autorização de imagem ainda não foi registrada
      perform set_config('app.trusted', 'on', true);
      update public.creator_profiles
      set avatar_url = r.photo_url, cover_url = null, rights_status = 'pending', rights_holder = null,
          sort_order = 1000 + r.doc_page
      where id = v_id;
      perform set_config('app.trusted', 'off', true);
      n_created := n_created + 1;
    exception when others then
      perform set_config('app.trusted', 'off', true);
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('name', r.display_name, 'talent_id', r.id, 'reason', sqlerrm));
    end;
  end loop;

  perform public.audit_log('casting.publish', 'agency', v_agency::text, null,
    jsonb_build_object('source', 'Casting Groscove 2027', 'created', n_created, 'linked_existing', n_linked,
                       'slug_suffixed', n_suffixed, 'skipped', v_skipped), null, 'system');
  return jsonb_build_object('agency', v_agency, 'created', n_created, 'linked_existing', n_linked,
                            'slug_suffixed', n_suffixed, 'skipped', v_skipped);
end $$;
revoke execute on function public.casting_groscove_2027_publish(text) from public, anon, authenticated;
grant execute on function public.casting_groscove_2027_publish(text) to service_role;

-- roda a publicação (sem a agência, não faz nada)
do $$
declare v jsonb;
begin
  v := public.casting_groscove_2027_publish('agencia@gmail.com');
  raise notice 'casting_groscove_2027_publish: %', v;
end $$;

notify pgrst, 'reload schema';
