-- =============================================================================
-- Groscove Ultra · 0079 · Gestão: oferta clara, contraproposta, direitos de uso e exclusividade estruturados
-- Bloco 2. Cenário S86. Idempotente; nenhuma função nova para anon (S14 segue igual).
--
-- Decisões:
--   • Direitos de uso ESTRUTURADOS em deal_terms (os textos antigos usage_rights/exclusivity continuam como
--     observação livre): canais (usage_channels: redes, site, mídia paga, PDV, e-mail, e-commerce, mídia exterior,
--     TV, outro), prazo em meses (usage_months) OU perpétuo (usage_perpetual — o app desaconselha), impulsionamento
--     (boost_allowed), exclusividade (exclusive) com segmentos da agência (exclusivity_segment_ids), categoria em
--     texto (exclusivity_category), marcas concorrentes citadas (competitor_brands, nomes) e prazo em meses
--     (exclusivity_months, obrigatório quando há exclusividade). Sem exclusividade, os campos dela ficam vazios.
--     agency_terms_save recebe tudo em p_data.rights (objeto); sem a chave, o rascunho mantém o que tinha.
--     deal_execution passa a devolver terms[].rights (com os nomes dos segmentos, porque a marca não lê os
--     segmentos da agência); marca e creator leem só termos enviados, como antes.
--   • Contraproposta do creator (deal_counteroffers, com histórico): "outro valor" (fee_cents, com justificativa
--     obrigatória) ou "outra data" (proposed_date, opcionalmente de um entregável). Uma aberta por vez por creator
--     no negócio (índice único parcial). Valor: o creator lê as dele; na agência só o Adm lê o valor (a política
--     esconde a linha de valor de quem não é Adm; a leitura agency_offer_state devolve a de valor sem o número,
--     para o gestor saber que existe). A marca não lê contrapropostas (a agência fica no meio).
--     Regras: valor só antes da aprovação (etapa < 8, a mesma trava de agency_fee_set); data antes da produção
--     (etapa < 10). Decisão: valor só o Adm; data gestor+ (deal_write_scope). Aceitar valor grava o cachê novo
--     (deal_talent_fees) e, se o creator ainda não tinha respondido, registra o interesse dele (propor um valor é
--     "aceito por esse valor"). Aceitar data de um entregável desloca prazo e publicação dele pelo mesmo número de
--     dias (sem entregável escolhido, a data combinada só fica registrada; a agência ajusta o cronograma).
--     Recusar exige nota. O creator pode retirar a aberta. Avisos no sino reaproveitam os tipos existentes
--     (opportunity_answered para a agência, opportunity_updated para o creator), sem valor nos parâmetros (D16).
--     Decisões viram atividade do negócio (system, "código|nome").
--   • Conflito de exclusividade (exclusivity_conflicts, interna): o talento aceitou termos (aceite dele) com
--     exclusividade de outro negócio, de outra marca, não perdido/cancelado, ainda vigente — vigência = da data do
--     aceite até (fim previsto do negócio, ou a data do aceite) + N meses — e (a) os segmentos da exclusividade
--     (ou, se vazios, os do outro negócio) cruzam os segmentos do negócio atual, ou (b) a marca do negócio atual está
--     entre as concorrentes citadas (nome, sem diferenciar maiúsculas/acentos). O alerta não bloqueia: a consulta
--     (agency_consult_talents) recusa com exclusivity_conflict; a agência confirma pela RPC irmã
--     agency_consult_talents_confirmed, e a confirmação fica em activities. Na tela da oferta o creator vê o mesmo alerta.
--   • Leituras: talent_offer_state(p_deal_talent) (creator: contrapropostas, conflitos e o que ele pode propor)
--     e agency_offer_state(p_deal, p_talent_ids) (agência: contrapropostas do negócio e conflitos dos creators do
--     negócio e dos candidatos pedidos). talent_today ganha counter_status em cada consulta pendente.
-- =============================================================================

-- 1) direitos de uso e exclusividade estruturados -----------------------------------------------------------------
alter table public.deal_terms add column if not exists usage_channels text[] not null default '{}';
alter table public.deal_terms add column if not exists usage_months smallint;
alter table public.deal_terms add column if not exists usage_perpetual boolean not null default false;
alter table public.deal_terms add column if not exists boost_allowed boolean not null default false;
alter table public.deal_terms add column if not exists exclusive boolean not null default false;
alter table public.deal_terms add column if not exists exclusivity_segment_ids uuid[] not null default '{}';
alter table public.deal_terms add column if not exists exclusivity_category text not null default '';
alter table public.deal_terms add column if not exists competitor_brands text[] not null default '{}';
alter table public.deal_terms add column if not exists exclusivity_months smallint;

