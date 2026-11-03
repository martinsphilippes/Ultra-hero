-- =============================================================================
-- Groscove Ultra · 0096 · Modelo de valor (fixo x por herói) e montador de elenco
-- Pedido do responsável (03/11). Cenário S103. Idempotente; nenhuma função nova para o visitante (S14 segue 18). As RPCs
-- recriadas mantêm a MESMA assinatura, exceto brand_call_reply / agency_brand_call_reply (ganham 2 parâmetros opcionais
-- no fim; a assinatura antiga é removida, sem sobrecarga). Tudo é registro SIMULADO: nada cobra nem move dinheiro.
--
-- A) Modelo de valor onde a marca ou a agência informa o valor oferecido
--   • value_model = 'fixo' (padrão): o valor é o TOTAL do evento/campanha e se divide entre os heróis indicados.
--     value_model = 'por_heroi': o valor é POR HERÓI e max_heroes (1 a 50) é obrigatório; o teto de investimento é
--     valor × máximo (value_ceiling_cents). Por herói exige valor > 0 (value_per_hero_required) e máximo
--     (max_heroes_required); fixo nunca guarda máximo.
--   • Onde: campaign_request_budgets (campanha da marca; "Valor oferecido" = budget_max_cents), brand_calls (chamada:
--     budget_cents + budget_display, que por herói nunca é 'open'), brand_call_proposals (valor da agência), rodadas
--     (brand_call_rounds: contraproposta pode mudar modelo, valor e máximo) e o acordo (agreed_value_model/max: congela
--     junto com agreed_cents). A campanha criada do acordo HERDA modelo/máximo (brand_call_agree).
--     DECISÃO: as cotas de patrocínio (0088) ficam como estão (valor total por cota; o campo nasce 'fixo').
--     DECISÃO: o pedido de alteração de verba (0090) continua mudando só o VALOR; modelo e máximo só se definem no
--     rascunho (brand_request_save recusa depois de enviado, como o valor) ou na negociação da chamada.
--   • O banco recusa passar do máximo: gatilho adiado em deal_talents (conta heróis ativos = fora removed/declined; é
--     adiado para a troca de elenco numa transação só, e agency_deal_suggest_heroes também confere ao fim) e gatilho
--     imediato nos heróis da proposta (brand_call_proposal_talents). Acordar com mais heróis que o máximo: max_heroes.
--   • Privacidade: a marca lê modelo/máximo/valor da própria campanha e das propostas (como já lia). A agência lê modelo
--     e máximo (gestor+), mas valores só o Adm. O herói nunca lê (talent_brand_calls remove value_model/max_heroes).
--
-- B) Montador de elenco (agência, gestor+): RPC de leitura agency_cast_inputs devolve só o necessário para calcular as
--   combinações no app (lógica pura em src/lib/casting): números declarados das redes com a data, público, segmentos,
--   disponibilidade nas datas, notas, consentimento e o CACHÊ por herói (o do negócio, senão o último da agência —
--   fee_source). Cachês em R$ só para o Adm. DECISÃO: o gestor recebe cost_bp = cachê ÷ orçamento de cachês em pontos-base
--   (sem moeda), suficiente para o cálculo e para mostrar "usa 82% do orçamento", sem revelar nenhum valor em reais.
--   O orçamento de cachês é o valor total ÷ (1 + taxa da agência), porque V = F + C (0072): a comissão vai por cima.
--   agency_deal_cast_apply (gestor+) usa o elenco: sugere os heróis (agency_deal_suggest_heroes) e, só o Adm, grava a
--   repartição como cachês (agency_fee_set); a soma nunca passa do orçamento de cachês (fee_over_budget).
--   deal_value_terms: modelo/máximo/heróis ativos para a tela do negócio (valores só o Adm).
-- =============================================================================

-- 1) colunas e regras ------------------------------------------------------------------------------------------------
alter table public.campaign_request_budgets add column if not exists value_model text not null default 'fixo';
alter table public.campaign_request_budgets add column if not exists max_heroes smallint;
alter table public.brand_calls add column if not exists value_model text not null default 'fixo';
alter table public.brand_calls add column if not exists max_heroes smallint;
alter table public.brand_call_proposals add column if not exists value_model text not null default 'fixo';
alter table public.brand_call_proposals add column if not exists max_heroes smallint;
alter table public.brand_call_proposals add column if not exists agreed_value_model text;
alter table public.brand_call_proposals add column if not exists agreed_max_heroes smallint;
alter table public.brand_call_rounds add column if not exists value_model text;
alter table public.brand_call_rounds add column if not exists max_heroes smallint;

