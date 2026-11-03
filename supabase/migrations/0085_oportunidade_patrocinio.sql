-- =============================================================================
-- Groscove Ultra · 0085 · Gestão: oportunidade de patrocínio na agenda
-- Bloco 8 (pedido do responsável em 02/11). Cenário S92. Idempotente; nenhuma função nova para anon (S14 segue 18);
-- nada aqui carrega valor.
--
-- Decisões:
--   • A agência (gestor+) mostra às marcas uma situação de um creator do elenco (ex.: "Fulano corre a Maratona do
--     Rio dia 20, 5 mil pessoas, transmissão ao vivo") para alguma marca patrocinar: sponsorship_opportunities com
--     título, data/hora ou período (dia inteiro: fim exclusivo, como na agenda), local, descrição, alcance esperado
--     (texto curto), contrapartidas (lista curta, até 10 itens de 3 a 120 letras), redes envolvidas (pelo menos
--     uma), prazo para as marcas responderem e público: todas as marcas atendidas ('all', calculado na hora: marca
--     que passa a ser atendida depois também vê) ou marcas escolhidas ('selected', sponsorship_targets).
--     Situação: open → closed (prazo, pelo cron diário sponsorship_deadline_scan, ou decisão sem vencedora) |
--     sponsored (uma ou mais vencedoras) | cancelled. Só edita aberta. Prazo encerrado ainda deixa a agência
--     escolher as vencedoras (decided_at vazio); depois da decisão, nada muda.
--   • O creator precisa estar no elenco, não arquivado e com consentimento vigente (é a regra para mostrar o creator
--     à marca, LGPD); não precisa estar "liberado no catálogo": a agência escolheu oferecer esta situação. A marca
--     vê o cartão autorizado quando ele está no catálogo, senão só nome e foto.
--   • Agenda: um evento de sistema por oportunidade (calendar_events.kind = 'sponsorship', sponsorship_id,
--     source_key 'sponsorship:<id>', com o creator), mantido pelas RPCs (sponsorship_sync_event): aparece na agenda
--     da agência (gestor+; o colaborador segue a regra da 0067 — eventos com creator só nos negócios dele) e no feed
--     .ics; na agenda do creator (visível a ele); e na agenda das marcas do público enquanto está aberta (depois, só
--     para a vencedora). Cancelada some da agenda. A política calendar_events_select_brand e
--     calendar_events_for_user (mesma assinatura) ganham esse ramo, pela função my_brand_sponsorship_ids.
--   • Marca (dono ou equipe): "Quero patrocinar" (mensagem opcional) ou "Não tenho interesse"
--     (brand_sponsorship_respond), uma resposta por marca, quem e quando ficam registrados (sponsorship_responses).
--     Recusa pode virar interesse enquanto aberta; interesse não volta atrás (já criou a campanha). "Quero
--     patrocinar" cria a campanha da marca em rascunho (campaign_requests origem 'brand', sponsorship_id marca a
--     origem) com o creator, título, objetivo "evento", datas (no fuso da agência), horário e duração, local
--     (presencial), redes, um entregável "evento", as contrapartidas como itens extras do checklist do briefing e
--     as notas (alcance, contrapartidas, mensagem). Daí segue o fluxo normal: a equipe pede aprovação ao dono
--     (0081), o dono envia à agência (brand_request_submit, igual). brand_request_save (MESMA assinatura) passa a
--     aceitar, nesse rascunho, o creator da oportunidade mesmo fora do catálogo.
--   • Agência: vê por oportunidade as marcas do público e quem quis, recusou ou não respondeu
--     (agency_sponsorship_detail); decide (agency_sponsorship_decide): 'sponsor' com uma ou mais marcas que
--     quiseram → patrocinada; 'close' → encerrada sem vencedora; 'cancel' → cancelada. As que não venceram ficam
--     com outcome 'lost' e o rascunho delas (ainda não enviado) é cancelado; campanha já enviada segue no pipeline
--     para a agência fechar como de costume (não fechamos negócio sozinhos).
--   • Avisos (sino; e-mail pela fila da 0084): sponsorship_published (marcas do público, ao publicar e a cada marca
--     acrescentada), sponsorship_interest (gestores da agência), sponsorship_decided (marcas que responderam: status
--     won/closed/cancelled; creator: sponsored/closed/cancelled com o nome das vencedoras). Entidade nova
--     'sponsorship'. Os três vão também por e-mail (inbox_kind_emails, mesma assinatura).
--   • Privacidade: a marca nunca vê respostas de outras marcas (RLS das respostas: só as da própria marca), nem o
--     público escolhido de outras (alvos: só as próprias linhas), nem valores (não há valor aqui). Marca fora do
--     público vê 0 linhas. O creator lê a oportunidade dele por RLS e as vencedoras por talent_sponsorships —
--     nunca quem recusou nem quem só quis. Colaborador da agência não lê (as respostas das marcas são comerciais).
--   • Todas as RPCs novas: search_path vazio, security definer só onde lê/escreve por cima da RLS, execute revogado
--     de public/anon; as internas só para service_role.
-- =============================================================================

-- 1) avisos: todos os valores da 0084 + os três do patrocínio; entidade 'sponsorship' --------------------------------
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
  'sponsorship_published', 'sponsorship_interest', 'sponsorship_decided'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship'));

