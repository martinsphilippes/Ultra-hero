-- 0141 — Aprovação do primeiro acesso pela Presidência (pedido de 11/11/2026).
--
-- Toda conta nova nasce PENDENTE, seja qual for o perfil (Hero/Creator, Marca, Agência, usuário do app, convidado, equipe,
-- profissional, fornecedor) e seja qual for a forma de criação (senha, cadastro rápido, Google, Apple, convite, admin).
-- Só a Presidência (a conta existente presidencia@groscovegroup.com, do Jon) aprova ou recusa. Enquanto pendente ou
-- recusada, a conta só consulta o próprio status; o resto da API do banco (tabelas e RPCs) responde 403.
--
-- Onde fica cada trava:
--   1) auth.users: gatilho ANTES de inserir marca app_metadata.access = 'pending' (o primeiro token já sai pendente) e um
--      gatilho DEPOIS cria o pedido na fila. Um gatilho ANTES de atualizar mantém app_metadata.access/app_only iguais à
--      tabela (o Auth regrava app_metadata no cadastro com Google; o gatilho repõe as chaves).
--   2) Data API (PostgREST): pre-request public.api_access_gate() em TODA requisição: authenticated pendente/recusado é
--      barrado (42501 → 403), salvo as RPCs da própria situação. Vale mesmo para quem chama a API direto, sem o site.
--   3) O site (middleware) lê app_metadata.access/app_only do token (sem ida ao banco) e leva a pessoa à tela de status;
--      app_only (Hero/Creator) também é a base da regra "Creator só pelo aplicativo", checada no servidor do site.
--
-- Classificação das contas que já existiam (migração): quem já entrou no app (last_sign_in_at preenchido) fica
-- APROVADA com origem 'legacy' e a nota da migração (não havia histórico de aprovação; a conta já estava em uso, inclusive
-- a da Presidência). Conta criada que nunca entrou fica PENDENTE e vai para a fila (em 11/11/2026 eram 0 de 43).
-- Aprovações que já existiam em outras filas (pedido de acesso à agência, reivindicação de perfil, Hero aprovado pelo
-- admin, profissional conferido) continuam valendo como estão: esta regra é sobre a CONTA, por cima delas.

-- 1) Quem aprova: a Presidência ---------------------------------------------------------------------------------------------
create table if not exists public.access_approvers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null default 'Presidência',
  granted_at timestamptz not null default now()
);
alter table public.access_approvers enable row level security;
-- ninguém lê nem grava pela API: só as funções abaixo (security definer) consultam. Trocar quem aprova = nova migração.
revoke all on table public.access_approvers from public, anon, authenticated;

insert into public.access_approvers (user_id, label)
select u.id, 'Presidência' from auth.users u where lower(u.email) = 'presidencia@groscovegroup.com'
on conflict (user_id) do nothing;

create or replace function public.is_presidency()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and exists (select 1 from public.access_approvers a where a.user_id = (select auth.uid()))
$$;
revoke execute on function public.is_presidency() from public, anon;
grant execute on function public.is_presidency() to authenticated, service_role;

-- 2) Situação de cada conta -------------------------------------------------------------------------------------------------
create table if not exists public.account_approvals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  status text not null default 'pending',
  requested_profile text not null default 'consumer',
  -- a pessoa confirmou o perfil? (Google/Apple sem perfil escolhido: a tela de status pergunta)
  profile_confirmed boolean not null default false,
  origin text not null default 'password',
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  updated_at timestamptz not null default now(),
  constraint account_approvals_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint account_approvals_profile_check
    check (requested_profile in ('consumer', 'hero', 'brand', 'agency', 'professional', 'seller', 'staff', 'admin')),
  constraint account_approvals_origin_check
    check (origin in ('password', 'quick', 'google', 'apple', 'invite', 'admin', 'legacy', 'other')),
  constraint account_approvals_note_check check (decision_note is null or char_length(decision_note) <= 500),
  constraint account_approvals_decision_check check ((status = 'pending') = (decided_at is null))
);
create index if not exists account_approvals_queue_idx on public.account_approvals (status, requested_at);
alter table public.account_approvals enable row level security;
revoke all on table public.account_approvals from public, anon, authenticated;
grant select on table public.account_approvals to authenticated;
drop policy if exists account_approvals_select on public.account_approvals;
create policy account_approvals_select on public.account_approvals for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_presidency()));

