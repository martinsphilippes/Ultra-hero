-- =============================================================================
-- Groscove Ultra · 0044 · Heróis reais: seis pessoas com contrato no lugar dos personagens fictícios
--   Decisão do responsável pelo projeto: ele informa ter contrato com seis pessoas reais e o app passa
--   a mostrar SÓ elas, com nome e foto reais (fotos de licença livre; créditos em docs/photo-credits.md).
--   As linhas existentes são reaproveitadas (conteúdos, receitas, programas e vínculos continuam):
--     tiago-albuquerque -> neymar            davi-nascimento -> gabriel-medina
--     camila-sato       -> joao-fonseca      rafael-duarte   -> ronaldinho-gaucho
--     lia-monteiro      -> anitta            helena-vilar    -> erick-jacquin (conta demo do herói)
--   Os seis ficam is_fictional = false e rights_status = 'authorized' (titular = a própria pessoa):
--   o selo "Personagem fictício" sai. O documento do contrato fica para o admin registrar em
--   creator_rights_private (tela do herói no admin).
--   bruna-castellano e marcos-ferraz saem do app de forma REVERSÍVEL (nada é apagado):
--     - perfil 'suspended' (a RLS já esconde: lista, página do herói vira 404) e sem fotos (as fotos
--       eram de pessoas reais sem contrato);
--     - conteúdo publicado que é etapa (ou substituto) de programa de um dos seis passa ao dono do
--       programa (assim nenhum programa fica com etapa quebrada); o resto é arquivado
--       (archived_by = 'admin'); os programas deles são arquivados;
--     - alocações de produtos e indicações de receitas deles (e de receitas arquivadas) ficam
--       'suspended'; indicação que virou receita própria também.
--     Tudo o que mudou fica listado em admin_audit (action 'hero.removed', um registro por perfil)
--     para desfazer com precisão (roteiro no relatório da entrega).
--   Textos dos conteúdos e programas dos seis: nomes antigos trocados pelos novos.
-- Só DADOS. Sem drop/truncate de objetos permanentes; sem função nova. Reaplicável: tudo filtra pelo
-- estado anterior (slug antigo, caminho de foto antigo, status publicado/validado).
-- Roda como dono da migração (auth.uid() nulo): os guards de coluna deixam passar; app.trusted só
-- para o corpo gerenciado das receitas estruturadas.
-- =============================================================================

-- ---------------------------------------------------------------- 0) mapa dos seis
drop table if exists real_heroes_map;
create temporary table real_heroes_map (
  seed_key text, old_slug text, new_slug text, name text, headline text, bio text, pillars public.pillar[], sort_order int,
  old_full text, old_first text, new_first text
);
insert into real_heroes_map values
  ('tiago', 'tiago-albuquerque', 'neymar', 'Neymar', 'Atacante',
   'Jogador de futebol brasileiro. No app, compartilha treinos de corrida, mobilidade e preparo físico.',
   '{training}', 10, 'Tiago Albuquerque', 'Tiago', 'Neymar'),
  ('davi', 'davi-nascimento', 'gabriel-medina', 'Gabriel Medina', 'Surfista',
   'Surfista brasileiro. No app, compartilha conteúdos de preparo físico, hidratação e alimentação do dia a dia.',
   '{training,nutrition}', 20, 'Davi Nascimento', 'Davi', 'Gabriel'),
  ('camila', 'camila-sato', 'joao-fonseca', 'João Fonseca', 'Tenista',
   'Tenista brasileiro. No app, compartilha treinos de força e condicionamento para iniciantes.',
   '{training}', 30, 'Camila Sato', 'Camila', 'João'),
  ('lia', 'lia-monteiro', 'anitta', 'Anitta', 'Cantora',
   'Cantora brasileira. No app, compartilha conteúdos de rotina, sono e autocuidado.',
   '{routine}', 40, 'Lia Monteiro', 'Lia', 'Anitta'),
  ('rafael', 'rafael-duarte', 'ronaldinho-gaucho', 'Ronaldinho Gaúcho', 'Ex-jogador de futebol',
   'Ex-jogador de futebol brasileiro. No app, compartilha conteúdos de foco, planejamento e rotina.',
   '{training,routine}', 50, 'Rafael Duarte', 'Rafael', 'Ronaldinho'),
  ('helena', 'helena-vilar', 'erick-jacquin', 'Érick Jacquin', 'Chef de cozinha',
   'Chef de cozinha francês radicado no Brasil. No app, compartilha receitas e técnicas de cozinha de base.',
   '{gastronomy}', 60, 'Helena Vilar', 'Helena', 'Érick');

