-- =============================================================================
-- Groscove Ultra · 0077 · Primeiro acesso do convidado pelo e-mail
--   Decisão do responsável (01/11/2026): quem foi convidado entra pela tela de entrar com o e-mail
--   convidado e uma senha nova; a conta nasce ali e o convite é aceito na hora, sem abrir o link.
--   Quem já tem conta e foi convidado também recebe o acesso ao entrar.
--
--   * accept_invitation_core(p_invitation): o corpo de accept_invitation (0065) pelo id do convite.
--     Interna: sem execute para public/anon/authenticated (só as funções abaixo a chamam).
--   * accept_invitation(p_token): mesma assinatura e mesmo resultado de antes (acha o id pelo hash).
--   * accept_my_invitations(): aceita todos os convites pendentes e válidos do e-mail da sessão;
--     devolve um item por convite ({role, scope_type, scope_id} ou {id, error}), sem interromper os demais.
-- Regras: nada de drop; search_path fixo; nenhuma função nova com execute para anon (S14 segue 18).
-- =============================================================================

create or replace function public.accept_invitation_core(p_invitation uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.invitations%rowtype; v_email text; v_uid uuid; v_name text; v_scope_type text; v_scope_id uuid;
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
    -- talento sem página pública (D2). D10: no máximo um talento por pessoa (próprio ou pelo herói)
    if exists (select 1 from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
               where t.id <> v_inv.talent_id and (t.user_id = v_uid or c.user_id = v_uid)) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'user_has_talent';
    end if;
    update public.talent_profiles set user_id = v_uid
    where id = v_inv.talent_id and agency_id = v_inv.agency_id and creator_id is null and archived_at is null
      and (user_id is null or user_id = v_uid);
    if not found then
      perform set_config('app.trusted', 'off', true);
      raise exception 'talent_already_linked';
    end if;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'talent', v_inv.talent_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'talent'; v_scope_id := v_inv.talent_id;
  else
    perform pg_advisory_xact_lock(hashtext('talent_person:' || v_uid::text));
    -- D10: herói que já está num casting não vira o segundo talento de quem já tem um
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
                       'talent_id', v_inv.talent_id), null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  return jsonb_build_object('role', v_inv.role, 'scope_type', v_scope_type, 'scope_id', v_scope_id);
end $$;
revoke execute on function public.accept_invitation_core(uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation_core(uuid) to service_role;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select id into v_id from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_id is null then raise exception 'invitation_invalid'; end if;
  return public.accept_invitation_core(v_id);
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

create or replace function public.accept_my_invitations()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_email text; r record; v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return v_out; end if;
  for r in
    select i.id from public.invitations i
    where i.status = 'pending' and lower(i.email::text) = v_email and i.expires_at >= now()
    order by i.created_at
  loop
    begin
      v_out := v_out || jsonb_build_array(public.accept_invitation_core(r.id));
    exception when others then
      -- um convite que não cabe (ex.: já é de outra agência) não impede os demais
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'error', sqlerrm));
    end;
  end loop;
  return v_out;
end $$;
revoke execute on function public.accept_my_invitations() from public, anon;
grant execute on function public.accept_my_invitations() to authenticated, service_role;
