-- =============================================================================
-- Groscove Ultra · 0116 · Um e-mail, um perfil de negócio (Herói OU Marca OU Agência)
-- Decisão do responsável (04/11): uma conta (um e-mail) só pode ter UM tipo de perfil de negócio — herói, marca ou
-- agência. Consumidor ("só o app") é a base de todos e não conta. O admin da plataforma fica fora da regra. A seção
-- "Novo perfil" (Configurações › "Quero ser…") sai das telas; o cadastro com escolha de perfil continua para quem
-- ainda não tem conta. Cenário S121. Idempotente; nada de drop de tabela/coluna; nenhuma função nova executável por
-- anon (S14 segue 18).
--
-- O que conta como cada tipo (account_business_kinds):
--   • hero   — papel 'creator' ativo (titular, equipe do herói ou login do talento), creator_profiles.user_id,
--              talent_profiles.user_id ou creator_team_members ativo (equipe do herói = perfil de herói).
--   • brand  — brand_members ativo ou papel 'brand' ativo (Dono ou Equipe; dono de 2 marcas é o mesmo tipo).
--   • agency — agency_members ativo ou papel 'agency' ativo (admin/gestor/colaborador; uma agência por pessoa já era
--              regra desde a 0064, D10).
--
-- Decisões (sem perguntar ao responsável):
--   • Uma trava só, no banco, em vez de remendar cada RPC: triggers BEFORE INSERT/UPDATE nas tabelas que dão o
--     vínculo (brand_members, agency_members, creator_profiles.user_id, talent_profiles.user_id,
--     creator_team_members) e também em role_assignments (papéis creator/brand/agency), account_onboardings (passo a
--     passo em aberto de agência/marca/herói) e invitations (convite novo para um e-mail que já tem conta de outro
--     tipo). Todas as RPCs security definer que concedem vínculo passam por elas e recusam com
--     'profile_conflict:<tipo que a conta já tem>' (hero|brand|agency), sem mexer no corpo de cada uma:
--     self_onboarding_start (cadastro por perfil), onboarding_create_* e creator_create_my_hero (fim do passo a
--     passo), accept_invitation_core / accept_invitation / accept_my_invitations (todos os kinds: agência, marca,
--     herói, equipe do herói, equipe da marca, agency_hero e agency_brand da 0112), access_provision /
--     agency_hero_create / agency_brand_create_with_access / access_contact_save (ligar herói ou Dono de marca a conta
--     existente), talent_page_create (ligar página pública), agency_invite_member / brand_invite_member /
--     hero_team_invite / admin_invite (convite novo já recusa no envio, antes de o convidado aceitar).
--     A transação inteira volta (convite não é consumido, nada fica pela metade).
--   • Staff externo do projeto (0110, project_room_members) NÃO é perfil de negócio: é um convidado de UM negócio,
--     sem papel e sem portal próprio (só a sala daquele projeto, depois do NDA). Fica fora da regra: um herói ou uma
--     marca pode ser chamado como staff externo de uma sala sem perder o próprio perfil.
--   • Mesmo tipo pode repetir: Dono de 2 marcas, Equipe de outra marca, membro da equipe do herói que também é
--     titular (todos hero), etc. As regras antigas de cada tipo continuam (uma agência por pessoa, um herói por
--     pessoa, uma marca própria pelo cadastro).
--   • Admin da plataforma (papel 'admin' ativo) fica fora da regra: supervisiona e pode ter vínculos de teste.
--   • Trava por conta (advisory lock por usuário) contra dois vínculos de tipos diferentes ao mesmo tempo.
--   • Dados atuais: produção verificada sem conflito; mesmo assim a migração para com mensagem clara se encontrar
--     alguma conta com dois tipos (não limpa nada sozinha).
--   • Quem recebe o erro vê "Este e-mail já é usado por uma conta de {tipo}. Use outro e-mail." (agency.errors,
--     adminOps.errors e invites.start.errors).
-- =============================================================================

