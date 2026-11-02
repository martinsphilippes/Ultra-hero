-- =============================================================================
-- Groscove Ultra · 0080 · Gestão: briefing estruturado, checklists de publicidade, modelos e duplicar campanha
-- Bloco 3. Cenário S87. Idempotente; nenhuma função nova para anon (S14 segue 18).
--
-- Decisões:
--   • Briefing estruturado mora em campaign_requests.brief (jsonb validado por campaign_brief_valid): hashtags
--     obrigatórias (#…), @menções, links (https), cupom, referências (URLs https), "o que não fazer" e itens extras
--     de checklist da campanha (checks). Todo negócio tem pedido (agency_deal_create também cria um), então o
--     negócio lê o briefing pelo request_id — sem coluna nova em deals. A marca grava no rascunho
--     (brand_request_save ganha a chave "brief"); depois do envio, quem ajusta é a agência (agency_brief_save,
--     gestor+ ou responsável/equipe do negócio, vira atividade "brief_updated").
--   • Leituras: brand_campaign_detail e talent_opportunities devolvem request.brief; deal_execution devolve "brief"
--     no topo e, em cada versão, os checklists conferidos (talent_checklist / brand_checklist).
--   • Checklists (itens calculados no banco por brief_check_items, iguais ao app em src/lib/brief/checklist.ts):
--       marca: ad_label (#publi ou "publicidade" visível), brand_mention (marca @mencionada), link_coupon (link e
--              cupom corretos), no_health_claims (sem alegação de saúde proibida), follows_brief (respeita o
--              briefing) + "extra:<item>" para cada item extra da campanha;
--       creator: ad_label, brand_mention, follows_brief + cada hashtag, @menção, link e cupom do briefing, "donts"
--              (quando há "o que não fazer") + os mesmos itens extras.
--     A marca APROVAR exige todos os itens marcados (deliverable_decide_checked; erro checklist_incomplete) e o que
--     foi marcado fica na versão (brand_checklist). Pedir ajustes não exige checklist. A agência, quando registra uma
--     decisão recebida fora (já exige nota), não precisa do checklist (pode mandar o que conferiu).
--     O creator ENVIAR exige o checklist dele completo (deliverable_submit_checked); a agência enviando pelo creator
--     sem login não precisa (registra o que mandar). As RPCs antigas deliverable_submit/deliverable_decide
--     continuam com a MESMA assinatura (sem sobrecarga) e passam a delegar com checklist vazio: o creator e a
--     aprovação da marca por elas recebem checklist_incomplete; agência e "pedir ajustes" seguem funcionando.
--   • Modelos de briefing da marca (brand_brief_templates, leitura por RLS para membros da marca): salvar uma
--     campanha como modelo (brand_template_save, nome único por marca sem diferenciar maiúsculas — salvar com o mesmo
--     nome substitui; até 30 por marca, erro limit_reached), apagar (brand_template_delete) e criar rascunho a partir
--     do modelo (brand_request_from_template). O modelo guarda objetivo, produto, público, formato, duração, local,
--     redes, entregáveis, segmentos, observações e o briefing estruturado — sem título, datas, creator, valor nem
--     situação.
--   • Duplicar campanha (brand_request_duplicate): rascunho novo copiando briefing, entregáveis e público (os mesmos
--     campos do modelo) e o creator escolhido, se ele ainda estiver no catálogo autorizado; sem datas, sem valor e
--     sem situação. Segmentos que não são da agência atual da marca ficam de fora. Pedido aberto pela agência tem as
--     notas internas mascaradas (como em brand_campaign_detail).
--   • Todas as RPCs novas: security definer, search_path vazio, só authenticated/service_role.
-- =============================================================================

-- 1) briefing estruturado --------------------------------------------------------------------------------------
create or replace function public.campaign_brief_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; e jsonb; v text; n int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('hashtags', 'mentions', 'links', 'coupon', 'references', 'donts', 'checks') then return false; end if;
  end loop;
  foreach k in array array['hashtags', 'mentions', 'links', 'references', 'checks'] loop
    if p ? k then
      if jsonb_typeof(p -> k) <> 'array' then return false; end if;
      n := jsonb_array_length(p -> k);
      if n > (case when k in ('hashtags', 'mentions') then 15 else 10 end) then return false; end if;
      for e in select value from jsonb_array_elements(p -> k) loop
        if jsonb_typeof(e) <> 'string' then return false; end if;
        v := e #>> '{}';
        if not (case k
                  when 'hashtags' then v ~ '^#[^[:space:]#@]{1,60}$'
                  when 'mentions' then v ~ '^@[A-Za-z0-9._-]{1,60}$'
                  when 'checks' then char_length(v) between 3 and 120 and v = btrim(v)
                  else public.brand_https_url_ok(v) end) then
          return false;
        end if;
      end loop;
      if (select count(distinct lower(x)) from jsonb_array_elements_text(p -> k) x) <> n then return false; end if;
    end if;
  end loop;
  if p ? 'coupon' and (jsonb_typeof(p -> 'coupon') <> 'string' or (p ->> 'coupon') !~ '^[^[:space:]]{0,40}$') then return false; end if;
  if p ? 'donts' and (jsonb_typeof(p -> 'donts') <> 'string' or char_length(p ->> 'donts') > 1000) then return false; end if;
  return true;