-- id de cada um: pelo id do seed ou por um dos slugs (reaplicar acha pelo slug novo)
drop table if exists real_heroes_ids;
create temporary table real_heroes_ids as
select m.*, cp.id
from real_heroes_map m
join public.creator_profiles cp
  on cp.id = public.seed_uuid('creator:' || m.seed_key) or cp.slug in (m.old_slug, m.new_slug);

drop table if exists removed_heroes;
create temporary table removed_heroes as
select cp.id, cp.slug from public.creator_profiles cp
where (cp.id in (public.seed_uuid('creator:bruna'), public.seed_uuid('creator:marcos'))
       or cp.slug in ('bruna-castellano', 'marcos-ferraz'))
  and cp.id not in (select id from real_heroes_ids);

-- ---------------------------------------------------------------- 1) remoção reversível dos dois
do $$
declare
  r record;
  v_moved jsonb; v_archived uuid[]; v_programs uuid[]; v_products uuid[]; v_links uuid[]; v_before jsonb;
begin
  -- reaplicar não repete o registro: só entra quem ainda tem algo no ar
  for r in select h.id, h.slug from removed_heroes h
           where exists (select 1 from public.creator_profiles cp where cp.id = h.id and cp.status <> 'suspended')
              or exists (select 1 from public.content c where c.creator_id = h.id and c.status = 'published')
              or exists (select 1 from public.programs p where p.creator_id = h.id and p.status = 'published') loop
    select to_jsonb(cp) - 'credentials' into v_before from public.creator_profiles cp where cp.id = r.id;

    -- conteúdo publicado usado por programa (publicado) de outro herói: passa ao dono do programa
    with uses as (
      select pi.content_id, p.creator_id, p.is_featured, p.created_at
      from public.program_items pi
      join public.program_versions v on v.id = pi.version_id
      join public.programs p on p.id = v.program_id
      where p.status = 'published' and p.creator_id is not null and p.creator_id not in (select id from removed_heroes)
      union all
      select s.replacement_content_id, p.creator_id, p.is_featured, p.created_at
      from public.program_item_substitutions s
      join public.program_versions v on v.id = s.version_id
      join public.programs p on p.id = v.program_id
      where p.status = 'published' and p.creator_id is not null and p.creator_id not in (select id from removed_heroes)
    ), pick as (
      select distinct on (c.id) c.id as content_id, u.creator_id as new_creator
      from public.content c join uses u on u.content_id = c.id
      where c.creator_id = r.id and c.status = 'published'
      order by c.id, u.is_featured desc, u.created_at
    ), moved as (
      update public.content c set creator_id = pick.new_creator
      from pick where c.id = pick.content_id
      returning c.id, c.creator_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('content_id', id, 'to', creator_id)), '[]'::jsonb) into v_moved from moved;

    -- mídia das receitas movidas acompanha o novo dono
    update public.recipe_media m set creator_id = c.creator_id
    from public.content c where c.id = m.content_id and m.creator_id = r.id and c.creator_id <> r.id;

    -- o resto do que estava no ar é arquivado
    with a as (
      update public.content set status = 'archived', archived_at = now(), archived_by = 'admin', publish_at = null
      where creator_id = r.id and status = 'published'
      returning id
    ) select coalesce(array_agg(id), '{}') into v_archived from a;

    with a as (
      update public.programs set status = 'archived' where creator_id = r.id and status = 'published' returning id
    ) select coalesce(array_agg(id), '{}') into v_programs from a;

    with a as (
      update public.creator_products set status = 'suspended' where creator_id = r.id and status in ('validated', 'suggested') returning id
    ) select coalesce(array_agg(id), '{}') into v_products from a;

    -- indicações do herói removido e indicações de receitas que acabaram de ser arquivadas
    with a as (
      update public.creator_recipe_links set status = 'suspended'
      where status in ('validated', 'suggested') and (creator_id = r.id or content_id = any (v_archived))
      returning id
    ) select coalesce(array_agg(id), '{}') into v_links from a;

    update public.creator_profiles
       set status = 'suspended', avatar_url = null, cover_url = null
     where id = r.id;

    perform public.audit_log('hero.removed', 'creator_profile', r.id::text, v_before,
      jsonb_build_object('slug', r.slug, 'status', 'suspended', 'content_moved', v_moved, 'content_archived', to_jsonb(v_archived),
                         'programs_archived', to_jsonb(v_programs), 'creator_products_suspended', to_jsonb(v_products),
                         'recipe_links_suspended', to_jsonb(v_links)),
      '0044: o app mostra só os seis heróis reais com contrato', 'system'::public.actor_type);
  end loop;
