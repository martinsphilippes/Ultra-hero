-- =============================================================================
-- Groscove Ultra · 0089 · Gestão: chamada da marca (oportunidade que parte da necessidade da marca)
-- Pedido do responsável (03/11): "A marca também tem que poder gerar uma oportunidade para as agências e creators
-- verem, com esse fluxo de possibilidade de negócio, partindo de uma necessidade da marca." Cenário S96.
-- Idempotente; nenhuma função nova para anon (S14 segue 18); as RPCs recriadas mantêm a MESMA assinatura.
--
-- Decisões:
--   • É o motor da 0088 com a direção invertida: a MARCA publica a necessidade (brand_calls) e as AGÊNCIAS mandam
--     propostas (brand_call_proposals) negociadas em rodadas (brand_call_rounds: proposta, contraproposta, aceite,
--     recusa; quem, quando, valor, entregas, prazo e nota). Tabelas próprias em vez de reaproveitar as da 0088 (lá a
--     proposta pertence a uma cota de uma oportunidade da agência; aqui a proposta traz creators e entregas): as
--     regras, os papéis, os avisos e a aprovação interna são as mesmas, e as auxiliares da 0088 que servem
--     (público limpo, carimbo de data) são reaproveitadas.
--   • Chamada: título, objetivo (mesma lista da campanha), descrição, período (datas), local opcional, público (os
--     MESMOS campos da campanha), entregas desejadas (mesmo formato do campaign_request: tipo + quantidade + rede),
--     nº de creators desejado (1 a 50), nichos (até 10 etiquetas livres: os segmentos são de cada agência, então
--     aqui é texto), redes (pelo menos uma), verba em centavos BRL SIMULADOS com a forma de mostrar às agências
--     ('exact' valor exato | 'up_to' "até R$ X" | 'open' a combinar, sem valor), prazo para propostas e alvo:
--     'my_agencies' (agências que já me atendem: o vínculo ativo, calculado na hora), 'selected' (agências
--     escolhidas, brand_call_targets) ou 'all' (qualquer agência ativa da plataforma). Situação: draft → open →
--     closed (prazo, pelo cron, ou decisão sem vencedora) | contracted (1+ vencedoras) | cancelled.
--   • Marca (0081): a equipe monta o rascunho e pede ao dono para publicar (approval_status pending; o dono aprova =
--     publica, ou devolve com nota; quem pediu pode retirar); o dono publica direto. Só o rascunho edita. Só o dono
--     escolhe as vencedoras, encerra ou cancela (compromete dinheiro). Nas rodadas, aceitar e contrapropor da equipe
--     esperam o dono (pending_owner); recusar vai direto — igual à 0088.
--   • Agência (gestor+ vê; colaborador não): lista e ficha só pelas RPCs (a tabela da chamada é só da marca), sem
--     saber quem mais foi convidado nem quantas propostas existem (decisão: nem "outras agências também foram
--     convidadas" — o alvo é só da marca). Verba: só o Adm lê, e só na forma escolhida pela marca. O gestor monta a
--     proposta (creators do casting liberados para marcas — talent_brand_card_ok: consentimento vigente e liberado
--     no catálogo —, entregas por creator, link do media kit opcional, prazo de entrega, observações); só o Adm grava
--     o valor total e envia. Uma proposta viva por agência por chamada; depois de recusada pode mandar outra
--     enquanto a chamada está aberta e no prazo.
--   • Creator: vê no escritório as chamadas abertas cujo alvo inclui a agência dele (todas, sem filtro: decisão
--     simples; a tela marca as que usam uma rede dele), sem valor nem quem mais participa, e manda "Tenho interesse"
--     com mensagem curta (brand_call_interests, um por chamada, pode atualizar a mensagem) → avisa os gestores da
--     agência, que veem os interessados ao montar a proposta. Nunca fala com a marca.
--   • Prazo: depois de respond_by não nasce proposta nem se envia rascunho (deadline_passed); o cron diário fecha a
--     chamada (closed/deadline) e a marca ainda escolhe as vencedoras; as negociações já abertas seguem.
--   • Acordo (brand_call_agree): valor, entregas e prazo congelados (agreed_*); cria a campanha da marca em rascunho
--     (campaign_requests origem 'brand', brand_call_id marca a origem) para a agência vencedora com título, objetivo,
--     período, local, redes, entregas acordadas, público, creator principal (o 1º) e observações (creators e notas;
--     sem valor), e o valor acordado em campaign_request_budgets (mínimo = máximo = acordado, o "Valor oferecido").
--     Segue o fluxo normal (equipe pede aprovação, dono envia). Ao enviar (brand_request_submit, MESMA assinatura)
--     todos os creators da proposta entram sugeridos no negócio (motivo brand_choice). brand_request_save (MESMA
--     assinatura) usa a agência da campanha da chamada, aceita os creators da proposta e trava o valor acordado.
--   • Agência que não atende a marca (alvo 'all' ou escolhida) e vence: a campanha precisa de agency_brands (FK); o
--     vínculo nasce ARQUIVADO (por projeto) — não muda a agência ativa da marca (D18, uma ativa por marca) — e o envio
--     e o pedido de aprovação aceitam esse vínculo quando a campanha vem de um acordo de chamada.
--   • Decisão (brand_call_decide, só o dono): 'contract' com 1+ propostas (abertas na vez da marca, ou já acordadas)
--     → acordos + contratada; 'close' → encerrada (com acordo vira contratada); 'cancel' → cancelada (recusado com
--     acordo: has_agreement). As demais propostas vivas são encerradas e TODAS as agências que propuseram recebem o
--     desfecho (venceu / não foi escolhida / encerrada / cancelada).
--   • Avisos (sino; e-mail pela fila da 0084 para publicada, interesse, rodadas e decisão): brand_call_published
--     (gestores das agências do alvo ao publicar), brand_call_interest (gestores da agência do creator),
--     brand_call_negotiation (a outra parte a cada rodada — na agência, só o Adm; para os donos quando a equipe
--     pede aprovação), brand_call_decided (agências que propuseram; creators das propostas vencedoras: 'chosen') e
--     brand_call_review (aprovação interna da publicação; só sino). Parâmetros nunca têm valor.
--   • Agenda da agência: a chamada aberta aparece como evento do período (montado pela tela a partir de
--     agency_brand_calls, sem linha em calendar_events: o colaborador não deve ver e o alvo 'all' não cabe em linhas
--     por agência). Fica fora do feed .ics.
--   • Privacidade/RLS: brand_calls e alvos — só a própria marca; propostas — Adm da agência dona e a marca (só as
--     enviadas); creators da proposta — gestor+ da agência dona e a marca (enviadas); rodadas — Adm da agência (só as
--     enviadas) e a marca; interesses — gestor+ da agência e o próprio creator. Gestor, colaborador e creator nunca
--     leem valor (as RPCs mascaram). Todas as RPCs: search_path vazio, security definer, execute revogado de
--     public/anon; internas só service_role.
-- =============================================================================

-- 1) avisos: tudo o que já existia + os cinco da chamada; entidade 'brand_call' ----------------------------------------
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
  'brand_call_published', 'brand_call_interest', 'brand_call_negotiation', 'brand_call_decided', 'brand_call_review'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call'));

