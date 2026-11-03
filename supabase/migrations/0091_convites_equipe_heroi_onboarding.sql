-- =============================================================================
-- Groscove Ultra · 0091 · Convites: quem convida quem, equipe do herói e primeiro acesso por onboarding
-- Pedido do responsável (03/11). Cenário S98. Idempotente; nada de drop de tabela/coluna; nenhuma função nova com
-- execute para anon (S14 segue 18). As RPCs recriadas mantêm a MESMA assinatura (sem sobrecarga).
--
-- Decisões (sem perguntar ao responsável):
--   • Equipe do herói (creator_team_members): várias pessoas (creators) por herói, papel 'owner' (titular, um só) ou
--     'member'. creator_profiles.user_id continua sendo o titular (compatibilidade) e é a FONTE da verdade do
--     titular: um gatilho espelha a coluna na equipe (vira 'owner'; o titular anterior continua como 'member').
--     Transferir = trocar creator_profiles.user_id pela RPC hero_team_transfer (o gatilho 0065 do talento trata a
--     troca de pessoa como sempre). Os titulares atuais entram como 'owner' na migração.
--   • O membro age como o herói onde tudo já confere "herói dono" por my_creator_id() (posts, rascunhos, vídeos,
--     publicação: 22 políticas e 26 funções) e abre o escritório do talento ligado (my_talent_id). Ficam só com o
--     titular: dados do perfil, foto, capa (políticas/RPCs pelo user_id, sem mudança), consentimento de uso de imagem
--     no casting (talent_set_consent: é a imagem da pessoa titular) e quem entra/sai da equipe. Avisos do escritório
--     continuam indo ao titular (talent_user_id).
--   • Creator sem herói: o convite de creator "sem herói" dá o papel creator global; a pessoa cria o herói dela
--     (creator_create_my_hero) que nasce PENDENTE (o admin aprova em /admin/creators, como a publicação de herói).
--   • Convite do admin (admin_invite): só e-mail, papel e validade (1–30 dias; Admin no máximo 2 dias = 48h, com
--     confirmação explícita "controle total" e auditoria própria). Papéis: consumer, admin, agency, brand, creator,
--     hero, seller (Fornecedor), professional. Creator: herói nenhum | existente (titular se sem dono, senão membro)
--     | novo (criado pendente). Herói: cria o herói pendente com o nome; equipe depois | creator existente (entra já
--     como membro) | creator novo (segundo convite, membro). admin_create_invitation (0001) continua para links
--     antigos/telas antigas; o aceite de convites já emitidos segue igual.
--   • Primeiro acesso por onboarding: convite de agência/marca/fornecedor/profissional SEM empresa (kind
--     'onboarding') → o aceite cria account_onboardings e o app leva a /primeiro-acesso; o papel só nasce quando a
--     empresa/perfil é criada (onboarding_create_*, authenticated, nunca anon). Marca: site obrigatório (a tabela de
--     marcas exige https e o catálogo mostra o link); nasce 'inactive' (fora da loja pública até o admin ativar) e
--     self_managed. Fornecedor: organização parceira 'active' (o portal do fornecedor só abre
--     organização ativa; sem produto publicado nada aparece na loja). Profissional: o registro (tipo pela especialidade, número e
--     UF) é exigido pela tabela; perfil 'pending' até a verificação do admin.
--   • Marca sem agência: brands.self_managed = true (nasce assim no onboarding). brand_member_of/my_brand_ids aceitam a
--     marca autogerida mesmo sem vínculo ativo (as marcas criadas pela agência seguem exigindo o vínculo, como antes).
--     O dono convida a equipe sem agência (brand_invite_member, mesma assinatura) e pode transferir a posse
--     (brand_transfer_owner: o antigo dono vira Equipe). A chamada da marca (0089, alvo 'all') já funcionava só com
--     brand_member_of; campanha direta continua exigindo agência (brand_not_linked).
--   • Agência convida marca por e-mail (agency_invite_brand): se o e-mail é dono de uma marca → pedido de vínculo
--     (convite kind 'brand_link' que o dono aceita; D18: uma agência ativa por marca → brand_linked_elsewhere); se não
--     → convite de marca nova (onboarding) que já nasce ligada à agência. Decisão: a resposta diz qual dos dois foi
--     feito (vaza só para gestor+ de agência ativa se aquele e-mail é dono de marca).
--   • Agência convida herói (agency_invite_hero): herói do casting sem titular → mesma regra da 0087
--     (agency_invite_talent); creator do casting sem herói e sem login → cria o herói pendente ligado ao talento e
--     convida o titular. Talento com login próprio cria o herói dele pelo próprio portal (talent_has_login).
--   • Revogação: agency_invitation_revoke (mesma assinatura) passa a cobrir convite de marca sem agência (dono),
--     pedido de vínculo/marca nova (gestor+) e convite da equipe do herói (titular ou admin).
--   • Sem tipos de aviso novos (o check do sino não muda): os fluxos novos não mandam aviso.
-- =============================================================================

-- 1) colunas novas --------------------------------------------------------------------------------------------------
alter table public.brands add column if not exists self_managed boolean not null default false;
alter table public.brands add column if not exists cnpj text;
alter table public.brands add column if not exists segment text;
alter table public.agencies add column if not exists cnpj text;
alter table public.brands drop constraint if exists brands_cnpj_check;
alter table public.brands add constraint brands_cnpj_check check (cnpj is null or cnpj ~ '^[0-9]{14}$');
alter table public.brands drop constraint if exists brands_segment_check;
alter table public.brands add constraint brands_segment_check check (segment is null or char_length(btrim(segment)) between 1 and 60);
alter table public.agencies drop constraint if exists agencies_cnpj_check;
alter table public.agencies add constraint agencies_cnpj_check check (cnpj is null or cnpj ~ '^[0-9]{14}$');

alter table public.invitations add column if not exists kind text;
alter table public.invitations add column if not exists team_role text;
alter table public.invitations drop constraint if exists invitations_kind_check;
alter table public.invitations add constraint invitations_kind_check check (kind is null or kind in
  ('admin', 'consumer', 'creator', 'hero', 'hero_team', 'onboarding', 'brand_staff', 'brand_link'));
