-- 0037: a sequência volta a contar só conteúdos (streak_events), como na 0003 (decisão Q10 do responsável:
-- "conteúdos concluídos agora; atividade do relógio quando houver relógio real").
-- Os itens de rotina viraram "Lembretes" (Q5), fora do Hoje: marcar um lembrete é agenda pessoal e não
-- entra na sequência. As marcações antigas (routine_checks) ficam guardadas, só deixam de contar.
-- Nada novo para anon: mesmas assinaturas, mesmo security definer/search_path e os mesmos grants da 0016/0022.

-- 1) compute_streak: só streak_events (corpo da 0003). Hoje sem evento ainda não quebra: conta a partir de ontem.
create or replace function public.compute_streak(p_user uuid, p_timezone text default 'UTC')
returns int language plpgsql stable security definer set search_path = public as $$
declare v_today date; v_cursor date; v_streak int := 0; v_has boolean;
begin
  v_today := public.local_date_for(coalesce(nullif(p_timezone, ''), 'UTC'));
  select exists (select 1 from public.streak_events where user_id = p_user and local_date = v_today) into v_has;
  v_cursor := case when v_has then v_today else v_today - 1 end;
  loop
    select exists (select 1 from public.streak_events where user_id = p_user and local_date = v_cursor) into v_has;
    exit when not v_has;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;
  return v_streak;
end $$;
revoke execute on function public.compute_streak(uuid, text) from public, anon;
grant execute on function public.compute_streak(uuid, text) to authenticated, service_role;

-- 2) routine_check (marcar lembrete): mesma validação (dono, item ativo, data local pelo fuso), mas não
-- calcula nem devolve a sequência — a resposta não pode sugerir que o lembrete conta.
create or replace function public.routine_check(p_item uuid, p_timezone text, p_done boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_date date; v_tz text := coalesce(nullif(p_timezone, ''), 'UTC');
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.routine_items where id = p_item and user_id = v_uid and active) then
    raise exception 'routine_item_not_found' using errcode = '42501';
  end if;
  v_date := public.local_date_for(v_tz);
  insert into public.routine_checks (user_id, item_id, local_date, done, timezone)
  values (v_uid, p_item, v_date, coalesce(p_done, true), v_tz)
  on conflict (user_id, item_id, local_date) do update set done = excluded.done, timezone = excluded.timezone, checked_at = now();
  return jsonb_build_object('done', coalesce(p_done, true), 'local_date', v_date);
end $$;
revoke execute on function public.routine_check(uuid, text, boolean) from public, anon;
grant execute on function public.routine_check(uuid, text, boolean) to authenticated, service_role;