-- 2) tabelas ---------------------------------------------------------------------------------------------------------
-- nichos: até 10 etiquetas de 2 a 40 letras, sem espaço nas pontas, sem repetir
create or replace function public.brand_call_niches_valid(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and cardinality(p) <= 10
     and not exists (select 1 from unnest(p) x where x is null or char_length(x) not between 2 and 40 or x <> btrim(x))
     and (select count(distinct lower(x)) from unnest(p) x) = cardinality(p)
$$;
revoke execute on function public.brand_call_niches_valid(text[]) from public, anon;
grant execute on function public.brand_call_niches_valid(text[]) to authenticated, service_role;

create table if not exists public.brand_calls (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null constraint brand_calls_brand_fk references public.brands (id) on delete cascade,
  title text not null,
  objective text,
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  location text not null default '',
  target_audience text not null default '',
  target_age_bands text[] not null default '{}',
  target_states text[] not null default '{}',
  region_note text not null default '',
  deliverables jsonb not null default '[]'::jsonb,
  creators_wanted smallint not null default 1,
  niches text[] not null default '{}',
  networks text[] not null default '{}',
  budget_cents bigint,
  budget_display text not null default 'open',
  respond_by timestamptz,
  audience text not null default 'my_agencies',
  status text not null default 'draft',
  closed_reason text,
  approval_status text not null default 'none',
  approval_requested_by uuid constraint brand_calls_approval_by_fk references auth.users (id) on delete set null,
  approval_requested_label text not null default '',
  approval_requested_at timestamptz,
  approval_request_note text not null default '',
  approval_decided_label text not null default '',
  approval_decided_at timestamptz,
  approval_decision_note text not null default '',
  published_at timestamptz,
  published_by uuid constraint brand_calls_published_by_fk references auth.users (id) on delete set null,
  decided_at timestamptz,
  decided_by uuid constraint brand_calls_decided_by_fk references auth.users (id) on delete set null,
  decision_note text not null default '',
  created_by uuid constraint brand_calls_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_calls_title_check check (char_length(title) between 3 and 120 and title = btrim(title)),
  constraint brand_calls_objective_check check (objective is null or objective in ('awareness', 'engagement', 'conversion', 'launch', 'content', 'event', 'other')),
  constraint brand_calls_texts_check check (char_length(description) <= 2000 and char_length(location) <= 200 and char_length(decision_note) <= 500
    and char_length(approval_request_note) <= 500 and char_length(approval_decision_note) <= 500
    and char_length(approval_requested_label) <= 80 and char_length(approval_decided_label) <= 80),
  constraint brand_calls_public_check check (char_length(target_audience) <= 500 and char_length(region_note) <= 200
    and target_age_bands <@ array['13-17','18-24','25-34','35-44','45-54','55+']::text[] and cardinality(target_states) <= 27),
  constraint brand_calls_range_check check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint brand_calls_deliverables_check check (public.campaign_deliverables_valid(deliverables)),
  constraint brand_calls_creators_check check (creators_wanted between 1 and 50),
  constraint brand_calls_niches_check check (public.brand_call_niches_valid(niches)),
  constraint brand_calls_networks_check check (cardinality(networks) <= 11
    and networks <@ array['instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other']::text[]),
  constraint brand_calls_budget_check check ((budget_cents is null or budget_cents between 1 and 10000000000)
    and budget_display in ('exact', 'up_to', 'open') and (budget_display = 'open' or budget_cents is not null)),
  constraint brand_calls_audience_check check (audience in ('my_agencies', 'selected', 'all')),
  constraint brand_calls_status_check check (status in ('draft', 'open', 'closed', 'contracted', 'cancelled')),
  constraint brand_calls_closed_check check ((status in ('draft', 'open')) = (closed_reason is null)
    and (closed_reason is null or closed_reason in ('deadline', 'decision'))),
  constraint brand_calls_published_check check (status in ('draft', 'cancelled') or published_at is not null),
  constraint brand_calls_ready_check check (status in ('draft', 'cancelled')
    or (respond_by is not null and cardinality(networks) >= 1 and jsonb_array_length(deliverables) >= 1)),
  constraint brand_calls_approval_check check (approval_status in ('none', 'pending', 'returned') and (approval_status = 'none' or status = 'draft'))
);
create index if not exists brand_calls_brand_idx on public.brand_calls (brand_id, created_at desc);
create index if not exists brand_calls_open_idx on public.brand_calls (respond_by) where status = 'open';

-- agências escolhidas (alvo 'selected')
create table if not exists public.brand_call_targets (
  call_id uuid not null constraint brand_call_targets_call_fk references public.brand_calls (id) on delete cascade,
  agency_id uuid not null constraint brand_call_targets_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint brand_call_targets_brand_fk references public.brands (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint brand_call_targets_pk primary key (call_id, agency_id)
);
create index if not exists brand_call_targets_agency_idx on public.brand_call_targets (agency_id);

-- "Tenho interesse" do creator (um por chamada)
create table if not exists public.brand_call_interests (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null constraint brand_call_interests_call_fk references public.brand_calls (id) on delete cascade,
  agency_id uuid not null constraint brand_call_interests_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint brand_call_interests_talent_fk references public.talent_profiles (id) on delete cascade,
  message text not null default '',
  created_by uuid constraint brand_call_interests_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_call_interests_uq unique (call_id, talent_id),
  constraint brand_call_interests_message_check check (char_length(message) <= 300)
);
create index if not exists brand_call_interests_agency_idx on public.brand_call_interests (agency_id, call_id);

create table if not exists public.brand_call_proposals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null constraint brand_call_proposals_call_fk references public.brand_calls (id) on delete cascade,
  brand_id uuid not null constraint brand_call_proposals_brand_fk references public.brands (id) on delete cascade,
  agency_id uuid not null constraint brand_call_proposals_agency_fk references public.agencies (id) on delete cascade,
  status text not null default 'draft',
  awaiting text,
  amount_cents bigint,
  deliverables jsonb not null default '[]'::jsonb,
  deliver_by date,
  note text not null default '',
  rounds int not null default 0,
  sent_at timestamptz,
  sent_by uuid constraint brand_call_proposals_sent_by_fk references auth.users (id) on delete set null,
  agreed_cents bigint,
  agreed_deliverables jsonb,
  agreed_deliver_by date,
  agreed_side text,
  agreed_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  request_id uuid constraint brand_call_proposals_request_fk references public.campaign_requests (id) on delete set null,
  created_by uuid constraint brand_call_proposals_created_by_fk references auth.users (id) on delete set null,
  updated_by uuid constraint brand_call_proposals_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_call_proposals_status_check check (status in ('draft', 'open', 'agreed', 'declined', 'closed')),
  constraint brand_call_proposals_awaiting_check check ((status = 'open') = (awaiting is not null) and (awaiting is null or awaiting in ('agency', 'brand'))),
  constraint brand_call_proposals_amount_check check ((amount_cents is null or amount_cents between 1 and 10000000000)
    and (agreed_cents is null or agreed_cents between 1 and 10000000000)),
  constraint brand_call_proposals_deliverables_check check (public.campaign_deliverables_valid(deliverables)
    and (agreed_deliverables is null or public.campaign_deliverables_valid(agreed_deliverables))),
  constraint brand_call_proposals_note_check check (char_length(note) <= 1000),
  constraint brand_call_proposals_sent_check check ((status in ('draft', 'closed') or sent_at is not null) and (sent_at is null or amount_cents is not null)),
  constraint brand_call_proposals_agreed_check check ((status = 'agreed') = (agreed_at is not null)
    and (status <> 'agreed' or (agreed_cents is not null and agreed_deliverables is not null and agreed_side in ('agency', 'brand')))),
  constraint brand_call_proposals_end_check check ((status in ('declined', 'closed')) = (end_reason is not null)
    and (end_reason is null or end_reason in ('declined_brand', 'declined_agency', 'decided', 'cancelled', 'discarded')))
);
create unique index if not exists brand_call_proposals_live_uq on public.brand_call_proposals (call_id, agency_id) where status in ('draft', 'open');
create index if not exists brand_call_proposals_call_idx on public.brand_call_proposals (call_id, sent_at);
create index if not exists brand_call_proposals_agency_idx on public.brand_call_proposals (agency_id, updated_at desc);
create index if not exists brand_call_proposals_request_idx on public.brand_call_proposals (request_id) where request_id is not null;

-- creators da proposta: entregas de cada um e link do media kit (opcional)
create table if not exists public.brand_call_proposal_talents (
  proposal_id uuid not null constraint brand_call_proposal_talents_proposal_fk references public.brand_call_proposals (id) on delete cascade,
  call_id uuid not null constraint brand_call_proposal_talents_call_fk references public.brand_calls (id) on delete cascade,
  agency_id uuid not null constraint brand_call_proposal_talents_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint brand_call_proposal_talents_brand_fk references public.brands (id) on delete cascade,
  talent_id uuid not null constraint brand_call_proposal_talents_talent_fk references public.talent_profiles (id) on delete cascade,
  position smallint not null default 1,
  deliverables jsonb not null default '[]'::jsonb,
  media_kit_url text not null default '',
  created_at timestamptz not null default now(),
  constraint brand_call_proposal_talents_pk primary key (proposal_id, talent_id),
  constraint brand_call_proposal_talents_position_check check (position between 1 and 50),
  constraint brand_call_proposal_talents_deliverables_check check (public.campaign_deliverables_valid(deliverables) and jsonb_array_length(deliverables) >= 1),
  constraint brand_call_proposal_talents_kit_check check (media_kit_url = '' or (char_length(media_kit_url) <= 500 and media_kit_url ~ '^https://[^\s<>"]{3,}$'))
);
create index if not exists brand_call_proposal_talents_talent_idx on public.brand_call_proposal_talents (talent_id);

create table if not exists public.brand_call_rounds (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null constraint brand_call_rounds_proposal_fk references public.brand_call_proposals (id) on delete cascade,
  call_id uuid not null constraint brand_call_rounds_call_fk references public.brand_calls (id) on delete cascade,
  brand_id uuid not null constraint brand_call_rounds_brand_fk references public.brands (id) on delete cascade,
  agency_id uuid not null constraint brand_call_rounds_agency_fk references public.agencies (id) on delete cascade,
  seq int not null,
  side text not null,
  action text not null,
  amount_cents bigint,
  deliverables jsonb,
  deliver_by date,
  note text not null default '',
  state text not null default 'sent',
  actor_id uuid constraint brand_call_rounds_actor_fk references auth.users (id) on delete set null,
  actor_label text not null default '',
  reviewed_by uuid constraint brand_call_rounds_reviewed_by_fk references auth.users (id) on delete set null,
  reviewed_label text not null default '',
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  constraint brand_call_rounds_seq_uq unique (proposal_id, seq),
  constraint brand_call_rounds_side_check check (side in ('brand', 'agency')),
  constraint brand_call_rounds_action_check check (action in ('propose', 'counter', 'accept', 'decline') and (action <> 'propose' or side = 'agency')),
  constraint brand_call_rounds_amount_check check ((action = 'decline') = (amount_cents is null) and (amount_cents is null or amount_cents between 1 and 10000000000)),
  constraint brand_call_rounds_deliverables_check check ((action = 'decline') = (deliverables is null)
    and (deliverables is null or (public.campaign_deliverables_valid(deliverables) and jsonb_array_length(deliverables) >= 1))),
  constraint brand_call_rounds_texts_check check (char_length(note) <= 500 and char_length(review_note) <= 500
    and char_length(actor_label) <= 80 and char_length(reviewed_label) <= 80),
  constraint brand_call_rounds_state_check check (state in ('sent', 'pending_owner', 'returned') and (state = 'sent' or side = 'brand'))
);
create index if not exists brand_call_rounds_proposal_idx on public.brand_call_rounds (proposal_id, seq);
create index if not exists brand_call_rounds_pending_idx on public.brand_call_rounds (brand_id) where state = 'pending_owner';

-- origem da campanha nascida de um acordo de chamada
alter table public.campaign_requests add column if not exists brand_call_id uuid
  constraint campaign_requests_brand_call_fk references public.brand_calls (id) on delete set null;
create index if not exists campaign_requests_brand_call_idx on public.campaign_requests (brand_call_id) where brand_call_id is not null;

do $$
declare t text;
begin
  foreach t in array array['brand_calls', 'brand_call_targets', 'brand_call_interests', 'brand_call_proposals', 'brand_call_proposal_talents', 'brand_call_rounds'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
  end loop;
  drop trigger if exists trg_brand_calls_updated on public.brand_calls;
  create trigger trg_brand_calls_updated before update on public.brand_calls for each row execute function public.set_updated_at();
  drop trigger if exists trg_brand_call_proposals_updated on public.brand_call_proposals;
  create trigger trg_brand_call_proposals_updated before update on public.brand_call_proposals for each row execute function public.set_updated_at();
  drop trigger if exists trg_brand_call_interests_updated on public.brand_call_interests;
  create trigger trg_brand_call_interests_updated before update on public.brand_call_interests for each row execute function public.set_updated_at();
end $$;

-- 3) quem lê ----------------------------------------------------------------------------------------------------------
drop policy if exists brand_calls_select_brand on public.brand_calls;
create policy brand_calls_select_brand on public.brand_calls for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));
drop policy if exists brand_call_targets_select_brand on public.brand_call_targets;
create policy brand_call_targets_select_brand on public.brand_call_targets for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