alter table public.invitations drop constraint if exists invitations_team_role_check;
alter table public.invitations add constraint invitations_team_role_check check (team_role is null or team_role in ('owner', 'member'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role::text in ('creator', 'seller', 'professional', 'agency', 'brand', 'admin', 'consumer'));
alter table public.invitations drop constraint if exists invitations_scope;
alter table public.invitations add constraint invitations_scope check (
  -- formas antigas (0001/0058/0064/0065)
     (role::text = 'seller' and seller_org_id is not null and creator_profile_id is null and professional_id is null
      and agency_id is null and brand_id is null and member_role is null and talent_id is null)
  or (role::text = 'creator' and creator_profile_id is not null and seller_org_id is null and professional_id is null
      and agency_id is null and brand_id is null and member_role is null and talent_id is null)
  or (role::text = 'creator' and talent_id is not null and agency_id is not null and creator_profile_id is null
      and seller_org_id is null and professional_id is null and brand_id is null and member_role is null)
  or (role::text = 'professional' and professional_id is not null and seller_org_id is null and creator_profile_id is null
      and agency_id is null and brand_id is null and member_role is null and talent_id is null)
  or (role::text = 'agency' and agency_id is not null and member_role in ('admin', 'manager', 'staff') and brand_id is null
      and seller_org_id is null and creator_profile_id is null and professional_id is null and talent_id is null)
  or (role::text = 'brand' and brand_id is not null and agency_id is not null and member_role in ('owner', 'staff')
      and seller_org_id is null and creator_profile_id is null and professional_id is null and talent_id is null)
  -- 0091: sem escopo (admin, consumidor, creator sem herói, onboarding de agência/fornecedor/profissional)
  or (coalesce(kind, '') in ('admin', 'consumer', 'creator', 'onboarding')
      and ((kind = 'admin' and role::text = 'admin') or (kind = 'consumer' and role::text = 'consumer')
           or (kind = 'creator' and role::text = 'creator')
           or (kind = 'onboarding' and role::text in ('agency', 'seller', 'professional')))
      and seller_org_id is null and creator_profile_id is null and professional_id is null and agency_id is null
      and brand_id is null and member_role is null and talent_id is null)
  -- marca nova (onboarding), opcionalmente já ligada à agência que convidou
  or (kind = 'onboarding' and role::text = 'brand' and brand_id is null and member_role is null and seller_org_id is null
      and creator_profile_id is null and professional_id is null and talent_id is null)
  -- equipe de marca autogerida (sem agência)
  or (kind = 'brand_staff' and role::text = 'brand' and brand_id is not null and agency_id is null and member_role in ('owner', 'staff')
      and seller_org_id is null and creator_profile_id is null and professional_id is null and talent_id is null)
  -- pedido de vínculo da agência com a marca existente (o dono aceita)
  or (kind = 'brand_link' and role::text = 'brand' and brand_id is not null and agency_id is not null and member_role is null
      and seller_org_id is null and creator_profile_id is null and professional_id is null and talent_id is null)
);
create index if not exists invitations_creator_idx on public.invitations (creator_profile_id) where creator_profile_id is not null;

-- 2) equipe do herói ------------------------------------------------------------------------------------------------
create table if not exists public.creator_team_members (
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (creator_profile_id, user_id)
);
create unique index if not exists creator_team_one_owner_idx on public.creator_team_members (creator_profile_id)
  where role = 'owner' and status = 'active';
create index if not exists creator_team_user_idx on public.creator_team_members (user_id) where status = 'active';
alter table public.creator_team_members enable row level security;
revoke all on public.creator_team_members from public, anon, authenticated;
grant select on public.creator_team_members to authenticated;
grant all on public.creator_team_members to service_role;

-- titulares de hoje entram como 'owner'
insert into public.creator_team_members (creator_profile_id, user_id, role, status)
select c.id, c.user_id, 'owner', 'active' from public.creator_profiles c where c.user_id is not null
on conflict (creator_profile_id, user_id) do update set role = 'owner', status = 'active', removed_at = null;

-- heróis em que a pessoa logada está (ativa). Para políticas.
create or replace function public.my_team_creator_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.creator_profile_id), '{}'::uuid[]) from public.creator_team_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;
revoke execute on function public.my_team_creator_ids() from public, anon;
grant execute on function public.my_team_creator_ids() to authenticated, service_role;

-- heróis em que a pessoa logada é titular (para a política dos convites da equipe)
create or replace function public.my_owned_creator_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}'::uuid[]) from public.creator_profiles c where c.user_id = auth.uid()
$$;
revoke execute on function public.my_owned_creator_ids() from public, anon;
grant execute on function public.my_owned_creator_ids() to authenticated, service_role;

-- papel da pessoa logada na equipe do herói ('owner' | 'member' | null). Interna das RPCs.
create or replace function public.creator_team_role(p_creator uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when c.user_id = p_user then 'owner'
              else (select m.role from public.creator_team_members m
                    where m.creator_profile_id = c.id and m.user_id = p_user and m.status = 'active') end
  from public.creator_profiles c where c.id = p_creator and p_user is not null
$$;
revoke execute on function public.creator_team_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.creator_team_role(uuid, uuid) to service_role;

drop policy if exists creator_team_select on public.creator_team_members;
create policy creator_team_select on public.creator_team_members for select to authenticated
  using (user_id = (select auth.uid()) or creator_profile_id = any ((select public.my_team_creator_ids())::uuid[]) or (select public.is_admin()));

-- o membro lê o próprio herói mesmo pendente (o público lê só os ativos)
drop policy if exists creators_select_team on public.creator_profiles;
create policy creators_select_team on public.creator_profiles for select to authenticated
  using (id = any ((select public.my_team_creator_ids())::uuid[]));

-- gestor+ da agência lê os heróis do casting dela mesmo pendentes (o herói criado por convite nasce pendente)
drop policy if exists creators_select_agency on public.creator_profiles;
create policy creators_select_agency on public.creator_profiles for select to authenticated
  using (id = any ((select public.agency_hero_ids())::uuid[]));

-- espelho: creator_profiles.user_id → titular na equipe
create or replace function public.creator_team_sync_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.user_id is not distinct from new.user_id then return new; end if;
  if tg_op = 'UPDATE' and old.user_id is not null then
    -- o titular anterior continua na equipe como membro (sai pela RPC de remover, se for o caso)
    update public.creator_team_members set role = 'member', updated_at = now()
    where creator_profile_id = new.id and user_id = old.user_id and role = 'owner';
  end if;
  if new.user_id is not null then
    update public.creator_team_members set role = 'member', updated_at = now()
    where creator_profile_id = new.id and role = 'owner' and status = 'active' and user_id <> new.user_id;
    insert into public.creator_team_members (creator_profile_id, user_id, role, status, created_by)
    values (new.id, new.user_id, 'owner', 'active', auth.uid())
    on conflict (creator_profile_id, user_id) do update set role = 'owner', status = 'active', removed_at = null, updated_at = now();
  end if;
  return new;
end $$;
revoke execute on function public.creator_team_sync_owner() from public, anon, authenticated;
drop trigger if exists trg_creator_profiles_team_owner on public.creator_profiles;
create trigger trg_creator_profiles_team_owner after insert or update of user_id on public.creator_profiles
  for each row execute function public.creator_team_sync_owner();

-- 3) herói/escritório da pessoa: titular primeiro, depois membro -------------------------------------------------------
create or replace function public.my_creator_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    public.acting_hero_id(),
    (select c.id from public.creator_profiles c where c.user_id = auth.uid() and c.status = 'active' limit 1),
    (select m.creator_profile_id from public.creator_team_members m
     join public.creator_profiles c on c.id = m.creator_profile_id and c.status = 'active'
     where m.user_id = auth.uid() and m.status = 'active' order by m.created_at limit 1))
$$;
-- mesmos grants da 0016 (as políticas públicas de conteúdo avaliam a função também para o visitante: S14 segue 18)
revoke execute on function public.my_creator_id() from public;
grant execute on function public.my_creator_id() to anon, authenticated, service_role;

create or replace function public.my_talent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.talent_profiles t
  join public.agencies a on a.id = t.agency_id and a.status = 'active'
  left join public.creator_profiles c on c.id = t.creator_id
  where t.archived_at is null and auth.uid() is not null
    and (((t.user_id = auth.uid() or c.user_id = auth.uid()) and public.talent_user_id(t.id) = auth.uid())
         -- 0091: membro da equipe do herói ligado (mesma regra de demo do titular)
         or (c.id is not null and c.status <> 'suspended'
             and exists (select 1 from public.creator_team_members m where m.creator_profile_id = c.id
                         and m.user_id = auth.uid() and m.status = 'active')
             and (a.is_demo or not public.is_demo_account())))
  order by (case when t.user_id = auth.uid() or c.user_id = auth.uid() then 0 else 1 end), t.created_at limit 1
$$;
revoke execute on function public.my_talent_id() from public, anon;
grant execute on function public.my_talent_id() to authenticated, service_role;