end $$;
revoke execute on function public.campaign_brief_valid(jsonb) from public, anon;
grant execute on function public.campaign_brief_valid(jsonb) to authenticated, service_role;

alter table public.campaign_requests add column if not exists brief jsonb not null default '{}'::jsonb;
alter table public.campaign_requests drop constraint if exists campaign_requests_brief_check;
alter table public.campaign_requests add constraint campaign_requests_brief_check check (public.campaign_brief_valid(brief));

-- itens do checklist de cada lado (a ordem é a da tela); p_side: 'brand' | 'talent'
create or replace function public.brief_check_items(p_brief jsonb, p_side text)
returns text[] language sql immutable set search_path = '' as $$
  select (case when p_side = 'brand' then array['ad_label', 'brand_mention', 'link_coupon', 'no_health_claims', 'follows_brief']
               else array['ad_label', 'brand_mention', 'follows_brief'] end)
    || (case when p_side = 'brand' then '{}'::text[] else
          coalesce((select array_agg('hashtag:' || x order by o) from jsonb_array_elements_text(case when jsonb_typeof(p_brief -> 'hashtags') = 'array' then p_brief -> 'hashtags' else '[]'::jsonb end) with ordinality t(x, o)), '{}')
          || coalesce((select array_agg('mention:' || x order by o) from jsonb_array_elements_text(case when jsonb_typeof(p_brief -> 'mentions') = 'array' then p_brief -> 'mentions' else '[]'::jsonb end) with ordinality t(x, o)), '{}')
          || coalesce((select array_agg('link:' || x order by o) from jsonb_array_elements_text(case when jsonb_typeof(p_brief -> 'links') = 'array' then p_brief -> 'links' else '[]'::jsonb end) with ordinality t(x, o)), '{}')
          || (case when coalesce(p_brief ->> 'coupon', '') <> '' then array['coupon:' || (p_brief ->> 'coupon')] else '{}'::text[] end)
          || (case when btrim(coalesce(p_brief ->> 'donts', '')) <> '' then array['donts'] else '{}'::text[] end)
        end)
    || coalesce((select array_agg('extra:' || x order by o) from jsonb_array_elements_text(case when jsonb_typeof(p_brief -> 'checks') = 'array' then p_brief -> 'checks' else '[]'::jsonb end) with ordinality t(x, o)), '{}')
$$;
revoke execute on function public.brief_check_items(jsonb, text) from public, anon;
grant execute on function public.brief_check_items(jsonb, text) to authenticated, service_role;

-- os itens marcados (p_checks: array de textos) que fazem parte da lista, na ordem da lista; null se não veio array
create or replace function public.brief_checks_marked(p_required text[], p_checks jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_checks is null or jsonb_typeof(p_checks) <> 'array' then null
              else (select coalesce(jsonb_agg(r order by o), '[]'::jsonb) from unnest(p_required) with ordinality u(r, o) where p_checks ? r) end
$$;
revoke execute on function public.brief_checks_marked(text[], jsonb) from public, anon, authenticated;
grant execute on function public.brief_checks_marked(text[], jsonb) to service_role;

-- briefing do negócio (pelo pedido)
create or replace function public.deal_brief(p_deal uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select r.brief from public.deals d join public.campaign_requests r on r.id = d.request_id where d.id = p_deal), '{}'::jsonb)
$$;
revoke execute on function public.deal_brief(uuid) from public, anon, authenticated;
grant execute on function public.deal_brief(uuid) to service_role;