-- histórico de cada pedido (quem fez o quê e quando); a decisão também vai para admin_audit
create table if not exists public.account_approval_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  status text not null,
  requested_profile text,
  note text,
  created_at timestamptz not null default now(),
  constraint account_approval_events_action_check
    check (action in ('requested', 'profile_set', 'approved', 'rejected', 'classified'))
);
create index if not exists account_approval_events_user_idx on public.account_approval_events (user_id, created_at desc);
alter table public.account_approval_events enable row level security;
revoke all on table public.account_approval_events from public, anon, authenticated;
grant select on table public.account_approval_events to authenticated;
drop policy if exists account_approval_events_select on public.account_approval_events;
create policy account_approval_events_select on public.account_approval_events for select to authenticated
  using ((select public.is_presidency()));

-- 3) Regras puras ----------------------------------------------------------------------------------------------------------
-- perfil pedido por um convite pendente do e-mail (o mais recente)
create or replace function public.account_profile_from_invitation(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select case i.role::text
           when 'creator' then 'hero' when 'agency' then 'agency' when 'brand' then 'brand'
           when 'seller' then 'seller' when 'professional' then 'professional' when 'admin' then 'admin'
           else 'consumer' end
  from public.invitations i
  where lower(i.email::text) = lower(coalesce(p_email, '')) and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc
  limit 1
$$;
revoke execute on function public.account_profile_from_invitation(text) from public, anon, authenticated;

-- Hero/Creator: só pelo aplicativo. Vale para quem pediu o perfil Hero e para quem tem o papel creator (Hero, equipe do
-- Hero ou talento do casting).
create or replace function public.account_app_only(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.requested_profile = 'hero' from public.account_approvals a where a.user_id = p_user), false)
      or exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role = 'creator' and r.revoked_at is null)
$$;
revoke execute on function public.account_app_only(uuid) from public, anon, authenticated;

-- 4) auth.users ↔ fila -------------------------------------------------------------------------------------------------------
-- ANTES de inserir: o primeiro token já sai pendente (app_metadata só é gravável pelo servidor, nunca pelo usuário)
create or replace function public.account_access_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
        v_profile text;
begin
  v_profile := case when v_meta ->> 'signup_profile' in ('hero', 'brand', 'agency') then v_meta ->> 'signup_profile'
                    else public.account_profile_from_invitation(new.email) end;
  new.raw_app_meta_data := v_meta || jsonb_build_object('access', 'pending', 'app_only', coalesce(v_profile = 'hero', false));
  return new;
end $$;
revoke execute on function public.account_access_before_insert() from public, anon, authenticated;

-- DEPOIS de inserir: o pedido entra na fila da Presidência, com perfil pedido e origem
create or replace function public.account_access_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
        v_provider text := coalesce(v_meta ->> 'provider', 'email');
        v_invite_profile text := public.account_profile_from_invitation(new.email);
        v_profile text;
        v_confirmed boolean;
        v_origin text;
        v_name text;