-- nomes de marcas concorrentes: 2 a 80 caracteres cada (check não aceita subconsulta)
create or replace function public.deal_terms_names_ok(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(char_length(btrim(x)) between 2 and 80 and x = btrim(x)), true) from unnest(p) x
$$;
revoke execute on function public.deal_terms_names_ok(text[]) from public, anon;
grant execute on function public.deal_terms_names_ok(text[]) to authenticated, service_role;

alter table public.deal_terms drop constraint if exists deal_terms_rights_check;
alter table public.deal_terms add constraint deal_terms_rights_check check (
  usage_channels <@ array['social', 'website', 'paid_media', 'pos', 'email', 'ecommerce', 'ooh', 'tv', 'other']::text[]
  and (usage_months is null or usage_months between 1 and 120)
  and not (usage_perpetual and usage_months is not null)
  and char_length(exclusivity_category) <= 120
  and cardinality(competitor_brands) <= 20 and public.deal_terms_names_ok(competitor_brands)
  and cardinality(exclusivity_segment_ids) <= 10
  and (exclusivity_months is null or exclusivity_months between 1 and 60)
  and (exclusive or (exclusivity_months is null and cardinality(exclusivity_segment_ids) = 0 and cardinality(competitor_brands) = 0 and exclusivity_category = ''))
  and (not exclusive or exclusivity_months is not null));

