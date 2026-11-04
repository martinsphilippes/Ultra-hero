-- =============================================================================
-- Groscove Ultra · 0112 · Acesso nasce junto: herói (um só "Novo herói", pelo Casting) e marca criada pela agência
-- Pedidos do responsável (04/11): "Pra criar um herói, tem que criar uma conta vinculada ao herói criado
-- automaticamente; obrigatoriamente colocar o telefone e e-mail" — e depois: um só "Novo herói" (no Casting, que é a
-- pessoa), com a página pública opcional no mesmo passo; e a "Nova marca" da agência também gera o acesso do contato
-- da marca. Cenário S118. Idempotente; nada de drop de tabela/coluna; nenhuma função nova executável por anon
-- (S14 segue 18).
--
-- Decisões (sem perguntar ao responsável):
--   • Sem criar usuário de Auth pela agência: o app tem a service role só no servidor (primeiro acesso 0077, cadastro
--     rápido), mas a agência NÃO escolhe senha de ninguém. O desenho é convite/reivindicação genérico para dois alvos
--     ('talent' | 'brand'): uma linha de contato (access_contacts) e o convite que já existe (invitations, token com
--     hash, uso único), com kind próprio — 'agency_hero' (forma do convite de talento da 0087: papel creator +
--     talent_id + agency_id) e 'agency_brand' (forma do convite de equipe da marca da 0064: papel brand + brand_id +
--     agency_id + member_role 'owner'). Vale 14 dias. O aceite (accept_invitation_core, SEM mudança) já faz o vínculo
--     certo: talento com página → conta no herói (creator_profiles.user_id + papel creator escopo creator); sem página →
--     login do talento (talent_profiles.user_id + escopo talent); marca → Dono (brand_members + papel brand). Os três
--     caminhos que já existem servem: link do e-mail (/invite), primeiro acesso pela tela de entrar com o e-mail
--     convidado (0077) e qualquer login/cadastro com o MESMO e-mail (accept_my_invitations). O núcleo confere o e-mail
--     da sessão com o do convite: outro e-mail nunca reivindica.
--   • Já existe conta com o e-mail → liga na hora (mesmas regras do aceite: conta demo não entra em agência real; uma
--     pessoa, um talento; uma pessoa, um herói) e avisa no sino (tipos novos 'hero_account_linked' e
--     'brand_access_granted'); o app manda também o e-mail. A RPC lê auth.users só por dentro (security definer) e
--     nunca devolve dados da conta (só o e-mail mascarado, como agency_talent_access).
--   • Convites pausados (0103): estes dois kinds NÃO passam pelo interruptor (como o staff externo da 0110): é a
--     própria agência gerando o acesso de quem ela acabou de cadastrar. invitations não tem política de escrita: só as
--     RPCs desta migração gravam esses kinds.
--   • Contato em tabela própria (access_contacts), fora de creator_profiles (pública) e de talent_profiles (que o
--     colaborador lê): e-mail minúsculo e celular E.164 (+55 DDD 9XXXXXXXX). Leitura só gestor+ da agência e admin
--     geral (dado pessoal: nem público, nem marca, nem colaborador). Escrita só pelas RPCs.
--   • Um herói por e-mail: o e-mail de contato não se repete entre talentos não arquivados (hero_email_taken; trava por
--     e-mail contra corrida) e não pode ser de quem já é titular de outro herói ou tem outro talento. Marca: o mesmo
--     contato pode ser Dono de várias marcas (sem trava de unicidade).
--   • "Nova marca nasce fora do app" (D7: brands.status 'inactive', fora da vitrine pública) continua; quando o contato
--     vira Dono (na hora ou no aceite) a marca passa a self_managed (como o aceite do pedido de vínculo da 0091): o
--     portal da marca segue funcionando mesmo se a agência sair. Publicar na vitrine continua sendo do admin.
--   • Um só "Novo herói": agency_hero_create grava o talento (agency_talent_save), os segmentos, o contato e, se pedido,
--     a página pública JÁ LIGADA ao talento — tudo numa transação. A página também nasce depois pelo botão da ficha
--     (agency_talent_create_page). Talento com login próprio: a página nasce com a pessoa como titular e o login passa
--     do talento para o herói sem apagar consentimento/documentos (talent_login_changed ganha a exceção
--     app.talent_same_person, ligada só por talent_page_create).
--   • agency_create_hero (0070/0073) é removida: a tela Heróis não cria mais herói (só lista, edita e publica).
--   • Reenviar (access_invite_resend) e corrigir o e-mail (access_contact_save) revogam o convite pendente e emitem
--     outro (link novo). Um convite de titular pelo casting com outro e-mail é recusado (hero_email_mismatch).
--     Situação: agency_access_status (active | pending | expired | none).
-- =============================================================================

