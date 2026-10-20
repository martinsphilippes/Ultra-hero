-- =============================================================================
-- Ultra Hero · 0007 · Seed determinístico e reexecutável (dados FICTÍCIOS)
-- Personalidades, conteúdos, programas, produtos e operações são inventados
-- para a POC. Nenhuma celebridade real, nenhuma parceria, nenhum preço aprovado.
-- IDs derivados de md5(chave) para reexecução idempotente.
-- =============================================================================

create or replace function public.seed_uuid(p text)
returns uuid language sql immutable parallel safe strict as $$
  -- md5 determinístico com os bits de versão (4) e variante (10xx) do RFC 4122:
  -- os IDs do seed passam em validadores estritos (z.uuid()) como os de gen_random_uuid().
  select (substr(h, 1, 12) || '4' || substr(h, 14, 3)
          || substr('89ab', (('x' || substr(h, 17, 1))::bit(4)::int % 4) + 1, 1)
          || substr(h, 18, 15))::uuid
  from (select md5('ultra-hero:' || p) as h) t
$$;

-- ---------------------------------------------------------------- settings ---
insert into public.app_settings (key, value, description) values
  ('bootstrap_admin_emails', '["martinsphilippes@gmail.com"]'::jsonb, 'E-mails que recebem papel admin no primeiro login (auditado).'),
  ('commerce.enabled', 'true'::jsonb, 'Kill switch do comércio demonstrativo.'),
  ('ai.enabled', 'true'::jsonb, 'Kill switch das recomendações por IA (cai para determinístico).'),
  ('ai.provider', '"deterministic"'::jsonb, 'deterministic | openai | gemini (exige chave no servidor).'),
  ('ai.rate_limit_per_hour', '12'::jsonb, 'Máximo de recálculos de recomendação por usuário/hora.'),
  ('video.provider', '"embed"'::jsonb, 'embed | cloudflare_stream | mux (abstração; POC usa embed/demo).'),
  ('experiment.open', 'true'::jsonb, 'Cadastro público aberto para o experimento de 14 dias.'),
  ('retention.days', '{"analytics":90,"logs":30,"audit":365,"test_orders":90}'::jsonb, 'Política de retenção aprovada.'),
  ('transport.minutes_per_step', '10'::jsonb, 'Minutos entre etapas do transporte simulado.')
on conflict (key) do update set description = excluded.description;

-- ---------------------------------------------------------------- módulos e planos
insert into public.plan_modules (id, code, name, description, price_cents_demo, sort_order) values
  (public.seed_uuid('module:base'), 'base', 'Ultra Hero Base', 'Acesso aos conteúdos base de rotina, treino, nutrição e gastronomia. Valor demonstrativo.', 2990, 10),
  (public.seed_uuid('module:training_full'), 'training_full', 'Treino FULL', 'Treinos avançados e progressões. Valor demonstrativo.', 2000, 20),
  (public.seed_uuid('module:nutrition_full'), 'nutrition_full', 'Nutrição FULL', 'Guias aprofundados de nutrição educativa. Valor demonstrativo.', 2000, 30),
  (public.seed_uuid('module:chef_full'), 'chef_full', 'Chef FULL', 'Técnicas e receitas assinadas pelas personalidades de gastronomia. Valor demonstrativo.', 2000, 40)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.plans (id, code, name, description, is_free, sort_order) values
  (public.seed_uuid('plan:free'), 'free', 'Gratuito', 'Explore o catálogo e consuma conteúdos abertos.', true, 10),
  (public.seed_uuid('plan:base'), 'base', 'Base', 'Conteúdos base dos quatro pilares.', false, 20),
  (public.seed_uuid('plan:training'), 'training', 'Base + Treino FULL', 'Base com treinos avançados.', false, 30),
  (public.seed_uuid('plan:nutrition'), 'nutrition', 'Base + Nutrição FULL', 'Base com nutrição aprofundada.', false, 40),
  (public.seed_uuid('plan:chef'), 'chef', 'Base + Chef FULL', 'Base com técnicas de chef.', false, 50),
  (public.seed_uuid('plan:complete'), 'complete', 'Completo', 'Todos os módulos.', false, 60)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.plan_bundle_modules (plan_id, module_id) values
  (public.seed_uuid('plan:base'), public.seed_uuid('module:base')),
  (public.seed_uuid('plan:training'), public.seed_uuid('module:base')), (public.seed_uuid('plan:training'), public.seed_uuid('module:training_full')),
  (public.seed_uuid('plan:nutrition'), public.seed_uuid('module:base')), (public.seed_uuid('plan:nutrition'), public.seed_uuid('module:nutrition_full')),
  (public.seed_uuid('plan:chef'), public.seed_uuid('module:base')), (public.seed_uuid('plan:chef'), public.seed_uuid('module:chef_full')),
  (public.seed_uuid('plan:complete'), public.seed_uuid('module:base')), (public.seed_uuid('plan:complete'), public.seed_uuid('module:training_full')),
  (public.seed_uuid('plan:complete'), public.seed_uuid('module:nutrition_full')), (public.seed_uuid('plan:complete'), public.seed_uuid('module:chef_full'))
on conflict do nothing;

