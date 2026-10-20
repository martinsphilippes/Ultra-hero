-- =============================================================================
-- Ultra Hero · 0006 · RLS em todas as tabelas + guardas de colunas + funções admin
-- Princípios: negar por padrão; consumidor só vê o que é seu; criador só o próprio
-- conteúdo; fornecedor só sua operação; admin governa tudo. Escritas sensíveis
-- passam por funções security definer (auditadas).
-- =============================================================================

-- ---------------------------------------------------------------- guarda genérica de colunas
-- Uso: trigger ... execute function guard_protected_columns('{col_a,col_b}')
-- Não-admins só podem alterar as colunas listadas. Service role (auth.uid() null) passa.
create or replace function public.guard_protected_columns()
returns trigger language plpgsql as $$
declare allowed text[] := tg_argv[0]::text[]; a jsonb; b jsonb; k text;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  a := to_jsonb(old); b := to_jsonb(new);
  for k in select jsonb_object_keys(a) loop
    if k = any (allowed) or k in ('updated_at', 'search', 'version') then continue; end if;
    if a -> k is distinct from b -> k then
      raise exception 'protected_column: %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger trg_a_profiles_guard before update on public.profiles
  for each row execute function public.guard_protected_columns('{display_name,avatar_url,locale,theme,timezone,onboarding_completed}');
create trigger trg_a_creator_profiles_guard before update on public.creator_profiles
  for each row execute function public.guard_protected_columns('{headline,bio,avatar_url,cover_url,socials}');
create trigger trg_a_seller_orgs_guard before update on public.seller_organizations
  for each row execute function public.guard_protected_columns('{description,logo_url}');
create trigger trg_a_content_guard before update on public.content
  for each row execute function public.guard_protected_columns('{title,summary,cover_url,duration_minutes,difficulty,tags,has_captions,pillar,type,source_locale,disclaimer_kind}');
create trigger trg_a_products_guard before update on public.products
  for each row execute function public.guard_protected_columns('{category_id,title,description,image_url,price_cents_demo,product_type,attributes,food_info,status,availability,demo_stock,published_at,archived_at}');
create trigger trg_a_enrollments_guard before update on public.enrollments
  for each row execute function public.guard_protected_columns('{status}');

-- criador só edita rascunho próprio (não em revisão)
create or replace function public.content_creator_edit_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if old.status <> 'draft' or old.review_status = 'in_review' then
    raise exception 'content_not_editable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_b_content_creator_edit before update on public.content
  for each row execute function public.content_creator_edit_guard();

-- participante só pode abandonar (active -> abandoned)
create or replace function public.enrollment_status_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if not (old.status = 'active' and new.status = 'abandoned') then
    raise exception 'invalid_enrollment_transition' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_b_enrollment_status before update on public.enrollments
  for each row execute function public.enrollment_status_guard();

-- ---------------------------------------------------------------- habilitar RLS
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- settings / auditoria
create policy app_settings_admin_all on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_audit_admin_select on public.admin_audit for select to authenticated using (public.is_admin());
create policy retention_jobs_admin on public.retention_jobs for select to authenticated using (public.is_admin());
create policy retention_exceptions_admin on public.retention_exceptions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy account_deletion_admin on public.account_deletion_requests for select to authenticated using (public.is_admin());

-- configurações públicas (apenas chaves não sensíveis)
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('commerce.enabled', 'ai.enabled', 'experiment.open', 'ai.provider', 'video.provider')
$$;
revoke execute on function public.setting(text) from public, anon, authenticated;
grant execute on function public.public_settings() to anon, authenticated;

-- ---------------------------------------------------------------- identidade
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy roles_select_own on public.role_assignments for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy creators_select_public on public.creator_profiles for select to anon, authenticated
  using (status = 'active' or user_id = auth.uid() or public.is_admin());
create policy creators_update_own on public.creator_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy creators_admin_insert on public.creator_profiles for insert to authenticated with check (public.is_admin());
create policy creators_admin_delete on public.creator_profiles for delete to authenticated using (public.is_admin());

create policy sellers_select_public on public.seller_organizations for select to anon, authenticated
  using (status = 'active' or public.is_seller_of(id) or public.is_admin());
create policy sellers_update_member on public.seller_organizations for update to authenticated
  using (public.is_seller_of(id) or public.is_admin()) with check (public.is_seller_of(id) or public.is_admin());
create policy sellers_admin_insert on public.seller_organizations for insert to authenticated with check (public.is_admin());

