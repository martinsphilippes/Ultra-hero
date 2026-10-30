-- =============================================================================
-- Ultra Hero · 0061 · Aviso de lance superado (push + pop-up no app) e visitas à página do herói
--   Docs: docs/decisions/push-notifications.md, docs/decisions/colecionaveis.md,
--   docs/decisions/hero-showcase.md (indicadores). Cenário S71 em supabase/tests/rls_scenarios.sql.
--
--   1) Lance superado nos Colecionáveis (0057): quando o lance que vencia um item é coberto por OUTRA
--      pessoa, quem vencia (e só ela) recebe:
--        - push no app das lojas (fila push_outbox da 0054), tipo novo `auction_outbid`, opt-in como
--          os outros (channel_push + notification_preferences.auction_outbid, nasce desligado);
--          no máximo um aviso por pessoa e item a cada 2 minutos (guerra de lances não vira spam);
--        - aviso dentro do app (tabela user_alerts): uma linha pendente por pessoa e item, que só
--          ganha o preço novo enquanto não foi vista; a própria pessoa lê e marca como vista (RLS).
--      Gatilho em collectibles (troca de leading_bid_id), dentro da transação do place_bid, que já
--      trava a linha do item (FOR UPDATE): os lances do mesmo item são serializados.
--      Quem volta à frente tem o aviso pendente daquele item dado como visto.
--   2) hero_page_view_counters: visitas à página do herói (/personalities/<slug>) somadas por dia
--      (Brasília) e herói. Sem pessoa, sem IP, sem FK (lição da 0055). Só o service role soma
--      (POST /api/hero-page-views → hero_page_view_bump). Entra em admin_indicators_heroes.
-- Regras gerais: idempotente; search_path fixo; grants explícitos; RLS ligada; nada de drop de tabela.
-- Nenhuma função nova executável pelo visitante (S14 segue com 17).
-- =============================================================================

-- ---------------------------------------------------------------- 1) preferência e tipo do push
alter table public.notification_preferences add column if not exists auction_outbid boolean not null default false;

-- a lista de tipos da fila ganha auction_outbid (troca da regra: drop + add, idempotente)
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('hero_post', 'achievement', 'program_completed', 'streak_reminder', 'auction_outbid'));

-- janela de 2 min do lance superado procura por pessoa + tipo + hora
create index if not exists push_outbox_user_kind_idx on public.push_outbox (user_id, kind, created_at desc);

-- Consentimento por tipo (mesma função da 0054, com o tipo novo).
create or replace function public.push_allowed(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.channel_push and case p_kind
      when 'hero_post' then p.hero_posts
      when 'achievement' then p.achievements
      when 'program_completed' then p.achievements
      when 'streak_reminder' then p.streak_reminders
      when 'auction_outbid' then p.auction_outbid
      else false end
    from public.notification_preferences p where p.user_id = p_user
  ), false)
$$;
revoke execute on function public.push_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.push_allowed(uuid, text) to service_role;

-- ---------------------------------------------------------------- 2) avisos dentro do app
create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint user_alerts_kind_check check (kind in ('auction_outbid')),
  collectible_id uuid not null references public.collectibles (id) on delete cascade,
  -- retrato do item no momento do aviso (o pop-up não precisa de outra leitura)
  title text not null check (char_length(title) <= 200),
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  seen_at timestamptz
);
-- uma linha pendente por pessoa, tipo e item
create unique index if not exists user_alerts_pending_uq on public.user_alerts (user_id, kind, collectible_id) where seen_at is null;
create index if not exists user_alerts_user_idx on public.user_alerts (user_id, updated_at desc);
create index if not exists user_alerts_collectible_idx on public.user_alerts (collectible_id);
alter table public.user_alerts enable row level security;

drop policy if exists user_alerts_select_own on public.user_alerts;
create policy user_alerts_select_own on public.user_alerts for select to authenticated
  using (user_id = (select auth.uid()));
-- a pessoa só marca como visto (grant de coluna: seen_at e nada mais)
drop policy if exists user_alerts_update_own on public.user_alerts;
create policy user_alerts_update_own on public.user_alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.user_alerts from public, anon, authenticated;
grant select on table public.user_alerts to authenticated;
grant update (seen_at) on table public.user_alerts to authenticated;
grant all on table public.user_alerts to service_role;

