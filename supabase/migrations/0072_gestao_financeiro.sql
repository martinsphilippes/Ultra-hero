-- 0072 · Gestão P3: financeiro simulado, painéis, alertas de relacionamento e patrocínio na área social
--
-- Dinheiro (simples e honesto, sempre em centavos de BRL, nada é cobrança real):
--   F = soma dos cachês dos creators contratados (deal_talent_fees: o que cada creator vê na oportunidade)
--   taxa de serviço da agência em pontos-base (agencies.service_rate_bp; o Adm pode sobrescrever por negócio)
--   C = F × taxa (comissão da agência)      V = F + C (o que a marca paga)
--   Identidade por negócio: brand_receivable = commission + Σ talent_payout  (conferida ao gerar: finance_identity)
-- Lançamentos nascem na confirmação da contratação (agency_contract_confirm recriada) e no backfill dos negócios
-- já em produção. Só o Adm da agência lê o financeiro; o creator lê apenas o próprio repasse (valor só na web).
-- Painéis: agency_dashboard (COL+; finanças só Adm), brand_dashboard (marca), talent_office_summary (creator).
-- Alertas (cron diário /api/cron/agency, service role): creator sem contato há N dias (1×/semana), tarefa vencida
-- (1×/dia), limpeza de avisos e de documentos pendentes. Patrocínio: negócio contratado vira creator_brands
-- 'sponsor' do herói ligado, por ação humana do gestor. Histórico (auditoria da agência) para o Adm.
-- Idempotente (reaplica sem efeito); funções com search_path fixo; nenhuma executável pelo visitante.

-- 1) taxa de serviço ------------------------------------------------------------------------------------------------
alter table public.agencies add column if not exists service_rate_bp smallint not null default 2000;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agencies_service_rate_check') then
    alter table public.agencies add constraint agencies_service_rate_check check (service_rate_bp between 0 and 5000);
  end if;
end $$;
alter table public.deals add column if not exists service_rate_bp smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deals_service_rate_check') then
    alter table public.deals add constraint deals_service_rate_check check (service_rate_bp is null or service_rate_bp between 0 and 5000);
  end if;
end $$;

-- 2) lançamentos financeiros (simulados) -----------------------------------------------------------------------------
create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint financial_entries_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint financial_entries_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint financial_entries_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid constraint financial_entries_talent_fk references public.talent_profiles (id) on delete restrict,
  deal_talent_id uuid constraint financial_entries_deal_talent_fk references public.deal_talents (id) on delete cascade,
  kind text not null,
  amount_cents bigint not null,
  currency text not null default 'BRL',
  rate_bp smallint not null,
  status text not null default 'planned',
  due_on date,
  settled_at timestamptz,
  settled_by uuid constraint financial_entries_settled_by_fk references auth.users (id) on delete set null,
  note text not null default '',
  simulated boolean not null default true,
  created_by uuid constraint financial_entries_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_entries_kind_check check (kind in ('brand_receivable', 'commission', 'talent_payout')),
  constraint financial_entries_talent_shape check ((kind = 'talent_payout') = (talent_id is not null and deal_talent_id is not null)),
  constraint financial_entries_amount_check check (amount_cents between 0 and 10000000000),
  constraint financial_entries_currency_check check (currency = 'BRL'),
  constraint financial_entries_rate_check check (rate_bp between 0 and 5000),
  constraint financial_entries_status_check check (status in ('planned', 'due', 'settled', 'cancelled')),
  constraint financial_entries_settled_check check ((status = 'settled') = (settled_at is not null)),
  constraint financial_entries_note_check check (char_length(note) <= 500),
  constraint financial_entries_simulated_check check (simulated)     -- nada aqui é cobrança real
);
create unique index if not exists financial_entries_uq on public.financial_entries (deal_id, kind, deal_talent_id) nulls not distinct;
create index if not exists financial_entries_agency_idx on public.financial_entries (agency_id, status, due_on);
create index if not exists financial_entries_talent_idx on public.financial_entries (talent_id) where talent_id is not null;
drop trigger if exists financial_entries_touch on public.financial_entries;
create trigger financial_entries_touch before update on public.financial_entries for each row execute function public.set_updated_at();

alter table public.financial_entries enable row level security;
revoke all on public.financial_entries from public, anon, authenticated;
grant select on public.financial_entries to authenticated;
grant all on public.financial_entries to service_role;

drop policy if exists financial_entries_select_admin on public.financial_entries;
create policy financial_entries_select_admin on public.financial_entries for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists financial_entries_select_agency on public.financial_entries;
create policy financial_entries_select_agency on public.financial_entries for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
-- creator: só o próprio repasse (a tela do app esconde o valor; a web mostra)
drop policy if exists financial_entries_select_talent on public.financial_entries;
create policy financial_entries_select_talent on public.financial_entries for select to authenticated
  using (kind = 'talent_payout' and talent_id = (select public.my_talent_id()));

