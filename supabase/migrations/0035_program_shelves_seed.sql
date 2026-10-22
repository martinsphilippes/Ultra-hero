-- =============================================================================
-- Ultra Hero · 0035 · Prateleiras de programas: +2 programas publicados por herói
-- Dados de DEMONSTRAÇÃO (personagens fictícios). A biblioteca "Programas" do herói virou uma pilha
-- de prateleiras (estilo playlists); com 1 programa por herói ela ficava vazia demais para mostrar.
-- Cada herói ganha 2 programas novos (o original fica intacto), com 6 a 8 etapas feitas de conteúdos
-- JÁ publicados do próprio herói e, quando faltam, do outro herói do mesmo pilar.
-- Idempotente: ids fixos (seed_uuid), "on conflict do nothing" e nada é atualizado se já existir.
-- Sem destaque (is_featured = false): Início e Explorar continuam com os mesmos destaques.
-- =============================================================================

drop table if exists seed_shelf;
create temporary table seed_shelf (
  key text, creator text, base text, pillar public.pillar, slug text, cover text, weeks int, age_days int,
  required text[], optional text[],
  title_pt text, summary_pt text, desc_pt text,
  title_en text, summary_en text, desc_en text,
  title_es text, summary_es text, desc_es text
);

insert into seed_shelf values
  ('shelf-lia-2', 'lia', 'p1', 'routine', 'noites-que-descansam', 'higiene-do-sono-8-ajustes-simples-r9', 2, 1,
   '{r9,r2,r6,r4}', '{r10,r5,r1,r7}',
   'Noites que Descansam', 'Oito passos para desacelerar à noite e acordar mais inteiro, um ajuste de cada vez.',
   'Um programa de sono sem regras rígidas: luz, telas, respiração e um ritual curto antes de deitar. Faça as etapas na ordem que preferir e repita as que funcionarem para você. Conteúdo educativo; não substitui orientação profissional.',
   'Nights That Restore', 'Eight steps to slow down at night and wake up more refreshed, one tweak at a time.',
   'A sleep program without rigid rules: light, screens, breathing and a short bedtime ritual. Take the steps in any order and repeat the ones that work for you. Educational content; not a substitute for professional advice.',
   'Noches que Descansan', 'Ocho pasos para bajar el ritmo por la noche y despertar con más energía, un ajuste a la vez.',
   'Un programa de sueño sin reglas rígidas: luz, pantallas, respiración y un ritual corto antes de acostarse. Haz los pasos en el orden que prefieras y repite los que te funcionen. Contenido educativo; no sustituye la orientación profesional.'),
  ('shelf-lia-3', 'lia', 'p1', 'routine', 'autocuidado-em-pequenas-doses', 'checklist-semanal-de-autocuidado-r5', 2, 2,
   '{r5,r1,r7,r3}', '{r6,r8}',
   'Autocuidado em Pequenas Doses', 'Seis gestos curtos para cuidar de você nos dias corridos.',
   'Autocuidado sem lista impossível: um checklist leve, um ritual de manhã e o jeito certo de usar sequências a seu favor. Cada etapa cabe em poucos minutos. Conteúdo educativo; não substitui orientação profissional.',
   'Self-Care in Small Doses', 'Six short habits to look after yourself on busy days.',
   'Self-care without an impossible list: a light checklist, a morning ritual and how to make streaks work for you. Each step fits in a few minutes. Educational content; not a substitute for professional advice.',
   'Autocuidado en Pequeñas Dosis', 'Seis gestos cortos para cuidarte en los días ajetreados.',
   'Autocuidado sin listas imposibles: un checklist ligero, un ritual matutino y cómo usar las rachas a tu favor. Cada paso cabe en pocos minutos. Contenido educativo; no sustituye la orientación profesional.'),
  ('shelf-rafael-2', 'rafael', 'p2', 'routine', 'semana-sob-controle', 'revisao-semanal-em-15-minutos-r8', 3, 1,
   '{r8,r3,r7,r5}', '{r10,r1}',
   'Semana Sob Controle', 'Revisão semanal, três prioridades por dia e folga no calendário.',
   'Um sistema simples de planejamento: 15 minutos de revisão no domingo, blocos de foco durante a semana e um checklist para não esquecer de você. Conteúdo educativo; não substitui orientação profissional.',
   'A Week Under Control', 'Weekly review, three priorities a day and breathing room in your calendar.',
   'A simple planning system: a 15-minute review on Sunday, focus blocks during the week and a checklist so you don''t forget yourself. Educational content; not a substitute for professional advice.',
   'Semana Bajo Control', 'Revisión semanal, tres prioridades por día y margen en el calendario.',
   'Un sistema sencillo de planificación: 15 minutos de revisión el domingo, bloques de enfoque durante la semana y un checklist para no olvidarte de ti. Contenido educativo; no sustituye la orientación profesional.'),
  ('shelf-rafael-3', 'rafael', 'p2', 'routine', 'foco-sem-telas', 'desligar-as-telas-experimento-de-7-dias-r10', 2, 2,
   '{r10,r4,r3,r9}', '{r2,r7,r8}',
   'Foco Sem Telas', 'Sete passos para recuperar a atenção e desligar as telas na hora certa.',
   'Um experimento guiado de atenção: menos telas à noite, respiração nas transições e blocos de foco de dia. Sem radicalismo e sem culpa. Conteúdo educativo; não substitui orientação profissional.',
   'Focus Without Screens', 'Seven steps to win back your attention and switch off screens at the right time.',
   'A guided attention experiment: fewer screens at night, breathing between tasks and focus blocks during the day. No extremes and no guilt. Educational content; not a substitute for professional advice.',
   'Enfoque Sin Pantallas', 'Siete pasos para recuperar la atención y apagar las pantallas a tiempo.',
   'Un experimento guiado de atención: menos pantallas por la noche, respiración en las transiciones y bloques de enfoque durante el día. Sin radicalismos y sin culpa. Contenido educativo; no sustituye la orientación profesional.'),
  ('shelf-camila-2', 'camila', 'p3', 'training', 'forca-em-casa-com-elastico', 'treino-de-forca-em-casa-com-elastico-t9', 4, 1,
   '{t5,t1,t9,t6}', '{t3,t2}',
   'Força em Casa com Elástico', 'Progrida na força sem academia: técnica primeiro, elástico depois.',
   'Quatro semanas para evoluir em casa: ajuste a técnica do agachamento, domine o corpo inteiro com o peso do corpo e só então acrescente o elástico de resistência. Conteúdo educativo; pare se sentir dor e procure um profissional habilitado.',
   'Home Strength with Bands', 'Get stronger without a gym: technique first, resistance band next.',
   'Four weeks to progress at home: fix your squat technique, master full-body bodyweight moves and only then add the resistance band. Educational content; stop if you feel pain and see a qualified professional.',
   'Fuerza en Casa con Banda Elástica', 'Gana fuerza sin gimnasio: primero la técnica, después la banda.',
   'Cuatro semanas para progresar en casa: ajusta la técnica de la sentadilla, domina el cuerpo entero con tu propio peso y solo entonces añade la banda de resistencia. Contenido educativo; detente si sientes dolor y busca a un profesional habilitado.'),
  ('shelf-camila-3', 'camila', 'p3', 'training', 'core-e-postura-em-3-semanas', 'core-em-12-minutos-t6', 3, 2,
   '{t6,t5,t2,t1}', '{t10,t3,t9}',
   'Core e Postura em 3 Semanas', 'Estabilidade, mobilidade e postura para treinar e viver melhor.',
   'Blocos curtos de core, mobilidade de quadril e técnica para sustentar a postura no dia a dia e no treino de força. Conteúdo educativo; pare se sentir dor e procure um profissional habilitado.',
   'Core and Posture in 3 Weeks', 'Stability, mobility and posture to train and live better.',
   'Short core blocks, hip mobility and technique to support your posture in daily life and in strength training. Educational content; stop if you feel pain and see a qualified professional.',
   'Core y Postura en 3 Semanas', 'Estabilidad, movilidad y postura para entrenar y vivir mejor.',
   'Bloques cortos de core, movilidad de cadera y técnica para sostener la postura en el día a día y en el entrenamiento de fuerza. Contenido educativo; detente si sientes dolor y busca a un profesional habilitado.'),
  ('shelf-tiago-2', 'tiago', 'p4', 'training', 'mobilidade-para-correr-melhor', 'mobilidade-de-quadril-em-8-minutos-t2', 2, 1,
   '{t10,t2,t5,t6}', '{t8,t4}',
   'Mobilidade para Correr Melhor', 'Aqueça, solte o quadril e corra sem travar.',
   'Seis etapas para preparar o corpo antes e depois da corrida: aquecimento, mobilidade de quadril, core e um bom tênis. Conteúdo educativo; pare se sentir dor e procure um profissional habilitado.',
   'Mobility to Run Better', 'Warm up, free your hips and run without stiffness.',
   'Six steps to prepare your body before and after running: warm-up, hip mobility, core and the right shoes. Educational content; stop if you feel pain and see a qualified professional.',
   'Movilidad para Correr Mejor', 'Calienta, suelta la cadera y corre sin rigidez.',
   'Seis pasos para preparar el cuerpo antes y después de correr: calentamiento, movilidad de cadera, core y unas buenas zapatillas. Contenido educativo; detente si sientes dolor y busca a un profesional habilitado.'),
  ('shelf-tiago-3', 'tiago', 'p4', 'training', 'primeiro-intervalado', 'intervalado-leve-para-iniciantes-t7', 4, 2,
   '{t10,t4,t7,t2}', '{t8,t1,t6}',
   'Primeiro Intervalado', 'Da caminhada-corrida aos primeiros tiros curtos, com recuperação generosa.',
   'Para quem já caminha-corre: aqueça bem, consolide a base e experimente o intervalado leve, sempre com recuperação generosa. Conteúdo educativo; pare se sentir dor e procure um profissional habilitado.',
   'Your First Intervals', 'From walk-run to your first short intervals, with generous recovery.',
   'For those who already walk-run: warm up well, build your base and try light intervals, always with generous recovery. Educational content; stop if you feel pain and see a qualified professional.',
   'Tu Primer Interválico', 'De caminar y trotar a tus primeras series cortas, con recuperación generosa.',
   'Para quien ya alterna caminar y trotar: calienta bien, consolida la base y prueba el interválico suave, siempre con recuperación generosa. Contenido educativo; detente si sientes dolor y busca a un profesional habilitado.'),
  ('shelf-bruna-2', 'bruna', 'p5', 'nutrition', 'supermercado-sem-misterio', 'lista-de-compras-inteligente-n10', 2, 1,
   '{n10,n3,n1,n8}', '{n5,n4}',
   'Supermercado Sem Mistério', 'Lista, rótulos e prato: escolhas melhores do carrinho à mesa.',
   'Monte uma lista que evita desperdício, leia o rótulo pelo que importa e transforme as compras em pratos equilibrados. Conteúdo educativo; não substitui orientação de nutricionista.',
   'Grocery Shopping Made Simple', 'Lists, labels and plates: better choices from cart to table.',
   'Build a list that avoids waste, read labels for what matters and turn your groceries into balanced plates. Educational content; not a substitute for advice from a dietitian.',
   'Supermercado Sin Misterio', 'Lista, etiquetas y plato: mejores elecciones del carrito a la mesa.',
   'Arma una lista que evita el desperdicio, lee la etiqueta por lo que importa y convierte la compra en platos equilibrados. Contenido educativo; no sustituye la orientación de un nutricionista.'),
  ('shelf-bruna-3', 'bruna', 'p5', 'nutrition', 'lanches-e-proteina-no-dia-a-dia', 'lanches-praticos-para-a-tarde-n4', 2, 2,
   '{n4,n6,n1,n7}', '{n9,n8,n2}',
   'Lanches e Proteína no Dia a Dia', 'Combinações práticas para a fome da tarde e proteína bem distribuída.',
   'Ideias de lanche, conceitos gerais sobre distribuir proteína ao longo do dia e cafés da manhã rápidos, sem metas individuais. Conteúdo educativo; não substitui orientação de nutricionista.',
   'Snacks and Protein Every Day', 'Practical combos for afternoon hunger and well-spread protein.',
   'Snack ideas, general concepts on spreading protein through the day and quick breakfasts, with no individual targets. Educational content; not a substitute for advice from a dietitian.',
   'Meriendas y Proteína en el Día a Día', 'Combinaciones prácticas para el hambre de la tarde y proteína bien repartida.',
   'Ideas de meriendas, conceptos generales sobre repartir la proteína a lo largo del día y desayunos rápidos, sin metas individuales. Contenido educativo; no sustituye la orientación de un nutricionista.'),
  ('shelf-davi-2', 'davi', 'p6', 'nutrition', 'planejamento-de-refeicoes-em-4-semanas', 'planejamento-de-refeicoes-em-30-minutos-n5', 4, 1,
   '{n5,n10,n7,n2}', '{n1,n3}',
   'Planejamento de Refeições em 4 Semanas', 'Trinta minutos por semana para decidir, comprar e preparar.',
   'Um método de planejamento que cabe na rotina: decida o cardápio, compre com lista, resolva o café da manhã, não esqueça a água e monte pratos equilibrados sem balança. Conteúdo educativo; não substitui orientação de nutricionista.',
   'Meal Planning in 4 Weeks', 'Thirty minutes a week to decide, shop and prep.',
   'A planning method that fits your routine: decide the menu, shop with a list, sort out breakfast, remember to drink water and build balanced plates without a scale. Educational content; not a substitute for advice from a dietitian.',
   'Planificación de Comidas en 4 Semanas', 'Treinta minutos por semana para decidir, comprar y preparar.',
   'Un método de planificación que cabe en tu rutina: decide el menú, compra con lista, resuelve el desayuno, no olvides el agua y arma platos equilibrados sin báscula. Contenido educativo; no sustituye la orientación de un nutricionista.'),
  ('shelf-davi-3', 'davi', 'p6', 'nutrition', 'energia-para-treinar', 'pre-e-pos-treino-o-basico-sem-exagero-n9', 2, 2,
   '{n2,n9,n7,n6}', '{n4,n1,n8}',
   'Energia para Treinar', 'Hidratação, café da manhã e o básico do pré e pós-treino.',
   'Princípios gerais para ter energia nos treinos: beber água de acordo com o corpo, comer bem antes e depois e distribuir proteína no dia. Conteúdo educativo; não substitui orientação de nutricionista.',
   'Energy to Train', 'Hydration, breakfast and the basics of pre- and post-workout eating.',
   'General principles for energy in your workouts: drink water according to your body, eat well before and after training and spread protein through the day. Educational content; not a substitute for advice from a dietitian.',
   'Energía para Entrenar', 'Hidratación, desayuno y lo básico del antes y después del entrenamiento.',
   'Principios generales para tener energía en tus entrenamientos: beber agua según tu cuerpo, comer bien antes y después y repartir la proteína en el día. Contenido educativo; no sustituye la orientación de un nutricionista.'),
  ('shelf-helena-2', 'helena', 'p7', 'gastronomy', 'tecnicas-de-faca-e-mise-en-place', 'afiar-e-cuidar-das-facas-g7', 2, 1,
   '{g7,g10,g3,g1}', '{g5,g4}',
   'Técnicas de Faca e Mise en Place', 'Facas afiadas, bancada organizada e preparos-base que salvam o jantar.',
   'A base de toda cozinha rápida: cuidar das facas, organizar tudo antes de ligar o fogo e dominar um molho coringa e um bowl completo. Receitas demonstrativas; confira os alergênicos.',
   'Knife Skills and Mise en Place', 'Sharp knives, an organized counter and base recipes that save dinner.',
   'The foundation of fast cooking: care for your knives, organize everything before turning on the heat and master an all-purpose sauce and a complete bowl. Demo recipes; check the allergens.',
   'Técnicas de Cuchillo y Mise en Place', 'Cuchillos afilados, mesada ordenada y preparaciones base que salvan la cena.',
   'La base de toda cocina rápida: cuidar los cuchillos, organizar todo antes de encender el fuego y dominar una salsa comodín y un bowl completo. Recetas demostrativas; revisa los alérgenos.'),
  ('shelf-helena-3', 'helena', 'p7', 'gastronomy', 'cozinha-rapida-do-dia-a-dia', 'salmao-ao-forno-com-batata-doce-g5', 2, 2,
   '{g9,g3,g1,g5,g7}', '{g2,g10}',
   'Cozinha Rápida do Dia a Dia', 'Do café da manhã ao jantar de forno, com poucos passos e muito sabor.',
   'Sete preparos práticos para a semana: panqueca de três ingredientes, molho de ervas, bowl grelhado e salmão ao forno. Receitas demonstrativas; confira os alergênicos.',
   'Quick Everyday Cooking', 'From breakfast to oven dinners, with few steps and lots of flavor.',
   'Seven practical recipes for the week: a three-ingredient pancake, herb sauce, a grilled bowl and oven-baked salmon. Demo recipes; check the allergens.',
   'Cocina Rápida del Día a Día', 'Del desayuno a la cena al horno, con pocos pasos y mucho sabor.',
   'Siete preparaciones prácticas para la semana: panqueque de tres ingredientes, salsa de hierbas, bowl a la plancha y salmón al horno. Recetas demostrativas; revisa los alérgenos.'),
  ('shelf-marcos-2', 'marcos', 'p8', 'gastronomy', 'marmitas-congelaveis', 'marmita-de-carne-moida-com-abobora-g8', 2, 1,
   '{g8,g6,g2,g4}', '{g1,g3}',
   'Marmitas Congeláveis', 'Preparos que congelam bem e resolvem o almoço da semana inteira.',
   'Seis receitas pensadas para o congelador: porcione, etiquete e aqueça sem perder sabor. Receitas demonstrativas; confira os alergênicos e siga as boas práticas de conservação.',
   'Freezer-Friendly Meal Prep', 'Recipes that freeze well and cover lunch for the whole week.',
   'Six recipes designed for the freezer: portion, label and reheat without losing flavor. Demo recipes; check the allergens and follow food-storage best practices.',
   'Viandas para Congelar', 'Preparaciones que se congelan bien y resuelven el almuerzo de toda la semana.',
   'Seis recetas pensadas para el congelador: porciona, etiqueta y recalienta sin perder sabor. Recetas demostrativas; revisa los alérgenos y sigue las buenas prácticas de conservación.'),
  ('shelf-marcos-3', 'marcos', 'p8', 'gastronomy', 'domingo-de-preparo', 'sopa-de-legumes-com-grao-de-bico-g6', 1, 2,
   '{g4,g2,g6,g10}', '{g8,g7,g3}',
   'Domingo de Preparo', 'Uma tarde de cozinha organizada para a semana inteira.',
   'Arroz, omelete de forno e sopa na mesma tarde, com mise en place para ganhar tempo e facas em dia. Receitas demonstrativas; confira os alergênicos.',
   'Sunday Prep Day', 'One organized afternoon in the kitchen for the whole week.',
   'Rice, oven omelet and soup in the same afternoon, with mise en place to save time and well-kept knives. Demo recipes; check the allergens.',
   'Domingo de Preparación', 'Una tarde de cocina organizada para toda la semana.',
   'Arroz, omelet al horno y sopa en la misma tarde, con mise en place para ganar tiempo y cuchillos a punto. Recetas demostrativas; revisa los alérgenos.');