-- 2) tabelas ---------------------------------------------------------------------------------------------------------
-- contrapartidas: até 10 itens, 3 a 120 letras, sem espaço nas pontas, sem repetir (viram itens do checklist da 0080)
create or replace function public.sponsorship_perks_valid(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and cardinality(p) <= 10
     and not exists (select 1 from unnest(p) x where x is null or char_length(x) not between 3 and 120 or x <> btrim(x))
     and (select count(distinct lower(x)) from unnest(p) x) = cardinality(p)
$$;
revoke execute on function public.sponsorship_perks_valid(text[]) from public, anon;
grant execute on function public.sponsorship_perks_valid(text[]) to authenticated, service_role;

create table if not exists public.sponsorship_opportunities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint sponsorship_opportunities_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint sponsorship_opportunities_talent_fk references public.talent_profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  expected_reach text not null default '',
  perks text[] not null default '{}',
  networks text[] not null default '{}',
  respond_by timestamptz not null,
  audience text not null default 'all',
  status text not null default 'open',
  closed_reason text,
  decision_note text not null default '',
  decided_at timestamptz,
  decided_by uuid constraint sponsorship_opportunities_decided_by_fk references auth.users (id) on delete set null,
  created_by uuid constraint sponsorship_opportunities_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsorship_opportunities_title_check check (char_length(title) between 3 and 120 and title = btrim(title)),
  constraint sponsorship_opportunities_texts_check check (char_length(description) <= 2000 and char_length(location) <= 200
    and char_length(expected_reach) <= 160 and char_length(decision_note) <= 500),
  constraint sponsorship_opportunities_range_check check (ends_at >= starts_at and ends_at - starts_at <= interval '62 days'),
  constraint sponsorship_opportunities_respond_check check (respond_by <= ends_at),
  constraint sponsorship_opportunities_perks_check check (public.sponsorship_perks_valid(perks)),
  constraint sponsorship_opportunities_networks_check check (cardinality(networks) between 1 and 11
    and networks <@ array['instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other']::text[]),
  constraint sponsorship_opportunities_audience_check check (audience in ('all', 'selected')),
  constraint sponsorship_opportunities_status_check check (status in ('open', 'closed', 'sponsored', 'cancelled')),
  constraint sponsorship_opportunities_closed_check check ((status = 'open') = (closed_reason is null)
    and (closed_reason is null or closed_reason in ('deadline', 'decision')))
);
create index if not exists sponsorship_opportunities_agency_idx on public.sponsorship_opportunities (agency_id, starts_at);
create index if not exists sponsorship_opportunities_talent_idx on public.sponsorship_opportunities (talent_id, starts_at);
create index if not exists sponsorship_opportunities_open_idx on public.sponsorship_opportunities (respond_by) where status = 'open';

-- público escolhido (audience = 'selected'): a marca precisa ser atendida pela agência
create table if not exists public.sponsorship_targets (
  opportunity_id uuid not null constraint sponsorship_targets_opportunity_fk references public.sponsorship_opportunities (id) on delete cascade,
  brand_id uuid not null constraint sponsorship_targets_brand_fk references public.brands (id) on delete cascade,
  agency_id uuid not null constraint sponsorship_targets_agency_fk references public.agencies (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint sponsorship_targets_pk primary key (opportunity_id, brand_id),
  constraint sponsorship_targets_agency_brand_fk foreign key (agency_id, brand_id) references public.agency_brands (agency_id, brand_id)
);
create index if not exists sponsorship_targets_brand_idx on public.sponsorship_targets (brand_id);

-- resposta de cada marca (uma por marca), quem e quando; outcome na decisão
create table if not exists public.sponsorship_responses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null constraint sponsorship_responses_opportunity_fk references public.sponsorship_opportunities (id) on delete cascade,
  agency_id uuid not null constraint sponsorship_responses_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint sponsorship_responses_brand_fk references public.brands (id) on delete cascade,
  response text not null,
  message text not null default '',
  responded_by uuid constraint sponsorship_responses_responded_by_fk references auth.users (id) on delete set null,
  responded_label text not null default '',
  responded_at timestamptz not null default now(),
  request_id uuid constraint sponsorship_responses_request_fk references public.campaign_requests (id) on delete set null,
  outcome text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sponsorship_responses_uq unique (opportunity_id, brand_id),
  constraint sponsorship_responses_response_check check (response in ('interested', 'declined')),
  constraint sponsorship_responses_message_check check (char_length(message) <= 500 and char_length(responded_label) <= 80),
  constraint sponsorship_responses_outcome_check check (outcome is null or (outcome in ('won', 'lost') and response = 'interested'))
);
create index if not exists sponsorship_responses_brand_idx on public.sponsorship_responses (brand_id, responded_at desc);

-- origem da campanha nascida do interesse
alter table public.campaign_requests add column if not exists sponsorship_id uuid
  constraint campaign_requests_sponsorship_fk references public.sponsorship_opportunities (id) on delete set null;
create index if not exists campaign_requests_sponsorship_idx on public.campaign_requests (sponsorship_id) where sponsorship_id is not null;

-- evento da agenda ligado à oportunidade
alter table public.calendar_events add column if not exists sponsorship_id uuid
  constraint calendar_events_sponsorship_fk references public.sponsorship_opportunities (id) on delete cascade;
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check check (kind in
  ('campaign', 'deliverable', 'consult_deadline', 'meeting', 'recording', 'commercial_date', 'other', 'sponsorship'));
alter table public.calendar_events drop constraint if exists calendar_events_sponsorship_check;
alter table public.calendar_events add constraint calendar_events_sponsorship_check check ((kind = 'sponsorship') = (sponsorship_id is not null)
  and (kind <> 'sponsorship' or (deal_id is null and talent_id is not null and source = 'system')));
create index if not exists calendar_events_sponsorship_idx on public.calendar_events (sponsorship_id) where sponsorship_id is not null;

do $$
declare t text;
begin
  foreach t in array array['sponsorship_opportunities', 'sponsorship_targets', 'sponsorship_responses'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
  end loop;
  drop trigger if exists trg_sponsorship_opportunities_updated on public.sponsorship_opportunities;
  create trigger trg_sponsorship_opportunities_updated before update on public.sponsorship_opportunities for each row execute function public.set_updated_at();
end $$;

-- 3) quem vê ---------------------------------------------------------------------------------------------------------
-- oportunidades que as marcas de uma pessoa veem (p_calendar: só as que vão para a agenda da marca — abertas, ou
-- patrocinadas por ela). Interna: o feed .ics a usa com o id da pessoa.
create or replace function public.brand_sponsorship_ids_for(p_user uuid, p_calendar boolean)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with brands_m as (
    select distinct bm.brand_id from public.brand_members bm where bm.user_id = p_user and bm.revoked_at is null),
  served as (
    select ab.agency_id, ab.brand_id from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
    where ab.status = 'active' and ab.brand_id in (select brand_id from brands_m))
  select coalesce(array_agg(distinct o.id), '{}'::uuid[])
  from public.sponsorship_opportunities o join served s on s.agency_id = o.agency_id
  where (o.audience = 'all' or exists (select 1 from public.sponsorship_targets g where g.opportunity_id = o.id and g.brand_id = s.brand_id))
    and (not coalesce(p_calendar, false) or o.status = 'open'
         or (o.status = 'sponsored' and exists (select 1 from public.sponsorship_responses r where r.opportunity_id = o.id and r.brand_id = s.brand_id and r.outcome = 'won')))
