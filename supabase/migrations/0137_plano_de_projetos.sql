-- =============================================================================
-- 0137 — Plano de projetos da Groscove ("25 projetos — ordem oficial e prioridade" + "Plano geral, 5W2H e 30
--   microetapas"). Cada projeto tem número da ordem oficial, nota (0 a 5), prioridade (urgente: proteger e aumentar
--   receita recorrente; importante: dinheiro no curto prazo; estrutural: infraestrutura para crescer; circunstancial:
--   estudar e validar), objetivo final, ficha 5W2H, responsável e apoio (definidos na reunião de distribuição), e o
--   plano de execução em 5 etapas (Estruturação, Planejamento, Preparação, Execução, Conclusão) com 6 microetapas e
--   uma meta de passagem cada.
--   Só a equipe da Groscove vê (is_groscove_member); gestor+ edita a ficha; responsável, apoio e gestor+ marcam as
--   microetapas. O 4WAY não tem plano no PDF: entra no modelo de projeto com parceiro, para ajustar na reunião.
-- =============================================================================

create table if not exists public.group_projects (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint group_projects_agency_fk references public.agencies (id) on delete cascade,
  number int not null constraint group_projects_number_check check (number between 1 and 999),
  name text not null constraint group_projects_name_check check (char_length(name) between 2 and 120),
  category text not null default '' constraint group_projects_category_check check (char_length(category) <= 80),
  score numeric(3, 2) not null default 0 constraint group_projects_score_check check (score between 0 and 5),
  priority text not null constraint group_projects_priority_check check (priority in ('urgent', 'important', 'structural', 'circumstantial')),
  objective text not null default '' constraint group_projects_objective_check check (char_length(objective) <= 1000),
  plan jsonb not null default '{}'::jsonb constraint group_projects_plan_check check (jsonb_typeof(plan) = 'object'),
  stage_goals text[] not null default '{}' constraint group_projects_goals_check check (cardinality(stage_goals) <= 5),
  owner_id uuid,
  support_ids uuid[] not null default '{}' constraint group_projects_support_check check (cardinality(support_ids) <= 10),
  status text not null default 'active' constraint group_projects_status_check check (status in ('active', 'paused', 'done', 'cancelled')),
  due_on date,
  notes text not null default '' constraint group_projects_notes_check check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint group_projects_number_unique unique (agency_id, number)
);

create table if not exists public.group_project_steps (
  project_id uuid not null constraint group_project_steps_project_fk references public.group_projects (id) on delete cascade,
  stage smallint not null constraint group_project_steps_stage_check check (stage between 1 and 5),
  position smallint not null constraint group_project_steps_position_check check (position between 1 and 6),
  title text not null constraint group_project_steps_title_check check (char_length(title) between 2 and 160),
  status text not null default 'todo' constraint group_project_steps_status_check check (status in ('todo', 'doing', 'done')),
  note text not null default '' constraint group_project_steps_note_check check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (project_id, stage, position)
);

do $$
declare t text;
begin
  foreach t in array array['group_projects', 'group_project_steps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- avisos: responsável ou apoio de um projeto -----------------------------------------------------------------------------
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
  'payout_due',
  'hero_account_linked', 'brand_access_granted',
  'agency_access_requested', 'agency_access_decided',
  'casting_access_requested', 'casting_access_decided',
  'brand_approval_requested', 'brand_approval_decided',
  'profile_claim_requested', 'profile_claim_decided',
  'brand_login_requested', 'brand_login_decided',
  'onda_digital_news', 'onda_request_received', 'onda_request_updated',
  'creator_idea_received', 'creator_idea_updated', 'creator_action_answered',
  -- 0137
  'group_project_assigned'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   'access_request',
   'casting_request', 'profile_claim',
   'onda_request',
   'creator_idea',
   -- 0137
   'group_project'));

-- quem pode ------------------------------------------------------------------------------------------------------------------
create or replace function public.group_project_can_edit()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or (public.groscove_agency_id() is not null and public.agency_can(public.groscove_agency_id(), 'manager'))
$$;
revoke execute on function public.group_project_can_edit() from public, anon;
grant execute on function public.group_project_can_edit() to authenticated, service_role;

-- membros da Groscove (para responsável e apoio)
create or replace function public.group_project_members()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(btrim(m.display_name), ''), u.email), 'role', m.role)
      order by coalesce(nullif(btrim(m.display_name), ''), u.email))
    from public.agency_members m join auth.users u on u.id = m.user_id
    where m.agency_id = public.groscove_agency_id() and m.revoked_at is null), '[]'::jsonb);
end $$;
revoke execute on function public.group_project_members() from public, anon;
grant execute on function public.group_project_members() to authenticated, service_role;

-- lista na ordem oficial, com o progresso de cada projeto
create or replace function public.group_projects_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'number', p.number, 'name', p.name, 'category', p.category, 'score', p.score, 'priority', p.priority,
      'status', p.status, 'due_on', p.due_on, 'owner_id', p.owner_id, 'support_ids', to_jsonb(p.support_ids),
      'owner', (select coalesce(nullif(btrim(m.display_name), ''), u.email) from public.agency_members m join auth.users u on u.id = m.user_id
                where m.agency_id = p.agency_id and m.user_id = p.owner_id and m.revoked_at is null),
      'done', (select count(*) from public.group_project_steps s where s.project_id = p.id and s.status = 'done'),
      'doing', (select count(*) from public.group_project_steps s where s.project_id = p.id and s.status = 'doing'),
      'total', (select count(*) from public.group_project_steps s where s.project_id = p.id),
      'updated_at', p.updated_at) order by p.number)
    from public.group_projects p where p.agency_id = public.groscove_agency_id()), '[]'::jsonb);