-- direitos de uma versão dos termos, prontos para qualquer lado (nomes dos segmentos resolvidos aqui)
create or replace function public.deal_terms_rights(p_terms uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('channels', to_jsonb(t.usage_channels), 'usage_months', t.usage_months, 'perpetual', t.usage_perpetual,
    'boost', t.boost_allowed, 'exclusive', t.exclusive, 'segment_ids', to_jsonb(t.exclusivity_segment_ids),
    'segments', (select coalesce(jsonb_agg(s.name order by s.sort_order, s.name), '[]'::jsonb) from public.talent_segments s where s.id = any (t.exclusivity_segment_ids)),
    'category', t.exclusivity_category, 'competitors', to_jsonb(t.competitor_brands), 'exclusivity_months', t.exclusivity_months)
  from public.deal_terms t where t.id = p_terms
$$;
revoke execute on function public.deal_terms_rights(uuid) from public, anon, authenticated;
grant execute on function public.deal_terms_rights(uuid) to service_role;

-- rascunho dos termos (0068) + p_data.rights
create or replace function public.agency_terms_save(p_deal uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_id uuid; v_version int; v_valid date; r jsonb; v_has_rights boolean := false;
        v_channels text[] := '{}'; v_months smallint; v_perpetual boolean := false; v_boost boolean := false; v_excl boolean := false;
        v_segs uuid[] := '{}'; v_cat text := ''; v_comp text[] := '{}'; v_excl_months smallint;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, false);
  select * into d from public.deals where id = p_deal;
  if public.deal_stage_index(d.stage) < 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  begin v_valid := nullif(btrim(coalesce(p_data ->> 'valid_until', '')), '')::date; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
  if p_data ? 'rights' then
    r := p_data -> 'rights';
    if jsonb_typeof(r) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_has_rights := true;
    begin
      if r ? 'channels' then
        if jsonb_typeof(r -> 'channels') <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
        select coalesce(array_agg(distinct x order by x), '{}') into v_channels from jsonb_array_elements_text(r -> 'channels') x;
      end if;
      v_perpetual := coalesce((r ->> 'perpetual')::boolean, false);
      v_months := case when v_perpetual then null else nullif(r ->> 'usage_months', '')::smallint end;
      v_boost := coalesce((r ->> 'boost')::boolean, false);
      v_excl := coalesce((r ->> 'exclusive')::boolean, false);
      if v_excl then
        v_excl_months := nullif(r ->> 'exclusivity_months', '')::smallint;
        v_cat := btrim(coalesce(r ->> 'category', ''));
        if r ? 'segment_ids' then
          if jsonb_typeof(r -> 'segment_ids') <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
          select coalesce(array_agg(distinct x::uuid), '{}') into v_segs from jsonb_array_elements_text(r -> 'segment_ids') x;
        end if;
        if r ? 'competitors' then
          if jsonb_typeof(r -> 'competitors') <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
          -- sem vazios e sem repetidos (sem diferenciar maiúsculas), na ordem digitada
          select coalesce(array_agg(n order by o), '{}') into v_comp from (
            select distinct on (lower(btrim(x))) btrim(x) as n, o from jsonb_array_elements_text(r -> 'competitors') with ordinality e(x, o)
            where btrim(x) <> '' order by lower(btrim(x)), o) s;
        end if;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch then
      raise exception 'invalid_input' using errcode = '22023';
    end;
    if v_excl and v_excl_months is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    -- segmentos só da própria agência
    if exists (select 1 from unnest(v_segs) x where not exists (select 1 from public.talent_segments s where s.id = x and s.agency_id = d.agency_id)) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;
  select t.id into v_id from public.deal_terms t where t.deal_id = p_deal and t.status = 'draft';
  begin
    if v_id is null then
      select coalesce(max(version), 0) + 1 into v_version from public.deal_terms where deal_id = p_deal;
      insert into public.deal_terms (agency_id, brand_id, deal_id, version, status, summary, usage_rights, exclusivity, valid_until, created_by,
        usage_channels, usage_months, usage_perpetual, boost_allowed, exclusive, exclusivity_segment_ids, exclusivity_category, competitor_brands, exclusivity_months)
      values (d.agency_id, d.brand_id, p_deal, v_version, 'draft', btrim(coalesce(p_data ->> 'summary', '')), btrim(coalesce(p_data ->> 'usage_rights', '')),
              btrim(coalesce(p_data ->> 'exclusivity', '')), v_valid, auth.uid(),
              v_channels, v_months, v_perpetual, v_boost, v_excl, v_segs, v_cat, v_comp, v_excl_months)
      returning id into v_id;
    else
      update public.deal_terms set
        summary = case when p_data ? 'summary' then btrim(coalesce(p_data ->> 'summary', '')) else summary end,
        usage_rights = case when p_data ? 'usage_rights' then btrim(coalesce(p_data ->> 'usage_rights', '')) else usage_rights end,
        exclusivity = case when p_data ? 'exclusivity' then btrim(coalesce(p_data ->> 'exclusivity', '')) else exclusivity end,
        valid_until = case when p_data ? 'valid_until' then v_valid else valid_until end,
        usage_channels = case when v_has_rights then v_channels else usage_channels end,
        usage_months = case when v_has_rights then v_months else usage_months end,
        usage_perpetual = case when v_has_rights then v_perpetual else usage_perpetual end,
        boost_allowed = case when v_has_rights then v_boost else boost_allowed end,
        exclusive = case when v_has_rights then v_excl else exclusive end,
        exclusivity_segment_ids = case when v_has_rights then v_segs else exclusivity_segment_ids end,
        exclusivity_category = case when v_has_rights then v_cat else exclusivity_category end,
        competitor_brands = case when v_has_rights then v_comp else competitor_brands end,
        exclusivity_months = case when v_has_rights then v_excl_months else exclusivity_months end
      where id = v_id;
    end if;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('terms.save', 'deal_terms', v_id::text, null, jsonb_build_object('agency_id', v_agency, 'deal_id', p_deal), null, public.talent_audit_actor('agency', v_agency));
  return v_id;
end $$;
revoke execute on function public.agency_terms_save(uuid, jsonb) from public, anon;
grant execute on function public.agency_terms_save(uuid, jsonb) to authenticated, service_role;

-- leitura da execução (0068) + terms[].rights
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
                          'submitted_side', v.submitted_side, 'submitted_at', v.submitted_at, 'decision', v.decision, 'feedback', v.feedback, 'decided_side', v.decided_side, 'decided_at', v.decided_at)
                          order by v.kind, v.revision), '[]') from public.deliverable_versions v where v.deliverable_id = x.id))
         order by x.due_at nulls last, x.created_at), '[]'::jsonb) into v_delivs
  from public.deliverables x where x.deal_id = p_deal and x.status <> 'cancelled'
    and (v_side = 'agency' or (v_side = 'brand' and x.deal_talent_id = any (v_dt)) or (v_side = 'talent' and x.talent_id = v_my_talent));
  -- marca e creator não recebem a etapa interna do pipeline: só "em execução ou não"
  return jsonb_build_object('side', v_side, 'stage', case when v_side = 'agency' or d.stage in ('production', 'closed') then d.stage else 'contracting' end,
    'contract_confirmed_at', d.contract_confirmed_at, 'terms', v_terms, 'tasks', v_tasks, 'deliverables', v_delivs);
end $$;
revoke execute on function public.deal_execution(uuid) from public, anon;
grant execute on function public.deal_execution(uuid) to authenticated, service_role;

