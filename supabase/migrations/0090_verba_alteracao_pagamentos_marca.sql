-- =============================================================================
-- Groscove Ultra · 0090 · Gestão: pedido de alteração de verba e pagamentos da marca
-- Pedidos do responsável (03/11). Cenário S97. Idempotente; nenhuma função nova para anon (S14 segue 18); as RPCs
-- recriadas mantêm a MESMA assinatura (sem sobrecarga). Tudo é registro/controle SIMULADO: nada cobra nem move dinheiro.
--
-- A) Pedido de alteração de verba ("pode se redefinir, só que não deve ser tão livre")
--   • Trava: a verba da marca (brand_budgets: a da campanha e a de cada creator, 0082) só é definida livremente na 1ª
--     vez. Depois disso, com a campanha já enviada à agência (status <> 'draft'), brand_budget_set (MESMA assinatura)
--     recusa mudar ou limpar com budget_locked. Rascunho segue livre (a agência ainda não conta com aquele valor).
--   • Pedido (budget_change_requests, um aberto por campanha — índice único parcial; change_open): novo valor da
--     campanha + motivo (5 a 1000 letras) + opcionalmente novos valores por creator (os que a marca já tinha
--     definido ou quiser definir). Só para campanha enviada com negócio visível à marca e não encerrado.
--     Aprovação interna (0081): o dono envia direto; a equipe monta e o pedido fica pending_owner até o dono enviar
--     (ou devolver com nota, returned). Quem pediu (ou o dono) retira enquanto a agência não respondeu (withdrawn).
--   • Agência: só o Adm decide (lê valores); gestor e colaborador do negócio veem só a situação e a linha do tempo,
--     sem valores, motivo nem notas (o texto pode citar valor). O Adm recusa com nota (agency_declined: a verba antiga
--     segue) ou "Aceitar e realinhar" (proposed): plano estruturado — creators (manter/remover/adicionar, com nota),
--     entregas (lista nova no formato do pedido: tipo + quantidade + rede), período previsto, etapas (texto),
--     contrapartidas (até 10), nota geral — e pode propor outro valor (counter_cents).
--   • Marca (só o dono) confirma (confirmed) ou recusa com nota (brand_declined). Só na confirmação o novo valor vale:
--     verba da campanha = contraproposta ou o pedido; verbas por creator do pedido; "valor oferecido" à agência
--     (campaign_request_budgets: máximo = novo valor, mínimo não passa dele); período previsto no pedido e no negócio
--     (se o plano trouxe e as datas fecham); entregas pedidas (campaign_requests.deliverables, se o plano trouxe).
--     NADA contratado é apagado ou alterado: creators, entregáveis, termos, cachês e lançamentos ficam como estão e
--     viram TAREFAS da agência (tasks da 0068, escopo do negócio, para o responsável, prazo de 3 dias): creators,
--     entregas, contrapartidas, datas/etapas que não entraram sozinhas e "termos e financeiro" (sempre, sem valor no
--     texto: tarefas são lidas por gestor e colaborador). Os textos das tarefas são dados (pt-BR, como os das pessoas).
--   • Histórico completo (budget_change_events): lado, ação, quem (nome), quando, antes/depois e nota. Os passos
--     internos da marca (montagem pela equipe, devolução, retirada antes de enviar) não aparecem para a agência.
--     Também vai para audit_log.
--   • Avisos (budget_change, status = review|returned|requested|withdrawn|declined|proposed|confirmed|rejected): cada
--     passo avisa a outra parte; os internos da marca só no sino; requested/declined/proposed/confirmed/rejected
--     também por e-mail (fila da 0084). Nenhum valor no aviso.
--
-- B) Pagamentos da marca (antes só a agência marcava o "a receber" como liquidado)
--   • Dados de pagamento da agência (agency_payment_settings, um por agência; só o Adm lê e grava): PIX (tipo +
--     chave normalizada e conferida: CPF/CNPJ com dígito, e-mail, celular +55 DDD, chave aleatória) e/ou banco
--     (banco, agência, conta, tipo), favorecido e CPF/CNPJ (br_tax_id_kind da 0084), instruções. A marca lê só pela
--     RPC brand_payments, e só das agências com quem tem algo a pagar.
--   • Parcelas (brand_payment_installments): todo "a receber da marca" (brand_receivable, 0072) nasce com 1 parcela do
--     valor todo e o vencimento do lançamento (gatilho + backfill). O Adm divide em até 12 parcelas (rótulo, valor,
--     vencimento) somando EXATAMENTE o total (installments_sum), enquanto nenhuma foi informada/paga; o vencimento do
--     lançamento passa a ser o da primeira parcela. Lançamento liquidado pelo caminho antigo marca as parcelas pagas.
--   • Marca: /marca/pagamentos. Dono E equipe informam o pagamento (decisão: informar não compromete dinheiro novo,
--     é um registro do que já foi feito; o Adm confere de qualquer forma). Data (até hoje, no máximo 1 ano atrás),
--     valor, comprovante opcional (PDF/imagem pelo armazenamento de documentos que já existe: document_reserve no
--     negócio; ao ligar, o documento fica restrito — Adm e a própria marca leem; gestor/colaborador não) e
--     observação. Um informe aberto por parcela (payment_open); recusado, a marca informa de novo.
--   • Agência (só Adm): confirma (parcela paga; todas pagas → lançamento liquidado pela regra que já existe,
--     agency_entry_set_status) ou recusa com nota (5+ letras). Gestor/colaborador/creator não leem nada disso.
--   • Situação na tela (lógica pura em src/lib/finance/payments.ts): a vencer, vencido, informado, pago.
--   • Cron diário (/api/cron/agency → brand_payment_due_scan, só service_role): parcela em aberto e sem informe
--     avisa marca (todos) e Adm da agência 3 dias antes (faixa 1–3), no dia (0 a 2 dias depois, tolerância de cron)
--     e 3 dias depois (3 a 10 dias de atraso). Um aviso por faixa (dedupe por parcela + vencimento + faixa).
--   • Avisos novos: payment_reported (Adm), payment_reviewed (marca), payment_due (marca e Adm), payment_plan
--     (marca: parcelas mudaram). Todos também por e-mail. Entidades novas: 'budget_change', 'payment'.
-- =============================================================================

-- 1) avisos novos (todos os da 0089 + os da 0090) ---------------------------------------------------------------------
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
  'budget_change', 'payment_reported', 'payment_reviewed', 'payment_due', 'payment_plan'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment'));

-- e-mail (0084, MESMA assinatura): tudo o que valia + os da 0090
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
    when 'budget_change' then coalesce(p_params ->> 'status', '') in ('requested', 'declined', 'proposed', 'confirmed', 'rejected')
    when 'payment_reported' then true
    when 'payment_reviewed' then true
    when 'payment_due' then true
    when 'payment_plan' then true
    else false end
$$;
revoke execute on function public.inbox_kind_emails(text, text, jsonb) from public, anon;
grant execute on function public.inbox_kind_emails(text, text, jsonb) to authenticated, service_role;