-- 3) geração dos lançamentos ---------------------------------------------------------------------------------------
-- interna: cria os lançamentos de um negócio contratado (idempotente: nada se já existirem)
create or replace function public.agency_finance_generate(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; a public.agencies%rowtype; r record; v_rate smallint; v_fees bigint := 0; v_comm bigint; v_total bigint; v_n int := 0;
        v_contract date; v_due date; v_check bigint;
begin
  select * into d from public.deals where id = p_deal for update;
  if d.id is null then return 0; end if;
  if not (d.stage = 'production' or (d.stage = 'closed' and d.outcome = 'won')) then return 0; end if;
  if exists (select 1 from public.financial_entries f where f.deal_id = p_deal and f.status <> 'cancelled') then return 0; end if;
  -- negócio reaberto depois de perdido/cancelado: os lançamentos cancelados pelo gatilho saem para nascer de novo
  delete from public.financial_entries f where f.deal_id = p_deal and f.status = 'cancelled' and f.settled_at is null and f.note in ('deal_lost', 'deal_cancelled');
  if not exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'contracted') then return 0; end if;
  select * into a from public.agencies where id = d.agency_id;
  v_rate := coalesce(d.service_rate_bp, a.service_rate_bp, 0);
  v_contract := (coalesce(d.contract_confirmed_at, d.stage_changed_at) at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date;
  v_due := v_contract + 30;
  for r in select dt.id, dt.talent_id, coalesce(f.fee_cents, 0) as fee
           from public.deal_talents dt left join public.deal_talent_fees f on f.deal_talent_id = dt.id
           where dt.deal_id = p_deal and dt.status = 'contracted' order by dt.created_at loop
    insert into public.financial_entries (agency_id, brand_id, deal_id, talent_id, deal_talent_id, kind, amount_cents, rate_bp, due_on, created_by)
    values (d.agency_id, d.brand_id, p_deal, r.talent_id, r.id, 'talent_payout', r.fee, v_rate, coalesce(d.expected_end + 15, v_contract + 45), auth.uid())
    on conflict (deal_id, kind, deal_talent_id) do nothing;
    v_fees := v_fees + r.fee; v_n := v_n + 1;
  end loop;
  v_comm := round(v_fees * v_rate / 10000.0);
  v_total := v_fees + v_comm;
  insert into public.financial_entries (agency_id, brand_id, deal_id, kind, amount_cents, rate_bp, due_on, created_by)
  values (d.agency_id, d.brand_id, p_deal, 'brand_receivable', v_total, v_rate, v_due, auth.uid()) on conflict (deal_id, kind, deal_talent_id) do nothing;
  insert into public.financial_entries (agency_id, brand_id, deal_id, kind, amount_cents, rate_bp, due_on, created_by)
  values (d.agency_id, d.brand_id, p_deal, 'commission', v_comm, v_rate, v_due, auth.uid()) on conflict (deal_id, kind, deal_talent_id) do nothing;
  -- identidade: o que a marca paga = comissão + repasses
  select coalesce(sum(case when kind = 'brand_receivable' then amount_cents else -amount_cents end), 0) into v_check from public.financial_entries where deal_id = p_deal;
  if v_check <> 0 then raise exception 'finance_identity' using errcode = 'P0001'; end if;
  perform public.audit_log('finance.generate', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', d.agency_id, 'rate_bp', v_rate, 'payouts', v_n), null, public.talent_audit_actor('agency', d.agency_id));
  return v_n + 2;
end $$;
revoke execute on function public.agency_finance_generate(uuid) from public, anon, authenticated;
grant execute on function public.agency_finance_generate(uuid) to service_role;

-- backfill (service role): negócios já em produção ou ganhos sem lançamentos (também usado ao restaurar a demonstração)
create or replace function public.agency_finance_backfill(p_agency uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_deals int := 0;
begin
  for r in select d.id from public.deals d
           where (p_agency is null or d.agency_id = p_agency)
             and (d.stage = 'production' or (d.stage = 'closed' and d.outcome = 'won'))
             and not exists (select 1 from public.financial_entries f where f.deal_id = d.id) order by d.created_at loop
    v_n := v_n + public.agency_finance_generate(r.id); v_deals := v_deals + 1;
  end loop;
  if v_deals > 0 then
    perform public.audit_log('finance.backfill', 'agency', coalesce(p_agency::text, 'all'), null, jsonb_build_object('agency_id', p_agency, 'deals', v_deals, 'entries', v_n), null, 'system');
  end if;
  return v_n;
end $$;
revoke execute on function public.agency_finance_backfill(uuid) from public, anon, authenticated;
grant execute on function public.agency_finance_backfill(uuid) to service_role;

-- contratação confirmada (0068) + lançamentos financeiros na mesma transação
create or replace function public.agency_contract_confirm(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; t public.deal_terms%rowtype; r record; v_to uuid; v_brand text; v_tasks int;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  if d.stage not in ('approved', 'contracting') then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  select * into t from public.deal_terms where deal_id = p_deal and status = 'sent';
  if t.id is null then raise exception 'terms_missing' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.deal_acceptances a where a.terms_id = t.id and a.party = 'brand') then raise exception 'acceptance_missing' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted')) then raise exception 'no_talents' using errcode = 'P0001'; end if;
  if exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted')
             and not exists (select 1 from public.deal_acceptances a where a.terms_id = t.id and a.party = 'talent' and a.deal_talent_id = dt.id)) then
    raise exception 'acceptance_missing' using errcode = 'P0001';
  end if;
  update public.deal_terms set status = 'accepted' where id = t.id;
  update public.deal_talents set status = 'contracted' where deal_id = p_deal and status = 'proposed';
  update public.deals set stage = 'production', stage_changed_at = now(), contract_confirmed_at = coalesce(contract_confirmed_at, now()) where id = p_deal;
  -- só as entregas de quem foi contratado entram em produção (as de quem recusou/saiu ficam planejadas)
  update public.deliverables x set status = 'in_production' where x.deal_id = p_deal and x.status = 'planned'
    and exists (select 1 from public.deal_talents dt where dt.id = x.deal_talent_id and dt.status = 'contracted');
  v_tasks := public.agency_tasks_generate(p_deal);
  -- 0069: lançamentos simulados do negócio (a receber da marca, comissão, repasses)
  perform public.agency_finance_generate(p_deal);
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', p_deal, 'system', 'contract_confirmed', auth.uid(), public.actor_label(v_agency));
  perform public.audit_log('contract.confirm', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'stage', d.stage),
    jsonb_build_object('agency_id', v_agency, 'stage', 'production', 'terms_id', t.id, 'tasks', v_tasks), null, public.talent_audit_actor('agency', v_agency));
  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  perform public.inbox_notify_brand(d.brand_id, false, 'contract_confirmed', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title), v_agency, 'deal', p_deal, 'contract:' || p_deal::text);
  for r in select dt.id, dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'contracted' loop
    v_to := public.talent_user_id(r.talent_id);
    perform public.inbox_notify(v_to, 'contract_confirmed', '/creator/escritorio/oportunidades/' || r.id::text,
      jsonb_build_object('deal', d.title, 'brand', v_brand), v_agency, 'deal_talent', r.id, 'contract:' || r.id::text);
  end loop;
  return v_tasks;