end $$;

-- indicação que virou receita do próprio herói (receita movida) não faz sentido: suspensa
update public.creator_recipe_links l set status = 'suspended'
from public.content c
where c.id = l.content_id and c.creator_id = l.creator_id and l.status in ('validated', 'suggested');

-- ---------------------------------------------------------------- 2) os seis: nome, slug, bio, fotos, direitos
do $$
declare r record;
begin
  -- só na primeira vez (reaplicar não duplica o registro)
  for r in select i.id, to_jsonb(cp) - 'credentials' as before from real_heroes_ids i join public.creator_profiles cp on cp.id = i.id
           where cp.slug is distinct from i.new_slug or cp.is_fictional loop
    perform public.audit_log('hero.real_identity', 'creator_profile', r.id::text, r.before, null,
      '0044: personagem fictício vira a pessoa real com contrato', 'system'::public.actor_type);
  end loop;
end $$;

update public.creator_profiles cp
   set slug = i.new_slug,
       name = i.name,
       headline = i.headline,
       bio = i.bio,
       pillars = i.pillars,
       sort_order = i.sort_order,
       is_fictional = false,
       rights_status = 'authorized',
       rights_holder = i.name,
       rights_valid_until = null,
       rights_note = 'Uso de nome e imagem autorizado em contrato.',
       avatar_url = '/heroes/' || i.new_slug || '-avatar.webp',
       cover_url = '/heroes/' || i.new_slug || '-cover.webp',
       -- perfis sociais e credenciais eram do personagem
       socials = '{}'::jsonb,
       credentials = null,
       credentials_approved_at = null,
       status = 'active'
  from real_heroes_ids i
 where cp.id = i.id
   -- só na primeira vez: reaplicar não desfaz o que o admin ou o herói mudarem depois
   and (cp.slug is distinct from i.new_slug or cp.is_fictional);

-- conta demo do herói: nome exibido acompanha o herói
update public.profiles
   set display_name = replace(display_name, 'Helena Vilar', 'Érick Jacquin')
 where display_name like '%Helena Vilar%';
update auth.users
   set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{full_name}', to_jsonb(replace(raw_user_meta_data ->> 'full_name', 'Helena Vilar', 'Érick Jacquin')))
 where raw_user_meta_data ->> 'full_name' like '%Helena Vilar%';

-- ---------------------------------------------------------------- 3) fotos dos posts (pessoa nova)
drop table if exists real_heroes_posts;
create temporary table real_heroes_posts (old_url text, new_url text);
insert into real_heroes_posts
select '/content/' || s || '.webp', '/content/' || s || '-' || p || '.webp'
from (values
  ('treino-funcional-iniciante-corpo-inteiro-t1', 'joao-fonseca'),
  ('forca-basica-agachar-empurrar-puxar-t3', 'joao-fonseca'),
  ('tecnica-de-agachamento-5-erros-comuns-t5', 'joao-fonseca'),
  ('core-em-12-minutos-t6', 'joao-fonseca'),
  ('treino-de-forca-em-casa-com-elastico-t9', 'joao-fonseca'),
  ('ritual-matinal-de-10-minutos-r1', 'anitta'),
  ('como-montar-uma-rotina-noturna-que-funciona-r2', 'anitta'),
  ('checklist-semanal-de-autocuidado-r5', 'anitta'),
  ('alongamento-leve-antes-de-dormir-r6', 'anitta'),
  ('higiene-do-sono-8-ajustes-simples-r9', 'anitta'),
  ('blocos-de-foco-organize-o-dia-em-3-prioridades-r3', 'ronaldinho-gaucho'),
  ('respiracao-4-7-8-para-desacelerar-r4', 'ronaldinho-gaucho'),
  ('por-que-streaks-funcionam-e-quando-nao-r7', 'ronaldinho-gaucho'),
  ('revisao-semanal-em-15-minutos-r8', 'ronaldinho-gaucho'),
  ('desligar-as-telas-experimento-de-7-dias-r10', 'ronaldinho-gaucho')
) as v (s, p);