end $$;
revoke execute on function public.group_projects_list() from public, anon;
grant execute on function public.group_projects_list() to authenticated, service_role;

-- ficha completa (5W2H, metas, microetapas e quem pode mexer)
create or replace function public.group_project_get(p_number int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.group_projects%rowtype;
begin
  if not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.group_projects p where p.agency_id = public.groscove_agency_id() and p.number = p_number;
  if v.id is null then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'number', v.number, 'name', v.name, 'category', v.category, 'score', v.score, 'priority', v.priority,
    'objective', v.objective, 'plan', v.plan, 'stage_goals', to_jsonb(v.stage_goals), 'owner_id', v.owner_id,
    'support_ids', to_jsonb(v.support_ids), 'status', v.status, 'due_on', v.due_on, 'notes', v.notes, 'updated_at', v.updated_at,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('stage', s.stage, 'position', s.position, 'title', s.title, 'status', s.status,
        'note', s.note, 'updated_at', s.updated_at) order by s.stage, s.position)
      from public.group_project_steps s where s.project_id = v.id), '[]'::jsonb),
    'can_edit', public.group_project_can_edit(),
    'can_mark', public.group_project_can_edit() or coalesce(auth.uid() = v.owner_id, false) or coalesce(auth.uid() = any (v.support_ids), false));
end $$;
revoke execute on function public.group_project_get(int) from public, anon;
grant execute on function public.group_project_get(int) to authenticated, service_role;

