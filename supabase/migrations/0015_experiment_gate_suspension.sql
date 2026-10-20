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
  -- Portão do experimento: fechado => só bootstrap admin ou convite pendente não expirado.
  -- Fechado = false (booleano) ou "false" (texto, sem diferenciar maiúsculas/espaços). Ausente/null = aberto.
  select s.value into v_experiment_open from public.app_settings s where s.key = 'experiment.open';
  if lower(btrim(coalesce(v_experiment_open #>> '{}', ''))) = 'false' then
    if not exists (
         select 1 from public.app_settings s
         where s.key = 'bootstrap_admin_emails' and s.value ? v_email
       )
       and not exists (
         select 1 from public.invitations i
         where lower(i.email::text) = v_email and i.status = 'pending' and i.expires_at > now()
       ) then
      raise exception 'experiment_closed'
        using hint = 'Cadastro fechado (experiment.open = false): apenas convidados ou e-mails de bootstrap.';
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
