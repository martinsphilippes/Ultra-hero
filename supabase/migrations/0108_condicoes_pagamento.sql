-- =============================================================================
-- Groscove Ultra · 0108 · Condições de pagamento (a pagar e a receber em todas as pontas) e modelo de valor das cotas
-- Pedido do responsável (04/11): "foi colocado o valor, mas não foi colocado quando seria a data de pagamento, como
-- seria o pagamento, essas possibilidades têm que estar previstas, para gerar o a pagar e os a receber em todas as
-- pontas". E (item extra): "para a cota tem que ficar parecido como está na área das marcas: valor fixo do evento e o
-- valor por marca, com quantidade de marcas também". Cenário S114. Idempotente; nada de drop de tabela/coluna;
-- search_path fixo; nenhuma função nova executável pelo visitante (S14 segue 18). Tudo é registro SIMULADO.
--
-- Decisões (sem perguntar ao responsável):
--   • D1 Fonte única: deal_payment_plans (um plano por negócio) = valor ACORDADO com a marca + condições (forma,
--     estrutura, datas, regra relativa, repasse ao Hero, nota fiscal) em jsonb normalizado (payment_plan_clean). Só o
--     Adm da agência grava (agency_payment_plan_save), antes da contratação. Depois da contratação as parcelas mudam
--     pelo caminho que já existe (agency_receivable_split, 0090) e o repasse pela agenda do pagamento (0082).
--   • D2 Valor que a marca paga = o ACORDADO (não mais a soma dos cachês + taxa). Sugestão para o Adm: a rodada aceita
--     da negociação (0106; por Hero = valor × Heros propostos, até o máximo), senão o valor oferecido (0096), senão
--     cachês + taxa (fórmula antiga). Comissão da agência = acordado − Σ repasses. Identidade mantida e conferida:
--     a receber da marca = comissão + Σ repasses (finance_identity). Acordado menor que os repasses é recusado
--     (agreed_below_payouts). A taxa gravada no lançamento (rate_bp) passa a ser a taxa efetiva (limitada a 50%).
--   • D3 Estrutura: à vista (1 parcela) | sinal % + saldo | 2 a 12 parcelas (mensal, quinzenal ou datas manuais).
--     Vencimento: data fixa ou regra relativa ("na assinatura | na entrega | na publicação" + N dias corridos). Datas
--     em dias corridos; vencimento em fim de semana/feriado fica como está (anotado: quem paga antecipa). Mensal soma
--     k meses ao 1º vencimento (31/01 → 28/02, como o Postgres). Centavo que sobra na divisão vai para as primeiras
--     parcelas (mesma regra de splitEvenly, 0090). Espelho em TypeScript: src/lib/finance/payment-plan.ts (vitest).
--   • D4 Repasse ao Hero: N dias após a agência RECEBER tudo (última parcela; depois de paga, a data real do último
--     pagamento) | data fixa | N dias após a entrega aprovada; forma PIX ou TED. Nota fiscal: exigida do Hero
--     (lembrete na tela de ganhos) e/ou emitida pela agência para a marca (informativo).
--   • D5 Eventos: assinatura = aceite da marca nos termos vivos (senão a confirmação; antes disso, hoje); entrega =
--     todas as entregas aprovadas/publicadas (data real) ou, antes, a maior data de entrega prevista/fim previsto do
--     negócio; publicação = idem com a publicação. Previsões nunca ficam no passado.
--   • D6 PREVISTO: financial_entries ganha a situação 'forecast' ("Previsto · aguardando contratação"): nasce quando o
--     plano é salvo, se refaz quando cachês/elenco/termos mudam e no cron diário, aparece para marca (Pagamentos), Hero
--     (Ganhos) e agência (Financeiro) e NÃO conta como aberto (não vence, não recebe informe, nota nem agenda). Na
--     confirmação da contratação (agency_contract_confirm → agency_finance_generate) o previsto é refeito como
--     EM ABERTO ('planned') com os Heros contratados. Negócio perdido/cancelado: o previsto é cancelado (gatilho que
--     já existe). Lançamentos e parcelas gerados pelo plano ficam marcados (from_plan): o cron recalcula a data de
--     quem depende de entrega/publicação enquanto não houver informe/pagamento/agendamento; parcelas redivididas à mão
--     (0090) deixam de seguir o plano.
--   • D7 Termos: enviar termos de negócio com marca exige o plano (payment_terms_required) — é o caso do "Mulheres"
--     (aprovado, termos em rascunho): ao enviar, a agência é levada às condições. O envio congela uma cópia do plano
--     por versão (deal_terms_payments); a contratação usa a cópia ASSINADA. O texto assinado (hash) passa a levar as
--     condições da PARTE: a marca assina o valor total e as parcelas; o Hero assina o cachê dele, quando e como
--     recebe e se a nota é exigida (nunca o valor da marca nem a comissão). Termos antigos sem cópia: texto igual ao de
--     antes (hash igual). Plano mudado depois do envio = aviso "envie nova versão dos termos" (terms_pending).
--     Gestor/colaborador nunca leem valores: o comprovante da assinatura volta sem a seção de pagamento para eles e a
--     coluna signed_text sai da leitura direta de authenticated (só pela RPC do comprovante).
--   • D8 Negócio só do Hero (cliente Hero, 0107): sem pedido, sem termos e sem marca; o plano é recusado
--     (invalid_state) e fica documentado como pendência (o Hero pagar à agência pede outro tipo de lançamento:
--     financial_entries.brand_id é obrigatório). Negócios já em produção mantêm os lançamentos (nada é refeito).
--   • D9 Avisos: o "a receber" da marca já avisava (brand_payment_due_scan, 0090). Novo payout_due: repasse ao Hero
--     3 dias antes, no dia e vencido — para o Hero (titular) e para o Adm (quem paga). Plano salvo avisa a marca
--     (payment_plan, sem valor). Só no sino (o e-mail segue as regras de inbox_kind_emails, sem mudança).
--   • D10 Leitura: deal_payment_plan_json por quem vê — Adm (tudo, sugestão, repasses, comissão), gestor/equipe do
--     negócio (condições e datas, sem valor), marca (total e parcelas, sem cachês nem repasse), Hero titular (só o
--     repasse dele). RLS das tabelas novas: só Adm da agência e admin da plataforma; o resto pelas RPCs.
--   • D11 Cotas (sponsorship_tiers, 0088): value_model 'fixo' (valor total da cota no evento, completado pelas marcas que
--     entram, até "slots") | 'por_marca' (padrão = comportamento de antes: valor por marca × quantidade de marcas =
--     teto da cota). "Aceitar pelo valor pedido" no fixo = a parte que falta dividida pelas vagas que sobram
--     (sponsorship_tier_ask, "cada marca a partir de"); na proposta do fixo a marca diz quanto cobre (até o total).
--     A agência vê quanto já foi coberto (soma dos acordos). Gestor continua sem valores.
-- =============================================================================

-- 1) avisos: + payout_due (todos os anteriores, 0107) ------------------------------------------------------------------
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
  'payout_due'));

-- 2) lançamentos e parcelas: previsto e "segue o plano" -----------------------------------------------------------------
alter table public.financial_entries drop constraint if exists financial_entries_status_check;
alter table public.financial_entries add constraint financial_entries_status_check check (status in ('forecast', 'planned', 'due', 'settled', 'cancelled'));
alter table public.financial_entries add column if not exists from_plan boolean not null default false;
grant select (from_plan) on public.financial_entries to authenticated;
alter table public.brand_payment_installments add column if not exists from_plan boolean not null default false;