-- 1) tipos de perfil de negócio de uma conta (interno) -----------------------------------------------------------------
create or replace function public.account_business_kinds(p_user uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(s.k order by s.k), '{}'::text[]) from (
    select 'agency'::text as k
    where exists (select 1 from public.agency_members m where m.user_id = p_user and m.revoked_at is null)
       or exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role::text = 'agency' and r.revoked_at is null)
    union all
    select 'brand'
    where exists (select 1 from public.brand_members m where m.user_id = p_user and m.revoked_at is null)
       or exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role::text = 'brand' and r.revoked_at is null)
    union all
    select 'hero'
    where exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role::text = 'creator' and r.revoked_at is null)
       or exists (select 1 from public.creator_profiles c where c.user_id = p_user)
       or exists (select 1 from public.talent_profiles t where t.user_id = p_user)
       or exists (select 1 from public.creator_team_members m where m.user_id = p_user and m.status = 'active')
  ) s
$$;
revoke execute on function public.account_business_kinds(uuid) from public, anon, authenticated;
grant execute on function public.account_business_kinds(uuid) to service_role;

-- 2) a trava: recusa dar o tipo p_kind a quem já tem outro (interno) ---------------------------------------------------
create or replace function public.business_profile_guard(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_other text;
begin
  if p_user is null or p_kind is null or p_kind not in ('hero', 'brand', 'agency') then return; end if;
  -- admin da plataforma fica fora da regra
  if exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role::text = 'admin' and r.revoked_at is null) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('business_profile:' || p_user::text));
  select k into v_other from unnest(public.account_business_kinds(p_user)) as k where k <> p_kind limit 1;
  if v_other is not null then
    raise exception 'profile_conflict:%', v_other using errcode = 'P0001',
      detail = 'Um e-mail, um perfil de negócio: esta conta já é ' || v_other || ' e não pode virar ' || p_kind || '.';
  end if;
end $$;
revoke execute on function public.business_profile_guard(uuid, text) from public, anon, authenticated;
grant execute on function public.business_profile_guard(uuid, text) to service_role;

-- tipo que um convite concede (null = nenhum perfil de negócio: admin, consumidor, vínculo de marca, vendedor, profissional)
create or replace function public.invitation_business_kind(p_kind text, p_role text)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_kind, '') in ('admin', 'consumer', 'brand_link') then null
    when p_role = 'agency' then 'agency'
    when p_role = 'brand' then 'brand'
    when p_role in ('creator', 'hero') then 'hero'
    else null
  end
$$;
revoke execute on function public.invitation_business_kind(text, text) from public, anon;
grant execute on function public.invitation_business_kind(text, text) to authenticated, service_role;

-- 3) trigger único (por tabela, o tipo e quando conferir) --------------------------------------------------------------
create or replace function public.business_profile_row_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_kind text; v_new jsonb := to_jsonb(new); v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if tg_table_name in ('brand_members', 'agency_members') then
    if v_new ->> 'revoked_at' is null
       and (v_old is null or v_old ->> 'revoked_at' is not null or v_old ->> 'user_id' is distinct from v_new ->> 'user_id') then
      v_user := (v_new ->> 'user_id')::uuid;
      v_kind := case tg_table_name when 'brand_members' then 'brand' else 'agency' end;
    end if;
  elsif tg_table_name in ('creator_profiles', 'talent_profiles') then
    if v_new ->> 'user_id' is not null and (v_old is null or v_old ->> 'user_id' is distinct from v_new ->> 'user_id') then
      v_user := (v_new ->> 'user_id')::uuid; v_kind := 'hero';
    end if;
  elsif tg_table_name = 'creator_team_members' then
    if v_new ->> 'status' = 'active'
       and (v_old is null or v_old ->> 'status' is distinct from 'active' or v_old ->> 'user_id' is distinct from v_new ->> 'user_id') then
      v_user := (v_new ->> 'user_id')::uuid; v_kind := 'hero';
    end if;
  elsif tg_table_name = 'role_assignments' then
    if v_new ->> 'role' in ('creator', 'brand', 'agency') and v_new ->> 'revoked_at' is null
       and (v_old is null or v_old ->> 'revoked_at' is not null or v_old ->> 'role' is distinct from v_new ->> 'role'
            or v_old ->> 'user_id' is distinct from v_new ->> 'user_id') then
      v_user := (v_new ->> 'user_id')::uuid;
      v_kind := case v_new ->> 'role' when 'creator' then 'hero' else v_new ->> 'role' end;
    end if;
  elsif tg_table_name = 'account_onboardings' then
    if v_new ->> 'completed_at' is null and v_new ->> 'kind' in ('agency', 'brand', 'hero')
       and (v_old is null or v_old ->> 'completed_at' is not null or v_old ->> 'kind' is distinct from v_new ->> 'kind') then
      v_user := (v_new ->> 'user_id')::uuid; v_kind := v_new ->> 'kind';
    end if;
  elsif tg_table_name = 'invitations' then
    -- convite novo: se o e-mail já é de uma conta de outro tipo, recusa no envio (o convidado nem recebe o link)
    if tg_op = 'INSERT' and coalesce(v_new ->> 'status', 'pending') = 'pending' then
      v_kind := public.invitation_business_kind(v_new ->> 'kind', v_new ->> 'role');
      if v_kind is not null then
        select u.id into v_user from auth.users u where lower(u.email::text) = lower(btrim(v_new ->> 'email')) limit 1;
      end if;
    end if;
  end if;
  if v_user is not null and v_kind is not null then
    perform public.business_profile_guard(v_user, v_kind);
  end if;
  return new;
