-- =============================================================================
-- Groscove Ultra · 0103 · Cadastro por perfil (Hero, Marca, Agência) sem convite e convites pausados
-- Pedido do responsável (04/11): "a questão de convite fica inativa por enquanto, e a pessoa, ao acessar a primeira
-- página do login, escolhe por conta própria se é Hero, Marca ou Agência". Cenário S109. Idempotente; nada de drop de
-- tabela/coluna; nenhuma função nova executável por anon (S14 segue 18). Funções recriadas mantêm a assinatura.
--
-- Decisões (sem perguntar ao responsável):
--   • Interruptor no banco: app_settings 'invites.enabled' (nasce FALSE = convites pausados). Chave ausente = ligado
--     (compatível com bancos antigos). O admin religa em /admin/settings ("Convites ativos"; pede justificativa como os
--     outros interruptores). A leitura para a tela é invites_enabled() (authenticated; anon não precisa e não ganha).
--   • Validação no banco, não só na tela: um gatilho BEFORE INSERT em invitations recusa com 'invites_disabled'. Assim
--     TODAS as RPCs que criam convite (admin_invite, admin_create_invitation, admin_invite_professional,
--     agency_invite_member/_brand/_brand_member/_hero/_talent, brand_invite_member, hero_team_invite) recusam sem
--     mudar cada uma; o que elas fizeram antes (ex.: Hero pendente criado junto) volta atrás com a transação.
--   • Convites JÁ emitidos e pendentes continuam valendo: o aceite (accept_invitation*, primeiro acesso 0077) não insere
--     convite, então segue igual. Revogar também segue. Motivo: não quebrar quem está no meio do processo.
--   • Cadastro self-service: a escolha fica guardada em account_onboardings (source 'self'), a mesma tabela do passo a
--     passo da 0091 — retomar é só voltar a /primeiro-acesso. Tipos novos: 'hero' (além de agency/brand). A empresa/o
--     Hero nasce pelas MESMAS RPCs da 0091 (onboarding_create_agency/_brand; creator_create_my_hero passa a aceitar o
--     passo 'hero' em aberto no lugar do papel creator). Hero nasce pendente (o admin aprova); marca nasce 'inactive'
--     e self_managed (sem agência); agência nasce ativa com a pessoa como Adm.
--   • Anti-abuso: self_onboarding_start só authenticated; recusa com o cadastro fechado (experiment.open=false, salvo
--     admin) e conta demo; uma agência por conta (agency_member_elsewhere), uma marca como Dono por conta
--     (brand_already_owned, conferido de novo em onboarding_take na hora de criar), um Hero (has_hero); no máximo 5
--     inícios por conta em 24h (rate_limited). O admin da plataforma não tem o limite de 1 agência/1 marca.
--   • "Agora não": self_onboarding_cancel encerra o passo em aberto (marca cancelled_at; a linha fica para o limite).
--   • Admin: admin_self_signups(p_days) lista os cadastros self-service recentes (com o estado da agência/marca/Hero)
--     para ver e suspender pelas telas que já existem.
-- =============================================================================

-- 1) interruptor --------------------------------------------------------------------------------------------------
insert into public.app_settings (key, value, description)
values ('invites.enabled', 'false'::jsonb, 'Convites ativos: criar convites (admin, agência, marca, equipe do Hero). Desligado = pausa; convites já emitidos seguem valendo.')
on conflict (key) do nothing;