-- Programa: só entra se o herói existir. created_at fica 1–2 dias ANTES do programa original do herói,
-- para a ordem "destaque, depois mais recentes" manter o original na frente da biblioteca.
-- Sem alvo no conflito: um slug já usado no remoto (criado pelo admin) não aborta a migração.
insert into public.programs (id, slug, creator_id, pillar, cover_url, status, is_featured, featured_rank, created_at)
select public.seed_uuid('program:' || s.key), s.slug, cp.id, s.pillar, '/content/' || s.cover || '.webp', 'published', false, null,
  coalesce((select p.created_at from public.programs p where p.id = public.seed_uuid('program:' || s.base)), now()) - make_interval(days => s.age_days)
from seed_shelf s
join public.creator_profiles cp on cp.id = public.seed_uuid('creator:' || s.creator)
on conflict do nothing;

-- Versão 1 publicada (só para os programas desta migração que de fato existem).
insert into public.program_versions (id, program_id, version_no, title, summary, description, source_locale, estimated_weeks, status, published_at)
select public.seed_uuid('pv:' || s.key || ':1'), p.id, 1, s.title_pt, s.summary_pt, s.desc_pt, 'pt-BR', s.weeks, 'published', now() - interval '20 days'
from seed_shelf s
join public.programs p on p.id = public.seed_uuid('program:' || s.key)
on conflict do nothing;

