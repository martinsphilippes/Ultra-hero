-- =============================================================================
-- Ultra Hero · 0054 · Push no app das lojas (docs/decisions/push-notifications.md)
--   1. hero_favorites: a pessoa favorita um herói (antes só conteúdos, produtos e programas).
--   2. push_tokens: um token Expo por aparelho, gravado pela RPC register_push_token (a pessoa
--      só lê e apaga os próprios; o mesmo aparelho trocando de conta passa o token adiante).
--   3. notification_preferences ganha hero_posts e achievements (opt-in, como os outros tipos).
--   4. push_outbox: fila de envio, só service_role. Cada linha tem dedupe_key única: o mesmo
--      evento nunca gera dois avisos, e o envio pode reentrar (cron at-least-once).
--   5. Gatilhos que enfileiram: post novo de herói favorito (no máximo um aviso por herói, por
--      pessoa, por dia), conquista nova, programa concluído. Lembrete de sequência: função chamada
--      pelo cron diário. Tudo filtra pelo consentimento (channel_push + o tipo) já na fila; o envio
--      confere de novo.
-- Idempotente e sem remoções: pode ser reaplicada. As tabelas novas somem com a conta (cascade).
-- =============================================================================

-- ---------------------------------------------------------------- 1) heróis favoritos
create table if not exists public.hero_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, creator_id)
);
create index if not exists hero_favorites_creator_idx on public.hero_favorites (creator_id);
alter table public.hero_favorites enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hero_favorites' and policyname = 'hero_favorites_select_own') then
    create policy hero_favorites_select_own on public.hero_favorites
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  -- só herói ativo (público) pode ser favoritado
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hero_favorites' and policyname = 'hero_favorites_insert_own') then
    create policy hero_favorites_insert_own on public.hero_favorites
      for insert to authenticated with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.creator_profiles c where c.id = creator_id and c.status = 'active')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hero_favorites' and policyname = 'hero_favorites_delete_own') then
    create policy hero_favorites_delete_own on public.hero_favorites
      for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

revoke all on table public.hero_favorites from anon;
grant select, insert, delete on table public.hero_favorites to authenticated;
grant all on table public.hero_favorites to service_role;

-- ---------------------------------------------------------------- 2) tokens de push
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_tokens_platform_check') then
    alter table public.push_tokens add constraint push_tokens_platform_check check (platform in ('ios', 'android'));
  end if;
  -- formato do token do serviço de push da Expo; nada além disso entra
  if not exists (select 1 from pg_constraint where conname = 'push_tokens_token_check') then
    alter table public.push_tokens add constraint push_tokens_token_check
      check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_tokens' and policyname = 'push_tokens_select_own') then
    create policy push_tokens_select_own on public.push_tokens
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_tokens' and policyname = 'push_tokens_delete_own') then
    create policy push_tokens_delete_own on public.push_tokens
      for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

revoke all on table public.push_tokens from anon;
grant select, delete on table public.push_tokens to authenticated;
grant all on table public.push_tokens to service_role;

-- Grava (ou renova) o token deste aparelho para a conta logada. Sem política de insert: o token é a
-- chave, e o mesmo aparelho que troca de conta precisa passar o token para a conta nova — o que a
-- RLS do dono anterior não deixaria.
create or replace function public.register_push_token(p_token text, p_platform text, p_app_version text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then raise exception 'invalid_platform' using errcode = '22023'; end if;
  insert into public.push_tokens (token, user_id, platform, app_version)
  values (p_token, v_uid, p_platform, left(p_app_version, 32))
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version, last_seen_at = now();
end $$;
revoke execute on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 3) preferências por tipo
alter table public.notification_preferences add column if not exists hero_posts boolean not null default false;
alter table public.notification_preferences add column if not exists achievements boolean not null default false;

-- ---------------------------------------------------------------- 4) fila de envio
create table if not exists public.push_outbox (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  not_before timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  sent_at timestamptz,
  outcome text,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists push_outbox_dedupe_idx on public.push_outbox (dedupe_key);
create index if not exists push_outbox_due_idx on public.push_outbox (not_before) where sent_at is null;
alter table public.push_outbox enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_outbox_kind_check') then
    alter table public.push_outbox add constraint push_outbox_kind_check
      check (kind in ('hero_post', 'achievement', 'program_completed', 'streak_reminder'));
  end if;
end $$;

-- sem políticas: só o servidor (service_role) lê e grava a fila
revoke all on table public.push_outbox from anon, authenticated;
grant all on table public.push_outbox to service_role;
grant usage, select on sequence public.push_outbox_id_seq to service_role;

-- Consentimento de push para o tipo (linha ausente = padrão da tabela: tudo desligado).
create or replace function public.push_allowed(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.channel_push and case p_kind
      when 'hero_post' then p.hero_posts
      when 'achievement' then p.achievements
      when 'program_completed' then p.achievements
      when 'streak_reminder' then p.streak_reminders
      else false end
    from public.notification_preferences p where p.user_id = p_user
  ), false)
$$;
revoke execute on function public.push_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.push_allowed(uuid, text) to service_role;

