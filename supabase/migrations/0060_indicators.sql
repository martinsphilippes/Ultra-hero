-- =============================================================================
-- 0060 · Indicadores (Etapa 5 da vitrine dos heróis): painel /admin/indicadores
-- -----------------------------------------------------------------------------
--   1) shortcut_open_counters: aberturas de atalho da página do herói (dia-a-dia, alimentacao,
--      treinos, …) somadas por dia (Brasília), herói e fonte. Sem pessoa, sem IP, sem FK (lição da
--      0055: nada de chave com FK para duas tabelas embutidas; aqui a chave é própria e não há FK).
--      Só o service role soma (POST /api/shortcut-opens → shortcut_open_bump); anon/authenticated
--      não leem nem escrevem.
--   2) admin_indicators_*: leituras agregadas só do admin (security definer, is_admin() no início,
--      sem execute para anon). Nenhuma devolve id de pessoa, e-mail ou nome de cliente: só contagens
--      por herói, atalho, receita, programa, produto, profissional e item colecionável.
-- Regras gerais: idempotente; search_path fixo; grants explícitos; RLS ligada; nada de drop de tabela.
-- =============================================================================

-- ---------------------------------------------------------------- 1) contador de atalhos
create table if not exists public.shortcut_open_counters (
  id bigint generated always as identity primary key,
  day date not null,
  creator_id uuid not null,
  source_key text not null
    constraint shortcut_open_counters_source_check
    check (source_key in ('dia-a-dia', 'nutricao', 'alimentacao', 'treinos', 'gastronomia', 'programas', 'produtos')),
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  constraint shortcut_open_counters_uq unique (day, creator_id, source_key)
);
create index if not exists shortcut_open_counters_creator_idx on public.shortcut_open_counters (creator_id, day desc);

revoke all on table public.shortcut_open_counters from public, anon, authenticated;
grant all on table public.shortcut_open_counters to service_role;
alter table public.shortcut_open_counters enable row level security;
-- nenhuma política: só o service role (que ignora a RLS) lê e soma

-- Soma 1 abertura no dia (Brasília). Só herói ativo e fonte conhecida; fora disso não faz nada.
-- Security invoker: quem executa é o service role; anon e authenticated não executam.
create or replace function public.shortcut_open_bump(p_creator uuid, p_source text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_creator is null or p_source is null
     or p_source not in ('dia-a-dia', 'nutricao', 'alimentacao', 'treinos', 'gastronomia', 'programas', 'produtos') then
    return false;
  end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator and status = 'active') then
    return false;
  end if;
  insert into public.shortcut_open_counters as s (day, creator_id, source_key, count)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_creator, p_source, 1)
  on conflict on constraint shortcut_open_counters_uq do update set count = s.count + 1, updated_at = now();
  return true;
end $$;
revoke execute on function public.shortcut_open_bump(uuid, text) from public, anon, authenticated;
grant execute on function public.shortcut_open_bump(uuid, text) to service_role;

-- ---------------------------------------------------------------- 2) janela do período
-- 1..90 dias. Eventos com horário: desde now() - dias. Contadores por dia (Brasília): os últimos
-- N dias contando hoje.
create or replace function public.indicators_window(p_days int)
returns table (days int, since timestamptz, since_day date)
language sql stable security invoker set search_path = public as $$
  select d, now() - make_interval(days => d), (now() at time zone 'America/Sao_Paulo')::date - (d - 1)
  from (select least(greatest(coalesce(p_days, 30), 1), 90) as d) t
$$;
revoke execute on function public.indicators_window(int) from public, anon;
grant execute on function public.indicators_window(int) to authenticated, service_role;