begin
  v_origin := case
    when v_provider in ('google', 'apple') then v_provider
    when (v_meta ->> 'created_by_admin') = 'true' then 'admin'
    when (v_meta ->> 'invite_first_access') = 'true' or v_invite_profile is not null then 'invite'
    when (v_meta ->> 'signup_profile') is not null then 'password'
    when (v_meta ->> 'quick_signup') = 'true' then 'quick'
    else 'password' end;
  v_profile := case
    when v_meta ->> 'signup_profile' in ('hero', 'brand', 'agency') then v_meta ->> 'signup_profile'
    when v_meta ->> 'requested_profile' in ('consumer', 'hero', 'brand', 'agency', 'professional', 'seller', 'staff', 'admin')
      then v_meta ->> 'requested_profile'
    when v_invite_profile is not null then v_invite_profile
    else 'consumer' end;
  -- Google/Apple sem convite nem perfil escolhido: a tela de status pergunta "Como você vai usar o Ultra?"
  v_confirmed := not (v_origin in ('google', 'apple') and v_invite_profile is null
                      and (v_meta ->> 'requested_profile') is null);

  insert into public.account_approvals (user_id, email, status, requested_profile, profile_confirmed, origin, requested_at)
  values (new.id, lower(new.email), 'pending', v_profile, v_confirmed, v_origin, coalesce(new.created_at, now()))
  on conflict (user_id) do nothing;
  insert into public.account_approval_events (user_id, action, status, requested_profile)
  values (new.id, 'requested', 'pending', v_profile);

  -- aviso no sino da Presidência (sem dados pessoais além do nome)
  v_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                          split_part(coalesce(new.email, ''), '@', 1)), 80);
  perform public.inbox_notify(a.user_id, 'account_access_requested', '/agencia/aprovacoes',
            jsonb_build_object('name', v_name, 'profile', v_profile), null, 'account', new.id,
            'account_access:' || new.id::text || ':' || a.user_id::text)
  from public.access_approvers a;
  return new;
end $$;
revoke execute on function public.account_access_after_insert() from public, anon, authenticated;

-- ANTES de atualizar: app_metadata.access/app_only sempre iguais à fila (o Auth regrava app_metadata inteiro em alguns
-- fluxos, como o cadastro com Google; a tabela é a fonte da verdade e o gatilho repõe as chaves)
create or replace function public.account_access_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
        v_app_only boolean;
        v_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  select a.status into v_status from public.account_approvals a where a.user_id = new.id;
  if v_status is null then return new; end if;
  v_app_only := public.account_app_only(new.id);
  if (v_meta -> 'access') is distinct from to_jsonb(v_status) or (v_meta -> 'app_only') is distinct from to_jsonb(v_app_only) then
    new.raw_app_meta_data := v_meta || jsonb_build_object('access', v_status, 'app_only', v_app_only);
  end if;
  return new;
end $$;
revoke execute on function public.account_access_before_update() from public, anon, authenticated;

drop trigger if exists account_access_before_insert on auth.users;
create trigger account_access_before_insert before insert on auth.users
  for each row execute function public.account_access_before_insert();
drop trigger if exists account_access_after_insert on auth.users;
create trigger account_access_after_insert after insert on auth.users
  for each row execute function public.account_access_after_insert();
drop trigger if exists account_access_before_update on auth.users;
create trigger account_access_before_update before update on auth.users
  for each row execute function public.account_access_before_update();

-- reescreve app_metadata.access/app_only da conta (o gatilho acima recalcula a partir da fila e dos papéis)
create or replace function public.account_claims_sync(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) where id = p_user
$$;
revoke execute on function public.account_claims_sync(uuid) from public, anon, authenticated;

-- papel creator ganho ou perdido muda o "só pelo aplicativo"
create or replace function public.account_access_role_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'creator' then perform public.account_claims_sync(new.user_id); end if;
  return new;
end $$;
revoke execute on function public.account_access_role_sync() from public, anon, authenticated;
drop trigger if exists account_access_role_sync on public.role_assignments;
create trigger account_access_role_sync after insert or update of revoked_at on public.role_assignments
  for each row execute function public.account_access_role_sync();

-- 5) RPCs da própria conta (liberadas para quem está pendente) --------------------------------------------------------------
create or replace function public.account_access_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
        v_row public.account_approvals%rowtype;
        v_email text;
        v_name text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select u.email, coalesce(p.full_name, p.display_name) into v_email, v_name
  from auth.users u left join public.profiles p on p.id = u.id where u.id = v_uid;
  select * into v_row from public.account_approvals a where a.user_id = v_uid;
  if v_row.user_id is null then
    -- conta sem registro (não deveria acontecer depois da migração): entra na fila como pendente
    insert into public.account_approvals (user_id, email, status, origin) values (v_uid, lower(v_email), 'pending', 'other')
    on conflict (user_id) do nothing;
    insert into public.account_approval_events (user_id, action, status, requested_profile) values (v_uid, 'requested', 'pending', 'consumer');
    perform public.account_claims_sync(v_uid);
    select * into v_row from public.account_approvals a where a.user_id = v_uid;
  end if;
  return jsonb_build_object(
    'status', v_row.status, 'requested_profile', v_row.requested_profile, 'profile_confirmed', v_row.profile_confirmed,
    'origin', v_row.origin, 'requested_at', v_row.requested_at, 'decided_at', v_row.decided_at,
    'app_only', public.account_app_only(v_uid), 'email', v_email, 'name', v_name);
