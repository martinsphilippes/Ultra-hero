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