-- 3) funções puras do plano --------------------------------------------------------------------------------------------
-- R$ 1.234,56 (texto do contrato, independente do idioma da tela)
create or replace function public.brl_text(p_cents bigint)
returns text language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(coalesce(p_cents, 0) / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
$$;
revoke execute on function public.brl_text(bigint) from public, anon;
grant execute on function public.brl_text(bigint) to authenticated, service_role;

-- valida e normaliza as condições (formato; as janelas de data ficam no salvar). Lança invalid_input.
-- Saída (todas as chaves sempre presentes; null quando não se aplica):
--   method pix|boleto|transfer|card|other · method_note · structure single|down_payment|installments · down_payment_pct 1..99
--   installments 2..12 · interval monthly|biweekly|manual · dates [YYYY-MM-DD] (manual) · first_rule/balance_rule
--   date|signature|delivery|publication · first_days/balance_days 0..365 · first_on/balance_on · payout_rule
--   after_receipt|fixed_date|after_delivery · payout_days · payout_on · payout_method pix|transfer · invoice_talent ·
--   invoice_agency · notes (≤ 500)
create or replace function public.payment_plan_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_method text; v_note text; v_struct text; v_pct int; v_n int; v_int text; v_dates date[]; v_fr text; v_fd int; v_fo date;
        v_br text; v_bd int; v_bo date; v_pr text; v_pd int; v_po date; v_pm text; v_it boolean; v_ia boolean; v_notes text; i int;
        c_rules constant text[] := array['date', 'signature', 'delivery', 'publication'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_method := coalesce(nullif(btrim(coalesce(p ->> 'method', '')), ''), 'pix');
    v_note := regexp_replace(btrim(coalesce(p ->> 'method_note', '')), '\s+', ' ', 'g');
    v_struct := coalesce(nullif(btrim(coalesce(p ->> 'structure', '')), ''), 'single');
    v_pct := nullif(btrim(coalesce(p ->> 'down_payment_pct', '')), '')::int;
    v_n := nullif(btrim(coalesce(p ->> 'installments', '')), '')::int;
    v_int := nullif(btrim(coalesce(p ->> 'interval', '')), '');
    if jsonb_typeof(p -> 'dates') = 'array' then
      select array_agg(nullif(btrim(x), '')::date order by n) into v_dates from jsonb_array_elements_text(p -> 'dates') with ordinality e(x, n);
    end if;
    v_fr := coalesce(nullif(btrim(coalesce(p ->> 'first_rule', '')), ''), 'date');
    v_fd := coalesce(nullif(btrim(coalesce(p ->> 'first_days', '')), '')::int, 0);
    v_fo := nullif(btrim(coalesce(p ->> 'first_on', '')), '')::date;
    v_br := coalesce(nullif(btrim(coalesce(p ->> 'balance_rule', '')), ''), 'date');
    v_bd := coalesce(nullif(btrim(coalesce(p ->> 'balance_days', '')), '')::int, 0);
    v_bo := nullif(btrim(coalesce(p ->> 'balance_on', '')), '')::date;
    v_pr := coalesce(nullif(btrim(coalesce(p ->> 'payout_rule', '')), ''), 'after_receipt');
    v_pd := coalesce(nullif(btrim(coalesce(p ->> 'payout_days', '')), '')::int, 0);
    v_po := nullif(btrim(coalesce(p ->> 'payout_on', '')), '')::date;
    v_pm := coalesce(nullif(btrim(coalesce(p ->> 'payout_method', '')), ''), 'pix');
    v_it := coalesce((p ->> 'invoice_talent')::boolean, false);
    v_ia := coalesce((p ->> 'invoice_agency')::boolean, false);
    v_notes := btrim(coalesce(p ->> 'notes', ''));
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_method not in ('pix', 'boleto', 'transfer', 'card', 'other') or char_length(v_note) > 120
     or (v_method = 'other' and char_length(v_note) < 2) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_method <> 'other' then v_note := ''; end if;
  if v_struct not in ('single', 'down_payment', 'installments') or char_length(v_notes) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- parcelas
  if v_struct = 'installments' then
    if v_n is null or v_n not between 2 and 12 or v_int is null or v_int not in ('monthly', 'biweekly', 'manual') then raise exception 'invalid_input' using errcode = '22023'; end if;
  else
    v_n := null; v_int := null;
  end if;
  if v_struct = 'installments' and v_int = 'manual' then
    if v_dates is null or cardinality(v_dates) <> v_n or array_position(v_dates, null) is not null then raise exception 'invalid_input' using errcode = '22023'; end if;
    for i in 2 .. v_n loop
      if v_dates[i] < v_dates[i - 1] then raise exception 'invalid_input' using errcode = '22023'; end if;
    end loop;
    v_fr := null; v_fd := null; v_fo := null;
  else
    v_dates := null;
    if v_fr not in (select unnest(c_rules)) or v_fd not between 0 and 365 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_fr = 'date' then
      if v_fo is null then raise exception 'invalid_input' using errcode = '22023'; end if;
      v_fd := 0;
    else v_fo := null;
    end if;
  end if;
  -- sinal + saldo
  if v_struct = 'down_payment' then
    if v_pct is null or v_pct not between 1 and 99 or v_br not in (select unnest(c_rules)) or v_bd not between 0 and 365 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_br = 'date' then
      if v_bo is null or (v_fr = 'date' and v_bo < v_fo) then raise exception 'invalid_input' using errcode = '22023'; end if;
      v_bd := 0;
    else v_bo := null;
    end if;
  else
    v_pct := null; v_br := null; v_bd := null; v_bo := null;
  end if;
  -- repasse ao Hero
  if v_pr not in ('after_receipt', 'fixed_date', 'after_delivery') or v_pm not in ('pix', 'transfer') or v_pd not between 0 and 365 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_pr = 'fixed_date' then
    if v_po is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_pd := 0;
  else v_po := null;
  end if;
  return jsonb_build_object('method', v_method, 'method_note', v_note, 'structure', v_struct, 'down_payment_pct', v_pct,
    'installments', v_n, 'interval', v_int, 'dates', to_jsonb(v_dates), 'first_rule', v_fr, 'first_days', v_fd, 'first_on', v_fo,
    'balance_rule', v_br, 'balance_days', v_bd, 'balance_on', v_bo, 'payout_rule', v_pr, 'payout_days', v_pd, 'payout_on', v_po,
    'payout_method', v_pm, 'invoice_talent', v_it, 'invoice_agency', v_ia, 'notes', v_notes);
end $$;
revoke execute on function public.payment_plan_clean(jsonb) from public, anon;
grant execute on function public.payment_plan_clean(jsonb) to authenticated, service_role;

create or replace function public.payment_plan_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return public.payment_plan_clean(p) = p;
exception when others then return false;
end $$;
revoke execute on function public.payment_plan_valid(jsonb) from public, anon;
grant execute on function public.payment_plan_valid(jsonb) to authenticated, service_role;

-- data de uma regra: fixa (p_on) ou evento + N dias
create or replace function public.payment_rule_date(p_rule text, p_days int, p_on date, p_sig date, p_del date, p_pub date)
returns date language sql immutable set search_path = '' as $$
  select case p_rule when 'date' then p_on when 'signature' then p_sig + coalesce(p_days, 0) when 'delivery' then p_del + coalesce(p_days, 0)
                     when 'publication' then p_pub + coalesce(p_days, 0) end
$$;
revoke execute on function public.payment_rule_date(text, int, date, date, date, date) from public, anon;
grant execute on function public.payment_rule_date(text, int, date, date, date, date) to authenticated, service_role;

-- parcelas da marca: [{seq, amount_cents, due_on}] somando exatamente o total (mesma conta de payment-plan.ts)
create or replace function public.payment_plan_parts(p jsonb, p_total bigint, p_sig date, p_del date, p_pub date)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_struct text := p ->> 'structure'; v_first date; v_n int; v_base bigint; v_rest bigint; v_out jsonb := '[]'::jsonb; k int; v_due date; v_sig bigint;
begin
  if p_total is null or p_total < 1 then return '[]'::jsonb; end if;
  if not (v_struct = 'installments' and p ->> 'interval' = 'manual') then
    v_first := public.payment_rule_date(p ->> 'first_rule', (p ->> 'first_days')::int, (p ->> 'first_on')::date, p_sig, p_del, p_pub);
  end if;
  if v_struct = 'down_payment' then
    v_sig := round(p_total * (p ->> 'down_payment_pct')::int / 100.0)::bigint;
    if p_total >= 2 then v_sig := greatest(1, least(p_total - 1, v_sig)); end if;
    v_out := jsonb_build_array(jsonb_build_object('seq', 1, 'amount_cents', v_sig, 'due_on', v_first),
      jsonb_build_object('seq', 2, 'amount_cents', p_total - v_sig,
        'due_on', public.payment_rule_date(p ->> 'balance_rule', (p ->> 'balance_days')::int, (p ->> 'balance_on')::date, p_sig, p_del, p_pub)));
  elsif v_struct = 'installments' then
    v_n := (p ->> 'installments')::int;
    v_base := p_total / v_n; v_rest := p_total - v_base * v_n;
    for k in 0 .. v_n - 1 loop
      v_due := case p ->> 'interval' when 'monthly' then (v_first + make_interval(months => k))::date
                                     when 'biweekly' then v_first + 14 * k
                                     else ((p -> 'dates') ->> k)::date end;
      v_out := v_out || jsonb_build_array(jsonb_build_object('seq', k + 1, 'amount_cents', v_base + case when k < v_rest then 1 else 0 end, 'due_on', v_due));
    end loop;
  else
    v_out := jsonb_build_array(jsonb_build_object('seq', 1, 'amount_cents', p_total, 'due_on', v_first));
  end if;
  return v_out;
end $$;
revoke execute on function public.payment_plan_parts(jsonb, bigint, date, date, date) from public, anon;
grant execute on function public.payment_plan_parts(jsonb, bigint, date, date, date) to authenticated, service_role;

-- vencimento do repasse ao Hero (p_received = última parcela, ou a data real do último pagamento)
create or replace function public.payment_plan_payout_due(p jsonb, p_received date, p_del date)
returns date language sql immutable set search_path = '' as $$
  select case p ->> 'payout_rule' when 'after_receipt' then p_received + coalesce((p ->> 'payout_days')::int, 0)
                                  when 'fixed_date' then (p ->> 'payout_on')::date
                                  when 'after_delivery' then p_del + coalesce((p ->> 'payout_days')::int, 0) end
$$;
revoke execute on function public.payment_plan_payout_due(jsonb, date, date) from public, anon;
grant execute on function public.payment_plan_payout_due(jsonb, date, date) to authenticated, service_role;

-- 4) tabelas ------------------------------------------------------------------------------------------------------------
create table if not exists public.deal_payment_plans (
  deal_id uuid primary key constraint deal_payment_plans_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint deal_payment_plans_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid constraint deal_payment_plans_brand_fk references public.brands (id) on delete cascade,
  total_cents bigint not null,
  plan jsonb not null,
  version int not null default 1,
  updated_by uuid constraint deal_payment_plans_updated_by_fk references auth.users (id) on delete set null,
  updated_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_payment_plans_total_check check (total_cents between 1 and 10000000000),
  constraint deal_payment_plans_plan_check check (public.payment_plan_valid(plan)),
  constraint deal_payment_plans_label_check check (char_length(updated_label) <= 80)
);
create index if not exists deal_payment_plans_agency_idx on public.deal_payment_plans (agency_id);
drop trigger if exists deal_payment_plans_touch on public.deal_payment_plans;
create trigger deal_payment_plans_touch before update on public.deal_payment_plans for each row execute function public.set_updated_at();

-- cópia do plano congelada em cada versão enviada dos termos (o que a marca e os Heros assinam)
create table if not exists public.deal_terms_payments (
  terms_id uuid primary key constraint deal_terms_payments_terms_fk references public.deal_terms (id) on delete cascade,
  deal_id uuid not null constraint deal_terms_payments_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint deal_terms_payments_agency_fk references public.agencies (id) on delete cascade,
  total_cents bigint not null,
  plan jsonb not null,
  payouts jsonb not null default '[]'::jsonb,
  plan_version int not null default 1,
  created_at timestamptz not null default now(),
  constraint deal_terms_payments_total_check check (total_cents between 1 and 10000000000),
  constraint deal_terms_payments_plan_check check (public.payment_plan_valid(plan)),
  constraint deal_terms_payments_payouts_check check (jsonb_typeof(payouts) = 'array')
);
create index if not exists deal_terms_payments_deal_idx on public.deal_terms_payments (deal_id);

do $$
declare t text;
begin
  foreach t in array array['deal_payment_plans', 'deal_terms_payments'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
    execute format('drop policy if exists %1$s_select_agency on public.%1$I', t);
    execute format('create policy %1$s_select_agency on public.%1$I for select to authenticated using (agency_id = any ((select public.my_agency_ids(''admin''))::uuid[]))', t);
  end loop;
end $$;

-- 5) eventos, sugestão e escrita dos lançamentos (internas) ------------------------------------------------------------
-- datas dos eventos do negócio (fuso da agência): assinatura, entrega e publicação (reais ou previstas, D5)
create or replace function public.deal_payment_events(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_tz text; v_today date; v_sig date; v_sig_real boolean := false; v_del date; v_del_real boolean := false;
        v_pub date; v_pub_real boolean := false; v_acc timestamptz; x record; v_won date;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null then return null; end if;
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = d.agency_id;
  v_today := (now() at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;
  select max(a.accepted_at) into v_acc from public.deal_acceptances a join public.deal_terms t on t.id = a.terms_id
  where a.deal_id = p_deal and a.party = 'brand' and t.status in ('sent', 'accepted');
  if v_acc is not null then v_sig := (v_acc at time zone v_tz)::date; v_sig_real := true;
  elsif d.contract_confirmed_at is not null then v_sig := (d.contract_confirmed_at at time zone v_tz)::date; v_sig_real := true;
  else v_sig := v_today;
  end if;
  v_won := case when d.stage = 'closed' and d.outcome = 'won' then (coalesce(d.closed_at, d.stage_changed_at) at time zone v_tz)::date end;
  select count(*) filter (where x2.status <> 'cancelled') as n,
         count(*) filter (where x2.status in ('approved', 'published', 'proof_submitted', 'done')) as delivered,
         count(*) filter (where x2.status in ('published', 'proof_submitted', 'done')) as published,
         max(coalesce(x2.decided_at, x2.published_at, x2.updated_at)) filter (where x2.status <> 'cancelled') as delivered_at,
         max(coalesce(x2.published_at, x2.updated_at)) filter (where x2.status <> 'cancelled') as published_at,
         max(x2.due_at) filter (where x2.status <> 'cancelled') as due_at,
         max(x2.publish_at) filter (where x2.status <> 'cancelled') as publish_at
    into x from public.deliverables x2 where x2.deal_id = p_deal;
  if x.n > 0 and x.delivered = x.n then v_del := (x.delivered_at at time zone v_tz)::date; v_del_real := true;
  elsif v_won is not null then v_del := v_won; v_del_real := true;
  else v_del := greatest(coalesce((x.due_at at time zone v_tz)::date, d.expected_end, v_sig + 30), v_today);
  end if;
  if x.n > 0 and x.published = x.n then v_pub := (x.published_at at time zone v_tz)::date; v_pub_real := true;
  elsif v_won is not null then v_pub := v_won; v_pub_real := true;
  else v_pub := greatest(coalesce((x.publish_at at time zone v_tz)::date, d.expected_end, v_del), v_today);
  end if;
  return jsonb_build_object('today', v_today, 'signature', v_sig, 'delivery', v_del, 'publication', v_pub,
    'signature_real', v_sig_real, 'delivery_real', v_del_real, 'publication_real', v_pub_real);
end $$;
revoke execute on function public.deal_payment_events(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_events(uuid) to service_role;

-- quantos Heros contam para o valor "por Hero": propostos/contratados, até o máximo acordado (no mínimo 1)
create or replace function public.deal_payment_heroes(p_deal uuid, p_max int)
returns int language sql stable security definer set search_path = '' as $$
  select greatest(1, least(coalesce(p_max, 50), (select count(*)::int from public.deal_talents dt where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted'))))
$$;
revoke execute on function public.deal_payment_heroes(uuid, int) from public, anon, authenticated;
grant execute on function public.deal_payment_heroes(uuid, int) to service_role;

-- valor sugerido para o acordado (D2): rodada aceita → valor oferecido → cachês + taxa
create or replace function public.deal_payment_suggested(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; r public.deal_offer_rounds%rowtype; b public.campaign_request_budgets%rowtype; v_rate int; v_fees bigint;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null then return null; end if;
  select * into r from public.deal_offer_rounds x where x.deal_id = p_deal and x.action = 'accept' order by x.seq desc limit 1;
  if r.id is not null then
    return jsonb_build_object('source', 'agreed', 'cents', case when r.value_model = 'por_heroi' then r.amount_cents * public.deal_payment_heroes(p_deal, r.max_heroes) else r.amount_cents end);
  end if;
  select * into b from public.campaign_request_budgets x where x.request_id = d.request_id;
  if b.request_id is not null and coalesce(b.budget_max_cents, 0) > 0 then
    return jsonb_build_object('source', 'offered', 'cents', case when b.value_model = 'por_heroi' then b.budget_max_cents * public.deal_payment_heroes(p_deal, b.max_heroes) else b.budget_max_cents end);
  end if;
  select coalesce(d.service_rate_bp, a.service_rate_bp, 0) into v_rate from public.agencies a where a.id = d.agency_id;
  select coalesce(sum(f.fee_cents), 0) into v_fees from public.deal_talents dt join public.deal_talent_fees f on f.deal_talent_id = dt.id
  where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted');
  if v_fees > 0 then return jsonb_build_object('source', 'fees', 'cents', v_fees + round(v_fees * v_rate / 10000.0)::bigint); end if;
  return jsonb_build_object('source', 'none', 'cents', null);
end $$;
revoke execute on function public.deal_payment_suggested(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_suggested(uuid) to service_role;

-- soma dos cachês que viram repasse: previsto = propostos/contratados com cachê; efetivo = contratados
create or replace function public.deal_payment_fees(p_deal uuid, p_effective boolean)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coalesce(f.fee_cents, 0)), 0)::bigint
  from public.deal_talents dt left join public.deal_talent_fees f on f.deal_talent_id = dt.id
  where dt.deal_id = p_deal and ((p_effective and dt.status = 'contracted') or (not p_effective and dt.status in ('proposed', 'contracted') and f.fee_cents is not null))
$$;
revoke execute on function public.deal_payment_fees(uuid, boolean) from public, anon, authenticated;
grant execute on function public.deal_payment_fees(uuid, boolean) to service_role;

-- escreve os lançamentos do plano (a receber da marca em parcelas, comissão e repasses) com a situação pedida.
-- Quem chama já apagou os lançamentos anteriores do negócio. Lança agreed_below_payouts e finance_identity.
create or replace function public.deal_payment_write(p_deal uuid, p_total bigint, p_plan jsonb, p_status text)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_effective boolean := p_status <> 'forecast'; v_fees bigint; v_comm bigint; v_rate int; ev jsonb; v_parts jsonb;
        v_first date; v_last date; v_pay date; v_recv uuid; v_n int := 0; v_check bigint; r record; v_agency_rate int; v_pay_rule boolean;
begin
  select * into d from public.deals where id = p_deal;
  v_fees := public.deal_payment_fees(p_deal, v_effective);
  if p_total < v_fees then raise exception 'agreed_below_payouts' using errcode = 'P0001'; end if;
  ev := public.deal_payment_events(p_deal);
  v_parts := public.payment_plan_parts(p_plan, p_total, (ev ->> 'signature')::date, (ev ->> 'delivery')::date, (ev ->> 'publication')::date);
  select min((x ->> 'due_on')::date), max((x ->> 'due_on')::date) into v_first, v_last from jsonb_array_elements(v_parts) x;
  v_pay := public.payment_plan_payout_due(p_plan, v_last, (ev ->> 'delivery')::date);
  v_pay_rule := p_plan ->> 'payout_rule' <> 'fixed_date';
  v_comm := p_total - v_fees;
  select coalesce(d.service_rate_bp, a.service_rate_bp, 0) into v_agency_rate from public.agencies a where a.id = d.agency_id;
  v_rate := case when v_fees > 0 then least(5000, greatest(0, round(v_comm * 10000.0 / v_fees)))::int else v_agency_rate end;
  for r in select dt.id, dt.talent_id, coalesce(f.fee_cents, 0) as fee
           from public.deal_talents dt left join public.deal_talent_fees f on f.deal_talent_id = dt.id
           where dt.deal_id = p_deal and ((v_effective and dt.status = 'contracted') or (not v_effective and dt.status in ('proposed', 'contracted') and f.fee_cents is not null))
           order by dt.created_at loop
    insert into public.financial_entries (agency_id, brand_id, deal_id, talent_id, deal_talent_id, kind, amount_cents, rate_bp, status, due_on, from_plan, created_by)
    values (d.agency_id, d.brand_id, p_deal, r.talent_id, r.id, 'talent_payout', r.fee, v_rate, p_status, v_pay, v_pay_rule, auth.uid())
    on conflict (deal_id, kind, deal_talent_id) do nothing;
    v_n := v_n + 1;
  end loop;
  insert into public.financial_entries (agency_id, brand_id, deal_id, kind, amount_cents, rate_bp, status, due_on, from_plan, created_by)
  values (d.agency_id, d.brand_id, p_deal, 'brand_receivable', p_total, v_rate, p_status, v_first, true, auth.uid())
  on conflict (deal_id, kind, deal_talent_id) do nothing returning id into v_recv;
  if v_recv is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  insert into public.financial_entries (agency_id, brand_id, deal_id, kind, amount_cents, rate_bp, status, due_on, from_plan, created_by)
  values (d.agency_id, d.brand_id, p_deal, 'commission', v_comm, v_rate, p_status, v_last, true, auth.uid())
  on conflict (deal_id, kind, deal_talent_id) do nothing;
  -- parcelas do plano no lugar da parcela única automática (0090)
  delete from public.brand_payment_installments i where i.entry_id = v_recv;
  insert into public.brand_payment_installments (agency_id, brand_id, deal_id, entry_id, seq, label, amount_cents, due_on, from_plan)
  select d.agency_id, d.brand_id, p_deal, v_recv, (x ->> 'seq')::int, '', (x ->> 'amount_cents')::bigint, (x ->> 'due_on')::date, true
  from jsonb_array_elements(v_parts) x;
  -- identidade: o que a marca paga = comissão + repasses
  select coalesce(sum(case when kind = 'brand_receivable' then amount_cents else -amount_cents end), 0) into v_check
  from public.financial_entries where deal_id = p_deal and status = p_status;
  if v_check <> 0 then raise exception 'finance_identity' using errcode = 'P0001'; end if;
  return v_n + 2;
end $$;
revoke execute on function public.deal_payment_write(uuid, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.deal_payment_write(uuid, bigint, jsonb, text) to service_role;

-- o negócio já tem lançamentos efetivos (contratação)?
create or replace function public.deal_payment_effective(p_deal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deals d where d.id = p_deal and d.contract_confirmed_at is not null)
      or exists (select 1 from public.financial_entries f where f.deal_id = p_deal and f.status not in ('forecast', 'cancelled'))
$$;
revoke execute on function public.deal_payment_effective(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_effective(uuid) to service_role;

-- refaz o PREVISTO de um negócio (nunca lança: se não fecha a conta, fica sem previsto até o Adm ajustar)
create or replace function public.deal_payment_forecast(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; pl public.deal_payment_plans%rowtype; v_n int := 0;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or public.deal_payment_effective(p_deal) then return 0; end if;
  delete from public.financial_entries f where f.deal_id = p_deal and (f.status = 'forecast'
    or (f.status = 'cancelled' and f.settled_at is null and f.note in ('deal_lost', 'deal_cancelled')));
  if d.stage = 'closed' or d.brand_id is null then return 0; end if;
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  if pl.deal_id is null then return 0; end if;
  begin
    v_n := public.deal_payment_write(p_deal, pl.total_cents, pl.plan, 'forecast');
  exception when others then v_n := 0;
  end;
  return v_n;
end $$;
revoke execute on function public.deal_payment_forecast(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_forecast(uuid) to service_role;

-- previsto acompanha cachês e elenco (gatilhos; nunca bloqueiam quem mexe no cachê)
create or replace function public.deal_payment_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_deal uuid;
begin
  v_deal := case when tg_op = 'DELETE' then old.deal_id else new.deal_id end;
  if tg_table_name = 'deal_talents' then
    if new.status is not distinct from old.status then return null; end if;
  end if;
  if exists (select 1 from public.deal_payment_plans p where p.deal_id = v_deal) then perform public.deal_payment_forecast(v_deal); end if;
  return null;
end $$;
revoke execute on function public.deal_payment_follow() from public, anon, authenticated;
drop trigger if exists deal_talent_fees_payment_follow on public.deal_talent_fees;
create trigger deal_talent_fees_payment_follow after insert or update of fee_cents or delete on public.deal_talent_fees
  for each row execute function public.deal_payment_follow();
drop trigger if exists deal_talents_payment_follow on public.deal_talents;
create trigger deal_talents_payment_follow after update of status on public.deal_talents
  for each row execute function public.deal_payment_follow();

-- 6) Adm: salvar as condições --------------------------------------------------------------------------------------------
create or replace function public.agency_payment_plan_save(p_deal uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_total bigint; v_plan jsonb; v_tz text; v_today date; v_day date; v_before public.deal_payment_plans%rowtype;
        v_version int; v_n int; v_parts int; v_brand text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  -- cliente Hero sem marca: fora (D8)
  if d.brand_id is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if public.deal_payment_effective(p_deal) then raise exception 'plan_locked' using errcode = 'P0001'; end if;
  begin
    v_total := nullif(btrim(coalesce(p_data ->> 'total_cents', '')), '')::bigint;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_total is null or v_total < 1 or v_total > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_plan := public.payment_plan_clean(p_data -> 'plan');
  -- datas fixas numa janela razoável (até 1 ano para trás, 2 para frente)
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = d.agency_id;
  v_today := (now() at time zone v_tz)::date;
  for v_day in select x::date from (
      select v_plan ->> 'first_on' as x union all select v_plan ->> 'balance_on' union all select v_plan ->> 'payout_on'
      union all select jsonb_array_elements_text(case when jsonb_typeof(v_plan -> 'dates') = 'array' then v_plan -> 'dates' else '[]'::jsonb end)) s
    where x is not null loop
    if v_day < v_today - 366 or v_day > v_today + 731 then raise exception 'invalid_date' using errcode = '22023'; end if;
  end loop;
  if v_total < public.deal_payment_fees(p_deal, false) then raise exception 'agreed_below_payouts' using errcode = 'P0001'; end if;
  select * into v_before from public.deal_payment_plans where deal_id = p_deal;
  if v_before.deal_id is not null and v_before.total_cents = v_total and v_before.plan = v_plan then
    return jsonb_build_object('version', v_before.version, 'changed', false, 'forecast', public.deal_payment_forecast(p_deal));
  end if;
  insert into public.deal_payment_plans (deal_id, agency_id, brand_id, total_cents, plan, version, updated_by, updated_label)
  values (p_deal, d.agency_id, d.brand_id, v_total, v_plan, 1, auth.uid(), public.actor_label(d.agency_id))
  on conflict (deal_id) do update set total_cents = excluded.total_cents, plan = excluded.plan, brand_id = excluded.brand_id,
    version = public.deal_payment_plans.version + 1, updated_by = excluded.updated_by, updated_label = excluded.updated_label
  returning version into v_version;
  perform public.audit_log('finance.payment_plan', 'deal', p_deal::text,
    case when v_before.deal_id is null then null else jsonb_build_object('agency_id', d.agency_id, 'total_cents', v_before.total_cents, 'plan', v_before.plan) end,
    jsonb_build_object('agency_id', d.agency_id, 'total_cents', v_total, 'plan', v_plan, 'version', v_version), null, public.talent_audit_actor('agency', d.agency_id));
  v_n := public.deal_payment_forecast(p_deal);
  -- a marca é avisada (sem valor) de que as condições estão na tela de Pagamentos
  if d.brand_visible then
    v_parts := jsonb_array_length(public.payment_plan_parts(v_plan, v_total, v_today, v_today, v_today));
    select b.name into v_brand from public.brands b where b.id = d.brand_id;
    perform public.inbox_notify_brand(d.brand_id, false, 'payment_plan', '/marca/pagamentos', jsonb_build_object('deal', left(d.title, 120), 'step', v_parts::text),
      d.agency_id, 'deal', d.id, 'payment_plan:' || d.id::text || ':' || v_version::text);
  end if;
  return jsonb_build_object('version', v_version, 'changed', true, 'forecast', v_n);
end $$;
revoke execute on function public.agency_payment_plan_save(uuid, jsonb) from public, anon;
grant execute on function public.agency_payment_plan_save(uuid, jsonb) to authenticated, service_role;

-- 7) leitura por quem vê (D10) -----------------------------------------------------------------------------------------
create or replace function public.deal_payment_plan_json(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_viewer text; v_values boolean := false; v_dt public.deal_talents%rowtype; pl public.deal_payment_plans%rowtype;
        v_eff boolean; recv public.financial_entries%rowtype; ev jsonb; v_parts jsonb; v_fees bigint; v_last date; v_pay date; v_status text;
        v_live public.deal_terms%rowtype; snap public.deal_terms_payments%rowtype; v_pending boolean := false; o jsonb; v_plan jsonb; my public.financial_entries%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_can(d.agency_id, 'manager') or (public.agency_can(d.agency_id, 'staff') and d.id = any (public.my_staff_deal_ids())) then
    v_viewer := 'agency'; v_values := public.agency_can(d.agency_id, 'admin');
  elsif d.brand_visible and d.brand_id is not null and public.brand_member_of(d.brand_id) is not null then
    v_viewer := 'brand'; v_values := true;
  else
    select * into v_dt from public.deal_talents x where x.deal_id = p_deal and x.talent_id = public.my_talent_owner_id() and x.status in ('proposed', 'contracted');
    if v_dt.id is not null then v_viewer := 'talent'; v_values := true; end if;
  end if;
  if v_viewer is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  v_eff := public.deal_payment_effective(p_deal);
  select * into recv from public.financial_entries f where f.deal_id = p_deal and f.kind = 'brand_receivable' and f.status <> 'cancelled';
  ev := public.deal_payment_events(p_deal);
  if recv.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seq', i.seq, 'amount_cents', i.amount_cents, 'due_on', i.due_on, 'label', i.label,
             'status', case when recv.status = 'settled' then 'paid' else i.status end) order by i.seq), '[]'::jsonb)
      into v_parts from public.brand_payment_installments i where i.entry_id = recv.id;
  elsif pl.deal_id is not null then
    v_parts := public.payment_plan_parts(pl.plan, pl.total_cents, (ev ->> 'signature')::date, (ev ->> 'delivery')::date, (ev ->> 'publication')::date);
  else v_parts := '[]'::jsonb;
  end if;
  select max((x ->> 'due_on')::date) into v_last from jsonb_array_elements(v_parts) x;
  v_status := case when v_eff then 'effective' when recv.status = 'forecast' then 'forecast' when pl.deal_id is not null then 'saved' else 'none' end;
  -- termos vivos com cópia diferente do plano atual → "envie nova versão"
  select * into v_live from public.deal_terms t where t.deal_id = p_deal and t.status in ('sent', 'accepted') order by t.version desc limit 1;
  if v_live.id is not null and pl.deal_id is not null and not v_eff then
    select * into snap from public.deal_terms_payments s where s.terms_id = v_live.id;
    v_pending := snap.terms_id is null or snap.total_cents <> pl.total_cents or snap.plan <> pl.plan;
  end if;
  o := jsonb_build_object('enabled', d.brand_id is not null, 'viewer', v_viewer, 'values', v_values, 'status', v_status, 'has_plan', pl.deal_id is not null,
    'locked', v_eff, 'version', pl.version, 'updated_at', pl.updated_at, 'events', ev);
  if v_viewer = 'agency' then
    v_fees := public.deal_payment_fees(p_deal, v_eff);
    o := o || jsonb_build_object('plan', pl.plan, 'terms_pending', v_pending, 'stage', d.stage,
      'can_edit', v_values and not v_eff and d.stage <> 'closed' and d.brand_id is not null,
      'agreed', coalesce((public.deal_offer_state(p_deal) ->> 'agreed')::boolean, false),
      'parts', case when v_values then v_parts else (select coalesce(jsonb_agg(x - 'amount_cents'), '[]'::jsonb) from jsonb_array_elements(v_parts) x) end);
    if v_values then
      o := o || jsonb_build_object('total_cents', pl.total_cents, 'updated_label', pl.updated_label, 'suggested', public.deal_payment_suggested(p_deal),
        'payouts_cents', v_fees, 'commission_cents', case when pl.deal_id is null then null else pl.total_cents - v_fees end,
        'ok', pl.deal_id is null or pl.total_cents >= v_fees,
        'payout_due_on', case when pl.deal_id is null then null else public.payment_plan_payout_due(pl.plan, v_last, (ev ->> 'delivery')::date) end,
        'payouts', (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', dt.id, 'name', t.display_name, 'status', dt.status, 'fee_cents', f.fee_cents,
                      'entry_status', e.status, 'due_on', e.due_on, 'scheduled_on', e.scheduled_on) order by dt.created_at), '[]'::jsonb)
                    from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id
                    left join public.deal_talent_fees f on f.deal_talent_id = dt.id
                    left join public.financial_entries e on e.deal_talent_id = dt.id and e.kind = 'talent_payout' and e.status <> 'cancelled'
                    where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted')));
    end if;
  elsif v_viewer = 'brand' then
    v_plan := case when pl.deal_id is null then null else pl.plan - 'payout_rule' - 'payout_days' - 'payout_on' - 'payout_method' - 'invoice_talent' end;
    o := o || jsonb_build_object('plan', v_plan, 'total_cents', pl.total_cents, 'parts', case when pl.deal_id is null and recv.id is null then '[]'::jsonb else v_parts end,
      'request_id', d.request_id);
  else
    select * into my from public.financial_entries f where f.deal_talent_id = v_dt.id and f.kind = 'talent_payout' and f.status <> 'cancelled';
    v_pay := case when pl.deal_id is null then null else public.payment_plan_payout_due(pl.plan, v_last, (ev ->> 'delivery')::date) end;
    o := o || jsonb_build_object('plan', case when pl.deal_id is null then null else jsonb_build_object('payout_rule', pl.plan ->> 'payout_rule',
        'payout_days', (pl.plan ->> 'payout_days')::int, 'payout_on', pl.plan ->> 'payout_on', 'payout_method', pl.plan ->> 'payout_method',
        'invoice_talent', (pl.plan ->> 'invoice_talent')::boolean) end,
      'my_payout', jsonb_build_object('deal_talent_id', v_dt.id,
        'amount_cents', coalesce(my.amount_cents, (select f.fee_cents from public.deal_talent_fees f where f.deal_talent_id = v_dt.id)),
        'status', my.status, 'due_on', coalesce(my.scheduled_on, my.due_on, v_pay), 'entry_id', my.id));
  end if;
  return o;
end $$;
revoke execute on function public.deal_payment_plan_json(uuid) from public, anon;
grant execute on function public.deal_payment_plan_json(uuid) to authenticated, service_role;

-- 8) termos: enviar exige as condições e congela a cópia (D7) ----------------------------------------------------------
-- MESMA assinatura da 0068; novo: plano obrigatório para negócio com marca, conta conferida, cópia por versão
create or replace function public.agency_terms_send(p_terms uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; d public.deals%rowtype; v_agency uuid; r record; v_to uuid; v_brand text; pl public.deal_payment_plans%rowtype;
begin
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(t.deal_id, false);
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(btrim(t.summary)) < 20 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = t.deal_id;
  if d.stage not in ('approved', 'contracting') then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  -- 0108: condições de pagamento antes de enviar (o Adm define em "Condições de pagamento")
  if d.brand_id is not null then
    select * into pl from public.deal_payment_plans where deal_id = d.id;
    if pl.deal_id is null then raise exception 'payment_terms_required' using errcode = 'P0001'; end if;
    if pl.total_cents < public.deal_payment_fees(d.id, false) then raise exception 'agreed_below_payouts' using errcode = 'P0001'; end if;
  end if;
  update public.deal_terms set status = 'superseded' where deal_id = t.deal_id and status in ('sent', 'accepted');
  update public.deal_terms set status = 'sent', sent_at = now(), sent_by = auth.uid() where id = p_terms;
  if pl.deal_id is not null then
    insert into public.deal_terms_payments (terms_id, deal_id, agency_id, total_cents, plan, payouts, plan_version)
    values (t.id, d.id, d.agency_id, pl.total_cents, pl.plan,
      (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', dt.id, 'fee_cents', f.fee_cents) order by dt.created_at), '[]'::jsonb)
       from public.deal_talents dt join public.deal_talent_fees f on f.deal_talent_id = dt.id
       where dt.deal_id = d.id and dt.status in ('proposed', 'contracted')), pl.version)
    on conflict (terms_id) do update set total_cents = excluded.total_cents, plan = excluded.plan, payouts = excluded.payouts, plan_version = excluded.plan_version;
  end if;
  if d.stage = 'approved' then update public.deals set stage = 'contracting', stage_changed_at = now() where id = d.id; end if;
  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  perform public.audit_log('terms.send', 'deal_terms', p_terms::text, jsonb_build_object('agency_id', v_agency, 'status', 'draft'),
    jsonb_build_object('agency_id', v_agency, 'status', 'sent', 'version', t.version, 'payment_plan_version', pl.version), null, public.talent_audit_actor('agency', v_agency));
  perform public.inbox_notify_brand(d.brand_id, true, 'contract_acceptance_requested', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title), v_agency, 'proposal', p_terms, 'terms:' || p_terms::text || ':brand');
  for r in select dt.id, dt.talent_id from public.deal_talents dt where dt.deal_id = d.id and dt.status in ('proposed', 'contracted') loop
    v_to := public.talent_user_id(r.talent_id);
    perform public.inbox_notify(v_to, 'contract_acceptance_requested', '/creator/escritorio/oportunidades/' || r.id::text,
      jsonb_build_object('deal', d.title, 'brand', v_brand), v_agency, 'proposal', p_terms, 'terms:' || p_terms::text || ':' || r.id::text);
  end loop;
end $$;
revoke execute on function public.agency_terms_send(uuid) from public, anon;
grant execute on function public.agency_terms_send(uuid) to authenticated, service_role;

-- texto de uma regra de data (contrato, pt-BR)
create or replace function public.payment_rule_text(p_rule text, p_days int, p_on date)
returns text language sql immutable set search_path = '' as $$
  select case p_rule
    when 'date' then 'em ' || to_char(p_on, 'DD/MM/YYYY')
    when 'signature' then case when coalesce(p_days, 0) = 0 then 'na assinatura' else p_days::text || ' dias após a assinatura' end
    when 'delivery' then case when coalesce(p_days, 0) = 0 then 'na entrega aprovada' else p_days::text || ' dias após a entrega aprovada' end
    when 'publication' then case when coalesce(p_days, 0) = 0 then 'na publicação' else p_days::text || ' dias após a publicação' end
    else '—' end
$$;
revoke execute on function public.payment_rule_text(text, int, date) from public, anon;
grant execute on function public.payment_rule_text(text, int, date) to authenticated, service_role;

-- seção de pagamento do texto assinado, por parte (null = termos sem cópia do plano: texto igual ao de antes)
create or replace function public.deal_terms_payment_text(p_terms uuid, p_party text, p_deal_talent uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare s public.deal_terms_payments%rowtype; p jsonb; v_parts jsonb; v_lines text[] := '{}'; x jsonb; v_fee bigint; v_n int;
begin
  select * into s from public.deal_terms_payments where terms_id = p_terms;
  if s.terms_id is null then return null; end if;
  p := s.plan;
  if p_party = 'brand' then
    v_parts := public.payment_plan_parts(p, s.total_cents, current_date, current_date, current_date);
    v_n := jsonb_array_length(v_parts);
    v_lines := array['', 'CONDIÇÕES DE PAGAMENTO (marca → agência)',
      'Valor total acordado: ' || public.brl_text(s.total_cents),
      'Forma: ' || case p ->> 'method' when 'pix' then 'PIX' when 'boleto' then 'boleto' when 'transfer' then 'transferência (TED)'
                                       when 'card' then 'cartão' else 'outra — ' || coalesce(p ->> 'method_note', '') end,
      'Estrutura: ' || case p ->> 'structure' when 'single' then 'à vista'
                                              when 'down_payment' then 'sinal de ' || (p ->> 'down_payment_pct') || '% + saldo'
                                              else v_n::text || ' parcelas' || case p ->> 'interval' when 'monthly' then ' mensais' when 'biweekly' then ' quinzenais' else ' em datas combinadas' end end];
    for x in select value from jsonb_array_elements(v_parts) loop
      v_lines := v_lines || (case when p ->> 'structure' = 'down_payment' then case when (x ->> 'seq')::int = 1 then 'Sinal' else 'Saldo' end
                                  else 'Parcela ' || (x ->> 'seq') || '/' || v_n::text end
        || ': ' || public.brl_text((x ->> 'amount_cents')::bigint) || ' — vencimento '
        || case when p ->> 'structure' = 'down_payment' and (x ->> 'seq')::int = 2
                  then public.payment_rule_text(p ->> 'balance_rule', (p ->> 'balance_days')::int, (p ->> 'balance_on')::date)
                when p ->> 'structure' = 'installments' and p ->> 'interval' = 'manual' then 'em ' || to_char((x ->> 'due_on')::date, 'DD/MM/YYYY')
                when (x ->> 'seq')::int = 1 then public.payment_rule_text(p ->> 'first_rule', (p ->> 'first_days')::int, (p ->> 'first_on')::date)
                when p ->> 'interval' = 'monthly' then ((x ->> 'seq')::int - 1)::text || ' mês(es) após a 1ª parcela'
                else (((x ->> 'seq')::int - 1) * 14)::text || ' dias após a 1ª parcela' end);
    end loop;
    v_lines := v_lines || ('Nota fiscal da agência para a marca: ' || case when (p ->> 'invoice_agency')::boolean then 'sim' else 'não' end)
                       || ('Observações: ' || coalesce(nullif(p ->> 'notes', ''), '—'));
  elsif p_party = 'talent' then
    select (e ->> 'fee_cents')::bigint into v_fee from jsonb_array_elements(s.payouts) e where e ->> 'deal_talent_id' = p_deal_talent::text;
    v_lines := array['', 'REPASSE AO HERO (agência → Hero)',
      'Seu cachê: ' || coalesce(public.brl_text(v_fee), 'a definir'),
      'Quando: ' || case p ->> 'payout_rule'
        when 'after_receipt' then case when coalesce((p ->> 'payout_days')::int, 0) = 0 then 'quando a agência receber da marca' else (p ->> 'payout_days') || ' dias após a agência receber da marca' end
        when 'fixed_date' then 'em ' || to_char((p ->> 'payout_on')::date, 'DD/MM/YYYY')
        else case when coalesce((p ->> 'payout_days')::int, 0) = 0 then 'na entrega aprovada' else (p ->> 'payout_days') || ' dias após a entrega aprovada' end end,
      'Forma: ' || case p ->> 'payout_method' when 'transfer' then 'transferência (TED)' else 'PIX' end,
      'Nota fiscal do Hero: ' || case when (p ->> 'invoice_talent')::boolean then 'exigida' else 'não exigida' end];
  else
    return null;
  end if;
  return array_to_string(v_lines, E'\n');
end $$;
revoke execute on function public.deal_terms_payment_text(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.deal_terms_payment_text(uuid, text, uuid) to service_role;

-- texto assinado de uma parte = texto dos termos (0084) + seção de pagamento da parte
create or replace function public.deal_terms_signable_text_for(p_terms uuid, p_party text, p_deal_talent uuid)
returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(E'\n', public.deal_terms_signable_text(p_terms), public.deal_terms_payment_text(p_terms, p_party, p_deal_talent))
$$;
revoke execute on function public.deal_terms_signable_text_for(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.deal_terms_signable_text_for(uuid, text, uuid) to service_role;

-- tira a seção de pagamento (gestor/colaborador da agência não leem valores)
create or replace function public.terms_text_without_payment(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), E'\\n\\n(CONDIÇÕES DE PAGAMENTO|REPASSE AO HERO) .*$', '')
$$;
revoke execute on function public.terms_text_without_payment(text) from public, anon;
grant execute on function public.terms_text_without_payment(text) to authenticated, service_role;

-- prévia (MESMA assinatura da 0084): marca → versão da marca; Hero → a dele; Adm → a da marca; gestor/colaborador → sem pagamento
create or replace function public.terms_sign_preview(p_terms uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_text text; v_version int; v_status text; v_side text; v_deal uuid; v_agency uuid; v_dt uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_side := public.terms_reader_side(p_terms);
  if v_side is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select t.version, t.status, t.deal_id, t.agency_id into v_version, v_status, v_deal, v_agency from public.deal_terms t where t.id = p_terms;
  if v_side = 'talent' then
    select dt.id into v_dt from public.deal_talents dt where dt.deal_id = v_deal and dt.talent_id = public.my_talent_id();
    v_text := public.deal_terms_signable_text_for(p_terms, 'talent', v_dt);
  elsif v_side = 'brand' or public.agency_can(v_agency, 'admin') then
    v_text := public.deal_terms_signable_text_for(p_terms, 'brand', null);
  else
    v_text := public.deal_terms_signable_text(p_terms);
  end if;
  return jsonb_build_object('terms_id', p_terms, 'version', v_version, 'status', v_status, 'text', v_text, 'sha256', public.text_sha256_hex(v_text));
end $$;
revoke execute on function public.terms_sign_preview(uuid) from public, anon;
grant execute on function public.terms_sign_preview(uuid) to authenticated, service_role;

-- aceite + assinatura (MESMA assinatura da 0084): o texto assinado é o da parte (com a seção de pagamento dela)
create or replace function public.terms_signature_create(p_terms uuid, p_party text, p_deal_talent uuid, p_full_name text, p_tax_id text,
  p_expected_hash text, p_ip text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; dt public.deal_talents%rowtype; v_name text; v_doc text; v_kind text; v_text text; v_hash text;
        v_email text; v_ip text; v_ua text; v_acc uuid; v_sig uuid;
begin
  select * into t from public.deal_terms where id = p_terms;
  if p_party = 'talent' then select * into dt from public.deal_talents where id = p_deal_talent; end if;
  v_name := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 5 or char_length(v_name) > 120 or v_name !~ '^\S+( \S+)+$' then raise exception 'name_required' using errcode = '22023'; end if;
  v_doc := public.br_tax_id_normalize(p_tax_id);
  v_kind := public.br_tax_id_kind(v_doc);
  if v_kind is null then raise exception 'invalid_tax_id' using errcode = '22023'; end if;
  v_text := public.deal_terms_signable_text_for(p_terms, p_party, dt.id);
  v_hash := public.text_sha256_hex(v_text);
  if nullif(btrim(coalesce(p_expected_hash, '')), '') is not null and lower(btrim(p_expected_hash)) <> v_hash then
    raise exception 'terms_changed' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  begin
    v_ip := host(nullif(btrim(coalesce(p_ip, '')), '')::inet);
  exception when others then v_ip := null;
  end;
  v_ua := left(regexp_replace(btrim(coalesce(p_user_agent, '')), '[[:cntrl:]]', '', 'g'), 400);
  insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, deal_talent_id, talent_id, method, accepted_by, note)
  values (t.agency_id, t.brand_id, t.deal_id, p_terms, p_party, dt.id, dt.talent_id, 'e_signature', auth.uid(), '')
  on conflict (terms_id, party, deal_talent_id) do nothing
  returning id into v_acc;
  if v_acc is null then raise exception 'already_signed' using errcode = 'P0001'; end if;
  insert into public.deal_signatures (agency_id, brand_id, deal_id, terms_id, acceptance_id, terms_version, party, deal_talent_id, talent_id,
    signer_user_id, signer_name, signer_tax_id, signer_tax_kind, signer_email, signer_ip, signer_user_agent, signed_text, text_sha256)
  values (t.agency_id, t.brand_id, t.deal_id, p_terms, v_acc, t.version, p_party, dt.id, dt.talent_id,
    auth.uid(), v_name, v_doc, v_kind, left(coalesce(v_email, ''), 320), v_ip, v_ua, v_text, v_hash)
  returning id into v_sig;
  return v_sig;
end $$;
revoke execute on function public.terms_signature_create(uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.terms_signature_create(uuid, text, uuid, text, text, text, text, text) to service_role;

-- comprovante (MESMA assinatura da 0084): gestor/colaborador recebem o texto sem a seção de pagamento
create or replace function public.terms_signature_receipt(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.deal_signatures%rowtype; d public.deals%rowtype; v_side text; v_text text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.deal_signatures where id = p_id;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where id = s.deal_id;
  if s.signer_user_id = auth.uid() then v_side := case when s.party = 'brand' then 'brand' else 'talent' end;
  elsif public.agency_can(s.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids()) then v_side := 'agency';
  elsif s.party = 'brand' and public.brand_member_of(s.brand_id) is not null then v_side := 'brand';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_text := case when v_side = 'agency' and not public.agency_can(s.agency_id, 'admin') then public.terms_text_without_payment(s.signed_text) else s.signed_text end;
  return jsonb_build_object('id', s.id, 'side', v_side, 'party', s.party, 'terms_id', s.terms_id, 'terms_version', s.terms_version,
    'terms_status', (select t.status from public.deal_terms t where t.id = s.terms_id),
    'deal_id', s.deal_id, 'deal', d.title, 'request_id', d.request_id, 'deal_talent_id', s.deal_talent_id,
    'brand', (select b.name from public.brands b where b.id = s.brand_id),
    'agency', (select a.name from public.agencies a where a.id = s.agency_id),
    'talent', (select x.display_name from public.talent_profiles x where x.id = s.talent_id),
    'signer_name', s.signer_name, 'tax_id', s.signer_tax_id, 'tax_kind', s.signer_tax_kind, 'email', s.signer_email,
    'ip', s.signer_ip, 'user_agent', s.signer_user_agent, 'signed_at', s.signed_at, 'sha256', s.text_sha256,
    'text', v_text, 'payment_hidden', v_text <> s.signed_text, 'intact', public.text_sha256_hex(s.signed_text) = s.text_sha256);
end $$;
revoke execute on function public.terms_signature_receipt(uuid) from public, anon;
grant execute on function public.terms_signature_receipt(uuid) to authenticated, service_role;

-- o texto assinado tem valor: sai da leitura direta (o comprovante é pela RPC acima)
do $$
declare cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
  from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'deal_signatures' and c.column_name <> 'signed_text';
  execute 'revoke select on public.deal_signatures from authenticated';
  execute format('grant select (%s) on public.deal_signatures to authenticated', cols);
end $$;

-- 9) geração na contratação (MESMA assinatura da 0072): cópia assinada → plano → fórmula antiga ------------------------
create or replace function public.agency_finance_generate(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; a public.agencies%rowtype; r record; v_rate smallint; v_fees bigint := 0; v_comm bigint; v_total bigint; v_n int := 0;
        v_contract date; v_due date; v_check bigint; v_terms uuid; snap public.deal_terms_payments%rowtype; pl public.deal_payment_plans%rowtype; v_source text;
begin
  select * into d from public.deals where id = p_deal for update;
  if d.id is null then return 0; end if;
  if not (d.stage = 'production' or (d.stage = 'closed' and d.outcome = 'won')) then return 0; end if;
  if exists (select 1 from public.financial_entries f where f.deal_id = p_deal and f.status not in ('cancelled', 'forecast')) then return 0; end if;
  -- previsto (0108) e lançamentos cancelados pelo gatilho de negócio perdido saem para nascer de novo
  delete from public.financial_entries f where f.deal_id = p_deal and (f.status = 'forecast'
    or (f.status = 'cancelled' and f.settled_at is null and f.note in ('deal_lost', 'deal_cancelled')));
  if not exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'contracted') then return 0; end if;
  select * into a from public.agencies where id = d.agency_id;
  -- condições: a cópia dos termos aceitos (assinada); sem ela, o plano atual; sem plano, a fórmula da 0072
  select t.id into v_terms from public.deal_terms t where t.deal_id = p_deal and t.status in ('accepted', 'sent') order by t.version desc limit 1;
  select * into snap from public.deal_terms_payments s where s.terms_id = v_terms;
  if snap.terms_id is null then select * into pl from public.deal_payment_plans where deal_id = p_deal; end if;
  if snap.terms_id is not null or pl.deal_id is not null then
    v_source := case when snap.terms_id is not null then 'terms' else 'plan' end;
    v_n := public.deal_payment_write(p_deal, coalesce(snap.total_cents, pl.total_cents), coalesce(snap.plan, pl.plan), 'planned');
    perform public.audit_log('finance.generate', 'deal', p_deal::text, null,
      jsonb_build_object('agency_id', d.agency_id, 'source', v_source, 'terms_id', v_terms, 'entries', v_n), null, public.talent_audit_actor('agency', d.agency_id));
    return v_n;
  end if;
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
  select coalesce(sum(case when kind = 'brand_receivable' then amount_cents else -amount_cents end), 0) into v_check
  from public.financial_entries where deal_id = p_deal and status <> 'cancelled';
  if v_check <> 0 then raise exception 'finance_identity' using errcode = 'P0001'; end if;
  perform public.audit_log('finance.generate', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', d.agency_id, 'rate_bp', v_rate, 'payouts', v_n), null, public.talent_audit_actor('agency', d.agency_id));
  return v_n + 2;
end $$;
revoke execute on function public.agency_finance_generate(uuid) from public, anon, authenticated;
grant execute on function public.agency_finance_generate(uuid) to service_role;

-- negócio perdido/cancelado (MESMA função de gatilho da 0072): o previsto também é cancelado
create or replace function public.finance_on_deal_close()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage = 'closed' and new.outcome in ('lost', 'cancelled') and old.stage is distinct from 'closed' then
    update public.financial_entries set status = 'cancelled', note = left(coalesce(nullif(note, ''), 'deal_' || new.outcome), 500)
    where deal_id = new.id and status in ('forecast', 'planned', 'due');
  end if;
  return new;
end $$;
revoke execute on function public.finance_on_deal_close() from public, anon, authenticated;

-- situação de um lançamento (MESMA assinatura da 0072): o previsto não se mexe à mão (segue o plano)
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
  if e.status in ('settled', 'cancelled', 'forecast') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
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

-- taxas (MESMA assinatura da 0072): o previsto não conta como "contratado"
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
    'contracted', d.id is not null and public.deal_payment_effective(d.id));
end $$;
revoke execute on function public.agency_rates(uuid, uuid) from public, anon;
grant execute on function public.agency_rates(uuid, uuid) to authenticated, service_role;

create or replace function public.agency_deal_rate_set(p_deal uuid, p_rate_bp int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  if public.deal_payment_effective(p_deal) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_rate_bp is not null and (p_rate_bp < 0 or p_rate_bp > 5000) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.deals set service_rate_bp = p_rate_bp where id = p_deal;
  perform public.audit_log('deal.rate', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'rate_bp', d.service_rate_bp),
    jsonb_build_object('agency_id', v_agency, 'rate_bp', p_rate_bp), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.agency_deal_rate_set(uuid, int) from public, anon;
grant execute on function public.agency_deal_rate_set(uuid, int) to authenticated, service_role;

-- resumo (MESMA assinatura da 0072): + previstos (não entram em aberto nem em vencidos)
create or replace function public.agency_finance_summary(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date;
begin
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date into v_today from public.agencies a where a.id = p_agency;
  return (select jsonb_build_object(
    'receivable_open_cents', coalesce(sum(amount_cents) filter (where kind = 'brand_receivable' and status in ('planned', 'due')), 0),
    'receivable_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'brand_receivable' and status = 'settled'), 0),
    'commission_open_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status in ('planned', 'due')), 0),
    'commission_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status = 'settled'), 0),
    'payout_open_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status in ('planned', 'due')), 0),
    'payout_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status = 'settled'), 0),
    'receivable_forecast_cents', coalesce(sum(amount_cents) filter (where kind = 'brand_receivable' and status = 'forecast'), 0),
    'payout_forecast_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status = 'forecast'), 0),
    'commission_forecast_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status = 'forecast'), 0),
    'overdue_count', count(*) filter (where status in ('planned', 'due') and coalesce(scheduled_on, due_on) < coalesce(v_today, current_date)),
    'open_count', count(*) filter (where status in ('planned', 'due')),
    'forecast_count', count(*) filter (where status = 'forecast'),
    'deals', count(distinct deal_id) filter (where status <> 'cancelled'))
  from public.financial_entries where agency_id = p_agency);
end $$;
revoke execute on function public.agency_finance_summary(uuid) from public, anon;
grant execute on function public.agency_finance_summary(uuid) to authenticated, service_role;

-- ganhos do Hero (MESMA assinatura da 0094): + previsto, forma, regra do repasse e nota exigida
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
                       order by (i.status in ('submitted', 'approved')) desc, i.created_at desc, i.id desc limit 1),
           'payout_method', p.plan ->> 'payout_method', 'payout_rule', p.plan ->> 'payout_rule', 'payout_days', (p.plan ->> 'payout_days')::int,
           'invoice_required', coalesce((p.plan ->> 'invoice_talent')::boolean, false))
         order by f.due_on nulls last, f.created_at), '[]'::jsonb)
  from public.financial_entries f join public.deals d on d.id = f.deal_id join public.brands b on b.id = d.brand_id
  left join public.deal_payment_plans p on p.deal_id = f.deal_id
  where f.kind = 'talent_payout' and f.talent_id = public.my_talent_owner_id()
$$;
revoke execute on function public.talent_payouts() from public, anon;
grant execute on function public.talent_payouts() to authenticated, service_role;

-- "a receber" da marca (MESMA assinatura da 0090): + condições (forma, estrutura, nota da agência, observações)
create or replace function public.brand_receivable_json(p_entry uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('entry_id', f.id, 'deal_id', f.deal_id, 'request_id', d.request_id,
    'title', coalesce(nullif(btrim(r.title), ''), d.title), 'brand_id', f.brand_id, 'brand_name', b.name, 'agency_id', f.agency_id, 'agency_name', a.name,
    'origin', case when r.sponsorship_id is not null then 'sponsorship' when r.brand_call_id is not null then 'call' else 'campaign' end,
    'total_cents', f.amount_cents, 'entry_status', f.status, 'due_on', f.due_on, 'settled_at', f.settled_at,
    'plan', case when p.deal_id is null then null else jsonb_build_object('method', p.plan ->> 'method', 'method_note', p.plan ->> 'method_note',
              'structure', p.plan ->> 'structure', 'invoice_agency', (p.plan ->> 'invoice_agency')::boolean, 'notes', p.plan ->> 'notes') end,
    'installments', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'seq', i.seq, 'label', i.label, 'amount_cents', i.amount_cents, 'due_on', i.due_on,
        'status', case when f.status = 'settled' then 'paid' else i.status end, 'paid_at', coalesce(i.paid_at, f.settled_at), 'from_plan', i.from_plan,
        'report', (select jsonb_build_object('id', x.id, 'status', x.status, 'paid_on', x.paid_on, 'amount_cents', x.amount_cents, 'note', x.note,
                     'review_note', x.review_note, 'document_id', x.document_id, 'reported_label', x.reported_label, 'reviewed_label', x.reviewed_label,
                     'created_at', x.created_at, 'reviewed_at', x.reviewed_at)
                   from public.brand_payment_reports x where x.installment_id = i.id order by x.created_at desc, x.id desc limit 1),
        'history', (select count(*) from public.brand_payment_reports x where x.installment_id = i.id))
      order by i.seq), '[]'::jsonb) from public.brand_payment_installments i where i.entry_id = f.id))
  from public.financial_entries f join public.deals d on d.id = f.deal_id join public.brands b on b.id = f.brand_id join public.agencies a on a.id = f.agency_id
  left join public.campaign_requests r on r.id = d.request_id
  left join public.deal_payment_plans p on p.deal_id = f.deal_id
  where f.id = p_entry
$$;
revoke execute on function public.brand_receivable_json(uuid) from public, anon, authenticated;
grant execute on function public.brand_receivable_json(uuid) to service_role;

-- 10) cron diário: previsto refeito, datas relativas do efetivo e aviso do repasse (D6, D9) -----------------------------
create or replace function public.deal_payment_refresh(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare pl public.deal_payment_plans%rowtype; recv public.financial_entries%rowtype; ev jsonb; v_parts jsonb; v_n int := 0; v_k int; v_last date;
        v_received date; v_pay date; v_tz text;
begin
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  if pl.deal_id is null then return 0; end if;
  if not public.deal_payment_effective(p_deal) then return public.deal_payment_forecast(p_deal); end if;
  select * into recv from public.financial_entries f where f.deal_id = p_deal and f.kind = 'brand_receivable' and f.status in ('planned', 'due') and f.from_plan;
  ev := public.deal_payment_events(p_deal);
  if recv.id is not null and not exists (select 1 from public.brand_payment_installments i where i.entry_id = recv.id and not i.from_plan) then
    v_parts := public.payment_plan_parts(pl.plan, recv.amount_cents, (ev ->> 'signature')::date, (ev ->> 'delivery')::date, (ev ->> 'publication')::date);
    -- só o que ainda está em aberto, sem informe e com o mesmo valor do plano
    with upd as (
      update public.brand_payment_installments i set due_on = (x ->> 'due_on')::date
      from jsonb_array_elements(v_parts) x
      where i.entry_id = recv.id and i.seq = (x ->> 'seq')::int and i.amount_cents = (x ->> 'amount_cents')::bigint and i.status = 'open'
        and i.due_on is distinct from (x ->> 'due_on')::date
        and not exists (select 1 from public.brand_payment_reports r where r.installment_id = i.id and r.status = 'reported')
      returning 1)
    select count(*) into v_k from upd;
    v_n := v_n + v_k;
    update public.financial_entries set due_on = (select min(i.due_on) from public.brand_payment_installments i where i.entry_id = recv.id and i.status = 'open')
    where id = recv.id and exists (select 1 from public.brand_payment_installments i where i.entry_id = recv.id and i.status = 'open');
  end if;
  -- repasses que seguem o plano e não foram agendados à mão
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = pl.agency_id;
  select max(i.due_on), case when bool_and(i.status = 'paid') then max((i.paid_at at time zone v_tz)::date) end into v_last, v_received
  from public.brand_payment_installments i join public.financial_entries f on f.id = i.entry_id
  where f.deal_id = p_deal and f.kind = 'brand_receivable' and f.status <> 'cancelled';
  v_pay := public.payment_plan_payout_due(pl.plan, coalesce(v_received, v_last), (ev ->> 'delivery')::date);
  if v_pay is not null then
    with upd as (
      update public.financial_entries set due_on = v_pay
      where deal_id = p_deal and kind = 'talent_payout' and from_plan and status in ('planned', 'due') and scheduled_on is null and due_on is distinct from v_pay
      returning 1)
    select count(*) into v_k from upd;
    v_n := v_n + v_k;
  end if;
  return v_n;
end $$;
revoke execute on function public.deal_payment_refresh(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_refresh(uuid) to service_role;

create or replace function public.deal_payment_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x record; v_refreshed int := 0; v_deals int := 0; v_band text; v_n int := 0; v_params jsonb; v_dedupe text; v_to uuid;
begin
  -- previstos e datas relativas
  for x in select p.deal_id from public.deal_payment_plans p join public.deals d on d.id = p.deal_id join public.agencies a on a.id = d.agency_id
           where a.status = 'active' and (d.stage <> 'closed' or (d.outcome = 'won' and d.closed_at > now() - interval '120 days')) loop
    v_refreshed := v_refreshed + public.deal_payment_refresh(x.deal_id);
    v_deals := v_deals + 1;
  end loop;
  -- repasse ao Hero: 3 dias antes, no dia (tolerância de 2 dias) e vencido (3 a 10 dias); Hero titular e Adm
  for x in select f.id, f.agency_id, f.talent_id, f.deal_talent_id, d.title, t.display_name,
                  coalesce(f.scheduled_on, f.due_on) as due,
                  coalesce(f.scheduled_on, f.due_on) - (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date as days
           from public.financial_entries f join public.deals d on d.id = f.deal_id join public.agencies a on a.id = f.agency_id
           join public.talent_profiles t on t.id = f.talent_id
           where f.kind = 'talent_payout' and f.status in ('planned', 'due') and coalesce(f.scheduled_on, f.due_on) is not null and a.status = 'active' and f.amount_cents > 0 loop
    v_band := case when x.days between 1 and 3 then 'soon' when x.days between -2 and 0 then 'today' when x.days between -10 and -3 then 'late' end;
    continue when v_band is null;
    v_params := jsonb_build_object('deal', left(coalesce(x.title, ''), 120), 'talent', left(coalesce(x.display_name, ''), 120), 'status', v_band,
      'date', to_char(x.due, 'YYYY-MM-DD'));
    v_dedupe := 'payout_due:' || x.id::text || ':' || x.due::text || ':' || v_band;
    v_to := public.talent_user_id(x.talent_id);
    if v_to is not null and public.inbox_notify(v_to, 'payout_due', '/creator/escritorio/ganhos', v_params, x.agency_id, 'entry', x.id, v_dedupe) is not null then
      v_n := v_n + 1;
    end if;
    v_n := v_n + public.inbox_notify_agency(x.agency_id, 'admin', 'payout_due', '/agencia/financeiro?f=payable', v_params, 'entry', x.id, v_dedupe);
  end loop;
  return jsonb_build_object('deals', v_deals, 'refreshed', v_refreshed, 'payout_alerts', v_n);
end $$;
revoke execute on function public.deal_payment_scan() from public, anon, authenticated;
grant execute on function public.deal_payment_scan() to service_role;

-- 11) cotas de patrocínio: modelo de valor (D11) ------------------------------------------------------------------------
alter table public.sponsorship_tiers add column if not exists value_model text not null default 'por_marca';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sponsorship_tiers_value_model_check') then
    alter table public.sponsorship_tiers add constraint sponsorship_tiers_value_model_check check (value_model in ('fixo', 'por_marca'));
  end if;
end $$;

-- quanto da cota já foi coberto pelos acordos fechados (interna)
create or replace function public.sponsorship_tier_covered(p_tier uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.agreed_cents), 0)::bigint from public.sponsorship_proposals p where p.tier_id = p_tier and p.status = 'agreed'
$$;
revoke execute on function public.sponsorship_tier_covered(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_tier_covered(uuid) to service_role;

-- valor pedido a UMA marca: por marca = o valor da cota; fixo do evento = o que falta ÷ vagas que sobram (arredonda
-- para cima); sem valor ou já coberto = null ("a combinar")
create or replace function public.sponsorship_tier_ask(p_tier uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select case when t.price_cents is null then null
              when t.value_model = 'por_marca' then t.price_cents
              else (select case when s.remaining < 1 then null else (s.remaining + s.left_slots - 1) / s.left_slots end
                    from (select t.price_cents - public.sponsorship_tier_covered(t.id) as remaining,
                                 greatest(1, t.slots - public.sponsorship_tier_agreed(t.id))::bigint as left_slots) s) end
  from public.sponsorship_tiers t where t.id = p_tier
$$;
revoke execute on function public.sponsorship_tier_ask(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_tier_ask(uuid) to service_role;

-- cotas: salvar (MESMA assinatura da 0095) + value_model por cota
create or replace function public.agency_sponsorship_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before public.sponsorship_opportunities%rowtype; v_id uuid := p_id; v_talent uuid; v_start timestamptz; v_end timestamptz; v_respond timestamptz;
        v_all_day boolean; v_title text; v_audience text; v_perks text[]; v_networks text[]; v_brands uuid[]; v_has_responses boolean := false;
        v_admin boolean; v_tiers jsonb; e jsonb; v_pos int := 0; v_tier_id uuid; v_keep uuid[] := '{}'::uuid[]; v_tname text; v_tperks text[];
        v_tslots int; v_tprice bigint; v_old public.sponsorship_tiers%rowtype; v_public jsonb;
        v_hero jsonb; v_publish boolean; v_status text; v_t record; v_tmodel text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  if v_id is not null then
    select * into v_before from public.sponsorship_opportunities o where o.id = v_id and o.agency_id = p_agency for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.status not in ('draft', 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_has_responses := exists (select 1 from public.sponsorship_responses r where r.opportunity_id = v_id);
  end if;
  v_tiers := case when jsonb_typeof(p_data -> 'tiers') = 'array' then p_data -> 'tiers' end;
  if p_data ? 'tiers' and (v_tiers is null or jsonb_array_length(v_tiers) not between 1 and 3) then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_start := coalesce(nullif(btrim(coalesce(p_data ->> 'starts_at', '')), '')::timestamptz, v_before.starts_at);
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_at', '')), '')::timestamptz, v_before.ends_at, v_start);
    v_respond := coalesce(nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz, v_before.respond_by);
    v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
    v_publish := case when p_data ? 'publish' and jsonb_typeof(p_data -> 'publish') <> 'null' then (p_data ->> 'publish')::boolean end;
    if v_tiers is not null then
      -- contrapartidas gerais = união das cotas (na ordem, sem repetir, até 10)
      select coalesce((array_agg(x order by f))[1:10], '{}'::text[]) into v_perks
      from (select distinct on (lower(btrim(x))) btrim(x) as x, (t.n * 100 + e2.m) as f
            from jsonb_array_elements(v_tiers) with ordinality t(v, n)
            cross join lateral jsonb_array_elements_text(coalesce(t.v -> 'perks', '[]'::jsonb)) with ordinality e2(x, m)
            where btrim(x) <> '' order by lower(btrim(x)), (t.n * 100 + e2.m)) s;
    elsif p_data ? 'perks' then
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
  -- público do evento (mesmos campos da campanha); ausente = mantém
  v_public := case when p_data ?| array['target_audience', 'target_age_bands', 'target_states', 'region_note'] then
    coalesce(public.sponsorship_audience_clean(jsonb_strip_nulls(jsonb_build_object('target_audience', p_data -> 'target_audience',
      'target_age_bands', p_data -> 'target_age_bands', 'target_states', p_data -> 'target_states', 'region_note', p_data -> 'region_note'))),
      '{}'::jsonb) end;
  -- Hero (0095): ficha do casting, Hero da plataforma fora do casting (a ficha nasce aqui) ou Hero digitado
  if p_data ? 'hero' and jsonb_typeof(p_data -> 'hero') <> 'null' then
    if jsonb_typeof(p_data -> 'hero') <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_hero := p_data -> 'hero';
    select f.out_talent into v_talent from public.agency_hero_ficha(p_agency, v_hero, 'sponsorship', coalesce(v_id::text, 'new')) f;
  end if;
  -- situação final: criando, ausente = publica (formato antigo) e false = rascunho; rascunho publica com publish=true; aberta segue aberta
  v_status := case when v_before.id is null then (case when coalesce(v_publish, true) then 'open' else 'draft' end)
                   when v_before.status = 'open' then 'open'
                   when v_publish is true then 'open' else 'draft' end;
  if v_talent is null or v_start is null or v_respond is null or v_audience not in ('all', 'selected') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_has_responses and v_talent <> v_before.talent_id then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- CONSENTIMENTO: exigido para a oportunidade ficar visível às marcas (aberta); rascunho não precisa
  if v_status = 'open' then
    select (t.consent_at is not null and t.consent_revoked_at is null) as consent_ok, c.id as cid, c.status as cstatus into v_t
    from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id where t.id = v_talent;
    if not v_t.consent_ok then raise exception 'consent_required' using errcode = 'P0001'; end if;
    if v_t.cid is not null and v_t.cstatus <> 'active' then raise exception 'hero_inactive' using errcode = 'P0001'; end if;
  end if;
  -- prazo para responder: no futuro (ao criar, ao mudar e ao publicar um rascunho)
  if (v_before.id is null or v_respond is distinct from v_before.respond_by or (v_before.status = 'draft' and v_status = 'open')) and v_respond <= now() then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if v_respond > v_end then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_audience = 'selected' then
    if v_brands is null then
      select coalesce(array_agg(g.brand_id), '{}'::uuid[]) into v_brands from public.sponsorship_targets g where g.opportunity_id = v_id;
    end if;
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_brands
    from (select unnest(v_brands) as x union select r.brand_id from public.sponsorship_responses r where r.opportunity_id = v_id
          union select q.brand_id from public.sponsorship_proposals q where q.opportunity_id = v_id) s;
    if cardinality(v_brands) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_brands) b where not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = b and ab.status = 'active')) then
      raise exception 'brand_not_linked' using errcode = 'P0001';
    end if;
  end if;
  begin
    if v_id is null then
      insert into public.sponsorship_opportunities (agency_id, talent_id, title, description, location, starts_at, ends_at, all_day, expected_reach, perks, networks,
                                                    respond_by, audience, status, created_by)
      values (p_agency, v_talent, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_start, v_end, v_all_day, btrim(coalesce(p_data ->> 'expected_reach', '')), v_perks, v_networks, v_respond, v_audience, v_status, auth.uid())
      returning id into v_id;
    else
      update public.sponsorship_opportunities set talent_id = v_talent, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        expected_reach = case when p_data ? 'expected_reach' then btrim(coalesce(p_data ->> 'expected_reach', '')) else expected_reach end,
        perks = v_perks, networks = v_networks, respond_by = v_respond, audience = v_audience, status = v_status
      where id = v_id;
    end if;
    if v_public is not null then
      update public.sponsorship_opportunities set target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', '')
      where id = v_id;
    end if;
    -- cotas
    if v_tiers is not null then
      for e in select value from jsonb_array_elements(v_tiers) loop
        v_pos := v_pos + 1;
        if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
        begin
          v_tier_id := nullif(btrim(coalesce(e ->> 'id', '')), '')::uuid;
          v_tname := regexp_replace(btrim(coalesce(e ->> 'name', '')), '\s+', ' ', 'g');
          select coalesce(array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g') order by n), '{}'::text[]) into v_tperks
          from jsonb_array_elements_text(coalesce(e -> 'perks', '[]'::jsonb)) with ordinality q(x, n) where btrim(x) <> '';
          v_tslots := coalesce(nullif(btrim(coalesce(e ->> 'slots', '')), '')::int, 1);
          v_tprice := nullif(btrim(coalesce(e ->> 'price_cents', '')), '')::bigint;
          v_tmodel := nullif(btrim(coalesce(e ->> 'value_model', '')), '');
        exception when others then raise exception 'invalid_input' using errcode = '22023';
        end;
        -- 0108: modelo de valor da cota (fixo do evento | por marca)
        if v_tmodel is not null and v_tmodel not in ('fixo', 'por_marca') then raise exception 'invalid_input' using errcode = '22023'; end if;
        v_old := null;
        if v_tier_id is not null then
          select * into v_old from public.sponsorship_tiers t where t.id = v_tier_id and t.opportunity_id = v_id for update;
          if v_old.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
          -- vagas não descem abaixo dos acordos já fechados
          if v_tslots < public.sponsorship_tier_agreed(v_old.id) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
          -- com acordo fechado, o modelo da cota não muda (mudaria o que já foi combinado)
          if v_admin and v_tmodel is not null and v_tmodel <> v_old.value_model and public.sponsorship_tier_agreed(v_old.id) > 0 then
            raise exception 'invalid_state' using errcode = 'P0001';
          end if;
          update public.sponsorship_tiers set position = v_pos, name = v_tname, perks = v_tperks, slots = v_tslots,
            price_cents = case when v_admin then v_tprice else price_cents end,
            value_model = case when v_admin then coalesce(v_tmodel, value_model) else value_model end,
            price_updated_by = case when v_admin and v_tprice is distinct from price_cents then auth.uid() else price_updated_by end,
            price_updated_at = case when v_admin and v_tprice is distinct from price_cents then now() else price_updated_at end
          where id = v_old.id;
        else
          insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, price_cents, perks, slots, price_updated_by, price_updated_at, value_model)
          values (v_id, p_agency, v_pos, v_tname, case when v_admin then v_tprice end, v_tperks, v_tslots,
                  case when v_admin and v_tprice is not null then auth.uid() end, case when v_admin and v_tprice is not null then now() end,
                  case when v_admin then coalesce(v_tmodel, 'por_marca') else 'por_marca' end)
          returning id into v_tier_id;
        end if;
        v_keep := v_keep || v_tier_id;
      end loop;
      -- cota com proposta (de qualquer situação) não sai
      if exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep))
                 and exists (select 1 from public.sponsorship_proposals q where q.tier_id = t.id)) then
        raise exception 'invalid_state' using errcode = 'P0001';
      end if;
      delete from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep));
    elsif not exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id) then
      insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, perks, slots) values (v_id, p_agency, 1, 'Cota única', v_perks, 1);
    end if;
  exception when check_violation or not_null_violation or unique_violation then raise exception 'invalid_input' using errcode = '22023';
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
      'brands', case when v_audience = 'selected' then to_jsonb(v_brands) else null end,
      'tiers', (select count(*) from public.sponsorship_tiers t where t.opportunity_id = v_id), 'status', v_status), null,
    public.talent_audit_actor('agency', p_agency));
  if v_status = 'open' and (v_before.id is null or v_before.status = 'draft') then
    perform public.audit_log('sponsorship.publish', 'sponsorship', v_id::text, null, jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent), null,
      public.talent_audit_actor('agency', p_agency));
  end if;
  perform public.sponsorship_notify_audience(v_id);
  return v_id;
