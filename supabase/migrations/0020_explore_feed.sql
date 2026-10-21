-- 0020: feed do Explorar em grade (estilo Instagram): ordem com variedade de heróis e rotação por semente.
-- Cada "rodada" traz no máximo um post por herói: row_number() por creator_id, embaralhado pela semente.
-- A ordem é determinística para a mesma semente, então a rolagem infinita (offset) não repete nem pula
-- posts. A semente muda por dia no app; com texto de busca o app usa search_content (relevância).
-- Security invoker: a política content_select já libera só o que está publicado e no ar; a função
-- repete o filtro content_is_live para admins e heróis não verem rascunhos aqui.
create or replace function public.explore_feed(
  p_pillar public.pillar default null,
  p_type public.content_type default null,
  p_access public.access_level default null,
  p_difficulty text default null,
  p_seed integer default 0,
  p_limit integer default 15,
  p_offset integer default 0)
returns setof public.content language sql stable set search_path = public as $$
  with live as (
    select c.id, c.creator_id
    from public.content c
    where public.content_is_live(c.status, c.publish_at)
      and (p_pillar is null or c.pillar = p_pillar)
      and (p_type is null or c.type = p_type)
      and (p_access is null or c.access_level = p_access)
      and (p_difficulty is null or c.difficulty = p_difficulty)
  ), ranked as (
    select l.id, l.creator_id,
           row_number() over (partition by coalesce(l.creator_id, l.id) order by md5(p_seed::text || ':' || l.id::text)) as round
    from live l
  )
  select c.*
  from public.content c
  join ranked r on r.id = c.id
  order by r.round,
           md5(p_seed::text || ':' || r.round::text || ':' || coalesce(r.creator_id, r.id)::text),
           r.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;
revoke execute on function public.explore_feed(public.pillar, public.content_type, public.access_level, text, integer, integer, integer) from public;
grant execute on function public.explore_feed(public.pillar, public.content_type, public.access_level, text, integer, integer, integer) to anon, authenticated, service_role;
