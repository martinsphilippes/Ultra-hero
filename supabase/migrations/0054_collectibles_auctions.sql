-- =============================================================================
-- Ultra Hero · 0054 · Colecionáveis (lances ao vivo de itens assinados) — pagamento SIMULADO
--   Itens raros assinados pelos heróis vão a lance com tempo marcado. Na UI o nome é sempre
--   "Colecionáveis" (nunca "leilão"); "lance" e "arrematar" aparecem dentro da página.
--   Docs: docs/decisions/colecionaveis.md.
--
-- Tabelas
--   collectibles            item + estado público do lance (preço atual, fim, nº de lances). Tudo
--                           aqui é seguro para qualquer um ler: sem id de usuário. Publicada no
--                           Realtime (UPDATE do preço/fim chega a quem assiste).
--   collectible_bids        lances públicos: valor, hora e rótulo mascarado ("Ma***a"). Sem user_id.
--                           Publicada no Realtime (INSERT de cada lance).
--   collectible_bid_owners  dono de cada lance (privado: cada um lê só os seus; admin lê tudo).
--                           É assim que a tela marca "Você" sem expor ids a ninguém.
--   collectible_results     resultado do encerramento (vencedor, valor, pagamento simulado). Só o
--                           vencedor e o admin leem.
-- Regras (no banco)
--   place_bid(auction, increment): só authenticated (sem execute para anon: S14 segue com 17);
--   trava a linha (FOR UPDATE); exige fase "ao vivo" e now() < ends_at; o incremento tem de ser um
--   dos configurados; novo valor = preço atual + incremento (o 1º lance = preço inicial + incremento);
--   quem já está vencendo não cobre o próprio lance; ≤ 1 lance a cada 2 s por pessoa e item;
--   lance nos 2 últimos minutos leva o fim para now() + 2 min (anti-sniping); conta suspensa,
--   admin e o próprio herói do item não dão lance.
--   Encerramento por tempo: a fase é calculada na leitura (collectible_phase); collectible_finalize
--   grava o resultado de forma idempotente (chamado ao abrir a página e pela rotina diária).
--   O vencedor paga (simulado) com collectible_pay → vira um pedido de teste comum (test_orders).
-- Escrita do admin só por RPCs (security definer, checam is_admin, sem execute para anon) e cada
--   uma grava em admin_audit. As tabelas não têm grant de escrita para a API.
-- Seed: 4 itens de DEMONSTRAÇÃO em rascunho (nunca ao vivo sozinhos), imagens neutras.
-- Regras gerais: idempotente; search_path fixo; grants explícitos; RLS ligada; nada de drop de tabela.
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabelas
create table if not exists public.collectibles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  creator_id uuid references public.creator_profiles (id) on delete set null,
  photos text[] not null default '{}' check (cardinality(photos) <= 8),
  authenticity_note text not null default '' check (char_length(authenticity_note) <= 2000),
  start_price_cents int not null check (start_price_cents between 100 and 100000000),
  bid_increments_cents int[] not null default '{1000,5000,10000}'
    check (cardinality(bid_increments_cents) between 1 and 4
           and 0 < all (bid_increments_cents) and 10000000 >= all (bid_increments_cents)),
  duration_minutes int not null default 1440 check (duration_minutes between 5 and 43200),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'ended', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  -- estado público do lance (só as RPCs mexem)
  current_cents int not null check (current_cents >= 0),
  bids_count int not null default 0 check (bids_count >= 0),
  leading_bid_id uuid,
  extensions_count int not null default 0,
  winner_label text,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collectibles_window check (status = 'draft' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);
create index if not exists collectibles_public_idx on public.collectibles (status, ends_at) where status <> 'draft';
create index if not exists collectibles_creator_idx on public.collectibles (creator_id) where creator_id is not null;

drop trigger if exists trg_collectibles_updated on public.collectibles;
create trigger trg_collectibles_updated before update on public.collectibles
  for each row execute function public.set_updated_at();