-- gestor+ edita a ficha (só os campos enviados); avisa quem virou responsável ou apoio
create or replace function public.group_project_save(p_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.group_projects%rowtype; v_g uuid := public.groscove_agency_id(); v_plan jsonb; r record;
        v_owner uuid; v_support uuid[]; v_goals text[]; v_due date; v_new uuid;
begin
  if not public.group_project_can_edit() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v from public.group_projects p where p.id = p_id and p.agency_id = v_g;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_data ? 'name' then
    if char_length(btrim(coalesce(p_data ->> 'name', ''))) not between 2 and 120 then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.name := btrim(p_data ->> 'name');
  end if;
  if p_data ? 'category' then
    if char_length(btrim(coalesce(p_data ->> 'category', ''))) > 80 then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.category := btrim(coalesce(p_data ->> 'category', ''));
  end if;
  if p_data ? 'score' then
    begin v.score := round((p_data ->> 'score')::numeric, 2); exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v.score is null or v.score < 0 or v.score > 5 then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  if p_data ? 'priority' then
    if coalesce(p_data ->> 'priority', '') not in ('urgent', 'important', 'structural', 'circumstantial') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.priority := p_data ->> 'priority';
  end if;
  if p_data ? 'status' then
    if coalesce(p_data ->> 'status', '') not in ('active', 'paused', 'done', 'cancelled') then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.status := p_data ->> 'status';
  end if;
  if p_data ? 'objective' then
    if char_length(btrim(coalesce(p_data ->> 'objective', ''))) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.objective := btrim(coalesce(p_data ->> 'objective', ''));
  end if;
  if p_data ? 'notes' then
    if char_length(btrim(coalesce(p_data ->> 'notes', ''))) > 2000 then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.notes := btrim(coalesce(p_data ->> 'notes', ''));
  end if;
  if p_data ? 'plan' then
    if jsonb_typeof(p_data -> 'plan') <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_plan := v.plan;
    for r in select key, value from jsonb_each(p_data -> 'plan') loop
      if r.key not in ('what', 'why', 'where', 'when', 'who', 'how', 'how_much') or jsonb_typeof(r.value) <> 'string'
         or char_length(btrim(r.value #>> '{}')) > 1000 then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      v_plan := v_plan || jsonb_build_object(r.key, btrim(r.value #>> '{}'));
    end loop;
    v.plan := v_plan;
  end if;
  if p_data ? 'stage_goals' then
    if jsonb_typeof(p_data -> 'stage_goals') <> 'array' or jsonb_array_length(p_data -> 'stage_goals') <> 5 then raise exception 'invalid_input' using errcode = '22023'; end if;
    select array_agg(btrim(x) order by o) into v_goals from jsonb_array_elements_text(p_data -> 'stage_goals') with ordinality as e(x, o);
    if exists (select 1 from unnest(v_goals) g where char_length(g) > 300) then raise exception 'invalid_input' using errcode = '22023'; end if;
    v.stage_goals := v_goals;
  end if;
  if p_data ? 'due_on' then
    if nullif(p_data ->> 'due_on', '') is null then v_due := null;
    else begin v_due := (p_data ->> 'due_on')::date; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    end if;
    v.due_on := v_due;
  end if;
  v_owner := v.owner_id; v_support := v.support_ids;
  if p_data ? 'owner_id' then
    if nullif(p_data ->> 'owner_id', '') is null then v_owner := null;
    else
      begin v_owner := (p_data ->> 'owner_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      if not exists (select 1 from public.agency_members m where m.agency_id = v_g and m.user_id = v_owner and m.revoked_at is null) then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    end if;
  end if;
  if p_data ? 'support_ids' then
    if jsonb_typeof(p_data -> 'support_ids') <> 'array' or jsonb_array_length(p_data -> 'support_ids') > 10 then raise exception 'invalid_input' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct m.user_id), '{}') into v_support from public.agency_members m
    where m.agency_id = v_g and m.revoked_at is null and m.user_id::text in (select jsonb_array_elements_text(p_data -> 'support_ids'));
    if cardinality(v_support) <> (select count(distinct x) from jsonb_array_elements_text(p_data -> 'support_ids') x) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;

  update public.group_projects set name = v.name, category = v.category, score = v.score, priority = v.priority, status = v.status,
    objective = v.objective, notes = v.notes, plan = v.plan, stage_goals = v.stage_goals, due_on = v.due_on,
    owner_id = v_owner, support_ids = v_support, updated_at = now(), updated_by = auth.uid()
  where id = v.id;

  -- quem entrou como responsável ou apoio recebe o aviso (uma vez por projeto e papel)
  if v_owner is not null and v_owner is distinct from v.owner_id and v_owner <> auth.uid() then
    perform public.inbox_notify(v_owner, 'group_project_assigned', '/agencia/plano-de-projetos/' || v.number,
      jsonb_build_object('project', left(v.name, 80), 'role', 'owner'), v_g, 'group_project', v.id, 'gp_owner:' || v.id || ':' || v_owner);
  end if;
  foreach v_new in array v_support loop
    if not (v_new = any (v.support_ids)) and v_new <> auth.uid() then
      perform public.inbox_notify(v_new, 'group_project_assigned', '/agencia/plano-de-projetos/' || v.number,
        jsonb_build_object('project', left(v.name, 80), 'role', 'support'), v_g, 'group_project', v.id, 'gp_support:' || v.id || ':' || v_new);
    end if;
  end loop;
  perform public.audit_log('group_project.save', 'group_project', v.id::text, null, p_data - 'plan' - 'notes' - 'objective', null, 'agency');
end $$;
revoke execute on function public.group_project_save(uuid, jsonb) from public, anon;
grant execute on function public.group_project_save(uuid, jsonb) to authenticated, service_role;

-- microetapa: responsável, apoio ou gestor+ marcam (a fazer, em andamento, concluída) e anotam
create or replace function public.group_project_step_set(p_project uuid, p_stage int, p_position int, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.group_projects%rowtype; v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v from public.group_projects p where p.id = p_project and p.agency_id = public.groscove_agency_id();
  if v.id is null or not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (public.group_project_can_edit() or coalesce(auth.uid() = v.owner_id, false) or coalesce(auth.uid() = any (v.support_ids), false)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('todo', 'doing', 'done') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.group_project_steps set status = p_status, note = v_note, updated_at = now(), updated_by = auth.uid()
  where project_id = p_project and stage = p_stage and position = p_position;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.group_projects set updated_at = now(), updated_by = auth.uid() where id = p_project;
end $$;
revoke execute on function public.group_project_step_set(uuid, int, int, text, text) from public, anon;
grant execute on function public.group_project_step_set(uuid, int, int, text, text) to authenticated, service_role;

-- carga dos 25 projetos (só se a Groscove existir; idempotente: não sobrescreve o que a equipe já mudou) ----------------------
create or replace function pg_temp.gp_seed(p_number int, p_name text, p_category text, p_score numeric, p_priority text, p_objective text,
  p_plan jsonb, p_goals text[], p_steps text[])
returns void language plpgsql as $$
declare v_g uuid := public.groscove_agency_id(); v_id uuid; i int;
begin
  if v_g is null then return; end if;
  insert into public.group_projects (agency_id, number, name, category, score, priority, objective, plan, stage_goals)
  values (v_g, p_number, p_name, p_category, p_score, p_priority, p_objective, p_plan, p_goals)
  on conflict (agency_id, number) do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  for i in 1 .. 30 loop
    insert into public.group_project_steps (project_id, stage, position, title)
    values (v_id, ((i - 1) / 6) + 1, ((i - 1) % 6) + 1, p_steps[i]);
  end loop;
end $$;

select pg_temp.gp_seed(1, '4WAY - Escola de Inglês', 'Educação / Parceiro', 5.00, 'structural',
  'Estruturar, viabilizar, executar e acompanhar o projeto 4WAY - Escola de Inglês, com entregas, responsáveis e próximos passos claramente definidos. (Plano no modelo padrão: ajustar na reunião.)',
  '{"what": "Estruturar, viabilizar, executar e acompanhar o projeto 4WAY - Escola de Inglês, com entregas, responsáveis e próximos passos claramente definidos. (Plano no modelo padrão: ajustar na reunião.)", "why": "Criar uma execução organizada e mensurável para 4WAY - Escola de Inglês, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(2, 'Almoço Chiquinho Scarpa', 'Evento / Experiência', 2.33, 'important',
  'Estruturar, viabilizar, executar e encerrar a participação da Groscove no Almoço Chiquinho Scarpa, com entregas comerciais, operacionais e de relacionamento claramente definidas.',
  '{"what": "Estruturar, viabilizar, executar e encerrar a participação da Groscove no Almoço Chiquinho Scarpa, com entregas comerciais, operacionais e de relacionamento claramente definidas.", "why": "Criar uma execução organizada e mensurável para Almoço Chiquinho Scarpa, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(3, 'App Groscove Ultra Hero', 'Tecnologia / Produto', 3.17, 'circumstantial',
  'Levar o aplicativo Groscove Ultra Hero da definição de escopo à validação e entrega de uma versão funcional, com modelo de operação e evolução definidos.',
  '{"what": "Levar o aplicativo Groscove Ultra Hero da definição de escopo à validação e entrega de uma versão funcional, com modelo de operação e evolução definidos.", "why": "Criar uma execução organizada e mensurável para App Groscove Ultra Hero, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Produto definido com escopo e critérios de sucesso.', 'Plano de desenvolvimento aprovado.', 'Ambiente, design, conteúdo e recursos prontos.', 'Versão funcional validada em piloto.', 'Produto entregue, documentado e com continuidade definida.']::text[],
  array['Definir problema e usuário principal', 'Definir proposta de valor', 'Mapear funcionalidades essenciais', 'Definir escopo da primeira versão', 'Mapear responsáveis e fornecedores', 'Definir critérios de sucesso', 'Criar jornada do usuário', 'Priorizar backlog', 'Definir arquitetura/tecnologia', 'Definir cronograma de desenvolvimento', 'Estimar orçamento e recursos', 'Definir métricas e testes', 'Produzir protótipo/wireframes', 'Validar identidade e interface', 'Preparar infraestrutura e acessos', 'Formalizar fornecedores/contratos', 'Preparar dados e conteúdos', 'Executar revisão pré-desenvolvimento', 'Desenvolver versão funcional', 'Integrar módulos e serviços', 'Realizar testes internos', 'Corrigir bugs críticos', 'Executar piloto com usuários', 'Validar métricas e estabilidade', 'Aprovar versão de entrega', 'Documentar produto e operação', 'Definir suporte e manutenção', 'Fechar custos e contratos', 'Planejar evolução/roadmap', 'Formalizar lançamento ou encerramento']::text[]);
select pg_temp.gp_seed(4, 'Bob Funk', 'Projeto / Parceiro', 3.00, 'circumstantial',
  'Estruturar a oportunidade relacionada a Bob Funk, definir proposta de valor, responsabilidades, entregas e caminho de execução até uma conclusão objetiva.',
  '{"what": "Estruturar a oportunidade relacionada a Bob Funk, definir proposta de valor, responsabilidades, entregas e caminho de execução até uma conclusão objetiva.", "why": "Criar uma execução organizada e mensurável para Bob Funk, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(5, 'E-commerce China × Brasil - via Paraguai', 'Internacional / E-commerce', 0.00, 'circumstantial',
  'Validar a viabilidade jurídica, fiscal, logística e comercial de uma operação de e-commerce China–Brasil com possível origem/rota via Paraguai, estruturando modelo executável.',
  '{"what": "Validar a viabilidade jurídica, fiscal, logística e comercial de uma operação de e-commerce China–Brasil com possível origem/rota via Paraguai, estruturando modelo executável.", "why": "Criar uma execução organizada e mensurável para E-commerce China × Brasil — via Paraguai, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Modelo preliminar da operação definido e partes identificadas.', 'Operação planejada com viabilidade preliminar mensurável.', 'Condições comerciais, documentais e operacionais prontas para piloto.', 'Operação piloto concluída e comprovada.', 'Modelo validado, documentado e pronto para escala ou encerramento.']::text[],
  array['Definir produto/serviço e objetivo comercial', 'Identificar países, mercados e rota pretendida', 'Mapear vendedor, comprador e intermediários', 'Levantar requisitos legais e regulatórios', 'Definir papel da Groscove e parceiros', 'Registrar premissas, riscos e pendências', 'Validar documentação e compliance', 'Desenhar fluxo financeiro e comercial', 'Definir logística e responsabilidades', 'Estimar custos, margens e tributos', 'Construir cronograma de validação', 'Definir critérios de go/no-go', 'Validar fornecedores/contrapartes', 'Reunir documentos e certificados', 'Preparar contratos e instrumentos', 'Negociar preços e condições', 'Testar logística/rota/processo', 'Preparar piloto ou primeira operação', 'Formalizar pedido/operação piloto', 'Executar pagamentos conforme contrato', 'Acompanhar coleta/embarque/processamento', 'Monitorar documentação e desembaraço', 'Confirmar entrega/aceite', 'Registrar desvios, custos e resultados', 'Conciliar financeiro e documentos', 'Avaliar margem e desempenho real', 'Corrigir falhas do piloto', 'Formalizar modelo definitivo', 'Definir escala e recorrência', 'Arquivar dossiê e aprovar continuidade']::text[]);
select pg_temp.gp_seed(6, 'Estrutura Rede de Apoio da Groscove', 'Comercial / Benefícios', 5.00, 'structural',
  'Criar e colocar em operação uma rede estruturada de benefícios e apoios para o ecossistema Groscove, com parceiros, regras, contrapartidas e comunicação definidas.',
  '{"what": "Criar e colocar em operação uma rede estruturada de benefícios e apoios para o ecossistema Groscove, com parceiros, regras, contrapartidas e comunicação definidas.", "why": "Criar uma execução organizada e mensurável para Estrutura Rede de Apoio da Groscove, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Base estruturada com padrão único.', 'Base segmentada e pronta para uso estratégico.', 'Dados validados e ferramenta pronta para operação.', 'Base utilizada de forma ativa e atualizada.', 'Base oficial consolidada e governada.']::text[],
  array['Definir objetivo da base/rede', 'Consolidar fontes existentes', 'Definir campos e categorias', 'Eliminar duplicidades', 'Definir critérios de validação', 'Definir responsáveis por manutenção', 'Classificar por segmento', 'Classificar por nível de relacionamento', 'Definir prioridades comerciais', 'Definir regras de uso e acesso', 'Criar rotina de atualização', 'Definir indicadores da base', 'Validar dados principais', 'Completar contatos e responsáveis', 'Organizar materiais associados', 'Criar filtros e visualizações', 'Testar fluxo de consulta', 'Corrigir inconsistências', 'Usar base em projetos reais', 'Registrar abordagens e retornos', 'Atualizar status dos contatos', 'Incorporar novas marcas/parceiros', 'Monitorar qualidade dos dados', 'Gerar visão executiva periódica', 'Auditar cobertura da base', 'Resolver pendências finais', 'Consolidar versão oficial', 'Documentar processo de manutenção', 'Definir responsável permanente', 'Aprovar rotina de continuidade']::text[]);
select pg_temp.gp_seed(7, 'Estruturas de Contratos', 'Jurídico / Governança', 3.17, 'structural',
  'Padronizar a estrutura contratual da Groscove para os principais tipos de projeto, parceria e operação, reduzindo risco e acelerando formalizações.',
  '{"what": "Padronizar a estrutura contratual da Groscove para os principais tipos de projeto, parceria e operação, reduzindo risco e acelerando formalizações.", "why": "Criar uma execução organizada e mensurável para Estruturas de Contratos, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo jurídico/institucional e riscos mapeados.', 'Modelos e processo de governança desenhados.', 'Kit documental pronto e validado.', 'Padrão implantado e utilizado pela operação.', 'Estrutura consolidada, controlada e sustentável.']::text[],
  array['Mapear necessidades e tipos de operação', 'Levantar documentos e regras aplicáveis', 'Identificar riscos recorrentes', 'Definir responsáveis internos/externos', 'Classificar prioridades', 'Definir padrão de aprovação', 'Desenhar modelos e fluxos', 'Definir cláusulas/requisitos essenciais', 'Criar matriz de responsabilidades', 'Definir processo de revisão', 'Definir armazenamento e versionamento', 'Criar cronograma de implantação', 'Redigir modelos-base', 'Revisar com especialista quando necessário', 'Criar checklists de documentos', 'Criar nomenclatura e pastas', 'Testar modelos em casos reais', 'Ajustar versões após teste', 'Implantar modelos nos projetos', 'Treinar responsáveis', 'Aplicar checklists', 'Controlar assinaturas/aprovações', 'Monitorar exceções', 'Atualizar base conforme uso', 'Auditar documentos implantados', 'Corrigir lacunas', 'Consolidar versão oficial', 'Registrar responsáveis por atualização', 'Definir revisão periódica', 'Arquivar histórico e comunicar padrão']::text[]);