-- checklists conferidos ficam na versão
alter table public.deliverable_versions add column if not exists talent_checklist jsonb;
alter table public.deliverable_versions add column if not exists brand_checklist jsonb;
alter table public.deliverable_versions drop constraint if exists deliverable_versions_checklists_check;
alter table public.deliverable_versions add constraint deliverable_versions_checklists_check check (
  (talent_checklist is null or (jsonb_typeof(talent_checklist) = 'array' and jsonb_array_length(talent_checklist) <= 80))
  and (brand_checklist is null or (jsonb_typeof(brand_checklist) = 'array' and jsonb_array_length(brand_checklist) <= 80)));

-- 2) proposta da marca (0066) + p_data.brief ----------------------------------------------------------------------
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
  if v_talent is not null and not public.talent_brand_card_ok(v_talent, v_agency) then
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

-- agência ajusta o briefing estruturado do negócio (gestor+ ou responsável/equipe; negócio aberto)
create or replace function public.agency_brief_save(p_deal uuid, p_brief jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_request uuid; v_before jsonb;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if p_brief is null or not public.campaign_brief_valid(p_brief) then raise exception 'invalid_input' using errcode = '22023'; end if;
  select d.request_id into v_request from public.deals d where d.id = p_deal;
  if v_request is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select r.brief into v_before from public.campaign_requests r where r.id = v_request for update;
  if v_before = p_brief then return; end if;
  update public.campaign_requests set brief = p_brief where id = v_request;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', p_deal, 'system', 'brief_updated', auth.uid(), public.actor_label(v_agency));
  perform public.audit_log('deal.brief', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'brief', v_before),
    jsonb_build_object('agency_id', v_agency, 'brief', p_brief), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.agency_brief_save(uuid, jsonb) from public, anon;
grant execute on function public.agency_brief_save(uuid, jsonb) to authenticated, service_role;

-- 3) leituras (0066) + request.brief --------------------------------------------------------------------------
create or replace function public.brand_campaign_detail(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; d public.deals%rowtype; v_brand_status text; v_visible_dt uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null or (public.brand_member_of(r.brand_id) is null and not public.is_platform_admin()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where request_id = p_request;
  if r.origin = 'agency' and (d.id is null or not d.brand_visible) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_brand_status := case when d.id is null then case when r.status = 'cancelled' then 'cancelled' else 'draft' end
                         else public.deal_brand_status(d.stage, d.outcome) end;
  v_visible_dt := public.my_brand_deal_talent_ids();
  return jsonb_build_object(
    'request', jsonb_build_object('id', r.id, 'title', r.title, 'objective', r.objective, 'product', r.product, 'target_audience', r.target_audience,
      'target_age_bands', to_jsonb(r.target_age_bands), 'target_states', to_jsonb(r.target_states), 'region_note', r.region_note,
      'period_start', r.period_start, 'period_end', r.period_end, 'desired_at', r.desired_at, 'duration_minutes', r.duration_minutes,
      'format', r.format, 'location', r.location, 'networks', to_jsonb(r.networks), 'deliverables', r.deliverables,
      -- notas de pedido aberto pela agência são internas (a mesma máscara de talent_opportunities)
      'notes', case when r.origin = 'brand' then r.notes else '' end,
      'brief', r.brief,
      'status', r.status, 'submitted_at', r.submitted_at, 'created_at', r.created_at, 'talent_id', r.talent_id, 'origin', r.origin),
    'brand_status', v_brand_status,
    'deal', case when d.id is null then null else jsonb_build_object('id', d.id, 'title', d.title, 'stage_changed_at', d.stage_changed_at,
      'expected_start', d.expected_start, 'expected_end', d.expected_end, 'confirmed_at', d.confirmed_at, 'closed_at', d.closed_at, 'outcome', d.outcome) end,
    -- o creator desejado pela marca aparece sempre (ela escolheu); os demais só depois da confirmação
    'requested_talent', case when r.talent_id is null then null else public.talent_brand_card(r.talent_id, r.agency_id) end,
    'talents', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(
        public.talent_brand_card(dt.talent_id, r.agency_id) || jsonb_build_object('deal_talent_id', dt.id, 'status', dt.status) order by dt.created_at), '[]')
      from public.deal_talents dt where dt.deal_id = d.id and dt.id = any (v_visible_dt)) end,
    'deliverables', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'network', x.network,
        'title', x.title, 'due_at', x.due_at, 'publish_at', x.publish_at, 'status', x.status, 'talent_name', t.display_name) order by x.due_at nulls last), '[]')
      from public.deliverables x join public.talent_profiles t on t.id = x.talent_id where x.deal_id = d.id and x.deal_talent_id = any (v_visible_dt)) end);
end $$;
revoke execute on function public.brand_campaign_detail(uuid) from public, anon;
grant execute on function public.brand_campaign_detail(uuid) to authenticated, service_role;