end $$;
revoke execute on function public.agency_contract_confirm(uuid) from public, anon;
grant execute on function public.agency_contract_confirm(uuid) to authenticated, service_role;

-- negócio perdido ou cancelado: lançamentos abertos são cancelados
create or replace function public.finance_on_deal_close()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage = 'closed' and new.outcome in ('lost', 'cancelled') and old.stage is distinct from 'closed' then
    update public.financial_entries set status = 'cancelled', note = left(coalesce(nullif(note, ''), 'deal_' || new.outcome), 500)
    where deal_id = new.id and status in ('planned', 'due');
  end if;
  return new;
end $$;
revoke execute on function public.finance_on_deal_close() from public, anon, authenticated;
drop trigger if exists deals_finance_close on public.deals;
create trigger deals_finance_close after update of stage on public.deals for each row execute function public.finance_on_deal_close();

-- situação de um lançamento (Adm): planned → due → settled; planned/due → cancelled (nota); settled e cancelled são finais
create or replace function public.agency_entry_set_status(p_entry uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.financial_entries%rowtype; d public.deals%rowtype; v_note text := btrim(coalesce(p_note, '')); v_to uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_status not in ('due', 'settled', 'cancelled') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into e from public.financial_entries where id = p_entry for update;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(e.agency_id, 'admin') then
    if public.agency_can(e.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.status in ('settled', 'cancelled') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_status = 'due' and e.status <> 'planned' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_status = 'cancelled' and char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.financial_entries set status = p_status,
    settled_at = case when p_status = 'settled' then now() end, settled_by = case when p_status = 'settled' then auth.uid() end,
    note = case when v_note <> '' then v_note else note end
  where id = p_entry;
  perform public.audit_log('finance.entry_status', 'financial_entry', p_entry::text, jsonb_build_object('agency_id', e.agency_id, 'kind', e.kind, 'status', e.status),
    jsonb_build_object('agency_id', e.agency_id, 'kind', e.kind, 'status', p_status), nullif(v_note, ''), public.talent_audit_actor('agency', e.agency_id));
  if e.kind = 'talent_payout' then
    select * into d from public.deals where id = e.deal_id;
    v_to := public.talent_user_id(e.talent_id);
    perform public.inbox_notify(v_to, 'payout_updated', '/creator/escritorio/oportunidades/' || e.deal_talent_id::text,
      jsonb_build_object('deal', d.title, 'status', p_status), e.agency_id, 'entry', e.id, 'payout:' || e.id::text || ':' || p_status);
  end if;
end $$;
revoke execute on function public.agency_entry_set_status(uuid, text, text) from public, anon;
grant execute on function public.agency_entry_set_status(uuid, text, text) to authenticated, service_role;

-- taxa padrão da agência (Adm; agência de demonstração travada como as demais configurações)
create or replace function public.agency_rate_set(p_agency uuid, p_rate_bp int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before smallint;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select service_rate_bp into v_before from public.agencies where id = p_agency for update;
  if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_rate_bp is null or p_rate_bp < 0 or p_rate_bp > 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.agencies set service_rate_bp = p_rate_bp where id = p_agency;
  if v_before <> p_rate_bp then
    perform public.audit_log('agency.rate', 'agency', p_agency::text, jsonb_build_object('agency_id', p_agency, 'rate_bp', v_before),
      jsonb_build_object('agency_id', p_agency, 'rate_bp', p_rate_bp), null, public.talent_audit_actor('agency', p_agency));
  end if;
end $$;
revoke execute on function public.agency_rate_set(uuid, int) from public, anon;
grant execute on function public.agency_rate_set(uuid, int) to authenticated, service_role;

-- taxa de um negócio (Adm), só antes da contratação; null volta ao padrão da agência
create or replace function public.agency_deal_rate_set(p_deal uuid, p_rate_bp int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  if d.contract_confirmed_at is not null or exists (select 1 from public.financial_entries f where f.deal_id = p_deal) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_rate_bp is not null and (p_rate_bp < 0 or p_rate_bp > 5000) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.deals set service_rate_bp = p_rate_bp where id = p_deal;
  perform public.audit_log('deal.rate', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'rate_bp', d.service_rate_bp),
    jsonb_build_object('agency_id', v_agency, 'rate_bp', p_rate_bp), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.agency_deal_rate_set(uuid, int) from public, anon;
grant execute on function public.agency_deal_rate_set(uuid, int) to authenticated, service_role;

-- resumo financeiro (Adm): abertos e liquidados por tipo, vencidos, negócios com lançamentos
create or replace function public.agency_finance_summary(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return (select jsonb_build_object(
    'receivable_open_cents', coalesce(sum(amount_cents) filter (where kind = 'brand_receivable' and status in ('planned', 'due')), 0),
    'receivable_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'brand_receivable' and status = 'settled'), 0),
    'commission_open_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status in ('planned', 'due')), 0),
    'commission_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status = 'settled'), 0),
    'payout_open_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status in ('planned', 'due')), 0),
    'payout_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status = 'settled'), 0),
    'overdue_count', count(*) filter (where status in ('planned', 'due') and due_on < current_date),
    'open_count', count(*) filter (where status in ('planned', 'due')),
    'deals', count(distinct deal_id))
  from public.financial_entries where agency_id = p_agency);
end $$;
revoke execute on function public.agency_finance_summary(uuid) from public, anon;
grant execute on function public.agency_finance_summary(uuid) to authenticated, service_role;

-- 4) painéis ---------------------------------------------------------------------------------------------------------
-- agência (COL+): indicadores operacionais; o colaborador conta só os negócios dele; finanças só para o Adm
create or replace function public.agency_dashboard(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_mgr boolean; v_adm boolean; v_days int; v_deals uuid[]; o jsonb;
begin
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_mgr := public.agency_can(p_agency, 'manager'); v_adm := public.agency_can(p_agency, 'admin');
  select relationship_alert_days into v_days from public.agencies where id = p_agency;
  select coalesce(array_agg(d.id), '{}'::uuid[]) into v_deals from public.deals d where d.agency_id = p_agency and (v_mgr or d.id = any (public.my_staff_deal_ids()));
  o := jsonb_build_object(
    'talents_active', (select count(*) from public.talent_profiles t where t.agency_id = p_agency and t.archived_at is null and t.commercial_status = 'active'),
    'talents_no_contact', (select count(*) from public.talent_profiles t where t.agency_id = p_agency and t.archived_at is null and t.commercial_status = 'active'
                             and coalesce(t.last_contact_at, t.created_at) < now() - make_interval(days => coalesce(v_days, 30))),
    'brands_active', (select count(*) from public.agency_brands ab where ab.agency_id = p_agency and ab.status = 'active'),
    'deals_open', (select count(*) from public.deals d where d.id = any (v_deals) and d.stage <> 'closed'),
    'deals_by_stage', (select coalesce(jsonb_object_agg(s.stage, s.n), '{}'::jsonb) from (select d.stage, count(*) as n from public.deals d where d.id = any (v_deals) and d.stage <> 'closed' group by d.stage) s),
    'contracts_active', (select count(*) from public.deals d where d.id = any (v_deals) and d.stage = 'production'),
    'won_90d', (select count(*) from public.deals d where d.id = any (v_deals) and d.stage = 'closed' and d.outcome = 'won' and d.closed_at > now() - interval '90 days'),
    'lost_90d', (select count(*) from public.deals d where d.id = any (v_deals) and d.stage = 'closed' and d.outcome in ('lost', 'cancelled') and d.closed_at > now() - interval '90 days'),
    'deliverables_overdue', (select count(*) from public.deliverables x where x.deal_id = any (v_deals) and x.status in ('planned', 'in_production', 'changes_requested') and x.due_at < now()),
    'approvals_pending', (select count(*) from public.deliverables x where x.deal_id = any (v_deals) and x.status = 'submitted')
                        + (select count(*) from public.tasks k where k.deal_id = any (v_deals) and k.template_step = 5 and k.status = 'todo' and (k.attachment_url is not null or k.attachment_document_id is not null)),
    'tasks_open', (select count(*) from public.tasks k where k.agency_id = p_agency and k.status in ('todo', 'doing', 'blocked')
                     and ((k.deal_id is null and v_mgr) or k.deal_id = any (v_deals) or k.assignee_id = auth.uid() or k.created_by = auth.uid())),
    'tasks_overdue', (select count(*) from public.tasks k where k.agency_id = p_agency and k.status in ('todo', 'doing', 'blocked') and k.due_at < now()
                        and ((k.deal_id is null and v_mgr) or k.deal_id = any (v_deals) or k.assignee_id = auth.uid() or k.created_by = auth.uid())),
    'tasks_mine', (select count(*) from public.tasks k where k.agency_id = p_agency and k.status in ('todo', 'doing', 'blocked') and k.assignee_id = auth.uid()),
    'events_14d', (select count(*) from public.calendar_events e where e.agency_id = p_agency and e.starts_at >= now() and e.starts_at < now() + interval '14 days'
                     and (v_mgr or e.deal_id is null or e.deal_id = any (v_deals))));
  if v_adm then o := o || jsonb_build_object('finance', public.agency_finance_summary(p_agency)); end if;
  return o;
end $$;
revoke execute on function public.agency_dashboard(uuid) from public, anon;
grant execute on function public.agency_dashboard(uuid) to authenticated, service_role;

-- marca (dono ou equipe; admin da plataforma lê): campanhas, aprovações pendentes, creators sugeridos, próximas datas
create or replace function public.brand_dashboard(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_dt uuid[]; v_deals uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_dt := public.my_brand_deal_talent_ids(); v_deals := public.my_brand_deal_ids();
  return jsonb_build_object(
    'campaigns_active', (select count(*) from public.deals d where d.brand_id = p_brand and d.id = any (v_deals) and d.stage <> 'closed'),
    'campaigns_done', (select count(*) from public.deals d where d.brand_id = p_brand and d.id = any (v_deals) and d.stage = 'closed' and d.outcome = 'won'),
    'approvals_pending', (select count(*) from public.tasks k where k.brand_id = p_brand and k.deal_id = any (v_deals) and k.side = 'brand' and k.status = 'todo'
                            and (k.attachment_url is not null or k.attachment_document_id is not null))
                        + (select count(*) from public.deliverables x where x.brand_id = p_brand and x.deal_talent_id = any (v_dt) and x.status = 'submitted'),
    -- creators sugeridos pela agência: propostos ou contratados nas campanhas abertas (cartão autorizado, com consentimento)
    'suggested', (select coalesce(jsonb_agg(s.card order by s.changed desc), '[]'::jsonb) from (
        select public.talent_brand_card(dt.talent_id, d.agency_id) || jsonb_build_object('deal_talent_id', dt.id, 'request_id', d.request_id, 'deal_title', d.title, 'talent_status', dt.status) as card,
               d.stage_changed_at as changed
        from public.deal_talents dt join public.deals d on d.id = dt.deal_id
        where dt.id = any (v_dt) and d.brand_id = p_brand and dt.status in ('proposed', 'contracted') and d.stage <> 'closed'
        order by d.stage_changed_at desc limit 6) s),
    'next_events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'kind', e.kind, 'starts_at', e.starts_at, 'all_day', e.all_day) order by e.starts_at), '[]'::jsonb) from (
        select x.* from public.calendar_events_for_user(auth.uid()) x
        where (x.brand_id = p_brand or x.brand_id is null) and x.starts_at >= now() order by x.starts_at limit 3) e));
end $$;
revoke execute on function public.brand_dashboard(uuid) from public, anon;
grant execute on function public.brand_dashboard(uuid) to authenticated, service_role;

-- escritório do creator: tarefas, próximas entregas, oportunidades, campanhas, compromissos de hoje e repasses (só contagens)
create or replace function public.talent_office_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid; v_tz text; v_deals uuid[];
begin
  v_t := public.my_talent_id();
  if v_t is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select a.timezone into v_tz from public.talent_profiles t join public.agencies a on a.id = t.agency_id where t.id = v_t;
  v_deals := public.my_talent_deal_ids();
  return jsonb_build_object(
    'tasks_open', (select count(*) from public.tasks k where k.side = 'talent' and k.talent_id = v_t and k.status in ('todo', 'doing', 'blocked') and (k.deal_id is null or k.deal_id = any (v_deals))),
    'tasks_overdue', (select count(*) from public.tasks k where k.side = 'talent' and k.talent_id = v_t and k.status in ('todo', 'doing', 'blocked') and k.due_at < now() and (k.deal_id is null or k.deal_id = any (v_deals))),
    'opportunities_pending', (select count(*) from public.deal_talents dt join public.deals d on d.id = dt.deal_id where dt.talent_id = v_t and dt.status in ('consulted', 'talk_requested') and d.stage <> 'closed'),
    'campaigns_active', (select count(*) from public.deal_talents dt join public.deals d on d.id = dt.deal_id where dt.talent_id = v_t and dt.status = 'contracted' and d.stage = 'production'),
    'deliverables_next', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title, 'due_at', s.due_at, 'publish_at', s.publish_at, 'status', s.status,
                             'deal_title', s.deal_title, 'deal_talent_id', s.deal_talent_id) order by s.ord nulls last), '[]'::jsonb) from (
        select x.id, x.kind, x.title, x.due_at, x.publish_at, x.status, d.title as deal_title, x.deal_talent_id, coalesce(x.due_at, x.publish_at) as ord
        from public.deliverables x join public.deals d on d.id = x.deal_id
        where x.talent_id = v_t and d.stage = 'production' and x.status not in ('done', 'cancelled') order by coalesce(x.due_at, x.publish_at) nulls last limit 3) s),
    'events_today', (select count(*) from public.calendar_events_for_user(auth.uid()) e
                       where (e.starts_at at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date = (now() at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date),
    'payouts', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (select f.status, count(*) as n from public.financial_entries f where f.talent_id = v_t and f.kind = 'talent_payout' group by f.status) s));
end $$;
revoke execute on function public.talent_office_summary() from public, anon;
grant execute on function public.talent_office_summary() to authenticated, service_role;

-- 5) relacionamento e alertas (cron) ---------------------------------------------------------------------------------
-- contato registrado com o creator (ligação, reunião, mensagem, e-mail) atualiza last_contact_at
create or replace function public.activities_touch_contact()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subject_type = 'talent' and new.kind in ('call', 'meeting', 'message', 'email') then
    update public.talent_profiles set last_contact_at = greatest(coalesce(last_contact_at, '-infinity'::timestamptz), new.occurred_at) where id = new.talent_id;
  end if;
  return new;
