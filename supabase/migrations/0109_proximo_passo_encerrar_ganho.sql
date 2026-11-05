-- =============================================================================
-- Groscove Ultra · 0109 · "Próximo passo" e encerrar como ganho sem trabalho fantasma · cenário S115
-- Pedido do responsável (04/11): a marca viu em "Ações por etapa" o "Post mm" em "Em criação" enquanto o "Hoje" do
-- Hero dizia "Nada pendente": a agência encerrou o negócio como ganho à força com os termos em rascunho, contrato
-- não confirmado e a entrega ainda planejada. "Tem que ter como resolver fácil". Idempotente; nada de drop de
-- tabela/coluna; search_path fixo; nenhuma função nova (S14 segue 18). Só recria duas funções que já existiam.
--
-- Decisões (sem perguntar ao responsável):
--   • D1 Encerrar como ganho SEM pendência: basta o negócio estar contratado (produção, aprovação ou entrega — antes
--     só "entrega") e todas as entregas concluídas/canceladas. Assim o botão "Encerrar como ganha" do Próximo passo é
--     uma chamada só (o gestor não precisa mover para "Entrega" antes).
--   • D2 Encerrar como ganho COM pendência (não contratado ou entrega em aberto) continua só para o Adm com p_force,
--     agora com MOTIVO obrigatório (≥ 5 caracteres) e, na mesma transação, cancela as entregas em aberto e as tarefas
--     abertas do Hero e da marca do negócio. Nenhum portal fica mostrando trabalho que não vai acontecer.
--   • D3 Encerrar como perdido/cancelado também cancela entregas e tarefas abertas do Hero e da marca (antes elas
--     ficavam "planejadas" para sempre na lista de tarefas do Hero). Tarefas internas da agência ficam como estão
--     (relatório/encerramento seguem com a equipe).
--   • D4 Reabrir não "descancela" nada: a agência recria ou reabre as entregas pela aba Entregas, se for o caso.
--   • D5 Linha do tempo: atividade de sistema "close_cancelled|N" quando algo foi cancelado; auditoria leva a contagem.
--   • D6 "Hoje" do Hero (talent_today) passa a trazer também a entrega PUBLICADA (falta o comprovante), que o
--     Próximo passo pede ao Hero; o resto da leitura fica igual à 0082.
-- =============================================================================

create or replace function public.agency_deal_move(p_deal uuid, p_to text, p_outcome text default null, p_note text default null, p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_role text; v_owner boolean; v_note text := btrim(coalesce(p_note, '')); v_prev text;
  v_open int := 0; v_contracted boolean; v_forced boolean := false; v_cancelled int := 0; v_tasks int := 0;
begin
  v_agency := public.deal_write_scope(p_deal, true, false);
  select * into d from public.deals where id = p_deal for update;
  v_role := coalesce(public.agency_role_of(v_agency), case when public.is_platform_admin() then 'admin' end);
  v_owner := d.owner_id = auth.uid() or exists (select 1 from public.deal_team t where t.deal_id = p_deal and t.user_id = auth.uid());
  if p_to = 'closed' then
    if p_outcome not in ('won', 'lost', 'cancelled') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if d.stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
    if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    select count(*) into v_open from public.deliverables x where x.deal_id = p_deal and x.status not in ('done', 'cancelled');
    if p_outcome = 'won' then
      -- D1/D2: contratado (10..12) e sem entrega aberta encerra direto; o resto só o Adm, com motivo
      v_contracted := public.deal_stage_index(d.stage) between 10 and 12;
      v_forced := not v_contracted or v_open > 0;
      if v_forced then
        if not (coalesce(p_force, false) and public.agency_can(v_agency, 'admin')) then
          if not v_contracted then raise exception 'stage_gate' using errcode = 'P0001'; end if;
          raise exception 'deliverables_open' using errcode = 'P0001';
        end if;
        if char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
      end if;
    else
      if char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
      if public.deal_stage_index(d.stage) >= 10 and not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
    end if;
    update public.deals set stage = 'closed', outcome = p_outcome, stage_changed_at = now(), closed_at = now() where id = p_deal;
    -- D2/D3: nada de trabalho fantasma nos portais da marca e do Hero
    if p_outcome <> 'won' or v_forced then
      update public.deliverables set status = 'cancelled' where deal_id = p_deal and status not in ('done', 'cancelled');
      get diagnostics v_cancelled = row_count;
      update public.tasks set status = 'cancelled' where deal_id = p_deal and side in ('talent', 'brand') and status in ('todo', 'doing', 'blocked');
      get diagnostics v_tasks = row_count;
    end if;
  elsif d.stage = 'closed' then
    -- reabrir: só o Adm, com nota; volta para a etapa informada (antes de fechar)
    if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
    if public.deal_stage_index(p_to) is null or p_to in ('proposal_sent', 'production') then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.deals set stage = p_to, outcome = null, stage_changed_at = now(), closed_at = null where id = p_deal;
  else
    if not public.deal_stage_can(v_role, v_owner, d.stage, p_to) then
      if p_to in ('proposal_sent', 'approved', 'production') then raise exception 'stage_gate' using errcode = 'P0001'; end if;
      if public.deal_stage_index(p_to) is null then raise exception 'invalid_input' using errcode = '22023'; end if;
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if public.deal_stage_index(p_to) < public.deal_stage_index(d.stage) and char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
    update public.deals set stage = p_to, stage_changed_at = now() where id = p_deal;
  end if;
  v_prev := d.stage;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', p_deal, 'stage_change', v_note, auth.uid(), public.actor_label(v_agency));
  if v_cancelled > 0 then
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
    values (v_agency, 'deal', p_deal, 'system', 'close_cancelled|' || v_cancelled::text, auth.uid(), public.actor_label(v_agency));
  end if;
  perform public.audit_log('deal.stage', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'stage', v_prev, 'outcome', d.outcome),
    jsonb_build_object('agency_id', v_agency, 'stage', p_to, 'outcome', p_outcome, 'forced', v_forced, 'deliverables_cancelled', v_cancelled, 'tasks_cancelled', v_tasks),
    nullif(v_note, ''), public.talent_audit_actor('agency', v_agency));
  if d.brand_visible and public.deal_brand_status(v_prev, d.outcome) is distinct from public.deal_brand_status(p_to, p_outcome) then
    perform public.inbox_notify_brand(d.brand_id, false, 'campaign_status_changed', '/marca/campanhas/' || d.request_id::text,
      jsonb_build_object('deal', d.title, 'status', public.deal_brand_status(p_to, p_outcome)), v_agency, 'deal', p_deal,
      'status:' || p_deal::text || ':' || public.deal_brand_status(p_to, p_outcome));
  end if;
end $$;
revoke execute on function public.agency_deal_move(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.agency_deal_move(uuid, text, text, text, boolean) to authenticated, service_role;

-- D6: "Hoje" do Hero — igual à 0082, com a entrega publicada (falta o comprovante)
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
        and x.status in ('planned', 'in_production', 'changes_requested', 'approved', 'published')),
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