-- 2) pedido de alteração de verba ------------------------------------------------------------------------------------
-- plano de realinhamento da agência (forma conferida aqui; os creators "manter/remover" são conferidos na RPC)
create or replace function public.budget_change_plan_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; v_ps date; v_pe date;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('creators', 'deliverables', 'period_start', 'period_end', 'schedule_note', 'perks', 'note') then return false; end if;
  end loop;
  if p ? 'creators' then
    if jsonb_typeof(p -> 'creators') <> 'array' or jsonb_array_length(p -> 'creators') > 30 then return false; end if;
    for e in select value from jsonb_array_elements(p -> 'creators') loop
      if jsonb_typeof(e) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(e) loop
        if k not in ('deal_talent_id', 'name', 'action', 'note') then return false; end if;
      end loop;
      if coalesce(jsonb_typeof(e -> 'action'), '') <> 'string' or (e ->> 'action') not in ('keep', 'remove', 'add') then return false; end if;
      if coalesce(jsonb_typeof(e -> 'name'), '') <> 'string' or char_length(btrim(e ->> 'name')) not between 1 and 120 then return false; end if;
      if e ? 'note' and (coalesce(jsonb_typeof(e -> 'note'), '') <> 'string' or char_length(e ->> 'note') > 300) then return false; end if;
      if coalesce(jsonb_typeof(e -> 'deal_talent_id'), 'null') not in ('null', 'string') then return false; end if;
      if (e ->> 'deal_talent_id') is not null and (e ->> 'deal_talent_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      if (e ->> 'action') in ('keep', 'remove') and (e ->> 'deal_talent_id') is null then return false; end if;
    end loop;
  end if;
  if p ? 'deliverables' and jsonb_typeof(p -> 'deliverables') <> 'null' and not public.campaign_deliverables_valid(p -> 'deliverables') then return false; end if;
  begin
    if p ? 'period_start' and jsonb_typeof(p -> 'period_start') <> 'null' then
      if jsonb_typeof(p -> 'period_start') <> 'string' or (p ->> 'period_start') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      v_ps := (p ->> 'period_start')::date;
    end if;
    if p ? 'period_end' and jsonb_typeof(p -> 'period_end') <> 'null' then
      if jsonb_typeof(p -> 'period_end') <> 'string' or (p ->> 'period_end') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      v_pe := (p ->> 'period_end')::date;
    end if;
  exception when others then return false;
  end;
  if v_ps is not null and v_pe is not null and v_pe < v_ps then return false; end if;
  if p ? 'schedule_note' and (coalesce(jsonb_typeof(p -> 'schedule_note'), '') <> 'string' or char_length(p ->> 'schedule_note') > 500) then return false; end if;
  if p ? 'note' and (coalesce(jsonb_typeof(p -> 'note'), '') <> 'string' or char_length(p ->> 'note') > 1000) then return false; end if;
  if p ? 'perks' then
    if jsonb_typeof(p -> 'perks') <> 'array' or jsonb_array_length(p -> 'perks') > 10 then return false; end if;
    for e in select value from jsonb_array_elements(p -> 'perks') loop
      if jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 2 and 200 then return false; end if;
    end loop;
  end if;
  return true;
end $$;
revoke execute on function public.budget_change_plan_valid(jsonb) from public, anon;
grant execute on function public.budget_change_plan_valid(jsonb) to authenticated, service_role;

create table if not exists public.budget_change_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint budget_change_requests_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint budget_change_requests_brand_fk references public.brands (id) on delete cascade,
  request_id uuid not null constraint budget_change_requests_request_fk references public.campaign_requests (id) on delete cascade,
  deal_id uuid not null constraint budget_change_requests_deal_fk references public.deals (id) on delete cascade,
  status text not null default 'pending_owner',
  requested_cents bigint not null,
  reason text not null,
  -- novas verbas por creator pedidas junto: [{deal_talent_id, cents}]
  talent_cents jsonb not null default '[]'::jsonb,
  before_reserved_cents bigint,
  before_offered_cents bigint,
  before_committed_cents bigint,
  counter_cents bigint,
  plan jsonb,
  agency_note text not null default '',
  brand_note text not null default '',
  final_cents bigint,
  created_by uuid constraint budget_change_requests_created_by_fk references auth.users (id) on delete set null,
  created_label text not null default '',
  sent_by uuid constraint budget_change_requests_sent_by_fk references auth.users (id) on delete set null,
  sent_at timestamptz,
  agency_by uuid constraint budget_change_requests_agency_by_fk references auth.users (id) on delete set null,
  agency_label text not null default '',
  agency_at timestamptz,
  brand_by uuid constraint budget_change_requests_brand_by_fk references auth.users (id) on delete set null,
  brand_label text not null default '',
  brand_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_change_requests_status_check check (status in ('pending_owner', 'open', 'proposed', 'confirmed', 'agency_declined', 'brand_declined', 'returned', 'withdrawn')),
  constraint budget_change_requests_amount_check check (requested_cents between 0 and 10000000000 and (counter_cents is null or counter_cents between 0 and 10000000000)
                                                        and (final_cents is null or final_cents between 0 and 10000000000)),
  constraint budget_change_requests_reason_check check (char_length(btrim(reason)) between 5 and 1000),
  constraint budget_change_requests_notes_check check (char_length(agency_note) <= 1000 and char_length(brand_note) <= 1000),
  constraint budget_change_requests_talents_check check (jsonb_typeof(talent_cents) = 'array' and jsonb_array_length(talent_cents) <= 30),
  constraint budget_change_requests_plan_check check (plan is null or public.budget_change_plan_valid(plan)),
  constraint budget_change_requests_sent_check check ((status in ('pending_owner', 'returned')) or sent_at is not null or status = 'withdrawn'),
  constraint budget_change_requests_final_check check ((status = 'confirmed') = (final_cents is not null))
);
-- um pedido aberto por campanha
create unique index if not exists budget_change_requests_open_uq on public.budget_change_requests (request_id) where status in ('pending_owner', 'open', 'proposed');
create index if not exists budget_change_requests_request_idx on public.budget_change_requests (request_id, created_at desc);
create index if not exists budget_change_requests_agency_idx on public.budget_change_requests (agency_id, status);
create index if not exists budget_change_requests_brand_idx on public.budget_change_requests (brand_id, status);
create index if not exists budget_change_requests_deal_idx on public.budget_change_requests (deal_id);
drop trigger if exists budget_change_requests_touch on public.budget_change_requests;
create trigger budget_change_requests_touch before update on public.budget_change_requests for each row execute function public.set_updated_at();

create table if not exists public.budget_change_events (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null constraint budget_change_events_change_fk references public.budget_change_requests (id) on delete cascade,
  agency_id uuid not null constraint budget_change_events_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint budget_change_events_brand_fk references public.brands (id) on delete cascade,
  side text not null,
  action text not null,
  -- passo interno da marca (a agência não vê)
  internal boolean not null default false,
  actor_id uuid constraint budget_change_events_actor_fk references auth.users (id) on delete set null,
  actor_label text not null default '',
  before jsonb,
  after jsonb,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint budget_change_events_side_check check (side in ('brand', 'agency')),
  constraint budget_change_events_action_check check (action in ('created', 'sent', 'returned', 'withdrawn', 'declined', 'proposed', 'confirmed', 'rejected')),
  constraint budget_change_events_note_check check (char_length(note) <= 1000)
);
create index if not exists budget_change_events_change_idx on public.budget_change_events (change_id, created_at);

alter table public.budget_change_requests enable row level security;
alter table public.budget_change_events enable row level security;
revoke all on public.budget_change_requests from public, anon, authenticated;
revoke all on public.budget_change_events from public, anon, authenticated;
grant select on public.budget_change_requests, public.budget_change_events to authenticated;
grant all on public.budget_change_requests, public.budget_change_events to service_role;
drop policy if exists budget_change_requests_select_admin on public.budget_change_requests;
create policy budget_change_requests_select_admin on public.budget_change_requests for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists budget_change_requests_select_brand on public.budget_change_requests;
create policy budget_change_requests_select_brand on public.budget_change_requests for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));
-- agência: só o Adm (valores), e só o que a marca já enviou
drop policy if exists budget_change_requests_select_agency on public.budget_change_requests;
create policy budget_change_requests_select_agency on public.budget_change_requests for select to authenticated
  using (sent_at is not null and agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists budget_change_events_select_admin on public.budget_change_events;
create policy budget_change_events_select_admin on public.budget_change_events for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists budget_change_events_select_brand on public.budget_change_events;
create policy budget_change_events_select_brand on public.budget_change_events for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));
drop policy if exists budget_change_events_select_agency on public.budget_change_events;
create policy budget_change_events_select_agency on public.budget_change_events for select to authenticated
  using (not internal and agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));