-- ligado? (ausente = ligado; 'false' em texto também desliga, como experiment.open)
create or replace function public.invites_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select not (s.value = 'false'::jsonb or lower(btrim(s.value #>> '{}')) = 'false')
                   from public.app_settings s where s.key = 'invites.enabled'), true)
$$;
revoke execute on function public.invites_enabled() from public, anon;
grant execute on function public.invites_enabled() to authenticated, service_role;

create or replace function public.invitations_flag_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.invites_enabled() then raise exception 'invites_disabled' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke execute on function public.invitations_flag_guard() from public, anon, authenticated;
grant execute on function public.invitations_flag_guard() to service_role;

drop trigger if exists invitations_flag_guard on public.invitations;
create trigger invitations_flag_guard before insert on public.invitations
  for each row execute function public.invitations_flag_guard();

-- 2) passo a passo self-service -------------------------------------------------------------------------------------
alter table public.account_onboardings add column if not exists source text not null default 'invite';
alter table public.account_onboardings add column if not exists cancelled_at timestamptz;
alter table public.account_onboardings drop constraint if exists account_onboardings_source_check;
alter table public.account_onboardings add constraint account_onboardings_source_check check (source in ('invite', 'self'));
alter table public.account_onboardings drop constraint if exists account_onboardings_kind_check;
alter table public.account_onboardings add constraint account_onboardings_kind_check
  check (kind in ('agency', 'brand', 'seller', 'professional', 'hero'));
create index if not exists account_onboardings_self_idx on public.account_onboardings (created_at desc) where source = 'self';

