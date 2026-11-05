-- =============================================================================
-- 0097 — Portal do Hero único: "creator" é o próprio Hero
-- Decisão do responsável: o CREATOR nada mais é do que o HERO. Para o usuário não existe mais "creator": a área do
-- Hero (/creator) e o escritório do casting (/creator/escritorio) viraram um portal só, o Portal do Hero (/heroi),
-- e o convite do admin passou a ter 7 papéis (sem "Creator" separado de "Hero").
-- O que muda no banco (pouco, de propósito):
--   * admin_invite(p_email, p_role, p_days, p_options) — mesma assinatura. O papel 'hero' ganha p_options.hero_mode:
--       'new'     (padrão, = 0091): Hero novo pendente de aprovação, a pessoa vira titular, equipe opcional;
--       'team'    : entrar na equipe de um Hero existente (= ramo 'creator'/'existing' da 0091: titular se o Hero não
--                   tem titular nem convite de titular pendente; senão membro);
--       'casting' : Hero que já está no casting de uma agência → convite de acesso à ficha (mesma forma e mesmas
--                   regras do convite da agência, agency_invite_talent da 0087: sem login na ficha, Hero ligado sem
--                   conta, sem convite de Hero pendente; o convite novo substitui os pendentes da mesma ficha).
--     O ramo 'creator' continua aceito (telas antigas, convites já emitidos seguem pelo mesmo aceite).
--   * admin_invite_talent_options(): fichas do casting que podem receber o convite (só o admin geral; o admin não lê
--     talent_profiles pela RLS). Devolve só nome, agência e se tem Hero ligado — nada de valores nem contatos.
-- O que NÃO muda: tabelas e identificadores internos (creator_profiles, talent_profiles, app_role 'creator', RPCs,
-- pastas). Renomear o banco não traz ganho ao usuário e arrisca tudo. Os links que as funções gravam nos avisos
-- (inbox_notifications.link = '/creator/escritorio/...') também ficam: o app traduz para /heroi ao mostrar e o
-- middleware redireciona (308) os links já enviados por e-mail e push; as regras de push/e-mail do banco seguem
-- casando '/creator/escritorio%'.
-- Regras: nada de drop; search_path fixo; nenhuma função nova com execute para anon (S14 segue 18).
-- =============================================================================

