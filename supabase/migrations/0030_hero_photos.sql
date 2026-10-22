-- =============================================================================
-- Ultra Hero · 0030 · Fotos reais nos heróis e nos posts (só DADOS)
--   Os 8 heróis continuam personagens fictícios (nome e selo "Personagem fictício" intactos); só a
--   foto de perfil, a capa e as capas dos posts publicados trocam a arte gerada por foto real
--   (arquivos em public/heroes e public/content, créditos em docs/photo-credits.md). Decisão do
--   responsável para a apresentação do app. Idempotente: só troca o que ainda é /placeholders/ ou
--   vazio, então não sobrescreve capa trocada depois; sem drop nem delete.
-- =============================================================================

-- Heróis: foto de perfil e capa (só troca o que ainda é arte gerada ou vazio).
update public.creator_profiles c
   set avatar_url = case when c.avatar_url is null or c.avatar_url like '/placeholders/%' then v.avatar_url else c.avatar_url end,
       cover_url  = case when c.cover_url  is null or c.cover_url  like '/placeholders/%' then v.cover_url  else c.cover_url  end
  from (values
    ('bruna-castellano', '/heroes/bruna-castellano-avatar.webp', '/heroes/bruna-castellano-cover.webp'),
    ('camila-sato', '/heroes/camila-sato-avatar.webp', '/heroes/camila-sato-cover.webp'),
    ('davi-nascimento', '/heroes/davi-nascimento-avatar.webp', '/heroes/davi-nascimento-cover.webp'),
    ('helena-vilar', '/heroes/helena-vilar-avatar.webp', '/heroes/helena-vilar-cover.webp'),
    ('lia-monteiro', '/heroes/lia-monteiro-avatar.webp', '/heroes/lia-monteiro-cover.webp'),
    ('marcos-ferraz', '/heroes/marcos-ferraz-avatar.webp', '/heroes/marcos-ferraz-cover.webp'),
    ('rafael-duarte', '/heroes/rafael-duarte-avatar.webp', '/heroes/rafael-duarte-cover.webp'),
    ('tiago-albuquerque', '/heroes/tiago-albuquerque-avatar.webp', '/heroes/tiago-albuquerque-cover.webp')
  ) as v (slug, avatar_url, cover_url)
 where c.slug = v.slug
   and ((c.avatar_url is null or c.avatar_url like '/placeholders/%') or (c.cover_url is null or c.cover_url like '/placeholders/%'));