select pg_temp.gp_seed(8, 'Festa Trancoso', 'Evento / Experiência', 1.17, 'circumstantial',
  'Estruturar a participação/projeto da Groscove para a festa de virada de ano em Trancoso, definindo formato, parceiros, comercial, operação e fechamento.',
  '{"what": "Estruturar a participação/projeto da Groscove para a festa de virada de ano em Trancoso, definindo formato, parceiros, comercial, operação e fechamento.", "why": "Criar uma execução organizada e mensurável para Festa Trancoso, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(9, 'Garagem Sunset', 'Evento / Experiência', 3.00, 'important',
  'Transformar Garagem Sunset em projeto executável, com conceito, público, parceiros, orçamento, produção, realização e avaliação final.',
  '{"what": "Transformar Garagem Sunset em projeto executável, com conceito, público, parceiros, orçamento, produção, realização e avaliação final.", "why": "Criar uma execução organizada e mensurável para Garagem Sunset, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(10, 'La Table Petit 2027', 'Evento / Experiência', 1.83, 'important',
  'Planejar e estruturar a edição 2027 do La Table Petit, consolidando modelo comercial, experiência, patrocinadores, produção, execução e renovação.',
  '{"what": "Planejar e estruturar a edição 2027 do La Table Petit, consolidando modelo comercial, experiência, patrocinadores, produção, execução e renovação.", "why": "Criar uma execução organizada e mensurável para La Table Petit 2027, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(11, 'Leilão Beneficente 2026', 'Esporte / Evento', 4.50, 'important',
  'Concluir a participação da Groscove no ciclo 2026 do leilão beneficente, registrando resultados, pendências, relacionamentos e aprendizados para continuidade.',
  '{"what": "Concluir a participação da Groscove no ciclo 2026 do leilão beneficente, registrando resultados, pendências, relacionamentos e aprendizados para continuidade.", "why": "Criar uma execução organizada e mensurável para Leilão Beneficente 2026, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(12, 'Leilão Beneficente 2027', 'Esporte / Evento', 4.83, 'important',
  'Estruturar com antecedência a edição 2027 do leilão beneficente, com escopo, captação, itens, convidados, comunicação, operação e metas formalizadas.',
  '{"what": "Estruturar com antecedência a edição 2027 do leilão beneficente, com escopo, captação, itens, convidados, comunicação, operação e metas formalizadas.", "why": "Criar uma execução organizada e mensurável para Leilão Beneficente 2027, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(13, 'Leis de Incentivo', 'Institucional / Captação', 4.17, 'structural',
  'Mapear e estruturar o uso de leis de incentivo aplicáveis aos projetos Groscove, criando processo de enquadramento, documentação, captação e prestação de contas.',
  '{"what": "Mapear e estruturar o uso de leis de incentivo aplicáveis aos projetos Groscove, criando processo de enquadramento, documentação, captação e prestação de contas.", "why": "Criar uma execução organizada e mensurável para Leis de Incentivo, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(14, 'Liga da Mata / Projeto Folclore', 'Propriedade Intelectual / Cultura', 3.83, 'circumstantial',
  'Estruturar a Liga da Mata como propriedade intelectual e projeto cultural, com universo, ativos, proteção, produtos, parceiros, distribuição e plano de lançamento.',
  '{"what": "Estruturar a Liga da Mata como propriedade intelectual e projeto cultural, com universo, ativos, proteção, produtos, parceiros, distribuição e plano de lançamento.", "why": "Criar uma execução organizada e mensurável para Liga da Mata / Projeto Folclore, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(15, 'Michel Austrália', 'Projeto / Internacional', 2.17, 'circumstantial',
  'Definir e estruturar a oportunidade Michel Austrália, transformando o relacionamento em escopo, proposta, execução e resultado mensurável.',
  '{"what": "Definir e estruturar a oportunidade Michel Austrália, transformando o relacionamento em escopo, proposta, execução e resultado mensurável.", "why": "Criar uma execução organizada e mensurável para Michel Austrália, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Modelo preliminar da operação definido e partes identificadas.', 'Operação planejada com viabilidade preliminar mensurável.', 'Condições comerciais, documentais e operacionais prontas para piloto.', 'Operação piloto concluída e comprovada.', 'Modelo validado, documentado e pronto para escala ou encerramento.']::text[],
  array['Definir produto/serviço e objetivo comercial', 'Identificar países, mercados e rota pretendida', 'Mapear vendedor, comprador e intermediários', 'Levantar requisitos legais e regulatórios', 'Definir papel da Groscove e parceiros', 'Registrar premissas, riscos e pendências', 'Validar documentação e compliance', 'Desenhar fluxo financeiro e comercial', 'Definir logística e responsabilidades', 'Estimar custos, margens e tributos', 'Construir cronograma de validação', 'Definir critérios de go/no-go', 'Validar fornecedores/contrapartes', 'Reunir documentos e certificados', 'Preparar contratos e instrumentos', 'Negociar preços e condições', 'Testar logística/rota/processo', 'Preparar piloto ou primeira operação', 'Formalizar pedido/operação piloto', 'Executar pagamentos conforme contrato', 'Acompanhar coleta/embarque/processamento', 'Monitorar documentação e desembaraço', 'Confirmar entrega/aceite', 'Registrar desvios, custos e resultados', 'Conciliar financeiro e documentos', 'Avaliar margem e desempenho real', 'Corrigir falhas do piloto', 'Formalizar modelo definitivo', 'Definir escala e recorrência', 'Arquivar dossiê e aprovar continuidade']::text[]);
