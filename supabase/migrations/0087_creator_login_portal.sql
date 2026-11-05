-- =============================================================================
-- Groscove Ultra · 0087 · Login do creator com Hero ligado (portal do creator)
--   Situação em produção: talentos com Hero ligado (0065/0070) cujo Hero não tem conta
--   (creator_profiles.user_id nulo). A ficha só mostrava o Hero e o convite do escritório só existia
--   para talento SEM Hero: o creator com Hero nunca recebia login.
--
--   Decisões (bloco 10, sem perguntar ao responsável):
--   * agency_invite_talent: MESMA assinatura (create or replace, sem sobrecarga). Passa a aceitar o
--     talento com Hero ligado quando o Hero não tem conta. O convite tem a mesma forma de antes
--     (papel creator + talent_id + agency_id, sem creator_profile_id): o check invitations_scope, a
--     leitura do gestor (invitations_select_agency_manager), a revogação (agency_invitation_revoke) e a
--     queda automática ao trocar/desligar o Hero ou arquivar o talento continuam valendo sem mudança.
--     Recusas novas: creator_has_login (o Hero já tem conta: ela já vê o escritório), partner_suspended
--     (Hero suspenso) e hero_invite_pending (o admin geral já convidou alguém para aquele Hero: a
--     agência não manda convite concorrente que ela nem enxerga). Só a agência que gere o talento convida
--     (talent_write_scope: de fora → not_found; colaborador → forbidden).
--   * accept_invitation_core: no ramo do convite de talento, se o talento tem Hero ligado, a conta é
--     ligada ao HERO (creator_profiles.user_id + papel creator escopo creator), como o convite de Hero
--     do admin já faz; o escritório abre por consequência (my_talent_id lê o dono do Hero). Sem Hero,
--     tudo como antes (talent_profiles.user_id + escopo talent). O retorno ganha talent_id nos dois casos
--     para o app mandar a pessoa ao escritório (portalHomeForAccepted).
--   * agency_talent_access(p_agency): selo do acesso de cada talento do casting ("login" | "pending" |
--     "none"), com o e-mail da conta MASCARADO (a agência nunca lê auth.users) e o prazo do convite
--     pendente (só gestor+, que é quem lê convites de talento). Colaborador vê o selo.
-- Regras: nada de drop; search_path fixo; nenhuma função nova com execute para anon (S14 segue 18).
-- =============================================================================

-- 1) convite do escritório (talento sem Hero OU Hero sem conta) -----------------------------------------
create or replace function public.agency_invite_talent(p_talent uuid, p_email text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_t record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  select t.user_id, t.creator_id, c.user_id as creator_user, c.status::text as creator_status into v_t
  from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
  where t.id = p_talent;
  if v_t.user_id is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
  if v_t.creator_id is not null then
    -- Hero com conta: a pessoa já entra no escritório pela conta dela
    if v_t.creator_user is not null then raise exception 'creator_has_login' using errcode = 'P0001'; end if;
    if v_t.creator_status = 'suspended' then raise exception 'partner_suspended' using errcode = 'P0001'; end if;
    -- o admin geral já convidou alguém para este Hero (convite de Hero pendente e válido)
    if exists (select 1 from public.invitations i where i.creator_profile_id = v_t.creator_id and i.status = 'pending' and i.expires_at >= now()) then
      raise exception 'hero_invite_pending' using errcode = 'P0001';
    end if;
  end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  -- convite novo substitui os pendentes do mesmo talento (é assim que "reenviar" funciona: o link é novo)
  update public.invitations i set status = 'revoked', revoked_at = now() where i.status = 'pending' and i.talent_id = p_talent;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, agency_id, talent_id, token_hash, expires_at, created_by)
  values (v_email, 'creator', v_agency, p_talent, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
  returning id into v_id;
  perform public.audit_log('invitation.create', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'talent_id', p_talent, 'creator_id', v_t.creator_id, 'email', v_email), null,
    public.talent_audit_actor('agency', v_agency));
  return query select v_id, v_token;
end $$;
revoke execute on function public.agency_invite_talent(uuid, text, int) from public, anon;
grant execute on function public.agency_invite_talent(uuid, text, int) to authenticated, service_role;

