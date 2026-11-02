-- =============================================================================
-- Groscove Ultra · 0078 · Gestão: "Hoje" (o que depende de mim) e painel de ações por etapa
-- Bloco 1. Cenário S85. Idempotente; nenhuma tabela nova, nenhuma coluna de valor; S14 segue igual (nada para anon).
--
-- Duas leituras fechadas (security definer, só leitura), com a MESMA regra de acesso que já existe:
--   • brand_workboard(p_brand): membro da marca (brand_member_of, que exige o vínculo ativo com a agência) ou
--     admin da plataforma (só lê). Devolve campanhas, creators e entregáveis que a marca já enxerga (a mesma
--     regra de my_brand_deal_talent_ids: negócio visível à marca, creator proposto/contratado, a partir da
--     proposta enviada), aprovações de roteiro (passo 5 com anexo, como em brand_dashboard), termos enviados sem
--     o aceite da marca, conversas com a agência cuja última mensagem é da agência e os rascunhos da marca.
--     Nada de etapa interna do pipeline (só brand_status, como em brand_campaigns), de notas internas, de
--     orçamento ou de cachê.
--   • talent_today(): o creator logado (my_talent_id). Tarefas do lado talento dele (mesma regra de
--     tasks_select_talent), consultas pendentes com prazo de resposta, entregáveis dele nos negócios em execução,
--     termos enviados sem o aceite dele. Nunca valores.
-- A classificação por etapa e a urgência (hoje, atrasado, próximos 3 dias) são lógica pura em
-- src/lib/today (testada com vitest): o banco devolve os fatos, o app decide a ordem. Assim o fuso (o da
-- agência, como em talent_office_summary) e os limites ficam num lugar só e testável.
-- O escopo é calculado por p_brand (e não por my_brand_deal_talent_ids) para que o admin da plataforma, que só
-- lê, veja o mesmo painel; para o membro da marca as duas regras dão o mesmo conjunto.
-- =============================================================================

create or replace function public.brand_workboard(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_deals uuid[]; v_dt uuid[]; v_tz text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- negócios que a marca enxerga (com pedido: é por ele que a marca navega até a campanha)
  select coalesce(array_agg(d.id), '{}'::uuid[]) into v_deals from public.deals d
  where d.brand_id = p_brand and d.brand_visible and d.request_id is not null;
  -- creators que a marca conhece: propostos/contratados a partir da proposta enviada (= my_brand_deal_talent_ids)
  select coalesce(array_agg(dt.id), '{}'::uuid[]) into v_dt from public.deal_talents dt join public.deals d on d.id = dt.deal_id
  where d.id = any (v_deals) and dt.status in ('proposed', 'contracted')
    and d.stage in ('proposal_sent', 'negotiation', 'approved', 'contracting', 'production', 'approval', 'delivery', 'closed');
  select a.timezone into v_tz from public.agencies a where a.id = public.brand_active_agency(p_brand);

  return jsonb_build_object(
    'role', v_role,
    'timezone', coalesce(v_tz, 'America/Sao_Paulo'),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object(
        'request_id', r.id, 'title', r.title, 'request_status', r.status, 'origin', r.origin,
        'brand_status', case when d.id is null then case when r.status = 'cancelled' then 'cancelled' else 'draft' end else public.deal_brand_status(d.stage, d.outcome) end,
        'deal_title', d.title, 'submitted_at', r.submitted_at, 'updated_at', r.updated_at,
        'requested_talent_name', (select t.display_name from public.talent_profiles t where t.id = r.talent_id),
        'requested_count', (select coalesce(sum((e ->> 'quantity')::int), 0) from jsonb_array_elements(r.deliverables) e))
      order by r.updated_at desc), '[]'::jsonb)
      from public.campaign_requests r
      left join public.deals d on d.request_id = r.id
      where r.brand_id = p_brand and (r.origin = 'brand' or d.id = any (v_deals))),
    'talents', (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', dt.id, 'request_id', d.request_id, 'talent_name', t.display_name, 'status', dt.status)
        order by dt.created_at), '[]'::jsonb)
      from public.deal_talents dt join public.deals d on d.id = dt.deal_id join public.talent_profiles t on t.id = dt.talent_id
      where dt.id = any (v_dt)),
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'deal_talent_id', x.deal_talent_id, 'request_id', d.request_id, 'kind', x.kind,
        'network', x.network, 'title', x.title, 'status', x.status, 'due_at', x.due_at, 'publish_at', x.publish_at, 'submitted_at', x.submitted_at,
        'talent_name', t.display_name) order by x.due_at nulls last, x.created_at), '[]'::jsonb)
      from public.deliverables x join public.deals d on d.id = x.deal_id join public.talent_profiles t on t.id = x.talent_id
      where x.deal_talent_id = any (v_dt) and x.status <> 'cancelled'),
    -- roteiro enviado aguardando a marca (passo 5 aberto com anexo e passo 4 concluído)
    'script_approvals', (select coalesce(jsonb_agg(jsonb_build_object('task_id', k.id, 'request_id', d.request_id, 'deal_title', d.title,
        'talent_name', t.display_name, 'due_at', k.due_at, 'since', k.updated_at) order by k.due_at nulls last), '[]'::jsonb)
      from public.tasks k join public.deals d on d.id = k.deal_id left join public.talent_profiles t on t.id = k.talent_id
      where k.deal_id = any (v_deals) and k.side = 'brand' and k.template_step = 5 and k.status = 'todo' and d.stage <> 'closed'
        and (k.attachment_url is not null or k.attachment_document_id is not null)
        and exists (select 1 from public.tasks s where s.deal_id = k.deal_id and s.talent_id = k.talent_id and s.template_step = 4 and s.status = 'done')),
    -- termos enviados, ainda válidos, sem o aceite da marca (só o dono aceita: o app mostra isso a quem é equipe)
    'terms_pending', (select coalesce(jsonb_agg(jsonb_build_object('terms_id', m.id, 'request_id', d.request_id, 'deal_title', d.title, 'version', m.version,
        'sent_at', m.sent_at, 'valid_until', m.valid_until) order by m.sent_at), '[]'::jsonb)
      from public.deal_terms m join public.deals d on d.id = m.deal_id
      where m.deal_id = any (v_deals) and m.status = 'sent' and m.sent_at is not null and d.stage <> 'closed'
        and (m.valid_until is null or m.valid_until >= current_date)
        and not exists (select 1 from public.deal_acceptances a where a.terms_id = m.id and a.party = 'brand')),
    -- conversa com a agência cuja última mensagem é da agência (a marca ainda não respondeu)
    'threads', (select coalesce(jsonb_agg(jsonb_build_object('deal_id', s.deal_id, 'request_id', s.request_id, 'deal_title', s.title,
        'last_at', s.created_at, 'author_label', s.author_label, 'excerpt', left(s.body, 140)) order by s.created_at), '[]'::jsonb)
      from (select distinct on (mm.deal_id) mm.deal_id, d.request_id, d.title, mm.created_at, mm.author_side, mm.author_label, mm.body
            from public.deal_messages mm join public.deals d on d.id = mm.deal_id
            where mm.channel = 'brand_agency' and mm.deal_id = any (v_deals) and d.stage <> 'closed'
            order by mm.deal_id, mm.created_at desc, mm.id desc) s
      where s.author_side = 'agency'));