-- o que já estava acordado/enviado era valor total
update public.brand_call_proposals set agreed_value_model = 'fixo' where agreed_cents is not null and agreed_value_model is null;
update public.brand_call_rounds set value_model = 'fixo' where action <> 'decline' and value_model is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_request_budgets_value_check') then
    alter table public.campaign_request_budgets add constraint campaign_request_budgets_value_check check (
      (value_model = 'fixo' and max_heroes is null)
      or (value_model = 'por_heroi' and max_heroes between 1 and 50 and budget_max_cents > 0 and budget_min_cents is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_calls_value_check') then
    alter table public.brand_calls add constraint brand_calls_value_check check (
      (value_model = 'fixo' and max_heroes is null)
      or (value_model = 'por_heroi' and max_heroes between 1 and 50 and budget_cents is not null and budget_display <> 'open'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_call_proposals_value_check') then
    alter table public.brand_call_proposals add constraint brand_call_proposals_value_check check (
      ((value_model = 'fixo' and max_heroes is null) or (value_model = 'por_heroi' and max_heroes between 1 and 50))
      and ((agreed_value_model is null and agreed_max_heroes is null) or (agreed_value_model = 'fixo' and agreed_max_heroes is null)
           or (agreed_value_model = 'por_heroi' and agreed_max_heroes between 1 and 50)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_call_rounds_value_check') then
    alter table public.brand_call_rounds add constraint brand_call_rounds_value_check check (
      (action = 'decline' and value_model is null and max_heroes is null)
      or (action <> 'decline' and ((value_model = 'fixo' and max_heroes is null) or (value_model = 'por_heroi' and max_heroes between 1 and 50))));
  end if;
end $$;

-- valor e máximo coerentes com o modelo (lança invalid_input | value_per_hero_required | max_heroes_required)
create or replace function public.value_terms_check(p_model text, p_amount bigint, p_max int)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_model is null or p_model not in ('fixo', 'por_heroi') or (p_amount is not null and (p_amount < 0 or p_amount > 10000000000)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_model = 'por_heroi' then
    if p_amount is null or p_amount < 1 then raise exception 'value_per_hero_required' using errcode = '22023'; end if;
    if p_max is null or p_max < 1 or p_max > 50 then raise exception 'max_heroes_required' using errcode = '22023'; end if;
    if p_amount * p_max > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
end $$;
revoke execute on function public.value_terms_check(text, bigint, int) from public, anon, authenticated;
grant execute on function public.value_terms_check(text, bigint, int) to service_role;

-- teto de investimento: por herói = valor × máximo; fixo = o próprio valor
create or replace function public.value_ceiling_cents(p_model text, p_amount bigint, p_max int)
returns bigint language sql immutable set search_path = '' as $$
  select case when p_amount is null then null when p_model = 'por_heroi' and p_max is not null then p_amount * p_max else p_amount end
$$;
revoke execute on function public.value_ceiling_cents(text, bigint, int) from public, anon, authenticated;
grant execute on function public.value_ceiling_cents(text, bigint, int) to service_role;

-- 2) máximo de heróis no banco ---------------------------------------------------------------------------------------
create or replace function public.deal_max_heroes_check(p_deal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_max int;
begin
  select b.max_heroes into v_max from public.deals d join public.campaign_request_budgets b on b.request_id = d.request_id
  where d.id = p_deal and b.value_model = 'por_heroi';
  if v_max is not null and (select count(*) from public.deal_talents t where t.deal_id = p_deal and t.status not in ('removed', 'declined')) > v_max then
    raise exception 'max_heroes' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.deal_max_heroes_check(uuid) from public, anon, authenticated;
grant execute on function public.deal_max_heroes_check(uuid) to service_role;

create or replace function public.deal_talents_max_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('removed', 'declined') then perform public.deal_max_heroes_check(new.deal_id); end if;
  return null;
end $$;
revoke execute on function public.deal_talents_max_trg() from public, anon, authenticated;
drop trigger if exists trg_deal_talents_max on public.deal_talents;
create constraint trigger trg_deal_talents_max after insert or update of status on public.deal_talents
  deferrable initially deferred for each row execute function public.deal_talents_max_trg();

create or replace function public.brand_call_proposal_talents_max_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max int;
begin
  select p.max_heroes into v_max from public.brand_call_proposals p where p.id = new.proposal_id and p.value_model = 'por_heroi';
  if v_max is not null and (select count(*) from public.brand_call_proposal_talents t where t.proposal_id = new.proposal_id) >= v_max then
    raise exception 'max_heroes' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.brand_call_proposal_talents_max_trg() from public, anon, authenticated;
drop trigger if exists trg_brand_call_proposal_talents_max on public.brand_call_proposal_talents;
create trigger trg_brand_call_proposal_talents_max before insert on public.brand_call_proposal_talents
  for each row execute function public.brand_call_proposal_talents_max_trg();

-- 3) campanha da marca: valor oferecido com modelo (brand_request_save da 0089, MESMA assinatura) ---------------------------
create or replace function public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb; v_brief jsonb; v_locked boolean := false;
  v_call_agency uuid; v_model text; v_maxh int; v_has_budget boolean;
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
    v_maxh := nullif(btrim(coalesce(p_data ->> 'max_heroes', '')), '')::int;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_segments from jsonb_array_elements_text(coalesce(p_data -> 'segment_ids', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_ages from jsonb_array_elements_text(coalesce(p_data -> 'target_age_bands', '[]'::jsonb)) x;
    select coalesce(array_agg(upper(x)), '{}'::text[]) into v_states from jsonb_array_elements_text(coalesce(p_data -> 'target_states', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  -- 0096: modelo de valor (fixo | por_heroi). Sem a chave, vale o já gravado. Por herói: valor > 0 e máximo de heróis (1 a 50).
  v_has_budget := p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note' or p_data ? 'value_model' or p_data ? 'max_heroes';
  v_model := coalesce(nullif(btrim(coalesce(p_data ->> 'value_model', '')), ''),
                      (select b.value_model from public.campaign_request_budgets b where b.request_id = p_id), 'fixo');
  if not (p_data ? 'max_heroes') then v_maxh := (select b.max_heroes from public.campaign_request_budgets b where b.request_id = p_id); end if;
  if v_has_budget and not v_locked then
    if v_model = 'por_heroi' then
      v_min := null;
    else
      v_maxh := null;
    end if;
    perform public.value_terms_check(v_model, v_max, v_maxh);
  end if;
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
    if not v_locked and v_has_budget then
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, value_model, max_heroes, updated_by)
      values (v_agency, p_brand, v_id, v_min, v_max, btrim(coalesce(p_data ->> 'budget_note', '')), v_model, v_maxh, auth.uid())
      on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
        note = excluded.note, value_model = excluded.value_model, max_heroes = excluded.max_heroes, updated_by = excluded.updated_by;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end $$;
revoke execute on function public.brand_request_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.brand_request_save(uuid, uuid, jsonb) to authenticated, service_role;

-- 4) chamada da marca (brand_call_save da 0089, MESMA assinatura) ---------------------------------------------------------
create or replace function public.brand_call_save(p_brand uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role text; c public.brand_calls%rowtype; v_id uuid := p_id; v_start date; v_end date; v_respond timestamptz; v_budget bigint; v_creators int;
        v_networks text[]; v_niches text[]; v_agencies uuid[]; v_public jsonb; v_deliv jsonb; v_audience text; v_display text; v_model text; v_maxh int;
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
    v_maxh := nullif(btrim(coalesce(p_data ->> 'max_heroes', '')), '')::int;
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
  -- 0096: modelo de valor. Por herói: o valor é por herói (nunca 'aberto') e o máximo é obrigatório.
  v_model := coalesce(nullif(btrim(coalesce(p_data ->> 'value_model', '')), ''), 'fixo');
  if v_model = 'por_heroi' then
    perform public.value_terms_check(v_model, v_budget, v_maxh);
    if v_display = 'open' then v_display := 'exact'; end if;
  elsif v_model = 'fixo' then
    v_maxh := null;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_start is null or v_audience not in ('my_agencies', 'selected', 'all') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_audience = 'selected' and exists (select 1 from unnest(v_agencies) g where not exists (select 1 from public.agencies a where a.id = g and a.status = 'active')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if v_id is null then
      insert into public.brand_calls (brand_id, title, objective, description, starts_on, ends_on, location, target_audience, target_age_bands, target_states,
                                      region_note, deliverables, creators_wanted, niches, networks, budget_cents, budget_display, respond_by, audience, value_model, max_heroes, created_by)
      values (p_brand, regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g'), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'description', '')), v_start, v_end, btrim(coalesce(p_data ->> 'location', '')),
              coalesce(v_public ->> 'target_audience', ''),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
              coalesce(v_public ->> 'region_note', ''), v_deliv, v_creators, v_niches, v_networks, v_budget, v_display, v_respond, v_audience, v_model, v_maxh, auth.uid())
      returning id into v_id;
    else
      update public.brand_calls set title = regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g'), objective = nullif(p_data ->> 'objective', ''),
        description = btrim(coalesce(p_data ->> 'description', '')), starts_on = v_start, ends_on = v_end, location = btrim(coalesce(p_data ->> 'location', '')),
        target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', ''), deliverables = v_deliv, creators_wanted = v_creators, niches = v_niches, networks = v_networks,
        budget_cents = v_budget, budget_display = v_display, respond_by = v_respond, audience = v_audience,
        value_model = v_model, max_heroes = v_maxh
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

-- 5) proposta da agência (agency_brand_call_proposal_save da 0089, MESMA assinatura) --------------------------------------
create or replace function public.agency_brand_call_proposal_save(p_call uuid, p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.brand_calls%rowtype; p public.brand_call_proposals%rowtype; v_admin boolean; e jsonb; v_pos int := 0; v_talent uuid; v_kit text;
        v_all jsonb := '[]'::jsonb; v_amount bigint; v_by date; v_note text; v_ids uuid[] := '{}'::uuid[];
        v_model text; v_maxh int;
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
    v_maxh := nullif(btrim(coalesce(p_data ->> 'max_heroes', '')), '')::int;
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
  -- 0096: modelo de valor da proposta (só o Adm muda; o gestor mantém o que já estava). Por herói precisa do máximo e cabe no máximo.
  if v_admin then
    v_model := coalesce(nullif(btrim(coalesce(p_data ->> 'value_model', '')), ''), 'fixo');
    if v_model not in ('fixo', 'por_heroi') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_model = 'por_heroi' then
      if v_maxh is null or v_maxh < 1 or v_maxh > 50 then raise exception 'max_heroes_required' using errcode = '22023'; end if;
      if v_amount is not null and v_amount < 1 then raise exception 'value_per_hero_required' using errcode = '22023'; end if;
      if cardinality(v_ids) > v_maxh then raise exception 'max_heroes' using errcode = 'P0001'; end if;
    else
      v_maxh := null;
    end if;
  else
    v_model := coalesce(p.value_model, 'fixo'); v_maxh := p.max_heroes;
    if v_model = 'por_heroi' and cardinality(v_ids) > v_maxh then raise exception 'max_heroes' using errcode = 'P0001'; end if;
  end if;
  begin
    if p.id is null then
      insert into public.brand_call_proposals (call_id, brand_id, agency_id, status, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, created_by, updated_by)
      values (p_call, c.brand_id, p_agency, 'draft', case when v_admin then v_amount end, v_model, v_maxh, public.brand_call_sum_deliverables(v_all), v_by, v_note, auth.uid(), auth.uid())
      returning * into p;
    else
      update public.brand_call_proposals set amount_cents = case when v_admin then v_amount else amount_cents end,
        value_model = v_model, max_heroes = v_maxh,
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

-- 6) enviar a proposta (MESMA assinatura): confere o modelo e leva modelo/máximo na 1ª rodada ----------------------------
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
  perform public.value_terms_check(p.value_model, p.amount_cents, p.max_heroes);
  if p.value_model = 'por_heroi' and (select count(*) from public.brand_call_proposal_talents t where t.proposal_id = p.id) > p.max_heroes then
    raise exception 'max_heroes' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.brand_call_proposal_talents t where t.proposal_id = p.id) or jsonb_array_length(p.deliverables) = 0 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- creators que perderam a liberação depois do rascunho: não vão
  if exists (select 1 from public.brand_call_proposal_talents t where t.proposal_id = p.id and not public.talent_brand_card_ok(t.talent_id, p.agency_id)) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, state, actor_id, actor_label)
  values (p.id, p.call_id, p.brand_id, p.agency_id, 1, 'agency', 'propose', p.amount_cents, p.value_model, p.max_heroes, p.deliverables, p.deliver_by, left(p.note, 500), 'sent', auth.uid(),
          public.actor_label(p.agency_id, null))
  returning id into v_round;
  update public.brand_call_proposals set sent_by = auth.uid() where id = p.id;
  perform public.audit_log('brand_call.proposal_send', 'brand_call', p.call_id::text, null, jsonb_build_object('agency_id', p.agency_id, 'proposal_id', p.id), null,
    public.talent_audit_actor('agency', p.agency_id));
  return public.brand_call_round_apply(v_round);
end $$;

-- 7) rodada aplicada: a proposta passa a ter o modelo e o máximo da rodada ---------------------------------------------------
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
  update public.brand_call_proposals set amount_cents = r.amount_cents, value_model = r.value_model, max_heroes = r.max_heroes, deliverables = r.deliverables, deliver_by = r.deliver_by,
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

-- 8) acordo: congela modelo/valor/máximo e a campanha herda (MESMA assinatura) ---------------------------------------------
create or replace function public.brand_call_agree(p_proposal uuid, p_side text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_request uuid; v_talent uuid; v_names text; v_agency text; v_notes text;
        r record; v_brand text;
begin
  select * into p from public.brand_call_proposals where id = p_proposal for update;
  select * into c from public.brand_calls where id = p.call_id;
  update public.brand_call_proposals set status = 'agreed', awaiting = null, agreed_cents = amount_cents, agreed_value_model = value_model, agreed_max_heroes = max_heroes, agreed_deliverables = deliverables,
    agreed_deliver_by = deliver_by, agreed_side = p_side, agreed_at = now(), sent_at = coalesce(sent_at, now())
  where id = p.id returning * into p;
  -- 0096: não se acorda com mais heróis que o máximo da proposta
  if p.value_model = 'por_heroi' and (select count(*) from public.brand_call_proposal_talents t where t.proposal_id = p.id) > p.max_heroes then
    raise exception 'max_heroes' using errcode = 'P0001';
  end if;
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
  -- a campanha herda modelo, valor e máximo do acordo
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, value_model, max_heroes, updated_by)
  values (p.agency_id, p.brand_id, v_request, case when p.agreed_value_model = 'por_heroi' then null else p.agreed_cents end, p.agreed_cents,
          'Chamada da marca — valor acordado', p.agreed_value_model, p.agreed_max_heroes, auth.uid())
  on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
    note = excluded.note, value_model = excluded.value_model, max_heroes = excluded.max_heroes, updated_by = excluded.updated_by;
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

drop function if exists public.brand_call_reply(uuid, text, bigint, jsonb, date, text);
-- 9) resposta da brand na negociação: + modelo e máximo opcionais (assinatura antiga removida, sem sobrecarga)
create or replace function public.brand_call_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_deliverables jsonb, p_deliver_by date, p_note text,
  p_value_model text default null, p_max_heroes int default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_deliv jsonb; v_by date; v_round uuid; v_seq int; v_model text; v_maxh int;
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
    -- 0096: a contraproposta pode mudar o modelo e o máximo (sem informar, ficam como estão)
    v_model := coalesce(nullif(btrim(coalesce(p_value_model, '')), ''), p.value_model);
    v_maxh := case when v_model = 'por_heroi' then coalesce(p_max_heroes, p.max_heroes) end;
    perform public.value_terms_check(v_model, v_amount, v_maxh);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_deliv := p.deliverables; v_by := p.deliver_by;
    v_model := p.value_model; v_maxh := p.max_heroes;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = p.id;
  -- recusar não compromete dinheiro: a equipe recusa direto; aceitar e contrapropor da equipe esperam o dono
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, state, actor_id, actor_label)
  values (p.id, p.call_id, p.brand_id, p.agency_id, v_seq, 'brand', p_action, v_amount, v_model, v_maxh, v_deliv, v_by, v_note,
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
revoke execute on function public.brand_call_reply(uuid, text, bigint, jsonb, date, text, text, int) from public, anon;
grant execute on function public.brand_call_reply(uuid, text, bigint, jsonb, date, text, text, int) to authenticated, service_role;

drop function if exists public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text);
-- 9) resposta da agency na negociação: + modelo e máximo opcionais (assinatura antiga removida, sem sobrecarga)
create or replace function public.agency_brand_call_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_deliverables jsonb, p_deliver_by date, p_note text,
  p_value_model text default null, p_max_heroes int default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.brand_call_proposals%rowtype; c public.brand_calls%rowtype; v_note text := btrim(coalesce(p_note, '')); v_amount bigint; v_deliv jsonb; v_by date;
        v_round uuid; v_seq int; v_model text; v_maxh int;
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
    -- 0096: a contraproposta pode mudar o modelo e o máximo (sem informar, ficam como estão)
    v_model := coalesce(nullif(btrim(coalesce(p_value_model, '')), ''), p.value_model);
    v_maxh := case when v_model = 'por_heroi' then coalesce(p_max_heroes, p.max_heroes) end;
    perform public.value_terms_check(v_model, v_amount, v_maxh);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_deliv := p.deliverables; v_by := p.deliver_by;
    v_model := p.value_model; v_maxh := p.max_heroes;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.brand_call_rounds r where r.proposal_id = p.id;
  insert into public.brand_call_rounds (proposal_id, call_id, brand_id, agency_id, seq, side, action, amount_cents, value_model, max_heroes, deliverables, deliver_by, note, state, actor_id, actor_label)
  values (p.id, p.call_id, p.brand_id, p.agency_id, v_seq, 'agency', p_action, v_amount, v_model, v_maxh, v_deliv, v_by, v_note, 'sent', auth.uid(), public.actor_label(p.agency_id, null))
  returning id into v_round;
  perform public.audit_log('brand_call.agency_reply', 'brand_call', p.call_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), public.talent_audit_actor('agency', p.agency_id));
  return public.brand_call_round_apply(v_round);
end $$;
revoke execute on function public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text, text, int) from public, anon;
grant execute on function public.agency_brand_call_reply(uuid, text, bigint, jsonb, date, text, text, int) to authenticated, service_role;

