-- =============================================================================
-- Groscove Ultra · 0082 · Gestão: verba da marca, ganhos do influenciador, nota fiscal e pagamento
-- Bloco 5. Cenário S89. Idempotente; nenhuma função nova para anon (S14 segue 18); tudo simulado (nada é cobrança).
--
-- Decisões:
--   • Verba da marca (brand_budgets): o valor que a marca RESERVA para a campanha e, se quiser, para cada
--     influenciador mostrado a ela (proposto/contratado). É planejamento interno da marca: a agência não lê
--     (a faixa informada à agência continua em campaign_request_budgets). Só o dono da marca (diretor) define ou
--     limpa; a equipe lê. Sem verba própria, a campanha da marca usa o máximo da faixa informada à agência
--     ("reserved_source" = offered) — a marca não precisa digitar duas vezes.
--   • Comprometido = o que a marca paga pelos contratados (modelo V = F + C da 0072): por influenciador,
--     repasse + round(repasse × taxa) do próprio lançamento (ou cachê × taxa do negócio enquanto não há
--     lançamento); na campanha, o "a receber da marca" (brand_receivable) quando existe. A marca nunca vê cachê
--     nem comissão separados, só o total dela. Pago = lançamento da marca liquidado (o pagamento é um só por
--     negócio, então cada influenciador conta como pago junto). A soma por influenciador pode diferir do total
--     em 1 centavo por arredondamento; o total da campanha é sempre o do lançamento.
--   • Verba estourada (comprometido > reservado) aparece no painel da campanha, na visão geral em /marca e no
--     "Depende de mim hoje" (o app junta a visão geral ao workboard, sem recriar brand_workboard). Quando a
--     contratação gera o lançamento e a verba já estoura, os donos da marca recebem o aviso budget_exceeded
--     (uma vez por campanha, sem valor no aviso).
--   • Ganhos do influenciador: talent_payouts (MESMA assinatura) passa a trazer marca, data agendada, se já
--     entregou (todas as entregas dele publicadas/comprovadas/concluídas, ou negócio ganho) e a última nota
--     fiscal ("última" = a aberta, que é no máximo uma; sem aberta, a mais recente). A classificação (a receber / previsão / pagos) e a situação do pagamento (aguardando nota, nota
--     enviada, nota aprovada, agendado, pago) são lógica pura no app (src/lib/finance/earnings.ts, vitest).
--   • Nota fiscal (payout_invoices, com histórico): o influenciador envia o arquivo pelo armazenamento de
--     documentos que já existe (document_reserve no escopo do negócio, tipo "other") e liga ao repasse
--     (payout_invoice_attach). Ao ligar, o documento vira restrito: tem valor, então só o Adm da agência (e o
--     próprio influenciador) o leem — gestor e colaborador não. Uma nota aberta (enviada ou aprovada) por
--     repasse; recusada, ele envia outra. O Adm aprova (podendo já agendar a data) ou recusa com nota (≥ 5
--     letras); agenda/reagenda a data (agency_payout_schedule; "planned" vira "due") e marca como pago pela RPC
--     que já existe (agency_entry_set_status). Pagar NÃO exige nota aprovada: influenciador pessoa física pode
--     receber por RPA, sem nota — a agência decide.
--   • Avisos novos: invoice_submitted (Adm), invoice_reviewed e payout_scheduled (influenciador), budget_exceeded
--     (donos da marca). Nenhum vira push (inbox_kind_pushes fica igual). Entidade nova: 'invoice'. Os parâmetros
--     usam só os tokens que o sino já entende (deal, talent, status, date): a decisão vai em "status".
--   • talent_today (MESMA assinatura) ganha "payouts" (sem valores): repasses abertos com entrega feita e nota
--     pendente/recusada, e pagamentos agendados — o app põe no "Hoje".
--   • financial_entries ganha scheduled_on (data agendada do pagamento); grant de coluna explícito (0072 8a).
-- =============================================================================

-- 1) avisos novos (todos os valores anteriores da 0081 + os do bloco 5) --------------------------------------------
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
  'invoice_submitted', 'invoice_reviewed', 'payout_scheduled', 'budget_exceeded'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice'));