-- ---------------------------------------------------------------- 3) por herói
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
      coalesce(so.n, 0) shortcut_opens, coalesce(cb.n, 0) collectible_bids, coalesce(cw.n, 0) collectible_views
    from public.creator_profiles h
    left join fol on fol.creator_id = h.id left join newf on newf.creator_id = h.id
    left join cv on cv.creator_id = h.id left join pv on pv.creator_id = h.id
    left join ra on ra.creator_id = h.id left join pt on pt.creator_id = h.id
    left join so on so.creator_id = h.id left join cb on cb.creator_id = h.id left join cw on cw.creator_id = h.id
  )
  select jsonb_build_object(
    'window_days', w.days,
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.followers desc, r.name) from hrows r
                      where r.status = 'active' or r.followers + r.new_followers + r.content_views + r.program_views
                        + r.recipe_fazer + r.recipe_comprar_pronto + r.recipe_lista_compras + r.pro_ver_perfil
                        + r.pro_contratar + r.shortcut_opens + r.collectible_bids + r.collectible_views > 0), '[]'::jsonb),
    -- novos seguidores por dia (Brasília), somados entre heróis; quem deixou de seguir não aparece
    'daily_follows', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(f.n, 0)) order by d.day), '[]'::jsonb)
                      from (select g::date as day from generate_series(w.since_day, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') g) d
                      left join (select (created_at at time zone 'America/Sao_Paulo')::date as day, count(*) n
                                 from public.hero_favorites where created_at >= w.since group by 1) f on f.day = d.day)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- 4) por atalho
create or replace function public.admin_indicators_shortcuts(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.indicators_window(p_days);
  select jsonb_build_object(
    'window_days', w.days,
    'tracking_since', (select min(day) from public.shortcut_open_counters),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source_key', source_key, 'opens', n, 'heroes', heroes) order by n desc, source_key), '[]'::jsonb)
                  from (select source_key, sum(count) n, count(distinct creator_id) heroes
                        from public.shortcut_open_counters where day >= w.since_day group by 1) t),
    'by_hero', (select coalesce(jsonb_agg(jsonb_build_object('creator_id', t.creator_id, 'slug', h.slug, 'name', coalesce(h.name, '—'),
                                  'source_key', t.source_key, 'opens', t.n) order by t.n desc, h.name, t.source_key), '[]'::jsonb)
                from (select creator_id, source_key, sum(count) n from public.shortcut_open_counters
                      where day >= w.since_day group by 1, 2 order by 3 desc limit 100) t
                left join public.creator_profiles h on h.id = t.creator_id),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(s.n, 0)) order by d.day), '[]'::jsonb)
              from (select g::date as day from generate_series(w.since_day, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') g) d
              left join (select day, sum(count) n from public.shortcut_open_counters where day >= w.since_day group by 1) s on s.day = d.day)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- 5) conversão
