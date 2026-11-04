-- =============================================================================
-- Groscove Ultra · 0106 · Gestão: aceitar ou contrapropor a proposta da marca no negócio
-- Pedido do responsável: "Tem que ter um botão fácil de aceitar a proposta ou fazer contraproposta na tela da
-- agência." Cenário S112. Idempotente; nenhuma função nova para o visitante (S14 segue 18); nenhuma RPC existente muda.
-- Tudo é registro SIMULADO: nada cobra nem move dinheiro.
--
-- Decisões:
--   • Mesmo desenho das rodadas da chamada da marca (0089/0096, brand_call_rounds), agora no negócio: tabela
--     deal_offer_rounds (lado, ação, valor, modelo fixo/por herói + máximo, período, nota, quem e quando). Só as RPCs
--     gravam (security definer); ninguém escreve direto.
--   • Termos da marca = a última contraproposta da marca ou, sem nenhuma, a proposta original (campaign_request_budgets:
--     "Valor oferecido" = budget_max_cents, modelo e máximo; período do campaign_request). Só campanhas de origem
--     'brand' (é a proposta da marca que se responde) e negócio visível para a marca.
--   • Vez: sem rodadas → agência; última = contraproposta da agência → marca; contraproposta ou recusa da marca →
--     agência; qualquer aceite → acordado (fim: depois disso, mudar verba é o pedido de alteração da 0090).
--   • Agência: só o Adm (lê valores) aceita ou contrapropõe, com o negócio aberto e antes da confirmação (etapa < 8).
--     Recusar não existe para a agência: ela já pode encerrar o negócio como perdido.
--     Contraproposta → etapa 'proposal_sent' (se estava antes); aceite → 'negotiation' (se estava antes). A etapa
--     'proposal_sent' já bloqueia consultar heróis (0079): é o "proposta na mão da marca"; a resposta da marca leva a
--     'negotiation' e libera de novo (ou o gestor move a etapa à mão, como já podia).
--   • Marca: só o DONO responde (aceitar e contrapropor comprometem dinheiro; recusar também fica com ele, como na
--     0090). Só quando a última rodada é uma contraproposta da agência. Aceitar → acordo e etapa 'negotiation';
--     contrapropor → etapa 'negotiation'; recusar (motivo opcional) → o negócio segue aberto e a agência decide.
--   • Acordo: grava os termos acordados no "Valor oferecido" (fixo: mínimo = máximo = valor; por herói: máximo = valor
--     por herói, mínimo vazio, máximo de heróis) e o período (se a rodada trouxe) no pedido e no negócio. O gatilho da
--     0096 (campaign_request_budgets_value_trg) lê uma atualização do valor por herói como "total ÷ máximo"; para não
--     dividir o valor acordado, a gravação é em dois passos (o valor entra com o modelo fixo e o modelo por herói vem
--     depois, sem tocar no valor). Elenco acima do máximo acordado recusa com max_heroes. A verba interna da marca
--     (brand_budgets, 0082) não muda.
--   • Período vazio numa rodada = mantém o da campanha.
--   • Avisos (só sino, sem valor): reaproveita os tipos reservados desde a 0064 — proposal_received (marca: a agência
--     contrapropôs ou aceitou) e proposal_decided (Adms da agência: a marca aceitou, contrapropôs ou recusou), com
--     status no parâmetro. Linha do tempo do negócio: atividade 'system' offer_accepted|offer_countered|offer_declined
--     (sem valor: gestor e colaborador leem a linha do tempo). Também vai para audit_log.
--   • Privacidade/RLS: rodadas — Adm da agência e membros ativos da marca (a marca lê tudo do próprio negócio).
--     Gestor e colaborador do negócio leem só a situação pela RPC deal_offer_rounds_json (sem valor nem nota).
-- =============================================================================