-- 2) data agendada do pagamento ----------------------------------------------------------------------------------
alter table public.financial_entries add column if not exists scheduled_on date;
grant select (scheduled_on) on public.financial_entries to authenticated;

-- 3) nota fiscal por repasse (histórico) -------------------------------------------------------------------------
create table if not exists public.payout_invoices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint payout_invoices_agency_fk references public.agencies (id) on delete cascade,
  entry_id uuid not null constraint payout_invoices_entry_fk references public.financial_entries (id) on delete cascade,
  deal_id uuid not null constraint payout_invoices_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid not null constraint payout_invoices_talent_fk references public.talent_profiles (id) on delete cascade,
  document_id uuid not null constraint payout_invoices_document_fk references public.documents (id) on delete cascade,
  status text not null default 'submitted',
  review_note text not null default '',
  submitted_by uuid constraint payout_invoices_submitted_by_fk references auth.users (id) on delete set null,
  reviewed_by uuid constraint payout_invoices_reviewed_by_fk references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_invoices_status_check check (status in ('submitted', 'approved', 'rejected')),
  constraint payout_invoices_review_check check ((status = 'submitted') = (reviewed_at is null)),
  constraint payout_invoices_note_check check (char_length(review_note) <= 500),
  constraint payout_invoices_document_uq unique (document_id)
);
-- uma nota aberta (enviada ou aprovada) por repasse
create unique index if not exists payout_invoices_open_uq on public.payout_invoices (entry_id) where status in ('submitted', 'approved');
create index if not exists payout_invoices_entry_idx on public.payout_invoices (entry_id, created_at desc);
create index if not exists payout_invoices_agency_idx on public.payout_invoices (agency_id, status);
create index if not exists payout_invoices_talent_idx on public.payout_invoices (talent_id);
drop trigger if exists payout_invoices_touch on public.payout_invoices;
create trigger payout_invoices_touch before update on public.payout_invoices for each row execute function public.set_updated_at();

alter table public.payout_invoices enable row level security;
revoke all on public.payout_invoices from public, anon, authenticated;
grant select on public.payout_invoices to authenticated;
grant all on public.payout_invoices to service_role;
drop policy if exists payout_invoices_select_admin on public.payout_invoices;
create policy payout_invoices_select_admin on public.payout_invoices for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists payout_invoices_select_agency on public.payout_invoices;
create policy payout_invoices_select_agency on public.payout_invoices for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists payout_invoices_select_talent on public.payout_invoices;
create policy payout_invoices_select_talent on public.payout_invoices for select to authenticated
  using (talent_id = (select public.my_talent_id()));

-- 4) verba reservada pela marca ------------------------------------------------------------------------------------
create table if not exists public.brand_budgets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null constraint brand_budgets_brand_fk references public.brands (id) on delete cascade,
  request_id uuid not null constraint brand_budgets_request_fk references public.campaign_requests (id) on delete cascade,
  -- null = a campanha inteira; preenchido = um influenciador da campanha
  deal_talent_id uuid constraint brand_budgets_deal_talent_fk references public.deal_talents (id) on delete cascade,
  total_cents bigint not null,
  updated_by uuid constraint brand_budgets_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_budgets_total_check check (total_cents between 0 and 10000000000)
);
create unique index if not exists brand_budgets_uq on public.brand_budgets (request_id, deal_talent_id) nulls not distinct;
create index if not exists brand_budgets_brand_idx on public.brand_budgets (brand_id);
drop trigger if exists brand_budgets_touch on public.brand_budgets;
create trigger brand_budgets_touch before update on public.brand_budgets for each row execute function public.set_updated_at();

alter table public.brand_budgets enable row level security;
revoke all on public.brand_budgets from public, anon, authenticated;
grant select on public.brand_budgets to authenticated;
grant all on public.brand_budgets to service_role;
drop policy if exists brand_budgets_select_admin on public.brand_budgets;
create policy brand_budgets_select_admin on public.brand_budgets for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists brand_budgets_select_brand on public.brand_budgets;
create policy brand_budgets_select_brand on public.brand_budgets for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]) and request_id = any ((select public.my_brand_visible_request_ids())::uuid[]));