create or replace function public.talent_opportunities(p_deal_talent uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id();
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', dt.id, 'status', dt.status, 'consulted_at', dt.consulted_at, 'respond_by', dt.respond_by, 'responded_at', dt.responded_at,
      'response_note', dt.response_note, 'terms_ready', dt.terms_ready,
      'deal', jsonb_build_object('id', d.id, 'title', d.title, 'talent_brief', d.talent_brief, 'expected_start', d.expected_start, 'expected_end', d.expected_end,
        'status', case when d.stage = 'closed' then coalesce(d.outcome, 'cancelled') when public.deal_stage_index(d.stage) >= 10 then 'running'
                       when public.deal_stage_index(d.stage) >= 8 then 'confirmed' else 'open' end,
        'confirmed_at', d.confirmed_at),
      'request', case when r.id is null then null else jsonb_build_object('objective', r.objective, 'product', r.product, 'desired_at', r.desired_at,
        'duration_minutes', r.duration_minutes, 'format', r.format, 'location', r.location, 'networks', to_jsonb(r.networks), 'deliverables', r.deliverables,
        'notes', case when r.origin = 'brand' then r.notes else '' end, 'brief', r.brief) end,
      'brand', jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url),
      'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'network', x.network, 'title', x.title, 'brief', x.brief,
          'due_at', x.due_at, 'publish_at', x.publish_at, 'status', x.status) order by x.due_at nulls last), '[]')
        from public.deliverables x where x.deal_talent_id = dt.id and x.status <> 'cancelled')
    ) order by dt.consulted_at desc), '[]'::jsonb)
    from public.deal_talents dt
    join public.deals d on d.id = dt.deal_id
    join public.brands b on b.id = d.brand_id
    left join public.campaign_requests r on r.id = d.request_id
    where dt.talent_id = v_talent and dt.consulted_at is not null and dt.status <> 'removed' and (p_deal_talent is null or dt.id = p_deal_talent));
end $$;
revoke execute on function public.talent_opportunities(uuid) from public, anon;
grant execute on function public.talent_opportunities(uuid) to authenticated, service_role;