-- 1) contato de acesso ----------------------------------------------------------------------------------------------
create table if not exists public.access_contacts (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid unique references public.talent_profiles (id) on delete cascade,
  brand_id uuid unique references public.brands (id) on delete cascade,
  contact_name text,
  email text not null,
  phone_e164 text not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_contacts_target_check check ((talent_id is null) <> (brand_id is null)),
  constraint access_contacts_name_check check (contact_name is null or char_length(btrim(contact_name)) between 2 and 80),
  constraint access_contacts_email_check check (char_length(email) <= 254 and email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint access_contacts_phone_check check (phone_e164 ~ '^\+55[1-9][1-9]9[0-9]{8}$')
);
create index if not exists access_contacts_email_idx on public.access_contacts (email);

alter table public.access_contacts enable row level security;
revoke all on public.access_contacts from public, anon, authenticated;
grant select on public.access_contacts to authenticated;
grant all on public.access_contacts to service_role;
drop policy if exists access_contacts_select on public.access_contacts;
create policy access_contacts_select on public.access_contacts for select to authenticated
  using ((select public.is_platform_admin())
         or (talent_id is not null and exists (select 1 from public.talent_profiles t
              where t.id = access_contacts.talent_id and t.agency_id = any ((select public.my_agency_ids('manager'))::uuid[])))
         or (brand_id is not null and exists (select 1 from public.agency_brands ab
              where ab.brand_id = access_contacts.brand_id and ab.status = 'active'
                and ab.agency_id = any ((select public.my_agency_ids('manager'))::uuid[]))));

-- 2) convites de acesso: kinds novos, fora da pausa, e-mail coerente ------------------------------------------------
alter table public.invitations drop constraint if exists invitations_kind_check;
alter table public.invitations add constraint invitations_kind_check check (kind is null or kind in
  ('admin', 'consumer', 'creator', 'hero', 'hero_team', 'onboarding', 'brand_staff', 'brand_link', 'agency_hero', 'agency_brand'));

create or replace function public.invitations_flag_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 0112: o acesso do herói/da marca criados pela agência não passa pela pausa (só as RPCs da 0112 gravam estes kinds)
  if new.kind in ('agency_hero', 'agency_brand') then return new; end if;
  if not public.invites_enabled() then raise exception 'invites_disabled' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke execute on function public.invitations_flag_guard() from public, anon, authenticated;
grant execute on function public.invitations_flag_guard() to service_role;

-- convite de titular (casting/admin) para talento com contato: o MESMO e-mail (membro da equipe do herói não conta)
create or replace function public.invitations_access_contact_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_talent uuid; v_email text;
begin
  if coalesce(new.team_role, 'owner') = 'member' then return new; end if;
  v_talent := coalesce(new.talent_id, (select t.id from public.talent_profiles t where new.creator_profile_id is not null and t.creator_id = new.creator_profile_id));
  if v_talent is null then return new; end if;
  select c.email into v_email from public.access_contacts c where c.talent_id = v_talent;
  if v_email is not null and v_email <> lower(btrim(new.email::text)) then
    raise exception 'hero_email_mismatch' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.invitations_access_contact_guard() from public, anon, authenticated;