-- 2) aceite (0077 + ramo do talento com Hero) --------------------------------------------------------------
create or replace function public.accept_invitation_core(p_invitation uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.invitations%rowtype; v_email text; v_uid uuid; v_name text; v_scope_type text; v_scope_id uuid;
        v_creator uuid; v_found boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into v_inv from public.invitations where id = p_invitation for update;
  if not found or v_inv.status <> 'pending' then raise exception 'invitation_invalid'; end if;
  if v_inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation_expired';
  end if;
  if lower(v_inv.email::text) <> v_email then raise exception 'invitation_email_mismatch'; end if;
  if v_inv.role::text = 'seller' and exists (select 1 from public.seller_organizations o where o.id = v_inv.seller_org_id and o.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role::text = 'creator' and exists (select 1 from public.creator_profiles c where c.id = v_inv.creator_profile_id and c.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  if v_inv.role::text = 'professional' and exists (select 1 from public.professionals p where p.id = v_inv.professional_id and p.status = 'suspended') then
    raise exception 'partner_suspended';
  end if;
  -- D6: conta demo não entra em agência real (nem na marca nem no casting dela)
  if v_inv.agency_id is not null and not public.agency_is_demo(v_inv.agency_id) and public.is_demo_account() then
    raise exception 'demo_account_forbidden';
  end if;
  if v_inv.agency_id is not null and exists (select 1 from public.agencies a where a.id = v_inv.agency_id and a.status <> 'active') then
    raise exception 'partner_suspended';
  end if;
  v_name := left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = v_uid)), ''), split_part(v_email, '@', 1)), 80);

  perform set_config('app.trusted', 'on', true);
  if v_inv.role::text = 'seller' then
    insert into public.seller_memberships (org_id, user_id) values (v_inv.seller_org_id, v_uid)
    on conflict (org_id, user_id) do update set revoked_at = null;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'seller', 'seller_org', v_inv.seller_org_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'seller_org'; v_scope_id := v_inv.seller_org_id;
  elsif v_inv.role::text = 'professional' then
    if exists (select 1 from public.professionals where user_id = v_uid and id <> v_inv.professional_id) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'professional_profile_already_linked';
    end if;
    update public.professionals set user_id = v_uid
    where id = v_inv.professional_id and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'professional_profile_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, v_inv.role, 'professional', v_inv.professional_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'professional'; v_scope_id := v_inv.professional_id;
  elsif v_inv.role::text = 'agency' then
    -- D10: uma agência ativa por pessoa
    if exists (select 1 from public.agency_members m where m.user_id = v_uid and m.revoked_at is null and m.agency_id <> v_inv.agency_id) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'agency_member_elsewhere';
    end if;
    insert into public.agency_members (agency_id, user_id, role, display_name, invited_by)
    values (v_inv.agency_id, v_uid, v_inv.member_role, v_name, v_inv.created_by)
    on conflict (agency_id, user_id) do update
      set role = case when public.agency_members.revoked_at is null then public.agency_members.role else excluded.role end,
          revoked_at = null, updated_at = now();
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'agency', 'agency', v_inv.agency_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform public.inbox_notify_agency(v_inv.agency_id, 'admin', 'member_joined', '/agencia/equipe',
      jsonb_build_object('name', v_name), 'agency', v_inv.agency_id, 'member_joined:' || v_inv.id::text);
    v_scope_type := 'agency'; v_scope_id := v_inv.agency_id;
  elsif v_inv.role::text = 'brand' then
    if not exists (select 1 from public.agency_brands ab where ab.agency_id = v_inv.agency_id and ab.brand_id = v_inv.brand_id and ab.status = 'active') then
      perform set_config('app.trusted', 'off', true);
      raise exception 'brand_not_linked';
    end if;
    insert into public.brand_members (brand_id, user_id, role, display_name, invited_by)
    values (v_inv.brand_id, v_uid, v_inv.member_role, v_name, v_inv.created_by)
    on conflict (brand_id, user_id) do update
      set role = case when public.brand_members.revoked_at is null then public.brand_members.role else excluded.role end,
          revoked_at = null, updated_at = now();
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'brand', 'brand', v_inv.brand_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform public.inbox_notify_brand(v_inv.brand_id, true, 'brand_member_joined', '/marca/equipe',
      jsonb_build_object('name', v_name), v_inv.agency_id, 'brand', v_inv.brand_id, 'brand_member_joined:' || v_inv.id::text);
    perform public.inbox_notify_agency(v_inv.agency_id, 'manager', 'brand_member_joined', '/agencia/marcas/' || v_inv.brand_id::text,
      jsonb_build_object('name', v_name, 'brand', (select b.name from public.brands b where b.id = v_inv.brand_id)),
      'brand', v_inv.brand_id, 'brand_member_joined_agency:' || v_inv.id::text);
    v_scope_type := 'brand'; v_scope_id := v_inv.brand_id;
  elsif v_inv.role::text = 'creator' and v_inv.talent_id is not null then
    perform pg_advisory_xact_lock(hashtext('talent_person:' || v_uid::text));
    -- D10: no máximo um talento por pessoa (próprio ou pelo Hero)
    if exists (select 1 from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
               where t.id <> v_inv.talent_id and (t.user_id = v_uid or c.user_id = v_uid)) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'user_has_talent';
    end if;
    select t.creator_id, true into v_creator, v_found from public.talent_profiles t
    where t.id = v_inv.talent_id and t.agency_id = v_inv.agency_id and t.archived_at is null for update;
    if not coalesce(v_found, false) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'talent_already_linked';
    end if;
    if v_creator is null then
      -- talento sem página pública (D2): o login é do próprio talento
      update public.talent_profiles set user_id = v_uid
      where id = v_inv.talent_id and creator_id is null and (user_id is null or user_id = v_uid);
      if not found then
        perform set_config('app.trusted', 'off', true);
        raise exception 'talent_already_linked';
      end if;
      insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
      values (v_uid, 'creator', 'talent', v_inv.talent_id, v_inv.created_by)
      on conflict (user_id, role, scope_id) do update set revoked_at = null;
      v_scope_type := 'talent'; v_scope_id := v_inv.talent_id;
    else
      -- talento com Hero ligado (0087): a conta vira a dona do Hero, como o convite de Hero do admin
      if exists (select 1 from public.creator_profiles c where c.id = v_creator and c.status = 'suspended') then
        perform set_config('app.trusted', 'off', true);
        raise exception 'partner_suspended';
      end if;
      update public.creator_profiles set user_id = v_uid
      where id = v_creator and (user_id is null or user_id = v_uid);
      if not found then
        perform set_config('app.trusted', 'off', true);
        raise exception 'creator_profile_already_linked';
      end if;
      insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
      values (v_uid, 'creator', 'creator', v_creator, v_inv.created_by)
      on conflict (user_id, role, scope_id) do update set revoked_at = null;
      v_scope_type := 'creator'; v_scope_id := v_creator;
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('talent_person:' || v_uid::text));
    -- D10: Hero que já está num casting não vira o segundo talento de quem já tem um
    if exists (select 1 from public.talent_profiles t where t.creator_id = v_inv.creator_profile_id)
       and exists (select 1 from public.talent_profiles t2 left join public.creator_profiles c2 on c2.id = t2.creator_id
                   where t2.creator_id is distinct from v_inv.creator_profile_id and (t2.user_id = v_uid or c2.user_id = v_uid)) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'user_has_talent';
    end if;
    update public.creator_profiles set user_id = v_uid
    where id = v_inv.creator_profile_id and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'creator_profile_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'creator', v_inv.creator_profile_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'creator'; v_scope_id := v_inv.creator_profile_id;
  end if;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform public.audit_log('invitation.accept', 'invitation', v_inv.id::text, null,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid, 'agency_id', v_inv.agency_id, 'brand_id', v_inv.brand_id,
                       'talent_id', v_inv.talent_id, 'creator_id', v_creator), null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  -- talent_id: o app manda quem entrou por convite de talento ao escritório
  return jsonb_strip_nulls(jsonb_build_object('role', v_inv.role, 'scope_type', v_scope_type, 'scope_id', v_scope_id,
                                              'talent_id', v_inv.talent_id));