select pg_temp.gp_seed(16, 'Marcas do Site + E-mails', 'Marcas / Comercial', 4.67, 'structural',
  'Consolidar todas as marcas do site e dos e-mails da Groscove em uma base única, classificada, validada e utilizável para comercial, relacionamento e comunicação.',
  '{"what": "Consolidar todas as marcas do site e dos e-mails da Groscove em uma base única, classificada, validada e utilizável para comercial, relacionamento e comunicação.", "why": "Criar uma execução organizada e mensurável para Marcas do Site + E-mails, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Base estruturada com padrão único.', 'Base segmentada e pronta para uso estratégico.', 'Dados validados e ferramenta pronta para operação.', 'Base utilizada de forma ativa e atualizada.', 'Base oficial consolidada e governada.']::text[],
  array['Definir objetivo da base/rede', 'Consolidar fontes existentes', 'Definir campos e categorias', 'Eliminar duplicidades', 'Definir critérios de validação', 'Definir responsáveis por manutenção', 'Classificar por segmento', 'Classificar por nível de relacionamento', 'Definir prioridades comerciais', 'Definir regras de uso e acesso', 'Criar rotina de atualização', 'Definir indicadores da base', 'Validar dados principais', 'Completar contatos e responsáveis', 'Organizar materiais associados', 'Criar filtros e visualizações', 'Testar fluxo de consulta', 'Corrigir inconsistências', 'Usar base em projetos reais', 'Registrar abordagens e retornos', 'Atualizar status dos contatos', 'Incorporar novas marcas/parceiros', 'Monitorar qualidade dos dados', 'Gerar visão executiva periódica', 'Auditar cobertura da base', 'Resolver pendências finais', 'Consolidar versão oficial', 'Documentar processo de manutenção', 'Definir responsável permanente', 'Aprovar rotina de continuidade']::text[]);
