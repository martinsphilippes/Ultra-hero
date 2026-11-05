-- =============================================================================
-- Groscove Ultra · 0121 · "Mostrar para a marca": a agência escolhe quando a marca passa a ver o negócio · cenário S123
-- Pedido do responsável: negócio aberto pela agência no Pipeline nasce oculto da marca (deals.brand_visible = false,
-- 0066/0107) e só aparecia para ela na confirmação da campanha (agency_deal_confirm). Em produção havia negócios da
-- marca "Marca" invisíveis para ela. Agora a agência tem um botão "Mostrar para a marca" na ficha do negócio.
-- Idempotente; nada de drop de tabela/coluna; search_path fixo; uma função nova, revogada do visitante (S14 segue 18).
--
-- Decisões (sem perguntar ao responsável):
--   • D1 Quem pode: o mesmo critério das outras ações do negócio (deal_write_scope com p_owner_ok): gestor+ da
--     agência ou o colaborador responsável/da equipe do negócio. Colaborador fora do negócio e outra agência → not_found
--     /forbidden. Negócio encerrado não muda (invalid_stage).
--   • D2 Exige marca (brand_id): negócio só do herói-cliente (0107) não tem a quem mostrar → brand_required. Exige
--     também o pedido de campanha (request_id): é por ele que a marca navega (/marca/campanhas/<pedido>).
--   • D3 Ocultar de novo só antes da confirmação (etapa antes de "aprovado" e sem confirmed_at); depois de confirmado
--     o negócio fica sempre visível (already_confirmed). Proposta que a própria marca abriu (origem "brand") nunca é
--     ocultada (invalid_state): foi ela que pediu.
--   • D4 Pedir o estado que já está vale como sucesso (não grava nada de novo, não avisa de novo).
--   • D5 Histórico do negócio: atividade de sistema "brand_shown" / "brand_hidden" (o app traduz: "Visível para a
--     marca" / "Oculto da marca"); audit_log 'deal.brand_visible' com antes/depois.
--   • D6 Ao mostrar, a marca é avisada no inbox com o kind existente campaign_status_changed (status 'shared'), link
--     /marca/campanhas/<pedido>. Nenhum kind novo. Dedupe por negócio: mostrar, ocultar e mostrar de novo não repete o
--     aviso.
--   • D7 O que a marca enxerga não muda de regra: tudo continua pelas leituras fechadas (brand_campaign_detail,
--     brand_workboard, brand_campaigns...). Antes da confirmação ela vê título, briefing, período e situação; não vê
--     cachês, comissão, taxa, orçamento interno, notas internas do pedido da agência, heróis (só propostos/contratados
--     a partir da proposta enviada) nem a conversa herói↔agência (canal talent_agency).
-- =============================================================================

create or replace function public.agency_deal_set_brand_visible(p_deal uuid, p_visible boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_origin text;
begin
  if p_deal is null or p_visible is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- not_found (sem acesso), forbidden (colaborador fora do negócio), invalid_stage (encerrado)
  v_agency := public.deal_write_scope(p_deal, true, true);
  select * into d from public.deals where id = p_deal for update;
  if d.brand_id is null then raise exception 'brand_required' using errcode = 'P0001'; end if;
  if d.request_id is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if d.brand_visible = p_visible then return d.brand_visible; end if;
  if not p_visible then
    if d.confirmed_at is not null or public.deal_stage_index(d.stage) >= 8 then raise exception 'already_confirmed' using errcode = 'P0001'; end if;
    select r.origin into v_origin from public.campaign_requests r where r.id = d.request_id;
    if v_origin = 'brand' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  end if;
  update public.deals set brand_visible = p_visible where id = p_deal;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (v_agency, 'deal', p_deal, 'system', case when p_visible then 'brand_shown' else 'brand_hidden' end, auth.uid(), public.actor_label(v_agency));
  perform public.audit_log('deal.brand_visible', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'brand_visible', d.brand_visible),
    jsonb_build_object('agency_id', v_agency, 'brand_visible', p_visible, 'stage', d.stage), null, public.talent_audit_actor('agency', v_agency));
  if p_visible then
    perform public.inbox_notify_brand(d.brand_id, false, 'campaign_status_changed', '/marca/campanhas/' || d.request_id::text,
      jsonb_build_object('deal', d.title, 'status', 'shared'), v_agency, 'deal', p_deal, 'shown:' || p_deal::text);
  end if;
  return p_visible;
end $$;
revoke execute on function public.agency_deal_set_brand_visible(uuid, boolean) from public, anon;
grant execute on function public.agency_deal_set_brand_visible(uuid, boolean) to authenticated, service_role;
