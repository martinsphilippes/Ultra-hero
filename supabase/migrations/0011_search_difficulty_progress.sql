-- =============================================================================
-- Ultra Hero · 0011 · Busca com filtro de nível e progresso retornando conclusão
-- Sugestões dos módulos Descobrir e Consumo.
-- =============================================================================

drop function if exists public.search_content(text, public.pillar, public.content_type, uuid, public.access_level, int, int);

create or replace function public.search_content(p_query text, p_pillar public.pillar default null, p_type public.content_type default null,
  p_creator uuid default null, p_access public.access_level default null, p_limit int default 40, p_offset int default 0,
  p_difficulty text default null)
returns setof public.content language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as raw)
  select c.* from public.content c, q
  where c.status = 'published'
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
           c.is_featured desc, c.published_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;
grant execute on function public.search_content(text, public.pillar, public.content_type, uuid, public.access_level, int, int, text) to anon, authenticated;

-- track_progress devolve também o resultado da conclusão automática (streak, conquistas, programas).
create or replace function public.track_progress(p_content uuid, p_position_seconds int, p_progress_pct int, p_timezone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_mode public.completion_mode; v_threshold int; v_result jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.can_access_content(p_content) then raise exception 'content_forbidden' using errcode = '42501'; end if;
  perform public.local_date_for(p_timezone);

  insert into public.content_progress (user_id, content_id, position_seconds, progress_pct)
  values (v_uid, p_content, greatest(0, p_position_seconds), least(100, greatest(0, p_progress_pct)))
  on conflict (user_id, content_id) do update
    set position_seconds = excluded.position_seconds,
        progress_pct = greatest(public.content_progress.progress_pct, excluded.progress_pct),
        updated_at = now();

  select coalesce(c.completion_mode, s.default_completion_mode), s.auto_threshold_pct
    into v_mode, v_threshold
  from public.content c join public.content_type_settings s on s.type = c.type where c.id = p_content;
  if v_mode = 'auto' and p_progress_pct >= v_threshold then
    v_result := public.complete_content(p_content, p_timezone, 'auto');
    return jsonb_build_object('completed', true) || v_result;
  end if;
  return jsonb_build_object('completed', false);
end $$;