select pg_temp.gp_seed(17, 'Projeto Alan Ralph', 'Marca / Projeto Estratégico', 4.17, 'important',
  'Estruturar e executar o projeto Alan Ralph com posicionamento, ativos, plano comercial, conteúdo, parceiros e entregas claramente definidos.',
  '{"what": "Estruturar e executar o projeto Alan Ralph com posicionamento, ativos, plano comercial, conteúdo, parceiros e entregas claramente definidos.", "why": "Criar uma execução organizada e mensurável para Projeto Alan Ralph, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(18, 'Projeto Futebol Brasil × China', 'Esporte / Internacional', 1.83, 'circumstantial',
  'Estruturar uma operação de conexão Brasil–China no futebol, definindo proposta, parceiros, modelo de negócio, requisitos, piloto e expansão.',
  '{"what": "Estruturar uma operação de conexão Brasil–China no futebol, definindo proposta, parceiros, modelo de negócio, requisitos, piloto e expansão.", "why": "Criar uma execução organizada e mensurável para Projeto Futebol Brasil × China, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Modelo preliminar da operação definido e partes identificadas.', 'Operação planejada com viabilidade preliminar mensurável.', 'Condições comerciais, documentais e operacionais prontas para piloto.', 'Operação piloto concluída e comprovada.', 'Modelo validado, documentado e pronto para escala ou encerramento.']::text[],
  array['Definir produto/serviço e objetivo comercial', 'Identificar países, mercados e rota pretendida', 'Mapear vendedor, comprador e intermediários', 'Levantar requisitos legais e regulatórios', 'Definir papel da Groscove e parceiros', 'Registrar premissas, riscos e pendências', 'Validar documentação e compliance', 'Desenhar fluxo financeiro e comercial', 'Definir logística e responsabilidades', 'Estimar custos, margens e tributos', 'Construir cronograma de validação', 'Definir critérios de go/no-go', 'Validar fornecedores/contrapartes', 'Reunir documentos e certificados', 'Preparar contratos e instrumentos', 'Negociar preços e condições', 'Testar logística/rota/processo', 'Preparar piloto ou primeira operação', 'Formalizar pedido/operação piloto', 'Executar pagamentos conforme contrato', 'Acompanhar coleta/embarque/processamento', 'Monitorar documentação e desembaraço', 'Confirmar entrega/aceite', 'Registrar desvios, custos e resultados', 'Conciliar financeiro e documentos', 'Avaliar margem e desempenho real', 'Corrigir falhas do piloto', 'Formalizar modelo definitivo', 'Definir escala e recorrência', 'Arquivar dossiê e aprovar continuidade']::text[]);