-- 1) convite do admin: 'hero' com hero_mode new | team | casting --------------------------------------------------------
create or replace function public.admin_invite(p_email text, p_role text, p_days int, p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_opt jsonb := coalesce(p_options, '{}'::jsonb); v_out jsonb := '[]'::jsonb; v_inv jsonb; v_hero uuid; v_mode text;
        v_owner uuid; v_team_user uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_talent uuid; v_t record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('consumer', 'admin', 'agency', 'brand', 'creator', 'hero', 'seller', 'professional') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;

  if p_role = 'admin' then
    if p_days > 2 then raise exception 'admin_invite_max_48h' using errcode = '22023'; end if;
    if coalesce((v_opt ->> 'confirm_admin')::boolean, false) is not true then raise exception 'admin_confirm_required' using errcode = '22023'; end if;
    v_inv := public.invitation_issue(v_email, 'admin', 'admin', p_days, '{}'::jsonb);
    perform public.audit_log('invitation.create_admin', 'invitation', v_inv ->> 'id', null,
      jsonb_build_object('email', v_email, 'role', 'admin', 'expires_hours', p_days * 24, 'full_control', true), null, 'admin');
    return jsonb_build_object('invitations', jsonb_build_array(v_inv));
  elsif p_role = 'consumer' then
    v_out := jsonb_build_array(public.invitation_issue(v_email, 'consumer', 'consumer', p_days, '{}'::jsonb));
  elsif p_role in ('agency', 'brand', 'seller', 'professional') then
    -- a empresa/perfil nasce no primeiro acesso
    v_out := jsonb_build_array(public.invitation_issue(v_email, p_role, 'onboarding', p_days, '{}'::jsonb));
  elsif p_role = 'creator' or (p_role = 'hero' and coalesce(v_opt ->> 'hero_mode', 'new') = 'team') then
    -- 'creator' (0091, convites antigos) ou Hero → equipe de um Hero existente
    v_mode := case when p_role = 'hero' then 'existing' else coalesce(v_opt ->> 'hero_mode', 'none') end;
    if v_mode = 'none' then
      v_out := jsonb_build_array(public.invitation_issue(v_email, 'creator', 'creator', p_days, '{}'::jsonb));
    elsif v_mode = 'existing' then
      begin v_hero := (v_opt ->> 'hero_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      if v_hero is null then raise exception 'invalid_input' using errcode = '22023'; end if;
      select c.user_id into v_owner from public.creator_profiles c where c.id = v_hero and c.status <> 'suspended';
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
      -- Hero sem titular (e sem convite de titular pendente): a pessoa vira titular; senão, membro
      v_out := jsonb_build_array(public.invitation_issue(v_email, 'creator', 'creator', p_days, jsonb_build_object(
        'creator_profile_id', v_hero,
        'team_role', case when v_owner is null and not exists (select 1 from public.invitations i where i.creator_profile_id = v_hero
                            and i.status = 'pending' and i.expires_at >= now() and coalesce(i.team_role, 'owner') = 'owner')
                          then 'owner' else 'member' end)));
    elsif v_mode = 'new' then
      v_hero := public.create_pending_hero(v_opt ->> 'hero_name', null);
      v_out := jsonb_build_array(public.invitation_issue(v_email, 'creator', 'creator', p_days,
        jsonb_build_object('creator_profile_id', v_hero, 'team_role', 'owner')));
    else
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  elsif p_role = 'hero' and v_opt ->> 'hero_mode' = 'casting' then
    -- Hero que já está no casting de uma agência: convite de acesso à ficha (mesmas regras de agency_invite_talent)
    begin v_talent := (v_opt ->> 'talent_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_talent is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    select t.id, t.agency_id, t.user_id, t.creator_id, t.archived_at, c.user_id as creator_user, c.status::text as creator_status,
           a.status::text as agency_status
      into v_t
    from public.talent_profiles t
    join public.agencies a on a.id = t.agency_id
    left join public.creator_profiles c on c.id = t.creator_id
    where t.id = v_talent for update of t;
    if v_t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_t.archived_at is not null then raise exception 'talent_archived' using errcode = 'P0001'; end if;
    if v_t.agency_status <> 'active' then raise exception 'partner_suspended' using errcode = 'P0001'; end if;
    if public.agency_is_demo(v_t.agency_id) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
    if v_t.user_id is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
    if v_t.creator_id is not null then
      if v_t.creator_user is not null then raise exception 'creator_has_login' using errcode = 'P0001'; end if;
      if v_t.creator_status = 'suspended' then raise exception 'partner_suspended' using errcode = 'P0001'; end if;
      if exists (select 1 from public.invitations i where i.creator_profile_id = v_t.creator_id and i.status = 'pending' and i.expires_at >= now()) then
        raise exception 'hero_invite_pending' using errcode = 'P0001';
      end if;
    end if;
    -- convite novo substitui os pendentes da mesma ficha (como "reenviar" na agência)
    update public.invitations i set status = 'revoked', revoked_at = now() where i.status = 'pending' and i.talent_id = v_talent;
    v_out := jsonb_build_array(public.invitation_issue(v_email, 'creator', null, p_days,
      jsonb_build_object('agency_id', v_t.agency_id, 'talent_id', v_talent)));
    v_hero := v_t.creator_id;
  elsif p_role = 'hero' and coalesce(v_opt ->> 'hero_mode', 'new') = 'new' then
    v_hero := public.create_pending_hero(v_opt ->> 'hero_name', null);
    v_out := jsonb_build_array(public.invitation_issue(v_email, 'creator', 'hero', p_days,
      jsonb_build_object('creator_profile_id', v_hero, 'team_role', 'owner')));
    v_mode := coalesce(v_opt ->> 'team_mode', 'later');
    if v_mode = 'existing' then
      begin v_team_user := (v_opt ->> 'team_user_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      if not exists (select 1 from public.role_assignments r where r.user_id = v_team_user and r.role::text = 'creator' and r.revoked_at is null) then
        raise exception 'creator_role_required' using errcode = 'P0001';
      end if;
      insert into public.creator_team_members (creator_profile_id, user_id, role, status, created_by)
      values (v_hero, v_team_user, 'member', 'active', auth.uid())
      on conflict (creator_profile_id, user_id) do update set status = 'active', removed_at = null;
      perform set_config('app.trusted', 'on', true);
      insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
      values (v_team_user, 'creator', 'creator', v_hero, auth.uid())
      on conflict (user_id, role, scope_id) do update set revoked_at = null;
      perform set_config('app.trusted', 'off', true);
    elsif v_mode = 'new' then
      if lower(btrim(coalesce(v_opt ->> 'team_email', ''))) = v_email then raise exception 'invalid_input' using errcode = '22023'; end if;
      v_out := v_out || jsonb_build_array(public.invitation_issue(v_opt ->> 'team_email', 'creator', 'hero_team', p_days,
        jsonb_build_object('creator_profile_id', v_hero, 'team_role', 'member')));
    elsif v_mode <> 'later' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform public.audit_log('invitation.create', 'invitation', (v_out -> 0 ->> 'id'), null,
    jsonb_build_object('email', v_email, 'role', p_role, 'hero_mode', v_opt ->> 'hero_mode', 'creator_profile_id', v_hero,
                       'talent_id', v_talent, 'team_user_id', v_team_user,
                       'invitations', (select jsonb_agg(x - 'token') from jsonb_array_elements(v_out) x)), null, 'admin');
  return jsonb_strip_nulls(jsonb_build_object('invitations', v_out, 'creator_profile_id', v_hero, 'talent_id', v_talent));
end $$;
revoke execute on function public.admin_invite(text, text, int, jsonb) from public, anon;
grant execute on function public.admin_invite(text, text, int, jsonb) to authenticated, service_role;

-- 2) fichas do casting que podem receber o convite de acesso (só o admin geral) -------------------------------------------
create or replace function public.admin_invite_talent_options()
returns table (talent_id uuid, display_name text, agency_name text, has_hero boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select t.id, t.display_name, a.name, t.creator_id is not null
    from public.talent_profiles t
    join public.agencies a on a.id = t.agency_id and a.status = 'active'
    left join public.creator_profiles c on c.id = t.creator_id
    where t.archived_at is null and t.user_id is null
      and (t.creator_id is null or (c.user_id is null and c.status <> 'suspended'))
    order by t.display_name
    limit 500;
end $$;
revoke execute on function public.admin_invite_talent_options() from public, anon;
grant execute on function public.admin_invite_talent_options() to authenticated, service_role;