end $$;
revoke execute on function public.brand_workboard(uuid) from public, anon;
grant execute on function public.brand_workboard(uuid) to authenticated, service_role;

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
    -- tarefas abertas do lado talento (mesma regra de tasks_select_talent); só as que vencem em até 3 dias ou
    -- o roteiro devolvido com ajuste (o app decide "atrasada" e "hoje")
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'step', k.template_step, 'title', k.title, 'status', k.status, 'due_at', k.due_at,
        'feedback', left(k.feedback, 280), 'deal_id', k.deal_id, 'deal_title', d.title, 'brand_name', b.name,
        'deal_talent_id', (select dt.id from public.deal_talents dt where dt.deal_id = k.deal_id and dt.talent_id = v_t))
      order by k.due_at nulls last), '[]'::jsonb)
      from public.tasks k left join public.deals d on d.id = k.deal_id left join public.brands b on b.id = d.brand_id
      where k.side = 'talent' and k.talent_id = v_t and k.status in ('todo', 'doing', 'blocked')
        and (k.deal_id is null or k.deal_id = any (v_deals)) and (d.id is null or d.stage <> 'closed')
        and ((k.due_at is not null and k.due_at < now() + interval '3 days') or (k.template_step = 4 and k.status = 'todo' and k.feedback <> ''))),
    -- consultas aguardando a resposta dele
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', dt.id, 'status', dt.status, 'respond_by', dt.respond_by, 'consulted_at', dt.consulted_at,
        'deal_title', d.title, 'brand_name', b.name) order by dt.respond_by nulls last), '[]'::jsonb)
      from public.deal_talents dt join public.deals d on d.id = dt.deal_id join public.brands b on b.id = d.brand_id
      where dt.talent_id = v_t and dt.consulted_at is not null and dt.status in ('consulted', 'talk_requested') and d.stage <> 'closed'),
    -- entregáveis dele nos negócios em execução, ainda com algo a fazer do lado dele
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'deal_talent_id', x.deal_talent_id, 'deal_id', x.deal_id, 'kind', x.kind, 'network', x.network,
        'title', x.title, 'status', x.status, 'due_at', x.due_at, 'publish_at', x.publish_at, 'brand_feedback', left(x.brand_feedback, 280),
        'decided_at', x.decided_at, 'deal_title', d.title, 'brand_name', b.name) order by coalesce(x.due_at, x.publish_at) nulls last), '[]'::jsonb)
      from public.deliverables x join public.deals d on d.id = x.deal_id join public.brands b on b.id = d.brand_id
      join public.deal_talents dt on dt.id = x.deal_talent_id
      where x.talent_id = v_t and dt.status in ('proposed', 'contracted') and public.deal_stage_index(d.stage) between 10 and 12
        and x.status in ('planned', 'in_production', 'changes_requested', 'approved')),
    -- termos enviados, válidos, sem o aceite dele (só quem foi confirmado/contratado)
    'terms', (select coalesce(jsonb_agg(jsonb_build_object('terms_id', m.id, 'deal_talent_id', dt.id, 'version', m.version, 'sent_at', m.sent_at, 'valid_until', m.valid_until,
        'deal_title', d.title, 'brand_name', b.name) order by m.sent_at), '[]'::jsonb)
      from public.deal_terms m join public.deals d on d.id = m.deal_id join public.brands b on b.id = d.brand_id
      join public.deal_talents dt on dt.deal_id = m.deal_id and dt.talent_id = v_t and dt.status in ('proposed', 'contracted')
      where m.status = 'sent' and m.sent_at is not null and d.stage <> 'closed' and (m.valid_until is null or m.valid_until >= current_date)
        and not exists (select 1 from public.deal_acceptances a where a.terms_id = m.id and a.party = 'talent' and a.deal_talent_id = dt.id)));
end $$;
revoke execute on function public.talent_today() from public, anon;
grant execute on function public.talent_today() to authenticated, service_role;