end $$;
revoke execute on function public.activities_touch_contact() from public, anon, authenticated;
drop trigger if exists activities_touch_contact on public.activities;
create trigger activities_touch_contact after insert on public.activities for each row execute function public.activities_touch_contact();

-- varredura diária (service role): creator sem contato há N dias (1×/semana, ao gestor do creator ou aos gestores),
-- tarefa vencida (1×/dia, ao responsável; creator sem login → responsável do negócio; sem ninguém → gestores)
create or replace function public.agency_relationship_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; t record; k record; v_ag int := 0; v_rel int := 0; v_over int := 0; v_week text := to_char(now(), 'IYYY-IW');
        v_to uuid; v_talent_user uuid; v_link text; v_params jsonb; v_dedupe text;
begin
  for a in select * from public.agencies where status = 'active' loop
    v_ag := v_ag + 1;
    for t in select tp.id, tp.display_name, tp.manager_id, extract(day from now() - coalesce(tp.last_contact_at, tp.created_at))::int as days
             from public.talent_profiles tp
             where tp.agency_id = a.id and tp.archived_at is null and tp.commercial_status = 'active'
               and coalesce(tp.last_contact_at, tp.created_at) < now() - make_interval(days => a.relationship_alert_days) loop
      v_params := jsonb_build_object('talent', t.display_name, 'days', t.days::text);
      v_dedupe := 'rel:' || t.id::text || ':' || v_week;
      if t.manager_id is not null and exists (select 1 from public.agency_members m where m.agency_id = a.id and m.user_id = t.manager_id and m.revoked_at is null) then
        if public.inbox_notify(t.manager_id, 'relationship_alert', '/agencia/casting/' || t.id::text, v_params, a.id, 'talent', t.id, v_dedupe) is not null then v_rel := v_rel + 1; end if;
      else
        v_rel := v_rel + public.inbox_notify_agency(a.id, 'manager', 'relationship_alert', '/agencia/casting/' || t.id::text, v_params, 'talent', t.id, v_dedupe);
      end if;
    end loop;
    for k in select tk.id, tk.title, tk.template_step, tk.side, tk.assignee_id, tk.deal_id, tk.talent_id, d.owner_id, d.title as deal_title
             from public.tasks tk left join public.deals d on d.id = tk.deal_id
             where tk.agency_id = a.id and tk.status in ('todo', 'doing', 'blocked') and tk.due_at < now() loop
      v_talent_user := case when k.side = 'talent' then public.talent_user_id(k.talent_id) end;
      v_to := coalesce(k.assignee_id, v_talent_user, k.owner_id);
      v_params := jsonb_build_object('deal', coalesce(k.deal_title, nullif(k.title, ''), ''), 'step', coalesce(k.template_step::text, ''));
      v_dedupe := 'overdue:' || k.id::text || ':' || current_date::text;
      if v_to is not null then
        v_link := case when v_to = v_talent_user then '/creator/escritorio/tarefas' when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas?f=overdue' end;
        if public.inbox_notify(v_to, 'task_overdue', v_link, v_params, a.id, 'task', k.id, v_dedupe) is not null then v_over := v_over + 1; end if;
      else
        v_link := case when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas?f=overdue' end;
        v_over := v_over + public.inbox_notify_agency(a.id, 'manager', 'task_overdue', v_link, v_params, 'task', k.id, v_dedupe);
      end if;
    end loop;
  end loop;
  perform public.audit_log('agency.relationship_scan', 'agency', 'all', null, jsonb_build_object('agencies', v_ag, 'relationship_alerts', v_rel, 'overdue_alerts', v_over), null, 'system');
  return jsonb_build_object('agencies', v_ag, 'relationship_alerts', v_rel, 'overdue_alerts', v_over);