$$;
revoke execute on function public.brand_sponsorship_ids_for(uuid, boolean) from public, anon, authenticated;
grant execute on function public.brand_sponsorship_ids_for(uuid, boolean) to service_role;

create or replace function public.my_brand_sponsorship_ids(p_calendar boolean)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '{}'::uuid[] else public.brand_sponsorship_ids_for(auth.uid(), p_calendar) end
$$;
revoke execute on function public.my_brand_sponsorship_ids(boolean) from public, anon;
grant execute on function public.my_brand_sponsorship_ids(boolean) to authenticated, service_role;

-- a marca está no público desta oportunidade? (interna)
create or replace function public.sponsorship_brand_in_audience(p_opportunity uuid, p_brand uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sponsorship_opportunities o
                 join public.agency_brands ab on ab.agency_id = o.agency_id and ab.brand_id = p_brand and ab.status = 'active'
                 join public.agencies a on a.id = o.agency_id and a.status = 'active'
                 where o.id = p_opportunity
                   and (o.audience = 'all' or exists (select 1 from public.sponsorship_targets g where g.opportunity_id = o.id and g.brand_id = p_brand)))
$$;
revoke execute on function public.sponsorship_brand_in_audience(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_brand_in_audience(uuid, uuid) to service_role;

drop policy if exists sponsorship_opportunities_select_agency on public.sponsorship_opportunities;
create policy sponsorship_opportunities_select_agency on public.sponsorship_opportunities for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists sponsorship_opportunities_select_brand on public.sponsorship_opportunities;
create policy sponsorship_opportunities_select_brand on public.sponsorship_opportunities for select to authenticated
  using (id = any ((select public.my_brand_sponsorship_ids(false))::uuid[]));
drop policy if exists sponsorship_opportunities_select_talent on public.sponsorship_opportunities;
create policy sponsorship_opportunities_select_talent on public.sponsorship_opportunities for select to authenticated
  using (talent_id = (select public.my_talent_id()));

drop policy if exists sponsorship_targets_select_agency on public.sponsorship_targets;
create policy sponsorship_targets_select_agency on public.sponsorship_targets for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists sponsorship_targets_select_brand on public.sponsorship_targets;
create policy sponsorship_targets_select_brand on public.sponsorship_targets for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

drop policy if exists sponsorship_responses_select_agency on public.sponsorship_responses;
create policy sponsorship_responses_select_agency on public.sponsorship_responses for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists sponsorship_responses_select_brand on public.sponsorship_responses;
create policy sponsorship_responses_select_brand on public.sponsorship_responses for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- agenda da marca: + oportunidades abertas do público (ou patrocinadas por ela)
drop policy if exists calendar_events_select_brand on public.calendar_events;
create policy calendar_events_select_brand on public.calendar_events for select to authenticated
  using (visible_to_brand and (
           (deal_id is not null and deal_id = any ((select public.my_brand_deal_ids())::uuid[]))
        or (deal_id is null and kind = 'commercial_date' and agency_id = any ((select public.my_brand_served_agency_ids())::uuid[])
            and (brand_id is null or brand_id = any ((select public.my_brand_ids(false))::uuid[])))
        or (kind = 'sponsorship' and sponsorship_id = any ((select public.my_brand_sponsorship_ids(true))::uuid[]))));

-- feed .ics (0067, mesma assinatura): + o mesmo ramo da marca
create or replace function public.calendar_events_for_user(p_user uuid)
returns setof public.calendar_events language sql stable security definer set search_path = '' as $$
  with agencies_m as (
    select m.agency_id, public.agency_role_rank(m.role) as rank from public.agency_members m
    join public.agencies a on a.id = m.agency_id and a.status = 'active' where m.user_id = p_user and m.revoked_at is null),
  staff_deals as (
    select d.id from public.deals d join agencies_m am on am.agency_id = d.agency_id and am.rank = 1
    where d.owner_id = p_user or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = p_user)),
  brands_m as (
    select distinct bm.brand_id from public.brand_members bm where bm.user_id = p_user and bm.revoked_at is null
      and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active' where ab.brand_id = bm.brand_id and ab.status = 'active')),
  brand_deals as (select d.id from public.deals d where d.brand_visible and d.brand_id in (select brand_id from brands_m)),
  served as (select distinct ab.agency_id from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
             where ab.status = 'active' and ab.brand_id in (select brand_id from brands_m)),
  brand_sponsorships as (select unnest(public.brand_sponsorship_ids_for(p_user, true)) as id),
  talent as (select t.id from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active'
             where t.archived_at is null and public.talent_user_id(t.id) = p_user order by t.created_at limit 1),
  -- admin geral (conta real): tudo, como a política _select_admin
  platform_admin as (select exists (select 1 from public.role_assignments r join auth.users u on u.id = r.user_id
                                    where r.user_id = p_user and r.role::text = 'admin' and r.scope_type = 'global' and r.revoked_at is null
                                      and coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') not in ('true', 't')) as ok)
  select e.* from public.calendar_events e
  where (select ok from platform_admin)
     or e.agency_id in (select agency_id from agencies_m where rank >= 2)
     or e.deal_id in (select id from staff_deals)
     or (e.deal_id is null and e.talent_id is null and e.agency_id in (select agency_id from agencies_m))
     or (e.visible_to_brand and ((e.deal_id is not null and e.deal_id in (select id from brand_deals))
                                 or (e.deal_id is null and e.kind = 'commercial_date' and e.agency_id in (select agency_id from served) and (e.brand_id is null or e.brand_id in (select brand_id from brands_m)))
                                 or (e.kind = 'sponsorship' and e.sponsorship_id in (select id from brand_sponsorships))))
     or (e.visible_to_talent and e.talent_id = (select id from talent))
$$;
revoke execute on function public.calendar_events_for_user(uuid) from public, anon, authenticated;

-- 4) evento da agenda (sistema) ----------------------------------------------------------------------------------------
create or replace function public.sponsorship_sync_event(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_name text; v_key text;
begin
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null then return; end if;
  v_key := 'sponsorship:' || o.id::text;
  if o.status = 'cancelled' then
    delete from public.calendar_events e where e.agency_id = o.agency_id and e.source_key = v_key;
    return;
  end if;
  select t.display_name into v_name from public.talent_profiles t where t.id = o.talent_id;
  insert into public.calendar_events (agency_id, kind, title, subtitle, description, starts_at, ends_at, all_day, location, talent_id, sponsorship_id,
                                      source, source_key, visible_to_brand, visible_to_talent, created_by)
  values (o.agency_id, 'sponsorship', o.title, left(coalesce(v_name, ''), 160), left(o.description, 2000), o.starts_at, o.ends_at, o.all_day, o.location,
          o.talent_id, o.id, 'system', v_key, true, true, o.created_by)
  on conflict (agency_id, source_key) where source_key is not null do update set title = excluded.title, subtitle = excluded.subtitle,
    description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at, all_day = excluded.all_day,
    location = excluded.location, talent_id = excluded.talent_id;
end $$;
revoke execute on function public.sponsorship_sync_event(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_sync_event(uuid) to service_role;

-- data local "YYYY-MM-DD HH24:MI" no fuso da agência (parâmetro de aviso: nunca valor)
create or replace function public.sponsorship_local_stamp(p_at timestamptz, p_agency uuid)
returns text language sql stable security definer set search_path = '' as $$
  select to_char(p_at at time zone coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo'), 'YYYY-MM-DD HH24:MI')
$$;
revoke execute on function public.sponsorship_local_stamp(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_local_stamp(timestamptz, uuid) to service_role;

-- avisa as marcas do público (dedupe por marca e pessoa: marca acrescentada depois recebe; quem já recebeu, não)
create or replace function public.sponsorship_notify_audience(p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; r record; v_talent text; v_count int := 0;
begin
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or o.status <> 'open' then return 0; end if;
  select t.display_name into v_talent from public.talent_profiles t where t.id = o.talent_id;
  for r in select ab.brand_id from public.agency_brands ab
           where ab.agency_id = o.agency_id and ab.status = 'active'
             and (o.audience = 'all' or exists (select 1 from public.sponsorship_targets g where g.opportunity_id = o.id and g.brand_id = ab.brand_id)) loop
    v_count := v_count + public.inbox_notify_brand(r.brand_id, false, 'sponsorship_published', '/marca/oportunidades/' || o.id::text,
      jsonb_build_object('title', left(o.title, 120), 'talent', left(coalesce(v_talent, ''), 120), 'date', public.sponsorship_local_stamp(o.respond_by, o.agency_id)),
      o.agency_id, 'sponsorship', o.id, 'sponsor:' || o.id::text || ':' || r.brand_id::text);
  end loop;
  return v_count;
end $$;
revoke execute on function public.sponsorship_notify_audience(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_notify_audience(uuid) to service_role;

-- 5) RPCs da agência -------------------------------------------------------------------------------------------------
-- criar/editar (gestor+; só aberta). p_data: talent_id, title, description, location, starts_at, ends_at, all_day,
-- expected_reach, perks[], networks[], respond_by, audience ('all' | 'selected'), brand_ids[]
create or replace function public.agency_sponsorship_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before public.sponsorship_opportunities%rowtype; v_id uuid := p_id; v_talent uuid; v_start timestamptz; v_end timestamptz; v_respond timestamptz;
        v_all_day boolean; v_title text; v_audience text; v_perks text[]; v_networks text[]; v_brands uuid[]; v_has_responses boolean := false;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_id is not null then
    select * into v_before from public.sponsorship_opportunities o where o.id = v_id and o.agency_id = p_agency for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_has_responses := exists (select 1 from public.sponsorship_responses r where r.opportunity_id = v_id);
  end if;
  begin
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_start := coalesce(nullif(btrim(coalesce(p_data ->> 'starts_at', '')), '')::timestamptz, v_before.starts_at);
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_at', '')), '')::timestamptz, v_before.ends_at, v_start);
    v_respond := coalesce(nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz, v_before.respond_by);
    v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
    if p_data ? 'perks' then
      select coalesce(array_agg(btrim(x) order by n), '{}'::text[]) into v_perks
      from jsonb_array_elements_text(p_data -> 'perks') with ordinality as e(x, n) where btrim(x) <> '';
    else v_perks := coalesce(v_before.perks, '{}'::text[]); end if;
    if p_data ? 'networks' then
      select coalesce(array_agg(distinct lower(btrim(x))), '{}'::text[]) into v_networks from jsonb_array_elements_text(p_data -> 'networks') x;
    else v_networks := coalesce(v_before.networks, '{}'::text[]); end if;
    if p_data ? 'brand_ids' then
      select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_brands from jsonb_array_elements_text(p_data -> 'brand_ids') x where btrim(x) <> '';
    end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_title := btrim(coalesce(p_data ->> 'title', v_before.title, ''));
  v_audience := coalesce(nullif(p_data ->> 'audience', ''), v_before.audience, 'all');
  if v_talent is null or v_start is null or v_respond is null or v_audience not in ('all', 'selected') then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- quem já recebeu respostas não troca de creator (as marcas responderam a ele)
  if v_has_responses and v_talent <> v_before.talent_id then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  -- creator do elenco, ativo e com consentimento vigente (regra para ser mostrado à marca)
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.consent_at is not null and t.consent_revoked_at is null) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  -- prazo para responder: no futuro (ao criar ou ao mudar) e até o fim do evento
  if (v_before.id is null or v_respond is distinct from v_before.respond_by) and v_respond <= now() then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_respond > v_end then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_audience = 'selected' then
    if v_brands is null then
      select coalesce(array_agg(g.brand_id), '{}'::uuid[]) into v_brands from public.sponsorship_targets g where g.opportunity_id = v_id;
    end if;
    -- quem já respondeu continua no público
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_brands
    from (select unnest(v_brands) as x union select r.brand_id from public.sponsorship_responses r where r.opportunity_id = v_id) s;
    if cardinality(v_brands) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_brands) b where not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = b and ab.status = 'active')) then
      raise exception 'brand_not_linked' using errcode = 'P0001';
    end if;
  end if;
  begin
    if v_id is null then
      insert into public.sponsorship_opportunities (agency_id, talent_id, title, description, location, starts_at, ends_at, all_day, expected_reach, perks, networks,
                                                    respond_by, audience, created_by)
      values (p_agency, v_talent, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_start, v_end, v_all_day, btrim(coalesce(p_data ->> 'expected_reach', '')), v_perks, v_networks, v_respond, v_audience, auth.uid())
      returning id into v_id;
    else
      update public.sponsorship_opportunities set talent_id = v_talent, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        expected_reach = case when p_data ? 'expected_reach' then btrim(coalesce(p_data ->> 'expected_reach', '')) else expected_reach end,
        perks = v_perks, networks = v_networks, respond_by = v_respond, audience = v_audience
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_audience = 'selected' then
    delete from public.sponsorship_targets g where g.opportunity_id = v_id and not (g.brand_id = any (v_brands));
    insert into public.sponsorship_targets (opportunity_id, brand_id, agency_id) select v_id, b, p_agency from unnest(v_brands) b
    on conflict (opportunity_id, brand_id) do nothing;
  else
    delete from public.sponsorship_targets g where g.opportunity_id = v_id;
  end if;
  perform public.sponsorship_sync_event(v_id);
  perform public.audit_log('sponsorship.save', 'sponsorship', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('agency_id', p_agency, 'talent_id', v_before.talent_id, 'starts_at', v_before.starts_at,
      'respond_by', v_before.respond_by, 'audience', v_before.audience) end,
    jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent, 'starts_at', v_start, 'respond_by', v_respond, 'audience', v_audience,
      'brands', case when v_audience = 'selected' then to_jsonb(v_brands) else null end), null,
    public.talent_audit_actor('agency', p_agency));
  perform public.sponsorship_notify_audience(v_id);
  return v_id;
end $$;

-- decidir: 'sponsor' (uma ou mais marcas que quiseram), 'close' (sem vencedora) ou 'cancel'
create or replace function public.agency_sponsorship_decide(p_id uuid, p_action text, p_brands uuid[], p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_note text := btrim(coalesce(p_note, '')); v_winners uuid[] := '{}'::uuid[]; r record;
        v_status text; v_winner_names text; v_to uuid; v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.agency_can(o.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(o.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('sponsor', 'close', 'cancel') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if o.status not in ('open', 'closed') or o.decided_at is not null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_action = 'sponsor' then
    select coalesce(array_agg(distinct b), '{}'::uuid[]) into v_winners from unnest(coalesce(p_brands, '{}'::uuid[])) b;
    if cardinality(v_winners) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_winners) b where not exists (select 1 from public.sponsorship_responses x where x.opportunity_id = p_id and x.brand_id = b and x.response = 'interested')) then
      raise exception 'not_interested' using errcode = 'P0001';
    end if;
  end if;
  v_status := case p_action when 'sponsor' then 'sponsored' when 'close' then 'closed' else 'cancelled' end;
  update public.sponsorship_opportunities set status = v_status, closed_reason = 'decision', decided_at = now(), decided_by = auth.uid(), decision_note = v_note
  where id = p_id;
  update public.sponsorship_responses x set outcome = case when x.brand_id = any (v_winners) then 'won' else 'lost' end, decided_at = now()
  where x.opportunity_id = p_id and x.response = 'interested';
  -- rascunho das que não venceram (ainda não enviado à agência) é cancelado; o enviado segue no pipeline
  update public.campaign_requests c set status = 'cancelled', approval_status = 'none'
  where c.sponsorship_id = p_id and c.status = 'draft' and not (c.brand_id = any (v_winners));
  perform public.sponsorship_sync_event(p_id);
  select string_agg(b.name, ', ' order by b.name) into v_winner_names from public.brands b where b.id = any (v_winners);
  v_label := public.actor_label(o.agency_id, null);
  perform public.audit_log('sponsorship.decide', 'sponsorship', p_id::text, jsonb_build_object('agency_id', o.agency_id, 'status', o.status),
    jsonb_build_object('agency_id', o.agency_id, 'status', v_status, 'winners', to_jsonb(v_winners), 'by', v_label), nullif(v_note, ''),
    public.talent_audit_actor('agency', o.agency_id));
  -- marcas que responderam: venceu / encerrada / cancelada
  for r in select x.brand_id from public.sponsorship_responses x where x.opportunity_id = p_id loop
    perform public.inbox_notify_brand(r.brand_id, false, 'sponsorship_decided', '/marca/oportunidades/' || p_id::text,
      jsonb_build_object('title', left(o.title, 120), 'status', case when r.brand_id = any (v_winners) then 'won' when p_action = 'cancel' then 'cancelled' else 'closed' end),
      o.agency_id, 'sponsorship', p_id, 'sponsor-decided:' || p_id::text || ':' || r.brand_id::text);
  end loop;
  -- o creator: patrocinada (e por quem), encerrada ou cancelada
  v_to := public.talent_user_id(o.talent_id);
  perform public.inbox_notify(v_to, 'sponsorship_decided', '/creator/escritorio/agenda',
    jsonb_build_object('title', left(o.title, 120), 'status', v_status, 'brand', left(coalesce(v_winner_names, ''), 120)),
    o.agency_id, 'sponsorship', p_id, 'sponsor-decided:' || p_id::text || ':talent');
end $$;

-- prazo de resposta vencido: encerra (cron diário). A agência ainda pode escolher as vencedoras depois.
create or replace function public.sponsorship_deadline_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.sponsorship_opportunities set status = 'closed', closed_reason = 'deadline' where status = 'open' and respond_by < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.sponsorship_deadline_scan() from public, anon, authenticated;
grant execute on function public.sponsorship_deadline_scan() to service_role;

-- 6) resposta da marca --------------------------------------------------------------------------------------------------
create or replace function public.brand_sponsorship_respond(p_id uuid, p_brand uuid, p_response text, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; x public.sponsorship_responses%rowtype; v_msg text := btrim(coalesce(p_message, '')); v_label text;
        v_tz text; v_request uuid; v_start date; v_end date; v_minutes int; v_notes text; v_brand_name text; v_deliv jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.sponsorship_brand_in_audience(p_id, p_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_response is null or p_response not in ('interested', 'declined') or char_length(v_msg) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if o.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if o.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  select * into x from public.sponsorship_responses where opportunity_id = p_id and brand_id = p_brand for update;
  -- recusa pode virar interesse; interesse não volta atrás (já criou a campanha)
  if x.id is not null and (x.response = 'interested' or p_response = 'declined') then raise exception 'already_responded' using errcode = 'P0001'; end if;
  v_label := public.actor_label(o.agency_id, p_brand);
  if p_response = 'interested' then
    select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = o.agency_id;
    v_start := (o.starts_at at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;
    -- dia inteiro: o fim é exclusivo (meia-noite do dia seguinte)
    v_end := ((case when o.all_day and o.ends_at > o.starts_at then o.ends_at - interval '1 minute' else o.ends_at end) at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;
    if v_end < v_start then v_end := v_start; end if;
    v_minutes := case when o.all_day then null else greatest(15, (extract(epoch from (o.ends_at - o.starts_at)) / 60)::int) end;
    if v_minutes is not null and v_minutes > 14400 then v_minutes := null; end if;
    v_deliv := jsonb_build_array(jsonb_build_object('kind', 'event', 'quantity', 1, 'network', o.networks[1]));
    v_notes := left(concat_ws(E'\n',
      'Oportunidade de patrocínio: ' || o.title,
      case when o.expected_reach <> '' then 'Alcance esperado: ' || o.expected_reach end,
      case when cardinality(o.perks) > 0 then 'Contrapartidas: ' || array_to_string(o.perks, '; ') end,
      case when o.description <> '' then o.description end,
      case when v_msg <> '' then 'Mensagem da marca: ' || v_msg end), 2000);
    begin
      insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, period_start, period_end, desired_at,
                                            duration_minutes, format, location, networks, deliverables, notes, brief, sponsorship_id)
      values (o.agency_id, p_brand, 'brand', auth.uid(), o.talent_id, left(o.title, 120), 'event', v_start, v_end,
              case when o.all_day then null else o.starts_at end, v_minutes, case when o.location <> '' then 'in_person' end, o.location, o.networks,
              v_deliv, v_notes, case when cardinality(o.perks) > 0 then jsonb_build_object('checks', to_jsonb(o.perks)) else '{}'::jsonb end, o.id)
      returning id into v_request;
    exception when check_violation or not_null_violation or foreign_key_violation then raise exception 'invalid_input' using errcode = '22023';
    end;
  end if;
  if x.id is null then
    insert into public.sponsorship_responses (opportunity_id, agency_id, brand_id, response, message, responded_by, responded_label, request_id)
    values (p_id, o.agency_id, p_brand, p_response, v_msg, auth.uid(), v_label, v_request);
  else
    update public.sponsorship_responses set response = p_response, message = v_msg, responded_by = auth.uid(), responded_label = v_label,
      responded_at = now(), request_id = v_request
    where id = x.id;
  end if;
  perform public.audit_log('sponsorship.respond', 'sponsorship', p_id::text, case when x.id is null then null else jsonb_build_object('response', x.response) end,
    jsonb_build_object('agency_id', o.agency_id, 'brand_id', p_brand, 'response', p_response, 'request_id', v_request), nullif(v_msg, ''), 'brand'::public.actor_type);
  if p_response = 'interested' then
    select b.name into v_brand_name from public.brands b where b.id = p_brand;
    perform public.inbox_notify_agency(o.agency_id, 'manager', 'sponsorship_interest', '/agencia/oportunidades/' || p_id::text,
      jsonb_build_object('title', left(o.title, 120), 'brand', left(coalesce(v_brand_name, ''), 120)), 'sponsorship', p_id,
      'sponsor-interest:' || p_id::text || ':' || p_brand::text);
  end if;
  return v_request;
end $$;

-- 7) leituras -----------------------------------------------------------------------------------------------------------
-- público de uma oportunidade (interna): marcas atendidas (all) ou escolhidas, mais as que responderam
create or replace function public.sponsorship_audience_brands(p_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select ab.brand_id from public.sponsorship_opportunities o join public.agency_brands ab on ab.agency_id = o.agency_id and ab.status = 'active'
  where o.id = p_id and (o.audience = 'all' or exists (select 1 from public.sponsorship_targets g where g.opportunity_id = o.id and g.brand_id = ab.brand_id))
  union
  select r.brand_id from public.sponsorship_responses r where r.opportunity_id = p_id
$$;
revoke execute on function public.sponsorship_audience_brands(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_audience_brands(uuid) to service_role;

create or replace function public.agency_sponsorships(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'talent_id', o.talent_id, 'talent_name', t.display_name,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'location', o.location, 'respond_by', o.respond_by,
      'status', o.status, 'closed_reason', o.closed_reason, 'audience', o.audience, 'decided_at', o.decided_at,
      'audience_count', (select count(*) from public.sponsorship_audience_brands(o.id)),
      'interested', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'interested'),
      'declined', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'declined'),
      'winners', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb) from public.sponsorship_responses r join public.brands b on b.id = r.brand_id
                  where r.opportunity_id = o.id and r.outcome = 'won'))
    order by (o.status = 'open') desc, o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o join public.talent_profiles t on t.id = o.talent_id
    where o.agency_id = p_agency);
end $$;

create or replace function public.agency_sponsorship_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not public.agency_can(o.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'opportunity', jsonb_build_object('id', o.id, 'agency_id', o.agency_id, 'talent_id', o.talent_id,
      'talent_name', (select t.display_name from public.talent_profiles t where t.id = o.talent_id),
      'title', o.title, 'description', o.description, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day,
      'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks), 'networks', to_jsonb(o.networks), 'respond_by', o.respond_by,
      'audience', o.audience, 'status', o.status, 'closed_reason', o.closed_reason, 'decision_note', o.decision_note, 'decided_at', o.decided_at,
      'decided_label', (select m.display_name from public.agency_members m where m.agency_id = o.agency_id and m.user_id = o.decided_by),
      'created_at', o.created_at,
      'target_ids', (select coalesce(jsonb_agg(g.brand_id), '[]'::jsonb) from public.sponsorship_targets g where g.opportunity_id = o.id)),
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand_id', b.id, 'name', b.name, 'response', r.response, 'message', coalesce(r.message, ''),
        'responded_label', coalesce(r.responded_label, ''), 'responded_at', r.responded_at, 'outcome', r.outcome, 'request_id', r.request_id,
        'request_status', c.status, 'deal_id', d.id)
      order by case r.response when 'interested' then 0 when 'declined' then 2 else 1 end, r.responded_at, b.name), '[]'::jsonb)
      from (select distinct x as brand_id from public.sponsorship_audience_brands(o.id) x) s
      join public.brands b on b.id = s.brand_id
      left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = b.id
      left join public.campaign_requests c on c.id = r.request_id
      left join public.deals d on d.request_id = c.id));