create or replace function public.talent_my_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id(); v jsonb;
begin
  if v_talent is null then return null; end if;
  select jsonb_build_object(
    'id', t.id, 'display_name', t.display_name, 'city', t.city, 'state', t.state,
    'availability', t.availability, 'availability_note', t.availability_note,
    'consent_at', t.consent_at, 'consent_version', t.consent_version, 'consent_revoked_at', t.consent_revoked_at,
    'catalog_visible', t.catalog_visible, 'has_public_page', t.creator_id is not null,
    'agency', a.name, 'agency_is_demo', a.is_demo,
    -- 0091: membro da equipe do herói (não é a pessoa titular: não dá o consentimento)
    'is_team_member', public.talent_user_id(t.id) is distinct from auth.uid(),
    'manager', (select m.display_name from public.agency_members m
                where m.agency_id = t.agency_id and m.user_id = t.manager_id and m.revoked_at is null))
  into v
  from public.talent_profiles t join public.agencies a on a.id = t.agency_id
  where t.id = v_talent;
  return v;
end $$;
revoke execute on function public.talent_my_context() from public, anon;
grant execute on function public.talent_my_context() to authenticated, service_role;

-- consentimento: só a pessoa titular (membro da equipe recebe forbidden)
create or replace function public.talent_set_consent(p_on boolean, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id(); v_t record; v_version text := btrim(coalesce(p_version, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  -- dono de herói fora do ar (sem escritório) ainda pode REVOGAR; conta demo nunca mexe em agência real
  if v_talent is null and p_on is false then
    select t.id into v_talent from public.talent_profiles t
    join public.creator_profiles c on c.id = t.creator_id
    join public.agencies a on a.id = t.agency_id
    where c.user_id = auth.uid() and c.status <> 'active' and t.archived_at is null
      and (a.is_demo or not public.is_demo_account())
    limit 1;
  elsif v_talent is not null and public.talent_user_id(v_talent) is distinct from auth.uid() then
    -- 0091: membro da equipe do herói não fala pela imagem do titular
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_talent is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_on is null or (p_on and v_version !~ '^[0-9A-Za-z._-]{1,20}$') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.agency_id, t.manager_id, t.display_name, t.consent_at, t.consent_revoked_at into v_t
  from public.talent_profiles t where t.id = v_talent for update;
  -- nada muda: não audita nem avisa de novo
  if (p_on and v_t.consent_at is not null and v_t.consent_revoked_at is null)
     or (not p_on and (v_t.consent_at is null or v_t.consent_revoked_at is not null)) then
    if p_on then update public.talent_profiles set consent_version = v_version where id = v_talent; end if;
    return;
  end if;
  perform public.talent_consent_apply(v_talent, p_on, v_version);
  perform public.audit_log('talent.consent', 'talent', v_talent::text,
    jsonb_build_object('agency_id', v_t.agency_id, 'consent', not p_on),
    jsonb_build_object('agency_id', v_t.agency_id, 'consent', p_on, 'version', case when p_on then v_version end), null, 'creator');
  -- avisa o gestor responsável (membro ativo) ou, sem ele, os gestores e o Adm
  if v_t.manager_id is not null and exists (select 1 from public.agency_members m where m.agency_id = v_t.agency_id
                                            and m.user_id = v_t.manager_id and m.revoked_at is null) then
    perform public.inbox_notify(v_t.manager_id, case when p_on then 'talent_consent_given' else 'talent_consent_revoked' end,
      '/agencia/casting/' || v_talent::text, jsonb_build_object('talent', v_t.display_name), v_t.agency_id, 'talent', v_talent, null);
  else
    perform public.inbox_notify_agency(v_t.agency_id, 'manager', case when p_on then 'talent_consent_given' else 'talent_consent_revoked' end,
      '/agencia/casting/' || v_talent::text, jsonb_build_object('talent', v_t.display_name), 'talent', v_talent, null);
  end if;
end $$;
revoke execute on function public.talent_set_consent(boolean, text) from public, anon;
grant execute on function public.talent_set_consent(boolean, text) to authenticated, service_role;

-- fotos dos posts: o membro da equipe também publica pelo herói
create or replace function public.content_bodies_post_photo_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if new.media_provider is distinct from 'upload' then return new; end if;
  -- update que não mexe na mídia (ex.: texto do corpo) não precisa revalidar
  if tg_op = 'UPDATE' and old.media_provider = new.media_provider and old.media_ref is not distinct from new.media_ref then return new; end if;
  if v_uid is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if not exists (
    select 1 from public.content c
    where c.id = new.content_id and public.creator_team_role(c.creator_id, v_uid) is not null
  ) or not public.post_photo_usable(new.media_ref, v_uid)
    or exists (select 1 from public.content_bodies b where b.media_provider = 'upload' and b.media_ref = new.media_ref and b.content_id <> new.content_id) then
    raise exception 'photo_media_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.content_post_photo_cover_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if new.cover_url is null or position('/post-photos/' in new.cover_url) = 0 then return new; end if;
  if tg_op = 'UPDATE' and old.cover_url is not distinct from new.cover_url and old.creator_id is not distinct from new.creator_id then return new; end if;
  if v_uid is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if public.creator_team_role(new.creator_id, v_uid) is null
     or not public.post_photo_usable(public.post_photo_path(new.cover_url), v_uid) then
    raise exception 'photo_media_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;

-- 4) marca autogerida (sem agência) --------------------------------------------------------------------------------
create or replace function public.brand_member_of(p_brand uuid)
returns text language sql stable security definer set search_path = '' as $$
  select bm.role from public.brand_members bm
  where bm.brand_id = p_brand and bm.user_id = auth.uid() and bm.revoked_at is null
    and (exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
                 where ab.brand_id = bm.brand_id and ab.status = 'active')
         or exists (select 1 from public.brands b where b.id = bm.brand_id and b.self_managed))
$$;

create or replace function public.my_brand_ids(p_owner_only boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct bm.brand_id), '{}'::uuid[]) from public.brand_members bm
  where bm.user_id = auth.uid() and bm.revoked_at is null and (not p_owner_only or bm.role = 'owner')
    and (exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
                 where ab.brand_id = bm.brand_id and ab.status = 'active')
         or exists (select 1 from public.brands b where b.id = bm.brand_id and b.self_managed))
$$;

-- convites da equipe da marca sem agência: o dono lê
drop policy if exists invitations_select_brand_owner_self on public.invitations;
create policy invitations_select_brand_owner_self on public.invitations for select to authenticated
  using (agency_id is null and brand_id = any ((select public.my_brand_ids(true))::uuid[]));
-- convites da equipe do herói: o titular lê
drop policy if exists invitations_select_hero_owner on public.invitations;
create policy invitations_select_hero_owner on public.invitations for select to authenticated
  using (kind = 'hero_team' and creator_profile_id = any ((select public.my_owned_creator_ids())::uuid[]));

-- dono convida a equipe (com ou sem agência) — mesma assinatura da 0064
create or replace function public.brand_invite_member(p_brand uuid, p_email text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null and not exists (select 1 from public.brands b where b.id = p_brand and b.self_managed) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_agency is not null and public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.brand_members bm join auth.users u on u.id = bm.user_id
             where bm.brand_id = p_brand and bm.revoked_at is null and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.brand_id = p_brand and lower(i.email::text) = v_email;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, agency_id, brand_id, member_role, token_hash, expires_at, created_by, kind)
  values (v_email, 'brand', v_agency, p_brand, 'staff', encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid(),
          case when v_agency is null then 'brand_staff' end)
  returning id into v_id;
  perform public.audit_log('brand.member_invite', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'brand_id', p_brand, 'email', v_email, 'member_role', 'staff'), null, 'brand'::public.actor_type);
  return query select v_id, v_token;
