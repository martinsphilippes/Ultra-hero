-- 0022: "Hoje" dentro do Perfil: itens de rotina criados pela pessoa e marcação diária.
-- Hidratação e descanso NÃO passam por aqui: ficam só no aparelho (armazenamento local), coerente
-- com a Política de Privacidade (não coletamos dados de saúde). Itens de rotina são agenda, não saúde.
-- A sequência (compute_streak) passa a contar também dias com algum item de rotina marcado.

-- 1) Itens de rotina (só do próprio usuário; até 20 ativos).
create table if not exists public.routine_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  note text check (note is null or char_length(note) <= 120),
  time_of_day time,
  content_id uuid references public.content (id) on delete set null,
  weekdays smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])),
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routine_items_user_idx on public.routine_items (user_id, active, sort_order);
alter table public.routine_items enable row level security;
revoke all on table public.routine_items from anon, authenticated;
grant select, insert, update, delete on table public.routine_items to authenticated;
grant all on table public.routine_items to service_role;

create or replace function public.routine_items_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.active and (select count(*) from public.routine_items where user_id = new.user_id and active and id <> new.id) >= 20 then
    raise exception 'routine_limit' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.routine_items_limit() from public, anon;
grant execute on function public.routine_items_limit() to authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_routine_items_updated' and tgrelid = 'public.routine_items'::regclass) then
    create trigger trg_routine_items_updated before update on public.routine_items for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_routine_items_limit' and tgrelid = 'public.routine_items'::regclass) then
    create trigger trg_routine_items_limit before insert or update on public.routine_items for each row execute function public.routine_items_limit();
  end if;
  if not exists (select 1 from pg_policies where tablename = 'routine_items' and policyname = 'routine_items_own') then
    create policy routine_items_own on public.routine_items for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- 2) Marcação diária (leitura pelo dono; escrita só pela RPC, que valida a posse e a data local).
create table if not exists public.routine_checks (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.routine_items (id) on delete cascade,
  local_date date not null,
  done boolean not null default true,
  timezone text not null,
  checked_at timestamptz not null default now(),
  primary key (user_id, item_id, local_date)
);
create index if not exists routine_checks_user_date_idx on public.routine_checks (user_id, local_date) where done;
alter table public.routine_checks enable row level security;
revoke all on table public.routine_checks from anon, authenticated;
grant select on table public.routine_checks to authenticated;
grant all on table public.routine_checks to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'routine_checks' and policyname = 'routine_checks_select_own') then
    create policy routine_checks_select_own on public.routine_checks for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- Marca ou desmarca um item no dia local; devolve a sequência atualizada.
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
  return jsonb_build_object('done', coalesce(p_done, true), 'local_date', v_date, 'streak', public.compute_streak(v_uid, v_tz));
end $$;
revoke execute on function public.routine_check(uuid, text, boolean) from public, anon;
grant execute on function public.routine_check(uuid, text, boolean) to authenticated, service_role;

-- 3) A sequência conta dias com conclusão de conteúdo OU item de rotina marcado.
create or replace function public.compute_streak(p_user uuid, p_timezone text default 'UTC')
returns int language plpgsql stable security definer set search_path = public as $$
declare v_today date; v_cursor date; v_streak int := 0; v_has boolean;
begin
  v_today := public.local_date_for(coalesce(nullif(p_timezone, ''), 'UTC'));
  select exists (select 1 from public.streak_events where user_id = p_user and local_date = v_today)
      or exists (select 1 from public.routine_checks where user_id = p_user and local_date = v_today and done) into v_has;
  v_cursor := case when v_has then v_today else v_today - 1 end;
  loop
    select exists (select 1 from public.streak_events where user_id = p_user and local_date = v_cursor)
        or exists (select 1 from public.routine_checks where user_id = p_user and local_date = v_cursor and done) into v_has;
    exit when not v_has;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;
  return v_streak;
end $$;