-- 2) conflito de exclusividade ------------------------------------------------------------------------------------
-- termos aceitos pelo talento, com exclusividade vigente, de outro negócio/marca, que pegam o negócio p_deal
create or replace function public.exclusivity_conflicts(p_talent uuid, p_deal uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with cur as (
    select d.id, d.brand_id, d.segment_ids, lower(public.f_unaccent(btrim(b.name))) as brand_key
    from public.deals d join public.brands b on b.id = d.brand_id where d.id = p_deal
  ), acc as (
    select distinct on (m.deal_id) m.id as terms_id, m.deal_id, m.exclusivity_months, m.exclusivity_category, m.competitor_brands,
      case when cardinality(m.exclusivity_segment_ids) > 0 then m.exclusivity_segment_ids else od.segment_ids end as segs,
      od.title as deal_title, ob.name as brand_name, od.brand_id,
      (coalesce(od.expected_end, a.accepted_at::date) + make_interval(months => m.exclusivity_months))::date as until
    from public.deal_acceptances a
    join public.deal_terms m on m.id = a.terms_id
    join public.deals od on od.id = a.deal_id
    join public.brands ob on ob.id = od.brand_id
    where a.party = 'talent' and a.talent_id = p_talent and m.exclusive and m.status in ('sent', 'accepted')
      and od.id <> p_deal and not (od.stage = 'closed' and od.outcome in ('lost', 'cancelled'))
    order by m.deal_id, m.version desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('deal_id', acc.deal_id, 'deal_title', acc.deal_title, 'brand_name', acc.brand_name, 'until', acc.until,
      'category', acc.exclusivity_category,
      'segments', (select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb) from public.talent_segments s where s.id = any (acc.segs) and s.id = any (cur.segment_ids)),
      'competitor', exists (select 1 from unnest(acc.competitor_brands) c where lower(public.f_unaccent(btrim(c))) = cur.brand_key))
    order by acc.until), '[]'::jsonb)
  from acc, cur
  where acc.brand_id <> cur.brand_id and acc.until >= current_date
    and (acc.segs && cur.segment_ids or exists (select 1 from unnest(acc.competitor_brands) c where lower(public.f_unaccent(btrim(c))) = cur.brand_key))
$$;
revoke execute on function public.exclusivity_conflicts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.exclusivity_conflicts(uuid, uuid) to service_role;

-- consulta (0066) + confirmação do conflito de exclusividade (registrada em activities)
-- (a assinatura pública de 0066 não muda: um parâmetro a mais com default criaria uma sobrecarga ambígua se a 0066
-- fosse reaplicada; a confirmação é uma RPC irmã, e as duas chamam o mesmo corpo interno)
drop function if exists public.agency_consult_talents(uuid, uuid[], timestamptz, text, boolean);
create or replace function public.consult_talents_run(p_deal uuid, p_deal_talent_ids uuid[], p_respond_by timestamptz, p_message text,
  p_confirm_conflicts boolean)
returns int language plpgsql set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; r record; v_count int := 0; v_to uuid; v_label text; v_msg text := btrim(coalesce(p_message, ''));
        v_conflicted text[] := '{}';