drop policy if exists brand_call_interests_select_agency on public.brand_call_interests;
create policy brand_call_interests_select_agency on public.brand_call_interests for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists brand_call_interests_select_talent on public.brand_call_interests;
create policy brand_call_interests_select_talent on public.brand_call_interests for select to authenticated
  using (talent_id = (select public.my_talent_id()));

drop policy if exists brand_call_proposals_select_agency on public.brand_call_proposals;
create policy brand_call_proposals_select_agency on public.brand_call_proposals for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists brand_call_proposals_select_brand on public.brand_call_proposals;
create policy brand_call_proposals_select_brand on public.brand_call_proposals for select to authenticated
  using (sent_at is not null and brand_id = any ((select public.my_brand_ids(false))::uuid[]));

drop policy if exists brand_call_proposal_talents_select_agency on public.brand_call_proposal_talents;
create policy brand_call_proposal_talents_select_agency on public.brand_call_proposal_talents for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
drop policy if exists brand_call_proposal_talents_select_brand on public.brand_call_proposal_talents;
create policy brand_call_proposal_talents_select_brand on public.brand_call_proposal_talents for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and exists (select 1 from public.brand_call_proposals q where q.id = proposal_id and q.sent_at is not null));

drop policy if exists brand_call_rounds_select_agency on public.brand_call_rounds;
create policy brand_call_rounds_select_agency on public.brand_call_rounds for select to authenticated
  using (state = 'sent' and agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists brand_call_rounds_select_brand on public.brand_call_rounds;
create policy brand_call_rounds_select_brand on public.brand_call_rounds for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- 4) auxiliares internas ------------------------------------------------------------------------------------------------
-- a agência está no alvo desta chamada publicada? (ou já mandou proposta)
create or replace function public.brand_call_agency_ok(p_call uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.brand_calls c join public.agencies a on a.id = p_agency and a.status = 'active'
                 where c.id = p_call and c.published_at is not null
                   and (c.audience = 'all'
                        or (c.audience = 'my_agencies' and exists (select 1 from public.agency_brands ab
                              where ab.agency_id = p_agency and ab.brand_id = c.brand_id and ab.status = 'active'))
                        or (c.audience = 'selected' and exists (select 1 from public.brand_call_targets g where g.call_id = c.id and g.agency_id = p_agency))
                        or exists (select 1 from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency and q.sent_at is not null)))
$$;
revoke execute on function public.brand_call_agency_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.brand_call_agency_ok(uuid, uuid) to service_role;

-- fim do período (meia-noite do dia seguinte, horário de Brasília: a marca não tem fuso próprio)
create or replace function public.brand_call_period_end(p_ends_on date)
returns timestamptz language sql immutable set search_path = '' as $$
  select ((p_ends_on + 1)::timestamp at time zone 'America/Sao_Paulo')
$$;
revoke execute on function public.brand_call_period_end(date) from public, anon, authenticated;
grant execute on function public.brand_call_period_end(date) to service_role;