-- 5) conta da verba (interna): reservado, comprometido e pago de uma campanha, por influenciador -------------------
-- Escopo igual ao que a marca já enxerga: negócio visível, influenciador proposto/contratado a partir da proposta
-- enviada (= my_brand_deal_talent_ids), calculado pelo pedido para o admin da plataforma ler o mesmo painel.
create or replace function public.brand_budget_compute(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; d public.deals%rowtype; v_rate int; v_reserved bigint; v_source text := 'none'; v_offered bigint;
        v_recv public.financial_entries%rowtype; v_talents jsonb; v_sum bigint; v_committed bigint; v_paid bigint;
begin
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null then return null; end if;
  select * into d from public.deals x where x.request_id = r.id and x.brand_visible;
  if r.origin = 'brand' then
    select b.budget_max_cents into v_offered from public.campaign_request_budgets b where b.request_id = r.id;
  end if;
  select bb.total_cents into v_reserved from public.brand_budgets bb where bb.request_id = r.id and bb.deal_talent_id is null;
  if v_reserved is not null then v_source := 'set';
  elsif v_offered is not null then v_reserved := v_offered; v_source := 'offered';
  end if;
  if d.id is not null then
    select coalesce(d.service_rate_bp, a.service_rate_bp, 0) into v_rate from public.agencies a where a.id = d.agency_id;
    select * into v_recv from public.financial_entries f where f.deal_id = d.id and f.kind = 'brand_receivable' and f.status <> 'cancelled';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', s.id, 'talent_name', s.talent_name, 'status', s.status,
           'reserved_cents', s.reserved, 'committed_cents', s.committed,
           'paid_cents', case when v_recv.status = 'settled' then s.committed else 0 end,
           'over', s.reserved is not null and s.committed > s.reserved) order by s.created_at), '[]'::jsonb),
         coalesce(sum(s.committed), 0)
    into v_talents, v_sum
  from (select dt.id, dt.status, dt.created_at, t.display_name as talent_name,
               (select bb.total_cents from public.brand_budgets bb where bb.request_id = r.id and bb.deal_talent_id = dt.id) as reserved,
               case when dt.status <> 'contracted' then 0::bigint
                    else coalesce((select p.amount_cents + round(p.amount_cents * p.rate_bp / 10000.0)::bigint from public.financial_entries p
                                   where p.deal_talent_id = dt.id and p.kind = 'talent_payout' and p.status <> 'cancelled'),
                                  (select fe.fee_cents + round(fe.fee_cents * v_rate / 10000.0)::bigint from public.deal_talent_fees fe where fe.deal_talent_id = dt.id),
                                  0::bigint) end as committed
        from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id
        where d.id is not null and dt.deal_id = d.id and dt.status in ('proposed', 'contracted')
          and d.stage in ('proposal_sent', 'negotiation', 'approved', 'contracting', 'production', 'approval', 'delivery', 'closed')
          and not (d.stage = 'closed' and d.outcome in ('lost', 'cancelled'))) s;
  v_committed := coalesce(v_recv.amount_cents, v_sum);
  v_paid := case when v_recv.status = 'settled' then v_recv.amount_cents else 0 end;
  return jsonb_build_object(
    'request_id', r.id, 'title', r.title, 'brand_id', r.brand_id,
    'brand_status', case when d.id is null then case when r.status = 'cancelled' then 'cancelled' else 'draft' end else public.deal_brand_status(d.stage, d.outcome) end,
    'reserved_cents', v_reserved, 'reserved_source', v_source, 'offered_cents', v_offered,
    'committed_cents', v_committed, 'paid_cents', v_paid, 'open_cents', greatest(v_committed - v_paid, 0),
    'remaining_cents', case when v_reserved is null then null else v_reserved - v_committed end,
    'over', v_reserved is not null and v_committed > v_reserved,
    'talents_over', (select count(*) from jsonb_array_elements(v_talents) e where (e ->> 'over')::boolean),
    'payment_due_on', case when v_recv.status in ('planned', 'due') then v_recv.due_on end,
    'payment_status', v_recv.status,
    'talents', v_talents);
end $$;
revoke execute on function public.brand_budget_compute(uuid) from public, anon, authenticated;
grant execute on function public.brand_budget_compute(uuid) to service_role;

