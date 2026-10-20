-- =============================================================================
-- Ultra Hero · 0010 · Guardas de coluna vs. funções confiáveis
-- Funções security definer que agem em nome do usuário (aceitar convite, concluir
-- programa, excluir conta, reinscrição) precisam alterar colunas protegidas.
-- Elas ligam o sinalizador transacional app.trusted; o cliente da API não consegue
-- (set_config não é exposto pelo PostgREST). Os guards respeitam o sinalizador.
-- =============================================================================

create or replace function public.is_trusted_call()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.trusted', true), 'off') = 'on'
$$;

create or replace function public.guard_protected_columns()
returns trigger language plpgsql as $$
declare allowed text[] := tg_argv[0]::text[]; a jsonb; b jsonb; k text;
begin
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  a := to_jsonb(old); b := to_jsonb(new);
  for k in select jsonb_object_keys(a) loop
    if k = any (allowed) or k in ('updated_at', 'search', 'version') then continue; end if;
    if a -> k is distinct from b -> k then
      raise exception 'protected_column: %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create or replace function public.content_creator_edit_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if old.status <> 'draft' or old.review_status = 'in_review' then
    raise exception 'content_not_editable' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.enrollment_status_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if not (old.status = 'active' and new.status = 'abandoned') then
    raise exception 'invalid_enrollment_transition' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- funções confiáveis
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.invitations%rowtype; v_email text; v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_inv.status <> 'pending' then raise exception 'invitation_invalid'; end if;
  if v_inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation_expired';
  end if;
  if lower(v_inv.email::text) <> v_email then raise exception 'invitation_email_mismatch'; end if;

  perform set_config('app.trusted', 'on', true);
  if v_inv.role = 'seller' then
    insert into public.seller_memberships (org_id, user_id) values (v_inv.seller_org_id, v_uid)
    on conflict (org_id, user_id) do update set revoked_at = null;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'seller', 'seller_org', v_inv.seller_org_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  else
    update public.creator_profiles set user_id = v_uid
    where id = v_inv.creator_profile_id and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'creator_profile_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'creator', v_inv.creator_profile_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  end if;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform public.audit_log('invitation.accept', 'invitation', v_inv.id::text, null,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid), null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  return jsonb_build_object('role', v_inv.role, 'scope_id', coalesce(v_inv.seller_org_id, v_inv.creator_profile_id));
end $$;

create or replace function public.enroll_program(p_program uuid, p_timezone text default 'UTC')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_version uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select p.current_version_id into v_version from public.programs p
  where p.id = p_program and p.status = 'published';
  if v_version is null then raise exception 'program_unavailable'; end if;
  if exists (select 1 from public.enrollments where user_id = v_uid and program_id = p_program and status = 'active') then
    select id into v_id from public.enrollments where user_id = v_uid and program_id = p_program and status = 'active';
    return v_id;
  end if;
  perform set_config('app.trusted', 'on', true);
  insert into public.enrollments (user_id, program_id, version_id) values (v_uid, p_program, v_version)
  on conflict (user_id, version_id) do update set status = 'active' returning id into v_id;
  perform set_config('app.trusted', 'off', true);
  insert into public.streak_events (user_id, kind, ref_id, timezone, local_date)
  values (v_uid, 'enrollment', p_program, p_timezone, public.local_date_for(p_timezone));
  return v_id;
end $$;