end $$;
revoke execute on function public.account_access_status() from public, anon;
grant execute on function public.account_access_status() to authenticated, service_role;

-- a própria pessoa confirma o perfil enquanto espera (ex.: entrou com o Google sem escolher). O canal do Hero (só app) é
-- conferido pelo site antes de chamar; aqui só se grava a escolha de quem ainda está pendente.
create or replace function public.account_request_profile(p_profile text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_profile is null or p_profile not in ('consumer', 'hero', 'brand', 'agency') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.account_approvals
     set requested_profile = p_profile, profile_confirmed = true, updated_at = now()
   where user_id = v_uid and status = 'pending';
  if not found then raise exception 'not_pending' using errcode = 'P0001'; end if;
  insert into public.account_approval_events (user_id, action, actor_id, status, requested_profile)
  values (v_uid, 'profile_set', v_uid, 'pending', p_profile);
  perform public.account_claims_sync(v_uid);
  return public.account_access_status();
end $$;
revoke execute on function public.account_request_profile(text) from public, anon;
grant execute on function public.account_request_profile(text) to authenticated, service_role;

-- o servidor (service role) registra o perfil/origem que só ele conhece (ex.: volta do Google com o perfil escolhido)
create or replace function public.account_approval_annotate(p_user uuid, p_profile text, p_origin text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_profile is not null and p_profile not in ('consumer', 'hero', 'brand', 'agency', 'professional', 'seller', 'staff', 'admin') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_origin is not null and p_origin not in ('password', 'quick', 'google', 'apple', 'invite', 'admin', 'other') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.account_approvals
     set requested_profile = coalesce(p_profile, requested_profile),
         profile_confirmed = profile_confirmed or p_profile is not null,
         origin = coalesce(p_origin, origin), updated_at = now()
   where user_id = p_user and status = 'pending';
  if found and p_profile is not null then
    insert into public.account_approval_events (user_id, action, status, requested_profile)
    values (p_user, 'profile_set', 'pending', p_profile);
  end if;
  perform public.account_claims_sync(p_user);
end $$;
revoke execute on function public.account_approval_annotate(uuid, text, text) from public, anon, authenticated;
grant execute on function public.account_approval_annotate(uuid, text, text) to service_role;

-- 6) Fila e decisão da Presidência ----------------------------------------------------------------------------------------
-- p_view: 'pending' (fila, mais antigos primeiro) ou 'decided' (decididos por alguém, mais recentes primeiro)
create or replace function public.presidency_access_queue(p_view text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_presidency() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_view is null or p_view not in ('pending', 'decided') then raise exception 'invalid_input' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(q)::jsonb order by
             case when p_view = 'pending' then extract(epoch from q.requested_at) else -extract(epoch from q.decided_at) end)
    from (
      select a.user_id, coalesce(u.email, a.email) as email,
             coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''),
                      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')) as name,
             a.requested_profile, a.profile_confirmed, a.origin, a.requested_at, a.status,
             a.decided_at, a.decision_note,
             coalesce(nullif(btrim(d.full_name), ''), d.display_name) as decided_by_name,
             u.last_sign_in_at
      from public.account_approvals a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = a.user_id
      left join public.profiles d on d.id = a.decided_by
      where (p_view = 'pending' and a.status = 'pending')
         or (p_view = 'decided' and a.status <> 'pending' and a.decided_by is not null)
      order by case when p_view = 'pending' then a.requested_at end asc, a.decided_at desc
      limit 300
    ) q), '[]'::jsonb);