-- painel da campanha (membro da marca ou admin da plataforma; pedido que a marca enxerga)
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
  return public.brand_budget_compute(p_request) || jsonb_build_object('can_edit', v_role = 'owner');
end $$;
revoke execute on function public.brand_budget_summary(uuid) from public, anon;
grant execute on function public.brand_budget_summary(uuid) to authenticated, service_role;

-- visão geral da marca: campanhas enviadas (não rascunho nem cancelada) com verba ou contratação, e os totais
create or replace function public.brand_budget_overview(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_items jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(x.j - 'talents' order by (x.j ->> 'over')::boolean desc, x.updated desc), '[]'::jsonb) into v_items
  from (select public.brand_budget_compute(r.id) as j, greatest(r.updated_at, coalesce(d.stage_changed_at, r.updated_at)) as updated
        from public.campaign_requests r left join public.deals d on d.request_id = r.id
        where r.brand_id = p_brand and r.status not in ('draft', 'cancelled', 'declined')
          and (r.origin = 'brand' or coalesce(d.brand_visible, false))
          and not coalesce(d.stage = 'closed' and d.outcome in ('lost', 'cancelled'), false)) x
  where (x.j ->> 'reserved_cents') is not null or (x.j ->> 'committed_cents')::bigint > 0;
  return jsonb_build_object('role', v_role, 'items', v_items,
    'reserved_cents', (select coalesce(sum((e ->> 'reserved_cents')::bigint), 0) from jsonb_array_elements(v_items) e),
    'committed_cents', (select coalesce(sum((e ->> 'committed_cents')::bigint), 0) from jsonb_array_elements(v_items) e),
    'paid_cents', (select coalesce(sum((e ->> 'paid_cents')::bigint), 0) from jsonb_array_elements(v_items) e),
    'over_count', (select count(*) from jsonb_array_elements(v_items) e where (e ->> 'over')::boolean or (e ->> 'talents_over')::int > 0));
end $$;
revoke execute on function public.brand_budget_overview(uuid) from public, anon;
grant execute on function public.brand_budget_overview(uuid) to authenticated, service_role;

-- define ou limpa (null) a verba da campanha ou de um influenciador dela (só o dono da marca)
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

-- aviso aos donos da marca quando a contratação gera o lançamento e a verba já estoura (uma vez por campanha)
create or replace function public.finance_budget_watch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v jsonb;
begin
  if new.kind <> 'brand_receivable' or new.status = 'cancelled' then return new; end if;
  select * into d from public.deals where id = new.deal_id;
  if d.request_id is null or not d.brand_visible then return new; end if;
  v := public.brand_budget_compute(d.request_id);
  if v is not null and ((v ->> 'over')::boolean or (v ->> 'talents_over')::int > 0) then
    perform public.inbox_notify_brand(d.brand_id, true, 'budget_exceeded', '/marca/campanhas/' || d.request_id::text || '#camp-budget',
      jsonb_build_object('deal', left(coalesce(nullif(btrim(v ->> 'title'), ''), d.title), 120)), d.agency_id, 'request', d.request_id,
      'budget_exceeded:' || d.request_id::text);
  end if;
  return new;
end $$;
revoke execute on function public.finance_budget_watch() from public, anon, authenticated;
drop trigger if exists financial_entries_budget_watch on public.financial_entries;
create trigger financial_entries_budget_watch after insert on public.financial_entries for each row execute function public.finance_budget_watch();