-- Etapas: obrigatórias em 1..n ("Essencial") e opcionais em 101.. ("Para ir além"), como no seed 0008.
-- Só conteúdos publicados entram (um conteúdo arquivado no remoto fica de fora em vez de virar etapa quebrada).
insert into public.program_items (id, version_id, content_id, position, section, is_required)
select public.seed_uuid('pi:' || s.key || ':' || c.k), v.id, ct.id, c.pos,
  case when c.req then 'Essencial' else 'Para ir além' end, c.req
from seed_shelf s
join public.program_versions v on v.id = public.seed_uuid('pv:' || s.key || ':1')
cross join lateral (
  select k, ord::int as pos, true as req from unnest(s.required) with ordinality as r(k, ord)
  union all
  select k, 100 + ord::int, false from unnest(s.optional) with ordinality as o(k, ord)
) c
join public.content ct on ct.id = public.seed_uuid('content:' || c.k) and ct.status = 'published'
on conflict do nothing;

-- Títulos, resumos e descrições em inglês e espanhol (o português fica na própria versão).
insert into public.program_localizations (version_id, locale, title, summary, description, status)
select v.id, l.locale, l.title, l.summary, l.description, 'published'
from seed_shelf s
join public.program_versions v on v.id = public.seed_uuid('pv:' || s.key || ':1')
cross join lateral (values
  ('en'::public.locale_code, s.title_en, s.summary_en, s.desc_en),
  ('es'::public.locale_code, s.title_es, s.summary_es, s.desc_es)
) as l(locale, title, summary, description)
on conflict do nothing;

-- Aponta a versão atual só onde ainda não há uma (reexecutar não mexe em versões novas do admin).
update public.programs p set current_version_id = public.seed_uuid('pv:' || s.key || ':1')
from seed_shelf s
where p.id = public.seed_uuid('program:' || s.key)
  and p.current_version_id is null
  and exists (select 1 from public.program_versions v where v.id = public.seed_uuid('pv:' || s.key || ':1'));

drop table if exists seed_shelf;
