-- =============================================================================
-- Ultra Hero · 0029 · Backfill das receitas antigas para o modelo estruturado (0027)
--   Princípio: os dados publicados não mudam; só a forma muda. Não há parser em SQL: as quantidades,
--   durações e temperaturas das 8 receitas do seed entram como DADOS LITERAIS, gerados pelo parser em
--   TypeScript (src/lib/recipes/quantity.ts) a partir do seed (0008) e conferidos no Vitest
--   (tests/unit/recipes-backfill.test.ts). O literal só vale se o texto atual for igual ao do seed.
--   O corpo v1 (content_bodies.body) e content.duration_minutes NÃO são tocados: o corpo antigo vai
--   antes para a versão restore_point e a página continua lendo o v1 até a fase 2.
--   Tempos copiados sem correção (P5): g2 (15 + 20 > 30) e g4 (5 + 45 > 40) ficam como estão e
--   republicá-las exige corrigir ('recipe_incomplete: times').
-- Aplicação no remoto: 1) criar as funções (tudo antes do bloco final); 2) conferir
--   select * from public.recipe_backfill_dry_run(); 3) só então rodar o bloco final.
-- Reaplicável: receita que já tem recipe_details é pulada.
-- =============================================================================

-- ---------------------------------------------------------------- literais (gerados do seed; não editar à mão)
-- (receita, posição, item, texto original, quantidade, unidade, texto, a gosto, observação)
create or replace function public.recipe_legacy_ingredient_literals()
returns table (seed_key text, pos int, item text, qty text, quantity numeric, unit text, quantity_text text, to_taste boolean, note text)
language sql immutable set search_path = public as $$
  select * from (values
    -- literal:ingredients:start
    ('g1', 1, 'Peito de frango', '300 g', 300, 'g', null, false, null),
    ('g1', 2, 'Abobrinha', '1', 1, null, null, false, null),
    ('g1', 3, 'Cenoura', '1', 1, null, null, false, null),
    ('g1', 4, 'Batata-doce', '1 média', 1, null, null, false, 'média'),
    ('g1', 5, 'Azeite', '2 colheres de sopa', 2, 'tbsp', null, false, null),
    ('g1', 6, 'Molho de ervas (receita da plataforma)', '3 colheres', null, null, '3 colheres', false, null),
    ('g2', 1, 'Ovos', '10', 10, null, null, false, null),
    ('g2', 2, 'Espinafre', '2 xícaras', 2, 'cup', null, false, null),
    ('g2', 3, 'Tomate-cereja', '1 xícara', 1, 'cup', null, false, null),
    ('g2', 4, 'Queijo branco', '100 g', 100, 'g', null, false, null),
    ('g2', 5, 'Sal e orégano', 'a gosto', null, null, null, true, null),
    ('g3', 1, 'Salsinha', '1 maço', 1, 'bunch', null, false, null),
    ('g3', 2, 'Cebolinha', '1/2 maço', 0.5, 'bunch', null, false, null),
    ('g3', 3, 'Azeite', '1/2 xícara', 0.5, 'cup', null, false, null),
    ('g3', 4, 'Limão', '1', 1, null, null, false, null),
    ('g3', 5, 'Alho', '1 dente', 1, 'clove', null, false, null),
    ('g3', 6, 'Sal', 'a gosto', null, null, null, true, null),
    ('g4', 1, 'Arroz integral', '1 xícara', 1, 'cup', null, false, null),
    ('g4', 2, 'Água', '2 1/2 xícaras', 2.5, 'cup', null, false, null),
    ('g4', 3, 'Azeite', '1 colher de sopa', 1, 'tbsp', null, false, null),
    ('g4', 4, 'Alho', '1 dente', 1, 'clove', null, false, null),
    ('g4', 5, 'Sal', '1 colher de chá', 1, 'tsp', null, false, null),
    ('g5', 1, 'Filé de salmão', '2 postas', 2, 'fillet', null, false, null),
    ('g5', 2, 'Batata-doce', '2 médias', 2, null, null, false, 'médias'),
    ('g5', 3, 'Azeite', '2 colheres de sopa', 2, 'tbsp', null, false, null),
    ('g5', 4, 'Limão', '1', 1, null, null, false, null),
    ('g5', 5, 'Alecrim', '2 ramos', 2, 'sprig', null, false, null),
    ('g6', 1, 'Grão-de-bico cozido', '2 xícaras', 2, 'cup', null, false, null),
    ('g6', 2, 'Cenoura, abobrinha e chuchu', '1 de cada', null, null, '1 de cada', false, null),
    ('g6', 3, 'Cebola', '1', 1, null, null, false, null),
    ('g6', 4, 'Caldo de legumes caseiro ou água', '1,5 L', 1.5, 'l', null, false, null),
    ('g6', 5, 'Azeite e sal', 'a gosto', null, null, null, true, null),
    ('g8', 1, 'Carne moída', '500 g', 500, 'g', null, false, null),
    ('g8', 2, 'Abóbora cabotiá', '400 g', 400, 'g', null, false, null),
    ('g8', 3, 'Cebola e alho', '1 e 2 dentes', null, null, '1 e 2 dentes', false, null),
    ('g8', 4, 'Arroz integral cozido', '2 xícaras', 2, 'cup', null, false, null),
    ('g8', 5, 'Brócolis', '1 xícara', 1, 'cup', null, false, null),
    ('g9', 1, 'Banana madura', '1', 1, null, null, false, null),
    ('g9', 2, 'Ovo', '1', 1, null, null, false, null),
    ('g9', 3, 'Aveia em flocos', '3 colheres de sopa', 3, 'tbsp', null, false, null),
    ('g9', 4, 'Canela', 'a gosto', null, null, null, true, null)
    -- literal:ingredients:end
  ) as t(seed_key, pos, item, qty, quantity, unit, quantity_text, to_taste, note)