-- Posts publicados do Início/Explorar: capa com foto real (só troca arte gerada ou vazio).
update public.content c
   set cover_url = v.cover_url
  from (values
    ('afiar-e-cuidar-das-facas-g7', '/content/afiar-e-cuidar-das-facas-g7.webp'),
    ('alongamento-leve-antes-de-dormir-r6', '/content/alongamento-leve-antes-de-dormir-r6.webp'),
    ('aquecimento-de-5-minutos-antes-de-correr-t10', '/content/aquecimento-de-5-minutos-antes-de-correr-t10.webp'),
    ('arroz-integral-soltinho-de-verdade-g4', '/content/arroz-integral-soltinho-de-verdade-g4.webp'),
    ('blocos-de-foco-organize-o-dia-em-3-prioridades-r3', '/content/blocos-de-foco-organize-o-dia-em-3-prioridades-r3.webp'),
    ('bowl-de-frango-grelhado-com-legumes-assados-g1', '/content/bowl-de-frango-grelhado-com-legumes-assados-g1.webp'),
    ('cafe-da-manha-em-5-minutos-3-ideias-n7', '/content/cafe-da-manha-em-5-minutos-3-ideias-n7.webp'),
    ('caminhada-corrida-semana-1-t4', '/content/caminhada-corrida-semana-1-t4.webp'),
    ('checklist-semanal-de-autocuidado-r5', '/content/checklist-semanal-de-autocuidado-r5.webp'),
    ('como-escolher-o-tenis-de-corrida-t8', '/content/como-escolher-o-tenis-de-corrida-t8.webp'),
    ('como-montar-uma-rotina-noturna-que-funciona-r2', '/content/como-montar-uma-rotina-noturna-que-funciona-r2.webp'),
    ('core-em-12-minutos-t6', '/content/core-em-12-minutos-t6.webp'),
    ('desligar-as-telas-experimento-de-7-dias-r10', '/content/desligar-as-telas-experimento-de-7-dias-r10.webp'),
    ('fibras-fontes-simples-no-dia-a-dia-n8', '/content/fibras-fontes-simples-no-dia-a-dia-n8.webp'),
    ('forca-basica-agachar-empurrar-puxar-t3', '/content/forca-basica-agachar-empurrar-puxar-t3.webp'),
    ('hidratacao-quanto-beber-de-verdade-n2', '/content/hidratacao-quanto-beber-de-verdade-n2.webp'),
    ('higiene-do-sono-8-ajustes-simples-r9', '/content/higiene-do-sono-8-ajustes-simples-r9.webp'),
    ('intervalado-leve-para-iniciantes-t7', '/content/intervalado-leve-para-iniciantes-t7.webp'),
    ('lanches-praticos-para-a-tarde-n4', '/content/lanches-praticos-para-a-tarde-n4.webp'),
    ('lista-de-compras-inteligente-n10', '/content/lista-de-compras-inteligente-n10.webp'),
    ('marmita-de-carne-moida-com-abobora-g8', '/content/marmita-de-carne-moida-com-abobora-g8.webp'),
    ('mise-en-place-cozinhe-2x-mais-rapido-g10', '/content/mise-en-place-cozinhe-2x-mais-rapido-g10.webp'),
    ('mobilidade-de-quadril-em-8-minutos-t2', '/content/mobilidade-de-quadril-em-8-minutos-t2.webp'),
    ('molho-de-ervas-em-5-minutos-g3', '/content/molho-de-ervas-em-5-minutos-g3.webp'),
    ('omelete-de-forno-para-a-semana-g2', '/content/omelete-de-forno-para-a-semana-g2.webp'),
    ('panqueca-de-aveia-e-banana-g9', '/content/panqueca-de-aveia-e-banana-g9.webp'),
    ('planejamento-de-refeicoes-em-30-minutos-n5', '/content/planejamento-de-refeicoes-em-30-minutos-n5.webp'),
    ('por-que-streaks-funcionam-e-quando-nao-r7', '/content/por-que-streaks-funcionam-e-quando-nao-r7.webp'),
    ('prato-equilibrado-o-metodo-da-mao-n1', '/content/prato-equilibrado-o-metodo-da-mao-n1.webp'),
    ('pre-e-pos-treino-o-basico-sem-exagero-n9', '/content/pre-e-pos-treino-o-basico-sem-exagero-n9.webp'),
    ('proteina-ao-longo-do-dia-por-que-distribuir-n6', '/content/proteina-ao-longo-do-dia-por-que-distribuir-n6.webp'),
    ('respiracao-4-7-8-para-desacelerar-r4', '/content/respiracao-4-7-8-para-desacelerar-r4.webp'),
    ('revisao-semanal-em-15-minutos-r8', '/content/revisao-semanal-em-15-minutos-r8.webp'),
    ('ritual-matinal-de-10-minutos-r1', '/content/ritual-matinal-de-10-minutos-r1.webp'),
    ('rotulos-5-coisas-para-olhar-primeiro-n3', '/content/rotulos-5-coisas-para-olhar-primeiro-n3.webp'),
    ('salmao-ao-forno-com-batata-doce-g5', '/content/salmao-ao-forno-com-batata-doce-g5.webp'),
    ('sopa-de-legumes-com-grao-de-bico-g6', '/content/sopa-de-legumes-com-grao-de-bico-g6.webp'),
    ('tecnica-de-agachamento-5-erros-comuns-t5', '/content/tecnica-de-agachamento-5-erros-comuns-t5.webp'),
    ('treino-de-forca-em-casa-com-elastico-t9', '/content/treino-de-forca-em-casa-com-elastico-t9.webp'),
    ('treino-funcional-iniciante-corpo-inteiro-t1', '/content/treino-funcional-iniciante-corpo-inteiro-t1.webp')
  ) as v (slug, cover_url)
 where c.slug = v.slug
   and (c.cover_url is null or c.cover_url like '/placeholders/%');