end $$;

-- cotas: proposta da marca (MESMA assinatura da 0088) segue o modelo da cota
create or replace function public.brand_sponsorship_propose(p_id uuid, p_brand uuid, p_tier uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text,
  p_audience jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; t public.sponsorship_tiers%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_id uuid; v_round uuid; v_label text; v_audience jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.sponsorship_brand_in_audience(p_id, p_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.sponsorship_tiers where id = p_tier and opportunity_id = p_id;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept_asked', 'propose') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_audience := public.sponsorship_audience_clean(p_audience);
  if o.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if o.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = p_id and q.brand_id = p_brand and q.status = 'agreed') then
    raise exception 'already_agreed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = p_id and q.brand_id = p_brand and q.status in ('draft', 'open')) then
    raise exception 'already_negotiating' using errcode = 'P0001';
  end if;
  if public.sponsorship_tier_agreed(t.id) >= t.slots then raise exception 'tier_full' using errcode = 'P0001'; end if;
  if p_action = 'accept_asked' then
    -- 0108: por marca = o valor pedido; fixo do evento = a parte que falta ÷ vagas que sobram
    v_amount := public.sponsorship_tier_ask(t.id);
    if v_amount is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_perks := t.perks;
    if cardinality(v_perks) = 0 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  else
    v_amount := p_amount_cents;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks);
    -- 0108: no valor fixo do evento a marca diz quanto cobre (até o total da cota)
    if t.value_model = 'fixo' and t.price_cents is not null and v_amount > t.price_cents then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  v_label := public.actor_label(o.agency_id, p_brand);
  insert into public.sponsorship_proposals (opportunity_id, tier_id, agency_id, brand_id, status, asked_cents, amount_cents, perks, created_by)
  values (p_id, t.id, o.agency_id, p_brand, 'draft', public.sponsorship_tier_ask(t.id), v_amount, v_perks, auth.uid())
  returning id into v_id;
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, audience, note, state, actor_id, actor_label)
  values (v_id, p_id, o.agency_id, p_brand, 1, 'brand', p_action, v_amount, v_perks, v_audience, v_note, case when v_role = 'owner' then 'sent' else 'pending_owner' end,
          auth.uid(), v_label)
  returning id into v_round;
  perform public.audit_log('sponsorship.propose', 'sponsorship', p_id::text, null,
    jsonb_build_object('agency_id', o.agency_id, 'brand_id', p_brand, 'proposal_id', v_id, 'tier_id', t.id, 'action', p_action, 'pending_owner', v_role <> 'owner'),
    nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' then
    perform public.sponsorship_round_apply(v_round);
  else
    perform public.sponsorship_negotiation_notify(v_id, 'brand_owners', 'approval', 'sponsor-approval:' || v_round::text);
  end if;
  return v_id;
end $$;

-- cotas: detalhe da agência (MESMA assinatura da 0095) + modelo, pedido por marca e coberto
create or replace function public.agency_sponsorship_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not public.agency_can(o.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(o.agency_id, 'admin');
  return jsonb_build_object(
    'can_values', v_admin,
    'opportunity', jsonb_build_object('id', o.id, 'agency_id', o.agency_id, 'talent_id', o.talent_id,
      'talent_name', (select t.display_name from public.talent_profiles t where t.id = o.talent_id),
      'hero', public.sponsorship_hero_json(o.talent_id, false),
      'title', o.title, 'description', o.description, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day,
      'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks), 'networks', to_jsonb(o.networks), 'respond_by', o.respond_by,
      'audience', o.audience, 'status', o.status, 'closed_reason', o.closed_reason, 'decision_note', o.decision_note, 'decided_at', o.decided_at,
      'decided_label', (select m.display_name from public.agency_members m where m.agency_id = o.agency_id and m.user_id = o.decided_by),
      'created_at', o.created_at, 'public', public.sponsorship_public_json(o.id),
      'target_ids', (select coalesce(jsonb_agg(g.brand_id), '[]'::jsonb) from public.sponsorship_targets g where g.opportunity_id = o.id)),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'position', z.position, 'name', z.name, 'perks', to_jsonb(z.perks), 'slots', z.slots,
        'price_cents', case when v_admin then z.price_cents end, 'has_price', z.price_cents is not null,
        'value_model', z.value_model, 'ask_cents', case when v_admin then public.sponsorship_tier_ask(z.id) end,
        'covered_cents', case when v_admin then public.sponsorship_tier_covered(z.id) end,
        'agreed', public.sponsorship_tier_agreed(z.id),
        'has_proposals', exists (select 1 from public.sponsorship_proposals q where q.tier_id = z.id)) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'brand_id', q.brand_id, 'brand_name', b.name, 'tier_id', q.tier_id,
        'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting, 'perks', to_jsonb(q.perks), 'rounds', q.rounds,
        'asked_cents', case when v_admin then q.asked_cents end, 'amount_cents', case when v_admin then q.amount_cents end,
        'agreed_cents', case when v_admin then q.agreed_cents end, 'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id,
        'history', public.sponsorship_rounds_json(q.id, v_admin, true))
      order by (q.status = 'open' and q.awaiting = 'agency') desc, (q.status = 'open') desc, q.sent_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.sent_at is not null),
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