end $$;

-- marca: as oportunidades que ela vê, com a própria resposta. Situação vista pela marca: open | expired (prazo
-- passou) | won (patrocinada por ela) | closed (encerrada ou patrocinada por outra — quem venceu não aparece) | cancelled
create or replace function public.brand_sponsorships(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'description', o.description, 'location', o.location,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'networks', to_jsonb(o.networks), 'respond_by', o.respond_by,
      'status', case when o.status = 'cancelled' then 'cancelled'
                     when o.status = 'sponsored' and r.outcome = 'won' then 'won'
                     when o.status in ('sponsored', 'closed') then 'closed'
                     when o.respond_by < now() then 'expired' else 'open' end,
      'agency_name', (select a.name from public.agencies a where a.id = o.agency_id),
      'timezone', (select a.timezone from public.agencies a where a.id = o.agency_id),
      'talent', (select jsonb_build_object('id', t.id, 'name', t.display_name, 'in_catalog', public.talent_brand_card_ok(t.id, o.agency_id),
                   'photo_url', case when public.talent_brand_card_ok(t.id, o.agency_id) then public.talent_public_card(t.id) ->> 'photo_url' end)
                 from public.talent_profiles t where t.id = o.talent_id),
      'my_response', case when r.id is null then null else jsonb_build_object('response', r.response, 'message', r.message, 'responded_label', r.responded_label,
        'responded_at', r.responded_at, 'request_id', r.request_id, 'outcome', r.outcome) end)
    order by (o.status = 'open' and o.respond_by >= now()) desc, o.starts_at), '[]'::jsonb)
    from public.sponsorship_opportunities o
    left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = p_brand
    where public.sponsorship_brand_in_audience(o.id, p_brand) or r.id is not null);