-- 10) leitores: modelo e máximo junto do resto (a verba em reais continua só onde já estava) -------------------------------
create or replace function public.brand_call_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'brand_id', c.brand_id, 'brand_name', b.name, 'brand_logo_url', b.logo_url, 'title', c.title, 'objective', c.objective,
    'description', c.description, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'location', c.location,
    'public', jsonb_build_object('target_audience', c.target_audience, 'target_age_bands', to_jsonb(c.target_age_bands),
                                 'target_states', to_jsonb(c.target_states), 'region_note', c.region_note),
    'deliverables', c.deliverables, 'creators_wanted', c.creators_wanted, 'niches', to_jsonb(c.niches), 'networks', to_jsonb(c.networks),
    'budget_display', c.budget_display, 'value_model', c.value_model, 'max_heroes', c.max_heroes, 'respond_by', c.respond_by, 'status', c.status, 'closed_reason', c.closed_reason,
    'published_at', c.published_at, 'decided_at', c.decided_at, 'decision_note', c.decision_note, 'created_at', c.created_at)
  from public.brand_calls c join public.brands b on b.id = c.brand_id where c.id = p_id
$$;

create or replace function public.brand_call_rounds_json(p_proposal uuid, p_values boolean, p_sent_only boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
      'amount_cents', case when p_values then r.amount_cents end, 'value_model', r.value_model, 'max_heroes', r.max_heroes, 'deliverables', r.deliverables, 'deliver_by', r.deliver_by, 'note', r.note, 'state', r.state,
      'actor_label', r.actor_label, 'created_at', r.created_at, 'reviewed_label', r.reviewed_label, 'reviewed_at', r.reviewed_at,
      'review_note', r.review_note) order by r.seq), '[]'::jsonb)
  from public.brand_call_rounds r where r.proposal_id = p_proposal and (not p_sent_only or r.state = 'sent')