end $$;
revoke execute on function public.brand_invite_member(uuid, text, int) from public, anon;
grant execute on function public.brand_invite_member(uuid, text, int) to authenticated, service_role;

create or replace function public.brand_member_remove(p_brand uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_role text; v_email text; v_by_owner boolean; v_actor public.actor_type;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.brand_active_agency(p_brand);
  v_by_owner := coalesce(public.brand_member_of(p_brand) = 'owner', false);
  if v_agency is null and not v_by_owner and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_by_owner and not public.agency_can(v_agency, 'manager') and not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_agency is not null and public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  perform 1 from public.brands b where b.id = p_brand for update;
  select bm.role into v_role from public.brand_members bm where bm.brand_id = p_brand and bm.user_id = p_user and bm.revoked_at is null for update;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role = 'owner' and (select count(*) from public.brand_members bm
                           where bm.brand_id = p_brand and bm.role = 'owner' and bm.revoked_at is null) <= 1 then
    raise exception 'last_brand_owner' using errcode = 'P0001';
  end if;
  update public.brand_members set revoked_at = now() where brand_id = p_brand and user_id = p_user and revoked_at is null;
  update public.role_assignments set revoked_at = now()
  where user_id = p_user and role::text = 'brand' and scope_id = p_brand and revoked_at is null;
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user;
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.brand_id = p_brand and lower(i.email::text) = v_email;
  v_actor := case when v_by_owner then 'brand' when v_agency is null or public.agency_role_of(v_agency) is null then 'admin' else 'agency' end::public.actor_type;
  perform public.audit_log('brand.member_remove', 'brand_member', p_user::text,
    jsonb_build_object('agency_id', v_agency, 'brand_id', p_brand, 'role', v_role),
    jsonb_build_object('agency_id', v_agency, 'brand_id', p_brand, 'removed', true), null, v_actor);
end $$;
revoke execute on function public.brand_member_remove(uuid, uuid) from public, anon;
grant execute on function public.brand_member_remove(uuid, uuid) to authenticated, service_role;

-- transferir a posse: o dono passa para um membro da Equipe e vira Equipe
create or replace function public.brand_transfer_owner(p_brand uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform 1 from public.brands b where b.id = p_brand for update;
  select bm.role into v_role from public.brand_members bm where bm.brand_id = p_brand and bm.user_id = p_user and bm.revoked_at is null for update;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.brand_members set role = 'owner' where brand_id = p_brand and user_id = p_user;
  update public.brand_members set role = 'staff' where brand_id = p_brand and user_id = auth.uid();
  perform public.audit_log('brand.owner_transfer', 'brand', p_brand::text,
    jsonb_build_object('owner', auth.uid()), jsonb_build_object('owner', p_user, 'previous_owner_now', 'staff'), null, 'brand'::public.actor_type);
end $$;
revoke execute on function public.brand_transfer_owner(uuid, uuid) from public, anon;
grant execute on function public.brand_transfer_owner(uuid, uuid) to authenticated, service_role;

-- 5) auxiliares ----------------------------------------------------------------------------------------------------
-- CNPJ: 14 dígitos com os dois verificadores (sem máscara). Pura.
create or replace function public.cnpj_valid(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d int[]; s int; r int; w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2]; i int;
begin
  if p is null or p !~ '^[0-9]{14}$' or p ~ '^(.)\1{13}$' then return false; end if;
  select array_agg(substr(p, g, 1)::int order by g) into d from generate_series(1, 14) g;
  s := 0; for i in 1..12 loop s := s + d[i] * w1[i]; end loop;
  r := s % 11; if (case when r < 2 then 0 else 11 - r end) <> d[13] then return false; end if;
  s := 0; for i in 1..13 loop s := s + d[i] * w2[i]; end loop;
  r := s % 11; return (case when r < 2 then 0 else 11 - r end) = d[14];
end $$;
revoke execute on function public.cnpj_valid(text) from public, anon;
grant execute on function public.cnpj_valid(text) to authenticated, service_role;

-- slug livre a partir de um nome (tabela: creator, agency, brand, seller, professional). Interna.
create or replace function public.free_slug(p_name text, p_table text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_base text; v_slug text; v_n int := 1; v_taken boolean;
begin
  v_base := left(coalesce(nullif(public.slugify(coalesce(p_name, '')), ''), p_table), 50);
  v_base := trim(both '-' from v_base);
  if char_length(v_base) < 3 then v_base := v_base || '-' || p_table; end if;
  v_slug := v_base;
  loop
    v_taken := case p_table
      when 'creator' then exists (select 1 from public.creator_profiles where slug = v_slug)
      when 'agency' then exists (select 1 from public.agencies where slug = v_slug)
      when 'brand' then exists (select 1 from public.brands where slug = v_slug)
      when 'seller' then exists (select 1 from public.seller_organizations where slug = v_slug)
      else exists (select 1 from public.professionals where slug = v_slug) end;
    exit when not v_taken;
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;
  return v_slug;
end $$;
revoke execute on function public.free_slug(text, text) from public, anon, authenticated;
grant execute on function public.free_slug(text, text) to service_role;

-- herói pendente (criado por convite ou pelo próprio creator): aguarda a aprovação do admin. Interna.
create or replace function public.create_pending_hero(p_name text, p_rights_holder text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) not between 2 and 80 then raise exception 'name_required' using errcode = '22023'; end if;
  insert into public.creator_profiles (slug, name, is_fictional, rights_status, rights_holder, status)
  values (public.free_slug(v_name, 'creator'), v_name, false,
          case when nullif(btrim(coalesce(p_rights_holder, '')), '') is null then 'pending' else 'authorized' end,
          nullif(btrim(coalesce(p_rights_holder, '')), ''), 'pending')
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.create_pending_hero(text, text) from public, anon, authenticated;
grant execute on function public.create_pending_hero(text, text) to service_role;

-- grava um convite e devolve {id, email, token}. Interna (as RPCs de cada papel conferem quem pode).
create or replace function public.invitation_issue(p_email text, p_role text, p_kind text, p_days int, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (email, role, kind, team_role, creator_profile_id, agency_id, brand_id, talent_id, token_hash, expires_at, created_by)
  values (v_email, p_role::public.app_role, p_kind, p_data ->> 'team_role', (p_data ->> 'creator_profile_id')::uuid,
          (p_data ->> 'agency_id')::uuid, (p_data ->> 'brand_id')::uuid, (p_data ->> 'talent_id')::uuid,
          encode(extensions.digest(v_token, 'sha256'), 'hex'),
          case when p_role = 'admin' then now() + make_interval(days => greatest(1, least(coalesce(p_days, 2), 2)))
               else now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))) end,
          auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'email', v_email, 'token', v_token, 'kind', p_kind);
end $$;
revoke execute on function public.invitation_issue(text, text, text, int, jsonb) from public, anon, authenticated;
grant execute on function public.invitation_issue(text, text, text, int, jsonb) to service_role;