-- cotas: oportunidades da marca (MESMA assinatura da 0095) + modelo e pedido por marca
create or replace function public.brand_sponsorships(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'description', o.description, 'location', o.location,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'networks', to_jsonb(o.networks), 'respond_by', o.respond_by, 'public', public.sponsorship_public_json(o.id),
      'status', case when o.status = 'cancelled' then 'cancelled'
                     when r.outcome = 'won' then 'won'
                     when o.status in ('sponsored', 'closed') then 'closed'
                     when o.respond_by < now() then 'expired' else 'open' end,
      'agency_name', (select a.name from public.agencies a where a.id = o.agency_id),
      'timezone', (select a.timezone from public.agencies a where a.id = o.agency_id),
      'talent', (select jsonb_build_object('id', t.id, 'name', t.display_name, 'in_catalog', public.talent_brand_card_ok(t.id, o.agency_id),
                   'photo_url', case when public.talent_brand_card_ok(t.id, o.agency_id) then public.talent_public_card(t.id) ->> 'photo_url' end)
                 from public.talent_profiles t where t.id = o.talent_id),
      'hero', public.sponsorship_hero_json(o.talent_id, true),
      'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
                  'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots,
                  'value_model', z.value_model, 'ask_cents', public.sponsorship_tier_ask(z.id)) order by z.position), '[]'::jsonb)
                from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'negotiation', (select jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting, 'tier_name', z.name,
                        'pending_owner', exists (select 1 from public.sponsorship_rounds x where x.proposal_id = q.id and x.state = 'pending_owner'))
                      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
                      where q.opportunity_id = o.id and q.brand_id = p_brand order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc limit 1),
      'my_response', case when r.id is null then null else jsonb_build_object('response', r.response, 'message', r.message, 'responded_label', r.responded_label,
        'responded_at', r.responded_at, 'request_id', r.request_id, 'outcome', r.outcome) end)
    order by (o.status = 'open' and o.respond_by >= now()) desc, o.starts_at), '[]'::jsonb)
    from public.sponsorship_opportunities o
    left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = p_brand
    where public.sponsorship_brand_in_audience(o.id, p_brand) or r.id is not null);