create policy memberships_select_own on public.seller_memberships for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy memberships_admin_write on public.seller_memberships for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy invitations_admin_select on public.invitations for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- planos
create policy plan_modules_select on public.plan_modules for select to anon, authenticated using (true);
create policy plan_modules_admin on public.plan_modules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy module_deps_select on public.module_dependencies for select to anon, authenticated using (true);
create policy module_deps_admin on public.module_dependencies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy plans_select on public.plans for select to anon, authenticated using (true);
create policy plans_admin on public.plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy plan_bundle_select on public.plan_bundle_modules for select to anon, authenticated using (true);
create policy plan_bundle_admin on public.plan_bundle_modules for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy subs_select_own on public.simulated_subscriptions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy sub_modules_select_own on public.subscription_modules for select to authenticated
  using (public.is_admin() or exists (select 1 from public.simulated_subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));
create policy sub_events_select_own on public.subscription_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.simulated_subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));

-- ---------------------------------------------------------------- conteúdo
create policy cts_select on public.content_type_settings for select to anon, authenticated using (true);
create policy cts_admin on public.content_type_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy content_select on public.content for select to anon, authenticated
  using (status = 'published' or public.is_admin() or (creator_id is not null and creator_id = public.my_creator_id()));
create policy content_insert_creator on public.content for insert to authenticated
  with check (public.is_admin() or (creator_id = public.my_creator_id() and status = 'draft' and review_status = 'none'));
create policy content_update on public.content for update to authenticated
  using (public.is_admin() or (creator_id is not null and creator_id = public.my_creator_id()))
  with check (public.is_admin() or (creator_id is not null and creator_id = public.my_creator_id()));
create policy content_delete_admin on public.content for delete to authenticated using (public.is_admin());

create policy content_bodies_select on public.content_bodies for select to authenticated using (public.can_access_content(content_id));
create policy content_bodies_write on public.content_bodies for all to authenticated
  using (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id() and c.status = 'draft'))
  with check (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id() and c.status = 'draft'));

create policy content_loc_select on public.content_localizations for select to anon, authenticated
  using (status = 'published' or public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id()));
create policy content_loc_admin on public.content_localizations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy content_reviews_select on public.content_reviews for select to authenticated
  using (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id()));

-- ---------------------------------------------------------------- programas
create policy programs_select on public.programs for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy programs_admin on public.programs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pv_select on public.program_versions for select to anon, authenticated
  using (public.is_admin() or (status = 'published' and exists (select 1 from public.programs p where p.id = program_id and p.status = 'published'))
         or exists (select 1 from public.enrollments e where e.version_id = id and e.user_id = auth.uid()));
create policy pv_admin on public.program_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pi_select on public.program_items for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.program_versions v where v.id = version_id and v.status = 'published')
         or exists (select 1 from public.enrollments e where e.version_id = version_id and e.user_id = auth.uid()));
create policy pi_admin on public.program_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pis_select on public.program_item_substitutions for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.program_versions v where v.id = version_id and v.status = 'published'));
create policy pis_admin on public.program_item_substitutions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ploc_select on public.program_localizations for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy ploc_admin on public.program_localizations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy enrollments_select_own on public.enrollments for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy enrollments_update_own on public.enrollments for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- progresso / biblioteca
create policy completions_select_own on public.completions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy progress_select_own on public.content_progress for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy streak_select_own on public.streak_events for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy achievements_select on public.achievements for select to anon, authenticated using (true);
create policy achievements_admin on public.achievements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy user_ach_select_own on public.user_achievements for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy certificates_select_own on public.certificates for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy favorites_own on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lists_own on public.custom_lists for all to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy list_items_own on public.list_items for all to authenticated
  using (exists (select 1 from public.custom_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.custom_lists l where l.id = list_id and l.user_id = auth.uid()));

create policy interest_tags_select on public.interest_tags for select to anon, authenticated using (true);
create policy interest_tags_admin on public.interest_tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy user_interests_own on public.user_interests for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy not_interested_own on public.not_interested for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recs_select_own on public.user_recommendations for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy rec_runs_admin on public.recommendation_runs for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- comércio
create policy categories_select on public.product_categories for select to anon, authenticated using (true);
create policy categories_admin on public.product_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy products_select on public.products for select to anon, authenticated
  using ((status = 'published' and moderation_status = 'clear'
          and exists (select 1 from public.seller_organizations o where o.id = seller_org_id and o.status = 'active'))
         or public.is_seller_of(seller_org_id) or public.is_admin());
create policy products_insert_seller on public.products for insert to authenticated
  with check ((public.is_seller_of(seller_org_id) and moderation_status = 'clear') or public.is_admin());
create policy products_update_seller on public.products for update to authenticated
  using (public.is_seller_of(seller_org_id) or public.is_admin())
  with check (public.is_seller_of(seller_org_id) or public.is_admin());