-- ---------------------------------------------------------------- personalidades fictícias
insert into public.creator_profiles (id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, rights_note, sort_order) values
  (public.seed_uuid('creator:lia'), 'lia-monteiro', 'Lia Monteiro', 'Rotina, sono e hábitos pequenos', 'Personagem fictícia criada para a demonstração. Lia fala sobre manhãs calmas, sono e rotinas realistas para quem tem pouco tempo.', '{routine}', '/placeholders/avatar-1.svg', '/placeholders/cover-routine-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 10),
  (public.seed_uuid('creator:rafael'), 'rafael-duarte', 'Rafael Duarte', 'Foco, planejamento e revisão semanal', 'Personagem fictício criado para a demonstração. Rafael explora produtividade sem culpa e sistemas simples de organização.', '{routine}', '/placeholders/avatar-2.svg', '/placeholders/cover-routine-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 20),
  (public.seed_uuid('creator:camila'), 'camila-sato', 'Camila Sato', 'Força e treino funcional para iniciantes', 'Personagem fictícia criada para a demonstração. Camila ensina os movimentos básicos de força com segurança e progressão.', '{training}', '/placeholders/avatar-3.svg', '/placeholders/cover-training-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 30),
  (public.seed_uuid('creator:tiago'), 'tiago-albuquerque', 'Tiago Albuquerque', 'Corrida e mobilidade do zero', 'Personagem fictício criado para a demonstração. Tiago acompanha quem está saindo do sedentarismo rumo aos primeiros 5 km.', '{training}', '/placeholders/avatar-4.svg', '/placeholders/cover-training-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 40),
  (public.seed_uuid('creator:bruna'), 'bruna-castellano', 'Bruna Castellano', 'Nutrição educativa, sem terrorismo', 'Personagem fictícia criada para a demonstração. Bruna traduz nutrição em escolhas práticas; conteúdo educativo, não prescrição.', '{nutrition}', '/placeholders/avatar-5.svg', '/placeholders/cover-nutrition-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 50),
  (public.seed_uuid('creator:davi'), 'davi-nascimento', 'Davi Nascimento', 'Hidratação, energia e planejamento', 'Personagem fictício criado para a demonstração. Davi fala de planejamento de refeições e hidratação no dia a dia.', '{nutrition}', '/placeholders/avatar-6.svg', '/placeholders/cover-nutrition-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 60),
  (public.seed_uuid('creator:helena'), 'helena-vilar', 'Helena Vilar', 'Chef de cozinha de base', 'Personagem fictícia criada para a demonstração. Helena ensina técnicas de base para cozinhar melhor e mais rápido.', '{gastronomy}', '/placeholders/avatar-7.svg', '/placeholders/cover-gastronomy-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 70),
  (public.seed_uuid('creator:marcos'), 'marcos-ferraz', 'Marcos Ferraz', 'Chef das marmitas da semana', 'Personagem fictício criado para a demonstração. Marcos organiza a semana com preparos simples e congeláveis.', '{gastronomy}', '/placeholders/avatar-8.svg', '/placeholders/cover-gastronomy-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 80)
on conflict (id) do update set name = excluded.name, headline = excluded.headline, bio = excluded.bio, pillars = excluded.pillars;

-- ---------------------------------------------------------------- conteúdos (40)
create or replace function public.seed_body(p_type public.content_type, p_title text, p_summary text, p_key text)
returns jsonb language plpgsql immutable as $$
begin
  return case p_type
    when 'video' then jsonb_build_object('kind', 'video', 'demo', true,
      'intro', p_summary,
      'transcript', jsonb_build_array(
        jsonb_build_object('t', 0, 'text', 'Olá! Neste vídeo de demonstração vamos falar sobre: ' || p_title || '.'),
        jsonb_build_object('t', 20, 'text', 'Primeiro, o contexto: ' || p_summary),
        jsonb_build_object('t', 60, 'text', 'Agora, a prática: comece pequeno, repita amanhã e ajuste o que não funcionou.'),
        jsonb_build_object('t', 110, 'text', 'Lembrete: este conteúdo é educativo e não substitui orientação profissional individual.')),
      'key_points', jsonb_build_array('Comece com o mínimo viável', 'Consistência vence intensidade', 'Ajuste à sua realidade'))
    when 'recipe' then jsonb_build_object('kind', 'recipe', 'servings', 2, 'prep_minutes', 15, 'cook_minutes', 20,
      'ingredients', jsonb_build_array(
        jsonb_build_object('item', 'Ingrediente principal', 'qty', '300 g'),
        jsonb_build_object('item', 'Legumes da estação', 'qty', '2 xícaras'),
        jsonb_build_object('item', 'Azeite', 'qty', '1 colher de sopa'),
        jsonb_build_object('item', 'Sal, pimenta e ervas', 'qty', 'a gosto')),
      'steps', jsonb_build_array('Pré-aqueça o forno ou a frigideira.', 'Tempere o ingrediente principal e deixe descansar 10 minutos.',
        'Cozinhe até dourar, virando uma vez.', 'Finalize com ervas e sirva com os legumes.'),
      'allergens', jsonb_build_array(), 'note', 'Receita demonstrativa. Quantidades ilustrativas.')
    when 'workout' then jsonb_build_object('kind', 'workout', 'equipment', jsonb_build_array('peso do corpo'),
      'blocks', jsonb_build_array(
        jsonb_build_object('name', 'Aquecimento', 'exercises', jsonb_build_array(
          jsonb_build_object('name', 'Marcha no lugar', 'sets', 1, 'reps', '2 min', 'rest_seconds', 0),
          jsonb_build_object('name', 'Círculos de braço', 'sets', 1, 'reps', '10 cada lado', 'rest_seconds', 0))),
        jsonb_build_object('name', 'Principal', 'exercises', jsonb_build_array(
          jsonb_build_object('name', 'Agachamento', 'sets', 3, 'reps', '10', 'rest_seconds', 45),
          jsonb_build_object('name', 'Flexão (joelhos no chão se precisar)', 'sets', 3, 'reps', '8', 'rest_seconds', 45),
          jsonb_build_object('name', 'Prancha', 'sets', 3, 'reps', '20 s', 'rest_seconds', 30))),
        jsonb_build_object('name', 'Volta à calma', 'exercises', jsonb_build_array(
          jsonb_build_object('name', 'Alongamento de posterior', 'sets', 1, 'reps', '30 s cada', 'rest_seconds', 0)))),
      'safety_note', 'Conteúdo educativo. Pare se sentir dor e procure um profissional habilitado.')
    else jsonb_build_object('kind', 'article',
      'sections', jsonb_build_array(
        jsonb_build_object('heading', 'Por que isso importa', 'text', p_summary),
        jsonb_build_object('heading', 'Como começar hoje', 'text', 'Escolha uma única ação pequena relacionada a "' || p_title || '" e repita por três dias. Só então aumente.'),
        jsonb_build_object('heading', 'Erros comuns', 'text', 'Tentar mudar tudo de uma vez, comparar-se com os outros e desistir no primeiro dia ruim.'),
        jsonb_build_object('heading', 'Lembrete', 'text', 'Este conteúdo é educativo e não substitui avaliação profissional individual.')))
  end;
end $$;

create temporary table seed_content (
  key text, creator text, pillar public.pillar, type public.content_type, title text, summary text,
  minutes int, difficulty text, tags text[], access text, cover int, featured int
);

insert into seed_content values
  ('r1','lia','routine','video','Ritual matinal de 10 minutos','Um começo de dia simples: água, luz, movimento leve e uma intenção. Sem app, sem pressa.',10,'beginner','{manha,habitos,sono}','free',1,1),
  ('r2','lia','routine','guide','Como montar uma rotina noturna que funciona','O segredo não é a lista perfeita: é reduzir decisões à noite e preparar a manhã seguinte.',8,'beginner','{sono,habitos}','free',2,null),
  ('r3','rafael','routine','article','Blocos de foco: organize o dia em 3 prioridades','Três coisas por dia, feitas, valem mais que doze planejadas.',6,'beginner','{foco,produtividade}','free',3,null),
  ('r4','rafael','routine','video','Respiração 4-7-8 para desacelerar','Uma técnica curta de respiração para transições do dia e para antes de dormir.',7,'beginner','{respiracao,sono}','free',1,null),
  ('r5','lia','routine','guide','Checklist semanal de autocuidado','Um checklist leve para revisar sono, movimento, comida e descanso a cada semana.',5,'beginner','{habitos,autocuidado}','base',2,null),
  ('r6','lia','routine','video','Alongamento leve antes de dormir','Sequência de 12 minutos no chão do quarto para soltar o corpo e sinalizar o fim do dia.',12,'beginner','{sono,mobilidade}','base',3,null),
  ('r7','rafael','routine','article','Por que streaks funcionam (e quando não)','Sequências ajudam a começar; o objetivo é a rotina, não o número.',5,'beginner','{habitos,motivacao}','free',1,null),
  ('r8','rafael','routine','video','Revisão semanal em 15 minutos','Olhe para trás, escolha o que manter e planeje a semana com folga.',15,'beginner','{planejamento,produtividade}','base',2,null),
  ('r9','lia','routine','guide','Higiene do sono: 8 ajustes simples','Luz, temperatura, cafeína, telas: pequenos ajustes com efeito grande.',9,'beginner','{sono}','free',3,2),
  ('r10','rafael','routine','video','Desligar as telas: experimento de 7 dias','Um experimento guiado para reduzir telas à noite sem radicalismo.',11,'beginner','{telas,habitos}','base',1,null),
  ('t1','camila','training','workout','Treino funcional iniciante — corpo inteiro','Movimentos básicos com o peso do corpo, em 25 minutos, sem equipamento.',25,'beginner','{funcional,forca,iniciante}','free',1,3),
  ('t2','tiago','training','video','Mobilidade de quadril em 8 minutos','Sequência rápida para quem passa o dia sentado e quer correr sem travar.',8,'beginner','{mobilidade,corrida}','free',2,null),
  ('t3','camila','training','workout','Força básica: agachar, empurrar, puxar','Os três padrões que sustentam qualquer rotina de força.',35,'beginner','{forca}','base',3,null),
  ('t4','tiago','training','workout','Caminhada-corrida: semana 1','Alterne caminhada e corrida leve: o primeiro passo rumo aos 5 km.',30,'beginner','{corrida,iniciante}','free',1,null),
  ('t5','camila','training','video','Técnica de agachamento: 5 erros comuns','Joelhos, calcanhares, tronco: como ajustar o agachamento com segurança.',9,'beginner','{tecnica,forca}','free',2,null),
  ('t6','camila','training','workout','Core em 12 minutos','Um bloco curto de estabilidade para fazer em qualquer lugar.',12,'beginner','{core}','base',3,null),
  ('t7','tiago','training','workout','Intervalado leve para iniciantes','Tiros curtos com recuperação generosa, pensado para quem já caminha-corre.',20,'intermediate','{corrida,hiit}','training_full',1,null),
  ('t8','tiago','training','guide','Como escolher o tênis de corrida','Conforto primeiro, marketing depois: um guia prático e sem jargão.',6,'beginner','{corrida,equipamento}','free',2,null),
  ('t9','camila','training','workout','Treino de força em casa com elástico','Progressões com elástico de resistência para evoluir sem academia.',30,'intermediate','{forca,elastico}','training_full',3,null),
  ('t10','tiago','training','video','Aquecimento de 5 minutos antes de correr','Prepare tornozelos, quadril e respiração antes de sair para correr.',5,'beginner','{corrida,aquecimento}','base',1,null),
  ('n1','bruna','nutrition','guide','Prato equilibrado: o método da mão','Uma forma visual e sem balança de montar um prato equilibrado.',7,'beginner','{basico,porcoes}','free',1,4),
  ('n2','davi','nutrition','article','Hidratação: quanto beber de verdade?','Sinais do corpo, rotina e contexto valem mais que uma regra fixa.',5,'beginner','{hidratacao}','free',2,null),
  ('n3','bruna','nutrition','guide','Rótulos: 5 coisas para olhar primeiro','Porção, lista de ingredientes e o que ignorar na embalagem.',8,'beginner','{rotulos}','free',3,null),
  ('n4','bruna','nutrition','video','Lanches práticos para a tarde','Combinações simples para a hora em que a fome aperta.',10,'beginner','{lanches,praticidade}','base',1,null),
  ('n5','davi','nutrition','guide','Planejamento de refeições em 30 minutos','Um método de 30 minutos semanais para decidir, comprar e preparar.',12,'beginner','{planejamento}','base',2,null),
  ('n6','bruna','nutrition','article','Proteína ao longo do dia: por que distribuir','Conceitos gerais sobre distribuição de proteína, sem metas individuais.',7,'intermediate','{proteina}','nutrition_full',3,null),
  ('n7','davi','nutrition','video','Café da manhã em 5 minutos: 3 ideias','Opções rápidas que cabem na correria de quem sai cedo.',6,'beginner','{cafe,praticidade}','free',1,null),
  ('n8','bruna','nutrition','guide','Fibras: fontes simples no dia a dia','Onde encontrar fibras sem complicar a lista de compras.',6,'beginner','{fibras}','base',2,null),
  ('n9','davi','nutrition','article','Pré e pós-treino: o básico sem exagero','Princípios gerais de alimentação ao redor do treino, de forma educativa.',8,'intermediate','{treino,nutricao}','nutrition_full',3,null),
  ('n10','bruna','nutrition','video','Lista de compras inteligente','Como montar uma lista que evita desperdício e decisões por impulso.',9,'beginner','{compras,planejamento}','free',1,null),
  ('g1','helena','gastronomy','recipe','Bowl de frango grelhado com legumes assados','O bowl clássico da cozinha de base: proteína, legumes e um molho de ervas.',35,'beginner','{frango,bowl}','free',1,5),
  ('g2','marcos','gastronomy','recipe','Omelete de forno para a semana','Uma assadeira, oito porções, cinco dias resolvidos.',30,'beginner','{ovos,marmita}','free',2,null),
  ('g3','helena','gastronomy','recipe','Molho de ervas em 5 minutos','O molho coringa que transforma qualquer preparo simples.',5,'beginner','{molho,basico}','free',3,null),
  ('g4','marcos','gastronomy','recipe','Arroz integral soltinho (de verdade)','Proporção, descanso e o truque do dourado inicial.',40,'beginner','{arroz,basico}','free',1,null),
  ('g5','helena','gastronomy','recipe','Salmão ao forno com batata-doce','Jantar de forno com poucos passos e muito sabor.',35,'beginner','{peixe,forno}','base',2,null),
  ('g6','marcos','gastronomy','recipe','Sopa de legumes com grão-de-bico','Panela única, congela bem e rende a semana.',45,'beginner','{sopa,leguminosas}','base',3,null),
  ('g7','helena','gastronomy','video','Afiar e cuidar das facas','Uma faca afiada é mais segura e mais rápida: aprenda a mantê-la.',8,'beginner','{tecnica,facas}','free',1,null),
  ('g8','marcos','gastronomy','recipe','Marmita de carne moída com abóbora','A marmita mais pedida: congelável, equilibrada e barata.',40,'beginner','{marmita,carne}','chef_full',2,null),
  ('g9','helena','gastronomy','recipe','Panqueca de aveia e banana','Três ingredientes, cinco minutos, café da manhã pronto.',15,'beginner','{cafe,aveia}','base',3,null),
  ('g10','helena','gastronomy','video','Mise en place: cozinhe 2x mais rápido','Organize antes de ligar o fogo e ganhe tempo em todo preparo.',10,'beginner','{tecnica,organizacao}','chef_full',1,null);

insert into public.content (id, slug, creator_id, pillar, type, source_locale, title, summary, cover_url, duration_minutes, difficulty, tags, has_captions,
  status, review_status, access_level, required_module_id, is_featured, featured_rank, disclaimer_kind, published_at)
select public.seed_uuid('content:' || key), public.slugify(title) || '-' || key, public.seed_uuid('creator:' || creator), pillar, type, 'pt-BR', title, summary,
  '/placeholders/cover-' || pillar::text || '-' || cover || '.svg', minutes, difficulty, tags, type = 'video',
  'published', 'approved',
  case when access = 'free' then 'free'::public.access_level else 'premium'::public.access_level end,
  case when access = 'free' then null else public.seed_uuid('module:' || access) end,
  featured is not null, featured,
  case pillar when 'training' then 'training' when 'nutrition' then 'nutrition' when 'gastronomy' then 'nutrition' else 'general' end,
  now() - make_interval(days => (40 - row_number() over (order by key))::int)
from seed_content
on conflict (id) do update set title = excluded.title, summary = excluded.summary, tags = excluded.tags, access_level = excluded.access_level,
  required_module_id = excluded.required_module_id, is_featured = excluded.is_featured, featured_rank = excluded.featured_rank;

insert into public.content_bodies (content_id, body, media_provider, media_ref)
select public.seed_uuid('content:' || key), public.seed_body(type, title, summary, key), 'none', null
from seed_content
on conflict (content_id) do update set body = excluded.body;

-- receitas com ingredientes específicos (sobrescreve o template)
update public.content_bodies set body = body || '{"ingredients":[{"item":"Peito de frango","qty":"300 g"},{"item":"Abobrinha","qty":"1"},{"item":"Cenoura","qty":"1"},{"item":"Batata-doce","qty":"1 média"},{"item":"Azeite","qty":"2 colheres de sopa"},{"item":"Molho de ervas (receita da plataforma)","qty":"3 colheres"}],"steps":["Corte os legumes em cubos, tempere com azeite e sal e asse a 200 °C por 25 minutos.","Tempere o frango com sal, pimenta e limão; grelhe 5 minutos de cada lado.","Fatie o frango, monte o bowl com os legumes e finalize com o molho de ervas."],"servings":2,"prep_minutes":10,"cook_minutes":25}'::jsonb where content_id = public.seed_uuid('content:g1');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Ovos","qty":"10"},{"item":"Espinafre","qty":"2 xícaras"},{"item":"Tomate-cereja","qty":"1 xícara"},{"item":"Queijo branco","qty":"100 g"},{"item":"Sal e orégano","qty":"a gosto"}],"steps":["Bata os ovos com sal e orégano.","Misture espinafre, tomate e queijo; despeje numa assadeira untada.","Asse a 180 °C por 25 minutos; corte em 8 porções e congele.","Para servir, aqueça 2 minutos no micro-ondas."],"servings":8,"allergens":["ovo","leite"]}'::jsonb where content_id = public.seed_uuid('content:g2');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Salsinha","qty":"1 maço"},{"item":"Cebolinha","qty":"1/2 maço"},{"item":"Azeite","qty":"1/2 xícara"},{"item":"Limão","qty":"1"},{"item":"Alho","qty":"1 dente"},{"item":"Sal","qty":"a gosto"}],"steps":["Pique as ervas finamente.","Misture com azeite, suco de limão, alho amassado e sal.","Guarde na geladeira por até 5 dias."],"servings":6,"prep_minutes":5,"cook_minutes":0}'::jsonb where content_id = public.seed_uuid('content:g3');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Arroz integral","qty":"1 xícara"},{"item":"Água","qty":"2 1/2 xícaras"},{"item":"Azeite","qty":"1 colher de sopa"},{"item":"Alho","qty":"1 dente"},{"item":"Sal","qty":"1 colher de chá"}],"steps":["Lave o arroz até a água sair clara.","Doure o alho no azeite e refogue o arroz por 2 minutos.","Adicione a água e o sal; cozinhe tampado em fogo baixo por 35 minutos.","Desligue, deixe descansar 10 minutos e solte com um garfo."],"servings":4,"prep_minutes":5,"cook_minutes":45}'::jsonb where content_id = public.seed_uuid('content:g4');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Filé de salmão","qty":"2 postas"},{"item":"Batata-doce","qty":"2 médias"},{"item":"Azeite","qty":"2 colheres de sopa"},{"item":"Limão","qty":"1"},{"item":"Alecrim","qty":"2 ramos"}],"steps":["Corte a batata-doce em rodelas, tempere e asse a 200 °C por 20 minutos.","Tempere o salmão com sal, limão e alecrim.","Coloque o salmão sobre as batatas e asse por mais 12 minutos."],"servings":2,"allergens":["peixe"]}'::jsonb where content_id = public.seed_uuid('content:g5');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Grão-de-bico cozido","qty":"2 xícaras"},{"item":"Cenoura, abobrinha e chuchu","qty":"1 de cada"},{"item":"Cebola","qty":"1"},{"item":"Caldo de legumes caseiro ou água","qty":"1,5 L"},{"item":"Azeite e sal","qty":"a gosto"}],"steps":["Refogue a cebola no azeite.","Adicione os legumes picados e o caldo; cozinhe 25 minutos.","Junte o grão-de-bico, ajuste o sal e cozinhe mais 10 minutos.","Porcione e congele em potes individuais."],"servings":6}'::jsonb where content_id = public.seed_uuid('content:g6');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Carne moída","qty":"500 g"},{"item":"Abóbora cabotiá","qty":"400 g"},{"item":"Cebola e alho","qty":"1 e 2 dentes"},{"item":"Arroz integral cozido","qty":"2 xícaras"},{"item":"Brócolis","qty":"1 xícara"}],"steps":["Refogue cebola e alho, junte a carne e cozinhe até dourar.","Cozinhe a abóbora em cubos no vapor por 12 minutos.","Monte as marmitas: arroz, carne, abóbora e brócolis.","Congele por até 30 dias."],"servings":5}'::jsonb where content_id = public.seed_uuid('content:g8');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Banana madura","qty":"1"},{"item":"Ovo","qty":"1"},{"item":"Aveia em flocos","qty":"3 colheres de sopa"},{"item":"Canela","qty":"a gosto"}],"steps":["Amasse a banana e misture com o ovo e a aveia.","Despeje porções pequenas em frigideira antiaderente.","Doure 2 minutos de cada lado."],"servings":1,"prep_minutes":5,"cook_minutes":8,"allergens":["ovo","glúten (aveia pode conter)"]}'::jsonb where content_id = public.seed_uuid('content:g9');

-- ---------------------------------------------------------------- programas (8)
create temporary table seed_program (key text, creator text, pillar public.pillar, title text, summary text, weeks int, cover int, featured int,
  required text[], optional text[]);
insert into seed_program values
  ('p1','lia','routine','Manhãs com Intenção','Sete dias para construir um começo de dia calmo e repetível.',1,1,1,'{r1,r4,r2,r9}','{r5}'),
  ('p2','rafael','routine','Reset de Hábitos em 21 dias','Um ciclo de três semanas para revisar, simplificar e sustentar hábitos.',3,2,null,'{r3,r7,r4}','{r8,r10}'),
  ('p3','camila','training','Base de Força — 4 semanas','Padrões fundamentais de força com progressão segura para iniciantes.',4,1,2,'{t5,t1,t3}','{t6,t9}'),
  ('p4','tiago','training','Do Sofá aos 5 km','Caminhada-corrida progressiva para completar 5 km com conforto.',6,2,null,'{t8,t2,t4}','{t10,t7}'),
  ('p5','bruna','nutrition','Fundamentos da Nutrição Real','Conceitos práticos para escolher melhor, sem dietas da moda.',2,1,3,'{n1,n3,n10}','{n8,n6}'),
  ('p6','davi','nutrition','Hidratação e Energia','Hábitos de hidratação e refeições que sustentam o dia.',1,2,null,'{n2,n7}','{n5,n9}'),
  ('p7','helena','gastronomy','Cozinha de Base: preparos essenciais','Técnicas e receitas-base para cozinhar com confiança.',2,1,4,'{g7,g3,g4,g1}','{g10,g9}'),
  ('p8','marcos','gastronomy','Marmitas da Semana','Organize a semana com preparos congeláveis e equilibrados.',1,2,null,'{g2,g4}','{g6,g8,g5}');

insert into public.programs (id, slug, creator_id, pillar, cover_url, status, is_featured, featured_rank)
select public.seed_uuid('program:' || key), public.slugify(title), public.seed_uuid('creator:' || creator), pillar,
  '/placeholders/cover-' || pillar::text || '-' || cover || '.svg', 'published', featured is not null, featured
from seed_program
on conflict (id) do update set is_featured = excluded.is_featured, featured_rank = excluded.featured_rank;

insert into public.program_versions (id, program_id, version_no, title, summary, description, estimated_weeks, status, published_at)
select public.seed_uuid('pv:' || key || ':1'), public.seed_uuid('program:' || key), 1, title, summary,
  summary || ' Participe no seu ritmo: os itens podem ser feitos em qualquer ordem. Conteúdo educativo; não substitui orientação profissional.',
  weeks, 'published', now() - interval '30 days'
from seed_program
on conflict (id) do update set title = excluded.title, summary = excluded.summary;

update public.programs p set current_version_id = public.seed_uuid('pv:' || sp.key || ':1')
from seed_program sp where p.id = public.seed_uuid('program:' || sp.key);

insert into public.program_items (id, version_id, content_id, position, section, is_required)
select public.seed_uuid('pi:' || sp.key || ':' || c.k), public.seed_uuid('pv:' || sp.key || ':1'), public.seed_uuid('content:' || c.k), c.pos,
  case when c.req then 'Essencial' else 'Para ir além' end, c.req
from seed_program sp
cross join lateral (
  select k, ord as pos, true as req from unnest(sp.required) with ordinality as r(k, ord)
  union all
  select k, 100 + ord, false from unnest(sp.optional) with ordinality as o(k, ord)
) c
on conflict (version_id, content_id) do nothing;

-- ---------------------------------------------------------------- interesses, conquistas
insert into public.interest_tags (tag, label, pillar, sort_order) values
  ('sono', '{"pt-BR":"Dormir melhor","en":"Sleep better","es":"Dormir mejor"}', 'routine', 10),
  ('habitos', '{"pt-BR":"Criar hábitos","en":"Build habits","es":"Crear hábitos"}', 'routine', 20),
  ('foco', '{"pt-BR":"Foco e planejamento","en":"Focus & planning","es":"Enfoque y planificación"}', 'routine', 30),
  ('autocuidado', '{"pt-BR":"Autocuidado","en":"Self-care","es":"Autocuidado"}', 'routine', 40),
  ('forca', '{"pt-BR":"Força","en":"Strength","es":"Fuerza"}', 'training', 50),
  ('corrida', '{"pt-BR":"Corrida","en":"Running","es":"Correr"}', 'training', 60),
  ('mobilidade', '{"pt-BR":"Mobilidade","en":"Mobility","es":"Movilidad"}', 'training', 70),
  ('iniciante', '{"pt-BR":"Começando do zero","en":"Starting from zero","es":"Empezando de cero"}', 'training', 80),
  ('planejamento', '{"pt-BR":"Planejar refeições","en":"Meal planning","es":"Planificar comidas"}', 'nutrition', 90),
  ('proteina', '{"pt-BR":"Proteína no dia a dia","en":"Everyday protein","es":"Proteína diaria"}', 'nutrition', 100),
  ('hidratacao', '{"pt-BR":"Hidratação","en":"Hydration","es":"Hidratación"}', 'nutrition', 110),
  ('praticidade', '{"pt-BR":"Praticidade","en":"Quick & practical","es":"Practicidad"}', 'nutrition', 120),
  ('marmita', '{"pt-BR":"Marmitas","en":"Meal prep","es":"Viandas"}', 'gastronomy', 130),
  ('basico', '{"pt-BR":"Cozinha de base","en":"Kitchen basics","es":"Cocina básica"}', 'gastronomy', 140),
  ('tecnica', '{"pt-BR":"Técnicas de chef","en":"Chef techniques","es":"Técnicas de chef"}', 'gastronomy', 150),
  ('cafe', '{"pt-BR":"Café da manhã","en":"Breakfast","es":"Desayuno"}', 'gastronomy', 160)
on conflict (tag) do update set label = excluded.label;

insert into public.achievements (id, code, name, description, icon, rule, sort_order) values
  (public.seed_uuid('ach:first'), 'first_step', 'Primeiro passo', 'Concluiu o primeiro conteúdo.', 'footprints', '{"kind":"completions","count":1}', 10),
  (public.seed_uuid('ach:five'), 'five_done', 'Em movimento', 'Concluiu 5 conteúdos.', 'flame', '{"kind":"completions","count":5}', 20),
  (public.seed_uuid('ach:ten'), 'ten_done', 'Constante', 'Concluiu 10 conteúdos.', 'mountain', '{"kind":"completions","count":10}', 30),
  (public.seed_uuid('ach:streak3'), 'streak_3', 'Três dias seguidos', 'Atividade válida em 3 dias consecutivos.', 'calendar-check', '{"kind":"streak","days":3}', 40),
  (public.seed_uuid('ach:streak7'), 'streak_7', 'Uma semana inteira', 'Atividade válida em 7 dias consecutivos.', 'sparkles', '{"kind":"streak","days":7}', 50),
  (public.seed_uuid('ach:streak14'), 'streak_14', 'Duas semanas', 'Atividade válida em 14 dias consecutivos.', 'trophy', '{"kind":"streak","days":14}', 60),
  (public.seed_uuid('ach:program'), 'program_done', 'Programa concluído', 'Concluiu um programa completo.', 'award', '{"kind":"program_completed","count":1}', 70)
on conflict (id) do update set name = excluded.name, description = excluded.description, rule = excluded.rule;

-- ---------------------------------------------------------------- comércio demonstrativo
insert into public.seller_organizations (id, slug, name, kind, description, logo_url, is_fictional) values
  (public.seed_uuid('seller:own'), 'ultra-hero-oficial', 'Ultra Hero Oficial', 'own', 'Operação própria demonstrativa, governada pela administração.', '/placeholders/product-1.svg', true),
  (public.seed_uuid('seller:vertice'), 'cozinha-vertice', 'Cozinha Vértice', 'partner', 'Fornecedor fictício de refeições prontas para a demonstração.', '/placeholders/product-2.svg', true),
  (public.seed_uuid('seller:horta'), 'horta-base', 'Horta Base', 'partner', 'Fornecedor fictício de kits de ingredientes para a demonstração.', '/placeholders/product-3.svg', true),
  (public.seed_uuid('seller:forja'), 'forja-fit', 'Forja Fit Equipamentos', 'partner', 'Fornecedor fictício de acessórios de treino e lifestyle para a demonstração.', '/placeholders/product-4.svg', true)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.product_categories (id, code, name, kind, is_food, sort_order) values
  (public.seed_uuid('cat:meal'), 'meal', '{"pt-BR":"Refeições prontas","en":"Ready meals","es":"Comidas listas"}', 'meal', true, 10),
  (public.seed_uuid('cat:kit'), 'ingredient_kit', '{"pt-BR":"Kits de ingredientes","en":"Ingredient kits","es":"Kits de ingredientes"}', 'ingredient_kit', true, 20),
  (public.seed_uuid('cat:accessory'), 'training_accessory', '{"pt-BR":"Acessórios de treino","en":"Training accessories","es":"Accesorios de entrenamiento"}', 'training_accessory', false, 30),
  (public.seed_uuid('cat:lifestyle'), 'lifestyle', '{"pt-BR":"Lifestyle","en":"Lifestyle","es":"Lifestyle"}', 'lifestyle', false, 40)
on conflict (id) do update set name = excluded.name;

create temporary table seed_product (key text, seller text, cat text, title text, description text, price int, ptype text, stock int, img int, food jsonb, attrs jsonb);
insert into seed_product values
  ('m1','vertice','meal','Bowl de frango com legumes (350 g)','Frango grelhado, legumes assados e molho de ervas. Congelado, pronto em 4 minutos. Produto demonstrativo.',2890,'physical',40,1,'{"ingredients":["frango","abobrinha","cenoura","batata-doce","azeite","ervas"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m2','vertice','meal','Marmita de carne moída com abóbora (380 g)','Carne moída, abóbora, arroz integral e brócolis. Produto demonstrativo.',2990,'physical',40,2,'{"ingredients":["carne bovina","abóbora","arroz integral","brócolis"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":380}'),
  ('m3','vertice','meal','Omelete de forno com espinafre (2 porções)','Ovos, espinafre, tomate e queijo branco. Produto demonstrativo.',1990,'physical',30,3,'{"ingredients":["ovos","espinafre","tomate","queijo branco"],"allergens":["ovo","leite"],"storage":"Refrigerado por 4 dias ou congelado por 30."}','{"weight_g":300}'),
  ('m4','vertice','meal','Salmão com batata-doce (350 g)','Salmão assado, batata-doce e alecrim. Produto demonstrativo.',3990,'physical',20,4,'{"ingredients":["salmão","batata-doce","azeite","alecrim"],"allergens":["peixe"],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m5','vertice','meal','Sopa de legumes com grão-de-bico (500 ml)','Sopa de panela única, congelada em porção individual. Produto demonstrativo.',1890,'physical',50,1,'{"ingredients":["grão-de-bico","cenoura","abobrinha","chuchu","cebola"],"allergens":[],"storage":"Congelado a -18 °C por até 60 dias."}','{"volume_ml":500}'),
  ('m6','own','meal','Frango desfiado com arroz integral (350 g)','Marmita da operação própria demonstrativa. Produto demonstrativo.',2690,'physical',40,2,'{"ingredients":["frango","arroz integral","cenoura","ervilha"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m7','own','meal','Strogonoff leve de frango (350 g)','Versão leve com iogurte e cogumelos. Produto demonstrativo.',2890,'physical',30,3,'{"ingredients":["frango","cogumelos","iogurte","tomate"],"allergens":["leite"],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m8','own','meal','Escondidinho de abóbora com carne (380 g)','Purê de abóbora com carne moída temperada. Produto demonstrativo.',2990,'physical',30,4,'{"ingredients":["abóbora","carne bovina","cebola","alho"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":380}'),
  ('k1','horta','kit','Kit molho de ervas (ervas secas + azeite 250 ml)','Tudo para o molho coringa da cozinha de base. Produto demonstrativo.',3490,'kit',25,1,'{"ingredients":["salsinha desidratada","cebolinha desidratada","azeite extravirgem","alho desidratado"],"allergens":[],"storage":"Local seco e fresco."}','{"items":4}'),
  ('k2','horta','kit','Kit arroz integral + lentilha (1 kg + 500 g)','Base para a semana inteira. Produto demonstrativo.',2490,'kit',40,2,'{"ingredients":["arroz integral","lentilha"],"allergens":[],"storage":"Local seco; após aberto, pote fechado."}','{"items":2}'),
  ('k3','horta','kit','Kit panqueca de aveia (aveia, canela, fermento)','Para a panqueca de três ingredientes. Produto demonstrativo.',1990,'kit',40,3,'{"ingredients":["aveia em flocos","canela","fermento"],"allergens":["glúten (contaminação cruzada)"],"storage":"Local seco e fresco."}','{"items":3}'),
  ('k4','horta','kit','Kit sopa (mix de legumes desidratados 300 g)','Mix pronto para a sopa de panela única. Produto demonstrativo.',2290,'kit',35,4,'{"ingredients":["cenoura","abobrinha","cebola","grão-de-bico desidratados"],"allergens":[],"storage":"Local seco e fresco."}','{"items":1}'),
  ('k5','own','kit','Mix de sementes para bowls (200 g)','Gergelim, girassol e abóbora. Produto demonstrativo.',1790,'kit',60,1,'{"ingredients":["gergelim","semente de girassol","semente de abóbora"],"allergens":["gergelim"],"storage":"Pote fechado, longe da luz."}','{"items":1}'),
  ('k6','own','kit','Kit temperos sem sal (4 potes)','Misturas de ervas e especiarias sem sal adicionado. Produto demonstrativo.',2990,'kit',50,2,'{"ingredients":["páprica","cominho","orégano","alho","cebola","pimenta"],"allergens":[],"storage":"Local seco e fresco."}','{"items":4}'),
  ('a1','forja','accessory','Elástico de resistência (3 níveis)','Conjunto com três resistências para progressões em casa. Produto demonstrativo.',5990,'physical',30,3,null,'{"levels":3,"material":"látex"}'),
  ('a2','forja','accessory','Tapete de treino 6 mm','Antiderrapante, 180 × 60 cm. Produto demonstrativo.',8990,'physical',20,4,null,'{"thickness_mm":6}'),
  ('a3','forja','accessory','Corda de pular ajustável','Cabo de aço revestido, ajuste rápido. Produto demonstrativo.',3990,'physical',40,1,null,'{"adjustable":true}'),
  ('a4','forja','accessory','Rolo de liberação miofascial','Densidade média, 33 cm. Produto demonstrativo.',7990,'physical',15,2,null,'{"length_cm":33}'),
  ('a5','forja','accessory','Garrafa 1 L com marcador de horário','Lembrete visual de hidratação ao longo do dia. Produto demonstrativo.',4990,'physical',50,3,null,'{"volume_ml":1000}'),
  ('a6','own','accessory','Par de halteres 3 kg','Revestidos em vinil. Produto demonstrativo.',9990,'physical',10,4,null,'{"weight_kg":3}'),
  ('l1','own','lifestyle','Caderno de rotina Ultra Hero','Planejador semanal com revisão de hábitos. Produto demonstrativo.',4990,'physical',40,1,null,'{"pages":120}'),
  ('l2','own','lifestyle','Camiseta Ultra Hero (algodão)','Corte unissex, tamanhos P a GG. Produto demonstrativo.',7990,'physical',40,2,null,'{"sizes":["P","M","G","GG"]}'),
  ('l3','forja','lifestyle','Máscara de dormir','Tecido macio, elástico ajustável. Produto demonstrativo.',2990,'physical',60,3,null,'{"color":"preto"}'),
  ('l4','forja','lifestyle','Boné para corrida','Leve, com proteção UV. Produto demonstrativo.',5990,'physical',30,4,null,'{"uv":true}');

insert into public.products (id, seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, demo_stock, published_at)
select public.seed_uuid('product:' || key), public.seed_uuid('seller:' || seller), public.seed_uuid('cat:' || cat), public.slugify(title) || '-' || key, title, description,
  '/placeholders/product-' || img || '.svg', price, ptype, attrs, food, 'published', 'available', stock, now() - interval '20 days'
from seed_product
on conflict (id) do update set title = excluded.title, description = excluded.description, price_cents_demo = excluded.price_cents_demo, attributes = excluded.attributes, food_info = excluded.food_info;

-- um produto indisponível para demonstrar o bloqueio no checkout
update public.products set availability = 'unavailable' where id = public.seed_uuid('product:a6');

-- vínculos conteúdo–produto (estados variados para demonstração)
insert into public.content_product_links (id, content_id, product_id, status, note, validated_at, product_version_at_validation)
select public.seed_uuid('link:' || c || ':' || p), public.seed_uuid('content:' || c), public.seed_uuid('product:' || p), s::public.link_status, n,
  case when s = 'validated' then now() - interval '10 days' end, case when s = 'validated' then 1 end
from (values
  ('g1','m1','validated','Bowl da receita, versão pronta'), ('g8','m2','validated','Marmita da receita'), ('g2','m3','validated','Omelete pronto'),
  ('g5','m4','validated','Salmão pronto'), ('g6','m5','validated','Sopa pronta'), ('g6','k4','validated','Kit para fazer em casa'),
  ('g3','k1','validated','Kit do molho'), ('g4','k2','validated','Arroz e lentilha'), ('g9','k3','validated','Kit da panqueca'),
  ('t9','a1','validated','Elástico usado no treino'), ('t1','a2','validated','Tapete para o treino'), ('t4','a3','suggested','Sugestão da personalidade'),
  ('n2','a5','validated','Garrafa com marcador'), ('r2','l3','validated','Máscara para a rotina noturna'), ('r8','l1','suggested','Caderno para a revisão semanal'),
  ('t3','a6','suspended','Produto indisponível; vínculo suspenso para demonstração')
) v(c, p, s, n)
on conflict (content_id, product_id) do update set status = excluded.status, note = excluded.note;

insert into public.demo_destinations (id, code, name, zone, description, sort_order) values
  (public.seed_uuid('dest:centro'), 'centro', '{"pt-BR":"Centro — Zona Demo","en":"Downtown — Demo Zone","es":"Centro — Zona Demo"}', 'local', '{"pt-BR":"Destino fictício local","en":"Fictional local destination","es":"Destino ficticio local"}', 10),
  (public.seed_uuid('dest:norte'), 'norte', '{"pt-BR":"Bairro Norte — Zona Demo","en":"North District — Demo Zone","es":"Barrio Norte — Zona Demo"}', 'local', '{"pt-BR":"Destino fictício local","en":"Fictional local destination","es":"Destino ficticio local"}', 20),
  (public.seed_uuid('dest:litoral'), 'litoral', '{"pt-BR":"Litoral — Zona Regional","en":"Coast — Regional Zone","es":"Litoral — Zona Regional"}', 'regional', '{"pt-BR":"Destino fictício regional","en":"Fictional regional destination","es":"Destino ficticio regional"}', 30),
  (public.seed_uuid('dest:interior'), 'interior', '{"pt-BR":"Interior — Zona Regional","en":"Countryside — Regional Zone","es":"Interior — Zona Regional"}', 'regional', '{"pt-BR":"Destino fictício regional","en":"Fictional regional destination","es":"Destino ficticio regional"}', 40),
  (public.seed_uuid('dest:nacional'), 'nacional', '{"pt-BR":"Outra região — Nacional","en":"Other region — National","es":"Otra región — Nacional"}', 'national', '{"pt-BR":"Destino fictício nacional","en":"Fictional national destination","es":"Destino ficticio nacional"}', 50)
on conflict (id) do update set name = excluded.name;

insert into public.demo_shipping_rules (zone, base_cents, per_seller_cents, eta_days_min, eta_days_max, free_over_cents) values
  ('local', 990, 490, 1, 2, 15000), ('regional', 1990, 690, 2, 4, 25000), ('national', 2990, 990, 4, 7, null)
on conflict (zone) do update set base_cents = excluded.base_cents, per_seller_cents = excluded.per_seller_cents;

drop function public.seed_body(public.content_type, text, text, text);
drop table if exists seed_content, seed_program, seed_product;