-- 6) convite do admin ------------------------------------------------------------------------------------------------
-- p_role: consumer | admin | agency | brand | creator | hero | seller | professional
-- p_options: confirm_admin (bool); creator: hero_mode none|existing|new, hero_id, hero_name;
--            hero: hero_name, team_mode later|existing|new, team_user_id, team_email
-- Devolve {invitations: [{id, email, token, kind}], creator_profile_id}
create or replace function public.admin_invite(p_email text, p_role text, p_days int, p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_opt jsonb := coalesce(p_options, '{}'::jsonb); v_out jsonb := '[]'::jsonb; v_inv jsonb; v_hero uuid; v_mode text;
        v_owner uuid; v_team_user uuid; v_email text := lower(btrim(coalesce(p_email, '')));
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
  elsif p_role = 'creator' then
    v_mode := coalesce(v_opt ->> 'hero_mode', 'none');
    if v_mode = 'none' then
      v_out := jsonb_build_array(public.invitation_issue(v_email, 'creator', 'creator', p_days, '{}'::jsonb));
    elsif v_mode = 'existing' then
      begin v_hero := (v_opt ->> 'hero_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      select c.user_id into v_owner from public.creator_profiles c where c.id = v_hero and c.status <> 'suspended';
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
      -- herói sem titular (e sem convite de titular pendente): a pessoa vira titular; senão, membro
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
  else -- hero
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
  end if;
  perform public.audit_log('invitation.create', 'invitation', (v_out -> 0 ->> 'id'), null,
    jsonb_build_object('email', v_email, 'role', p_role, 'creator_profile_id', v_hero, 'team_user_id', v_team_user,
                       'invitations', (select jsonb_agg(x - 'token') from jsonb_array_elements(v_out) x)), null, 'admin');
  return jsonb_strip_nulls(jsonb_build_object('invitations', v_out, 'creator_profile_id', v_hero));
end $$;
revoke execute on function public.admin_invite(text, text, int, jsonb) from public, anon;
grant execute on function public.admin_invite(text, text, int, jsonb) to authenticated, service_role;

-- 7) equipe do herói: titular (ou admin) convida, remove e transfere -------------------------------------------------
create or replace function public.hero_team_guard(p_creator uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.creator_profiles c where c.id = p_creator) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.is_platform_admin() then return; end if;
  if public.creator_team_role(p_creator, auth.uid()) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.creator_team_role(p_creator, auth.uid()) <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.creator_profiles c where c.id = p_creator and c.status = 'suspended') then
    raise exception 'partner_suspended' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.hero_team_guard(uuid) from public, anon, authenticated;
grant execute on function public.hero_team_guard(uuid) to service_role;

create or replace function public.hero_team_invite(p_creator uuid, p_email text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_inv jsonb; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform public.hero_team_guard(p_creator);
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.creator_team_members m join auth.users u on u.id = m.user_id
             where m.creator_profile_id = p_creator and m.status = 'active' and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  -- convite novo substitui o pendente do mesmo e-mail para a mesma equipe
  update public.invitations i set status = 'revoked', revoked_at = now()
  where i.status = 'pending' and i.creator_profile_id = p_creator and i.kind = 'hero_team' and lower(i.email::text) = v_email;
  v_inv := public.invitation_issue(v_email, 'creator', 'hero_team', p_days,
    jsonb_build_object('creator_profile_id', p_creator, 'team_role', 'member'));
  perform public.audit_log('hero_team.invite', 'invitation', v_inv ->> 'id', null,
    jsonb_build_object('creator_id', p_creator, 'email', v_email), null,
    case when public.creator_team_role(p_creator, auth.uid()) = 'owner' then 'creator' else 'admin' end::public.actor_type);
  return query select (v_inv ->> 'id')::uuid, v_inv ->> 'token';
end $$;
revoke execute on function public.hero_team_invite(uuid, text, int) from public, anon;
grant execute on function public.hero_team_invite(uuid, text, int) to authenticated, service_role;

create or replace function public.hero_team_remove(p_creator uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  perform public.hero_team_guard(p_creator);
  select m.role into v_role from public.creator_team_members m
  where m.creator_profile_id = p_creator and m.user_id = p_user and m.status = 'active' for update;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- o titular não sai sem antes transferir (nem pelo admin: use a transferência)
  if v_role = 'owner' then raise exception 'owner_must_transfer' using errcode = 'P0001'; end if;
  update public.creator_team_members set status = 'removed', removed_at = now(), updated_at = now()
  where creator_profile_id = p_creator and user_id = p_user;
  perform set_config('app.trusted', 'on', true);
  update public.role_assignments set revoked_at = now()
  where user_id = p_user and role::text = 'creator' and scope_type = 'creator' and scope_id = p_creator and revoked_at is null;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('hero_team.remove', 'creator_profile', p_creator::text,
    jsonb_build_object('user_id', p_user, 'role', v_role), jsonb_build_object('user_id', p_user, 'removed', true), null,
    case when public.creator_team_role(p_creator, auth.uid()) = 'owner' then 'creator' else 'admin' end::public.actor_type);
end $$;
revoke execute on function public.hero_team_remove(uuid, uuid) from public, anon;
grant execute on function public.hero_team_remove(uuid, uuid) to authenticated, service_role;

create or replace function public.hero_team_transfer(p_creator uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old uuid; v_actor public.actor_type;
begin
  perform public.hero_team_guard(p_creator);
  v_actor := case when public.creator_team_role(p_creator, auth.uid()) = 'owner' then 'creator' else 'admin' end::public.actor_type;
  if not exists (select 1 from public.creator_team_members m where m.creator_profile_id = p_creator and m.user_id = p_user
                 and m.status = 'active' and m.role = 'member') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select c.user_id into v_old from public.creator_profiles c where c.id = p_creator for update;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles set user_id = p_user where id = p_creator;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('hero_team.transfer', 'creator_profile', p_creator::text,
    jsonb_build_object('owner', v_old), jsonb_build_object('owner', p_user, 'previous_owner_now', 'member'), null, v_actor);
end $$;
revoke execute on function public.hero_team_transfer(uuid, uuid) from public, anon;
grant execute on function public.hero_team_transfer(uuid, uuid) to authenticated, service_role;

-- equipe do herói: nome, papel, desde e e-mail mascarado; convites pendentes só para o titular/admin
create or replace function public.hero_team_list(p_creator uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := public.creator_team_role(p_creator, auth.uid()); v_admin boolean := public.is_platform_admin();
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_role is null and not v_admin then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'my_role', coalesce(v_role, case when v_admin then 'admin' end),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'role', m.role, 'since', m.created_at,
        'name', coalesce(nullif(btrim(p.display_name), ''), split_part(u.email::text, '@', 1)),
        'email', public.mask_email(u.email::text), 'me', m.user_id = auth.uid())
        order by (m.role = 'owner') desc, m.created_at), '[]'::jsonb)
      from public.creator_team_members m join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.creator_profile_id = p_creator and m.status = 'active'),
    'invites', case when v_role = 'owner' or v_admin then (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'expires_at', i.expires_at) order by i.created_at desc), '[]'::jsonb)
      from public.invitations i where i.creator_profile_id = p_creator and i.status = 'pending' and i.expires_at >= now()
        and coalesce(i.team_role, 'owner') = 'member') else '[]'::jsonb end);
end $$;
revoke execute on function public.hero_team_list(uuid) from public, anon;
grant execute on function public.hero_team_list(uuid) to authenticated, service_role;

-- herói da pessoa logada (titular primeiro), com o papel e a situação — também o pendente
create or replace function public.my_hero_team()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('creator_id', c.id, 'role', m.role, 'status', c.status, 'name', c.name, 'slug', c.slug)
  from public.creator_team_members m join public.creator_profiles c on c.id = m.creator_profile_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by (m.role = 'owner') desc, (c.status = 'active') desc, m.created_at limit 1
$$;
revoke execute on function public.my_hero_team() from public, anon;
grant execute on function public.my_hero_team() to authenticated, service_role;