create policy product_versions_select on public.product_versions for select to authenticated
  using (public.is_admin() or exists (select 1 from public.products p where p.id = product_id and public.is_seller_of(p.seller_org_id)));
create policy product_moderation_select on public.product_moderation for select to authenticated
  using (public.is_admin() or exists (select 1 from public.products p where p.id = product_id and public.is_seller_of(p.seller_org_id)));

create policy links_select on public.content_product_links for select to anon, authenticated
  using (status = 'validated' or public.is_admin()
         or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id())
         or exists (select 1 from public.products p where p.id = product_id and public.is_seller_of(p.seller_org_id)));
create policy links_insert_creator on public.content_product_links for insert to authenticated
  with check (public.is_admin() or (status = 'suggested' and suggested_by_creator = public.my_creator_id()
              and exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id())));
create policy links_delete_creator on public.content_product_links for delete to authenticated
  using (public.is_admin() or (status = 'suggested' and suggested_by_creator = public.my_creator_id()));
create policy links_admin_update on public.content_product_links for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy carts_own on public.carts for select to authenticated using (user_id = auth.uid());
create policy cart_items_own_select on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy cart_items_own_delete on public.cart_items for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

create policy destinations_select on public.demo_destinations for select to anon, authenticated using (is_active or public.is_admin());
create policy destinations_admin on public.demo_destinations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy shipping_select on public.demo_shipping_rules for select to anon, authenticated using (true);
create policy shipping_admin on public.demo_shipping_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy orders_select_own on public.test_orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy fulfillments_select on public.test_fulfillments for select to authenticated
  using (public.is_admin() or public.is_seller_of(seller_org_id)
         or exists (select 1 from public.test_orders o where o.id = order_id and o.user_id = auth.uid()));
create policy order_items_select on public.test_order_items for select to authenticated
  using (public.is_admin() or public.is_seller_of(seller_org_id)
         or exists (select 1 from public.test_orders o where o.id = order_id and o.user_id = auth.uid()));
create policy fulfillment_events_select on public.fulfillment_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.test_fulfillments f where f.id = fulfillment_id
          and (public.is_seller_of(f.seller_org_id) or exists (select 1 from public.test_orders o where o.id = f.order_id and o.user_id = auth.uid()))));

create policy product_interest_insert on public.product_interest for insert to authenticated with check (user_id = auth.uid());
create policy product_interest_admin on public.product_interest for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- ops
create policy feedback_admin on public.feedback for select to authenticated using (public.is_admin());
create policy feedback_admin_update on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy analytics_admin on public.analytics_events for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- funções administrativas e utilitárias
create or replace function public.my_roles()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('role', role, 'scope_type', scope_type, 'scope_id', scope_id)), '[]'::jsonb)
  from public.role_assignments where user_id = auth.uid() and revoked_at is null
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz, roles text[], anonymized boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at,
         coalesce((select array_agg(r.role::text order by r.role) from public.role_assignments r where r.user_id = u.id and r.revoked_at is null), '{}'),
         p.anonymized_at is not null
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin()
    and (p_search is null or u.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
  order by u.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;

create or replace function public.verify_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('valid', c.revoked_at is null, 'program_title', c.snapshot ->> 'program_title',
    'version', c.snapshot ->> 'version', 'issued_at', c.issued_at, 'symbolic', true)
  from public.certificates c where c.code = upper(p_code)
$$;

-- Métricas agregadas para o dashboard (interesse ≠ pedido de teste ≠ receita real = 0).
create or replace function public.admin_metrics(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb; v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'window_days', p_days,
    'signups', (select count(*) from auth.users where created_at >= v_since),
    'signups_total', (select count(*) from auth.users),
    'activated_users', (select count(distinct user_id) from public.completions union all select count(distinct user_id) from public.content_progress),
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

create or replace function public.admin_set_setting(p_key text, p_value jsonb, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_before from public.app_settings where key = p_key;
  insert into public.app_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now();
  perform public.audit_log('setting.set', 'app_setting', p_key, v_before, p_value, p_justification);
end $$;

create or replace function public.admin_run_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.audit_log('retention.run_manual', 'system', null);
  return public.run_retention();
end $$;

create or replace function public.admin_advance_transport(p_minutes int default 0)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.advance_simulated_transport(p_minutes);
end $$;

grant execute on function public.my_roles(), public.verify_certificate(text) to anon, authenticated;
grant execute on function public.admin_list_users(text, int, int), public.admin_metrics(int), public.admin_set_setting(text, jsonb, text),
  public.admin_run_retention(), public.admin_advance_transport(int) to authenticated;

-- Tabelas sem política de escrita ficam somente-leitura para a API (escrita só via funções/service role).