grant execute on function public.invitations_access_contact_guard() to service_role;
drop trigger if exists invitations_access_contact_guard on public.invitations;
create trigger invitations_access_contact_guard before insert on public.invitations
  for each row execute function public.invitations_access_contact_guard();

-- aceite do convite da marca: a marca fica com quem a reivindicou (self_managed), como o pedido de vínculo da 0091
create or replace function public.invitations_brand_claimed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'agency_brand' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform set_config('app.trusted', 'on', true);
    update public.brands set self_managed = true where id = new.brand_id;
  end if;
  return new;
end $$;
revoke execute on function public.invitations_brand_claimed() from public, anon, authenticated;
grant execute on function public.invitations_brand_claimed() to service_role;
drop trigger if exists invitations_brand_claimed on public.invitations;
create trigger invitations_brand_claimed after update of status on public.invitations
  for each row execute function public.invitations_brand_claimed();

-- login do talento passando para o herói da MESMA pessoa (página criada depois): não é troca de pessoa
create or replace function public.talent_login_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.talent_same_person', true), '') = 'on' then return new; end if;
  if old.user_id is not null and new.user_id is distinct from old.user_id then
    if new.consent_at is not null and new.consent_revoked_at is null then new.consent_revoked_at := now(); end if;
    new.catalog_visible := false;
    perform public.talent_reset_person_data(new.id);
  end if;
  return new;
end $$;
revoke execute on function public.talent_login_changed() from public, anon, authenticated;

-- 3) avisos novos no sino --------------------------------------------------------------------------------------------
alter table public.inbox_notifications drop constraint if exists inbox_notifications_kind_check;
alter table public.inbox_notifications add constraint inbox_notifications_kind_check check (kind in (
  'member_joined', 'brand_member_joined',
  'talent_consent_given', 'talent_consent_revoked',
  'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
  'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
  'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
  'calendar_event_added', 'commercial_date_published',
  'relationship_alert', 'task_overdue', 'payout_updated',
  'internal_approval_requested', 'internal_approval_decided', 'shortlist_sent', 'shortlist_decided',
  'invoice_submitted', 'invoice_reviewed', 'payout_scheduled', 'budget_exceeded',
  'usage_rights_expiring', 'deliverable_comment',
  'task_due_soon',
  'sponsorship_published', 'sponsorship_interest', 'sponsorship_decided',
  'sponsorship_negotiation',
  'brand_call_published', 'brand_call_interest', 'brand_call_negotiation', 'brand_call_decided', 'brand_call_review',
  'budget_change', 'payment_reported', 'payment_reviewed', 'payment_due', 'payment_plan',
  'roadmap_due_soon', 'roadmap_overdue',
  'payout_due',
  'hero_account_linked', 'brand_access_granted'));

-- 4) validação, escopo e núcleo -------------------------------------------------------------------------------------
create or replace function public.access_contact_valid(p_email text, p_phone text)
returns boolean language sql immutable set search_path = '' as $$
  select p_email is not null and char_length(p_email) <= 254 and p_email = lower(btrim(p_email))
     and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     and p_phone is not null and p_phone ~ '^\+55[1-9][1-9]9[0-9]{8}$'
$$;
revoke execute on function public.access_contact_valid(text, text) from public, anon;
grant execute on function public.access_contact_valid(text, text) to authenticated, service_role;