select pg_temp.gp_seed(19, 'Projeto Luiza Dam', 'Projeto / Parceiro', 3.83, 'important',
  'Transformar a oportunidade Luiza Dam em projeto formal, com objetivo, proposta de valor, escopo, plano de ação, execução e encerramento mensurável.',
  '{"what": "Transformar a oportunidade Luiza Dam em projeto formal, com objetivo, proposta de valor, escopo, plano de ação, execução e encerramento mensurável.", "why": "Criar uma execução organizada e mensurável para Projeto Luiza Dam, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(20, 'Rakuten', 'E-commerce / Comercial', 5.00, 'urgent',
  'Organizar a frente Rakuten, consolidando marcas elegíveis, restrições, oportunidades, operação comercial e critérios para continuidade.',
  '{"what": "Organizar a frente Rakuten, consolidando marcas elegíveis, restrições, oportunidades, operação comercial e critérios para continuidade.", "why": "Criar uma execução organizada e mensurável para Rakuten, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Modelo preliminar da operação definido e partes identificadas.', 'Operação planejada com viabilidade preliminar mensurável.', 'Condições comerciais, documentais e operacionais prontas para piloto.', 'Operação piloto concluída e comprovada.', 'Modelo validado, documentado e pronto para escala ou encerramento.']::text[],
  array['Definir produto/serviço e objetivo comercial', 'Identificar países, mercados e rota pretendida', 'Mapear vendedor, comprador e intermediários', 'Levantar requisitos legais e regulatórios', 'Definir papel da Groscove e parceiros', 'Registrar premissas, riscos e pendências', 'Validar documentação e compliance', 'Desenhar fluxo financeiro e comercial', 'Definir logística e responsabilidades', 'Estimar custos, margens e tributos', 'Construir cronograma de validação', 'Definir critérios de go/no-go', 'Validar fornecedores/contrapartes', 'Reunir documentos e certificados', 'Preparar contratos e instrumentos', 'Negociar preços e condições', 'Testar logística/rota/processo', 'Preparar piloto ou primeira operação', 'Formalizar pedido/operação piloto', 'Executar pagamentos conforme contrato', 'Acompanhar coleta/embarque/processamento', 'Monitorar documentação e desembaraço', 'Confirmar entrega/aceite', 'Registrar desvios, custos e resultados', 'Conciliar financeiro e documentos', 'Avaliar margem e desempenho real', 'Corrigir falhas do piloto', 'Formalizar modelo definitivo', 'Definir escala e recorrência', 'Arquivar dossiê e aprovar continuidade']::text[]);
select pg_temp.gp_seed(21, 'Sustentabilidade em Campo', 'ESG / Esporte', 2.33, 'circumstantial',
  'Estruturar a colaboração Groscove × Sustentabilidade em Campo em um programa com objetivos, calendário, projetos, parceiros, entregas e indicadores definidos.',
  '{"what": "Estruturar a colaboração Groscove × Sustentabilidade em Campo em um programa com objetivos, calendário, projetos, parceiros, entregas e indicadores definidos.", "why": "Criar uma execução organizada e mensurável para Sustentabilidade em Campo, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
select pg_temp.gp_seed(22, 'Tarot', 'Conteúdo / Produto', 4.17, 'urgent',
  'Estruturar o projeto Tarot como produto/conteúdo, definindo proposta, formato, experiência, operação, lançamento e critérios de continuidade.',
  '{"what": "Estruturar o projeto Tarot como produto/conteúdo, definindo proposta, formato, experiência, operação, lançamento e critérios de continuidade.", "why": "Criar uma execução organizada e mensurável para Tarot, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Produto definido com escopo e critérios de sucesso.', 'Plano de desenvolvimento aprovado.', 'Ambiente, design, conteúdo e recursos prontos.', 'Versão funcional validada em piloto.', 'Produto entregue, documentado e com continuidade definida.']::text[],
  array['Definir problema e usuário principal', 'Definir proposta de valor', 'Mapear funcionalidades essenciais', 'Definir escopo da primeira versão', 'Mapear responsáveis e fornecedores', 'Definir critérios de sucesso', 'Criar jornada do usuário', 'Priorizar backlog', 'Definir arquitetura/tecnologia', 'Definir cronograma de desenvolvimento', 'Estimar orçamento e recursos', 'Definir métricas e testes', 'Produzir protótipo/wireframes', 'Validar identidade e interface', 'Preparar infraestrutura e acessos', 'Formalizar fornecedores/contratos', 'Preparar dados e conteúdos', 'Executar revisão pré-desenvolvimento', 'Desenvolver versão funcional', 'Integrar módulos e serviços', 'Realizar testes internos', 'Corrigir bugs críticos', 'Executar piloto com usuários', 'Validar métricas e estabilidade', 'Aprovar versão de entrega', 'Documentar produto e operação', 'Definir suporte e manutenção', 'Fechar custos e contratos', 'Planejar evolução/roadmap', 'Formalizar lançamento ou encerramento']::text[]);