-- entregas somadas por tipo e rede (até 100 por item, até 30 itens)
create or replace function public.brand_call_sum_deliverables(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind', k, 'quantity', least(100, q), 'network', n)) order by o), '[]'::jsonb)
  from (select e ->> 'kind' as k, nullif(e ->> 'network', '') as n, sum((e ->> 'quantity')::int) as q, min(i) as o
        from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality t(e, i) group by 1, 2 order by min(i) limit 30) s
$$;
revoke execute on function public.brand_call_sum_deliverables(jsonb) from public, anon, authenticated;
grant execute on function public.brand_call_sum_deliverables(jsonb) to service_role;

-- verba como a agência vê: só o Adm, e só na forma escolhida pela marca
create or replace function public.brand_call_budget_for_agency(p_call uuid, p_admin boolean)
returns bigint language sql stable security definer set search_path = '' as $$
  select case when p_admin and c.budget_display in ('exact', 'up_to') then c.budget_cents end from public.brand_calls c where c.id = p_call
$$;
revoke execute on function public.brand_call_budget_for_agency(uuid, boolean) from public, anon, authenticated;
grant execute on function public.brand_call_budget_for_agency(uuid, boolean) to service_role;

-- avisa as agências do alvo (dedupe por agência e pessoa)
create or replace function public.brand_call_notify_agencies(p_call uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; r record; v_brand text; v_count int := 0;
begin
  select * into c from public.brand_calls where id = p_call;
  if c.id is null or c.status <> 'open' then return 0; end if;
  select b.name into v_brand from public.brands b where b.id = c.brand_id;
  for r in select a.id from public.agencies a where a.status = 'active' and public.brand_call_agency_ok(c.id, a.id) loop
    v_count := v_count + public.inbox_notify_agency(r.id, 'manager', 'brand_call_published', '/agencia/oportunidades/pedidos/' || c.id::text,
      jsonb_build_object('title', left(c.title, 120), 'brand', left(coalesce(v_brand, ''), 120), 'date', public.sponsorship_local_stamp(c.respond_by, null)),
      'brand_call', c.id, 'bcall:' || c.id::text || ':' || r.id::text);
  end loop;
  return v_count;
end $$;
revoke execute on function public.brand_call_notify_agencies(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_notify_agencies(uuid) to service_role;

-- aviso de negociação: marca (todos ou só donos) ou Adms da agência. Nunca valor.
create or replace function public.brand_call_negotiation_notify(p_proposal uuid, p_to text, p_status text, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; v_title text; v_brand text; v_agency text; v_params jsonb;
begin
  select * into p from public.brand_call_proposals where id = p_proposal;
  if p.id is null then return; end if;
  select c.title into v_title from public.brand_calls c where c.id = p.call_id;
  select b.name into v_brand from public.brands b where b.id = p.brand_id;
  select a.name into v_agency from public.agencies a where a.id = p.agency_id;
  v_params := jsonb_build_object('title', left(coalesce(v_title, ''), 120), 'brand', left(coalesce(v_brand, ''), 120),
                                 'name', left(coalesce(v_agency, ''), 120), 'status', p_status);
  if p_to = 'agency' then
    perform public.inbox_notify_agency(p.agency_id, 'admin', 'brand_call_negotiation', '/agencia/oportunidades/pedidos/' || p.call_id::text,
      v_params, 'brand_call', p.call_id, p_dedupe);
  else
    perform public.inbox_notify_brand(p.brand_id, p_to = 'brand_owners', 'brand_call_negotiation', '/marca/oportunidades/chamadas/' || p.call_id::text,
      v_params, null, 'brand_call', p.call_id, p_dedupe);
  end if;
end $$;
revoke execute on function public.brand_call_negotiation_notify(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.brand_call_negotiation_notify(uuid, text, text, text) to service_role;

-- valor e entregas de uma rodada (lança invalid_input)
create or replace function public.brand_call_terms_check(p_amount bigint, p_deliverables jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > 10000000000 or p_deliverables is null
     or not public.campaign_deliverables_valid(p_deliverables) or jsonb_array_length(p_deliverables) < 1 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.brand_call_terms_check(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.brand_call_terms_check(bigint, jsonb) to service_role;

-- acordo: congela, cria a campanha da marca para a agência (vínculo por projeto se preciso) e avisa
create or replace function public.brand_call_agree(p_proposal uuid, p_side text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_request uuid; v_talent uuid; v_names text; v_agency text; v_notes text;
        r record; v_brand text;
begin
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  select * into c from public.brand_calls where id = p.call_id;
  update public.brand_call_proposals set status = 'agreed', awaiting = null, agreed_cents = amount_cents, agreed_deliverables = deliverables,
    agreed_deliver_by = deliver_by, agreed_side = p_side, agreed_at = now(), sent_at = coalesce(sent_at, now())
  where id = p.id returning * into p;
  -- vínculo: a campanha precisa de agency_brands; quem não atende a marca entra por projeto (arquivado, D18 intacta)
  insert into public.agency_brands (agency_id, brand_id, status) values (p.agency_id, p.brand_id, 'archived')
  on conflict (agency_id, brand_id) do nothing;
  select t.talent_id into v_talent from public.brand_call_proposal_talents t where t.proposal_id = p.id order by t.position limit 1;
  select string_agg(tp.display_name, ', ' order by t.position) into v_names
  from public.brand_call_proposal_talents t join public.talent_profiles tp on tp.id = t.talent_id where t.proposal_id = p.id;
  select a.name into v_agency from public.agencies a where a.id = p.agency_id;
  v_notes := left(concat_ws(E'\n',
    'Chamada da marca: ' || c.title || ' — proposta acordada com ' || coalesce(v_agency, ''),
    case when v_names is not null then 'Creators: ' || v_names end,
    case when p.agreed_deliver_by is not null then 'Prazo de entrega: ' || to_char(p.agreed_deliver_by, 'DD/MM/YYYY') end,
    case when p.note <> '' then 'Observações da agência: ' || p.note end,
    case when c.description <> '' then c.description end), 2000);
  begin
    insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, period_start, period_end, format, location, networks,
                                          deliverables, notes, target_audience, target_age_bands, target_states, region_note, brand_call_id)
    values (p.agency_id, p.brand_id, 'brand', coalesce(c.published_by, c.created_by), v_talent, left(c.title, 120), coalesce(c.objective, 'other'),
            c.starts_on, c.ends_on, case when c.location <> '' then 'in_person' end, c.location, c.networks, p.agreed_deliverables, v_notes,
            c.target_audience, c.target_age_bands, c.target_states, c.region_note, c.id)
    returning id into v_request;
  exception when check_violation or not_null_violation or foreign_key_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
  values (p.agency_id, p.brand_id, v_request, p.agreed_cents, p.agreed_cents, 'Chamada da marca — valor acordado', auth.uid())
  on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
    note = excluded.note, updated_by = excluded.updated_by;
  update public.brand_call_proposals set request_id = v_request where id = p.id;
  perform public.audit_log('brand_call.agree', 'brand_call', c.id::text, null,
    jsonb_build_object('brand_id', p.brand_id, 'agency_id', p.agency_id, 'proposal_id', p.id, 'side', p_side, 'request_id', v_request), null,
    case when p_side = 'agency' then public.talent_audit_actor('agency', p.agency_id) else 'brand'::public.actor_type end);
  perform public.brand_call_negotiation_notify(p.id, case when p_side = 'agency' then 'brand' else 'agency' end, 'agreed', 'bcall-agreed:' || p.id::text);
  -- creators da proposta vencedora: foram escolhidos (sem valor)
  select b.name into v_brand from public.brands b where b.id = p.brand_id;
  for r in select t.talent_id from public.brand_call_proposal_talents t where t.proposal_id = p.id loop
    perform public.inbox_notify(public.talent_user_id(r.talent_id), 'brand_call_decided', '/creator/escritorio/oportunidades',
      jsonb_build_object('title', left(c.title, 120), 'brand', left(coalesce(v_brand, ''), 120), 'status', 'chosen'),
      p.agency_id, 'brand_call', c.id, 'bcall-chosen:' || p.id::text || ':' || r.talent_id::text);
  end loop;
end $$;
revoke execute on function public.brand_call_agree(uuid, text) from public, anon, authenticated;
grant execute on function public.brand_call_agree(uuid, text) to service_role;

-- aplica uma rodada enviada (agência, dono da marca, ou aprovada pelo dono)
create or replace function public.brand_call_round_apply(p_round uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.brand_call_rounds%rowtype; p public.brand_call_proposals%rowtype; v_other text;
begin
  select * into r from public.brand_call_rounds where id = p_round;
  select * into p from public.brand_call_proposals where id = r.proposal_id for update;
  update public.brand_call_rounds set state = 'sent' where id = r.id;
  v_other := case when r.side = 'brand' then 'agency' else 'brand' end;
  if r.action = 'decline' then
    update public.brand_call_proposals set status = 'declined', awaiting = null, ended_at = now(), rounds = rounds + 1,
      end_reason = case when r.side = 'brand' then 'declined_brand' else 'declined_agency' end
    where id = p.id;
    perform public.brand_call_negotiation_notify(p.id, v_other, 'declined', 'bcall-round:' || r.id::text);
    return 'declined';
  end if;
  update public.brand_call_proposals set amount_cents = r.amount_cents, deliverables = r.deliverables, deliver_by = r.deliver_by,
    rounds = rounds + 1, sent_at = coalesce(sent_at, now()), status = 'open', awaiting = v_other
  where id = p.id;
  if r.action = 'accept' then
    perform public.brand_call_agree(p.id, r.side);
    return 'agreed';
  end if;
  perform public.brand_call_negotiation_notify(p.id, v_other, case when r.action = 'propose' then 'proposed' else 'countered' end, 'bcall-round:' || r.id::text);
  return 'open';
end $$;
revoke execute on function public.brand_call_round_apply(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_round_apply(uuid) to service_role;

-- encerra a chamada (decisão do dono): situação, propostas vivas e o desfecho para TODAS as agências que propuseram
create or replace function public.brand_call_close_out(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; r record; v_won boolean;
begin
  select * into c from public.brand_calls where id = p_id for update;
  update public.brand_calls set status = p_status, closed_reason = 'decision', decided_at = now(), decided_by = auth.uid(),
    decision_note = left(coalesce(p_note, ''), 500), approval_status = 'none'
  where id = p_id;
  update public.brand_call_proposals q set status = 'closed', awaiting = null, ended_at = now(),
    end_reason = case when p_status = 'cancelled' then 'cancelled' else 'decided' end
  where q.call_id = p_id and q.status in ('draft', 'open');
  perform public.audit_log('brand_call.decide', 'brand_call', p_id::text, jsonb_build_object('status', c.status),
    jsonb_build_object('brand_id', c.brand_id, 'status', p_status,
      'winners', (select coalesce(jsonb_agg(q.agency_id), '[]'::jsonb) from public.brand_call_proposals q where q.call_id = p_id and q.status = 'agreed')),
    nullif(btrim(coalesce(p_note, '')), ''), 'brand'::public.actor_type);
  for r in select distinct q.agency_id from public.brand_call_proposals q where q.call_id = p_id loop
    v_won := exists (select 1 from public.brand_call_proposals q where q.call_id = p_id and q.agency_id = r.agency_id and q.status = 'agreed');
    perform public.inbox_notify_agency(r.agency_id, 'manager', 'brand_call_decided', '/agencia/oportunidades/pedidos/' || p_id::text,
      jsonb_build_object('title', left(c.title, 120), 'brand', left(coalesce((select b.name from public.brands b where b.id = c.brand_id), ''), 120),
        'status', case when v_won then 'won' when p_status = 'cancelled' then 'cancelled' when p_status = 'contracted' then 'lost' else 'closed' end),
      'brand_call', p_id, 'bcall-decided:' || p_id::text || ':' || r.agency_id::text);
  end loop;
end $$;
revoke execute on function public.brand_call_close_out(uuid, text, text) from public, anon, authenticated;
grant execute on function public.brand_call_close_out(uuid, text, text) to service_role;

-- chamada pronta para publicar? (lança call_incomplete / invalid_date)
create or replace function public.brand_call_check_ready(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype;
begin
  select * into c from public.brand_calls where id = p_id;
  if c.respond_by is null or cardinality(c.networks) = 0 or jsonb_array_length(c.deliverables) = 0
     or (c.audience = 'selected' and not exists (select 1 from public.brand_call_targets g where g.call_id = c.id)) then
    raise exception 'call_incomplete' using errcode = '22023';
  end if;
  if c.respond_by <= now() or c.respond_by > public.brand_call_period_end(c.ends_on) then raise exception 'invalid_date' using errcode = '22023'; end if;
end $$;
revoke execute on function public.brand_call_check_ready(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_check_ready(uuid) to service_role;

-- publica (o dono, direto ou aprovando o pedido da equipe)
create or replace function public.brand_call_publish(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype;
begin
  perform public.brand_call_check_ready(p_id);
  update public.brand_calls set status = 'open', published_at = now(), published_by = auth.uid(), approval_status = 'none'
  where id = p_id returning * into c;
  perform public.audit_log('brand_call.publish', 'brand_call', p_id::text, null,
    jsonb_build_object('brand_id', c.brand_id, 'audience', c.audience, 'respond_by', c.respond_by), null, 'brand'::public.actor_type);
  perform public.brand_call_notify_agencies(p_id);
end $$;
revoke execute on function public.brand_call_publish(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_publish(uuid) to service_role;

-- 5) RPCs da marca --------------------------------------------------------------------------------------------------
-- criar/editar o rascunho (dono ou equipe). p_data: title, objective, description, starts_on, ends_on, location,
-- target_audience, target_age_bands[], target_states[], region_note, deliverables[], creators_wanted, niches[],
-- networks[], budget_cents, budget_display, respond_by, audience, agency_ids[]
create or replace function public.brand_call_save(p_brand uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role text; c public.brand_calls%rowtype; v_id uuid := p_id; v_start date; v_end date; v_respond timestamptz; v_budget bigint; v_creators int;
        v_networks text[]; v_niches text[]; v_agencies uuid[]; v_public jsonb; v_deliv jsonb; v_audience text; v_display text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_id is not null then
    select * into c from public.brand_calls where id = v_id and brand_id = p_brand for update;
    if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if c.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if v_role <> 'owner' and c.approval_status = 'pending' then raise exception 'awaiting_approval' using errcode = 'P0001'; end if;
  end if;
  begin
    v_start := nullif(btrim(coalesce(p_data ->> 'starts_on', '')), '')::date;
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_on', '')), '')::date, v_start);
    v_respond := nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz;
    v_budget := nullif(btrim(coalesce(p_data ->> 'budget_cents', '')), '')::bigint;
    v_creators := coalesce(nullif(btrim(coalesce(p_data ->> 'creators_wanted', '')), '')::int, 1);
    select coalesce(array_agg(distinct lower(btrim(x))), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
    select coalesce(array_agg(n order by o), '{}'::text[]) into v_niches from (
      select distinct on (lower(regexp_replace(btrim(x), '\s+', ' ', 'g'))) regexp_replace(btrim(x), '\s+', ' ', 'g') as n, o
      from jsonb_array_elements_text(coalesce(p_data -> 'niches', '[]'::jsonb)) with ordinality e(x, o) where btrim(x) <> ''
      order by lower(regexp_replace(btrim(x), '\s+', ' ', 'g')), o) s;
    select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_agencies from jsonb_array_elements_text(coalesce(p_data -> 'agency_ids', '[]'::jsonb)) x where btrim(x) <> '';
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_public := public.sponsorship_audience_clean(jsonb_strip_nulls(jsonb_build_object('target_audience', p_data -> 'target_audience',
    'target_age_bands', p_data -> 'target_age_bands', 'target_states', p_data -> 'target_states', 'region_note', p_data -> 'region_note')));
  v_deliv := coalesce(p_data -> 'deliverables', '[]'::jsonb);
  v_audience := coalesce(nullif(p_data ->> 'audience', ''), 'my_agencies');
  v_display := coalesce(nullif(p_data ->> 'budget_display', ''), case when v_budget is null then 'open' else 'exact' end);
  if v_start is null or v_audience not in ('my_agencies', 'selected', 'all') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_audience = 'selected' and exists (select 1 from unnest(v_agencies) g where not exists (select 1 from public.agencies a where a.id = g and a.status = 'active')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if v_id is null then
      insert into public.brand_calls (brand_id, title, objective, description, starts_on, ends_on, location, target_audience, target_age_bands, target_states,
                                      region_note, deliverables, creators_wanted, niches, networks, budget_cents, budget_display, respond_by, audience, created_by)
      values (p_brand, regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g'), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'description', '')), v_start, v_end, btrim(coalesce(p_data ->> 'location', '')),
              coalesce(v_public ->> 'target_audience', ''),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
              coalesce(v_public ->> 'region_note', ''), v_deliv, v_creators, v_niches, v_networks, v_budget, v_display, v_respond, v_audience, auth.uid())
      returning id into v_id;
    else
      update public.brand_calls set title = regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g'), objective = nullif(p_data ->> 'objective', ''),
        description = btrim(coalesce(p_data ->> 'description', '')), starts_on = v_start, ends_on = v_end, location = btrim(coalesce(p_data ->> 'location', '')),
        target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', ''), deliverables = v_deliv, creators_wanted = v_creators, niches = v_niches, networks = v_networks,
        budget_cents = v_budget, budget_display = v_display, respond_by = v_respond, audience = v_audience
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid_input' using errcode = '22023';
  end;
  delete from public.brand_call_targets g where g.call_id = v_id and (v_audience <> 'selected' or not (g.agency_id = any (v_agencies)));
  if v_audience = 'selected' then
    insert into public.brand_call_targets (call_id, agency_id, brand_id) select v_id, g, p_brand from unnest(v_agencies) g
    on conflict (call_id, agency_id) do nothing;
  end if;
  perform public.audit_log('brand_call.save', 'brand_call', v_id::text, null,
    jsonb_build_object('brand_id', p_brand, 'audience', v_audience, 'agencies', case when v_audience = 'selected' then to_jsonb(v_agencies) end), null,
    'brand'::public.actor_type);
  return v_id;
end $$;

-- publicar: o dono publica direto; a equipe pede ao dono (aviso brand_call_review). Devolve 'published' | 'pending_owner'
create or replace function public.brand_call_submit(p_id uuid, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p_id for update;
  v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if c.status <> 'draft' or c.approval_status = 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  perform public.brand_call_check_ready(p_id);
  if v_role = 'owner' then
    perform public.brand_call_publish(p_id);
    return 'published';
  end if;
  v_label := public.actor_label(null, c.brand_id);
  update public.brand_calls set approval_status = 'pending', approval_requested_by = auth.uid(), approval_requested_label = v_label,
    approval_requested_at = now(), approval_request_note = v_note, approval_decided_label = '', approval_decided_at = null, approval_decision_note = ''
  where id = p_id;
  perform public.audit_log('brand_call.ask_approval', 'brand_call', p_id::text, null, jsonb_build_object('brand_id', c.brand_id), nullif(v_note, ''), 'brand'::public.actor_type);
  perform public.inbox_notify_brand(c.brand_id, true, 'brand_call_review', '/marca/oportunidades/chamadas/' || p_id::text,
    jsonb_build_object('title', left(c.title, 120), 'name', v_label, 'status', 'requested'), null, 'brand_call', p_id, 'bcall-review:' || p_id::text || ':' || extract(epoch from now())::bigint::text);
  return 'pending_owner';
end $$;

-- o dono aprova (publica) ou devolve (nota de 3+ letras); quem pediu (ou o dono) retira o pedido
create or replace function public.brand_call_review(p_id uuid, p_decision text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p_id for update;
  v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_decision is null or p_decision not in ('approve', 'return', 'withdraw') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if c.status <> 'draft' or c.approval_status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_decision = 'withdraw' then
    if v_role <> 'owner' and c.approval_requested_by is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.brand_calls set approval_status = 'none' where id = p_id;
    return 'withdrawn';
  end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision = 'return' then
    if char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
    update public.brand_calls set approval_status = 'returned', approval_decided_label = public.actor_label(null, c.brand_id), approval_decided_at = now(),
      approval_decision_note = v_note
    where id = p_id;
  else
    perform public.brand_call_publish(p_id);
    update public.brand_calls set approval_decided_label = public.actor_label(null, c.brand_id), approval_decided_at = now(), approval_decision_note = v_note where id = p_id;
  end if;
  perform public.audit_log('brand_call.review', 'brand_call', p_id::text, null, jsonb_build_object('brand_id', c.brand_id, 'decision', p_decision), nullif(v_note, ''),
    'brand'::public.actor_type);
  if c.approval_requested_by is not null and c.approval_requested_by <> auth.uid() then
    perform public.inbox_notify(c.approval_requested_by, 'brand_call_review', '/marca/oportunidades/chamadas/' || p_id::text,
      jsonb_build_object('title', left(c.title, 120), 'status', case when p_decision = 'return' then 'returned' else 'approved' end), null, 'brand_call', p_id, null);
  end if;
  return case when p_decision = 'return' then 'returned' else 'published' end;
end $$;

-- a marca responde à proposta/contraproposta da agência: 'accept' | 'decline' | 'counter'
create or replace function public.brand_call_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_deliverables jsonb, p_deliver_by date, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_deliv jsonb; v_by date; v_round uuid; v_seq int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or p.sent_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(p.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.brand_calls where id = p.call_id;
  if p.status <> 'open' or p.awaiting <> 'brand' or c.decided_at is not null or c.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.brand_call_rounds r where r.proposal_id = p.id and r.state = 'pending_owner') then
    raise exception 'awaiting_approval' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    v_amount := p_amount_cents; v_deliv := p_deliverables; v_by := p_deliver_by;
    perform public.brand_call_terms_check(v_amount, v_deliv);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_deliv := p.deliverables; v_by := p.deliver_by;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = p.id;
  -- recusar não compromete dinheiro: a equipe recusa direto; aceitar e contrapropor da equipe esperam o dono
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, deliverables, deliver_by, note, state, actor_id, actor_label)
  values (p.id, p.call_id, p.brand_id, p.agency_id, v_seq, 'brand', p_action, v_amount, v_deliv, v_by, v_note,
          case when v_role = 'owner' or p_action = 'decline' then 'sent' else 'pending_owner' end, auth.uid(), public.actor_label(null, p.brand_id))
  returning id into v_round;
  perform public.audit_log('brand_call.brand_reply', 'brand_call', p.call_id::text, null,
    jsonb_build_object('brand_id', p.brand_id, 'agency_id', p.agency_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' or p_action = 'decline' then
    return public.brand_call_round_apply(v_round);
  end if;
  perform public.brand_call_negotiation_notify(p.id, 'brand_owners', 'approval', 'bcall-approval:' || v_round::text);
  return 'pending_owner';
end $$;

-- o dono aprova (envia à agência) ou devolve (nota de 3+ letras) a rodada da equipe
create or replace function public.brand_call_round_review(p_round uuid, p_decision text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.brand_call_rounds%rowtype; p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_note text := btrim(coalesce(p_note, '')); v_result text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.brand_call_rounds where id = p_round for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.brand_member_of(r.brand_id) <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approve', 'return') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'return' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into p from public.brand_call_proposals where id = r.proposal_id for update;
  select * into c from public.brand_calls where id = r.call_id;
  if r.state <> 'pending_owner' or p.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.brand_call_rounds set reviewed_by = auth.uid(), reviewed_label = public.actor_label(null, r.brand_id), reviewed_at = now(), review_note = v_note where id = r.id;
  if p_decision = 'return' then
    update public.brand_call_rounds set state = 'returned' where id = r.id;
    perform public.inbox_notify(r.actor_id, 'brand_call_negotiation', '/marca/oportunidades/chamadas/' || r.call_id::text,
      jsonb_build_object('title', left(c.title, 120), 'status', 'returned'), null, 'brand_call', r.call_id, 'bcall-review:' || r.id::text);
    v_result := 'returned';
  else
    if c.decided_at is not null or p.awaiting <> 'brand' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_result := public.brand_call_round_apply(r.id);
    if r.actor_id is distinct from auth.uid() then
      perform public.inbox_notify(r.actor_id, 'brand_call_negotiation', '/marca/oportunidades/chamadas/' || r.call_id::text,
        jsonb_build_object('title', left(c.title, 120), 'status', 'approved'), null, 'brand_call', r.call_id, 'bcall-review:' || r.id::text);
    end if;
  end if;
  perform public.audit_log('brand_call.round_review', 'brand_call', r.call_id::text, null,
    jsonb_build_object('brand_id', r.brand_id, 'round_id', r.id, 'decision', p_decision), nullif(v_note, ''), 'brand'::public.actor_type);
  return v_result;
end $$;

-- decisão (só o dono): 'contract' (1+ propostas: abertas na vez da marca ou já acordadas) | 'close' | 'cancel'
create or replace function public.brand_call_decide(p_id uuid, p_action text, p_proposals uuid[], p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_pick uuid[]; q record; v_round uuid; v_seq int; v_agreed int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p_id for update;
  v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('contract', 'close', 'cancel') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if c.decided_at is not null or c.status not in ('draft', 'open', 'closed') or (c.status = 'draft' and p_action <> 'cancel') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select count(*) into v_agreed from public.brand_call_proposals x where x.call_id = p_id and x.status = 'agreed';
  if p_action = 'cancel' then
    if v_agreed > 0 then raise exception 'has_agreement' using errcode = 'P0001'; end if;
    perform public.brand_call_close_out(p_id, 'cancelled', v_note);
    return;
  end if;
  if p_action = 'contract' then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_pick from unnest(coalesce(p_proposals, '{}'::uuid[])) x;
    if cardinality(v_pick) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    for q in select x.* from public.brand_call_proposals x where x.id = any (v_pick) for update loop
      if q.call_id <> p_id then raise exception 'not_found' using errcode = 'P0002'; end if;
    end loop;
    if (select count(*) from public.brand_call_proposals x where x.id = any (v_pick) and x.call_id = p_id) <> cardinality(v_pick) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.brand_call_proposals x where x.id = any (v_pick)
               and not (x.status = 'agreed' or (x.status = 'open' and x.awaiting = 'brand'
                        and not exists (select 1 from public.brand_call_rounds r where r.proposal_id = x.id and r.state = 'pending_owner')))) then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    -- aceita, nas condições da última rodada da agência, cada escolhida que ainda não tinha acordo
    for q in select x.* from public.brand_call_proposals x where x.id = any (v_pick) and x.status = 'open' order by x.sent_at loop
      select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = q.id;
      insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, deliverables, deliver_by, note, state, actor_id, actor_label)
      values (q.id, q.call_id, q.brand_id, q.agency_id, v_seq, 'brand', 'accept', q.amount_cents, q.deliverables, q.deliver_by, v_note, 'sent', auth.uid(),
              public.actor_label(null, q.brand_id))
      returning id into v_round;
      perform public.brand_call_round_apply(v_round);
    end loop;
    perform public.brand_call_close_out(p_id, 'contracted', v_note);
    return;
  end if;
  -- encerrar: com acordo vira contratada
  perform public.brand_call_close_out(p_id, case when v_agreed > 0 then 'contracted' else 'closed' end, v_note);
end $$;

-- prazo para propostas vencido: encerra (cron diário). A marca ainda escolhe as vencedoras depois.
create or replace function public.brand_call_deadline_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.brand_calls set status = 'closed', closed_reason = 'deadline' where status = 'open' and respond_by < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.brand_call_deadline_scan() from public, anon, authenticated;
grant execute on function public.brand_call_deadline_scan() to service_role;

-- 6) RPCs da agência --------------------------------------------------------------------------------------------------
-- montar/editar o rascunho da proposta (gestor+; valor só o Adm). p_data: talents [{talent_id, deliverables[],
-- media_kit_url}], deliver_by, note, amount_cents
create or replace function public.agency_brand_call_proposal_save(p_call uuid, p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; p public.brand_call_proposals%rowtype; v_admin boolean; e jsonb; v_pos int := 0; v_talent uuid; v_kit text;
        v_all jsonb := '[]'::jsonb; v_amount bigint; v_by date; v_note text; v_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'talents') <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') or not public.brand_call_agency_ok(p_call, p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  select * into c from public.brand_calls where id = p_call for update;
  if c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if c.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.brand_call_proposals x where x.call_id = p_call and x.agency_id = p_agency and x.status = 'agreed') then
    raise exception 'already_agreed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.brand_call_proposals x where x.call_id = p_call and x.agency_id = p_agency and x.status = 'open') then
    raise exception 'already_negotiating' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_data -> 'talents') not between 1 and 50 then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_amount := nullif(btrim(coalesce(p_data ->> 'amount_cents', '')), '')::bigint;
    v_by := nullif(btrim(coalesce(p_data ->> 'deliver_by', '')), '')::date;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_note := btrim(coalesce(p_data ->> 'note', ''));
  for e in select value from jsonb_array_elements(p_data -> 'talents') loop
    begin
      v_talent := (e ->> 'talent_id')::uuid;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    if v_talent is null or v_talent = any (v_ids) then raise exception 'invalid_input' using errcode = '22023'; end if;
    if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    -- só creators liberados para marcas (consentimento vigente + liberado no catálogo)
    if not public.talent_brand_card_ok(v_talent, p_agency) then raise exception 'consent_required' using errcode = 'P0001'; end if;
    if jsonb_typeof(e -> 'deliverables') <> 'array' or not public.campaign_deliverables_valid(e -> 'deliverables') or jsonb_array_length(e -> 'deliverables') < 1 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_ids := v_ids || v_talent;
    v_all := v_all || (e -> 'deliverables');
  end loop;
  select * into p from public.brand_call_proposals x where x.call_id = p_call and x.agency_id = p_agency and x.status = 'draft' for update;
  begin
    if p.id is null then
      insert into public.brand_call_proposals (call_id, brand_id, agency_id, status, amount_cents, deliverables, deliver_by, note, created_by, updated_by)
      values (p_call, c.brand_id, p_agency, 'draft', case when v_admin then v_amount end, public.brand_call_sum_deliverables(v_all), v_by, v_note, auth.uid(), auth.uid())
      returning * into p;
    else
      update public.brand_call_proposals set amount_cents = case when v_admin then v_amount else amount_cents end,
        deliverables = public.brand_call_sum_deliverables(v_all), deliver_by = v_by, note = v_note, updated_by = auth.uid()
      where id = p.id returning * into p;
    end if;
    delete from public.brand_call_proposal_talents t where t.proposal_id = p.id;
    for e in select value from jsonb_array_elements(p_data -> 'talents') loop
      v_pos := v_pos + 1;
      v_kit := btrim(coalesce(e ->> 'media_kit_url', ''));
      insert into public.brand_call_proposal_talents (proposal_id, call_id, agency_id, brand_id, talent_id, position, deliverables, media_kit_url)
      values (p.id, p_call, p_agency, c.brand_id, (e ->> 'talent_id')::uuid, v_pos, e -> 'deliverables', v_kit);
    end loop;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('brand_call.proposal_save', 'brand_call', p_call::text, null,
    jsonb_build_object('agency_id', p_agency, 'proposal_id', p.id, 'talents', to_jsonb(v_ids)), null, public.talent_audit_actor('agency', p_agency));
  return p.id;
end $$;

-- enviar o rascunho à marca (só o Adm; precisa de valor)
create or replace function public.agency_brand_call_proposal_send(p_proposal uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_round uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or not public.agency_can(p.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p.call_id for update;
  if p.status <> 'draft' or c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if c.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  if p.amount_cents is null then raise exception 'amount_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.brand_call_proposal_talents t where t.proposal_id = p.id) or jsonb_array_length(p.deliverables) = 0 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- creators que perderam a liberação depois do rascunho: não vão
  if exists (select 1 from public.brand_call_proposal_talents t where t.proposal_id = p.id and not public.talent_brand_card_ok(t.talent_id, p.agency_id)) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, deliverables, deliver_by, note, state, actor_id, actor_label)
  values (p.id, p.call_id, p.brand_id, p.agency_id, 1, 'agency', 'propose', p.amount_cents, p.deliverables, p.deliver_by, left(p.note, 500), 'sent', auth.uid(),
          public.actor_label(p.agency_id, null))
  returning id into v_round;
  update public.brand_call_proposals set sent_by = auth.uid() where id = p.id;
  perform public.audit_log('brand_call.proposal_send', 'brand_call', p.call_id::text, null, jsonb_build_object('agency_id', p.agency_id, 'proposal_id', p.id), null,
    public.talent_audit_actor('agency', p.agency_id));
  return public.brand_call_round_apply(v_round);
end $$;

-- descartar o rascunho (gestor+)
create or replace function public.agency_brand_call_proposal_discard(p_proposal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or not public.agency_can(p.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.brand_call_proposals set status = 'closed', ended_at = now(), end_reason = 'discarded', updated_by = auth.uid() where id = p.id;
end $$;

-- a agência (só Adm) responde à contraproposta da marca: aceitar, recusar (nota 3+) ou contrapropor
create or replace function public.agency_brand_call_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_deliverables jsonb, p_deliver_by date, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_note text := btrim(coalesce(p_note, '')); v_amount bigint; v_deliv jsonb; v_by date;
        v_round uuid; v_seq int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  if p.id is null or p.sent_at is null or not public.agency_can(p.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_action = 'decline' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into c from public.brand_calls where id = p.call_id;
  if p.status <> 'open' or p.awaiting <> 'agency' or c.decided_at is not null or c.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    v_amount := p_amount_cents; v_deliv := p_deliverables; v_by := p_deliver_by;
    perform public.brand_call_terms_check(v_amount, v_deliv);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_deliv := p.deliverables; v_by := p.deliver_by;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = p.id;
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, deliverables, deliver_by, note, state, actor_id, actor_label)
  values (p.id, p.call_id, p.brand_id, p.agency_id, v_seq, 'agency', p_action, v_amount, v_deliv, v_by, v_note, 'sent', auth.uid(), public.actor_label(p.agency_id, null))
  returning id into v_round;
  perform public.audit_log('brand_call.agency_reply', 'brand_call', p.call_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), public.talent_audit_actor('agency', p.agency_id));
  return public.brand_call_round_apply(v_round);
end $$;

-- 7) creator: "Tenho interesse" (mensagem curta; atualiza se já tinha) ------------------------------------------------
create or replace function public.talent_brand_call_interest(p_call uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_talent uuid; v_agency uuid; c public.brand_calls%rowtype; v_msg text := btrim(coalesce(p_message, '')); v_name text; v_new boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  select t.agency_id, t.display_name into v_agency, v_name from public.talent_profiles t where t.id = v_talent and t.archived_at is null;
  if v_agency is null or not public.brand_call_agency_ok(p_call, v_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(v_msg) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.brand_calls where id = p_call;
  if c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if c.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  v_new := not exists (select 1 from public.brand_call_interests i where i.call_id = p_call and i.talent_id = v_talent);
  insert into public.brand_call_interests (call_id, agency_id, talent_id, message, created_by)
  values (p_call, v_agency, v_talent, v_msg, auth.uid())
  on conflict (call_id, talent_id) do update set message = excluded.message;
  perform public.audit_log('brand_call.interest', 'brand_call', p_call::text, null, jsonb_build_object('agency_id', v_agency, 'talent_id', v_talent), nullif(v_msg, ''),
    public.talent_audit_actor('talent', v_agency));
  if v_new then
    perform public.inbox_notify_agency(v_agency, 'manager', 'brand_call_interest', '/agencia/oportunidades/pedidos/' || p_call::text,
      jsonb_build_object('title', left(c.title, 120), 'talent', left(coalesce(v_name, ''), 120)), 'brand_call', p_call,
      'bcall-interest:' || p_call::text || ':' || v_talent::text);
  end if;
end $$;

-- 8) leituras -------------------------------------------------------------------------------------------------------
-- chamada em json (sem valor; o valor entra à parte conforme quem lê)
create or replace function public.brand_call_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'brand_id', c.brand_id, 'brand_name', b.name, 'brand_logo_url', b.logo_url, 'title', c.title, 'objective', c.objective,
    'description', c.description, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'location', c.location,
    'public', jsonb_build_object('target_audience', c.target_audience, 'target_age_bands', to_jsonb(c.target_age_bands),
                                 'target_states', to_jsonb(c.target_states), 'region_note', c.region_note),
    'deliverables', c.deliverables, 'creators_wanted', c.creators_wanted, 'niches', to_jsonb(c.niches), 'networks', to_jsonb(c.networks),
    'budget_display', c.budget_display, 'respond_by', c.respond_by, 'status', c.status, 'closed_reason', c.closed_reason,
    'published_at', c.published_at, 'decided_at', c.decided_at, 'decision_note', c.decision_note, 'created_at', c.created_at)
  from public.brand_calls c join public.brands b on b.id = c.brand_id where c.id = p_id
$$;
revoke execute on function public.brand_call_json(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_json(uuid) to service_role;

-- rodadas (interna): p_values = com valor; p_sent_only = só o que a agência pode ver
create or replace function public.brand_call_rounds_json(p_proposal uuid, p_values boolean, p_sent_only boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
      'amount_cents', case when p_values then r.amount_cents end, 'deliverables', r.deliverables, 'deliver_by', r.deliver_by, 'note', r.note, 'state', r.state,
      'actor_label', r.actor_label, 'created_at', r.created_at, 'reviewed_label', r.reviewed_label, 'reviewed_at', r.reviewed_at,
      'review_note', r.review_note) order by r.seq), '[]'::jsonb)
  from public.brand_call_rounds r where r.proposal_id = p_proposal and (not p_sent_only or r.state = 'sent')
$$;
revoke execute on function public.brand_call_rounds_json(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.brand_call_rounds_json(uuid, boolean, boolean) to service_role;

-- creators de uma proposta (interna): p_card = cartão autorizado (marca) em vez do nome do casting
create or replace function public.brand_call_proposal_talents_json(p_proposal uuid, p_card boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('talent_id', t.talent_id, 'position', t.position, 'deliverables', t.deliverables, 'media_kit_url', t.media_kit_url,
      'card', case when p_card then public.talent_brand_card(t.talent_id, t.agency_id)
                   else jsonb_build_object('id', tp.id, 'name', tp.display_name) end) order by t.position), '[]'::jsonb)
  from public.brand_call_proposal_talents t join public.talent_profiles tp on tp.id = t.talent_id where t.proposal_id = p_proposal
$$;
revoke execute on function public.brand_call_proposal_talents_json(uuid, boolean) from public, anon, authenticated;
grant execute on function public.brand_call_proposal_talents_json(uuid, boolean) to service_role;

-- marca: as próprias chamadas com o resumo das propostas recebidas (só as enviadas)
create or replace function public.brand_calls_list(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(public.brand_call_json(c.id) || jsonb_build_object('budget_cents', c.budget_cents, 'audience', c.audience,
      'approval_status', c.approval_status,
      'proposals', (select count(*) from public.brand_call_proposals q where q.call_id = c.id and q.sent_at is not null),
      'awaiting_brand', (select count(*) from public.brand_call_proposals q where q.call_id = c.id and q.status = 'open' and q.awaiting = 'brand'),
      'pending_owner', (select count(*) from public.brand_call_rounds r where r.call_id = c.id and r.state = 'pending_owner'),
      'agreed', (select count(*) from public.brand_call_proposals q where q.call_id = c.id and q.status = 'agreed'),
      'request_ids', (select coalesce(jsonb_agg(q.request_id), '[]'::jsonb) from public.brand_call_proposals q where q.call_id = c.id and q.request_id is not null))
    order by (c.status in ('draft', 'open')) desc, c.created_at desc), '[]'::jsonb)
    from public.brand_calls c where c.brand_id = p_brand);
end $$;

-- marca: a chamada inteira (alvo, propostas enviadas com creators, rodadas e o papel de quem lê)
create or replace function public.brand_call_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.brand_calls where id = p_id;
  v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'role', v_role,
    'call', public.brand_call_json(c.id) || jsonb_build_object('budget_cents', c.budget_cents, 'audience', c.audience, 'approval_status', c.approval_status,
      'approval_requested_label', c.approval_requested_label, 'approval_requested_at', c.approval_requested_at, 'approval_request_note', c.approval_request_note,
      'approval_requested_by_me', c.approval_requested_by = auth.uid(), 'approval_decided_label', c.approval_decided_label,
      'approval_decided_at', c.approval_decided_at, 'approval_decision_note', c.approval_decision_note),
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.name), '[]'::jsonb)
                from public.brand_call_targets g join public.agencies a on a.id = g.agency_id where g.call_id = c.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'agency_id', q.agency_id, 'agency_name', a.name, 'status', q.status, 'awaiting', q.awaiting,
        'amount_cents', q.amount_cents, 'deliverables', q.deliverables, 'deliver_by', q.deliver_by, 'note', q.note, 'rounds', q.rounds, 'sent_at', q.sent_at,
        'agreed_cents', q.agreed_cents, 'agreed_deliverables', q.agreed_deliverables, 'agreed_deliver_by', q.agreed_deliver_by, 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'request_id', q.request_id,
        'pending_owner', exists (select 1 from public.brand_call_rounds r where r.proposal_id = q.id and r.state = 'pending_owner'),
        'talents', public.brand_call_proposal_talents_json(q.id, true),
        'history', public.brand_call_rounds_json(q.id, true, false))
      order by (q.status = 'agreed') desc, (q.status = 'open') desc, q.sent_at), '[]'::jsonb)
      from public.brand_call_proposals q join public.agencies a on a.id = q.agency_id where q.call_id = c.id and q.sent_at is not null));
end $$;

-- marca: agências ativas que podem ser escolhidas (nome), marcando a que já atende
create or replace function public.brand_call_agency_options(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name,
      'serves', exists (select 1 from public.agency_brands ab where ab.agency_id = a.id and ab.brand_id = p_brand and ab.status = 'active'))
    order by a.name), '[]'::jsonb)
    from public.agencies a where a.status = 'active');
end $$;

-- agência (gestor+): as chamadas do alvo, situação como a agência vê e a própria proposta. Verba só para o Adm.
-- situação: open | expired (prazo passou) | won (acordo) | lost (outra venceu) | closed | cancelled
create or replace function public.agency_brand_calls(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  return (select coalesce(jsonb_agg(public.brand_call_json(c.id) || jsonb_build_object(
      'budget_cents', public.brand_call_budget_for_agency(c.id, v_admin),
      'view_status', case when c.status = 'cancelled' then 'cancelled'
                          when exists (select 1 from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency and q.status = 'agreed') then 'won'
                          when c.status = 'contracted' then 'lost'
                          when c.status = 'closed' then 'closed'
                          when c.respond_by < now() then 'expired' else 'open' end,
      'interests', (select count(*) from public.brand_call_interests i where i.call_id = c.id and i.agency_id = p_agency),
      'proposal', (select jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting)
                   from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency
                   order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc limit 1))
    order by (c.status = 'open' and c.respond_by >= now()) desc, c.respond_by), '[]'::jsonb)
    from public.brand_calls c where c.status <> 'draft' and public.brand_call_agency_ok(c.id, p_agency));
end $$;

-- agência: a chamada, as propostas da própria agência (rodadas enviadas; valor só Adm), os interessados e os creators
-- que podem entrar (liberados para marcas)
create or replace function public.agency_brand_call_detail(p_id uuid, p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') or not public.brand_call_agency_ok(p_id, p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from public.brand_calls where id = p_id;
  v_admin := public.agency_can(p_agency, 'admin');
  return jsonb_build_object(
    'can_values', v_admin,
    'call', public.brand_call_json(c.id) || jsonb_build_object('budget_cents', public.brand_call_budget_for_agency(c.id, v_admin)),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting,
        'amount_cents', case when v_admin then q.amount_cents end, 'has_amount', q.amount_cents is not null, 'deliverables', q.deliverables,
        'deliver_by', q.deliver_by, 'note', q.note, 'rounds', q.rounds, 'sent_at', q.sent_at,
        'agreed_cents', case when v_admin then q.agreed_cents end, 'agreed_deliverables', q.agreed_deliverables, 'agreed_deliver_by', q.agreed_deliver_by,
        'agreed_side', q.agreed_side, 'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason,
        'talents', public.brand_call_proposal_talents_json(q.id, false),
        'history', public.brand_call_rounds_json(q.id, v_admin, true))
      order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc), '[]'::jsonb)
      from public.brand_call_proposals q where q.call_id = c.id and q.agency_id = p_agency),
    'interests', (select coalesce(jsonb_agg(jsonb_build_object('talent_id', i.talent_id, 'name', t.display_name, 'message', i.message, 'created_at', i.updated_at)
        order by i.updated_at desc), '[]'::jsonb)
      from public.brand_call_interests i join public.talent_profiles t on t.id = i.talent_id where i.call_id = c.id and i.agency_id = p_agency),
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.display_name,
        'networks', (select coalesce(jsonb_agg(distinct a.network), '[]'::jsonb) from public.talent_social_accounts a where a.talent_id = t.id),
        'interested', exists (select 1 from public.brand_call_interests i where i.call_id = c.id and i.talent_id = t.id))
      order by t.display_name), '[]'::jsonb)
      from public.talent_profiles t where t.agency_id = p_agency and public.talent_brand_card_ok(t.id, p_agency)));