begin
  v_agency := public.deal_write_scope(p_deal, false);
  select * into d from public.deals where id = p_deal;
  if public.deal_stage_index(d.stage) >= 8 or d.stage = 'proposal_sent' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if p_respond_by is null or p_respond_by <= now() or p_respond_by > now() + interval '30 days' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_deal_talent_ids is null or cardinality(p_deal_talent_ids) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_deal_talent_ids) x where not exists (select 1 from public.deal_talents dt where dt.id = x and dt.deal_id = p_deal)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.deal_talents dt where dt.id = any (p_deal_talent_ids) and not dt.terms_ready) then
    raise exception 'fee_missing' using errcode = 'P0001';
  end if;
  -- exclusividade vigente que pega este negócio: só segue com a confirmação explícita da agência
  select coalesce(array_agg(t.display_name order by t.display_name), '{}') into v_conflicted
  from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id
  where dt.id = any (p_deal_talent_ids) and dt.status in ('suggested', 'declined')
    and jsonb_array_length(public.exclusivity_conflicts(dt.talent_id, p_deal)) > 0;
  if cardinality(v_conflicted) > 0 and not coalesce(p_confirm_conflicts, false) then
    raise exception 'exclusivity_conflict' using errcode = 'P0001';
  end if;
  v_label := public.actor_label(v_agency);
  for r in select dt.* from public.deal_talents dt where dt.id = any (p_deal_talent_ids) and dt.status in ('suggested', 'declined') loop
    update public.deal_talents set status = 'consulted', consulted_by = auth.uid(), consulted_at = now(), respond_by = p_respond_by,
      responded_at = null, response_note = '', response_channel = null where id = r.id;
    if v_msg <> '' then
      insert into public.deal_messages (agency_id, brand_id, deal_id, channel, talent_id, author_id, author_side, author_label, body)
      values (v_agency, d.brand_id, p_deal, 'talent_agency', r.talent_id, auth.uid(), 'agency', v_label, v_msg);
    end if;
    v_to := public.talent_user_id(r.talent_id);
    perform public.inbox_notify(v_to, 'opportunity_received', '/creator/escritorio/oportunidades/' || r.id::text,
      jsonb_build_object('deal', d.title, 'brand', (select b.name from public.brands b where b.id = d.brand_id), 'date', to_char(p_respond_by, 'YYYY-MM-DD')),
      v_agency, 'deal_talent', r.id, 'consult:' || r.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if cardinality(v_conflicted) > 0 then
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
    values (v_agency, 'deal', p_deal, 'system', left('exclusivity_confirmed|' || array_to_string(v_conflicted, ', '), 4000), auth.uid(), v_label);
  end if;
  if public.deal_stage_index(d.stage) < 4 then update public.deals set stage = 'consultation', stage_changed_at = now() where id = p_deal; end if;
  perform public.audit_log('deal.consult', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', v_agency, 'count', v_count, 'respond_by', p_respond_by, 'exclusivity_confirmed', cardinality(v_conflicted) > 0), null,
    public.talent_audit_actor('agency', v_agency));
  return v_count;
end $$;
revoke execute on function public.consult_talents_run(uuid, uuid[], timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function public.consult_talents_run(uuid, uuid[], timestamptz, text, boolean) to service_role;

-- consulta: recusa com exclusivity_conflict se algum creator tem exclusividade vigente que pega o negócio
create or replace function public.agency_consult_talents(p_deal uuid, p_deal_talent_ids uuid[], p_respond_by timestamptz, p_message text default null)
returns int language sql security definer set search_path = '' as $$
  select public.consult_talents_run(p_deal, p_deal_talent_ids, p_respond_by, p_message, false)
$$;
-- consulta "mesmo assim": a agência confirmou o alerta; fica registrado em activities
create or replace function public.agency_consult_talents_confirmed(p_deal uuid, p_deal_talent_ids uuid[], p_respond_by timestamptz, p_message text default null)
returns int language sql security definer set search_path = '' as $$
  select public.consult_talents_run(p_deal, p_deal_talent_ids, p_respond_by, p_message, true)
$$;

-- 3) contraproposta do creator ------------------------------------------------------------------------------------
create table if not exists public.deal_counteroffers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_counteroffers_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_counteroffers_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_counteroffers_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint deal_counteroffers_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deal_counteroffers_talent_fk references public.talent_profiles (id) on delete restrict,
  kind text not null,
  fee_cents bigint,
  previous_fee_cents bigint,
  deliverable_id uuid constraint deal_counteroffers_deliverable_fk references public.deliverables (id) on delete set null,
  proposed_date date,
  previous_date date,
  reason text not null default '',
  status text not null default 'open',
  decision_note text not null default '',
  decided_by uuid constraint deal_counteroffers_decided_by_fk references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid constraint deal_counteroffers_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_counteroffers_kind_check check (kind in ('fee', 'date')),
  constraint deal_counteroffers_shape_check check (
    (kind = 'fee' and fee_cents is not null and proposed_date is null and deliverable_id is null and previous_date is null) or
    (kind = 'date' and proposed_date is not null and fee_cents is null and previous_fee_cents is null)),
  constraint deal_counteroffers_fee_check check ((fee_cents is null or fee_cents between 1 and 10000000000) and (previous_fee_cents is null or previous_fee_cents between 0 and 10000000000)),
  constraint deal_counteroffers_status_check check (status in ('open', 'accepted', 'rejected', 'withdrawn')),
  constraint deal_counteroffers_decided_check check ((status in ('accepted', 'rejected')) = (decided_at is not null)),
  constraint deal_counteroffers_texts_check check (char_length(reason) <= 300 and char_length(decision_note) <= 300)
);
create unique index if not exists deal_counteroffers_open_uq on public.deal_counteroffers (deal_talent_id) where status = 'open';
create index if not exists deal_counteroffers_deal_idx on public.deal_counteroffers (deal_id, created_at desc);

revoke all on table public.deal_counteroffers from public, anon, authenticated;
grant select on table public.deal_counteroffers to authenticated;
grant all on table public.deal_counteroffers to service_role;
alter table public.deal_counteroffers enable row level security;
drop trigger if exists trg_deal_counteroffers_updated on public.deal_counteroffers;
create trigger trg_deal_counteroffers_updated before update on public.deal_counteroffers for each row execute function public.set_updated_at();
drop trigger if exists trg_deal_counteroffers_scope on public.deal_counteroffers;
create trigger trg_deal_counteroffers_scope before insert or update on public.deal_counteroffers for each row execute function public.fill_deal_scope('with_brand', 'with_talent');