-- 1) tabela -----------------------------------------------------------------------------------------------------------
create table if not exists public.deal_offer_rounds (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null constraint deal_offer_rounds_deal_fk references public.deals (id) on delete cascade,
  request_id uuid constraint deal_offer_rounds_request_fk references public.campaign_requests (id) on delete set null,
  agency_id uuid not null constraint deal_offer_rounds_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_offer_rounds_brand_fk references public.brands (id) on delete cascade,
  seq int not null,
  side text not null,
  action text not null,
  amount_cents bigint,
  value_model text,
  max_heroes smallint,
  period_start date,
  period_end date,
  note text not null default '',
  actor_id uuid constraint deal_offer_rounds_actor_fk references auth.users (id) on delete set null,
  actor_label text not null default '',
  created_at timestamptz not null default now(),
  constraint deal_offer_rounds_seq_uq unique (deal_id, seq),
  constraint deal_offer_rounds_side_check check (side in ('agency', 'brand')),
  constraint deal_offer_rounds_action_check check (action in ('accept', 'counter', 'decline') and (action <> 'decline' or side = 'brand')),
  constraint deal_offer_rounds_amount_check check ((action = 'decline') = (amount_cents is null) and (amount_cents is null or amount_cents between 1 and 10000000000)),
  constraint deal_offer_rounds_value_check check (
    (action = 'decline' and value_model is null and max_heroes is null)
    or (action <> 'decline' and ((value_model = 'fixo' and max_heroes is null) or (value_model = 'por_heroi' and max_heroes between 1 and 50)))),
  constraint deal_offer_rounds_period_check check ((period_end is null or period_start is not null) and (period_end is null or period_end >= period_start)
    and (action <> 'decline' or (period_start is null and period_end is null))),
  constraint deal_offer_rounds_texts_check check (char_length(note) <= 500 and char_length(actor_label) <= 80)
);
create index if not exists deal_offer_rounds_deal_idx on public.deal_offer_rounds (deal_id, seq);

revoke all on table public.deal_offer_rounds from public, anon, authenticated;
grant select on table public.deal_offer_rounds to authenticated;
grant all on table public.deal_offer_rounds to service_role;
alter table public.deal_offer_rounds enable row level security;

-- 2) quem lê ----------------------------------------------------------------------------------------------------------
drop policy if exists deal_offer_rounds_select_admin on public.deal_offer_rounds;
create policy deal_offer_rounds_select_admin on public.deal_offer_rounds for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists deal_offer_rounds_select_agency on public.deal_offer_rounds;
create policy deal_offer_rounds_select_agency on public.deal_offer_rounds for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists deal_offer_rounds_select_brand on public.deal_offer_rounds;
create policy deal_offer_rounds_select_brand on public.deal_offer_rounds for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- 3) auxiliares internas ----------------------------------------------------------------------------------------------
-- situação: vez de quem ('agency' | 'brand' | null) e se já há acordo
create or replace function public.deal_offer_state(p_deal uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when l.id is null then jsonb_build_object('turn', 'agency', 'agreed', false, 'last_action', null, 'last_side', null)
    when l.action = 'accept' then jsonb_build_object('turn', null, 'agreed', true, 'last_action', l.action, 'last_side', l.side)
    when l.side = 'agency' then jsonb_build_object('turn', 'brand', 'agreed', false, 'last_action', l.action, 'last_side', l.side)
    else jsonb_build_object('turn', 'agency', 'agreed', false, 'last_action', l.action, 'last_side', l.side) end
  from (select 1) one
  left join lateral (select r.id, r.side, r.action from public.deal_offer_rounds r where r.deal_id = p_deal order by r.seq desc limit 1) l on true
$$;
revoke execute on function public.deal_offer_state(uuid) from public, anon, authenticated;
grant execute on function public.deal_offer_state(uuid) to service_role;

-- termos atuais da marca: última contraproposta dela ou a proposta original (valor oferecido + período do pedido)
create or replace function public.deal_offer_brand_terms(p_deal uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('source', 'counter', 'amount_cents', r.amount_cents, 'value_model', r.value_model, 'max_heroes', r.max_heroes,
                               'period_start', r.period_start, 'period_end', r.period_end)
     from public.deal_offer_rounds r where r.deal_id = p_deal and r.side = 'brand' and r.action = 'counter' order by r.seq desc limit 1),
    (select jsonb_build_object('source', 'request', 'amount_cents', nullif(b.budget_max_cents, 0), 'value_model', coalesce(b.value_model, 'fixo'),
                               'max_heroes', case when b.value_model = 'por_heroi' then b.max_heroes end,
                               'period_start', q.period_start, 'period_end', case when q.period_start is not null then q.period_end end)
     from public.deals d join public.campaign_requests q on q.id = d.request_id
     left join public.campaign_request_budgets b on b.request_id = q.id where d.id = p_deal))