end $$;

-- creator: chamadas abertas do alvo da agência dele (e as em que demonstrou interesse). Nunca valor nem propostas.
create or replace function public.talent_brand_calls()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  select t.agency_id into v_agency from public.talent_profiles t where t.id = v_talent and t.archived_at is null;
  if v_agency is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg((public.brand_call_json(c.id) - 'brand_id' - 'decision_note') || jsonb_build_object(
      'my_networks', (select coalesce(jsonb_agg(distinct a.network), '[]'::jsonb) from public.talent_social_accounts a where a.talent_id = v_talent),
      'my_interest', (select jsonb_build_object('message', i.message, 'at', i.updated_at) from public.brand_call_interests i where i.call_id = c.id and i.talent_id = v_talent),
      'chosen', exists (select 1 from public.brand_call_proposal_talents x join public.brand_call_proposals q on q.id = x.proposal_id
                        where x.call_id = c.id and x.talent_id = v_talent and q.status = 'agreed'))
    order by (c.status = 'open' and c.respond_by >= now()) desc, c.respond_by), '[]'::jsonb)
    from public.brand_calls c
    where c.status <> 'draft' and public.brand_call_agency_ok(c.id, v_agency)
      and ((c.status = 'open' and c.respond_by >= now())
           or exists (select 1 from public.brand_call_interests i where i.call_id = c.id and i.talent_id = v_talent)
           or exists (select 1 from public.brand_call_proposal_talents x where x.call_id = c.id and x.talent_id = v_talent)));