create table if not exists public.collectible_bids (
  id uuid primary key default gen_random_uuid(),
  collectible_id uuid not null references public.collectibles (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  bidder_label text check (bidder_label is null or char_length(bidder_label) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists collectible_bids_item_idx on public.collectible_bids (collectible_id, amount_cents desc);

create table if not exists public.collectible_bid_owners (
  bid_id uuid primary key references public.collectible_bids (id) on delete cascade,
  collectible_id uuid not null references public.collectibles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists collectible_bid_owners_user_idx on public.collectible_bid_owners (user_id, collectible_id, created_at desc);
create index if not exists collectible_bid_owners_item_idx on public.collectible_bid_owners (collectible_id);

create table if not exists public.collectible_results (
  collectible_id uuid primary key references public.collectibles (id) on delete cascade,
  outcome text not null check (outcome in ('won', 'no_bids')),
  winner_user_id uuid references auth.users (id) on delete set null,
  winning_bid_id uuid references public.collectible_bids (id) on delete set null,
  final_cents int not null check (final_cents >= 0),
  claim_status text not null default 'none' check (claim_status in ('none', 'pending_payment', 'paid')),
  order_id uuid references public.test_orders (id) on delete set null,
  finalized_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists collectible_results_winner_idx on public.collectible_results (winner_user_id) where winner_user_id is not null;

-- lance vencedor aponta para um lance do próprio item (FK criada uma vez)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'collectibles_leading_bid_fkey') then
    alter table public.collectibles add constraint collectibles_leading_bid_fkey
      foreign key (leading_bid_id) references public.collectible_bids (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------- 2) grants (escrita só pelas RPCs)
revoke all on table public.collectibles, public.collectible_bids, public.collectible_bid_owners, public.collectible_results
  from public, anon, authenticated;
grant select on table public.collectibles, public.collectible_bids to anon, authenticated;
grant select on table public.collectible_bid_owners, public.collectible_results to authenticated;
grant all on table public.collectibles, public.collectible_bids, public.collectible_bid_owners, public.collectible_results to service_role;

-- ---------------------------------------------------------------- 3) RLS
alter table public.collectibles enable row level security;
alter table public.collectible_bids enable row level security;
alter table public.collectible_bid_owners enable row level security;
alter table public.collectible_results enable row level security;

-- rascunho só para o admin; o resto (agendado, ao vivo, encerrado, cancelado) é público
drop policy if exists collectibles_select_public on public.collectibles;
create policy collectibles_select_public on public.collectibles for select to anon, authenticated
  using (status <> 'draft');
drop policy if exists collectibles_select_admin on public.collectibles;
create policy collectibles_select_admin on public.collectibles for select to authenticated
  using ((select public.is_admin()));

drop policy if exists collectible_bids_select_public on public.collectible_bids;
create policy collectible_bids_select_public on public.collectible_bids for select to anon, authenticated
  using (exists (select 1 from public.collectibles c where c.id = collectible_bids.collectible_id and c.status <> 'draft'));
drop policy if exists collectible_bids_select_admin on public.collectible_bids;
create policy collectible_bids_select_admin on public.collectible_bids for select to authenticated
  using ((select public.is_admin()));

drop policy if exists collectible_bid_owners_select_own on public.collectible_bid_owners;
create policy collectible_bid_owners_select_own on public.collectible_bid_owners for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists collectible_results_select_own on public.collectible_results;
create policy collectible_results_select_own on public.collectible_results for select to authenticated
  using (winner_user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------- 4) helpers puros
-- Fase efetiva: agendado vira "ao vivo" no início e qualquer um vira "encerrado" no fim, sem rotina.
create or replace function public.collectible_phase(p_status text, p_starts timestamptz, p_ends timestamptz)
returns text language sql stable set search_path = public as $$
  select case
    when p_status in ('draft', 'cancelled', 'ended') then p_status
    when p_ends is null or p_starts is null then 'draft'
    when now() >= p_ends then 'ended'
    when now() >= p_starts then 'live'
    else 'scheduled' end
$$;
revoke execute on function public.collectible_phase(text, timestamptz, timestamptz) from public;
grant execute on function public.collectible_phase(text, timestamptz, timestamptz) to anon, authenticated, service_role;

-- "Maria Silva" → "Ma***a"; "Ana" → "A***"; vazio → null (a tela mostra "Participante").
-- Mesma regra de src/lib/collectibles/rules.ts (maskBidderName).
create or replace function public.collectible_mask_label(p_name text)
returns text language sql immutable set search_path = public as $$
  select case
    when w is null or w = '' then null
    when char_length(w) >= 4 then left(w, 2) || '***' || right(w, 1)
    else left(w, 1) || '***' end
  from (select split_part(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ', 1) as w) s
$$;
revoke execute on function public.collectible_mask_label(text) from public, anon;
grant execute on function public.collectible_mask_label(text) to authenticated, service_role;

-- ---------------------------------------------------------------- 5) lance
create or replace function public.place_bid(auction_id uuid, increment_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.collectibles%rowtype;
  v_phase text; v_amount int; v_bid uuid; v_label text; v_ends timestamptz; v_extended boolean;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.is_admin() then raise exception 'admin_cannot_bid' using errcode = '42501'; end if;
  if exists (select 1 from auth.users u where u.id = v_uid and u.banned_until > now()) then
    raise exception 'account_suspended' using errcode = '42501';
  end if;

  select * into c from public.collectibles where id = auction_id for update;
  if not found or c.status = 'draft' then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_phase := public.collectible_phase(c.status, c.starts_at, c.ends_at);
  if v_phase = 'ended' then raise exception 'auction_ended' using errcode = 'P0001'; end if;
  if v_phase <> 'live' then raise exception 'auction_not_live' using errcode = 'P0001'; end if;
  if c.creator_id is not null and c.creator_id = public.my_creator_id() then
    raise exception 'creator_cannot_bid' using errcode = '42501';
  end if;
  if increment_cents is null or not (increment_cents = any (c.bid_increments_cents)) then
    raise exception 'invalid_increment' using errcode = '22023';
  end if;
  if c.leading_bid_id is not null and exists (
    select 1 from public.collectible_bid_owners o where o.bid_id = c.leading_bid_id and o.user_id = v_uid) then
    raise exception 'already_winning' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.collectible_bid_owners o
             where o.user_id = v_uid and o.collectible_id = c.id and o.created_at > now() - interval '2 seconds') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_amount := c.current_cents + increment_cents;
  select public.collectible_mask_label(p.display_name) into v_label from public.profiles p where p.id = v_uid;

  insert into public.collectible_bids (collectible_id, amount_cents, bidder_label)
  values (c.id, v_amount, v_label) returning id into v_bid;
  insert into public.collectible_bid_owners (bid_id, collectible_id, user_id) values (v_bid, c.id, v_uid);

  -- anti-sniping: lance nos 2 últimos minutos empurra o fim para now() + 2 min
  v_extended := c.ends_at - now() < interval '2 minutes';
  v_ends := case when v_extended then now() + interval '2 minutes' else c.ends_at end;

  update public.collectibles
     set current_cents = v_amount, bids_count = bids_count + 1, leading_bid_id = v_bid,
         ends_at = v_ends, extensions_count = extensions_count + v_extended::int, status = 'live'
   where id = c.id;

  return jsonb_build_object('bid_id', v_bid, 'amount_cents', v_amount, 'current_cents', v_amount,
    'bids_count', c.bids_count + 1, 'ends_at', v_ends, 'extended', v_extended, 'server_now', now());
end $$;
revoke execute on function public.place_bid(uuid, int) from public, anon;
grant execute on function public.place_bid(uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------- 6) encerramento (idempotente)
-- Interna: grava o resultado de um item cujo tempo acabou. Devolve true se encerrou agora.
create or replace function public.collectible_finalize_row(p_collectible uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.collectibles%rowtype; v_owner uuid; v_label text;
begin
  select * into c from public.collectibles where id = p_collectible for update;
  if not found or c.finalized_at is not null or c.status not in ('scheduled', 'live') then return false; end if;
  if public.collectible_phase(c.status, c.starts_at, c.ends_at) <> 'ended' then return false; end if;

  if c.leading_bid_id is not null then
    select o.user_id into v_owner from public.collectible_bid_owners o where o.bid_id = c.leading_bid_id;
    select b.bidder_label into v_label from public.collectible_bids b where b.id = c.leading_bid_id;
  end if;
  insert into public.collectible_results (collectible_id, outcome, winner_user_id, winning_bid_id, final_cents, claim_status)
  values (c.id, case when c.leading_bid_id is null then 'no_bids' else 'won' end, v_owner, c.leading_bid_id,
          c.current_cents, case when v_owner is null then 'none' else 'pending_payment' end)
  on conflict (collectible_id) do nothing;
  update public.collectibles set status = 'ended', finalized_at = now(), winner_label = v_label where id = c.id;
  return true;
end $$;
revoke execute on function public.collectible_finalize_row(uuid) from public, anon, authenticated;
grant execute on function public.collectible_finalize_row(uuid) to service_role;

-- Chamado pelo app ao abrir um item encerrado (qualquer pessoa logada): só aplica o que o relógio já decidiu.
create or replace function public.collectible_finalize(p_collectible uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now boolean; c public.collectibles%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_now := public.collectible_finalize_row(p_collectible);
  select * into c from public.collectibles where id = p_collectible;
  if not found or (c.status = 'draft' and not public.is_admin()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('finalized_now', v_now, 'status', c.status, 'final_cents', c.current_cents,
    'winner_label', c.winner_label, 'finalized_at', c.finalized_at);
end $$;
revoke execute on function public.collectible_finalize(uuid) from public, anon;
grant execute on function public.collectible_finalize(uuid) to authenticated, service_role;

-- Rotina diária (service role): encerra todos os vencidos.
create or replace function public.collectible_finalize_due()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in select id from public.collectibles
           where status in ('scheduled', 'live') and finalized_at is null and ends_at <= now()
  loop
    if public.collectible_finalize_row(r.id) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.collectible_finalize_due() from public, anon, authenticated;
grant execute on function public.collectible_finalize_due() to service_role;

-- ---------------------------------------------------------------- 7) pagamento simulado do vencedor
-- Cria um pedido de teste comum (operação própria), aparece em Minhas compras. Idempotente.
create or replace function public.collectible_pay(p_collectible uuid, p_destination uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); r public.collectible_results%rowtype; c public.collectibles%rowtype;
  v_dest public.demo_destinations%rowtype; v_seller public.seller_organizations%rowtype;
  v_order uuid; v_f uuid; v_shipping int; v_eta int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  perform public.collectible_finalize_row(p_collectible);
  select * into r from public.collectible_results where collectible_id = p_collectible for update;
  if not found or r.winner_user_id is distinct from v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.claim_status = 'paid' and r.order_id is not null then return r.order_id; end if;
  if coalesce((public.setting('commerce.enabled'))::boolean, true) is false then raise exception 'commerce_disabled'; end if;
  select * into v_dest from public.demo_destinations where id = p_destination and is_active;
  if not found then raise exception 'invalid_destination'; end if;
  select * into c from public.collectibles where id = p_collectible;
  select * into v_seller from public.seller_organizations where kind = 'own' and status = 'active'
    order by (id = public.seed_uuid('seller:own')) desc, created_at limit 1;
  if not found then raise exception 'seller_unavailable'; end if;

  v_shipping := coalesce(public.quote_shipping(v_dest.zone, 1, r.final_cents), 0);
  select eta_days_max into v_eta from public.demo_shipping_rules where zone = v_dest.zone;

  insert into public.test_orders (user_id, destination_snapshot, subtotal_cents, shipping_cents, total_cents)
  values (v_uid, jsonb_build_object('id', v_dest.id, 'code', v_dest.code, 'name', v_dest.name, 'zone', v_dest.zone, 'fictional', true),
          r.final_cents, v_shipping, r.final_cents + v_shipping)
  returning id into v_order;
  insert into public.test_fulfillments (order_id, seller_org_id, seller_name_snapshot, shipping_cents_snapshot, destination_zone, eta_days)
  values (v_order, v_seller.id, v_seller.name, v_shipping, v_dest.zone, v_eta)
  returning id into v_f;
  insert into public.fulfillment_events (fulfillment_id, from_status, to_status, actor_type, actor_id, note)
  values (v_f, null, 'awaiting', 'system', null, 'collectible_won');
  insert into public.test_order_items (order_id, fulfillment_id, product_id, seller_org_id, title_snapshot, image_snapshot, price_cents_snapshot, quantity)
  values (v_order, v_f, null, v_seller.id, c.title, c.photos[1], r.final_cents, 1);

  update public.collectible_results set claim_status = 'paid', order_id = v_order, paid_at = now() where collectible_id = p_collectible;
  return v_order;
end $$;
revoke execute on function public.collectible_pay(uuid, uuid) from public, anon;
grant execute on function public.collectible_pay(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 8) admin (auditado)
-- Cria/edita. Antes de começar (rascunho/agendado sem lances) tudo é editável; depois, só textos e fotos.
create or replace function public.admin_collectible_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.collectibles%rowtype; v_id uuid; v_phase text;
  v_title text := btrim(coalesce(p_data ->> 'title', ''));
  v_creator uuid := nullif(p_data ->> 'creator_id', '')::uuid;
  v_photos text[] := coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p_data -> 'photos', '[]')) x where btrim(x) <> ''), '{}');
  v_incs int[] := coalesce(array(select (x)::int from jsonb_array_elements_text(coalesce(p_data -> 'bid_increments_cents', '[]')) x), '{}');
  v_price int := (p_data ->> 'start_price_cents')::int;
  v_duration int := (p_data ->> 'duration_minutes')::int;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from unnest(v_photos) u where char_length(u) > 500 or not (u ~ '^(/|https://)')) then
    raise exception 'invalid_photo' using errcode = '22023';
  end if;
  if cardinality(v_incs) <> (select count(distinct x) from unnest(v_incs) x) then raise exception 'invalid_increment' using errcode = '22023'; end if;
  v_incs := array(select x from unnest(v_incs) x order by x);
  if v_creator is not null and not exists (select 1 from public.creator_profiles where id = v_creator) then
    raise exception 'invalid_creator' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.collectibles (title, description, creator_id, photos, authenticity_note, start_price_cents,
      bid_increments_cents, duration_minutes, current_cents)
    values (v_title, coalesce(p_data ->> 'description', ''), v_creator, v_photos, coalesce(p_data ->> 'authenticity_note', ''),
      v_price, v_incs, v_duration, v_price)
    returning id into v_id;
    perform public.audit_log('collectible.create', 'collectible', v_id::text, null,
      (select to_jsonb(x) from public.collectibles x where x.id = v_id), null);
    return v_id;
  end if;

  select * into c from public.collectibles where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_phase := public.collectible_phase(c.status, c.starts_at, c.ends_at);
  if v_phase in ('draft', 'scheduled') and c.bids_count = 0 then
    update public.collectibles set title = v_title, description = coalesce(p_data ->> 'description', ''), creator_id = v_creator,
      photos = v_photos, authenticity_note = coalesce(p_data ->> 'authenticity_note', ''), start_price_cents = v_price,
      bid_increments_cents = v_incs, duration_minutes = v_duration, current_cents = v_price,
      ends_at = case when c.status = 'scheduled' then c.starts_at + make_interval(mins => v_duration) else c.ends_at end
    where id = p_id;
  else
    -- já começou: preço, incrementos e tempo ficam travados
    if v_price is distinct from c.start_price_cents or v_incs is distinct from c.bid_increments_cents
       or v_duration is distinct from c.duration_minutes then
      raise exception 'collectible_locked' using errcode = 'P0001';
    end if;
    update public.collectibles set title = v_title, description = coalesce(p_data ->> 'description', ''), creator_id = v_creator,
      photos = v_photos, authenticity_note = coalesce(p_data ->> 'authenticity_note', '')
    where id = p_id;
  end if;
  perform public.audit_log('collectible.update', 'collectible', p_id::text, to_jsonb(c),
    (select to_jsonb(x) from public.collectibles x where x.id = p_id), null);
  return p_id;
end $$;
revoke execute on function public.admin_collectible_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_collectible_save(uuid, jsonb) to authenticated, service_role;

-- Lança (agora ou agendado). Também reagenda um item agendado que ainda não começou.
create or replace function public.admin_collectible_launch(p_id uuid, p_starts_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.collectibles%rowtype; v_start timestamptz := coalesce(p_starts_at, now()); v_phase text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.collectibles where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_phase := public.collectible_phase(c.status, c.starts_at, c.ends_at);
  if v_phase not in ('draft', 'scheduled') or c.bids_count > 0 then raise exception 'collectible_locked' using errcode = 'P0001'; end if;
  -- até 1 min no passado conta como "agora" (relógio do celular do admin)
  if v_start < now() - interval '1 minute' then raise exception 'invalid_start' using errcode = '22023'; end if;
  v_start := greatest(v_start, now());
  update public.collectibles
     set status = case when v_start <= now() then 'live' else 'scheduled' end,
         starts_at = v_start, ends_at = v_start + make_interval(mins => c.duration_minutes),
         current_cents = c.start_price_cents, cancelled_at = null
   where id = p_id;
  perform public.audit_log('collectible.launch', 'collectible', p_id::text, to_jsonb(c),
    (select to_jsonb(x) from public.collectibles x where x.id = p_id), null);
  return (select jsonb_build_object('status', x.status, 'starts_at', x.starts_at, 'ends_at', x.ends_at) from public.collectibles x where x.id = p_id);
end $$;
revoke execute on function public.admin_collectible_launch(uuid, timestamptz) from public, anon;
grant execute on function public.admin_collectible_launch(uuid, timestamptz) to authenticated, service_role;

-- Cancela (rascunho, agendado ou ao vivo); encerrado não volta atrás. Justificativa obrigatória.
create or replace function public.admin_collectible_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.collectibles%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into c from public.collectibles where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.collectible_phase(c.status, c.starts_at, c.ends_at) in ('ended', 'cancelled') then
    raise exception 'collectible_locked' using errcode = 'P0001';
  end if;
  -- rascunho não tem janela: ganha uma mínima só para cumprir a regra da tabela
  update public.collectibles set status = 'cancelled', cancelled_at = now(),
    starts_at = coalesce(starts_at, now()), ends_at = coalesce(ends_at, now() + interval '1 second')
   where id = p_id;
  perform public.audit_log('collectible.cancel', 'collectible', p_id::text, to_jsonb(c),
    (select to_jsonb(x) from public.collectibles x where x.id = p_id), btrim(p_reason));
end $$;
revoke execute on function public.admin_collectible_cancel(uuid, text) from public, anon;
grant execute on function public.admin_collectible_cancel(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 9) Realtime
-- Só as duas tabelas públicas (sem ids de usuário). A RLS vale também para o Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'collectibles') then
      alter publication supabase_realtime add table public.collectibles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'collectible_bids') then
      alter publication supabase_realtime add table public.collectible_bids;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- 10) seed de DEMONSTRAÇÃO (rascunho)