-- Receita: views da receita → toques (fazer, lista, comprar pronto) → adições ao carrinho do produto
-- pronto (cart.add de qualquer origem: o evento não diz de onde veio) → itens em pedidos de teste.
-- Programa: views → inscrições → conclusões. Loja: product.view → cart.add → checkout → pedido de teste.
create or replace function public.admin_indicators_conversion(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.indicators_window(p_days);
  with
  ev as (select event_name, properties from public.analytics_events
         where created_at >= w.since and event_name in ('content.view', 'program.view', 'product.view', 'cart.add', 'checkout.start')),
  rviews as (select c.id, count(*) n from ev join public.content c on c.id::text = ev.properties ->> 'content_id'
             where ev.event_name = 'content.view' and c.type = 'recipe' group by 1),
  racts as (select content_id,
              sum(count) filter (where action = 'fazer') fazer,
              sum(count) filter (where action = 'lista_compras') lista,
              sum(count) filter (where action = 'comprar_pronto') comprar
            from public.recipe_action_counters where day >= w.since_day group by 1),
  adds as (select ev.properties ->> 'product_id' product_id, count(*) n from ev where ev.event_name = 'cart.add' group by 1),
  sold as (select i.product_id, sum(i.quantity) qty, count(distinct i.order_id) orders from public.test_order_items i
           join public.test_orders o on o.id = i.order_id where o.created_at >= w.since group by 1),
  recipes as (
    select c.id, c.slug, c.title, coalesce(rv.n, 0) views, coalesce(ra.fazer, 0) fazer, coalesce(ra.lista, 0) lista_compras,
      coalesce(ra.comprar, 0) comprar_pronto, rr.product_id is not null has_ready_product,
      coalesce(ad.n, 0) ready_cart_adds, coalesce(so.qty, 0) ready_ordered_qty
    from public.content c
    left join rviews rv on rv.id = c.id left join racts ra on ra.content_id = c.id
    left join public.recipe_ready_products rr on rr.content_id = c.id
    left join adds ad on ad.product_id = rr.product_id::text
    left join sold so on so.product_id = rr.product_id
    where c.type = 'recipe'
  ),
  pviews as (select p.id, count(*) n from ev join public.programs p on p.id::text = ev.properties ->> 'program_id'
             where ev.event_name = 'program.view' group by 1),
  enr as (select program_id, count(*) filter (where enrolled_at >= w.since) enrolled,
            count(*) filter (where completed_at >= w.since) completed
          from public.enrollments group by 1),
  programs as (
    select p.id, p.slug,
      -- título em pt-BR: tradução pt-BR, senão o da versão (idioma de origem), senão o slug
      coalesce((select l.title from public.program_localizations l where l.version_id = p.current_version_id and l.locale = 'pt-BR'),
               (select v.title from public.program_versions v where v.id = p.current_version_id), p.slug) title,
      coalesce(pv.n, 0) views, coalesce(e.enrolled, 0) enrolled, coalesce(e.completed, 0) completed
    from public.programs p left join pviews pv on pv.id = p.id left join enr e on e.program_id = p.id
  )
  select jsonb_build_object(
    'window_days', w.days,
    'recipe_funnel', (select jsonb_build_object(
        'views', coalesce(sum(views), 0), 'fazer', coalesce(sum(fazer), 0), 'lista_compras', coalesce(sum(lista_compras), 0),
        'comprar_pronto', coalesce(sum(comprar_pronto), 0), 'ready_cart_adds', coalesce(sum(ready_cart_adds), 0),
        'ready_ordered_qty', coalesce(sum(ready_ordered_qty), 0)) from recipes),
    'recipes', (select coalesce(jsonb_agg(to_jsonb(r) order by r.comprar_pronto + r.fazer + r.lista_compras desc, r.views desc, r.title), '[]'::jsonb)
                from (select * from recipes
                      where views + fazer + lista_compras + comprar_pronto + ready_cart_adds + ready_ordered_qty > 0
                      order by comprar_pronto + fazer + lista_compras desc, views desc limit 30) r),
    'program_funnel', (select jsonb_build_object('views', coalesce(sum(views), 0), 'enrolled', coalesce(sum(enrolled), 0),
        'completed', coalesce(sum(completed), 0)) from programs),
    'programs', (select coalesce(jsonb_agg(to_jsonb(p) order by p.enrolled desc, p.views desc, p.title), '[]'::jsonb)
                 from (select * from programs where views + enrolled + completed > 0 order by enrolled desc, views desc limit 30) p),
    'shop_funnel', jsonb_build_object(
        'product_views', (select count(*) from ev where event_name = 'product.view'),
        'cart_adds', (select count(*) from ev where event_name = 'cart.add'),
        'checkouts', (select count(*) from ev where event_name = 'checkout.start'),
        'test_orders', (select count(*) from public.test_orders where created_at >= w.since),
        'test_orders_total_cents', (select coalesce(sum(total_cents), 0) from public.test_orders where created_at >= w.since))
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- 6) profissionais
-- Pedidos criados no período (contratações simuladas). Receita simulada = preço congelado dos
-- pedidos aceitos, agendados ou concluídos. Tempo de resposta = 1ª resposta − criação (mediana).
create or replace function public.admin_indicators_professionals(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.indicators_window(p_days);
  with
  o as (select * from public.service_orders where created_at >= w.since),
  taps as (select professional_id,
             sum(count) filter (where action = 'ver_perfil') ver_perfil,
             sum(count) filter (where action = 'contratar') contratar
           from public.professional_tap_counters where day >= w.since_day group by 1),
  per_pro as (
    select p.id, p.slug, p.name, p.specialty, p.status,
      count(o.id) orders,
      count(o.id) filter (where o.status = 'pending') pending,
      count(o.id) filter (where o.status = 'accepted') accepted,
      count(o.id) filter (where o.status = 'scheduled') scheduled,
      count(o.id) filter (where o.status = 'completed') completed,
      count(o.id) filter (where o.status = 'declined') declined,
      count(o.id) filter (where o.status = 'cancelled') cancelled,
      coalesce(sum(o.price_cents) filter (where o.status in ('accepted', 'scheduled', 'completed')), 0) revenue_cents,
      round((percentile_cont(0.5) within group (order by extract(epoch from o.first_response_at - o.created_at) / 60))::numeric, 1) median_response_minutes,
      coalesce(max(t.ver_perfil), 0) taps_ver_perfil, coalesce(max(t.contratar), 0) taps_contratar
    from public.professionals p
    left join o on o.professional_id = p.id
    left join taps t on t.professional_id = p.id
    group by p.id
  ),
  per_service as (
    select o.service_id, max(o.title_snapshot) title, max(p.name) professional, count(*) orders,
      count(*) filter (where o.status = 'completed') completed,
      coalesce(sum(o.price_cents) filter (where o.status in ('accepted', 'scheduled', 'completed')), 0) revenue_cents
    from o join public.professionals p on p.id = o.professional_id
    group by o.service_id
  )
  select jsonb_build_object(
    'window_days', w.days,
    'totals', (select jsonb_build_object(
        'orders', count(*),
        'pending', count(*) filter (where status = 'pending'),
        'accepted', count(*) filter (where status = 'accepted'),
        'scheduled', count(*) filter (where status = 'scheduled'),
        'completed', count(*) filter (where status = 'completed'),
        'declined', count(*) filter (where status = 'declined'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'revenue_cents', coalesce(sum(price_cents) filter (where status in ('accepted', 'scheduled', 'completed')), 0),
        'median_response_minutes', round((percentile_cont(0.5) within group (order by extract(epoch from first_response_at - created_at) / 60))::numeric, 1),
        'taps_ver_perfil', (select coalesce(sum(ver_perfil), 0) from taps),
        'taps_contratar', (select coalesce(sum(contratar), 0) from taps)) from o),
    'professionals', (select coalesce(jsonb_agg(to_jsonb(r) order by r.orders desc, r.taps_contratar desc, r.name), '[]'::jsonb)
                      from per_pro r where r.status = 'approved' or r.orders + r.taps_ver_perfil + r.taps_contratar > 0),
    'services', (select coalesce(jsonb_agg(to_jsonb(s) order by s.orders desc, s.title), '[]'::jsonb) from (select * from per_service order by orders desc limit 50) s)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- 7) colecionáveis
-- Situação e contato: estado atual. Lances, visualizações e valor final: no período.
create or replace function public.admin_indicators_collectibles(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.indicators_window(p_days);
  with
  bids as (select collectible_id, count(*) n from public.collectible_bids where created_at >= w.since group by 1),
  vw_ev as (select properties ->> 'collectible_id' id, count(*) n from public.analytics_events
            where event_name = 'collectible.view' and created_at >= w.since group by 1),
  items as (
    select c.id, c.title, coalesce(h.name, '') hero, c.status, c.ends_at, c.bids_count total_bids,
      coalesce(b.n, 0) bids, coalesce(vw.n, 0) views, r.final_cents, r.outcome, coalesce(r.contact_status, 'none') contact_status, c.is_demo
    from public.collectibles c
    left join public.creator_profiles h on h.id = c.creator_id
    left join bids b on b.collectible_id = c.id
    left join vw_ev vw on vw.id = c.id::text
    left join public.collectible_results r on r.collectible_id = c.id
    where c.status <> 'draft'
  )
  select jsonb_build_object(
    'window_days', w.days,
    'status', (select jsonb_build_object(
        'draft', count(*) filter (where status = 'draft'), 'scheduled', count(*) filter (where status = 'scheduled'),
        'live', count(*) filter (where status = 'live'), 'ended', count(*) filter (where status = 'ended'),
        'cancelled', count(*) filter (where status = 'cancelled')) from public.collectibles),
    'contact', (select jsonb_build_object(
        'pending', count(*) filter (where contact_status = 'pending'), 'contacted', count(*) filter (where contact_status = 'contacted'),
        'delivered', count(*) filter (where contact_status = 'delivered')) from public.collectible_results),
    'bids', (select coalesce(sum(n), 0) from bids),
    'views', (select coalesce(sum(n), 0) from vw_ev),
    'won', (select count(*) from public.collectible_results where outcome = 'won' and finalized_at >= w.since),
    'no_bids', (select count(*) from public.collectible_results where outcome = 'no_bids' and finalized_at >= w.since),
    'final_cents', (select coalesce(sum(final_cents), 0) from public.collectible_results where outcome = 'won' and finalized_at >= w.since),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by (i.status = 'live') desc, i.ends_at desc nulls last), '[]'::jsonb)
              from (select * from items order by (status = 'live') desc, ends_at desc nulls last limit 50) i)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- 8) ranking
-- Receitas por toques, programas por inscrições, produtos por adições ao carrinho (top 10 cada).
-- O ranking dos heróis sai de admin_indicators_heroes (o app soma as ações de cada herói).
create or replace function public.admin_indicators_ranking(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record; v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.indicators_window(p_days);
  with
  ev as (select event_name, properties from public.analytics_events
         where created_at >= w.since and event_name in ('content.view', 'program.view', 'product.view', 'cart.add')),
  recipes as (
    select c.id, c.slug, c.title, sum(r.count) actions,
      sum(r.count) filter (where r.action = 'fazer') fazer,
      sum(r.count) filter (where r.action = 'comprar_pronto') comprar_pronto,
      sum(r.count) filter (where r.action = 'lista_compras') lista_compras
    from public.recipe_action_counters r join public.content c on c.id = r.content_id
    where r.day >= w.since_day group by c.id order by 4 desc, c.title limit 10
  ),
  programs as (
    select p.id, p.slug,
      -- título em pt-BR: tradução pt-BR, senão o da versão (idioma de origem), senão o slug
      coalesce((select l.title from public.program_localizations l where l.version_id = p.current_version_id and l.locale = 'pt-BR'),
               (select v.title from public.program_versions v where v.id = p.current_version_id), p.slug) title,
      (select count(*) from public.enrollments e where e.program_id = p.id and e.enrolled_at >= w.since) enrolled,
      (select count(*) from ev where ev.event_name = 'program.view' and ev.properties ->> 'program_id' = p.id::text) views
    from public.programs p
  ),
  products as (
    select pr.id, pr.slug, pr.title,
      count(*) filter (where ev.event_name = 'cart.add') cart_adds,
      count(*) filter (where ev.event_name = 'product.view') views
    from ev join public.products pr on pr.id::text = ev.properties ->> 'product_id'
    where ev.event_name in ('cart.add', 'product.view') group by pr.id
  )
  select jsonb_build_object(
    'window_days', w.days,
    'recipes', (select coalesce(jsonb_agg(to_jsonb(r) order by r.actions desc, r.title), '[]'::jsonb) from recipes r),
    'programs', (select coalesce(jsonb_agg(to_jsonb(p) order by p.enrolled desc, p.views desc, p.title), '[]'::jsonb)
                 from (select * from programs where enrolled + views > 0 order by enrolled desc, views desc limit 10) p),
    'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.cart_adds desc, p.views desc, p.title), '[]'::jsonb)
                 from (select * from products order by cart_adds desc, views desc limit 10) p)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- 9) grants das leituras do admin
do $$
declare f text;
begin
  foreach f in array array['admin_indicators_heroes', 'admin_indicators_shortcuts', 'admin_indicators_conversion',
                           'admin_indicators_professionals', 'admin_indicators_collectibles', 'admin_indicators_ranking'] loop
    execute format('revoke execute on function public.%I(int) from public, anon', f);
    execute format('grant execute on function public.%I(int) to authenticated, service_role', f);
  end loop;
end $$;

-- O PostgREST passa a enxergar a tabela e as funções novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