-- creator sem herói cria o dele (pendente de aprovação do admin) e vira titular
create or replace function public.creator_create_my_hero(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.role_assignments r where r.user_id = auth.uid() and r.role::text = 'creator' and r.revoked_at is null) then
    raise exception 'creator_role_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('my_hero:' || auth.uid()::text));
  if exists (select 1 from public.creator_profiles c where c.user_id = auth.uid())
     or exists (select 1 from public.creator_team_members m where m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'has_hero' using errcode = 'P0001';
  end if;
  v_id := public.create_pending_hero(p_name, null);
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles set user_id = auth.uid() where id = v_id;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'creator', 'creator', v_id, auth.uid())
  on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('hero.self_create', 'creator_profile', v_id::text, null,
    jsonb_build_object('name', btrim(p_name), 'status', 'pending'), null, 'creator');
  return v_id;
end $$;
revoke execute on function public.creator_create_my_hero(text) from public, anon;
grant execute on function public.creator_create_my_hero(text) to authenticated, service_role;

-- 8) agência: convida marca (nova ou existente) e herói -------------------------------------------------------------
create or replace function public.agency_invite_brand(p_agency uuid, p_email text, p_days int default 7)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_brand uuid; v_other uuid; v_inv jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  -- e-mail dono de marca: a primeira (mais antiga) que ainda não está com esta agência
  select bm.brand_id into v_brand from public.brand_members bm join auth.users u on u.id = bm.user_id
  join public.brands b on b.id = bm.brand_id and not b.is_demo
  where bm.role = 'owner' and bm.revoked_at is null and lower(u.email::text) = v_email
    and not exists (select 1 from public.agency_brands ab where ab.brand_id = bm.brand_id and ab.agency_id = p_agency and ab.status = 'active')
  order by bm.created_at limit 1;
  if v_brand is null and exists (select 1 from public.brand_members bm join auth.users u on u.id = bm.user_id
                                 join public.agency_brands ab on ab.brand_id = bm.brand_id and ab.agency_id = p_agency and ab.status = 'active'
                                 where bm.role = 'owner' and bm.revoked_at is null and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if v_brand is not null then
    select ab.agency_id into v_other from public.agency_brands ab where ab.brand_id = v_brand and ab.status = 'active';
    if v_other is not null then raise exception 'brand_linked_elsewhere' using errcode = 'P0001'; end if;
    update public.invitations i set status = 'revoked', revoked_at = now()
    where i.status = 'pending' and i.kind = 'brand_link' and i.brand_id = v_brand and i.agency_id = p_agency;
    v_inv := public.invitation_issue(v_email, 'brand', 'brand_link', p_days, jsonb_build_object('brand_id', v_brand, 'agency_id', p_agency));
  else
    update public.invitations i set status = 'revoked', revoked_at = now()
    where i.status = 'pending' and i.kind = 'onboarding' and i.role::text = 'brand' and i.agency_id = p_agency and lower(i.email::text) = v_email;
    v_inv := public.invitation_issue(v_email, 'brand', 'onboarding', p_days, jsonb_build_object('agency_id', p_agency));
  end if;
  perform public.audit_log('agency.brand_invite', 'invitation', v_inv ->> 'id', null,
    jsonb_build_object('agency_id', p_agency, 'email', v_email, 'kind', v_inv ->> 'kind', 'brand_id', v_brand), null,
    case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
  return v_inv;
end $$;
revoke execute on function public.agency_invite_brand(uuid, text, int) from public, anon;
grant execute on function public.agency_invite_brand(uuid, text, int) to authenticated, service_role;

create or replace function public.agency_invite_hero(p_talent uuid, p_name text, p_email text, p_days int default 7)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_t record; v_hero uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_agency := public.talent_write_scope(p_talent, 'manager');
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  select t.user_id, t.creator_id into v_t from public.talent_profiles t where t.id = p_talent;
  if v_t.creator_id is null then
    -- creator do casting sem herói: o herói nasce pendente, ligado ao talento, e o convidado vira titular
    if v_t.user_id is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
    if not public.agency_email_ok(lower(btrim(coalesce(p_email, '')))) then raise exception 'invalid_email' using errcode = '22023'; end if;
    v_hero := public.create_pending_hero(p_name, (select a.name from public.agencies a where a.id = v_agency));
    perform set_config('app.trusted', 'on', true);
    update public.talent_profiles set creator_id = v_hero where id = p_talent;
    perform set_config('app.trusted', 'off', true);
    perform public.audit_log('agency.hero.create', 'creator_profile', v_hero::text, null,
      jsonb_build_object('agency', v_agency, 'talent_id', p_talent, 'status', 'pending'), null, 'agency');
  end if;
  -- herói sem titular: mesma regra e mesma forma do convite do escritório (0087)
  return query select * from public.agency_invite_talent(p_talent, p_email, p_days);
end $$;
revoke execute on function public.agency_invite_hero(uuid, text, text, int) from public, anon;
grant execute on function public.agency_invite_hero(uuid, text, text, int) to authenticated, service_role;

-- 9) revogar convite (0065 + marca sem agência, vínculo/marca nova e equipe do herói) — mesma assinatura -------------
create or replace function public.agency_invitation_revoke(p_id uuid, p_justification text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv record; v_allowed boolean := false; v_actor public.actor_type;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select i.id, i.role::text as role, i.agency_id, i.brand_id, i.talent_id, i.member_role, i.status, i.kind, i.creator_profile_id into v_inv
  from public.invitations i where i.id = p_id for update;
  if v_inv.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_inv.kind = 'hero_team' then
    v_allowed := public.creator_team_role(v_inv.creator_profile_id, auth.uid()) = 'owner' or public.is_platform_admin();
  elsif v_inv.agency_id is null then
    v_allowed := v_inv.kind = 'brand_staff' and coalesce(public.brand_member_of(v_inv.brand_id) = 'owner', false);
  elsif v_inv.role = 'agency' then
    v_allowed := public.agency_can(v_inv.agency_id, 'admin');
  elsif v_inv.role = 'brand' and v_inv.kind in ('brand_link', 'onboarding') then
    v_allowed := public.agency_can(v_inv.agency_id, 'manager');
  elsif v_inv.role = 'brand' then
    v_allowed := public.agency_can(v_inv.agency_id, 'manager')
      or coalesce(v_inv.member_role = 'staff' and public.brand_member_of(v_inv.brand_id) = 'owner', false);
  elsif v_inv.role = 'creator' and v_inv.talent_id is not null then
    v_allowed := public.agency_can(v_inv.agency_id, 'manager');
  end if;
  -- sem permissão no escopo do convite: não diz que ele existe
  if not coalesce(v_allowed, false) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_inv.status <> 'pending' then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  update public.invitations set status = 'revoked', revoked_at = now() where id = p_id;
  v_actor := case when v_inv.kind = 'hero_team' and not public.is_platform_admin() then 'creator'
                  when v_inv.agency_id is not null and public.agency_role_of(v_inv.agency_id) is not null then 'agency'
                  when public.brand_member_of(v_inv.brand_id) is not null then 'brand' else 'admin' end::public.actor_type;
  perform public.audit_log('invitation.revoke', 'invitation', p_id::text,
    jsonb_build_object('agency_id', v_inv.agency_id, 'status', 'pending'), jsonb_build_object('agency_id', v_inv.agency_id, 'status', 'revoked'),
    nullif(btrim(coalesce(p_justification, '')), ''), v_actor);
end $$;
revoke execute on function public.agency_invitation_revoke(uuid, text) from public, anon;
grant execute on function public.agency_invitation_revoke(uuid, text) to authenticated, service_role;

-- 10) primeiro acesso por onboarding ----------------------------------------------------------------------------------
create table if not exists public.account_onboardings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('agency', 'brand', 'seller', 'professional')),
  invitation_id uuid references public.invitations (id) on delete set null,
  agency_id uuid references public.agencies (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result_id uuid
);
create unique index if not exists account_onboardings_open_idx on public.account_onboardings (user_id, kind) where completed_at is null;
alter table public.account_onboardings enable row level security;
revoke all on public.account_onboardings from public, anon, authenticated;
grant select on public.account_onboardings to authenticated;
grant all on public.account_onboardings to service_role;
drop policy if exists account_onboardings_select_own on public.account_onboardings;
create policy account_onboardings_select_own on public.account_onboardings for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- passo a passo em aberto da pessoa logada (com o nome da agência que convidou a marca)
create or replace function public.onboarding_pending()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind,
           'agency', (select a.name from public.agencies a where a.id = o.agency_id)) order by o.created_at), '[]'::jsonb)
  from public.account_onboardings o where o.user_id = auth.uid() and o.completed_at is null