-- Nunca começa sozinho: o admin revisa e lança. Reaplicar não sobrescreve edição do admin.
insert into public.collectibles (id, title, description, creator_id, photos, authenticity_note, start_price_cents,
  bid_increments_cents, duration_minutes, current_cents, is_demo)
select public.seed_uuid('collectible:' || s.key), s.title, s.description,
       (select cp.id from public.creator_profiles cp where cp.slug = s.hero),
       array[s.photo], s.authenticity, s.price, '{1000,5000,10000}', s.duration, s.price, true
from (values
  ('bola-neymar', 'neymar', 'Bola de futebol assinada por Neymar',
   'Item de demonstração. Bola oficial de jogo com assinatura à mão do Neymar, guardada em expositor de acrílico.',
   'Demonstração: no item real, certificado de autenticidade numerado e foto da assinatura entregues junto.',
   '/collectibles/ball.svg', 150000, 1440),
  ('prancha-medina', 'gabriel-medina', 'Prancha de surf assinada por Gabriel Medina',
   'Item de demonstração. Prancha shortboard usada em treino, assinada pelo Gabriel Medina.',
   'Demonstração: no item real, certificado de autenticidade e registro do treino em que foi usada.',
   '/collectibles/board.svg', 300000, 2880),
  ('bermuda-medina', 'gabriel-medina', 'Bermuda de surf assinada por Gabriel Medina',
   'Item de demonstração. Bermuda de surf assinada pelo Gabriel Medina, em moldura.',
   'Demonstração: no item real, certificado de autenticidade com número de série.',
   '/collectibles/boardshorts.svg', 80000, 1440),
  ('camisa-ronaldinho', 'ronaldinho-gaucho', 'Camisa assinada por Ronaldinho Gaúcho',
   'Item de demonstração. Camisa de futebol autografada pelo Ronaldinho Gaúcho.',
   'Demonstração: no item real, certificado de autenticidade e foto do momento da assinatura.',
   '/collectibles/shirt.svg', 120000, 1440)
) as s (key, hero, title, description, authenticity, photo, price, duration)
on conflict (id) do nothing;

-- O PostgREST passa a enxergar as tabelas e funções novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