end $$;

-- 9) campanha nascida de acordo de chamada (MESMAS assinaturas) --------------------------------------------------------
-- a campanha vem de um acordo de chamada com esta agência? (interna)
create or replace function public.campaign_request_brand_call_ok(p_request uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.brand_call_proposals q join public.agencies a on a.id = q.agency_id and a.status = 'active'
                 where q.request_id = p_request and q.agency_id = p_agency and q.status = 'agreed')
$$;
revoke execute on function public.campaign_request_brand_call_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.campaign_request_brand_call_ok(uuid, uuid) to service_role;

-- brand_request_save (0088 + chamada): agência da própria campanha, creators da proposta valem, valor acordado travado
create or replace function public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb; v_brief jsonb; v_locked boolean := false;
  v_call_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if p_id is not null then
    -- 0089: a campanha de um acordo de chamada é da agência vencedora (que pode não ser a agência ativa da marca)
    select r.agency_id into v_call_agency from public.campaign_requests r
    where r.id = p_id and r.brand_id = p_brand and r.brand_call_id is not null and public.campaign_request_brand_call_ok(r.id, r.agency_id);
    if v_call_agency is not null then v_agency := v_call_agency; end if;
  end if;
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  if p_id is not null then
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.brand_id = p_brand and r.origin = 'brand') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.status = 'draft') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if public.brand_member_of(p_brand) <> 'owner' and exists (select 1 from public.campaign_requests r where r.id = p_id and r.approval_status = 'pending') then
      raise exception 'awaiting_approval' using errcode = 'P0001';
    end if;
    v_locked := exists (select 1 from public.sponsorship_proposals q where q.request_id = p_id and q.status = 'agreed')
             or exists (select 1 from public.brand_call_proposals q where q.request_id = p_id and q.status = 'agreed');
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
  if v_talent is not null and not public.talent_brand_card_ok(v_talent, v_agency)
     and not (p_id is not null and exists (select 1 from public.campaign_requests r join public.sponsorship_opportunities o on o.id = r.sponsorship_id
                                           where r.id = p_id and o.talent_id = v_talent and o.agency_id = v_agency))
     and not (p_id is not null and exists (select 1 from public.brand_call_proposals q join public.brand_call_proposal_talents t on t.proposal_id = q.id
                                           where q.request_id = p_id and q.agency_id = v_agency and t.talent_id = v_talent)) then
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
    -- valor oferecido pela marca; na campanha de um patrocínio (0088) ou chamada (0089) acordados, fica o valor do acordo
    if not v_locked and (p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note') then
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

-- envio à agência (0081 + chamada): aceita o vínculo por projeto da campanha de acordo e leva todos os creators da proposta
create or replace function public.brand_request_submit(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_deal uuid; v_owner uuid; v_brand_name text; v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if public.brand_member_of(r.brand_id) <> 'owner' then raise exception 'approval_required' using errcode = '42501'; end if;
  if not public.campaign_request_complete(r) then raise exception 'request_incomplete' using errcode = '22023'; end if;
  if not exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id
                 where ab.agency_id = r.agency_id and ab.brand_id = r.brand_id and ab.status = 'active' and a.status = 'active')
     and not public.campaign_request_brand_call_ok(r.id, r.agency_id) then
    raise exception 'brand_not_linked' using errcode = 'P0001';
  end if;
  select ab.account_manager_id into v_owner from public.agency_brands ab where ab.agency_id = r.agency_id and ab.brand_id = r.brand_id;
  if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = r.agency_id and m.user_id = v_owner and m.revoked_at is null) then
    v_owner := null;
  end if;
  insert into public.deals (agency_id, brand_id, request_id, title, stage, owner_id, created_by, brand_visible, segment_ids, expected_start, expected_end, is_demo)
  values (r.agency_id, r.brand_id, r.id, btrim(r.title), 'briefing_received', v_owner, auth.uid(), true, r.segment_ids, r.period_start,
          coalesce(r.period_end, r.period_start), public.agency_is_demo(r.agency_id))
  returning id into v_deal;
  if r.talent_id is not null then
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    values (r.agency_id, v_deal, r.talent_id, 'suggested', auth.uid(), '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb)
    on conflict (deal_id, talent_id) do nothing;
  end if;
  if r.shortlist_id is not null then
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    select r.agency_id, v_deal, i.talent_id, 'suggested', auth.uid(), '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb
    from public.brand_shortlist_items i
    where i.shortlist_id = r.shortlist_id and i.decision = 'approved' and public.talent_brand_card_ok(i.talent_id, r.agency_id)
    order by i.sort_order
    on conflict (deal_id, talent_id) do nothing;
  end if;
  -- 0089: os creators da proposta acordada na chamada (ainda liberados) entram sugeridos, na ordem da proposta
  if r.brand_call_id is not null then
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    select r.agency_id, v_deal, t.talent_id, 'suggested', auth.uid(), '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb
    from public.brand_call_proposals q join public.brand_call_proposal_talents t on t.proposal_id = q.id
    where q.request_id = r.id and q.agency_id = r.agency_id and q.status = 'agreed' and public.talent_brand_card_ok(t.talent_id, r.agency_id)
    order by t.position
    on conflict (deal_id, talent_id) do nothing;
  end if;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  update public.campaign_requests set status = 'converted', submitted_at = now(), approval_status = 'approved',
    approval_decided_by = auth.uid(), approval_decided_label = v_label, approval_decided_at = now()
  where id = p_id;
  select b.name into v_brand_name from public.brands b where b.id = r.brand_id;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (r.agency_id, 'deal', v_deal, 'system', 'briefing_received', auth.uid(), v_label);
  perform public.audit_log('request.submit', 'campaign_request', p_id::text, null,
    jsonb_build_object('agency_id', r.agency_id, 'brand_id', r.brand_id, 'deal_id', v_deal, 'talent_id', r.talent_id,
                       'approved_by', auth.uid(), 'requested_by', r.approval_requested_by, 'shortlist_id', r.shortlist_id, 'brand_call_id', r.brand_call_id),
    null, 'brand'::public.actor_type);
  perform public.inbox_notify_agency(r.agency_id, 'manager', 'briefing_received', '/agencia/negocios/' || v_deal::text,
    jsonb_build_object('brand', v_brand_name, 'deal', btrim(r.title)), 'deal', v_deal, 'briefing:' || v_deal::text);
  if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = r.agency_id and m.user_id = v_owner
                                         and m.revoked_at is null and m.role::text in ('admin', 'manager')) then
    perform public.inbox_notify(v_owner, 'briefing_received', '/agencia/negocios/' || v_deal::text,
      jsonb_build_object('brand', v_brand_name, 'deal', btrim(r.title)), r.agency_id, 'deal', v_deal, 'briefing:' || v_deal::text || ':' || v_owner::text);
  end if;
  return v_deal;