end $$;
revoke execute on function public.accept_invitation_core(uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation_core(uuid) to service_role;

-- 3) selo do acesso do creator no casting ------------------------------------------------------------------
-- e-mail mascarado (primeira letra + domínio). Interna.
create or replace function public.mask_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when p_email is null or position('@' in p_email) = 0 then null
              else left(split_part(p_email, '@', 1), 1) || '•••@' || split_part(p_email, '@', 2) end
$$;
revoke execute on function public.mask_email(text) from public, anon, authenticated;
grant execute on function public.mask_email(text) to service_role;

create or replace function public.agency_talent_access(p_agency uuid)
returns table (talent_id uuid, access text, login_email text, invite_expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_manager boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_manager := public.agency_can(p_agency, 'manager');
  return query
  select t.id,
         case when coalesce(t.user_id, c.user_id) is not null then 'login'
              when i.expires_at is not null then 'pending'
              else 'none' end,
         public.mask_email(u.email::text),
         case when v_manager and coalesce(t.user_id, c.user_id) is null then i.expires_at end
  from public.talent_profiles t
  left join public.creator_profiles c on c.id = t.creator_id
  left join auth.users u on u.id = coalesce(t.user_id, c.user_id)
  left join lateral (select max(iv.expires_at) as expires_at from public.invitations iv
                     where iv.talent_id = t.id and iv.status = 'pending' and iv.expires_at >= now()) i on true
  where t.agency_id = p_agency;
end $$;
revoke execute on function public.agency_talent_access(uuid) from public, anon;
grant execute on function public.agency_talent_access(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
