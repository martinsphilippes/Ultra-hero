-- 0023 · Desempate único na busca: search_content ordenava por relevância, destaque e data, sem
-- chave única. Com empates (mesma data/rank), a paginação por offset da grade do Explorar podia
-- repetir ou pular quadros entre uma página e a seguinte. Mesma assinatura e mesmo corpo de 0017,
-- só com c.id no fim do ORDER BY.

create or replace function public.search_content(p_query text, p_pillar public.pillar default null, p_type public.content_type default null,
  p_creator uuid default null, p_access public.access_level default null, p_limit int default 40, p_offset int default 0,
  p_difficulty text default null)
returns setof public.content language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as raw)
  select c.* from public.content c, q
  where public.content_is_live(c.status, c.publish_at)
    and (p_pillar is null or c.pillar = p_pillar)
    and (p_type is null or c.type = p_type)
    and (p_creator is null or c.creator_id = p_creator)
    and (p_access is null or c.access_level = p_access)
    and (p_difficulty is null or c.difficulty = p_difficulty)
    and (q.raw is null
         or c.search @@ plainto_tsquery('simple', public.f_unaccent(q.raw))
         or public.f_unaccent(c.title) ilike '%' || public.f_unaccent(q.raw) || '%'
         or exists (select 1 from public.creator_profiles cp where cp.id = c.creator_id and public.f_unaccent(cp.name) ilike '%' || public.f_unaccent(q.raw) || '%')
         or exists (select 1 from public.program_items pi join public.program_versions pv on pv.id = pi.version_id join public.programs p on p.id = pv.program_id
                    where pi.content_id = c.id and p.status = 'published' and public.f_unaccent(pv.title) ilike '%' || public.f_unaccent(q.raw) || '%'))
  order by (case when q.raw is null then 0 else ts_rank(c.search, plainto_tsquery('simple', public.f_unaccent(q.raw))) end) desc,
           c.is_featured desc, c.published_at desc, c.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

revoke execute on function public.search_content(text, public.pillar, public.content_type, uuid, public.access_level, int, int, text) from public;
grant execute on function public.search_content(text, public.pillar, public.content_type, uuid, public.access_level, int, int, text) to anon, authenticated, service_role;