-- leitura da execução (0079) + brief no topo e checklists em cada versão
create or replace function public.deal_execution(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_side text; d public.deals%rowtype; v_dt uuid[]; v_terms jsonb; v_tasks jsonb; v_delivs jsonb; v_my_talent uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids()) then v_side := 'agency';
  elsif d.brand_visible and public.brand_member_of(d.brand_id) is not null then v_side := 'brand'; v_dt := public.my_brand_deal_talent_ids();
  elsif d.id = any (public.my_talent_deal_ids()) then v_side := 'talent'; v_my_talent := public.my_talent_id();
    -- consultado mas não confirmado: nada de termos
    if not (d.id = any (public.my_talent_contract_deal_ids())) then v_terms := '[]'::jsonb; end if;
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_terms is null then
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'version', t.version, 'status', t.status, 'summary', t.summary, 'usage_rights', t.usage_rights, 'exclusivity', t.exclusivity,
           'valid_until', t.valid_until, 'sent_at', t.sent_at, 'rights', public.deal_terms_rights(t.id),
           'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('party', a.party, 'deal_talent_id', a.deal_talent_id, 'method', a.method, 'accepted_at', a.accepted_at,
                            'talent_name', (select x.display_name from public.talent_profiles x where x.id = a.talent_id)) order by a.accepted_at), '[]')
                           from public.deal_acceptances a where a.terms_id = t.id
                             and (v_side <> 'talent' or (a.party = 'talent' and a.talent_id = v_my_talent) or a.party = 'brand'))
         ) order by t.version desc), '[]'::jsonb) into v_terms
  from public.deal_terms t where t.deal_id = p_deal and (v_side = 'agency' or (t.status <> 'draft' and t.sent_at is not null));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'step', k.template_step, 'title', k.title, 'description', k.description, 'side', k.side, 'status', k.status,
           'due_at', k.due_at, 'completed_at', k.completed_at, 'talent_id', k.talent_id, 'talent_name', (select x.display_name from public.talent_profiles x where x.id = k.talent_id),
           'attachment_url', k.attachment_url, 'attachment_document_id', k.attachment_document_id, 'feedback', k.feedback)
           || case when v_side = 'agency' then jsonb_build_object('assignee_id', k.assignee_id) else '{}'::jsonb end
         order by coalesce(k.template_step, 99), k.due_at nulls last, k.created_at), '[]'::jsonb) into v_tasks
  from public.tasks k where k.deal_id = p_deal and k.status <> 'cancelled'
    and (v_side = 'agency' or (v_side = 'brand' and k.side = 'brand') or (v_side = 'talent' and k.side = 'talent' and k.talent_id = v_my_talent));
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'deal_talent_id', x.deal_talent_id, 'talent_name', (select tp.display_name from public.talent_profiles tp where tp.id = x.talent_id),
           'kind', x.kind, 'network', x.network, 'title', x.title, 'brief', x.brief, 'due_at', x.due_at, 'publish_at', x.publish_at, 'status', x.status,
           'revision', x.revision, 'submission_url', x.submission_url, 'submission_document_id', x.submission_document_id, 'submission_note', x.submission_note, 'submitted_at', x.submitted_at,
           'brand_feedback', x.brand_feedback, 'decided_at', x.decided_at, 'decided_side', x.decided_side, 'published_url', x.published_url, 'published_at', x.published_at,
           'proof_url', x.proof_url, 'proof_document_id', x.proof_document_id, 'proof_at', x.proof_at,
           'versions', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'revision', v.revision, 'kind', v.kind, 'url', v.url, 'document_id', v.document_id, 'note', v.note,
                          'submitted_side', v.submitted_side, 'submitted_at', v.submitted_at, 'decision', v.decision, 'feedback', v.feedback, 'decided_side', v.decided_side, 'decided_at', v.decided_at,
                          'talent_checklist', v.talent_checklist, 'brand_checklist', v.brand_checklist)
                          order by v.kind, v.revision), '[]') from public.deliverable_versions v where v.deliverable_id = x.id))
         order by x.due_at nulls last, x.created_at), '[]'::jsonb) into v_delivs
  from public.deliverables x where x.deal_id = p_deal and x.status <> 'cancelled'
    and (v_side = 'agency' or (v_side = 'brand' and x.deal_talent_id = any (v_dt)) or (v_side = 'talent' and x.talent_id = v_my_talent));
  -- marca e creator não recebem a etapa interna do pipeline: só "em execução ou não"
  return jsonb_build_object('side', v_side, 'stage', case when v_side = 'agency' or d.stage in ('production', 'closed') then d.stage else 'contracting' end,
    'contract_confirmed_at', d.contract_confirmed_at, 'terms', v_terms, 'tasks', v_tasks, 'deliverables', v_delivs, 'brief', public.deal_brief(p_deal));
end $$;
revoke execute on function public.deal_execution(uuid) from public, anon;
grant execute on function public.deal_execution(uuid) to authenticated, service_role;