$$;
revoke execute on function public.deal_offer_brand_terms(uuid) from public, anon, authenticated;
grant execute on function public.deal_offer_brand_terms(uuid) to service_role;

-- termos de uma rodada (lança invalid_input | value_per_hero_required | max_heroes_required)
create or replace function public.deal_offer_terms_check(p_amount bigint, p_model text, p_max int, p_start date, p_end date)
returns void language plpgsql immutable set search_path = '' as $$
begin
  perform public.value_terms_check(p_model, p_amount, p_max);
  if p_amount is null or p_amount < 1 or (p_model = 'fixo' and p_max is not null)
     or (p_end is not null and (p_start is null or p_end < p_start)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.deal_offer_terms_check(bigint, text, int, date, date) from public, anon, authenticated;
grant execute on function public.deal_offer_terms_check(bigint, text, int, date, date) to service_role;

-- negócio que aceita rodada: aberto, antes da confirmação, campanha da marca e visível para ela (lança invalid_*)
create or replace function public.deal_offer_open_check(p_deal uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_origin text;
begin
  select * into d from public.deals where id = p_deal;
  if d.stage = 'closed' or d.outcome is not null or public.deal_stage_index(d.stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  select q.origin into v_origin from public.campaign_requests q where q.id = d.request_id;
  if v_origin is distinct from 'brand' or not d.brand_visible then raise exception 'invalid_state' using errcode = 'P0001'; end if;
end $$;
revoke execute on function public.deal_offer_open_check(uuid) from public, anon, authenticated;
grant execute on function public.deal_offer_open_check(uuid) to service_role;

-- grava a rodada, a etapa, a linha do tempo e o aviso; no aceite, aplica os termos acordados
create or replace function public.deal_offer_record(p_deal uuid, p_side text, p_action text, p_amount bigint, p_model text, p_max int,
  p_start date, p_end date, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_seq int; v_label text; v_stage text; v_brand text; v_params jsonb; v_status text; v_round uuid;
begin
  select * into d from public.deals where id = p_deal for update;
  v_label := case when p_side = 'agency' then public.actor_label(d.agency_id, null) else public.actor_label(null, d.brand_id) end;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.deal_offer_rounds r where r.deal_id = d.id;
  insert into public.deal_offer_rounds (deal_id, request_id, agency_id, brand_id, seq, side, action, amount_cents, value_model, max_heroes,
                                        period_start, period_end, note, actor_id, actor_label)
  values (d.id, d.request_id, d.agency_id, d.brand_id, v_seq, p_side, p_action, p_amount, p_model, p_max,
          case when p_action <> 'decline' then p_start end, case when p_action <> 'decline' then p_end end, p_note, auth.uid(), v_label)
  returning id into v_round;

  if p_action = 'accept' then
    -- valor oferecido = acordado; em dois passos para o gatilho da 0096 não dividir o valor por herói
    if exists (select 1 from public.campaign_request_budgets b where b.request_id = d.request_id) then
      update public.campaign_request_budgets set value_model = 'fixo', max_heroes = null, budget_min_cents = null, budget_max_cents = p_amount, updated_by = auth.uid()
      where request_id = d.request_id;
    else
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, value_model, max_heroes, updated_by)
      values (d.agency_id, d.brand_id, d.request_id, null, p_amount, 'fixo', null, auth.uid());
    end if;
    if p_model = 'por_heroi' then
      update public.campaign_request_budgets set value_model = 'por_heroi', max_heroes = p_max where request_id = d.request_id;
    else
      update public.campaign_request_budgets set budget_min_cents = p_amount where request_id = d.request_id;
    end if;
    if p_start is not null then
      update public.campaign_requests set period_start = p_start, period_end = coalesce(p_end, p_start) where id = d.request_id;
      update public.deals set expected_start = p_start, expected_end = coalesce(p_end, p_start) where id = d.id;
    end if;
    perform public.deal_max_heroes_check(d.id);
    v_stage := 'negotiation';
  elsif p_action = 'counter' then
    v_stage := case when p_side = 'agency' then 'proposal_sent' else 'negotiation' end;
  end if;
  if v_stage is not null and public.deal_stage_index(d.stage) < public.deal_stage_index(v_stage) then
    update public.deals set stage = v_stage, stage_changed_at = now() where id = d.id;
  end if;

  v_status := case p_action when 'accept' then 'accepted' when 'counter' then 'countered' else 'declined' end;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (d.agency_id, 'deal', d.id, 'system', 'offer_' || v_status || '|' || p_side, auth.uid(), v_label);
  perform public.audit_log('deal.offer_' || p_action, 'deal', d.id::text, jsonb_build_object('agency_id', d.agency_id, 'stage', d.stage),
    jsonb_build_object('agency_id', d.agency_id, 'brand_id', d.brand_id, 'side', p_side, 'action', p_action, 'round_id', v_round, 'seq', v_seq),
    nullif(p_note, ''), case when p_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', d.agency_id) end);

  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  v_params := jsonb_build_object('deal', left(d.title, 120), 'brand', left(coalesce(v_brand, ''), 120), 'status', v_status);
  if p_side = 'agency' then
    perform public.inbox_notify_brand(d.brand_id, false, 'proposal_received', '/marca/campanhas/' || d.request_id::text || '#deal-offer',
      v_params, d.agency_id, 'deal', d.id, 'offer:' || v_round::text);
  else
    perform public.inbox_notify_agency(d.agency_id, 'admin', 'proposal_decided', '/agencia/negocios/' || d.id::text || '#deal-offer',
      v_params, 'deal', d.id, 'offer:' || v_round::text);
  end if;
  return case when p_action = 'accept' then 'agreed' else v_status end;
end $$;
revoke execute on function public.deal_offer_record(uuid, text, text, bigint, text, int, date, date, text) from public, anon, authenticated;
grant execute on function public.deal_offer_record(uuid, text, text, bigint, text, int, date, date, text) to service_role;

-- 4) agência (só Adm): aceitar os termos atuais da marca ou contrapropor -------------------------------------------------
create or replace function public.agency_deal_offer_reply(p_deal uuid, p_action text, p_amount_cents bigint default null, p_value_model text default null,
  p_max_heroes int default null, p_period_start date default null, p_period_end date default null, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_note text := btrim(coalesce(p_note, '')); v_state jsonb; v_terms jsonb; v_amount bigint; v_model text; v_max int;
        v_start date; v_end date;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform public.deal_offer_open_check(p_deal);
  v_state := public.deal_offer_state(p_deal);
  if (v_state ->> 'turn') is distinct from 'agency' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_action = 'accept' then
    v_terms := public.deal_offer_brand_terms(p_deal);
    v_amount := (v_terms ->> 'amount_cents')::bigint; v_model := coalesce(v_terms ->> 'value_model', 'fixo'); v_max := (v_terms ->> 'max_heroes')::int;
    v_start := (v_terms ->> 'period_start')::date; v_end := (v_terms ->> 'period_end')::date;
    -- sem valor da marca não há o que aceitar: contraproposta
    if v_amount is null or v_amount < 1 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  else
    v_amount := p_amount_cents; v_model := coalesce(p_value_model, 'fixo'); v_max := case when v_model = 'por_heroi' then p_max_heroes end;
    v_start := p_period_start; v_end := case when p_period_start is not null then coalesce(p_period_end, p_period_start) end;
    perform public.deal_offer_terms_check(v_amount, v_model, v_max, v_start, v_end);
  end if;
  return public.deal_offer_record(p_deal, 'agency', p_action, v_amount, v_model, v_max, v_start, v_end, v_note);
end $$;
revoke execute on function public.agency_deal_offer_reply(uuid, text, bigint, text, int, date, date, text) from public, anon;
grant execute on function public.agency_deal_offer_reply(uuid, text, bigint, text, int, date, date, text) to authenticated, service_role;

-- 5) marca (só o dono): responde à contraproposta da agência ---------------------------------------------------------
create or replace function public.brand_deal_offer_reply(p_deal uuid, p_action text, p_amount_cents bigint default null, p_value_model text default null,
  p_max_heroes int default null, p_period_start date default null, p_period_end date default null, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_state jsonb; r public.deal_offer_rounds%rowtype;
        v_amount bigint; v_model text; v_max int; v_start date; v_end date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  v_role := case when d.id is null or not d.brand_visible then null else public.brand_member_of(d.brand_id) end;
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'counter', 'decline') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform public.deal_offer_open_check(p_deal);
  v_state := public.deal_offer_state(p_deal);
  if (v_state ->> 'turn') is distinct from 'brand' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select * into r from public.deal_offer_rounds x where x.deal_id = p_deal order by x.seq desc limit 1;
  if p_action = 'accept' then
    v_amount := r.amount_cents; v_model := r.value_model; v_max := r.max_heroes; v_start := r.period_start; v_end := r.period_end;
  elsif p_action = 'counter' then
    v_amount := p_amount_cents; v_model := coalesce(p_value_model, 'fixo'); v_max := case when v_model = 'por_heroi' then p_max_heroes end;
    v_start := p_period_start; v_end := case when p_period_start is not null then coalesce(p_period_end, p_period_start) end;
    perform public.deal_offer_terms_check(v_amount, v_model, v_max, v_start, v_end);
  end if;
  return public.deal_offer_record(p_deal, 'brand', p_action, v_amount, v_model, v_max, v_start, v_end, v_note);
end $$;
revoke execute on function public.brand_deal_offer_reply(uuid, text, bigint, text, int, date, date, text) from public, anon;
grant execute on function public.brand_deal_offer_reply(uuid, text, bigint, text, int, date, date, text) to authenticated, service_role;

-- 6) leitura para os dois portais ---------------------------------------------------------------------------------------
-- agência: Adm com valores; gestor+ e equipe do negócio só a situação (sem valor nem nota). Marca: tudo do próprio negócio.
create or replace function public.deal_offer_rounds_json(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_viewer text; v_values boolean := false; v_can boolean := false; v_role text; v_state jsonb; v_open boolean;
        v_origin text; v_terms jsonb; v_agreed jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_can(d.agency_id, 'staff') and (public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids())) then
    v_viewer := 'agency'; v_values := public.agency_can(d.agency_id, 'admin');
  elsif d.brand_visible then
    v_role := public.brand_member_of(d.brand_id);
    if v_role is not null then v_viewer := 'brand'; v_values := true; end if;
  end if;
  if v_viewer is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select q.origin into v_origin from public.campaign_requests q where q.id = d.request_id;
  v_state := public.deal_offer_state(d.id);
  v_open := d.stage <> 'closed' and d.outcome is null and public.deal_stage_index(d.stage) < 8 and coalesce(v_origin = 'brand', false) and d.brand_visible;
  v_can := coalesce(v_open and v_values and (v_state ->> 'turn') = v_viewer and (v_viewer = 'agency' or v_role = 'owner'), false);
  v_terms := public.deal_offer_brand_terms(d.id);
  select jsonb_build_object('amount_cents', r.amount_cents, 'value_model', r.value_model, 'max_heroes', r.max_heroes, 'period_start', r.period_start,
                            'period_end', r.period_end, 'side', r.side, 'created_at', r.created_at)
    into v_agreed from public.deal_offer_rounds r where r.deal_id = d.id and r.action = 'accept' order by r.seq desc limit 1;
  if not v_values then
    v_terms := v_terms - 'amount_cents';
    v_agreed := v_agreed - 'amount_cents';
  end if;
  return jsonb_build_object('enabled', coalesce(v_origin = 'brand', false), 'viewer', v_viewer, 'values', v_values, 'open', v_open, 'can_reply', v_can,
    'role', v_role, 'turn', case when v_open then v_state -> 'turn' else 'null'::jsonb end, 'agreed', (v_state ->> 'agreed')::boolean,
    'last_action', v_state -> 'last_action', 'last_side', v_state -> 'last_side', 'brand_terms', v_terms, 'agreed_terms', v_agreed,
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
                 'amount_cents', case when v_values then r.amount_cents end, 'value_model', r.value_model, 'max_heroes', r.max_heroes,
                 'period_start', r.period_start, 'period_end', r.period_end, 'note', case when v_values then r.note else '' end,
                 'actor_label', r.actor_label, 'created_at', r.created_at) order by r.seq), '[]'::jsonb)
               from public.deal_offer_rounds r where r.deal_id = d.id));
end $$;
revoke execute on function public.deal_offer_rounds_json(uuid) from public, anon;
grant execute on function public.deal_offer_rounds_json(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