end $$;

-- cotas: negociação da marca (MESMA assinatura da 0088) + modelo e pedido por marca
create or replace function public.brand_sponsorship_negotiation(p_id uuid, p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not (public.sponsorship_brand_in_audience(p_id, p_brand)
                          or exists (select 1 from public.sponsorship_responses r where r.opportunity_id = p_id and r.brand_id = p_brand)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'role', v_role,
    'can_propose', o.status = 'open' and o.respond_by >= now()
      and not exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = o.id and q.brand_id = p_brand and q.status in ('draft', 'open', 'agreed')),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
        'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots,
        'value_model', z.value_model, 'ask_cents', public.sponsorship_tier_ask(z.id)) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'tier_id', q.tier_id, 'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting,
        'asked_cents', q.asked_cents, 'amount_cents', q.amount_cents, 'perks', to_jsonb(q.perks), 'agreed_cents', q.agreed_cents,
        'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side, 'agreed_at', q.agreed_at, 'ended_at', q.ended_at,
        'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id, 'created_at', q.created_at,
        'history', public.sponsorship_rounds_json(q.id, true, false))
      order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.brand_id = p_brand));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.agency_sponsorship_save(uuid, uuid, jsonb)', 'public.agency_sponsorship_detail(uuid)', 'public.brand_sponsorships(uuid)',
                           'public.brand_sponsorship_propose(uuid, uuid, uuid, text, bigint, text[], text, jsonb)',
                           'public.brand_sponsorship_negotiation(uuid, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