end $$;
revoke execute on function public.presidency_access_queue(text) from public, anon;
grant execute on function public.presidency_access_queue(text) to authenticated;

-- quantos esperam (cartão do painel da Presidência)
create or replace function public.presidency_access_pending_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_presidency() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::integer from public.account_approvals a where a.status = 'pending');
end $$;
revoke execute on function public.presidency_access_pending_count() from public, anon;
grant execute on function public.presidency_access_pending_count() to authenticated;

-- Aprova ou recusa. Só a Presidência (identidade do token conferida aqui, no banco). Pendente → aprovada/recusada;
-- recusada pode ser reconsiderada (→ aprovada). Aprovada não volta a pendente por aqui (para tirar acesso há a suspensão).
create or replace function public.presidency_access_decide(p_user uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
        v_old text;
        v_profile text;
        v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_presidency() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_user = v_actor then raise exception 'cannot_decide_self' using errcode = 'P0001'; end if;

  select a.status, a.requested_profile into v_old, v_profile from public.account_approvals a where a.user_id = p_user for update;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_old = p_decision then
    return jsonb_build_object('status', v_old, 'changed', false);
  end if;
  if v_old = 'approved' then raise exception 'already_approved' using errcode = 'P0001'; end if;

  update public.account_approvals
     set status = p_decision, decided_by = v_actor, decided_at = now(), decision_note = v_note, updated_at = now()
   where user_id = p_user;
  insert into public.account_approval_events (user_id, action, actor_id, status, requested_profile, note)
  values (p_user, p_decision, v_actor, p_decision, v_profile, v_note);
  perform public.audit_log(case p_decision when 'approved' then 'account.access_approved' else 'account.access_rejected' end,
    'user', p_user::text, jsonb_build_object('status', v_old),
    jsonb_build_object('status', p_decision, 'requested_profile', v_profile), v_note, 'admin');
  perform public.account_claims_sync(p_user);
  -- aprovada quem se cadastrou sozinho como Hero, Marca ou Agência: o passo a passo do perfil já fica aberto (o login
  -- seguinte cai nele, como no cadastro antes da regra). Convite e criação pelo admin seguem o próprio fluxo.
  if p_decision = 'approved' and v_profile in ('hero', 'brand', 'agency')
     and exists (select 1 from public.account_approvals a where a.user_id = p_user and a.origin in ('password', 'quick', 'google', 'apple'))
     and not exists (select 1 from public.role_assignments r where r.user_id = p_user and r.revoked_at is null
                     and r.role::text in ('creator', 'brand', 'agency'))
     and not exists (select 1 from public.account_onboardings o where o.user_id = p_user and o.kind = v_profile and o.completed_at is null) then
    insert into public.account_onboardings (user_id, kind, source) values (p_user, v_profile, 'self');
  end if;
  -- aviso no sino da pessoa (aparece quando ela entrar; a tela de status já mostra a decisão)
  perform public.inbox_notify(p_user, 'account_access_decided', '/aguardando-aprovacao',
            jsonb_build_object('decision', p_decision), null, 'account', p_user, null);
  return jsonb_build_object('status', p_decision, 'changed', true);
end $$;
revoke execute on function public.presidency_access_decide(uuid, text, text) from public, anon;
grant execute on function public.presidency_access_decide(uuid, text, text) to authenticated;

-- 7) Avisos novos no sino ---------------------------------------------------------------------------------------------------
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
  'hero_account_linked', 'brand_access_granted',
  'agency_access_requested', 'agency_access_decided', 'casting_access_requested', 'casting_access_decided',
  'brand_approval_requested', 'brand_approval_decided', 'profile_claim_requested', 'profile_claim_decided',
  'brand_login_requested', 'brand_login_decided',
  'onda_digital_news', 'onda_request_received', 'onda_request_updated',
  'creator_idea_received', 'creator_idea_updated', 'creator_action_answered',
  'group_project_assigned', 'creator_meeting_action',
  -- 0141: aprovação da Presidência
  'account_access_requested', 'account_access_decided'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   'access_request',
   'casting_request', 'profile_claim',
   'onda_request',
   'creator_idea',
   'group_project',
   'creator_meeting',
   -- 0141
   'account'));