-- 3) trava da verba: a 1ª definição é livre; depois de enviada a campanha, só pelo pedido (MESMA assinatura da 0082)
create or replace function public.brand_budget_set(p_request uuid, p_deal_talent uuid, p_total_cents bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_role text; v_before bigint;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(r.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.origin <> 'brand' and not exists (select 1 from public.deals d where d.request_id = r.id and d.brand_visible) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status = 'cancelled' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_total_cents is not null and (p_total_cents < 0 or p_total_cents > 10000000000) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_deal_talent is not null and not exists (
      select 1 from public.deal_talents dt join public.deals d on d.id = dt.deal_id
      where dt.id = p_deal_talent and d.request_id = r.id and d.brand_visible and dt.status in ('proposed', 'contracted')
        and d.stage in ('proposal_sent', 'negotiation', 'approved', 'contracting', 'production', 'approval', 'delivery', 'closed')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select bb.total_cents into v_before from public.brand_budgets bb where bb.request_id = r.id and bb.deal_talent_id is not distinct from p_deal_talent;
  -- 0090: definida uma vez e a campanha já foi para a agência → só pelo pedido de alteração
  if v_before is not null and v_before is distinct from p_total_cents and r.status <> 'draft' then
    raise exception 'budget_locked' using errcode = 'P0001';
  end if;
  if p_total_cents is null then
    delete from public.brand_budgets bb where bb.request_id = r.id and bb.deal_talent_id is not distinct from p_deal_talent;
  else
    insert into public.brand_budgets (brand_id, request_id, deal_talent_id, total_cents, updated_by)
    values (r.brand_id, r.id, p_deal_talent, p_total_cents, auth.uid())
    on conflict (request_id, deal_talent_id) do update set total_cents = excluded.total_cents, updated_by = excluded.updated_by;
  end if;
  if v_before is distinct from p_total_cents then
    perform public.audit_log('brand.budget_set', 'campaign_request', r.id::text,
      jsonb_build_object('brand_id', r.brand_id, 'deal_talent_id', p_deal_talent, 'total_cents', v_before),
      jsonb_build_object('brand_id', r.brand_id, 'deal_talent_id', p_deal_talent, 'total_cents', p_total_cents), null, 'brand'::public.actor_type);
  end if;
end $$;
revoke execute on function public.brand_budget_set(uuid, uuid, bigint) from public, anon;
grant execute on function public.brand_budget_set(uuid, uuid, bigint) to authenticated, service_role;

-- painel da campanha (0082, MESMA assinatura) + "locked" (verba definida já não muda pelo lápis) e o pedido aberto
create or replace function public.brand_budget_summary(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(r.brand_id);
  if v_role is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.origin <> 'brand' and not exists (select 1 from public.deals d where d.request_id = r.id and d.brand_visible) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.brand_budget_compute(p_request) || jsonb_build_object('can_edit', v_role = 'owner', 'locked', r.status <> 'draft',
    'change_status', (select c.status from public.budget_change_requests c where c.request_id = r.id and c.status in ('pending_owner', 'open', 'proposed')));
end $$;
revoke execute on function public.brand_budget_summary(uuid) from public, anon;
grant execute on function public.brand_budget_summary(uuid) to authenticated, service_role;

-- interna: grava um passo do histórico
create or replace function public.budget_change_log(p_change uuid, p_side text, p_action text, p_internal boolean, p_label text, p_before jsonb, p_after jsonb, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.budget_change_requests%rowtype;
begin
  select * into c from public.budget_change_requests where id = p_change;
  insert into public.budget_change_events (change_id, agency_id, brand_id, side, action, internal, actor_id, actor_label, before, after, note)
  values (c.id, c.agency_id, c.brand_id, p_side, p_action, p_internal, auth.uid(), coalesce(p_label, ''), p_before, p_after, left(coalesce(p_note, ''), 1000));
  perform public.audit_log('budget_change.' || p_action, 'budget_change', c.id::text,
    coalesce(p_before, '{}'::jsonb) || jsonb_build_object('agency_id', c.agency_id, 'brand_id', c.brand_id),
    coalesce(p_after, '{}'::jsonb) || jsonb_build_object('agency_id', c.agency_id, 'brand_id', c.brand_id),
    nullif(left(coalesce(p_note, ''), 500), ''), case when p_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', c.agency_id) end);
end $$;
revoke execute on function public.budget_change_log(uuid, text, text, boolean, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.budget_change_log(uuid, text, text, boolean, text, jsonb, jsonb, text) to service_role;

-- interna: avisos de um passo (sem valor)
create or replace function public.budget_change_notify(p_change uuid, p_status text, p_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.budget_change_requests%rowtype; v_title text; v_params jsonb; v_dedupe text;
begin
  select * into c from public.budget_change_requests where id = p_change;
  select coalesce(nullif(btrim(r.title), ''), d.title) into v_title
  from public.deals d left join public.campaign_requests r on r.id = d.request_id where d.id = c.deal_id;
  v_params := jsonb_build_object('deal', left(coalesce(v_title, ''), 120), 'status', p_status);
  v_dedupe := 'budget_change:' || c.id::text || ':' || p_status;
  if p_to = 'agency_admin' then
    perform public.inbox_notify_agency(c.agency_id, 'admin', 'budget_change', '/agencia/negocios/' || c.deal_id::text || '#budget-change', v_params, 'budget_change', c.id, v_dedupe);
  elsif p_to = 'agency_manager' then
    perform public.inbox_notify_agency(c.agency_id, 'manager', 'budget_change', '/agencia/negocios/' || c.deal_id::text || '#budget-change', v_params, 'budget_change', c.id, v_dedupe);
  elsif p_to = 'brand_owner' then
    perform public.inbox_notify_brand(c.brand_id, true, 'budget_change', '/marca/campanhas/' || c.request_id::text || '#camp-budget', v_params, c.agency_id, 'budget_change', c.id, v_dedupe);
  elsif p_to = 'brand_all' then
    perform public.inbox_notify_brand(c.brand_id, false, 'budget_change', '/marca/campanhas/' || c.request_id::text || '#camp-budget', v_params, c.agency_id, 'budget_change', c.id, v_dedupe);
  elsif p_to = 'requester' then
    perform public.inbox_notify(c.created_by, 'budget_change', '/marca/campanhas/' || c.request_id::text || '#camp-budget', v_params, c.agency_id, 'budget_change', c.id, v_dedupe);
  end if;
end $$;
revoke execute on function public.budget_change_notify(uuid, text, text) from public, anon, authenticated;
grant execute on function public.budget_change_notify(uuid, text, text) to service_role;

-- marca: pede a alteração (dono envia direto; a equipe monta e espera o dono)
create or replace function public.brand_budget_change_create(p_request uuid, p_cents bigint, p_reason text, p_talents jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; d public.deals%rowtype; v_role text; v_reason text := btrim(coalesce(p_reason, '')); v_talents jsonb := coalesce(p_talents, '[]'::jsonb);
        e jsonb; v_seen uuid[] := '{}'; v_dt uuid; v_cents bigint; v_comp jsonb; v_id uuid; v_status text; v_label text; v_changed boolean := false;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(r.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals x where x.request_id = r.id and x.brand_visible;
  if d.id is null then
    if r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if r.status in ('draft', 'cancelled', 'declined') or d.stage = 'closed' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_cents is null or p_cents < 0 or p_cents > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if char_length(v_reason) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if jsonb_typeof(v_talents) <> 'array' or jsonb_array_length(v_talents) > 30 then raise exception 'invalid_input' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(v_talents) loop
    begin
      v_dt := (e ->> 'deal_talent_id')::uuid; v_cents := (e ->> 'cents')::bigint;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    if v_dt is null or v_cents is null or v_cents < 0 or v_cents > 10000000000 or v_dt = any (v_seen) then raise exception 'invalid_input' using errcode = '22023'; end if;
    if not exists (select 1 from public.deal_talents dt where dt.id = v_dt and dt.deal_id = d.id and dt.status in ('proposed', 'contracted')) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_seen := v_seen || v_dt;
    if (select bb.total_cents from public.brand_budgets bb where bb.request_id = r.id and bb.deal_talent_id = v_dt) is distinct from v_cents then v_changed := true; end if;
  end loop;
  v_talents := (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', (x ->> 'deal_talent_id')::uuid, 'cents', (x ->> 'cents')::bigint)), '[]'::jsonb) from jsonb_array_elements(v_talents) x);
  v_comp := public.brand_budget_compute(r.id);
  if (v_comp ->> 'reserved_cents')::bigint is not distinct from p_cents and not v_changed then raise exception 'no_change' using errcode = 'P0001'; end if;
  if exists (select 1 from public.budget_change_requests c where c.request_id = r.id and c.status in ('pending_owner', 'open', 'proposed')) then
    raise exception 'change_open' using errcode = 'P0001';
  end if;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  v_status := case when v_role = 'owner' then 'open' else 'pending_owner' end;
  begin
    insert into public.budget_change_requests (agency_id, brand_id, request_id, deal_id, status, requested_cents, reason, talent_cents,
      before_reserved_cents, before_offered_cents, before_committed_cents, created_by, created_label, sent_by, sent_at)
    values (d.agency_id, r.brand_id, r.id, d.id, v_status, p_cents, v_reason, v_talents,
      (v_comp ->> 'reserved_cents')::bigint, (v_comp ->> 'offered_cents')::bigint, (v_comp ->> 'committed_cents')::bigint, auth.uid(), v_label,
      case when v_status = 'open' then auth.uid() end, case when v_status = 'open' then now() end)
    returning id into v_id;
  exception when unique_violation then raise exception 'change_open' using errcode = 'P0001';
  end;
  perform public.budget_change_log(v_id, 'brand', case when v_status = 'open' then 'sent' else 'created' end, v_status <> 'open', v_label,
    jsonb_build_object('reserved_cents', (v_comp ->> 'reserved_cents')::bigint, 'offered_cents', (v_comp ->> 'offered_cents')::bigint),
    jsonb_build_object('requested_cents', p_cents, 'talent_cents', v_talents), v_reason);
  if v_status = 'open' then
    perform public.budget_change_notify(v_id, 'requested', 'agency_admin');
  else
    perform public.budget_change_notify(v_id, 'review', 'brand_owner');
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;
revoke execute on function public.brand_budget_change_create(uuid, bigint, text, jsonb) from public, anon;
grant execute on function public.brand_budget_change_create(uuid, bigint, text, jsonb) to authenticated, service_role;

-- marca: dono envia ou devolve o pedido da equipe; quem pediu (ou o dono) retira antes da resposta da agência
create or replace function public.brand_budget_change_review(p_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.budget_change_requests%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_label text; v_was text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('send', 'return', 'withdraw') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.budget_change_requests where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(c.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_label := public.actor_label(c.agency_id, c.brand_id);
  v_was := c.status;
  if p_decision = 'withdraw' then
    if c.status not in ('pending_owner', 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if v_role <> 'owner' and c.created_by is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.budget_change_requests set status = 'withdrawn', brand_note = v_note, brand_by = auth.uid(), brand_label = v_label, brand_at = now() where id = c.id;
    perform public.budget_change_log(c.id, 'brand', 'withdrawn', v_was = 'pending_owner', v_label, jsonb_build_object('status', v_was), jsonb_build_object('status', 'withdrawn'), v_note);
    if v_was = 'open' then perform public.budget_change_notify(c.id, 'withdrawn', 'agency_admin'); end if;
    return 'withdrawn';
  end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'pending_owner' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_decision = 'return' then
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.budget_change_requests set status = 'returned', brand_note = v_note, brand_by = auth.uid(), brand_label = v_label, brand_at = now() where id = c.id;
    perform public.budget_change_log(c.id, 'brand', 'returned', true, v_label, null, null, v_note);
    perform public.budget_change_notify(c.id, 'returned', 'requester');
    return 'returned';
  end if;
  -- enviar: o negócio ainda precisa estar aberto e visível
  if not exists (select 1 from public.deals d where d.id = c.deal_id and d.brand_visible and d.stage <> 'closed') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.budget_change_requests set status = 'open', sent_by = auth.uid(), sent_at = now() where id = c.id;
  perform public.budget_change_log(c.id, 'brand', 'sent', false, v_label, null, jsonb_build_object('requested_cents', c.requested_cents), v_note);
  perform public.budget_change_notify(c.id, 'requested', 'agency_admin');
  if c.created_by is distinct from auth.uid() then perform public.budget_change_notify(c.id, 'sent', 'requester'); end if;
  return 'open';
end $$;
revoke execute on function public.brand_budget_change_review(uuid, text, text) from public, anon;
grant execute on function public.brand_budget_change_review(uuid, text, text) to authenticated, service_role;

-- agência (só Adm): recusa (nota) ou aceita e propõe o realinhamento (plano + valor opcional)
create or replace function public.agency_budget_change_decide(p_id uuid, p_decision text, p_note text default null, p_plan jsonb default null, p_counter_cents bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.budget_change_requests%rowtype; v_note text := btrim(coalesce(p_note, '')); v_label text; e jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('decline', 'propose') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.budget_change_requests where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(c.agency_id, 'admin') then
    if public.agency_can(c.agency_id, 'staff') and c.sent_at is not null then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.sent_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_label := public.actor_label(c.agency_id, null);
  if p_decision = 'decline' then
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
    if p_plan is not null or p_counter_cents is not null then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.budget_change_requests set status = 'agency_declined', agency_note = v_note, agency_by = auth.uid(), agency_label = v_label, agency_at = now() where id = c.id;
    perform public.budget_change_log(c.id, 'agency', 'declined', false, v_label, null, null, v_note);
    perform public.budget_change_notify(c.id, 'declined', 'brand_all');
    return 'agency_declined';
  end if;
  if p_counter_cents is not null and (p_counter_cents < 0 or p_counter_cents > 10000000000) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.budget_change_plan_valid(coalesce(p_plan, '{}'::jsonb)) then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- "manter"/"remover" só para creators do negócio
  for e in select value from jsonb_array_elements(coalesce(p_plan -> 'creators', '[]'::jsonb)) loop
    if (e ->> 'deal_talent_id') is not null and not exists (select 1 from public.deal_talents dt where dt.id = (e ->> 'deal_talent_id')::uuid and dt.deal_id = c.deal_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end loop;
  update public.budget_change_requests set status = 'proposed', plan = coalesce(p_plan, '{}'::jsonb), counter_cents = p_counter_cents, agency_note = v_note,
    agency_by = auth.uid(), agency_label = v_label, agency_at = now() where id = c.id;
  perform public.budget_change_log(c.id, 'agency', 'proposed', false, v_label, jsonb_build_object('requested_cents', c.requested_cents),
    jsonb_build_object('counter_cents', p_counter_cents, 'plan', coalesce(p_plan, '{}'::jsonb)), v_note);
  perform public.budget_change_notify(c.id, 'proposed', 'brand_all');
  return 'proposed';
end $$;
revoke execute on function public.agency_budget_change_decide(uuid, text, text, jsonb, bigint) from public, anon;
grant execute on function public.agency_budget_change_decide(uuid, text, text, jsonb, bigint) to authenticated, service_role;

-- interna: cria uma tarefa da agência para o realinhamento (escopo do negócio, para o responsável, 3 dias)
create or replace function public.budget_change_task(p_deal uuid, p_title text, p_description text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_id uuid;
begin
  select * into d from public.deals where id = p_deal;
  insert into public.tasks (agency_id, brand_id, scope_type, deal_id, title, description, side, assignee_id, due_at, created_by)
  values (d.agency_id, d.brand_id, 'deal', d.id, left(p_title, 160), left(coalesce(p_description, ''), 2000), 'agency', d.owner_id, now() + interval '3 days', auth.uid())
  returning id into v_id;
  if d.owner_id is not null then
    perform public.inbox_notify(d.owner_id, 'task_assigned', '/agencia/negocios/' || d.id::text || '/tarefas',
      jsonb_build_object('deal', d.title), d.agency_id, 'task', v_id, 'task_assigned:' || v_id::text);
  end if;
end $$;
revoke execute on function public.budget_change_task(uuid, text, text) from public, anon, authenticated;
grant execute on function public.budget_change_task(uuid, text, text) to service_role;

-- marca (só o dono): confirma (aplica) ou recusa o realinhamento
create or replace function public.brand_budget_change_answer(p_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.budget_change_requests%rowtype; r public.campaign_requests%rowtype; d public.deals%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_label text; v_final bigint; e jsonb; v_ps date; v_pe date; v_new_ps date; v_new_pe date; v_dates_applied boolean := false; v_lines text;
        v_plan jsonb; v_applied jsonb := '[]'::jsonb; v_kind_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('confirm', 'decline') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.budget_change_requests where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(c.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'proposed' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_label := public.actor_label(c.agency_id, c.brand_id);
  if p_decision = 'decline' then
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.budget_change_requests set status = 'brand_declined', brand_note = v_note, brand_by = auth.uid(), brand_label = v_label, brand_at = now() where id = c.id;
    perform public.budget_change_log(c.id, 'brand', 'rejected', false, v_label, null, null, v_note);
    perform public.budget_change_notify(c.id, 'rejected', 'agency_admin');
    return 'brand_declined';
  end if;

  select * into r from public.campaign_requests where id = c.request_id for update;
  select * into d from public.deals where id = c.deal_id for update;
  if d.id is null or d.stage = 'closed' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  v_final := coalesce(c.counter_cents, c.requested_cents);
  v_plan := coalesce(c.plan, '{}'::jsonb);

  -- a) verba da campanha e por creator (o pedido é o caminho que passa pela trava)
  insert into public.brand_budgets (brand_id, request_id, deal_talent_id, total_cents, updated_by)
  values (c.brand_id, c.request_id, null, v_final, auth.uid())
  on conflict (request_id, deal_talent_id) do update set total_cents = excluded.total_cents, updated_by = excluded.updated_by;
  for e in select value from jsonb_array_elements(c.talent_cents) loop
    if exists (select 1 from public.deal_talents dt where dt.id = (e ->> 'deal_talent_id')::uuid and dt.deal_id = d.id) then
      insert into public.brand_budgets (brand_id, request_id, deal_talent_id, total_cents, updated_by)
      values (c.brand_id, c.request_id, (e ->> 'deal_talent_id')::uuid, (e ->> 'cents')::bigint, auth.uid())
      on conflict (request_id, deal_talent_id) do update set total_cents = excluded.total_cents, updated_by = excluded.updated_by;
    end if;
  end loop;
  v_applied := v_applied || '["budget"]'::jsonb;
  -- b) valor oferecido à agência
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, updated_by)
  values (r.agency_id, r.brand_id, r.id, null, v_final, auth.uid())
  on conflict (request_id) do update set budget_max_cents = excluded.budget_max_cents,
    budget_min_cents = case when public.campaign_request_budgets.budget_min_cents is null then null else least(public.campaign_request_budgets.budget_min_cents, excluded.budget_max_cents) end,
    updated_by = excluded.updated_by, updated_at = now();
  v_applied := v_applied || '["offered"]'::jsonb;
  -- c) período previsto (campanha e negócio), se o plano trouxe e as datas fecham
  if jsonb_typeof(v_plan -> 'period_start') = 'string' or jsonb_typeof(v_plan -> 'period_end') = 'string' then
    v_ps := (v_plan ->> 'period_start')::date; v_pe := (v_plan ->> 'period_end')::date;
    v_new_ps := coalesce(v_ps, r.period_start); v_new_pe := coalesce(v_pe, r.period_end);
    if v_new_ps is null or v_new_pe is null or v_new_pe >= v_new_ps then
      update public.campaign_requests set period_start = v_new_ps, period_end = v_new_pe where id = r.id;
      if (coalesce(v_ps, d.expected_start) is null or coalesce(v_pe, d.expected_end) is null or coalesce(v_pe, d.expected_end) >= coalesce(v_ps, d.expected_start)) then
        update public.deals set expected_start = coalesce(v_ps, expected_start), expected_end = coalesce(v_pe, expected_end) where id = d.id;
      end if;
      v_dates_applied := true;
      v_applied := v_applied || '["dates"]'::jsonb;
    end if;
  end if;
  -- d) entregas pedidas (o pedido; os entregáveis contratados não mudam sozinhos)
  if jsonb_typeof(v_plan -> 'deliverables') = 'array' then
    update public.campaign_requests set deliverables = v_plan -> 'deliverables' where id = r.id;
    v_applied := v_applied || '["deliverables"]'::jsonb;
  end if;

  -- e) o que não é automático vira tarefa da agência (nada contratado é apagado)
  select string_agg(case x ->> 'action' when 'remove' then 'Remover: ' when 'add' then 'Adicionar: ' end || btrim(x ->> 'name')
                    || case when coalesce(btrim(x ->> 'note'), '') <> '' then ' — ' || btrim(x ->> 'note') else '' end, E'\n')
    into v_lines from jsonb_array_elements(coalesce(v_plan -> 'creators', '[]'::jsonb)) x where x ->> 'action' in ('remove', 'add');
  if v_lines is not null then
    perform public.budget_change_task(d.id, 'Realinhamento da verba: creators', 'Mudanças combinadas com a marca (nada foi removido automaticamente):' || E'\n' || v_lines);
  end if;
  if jsonb_typeof(v_plan -> 'deliverables') = 'array' then
    select string_agg((x ->> 'quantity') || '× ' || (x ->> 'kind') || coalesce(' (' || (x ->> 'network') || ')', ''), E'\n') into v_lines
    from jsonb_array_elements(v_plan -> 'deliverables') x;
    perform public.budget_change_task(d.id, 'Realinhamento da verba: entregas',
      'Entregas combinadas (o pedido da campanha já foi atualizado; ajuste os entregáveis dos creators):' || E'\n' || coalesce(v_lines, '—'));
  end if;
  if jsonb_typeof(v_plan -> 'perks') = 'array' and jsonb_array_length(v_plan -> 'perks') > 0 then
    select string_agg('• ' || btrim(x #>> '{}'), E'\n') into v_lines from jsonb_array_elements(v_plan -> 'perks') x;
    perform public.budget_change_task(d.id, 'Realinhamento da verba: contrapartidas', 'Contrapartidas combinadas:' || E'\n' || v_lines);
  end if;
  if coalesce(btrim(v_plan ->> 'schedule_note'), '') <> '' or ((v_plan ? 'period_start' or v_plan ? 'period_end') and not v_dates_applied
       and (jsonb_typeof(v_plan -> 'period_start') = 'string' or jsonb_typeof(v_plan -> 'period_end') = 'string')) then
    perform public.budget_change_task(d.id, 'Realinhamento da verba: datas e etapas',
      coalesce(nullif(btrim(v_plan ->> 'schedule_note'), ''), 'Revise as datas: o período combinado não coube no previsto.')
      || case when v_dates_applied then E'\n' || 'O período previsto da campanha já foi atualizado.' else '' end);
  end if;
  perform public.budget_change_task(d.id, 'Realinhamento da verba: termos e financeiro',
    'A marca confirmou a nova verba e o realinhamento. Atualize termos, cachês e lançamentos conforme o pedido (o valor fica no pedido, visível só para o Adm).'
    || case when coalesce(btrim(v_plan ->> 'note'), '') <> '' then E'\n' || 'Nota: ' || btrim(v_plan ->> 'note') else '' end);

  update public.budget_change_requests set status = 'confirmed', final_cents = v_final, brand_note = v_note, brand_by = auth.uid(), brand_label = v_label, brand_at = now() where id = c.id;
  perform public.budget_change_log(c.id, 'brand', 'confirmed', false, v_label,
    jsonb_build_object('reserved_cents', c.before_reserved_cents, 'offered_cents', c.before_offered_cents, 'period_start', r.period_start, 'period_end', r.period_end),
    jsonb_build_object('final_cents', v_final, 'applied', v_applied, 'plan', v_plan), v_note);
  perform public.budget_change_notify(c.id, 'confirmed', 'agency_manager');
  perform public.budget_change_notify(c.id, 'confirmed', 'brand_all');
  return 'confirmed';
end $$;
revoke execute on function public.brand_budget_change_answer(uuid, text, text) from public, anon;
grant execute on function public.brand_budget_change_answer(uuid, text, text) to authenticated, service_role;

-- interna: um pedido em JSON (com valores ou sem)
create or replace function public.budget_change_json(p_id uuid, p_values boolean, p_brand_view boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.budget_change_requests%rowtype; v jsonb;
begin
  select * into c from public.budget_change_requests where id = p_id;
  if c.id is null then return null; end if;
  v := jsonb_build_object('id', c.id, 'status', c.status, 'request_id', c.request_id, 'deal_id', c.deal_id,
    'created_label', c.created_label, 'created_at', c.created_at, 'created_by_me', c.created_by = auth.uid(), 'sent_at', c.sent_at,
    'agency_label', c.agency_label, 'agency_at', c.agency_at, 'brand_label', c.brand_label, 'brand_at', c.brand_at,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('side', ev.side, 'action', ev.action, 'label', ev.actor_label, 'at', ev.created_at,
                      'note', case when p_values then ev.note else '' end) order by ev.created_at, ev.id), '[]'::jsonb)
               from public.budget_change_events ev where ev.change_id = c.id and (p_brand_view or not ev.internal)));
  if p_values then
    v := v || jsonb_build_object('requested_cents', c.requested_cents, 'reason', c.reason, 'counter_cents', c.counter_cents, 'final_cents', c.final_cents,
      'before_offered_cents', c.before_offered_cents, 'before_committed_cents', c.before_committed_cents,
      'plan', c.plan, 'agency_note', c.agency_note, 'brand_note', c.brand_note,
      'talent_cents', (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', x ->> 'deal_talent_id', 'cents', (x ->> 'cents')::bigint,
                          'name', (select t.display_name from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id where dt.id = (x ->> 'deal_talent_id')::uuid))), '[]'::jsonb)
                       from jsonb_array_elements(c.talent_cents) x));
    -- a reserva interna da marca não vai para a agência
    if p_brand_view then v := v || jsonb_build_object('before_reserved_cents', c.before_reserved_cents); end if;
  end if;
  return v;
end $$;
revoke execute on function public.budget_change_json(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.budget_change_json(uuid, boolean, boolean) to service_role;

-- leitura da marca: pedido aberto, histórico e se pode pedir
create or replace function public.brand_budget_changes(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; d public.deals%rowtype; v_role text; v_items jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(r.brand_id);
  if v_role is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals x where x.request_id = r.id and x.brand_visible;
  if d.id is null and r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(public.budget_change_json(c.id, true, true) order by c.created_at desc), '[]'::jsonb) into v_items
  from public.budget_change_requests c where c.request_id = r.id;
  return jsonb_build_object('role', v_role,
    'can_request', v_role is not null and d.id is not null and d.stage <> 'closed' and r.status not in ('draft', 'cancelled', 'declined')
                   and not exists (select 1 from public.budget_change_requests c where c.request_id = r.id and c.status in ('pending_owner', 'open', 'proposed')),
    'items', v_items);
end $$;
revoke execute on function public.brand_budget_changes(uuid) from public, anon;
grant execute on function public.brand_budget_changes(uuid) to authenticated, service_role;

-- leitura da agência pelo negócio: Adm com valores; gestor+ e equipe do negócio só situação e linha do tempo
create or replace function public.agency_budget_changes(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(d.agency_id, 'admin');
  if not (v_admin or public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids())) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('can_decide', v_admin,
    'items', (select coalesce(jsonb_agg(public.budget_change_json(c.id, v_admin, false) order by c.created_at desc), '[]'::jsonb)
              from public.budget_change_requests c where c.deal_id = d.id and c.sent_at is not null));
end $$;
revoke execute on function public.agency_budget_changes(uuid) from public, anon;
grant execute on function public.agency_budget_changes(uuid) to authenticated, service_role;

-- 4) pagamentos da marca ----------------------------------------------------------------------------------------------
-- chave PIX normalizada (null = inválida): cpf/cnpj com dígito, e-mail, celular +55 DDD, chave aleatória (EVP)
create or replace function public.pix_key_normalize(p_type text, p_key text)
returns text language plpgsql immutable set search_path = '' as $$
declare k text := btrim(coalesce(p_key, '')); d text;
begin
  if k = '' then return null; end if;
  if p_type = 'cpf' then
    if public.br_tax_id_kind(k) = 'cpf' then return public.br_tax_id_normalize(k); end if;
    return null;
  elsif p_type = 'cnpj' then
    if public.br_tax_id_kind(k) = 'cnpj' then return public.br_tax_id_normalize(k); end if;
    return null;
  elsif p_type = 'email' then
    k := lower(k);
    if char_length(k) <= 77 and k ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return k; end if;
    return null;
  elsif p_type = 'phone' then
    d := regexp_replace(k, '[^0-9]', '', 'g');
    if char_length(d) in (12, 13) and left(d, 2) = '55' then d := substr(d, 3); end if;
    if char_length(d) in (10, 11) and left(d, 1) <> '0' and substr(d, 2, 1) <> '0' then return '+55' || d; end if;
    return null;
  elsif p_type = 'random' then
    k := lower(k);
    if k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return k; end if;
    return null;
  end if;
  return null;
end $$;
revoke execute on function public.pix_key_normalize(text, text) from public, anon;
grant execute on function public.pix_key_normalize(text, text) to authenticated, service_role;

create table if not exists public.agency_payment_settings (
  agency_id uuid primary key constraint agency_payment_settings_agency_fk references public.agencies (id) on delete cascade,
  pix_key_type text,
  pix_key text,
  bank_name text,
  bank_branch text,
  bank_account text,
  bank_account_type text,
  holder_name text not null,
  holder_tax_id text not null,
  instructions text not null default '',
  updated_by uuid constraint agency_payment_settings_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_payment_settings_pix_check check ((pix_key_type is null) = (pix_key is null)
    and (pix_key_type is null or (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random') and public.pix_key_normalize(pix_key_type, pix_key) = pix_key))),
  constraint agency_payment_settings_bank_check check (
    (bank_name is null and bank_branch is null and bank_account is null and bank_account_type is null)
    or (char_length(btrim(bank_name)) between 2 and 80 and bank_branch ~ '^[0-9]{1,6}(-[0-9Xx])?$' and bank_account ~ '^[0-9]{1,15}(-[0-9Xx]{1,2})?$'
        and bank_account_type in ('checking', 'savings'))),
  constraint agency_payment_settings_any_check check (pix_key is not null or bank_name is not null),
  constraint agency_payment_settings_holder_check check (char_length(btrim(holder_name)) between 2 and 120 and public.br_tax_id_kind(holder_tax_id) is not null
    and holder_tax_id = public.br_tax_id_normalize(holder_tax_id)),
  constraint agency_payment_settings_instructions_check check (char_length(instructions) <= 300)
);
drop trigger if exists agency_payment_settings_touch on public.agency_payment_settings;
create trigger agency_payment_settings_touch before update on public.agency_payment_settings for each row execute function public.set_updated_at();
alter table public.agency_payment_settings enable row level security;
revoke all on public.agency_payment_settings from public, anon, authenticated;
grant select on public.agency_payment_settings to authenticated;
grant all on public.agency_payment_settings to service_role;
drop policy if exists agency_payment_settings_select_admin on public.agency_payment_settings;
create policy agency_payment_settings_select_admin on public.agency_payment_settings for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists agency_payment_settings_select_agency on public.agency_payment_settings;
create policy agency_payment_settings_select_agency on public.agency_payment_settings for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));

create table if not exists public.brand_payment_installments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint brand_payment_installments_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint brand_payment_installments_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint brand_payment_installments_deal_fk references public.deals (id) on delete cascade,
  entry_id uuid not null constraint brand_payment_installments_entry_fk references public.financial_entries (id) on delete cascade,
  seq smallint not null,
  label text not null default '',
  amount_cents bigint not null,
  due_on date,
  status text not null default 'open',
  paid_at timestamptz,
  paid_by uuid constraint brand_payment_installments_paid_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_payment_installments_seq_check check (seq between 1 and 12),
  constraint brand_payment_installments_label_check check (char_length(label) <= 60),
  constraint brand_payment_installments_amount_check check (amount_cents between 0 and 10000000000),
  constraint brand_payment_installments_status_check check (status in ('open', 'paid')),
  constraint brand_payment_installments_paid_check check ((status = 'paid') = (paid_at is not null)),
  constraint brand_payment_installments_seq_uq unique (entry_id, seq)
);
create index if not exists brand_payment_installments_brand_idx on public.brand_payment_installments (brand_id, status, due_on);
create index if not exists brand_payment_installments_agency_idx on public.brand_payment_installments (agency_id, status, due_on);
drop trigger if exists brand_payment_installments_touch on public.brand_payment_installments;
create trigger brand_payment_installments_touch before update on public.brand_payment_installments for each row execute function public.set_updated_at();

create table if not exists public.brand_payment_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint brand_payment_reports_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint brand_payment_reports_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint brand_payment_reports_deal_fk references public.deals (id) on delete cascade,
  entry_id uuid not null constraint brand_payment_reports_entry_fk references public.financial_entries (id) on delete cascade,
  -- parcela redividida depois de uma recusa: o informe recusado fica no histórico do lançamento
  installment_id uuid constraint brand_payment_reports_installment_fk references public.brand_payment_installments (id) on delete set null,
  paid_on date not null,
  amount_cents bigint not null,
  document_id uuid constraint brand_payment_reports_document_fk references public.documents (id) on delete set null,
  note text not null default '',
  status text not null default 'reported',
  review_note text not null default '',
  reported_by uuid constraint brand_payment_reports_reported_by_fk references auth.users (id) on delete set null,
  reported_label text not null default '',
  reviewed_by uuid constraint brand_payment_reports_reviewed_by_fk references auth.users (id) on delete set null,
  reviewed_label text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_payment_reports_amount_check check (amount_cents between 1 and 10000000000),
  constraint brand_payment_reports_status_check check (status in ('reported', 'confirmed', 'rejected')),
  constraint brand_payment_reports_review_check check ((status = 'reported') = (reviewed_at is null)),
  constraint brand_payment_reports_note_check check (char_length(note) <= 500 and char_length(review_note) <= 500)
);
-- um informe aberto por parcela; um comprovante serve a um informe só
create unique index if not exists brand_payment_reports_open_uq on public.brand_payment_reports (installment_id) where status = 'reported';
create unique index if not exists brand_payment_reports_document_uq on public.brand_payment_reports (document_id) where document_id is not null;
create index if not exists brand_payment_reports_entry_idx on public.brand_payment_reports (entry_id, created_at desc);
create index if not exists brand_payment_reports_agency_idx on public.brand_payment_reports (agency_id, status);
drop trigger if exists brand_payment_reports_touch on public.brand_payment_reports;
create trigger brand_payment_reports_touch before update on public.brand_payment_reports for each row execute function public.set_updated_at();

alter table public.brand_payment_installments enable row level security;
alter table public.brand_payment_reports enable row level security;
revoke all on public.brand_payment_installments from public, anon, authenticated;
revoke all on public.brand_payment_reports from public, anon, authenticated;
grant select on public.brand_payment_installments, public.brand_payment_reports to authenticated;
grant all on public.brand_payment_installments, public.brand_payment_reports to service_role;
drop policy if exists brand_payment_installments_select_admin on public.brand_payment_installments;
create policy brand_payment_installments_select_admin on public.brand_payment_installments for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists brand_payment_installments_select_brand on public.brand_payment_installments;
create policy brand_payment_installments_select_brand on public.brand_payment_installments for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]) and deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
drop policy if exists brand_payment_installments_select_agency on public.brand_payment_installments;
create policy brand_payment_installments_select_agency on public.brand_payment_installments for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists brand_payment_reports_select_admin on public.brand_payment_reports;
create policy brand_payment_reports_select_admin on public.brand_payment_reports for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists brand_payment_reports_select_brand on public.brand_payment_reports;
create policy brand_payment_reports_select_brand on public.brand_payment_reports for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]) and deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
drop policy if exists brand_payment_reports_select_agency on public.brand_payment_reports;
create policy brand_payment_reports_select_agency on public.brand_payment_reports for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));

-- todo "a receber da marca" nasce com uma parcela; liquidado pelo caminho antigo marca as parcelas pagas
create or replace function public.finance_installments_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'brand_receivable' then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.brand_payment_installments (agency_id, brand_id, deal_id, entry_id, seq, amount_cents, due_on)
    values (new.agency_id, new.brand_id, new.deal_id, new.id, 1, new.amount_cents, new.due_on)
    on conflict (entry_id, seq) do nothing;
  elsif new.status = 'settled' and old.status is distinct from 'settled' then
    update public.brand_payment_installments set status = 'paid', paid_at = coalesce(new.settled_at, now()), paid_by = new.settled_by
    where entry_id = new.id and status = 'open';
  end if;
  return new;
end $$;
revoke execute on function public.finance_installments_sync() from public, anon, authenticated;
drop trigger if exists financial_entries_installments on public.financial_entries;
create trigger financial_entries_installments after insert or update of status on public.financial_entries for each row execute function public.finance_installments_sync();

-- backfill: lançamentos que já existem
insert into public.brand_payment_installments (agency_id, brand_id, deal_id, entry_id, seq, amount_cents, due_on, status, paid_at, paid_by)
select f.agency_id, f.brand_id, f.deal_id, f.id, 1, f.amount_cents, f.due_on,
       case when f.status = 'settled' then 'paid' else 'open' end, case when f.status = 'settled' then coalesce(f.settled_at, now()) end, f.settled_by
from public.financial_entries f
where f.kind = 'brand_receivable' and not exists (select 1 from public.brand_payment_installments i where i.entry_id = f.id)
on conflict (entry_id, seq) do nothing;

-- Adm: dados de pagamento da agência
create or replace function public.agency_payment_settings_save(p_agency uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pix_type text; v_pix text; v_bank text; v_branch text; v_account text; v_acc_type text; v_holder text; v_tax text; v_instr text; v_before jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_pix_type := nullif(btrim(coalesce(p_data ->> 'pix_key_type', '')), '');
  v_pix := nullif(btrim(coalesce(p_data ->> 'pix_key', '')), '');
  if (v_pix_type is null) <> (v_pix is null) then raise exception 'invalid_pix_key' using errcode = '22023'; end if;
  if v_pix_type is not null then
    if v_pix_type not in ('cpf', 'cnpj', 'email', 'phone', 'random') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_pix := public.pix_key_normalize(v_pix_type, v_pix);
    if v_pix is null then raise exception 'invalid_pix_key' using errcode = '22023'; end if;
  end if;
  v_bank := nullif(btrim(coalesce(p_data ->> 'bank_name', '')), '');
  v_branch := nullif(btrim(coalesce(p_data ->> 'bank_branch', '')), '');
  v_account := nullif(btrim(coalesce(p_data ->> 'bank_account', '')), '');
  v_acc_type := nullif(btrim(coalesce(p_data ->> 'bank_account_type', '')), '');
  if not ((v_bank is null and v_branch is null and v_account is null)
          or (v_bank is not null and v_branch is not null and v_account is not null)) then raise exception 'invalid_bank' using errcode = '22023'; end if;
  if v_bank is null then v_acc_type := null; else v_acc_type := coalesce(v_acc_type, 'checking'); end if;
  if v_bank is not null and (char_length(v_bank) not between 2 and 80 or v_branch !~ '^[0-9]{1,6}(-[0-9Xx])?$'
                             or v_account !~ '^[0-9]{1,15}(-[0-9Xx]{1,2})?$' or v_acc_type not in ('checking', 'savings')) then
    raise exception 'invalid_bank' using errcode = '22023';
  end if;
  if v_pix is null and v_bank is null then raise exception 'payment_method_required' using errcode = '22023'; end if;
  v_holder := btrim(regexp_replace(coalesce(p_data ->> 'holder_name', ''), '\s+', ' ', 'g'));
  if char_length(v_holder) not between 2 and 120 then raise exception 'name_required' using errcode = '22023'; end if;
  v_tax := public.br_tax_id_normalize(coalesce(p_data ->> 'holder_tax_id', ''));
  if public.br_tax_id_kind(v_tax) is null then raise exception 'invalid_tax_id' using errcode = '22023'; end if;
  v_instr := btrim(coalesce(p_data ->> 'instructions', ''));
  if char_length(v_instr) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select to_jsonb(s) - 'updated_by' - 'created_at' - 'updated_at' into v_before from public.agency_payment_settings s where s.agency_id = p_agency;
  insert into public.agency_payment_settings (agency_id, pix_key_type, pix_key, bank_name, bank_branch, bank_account, bank_account_type, holder_name, holder_tax_id, instructions, updated_by)
  values (p_agency, v_pix_type, v_pix, v_bank, v_branch, v_account, v_acc_type, v_holder, v_tax, v_instr, auth.uid())
  on conflict (agency_id) do update set pix_key_type = excluded.pix_key_type, pix_key = excluded.pix_key, bank_name = excluded.bank_name,
    bank_branch = excluded.bank_branch, bank_account = excluded.bank_account, bank_account_type = excluded.bank_account_type,
    holder_name = excluded.holder_name, holder_tax_id = excluded.holder_tax_id, instructions = excluded.instructions, updated_by = excluded.updated_by;
  perform public.audit_log('finance.payment_settings', 'agency', p_agency::text, coalesce(v_before, '{}'::jsonb) || jsonb_build_object('agency_id', p_agency),
    jsonb_build_object('agency_id', p_agency, 'pix_key_type', v_pix_type, 'bank', v_bank is not null), null, public.talent_audit_actor('agency', p_agency));
end $$;
revoke execute on function public.agency_payment_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.agency_payment_settings_save(uuid, jsonb) to authenticated, service_role;

-- Adm: divide o "a receber" em parcelas (somando o total), enquanto nada foi informado nem pago
create or replace function public.agency_receivable_split(p_entry uuid, p_parts jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare e public.financial_entries%rowtype; p jsonb; v_n int := 0; v_sum bigint := 0; v_amount bigint; v_due date; v_label text; v_first date; v_title text;
        v_before jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into e from public.financial_entries where id = p_entry for update;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(e.agency_id, 'admin') then
    if public.agency_can(e.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.kind <> 'brand_receivable' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if e.status not in ('planned', 'due') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.brand_payment_installments i where i.entry_id = e.id and i.status = 'paid')
     or exists (select 1 from public.brand_payment_reports r where r.entry_id = e.id and r.status = 'reported') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) not between 1 and 12 then raise exception 'invalid_input' using errcode = '22023'; end if;
  for p in select value from jsonb_array_elements(p_parts) loop
    begin
      v_amount := (p ->> 'amount_cents')::bigint; v_due := (p ->> 'due_on')::date;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    v_label := btrim(coalesce(p ->> 'label', ''));
    if v_amount is null or v_amount < 1 or v_due is null or char_length(v_label) > 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_due < (e.created_at at time zone 'UTC')::date - 366 or v_due > (e.created_at at time zone 'UTC')::date + 731 then raise exception 'invalid_date' using errcode = '22023'; end if;
    v_sum := v_sum + v_amount;
  end loop;
  if v_sum <> e.amount_cents then raise exception 'installments_sum' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('label', i.label, 'amount_cents', i.amount_cents, 'due_on', i.due_on) order by i.seq), '[]'::jsonb) into v_before
  from public.brand_payment_installments i where i.entry_id = e.id;
  delete from public.brand_payment_installments i where i.entry_id = e.id;
  for p in select value from jsonb_array_elements(p_parts) loop
    v_n := v_n + 1;
    insert into public.brand_payment_installments (agency_id, brand_id, deal_id, entry_id, seq, label, amount_cents, due_on)
    values (e.agency_id, e.brand_id, e.deal_id, e.id, v_n, btrim(coalesce(p ->> 'label', '')), (p ->> 'amount_cents')::bigint, (p ->> 'due_on')::date);
  end loop;
  select min(i.due_on) into v_first from public.brand_payment_installments i where i.entry_id = e.id;
  update public.financial_entries set due_on = v_first where id = e.id;
  perform public.audit_log('finance.receivable_split', 'financial_entry', e.id::text, jsonb_build_object('agency_id', e.agency_id, 'parts', v_before),
    jsonb_build_object('agency_id', e.agency_id, 'parts', p_parts), null, public.talent_audit_actor('agency', e.agency_id));
  select d.title into v_title from public.deals d where d.id = e.deal_id;
  perform public.inbox_notify_brand(e.brand_id, false, 'payment_plan', '/marca/pagamentos', jsonb_build_object('deal', left(coalesce(v_title, ''), 120), 'step', v_n::text),
    e.agency_id, 'payment', e.id, 'payment_plan:' || e.id::text || ':' || md5(p_parts::text));
  return v_n;
end $$;
revoke execute on function public.agency_receivable_split(uuid, jsonb) from public, anon;
grant execute on function public.agency_receivable_split(uuid, jsonb) to authenticated, service_role;

-- marca (dono ou equipe): informa o pagamento de uma parcela, com comprovante opcional
create or replace function public.brand_payment_report(p_installment uuid, p_paid_on date, p_amount_cents bigint, p_document uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.brand_payment_installments%rowtype; e public.financial_entries%rowtype; v_doc record; v_note text := btrim(coalesce(p_note, '')); v_tz text; v_today date;
        v_id uuid; v_title text; v_brand text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into i from public.brand_payment_installments where id = p_installment for update;
  if i.id is null or public.brand_member_of(i.brand_id) is null or not exists (select 1 from public.deals d where d.id = i.deal_id and d.brand_visible) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into e from public.financial_entries where id = i.entry_id;
  if i.status <> 'open' or e.status not in ('planned', 'due') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.brand_payment_reports r where r.installment_id = i.id and r.status = 'reported') then raise exception 'payment_open' using errcode = 'P0001'; end if;
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = i.agency_id;
  v_today := (now() at time zone v_tz)::date;
  if p_paid_on is null or p_paid_on > v_today or p_paid_on < v_today - 366 then raise exception 'invalid_date' using errcode = '22023'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_document is not null then
    select doc.id, doc.status, doc.uploaded_by, doc.uploader_side, doc.deal_id into v_doc from public.documents doc where doc.id = p_document for update;
    if v_doc.id is null or v_doc.uploaded_by is distinct from auth.uid() or v_doc.uploader_side <> 'brand' or v_doc.deal_id is distinct from i.deal_id then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_doc.status <> 'ready' or exists (select 1 from public.brand_payment_reports r where r.document_id = p_document) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    -- o comprovante tem valor: Adm e a própria marca leem; gestor/colaborador e creator não
    update public.documents set restricted = true, share_talent = false where id = p_document;
  end if;
  insert into public.brand_payment_reports (agency_id, brand_id, deal_id, entry_id, installment_id, paid_on, amount_cents, document_id, note, reported_by, reported_label)
  values (i.agency_id, i.brand_id, i.deal_id, i.entry_id, i.id, p_paid_on, p_amount_cents, p_document, v_note, auth.uid(), public.actor_label(i.agency_id, i.brand_id))
  returning id into v_id;
  perform public.audit_log('finance.payment_report', 'brand_payment_report', v_id::text, null,
    jsonb_build_object('agency_id', i.agency_id, 'brand_id', i.brand_id, 'installment_id', i.id, 'amount_cents', p_amount_cents, 'paid_on', p_paid_on), null, 'brand'::public.actor_type);
  select d.title into v_title from public.deals d where d.id = i.deal_id;
  select b.name into v_brand from public.brands b where b.id = i.brand_id;
  perform public.inbox_notify_agency(i.agency_id, 'admin', 'payment_reported', '/agencia/financeiro?f=payments',
    jsonb_build_object('deal', left(coalesce(v_title, ''), 120), 'brand', left(coalesce(v_brand, ''), 120)), 'payment', v_id, 'payment_reported:' || v_id::text);
  return v_id;
end $$;
revoke execute on function public.brand_payment_report(uuid, date, bigint, uuid, text) from public, anon;
grant execute on function public.brand_payment_report(uuid, date, bigint, uuid, text) to authenticated, service_role;

-- Adm: confirma o recebimento (parcela paga; todas pagas → lançamento liquidado pela regra da 0072) ou recusa (nota)
create or replace function public.agency_payment_review(p_report uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.brand_payment_reports%rowtype; e public.financial_entries%rowtype; v_note text := btrim(coalesce(p_note, '')); v_title text; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('confirm', 'reject') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into r from public.brand_payment_reports where id = p_report for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(r.agency_id, 'admin') then
    if public.agency_can(r.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status <> 'reported' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'reject' and char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
  v_status := case when p_decision = 'confirm' then 'confirmed' else 'rejected' end;
  update public.brand_payment_reports set status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_label = public.actor_label(r.agency_id, null), reviewed_at = now()
  where id = r.id;
  if p_decision = 'confirm' then
    update public.brand_payment_installments set status = 'paid', paid_at = now(), paid_by = auth.uid() where id = r.installment_id and status = 'open';
    select * into e from public.financial_entries where id = r.entry_id for update;
    if e.status in ('planned', 'due') and not exists (select 1 from public.brand_payment_installments i where i.entry_id = e.id and i.status = 'open') then
      perform public.agency_entry_set_status(e.id, 'settled', null);
    end if;
  end if;
  perform public.audit_log('finance.payment_review', 'brand_payment_report', r.id::text, jsonb_build_object('agency_id', r.agency_id, 'status', 'reported'),
    jsonb_build_object('agency_id', r.agency_id, 'status', v_status), nullif(v_note, ''), public.talent_audit_actor('agency', r.agency_id));
  select d.title into v_title from public.deals d where d.id = r.deal_id;
  perform public.inbox_notify_brand(r.brand_id, false, 'payment_reviewed', '/marca/pagamentos', jsonb_build_object('deal', left(coalesce(v_title, ''), 120), 'status', v_status),
    r.agency_id, 'payment', r.id, 'payment_reviewed:' || r.id::text);
  return v_status;
end $$;
revoke execute on function public.agency_payment_review(uuid, text, text) from public, anon;
grant execute on function public.agency_payment_review(uuid, text, text) to authenticated, service_role;

-- interna: um "a receber" com parcelas e o último informe de cada uma
create or replace function public.brand_receivable_json(p_entry uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('entry_id', f.id, 'deal_id', f.deal_id, 'request_id', d.request_id,
    'title', coalesce(nullif(btrim(r.title), ''), d.title), 'brand_id', f.brand_id, 'brand_name', b.name, 'agency_id', f.agency_id, 'agency_name', a.name,
    'origin', case when r.sponsorship_id is not null then 'sponsorship' when r.brand_call_id is not null then 'call' else 'campaign' end,
    'total_cents', f.amount_cents, 'entry_status', f.status, 'due_on', f.due_on, 'settled_at', f.settled_at,
    'installments', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'seq', i.seq, 'label', i.label, 'amount_cents', i.amount_cents, 'due_on', i.due_on,
        'status', case when f.status = 'settled' then 'paid' else i.status end, 'paid_at', coalesce(i.paid_at, f.settled_at),
        'report', (select jsonb_build_object('id', x.id, 'status', x.status, 'paid_on', x.paid_on, 'amount_cents', x.amount_cents, 'note', x.note,
                     'review_note', x.review_note, 'document_id', x.document_id, 'reported_label', x.reported_label, 'reviewed_label', x.reviewed_label,
                     'created_at', x.created_at, 'reviewed_at', x.reviewed_at)
                   from public.brand_payment_reports x where x.installment_id = i.id order by x.created_at desc, x.id desc limit 1),
        'history', (select count(*) from public.brand_payment_reports x where x.installment_id = i.id))
      order by i.seq), '[]'::jsonb) from public.brand_payment_installments i where i.entry_id = f.id))
  from public.financial_entries f join public.deals d on d.id = f.deal_id join public.brands b on b.id = f.brand_id join public.agencies a on a.id = f.agency_id
  left join public.campaign_requests r on r.id = d.request_id
  where f.id = p_entry
$$;
revoke execute on function public.brand_receivable_json(uuid) from public, anon, authenticated;
grant execute on function public.brand_receivable_json(uuid) to service_role;

-- interna: dados de pagamento como a marca lê
create or replace function public.agency_payment_settings_json(p_agency uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('pix_key_type', s.pix_key_type, 'pix_key', s.pix_key, 'bank_name', s.bank_name, 'bank_branch', s.bank_branch,
    'bank_account', s.bank_account, 'bank_account_type', s.bank_account_type, 'holder_name', s.holder_name, 'holder_tax_id', s.holder_tax_id,
    'instructions', s.instructions, 'updated_at', s.updated_at)
  from public.agency_payment_settings s where s.agency_id = p_agency
$$;
revoke execute on function public.agency_payment_settings_json(uuid) from public, anon, authenticated;
grant execute on function public.agency_payment_settings_json(uuid) to service_role;

-- marca: tudo que deve à agência (lançamentos não cancelados dos negócios visíveis), com os dados de pagamento
create or replace function public.brand_payments(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_items jsonb; v_agencies jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(public.brand_receivable_json(f.id) order by (f.status = 'settled'), f.due_on nulls last, f.created_at), '[]'::jsonb) into v_items
  from public.financial_entries f join public.deals d on d.id = f.deal_id
  where f.brand_id = p_brand and f.kind = 'brand_receivable' and f.status <> 'cancelled' and d.brand_visible;
  select coalesce(jsonb_agg(jsonb_build_object('agency_id', a.id, 'name', a.name, 'timezone', coalesce(a.timezone, 'America/Sao_Paulo'),
           'settings', public.agency_payment_settings_json(a.id)) order by a.name), '[]'::jsonb) into v_agencies
  from public.agencies a where a.id in (select (x ->> 'agency_id')::uuid from jsonb_array_elements(v_items) x);
  return jsonb_build_object('role', v_role, 'items', v_items, 'agencies', v_agencies);
end $$;
revoke execute on function public.brand_payments(uuid) from public, anon;
grant execute on function public.brand_payments(uuid) to authenticated, service_role;

-- Adm da agência: os "a receber" das marcas com parcelas e informes
create or replace function public.agency_brand_payments(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'timezone', (select coalesce(a.timezone, 'America/Sao_Paulo') from public.agencies a where a.id = p_agency),
    'has_settings', exists (select 1 from public.agency_payment_settings s where s.agency_id = p_agency),
    'items', (select coalesce(jsonb_agg(public.brand_receivable_json(f.id) order by (f.status = 'settled'), f.due_on nulls last, f.created_at), '[]'::jsonb)
              from public.financial_entries f where f.agency_id = p_agency and f.kind = 'brand_receivable' and f.status <> 'cancelled'));
end $$;
revoke execute on function public.agency_brand_payments(uuid) from public, anon;
grant execute on function public.agency_brand_payments(uuid) to authenticated, service_role;

-- cron diário: aviso de vencimento (3 dias antes, no dia, 3 dias depois) para a marca e o Adm da agência
create or replace function public.brand_payment_due_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare x record; v_band text; v_n int := 0; v_params jsonb; v_dedupe text;
begin
  for x in select i.id, i.agency_id, i.brand_id, i.due_on, i.deal_id, d.title,
                  i.due_on - (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date as days
           from public.brand_payment_installments i
           join public.financial_entries f on f.id = i.entry_id
           join public.deals d on d.id = i.deal_id
           join public.agencies a on a.id = i.agency_id
           where i.status = 'open' and i.due_on is not null and f.status in ('planned', 'due') and d.brand_visible and a.status = 'active'
             and not exists (select 1 from public.brand_payment_reports r where r.installment_id = i.id and r.status = 'reported') loop
    v_band := case when x.days between 1 and 3 then 'soon' when x.days between -2 and 0 then 'today' when x.days between -10 and -3 then 'late' end;
    continue when v_band is null;
    v_params := jsonb_build_object('deal', left(coalesce(x.title, ''), 120), 'status', v_band, 'date', to_char(x.due_on, 'YYYY-MM-DD'));
    v_dedupe := 'payment_due:' || x.id::text || ':' || x.due_on::text || ':' || v_band;
    v_n := v_n + public.inbox_notify_brand(x.brand_id, false, 'payment_due', '/marca/pagamentos', v_params, x.agency_id, 'payment', x.id, v_dedupe);
    v_n := v_n + public.inbox_notify_agency(x.agency_id, 'admin', 'payment_due', '/agencia/financeiro?f=payments', v_params, 'payment', x.id, v_dedupe);
  end loop;
  return v_n;
end $$;
revoke execute on function public.brand_payment_due_scan() from public, anon, authenticated;
grant execute on function public.brand_payment_due_scan() to service_role;

notify pgrst, 'reload schema';