$$;

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
        'amount_cents', q.amount_cents, 'value_model', q.value_model, 'max_heroes', q.max_heroes,
        'agreed_value_model', q.agreed_value_model, 'agreed_max_heroes', q.agreed_max_heroes, 'deliverables', q.deliverables, 'deliver_by', q.deliver_by, 'note', q.note, 'rounds', q.rounds, 'sent_at', q.sent_at,
        'agreed_cents', q.agreed_cents, 'agreed_deliverables', q.agreed_deliverables, 'agreed_deliver_by', q.agreed_deliver_by, 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'request_id', q.request_id,
        'pending_owner', exists (select 1 from public.brand_call_rounds r where r.proposal_id = q.id and r.state = 'pending_owner'),
        'talents', public.brand_call_proposal_talents_json(q.id, true),
        'history', public.brand_call_rounds_json(q.id, true, false))
      order by (q.status = 'agreed') desc, (q.status = 'open') desc, q.sent_at), '[]'::jsonb)
      from public.brand_call_proposals q join public.agencies a on a.id = q.agency_id where q.call_id = c.id and q.sent_at is not null));
end $$;

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
        'amount_cents', case when v_admin then q.amount_cents end, 'has_amount', q.amount_cents is not null, 'value_model', q.value_model, 'max_heroes', q.max_heroes,
        'agreed_value_model', q.agreed_value_model, 'agreed_max_heroes', q.agreed_max_heroes, 'deliverables', q.deliverables,
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