-- ---------------------------------------------------------------- 3) gatilho do lance superado
create or replace function public.collectible_outbid_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev uuid; v_new uuid;
begin
  if old.leading_bid_id is null or new.leading_bid_id is null or new.leading_bid_id = old.leading_bid_id then return new; end if;
  select user_id into v_prev from public.collectible_bid_owners where bid_id = old.leading_bid_id;
  select user_id into v_new from public.collectible_bid_owners where bid_id = new.leading_bid_id;

  -- quem voltou à frente não tem mais o que ver sobre este item
  if v_new is not null then
    update public.user_alerts set seen_at = now()
     where user_id = v_new and kind = 'auction_outbid' and collectible_id = new.id and seen_at is null;
  end if;
  if v_prev is null or v_prev = v_new then return new; end if;

  -- dentro do app: o pendente ganha o preço novo; sem pendente, nasce outro
  update public.user_alerts set amount_cents = new.current_cents, title = left(new.title, 200), updated_at = now()
   where user_id = v_prev and kind = 'auction_outbid' and collectible_id = new.id and seen_at is null;
  if not found then
    insert into public.user_alerts (user_id, kind, collectible_id, title, amount_cents)
    values (v_prev, 'auction_outbid', new.id, left(new.title, 200), new.current_cents)
    on conflict do nothing;
  end if;

  -- push: um por pessoa e item a cada 2 min; push_enqueue confere consentimento e aparelho
  if not exists (
    select 1 from public.push_outbox o
    where o.user_id = v_prev and o.kind = 'auction_outbid' and o.payload ->> 'collectible_id' = new.id::text
      and o.created_at > now() - interval '2 minutes'
  ) then
    perform public.push_enqueue(v_prev, 'auction_outbid', 'auction_outbid:' || v_prev || ':' || new.leading_bid_id,
      jsonb_build_object('collectible_id', new.id, 'bid_id', new.leading_bid_id, 'amount_cents', new.current_cents));
  end if;
  return new;
end $$;
revoke execute on function public.collectible_outbid_notify() from public, anon, authenticated;

drop trigger if exists trg_collectible_outbid on public.collectibles;
create trigger trg_collectible_outbid after update of leading_bid_id on public.collectibles
  for each row execute function public.collectible_outbid_notify();

-- Limpeza (cron diário): a da 0054 mais os avisos do app com mais de 30 dias. Devolve o total.
create or replace function public.push_outbox_cleanup()
returns int language plpgsql security definer set search_path = public as $$
declare v_outbox int; v_alerts int;
begin
  delete from public.push_outbox
  where created_at < now() - interval '30 days' and (sent_at is not null or attempts >= 5);
  get diagnostics v_outbox = row_count;
  delete from public.user_alerts where updated_at < now() - interval '30 days';
  get diagnostics v_alerts = row_count;
  return v_outbox + v_alerts;
end $$;
revoke execute on function public.push_outbox_cleanup() from public, anon, authenticated;
grant execute on function public.push_outbox_cleanup() to service_role;

-- ---------------------------------------------------------------- 4) Realtime dos avisos
-- Seguro com RLS: o Realtime só entrega a linha a quem a política de select deixa ler (a própria pessoa).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_alerts') then
      alter publication supabase_realtime add table public.user_alerts;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- 5) visitas à página do herói
create table if not exists public.hero_page_view_counters (
  id bigint generated always as identity primary key,
  day date not null,
  creator_id uuid not null,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  constraint hero_page_view_counters_uq unique (day, creator_id)
);
create index if not exists hero_page_view_counters_creator_idx on public.hero_page_view_counters (creator_id, day desc);

revoke all on table public.hero_page_view_counters from public, anon, authenticated;
grant all on table public.hero_page_view_counters to service_role;
alter table public.hero_page_view_counters enable row level security;
-- nenhuma política: só o service role (que ignora a RLS) lê e soma

-- Soma 1 visita no dia (Brasília). Só herói ativo; fora disso não faz nada. Security invoker: quem
-- executa é o service role; anon e authenticated não executam.
create or replace function public.hero_page_view_bump(p_creator uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_creator is null or not exists (select 1 from public.creator_profiles where id = p_creator and status = 'active') then
    return false;
  end if;
  insert into public.hero_page_view_counters as s (day, creator_id, count)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_creator, 1)
  on conflict on constraint hero_page_view_counters_uq do update set count = s.count + 1, updated_at = now();
  return true;
end $$;
revoke execute on function public.hero_page_view_bump(uuid) from public, anon, authenticated;
grant execute on function public.hero_page_view_bump(uuid) to service_role;