end $$;
revoke execute on function public.brand_request_submit(uuid) from public, anon;
grant execute on function public.brand_request_submit(uuid) to authenticated, service_role;

-- pedido de aprovação interna (0081 + chamada): aceita a agência vencedora da chamada
create or replace function public.brand_request_ask_approval(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_note text := btrim(coalesce(p_note, '')); v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' or r.approval_status = 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.campaign_request_complete(r) then raise exception 'request_incomplete' using errcode = '22023'; end if;
  if public.brand_active_agency(r.brand_id) is distinct from r.agency_id and not public.campaign_request_brand_call_ok(r.id, r.agency_id) then
    raise exception 'brand_not_linked' using errcode = 'P0001';
  end if;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  update public.campaign_requests set approval_status = 'pending', approval_requested_by = auth.uid(), approval_requested_label = v_label,
    approval_requested_at = now(), approval_request_note = v_note, approval_decided_by = null, approval_decided_label = '',
    approval_decided_at = null, approval_decision_note = ''
  where id = p_id;
  perform public.audit_log('request.ask_approval', 'campaign_request', p_id::text, null,
    jsonb_build_object('brand_id', r.brand_id, 'agency_id', r.agency_id), nullif(v_note, ''), 'brand'::public.actor_type);
  perform public.inbox_notify_brand(r.brand_id, true, 'internal_approval_requested', '/marca/campanhas/' || p_id::text,
    jsonb_build_object('campaign', left(btrim(r.title), 120), 'name', v_label), null, 'request', p_id, null);
end $$;
revoke execute on function public.brand_request_ask_approval(uuid, text) from public, anon;
grant execute on function public.brand_request_ask_approval(uuid, text) to authenticated, service_role;

-- 10) e-mail (0084, MESMA assinatura): + chamada (publicada, interesse, rodadas e decisão; não a revisão interna) ------
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
    when 'sponsorship_negotiation' then coalesce(p_params ->> 'status', '') in ('proposed', 'countered', 'agreed', 'declined', 'closed')
    when 'brand_call_published' then coalesce(p_link, '') like '/agencia/%'
    when 'brand_call_interest' then coalesce(p_link, '') like '/agencia/%'
    when 'brand_call_negotiation' then coalesce(p_params ->> 'status', '') in ('proposed', 'countered', 'agreed', 'declined')
    when 'brand_call_decided' then true
    else false end
$$;
revoke execute on function public.inbox_kind_emails(text, text, jsonb) from public, anon;
grant execute on function public.inbox_kind_emails(text, text, jsonb) to authenticated, service_role;

-- 11) execução -------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.brand_call_save(uuid, uuid, jsonb)', 'public.brand_call_submit(uuid, text)', 'public.brand_call_review(uuid, text, text)',
                           'public.brand_call_reply(uuid, text, bigint, jsonb, date, text)', 'public.brand_call_round_review(uuid, text, text)',
                           'public.brand_call_decide(uuid, text, uuid[], text)', 'public.agency_brand_call_proposal_save(uuid, uuid, jsonb)',
                           'public.agency_brand_call_proposal_send(uuid)', 'public.agency_brand_call_proposal_discard(uuid)',
                           'public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text)', 'public.talent_brand_call_interest(uuid, text)',
                           'public.brand_calls_list(uuid)', 'public.brand_call_detail(uuid)', 'public.brand_call_agency_options(uuid)',
                           'public.agency_brand_calls(uuid)', 'public.agency_brand_call_detail(uuid, uuid)', 'public.talent_brand_calls()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