end $$;
revoke execute on function public.agency_relationship_scan() from public, anon, authenticated;
grant execute on function public.agency_relationship_scan() to service_role;

-- limpeza de avisos: lidos há mais de 90 dias; não lidos há mais de 180
create or replace function public.inbox_cleanup()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with gone as (delete from public.inbox_notifications
                where (read_at is not null and read_at < now() - interval '90 days') or (read_at is null and created_at < now() - interval '180 days') returning 1)
  select count(*) into v_n from gone;
  return v_n;
end $$;
revoke execute on function public.inbox_cleanup() from public, anon, authenticated;
grant execute on function public.inbox_cleanup() to service_role;

-- documentos reservados e nunca concluídos há mais de 24 h: o cron apaga no Storage e depois as linhas
create or replace function public.documents_orphans(p_limit int default 200)
returns setof text language sql stable security definer set search_path = '' as $$
  select d.storage_path from public.documents d where d.status = 'pending' and d.created_at < now() - interval '24 hours'
  order by d.created_at limit least(greatest(coalesce(p_limit, 200), 1), 1000)
$$;
revoke execute on function public.documents_orphans(int) from public, anon, authenticated;
grant execute on function public.documents_orphans(int) to service_role;
create or replace function public.documents_orphans_purge(p_paths text[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with gone as (delete from public.documents where status = 'pending' and storage_path = any (coalesce(p_paths, '{}'::text[])) returning 1)
  select count(*) into v_n from gone;
  return v_n;
end $$;
revoke execute on function public.documents_orphans_purge(text[]) from public, anon, authenticated;
grant execute on function public.documents_orphans_purge(text[]) to service_role;

-- 6) patrocínio na área social (gestor+, ação humana): negócio contratado → marca patrocinadora do herói ligado -------
create or replace function public.agency_publish_sponsorship(p_deal_talent uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; d public.deals%rowtype; v_agency uuid; v_creator uuid; v_existing uuid;
begin
  select * into dt from public.deal_talents where id = p_deal_talent;
  if dt.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(dt.deal_id, false, false);
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = dt.deal_id;
  if dt.status <> 'contracted' or not (d.stage = 'production' or (d.stage = 'closed' and d.outcome = 'won')) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select t.creator_id into v_creator from public.talent_profiles t where t.id = dt.talent_id;
  if v_creator is null then raise exception 'no_hero' using errcode = 'P0001'; end if;
  -- o herói só aparece como patrocinado com consentimento comercial vigente e página ativa
  if not exists (select 1 from public.talent_profiles t join public.creator_profiles c on c.id = t.creator_id
                 where t.id = dt.talent_id and t.consent_at is not null and t.consent_revoked_at is null and c.status = 'active') then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  -- marca criada pela agência nasce inativa; só o administrador da plataforma a ativa na área social
  if not exists (select 1 from public.brands b where b.id = d.brand_id and b.status = 'active') then raise exception 'brand_inactive' using errcode = 'P0001'; end if;
  select cb.id into v_existing from public.creator_brands cb where cb.creator_id = v_creator and cb.brand_id = d.brand_id;
  -- vínculo desativado pelo administrador da plataforma segue desativado (só a relação vira patrocínio)
  insert into public.creator_brands (creator_id, brand_id, relationship, status) values (v_creator, d.brand_id, 'sponsor', 'active')
  on conflict (creator_id, brand_id) do update set relationship = 'sponsor', updated_at = now();
  perform public.audit_log('agency.publish_sponsorship', 'creator_brands', v_creator::text || ':' || d.brand_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'deal_id', d.id, 'deal_talent_id', dt.id, 'creator_id', v_creator, 'brand_id', d.brand_id), null, public.talent_audit_actor('agency', v_agency));
  return v_existing is null;
end $$;
revoke execute on function public.agency_publish_sponsorship(uuid) from public, anon;
grant execute on function public.agency_publish_sponsorship(uuid) to authenticated, service_role;

-- 7) histórico da agência (Adm): auditoria das RPCs do módulo (todas gravam agency_id no JSON) ----------------------
-- Projeção fechada: ação, objeto, quem (tipo), justificativa e quando; nunca o JSON nem ids de pessoas. Ações da
-- plataforma (criação da agência, demonstração) ficam fora; a conta de demonstração não lê (D6, como a política).
create index if not exists admin_audit_agency_after_idx on public.admin_audit ((after_data ->> 'agency_id'));
create index if not exists admin_audit_agency_before_idx on public.admin_audit ((before_data ->> 'agency_id'));
drop function if exists public.agency_audit_list(uuid, int, timestamptz);
create or replace function public.agency_audit_list(p_agency uuid, p_limit int default 50, p_before timestamptz default null)
returns table (id bigint, action text, resource_type text, resource_id text, actor_type text, justification text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.action, a.resource_type, a.resource_id, a.actor_type::text, a.justification, a.created_at
  from public.admin_audit a
  where public.agency_can(p_agency, 'admin') and not public.is_demo_account()
    and (a.after_data ->> 'agency_id' = p_agency::text or a.before_data ->> 'agency_id' = p_agency::text)
    and a.action not like 'demo.%' and a.action <> 'agency.create'
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke execute on function public.agency_audit_list(uuid, int, timestamptz) from public, anon;
grant execute on function public.agency_audit_list(uuid, int, timestamptz) to authenticated, service_role;

-- 8) revisão de segurança -------------------------------------------------------------------------------------------
-- 8a) a taxa de serviço é informação do Adm: as colunas saem da leitura direta de authenticated (marca e creator leem
--     agencies/deals por política; o creator lê o próprio repasse). Leitura das taxas só pela RPC agency_rates.
--     Atenção para migrações futuras: coluna nova em agencies/deals/financial_entries precisa de grant explícito.
do $$
declare cols text; t text;
begin
  foreach t in array array['agencies', 'deals', 'financial_entries'] loop
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name not in ('service_rate_bp', 'rate_bp');
    execute format('revoke select on public.%I from authenticated', t);
    execute format('grant select (%s) on public.%I to authenticated', cols, t);
  end loop;