-- 6) nota fiscal: o influenciador liga o documento enviado ao repasse -----------------------------------------------
create or replace function public.payout_invoice_attach(p_entry uuid, p_document uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.financial_entries%rowtype; v_doc record; v_t uuid; v_id uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_t := public.my_talent_id();
  select * into e from public.financial_entries where id = p_entry for update;
  if e.id is null or v_t is null or e.kind <> 'talent_payout' or e.talent_id is distinct from v_t then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.status not in ('planned', 'due') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payout_invoices i where i.entry_id = e.id and i.status in ('submitted', 'approved')) then
    raise exception 'invoice_open' using errcode = 'P0001';
  end if;
  select doc.id, doc.status, doc.uploaded_by, doc.uploader_side, doc.deal_id, doc.talent_id into v_doc from public.documents doc where doc.id = p_document for update;
  if v_doc.id is null or v_doc.uploaded_by is distinct from auth.uid() or v_doc.uploader_side <> 'talent'
     or v_doc.deal_id is distinct from e.deal_id or v_doc.talent_id is distinct from v_t then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'ready' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payout_invoices i where i.document_id = p_document) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  -- a nota tem valor: só o Adm (e o próprio influenciador) leem o documento
  update public.documents set restricted = true, share_brand = false where id = p_document;
  insert into public.payout_invoices (agency_id, entry_id, deal_id, talent_id, document_id, submitted_by)
  values (e.agency_id, e.id, e.deal_id, v_t, p_document, auth.uid()) returning id into v_id;
  perform public.audit_log('finance.invoice_submit', 'payout_invoice', v_id::text, null,
    jsonb_build_object('agency_id', e.agency_id, 'entry_id', e.id, 'document_id', p_document), null, 'creator'::public.actor_type);
  select d.title into v_title from public.deals d where d.id = e.deal_id;
  perform public.inbox_notify_agency(e.agency_id, 'admin', 'invoice_submitted', '/agencia/financeiro?f=invoices',
    jsonb_build_object('deal', v_title, 'talent', (select t.display_name from public.talent_profiles t where t.id = v_t)), 'invoice', v_id, 'invoice:' || v_id::text);
  return v_id;
end $$;
revoke execute on function public.payout_invoice_attach(uuid, uuid) from public, anon;
grant execute on function public.payout_invoice_attach(uuid, uuid) to authenticated, service_role;