-- começa (ou retoma) o passo a passo do perfil escolhido. Devolve {id, kind, resumed}.
create or replace function public.self_onboarding_start(p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_open public.account_onboardings%rowtype; v_id uuid; v_admin boolean;
        v_open_setting jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('agency', 'brand', 'hero') then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('self_onboarding:' || v_uid::text));
  v_admin := public.is_platform_admin();
  if public.is_demo_account() then raise exception 'demo_account_forbidden' using errcode = '42501'; end if;

  -- já em aberto (de convite ou self-service): retoma
  select * into v_open from public.account_onboardings o
  where o.user_id = v_uid and o.kind = p_kind and o.completed_at is null;
  if v_open.id is not null then
    return jsonb_build_object('id', v_open.id, 'kind', p_kind, 'resumed', true);
  end if;

  -- cadastro fechado (kill switch da 0015): nada de empresa/Hero novo por autosserviço
  select s.value into v_open_setting from public.app_settings s where s.key = 'experiment.open';
  if not v_admin and (v_open_setting = 'false'::jsonb or lower(btrim(coalesce(v_open_setting #>> '{}', ''))) = 'false') then
    raise exception 'experiment_closed' using errcode = 'P0001';
  end if;

  if p_kind = 'agency' and exists (select 1 from public.agency_members m where m.user_id = v_uid and m.revoked_at is null) then
    raise exception 'agency_member_elsewhere' using errcode = 'P0001';
  end if;
  if p_kind = 'brand' and not v_admin
     and exists (select 1 from public.brand_members m where m.user_id = v_uid and m.role = 'owner' and m.revoked_at is null) then
    raise exception 'brand_already_owned' using errcode = 'P0001';
  end if;
  if p_kind = 'hero' and (exists (select 1 from public.creator_profiles c where c.user_id = v_uid)
                          or exists (select 1 from public.creator_team_members m where m.user_id = v_uid and m.status = 'active')) then
    raise exception 'has_hero' using errcode = 'P0001';
  end if;
  if not v_admin and (select count(*) from public.account_onboardings o
                      where o.user_id = v_uid and o.source = 'self' and o.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.account_onboardings (user_id, kind, source) values (v_uid, p_kind, 'self') returning id into v_id;
  perform public.audit_log('onboarding.self_start', 'account_onboarding', v_id::text, null,
    jsonb_build_object('kind', p_kind), null, 'consumer');
  return jsonb_build_object('id', v_id, 'kind', p_kind, 'resumed', false);
end $$;
revoke execute on function public.self_onboarding_start(text) from public, anon;
grant execute on function public.self_onboarding_start(text) to authenticated, service_role;

-- 0091 + a origem do passo (convite ou self-service: só o self-service tem "Agora não") — mesma assinatura
create or replace function public.onboarding_pending()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'source', o.source,
           'agency', (select a.name from public.agencies a where a.id = o.agency_id)) order by o.created_at), '[]'::jsonb)
  from public.account_onboardings o where o.user_id = auth.uid() and o.completed_at is null
$$;
revoke execute on function public.onboarding_pending() from public, anon;
grant execute on function public.onboarding_pending() to authenticated, service_role;

-- "Agora não": encerra o passo self-service em aberto (o de convite não: a empresa do convite fica esperando)
create or replace function public.self_onboarding_cancel(p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  update public.account_onboardings o set completed_at = now(), cancelled_at = now()
  where o.user_id = auth.uid() and o.kind = p_kind and o.source = 'self' and o.completed_at is null
  returning o.id into v_id;
  return v_id is not null;
end $$;
revoke execute on function public.self_onboarding_cancel(text) from public, anon;
grant execute on function public.self_onboarding_cancel(text) to authenticated, service_role;

-- 0091 + uma marca por conta no passo self-service (conferido na hora de criar, não só no início). Interna.
create or replace function public.onboarding_take(p_kind text)
returns public.account_onboardings language plpgsql security definer set search_path = '' as $$
declare o public.account_onboardings%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.account_onboardings where user_id = auth.uid() and kind = p_kind and completed_at is null for update;
  if o.id is null then raise exception 'onboarding_not_found' using errcode = 'P0002'; end if;
  if o.source = 'self' and p_kind = 'brand' and not public.is_platform_admin()
     and exists (select 1 from public.brand_members m where m.user_id = auth.uid() and m.role = 'owner' and m.revoked_at is null) then
    raise exception 'brand_already_owned' using errcode = 'P0001';
  end if;
  return o;
end $$;
revoke execute on function public.onboarding_take(text) from public, anon, authenticated;
grant execute on function public.onboarding_take(text) to service_role;

-- 0091: creator sem Hero cria o dele. Agora também quem escolheu "Hero" no cadastro (passo 'hero' em aberto) sem
-- ainda ter o papel; o papel nasce aqui (titular do Hero pendente) e o passo fecha.
create or replace function public.creator_create_my_hero(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_onb uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select o.id into v_onb from public.account_onboardings o
  where o.user_id = auth.uid() and o.kind = 'hero' and o.completed_at is null for update;
  if v_onb is null and not exists (select 1 from public.role_assignments r where r.user_id = auth.uid() and r.role::text = 'creator' and r.revoked_at is null) then
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
  if v_onb is not null then
    update public.account_onboardings set completed_at = now(), result_id = v_id where id = v_onb;
  end if;
  perform public.audit_log('hero.self_create', 'creator_profile', v_id::text, null,
    jsonb_build_object('name', btrim(p_name), 'status', 'pending', 'self_signup', v_onb is not null), null, 'creator');
  return v_id;
end $$;
revoke execute on function public.creator_create_my_hero(text) from public, anon;
grant execute on function public.creator_create_my_hero(text) to authenticated, service_role;

-- 3) admin: novos cadastros self-service ------------------------------------------------------------------------------
-- [{id, kind, created_at, completed_at, cancelled, email, result_id, name, status}] dos últimos p_days (1–90) dias
create or replace function public.admin_self_signups(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days int := greatest(1, least(coalesce(p_days, 14), 90)); v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'id', o.id, 'kind', o.kind, 'created_at', o.created_at, 'completed_at', o.completed_at,
      'cancelled', o.cancelled_at is not null, 'email', (select u.email::text from auth.users u where u.id = o.user_id),
      'result_id', o.result_id,
      'name', case o.kind when 'agency' then (select a.name from public.agencies a where a.id = o.result_id)
                          when 'brand' then (select b.name from public.brands b where b.id = o.result_id)
                          when 'hero' then (select c.name from public.creator_profiles c where c.id = o.result_id) end,
      'status', case o.kind when 'agency' then (select a.status from public.agencies a where a.id = o.result_id)
                            when 'brand' then (select b.status from public.brands b where b.id = o.result_id)
                            when 'hero' then (select c.status::text from public.creator_profiles c where c.id = o.result_id) end) as x
    from public.account_onboardings o
    where o.source = 'self' and o.created_at > now() - make_interval(days => v_days)
    order by o.created_at desc limit 200) t;
  return v_out;
end $$;
revoke execute on function public.admin_self_signups(int) from public, anon;
grant execute on function public.admin_self_signups(int) to authenticated, service_role;