end $$;

create or replace function public.agency_rates(p_agency uuid, p_deal uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype;
begin
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_deal is not null then
    select * into d from public.deals where id = p_deal and agency_id = p_agency;
    if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('agency_rate_bp', (select a.service_rate_bp from public.agencies a where a.id = p_agency),
    'deal_rate_bp', d.service_rate_bp,
    'contracted', d.id is not null and (d.contract_confirmed_at is not null or exists (select 1 from public.financial_entries f where f.deal_id = d.id)));
end $$;
revoke execute on function public.agency_rates(uuid, uuid) from public, anon;
grant execute on function public.agency_rates(uuid, uuid) to authenticated, service_role;

-- 8b) repasses do creator com o título do negócio (o creator não lê deals); só os dele
create or replace function public.talent_payouts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'deal_title', d.title, 'deal_talent_id', f.deal_talent_id, 'status', f.status,
           'amount_cents', f.amount_cents, 'due_on', f.due_on, 'settled_at', f.settled_at) order by f.due_on nulls last, f.created_at), '[]'::jsonb)
  from public.financial_entries f join public.deals d on d.id = f.deal_id
  where f.kind = 'talent_payout' and f.talent_id = public.my_talent_id()
$$;
revoke execute on function public.talent_payouts() from public, anon;
grant execute on function public.talent_payouts() to authenticated, service_role;