-- 4) entregas com checklist ---------------------------------------------------------------------------------------
-- envio de uma versão (0068) + checklist do creator (obrigatório quando é o creator que envia)
create or replace function public.deliverable_submit_checked(p_deliverable uuid, p_url text, p_document uuid, p_note text, p_checks jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; x public.deliverables; v_side text; v_url text := nullif(btrim(coalesce(p_url, '')), ''); v_note text := btrim(coalesce(p_note, '')); v_id uuid; d public.deals%rowtype; v_stage text;
        v_required text[]; v_marked jsonb;
begin
  select * into a from public.deliverable_actor(p_deliverable);
  x := a.o_row; v_side := a.o_side;
  select d2.stage into v_stage from public.deals d2 where d2.id = x.deal_id;
  if public.deal_stage_index(v_stage) < 10 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if x.status not in ('planned', 'in_production', 'changes_requested') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_url is null and p_document is null then raise exception 'file_missing' using errcode = 'P0001'; end if;
  if v_url is not null and not public.brand_https_url_ok(v_url) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_checks is not null and jsonb_typeof(p_checks) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_required := public.brief_check_items(public.deal_brief(x.deal_id), 'talent');
  v_marked := public.brief_checks_marked(v_required, p_checks);
  if v_side = 'talent' and (v_marked is null or jsonb_array_length(v_marked) < cardinality(v_required)) then
    raise exception 'checklist_incomplete' using errcode = '22023';
  end if;
  if p_document is not null and not exists (select 1 from public.documents doc where doc.id = p_document and doc.deal_id = x.deal_id and doc.kind in ('submission', 'media', 'other')
                                            and doc.status = 'ready' and not doc.restricted and (v_side <> 'talent' or doc.share_talent)
                                            and (doc.talent_id is null or doc.talent_id = x.talent_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.deliverables set status = 'submitted', revision = revision + 1, submission_url = v_url, submission_document_id = p_document, submission_note = v_note,
    submitted_at = now(), brand_feedback = '', decided_at = null, decided_by = null, decided_side = null
  where id = p_deliverable returning * into x;
  insert into public.deliverable_versions (agency_id, brand_id, deal_id, deliverable_id, deal_talent_id, talent_id, revision, kind, url, document_id, note, submitted_side, submitted_by, talent_checklist)
  values (x.agency_id, x.brand_id, x.deal_id, x.id, x.deal_talent_id, x.talent_id, x.revision, 'submission', v_url, p_document, v_note, v_side, auth.uid(), v_marked)
  returning id into v_id;
  if p_document is not null then update public.documents set share_brand = true, share_talent = true where id = p_document; end if;
  perform public.task_step_set(x.deal_id, x.talent_id, 7::smallint, 'done');
  select * into d from public.deals where id = x.deal_id;
  perform public.audit_log('deliverable.submit', 'deliverable', p_deliverable::text, null,
    jsonb_build_object('agency_id', x.agency_id, 'revision', x.revision, 'side', v_side, 'checklist', coalesce(jsonb_array_length(v_marked), 0)), nullif(v_note, ''),
    case when v_side = 'talent' then 'creator'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  perform public.inbox_notify_brand(d.brand_id, false, 'deliverable_submitted', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'revision', x.revision::text), x.agency_id, 'deliverable', x.id, 'submit:' || x.id::text || ':' || x.revision::text);
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_submitted', '/agencia/negocios/' || d.id::text || '/entregas', jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'revision', x.revision::text),
      x.agency_id, 'deliverable', x.id, 'submit:' || x.id::text || ':' || x.revision::text || ':owner');
  end if;
  return v_id;
end $$;
revoke execute on function public.deliverable_submit_checked(uuid, text, uuid, text, jsonb) from public, anon;
grant execute on function public.deliverable_submit_checked(uuid, text, uuid, text, jsonb) to authenticated, service_role;

-- a RPC antiga (mesma assinatura): sem checklist — serve à agência; o creator recebe checklist_incomplete
create or replace function public.deliverable_submit(p_deliverable uuid, p_url text default null, p_document uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.deliverable_submit_checked(p_deliverable, p_url, p_document, p_note, null);
end $$;
revoke execute on function public.deliverable_submit(uuid, text, uuid, text) from public, anon;
grant execute on function public.deliverable_submit(uuid, text, uuid, text) to authenticated, service_role;

-- decisão (0068) + checklist de publicidade (obrigatório para a marca aprovar)
create or replace function public.deliverable_decide_checked(p_deliverable uuid, p_decision text, p_feedback text, p_checks jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; d public.deals%rowtype; v_feedback text := btrim(coalesce(p_feedback, '')); v_side text; v_to uuid; v_status text;
        v_required text[]; v_marked jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'changes_requested') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_checks is not null and jsonb_typeof(p_checks) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into x from public.deliverables where id = p_deliverable for update;
  if x.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where id = x.deal_id;
  if d.brand_visible and public.brand_member_of(d.brand_id) is not null and x.deal_talent_id = any (public.my_brand_deal_talent_ids()) then
    v_side := 'brand';
  elsif public.agency_can(x.agency_id, 'manager') or x.deal_id = any (public.my_staff_deal_ids()) then
    v_side := 'agency';
    if char_length(v_feedback) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if x.status <> 'submitted' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_decision = 'changes_requested' and char_length(v_feedback) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(v_feedback) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_required := public.brief_check_items(public.deal_brief(x.deal_id), 'brand');
  v_marked := public.brief_checks_marked(v_required, p_checks);
  if v_side = 'brand' and p_decision = 'approved' and (v_marked is null or jsonb_array_length(v_marked) < cardinality(v_required)) then
    raise exception 'checklist_incomplete' using errcode = '22023';
  end if;
  v_status := p_decision;
  update public.deliverables set status = v_status, brand_feedback = v_feedback, decided_at = now(), decided_by = auth.uid(), decided_side = v_side where id = p_deliverable;
  update public.deliverable_versions set decision = p_decision, feedback = v_feedback, decided_side = v_side, decided_by = auth.uid(), decided_at = now(), brand_checklist = v_marked
  where deliverable_id = p_deliverable and kind = 'submission' and revision = x.revision;
  if p_decision = 'approved' then perform public.task_step_set(x.deal_id, x.talent_id, 8::smallint, 'done');
  else perform public.task_step_set(x.deal_id, x.talent_id, 7::smallint, 'todo', v_feedback); perform public.task_step_set(x.deal_id, x.talent_id, 8::smallint, 'todo'); end if;
  perform public.audit_log('deliverable.decide', 'deliverable', p_deliverable::text, jsonb_build_object('agency_id', x.agency_id, 'status', x.status),
    jsonb_build_object('agency_id', x.agency_id, 'status', v_status, 'side', v_side, 'revision', x.revision, 'checklist', coalesce(jsonb_array_length(v_marked), 0)), nullif(v_feedback, ''),
    case when v_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  v_to := public.talent_user_id(x.talent_id);
  perform public.inbox_notify(v_to, 'deliverable_decided', '/creator/escritorio/oportunidades/' || x.deal_talent_id::text,
    jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'status', v_status), x.agency_id, 'deliverable', x.id, 'decide:' || x.id::text || ':' || x.revision::text);
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_decided', '/agencia/negocios/' || d.id::text || '/entregas', jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'status', v_status),
      x.agency_id, 'deliverable', x.id, 'decide:' || x.id::text || ':' || x.revision::text || ':owner');
  end if;
end $$;
revoke execute on function public.deliverable_decide_checked(uuid, text, text, jsonb) from public, anon;
grant execute on function public.deliverable_decide_checked(uuid, text, text, jsonb) to authenticated, service_role;

-- a RPC antiga (mesma assinatura): sem checklist — agência e "pedir ajustes"; a marca aprovar recebe checklist_incomplete
create or replace function public.deliverable_decide(p_deliverable uuid, p_decision text, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.deliverable_decide_checked(p_deliverable, p_decision, p_feedback, null);
end $$;
revoke execute on function public.deliverable_decide(uuid, text, text) from public, anon;
grant execute on function public.deliverable_decide(uuid, text, text) to authenticated, service_role;

-- 5) modelos de briefing da marca e duplicar campanha --------------------------------------------------------------
create table if not exists public.brand_brief_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null constraint brand_brief_templates_brand_fk references public.brands (id) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  source_request_id uuid constraint brand_brief_templates_request_fk references public.campaign_requests (id) on delete set null,
  created_by uuid constraint brand_brief_templates_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_brief_templates_name_check check (char_length(name) between 3 and 80 and name = btrim(name)),
  constraint brand_brief_templates_data_check check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000)
);
create unique index if not exists brand_brief_templates_name_uq on public.brand_brief_templates (brand_id, lower(name));
revoke all on table public.brand_brief_templates from public, anon, authenticated;
grant select on table public.brand_brief_templates to authenticated;
grant all on table public.brand_brief_templates to service_role;
alter table public.brand_brief_templates enable row level security;
drop trigger if exists trg_brand_brief_templates_updated on public.brand_brief_templates;
create trigger trg_brand_brief_templates_updated before update on public.brand_brief_templates for each row execute function public.set_updated_at();
drop policy if exists brand_brief_templates_select_admin on public.brand_brief_templates;
create policy brand_brief_templates_select_admin on public.brand_brief_templates for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists brand_brief_templates_select_brand on public.brand_brief_templates;
create policy brand_brief_templates_select_brand on public.brand_brief_templates for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- campos reaproveitáveis de um pedido (formato de p_data de brand_request_save), sem título, datas, creator e valor
create or replace function public.campaign_request_reusable(p_request uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('objective', coalesce(r.objective, ''), 'product', r.product, 'target_audience', r.target_audience,
    'target_age_bands', to_jsonb(r.target_age_bands), 'target_states', to_jsonb(r.target_states), 'region_note', r.region_note,
    'duration_minutes', coalesce(r.duration_minutes::text, ''), 'format', coalesce(r.format, ''), 'location', r.location,
    'networks', to_jsonb(r.networks), 'deliverables', r.deliverables, 'segment_ids', to_jsonb(r.segment_ids),
    'notes', case when r.origin = 'brand' then r.notes else '' end, 'brief', r.brief)
  from public.campaign_requests r where r.id = p_request
$$;
revoke execute on function public.campaign_request_reusable(uuid) from public, anon, authenticated;
grant execute on function public.campaign_request_reusable(uuid) to service_role;

-- pedido que a marca pode ler (próprio de origem marca, ou aberto pela agência com negócio visível)
create or replace function public.brand_readable_request(p_request uuid)
returns public.campaign_requests language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null or public.brand_member_of(r.brand_id) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.origin = 'agency' and not exists (select 1 from public.deals d where d.request_id = r.id and d.brand_visible) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return r;
end $$;
revoke execute on function public.brand_readable_request(uuid) from public, anon, authenticated;
grant execute on function public.brand_readable_request(uuid) to service_role;

-- só os segmentos da agência atual (a marca pode ter trocado de agência)
create or replace function public.reusable_for_agency(p_data jsonb, p_agency uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select p_data || jsonb_build_object('segment_ids', coalesce((select jsonb_agg(s) from jsonb_array_elements_text(
      case when jsonb_typeof(p_data -> 'segment_ids') = 'array' then p_data -> 'segment_ids' else '[]'::jsonb end) s
    where s ~ '^[0-9a-fA-F-]{36}$' and exists (select 1 from public.talent_segments g where g.id = s::uuid and g.agency_id = p_agency)), '[]'::jsonb))
$$;
revoke execute on function public.reusable_for_agency(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reusable_for_agency(jsonb, uuid) to service_role;

create or replace function public.brand_template_save(p_request uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  r := public.brand_readable_request(p_request);
  if char_length(v_name) < 3 or char_length(v_name) > 80 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.id into v_id from public.brand_brief_templates t where t.brand_id = r.brand_id and lower(t.name) = lower(v_name) for update;
  if v_id is null and (select count(*) from public.brand_brief_templates t where t.brand_id = r.brand_id) >= 30 then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into public.brand_brief_templates (brand_id, name, data, source_request_id, created_by)
    values (r.brand_id, v_name, public.campaign_request_reusable(r.id), r.id, auth.uid())
    returning id into v_id;
  else
    update public.brand_brief_templates set name = v_name, data = public.campaign_request_reusable(r.id), source_request_id = r.id where id = v_id;
  end if;
  perform public.audit_log('brand.template_save', 'brand_brief_template', v_id::text, null,
    jsonb_build_object('brand_id', r.brand_id, 'request_id', r.id, 'name', v_name), null, 'brand'::public.actor_type);
  return v_id;
end $$;
revoke execute on function public.brand_template_save(uuid, text) from public, anon;
grant execute on function public.brand_template_save(uuid, text) to authenticated, service_role;

create or replace function public.brand_template_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.brand_brief_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.brand_brief_templates where id = p_id for update;
  if t.id is null or public.brand_member_of(t.brand_id) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.brand_brief_templates where id = p_id;
  perform public.audit_log('brand.template_delete', 'brand_brief_template', p_id::text, jsonb_build_object('brand_id', t.brand_id, 'name', t.name), null, null, 'brand'::public.actor_type);
end $$;
revoke execute on function public.brand_template_delete(uuid) from public, anon;
grant execute on function public.brand_template_delete(uuid) to authenticated, service_role;

-- rascunho novo a partir de um modelo (título: o informado ou o nome do modelo)
create or replace function public.brand_request_from_template(p_template uuid, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.brand_brief_templates%rowtype; v_agency uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.brand_brief_templates where id = p_template;
  if t.id is null or public.brand_member_of(t.brand_id) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(t.brand_id);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  v_title := left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), t.name), 120);
  -- só as chaves conhecidas do modelo; o resto (título, datas, creator, valor) nunca vem dele
  return public.brand_request_save(null, t.brand_id,
    public.reusable_for_agency(
      (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(t.data) e
       where e.key in ('objective', 'product', 'target_audience', 'target_age_bands', 'target_states', 'region_note', 'duration_minutes', 'format', 'location',
                       'networks', 'deliverables', 'segment_ids', 'notes', 'brief')),
      v_agency) || jsonb_build_object('title', v_title));
end $$;
revoke execute on function public.brand_request_from_template(uuid, text) from public, anon;
grant execute on function public.brand_request_from_template(uuid, text) to authenticated, service_role;

-- duplicar campanha: rascunho novo com briefing, entregáveis e público; o creator só se ainda estiver no catálogo
create or replace function public.brand_request_duplicate(p_request uuid, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_agency uuid; v_title text; v_data jsonb;
begin
  r := public.brand_readable_request(p_request);
  v_agency := public.brand_active_agency(r.brand_id);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  v_title := left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), r.title), 120);
  v_data := public.reusable_for_agency(public.campaign_request_reusable(r.id), v_agency) || jsonb_build_object('title', v_title);
  if r.talent_id is not null and public.talent_brand_card_ok(r.talent_id, v_agency) then
    v_data := v_data || jsonb_build_object('talent_id', r.talent_id);
  end if;
  return public.brand_request_save(null, r.brand_id, v_data);
end $$;
revoke execute on function public.brand_request_duplicate(uuid, text) from public, anon;
grant execute on function public.brand_request_duplicate(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
