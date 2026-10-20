-- =============================================================================
-- Ultra Hero · 0005 · Comércio demonstrativo: funções (carrinho, checkout, remessas)
-- =============================================================================

-- ---------------------------------------------------------------- carrinho: funções
create or replace function public.cart_set_item(p_product uuid, p_quantity int)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cart uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  insert into public.carts (user_id) values (v_uid) on conflict (user_id) do update set updated_at = now() returning id into v_cart;
  if p_quantity <= 0 then
    delete from public.cart_items where cart_id = v_cart and product_id = p_product;
    return;
  end if;
  if not public.product_is_purchasable(p_product) then raise exception 'product_not_purchasable'; end if;
  insert into public.cart_items (cart_id, product_id, quantity) values (v_cart, p_product, least(p_quantity, 20))
  on conflict (cart_id, product_id) do update set quantity = excluded.quantity;
end $$;

-- Revalida carrinho: devolve itens com problema (indisponível/suspenso/preço alterado).
create or replace function public.cart_validate(p_expected jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_issues jsonb := '[]'::jsonb; r record; v_expected int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  for r in
    select ci.product_id, ci.quantity, p.title, p.price_cents_demo, p.status, p.availability, p.moderation_status, p.demo_stock, o.status as seller_status
    from public.cart_items ci join public.carts c on c.id = ci.cart_id
    join public.products p on p.id = ci.product_id join public.seller_organizations o on o.id = p.seller_org_id
    where c.user_id = v_uid
  loop
    if r.status <> 'published' or r.moderation_status <> 'clear' or r.seller_status <> 'active' then
      v_issues := v_issues || jsonb_build_object('product_id', r.product_id, 'title', r.title, 'issue', 'unavailable_or_suspended');
    elsif r.availability <> 'available' or (r.demo_stock is not null and r.demo_stock < r.quantity) then
      v_issues := v_issues || jsonb_build_object('product_id', r.product_id, 'title', r.title, 'issue', 'out_of_stock');
    else
      select (e ->> 'price_cents')::int into v_expected from jsonb_array_elements(p_expected) e where (e ->> 'product_id')::uuid = r.product_id;
      if v_expected is not null and v_expected <> r.price_cents_demo then
        v_issues := v_issues || jsonb_build_object('product_id', r.product_id, 'title', r.title, 'issue', 'price_changed', 'old_price', v_expected, 'new_price', r.price_cents_demo);
      end if;
    end if;
  end loop;
  return v_issues;
end $$;

create or replace function public.quote_shipping(p_zone text, p_seller_count int, p_subtotal int)
returns int language sql stable security definer set search_path = public as $$
  select case when r.free_over_cents is not null and p_subtotal >= r.free_over_cents then 0
              else r.base_cents + r.per_seller_cents * greatest(0, p_seller_count - 1) end
  from public.demo_shipping_rules r where r.zone = p_zone
$$;

-- Checkout demonstrativo: revalida, congela snapshots, cria remessas por fornecedor.
create or replace function public.checkout_cart(p_destination uuid, p_expected jsonb default '[]'::jsonb, p_accept_changes boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_issues jsonb; v_dest public.demo_destinations%rowtype; v_order uuid;
        v_subtotal int := 0; v_sellers int; v_shipping int; v_eta int; r record; v_f uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if coalesce((public.setting('commerce.enabled'))::boolean, true) is false then raise exception 'commerce_disabled'; end if;
  select * into v_dest from public.demo_destinations where id = p_destination and is_active;
  if not found then raise exception 'invalid_destination'; end if;

  -- bloqueia linhas do carrinho para evitar corrida
  perform 1 from public.carts where user_id = v_uid for update;
  if not exists (select 1 from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = v_uid) then
    raise exception 'cart_empty';
  end if;

  v_issues := public.cart_validate(p_expected);
  if jsonb_array_length(v_issues) > 0 then
    if exists (select 1 from jsonb_array_elements(v_issues) e where e ->> 'issue' <> 'price_changed') or not p_accept_changes then
      raise exception 'cart_changed: %', v_issues::text using errcode = 'P0001';
    end if;
  end if;

  select sum(p.price_cents_demo * ci.quantity), count(distinct p.seller_org_id) into v_subtotal, v_sellers
  from public.cart_items ci join public.carts c on c.id = ci.cart_id join public.products p on p.id = ci.product_id
  where c.user_id = v_uid;
  v_shipping := coalesce(public.quote_shipping(v_dest.zone, v_sellers, v_subtotal), 0);
  select eta_days_max into v_eta from public.demo_shipping_rules where zone = v_dest.zone;

  insert into public.test_orders (user_id, destination_snapshot, subtotal_cents, shipping_cents, total_cents)
  values (v_uid, jsonb_build_object('id', v_dest.id, 'code', v_dest.code, 'name', v_dest.name, 'zone', v_dest.zone, 'fictional', true),
          v_subtotal, v_shipping, v_subtotal + v_shipping)
  returning id into v_order;

  for r in
    select p.seller_org_id, o.name as seller_name, sum(p.price_cents_demo * ci.quantity) as seller_subtotal
    from public.cart_items ci join public.carts c on c.id = ci.cart_id
    join public.products p on p.id = ci.product_id join public.seller_organizations o on o.id = p.seller_org_id
    where c.user_id = v_uid group by p.seller_org_id, o.name
  loop
    insert into public.test_fulfillments (order_id, seller_org_id, seller_name_snapshot, shipping_cents_snapshot, destination_zone, eta_days)
    values (v_order, r.seller_org_id, r.seller_name, case when v_sellers > 0 then v_shipping / v_sellers else 0 end, v_dest.zone, v_eta)
    returning id into v_f;
    insert into public.fulfillment_events (fulfillment_id, from_status, to_status, actor_type, actor_id, note)
    values (v_f, null, 'awaiting', 'system', null, 'demo_order_confirmed');

    insert into public.test_order_items (order_id, fulfillment_id, product_id, seller_org_id, title_snapshot, image_snapshot, price_cents_snapshot, quantity, product_version_snapshot)
    select v_order, v_f, p.id, p.seller_org_id, p.title, p.image_url, p.price_cents_demo, ci.quantity, p.version
    from public.cart_items ci join public.carts c on c.id = ci.cart_id join public.products p on p.id = ci.product_id
    where c.user_id = v_uid and p.seller_org_id = r.seller_org_id;

    -- estoque demonstrativo (consistente, sem reserva real)
    update public.products p set demo_stock = p.demo_stock - ci.quantity
    from public.cart_items ci join public.carts c on c.id = ci.cart_id
    where c.user_id = v_uid and p.id = ci.product_id and p.seller_org_id = r.seller_org_id and p.demo_stock is not null;
  end loop;

  delete from public.cart_items where cart_id = (select id from public.carts where user_id = v_uid);
  return v_order;
end $$;

-- Máquina de estados: fornecedor só até "pronto para expedição"; sistema cuida do transporte.
create or replace function public.fulfillment_transition(p_fulfillment uuid, p_to public.fulfillment_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.test_fulfillments%rowtype; v_actor public.actor_type; v_allowed boolean := false; v_order uuid;
begin
  select * into f from public.test_fulfillments where id = p_fulfillment for update;
  if not found then raise exception 'fulfillment_not_found'; end if;

  v_actor := case when auth.uid() is null then 'system' when public.is_admin() then 'admin'
                  when public.is_seller_of(f.seller_org_id) then 'seller' else null end;
  if v_actor is null then raise exception 'forbidden' using errcode = '42501'; end if;

  v_allowed := case v_actor
    when 'seller' then (f.status, p_to) in (('awaiting', 'preparing'), ('preparing', 'ready_for_dispatch'), ('awaiting', 'cancelled'), ('preparing', 'cancelled'))
    when 'system' then (f.status, p_to) in (('ready_for_dispatch', 'in_transit'), ('in_transit', 'delivered'), ('in_transit', 'failed'))
    when 'admin' then (f.status, p_to) in (('awaiting', 'preparing'), ('preparing', 'ready_for_dispatch'), ('ready_for_dispatch', 'in_transit'),
                                           ('in_transit', 'delivered'), ('in_transit', 'failed'), ('awaiting', 'cancelled'), ('preparing', 'cancelled'), ('ready_for_dispatch', 'cancelled'))
    else false end;
  if not v_allowed then raise exception 'invalid_transition: % -> % by %', f.status, p_to, v_actor; end if;

  update public.test_fulfillments set status = p_to where id = f.id;
  insert into public.fulfillment_events (fulfillment_id, from_status, to_status, actor_type, actor_id, note)
  values (f.id, f.status, p_to, v_actor, auth.uid(), p_note);
  perform public.recompute_order_status(f.order_id);
end $$;

create or replace function public.recompute_order_status(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total int; v_delivered int; v_terminal int; v_cancelled int; v_failed int; v_status public.order_status;
begin
  select count(*), count(*) filter (where status = 'delivered'), count(*) filter (where status in ('delivered', 'cancelled', 'failed')),
         count(*) filter (where status = 'cancelled'), count(*) filter (where status = 'failed')
  into v_total, v_delivered, v_terminal, v_cancelled, v_failed from public.test_fulfillments where order_id = p_order;
  if v_total = 0 then return; end if;
  v_status := case
    when v_terminal < v_total then (case when v_delivered + v_cancelled + v_failed > 0 or exists (select 1 from public.test_fulfillments where order_id = p_order and status <> 'awaiting') then 'in_progress' else 'confirmed' end)
    when v_delivered = v_total then 'completed'
    when v_cancelled = v_total then 'cancelled'
    when v_failed = v_total then 'failed'
    else 'partially_completed' end;
  update public.test_orders set status = v_status, completed_at = case when v_status in ('completed', 'partially_completed', 'cancelled', 'failed') then now() else null end
  where id = p_order;
end $$;

-- Simulação de transporte pelo sistema (cron): expedido -> em trânsito -> entregue.
create or replace function public.advance_simulated_transport(p_minutes_per_step int default 10)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in select id, status, updated_at from public.test_fulfillments
           where status in ('ready_for_dispatch', 'in_transit') and updated_at < now() - make_interval(mins => p_minutes_per_step)
  loop
    update public.test_fulfillments set status = case r.status when 'ready_for_dispatch' then 'in_transit' else 'delivered' end where id = r.id;
    insert into public.fulfillment_events (fulfillment_id, from_status, to_status, actor_type, note)
    values (r.id, r.status, case r.status when 'ready_for_dispatch' then 'in_transit' else 'delivered' end, 'system', 'simulated_transport');
    perform public.recompute_order_status((select order_id from public.test_fulfillments where id = r.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Consumidor cancela pedido de teste enquanto nada foi expedido.
create or replace function public.cancel_test_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); f record;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.test_orders where id = p_order and (user_id = v_uid or public.is_admin())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.test_fulfillments where order_id = p_order and status in ('ready_for_dispatch', 'in_transit', 'delivered')) then
    raise exception 'order_already_dispatched';
  end if;
  for f in select id, status from public.test_fulfillments where order_id = p_order and status in ('awaiting', 'preparing') loop
    update public.test_fulfillments set status = 'cancelled' where id = f.id;
    insert into public.fulfillment_events (fulfillment_id, from_status, to_status, actor_type, actor_id, note)
    values (f.id, f.status, 'cancelled', case when public.is_admin() then 'admin' else 'consumer' end, v_uid, 'cancelled_by_customer');
  end loop;
  perform public.recompute_order_status(p_order);
end $$;

grant execute on function public.product_is_purchasable(uuid), public.quote_shipping(text, int, int) to anon, authenticated;
grant execute on function public.cart_set_item(uuid, int), public.cart_validate(jsonb), public.checkout_cart(uuid, jsonb, boolean),
  public.fulfillment_transition(uuid, public.fulfillment_status, text), public.cancel_test_order(uuid),
  public.admin_moderate_product(uuid, text, text), public.admin_set_link_status(uuid, public.link_status, text) to authenticated;
revoke execute on function public.recompute_order_status(uuid), public.advance_simulated_transport(int) from public, anon, authenticated;