create or replace function public.push_enqueue(p_user uuid, p_kind text, p_dedupe text, p_payload jsonb, p_not_before timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.push_allowed(p_user, p_kind) then return; end if;
  -- sem aparelho registrado não há para onde mandar
  if not exists (select 1 from public.push_tokens t where t.user_id = p_user) then return; end if;
  insert into public.push_outbox (user_id, kind, dedupe_key, payload, not_before)
  values (p_user, p_kind, p_dedupe, coalesce(p_payload, '{}'::jsonb), coalesce(p_not_before, now()))
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function public.push_enqueue(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.push_enqueue(uuid, text, text, jsonb, timestamptz) to service_role;

-- Lote para envio: marca como "pego" (claimed_at) para outro envio simultâneo não repetir; linha
-- pega há mais de 5 minutos sem sent_at volta à fila (envio que caiu no meio). Até 5 tentativas.
create or replace function public.push_claim(p_limit int default 200)
returns setof public.push_outbox language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.push_outbox o set claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.push_outbox
    where sent_at is null and attempts < 5 and not_before <= now()
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by id
    limit greatest(1, least(coalesce(p_limit, 200), 500))
    for update skip locked
  )
  returning o.*;
end $$;
revoke execute on function public.push_claim(int) from public, anon, authenticated;
grant execute on function public.push_claim(int) to service_role;

-- ---------------------------------------------------------------- 5) gatilhos
-- Post novo (ou agendado) de herói favoritado. Dispara na passagem para "published"; o agendado
-- entra com not_before = data de ir ao ar. Um aviso por herói, por pessoa, por dia (UTC).
create or replace function public.push_on_content_published()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_live timestamptz; v_owner uuid;
begin
  if new.status <> 'published' or new.creator_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;
  v_live := greatest(coalesce(new.publish_at, new.published_at, now()), now());
  select user_id into v_owner from public.creator_profiles where id = new.creator_id and status = 'active';
  if not found then return new; end if;
  perform public.push_enqueue(
    f.user_id, 'hero_post',
    'hero_post:' || f.user_id || ':' || new.creator_id || ':' || to_char(v_live at time zone 'UTC', 'YYYY-MM-DD'),
    jsonb_build_object('content_id', new.id, 'creator_id', new.creator_id),
    v_live)
  from public.hero_favorites f
  where f.creator_id = new.creator_id and f.user_id is distinct from v_owner;
  return new;
end $$;
revoke execute on function public.push_on_content_published() from public, anon, authenticated;

drop trigger if exists trg_push_content_published on public.content;
create trigger trg_push_content_published after insert or update of status on public.content
  for each row execute function public.push_on_content_published();

create or replace function public.push_on_achievement()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code from public.achievements where id = new.achievement_id;
  perform public.push_enqueue(new.user_id, 'achievement', 'achievement:' || new.user_id || ':' || new.achievement_id,
    jsonb_build_object('code', v_code));
  return new;
end $$;
revoke execute on function public.push_on_achievement() from public, anon, authenticated;

drop trigger if exists trg_push_achievement on public.user_achievements;
create trigger trg_push_achievement after insert on public.user_achievements
  for each row execute function public.push_on_achievement();

create or replace function public.push_on_program_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  perform public.push_enqueue(new.user_id, 'program_completed', 'program_completed:' || new.id,
    jsonb_build_object('program_id', new.program_id, 'enrollment_id', new.id));
  return new;
end $$;
revoke execute on function public.push_on_program_completed() from public, anon, authenticated;

drop trigger if exists trg_push_program_completed on public.enrollments;
create trigger trg_push_program_completed after update of status on public.enrollments
  for each row execute function public.push_on_program_completed();

-- Lembrete de sequência (cron diário): quem tem sequência viva, ainda não fez nada hoje (no fuso do
-- perfil) e aceitou o aviso. Um por pessoa por dia local. Devolve quantos entraram na fila.
create or replace function public.push_enqueue_streak_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_tz text; v_today date; v_streak int; v_count int := 0; v_before bigint;
begin
  for r in
    select distinct p.user_id, coalesce(nullif(pr.timezone, ''), 'America/Sao_Paulo') as tz
    from public.notification_preferences p
    join public.push_tokens t on t.user_id = p.user_id
    left join public.profiles pr on pr.id = p.user_id
    where p.channel_push and p.streak_reminders
  loop
    v_tz := case when exists (select 1 from pg_timezone_names where name = r.tz) then r.tz else 'UTC' end;
    v_today := (now() at time zone v_tz)::date;
    if exists (select 1 from public.streak_events e where e.user_id = r.user_id and e.local_date = v_today) then continue; end if;
    v_streak := public.compute_streak(r.user_id, v_tz);
    if v_streak < 1 then continue; end if;
    select count(*) into v_before from public.push_outbox where dedupe_key = 'streak:' || r.user_id || ':' || v_today;
    perform public.push_enqueue(r.user_id, 'streak_reminder', 'streak:' || r.user_id || ':' || v_today,
      jsonb_build_object('streak', v_streak));
    if v_before = 0 and exists (select 1 from public.push_outbox where dedupe_key = 'streak:' || r.user_id || ':' || v_today) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.push_enqueue_streak_reminders() from public, anon, authenticated;
grant execute on function public.push_enqueue_streak_reminders() to service_role;

-- Limpeza (cron diário): fila enviada ou desistida há mais de 30 dias.
create or replace function public.push_outbox_cleanup()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  delete from public.push_outbox
  where created_at < now() - interval '30 days' and (sent_at is not null or attempts >= 5);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.push_outbox_cleanup() from public, anon, authenticated;
grant execute on function public.push_outbox_cleanup() to service_role;

notify pgrst, 'reload schema';