end $$;

-- creator: as oportunidades dele e, se patrocinada, por qual(is) marca(s). Nunca quem recusou ou só quis.
create or replace function public.talent_sponsorships()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at,
      'all_day', o.all_day, 'respond_by', o.respond_by, 'status', o.status, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'sponsors', case when o.status = 'sponsored' then (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb)
                    from public.sponsorship_responses r join public.brands b on b.id = r.brand_id where r.opportunity_id = o.id and r.outcome = 'won') else '[]'::jsonb end)
    order by o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o where o.talent_id = v_talent and o.status <> 'cancelled');
end $$;

-- 8) brand_request_save (0081, MESMA assinatura): no rascunho nascido de uma oportunidade, o creator dela vale mesmo fora
--    do catálogo autorizado (a agência o ofereceu a esta marca)
create or replace function public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb; v_brief jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  if p_id is not null then
    -- D19: o pedido precisa ser desta marca, de origem marca e ainda rascunho
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.brand_id = p_brand and r.origin = 'brand') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.status = 'draft') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    -- 0081: aguardando o diretor, só ele mexe (a equipe retira o pedido para voltar a editar)
    if public.brand_member_of(p_brand) <> 'owner' and exists (select 1 from public.campaign_requests r where r.id = p_id and r.approval_status = 'pending') then
      raise exception 'awaiting_approval' using errcode = 'P0001';
    end if;
  end if;
  begin
    if p_data ? 'talent_id' then v_talent := nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid; end if;
    v_period_start := nullif(btrim(coalesce(p_data ->> 'period_start', '')), '')::date;
    v_period_end := nullif(btrim(coalesce(p_data ->> 'period_end', '')), '')::date;
    v_desired := nullif(btrim(coalesce(p_data ->> 'desired_at', '')), '')::timestamptz;
    v_duration := nullif(btrim(coalesce(p_data ->> 'duration_minutes', '')), '')::int;
    v_min := nullif(btrim(coalesce(p_data ->> 'budget_min_cents', '')), '')::bigint;
    v_max := nullif(btrim(coalesce(p_data ->> 'budget_max_cents', '')), '')::bigint;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_segments from jsonb_array_elements_text(coalesce(p_data -> 'segment_ids', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_ages from jsonb_array_elements_text(coalesce(p_data -> 'target_age_bands', '[]'::jsonb)) x;
    select coalesce(array_agg(upper(x)), '{}'::text[]) into v_states from jsonb_array_elements_text(coalesce(p_data -> 'target_states', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_deliverables := coalesce(p_data -> 'deliverables', '[]'::jsonb);
  v_brief := coalesce(p_data -> 'brief', '{}'::jsonb);
  if not public.campaign_brief_valid(v_brief) then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- o creator desejado precisa estar no catálogo autorizado da agência que atende a marca
  -- (0085: ou ser o creator da oportunidade de patrocínio de onde este rascunho nasceu)
  if v_talent is not null and not public.talent_brand_card_ok(v_talent, v_agency)
     and not (p_id is not null and exists (select 1 from public.campaign_requests r join public.sponsorship_opportunities o on o.id = r.sponsorship_id
                                           where r.id = p_id and o.talent_id = v_talent and o.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if cardinality(v_segments) > 0 and exists (select 1 from unnest(v_segments) s where not exists (select 1 from public.talent_segments g where g.id = s and g.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if p_id is null then
      insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, product, target_audience, target_age_bands,
                                            target_states, region_note, period_start, period_end, desired_at, duration_minutes, format, location, networks,
                                            deliverables, segment_ids, notes, brief)
      values (v_agency, p_brand, 'brand', auth.uid(), v_talent, btrim(coalesce(p_data ->> 'title', '')), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'product', '')), btrim(coalesce(p_data ->> 'target_audience', '')), v_ages, v_states,
              btrim(coalesce(p_data ->> 'region_note', '')), v_period_start, v_period_end, v_desired, v_duration, nullif(p_data ->> 'format', ''),
              btrim(coalesce(p_data ->> 'location', '')), v_networks, v_deliverables, v_segments, btrim(coalesce(p_data ->> 'notes', '')), v_brief)
      returning id into v_id;
    else
      update public.campaign_requests set
        talent_id = case when p_data ? 'talent_id' then v_talent else talent_id end,
        title = case when p_data ? 'title' then btrim(coalesce(p_data ->> 'title', '')) else title end,
        objective = case when p_data ? 'objective' then nullif(p_data ->> 'objective', '') else objective end,
        product = case when p_data ? 'product' then btrim(coalesce(p_data ->> 'product', '')) else product end,
        target_audience = case when p_data ? 'target_audience' then btrim(coalesce(p_data ->> 'target_audience', '')) else target_audience end,
        target_age_bands = case when p_data ? 'target_age_bands' then v_ages else target_age_bands end,
        target_states = case when p_data ? 'target_states' then v_states else target_states end,
        region_note = case when p_data ? 'region_note' then btrim(coalesce(p_data ->> 'region_note', '')) else region_note end,
        period_start = case when p_data ? 'period_start' then v_period_start else period_start end,
        period_end = case when p_data ? 'period_end' then v_period_end else period_end end,
        desired_at = case when p_data ? 'desired_at' then v_desired else desired_at end,
        duration_minutes = case when p_data ? 'duration_minutes' then v_duration else duration_minutes end,
        format = case when p_data ? 'format' then nullif(p_data ->> 'format', '') else format end,
        location = case when p_data ? 'location' then btrim(coalesce(p_data ->> 'location', '')) else location end,
        networks = case when p_data ? 'networks' then v_networks else networks end,
        deliverables = case when p_data ? 'deliverables' then v_deliverables else deliverables end,
        segment_ids = case when p_data ? 'segment_ids' then v_segments else segment_ids end,
        notes = case when p_data ? 'notes' then btrim(coalesce(p_data ->> 'notes', '')) else notes end,
        brief = case when p_data ? 'brief' then v_brief else brief end
      where id = p_id returning id into v_id;
    end if;
    -- valor oferecido pela marca (tabela de valor: a marca lê o próprio; gestor e colaborador não leem)
    if p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note' then
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
      values (v_agency, p_brand, v_id, v_min, v_max, btrim(coalesce(p_data ->> 'budget_note', '')), auth.uid())
      on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
        note = excluded.note, updated_by = excluded.updated_by;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end $$;
revoke execute on function public.brand_request_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.brand_request_save(uuid, uuid, jsonb) to authenticated, service_role;

-- 9) e-mail (0084, mesma assinatura): + os três avisos do patrocínio -----------------------------------------------------
create or replace function public.inbox_kind_emails(p_kind text, p_link text, p_params jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case p_kind
    when 'opportunity_received' then coalesce(p_link, '') like '/creator/escritorio%'
    when 'opportunity_updated' then coalesce(p_link, '') like '/creator/escritorio%' and coalesce(p_params ->> 'status', '') in ('counter_accepted', 'counter_rejected')
    when 'deliverable_decided' then coalesce(p_link, '') like '/creator/escritorio%' and coalesce(p_params ->> 'status', '') = 'changes_requested'
    when 'deliverable_submitted' then coalesce(p_link, '') like '/marca/%'
    when 'contract_acceptance_requested' then true
    when 'task_due_soon' then true
    when 'sponsorship_published' then coalesce(p_link, '') like '/marca/%'
    when 'sponsorship_interest' then coalesce(p_link, '') like '/agencia/%'
    when 'sponsorship_decided' then true
    else false end
$$;
revoke execute on function public.inbox_kind_emails(text, text, jsonb) from public, anon;
grant execute on function public.inbox_kind_emails(text, text, jsonb) to authenticated, service_role;

-- 10) execução ------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.agency_sponsorship_save(uuid, uuid, jsonb)', 'public.agency_sponsorship_decide(uuid, text, uuid[], text)',
                           'public.brand_sponsorship_respond(uuid, uuid, text, text)', 'public.agency_sponsorships(uuid)',
                           'public.agency_sponsorship_detail(uuid)', 'public.brand_sponsorships(uuid)', 'public.talent_sponsorships()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
