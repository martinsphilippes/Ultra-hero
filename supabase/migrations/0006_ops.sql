-- =============================================================================
-- Ultra Hero · 0005 · Feedback, analytics, retenção, exclusão de conta,
-- assinaturas simuladas (funções), conteúdo (fluxo editorial), busca.
-- =============================================================================

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  context text not null,                       -- ex.: content:<id>, page:/explore
  rating int check (rating between 1 and 5),
  message text check (char_length(message) <= 1000),
  locale public.locale_code,
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  created_at timestamptz not null default now()
);
create index feedback_created_idx on public.feedback (created_at desc);

-- Eventos essenciais do experimento. Sem PII em properties (validado no servidor).
create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  anon_id text,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  locale public.locale_code,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index analytics_events_name_idx on public.analytics_events (event_name, created_at desc);
create index analytics_events_user_idx on public.analytics_events (user_id, created_at desc);
create index analytics_events_exp_idx on public.analytics_events (expires_at);

create table public.retention_jobs (
  id bigint generated always as identity primary key,
  job text not null,
  ran_at timestamptz not null default now(),
  affected int not null default 0,
  details jsonb
);

-- Exceções de retenção (evidência legal/incidente): escopo, justificativa, responsável, revisão.
create table public.retention_exceptions (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_id text not null,
  reason text not null,
  owner_id uuid references auth.users (id) on delete set null,
  review_at date not null,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'processed' check (status in ('pending', 'processed'))
);

-- ---------------------------------------------------------------- analytics --
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

-- ---------------------------------------------------------------- assinaturas: API do usuário
-- Seleciona conjunto de módulos (upgrade imediato; downgrade no fim do período).
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

-- ---------------------------------------------------------------- conteúdo: fluxo editorial
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

-- Decisão editorial: returned | approved (publica) | rejected
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

-- ---------------------------------------------------------------- busca ------
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

-- ---------------------------------------------------------------- retenção e exclusão
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

-- Exclusão self-service: anonimiza e remove a conta (auth.users cascade). Executa no servidor.
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

-- Job de retenção (cron diário): analytics 90d, pedidos 90d (anonimiza), auditoria 365d, runs/logs 30d.
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