-- leitura: admin geral; Adm da agência tudo; gestor+ (ou colaborador do negócio) só as de data; creator só as dele
drop policy if exists deal_counteroffers_select_admin on public.deal_counteroffers;
create policy deal_counteroffers_select_admin on public.deal_counteroffers for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists deal_counteroffers_select_agency on public.deal_counteroffers;
create policy deal_counteroffers_select_agency on public.deal_counteroffers for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[])
         or (kind = 'date' and (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]))));
drop policy if exists deal_counteroffers_select_talent on public.deal_counteroffers;
create policy deal_counteroffers_select_talent on public.deal_counteroffers for select to authenticated
  using (deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]));

-- data de referência de um entregável (publicação, senão prazo) no fuso da agência
create or replace function public.deliverable_ref_date(p_deliverable uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (coalesce(x.publish_at, x.due_at) at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date
  from public.deliverables x join public.agencies a on a.id = x.agency_id where x.id = p_deliverable
$$;
revoke execute on function public.deliverable_ref_date(uuid) from public, anon, authenticated;
grant execute on function public.deliverable_ref_date(uuid) to service_role;

-- o que o creator pode propor agora (valor: antes da aprovação; data: antes da produção)
create or replace function public.counteroffer_allowed(p_deal_talent uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select dt.consulted_at is not null and d.stage <> 'closed'
    and case p_kind
          when 'fee' then dt.status in ('consulted', 'talk_requested', 'interested') and public.deal_stage_index(d.stage) < 8
          when 'date' then dt.status in ('consulted', 'talk_requested', 'interested', 'proposed') and public.deal_stage_index(d.stage) < 10
          else false end
    from public.deal_talents dt join public.deals d on d.id = dt.deal_id where dt.id = p_deal_talent), false)
$$;
revoke execute on function public.counteroffer_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.counteroffer_allowed(uuid, text) to service_role;

create or replace function public.talent_counteroffer_create(p_deal_talent uuid, p_kind text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; d public.deals%rowtype; v_id uuid; v_reason text; v_fee bigint; v_prev_fee bigint; v_date date; v_prev date;
        v_deliv uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into dt from public.deal_talents where id = p_deal_talent for update;
  if dt.id is null or dt.talent_id is distinct from public.my_talent_id() or dt.consulted_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind not in ('fee', 'date') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = dt.deal_id;
  if d.stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if not public.counteroffer_allowed(dt.id, p_kind) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.deal_counteroffers c where c.deal_talent_id = dt.id and c.status = 'open') then raise exception 'counteroffer_open' using errcode = 'P0001'; end if;
  v_reason := btrim(coalesce(p_data ->> 'reason', ''));
  if char_length(v_reason) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    if p_kind = 'fee' then
      v_fee := (p_data ->> 'fee_cents')::bigint;
      if v_fee is null or v_fee < 1 or v_fee > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
      -- valor pede justificativa curta
      if char_length(v_reason) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
      select f.fee_cents into v_prev_fee from public.deal_talent_fees f where f.deal_talent_id = dt.id;
      if v_prev_fee is not null and v_prev_fee = v_fee then raise exception 'invalid_input' using errcode = '22023'; end if;
    else
      v_date := (p_data ->> 'proposed_date')::date;
      if v_date is null or v_date < current_date or v_date > current_date + 365 then raise exception 'invalid_input' using errcode = '22023'; end if;
      v_deliv := nullif(p_data ->> 'deliverable_id', '')::uuid;
      if v_deliv is not null then
        if not exists (select 1 from public.deliverables x where x.id = v_deliv and x.deal_talent_id = dt.id and x.status in ('planned', 'in_production')) then
          raise exception 'not_found' using errcode = 'P0002';
        end if;
        v_prev := public.deliverable_ref_date(v_deliv);
      else
        v_prev := d.expected_start;
      end if;
      if v_prev is not null and v_prev = v_date then raise exception 'invalid_input' using errcode = '22023'; end if;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch or invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_input' using errcode = '22023';
  end;
  insert into public.deal_counteroffers (agency_id, brand_id, deal_id, deal_talent_id, talent_id, kind, fee_cents, previous_fee_cents, deliverable_id, proposed_date, previous_date, reason, created_by)
  values (dt.agency_id, d.brand_id, d.id, dt.id, dt.talent_id, p_kind, v_fee, v_prev_fee, v_deliv, v_date, v_prev, v_reason, auth.uid())
  returning id into v_id;
  select t.display_name into v_name from public.talent_profiles t where t.id = dt.talent_id;
  -- auditoria e aviso sem o número (D16)
  perform public.audit_log('counteroffer.create', 'deal_talent', dt.id::text, null, jsonb_build_object('agency_id', dt.agency_id, 'kind', p_kind, 'counteroffer_id', v_id),
    nullif(v_reason, ''), 'creator'::public.actor_type);
  perform public.inbox_notify_agency(dt.agency_id, case when p_kind = 'fee' then 'admin' else 'manager' end, 'opportunity_answered', '/agencia/negocios/' || d.id::text || '/creators',
    jsonb_build_object('deal', d.title, 'talent', v_name, 'status', 'counter_' || p_kind), 'deal_talent', dt.id, 'counter:' || v_id::text);
  -- data: o responsável pelo negócio também fica sabendo (mesmo colaborador, que não decide)
  if p_kind = 'date' and d.owner_id is not null
     and exists (select 1 from public.agency_members m where m.agency_id = d.agency_id and m.user_id = d.owner_id and m.revoked_at is null) then
    perform public.inbox_notify(d.owner_id, 'opportunity_answered', '/agencia/negocios/' || d.id::text || '/creators',
      jsonb_build_object('deal', d.title, 'talent', v_name, 'status', 'counter_date'), d.agency_id, 'deal_talent', dt.id, 'counter:' || v_id::text || ':owner');
  end if;
  return v_id;
end $$;

create or replace function public.talent_counteroffer_withdraw(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.deal_counteroffers%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.deal_counteroffers where id = p_id for update;
  if c.id is null or c.talent_id is distinct from public.my_talent_id() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.deal_counteroffers set status = 'withdrawn' where id = p_id;
  perform public.audit_log('counteroffer.withdraw', 'deal_talent', c.deal_talent_id::text, null, jsonb_build_object('agency_id', c.agency_id, 'kind', c.kind, 'counteroffer_id', p_id),
    null, 'creator'::public.actor_type);
end $$;

-- decisão da agência: valor só o Adm; data gestor+. Aceitar aplica (cachê ou cronograma); recusar exige nota.
create or replace function public.agency_counteroffer_decide(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.deal_counteroffers%rowtype; dt public.deal_talents%rowtype; d public.deals%rowtype; v_agency uuid; v_note text := btrim(coalesce(p_note, ''));
        v_delta int; v_tz text; v_name text; v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.deal_counteroffers where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(c.deal_id, false);
  if c.kind = 'fee' and not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('accepted', 'rejected') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if c.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'rejected' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into dt from public.deal_talents where id = c.deal_talent_id for update;
  select * into d from public.deals where id = c.deal_id;
  select t.display_name into v_name from public.talent_profiles t where t.id = c.talent_id;
  if p_decision = 'accepted' then
    if dt.status in ('declined', 'removed') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if c.kind = 'fee' then
      if public.deal_stage_index(d.stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
      insert into public.deal_talent_fees (agency_id, deal_id, deal_talent_id, talent_id, fee_cents, set_by, set_at)
      values (dt.agency_id, dt.deal_id, dt.id, dt.talent_id, c.fee_cents, auth.uid(), now())
      on conflict (deal_talent_id) do update set fee_cents = excluded.fee_cents, set_by = excluded.set_by, set_at = now();
      -- propor um valor é "aceito por esse valor": quem ainda não tinha respondido fica com interesse registrado
      if dt.status in ('consulted', 'talk_requested') then
        update public.deal_talents set terms_ready = true, status = 'interested', responded_at = now(), response_channel = 'app',
          response_note = left(c.reason, 500) where id = dt.id;
      else
        update public.deal_talents set terms_ready = true where id = dt.id;
      end if;
    else
      if public.deal_stage_index(d.stage) >= 10 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
      if c.deliverable_id is not null then
        select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = c.agency_id;
        v_delta := c.proposed_date - coalesce(public.deliverable_ref_date(c.deliverable_id), c.proposed_date);
        update public.deliverables x set
          due_at = case when x.due_at is null and x.publish_at is null then ((c.proposed_date::text || ' 18:00')::timestamp at time zone v_tz)
                        else x.due_at + make_interval(days => v_delta) end,
          publish_at = case when x.publish_at is null then null else x.publish_at + make_interval(days => v_delta) end
        where x.id = c.deliverable_id and x.status in ('planned', 'in_production');
      end if;
    end if;
  end if;
  update public.deal_counteroffers set status = p_decision, decision_note = v_note, decided_by = auth.uid(), decided_at = now() where id = p_id;
  v_label := public.actor_label(v_agency);
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', c.deal_id, 'system', left('counteroffer_' || c.kind || '_' || p_decision || '|' || coalesce(v_name, ''), 4000), auth.uid(), v_label);
  perform public.audit_log('counteroffer.decide', 'deal_talent', c.deal_talent_id::text, jsonb_build_object('agency_id', v_agency, 'status', 'open'),
    jsonb_build_object('agency_id', v_agency, 'status', p_decision, 'kind', c.kind, 'counteroffer_id', p_id), nullif(v_note, ''), public.talent_audit_actor('agency', v_agency));
  perform public.inbox_notify(public.talent_user_id(c.talent_id), 'opportunity_updated', '/creator/escritorio/oportunidades/' || c.deal_talent_id::text,
    jsonb_build_object('deal', d.title, 'status', 'counter_' || p_decision), v_agency, 'deal_talent', c.deal_talent_id, 'counter:' || p_id::text || ':' || p_decision);
end $$;

-- 4) leituras da oferta -------------------------------------------------------------------------------------------
-- creator: histórico das contrapropostas dele (com o valor dele), conflitos e o que pode propor agora
create or replace function public.talent_offer_state(p_deal_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into dt from public.deal_talents where id = p_deal_talent;
  if dt.id is null or dt.talent_id is distinct from public.my_talent_id() or dt.consulted_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'counteroffers', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'fee_cents', c.fee_cents, 'previous_fee_cents', c.previous_fee_cents,
        'deliverable_id', c.deliverable_id, 'proposed_date', c.proposed_date, 'previous_date', c.previous_date, 'reason', c.reason, 'status', c.status,
        'decision_note', c.decision_note, 'decided_at', c.decided_at, 'created_at', c.created_at) order by c.created_at desc), '[]'::jsonb)
      from public.deal_counteroffers c where c.deal_talent_id = dt.id),
    'conflicts', case when dt.status in ('removed', 'declined') then '[]'::jsonb else public.exclusivity_conflicts(dt.talent_id, dt.deal_id) end,
    'can_fee', public.counteroffer_allowed(dt.id, 'fee'),
    'can_date', public.counteroffer_allowed(dt.id, 'date'),
    -- datas da contraproposta são dias no fuso da agência (o mesmo de deliverable_ref_date)
    'timezone', (select coalesce(a.timezone, 'America/Sao_Paulo') from public.agencies a where a.id = dt.agency_id));