create or replace function public.check_program_completion(p_enrollment uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e public.enrollments%rowtype; v_missing int; v_cert uuid; v_code text; v_snapshot jsonb;
begin
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or e.status <> 'active' then return null; end if;
  select count(*) into v_missing
  from public.program_required_items(e.version_id) r
  where r.is_required
    and not exists (select 1 from public.completions c where c.user_id = e.user_id and c.content_id in (r.content_id, r.original_content_id));
  if v_missing > 0 then return null; end if;

  perform set_config('app.trusted', 'on', true);
  update public.enrollments set status = 'completed', completed_at = now() where id = e.id;
  perform set_config('app.trusted', 'off', true);

  select jsonb_build_object(
    'display_name', coalesce(p.display_name, 'Participante'),
    'program_title', pv.title,
    'program_slug', pr.slug,
    'version', pv.version_no,
    'completed_at', now(),
    'pillar', pr.pillar,
    'fields', pv.certificate_fields,
    'symbolic', true)
  into v_snapshot
  from public.program_versions pv join public.programs pr on pr.id = pv.program_id
  left join public.profiles p on p.id = e.user_id
  where pv.id = e.version_id;

  v_code := 'UH-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
  insert into public.certificates (code, user_id, enrollment_id, program_id, version_id, snapshot)
  values (v_code, e.user_id, e.id, e.program_id, e.version_id, v_snapshot)
  on conflict (enrollment_id) do nothing
  returning id into v_cert;
  return jsonb_build_object('enrollment_id', e.id, 'program_id', e.program_id, 'certificate_id', v_cert, 'code', v_code);
end $$;

create or replace function public.anonymize_user_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.trusted', 'on', true);
  update public.profiles set display_name = 'Usuário removido', avatar_url = null, timezone = null, anonymized_at = now() where id = p_user;
  delete from public.user_interests where user_id = p_user;
  delete from public.not_interested where user_id = p_user;
  delete from public.user_recommendations where user_id = p_user;
  delete from public.favorites where user_id = p_user;
  delete from public.custom_lists where user_id = p_user;
  delete from public.content_progress where user_id = p_user;
  delete from public.cart_items where cart_id in (select id from public.carts where user_id = p_user);
  delete from public.product_interest where user_id = p_user;
  update public.analytics_events set user_id = null, anon_id = null where user_id = p_user;
  update public.feedback set user_id = null where user_id = p_user;
  update public.test_orders set user_id = null, destination_snapshot = destination_snapshot - 'name', anonymized_at = now()
  where user_id = p_user and anonymized_at is null;
  update public.recommendation_runs set user_id = null where user_id = p_user;
  perform set_config('app.trusted', 'off', true);
end $$;

grant execute on function public.is_trusted_call() to anon, authenticated, service_role;

create or replace function public.submit_content_for_review(p_content uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_round int;
begin
  select * into c from public.content where id = p_content for update;
  if not found then raise exception 'content_not_found'; end if;
  if not (public.is_admin() or (c.creator_id is not null and c.creator_id = public.my_creator_id())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'draft' then raise exception 'only_drafts_can_be_submitted'; end if;
  if c.review_status = 'in_review' then raise exception 'already_in_review'; end if;
  if coalesce(c.title, '') = '' or c.pillar is null then raise exception 'content_incomplete'; end if;
  select coalesce(max(round), 0) + 1 into v_round from public.content_reviews where content_id = p_content;
  insert into public.content_reviews (content_id, round, submitted_by) values (p_content, v_round, auth.uid());
  perform set_config('app.trusted', 'on', true);
  update public.content set review_status = 'in_review' where id = p_content;
  perform set_config('app.trusted', 'off', true);
end $$;

-- Correção: concatenação text[] || 'literal' é ambígua no Postgres; usa array_append.
create or replace function public.admin_review_content(p_content uuid, p_decision public.review_status, p_feedback text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_missing text[] := '{}';
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('returned', 'approved', 'rejected') then raise exception 'invalid_decision'; end if;
  select * into c from public.content where id = p_content for update;
  if not found then raise exception 'content_not_found'; end if;

  update public.content_reviews set decision = p_decision, feedback = p_feedback, decided_by = auth.uid(), decided_at = now()
  where content_id = p_content and decision = 'in_review';

  if p_decision = 'approved' then
    if c.access_level is null then v_missing := array_append(v_missing, 'access_level'); end if;
    if not exists (select 1 from public.content_bodies b where b.content_id = p_content) then v_missing := array_append(v_missing, 'body'); end if;
    if cardinality(v_missing) > 0 then raise exception 'cannot_publish_missing: %', array_to_string(v_missing, ','); end if;
    update public.content set status = 'published', review_status = 'approved', published_at = coalesce(published_at, now()) where id = p_content;
  else
    update public.content set review_status = p_decision where id = p_content;
  end if;
  perform public.audit_log('content.review', 'content', p_content::text, jsonb_build_object('status', c.status, 'review_status', c.review_status),
    jsonb_build_object('decision', p_decision), p_feedback);
end $$;

-- Correção: div() retorna numeric; o helper espera int.
create or replace function public.checkout_cart(p_destination uuid, p_expected jsonb default '[]'::jsonb, p_accept_changes boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_issues jsonb; v_dest public.demo_destinations%rowtype; v_order uuid; v_cart uuid;
        v_subtotal int := 0; v_sellers int; v_shipping int; v_eta int; r record;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if coalesce((public.setting('commerce.enabled'))::boolean, true) is false then raise exception 'commerce_disabled'; end if;
  select * into v_dest from public.demo_destinations where id = p_destination and is_active;
  if not found then raise exception 'invalid_destination'; end if;

  select id into v_cart from public.carts where user_id = v_uid for update;
  if v_cart is null or not exists (select 1 from public.cart_items where cart_id = v_cart) then
    raise exception 'cart_empty';
  end if;

  v_issues := public.cart_validate(p_expected);
  if jsonb_array_length(v_issues) > 0 then
    if exists (select 1 from jsonb_array_elements(v_issues) e where e ->> 'issue' <> 'price_changed') or not p_accept_changes then
      raise exception 'cart_changed: %', v_issues::text using errcode = 'P0001';
    end if;
  end if;

  select sum(p.price_cents_demo * ci.quantity), count(distinct p.seller_org_id) into v_subtotal, v_sellers
  from public.cart_items ci join public.products p on p.id = ci.product_id where ci.cart_id = v_cart;
  v_shipping := coalesce(public.quote_shipping(v_dest.zone, v_sellers, v_subtotal), 0);
  select eta_days_max into v_eta from public.demo_shipping_rules where zone = v_dest.zone;

  insert into public.test_orders (user_id, destination_snapshot, subtotal_cents, shipping_cents, total_cents)
  values (v_uid, jsonb_build_object('id', v_dest.id, 'code', v_dest.code, 'name', v_dest.name, 'zone', v_dest.zone, 'fictional', true),
          v_subtotal, v_shipping, v_subtotal + v_shipping)
  returning id into v_order;

  for r in
    select p.seller_org_id, o.name as seller_name
    from public.cart_items ci join public.products p on p.id = ci.product_id join public.seller_organizations o on o.id = p.seller_org_id
    where ci.cart_id = v_cart group by p.seller_org_id, o.name
  loop
    perform public.checkout_create_fulfillment(v_order, v_uid, r.seller_org_id, r.seller_name,
      (case when v_sellers > 0 then v_shipping / v_sellers else 0 end)::int, v_dest.zone, v_eta);
  end loop;

  delete from public.cart_items where cart_id = v_cart;
  return v_order;
end $$;

-- Correção: CASE com literais vira text; cast explícito para o enum.
create or replace function public.advance_simulated_transport(p_minutes_per_step int default 10)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; v_next public.fulfillment_status;
begin
  for r in select id, status, order_id from public.test_fulfillments
           where status in ('ready_for_dispatch', 'in_transit') and updated_at < now() - make_interval(mins => p_minutes_per_step)
  loop
    v_next := case when r.status = 'ready_for_dispatch' then 'in_transit'::public.fulfillment_status else 'delivered'::public.fulfillment_status end;
    update public.test_fulfillments set status = v_next where id = r.id;
    insert into public.fulfillment_events (fulfillment_id, from_status, to_status, actor_type, note)
    values (r.id, r.status, v_next, 'system', 'simulated_transport');
    perform public.recompute_order_status(r.order_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Correção: concluir um conteúdo SUBSTITUTO também precisa reavaliar os programas.
create or replace function public.complete_content(p_content uuid, p_timezone text, p_source text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_date date; v_new boolean := false; v_programs jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.can_access_content(p_content) then raise exception 'content_forbidden' using errcode = '42501'; end if;
  v_date := public.local_date_for(p_timezone);

  insert into public.completions (user_id, content_id, source, timezone, local_date)
  values (v_uid, p_content, p_source, p_timezone, v_date)
  on conflict (user_id, content_id) do nothing;
  if found then
    v_new := true;
    insert into public.streak_events (user_id, kind, ref_id, timezone, local_date)
    values (v_uid, 'completion', p_content, p_timezone, v_date);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_programs
    from (select public.check_program_completion(e.id) as x
          from public.enrollments e
          where e.user_id = v_uid and e.status = 'active'
            and exists (select 1 from public.program_required_items(e.version_id) r
                        where r.content_id = p_content or r.original_content_id = p_content)) t
    where x is not null;
  end if;
  return jsonb_build_object('new', v_new, 'streak', public.compute_streak(v_uid, p_timezone),
    'achievements', (select coalesce(jsonb_agg(c), '[]'::jsonb) from public.evaluate_achievements(v_uid, p_timezone) c),
    'programs_completed', v_programs);
end $$;

-- Correção: subselect com UNION ALL retornava 2 linhas.
create or replace function public.admin_metrics(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb; v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'window_days', p_days,
    'signups', (select count(*) from auth.users where created_at >= v_since),
    'signups_total', (select count(*) from auth.users),
    'activated_users_distinct', (select count(*) from (select user_id from public.completions union select user_id from public.content_progress) t),
    'content_views', (select count(*) from public.analytics_events where event_name = 'content.view' and created_at >= v_since),
    'completions', (select count(*) from public.completions where completed_at >= v_since),
    'enrollments', (select count(*) from public.enrollments where enrolled_at >= v_since),
    'favorites', (select count(*) from public.favorites where created_at >= v_since),
    'subscription_interest', (select count(*) from public.subscription_events where event in ('created', 'modules_changed', 'resumed', 'reactivated') and created_at >= v_since),
    'active_simulated_subscriptions', (select count(*) from public.simulated_subscriptions where status in ('active', 'cancelled') and current_period_end > now()),
    'commercial_interest', (select count(*) from public.product_interest where created_at >= v_since),
    'cart_adds', (select count(*) from public.analytics_events where event_name = 'cart.add' and created_at >= v_since),
    'test_orders', (select count(*) from public.test_orders where created_at >= v_since),
    'test_orders_total_cents_demo', (select coalesce(sum(total_cents), 0) from public.test_orders where created_at >= v_since),
    'real_revenue_cents', 0,
    'recommendation_runs', (select count(*) from public.recommendation_runs where created_at >= v_since),
    'recommendation_fallback_share', (select coalesce(avg(case when engine = 'deterministic' then 1 else 0 end), 0) from public.recommendation_runs where created_at >= v_since),
    'feedback', (select count(*) from public.feedback where created_at >= v_since),
    'critical_errors', (select count(*) from public.analytics_events where event_name = 'error.critical' and created_at >= v_since),
    'events_by_name', (select coalesce(jsonb_object_agg(event_name, n), '{}'::jsonb) from (select event_name, count(*) n from public.analytics_events where created_at >= v_since group by 1) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'signups', s, 'events', e) order by d), '[]'::jsonb)
              from (select d::date as d,
                      (select count(*) from auth.users u where u.created_at::date = d::date) s,
                      (select count(*) from public.analytics_events a where a.created_at::date = d::date) e
                    from generate_series((now() - make_interval(days => greatest(p_days, 1) - 1))::date, now()::date, interval '1 day') d) t)
  ) into v;
  return v;
end $$;