-- 7) Adm: aprova (podendo já agendar) ou recusa a nota (com motivo) -------------------------------------------------
create or replace function public.agency_invoice_review(p_invoice uuid, p_decision text, p_note text default null, p_pay_on date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.payout_invoices%rowtype; e public.financial_entries%rowtype; v_note text := btrim(coalesce(p_note, '')); v_to uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into i from public.payout_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(i.agency_id, 'admin') then
    if public.agency_can(i.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if i.status <> 'submitted' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'reject' and char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
  if p_decision = 'reject' and p_pay_on is not null then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into e from public.financial_entries where id = i.entry_id for update;
  update public.payout_invoices set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now() where id = i.id;
  perform public.audit_log('finance.invoice_review', 'payout_invoice', i.id::text, jsonb_build_object('agency_id', i.agency_id, 'status', i.status),
    jsonb_build_object('agency_id', i.agency_id, 'status', case when p_decision = 'approve' then 'approved' else 'rejected' end), nullif(v_note, ''),
    public.talent_audit_actor('agency', i.agency_id));
  select d.title into v_title from public.deals d where d.id = i.deal_id;
  v_to := public.talent_user_id(i.talent_id);
  perform public.inbox_notify(v_to, 'invoice_reviewed', '/creator/escritorio/ganhos',
    jsonb_build_object('deal', v_title, 'status', p_decision), i.agency_id, 'invoice', i.id, 'invoice_reviewed:' || i.id::text);
  if p_decision = 'approve' and p_pay_on is not null and e.status in ('planned', 'due') then
    perform public.agency_payout_schedule(e.id, p_pay_on);
  end if;
end $$;
revoke execute on function public.agency_invoice_review(uuid, text, text, date) from public, anon;
grant execute on function public.agency_invoice_review(uuid, text, text, date) to authenticated, service_role;

-- 8) Adm: agenda (ou reagenda; null limpa) a data de pagamento de um repasse ---------------------------------------
create or replace function public.agency_payout_schedule(p_entry uuid, p_pay_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.financial_entries%rowtype; v_tz text; v_today date; v_to uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into e from public.financial_entries where id = p_entry for update;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(e.agency_id, 'admin') then
    if public.agency_can(e.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.kind <> 'talent_payout' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if e.status not in ('planned', 'due') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = e.agency_id;
  v_today := (now() at time zone v_tz)::date;
  if p_pay_on is not null and (p_pay_on < v_today or p_pay_on > v_today + 366) then raise exception 'invalid_date' using errcode = '22023'; end if;
  if e.scheduled_on is not distinct from p_pay_on then return; end if;
  update public.financial_entries set scheduled_on = p_pay_on,
    status = case when p_pay_on is not null and status = 'planned' then 'due' else status end
  where id = e.id;
  perform public.audit_log('finance.payout_schedule', 'financial_entry', e.id::text, jsonb_build_object('agency_id', e.agency_id, 'scheduled_on', e.scheduled_on),
    jsonb_build_object('agency_id', e.agency_id, 'scheduled_on', p_pay_on), null, public.talent_audit_actor('agency', e.agency_id));
  if p_pay_on is not null then
    select d.title into v_title from public.deals d where d.id = e.deal_id;
    v_to := public.talent_user_id(e.talent_id);
    perform public.inbox_notify(v_to, 'payout_scheduled', '/creator/escritorio/ganhos',
      jsonb_build_object('deal', v_title, 'date', to_char(p_pay_on, 'YYYY-MM-DD')), e.agency_id, 'entry', e.id,
      'payout_scheduled:' || e.id::text || ':' || p_pay_on::text);
  end if;
end $$;
revoke execute on function public.agency_payout_schedule(uuid, date) from public, anon;
grant execute on function public.agency_payout_schedule(uuid, date) to authenticated, service_role;

-- 9) ganhos do influenciador (0072, MESMA assinatura): + marca, agendamento, entrega feita e última nota -----------
create or replace function public.talent_payouts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'deal_title', d.title, 'deal_talent_id', f.deal_talent_id, 'status', f.status,
           'amount_cents', f.amount_cents, 'due_on', f.due_on, 'settled_at', f.settled_at,
           'brand_name', b.name, 'deal_id', f.deal_id, 'agency_id', f.agency_id, 'scheduled_on', f.scheduled_on,
           'delivered', (d.stage = 'closed' and d.outcome = 'won')
                        or (exists (select 1 from public.deliverables x where x.deal_talent_id = f.deal_talent_id and x.status <> 'cancelled')
                            and not exists (select 1 from public.deliverables x where x.deal_talent_id = f.deal_talent_id
                                            and x.status not in ('published', 'proof_submitted', 'done', 'cancelled'))),
           'invoice', (select jsonb_build_object('id', i.id, 'status', i.status, 'review_note', i.review_note, 'document_id', i.document_id,
                         'submitted_at', i.created_at, 'reviewed_at', i.reviewed_at)
                       from public.payout_invoices i where i.entry_id = f.id
                       order by (i.status in ('submitted', 'approved')) desc, i.created_at desc, i.id desc limit 1))
         order by f.due_on nulls last, f.created_at), '[]'::jsonb)
  from public.financial_entries f join public.deals d on d.id = f.deal_id join public.brands b on b.id = d.brand_id
  where f.kind = 'talent_payout' and f.talent_id = public.my_talent_id()
$$;
revoke execute on function public.talent_payouts() from public, anon;
grant execute on function public.talent_payouts() to authenticated, service_role;