-- valida e devolve o e-mail normalizado (recusa com o código certo para a tela)
create or replace function public.access_contact_check(p_kind text, p_target uuid, p_email text, p_phone text, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_kind not in ('talent', 'brand') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if not public.access_contact_valid(v_email, btrim(coalesce(p_phone, ''))) then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if p_kind = 'brand' and char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'name_required' using errcode = '22023'; end if;
  if p_kind = 'talent' then
    -- um herói por e-mail (trava por e-mail: dois cadastros ao mesmo tempo não passam)
    perform pg_advisory_xact_lock(hashtext('access_email:' || v_email));
    if exists (select 1 from public.access_contacts c join public.talent_profiles t on t.id = c.talent_id
               where c.email = v_email and t.archived_at is null and c.talent_id is distinct from p_target) then
      raise exception 'hero_email_taken' using errcode = 'P0001';
    end if;
  end if;
  return v_email;
end $$;
revoke execute on function public.access_contact_check(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.access_contact_check(text, uuid, text, text, text) to service_role;

-- agência (gestor+) do alvo; o admin geral passa por agency_can. De fora → not_found; colaborador → forbidden.
create or replace function public.access_target_agency(p_kind text, p_target uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind = 'talent' then
    select t.agency_id into v_agency from public.talent_profiles t where t.id = p_target and t.archived_at is null;
  elsif p_kind = 'brand' then
    select ab.agency_id into v_agency from public.agency_brands ab where ab.brand_id = p_target and ab.status = 'active'
      and public.agency_can(ab.agency_id, 'staff') limit 1;
  end if;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  return v_agency;
end $$;
revoke execute on function public.access_target_agency(text, uuid) from public, anon, authenticated;
grant execute on function public.access_target_agency(text, uuid) to service_role;

-- liga a conta que já existe com o e-mail ou emite o convite (interno: quem chama já conferiu o escopo)
create or replace function public.access_provision(p_kind text, p_target uuid, p_agency uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t record; v_user uuid; v_meta jsonb; v_token text; v_id uuid; v_expires timestamptz := now() + interval '14 days';
        v_agency_name text; v_brand_name text; v_name text;
begin
  select a.name into v_agency_name from public.agencies a where a.id = p_agency;
  select u.id, u.raw_app_meta_data into v_user, v_meta from auth.users u where lower(u.email::text) = p_email limit 1;
  if v_user is not null and coalesce(v_meta ->> 'ultra_hero_demo', '') = 'true' and not public.agency_is_demo(p_agency) then
    raise exception 'demo_account_forbidden' using errcode = 'P0001';
  end if;

  if p_kind = 'talent' then
    select t.id, t.display_name, t.user_id, t.creator_id, c.user_id as creator_user, c.status::text as creator_status into v_t
    from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id where t.id = p_target;
    if coalesce(v_t.user_id, v_t.creator_user) is not null then return jsonb_build_object('account', 'active'); end if;
    if v_t.creator_status = 'suspended' then raise exception 'partner_suspended' using errcode = 'P0001'; end if;
    if v_user is not null then
      -- uma pessoa, um herói; uma pessoa, um talento (as regras do aceite)
      if exists (select 1 from public.creator_profiles c where c.user_id = v_user and c.id is distinct from v_t.creator_id) then
        raise exception 'hero_email_taken' using errcode = 'P0001';
      end if;
      perform pg_advisory_xact_lock(hashtext('talent_person:' || v_user::text));
      if exists (select 1 from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
                 where t.id <> p_target and (t.user_id = v_user or c.user_id = v_user)) then
        raise exception 'user_has_talent' using errcode = 'P0001';
      end if;
      update public.invitations i set status = 'revoked', revoked_at = now() where i.status = 'pending' and i.talent_id = p_target;
      perform set_config('app.trusted', 'on', true);
      if v_t.creator_id is not null then
        update public.creator_profiles set user_id = v_user where id = v_t.creator_id and user_id is null;
        insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
        values (v_user, 'creator', 'creator', v_t.creator_id, auth.uid())
        on conflict (user_id, role, scope_id) do update set revoked_at = null;
      else
        update public.talent_profiles set user_id = v_user where id = p_target and user_id is null and creator_id is null;
        insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
        values (v_user, 'creator', 'talent', p_target, auth.uid())
        on conflict (user_id, role, scope_id) do update set revoked_at = null;
      end if;
      perform set_config('app.trusted', 'off', true);
      perform public.inbox_notify(v_user, 'hero_account_linked', '/heroi',
        jsonb_build_object('talent', left(v_t.display_name, 80), 'name', left(coalesce(v_agency_name, ''), 80)),
        p_agency, 'talent', p_target, 'hero_account_linked:' || p_target::text || ':' || v_user::text);
      perform public.audit_log('agency.talent.account_linked', 'talent', p_target::text, null,
        jsonb_build_object('agency_id', p_agency, 'creator_id', v_t.creator_id, 'user_id', v_user), null,
        public.talent_audit_actor('agency', p_agency));
      return jsonb_build_object('account', 'linked');
    end if;
    update public.invitations i set status = 'revoked', revoked_at = now() where i.status = 'pending' and i.talent_id = p_target;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.invitations (email, role, agency_id, talent_id, kind, token_hash, expires_at, created_by)
    values (p_email, 'creator', p_agency, p_target, 'agency_hero', encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, auth.uid())
    returning id into v_id;
  elsif p_kind = 'brand' then
    select b.name into v_brand_name from public.brands b where b.id = p_target;
    if exists (select 1 from public.brand_members bm where bm.brand_id = p_target and bm.role = 'owner' and bm.revoked_at is null) then
      return jsonb_build_object('account', 'active');
    end if;
    update public.invitations i set status = 'revoked', revoked_at = now()
    where i.status = 'pending' and i.brand_id = p_target and i.kind = 'agency_brand';
    if v_user is not null then
      v_name := left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = v_user)), ''),
                              (select c.contact_name from public.access_contacts c where c.brand_id = p_target), split_part(p_email, '@', 1)), 80);
      perform set_config('app.trusted', 'on', true);
      insert into public.brand_members (brand_id, user_id, role, display_name, invited_by)
      values (p_target, v_user, 'owner', v_name, auth.uid())
      on conflict (brand_id, user_id) do update set role = 'owner', revoked_at = null, updated_at = now();
      insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
      values (v_user, 'brand', 'brand', p_target, auth.uid())
      on conflict (user_id, role, scope_id) do update set revoked_at = null;
      update public.brands set self_managed = true where id = p_target;
      perform set_config('app.trusted', 'off', true);
      perform public.inbox_notify(v_user, 'brand_access_granted', '/marca',
        jsonb_build_object('brand', left(coalesce(v_brand_name, ''), 80), 'name', left(coalesce(v_agency_name, ''), 80)),
        p_agency, 'brand', p_target, 'brand_access_granted:' || p_target::text || ':' || v_user::text);
      perform public.audit_log('agency.brand.access_linked', 'brand', p_target::text, null,
        jsonb_build_object('agency_id', p_agency, 'user_id', v_user), null, 'agency');
      return jsonb_build_object('account', 'linked');
    end if;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.invitations (email, role, agency_id, brand_id, member_role, kind, token_hash, expires_at, created_by)
    values (p_email, 'brand', p_agency, p_target, 'owner', 'agency_brand', encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, auth.uid())
    returning id into v_id;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform public.audit_log('invitation.create', 'invitation', v_id::text, null,
    jsonb_build_object('agency_id', p_agency, 'target', p_kind, 'target_id', p_target, 'kind', case p_kind when 'talent' then 'agency_hero' else 'agency_brand' end,
                       'email', p_email), null, 'agency');
  return jsonb_build_object('account', 'invited', 'token', v_token, 'invitation_id', v_id, 'expires_at', v_expires);