$$;
revoke execute on function public.onboarding_pending() from public, anon;
grant execute on function public.onboarding_pending() to authenticated, service_role;

-- passo em aberto do tipo pedido (trava a linha). Interna.
create or replace function public.onboarding_take(p_kind text)
returns public.account_onboardings language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.account_onboardings where user_id = auth.uid() and kind = p_kind and completed_at is null for update;
  if o.id is null then raise exception 'onboarding_not_found' using errcode = 'P0002'; end if;
  return o;
end $$;
revoke execute on function public.onboarding_take(text) from public, anon, authenticated;
grant execute on function public.onboarding_take(text) to service_role;

-- nome da pessoa para as tabelas de membros. Interna.
create or replace function public.my_display_name()
returns text language sql stable security definer set search_path = '' as $$
  select left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = auth.uid())), ''),
                       split_part(lower(coalesce(auth.jwt() ->> 'email', 'creator')), '@', 1)), 80)
$$;
revoke execute on function public.my_display_name() from public, anon, authenticated;
grant execute on function public.my_display_name() to service_role;

create or replace function public.onboarding_create_agency(p_name text, p_cnpj text, p_contact_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype; v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''); v_email text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
begin
  o := public.onboarding_take('agency');
  if char_length(v_name) not between 2 and 80 then raise exception 'name_required' using errcode = '22023'; end if;
  if v_cnpj is not null and not public.cnpj_valid(v_cnpj) then raise exception 'invalid_cnpj' using errcode = '22023'; end if;
  if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.agency_members m where m.user_id = auth.uid() and m.revoked_at is null) then
    raise exception 'agency_member_elsewhere' using errcode = 'P0001';
  end if;
  insert into public.agencies (slug, name, contact_email, cnpj, created_by)
  values (public.free_slug(v_name, 'agency'), v_name, v_email, v_cnpj, auth.uid()) returning id into v_id;
  perform public.agency_seed_defaults(v_id);
  insert into public.agency_members (agency_id, user_id, role, display_name, invited_by)
  values (v_id, auth.uid(), 'admin', public.my_display_name(), auth.uid());
  perform set_config('app.trusted', 'on', true);
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'agency', 'agency', v_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  update public.account_onboardings set completed_at = now(), result_id = v_id where id = o.id;
  perform public.audit_log('onboarding.agency', 'agency', v_id::text, null, jsonb_build_object('name', v_name, 'cnpj', v_cnpj is not null), null, 'agency');
  return v_id;
end $$;
revoke execute on function public.onboarding_create_agency(text, text, text) from public, anon;
grant execute on function public.onboarding_create_agency(text, text, text) to authenticated, service_role;

create or replace function public.onboarding_create_brand(p_name text, p_cnpj text, p_segment text, p_site_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype; v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''); v_segment text := nullif(btrim(coalesce(p_segment, '')), '');
        v_site text := btrim(coalesce(p_site_url, ''));
begin
  o := public.onboarding_take('brand');
  if char_length(v_name) not between 2 and 60 then raise exception 'name_required' using errcode = '22023'; end if;
  if v_cnpj is not null and not public.cnpj_valid(v_cnpj) then raise exception 'invalid_cnpj' using errcode = '22023'; end if;
  if v_segment is not null and char_length(v_segment) > 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.brand_https_url_ok(v_site) then raise exception 'invalid_url' using errcode = '22023'; end if;
  -- 'inactive': fora da loja pública até o admin ativar; self_managed: o portal funciona sem agência
  insert into public.brands (slug, name, site_url, status, self_managed, cnpj, segment, created_by)
  values (public.free_slug(v_name, 'brand'), v_name, v_site, 'inactive', true, v_cnpj, v_segment, auth.uid()) returning id into v_id;
  insert into public.brand_members (brand_id, user_id, role, display_name, invited_by)
  values (v_id, auth.uid(), 'owner', public.my_display_name(), auth.uid());
  perform set_config('app.trusted', 'on', true);
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'brand', 'brand', v_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  -- convidada por uma agência: já nasce atendida por ela (se a agência segue ativa)
  if o.agency_id is not null and exists (select 1 from public.agencies a where a.id = o.agency_id and a.status = 'active' and not a.is_demo) then
    insert into public.agency_brands (agency_id, brand_id, status, created_by) values (o.agency_id, v_id, 'active', auth.uid())
    on conflict (agency_id, brand_id) do update set status = 'active';
    perform public.inbox_notify_agency(o.agency_id, 'manager', 'brand_member_joined', '/agencia/marcas/' || v_id::text,
      jsonb_build_object('name', public.my_display_name(), 'brand', v_name), 'brand', v_id, 'brand_onboarded:' || v_id::text);
  end if;
  update public.account_onboardings set completed_at = now(), result_id = v_id where id = o.id;
  perform public.audit_log('onboarding.brand', 'brand', v_id::text, null,
    jsonb_build_object('name', v_name, 'cnpj', v_cnpj is not null, 'segment', v_segment, 'agency_id', o.agency_id), null, 'brand');
  return v_id;
end $$;
revoke execute on function public.onboarding_create_brand(text, text, text, text) from public, anon;
grant execute on function public.onboarding_create_brand(text, text, text, text) to authenticated, service_role;