create or replace function public.talent_brand_calls()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  select t.agency_id into v_agency from public.talent_profiles t where t.id = v_talent and t.archived_at is null;
  if v_agency is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg((public.brand_call_json(c.id) - 'brand_id' - 'decision_note' - 'value_model' - 'max_heroes') || jsonb_build_object(
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

revoke execute on function public.brand_call_json(uuid) from public, anon, authenticated;
grant execute on function public.brand_call_json(uuid) to service_role;
revoke execute on function public.brand_call_rounds_json(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.brand_call_rounds_json(uuid, boolean, boolean) to service_role;
do $$
declare f text;
begin
  foreach f in array array['public.brand_call_detail(uuid)', 'public.agency_brand_call_detail(uuid, uuid)', 'public.talent_brand_calls()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 11) sugerir heróis (0093, MESMA assinatura): confere o máximo ao fim ------------------------------------------------------
create or replace function public.agency_deal_suggest_heroes(p_deal uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_stage text; e jsonb; v_kind text; v_talent uuid; v_creator uuid; v_ids uuid[] := '{}'::uuid[];
  v_created int := 0; v_revived int := 0; v_name text; v_profile text; v_email text; v_hero record; v_owner uuid;
  v_reasons jsonb; v_status text; v_demo boolean; v_new uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- gestor+ (colaborador: forbidden), negócio da agência do chamador, aberto (a função trava a linha do negócio)
  v_agency := public.deal_write_scope(p_deal, false);
  select d.stage into v_stage from public.deals d where d.id = p_deal;
  if public.deal_stage_index(v_stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  v_demo := public.agency_is_demo(v_agency);

  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_kind := coalesce(e ->> 'kind', 'talent');
    v_reasons := coalesce(e -> 'reasons', '[]'::jsonb);
    if jsonb_typeof(v_reasons) <> 'array' or jsonb_array_length(v_reasons) > 10
       or exists (select 1 from jsonb_array_elements(v_reasons) r where jsonb_typeof(r) <> 'object'
                  or (r ->> 'code') not in ('segment','region','audience_age','network','availability','brand_choice')) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_talent := null;

    if v_kind = 'talent' then
      begin v_talent := (e ->> 'talent_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = v_agency and t.archived_at is null) then
        raise exception 'not_found' using errcode = 'P0002';
      end if;

    elsif v_kind = 'hero' then
      begin v_creator := (e ->> 'creator_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      -- só herói ativo (suspenso e pendente não existem para a agência)
      select c.id, c.name, c.user_id into v_hero from public.creator_profiles c where c.id = v_creator and c.status = 'active';
      if v_hero.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
      perform pg_advisory_xact_lock(hashtext('hero_casting:' || v_creator::text));
      v_owner := v_hero.user_id;
      if v_owner is not null then perform pg_advisory_xact_lock(hashtext('talent_person:' || v_owner::text)); end if;
      select t.id into v_talent from public.talent_profiles t where t.creator_id = v_creator and t.agency_id = v_agency and t.archived_at is null;
      if v_talent is null then
        -- D6: nenhum herói real em agência inventada
        if v_demo then raise exception 'demo_locked' using errcode = 'P0001'; end if;
        if exists (select 1 from public.talent_profiles t where t.creator_id = v_creator) then raise exception 'creator_already_in_casting' using errcode = 'P0001'; end if;
        -- D10: a pessoa dona do herói já tem ficha (login próprio sem página ou outro herói dela num casting)
        if v_owner is not null and exists (
             select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
             where t.user_id = v_owner or c2.user_id = v_owner) then
          raise exception 'user_has_talent' using errcode = 'P0001';
        end if;
        if v_created >= 10 then raise exception 'too_many_new_talents' using errcode = 'P0001'; end if;
        begin
          insert into public.talent_profiles (agency_id, creator_id, display_name, commercial_status, created_by)
          values (v_agency, v_creator, left(btrim(v_hero.name), 80), 'prospect', auth.uid())
          returning id into v_talent;
        exception when unique_violation then raise exception 'creator_already_in_casting' using errcode = 'P0001';
                  when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
        end;
        v_created := v_created + 1;
        perform public.audit_log('talent.create', 'talent', v_talent::text, null,
          jsonb_build_object('agency_id', v_agency, 'creator_id', v_creator, 'source', 'deal_hero', 'deal_id', p_deal), null,
          public.talent_audit_actor('agency', v_agency));
      end if;

    elsif v_kind = 'typed' then
      -- nome limpo: sem controle nem < >, espaços únicos, 2 a 80
      v_name := btrim(regexp_replace(regexp_replace(coalesce(e ->> 'name', ''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g'));
      if char_length(v_name) not between 2 and 80 then raise exception 'invalid_hero_name' using errcode = '22023'; end if;
      v_profile := nullif(btrim(coalesce(e ->> 'profile', '')), '');
      if v_profile is not null and not (v_profile ~ '^@[A-Za-z0-9._]{1,40}$' or (v_profile ~ '^https?://[^\s<>"'']{4,190}$' and char_length(v_profile) <= 200)) then
        raise exception 'invalid_profile_ref' using errcode = '22023';
      end if;
      v_email := nullif(lower(btrim(coalesce(e ->> 'email', ''))), '');
      if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
      perform pg_advisory_xact_lock(hashtext('typed_talent:' || v_agency::text || ':' || lower(v_name)));
      select t.id into v_talent from public.talent_profiles t
      where t.agency_id = v_agency and t.archived_at is null and t.creator_id is null and lower(btrim(t.display_name)) = lower(v_name)
      order by t.created_at limit 1;
      if v_talent is null then
        if v_demo and (select count(*) from public.talent_profiles t where t.agency_id = v_agency) >= 20 then raise exception 'demo_limit' using errcode = 'P0001'; end if;
        if v_created >= 10 then raise exception 'too_many_new_talents' using errcode = 'P0001'; end if;
        begin
          insert into public.talent_profiles (agency_id, display_name, commercial_status, contact_email, internal_notes, is_demo, created_by)
          values (v_agency, v_name, 'prospect', v_email, coalesce('Perfil informado: ' || v_profile, ''), v_demo, auth.uid())
          returning id into v_talent;
        exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
        end;
        v_created := v_created + 1;
        perform public.audit_log('talent.create', 'talent', v_talent::text, null,
          jsonb_build_object('agency_id', v_agency, 'source', 'deal_typed', 'deal_id', p_deal), null,
          public.talent_audit_actor('agency', v_agency));
      end if;

    else
      raise exception 'invalid_input' using errcode = '22023';
    end if;

    -- mesmo creator duas vezes na lista: idempotente
    if v_talent = any (v_ids) then continue; end if;
    v_ids := v_ids || v_talent;
    select dt.status into v_status from public.deal_talents dt where dt.deal_id = p_deal and dt.talent_id = v_talent;
    if v_status is null then
      insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
      values (v_agency, p_deal, v_talent, 'suggested', auth.uid(), v_reasons);
    elsif v_status = 'removed' then
      -- voltou a ser sugerido: a consulta e a resposta antigas não valem mais
      update public.deal_talents set status = 'suggested', reasons = v_reasons, suggested_by = auth.uid(), terms_ready = false,
             consulted_by = null, consulted_at = null, respond_by = null, responded_at = null, response_note = '', response_channel = null
      where deal_id = p_deal and talent_id = v_talent;
      v_revived := v_revived + 1;
    elsif e ? 'reasons' then
      update public.deal_talents set reasons = v_reasons where deal_id = p_deal and talent_id = v_talent;
    end if;
  end loop;

  delete from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'suggested' and not (dt.talent_id = any (v_ids));
  if v_stage in ('briefing_received', 'qualification') and cardinality(v_ids) > 0 then
    update public.deals set stage = 'shortlist', stage_changed_at = now() where id = p_deal;
  end if;
  perform public.audit_log('deal.shortlist', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', v_agency, 'talents', to_jsonb(v_ids), 'created_talents', v_created), null,
    public.talent_audit_actor('agency', v_agency));
  -- 0096: o máximo de heróis (modelo por herói) vale ao fim, depois que as sugestões velhas saíram
  perform public.deal_max_heroes_check(p_deal);
  return jsonb_build_object('ids', to_jsonb(v_ids), 'created', v_created, 'revived', v_revived);
end $$;
revoke execute on function public.agency_deal_suggest_heroes(uuid, jsonb) from public, anon;
grant execute on function public.agency_deal_suggest_heroes(uuid, jsonb) to authenticated, service_role;

-- 12) modelo e máximo para a tela do negócio (gestor+; valores só o Adm) --------------------------------------------------
create or replace function public.deal_value_terms(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; b public.campaign_request_budgets%rowtype; v_admin boolean; v_model text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null or not public.agency_can(d.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(d.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(d.agency_id, 'admin');
  if d.request_id is not null then select * into b from public.campaign_request_budgets where request_id = d.request_id; end if;
  v_model := coalesce(b.value_model, 'fixo');
  return jsonb_build_object('value_model', v_model, 'max_heroes', b.max_heroes,
    'active_heroes', (select count(*) from public.deal_talents t where t.deal_id = p_deal and t.status not in ('removed', 'declined')),
    'has_value', b.budget_max_cents is not null,
    'value_cents', case when v_admin then b.budget_max_cents end,
    'ceiling_cents', case when v_admin then public.value_ceiling_cents(v_model, b.budget_max_cents, b.max_heroes) end);
end $$;
revoke execute on function public.deal_value_terms(uuid) from public, anon;
grant execute on function public.deal_value_terms(uuid) to authenticated, service_role;

-- 13) montador de elenco: dados para calcular as combinações (gestor+; cachê em R$ só o Adm) --------------------------------
-- p_deal OU p_call (um só). Os cálculos ficam no app (src/lib/casting); aqui só a leitura do que existe, sem inventar dado.
create or replace function public.agency_cast_inputs(p_agency uuid, p_deal uuid default null, p_call uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean; d public.deals%rowtype; rq public.campaign_requests%rowtype; b public.campaign_request_budgets%rowtype; c public.brand_calls%rowtype;
  v_model text := 'fixo'; v_max int; v_total bigint; v_rate int; v_fee_budget bigint; v_start date; v_end date; v_networks text[] := '{}';
  v_ages text[] := '{}'; v_states text[] := '{}'; v_segments uuid[] := '{}'; v_title text; v_current uuid[] := '{}'; v_kind text; v_heroes jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if (p_deal is null) = (p_call is null) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  select a.service_rate_bp into v_rate from public.agencies a where a.id = p_agency;
  if p_deal is not null then
    v_kind := 'deal';
    select * into d from public.deals x where x.id = p_deal and x.agency_id = p_agency;
    if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_title := d.title; v_start := d.expected_start; v_end := d.expected_end; v_rate := coalesce(d.service_rate_bp, v_rate);
    v_segments := d.segment_ids;
    if d.request_id is not null then
      select * into rq from public.campaign_requests where id = d.request_id;
      select * into b from public.campaign_request_budgets where request_id = d.request_id;
      v_start := coalesce(rq.period_start, v_start); v_end := coalesce(rq.period_end, rq.period_start, v_end);
      v_networks := rq.networks; v_ages := rq.target_age_bands; v_states := rq.target_states;
      if cardinality(rq.segment_ids) > 0 then v_segments := rq.segment_ids; end if;
      v_model := coalesce(b.value_model, 'fixo'); v_max := b.max_heroes; v_total := b.budget_max_cents;
    end if;
    select coalesce(array_agg(t.talent_id), '{}'::uuid[]) into v_current from public.deal_talents t
    where t.deal_id = p_deal and t.status not in ('removed', 'declined');
  else
    v_kind := 'call';
    if not public.brand_call_agency_ok(p_call, p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into c from public.brand_calls where id = p_call;
    v_title := c.title; v_start := c.starts_on; v_end := c.ends_on; v_networks := c.networks; v_ages := c.target_age_bands; v_states := c.target_states;
    v_model := c.value_model; v_max := c.max_heroes; v_total := public.brand_call_budget_for_agency(c.id, true);
    select coalesce(array_agg(t.talent_id), '{}'::uuid[]) into v_current from public.brand_call_proposal_talents t
    where t.call_id = p_call and t.agency_id = p_agency
      and exists (select 1 from public.brand_call_proposals q where q.id = t.proposal_id and q.status in ('draft', 'open'));
  end if;
  -- V = F + C: o orçamento de cachês é o valor total sem a comissão da agência (só faz sentido no modelo fixo)
  if v_model = 'fixo' and v_total is not null then v_fee_budget := (v_total * 10000) / (10000 + v_rate); end if;

  select coalesce(jsonb_agg(q.h order by lower(q.h ->> 'name')), '[]'::jsonb) into v_heroes from (
    select jsonb_build_object(
      'talent_id', t.id, 'name', t.display_name, 'city', t.city, 'state', t.state, 'availability', t.availability,
      'blocked', (v_start is not null and exists (select 1 from public.talent_availability a where a.talent_id = t.id and a.kind = 'blocked'
                                                  and a.starts_on <= coalesce(v_end, v_start) and a.ends_on >= v_start)),
      'consent_ok', public.talent_brand_card_ok(t.id, p_agency),
      'in_cast', t.id = any (v_current),
      'segments', (select coalesce(jsonb_agg(l.segment_id), '[]'::jsonb) from public.talent_segment_links l where l.talent_id = t.id),
      'accounts', (select coalesce(jsonb_agg(jsonb_build_object('network', s.network, 'followers', s.followers, 'avg_views', s.avg_views,
            'avg_reach', s.avg_reach, 'engagement_bp', s.engagement_bp, 'as_of', s.as_of, 'source', s.source,
            'age', s.audience -> 'age', 'top_states', s.audience -> 'top_states') order by s.network, s.handle), '[]'::jsonb)
         from public.talent_social_accounts s where s.talent_id = t.id),
      'rating', (select jsonb_build_object('count', count(*), 'quality_avg', round(avg(r.quality)::numeric, 2),
            'on_time_pct', round(100.0 * avg(r.on_time::int)))
         from public.talent_ratings r where r.talent_id = t.id and r.agency_id = p_agency),
      'fee_source', f.src,
      'fee_cents', case when v_admin then f.fee end,
      'cost_bp', case when not v_admin and f.fee is not null and coalesce(v_fee_budget, 0) > 0 then round(f.fee * 10000.0 / v_fee_budget)::int end
    ) as h
    from public.talent_profiles t
    left join lateral (
      select coalesce(df.fee_cents, pf.fee_cents) as fee, case when df.fee_cents is not null then 'deal' when pf.fee_cents is not null then 'past' end as src
      from (select 1) x
      left join lateral (select fee_cents from public.deal_talent_fees where deal_id = p_deal and talent_id = t.id limit 1) df on true
      left join lateral (select fee_cents from public.deal_talent_fees where agency_id = p_agency and talent_id = t.id order by set_at desc limit 1) pf on true
    ) f on true
    where t.agency_id = p_agency and t.archived_at is null and t.commercial_status <> 'inactive'
    order by lower(t.display_name) limit 150
  ) q;

  return jsonb_build_object('can_values', v_admin,
    'context', jsonb_build_object('kind', v_kind, 'title', v_title, 'period_start', v_start, 'period_end', v_end,
      'networks', to_jsonb(v_networks), 'target_age_bands', to_jsonb(v_ages), 'target_states', to_jsonb(v_states),
      'segments', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name), '[]'::jsonb)
                   from public.talent_segments g where g.id = any (v_segments) and g.agency_id = p_agency),
      'value_model', v_model, 'max_heroes', v_max, 'has_budget', v_fee_budget is not null,
      'budget_cents', case when v_admin and v_model = 'fixo' then v_total end,
      'rate_bp', case when v_admin then v_rate end,
      'fee_budget_cents', case when v_admin then v_fee_budget end,
      'current', to_jsonb(v_current)),
    'heroes', v_heroes);
end $$;
revoke execute on function public.agency_cast_inputs(uuid, uuid, uuid) from public, anon;
grant execute on function public.agency_cast_inputs(uuid, uuid, uuid) to authenticated, service_role;

-- 14) usar o elenco montado: sugere os heróis e (só o Adm) grava a repartição como cachês ------------------------------------
-- p_items: [{talent_id, fee_cents?}]. Gestor+ sugere; fee_cents só do Adm (forbidden). No modelo fixo a soma dos cachês não
-- passa do orçamento de cachês (valor total ÷ (1 + taxa)): fee_over_budget. Tudo numa transação.
create or replace function public.agency_deal_cast_apply(p_deal uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_admin boolean; e jsonb; v_list jsonb := '[]'::jsonb; v_talent uuid; v_fee bigint; v_sum bigint := 0; v_with_fees boolean := false;
  v_ids uuid[] := '{}'::uuid[]; d public.deals%rowtype; b public.campaign_request_budgets%rowtype; v_rate int; v_dt uuid; v_res jsonb; v_set int := 0;
  v_fees jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, false);
  v_admin := public.agency_can(v_agency, 'admin');
  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    begin
      v_talent := (e ->> 'talent_id')::uuid;
      v_fee := nullif(btrim(coalesce(e ->> 'fee_cents', '')), '')::bigint;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    if v_talent is null or v_talent = any (v_ids) then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_fee is not null then
      if not v_admin then raise exception 'forbidden' using errcode = '42501'; end if;
      if v_fee < 0 or v_fee > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
      v_with_fees := true; v_sum := v_sum + v_fee;
      v_fees := v_fees || jsonb_build_object('talent_id', v_talent, 'fee', v_fee);
    end if;
    v_ids := v_ids || v_talent;
    v_list := v_list || jsonb_build_object('kind', 'talent', 'talent_id', v_talent);
  end loop;
  if v_with_fees then
    select * into d from public.deals where id = p_deal;
    select * into b from public.campaign_request_budgets where request_id = d.request_id;
    if coalesce(b.value_model, 'fixo') = 'fixo' and b.budget_max_cents is not null then
      select coalesce(d.service_rate_bp, a.service_rate_bp) into v_rate from public.agencies a where a.id = v_agency;
      if v_sum > (b.budget_max_cents * 10000) / (10000 + v_rate) then raise exception 'fee_over_budget' using errcode = 'P0001'; end if;
    end if;
  end if;
  v_res := public.agency_deal_suggest_heroes(p_deal, v_list);
  for e in select value from jsonb_array_elements(v_fees) loop
    select t.id into v_dt from public.deal_talents t where t.deal_id = p_deal and t.talent_id = (e ->> 'talent_id')::uuid;
    if v_dt is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public.agency_fee_set(v_dt, (e ->> 'fee')::bigint);
    v_set := v_set + 1;
  end loop;
  perform public.deal_max_heroes_check(p_deal);
  return v_res || jsonb_build_object('fees_set', v_set);
end $$;
revoke execute on function public.agency_deal_cast_apply(uuid, jsonb) from public, anon;
grant execute on function public.agency_deal_cast_apply(uuid, jsonb) to authenticated, service_role;

-- 15) pedido de alteração de verba (0090) numa campanha por herói ------------------------------------------------------------
-- O pedido da 0090 informa o valor TOTAL da verba da campanha e a 0090 grava esse número em budget_max_cents. Na campanha por
-- herói esse campo é o valor POR HERÓI, então, depois que a campanha foi enviada (status <> 'draft'), a atualização que muda
-- budget_max_cents é lida como o novo total e vira total ÷ máximo de heróis (nunca menos de 1 centavo). Rascunho não passa por aqui.
create or replace function public.campaign_request_budgets_value_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.value_model = 'por_heroi' and new.max_heroes is not null and new.budget_max_cents is not null
     and new.budget_max_cents is distinct from old.budget_max_cents
     and exists (select 1 from public.campaign_requests r where r.id = new.request_id and r.status <> 'draft') then
    new.budget_max_cents := greatest(1, new.budget_max_cents / new.max_heroes);
  end if;
  return new;
end $$;
revoke execute on function public.campaign_request_budgets_value_trg() from public, anon, authenticated;
drop trigger if exists trg_campaign_request_budgets_value on public.campaign_request_budgets;
create trigger trg_campaign_request_budgets_value before update of budget_max_cents on public.campaign_request_budgets
  for each row execute function public.campaign_request_budgets_value_trg();

notify pgrst, 'reload schema';