end $$;
revoke execute on function public.access_provision(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.access_provision(text, uuid, uuid, text) to service_role;

-- página pública ligada ao talento (interno). p_page: {slug?, pillars[], headline?, bio?}
create or replace function public.talent_page_create(p_talent uuid, p_agency uuid, p_page jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_t record; v_slug text; v_pillars public.pillar[]; v_headline text; v_bio text; v_id uuid; v_agency_name text;
begin
  if p_page is null or jsonb_typeof(p_page) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.id, t.display_name, t.user_id, t.creator_id into v_t from public.talent_profiles t where t.id = p_talent for update;
  if v_t.creator_id is not null then raise exception 'talent_has_creator' using errcode = 'P0001'; end if;
  begin
    select coalesce(array_agg(x::public.pillar), '{}') into v_pillars from jsonb_array_elements_text(coalesce(p_page -> 'pillars', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if cardinality(v_pillars) not between 1 and 4 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_headline := nullif(btrim(coalesce(p_page ->> 'headline', '')), '');
  v_bio := nullif(btrim(coalesce(p_page ->> 'bio', '')), '');
  if char_length(coalesce(v_headline, '')) > 160 or char_length(coalesce(v_bio, '')) > 2000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_slug := nullif(lower(btrim(coalesce(p_page ->> 'slug', ''))), '');
  if v_slug is null then v_slug := public.free_slug(v_t.display_name, 'creator'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if exists (select 1 from public.creator_profiles where slug = v_slug) then raise exception 'duplicate_slug' using errcode = 'P0001'; end if;
  if v_t.user_id is not null then
    -- a pessoa do login vira a titular do herói: uma pessoa, um herói
    if exists (select 1 from public.creator_profiles c where c.user_id = v_t.user_id) then raise exception 'has_hero' using errcode = 'P0001'; end if;
  end if;
  select a.name into v_agency_name from public.agencies a where a.id = p_agency;
  perform set_config('app.trusted', 'on', true);
  insert into public.creator_profiles (slug, name, headline, bio, pillars, is_fictional, rights_status, rights_holder, status, user_id)
  values (v_slug, btrim(v_t.display_name), v_headline, v_bio, v_pillars, false, 'authorized', v_agency_name, 'active', v_t.user_id)
  returning id into v_id;
  if v_t.user_id is not null then
    -- o login passa do talento para o herói da MESMA pessoa (sem apagar consentimento e documentos)
    perform set_config('app.talent_same_person', 'on', true);
    update public.talent_profiles set user_id = null, creator_id = v_id where id = p_talent;
    perform set_config('app.talent_same_person', 'off', true);
    update public.role_assignments set revoked_at = now()
    where user_id = v_t.user_id and role = 'creator' and scope_type = 'talent' and scope_id = p_talent and revoked_at is null;
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (v_t.user_id, 'creator', 'creator', v_id, auth.uid())
    on conflict (user_id, role, scope_id) do update set revoked_at = null;
  else
    -- sem pessoa ainda: o convite pendente continua valendo e, no aceite, a conta vai para o herói
    update public.talent_profiles set creator_id = v_id where id = p_talent;
  end if;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('agency.hero.create', 'creator_profile', v_id::text, null,
    jsonb_build_object('agency', p_agency, 'talent_id', p_talent, 'slug', v_slug, 'name', btrim(v_t.display_name)), null, 'creator');
  return v_id;
end $$;
revoke execute on function public.talent_page_create(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.talent_page_create(uuid, uuid, jsonb) to service_role;

-- 5) RPCs da tela ----------------------------------------------------------------------------------------------------
-- a tela Heróis não cria mais herói: a versão antiga sai (ninguém cria herói sem contato pela API)
drop function if exists public.agency_create_hero(uuid, text, text, public.pillar[], text, text);

-- "Novo herói" (Casting): talento + segmentos + contato (+ página pública opcional) + conta, numa transação
create or replace function public.agency_hero_create(p_agency uuid, p_talent jsonb, p_email text, p_phone text,
  p_segment_ids uuid[] default null, p_page jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text; v_phone text := btrim(coalesce(p_phone, '')); v_talent uuid; v_creator uuid; v_account jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_talent is null or jsonb_typeof(p_talent) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_email := public.access_contact_check('talent', null, p_email, v_phone, null);
  -- o contato de acesso fica fora da ficha (o colaborador lê a ficha)
  v_talent := public.agency_talent_save(null, p_agency, p_talent - 'contact_email' - 'contact_phone');
  if coalesce(cardinality(p_segment_ids), 0) > 0 then perform public.agency_talent_set_segments(v_talent, p_segment_ids); end if;
  if p_page is not null and jsonb_typeof(p_page) = 'object' then v_creator := public.talent_page_create(v_talent, p_agency, p_page); end if;
  insert into public.access_contacts (talent_id, email, phone_e164, created_by, updated_by) values (v_talent, v_email, v_phone, auth.uid(), auth.uid());
  v_account := public.access_provision('talent', v_talent, p_agency, v_email);
  return jsonb_strip_nulls(jsonb_build_object('talent_id', v_talent, 'creator_id', v_creator)) || v_account;
end $$;
revoke execute on function public.agency_hero_create(uuid, jsonb, text, text, uuid[], jsonb) from public, anon;
grant execute on function public.agency_hero_create(uuid, jsonb, text, text, uuid[], jsonb) to authenticated, service_role;

-- página pública depois, pela ficha (já ligada ao talento)
create or replace function public.agency_talent_create_page(p_talent uuid, p_page jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid;
begin
  v_agency := public.access_target_agency('talent', p_talent);
  return public.talent_page_create(p_talent, v_agency, p_page);
end $$;
revoke execute on function public.agency_talent_create_page(uuid, jsonb) from public, anon;
grant execute on function public.agency_talent_create_page(uuid, jsonb) to authenticated, service_role;

-- "Nova marca" com o acesso do contato da marca
create or replace function public.agency_brand_create_with_access(p_agency uuid, p_data jsonb, p_contact_name text, p_email text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text; v_phone text := btrim(coalesce(p_phone, '')); v_brand uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  v_email := public.access_contact_check('brand', null, p_email, v_phone, p_contact_name);
  v_brand := public.agency_brand_create(p_agency, p_data);
  insert into public.access_contacts (brand_id, contact_name, email, phone_e164, created_by, updated_by)
  values (v_brand, btrim(p_contact_name), v_email, v_phone, auth.uid(), auth.uid());
  return jsonb_build_object('brand_id', v_brand) || public.access_provision('brand', v_brand, p_agency, v_email);
end $$;
revoke execute on function public.agency_brand_create_with_access(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.agency_brand_create_with_access(uuid, jsonb, text, text, text) to authenticated, service_role;

-- cadastrar/corrigir o contato (alvos antigos sem contato, ou e-mail errado enquanto o convite aguarda)
create or replace function public.access_contact_save(p_kind text, p_target uuid, p_email text, p_phone text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_email text; v_phone text := btrim(coalesce(p_phone, '')); v_old text; v_pending boolean; v_name text;
begin
  v_agency := public.access_target_agency(p_kind, p_target);
  if p_kind = 'brand' then
    v_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), (select c.contact_name from public.access_contacts c where c.brand_id = p_target));
  end if;
  v_email := public.access_contact_check(p_kind, p_target, p_email, v_phone, v_name);
  if p_kind = 'talent' then
    select c.email into v_old from public.access_contacts c where c.talent_id = p_target;
    insert into public.access_contacts (talent_id, email, phone_e164, created_by, updated_by) values (p_target, v_email, v_phone, auth.uid(), auth.uid())
    on conflict (talent_id) do update set email = excluded.email, phone_e164 = excluded.phone_e164, updated_by = excluded.updated_by, updated_at = now();
    select exists (select 1 from public.invitations i where i.talent_id = p_target and i.status = 'pending' and i.expires_at >= now()
                   and lower(i.email::text) = v_email) into v_pending;
  else
    select c.email into v_old from public.access_contacts c where c.brand_id = p_target;
    insert into public.access_contacts (brand_id, contact_name, email, phone_e164, created_by, updated_by)
    values (p_target, v_name, v_email, v_phone, auth.uid(), auth.uid())
    on conflict (brand_id) do update set contact_name = excluded.contact_name, email = excluded.email, phone_e164 = excluded.phone_e164,
      updated_by = excluded.updated_by, updated_at = now();
    select exists (select 1 from public.invitations i where i.brand_id = p_target and i.kind = 'agency_brand' and i.status = 'pending'
                   and i.expires_at >= now() and lower(i.email::text) = v_email) into v_pending;
  end if;
  perform public.audit_log('agency.access_contact_save', p_kind, p_target::text, null,
    jsonb_build_object('agency_id', v_agency, 'email_changed', v_old is distinct from v_email), null, 'agency');
  -- só o celular (ou o nome) mudou e o convite segue valendo: nada a reenviar
  if v_old = v_email and v_pending then return jsonb_build_object('account', 'pending'); end if;
  return public.access_provision(p_kind, p_target, v_agency, v_email);
end $$;
revoke execute on function public.access_contact_save(text, uuid, text, text, text) from public, anon;
grant execute on function public.access_contact_save(text, uuid, text, text, text) to authenticated, service_role;

create or replace function public.access_invite_resend(p_kind text, p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_email text;
begin
  v_agency := public.access_target_agency(p_kind, p_target);
  select c.email into v_email from public.access_contacts c
  where (p_kind = 'talent' and c.talent_id = p_target) or (p_kind = 'brand' and c.brand_id = p_target);
  if v_email is null then raise exception 'contact_missing' using errcode = 'P0001'; end if;
  return public.access_provision(p_kind, p_target, v_agency, v_email);
end $$;
revoke execute on function public.access_invite_resend(text, uuid) from public, anon;
grant execute on function public.access_invite_resend(text, uuid) to authenticated, service_role;

-- situação do acesso de cada talento/marca da agência (gestor+ e admin geral): o celular é dado pessoal, só aqui
create or replace function public.agency_access_status(p_agency uuid, p_kind text)
returns table (target_id uuid, creator_id uuid, contact_name text, email text, phone_e164 text, account text,
               invite_expires_at timestamptz, login_email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_agency is null or not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind = 'talent' then
    return query
    select t.id, t.creator_id, null::text, ac.email, ac.phone_e164,
           case when coalesce(t.user_id, c.user_id) is not null then 'active'
                when ac.id is null then 'none'
                when li.status = 'pending' and li.expires_at >= now() then 'pending'
                when li.status in ('pending', 'expired') then 'expired'
                else 'none' end,
           case when coalesce(t.user_id, c.user_id) is null and li.status = 'pending' and li.expires_at >= now() then li.expires_at end,
           public.mask_email(u.email::text)
    from public.talent_profiles t
    left join public.creator_profiles c on c.id = t.creator_id
    left join public.access_contacts ac on ac.talent_id = t.id
    left join auth.users u on u.id = coalesce(t.user_id, c.user_id)
    left join lateral (select i.status::text as status, i.expires_at from public.invitations i
                       where i.talent_id = t.id and i.status in ('pending', 'expired', 'revoked')
                       -- o pendente (só há um por talento) vem antes dos revogados criados no mesmo instante
                       order by (i.status <> 'revoked') desc, i.created_at desc limit 1) li on true
    where t.agency_id = p_agency and t.archived_at is null;
  elsif p_kind = 'brand' then
    return query
    select b.id, null::uuid, ac.contact_name, ac.email, ac.phone_e164,
           case when o.user_id is not null then 'active'
                when ac.id is null then 'none'
                when li.status = 'pending' and li.expires_at >= now() then 'pending'
                when li.status in ('pending', 'expired') then 'expired'
                else 'none' end,
           case when o.user_id is null and li.status = 'pending' and li.expires_at >= now() then li.expires_at end,
           public.mask_email(u.email::text)
    from public.agency_brands ab
    join public.brands b on b.id = ab.brand_id
    left join public.access_contacts ac on ac.brand_id = b.id
    left join lateral (select bm.user_id from public.brand_members bm where bm.brand_id = b.id and bm.role = 'owner' and bm.revoked_at is null
                       order by bm.created_at limit 1) o on true
    left join auth.users u on u.id = o.user_id
    left join lateral (select i.status::text as status, i.expires_at from public.invitations i
                       where i.brand_id = b.id and i.member_role = 'owner' and i.status in ('pending', 'expired', 'revoked')
                       order by (i.status <> 'revoked') desc, i.created_at desc limit 1) li on true
    where ab.agency_id = p_agency and ab.status = 'active';
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.agency_access_status(uuid, text) from public, anon;
grant execute on function public.agency_access_status(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