end $$;
revoke execute on function public.business_profile_row_guard() from public, anon, authenticated;
grant execute on function public.business_profile_row_guard() to service_role;

-- 4) dados atuais: para com mensagem clara se alguma conta (fora o admin) já tiver dois tipos --------------------------
do $$
declare v_n int; v_list text;
begin
  with users as (
    select user_id from public.agency_members where revoked_at is null
    union select user_id from public.brand_members where revoked_at is null
    union select user_id from public.creator_profiles where user_id is not null
    union select user_id from public.talent_profiles where user_id is not null
    union select user_id from public.creator_team_members where status = 'active'
    union select user_id from public.role_assignments where role::text in ('creator', 'brand', 'agency') and revoked_at is null
  ), c as (
    select u.user_id, public.account_business_kinds(u.user_id) as kinds from users u
    where not exists (select 1 from public.role_assignments r where r.user_id = u.user_id and r.role::text = 'admin' and r.revoked_at is null)
  )
  select count(*), string_agg(coalesce((select a.email::text from auth.users a where a.id = c.user_id), c.user_id::text)
                              || ' (' || array_to_string(c.kinds, '+') || ')', ', ')
  into v_n, v_list
  from (select * from c where cardinality(c.kinds) > 1 limit 20) c;
  if v_n > 0 then
    raise exception 'profile_conflict_existing: % conta(s) com mais de um perfil de negócio — resolva antes de aplicar a 0116: %', v_n, v_list;
  end if;
end $$;

-- 5) os triggers ---------------------------------------------------------------------------------------------------------
drop trigger if exists business_profile_guard on public.brand_members;
create trigger business_profile_guard before insert or update of user_id, revoked_at on public.brand_members
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.agency_members;
create trigger business_profile_guard before insert or update of user_id, revoked_at on public.agency_members
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.creator_profiles;
create trigger business_profile_guard before insert or update of user_id on public.creator_profiles
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.talent_profiles;
create trigger business_profile_guard before insert or update of user_id on public.talent_profiles
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.creator_team_members;
create trigger business_profile_guard before insert or update of user_id, status on public.creator_team_members
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.role_assignments;
create trigger business_profile_guard before insert or update of user_id, role, revoked_at on public.role_assignments
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.account_onboardings;
create trigger business_profile_guard before insert or update of kind, completed_at on public.account_onboardings
  for each row execute function public.business_profile_row_guard();
drop trigger if exists business_profile_guard on public.invitations;
create trigger business_profile_guard before insert on public.invitations
  for each row execute function public.business_profile_row_guard();

notify pgrst, 'reload schema';
