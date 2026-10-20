-- Ultra Hero · aplicação remota: 0006 (restante) até 0015 + seed
-- Gerado a partir de supabase/migrations. Colar inteiro no SQL Editor do Supabase e executar uma vez.
-- O painel pede confirmação por haver comandos destrutivos: eles só removem auxiliares temporários
-- (seed_tmp, mig_tmp, funções _diag_*), recriam funções/políticas/gatilhos e definem funções que apagam
-- dados por regra de negócio (carrinho, retenção, exclusão de conta). Nenhum dado de usuário é apagado.
begin;

-- 0006_ops (tabelas já criadas no remoto)
create or replace function public.track_event(p_event text, p_properties jsonb default '{}'::jsonb, p_anon_id text default null, p_locale public.locale_code default null)
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if p_event !~ '^[a-z][a-z0-9_.]{2,60}$' then raise exception 'invalid_event_name'; end if;
  -- bloqueia chaves que sugerem PII
  for k in select jsonb_object_keys(coalesce(p_properties, '{}'::jsonb)) loop
    if k ~* '(email|phone|cpf|address|name|password|token)' then raise exception 'pii_not_allowed_in_properties'; end if;
  end loop;
  if pg_column_size(p_properties) > 4096 then raise exception 'properties_too_large'; end if;
  insert into public.analytics_events (user_id, anon_id, event_name, properties, locale)
  values (auth.uid(), case when auth.uid() is null then left(p_anon_id, 64) end, p_event, coalesce(p_properties, '{}'::jsonb), p_locale);
end $$;