-- 8) Trava da Data API (pre-request do PostgREST) ---------------------------------------------------------------------------
-- Roda antes de TODA requisição à API do banco. Conta pendente/recusada só chama as RPCs da própria situação; o resto
-- responde 42501 (HTTP 403) com a mensagem account_pending/account_rejected. anon e service_role passam direto.
-- Erro inesperado aqui não pode derrubar a API: o cálculo fica num bloco protegido (falha aberta; o site também barra).
-- Roda com o papel da própria requisição (security invoker): o visitante sai na primeira linha e o usuário lê só a
-- própria linha da fila (RLS), então nenhuma função privilegiada nova fica exposta ao visitante.
create or replace function public.api_access_gate()
returns void language plpgsql security invoker set search_path = '' as $$
declare v_claims jsonb;
        v_uid uuid;
        v_status text;
        v_fn text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if v_claims is null or (v_claims ->> 'role') is distinct from 'authenticated' then return; end if;
    v_uid := nullif(v_claims ->> 'sub', '')::uuid;
    if v_uid is null then return; end if;
    select a.status into v_status from public.account_approvals a where a.user_id = v_uid;
    if v_status = 'approved' then return; end if;
    v_fn := substring(coalesce(current_setting('request.path', true), '') from 'rpc/([A-Za-z0-9_]+)/?$');
  exception when others then
    return;
  end;
  if v_fn in ('account_access_status', 'account_request_profile', 'public_settings') then return; end if;
  raise exception '%', 'account_' || coalesce(v_status, 'pending')
    using errcode = '42501', hint = 'Cadastro aguardando aprovação da Presidência.';
end $$;
revoke execute on function public.api_access_gate() from public;
grant execute on function public.api_access_gate() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.api_access_gate''';
  end if;
end $$;

-- 9) Contas que já existiam (classificação) ---------------------------------------------------------------------------------
insert into public.account_approvals (user_id, email, status, requested_profile, profile_confirmed, origin, requested_at,
                                      decided_at, decision_note)
select u.id, lower(u.email),
       case when u.last_sign_in_at is null then 'pending' else 'approved' end,
       case
         when exists (select 1 from public.role_assignments r where r.user_id = u.id and r.role = 'creator' and r.revoked_at is null) then 'hero'
         when exists (select 1 from public.role_assignments r where r.user_id = u.id and r.role = 'agency' and r.revoked_at is null) then 'agency'
         when exists (select 1 from public.role_assignments r where r.user_id = u.id and r.role = 'brand' and r.revoked_at is null) then 'brand'
         when exists (select 1 from public.role_assignments r where r.user_id = u.id and r.role = 'admin' and r.revoked_at is null) then 'admin'
         when exists (select 1 from public.role_assignments r where r.user_id = u.id and r.role = 'professional' and r.revoked_at is null) then 'professional'
         when exists (select 1 from public.role_assignments r where r.user_id = u.id and r.role = 'seller' and r.revoked_at is null) then 'seller'
         else 'consumer' end,
       true,
       'legacy',
       u.created_at,
       case when u.last_sign_in_at is null then null else now() end,
       case when u.last_sign_in_at is null
            then 'Conta criada antes da regra e que nunca tinha entrado: aguarda a Presidência no primeiro acesso.'
            else 'Conta já em uso antes da regra de 11/11/2026 (sem histórico de aprovação): mantida aprovada na migração.' end
from auth.users u
on conflict (user_id) do nothing;

insert into public.account_approval_events (user_id, action, status, requested_profile, note)
select a.user_id, 'classified', a.status, a.requested_profile, a.decision_note
from public.account_approvals a
where a.origin = 'legacy'
  and not exists (select 1 from public.account_approval_events e where e.user_id = a.user_id and e.action = 'classified');

-- grava access/app_only no app_metadata de todas as contas (o gatilho de atualização recalcula)
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb);

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