create or replace function public.onboarding_create_seller(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype; v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  o := public.onboarding_take('seller');
  if char_length(v_name) not between 2 and 80 then raise exception 'name_required' using errcode = '22023'; end if;
  perform set_config('app.trusted', 'on', true);
  insert into public.seller_organizations (slug, name, kind, status, is_fictional)
  values (public.free_slug(v_name, 'seller'), v_name, 'partner', 'active', false) returning id into v_id;
  insert into public.seller_memberships (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'seller', 'seller_org', v_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  update public.account_onboardings set completed_at = now(), result_id = v_id where id = o.id;
  perform public.audit_log('onboarding.seller', 'seller_org', v_id::text, null, jsonb_build_object('name', v_name), null, 'seller');
  return v_id;
end $$;
revoke execute on function public.onboarding_create_seller(text) from public, anon;
grant execute on function public.onboarding_create_seller(text) to authenticated, service_role;

create or replace function public.onboarding_create_professional(p_name text, p_specialty text, p_registry_number text, p_registry_uf text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype; v_id uuid; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_type text;
begin
  o := public.onboarding_take('professional');
  if char_length(v_name) not between 2 and 80 then raise exception 'name_required' using errcode = '22023'; end if;
  v_type := case p_specialty when 'nutritionist' then 'CRN' when 'personal_trainer' then 'CREF'
                             when 'physiotherapist' then 'CREFITO' when 'psychologist' then 'CRP' end;
  if v_type is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if exists (select 1 from public.professionals p where p.user_id = auth.uid()) then
    raise exception 'professional_profile_already_linked' using errcode = 'P0001';
  end if;
  begin
    insert into public.professionals (user_id, slug, name, specialty, registry_type, registry_number, registry_uf, status)
    values (auth.uid(), public.free_slug(v_name, 'professional'), v_name, p_specialty, v_type, btrim(coalesce(p_registry_number, '')),
            upper(btrim(coalesce(p_registry_uf, ''))), 'pending') returning id into v_id;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform set_config('app.trusted', 'on', true);
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (auth.uid(), 'professional', 'professional', v_id, auth.uid()) on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform set_config('app.trusted', 'off', true);
  update public.account_onboardings set completed_at = now(), result_id = v_id where id = o.id;
  perform public.audit_log('onboarding.professional', 'professional', v_id::text, null,
    jsonb_build_object('name', v_name, 'specialty', p_specialty), null, 'consumer');
  return v_id;
end $$;
revoke execute on function public.onboarding_create_professional(text, text, text, text) from public, anon;
grant execute on function public.onboarding_create_professional(text, text, text, text) to authenticated, service_role;

-- 11) aceite: 0087 + admin, consumidor, onboarding, creator sem herói, equipe do herói, marca sem agência e vínculo ---
create or replace function public.accept_invitation_core(p_invitation uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.invitations%rowtype; v_email text; v_uid uuid; v_name text; v_scope_type text; v_scope_id uuid;
        v_creator uuid; v_found boolean; v_onb uuid; v_other uuid;
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
  -- D6: conta demo não entra em agência real (nem na marca nem no casting dela); nem vira admin
  if v_inv.agency_id is not null and not public.agency_is_demo(v_inv.agency_id) and public.is_demo_account() then
    raise exception 'demo_account_forbidden';
  end if;
  if v_inv.role::text = 'admin' and public.is_demo_account() then raise exception 'demo_account_forbidden'; end if;
  if v_inv.agency_id is not null and exists (select 1 from public.agencies a where a.id = v_inv.agency_id and a.status <> 'active') then
    raise exception 'partner_suspended';
  end if;
  v_name := left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = v_uid)), ''), split_part(v_email, '@', 1)), 80);

  perform set_config('app.trusted', 'on', true);
  if v_inv.kind = 'admin' then
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'admin', 'global', null, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    perform public.audit_log('invitation.accept_admin', 'invitation', v_inv.id::text, null,
      jsonb_build_object('user_id', v_uid, 'role', 'admin', 'full_control', true), null, 'admin');
    v_scope_type := 'global';
  elsif v_inv.kind = 'consumer' then
    v_scope_type := 'consumer';
  elsif v_inv.kind = 'onboarding' then
    -- a empresa/perfil nasce no passo a passo (o papel só vem com ela)
    insert into public.account_onboardings (user_id, kind, invitation_id, agency_id)
    values (v_uid, v_inv.role::text, v_inv.id, v_inv.agency_id)
    on conflict (user_id, kind) where completed_at is null do update set invitation_id = excluded.invitation_id,
      agency_id = coalesce(excluded.agency_id, public.account_onboardings.agency_id)
    returning id into v_onb;
    v_scope_type := 'onboarding'; v_scope_id := v_onb;
  elsif v_inv.kind = 'creator' and v_inv.creator_profile_id is null then
    -- creator sem herói: o papel global; o herói ele cria depois (creator_create_my_hero)
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'global', null, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'global';
  elsif v_inv.role::text = 'seller' then
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
  elsif v_inv.kind = 'brand_link' then
    -- pedido de vínculo: só o dono da marca aceita; D18 (uma agência ativa por marca)
    if not exists (select 1 from public.brand_members bm where bm.brand_id = v_inv.brand_id and bm.user_id = v_uid
                   and bm.role = 'owner' and bm.revoked_at is null) then
      perform set_config('app.trusted', 'off', true);
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select ab.agency_id into v_other from public.agency_brands ab where ab.brand_id = v_inv.brand_id and ab.status = 'active';
    if v_other is not null and v_other <> v_inv.agency_id then
      perform set_config('app.trusted', 'off', true);
      raise exception 'brand_linked_elsewhere';
    end if;
    insert into public.agency_brands (agency_id, brand_id, status, created_by) values (v_inv.agency_id, v_inv.brand_id, 'active', v_uid)
    on conflict (agency_id, brand_id) do update set status = 'active';
    -- a marca que aceitou continua dela se a agência sair
    update public.brands set self_managed = true where id = v_inv.brand_id;
    perform public.inbox_notify_agency(v_inv.agency_id, 'manager', 'brand_member_joined', '/agencia/marcas/' || v_inv.brand_id::text,
      jsonb_build_object('name', v_name, 'brand', (select b.name from public.brands b where b.id = v_inv.brand_id)),
      'brand', v_inv.brand_id, 'brand_link_accepted:' || v_inv.id::text);
    v_scope_type := 'brand'; v_scope_id := v_inv.brand_id;
  elsif v_inv.role::text = 'brand' then
    if v_inv.agency_id is null then
      if not exists (select 1 from public.brands b where b.id = v_inv.brand_id and b.self_managed) then
        perform set_config('app.trusted', 'off', true);
        raise exception 'brand_not_linked';
      end if;
    elsif not exists (select 1 from public.agency_brands ab where ab.agency_id = v_inv.agency_id and ab.brand_id = v_inv.brand_id and ab.status = 'active') then
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
    if v_inv.agency_id is not null then
      perform public.inbox_notify_agency(v_inv.agency_id, 'manager', 'brand_member_joined', '/agencia/marcas/' || v_inv.brand_id::text,
        jsonb_build_object('name', v_name, 'brand', (select b.name from public.brands b where b.id = v_inv.brand_id)),
        'brand', v_inv.brand_id, 'brand_member_joined_agency:' || v_inv.id::text);
    end if;
    v_scope_type := 'brand'; v_scope_id := v_inv.brand_id;
  elsif v_inv.role::text = 'creator' and v_inv.talent_id is not null then
    perform pg_advisory_xact_lock(hashtext('talent_person:' || v_uid::text));
    -- D10: no máximo um talento por pessoa (próprio ou pelo herói)
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
  elsif v_inv.team_role = 'member' then
    -- 0091: entra na equipe do herói como membro (não mexe no titular)
    insert into public.creator_team_members (creator_profile_id, user_id, role, status, created_by)
    values (v_inv.creator_profile_id, v_uid, 'member', 'active', v_inv.created_by)
    on conflict (creator_profile_id, user_id) do update
      set status = 'active', removed_at = null, updated_at = now();
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_uid, 'creator', 'creator', v_inv.creator_profile_id, v_inv.created_by)
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
    v_scope_type := 'creator'; v_scope_id := v_inv.creator_profile_id;
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
    jsonb_build_object('role', v_inv.role, 'kind', v_inv.kind, 'user_id', v_uid, 'agency_id', v_inv.agency_id, 'brand_id', v_inv.brand_id,
                       'talent_id', v_inv.talent_id, 'creator_id', coalesce(v_creator, v_inv.creator_profile_id), 'team_role', v_inv.team_role),
    null, 'consumer');
  perform set_config('app.trusted', 'off', true);
  -- talent_id: o app manda quem entrou por convite de talento ao escritório; onboarding: ao passo a passo
  return jsonb_strip_nulls(jsonb_build_object('role', v_inv.role, 'scope_type', v_scope_type, 'scope_id', v_scope_id,
                                              'talent_id', v_inv.talent_id, 'kind', v_inv.kind, 'team_role', v_inv.team_role,
                                              'onboarding', case when v_inv.kind = 'onboarding' then v_inv.role::text end));
end $$;
revoke execute on function public.accept_invitation_core(uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation_core(uuid) to service_role;

-- os dois caminhos do aceite (link e primeiro acesso) passam pelo núcleo acima — iguais à 0077
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

notify pgrst, 'reload schema';