create or replace function public.submit_feedback(p_context text, p_rating int, p_message text, p_locale public.locale_code default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_rating is null and nullif(trim(coalesce(p_message, '')), '') is null then raise exception 'feedback_empty'; end if;
  -- antiabuso simples: máx. 20 feedbacks/dia por usuário
  if auth.uid() is not null and (select count(*) from public.feedback where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.feedback (user_id, context, rating, message, locale)
  values (auth.uid(), left(p_context, 120), p_rating, left(p_message, 1000), p_locale) returning id into v_id;
  return v_id;
end $$;

create or replace function public.select_modules(p_module_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s public.simulated_subscriptions%rowtype; v_m uuid; v_req uuid; v_wanted uuid[];
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  perform public.sync_subscription(v_uid);
  v_wanted := coalesce(p_module_ids, '{}');

  -- módulos inválidos/inativos
  if exists (select 1 from unnest(v_wanted) m where not exists (select 1 from public.plan_modules pm where pm.id = m and pm.is_active)) then
    raise exception 'invalid_module';
  end if;
  -- dependências configuráveis
  for v_m, v_req in select d.module_id, d.requires_module_id from public.module_dependencies d where d.module_id = any (v_wanted) loop
    if not (v_req = any (v_wanted)) then raise exception 'module_dependency_missing: % requires %', v_m, v_req; end if;
  end loop;

  select * into s from public.simulated_subscriptions where user_id = v_uid for update;
  if not found then
    if cardinality(v_wanted) = 0 then return jsonb_build_object('status', 'free'); end if;
    insert into public.simulated_subscriptions (user_id) values (v_uid) returning * into s;
    insert into public.subscription_events (subscription_id, event, payload) values (s.id, 'created', jsonb_build_object('simulated', true));
  elsif s.status = 'expired' then
    if cardinality(v_wanted) = 0 then return jsonb_build_object('status', 'free'); end if;
    update public.simulated_subscriptions set status = 'active', auto_renew = true, cancelled_at = null,
      current_period_start = now(), current_period_end = now() + interval '30 days' where id = s.id returning * into s;
    delete from public.subscription_modules where subscription_id = s.id;
    insert into public.subscription_events (subscription_id, event) values (s.id, 'reactivated');
  elsif s.status = 'cancelled' then
    update public.simulated_subscriptions set status = 'active', auto_renew = true, cancelled_at = null where id = s.id returning * into s;
    insert into public.subscription_events (subscription_id, event) values (s.id, 'resumed');
  end if;

  -- adições imediatas
  insert into public.subscription_modules (subscription_id, module_id)
  select s.id, m from unnest(v_wanted) m
  on conflict (subscription_id, module_id) do update set status = 'active', removal_at = null;
  -- remoções agendadas para o fim do período
  update public.subscription_modules set status = 'scheduled_removal', removal_at = s.current_period_end
  where subscription_id = s.id and not (module_id = any (v_wanted));

  insert into public.subscription_events (subscription_id, event, payload) values (s.id, 'modules_changed', jsonb_build_object('modules', v_wanted));
  if cardinality(v_wanted) = 0 then
    update public.simulated_subscriptions set status = 'cancelled', auto_renew = false, cancelled_at = now() where id = s.id;
    insert into public.subscription_events (subscription_id, event) values (s.id, 'cancelled');
  end if;
  return public.my_subscription();
end $$;

create or replace function public.cancel_subscription()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  perform public.sync_subscription(v_uid);
  update public.simulated_subscriptions set status = 'cancelled', auto_renew = false, cancelled_at = now()
  where user_id = v_uid and status = 'active';
  if found then
    insert into public.subscription_events (subscription_id, event) select id, 'cancelled' from public.simulated_subscriptions where user_id = v_uid;
  end if;
  return public.my_subscription();
end $$;

create or replace function public.my_subscription()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s public.simulated_subscriptions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status', 'anonymous'); end if;
  perform public.sync_subscription(v_uid);
  select * into s from public.simulated_subscriptions where user_id = v_uid;
  if not found or s.status = 'expired' then
    return jsonb_build_object('status', 'free', 'modules', '[]'::jsonb, 'simulated', true);
  end if;
  return jsonb_build_object(
    'status', s.status, 'simulated', true,
    'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
    'auto_renew', s.auto_renew, 'cancelled_at', s.cancelled_at,
    'modules', (select coalesce(jsonb_agg(jsonb_build_object('module_id', sm.module_id, 'code', pm.code, 'name', pm.name,
                 'price_cents_demo', pm.price_cents_demo, 'status', sm.status, 'removal_at', sm.removal_at) order by pm.sort_order), '[]'::jsonb)
                from public.subscription_modules sm join public.plan_modules pm on pm.id = sm.module_id where sm.subscription_id = s.id));
end $$;

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
  update public.content set review_status = 'in_review' where id = p_content;
end $$;

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
    -- bloqueio: sem regra de acesso ou sem corpo/mídia não pode ser consumido
    if c.access_level is null then v_missing := v_missing || 'access_level'; end if;
    if not exists (select 1 from public.content_bodies b where b.content_id = p_content) then v_missing := v_missing || 'body'; end if;
    if cardinality(v_missing) > 0 then raise exception 'cannot_publish_missing: %', array_to_string(v_missing, ','); end if;
    update public.content set status = 'published', review_status = 'approved', published_at = coalesce(published_at, now()) where id = p_content;
  else
    update public.content set review_status = p_decision where id = p_content;
  end if;
  perform public.audit_log('content.review', 'content', p_content::text, jsonb_build_object('status', c.status, 'review_status', c.review_status),
    jsonb_build_object('decision', p_decision), p_feedback);
end $$;

create or replace function public.admin_set_content_status(p_content uuid, p_status public.content_status, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('status', status) into v_before from public.content where id = p_content;
  update public.content set status = p_status,
    archived_at = case when p_status = 'archived' then now() else null end,
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = p_content;
  perform public.audit_log('content.set_status', 'content', p_content::text, v_before, jsonb_build_object('status', p_status), p_justification);
end $$;

create or replace function public.admin_set_featured(p_kind text, p_id uuid, p_featured boolean, p_rank int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'content' then
    update public.content set is_featured = p_featured, featured_rank = case when p_featured then p_rank end where id = p_id;
  elsif p_kind = 'program' then
    update public.programs set is_featured = p_featured, featured_rank = case when p_featured then p_rank end where id = p_id;
  else raise exception 'invalid_kind'; end if;
  perform public.audit_log('featured.set', p_kind, p_id::text, null, jsonb_build_object('featured', p_featured, 'rank', p_rank));
end $$;

create or replace function public.search_content(p_query text, p_pillar public.pillar default null, p_type public.content_type default null,
  p_creator uuid default null, p_access public.access_level default null, p_limit int default 40, p_offset int default 0)
returns setof public.content language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as raw)
  select c.* from public.content c, q
  where c.status = 'published'
    and (p_pillar is null or c.pillar = p_pillar)
    and (p_type is null or c.type = p_type)
    and (p_creator is null or c.creator_id = p_creator)
    and (p_access is null or c.access_level = p_access)
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

create or replace function public.anonymize_user_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
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
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.retention_exceptions where scope_type = 'user' and scope_id = v_uid::text and closed_at is null) then
    raise exception 'retention_exception_active';
  end if;
  insert into public.account_deletion_requests (user_id, processed_at) values (v_uid, now());
  perform public.anonymize_user_data(v_uid);
  perform public.audit_log('account.delete', 'user', v_uid::text, null, null, 'self_service', 'consumer');
  delete from auth.users where id = v_uid;
end $$;

create or replace function public.run_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int; n3 int; n4 int; n5 int;
begin
  delete from public.analytics_events where expires_at < now(); get diagnostics n1 = row_count;
  update public.test_orders set user_id = null, destination_snapshot = destination_snapshot - 'name', anonymized_at = now()
  where retention_expires_at < now() and anonymized_at is null
    and not exists (select 1 from public.retention_exceptions e where e.scope_type = 'test_order' and e.scope_id = test_orders.id::text and e.closed_at is null);
  get diagnostics n2 = row_count;
  delete from public.admin_audit where created_at < now() - interval '365 days'; get diagnostics n3 = row_count;
  delete from public.recommendation_runs where created_at < now() - interval '30 days'; get diagnostics n4 = row_count;
  delete from public.retention_jobs where ran_at < now() - interval '365 days'; get diagnostics n5 = row_count;
  insert into public.retention_jobs (job, affected, details)
  values ('daily', n1 + n2 + n3 + n4, jsonb_build_object('analytics_deleted', n1, 'orders_anonymized', n2, 'audit_deleted', n3, 'recommendation_runs_deleted', n4));
  return jsonb_build_object('analytics_deleted', n1, 'orders_anonymized', n2, 'audit_deleted', n3, 'recommendation_runs_deleted', n4);
end $$;

grant execute on function public.track_event(text, jsonb, text, public.locale_code), public.submit_feedback(text, int, text, public.locale_code),
  public.search_content(text, public.pillar, public.content_type, uuid, public.access_level, int, int), public.my_subscription() to anon, authenticated;

grant execute on function public.select_modules(uuid[]), public.cancel_subscription(), public.submit_content_for_review(uuid),
  public.admin_review_content(uuid, public.review_status, text), public.admin_set_content_status(uuid, public.content_status, text),
  public.admin_set_featured(text, uuid, boolean, int), public.delete_my_account() to authenticated;

revoke execute on function public.anonymize_user_data(uuid), public.run_retention() from public, anon, authenticated;

-- 0007_rls
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


-- 0008_seed
-- =============================================================================
-- Ultra Hero · 0007 · Seed determinístico e reexecutável (dados FICTÍCIOS)
-- Personalidades, conteúdos, programas, produtos e operações são inventados
-- para a POC. Nenhuma celebridade real, nenhuma parceria, nenhum preço aprovado.
-- IDs derivados de md5(chave) para reexecução idempotente.
-- =============================================================================

create or replace function public.seed_uuid(p text)
returns uuid language sql immutable parallel safe strict as $$ select md5('ultra-hero:' || p)::uuid $$;

-- ---------------------------------------------------------------- settings ---
insert into public.app_settings (key, value, description) values
  ('bootstrap_admin_emails', '["martinsphilippes@gmail.com"]'::jsonb, 'E-mails que recebem papel admin no primeiro login (auditado).'),
  ('commerce.enabled', 'true'::jsonb, 'Kill switch do comércio demonstrativo.'),
  ('ai.enabled', 'true'::jsonb, 'Kill switch das recomendações por IA (cai para determinístico).'),
  ('ai.provider', '"deterministic"'::jsonb, 'deterministic | openai | gemini (exige chave no servidor).'),
  ('ai.rate_limit_per_hour', '12'::jsonb, 'Máximo de recálculos de recomendação por usuário/hora.'),
  ('video.provider', '"embed"'::jsonb, 'embed | cloudflare_stream | mux (abstração; POC usa embed/demo).'),
  ('experiment.open', 'true'::jsonb, 'Cadastro público aberto para o experimento de 14 dias.'),
  ('retention.days', '{"analytics":90,"logs":30,"audit":365,"test_orders":90}'::jsonb, 'Política de retenção aprovada.'),
  ('transport.minutes_per_step', '10'::jsonb, 'Minutos entre etapas do transporte simulado.')
on conflict (key) do update set description = excluded.description;

-- ---------------------------------------------------------------- módulos e planos
insert into public.plan_modules (id, code, name, description, price_cents_demo, sort_order) values
  (public.seed_uuid('module:base'), 'base', 'Ultra Hero Base', 'Acesso aos conteúdos base de rotina, treino, nutrição e gastronomia. Valor demonstrativo.', 2990, 10),
  (public.seed_uuid('module:training_full'), 'training_full', 'Treino FULL', 'Treinos avançados e progressões. Valor demonstrativo.', 2000, 20),
  (public.seed_uuid('module:nutrition_full'), 'nutrition_full', 'Nutrição FULL', 'Guias aprofundados de nutrição educativa. Valor demonstrativo.', 2000, 30),
  (public.seed_uuid('module:chef_full'), 'chef_full', 'Chef FULL', 'Técnicas e receitas assinadas pelas personalidades de gastronomia. Valor demonstrativo.', 2000, 40)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.plans (id, code, name, description, is_free, sort_order) values
  (public.seed_uuid('plan:free'), 'free', 'Gratuito', 'Explore o catálogo e consuma conteúdos abertos.', true, 10),
  (public.seed_uuid('plan:base'), 'base', 'Base', 'Conteúdos base dos quatro pilares.', false, 20),
  (public.seed_uuid('plan:training'), 'training', 'Base + Treino FULL', 'Base com treinos avançados.', false, 30),
  (public.seed_uuid('plan:nutrition'), 'nutrition', 'Base + Nutrição FULL', 'Base com nutrição aprofundada.', false, 40),
  (public.seed_uuid('plan:chef'), 'chef', 'Base + Chef FULL', 'Base com técnicas de chef.', false, 50),
  (public.seed_uuid('plan:complete'), 'complete', 'Completo', 'Todos os módulos.', false, 60)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.plan_bundle_modules (plan_id, module_id) values
  (public.seed_uuid('plan:base'), public.seed_uuid('module:base')),
  (public.seed_uuid('plan:training'), public.seed_uuid('module:base')), (public.seed_uuid('plan:training'), public.seed_uuid('module:training_full')),
  (public.seed_uuid('plan:nutrition'), public.seed_uuid('module:base')), (public.seed_uuid('plan:nutrition'), public.seed_uuid('module:nutrition_full')),
  (public.seed_uuid('plan:chef'), public.seed_uuid('module:base')), (public.seed_uuid('plan:chef'), public.seed_uuid('module:chef_full')),
  (public.seed_uuid('plan:complete'), public.seed_uuid('module:base')), (public.seed_uuid('plan:complete'), public.seed_uuid('module:training_full')),
  (public.seed_uuid('plan:complete'), public.seed_uuid('module:nutrition_full')), (public.seed_uuid('plan:complete'), public.seed_uuid('module:chef_full'))
on conflict do nothing;

-- ---------------------------------------------------------------- personalidades fictícias
insert into public.creator_profiles (id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, rights_note, sort_order) values
  (public.seed_uuid('creator:lia'), 'lia-monteiro', 'Lia Monteiro', 'Rotina, sono e hábitos pequenos', 'Personagem fictícia criada para a demonstração. Lia fala sobre manhãs calmas, sono e rotinas realistas para quem tem pouco tempo.', '{routine}', '/placeholders/avatar-1.svg', '/placeholders/cover-routine-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 10),
  (public.seed_uuid('creator:rafael'), 'rafael-duarte', 'Rafael Duarte', 'Foco, planejamento e revisão semanal', 'Personagem fictício criado para a demonstração. Rafael explora produtividade sem culpa e sistemas simples de organização.', '{routine}', '/placeholders/avatar-2.svg', '/placeholders/cover-routine-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 20),
  (public.seed_uuid('creator:camila'), 'camila-sato', 'Camila Sato', 'Força e treino funcional para iniciantes', 'Personagem fictícia criada para a demonstração. Camila ensina os movimentos básicos de força com segurança e progressão.', '{training}', '/placeholders/avatar-3.svg', '/placeholders/cover-training-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 30),
  (public.seed_uuid('creator:tiago'), 'tiago-albuquerque', 'Tiago Albuquerque', 'Corrida e mobilidade do zero', 'Personagem fictício criado para a demonstração. Tiago acompanha quem está saindo do sedentarismo rumo aos primeiros 5 km.', '{training}', '/placeholders/avatar-4.svg', '/placeholders/cover-training-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 40),
  (public.seed_uuid('creator:bruna'), 'bruna-castellano', 'Bruna Castellano', 'Nutrição educativa, sem terrorismo', 'Personagem fictícia criada para a demonstração. Bruna traduz nutrição em escolhas práticas; conteúdo educativo, não prescrição.', '{nutrition}', '/placeholders/avatar-5.svg', '/placeholders/cover-nutrition-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 50),
  (public.seed_uuid('creator:davi'), 'davi-nascimento', 'Davi Nascimento', 'Hidratação, energia e planejamento', 'Personagem fictício criado para a demonstração. Davi fala de planejamento de refeições e hidratação no dia a dia.', '{nutrition}', '/placeholders/avatar-6.svg', '/placeholders/cover-nutrition-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 60),
  (public.seed_uuid('creator:helena'), 'helena-vilar', 'Helena Vilar', 'Chef de cozinha de base', 'Personagem fictícia criada para a demonstração. Helena ensina técnicas de base para cozinhar melhor e mais rápido.', '{gastronomy}', '/placeholders/avatar-7.svg', '/placeholders/cover-gastronomy-1.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 70),
  (public.seed_uuid('creator:marcos'), 'marcos-ferraz', 'Marcos Ferraz', 'Chef das marmitas da semana', 'Personagem fictício criado para a demonstração. Marcos organiza a semana com preparos simples e congeláveis.', '{gastronomy}', '/placeholders/avatar-8.svg', '/placeholders/cover-gastronomy-2.svg', true, 'Perfil fictício. Sem contrato, imagem ou endosso real.', 80)
on conflict (id) do update set name = excluded.name, headline = excluded.headline, bio = excluded.bio, pillars = excluded.pillars;

-- ---------------------------------------------------------------- conteúdos (40)
create or replace function public.seed_body(p_type public.content_type, p_title text, p_summary text, p_key text)
returns jsonb language plpgsql immutable as $$
begin
  return case p_type
    when 'video' then jsonb_build_object('kind', 'video', 'demo', true,
      'intro', p_summary,
      'transcript', jsonb_build_array(
        jsonb_build_object('t', 0, 'text', 'Olá! Neste vídeo de demonstração vamos falar sobre: ' || p_title || '.'),
        jsonb_build_object('t', 20, 'text', 'Primeiro, o contexto: ' || p_summary),
        jsonb_build_object('t', 60, 'text', 'Agora, a prática: comece pequeno, repita amanhã e ajuste o que não funcionou.'),
        jsonb_build_object('t', 110, 'text', 'Lembrete: este conteúdo é educativo e não substitui orientação profissional individual.')),
      'key_points', jsonb_build_array('Comece com o mínimo viável', 'Consistência vence intensidade', 'Ajuste à sua realidade'))
    when 'recipe' then jsonb_build_object('kind', 'recipe', 'servings', 2, 'prep_minutes', 15, 'cook_minutes', 20,
      'ingredients', jsonb_build_array(
        jsonb_build_object('item', 'Ingrediente principal', 'qty', '300 g'),
        jsonb_build_object('item', 'Legumes da estação', 'qty', '2 xícaras'),
        jsonb_build_object('item', 'Azeite', 'qty', '1 colher de sopa'),
        jsonb_build_object('item', 'Sal, pimenta e ervas', 'qty', 'a gosto')),
      'steps', jsonb_build_array('Pré-aqueça o forno ou a frigideira.', 'Tempere o ingrediente principal e deixe descansar 10 minutos.',
        'Cozinhe até dourar, virando uma vez.', 'Finalize com ervas e sirva com os legumes.'),
      'allergens', jsonb_build_array(), 'note', 'Receita demonstrativa. Quantidades ilustrativas.')
    when 'workout' then jsonb_build_object('kind', 'workout', 'equipment', jsonb_build_array('peso do corpo'),
      'blocks', jsonb_build_array(
        jsonb_build_object('name', 'Aquecimento', 'exercises', jsonb_build_array(
          jsonb_build_object('name', 'Marcha no lugar', 'sets', 1, 'reps', '2 min', 'rest_seconds', 0),
          jsonb_build_object('name', 'Círculos de braço', 'sets', 1, 'reps', '10 cada lado', 'rest_seconds', 0))),
        jsonb_build_object('name', 'Principal', 'exercises', jsonb_build_array(
          jsonb_build_object('name', 'Agachamento', 'sets', 3, 'reps', '10', 'rest_seconds', 45),
          jsonb_build_object('name', 'Flexão (joelhos no chão se precisar)', 'sets', 3, 'reps', '8', 'rest_seconds', 45),
          jsonb_build_object('name', 'Prancha', 'sets', 3, 'reps', '20 s', 'rest_seconds', 30))),
        jsonb_build_object('name', 'Volta à calma', 'exercises', jsonb_build_array(
          jsonb_build_object('name', 'Alongamento de posterior', 'sets', 1, 'reps', '30 s cada', 'rest_seconds', 0)))),
      'safety_note', 'Conteúdo educativo. Pare se sentir dor e procure um profissional habilitado.')
    else jsonb_build_object('kind', 'article',
      'sections', jsonb_build_array(
        jsonb_build_object('heading', 'Por que isso importa', 'text', p_summary),
        jsonb_build_object('heading', 'Como começar hoje', 'text', 'Escolha uma única ação pequena relacionada a "' || p_title || '" e repita por três dias. Só então aumente.'),
        jsonb_build_object('heading', 'Erros comuns', 'text', 'Tentar mudar tudo de uma vez, comparar-se com os outros e desistir no primeiro dia ruim.'),
        jsonb_build_object('heading', 'Lembrete', 'text', 'Este conteúdo é educativo e não substitui avaliação profissional individual.')))
  end;
end $$;

create temporary table seed_content (
  key text, creator text, pillar public.pillar, type public.content_type, title text, summary text,
  minutes int, difficulty text, tags text[], access text, cover int, featured int
);

insert into seed_content values
  ('r1','lia','routine','video','Ritual matinal de 10 minutos','Um começo de dia simples: água, luz, movimento leve e uma intenção. Sem app, sem pressa.',10,'beginner','{manha,habitos,sono}','free',1,1),
  ('r2','lia','routine','guide','Como montar uma rotina noturna que funciona','O segredo não é a lista perfeita: é reduzir decisões à noite e preparar a manhã seguinte.',8,'beginner','{sono,habitos}','free',2,null),
  ('r3','rafael','routine','article','Blocos de foco: organize o dia em 3 prioridades','Três coisas por dia, feitas, valem mais que doze planejadas.',6,'beginner','{foco,produtividade}','free',3,null),
  ('r4','rafael','routine','video','Respiração 4-7-8 para desacelerar','Uma técnica curta de respiração para transições do dia e para antes de dormir.',7,'beginner','{respiracao,sono}','free',1,null),
  ('r5','lia','routine','guide','Checklist semanal de autocuidado','Um checklist leve para revisar sono, movimento, comida e descanso a cada semana.',5,'beginner','{habitos,autocuidado}','base',2,null),
  ('r6','lia','routine','video','Alongamento leve antes de dormir','Sequência de 12 minutos no chão do quarto para soltar o corpo e sinalizar o fim do dia.',12,'beginner','{sono,mobilidade}','base',3,null),
  ('r7','rafael','routine','article','Por que streaks funcionam (e quando não)','Sequências ajudam a começar; o objetivo é a rotina, não o número.',5,'beginner','{habitos,motivacao}','free',1,null),
  ('r8','rafael','routine','video','Revisão semanal em 15 minutos','Olhe para trás, escolha o que manter e planeje a semana com folga.',15,'beginner','{planejamento,produtividade}','base',2,null),
  ('r9','lia','routine','guide','Higiene do sono: 8 ajustes simples','Luz, temperatura, cafeína, telas: pequenos ajustes com efeito grande.',9,'beginner','{sono}','free',3,2),
  ('r10','rafael','routine','video','Desligar as telas: experimento de 7 dias','Um experimento guiado para reduzir telas à noite sem radicalismo.',11,'beginner','{telas,habitos}','base',1,null),
  ('t1','camila','training','workout','Treino funcional iniciante — corpo inteiro','Movimentos básicos com o peso do corpo, em 25 minutos, sem equipamento.',25,'beginner','{funcional,forca,iniciante}','free',1,3),
  ('t2','tiago','training','video','Mobilidade de quadril em 8 minutos','Sequência rápida para quem passa o dia sentado e quer correr sem travar.',8,'beginner','{mobilidade,corrida}','free',2,null),
  ('t3','camila','training','workout','Força básica: agachar, empurrar, puxar','Os três padrões que sustentam qualquer rotina de força.',35,'beginner','{forca}','base',3,null),
  ('t4','tiago','training','workout','Caminhada-corrida: semana 1','Alterne caminhada e corrida leve: o primeiro passo rumo aos 5 km.',30,'beginner','{corrida,iniciante}','free',1,null),
  ('t5','camila','training','video','Técnica de agachamento: 5 erros comuns','Joelhos, calcanhares, tronco: como ajustar o agachamento com segurança.',9,'beginner','{tecnica,forca}','free',2,null),
  ('t6','camila','training','workout','Core em 12 minutos','Um bloco curto de estabilidade para fazer em qualquer lugar.',12,'beginner','{core}','base',3,null),
  ('t7','tiago','training','workout','Intervalado leve para iniciantes','Tiros curtos com recuperação generosa, pensado para quem já caminha-corre.',20,'intermediate','{corrida,hiit}','training_full',1,null),
  ('t8','tiago','training','guide','Como escolher o tênis de corrida','Conforto primeiro, marketing depois: um guia prático e sem jargão.',6,'beginner','{corrida,equipamento}','free',2,null),
  ('t9','camila','training','workout','Treino de força em casa com elástico','Progressões com elástico de resistência para evoluir sem academia.',30,'intermediate','{forca,elastico}','training_full',3,null),
  ('t10','tiago','training','video','Aquecimento de 5 minutos antes de correr','Prepare tornozelos, quadril e respiração antes de sair para correr.',5,'beginner','{corrida,aquecimento}','base',1,null),
  ('n1','bruna','nutrition','guide','Prato equilibrado: o método da mão','Uma forma visual e sem balança de montar um prato equilibrado.',7,'beginner','{basico,porcoes}','free',1,4),
  ('n2','davi','nutrition','article','Hidratação: quanto beber de verdade?','Sinais do corpo, rotina e contexto valem mais que uma regra fixa.',5,'beginner','{hidratacao}','free',2,null),
  ('n3','bruna','nutrition','guide','Rótulos: 5 coisas para olhar primeiro','Porção, lista de ingredientes e o que ignorar na embalagem.',8,'beginner','{rotulos}','free',3,null),
  ('n4','bruna','nutrition','video','Lanches práticos para a tarde','Combinações simples para a hora em que a fome aperta.',10,'beginner','{lanches,praticidade}','base',1,null),
  ('n5','davi','nutrition','guide','Planejamento de refeições em 30 minutos','Um método de 30 minutos semanais para decidir, comprar e preparar.',12,'beginner','{planejamento}','base',2,null),
  ('n6','bruna','nutrition','article','Proteína ao longo do dia: por que distribuir','Conceitos gerais sobre distribuição de proteína, sem metas individuais.',7,'intermediate','{proteina}','nutrition_full',3,null),
  ('n7','davi','nutrition','video','Café da manhã em 5 minutos: 3 ideias','Opções rápidas que cabem na correria de quem sai cedo.',6,'beginner','{cafe,praticidade}','free',1,null),
  ('n8','bruna','nutrition','guide','Fibras: fontes simples no dia a dia','Onde encontrar fibras sem complicar a lista de compras.',6,'beginner','{fibras}','base',2,null),
  ('n9','davi','nutrition','article','Pré e pós-treino: o básico sem exagero','Princípios gerais de alimentação ao redor do treino, de forma educativa.',8,'intermediate','{treino,nutricao}','nutrition_full',3,null),
  ('n10','bruna','nutrition','video','Lista de compras inteligente','Como montar uma lista que evita desperdício e decisões por impulso.',9,'beginner','{compras,planejamento}','free',1,null),
  ('g1','helena','gastronomy','recipe','Bowl de frango grelhado com legumes assados','O bowl clássico da cozinha de base: proteína, legumes e um molho de ervas.',35,'beginner','{frango,bowl}','free',1,5),
  ('g2','marcos','gastronomy','recipe','Omelete de forno para a semana','Uma assadeira, oito porções, cinco dias resolvidos.',30,'beginner','{ovos,marmita}','free',2,null),
  ('g3','helena','gastronomy','recipe','Molho de ervas em 5 minutos','O molho coringa que transforma qualquer preparo simples.',5,'beginner','{molho,basico}','free',3,null),
  ('g4','marcos','gastronomy','recipe','Arroz integral soltinho (de verdade)','Proporção, descanso e o truque do dourado inicial.',40,'beginner','{arroz,basico}','free',1,null),
  ('g5','helena','gastronomy','recipe','Salmão ao forno com batata-doce','Jantar de forno com poucos passos e muito sabor.',35,'beginner','{peixe,forno}','base',2,null),
  ('g6','marcos','gastronomy','recipe','Sopa de legumes com grão-de-bico','Panela única, congela bem e rende a semana.',45,'beginner','{sopa,leguminosas}','base',3,null),
  ('g7','helena','gastronomy','video','Afiar e cuidar das facas','Uma faca afiada é mais segura e mais rápida: aprenda a mantê-la.',8,'beginner','{tecnica,facas}','free',1,null),
  ('g8','marcos','gastronomy','recipe','Marmita de carne moída com abóbora','A marmita mais pedida: congelável, equilibrada e barata.',40,'beginner','{marmita,carne}','chef_full',2,null),
  ('g9','helena','gastronomy','recipe','Panqueca de aveia e banana','Três ingredientes, cinco minutos, café da manhã pronto.',15,'beginner','{cafe,aveia}','base',3,null),
  ('g10','helena','gastronomy','video','Mise en place: cozinhe 2x mais rápido','Organize antes de ligar o fogo e ganhe tempo em todo preparo.',10,'beginner','{tecnica,organizacao}','chef_full',1,null);

insert into public.content (id, slug, creator_id, pillar, type, source_locale, title, summary, cover_url, duration_minutes, difficulty, tags, has_captions,
  status, review_status, access_level, required_module_id, is_featured, featured_rank, disclaimer_kind, published_at)
select public.seed_uuid('content:' || key), public.slugify(title) || '-' || key, public.seed_uuid('creator:' || creator), pillar, type, 'pt-BR', title, summary,
  '/placeholders/cover-' || pillar::text || '-' || cover || '.svg', minutes, difficulty, tags, type = 'video',
  'published', 'approved',
  case when access = 'free' then 'free'::public.access_level else 'premium'::public.access_level end,
  case when access = 'free' then null else public.seed_uuid('module:' || access) end,
  featured is not null, featured,
  case pillar when 'training' then 'training' when 'nutrition' then 'nutrition' when 'gastronomy' then 'nutrition' else 'general' end,
  now() - make_interval(days => (40 - row_number() over (order by key))::int)
from seed_content
on conflict (id) do update set title = excluded.title, summary = excluded.summary, tags = excluded.tags, access_level = excluded.access_level,
  required_module_id = excluded.required_module_id, is_featured = excluded.is_featured, featured_rank = excluded.featured_rank;

insert into public.content_bodies (content_id, body, media_provider, media_ref)
select public.seed_uuid('content:' || key), public.seed_body(type, title, summary, key), 'none', null
from seed_content
on conflict (content_id) do update set body = excluded.body;

-- receitas com ingredientes específicos (sobrescreve o template)
update public.content_bodies set body = body || '{"ingredients":[{"item":"Peito de frango","qty":"300 g"},{"item":"Abobrinha","qty":"1"},{"item":"Cenoura","qty":"1"},{"item":"Batata-doce","qty":"1 média"},{"item":"Azeite","qty":"2 colheres de sopa"},{"item":"Molho de ervas (receita da plataforma)","qty":"3 colheres"}],"steps":["Corte os legumes em cubos, tempere com azeite e sal e asse a 200 °C por 25 minutos.","Tempere o frango com sal, pimenta e limão; grelhe 5 minutos de cada lado.","Fatie o frango, monte o bowl com os legumes e finalize com o molho de ervas."],"servings":2,"prep_minutes":10,"cook_minutes":25}'::jsonb where content_id = public.seed_uuid('content:g1');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Ovos","qty":"10"},{"item":"Espinafre","qty":"2 xícaras"},{"item":"Tomate-cereja","qty":"1 xícara"},{"item":"Queijo branco","qty":"100 g"},{"item":"Sal e orégano","qty":"a gosto"}],"steps":["Bata os ovos com sal e orégano.","Misture espinafre, tomate e queijo; despeje numa assadeira untada.","Asse a 180 °C por 25 minutos; corte em 8 porções e congele.","Para servir, aqueça 2 minutos no micro-ondas."],"servings":8,"allergens":["ovo","leite"]}'::jsonb where content_id = public.seed_uuid('content:g2');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Salsinha","qty":"1 maço"},{"item":"Cebolinha","qty":"1/2 maço"},{"item":"Azeite","qty":"1/2 xícara"},{"item":"Limão","qty":"1"},{"item":"Alho","qty":"1 dente"},{"item":"Sal","qty":"a gosto"}],"steps":["Pique as ervas finamente.","Misture com azeite, suco de limão, alho amassado e sal.","Guarde na geladeira por até 5 dias."],"servings":6,"prep_minutes":5,"cook_minutes":0}'::jsonb where content_id = public.seed_uuid('content:g3');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Arroz integral","qty":"1 xícara"},{"item":"Água","qty":"2 1/2 xícaras"},{"item":"Azeite","qty":"1 colher de sopa"},{"item":"Alho","qty":"1 dente"},{"item":"Sal","qty":"1 colher de chá"}],"steps":["Lave o arroz até a água sair clara.","Doure o alho no azeite e refogue o arroz por 2 minutos.","Adicione a água e o sal; cozinhe tampado em fogo baixo por 35 minutos.","Desligue, deixe descansar 10 minutos e solte com um garfo."],"servings":4,"prep_minutes":5,"cook_minutes":45}'::jsonb where content_id = public.seed_uuid('content:g4');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Filé de salmão","qty":"2 postas"},{"item":"Batata-doce","qty":"2 médias"},{"item":"Azeite","qty":"2 colheres de sopa"},{"item":"Limão","qty":"1"},{"item":"Alecrim","qty":"2 ramos"}],"steps":["Corte a batata-doce em rodelas, tempere e asse a 200 °C por 20 minutos.","Tempere o salmão com sal, limão e alecrim.","Coloque o salmão sobre as batatas e asse por mais 12 minutos."],"servings":2,"allergens":["peixe"]}'::jsonb where content_id = public.seed_uuid('content:g5');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Grão-de-bico cozido","qty":"2 xícaras"},{"item":"Cenoura, abobrinha e chuchu","qty":"1 de cada"},{"item":"Cebola","qty":"1"},{"item":"Caldo de legumes caseiro ou água","qty":"1,5 L"},{"item":"Azeite e sal","qty":"a gosto"}],"steps":["Refogue a cebola no azeite.","Adicione os legumes picados e o caldo; cozinhe 25 minutos.","Junte o grão-de-bico, ajuste o sal e cozinhe mais 10 minutos.","Porcione e congele em potes individuais."],"servings":6}'::jsonb where content_id = public.seed_uuid('content:g6');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Carne moída","qty":"500 g"},{"item":"Abóbora cabotiá","qty":"400 g"},{"item":"Cebola e alho","qty":"1 e 2 dentes"},{"item":"Arroz integral cozido","qty":"2 xícaras"},{"item":"Brócolis","qty":"1 xícara"}],"steps":["Refogue cebola e alho, junte a carne e cozinhe até dourar.","Cozinhe a abóbora em cubos no vapor por 12 minutos.","Monte as marmitas: arroz, carne, abóbora e brócolis.","Congele por até 30 dias."],"servings":5}'::jsonb where content_id = public.seed_uuid('content:g8');
update public.content_bodies set body = body || '{"ingredients":[{"item":"Banana madura","qty":"1"},{"item":"Ovo","qty":"1"},{"item":"Aveia em flocos","qty":"3 colheres de sopa"},{"item":"Canela","qty":"a gosto"}],"steps":["Amasse a banana e misture com o ovo e a aveia.","Despeje porções pequenas em frigideira antiaderente.","Doure 2 minutos de cada lado."],"servings":1,"prep_minutes":5,"cook_minutes":8,"allergens":["ovo","glúten (aveia pode conter)"]}'::jsonb where content_id = public.seed_uuid('content:g9');

-- ---------------------------------------------------------------- programas (8)
create temporary table seed_program (key text, creator text, pillar public.pillar, title text, summary text, weeks int, cover int, featured int,
  required text[], optional text[]);
insert into seed_program values
  ('p1','lia','routine','Manhãs com Intenção','Sete dias para construir um começo de dia calmo e repetível.',1,1,1,'{r1,r4,r2,r9}','{r5}'),
  ('p2','rafael','routine','Reset de Hábitos em 21 dias','Um ciclo de três semanas para revisar, simplificar e sustentar hábitos.',3,2,null,'{r3,r7,r4}','{r8,r10}'),
  ('p3','camila','training','Base de Força — 4 semanas','Padrões fundamentais de força com progressão segura para iniciantes.',4,1,2,'{t5,t1,t3}','{t6,t9}'),
  ('p4','tiago','training','Do Sofá aos 5 km','Caminhada-corrida progressiva para completar 5 km com conforto.',6,2,null,'{t8,t2,t4}','{t10,t7}'),
  ('p5','bruna','nutrition','Fundamentos da Nutrição Real','Conceitos práticos para escolher melhor, sem dietas da moda.',2,1,3,'{n1,n3,n10}','{n8,n6}'),
  ('p6','davi','nutrition','Hidratação e Energia','Hábitos de hidratação e refeições que sustentam o dia.',1,2,null,'{n2,n7}','{n5,n9}'),
  ('p7','helena','gastronomy','Cozinha de Base: preparos essenciais','Técnicas e receitas-base para cozinhar com confiança.',2,1,4,'{g7,g3,g4,g1}','{g10,g9}'),
  ('p8','marcos','gastronomy','Marmitas da Semana','Organize a semana com preparos congeláveis e equilibrados.',1,2,null,'{g2,g4}','{g6,g8,g5}');

insert into public.programs (id, slug, creator_id, pillar, cover_url, status, is_featured, featured_rank)
select public.seed_uuid('program:' || key), public.slugify(title), public.seed_uuid('creator:' || creator), pillar,
  '/placeholders/cover-' || pillar::text || '-' || cover || '.svg', 'published', featured is not null, featured
from seed_program
on conflict (id) do update set is_featured = excluded.is_featured, featured_rank = excluded.featured_rank;

insert into public.program_versions (id, program_id, version_no, title, summary, description, estimated_weeks, status, published_at)
select public.seed_uuid('pv:' || key || ':1'), public.seed_uuid('program:' || key), 1, title, summary,
  summary || ' Participe no seu ritmo: os itens podem ser feitos em qualquer ordem. Conteúdo educativo; não substitui orientação profissional.',
  weeks, 'published', now() - interval '30 days'
from seed_program
on conflict (id) do update set title = excluded.title, summary = excluded.summary;

update public.programs p set current_version_id = public.seed_uuid('pv:' || sp.key || ':1')
from seed_program sp where p.id = public.seed_uuid('program:' || sp.key);

insert into public.program_items (id, version_id, content_id, position, section, is_required)
select public.seed_uuid('pi:' || sp.key || ':' || c.k), public.seed_uuid('pv:' || sp.key || ':1'), public.seed_uuid('content:' || c.k), c.pos,
  case when c.req then 'Essencial' else 'Para ir além' end, c.req
from seed_program sp
cross join lateral (
  select k, ord as pos, true as req from unnest(sp.required) with ordinality as r(k, ord)
  union all
  select k, 100 + ord, false from unnest(sp.optional) with ordinality as o(k, ord)
) c
on conflict (version_id, content_id) do nothing;

-- ---------------------------------------------------------------- interesses, conquistas
insert into public.interest_tags (tag, label, pillar, sort_order) values
  ('sono', '{"pt-BR":"Dormir melhor","en":"Sleep better","es":"Dormir mejor"}', 'routine', 10),
  ('habitos', '{"pt-BR":"Criar hábitos","en":"Build habits","es":"Crear hábitos"}', 'routine', 20),
  ('foco', '{"pt-BR":"Foco e planejamento","en":"Focus & planning","es":"Enfoque y planificación"}', 'routine', 30),
  ('autocuidado', '{"pt-BR":"Autocuidado","en":"Self-care","es":"Autocuidado"}', 'routine', 40),
  ('forca', '{"pt-BR":"Força","en":"Strength","es":"Fuerza"}', 'training', 50),
  ('corrida', '{"pt-BR":"Corrida","en":"Running","es":"Correr"}', 'training', 60),
  ('mobilidade', '{"pt-BR":"Mobilidade","en":"Mobility","es":"Movilidad"}', 'training', 70),
  ('iniciante', '{"pt-BR":"Começando do zero","en":"Starting from zero","es":"Empezando de cero"}', 'training', 80),
  ('planejamento', '{"pt-BR":"Planejar refeições","en":"Meal planning","es":"Planificar comidas"}', 'nutrition', 90),
  ('proteina', '{"pt-BR":"Proteína no dia a dia","en":"Everyday protein","es":"Proteína diaria"}', 'nutrition', 100),
  ('hidratacao', '{"pt-BR":"Hidratação","en":"Hydration","es":"Hidratación"}', 'nutrition', 110),
  ('praticidade', '{"pt-BR":"Praticidade","en":"Quick & practical","es":"Practicidad"}', 'nutrition', 120),
  ('marmita', '{"pt-BR":"Marmitas","en":"Meal prep","es":"Viandas"}', 'gastronomy', 130),
  ('basico', '{"pt-BR":"Cozinha de base","en":"Kitchen basics","es":"Cocina básica"}', 'gastronomy', 140),
  ('tecnica', '{"pt-BR":"Técnicas de chef","en":"Chef techniques","es":"Técnicas de chef"}', 'gastronomy', 150),
  ('cafe', '{"pt-BR":"Café da manhã","en":"Breakfast","es":"Desayuno"}', 'gastronomy', 160)
on conflict (tag) do update set label = excluded.label;

insert into public.achievements (id, code, name, description, icon, rule, sort_order) values
  (public.seed_uuid('ach:first'), 'first_step', 'Primeiro passo', 'Concluiu o primeiro conteúdo.', 'footprints', '{"kind":"completions","count":1}', 10),
  (public.seed_uuid('ach:five'), 'five_done', 'Em movimento', 'Concluiu 5 conteúdos.', 'flame', '{"kind":"completions","count":5}', 20),
  (public.seed_uuid('ach:ten'), 'ten_done', 'Constante', 'Concluiu 10 conteúdos.', 'mountain', '{"kind":"completions","count":10}', 30),
  (public.seed_uuid('ach:streak3'), 'streak_3', 'Três dias seguidos', 'Atividade válida em 3 dias consecutivos.', 'calendar-check', '{"kind":"streak","days":3}', 40),
  (public.seed_uuid('ach:streak7'), 'streak_7', 'Uma semana inteira', 'Atividade válida em 7 dias consecutivos.', 'sparkles', '{"kind":"streak","days":7}', 50),
  (public.seed_uuid('ach:streak14'), 'streak_14', 'Duas semanas', 'Atividade válida em 14 dias consecutivos.', 'trophy', '{"kind":"streak","days":14}', 60),
  (public.seed_uuid('ach:program'), 'program_done', 'Programa concluído', 'Concluiu um programa completo.', 'award', '{"kind":"program_completed","count":1}', 70)
on conflict (id) do update set name = excluded.name, description = excluded.description, rule = excluded.rule;

-- ---------------------------------------------------------------- comércio demonstrativo
insert into public.seller_organizations (id, slug, name, kind, description, logo_url, is_fictional) values
  (public.seed_uuid('seller:own'), 'ultra-hero-oficial', 'Ultra Hero Oficial', 'own', 'Operação própria demonstrativa, governada pela administração.', '/placeholders/product-1.svg', true),
  (public.seed_uuid('seller:vertice'), 'cozinha-vertice', 'Cozinha Vértice', 'partner', 'Fornecedor fictício de refeições prontas para a demonstração.', '/placeholders/product-2.svg', true),
  (public.seed_uuid('seller:horta'), 'horta-base', 'Horta Base', 'partner', 'Fornecedor fictício de kits de ingredientes para a demonstração.', '/placeholders/product-3.svg', true),
  (public.seed_uuid('seller:forja'), 'forja-fit', 'Forja Fit Equipamentos', 'partner', 'Fornecedor fictício de acessórios de treino e lifestyle para a demonstração.', '/placeholders/product-4.svg', true)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.product_categories (id, code, name, kind, is_food, sort_order) values
  (public.seed_uuid('cat:meal'), 'meal', '{"pt-BR":"Refeições prontas","en":"Ready meals","es":"Comidas listas"}', 'meal', true, 10),
  (public.seed_uuid('cat:kit'), 'ingredient_kit', '{"pt-BR":"Kits de ingredientes","en":"Ingredient kits","es":"Kits de ingredientes"}', 'ingredient_kit', true, 20),
  (public.seed_uuid('cat:accessory'), 'training_accessory', '{"pt-BR":"Acessórios de treino","en":"Training accessories","es":"Accesorios de entrenamiento"}', 'training_accessory', false, 30),
  (public.seed_uuid('cat:lifestyle'), 'lifestyle', '{"pt-BR":"Lifestyle","en":"Lifestyle","es":"Lifestyle"}', 'lifestyle', false, 40)
on conflict (id) do update set name = excluded.name;

create temporary table seed_product (key text, seller text, cat text, title text, description text, price int, ptype text, stock int, img int, food jsonb, attrs jsonb);
insert into seed_product values
  ('m1','vertice','meal','Bowl de frango com legumes (350 g)','Frango grelhado, legumes assados e molho de ervas. Congelado, pronto em 4 minutos. Produto demonstrativo.',2890,'physical',40,1,'{"ingredients":["frango","abobrinha","cenoura","batata-doce","azeite","ervas"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m2','vertice','meal','Marmita de carne moída com abóbora (380 g)','Carne moída, abóbora, arroz integral e brócolis. Produto demonstrativo.',2990,'physical',40,2,'{"ingredients":["carne bovina","abóbora","arroz integral","brócolis"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":380}'),
  ('m3','vertice','meal','Omelete de forno com espinafre (2 porções)','Ovos, espinafre, tomate e queijo branco. Produto demonstrativo.',1990,'physical',30,3,'{"ingredients":["ovos","espinafre","tomate","queijo branco"],"allergens":["ovo","leite"],"storage":"Refrigerado por 4 dias ou congelado por 30."}','{"weight_g":300}'),
  ('m4','vertice','meal','Salmão com batata-doce (350 g)','Salmão assado, batata-doce e alecrim. Produto demonstrativo.',3990,'physical',20,4,'{"ingredients":["salmão","batata-doce","azeite","alecrim"],"allergens":["peixe"],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m5','vertice','meal','Sopa de legumes com grão-de-bico (500 ml)','Sopa de panela única, congelada em porção individual. Produto demonstrativo.',1890,'physical',50,1,'{"ingredients":["grão-de-bico","cenoura","abobrinha","chuchu","cebola"],"allergens":[],"storage":"Congelado a -18 °C por até 60 dias."}','{"volume_ml":500}'),
  ('m6','own','meal','Frango desfiado com arroz integral (350 g)','Marmita da operação própria demonstrativa. Produto demonstrativo.',2690,'physical',40,2,'{"ingredients":["frango","arroz integral","cenoura","ervilha"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m7','own','meal','Strogonoff leve de frango (350 g)','Versão leve com iogurte e cogumelos. Produto demonstrativo.',2890,'physical',30,3,'{"ingredients":["frango","cogumelos","iogurte","tomate"],"allergens":["leite"],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":350}'),
  ('m8','own','meal','Escondidinho de abóbora com carne (380 g)','Purê de abóbora com carne moída temperada. Produto demonstrativo.',2990,'physical',30,4,'{"ingredients":["abóbora","carne bovina","cebola","alho"],"allergens":[],"storage":"Congelado a -18 °C por até 30 dias."}','{"weight_g":380}'),
  ('k1','horta','kit','Kit molho de ervas (ervas secas + azeite 250 ml)','Tudo para o molho coringa da cozinha de base. Produto demonstrativo.',3490,'kit',25,1,'{"ingredients":["salsinha desidratada","cebolinha desidratada","azeite extravirgem","alho desidratado"],"allergens":[],"storage":"Local seco e fresco."}','{"items":4}'),
  ('k2','horta','kit','Kit arroz integral + lentilha (1 kg + 500 g)','Base para a semana inteira. Produto demonstrativo.',2490,'kit',40,2,'{"ingredients":["arroz integral","lentilha"],"allergens":[],"storage":"Local seco; após aberto, pote fechado."}','{"items":2}'),
  ('k3','horta','kit','Kit panqueca de aveia (aveia, canela, fermento)','Para a panqueca de três ingredientes. Produto demonstrativo.',1990,'kit',40,3,'{"ingredients":["aveia em flocos","canela","fermento"],"allergens":["glúten (contaminação cruzada)"],"storage":"Local seco e fresco."}','{"items":3}'),
  ('k4','horta','kit','Kit sopa (mix de legumes desidratados 300 g)','Mix pronto para a sopa de panela única. Produto demonstrativo.',2290,'kit',35,4,'{"ingredients":["cenoura","abobrinha","cebola","grão-de-bico desidratados"],"allergens":[],"storage":"Local seco e fresco."}','{"items":1}'),
  ('k5','own','kit','Mix de sementes para bowls (200 g)','Gergelim, girassol e abóbora. Produto demonstrativo.',1790,'kit',60,1,'{"ingredients":["gergelim","semente de girassol","semente de abóbora"],"allergens":["gergelim"],"storage":"Pote fechado, longe da luz."}','{"items":1}'),
  ('k6','own','kit','Kit temperos sem sal (4 potes)','Misturas de ervas e especiarias sem sal adicionado. Produto demonstrativo.',2990,'kit',50,2,'{"ingredients":["páprica","cominho","orégano","alho","cebola","pimenta"],"allergens":[],"storage":"Local seco e fresco."}','{"items":4}'),
  ('a1','forja','accessory','Elástico de resistência (3 níveis)','Conjunto com três resistências para progressões em casa. Produto demonstrativo.',5990,'physical',30,3,null,'{"levels":3,"material":"látex"}'),
  ('a2','forja','accessory','Tapete de treino 6 mm','Antiderrapante, 180 × 60 cm. Produto demonstrativo.',8990,'physical',20,4,null,'{"thickness_mm":6}'),
  ('a3','forja','accessory','Corda de pular ajustável','Cabo de aço revestido, ajuste rápido. Produto demonstrativo.',3990,'physical',40,1,null,'{"adjustable":true}'),
  ('a4','forja','accessory','Rolo de liberação miofascial','Densidade média, 33 cm. Produto demonstrativo.',7990,'physical',15,2,null,'{"length_cm":33}'),
  ('a5','forja','accessory','Garrafa 1 L com marcador de horário','Lembrete visual de hidratação ao longo do dia. Produto demonstrativo.',4990,'physical',50,3,null,'{"volume_ml":1000}'),
  ('a6','own','accessory','Par de halteres 3 kg','Revestidos em vinil. Produto demonstrativo.',9990,'physical',10,4,null,'{"weight_kg":3}'),
  ('l1','own','lifestyle','Caderno de rotina Ultra Hero','Planejador semanal com revisão de hábitos. Produto demonstrativo.',4990,'physical',40,1,null,'{"pages":120}'),
  ('l2','own','lifestyle','Camiseta Ultra Hero (algodão)','Corte unissex, tamanhos P a GG. Produto demonstrativo.',7990,'physical',40,2,null,'{"sizes":["P","M","G","GG"]}'),
  ('l3','forja','lifestyle','Máscara de dormir','Tecido macio, elástico ajustável. Produto demonstrativo.',2990,'physical',60,3,null,'{"color":"preto"}'),
  ('l4','forja','lifestyle','Boné para corrida','Leve, com proteção UV. Produto demonstrativo.',5990,'physical',30,4,null,'{"uv":true}');

insert into public.products (id, seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, demo_stock, published_at)
select public.seed_uuid('product:' || key), public.seed_uuid('seller:' || seller), public.seed_uuid('cat:' || cat), public.slugify(title) || '-' || key, title, description,
  '/placeholders/product-' || img || '.svg', price, ptype, attrs, food, 'published', 'available', stock, now() - interval '20 days'
from seed_product
on conflict (id) do update set title = excluded.title, description = excluded.description, price_cents_demo = excluded.price_cents_demo, attributes = excluded.attributes, food_info = excluded.food_info;

-- um produto indisponível para demonstrar o bloqueio no checkout
update public.products set availability = 'unavailable' where id = public.seed_uuid('product:a6');

-- vínculos conteúdo–produto (estados variados para demonstração)
insert into public.content_product_links (id, content_id, product_id, status, note, validated_at, product_version_at_validation)
select public.seed_uuid('link:' || c || ':' || p), public.seed_uuid('content:' || c), public.seed_uuid('product:' || p), s::public.link_status, n,
  case when s = 'validated' then now() - interval '10 days' end, case when s = 'validated' then 1 end
from (values
  ('g1','m1','validated','Bowl da receita, versão pronta'), ('g8','m2','validated','Marmita da receita'), ('g2','m3','validated','Omelete pronto'),
  ('g5','m4','validated','Salmão pronto'), ('g6','m5','validated','Sopa pronta'), ('g6','k4','validated','Kit para fazer em casa'),
  ('g3','k1','validated','Kit do molho'), ('g4','k2','validated','Arroz e lentilha'), ('g9','k3','validated','Kit da panqueca'),
  ('t9','a1','validated','Elástico usado no treino'), ('t1','a2','validated','Tapete para o treino'), ('t4','a3','suggested','Sugestão da personalidade'),
  ('n2','a5','validated','Garrafa com marcador'), ('r2','l3','validated','Máscara para a rotina noturna'), ('r8','l1','suggested','Caderno para a revisão semanal'),
  ('t3','a6','suspended','Produto indisponível; vínculo suspenso para demonstração')
) v(c, p, s, n)
on conflict (content_id, product_id) do update set status = excluded.status, note = excluded.note;

insert into public.demo_destinations (id, code, name, zone, description, sort_order) values
  (public.seed_uuid('dest:centro'), 'centro', '{"pt-BR":"Centro — Zona Demo","en":"Downtown — Demo Zone","es":"Centro — Zona Demo"}', 'local', '{"pt-BR":"Destino fictício local","en":"Fictional local destination","es":"Destino ficticio local"}', 10),
  (public.seed_uuid('dest:norte'), 'norte', '{"pt-BR":"Bairro Norte — Zona Demo","en":"North District — Demo Zone","es":"Barrio Norte — Zona Demo"}', 'local', '{"pt-BR":"Destino fictício local","en":"Fictional local destination","es":"Destino ficticio local"}', 20),
  (public.seed_uuid('dest:litoral'), 'litoral', '{"pt-BR":"Litoral — Zona Regional","en":"Coast — Regional Zone","es":"Litoral — Zona Regional"}', 'regional', '{"pt-BR":"Destino fictício regional","en":"Fictional regional destination","es":"Destino ficticio regional"}', 30),
  (public.seed_uuid('dest:interior'), 'interior', '{"pt-BR":"Interior — Zona Regional","en":"Countryside — Regional Zone","es":"Interior — Zona Regional"}', 'regional', '{"pt-BR":"Destino fictício regional","en":"Fictional regional destination","es":"Destino ficticio regional"}', 40),
  (public.seed_uuid('dest:nacional'), 'nacional', '{"pt-BR":"Outra região — Nacional","en":"Other region — National","es":"Otra región — Nacional"}', 'national', '{"pt-BR":"Destino fictício nacional","en":"Fictional national destination","es":"Destino ficticio nacional"}', 50)
on conflict (id) do update set name = excluded.name;

insert into public.demo_shipping_rules (zone, base_cents, per_seller_cents, eta_days_min, eta_days_max, free_over_cents) values
  ('local', 990, 490, 1, 2, 15000), ('regional', 1990, 690, 2, 4, 25000), ('national', 2990, 990, 4, 7, null)
on conflict (zone) do update set base_cents = excluded.base_cents, per_seller_cents = excluded.per_seller_cents;

drop function public.seed_body(public.content_type, text, text, text);
drop table if exists seed_content, seed_program, seed_product;


-- 0009_system_grants
-- =============================================================================
-- Ultra Hero · 0009 · Grants para rotinas de sistema e renovação em lote
-- O service role (usado só no servidor: cron, recomendações) precisa executar
-- funções que foram revogadas de public. Transporte simulado pode ser avançado
-- por qualquer usuário autenticado (operação idempotente, baseada em tempo).
-- =============================================================================

grant execute on function public.advance_simulated_transport(int) to service_role, authenticated;
grant execute on function public.run_retention() to service_role;
grant execute on function public.anonymize_user_data(uuid) to service_role;
grant execute on function public.recompute_order_status(uuid) to service_role;
grant execute on function public.audit_log(text, text, text, jsonb, jsonb, text, public.actor_type) to service_role;
grant execute on function public.sync_subscription(uuid) to service_role;

-- Renovação simulada em lote (cron diário). Idempotente.
create or replace function public.sync_all_subscriptions()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id from public.simulated_subscriptions
           where current_period_end <= now() and status in ('active', 'cancelled') loop
    perform public.sync_subscription(r.user_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.sync_all_subscriptions() from public, anon, authenticated;
grant execute on function public.sync_all_subscriptions() to service_role;

-- Recalcular recomendações exige ler o catálogo e gravar em user_recommendations
-- (service role, bypass de RLS). Nenhum grant extra necessário.


-- 0010_trusted_guard
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


-- 0011_search_difficulty_progress
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


-- 0012_admin_helpers
-- =============================================================================
-- Ultra Hero · 0012 · Lacunas apontadas pela administração
-- usuário por id, e-mails em lote, revogação de membro auditada, auditoria de
-- cadastro de parceiros (trigger), convite não aceita parceiro suspenso,
-- métrica de ativação respeitando a janela, rate limit de IA em public_settings.
-- =============================================================================

create or replace function public.admin_get_user(p_id uuid)
returns table (id uuid, email text, display_name text, avatar_url text, locale public.locale_code, timezone text,
               created_at timestamptz, last_sign_in_at timestamptz, roles jsonb, anonymized boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, p.avatar_url, p.locale, p.timezone, u.created_at, u.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id))
                   from public.role_assignments r where r.user_id = u.id and r.revoked_at is null), '[]'::jsonb),
         p.anonymized_at is not null
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin() and u.id = p_id
$$;

create or replace function public.admin_user_emails(p_ids uuid[])
returns table (id uuid, email text, display_name text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin() and u.id = any (p_ids)
$$;

-- Revoga membro E o papel escopado, com auditoria.
create or replace function public.admin_revoke_membership(p_membership uuid, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m public.seller_memberships%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.seller_memberships where id = p_membership for update;
  if not found then raise exception 'membership_not_found'; end if;
  update public.seller_memberships set revoked_at = coalesce(revoked_at, now()) where id = m.id;
  update public.role_assignments set revoked_at = coalesce(revoked_at, now())
  where user_id = m.user_id and role = 'seller' and scope_id = m.org_id;
  perform public.audit_log('seller.revoke_membership', 'seller_membership', m.id::text,
    jsonb_build_object('user_id', m.user_id, 'org_id', m.org_id), null, p_justification);
end $$;

-- Auditoria automática de cadastro/edição de parceiros feitos pelo admin via API.
create or replace function public.audit_partner_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', tg_table_name || '.' || lower(tg_op), tg_table_name,
          coalesce(new.id, old.id)::text,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
drop trigger if exists trg_audit_creator_profiles on public.creator_profiles;
create trigger trg_audit_creator_profiles after insert or update or delete on public.creator_profiles
  for each row execute function public.audit_partner_changes();
drop trigger if exists trg_audit_seller_orgs on public.seller_organizations;
create trigger trg_audit_seller_orgs after insert or update or delete on public.seller_organizations
  for each row execute function public.audit_partner_changes();

-- Convite não ativa parceiro suspenso.
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
  if v_inv.role = 'seller' and exists (select 1 from public.seller_organizations o where o.id = v_inv.seller_org_id and o.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role = 'creator' and exists (select 1 from public.creator_profiles c where c.id = v_inv.creator_profile_id and c.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;

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

-- Rate limit de IA é configuração pública (não sensível).
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('commerce.enabled', 'ai.enabled', 'experiment.open', 'ai.provider', 'video.provider', 'ai.rate_limit_per_hour', 'transport.minutes_per_step')
$$;

grant execute on function public.admin_get_user(uuid), public.admin_user_emails(uuid[]), public.admin_revoke_membership(uuid, text) to authenticated;

-- Métrica de ativação respeitando a janela (+ total acumulado).
create or replace function public.admin_metrics(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb; v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'window_days', p_days,
    'signups', (select count(*) from auth.users where created_at >= v_since),
    'signups_total', (select count(*) from auth.users),
    'activated_users_distinct', (select count(*) from (select user_id from public.completions where completed_at >= v_since union select user_id from public.content_progress where updated_at >= v_since) t),
    'activated_users_total', (select count(*) from (select user_id from public.completions union select user_id from public.content_progress) t),
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


-- 0013_bodies_policy_link_note
-- =============================================================================
-- Ultra Hero · 0013 · Ajustes apontados pelos portais
-- 1) personalidade não altera o corpo enquanto o conteúdo está em revisão;
-- 2) nota do admin no vínculo fica separada da nota da personalidade.
-- =============================================================================

drop policy if exists content_bodies_write on public.content_bodies;
create policy content_bodies_write on public.content_bodies for all to authenticated
  using (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id()
                                      and c.status = 'draft' and c.review_status <> 'in_review'))
  with check (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id()
                                           and c.status = 'draft' and c.review_status <> 'in_review'));

alter table public.content_product_links add column if not exists admin_note text;

create or replace function public.admin_set_link_status(p_link uuid, p_status public.link_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_version int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(l) into v_before from public.content_product_links l where id = p_link;
  if v_before is null then raise exception 'link_not_found'; end if;
  select version into v_version from public.products where id = (v_before ->> 'product_id')::uuid;
  update public.content_product_links
  set status = p_status, admin_note = coalesce(p_note, admin_note),
      validated_by = case when p_status = 'validated' then auth.uid() else validated_by end,
      validated_at = case when p_status = 'validated' then now() else validated_at end,
      product_version_at_validation = case when p_status = 'validated' then v_version else product_version_at_validation end,
      suspended_reason = case when p_status = 'suspended' then coalesce(p_note, 'admin') else null end
  where id = p_link;
  perform public.audit_log('link.set_status', 'content_product_link', p_link::text, v_before, jsonb_build_object('status', p_status), p_note);
end $$;


-- 0014_transport_grant_nav
-- =============================================================================
-- Ultra Hero · 0014 · Garante grant do transporte simulado para usuários autenticados
-- (idempotente; operação baseada em tempo, sem efeito além de avançar a simulação)
-- =============================================================================
grant execute on function public.advance_simulated_transport(int) to authenticated, service_role;


-- 0015_experiment_gate_suspension
-- =============================================================================
-- Ultra Hero · 0015 · Kill switch de cadastro no banco + suspensão auditada de contas
--   * "experiment.open" = false fecha o cadastro DE VERDADE: o trigger de novo
--     usuário (auth.users) recusa contas que não estejam na lista de bootstrap
--     nem tenham convite pendente e válido. Vale para qualquer caminho de criação
--     (signUp direto com a chave publicável, OAuth, painel), porque mora no banco.
--     Setting ausente = aberto.
--   * admin_get_user passa a devolver banned_until (suspensão feita pelo Auth
--     Admin API no servidor) e admin_log_account_status registra a suspensão/
--     reativação na auditoria, com justificativa obrigatória.
-- =============================================================================

-- ---------------------------------------------------------------- novo usuário
-- Definição de 0001_foundation.sql preservada; o portão do experimento vem antes de tudo.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_bootstrap_admin boolean;
        v_experiment_open jsonb;
        v_email text := lower(coalesce(new.email, ''));
begin
  -- Portão do experimento: fechado => só bootstrap admin, convite pendente não expirado
  -- ou conta demo criada pelo admin no servidor (app_metadata.ultra_hero_demo = true;
  -- app_metadata só é gravável com a service role, nunca pelo cadastro público).
  -- Fechado = false (booleano) ou "false" (texto, sem diferenciar maiúsculas/espaços). Ausente/null = aberto.
  select s.value into v_experiment_open from public.app_settings s where s.key = 'experiment.open';
  if lower(btrim(coalesce(v_experiment_open #>> '{}', ''))) = 'false' then
    if coalesce(new.raw_app_meta_data ->> 'ultra_hero_demo', '') <> 'true'
       and not exists (
         select 1 from public.app_settings s
         where s.key = 'bootstrap_admin_emails' and s.value ? v_email
       )
       and not exists (
         select 1 from public.invitations i
         where lower(i.email::text) = v_email and i.status = 'pending' and i.expires_at > now()
       ) then
      raise exception 'experiment_closed'
        using hint = 'Cadastro fechado (experiment.open = false): apenas convidados, e-mails de bootstrap ou contas demo criadas pelo admin.';
    end if;
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (id) do nothing;

  -- toda conta nova é consumidora, nível gratuito
  insert into public.role_assignments (user_id, role, scope_type)
  values (new.id, 'consumer', 'global') on conflict do nothing;

  -- admin de bootstrap: lista controlada em app_settings (auditável), nunca por autoatendimento
  select exists (
    select 1 from public.app_settings s
    where s.key = 'bootstrap_admin_emails' and s.value ? lower(coalesce(new.email, ''))
  ) into v_is_bootstrap_admin;
  if v_is_bootstrap_admin then
    insert into public.role_assignments (user_id, role, scope_type)
    values (new.id, 'admin', 'global') on conflict do nothing;
    insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, after_data)
    values (new.id, 'system', 'role.bootstrap_admin', 'user', new.id::text, jsonb_build_object('email', lower(new.email)));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- usuário por id (+ banned_until)
-- Mudança de tipo de retorno exige drop + create (e refazer o grant).
drop function if exists public.admin_get_user(uuid);
create function public.admin_get_user(p_id uuid)
returns table (id uuid, email text, display_name text, avatar_url text, locale public.locale_code, timezone text,
               created_at timestamptz, last_sign_in_at timestamptz, roles jsonb, anonymized boolean,
               banned_until timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, p.avatar_url, p.locale, p.timezone, u.created_at, u.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id))
                   from public.role_assignments r where r.user_id = u.id and r.revoked_at is null), '[]'::jsonb),
         p.anonymized_at is not null,
         u.banned_until
  from auth.users u left join public.profiles p on p.id = u.id
  where public.is_admin() and u.id = p_id
$$;
revoke execute on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated;

-- ---------------------------------------------------------------- suspensão auditada
-- A suspensão em si é feita pelo servidor (Auth Admin API, service role: ban_duration).
-- Esta RPC registra a mudança na auditoria em nome do admin autenticado e recusa os
-- casos proibidos (justificativa vazia, suspender a si mesmo ou um admin ativo).
-- Só audita o estado real do Auth: "suspensa" exige banned_until no futuro e
-- "reativada" exige banned_until vazio/vencido (sem registro de mudança que não houve).
create or replace function public.admin_log_account_status(p_user uuid, p_suspended boolean, p_justification text)
returns void language plpgsql security definer set search_path = public as $$
declare v_banned_until timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_suspended is null then raise exception 'invalid_input'; end if;
  if coalesce(btrim(p_justification), '') = '' then raise exception 'justification_required'; end if;
  select u.banned_until into v_banned_until from auth.users u where u.id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  if p_suspended and p_user = auth.uid() then raise exception 'cannot_suspend_self'; end if;
  if p_suspended and exists (
    select 1 from public.role_assignments r
    where r.user_id = p_user and r.role = 'admin' and r.revoked_at is null
  ) then
    raise exception 'cannot_suspend_admin';
  end if;
  if p_suspended is distinct from coalesce(v_banned_until > now(), false) then
    raise exception 'account_status_mismatch';
  end if;

  perform public.audit_log(
    case when p_suspended then 'user.suspend' else 'user.reactivate' end,
    'user', p_user::text, null,
    jsonb_build_object('suspended', p_suspended, 'banned_until', v_banned_until),
    btrim(p_justification));
end $$;
revoke execute on function public.admin_log_account_status(uuid, boolean, text) from public, anon;
grant execute on function public.admin_log_account_status(uuid, boolean, text) to authenticated;


-- limpeza de objetos criados durante a depuração do conector MCP
drop schema if exists mig_tmp cascade;
do $cleanup$ declare r record; begin for r in select p.oid::regprocedure as f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '\_diag\_%' loop execute 'drop function ' || r.f; end loop; end $cleanup$;

-- registro no histórico de migrations
insert into supabase_migrations.schema_migrations (version, name) values ('20261020160005', '0005_commerce_functions'), ('20261020160006', '0006_ops'), ('20261020160007', '0007_rls'), ('20261020160008', '0008_seed'), ('20261020160009', '0009_system_grants'), ('20261020160010', '0010_trusted_guard'), ('20261020160011', '0011_search_difficulty_progress'), ('20261020160012', '0012_admin_helpers'), ('20261020160013', '0013_bodies_policy_link_note'), ('20261020160014', '0014_transport_grant_nav'), ('20261020160015', '0015_experiment_gate_suspension') on conflict do nothing;

commit;

select (select count(*) from public.content) as conteudos, (select count(*) from public.products) as produtos, (select count(*) from pg_policies where schemaname = 'public') as politicas, (select count(*) from pg_proc where proname in ('checkout_cart', 'admin_log_account_status')) as funcoes_chave;