$$;

-- Duração e temperatura só onde o texto tem uma única ocorrência inequívoca ("X minutos de cada
-- lado" e "por até N dias" não contam). (receita, posição, instrução, segundos, °C)
create or replace function public.recipe_legacy_step_literals()
returns table (seed_key text, pos int, instruction text, duration_seconds int, temperature_c int)
language sql immutable set search_path = public as $$
  select * from (values
    -- literal:steps:start
    ('g1', 1, 'Corte os legumes em cubos, tempere com azeite e sal e asse a 200 °C por 25 minutos.', 1500, 200),
    ('g1', 2, 'Tempere o frango com sal, pimenta e limão; grelhe 5 minutos de cada lado.', null, null),
    ('g1', 3, 'Fatie o frango, monte o bowl com os legumes e finalize com o molho de ervas.', null, null),
    ('g2', 1, 'Bata os ovos com sal e orégano.', null, null),
    ('g2', 2, 'Misture espinafre, tomate e queijo; despeje numa assadeira untada.', null, null),
    ('g2', 3, 'Asse a 180 °C por 25 minutos; corte em 8 porções e congele.', 1500, 180),
    ('g2', 4, 'Para servir, aqueça 2 minutos no micro-ondas.', 120, null),
    ('g3', 1, 'Pique as ervas finamente.', null, null),
    ('g3', 2, 'Misture com azeite, suco de limão, alho amassado e sal.', null, null),
    ('g3', 3, 'Guarde na geladeira por até 5 dias.', null, null),
    ('g4', 1, 'Lave o arroz até a água sair clara.', null, null),
    ('g4', 2, 'Doure o alho no azeite e refogue o arroz por 2 minutos.', 120, null),
    ('g4', 3, 'Adicione a água e o sal; cozinhe tampado em fogo baixo por 35 minutos.', 2100, null),
    ('g4', 4, 'Desligue, deixe descansar 10 minutos e solte com um garfo.', 600, null),
    ('g5', 1, 'Corte a batata-doce em rodelas, tempere e asse a 200 °C por 20 minutos.', 1200, 200),
    ('g5', 2, 'Tempere o salmão com sal, limão e alecrim.', null, null),
    ('g5', 3, 'Coloque o salmão sobre as batatas e asse por mais 12 minutos.', 720, null),
    ('g6', 1, 'Refogue a cebola no azeite.', null, null),
    ('g6', 2, 'Adicione os legumes picados e o caldo; cozinhe 25 minutos.', 1500, null),
    ('g6', 3, 'Junte o grão-de-bico, ajuste o sal e cozinhe mais 10 minutos.', 600, null),
    ('g6', 4, 'Porcione e congele em potes individuais.', null, null),
    ('g8', 1, 'Refogue cebola e alho, junte a carne e cozinhe até dourar.', null, null),
    ('g8', 2, 'Cozinhe a abóbora em cubos no vapor por 12 minutos.', 720, null),
    ('g8', 3, 'Monte as marmitas: arroz, carne, abóbora e brócolis.', null, null),
    ('g8', 4, 'Congele por até 30 dias.', null, null),
    ('g9', 1, 'Amasse a banana e misture com o ovo e a aveia.', null, null),
    ('g9', 2, 'Despeje porções pequenas em frigideira antiaderente.', null, null),
    ('g9', 3, 'Doure 2 minutos de cada lado.', null, null)
    -- literal:steps:end
  ) as t(seed_key, pos, instruction, duration_seconds, temperature_c)
$$;

-- Categorias aprovadas (P5): g1, g4, g5 e g8 em almoço; g2 e g9 em café da manhã; g3 em molhos e
-- bases; g6 em sopas; e também em marmitas as que têm a etiqueta 'marmita' (g2 e g8).
create or replace function public.recipe_legacy_category_literals()
returns table (seed_key text, category_code text)
language sql immutable set search_path = public as $$
  select * from (values
    ('g1', 'almoco'), ('g2', 'cafe-da-manha'), ('g2', 'marmitas'), ('g3', 'molhos-e-bases'), ('g4', 'almoco'),
    ('g5', 'almoco'), ('g6', 'sopas'), ('g8', 'almoco'), ('g8', 'marmitas'), ('g9', 'cafe-da-manha')
  ) as t(seed_key, category_code)
$$;

-- Rótulo pt-BR de alérgeno do corpo v1 → código da etapa (0024). Rótulo com qualificador ou fora da
-- lista (ex.: "glúten (aveia pode conter)") não vira código: vai para allergen_notes como está.
create or replace function public.recipe_legacy_allergen_code(p_label text)
returns text language sql immutable set search_path = public as $$
  select case lower(btrim(coalesce(p_label, '')))
    when 'amendoim' then 'peanut'
    when 'castanha' then 'tree_nuts' when 'castanhas' then 'tree_nuts' when 'oleaginosas' then 'tree_nuts'
    when 'leite' then 'milk' when 'lactose' then 'milk'
    when 'ovo' then 'egg' when 'ovos' then 'egg'
    when 'trigo' then 'wheat'
    when 'soja' then 'soy'
    when 'peixe' then 'fish' when 'peixes' then 'fish'
    when 'crustáceos' then 'shellfish' when 'frutos do mar' then 'shellfish'
    when 'gergelim' then 'sesame'
  end
$$;

do $$ declare f text;
begin
  foreach f in array array['public.recipe_legacy_ingredient_literals()', 'public.recipe_legacy_step_literals()',
                           'public.recipe_legacy_category_literals()', 'public.recipe_legacy_allergen_code(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Chave do seed (g1…g9) quando o id é o do seed; outras receitas não têm literal.
create or replace function public.recipe_legacy_seed_key(p_content uuid)
returns text language sql stable set search_path = public as $$
  select k from unnest(array['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8', 'g9']) as k where public.seed_uuid('content:' || k) = p_content limit 1
$$;
revoke execute on function public.recipe_legacy_seed_key(uuid) from public, anon, authenticated;
grant execute on function public.recipe_legacy_seed_key(uuid) to service_role;

-- ---------------------------------------------------------------- backfill de uma receita
-- Para uma receita sem recipe_details: 1) restore_point com o corpo atual antes de qualquer escrita;
-- 2) ingredientes (literal quando item e texto batem com o seed; senão texto livre ou "a gosto",
-- sem recalcular; source_qty guarda o original); 3) etapas com o texto igual; 4) tempos copiados
-- com limites e total = duration_minutes; 5) alérgenos pelo mapa, declarados só se o corpo v1
-- listava algum; dieta nunca é inferida; 6) nota do chef, termos de busca e nutrição; 7) categorias.
-- Não toca em content.duration_minutes nem em content_bodies.body.
create or replace function public.recipe_backfill_legacy(p_content uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_body jsonb; v_key text; v_e jsonb; v_i int; v_pos int := 0; v_item text; v_qty text;
        v_lit record; v_terms text := ''; v_instr text; v_dur int; v_temp int;
        v_label text; v_code text; v_allergens text[] := '{}'; v_notes text[] := '{}'; v_declared boolean;
        v_n jsonb; v_ps jsonb; v_validated boolean; v_by text; v_at date; v_has_n boolean := false;
        v_ing int := 0; v_steps int := 0;
begin
  select * into c from public.content where id = p_content for update;
  if not found or c.type <> 'recipe' then raise exception 'not_recipe'; end if;
  if exists (select 1 from public.recipe_details where content_id = p_content) then return 'skipped'; end if;
  select b.body into v_body from public.content_bodies b where b.content_id = p_content;
  if v_body is null or jsonb_typeof(v_body) <> 'object' then raise exception 'no_legacy_body'; end if;
  v_key := public.recipe_legacy_seed_key(p_content);

  -- 1) restore_point (reaplicar não duplica: mesmo hash)
  if not exists (select 1 from public.recipe_versions v where v.content_id = p_content and v.reason = 'restore_point'
                   and v.snapshot_hash = md5(jsonb_build_object('legacy_body', v_body)::text)) then
    insert into public.recipe_versions (content_id, version_no, reason, snapshot, snapshot_hash)
    select p_content, coalesce(max(version_no), 0) + 1, 'restore_point', jsonb_build_object('legacy_body', v_body),
           md5(jsonb_build_object('legacy_body', v_body)::text)
    from public.recipe_versions where content_id = p_content;
  end if;

  -- 2) ingredientes
  for v_e, v_i in select t.e, t.o::int from jsonb_array_elements(case when jsonb_typeof(v_body -> 'ingredients') = 'array' then v_body -> 'ingredients' else '[]'::jsonb end)
                    with ordinality as t(e, o) loop
    exit when v_pos >= 60;
    v_item := btrim(coalesce(case when jsonb_typeof(v_e) = 'object' then v_e ->> 'item' else v_e #>> '{}' end, ''));
    v_qty := btrim(coalesce(case when jsonb_typeof(v_e) = 'object' then v_e ->> 'qty' end, ''));
    continue when v_item = '';
    v_pos := v_pos + 1;
    select * into v_lit from public.recipe_legacy_ingredient_literals() l
    where l.seed_key = v_key and l.pos = v_i and l.item = v_item and l.qty = v_qty;
    if found then
      insert into public.recipe_ingredients (content_id, position, name, quantity, unit, quantity_text, to_taste, note, source_qty)
      values (p_content, v_pos, left(v_item, 120), v_lit.quantity, v_lit.unit, v_lit.quantity_text, v_lit.to_taste, v_lit.note, nullif(v_qty, ''));
    else
      -- fora da tabela: não recalcula (decisão 7); "a gosto" vira a marca, o resto fica como texto
      insert into public.recipe_ingredients (content_id, position, name, quantity_text, to_taste, source_qty)
      values (p_content, v_pos, left(v_item, 120),
              case when lower(v_qty) = 'a gosto' then null else nullif(left(v_qty, 60), '') end,
              lower(v_qty) = 'a gosto', nullif(v_qty, ''));
    end if;
    v_terms := v_terms || ' ' || v_item;
    v_ing := v_ing + 1;
  end loop;

  -- 3) etapas (texto igual; duração e temperatura só dos literais)
  v_pos := 0;
  for v_e, v_i in select t.e, t.o::int from jsonb_array_elements(case when jsonb_typeof(v_body -> 'steps') = 'array' then v_body -> 'steps' else '[]'::jsonb end)
                    with ordinality as t(e, o) loop
    exit when v_pos >= 40;
    v_instr := left(btrim(coalesce(case when jsonb_typeof(v_e) = 'string' then v_e #>> '{}' else v_e ->> 'text' end, '')), 1200);
    continue when v_instr = '';
    v_pos := v_pos + 1;
    v_dur := null; v_temp := null;
    select l.duration_seconds, l.temperature_c into v_dur, v_temp from public.recipe_legacy_step_literals() l
    where l.seed_key = v_key and l.pos = v_i and l.instruction = v_instr;
    insert into public.recipe_steps (content_id, position, instruction, duration_seconds, temperature_c)
    values (p_content, v_pos, v_instr, v_dur, v_temp::smallint);
    v_steps := v_steps + 1;
  end loop;

  -- 5) alérgenos: só "declarados" quando o corpo v1 listava algum (a lista vazia do modelo do seed
  -- não é declaração do chef); rótulo fora do mapa vai para as notas, como está
  for v_label in select x from jsonb_array_elements_text(case when jsonb_typeof(v_body -> 'allergens') = 'array' then v_body -> 'allergens' else '[]'::jsonb end) as x loop
    v_code := public.recipe_legacy_allergen_code(v_label);
    if v_code is not null then
      if not (v_code = any (v_allergens)) then v_allergens := array_append(v_allergens, v_code); end if;
    elsif btrim(v_label) <> '' then
      v_notes := array_append(v_notes, btrim(v_label));
    end if;
  end loop;
  v_declared := cardinality(v_allergens) > 0 or cardinality(v_notes) > 0;

  -- 4) detalhes: tempos copiados como estão (fora da faixa vira nulo); nada é corrigido (P5)
  insert into public.recipe_details (content_id, servings, prep_minutes, cook_minutes, total_minutes, allergens, allergens_declared, allergen_notes)
  values (p_content,
          case when (v_body ->> 'servings') ~ '^[0-9]{1,3}$' and (v_body ->> 'servings')::int between 1 and 100 then (v_body ->> 'servings')::smallint end,
          case when (v_body ->> 'prep_minutes') ~ '^[0-9]{1,4}$' and (v_body ->> 'prep_minutes')::int between 0 and 1440 then (v_body ->> 'prep_minutes')::smallint end,
          case when (v_body ->> 'cook_minutes') ~ '^[0-9]{1,4}$' and (v_body ->> 'cook_minutes')::int between 0 and 1440 then (v_body ->> 'cook_minutes')::smallint end,
          case when c.duration_minutes between 1 and 4320 then c.duration_minutes::smallint end,
          v_allergens, v_declared, left(nullif(array_to_string(v_notes, '; '), ''), 300));

  -- 6) nota do chef e termos de busca (protegidos); nutrição com a validação que já existia
  insert into public.recipe_extras (content_id, chef_note, ingredient_terms)
  values (p_content, left(nullif(btrim(coalesce(v_body ->> 'note', '')), ''), 600), to_tsvector('simple', public.f_unaccent(v_terms)));
  v_n := v_body -> 'nutrition';
  if jsonb_typeof(v_n) = 'object' and jsonb_typeof(v_n -> 'per_serving') = 'object' then
    v_ps := v_n -> 'per_serving';
    v_has_n := exists (select 1 from jsonb_each(v_ps) as e(k, v) where e.k in ('kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg') and jsonb_typeof(e.v) = 'number');
  end if;
  if v_has_n then
    v_by := left(nullif(btrim(coalesce(v_n ->> 'validated_by', '')), ''), 120);
    v_at := case when (v_n ->> 'validated_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (v_n ->> 'validated_at')::date end;
    v_validated := coalesce(v_n ->> 'validated', '') = 'true' and v_by is not null and v_at is not null;
    insert into public.recipe_nutrition (content_id, kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source,
                                         validated, validated_by, validated_at, validation_note)
    values (p_content,
            case when jsonb_typeof(v_ps -> 'kcal') = 'number' and (v_ps ->> 'kcal')::numeric between 0 and 100000 then round((v_ps ->> 'kcal')::numeric, 1) end,
            case when jsonb_typeof(v_ps -> 'protein_g') = 'number' and (v_ps ->> 'protein_g')::numeric between 0 and 100000 then round((v_ps ->> 'protein_g')::numeric, 1) end,
            case when jsonb_typeof(v_ps -> 'carbs_g') = 'number' and (v_ps ->> 'carbs_g')::numeric between 0 and 100000 then round((v_ps ->> 'carbs_g')::numeric, 1) end,
            case when jsonb_typeof(v_ps -> 'fat_g') = 'number' and (v_ps ->> 'fat_g')::numeric between 0 and 100000 then round((v_ps ->> 'fat_g')::numeric, 1) end,
            case when jsonb_typeof(v_ps -> 'fiber_g') = 'number' and (v_ps ->> 'fiber_g')::numeric between 0 and 100000 then round((v_ps ->> 'fiber_g')::numeric, 1) end,
            case when jsonb_typeof(v_ps -> 'sodium_mg') = 'number' and (v_ps ->> 'sodium_mg')::numeric between 0 and 100000 then round((v_ps ->> 'sodium_mg')::numeric, 1) end,
            'chef', v_validated, case when v_validated then v_by end, case when v_validated then v_at end,
            case when v_validated then left(nullif(btrim(coalesce(v_n ->> 'note', '')), ''), 300) end);
  end if;

  -- 7) categorias (só as 8 do seed; mídia e vínculos ingrediente↔produto: nenhum)
  insert into public.recipe_category_links (content_id, category_code)
  select p_content, l.category_code from public.recipe_legacy_category_literals() l
  join public.recipe_categories k on k.code = l.category_code
  where l.seed_key = v_key
  on conflict do nothing;

  perform public.audit_log('recipe.backfill', 'content', p_content::text, null,
    jsonb_build_object('seed_key', v_key, 'ingredients', v_ing, 'steps', v_steps, 'allergens_declared', v_declared), null, 'system');
  return 'done';
end $$;
revoke execute on function public.recipe_backfill_legacy(uuid) from public, anon, authenticated;
grant execute on function public.recipe_backfill_legacy(uuid) to service_role;

-- ---------------------------------------------------------------- dry-run (antes de aplicar no remoto)
-- Para cada receita sem detalhes, cada ingrediente e etapa com o resultado esperado: 'literal' (bate
-- com o seed), 'text' ou 'to_taste' (fora da tabela, não recalcula), e as receitas fora das 8.
create or replace function public.recipe_backfill_dry_run()
returns table (content_id uuid, slug text, seed_key text, kind text, pos int, original text, outcome text)
language sql stable set search_path = public as $$
  with r as (
    select c.id, c.slug, public.recipe_legacy_seed_key(c.id) as k, b.body
    from public.content c join public.content_bodies b on b.content_id = c.id
    where c.type = 'recipe' and not exists (select 1 from public.recipe_details d where d.content_id = c.id)
  )
  select r.id, r.slug, r.k, 'ingredient', t.o::int, coalesce(t.e ->> 'item', '') || ' | ' || coalesce(t.e ->> 'qty', ''),
         case when exists (select 1 from public.recipe_legacy_ingredient_literals() l
                           where l.seed_key = r.k and l.pos = t.o and l.item = btrim(coalesce(t.e ->> 'item', '')) and l.qty = btrim(coalesce(t.e ->> 'qty', '')))
              then 'literal'
              when lower(btrim(coalesce(t.e ->> 'qty', ''))) = 'a gosto' then 'to_taste'
              else 'text' end
  from r, jsonb_array_elements(case when jsonb_typeof(r.body -> 'ingredients') = 'array' then r.body -> 'ingredients' else '[]'::jsonb end) with ordinality as t(e, o)
  union all
  select r.id, r.slug, r.k, 'step', t.o::int, t.e #>> '{}',
         case when exists (select 1 from public.recipe_legacy_step_literals() l
                           where l.seed_key = r.k and l.pos = t.o and l.instruction = btrim(t.e #>> '{}'))
              then 'literal' else 'text_only' end
  from r, jsonb_array_elements(case when jsonb_typeof(r.body -> 'steps') = 'array' then r.body -> 'steps' else '[]'::jsonb end) with ordinality as t(e, o)
  union all
  select r.id, r.slug, r.k, 'recipe', 0, null, case when r.k is null then 'outside_seed' else 'seed' end
  from r
  order by 2, 4, 5
$$;
revoke execute on function public.recipe_backfill_dry_run() from public, anon, authenticated;
grant execute on function public.recipe_backfill_dry_run() to service_role;

-- ---------------------------------------------------------------- execução
-- Cada receita num bloco próprio: em erro, aviso com o id e segue (a receita fica só com o corpo v1).
do $$ declare r record; v text;
begin
  for r in select c.id from public.content c
           where c.type = 'recipe' and not exists (select 1 from public.recipe_details d where d.content_id = c.id)
           order by c.created_at, c.id loop
    begin
      v := public.recipe_backfill_legacy(r.id);
    exception when others then
      raise warning 'recipe_backfill_legacy %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;