-- 10) "Hoje" do creator (0079) + repasses abertos: nota pendente/recusada e pagamento agendado (nunca valores) -----
create or replace function public.talent_today()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid; v_tz text; v_deals uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_t := public.my_talent_id();
  if v_t is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select a.timezone into v_tz from public.talent_profiles t join public.agencies a on a.id = t.agency_id where t.id = v_t;
  v_deals := public.my_talent_deal_ids();
  return jsonb_build_object(
    'timezone', coalesce(v_tz, 'America/Sao_Paulo'),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'step', k.template_step, 'title', k.title, 'status', k.status, 'due_at', k.due_at,
        'feedback', left(k.feedback, 280), 'deal_id', k.deal_id, 'deal_title', d.title, 'brand_name', b.name,
        'deal_talent_id', (select dt.id from public.deal_talents dt where dt.deal_id = k.deal_id and dt.talent_id = v_t))
      order by k.due_at nulls last), '[]'::jsonb)
      from public.tasks k left join public.deals d on d.id = k.deal_id left join public.brands b on b.id = d.brand_id
      where k.side = 'talent' and k.talent_id = v_t and k.status in ('todo', 'doing', 'blocked')
        and (k.deal_id is null or k.deal_id = any (v_deals)) and (d.id is null or d.stage <> 'closed')
        and ((k.due_at is not null and k.due_at < now() + interval '3 days') or (k.template_step = 4 and k.status = 'todo' and k.feedback <> ''))),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', dt.id, 'status', dt.status, 'respond_by', dt.respond_by, 'consulted_at', dt.consulted_at,
        'deal_title', d.title, 'brand_name', b.name,
        'counter_status', (select c.status from public.deal_counteroffers c where c.deal_talent_id = dt.id and c.status <> 'withdrawn' order by c.created_at desc limit 1))
        order by dt.respond_by nulls last), '[]'::jsonb)
      from public.deal_talents dt join public.deals d on d.id = dt.deal_id join public.brands b on b.id = d.brand_id
      where dt.talent_id = v_t and dt.consulted_at is not null and dt.status in ('consulted', 'talk_requested') and d.stage <> 'closed'),
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'deal_talent_id', x.deal_talent_id, 'deal_id', x.deal_id, 'kind', x.kind, 'network', x.network,
        'title', x.title, 'status', x.status, 'due_at', x.due_at, 'publish_at', x.publish_at, 'brand_feedback', left(x.brand_feedback, 280),
        'decided_at', x.decided_at, 'deal_title', d.title, 'brand_name', b.name) order by coalesce(x.due_at, x.publish_at) nulls last), '[]'::jsonb)
      from public.deliverables x join public.deals d on d.id = x.deal_id join public.brands b on b.id = d.brand_id
      join public.deal_talents dt on dt.id = x.deal_talent_id
      where x.talent_id = v_t and dt.status in ('proposed', 'contracted') and public.deal_stage_index(d.stage) between 10 and 12
        and x.status in ('planned', 'in_production', 'changes_requested', 'approved')),
    'terms', (select coalesce(jsonb_agg(jsonb_build_object('terms_id', m.id, 'deal_talent_id', dt.id, 'version', m.version, 'sent_at', m.sent_at, 'valid_until', m.valid_until,
        'deal_title', d.title, 'brand_name', b.name) order by m.sent_at), '[]'::jsonb)
      from public.deal_terms m join public.deals d on d.id = m.deal_id join public.brands b on b.id = d.brand_id
      join public.deal_talents dt on dt.deal_id = m.deal_id and dt.talent_id = v_t and dt.status in ('proposed', 'contracted')
      where m.status = 'sent' and m.sent_at is not null and d.stage <> 'closed' and (m.valid_until is null or m.valid_until >= current_date)
        and not exists (select 1 from public.deal_acceptances a where a.terms_id = m.id and a.party = 'talent' and a.deal_talent_id = dt.id)),
    -- 0082: repasses abertos (sem valor): entrega feita, situação da última nota e data agendada
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'deal_talent_id', f.deal_talent_id, 'deal_title', d.title, 'brand_name', b.name,
        'status', f.status, 'due_on', f.due_on, 'scheduled_on', f.scheduled_on,
        'delivered', (d.stage = 'closed' and d.outcome = 'won')
                     or (exists (select 1 from public.deliverables x where x.deal_talent_id = f.deal_talent_id and x.status <> 'cancelled')
                         and not exists (select 1 from public.deliverables x where x.deal_talent_id = f.deal_talent_id
                                         and x.status not in ('published', 'proof_submitted', 'done', 'cancelled'))),
        'invoice_status', li.status, 'invoice_note', left(coalesce(li.review_note, ''), 280), 'invoice_at', coalesce(li.reviewed_at, li.created_at))
        order by coalesce(f.scheduled_on, f.due_on) nulls last), '[]'::jsonb)
      from public.financial_entries f join public.deals d on d.id = f.deal_id join public.brands b on b.id = d.brand_id
      left join lateral (select i.status, i.review_note, i.reviewed_at, i.created_at from public.payout_invoices i where i.entry_id = f.id
                         order by (i.status in ('submitted', 'approved')) desc, i.created_at desc, i.id desc limit 1) li on true
      where f.kind = 'talent_payout' and f.talent_id = v_t and f.status in ('planned', 'due')));
end $$;
revoke execute on function public.talent_today() from public, anon;
grant execute on function public.talent_today() to authenticated, service_role;

notify pgrst, 'reload schema';