-- 8c) reserva de documento vence em 24 h (o cron apaga as pendentes mais velhas: confirmar depois disso perderia o arquivo)
create or replace function public.document_confirm(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.id, d.agency_id, d.storage_path, d.status, d.uploaded_by, d.uploader_side, d.scope_type, d.kind, d.title, d.created_at into v_doc
  from public.documents d where d.id = p_id for update;
  if v_doc.id is null or v_doc.uploaded_by is distinct from auth.uid() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_doc.created_at < now() - interval '24 hours' then raise exception 'reservation_expired' using errcode = 'P0001'; end if;
  if to_regclass('storage.objects') is not null then
    if not exists (select 1 from storage.objects o where o.bucket_id = 'agency-docs' and o.name = v_doc.storage_path) then
      raise exception 'file_missing' using errcode = 'P0001';
    end if;
  end if;
  update public.documents set status = 'ready' where id = p_id;
  perform public.audit_log('document.upload', 'document', p_id::text, null,
    jsonb_build_object('agency_id', v_doc.agency_id, 'scope_type', v_doc.scope_type, 'kind', v_doc.kind, 'title', v_doc.title), null,
    case when v_doc.uploader_side = 'talent' then 'creator'
         when public.agency_role_of(v_doc.agency_id) is not null then 'agency'
         when public.is_platform_admin() then 'admin' else 'brand' end::public.actor_type);
end $$;
revoke execute on function public.document_confirm(uuid) from public, anon;
grant execute on function public.document_confirm(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