-- só troca o que ainda aponta para a foto antiga (capa trocada depois fica como está)
update public.content c set cover_url = p.new_url from real_heroes_posts p where c.cover_url = p.old_url;
update public.programs g set cover_url = p.new_url from real_heroes_posts p where g.cover_url = p.old_url;

-- ---------------------------------------------------------------- 4) nomes antigos nos textos dos seis
do $$
declare
  v_pairs text[][];
  v_pair text[];
  v_target record;
begin
  -- nome completo antes do primeiro nome; Bruna/Marcos só aparecem no que foi movido
  v_pairs := array[
    ['Helena Vilar', 'Érick Jacquin'], ['Camila Sato', 'João Fonseca'], ['Tiago Albuquerque', 'Neymar'],
    ['Davi Nascimento', 'Gabriel Medina'], ['Lia Monteiro', 'Anitta'], ['Rafael Duarte', 'Ronaldinho Gaúcho'],
    ['Bruna Castellano', 'Gabriel Medina'], ['Marcos Ferraz', 'Érick Jacquin'],
    ['Helena', 'Érick'], ['Camila', 'João'], ['Tiago', 'Neymar'], ['Davi', 'Gabriel'], ['Lia', 'Anitta'],
    ['Rafael', 'Ronaldinho'], ['Bruna', 'Gabriel'], ['Marcos', 'Érick']];
  -- corpo das receitas estruturadas é gerenciado: só a migração (chamada confiável) reescreve
  perform set_config('app.trusted', 'on', true);

  for v_target in
    select * from (values
      ('content', 'title', 'id'), ('content', 'summary', 'id'),
      ('content_bodies', 'body', 'content_id'),
      ('content_localizations', 'title', 'content_id'), ('content_localizations', 'summary', 'content_id'), ('content_localizations', 'body', 'content_id'),
      ('recipe_details', 'story', 'content_id'), ('recipe_details', 'yield_text', 'content_id'), ('recipe_details', 'allergen_notes', 'content_id'),
      ('recipe_extras', 'chef_note', 'content_id'),
      ('recipe_steps', 'instruction', 'content_id'), ('recipe_steps', 'tip', 'content_id'),
      ('recipe_ingredients', 'note', 'content_id'),
      ('recipe_media', 'alt_text', 'content_id'), ('recipe_media', 'caption', 'content_id')
    ) as t (tbl, col, key)
    where to_regclass('public.' || t.tbl) is not null
      and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name = t.col)
  loop
    foreach v_pair slice 1 in array v_pairs loop
      execute format(
        'update public.%I set %I = regexp_replace(%I::text, %L, %L, ''g'')::%s
          where %I in (select id from public.content where creator_id in (select id from real_heroes_ids))
            and %I::text ~ %L',
        v_target.tbl, v_target.col, v_target.col, '\m' || v_pair[1] || '\M', v_pair[2],
        (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = ('public.' || v_target.tbl)::regclass and a.attname = v_target.col),
        v_target.key, v_target.col, '\m' || v_pair[1] || '\M');
    end loop;
  end loop;

  -- programas dos seis (versões e traduções)
  foreach v_pair slice 1 in array v_pairs loop
    update public.program_versions v
       set title = regexp_replace(v.title, '\m' || v_pair[1] || '\M', v_pair[2], 'g'),
           summary = regexp_replace(v.summary, '\m' || v_pair[1] || '\M', v_pair[2], 'g'),
           description = regexp_replace(v.description, '\m' || v_pair[1] || '\M', v_pair[2], 'g')
     where v.program_id in (select id from public.programs where creator_id in (select id from real_heroes_ids))
       and concat_ws(' ', v.title, v.summary, v.description) ~ ('\m' || v_pair[1] || '\M');
    update public.program_localizations l
       set title = regexp_replace(l.title, '\m' || v_pair[1] || '\M', v_pair[2], 'g'),
           summary = regexp_replace(l.summary, '\m' || v_pair[1] || '\M', v_pair[2], 'g'),
           description = regexp_replace(l.description, '\m' || v_pair[1] || '\M', v_pair[2], 'g')
     where l.version_id in (select v.id from public.program_versions v join public.programs p on p.id = v.program_id
                            where p.creator_id in (select id from real_heroes_ids))
       and concat_ws(' ', l.title, l.summary, l.description) ~ ('\m' || v_pair[1] || '\M');
  end loop;
  perform set_config('app.trusted', 'off', true);
end $$;

drop table if exists real_heroes_posts;
drop table if exists real_heroes_ids;
drop table if exists real_heroes_map;
drop table if exists removed_heroes;