end $$;

-- agência: contrapropostas do negócio (valor só para o Adm) e conflitos dos creators do negócio e dos candidatos
create or replace function public.agency_offer_state(p_deal uuid, p_talent_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null or not (public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids())) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_talent_ids is not null and cardinality(p_talent_ids) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_admin := public.agency_can(d.agency_id, 'admin');
  return jsonb_build_object(
    'counteroffers', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'deal_talent_id', c.deal_talent_id, 'kind', c.kind,
        'fee_cents', case when v_admin then c.fee_cents end, 'previous_fee_cents', case when v_admin then c.previous_fee_cents end,
        'deliverable_id', c.deliverable_id, 'deliverable_title', (select coalesce(nullif(x.title, ''), x.kind) from public.deliverables x where x.id = c.deliverable_id),
        'proposed_date', c.proposed_date, 'previous_date', c.previous_date, 'reason', c.reason, 'status', c.status, 'decision_note', c.decision_note,
        'decided_at', c.decided_at, 'created_at', c.created_at) order by c.created_at desc), '[]'::jsonb)
      from public.deal_counteroffers c where c.deal_id = p_deal),
    'conflicts', (select coalesce(jsonb_agg(jsonb_build_object('talent_id', x.talent_id, 'items', x.items)), '[]'::jsonb)
      from (select t.id as talent_id, public.exclusivity_conflicts(t.id, p_deal) as items
            from public.talent_profiles t
            where t.agency_id = d.agency_id
              and (t.id in (select dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status not in ('removed', 'declined'))
                   or t.id = any (coalesce(p_talent_ids, '{}'::uuid[])))) x
      where jsonb_array_length(x.items) > 0),
    'can_decide_fee', v_admin,
    'can_decide_date', public.agency_can(d.agency_id, 'manager'));
end $$;

-- 5) "Hoje" do creator (0078) + situação da contraproposta em cada consulta pendente ------------------------------
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
    -- consultas aguardando a resposta dele (com a última contraproposta: aberta, aceita ou recusada)
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
        and not exists (select 1 from public.deal_acceptances a where a.terms_id = m.id and a.party = 'talent' and a.deal_talent_id = dt.id)));
end $$;

-- 6) execução das RPCs de usuário (nenhuma para anon) ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.talent_counteroffer_create(uuid, text, jsonb)', 'public.talent_counteroffer_withdraw(uuid)',
                           'public.agency_counteroffer_decide(uuid, text, text)', 'public.talent_offer_state(uuid)',
                           'public.agency_offer_state(uuid, uuid[])', 'public.talent_today()',
                           'public.agency_consult_talents(uuid, uuid[], timestamptz, text)', 'public.agency_consult_talents_confirmed(uuid, uuid[], timestamptz, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