select pg_temp.gp_seed(23, 'The Bunker Garage 2027', 'Automotivo / Experiência', 4.67, 'important',
  'Estruturar o The Bunker Garage 2027 como experiência automotiva e plataforma de marcas, com modelo comercial, operação, patrocínios, execução e relatório.',
  '{"what": "Estruturar o The Bunker Garage 2027 como experiência automotiva e plataforma de marcas, com modelo comercial, operação, patrocínios, execução e relatório.", "why": "Criar uma execução organizada e mensurável para The Bunker Garage 2027, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Escopo, formato, público, envolvidos e papel da Groscove definidos.', 'Plano comercial, financeiro e operacional aprovado.', 'Recursos, parceiros, materiais e operação prontos.', 'Projeto/evento executado com entregas controladas.', 'Projeto encerrado, documentado e com continuidade decidida.']::text[],
  array['Definir objetivo e resultado esperado', 'Confirmar formato do projeto/evento', 'Definir público e capacidade', 'Mapear participantes e decisores', 'Definir escopo da Groscove', 'Formalizar premissas e pendências', 'Montar orçamento preliminar', 'Definir modelo comercial e receitas', 'Mapear patrocinadores/parceiros', 'Construir cronograma macro', 'Definir plano de convidados/relacionamento', 'Mapear riscos e dependências', 'Fechar parceiros prioritários', 'Formalizar contratos e contrapartidas', 'Definir ativações/experiências', 'Fechar fornecedores e produção', 'Finalizar comunicação e materiais', 'Realizar checklist pré-execução', 'Realizar montagem/preparação final', 'Validar entregas com envolvidos', 'Executar recepção/credenciamento', 'Executar programação principal', 'Acompanhar marcas e parceiros', 'Registrar conteúdo e ocorrências', 'Conferir entregas realizadas', 'Fechar financeiro e pagamentos', 'Organizar fotos, vídeos e documentos', 'Emitir relatório de resultados', 'Realizar avaliação interna', 'Definir renovação ou próximos passos']::text[]);
select pg_temp.gp_seed(24, 'Trade Minério - Brasil × China', 'Trade / Internacional', 4.17, 'urgent',
  'Estruturar e validar a operação de minério Brasil–China, com produto, fornecedores, comprador, documentação, compliance, logística, contrato e fechamento comercial.',
  '{"what": "Estruturar e validar a operação de minério Brasil–China, com produto, fornecedores, comprador, documentação, compliance, logística, contrato e fechamento comercial.", "why": "Criar uma execução organizada e mensurável para Trade Minério — Brasil × China, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Modelo preliminar da operação definido e partes identificadas.', 'Operação planejada com viabilidade preliminar mensurável.', 'Condições comerciais, documentais e operacionais prontas para piloto.', 'Operação piloto concluída e comprovada.', 'Modelo validado, documentado e pronto para escala ou encerramento.']::text[],
  array['Definir produto/serviço e objetivo comercial', 'Identificar países, mercados e rota pretendida', 'Mapear vendedor, comprador e intermediários', 'Levantar requisitos legais e regulatórios', 'Definir papel da Groscove e parceiros', 'Registrar premissas, riscos e pendências', 'Validar documentação e compliance', 'Desenhar fluxo financeiro e comercial', 'Definir logística e responsabilidades', 'Estimar custos, margens e tributos', 'Construir cronograma de validação', 'Definir critérios de go/no-go', 'Validar fornecedores/contrapartes', 'Reunir documentos e certificados', 'Preparar contratos e instrumentos', 'Negociar preços e condições', 'Testar logística/rota/processo', 'Preparar piloto ou primeira operação', 'Formalizar pedido/operação piloto', 'Executar pagamentos conforme contrato', 'Acompanhar coleta/embarque/processamento', 'Monitorar documentação e desembaraço', 'Confirmar entrega/aceite', 'Registrar desvios, custos e resultados', 'Conciliar financeiro e documentos', 'Avaliar margem e desempenho real', 'Corrigir falhas do piloto', 'Formalizar modelo definitivo', 'Definir escala e recorrência', 'Arquivar dossiê e aprovar continuidade']::text[]);
select pg_temp.gp_seed(25, 'Vídeos Boneco Palito', 'Conteúdo / Comunicação', 5.00, 'structural',
  'Criar e operacionalizar a série de vídeos com boneco palito para a Groscove, com linguagem, pautas, produção, publicação, métricas e ciclo de melhoria.',
  '{"what": "Criar e operacionalizar a série de vídeos com boneco palito para a Groscove, com linguagem, pautas, produção, publicação, métricas e ciclo de melhoria.", "why": "Criar uma execução organizada e mensurável para Vídeos Boneco Palito, reduzindo indefinições e permitindo acompanhamento até o encerramento.", "where": "A definir conforme o escopo e os locais/mercados envolvidos.", "when": "Cronograma e prazo final a definir na reunião de gestão.", "who": "Responsável principal + Apoio + parceiros e terceiros necessários.", "how": "Execução pelo padrão Groscove: 5 etapas, 30 microetapas, metas de passagem e acompanhamento de progresso.", "how_much": "Orçamento, investimento, custos e/ou receitas a definir conforme o projeto."}'::jsonb,
  array['Projeto claramente definido e aprovado internamente.', 'Plano de execução completo e aprovado.', 'Projeto pronto para entrar em execução.', 'Escopo executado e resultados registrados.', 'Projeto formalmente concluído e documentado.']::text[],
  array['Definir objetivo final', 'Definir proposta de valor', 'Mapear envolvidos e decisores', 'Definir escopo e limites', 'Levantar informações/documentos', 'Registrar pendências e premissas', 'Definir estratégia de execução', 'Criar cronograma macro', 'Definir recursos necessários', 'Mapear parceiros/oportunidades', 'Definir entregas e indicadores', 'Mapear riscos e dependências', 'Produzir materiais necessários', 'Formalizar responsabilidades', 'Fechar parceiros/fornecedores', 'Organizar documentação', 'Preparar comunicação/conteúdo', 'Realizar checklist de prontidão', 'Iniciar operação/piloto', 'Acompanhar entregas', 'Resolver impedimentos', 'Registrar decisões e mudanças', 'Medir resultados parciais', 'Concluir entregas previstas', 'Validar resultado final', 'Resolver pendências', 'Fechar financeiro/documental', 'Organizar arquivos e evidências', 'Realizar avaliação interna', 'Definir continuidade ou encerramento']::text[]);