-- ---------------------------------------------------------------- 6) indicadores por herói (0060 + visitas)
create or replace function public.admin_indicators_heroes(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.indicators_window(p_days);
  with
  fol as (select creator_id, followers from public.creator_follower_counts),
  newf as (select creator_id, count(*) n from public.hero_favorites where created_at >= w.since group by 1),
  cv as (select c.creator_id, count(*) n from public.analytics_events a
         join public.content c on c.id::text = a.properties ->> 'content_id'
         where a.event_name = 'content.view' and a.created_at >= w.since and c.creator_id is not null group by 1),
  pv as (select p.creator_id, count(*) n from public.analytics_events a
         join public.programs p on p.id::text = a.properties ->> 'program_id'
         where a.event_name = 'program.view' and a.created_at >= w.since and p.creator_id is not null group by 1),
  ra as (select creator_id,
           sum(count) filter (where action = 'fazer') fazer,
           sum(count) filter (where action = 'comprar_pronto') comprar,
           sum(count) filter (where action = 'lista_compras') lista
         from public.recipe_action_counters where day >= w.since_day group by 1),
  pt as (select creator_id,
           sum(count) filter (where action = 'ver_perfil') ver,
           sum(count) filter (where action = 'contratar') contratar
         from public.professional_tap_counters where day >= w.since_day and creator_id is not null group by 1),
  so as (select creator_id, sum(count) n from public.shortcut_open_counters where day >= w.since_day group by 1),
  hv as (select creator_id, sum(count) n from public.hero_page_view_counters where day >= w.since_day group by 1),
  cb as (select c.creator_id, count(*) n from public.collectible_bids b
         join public.collectibles c on c.id = b.collectible_id
         where b.created_at >= w.since and c.creator_id is not null group by 1),
  cw as (select c.creator_id, count(*) n from public.analytics_events a
         join public.collectibles c on c.id::text = a.properties ->> 'collectible_id'
         where a.event_name = 'collectible.view' and a.created_at >= w.since and c.creator_id is not null group by 1),
  hrows as (
    select h.id, h.slug, h.name, h.status::text as status,
      coalesce(fol.followers, 0) followers, coalesce(newf.n, 0) new_followers,
      coalesce(cv.n, 0) content_views, coalesce(pv.n, 0) program_views,
      coalesce(ra.fazer, 0) recipe_fazer, coalesce(ra.comprar, 0) recipe_comprar_pronto, coalesce(ra.lista, 0) recipe_lista_compras,
      coalesce(pt.ver, 0) pro_ver_perfil, coalesce(pt.contratar, 0) pro_contratar,
      coalesce(so.n, 0) shortcut_opens, coalesce(cb.n, 0) collectible_bids, coalesce(cw.n, 0) collectible_views,
      coalesce(hv.n, 0) page_views
    from public.creator_profiles h
    left join fol on fol.creator_id = h.id left join newf on newf.creator_id = h.id
    left join cv on cv.creator_id = h.id left join pv on pv.creator_id = h.id
    left join ra on ra.creator_id = h.id left join pt on pt.creator_id = h.id
    left join so on so.creator_id = h.id left join cb on cb.creator_id = h.id left join cw on cw.creator_id = h.id
    left join hv on hv.creator_id = h.id
  ),
  days as (select g::date as day from generate_series(w.since_day, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') g)
  select jsonb_build_object(
    'window_days', w.days,
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.followers desc, r.name) from hrows r
                      where r.status = 'active' or r.followers + r.new_followers + r.content_views + r.program_views
                        + r.recipe_fazer + r.recipe_comprar_pronto + r.recipe_lista_compras + r.pro_ver_perfil
                        + r.pro_contratar + r.shortcut_opens + r.collectible_bids + r.collectible_views + r.page_views > 0), '[]'::jsonb),
    -- novos seguidores por dia (Brasília), somados entre heróis; quem deixou de seguir não aparece
    'daily_follows', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(f.n, 0)) order by d.day), '[]'::jsonb)
                      from days d
                      left join (select (created_at at time zone 'America/Sao_Paulo')::date as day, count(*) n
                                 from public.hero_favorites where created_at >= w.since group by 1) f on f.day = d.day),
    -- visitas à página do herói por dia (Brasília), somadas entre heróis
    'daily_page_views', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(s.n, 0)) order by d.day), '[]'::jsonb)
                         from days d
                         left join (select day, sum(count) n from public.hero_page_view_counters where day >= w.since_day group by 1) s on s.day = d.day),
    'page_views_since', (select min(day) from public.hero_page_view_counters)
  ) into v;
  return v;
end $$;
revoke execute on function public.admin_indicators_heroes(int) from public, anon;
grant execute on function public.admin_indicators_heroes(int) to authenticated, service_role;

-- O PostgREST passa a enxergar a tabela, a coluna e as funções novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
