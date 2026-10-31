-- 0068 · Gestão P2: termos demonstrativos com aceite, tarefas (modelo de 12 passos + avulsas) e entregas com
-- versões e aprovação. Idempotente. Depende da 0067.
--
-- Decisões (spec 4.4 adaptada; PROMPT MESTRE prioridade 2):
--   • termos: a agência escreve um resumo de condições por negócio (escopo, datas, usos, exclusividade), versionado;
--     envia à marca e aos creators confirmados; o aceite é DEMONSTRATIVO (sem assinatura eletrônica real) e fica
--     registrado por parte (marca / cada creator), no app ou "registrado pela agência" com nota. A proposta com
--     valores e o motor de comissão (spec 2.3) ficam para a fase seguinte: deal_acceptances já nasce com proposal_id
--     opcional para ligar a eles depois;
--   • contratação confirmada (agência, com aceite da marca e de todos os creators confirmados) leva o negócio a
--     "produção" (porteira), marca os creators como contratados e gera as 12 tarefas do modelo (D12);
--   • entregas: cada envio é uma versão (deliverable_versions); uma versão nova nunca herda aprovação anterior;
--     a marca (ou a agência, registrando decisão recebida fora) aprova ou pede ajustes com feedback; publicar e
--     comprovar fecham o ciclo. Nenhuma tabela nova tem coluna de valor.

-- 1) tabelas -------------------------------------------------------------------------------------------------------
create table if not exists public.deal_terms (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_terms_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_terms_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_terms_deal_fk references public.deals (id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  summary text not null default '',
  usage_rights text not null default '',
  exclusivity text not null default '',
  valid_until date,
  sent_at timestamptz,
  sent_by uuid constraint deal_terms_sent_by_fk references auth.users (id) on delete set null,
  created_by uuid constraint deal_terms_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_terms_version_uq unique (deal_id, version),
  constraint deal_terms_status_check check (status in ('draft', 'sent', 'accepted', 'superseded', 'withdrawn')),
  constraint deal_terms_texts_check check (char_length(summary) <= 4000 and char_length(usage_rights) <= 1000 and char_length(exclusivity) <= 1000)
);
create unique index if not exists deal_terms_live_uq on public.deal_terms (deal_id) where status in ('sent', 'accepted');
create unique index if not exists deal_terms_draft_uq on public.deal_terms (deal_id) where status = 'draft';

create table if not exists public.deal_acceptances (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_acceptances_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_acceptances_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_acceptances_deal_fk references public.deals (id) on delete cascade,
  terms_id uuid not null constraint deal_acceptances_terms_fk references public.deal_terms (id) on delete cascade,
  proposal_id uuid,
  party text not null,
  deal_talent_id uuid constraint deal_acceptances_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid constraint deal_acceptances_talent_fk references public.talent_profiles (id) on delete restrict,
  document_id uuid constraint deal_acceptances_document_fk references public.documents (id) on delete set null,
  method text not null,
  accepted_by uuid constraint deal_acceptances_accepted_by_fk references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  note text not null default '',
  constraint deal_acceptances_party_check check (party in ('brand', 'talent')),
  constraint deal_acceptances_shape check ((party = 'talent') = (deal_talent_id is not null and talent_id is not null)),
  constraint deal_acceptances_method_check check (method in ('in_app', 'recorded_by_agency')),
  constraint deal_acceptances_note_check check (char_length(note) <= 500)
);
create unique index if not exists deal_acceptances_uq on public.deal_acceptances (terms_id, party, deal_talent_id) nulls not distinct;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint tasks_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid constraint tasks_brand_fk references public.brands (id) on delete restrict,
  scope_type text not null,
  deal_id uuid constraint tasks_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid constraint tasks_talent_fk references public.talent_profiles (id) on delete cascade,
  deliverable_id uuid constraint tasks_deliverable_fk references public.deliverables (id) on delete set null,
  template_step smallint,
  title text not null default '',
  description text not null default '',
  side text not null default 'agency',
  assignee_id uuid constraint tasks_assignee_fk references auth.users (id) on delete set null,
  due_at timestamptz,
  status text not null default 'todo',
  completed_at timestamptz,
  completed_by uuid constraint tasks_completed_by_fk references auth.users (id) on delete set null,
  attachment_url text,
  attachment_document_id uuid constraint tasks_attachment_doc_fk references public.documents (id) on delete set null,
  feedback text not null default '',
  created_by uuid constraint tasks_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_scope_check check (
    (scope_type = 'deal' and deal_id is not null) or
    (scope_type = 'talent' and talent_id is not null and deal_id is null) or
    (scope_type = 'agency' and deal_id is null and talent_id is null)),
  constraint tasks_step_check check (template_step is null or (template_step between 1 and 12 and deal_id is not null)),
  constraint tasks_title_check check ((template_step is not null and title = '') or char_length(btrim(title)) between 3 and 160),
  constraint tasks_desc_check check (char_length(description) <= 2000 and char_length(feedback) <= 1000),
  constraint tasks_side_check check (side in ('agency', 'talent', 'brand')),
  constraint tasks_status_check check (status in ('todo', 'doing', 'blocked', 'done', 'cancelled')),
  constraint tasks_done_check check ((status = 'done') = (completed_at is not null)),
  constraint tasks_url_check check (attachment_url is null or public.brand_https_url_ok(attachment_url))
);
create unique index if not exists tasks_template_uq on public.tasks (deal_id, template_step, talent_id) nulls not distinct where template_step is not null;
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status, due_at);
create index if not exists tasks_due_idx on public.tasks (agency_id, due_at) where status in ('todo', 'doing', 'blocked');
create index if not exists tasks_deal_idx on public.tasks (deal_id, template_step);

create table if not exists public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deliverable_versions_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deliverable_versions_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deliverable_versions_deal_fk references public.deals (id) on delete cascade,
  deliverable_id uuid not null constraint deliverable_versions_deliverable_fk references public.deliverables (id) on delete cascade,
  deal_talent_id uuid not null constraint deliverable_versions_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deliverable_versions_talent_fk references public.talent_profiles (id) on delete restrict,
  revision smallint not null,
  kind text not null,
  url text,
  document_id uuid constraint deliverable_versions_document_fk references public.documents (id) on delete set null,
  note text not null default '',
  submitted_side text not null,
  submitted_by uuid constraint deliverable_versions_submitted_by_fk references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  decision text,
  feedback text not null default '',
  decided_side text,
  decided_by uuid constraint deliverable_versions_decided_by_fk references auth.users (id) on delete set null,
  decided_at timestamptz,
  constraint deliverable_versions_kind_check check (kind in ('submission', 'proof')),
  constraint deliverable_versions_side_check check (submitted_side in ('talent', 'agency') and (decided_side is null or decided_side in ('brand', 'agency'))),
  constraint deliverable_versions_decision_check check (decision is null or decision in ('approved', 'changes_requested')),
  constraint deliverable_versions_texts_check check (char_length(note) <= 1000 and char_length(feedback) <= 1000),
  constraint deliverable_versions_url_check check (url is null or public.brand_https_url_ok(url)),
  constraint deliverable_versions_content_check check (url is not null or document_id is not null),
  constraint deliverable_versions_uq unique (deliverable_id, kind, revision)
);
create index if not exists deliverable_versions_deliverable_idx on public.deliverable_versions (deliverable_id, submitted_at);

do $$
declare t text;
begin
  foreach t in array array['deal_terms', 'deal_acceptances', 'tasks', 'deliverable_versions'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
    if t in ('deal_terms', 'tasks') then
      execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
      execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;

-- escopo: termos, aceites e versões herdam agência e marca do negócio; tarefa idem (ou talento → agência)
drop trigger if exists trg_deal_terms_scope on public.deal_terms;
create trigger trg_deal_terms_scope before insert or update on public.deal_terms for each row execute function public.fill_deal_scope('with_brand');
drop trigger if exists trg_deal_acceptances_scope on public.deal_acceptances;
create trigger trg_deal_acceptances_scope before insert or update on public.deal_acceptances for each row execute function public.fill_deal_scope('with_brand', 'with_talent');
drop trigger if exists trg_deliverable_versions_scope on public.deliverable_versions;
create trigger trg_deliverable_versions_scope before insert or update on public.deliverable_versions for each row execute function public.fill_deal_scope('with_brand', 'with_talent');

create or replace function public.fill_task_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid; v_brand uuid; v_talent_agency uuid;
begin
  if new.deal_id is not null then
    new.scope_type := 'deal';
    select d.agency_id, d.brand_id into v_agency, v_brand from public.deals d where d.id = new.deal_id;
    if v_agency is null then raise exception 'deal_not_found' using errcode = 'P0002'; end if;
    new.agency_id := v_agency; new.brand_id := v_brand;
  elsif new.talent_id is not null then
    new.scope_type := 'talent'; new.brand_id := null;
  else
    new.scope_type := 'agency'; new.brand_id := null;
  end if;
  if new.talent_id is not null then
    select t.agency_id into v_talent_agency from public.talent_profiles t where t.id = new.talent_id;
    if v_talent_agency is distinct from new.agency_id then raise exception 'talent_agency_mismatch' using errcode = '22023'; end if;
  end if;
  if new.deliverable_id is not null and not exists (select 1 from public.deliverables x where x.id = new.deliverable_id and x.deal_id = new.deal_id) then
    raise exception 'deliverable_mismatch' using errcode = '22023';
  end if;
  if new.status = 'done' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; new.completed_by := null; end if;
  return new;
end $$;
revoke execute on function public.fill_task_scope() from public, anon, authenticated;
drop trigger if exists trg_tasks_scope on public.tasks;
create trigger trg_tasks_scope before insert or update on public.tasks for each row execute function public.fill_task_scope();

-- 2) leitura ----------------------------------------------------------------------------------------------------
-- negócios em que o creator está confirmado/contratado (termos e aceites: nunca para quem só foi consultado)
create or replace function public.my_talent_contract_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.deal_id), '{}'::uuid[]) from public.deal_talents dt
  where dt.talent_id = public.my_talent_id() and dt.status in ('proposed', 'contracted')
$$;
revoke execute on function public.my_talent_contract_deal_ids() from public, anon;
grant execute on function public.my_talent_contract_deal_ids() to authenticated, service_role;
-- termos: agência (gestor+ tudo; colaborador os negócios dele); marca e creator só depois de enviados
drop policy if exists deal_terms_select_agency on public.deal_terms;
create policy deal_terms_select_agency on public.deal_terms for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deal_terms_select_brand on public.deal_terms;
-- (só o que foi de fato enviado: um rascunho retirado nunca teve sent_at)
create policy deal_terms_select_brand on public.deal_terms for select to authenticated
  using (status <> 'draft' and sent_at is not null and deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
drop policy if exists deal_terms_select_talent on public.deal_terms;
create policy deal_terms_select_talent on public.deal_terms for select to authenticated
  using (status <> 'draft' and sent_at is not null and deal_id = any ((select public.my_talent_contract_deal_ids())::uuid[]));
-- aceites: agência; marca só o próprio aceite (os dos creators chegam por deal_execution, sem quem/nota); creator só os dele
drop policy if exists deal_acceptances_select_agency on public.deal_acceptances;
create policy deal_acceptances_select_agency on public.deal_acceptances for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deal_acceptances_select_brand on public.deal_acceptances;
create policy deal_acceptances_select_brand on public.deal_acceptances for select to authenticated
  using (party = 'brand' and deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
drop policy if exists deal_acceptances_select_talent on public.deal_acceptances;
create policy deal_acceptances_select_talent on public.deal_acceptances for select to authenticated
  using (party = 'talent' and deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]));
-- tarefas: gestor+ tudo; colaborador as dele, as que criou e as dos negócios dele; creator lado talent dele; marca lado brand
create or replace function public.my_task_ids_staff()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(t.id), '{}'::uuid[]) from public.tasks t
  where t.agency_id = any (public.my_agency_ids('staff')) and (t.assignee_id = auth.uid() or t.created_by = auth.uid())
$$;
revoke execute on function public.my_task_ids_staff() from public, anon;
grant execute on function public.my_task_ids_staff() to authenticated, service_role;
drop policy if exists tasks_select_agency on public.tasks;
create policy tasks_select_agency on public.tasks for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[])
         or id = any ((select public.my_task_ids_staff())::uuid[]));
drop policy if exists tasks_select_talent on public.tasks;
create policy tasks_select_talent on public.tasks for select to authenticated
  using (side = 'talent' and talent_id = (select public.my_talent_id()) and (deal_id is null or deal_id = any ((select public.my_talent_deal_ids())::uuid[])));
drop policy if exists tasks_select_brand on public.tasks;
create policy tasks_select_brand on public.tasks for select to authenticated
  using (side = 'brand' and deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
-- versões de entrega: como deliverables
drop policy if exists deliverable_versions_select_agency on public.deliverable_versions;
create policy deliverable_versions_select_agency on public.deliverable_versions for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deliverable_versions_select_talent on public.deliverable_versions;
create policy deliverable_versions_select_talent on public.deliverable_versions for select to authenticated
  using (deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]));
drop policy if exists deliverable_versions_select_brand on public.deliverable_versions;
create policy deliverable_versions_select_brand on public.deliverable_versions for select to authenticated
  using (deal_talent_id = any ((select public.my_brand_deal_talent_ids())::uuid[]));

-- 3) termos demonstrativos -----------------------------------------------------------------------------------------
create or replace function public.agency_terms_save(p_deal uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_id uuid; v_version int; v_valid date;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, false);
  select * into d from public.deals where id = p_deal;
  if public.deal_stage_index(d.stage) < 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  begin v_valid := nullif(btrim(coalesce(p_data ->> 'valid_until', '')), '')::date; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
  select t.id into v_id from public.deal_terms t where t.deal_id = p_deal and t.status = 'draft';
  begin
    if v_id is null then
      select coalesce(max(version), 0) + 1 into v_version from public.deal_terms where deal_id = p_deal;
      insert into public.deal_terms (agency_id, brand_id, deal_id, version, status, summary, usage_rights, exclusivity, valid_until, created_by)
      values (d.agency_id, d.brand_id, p_deal, v_version, 'draft', btrim(coalesce(p_data ->> 'summary', '')), btrim(coalesce(p_data ->> 'usage_rights', '')),
              btrim(coalesce(p_data ->> 'exclusivity', '')), v_valid, auth.uid())
      returning id into v_id;
    else
      update public.deal_terms set
        summary = case when p_data ? 'summary' then btrim(coalesce(p_data ->> 'summary', '')) else summary end,
        usage_rights = case when p_data ? 'usage_rights' then btrim(coalesce(p_data ->> 'usage_rights', '')) else usage_rights end,
        exclusivity = case when p_data ? 'exclusivity' then btrim(coalesce(p_data ->> 'exclusivity', '')) else exclusivity end,
        valid_until = case when p_data ? 'valid_until' then v_valid else valid_until end
      where id = v_id;
    end if;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('terms.save', 'deal_terms', v_id::text, null, jsonb_build_object('agency_id', v_agency, 'deal_id', p_deal), null, public.talent_audit_actor('agency', v_agency));
  return v_id;
end $$;

-- envia os termos: a versão viva anterior (e os aceites dela) deixa de valer; marca e creators confirmados são avisados
create or replace function public.agency_terms_send(p_terms uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; d public.deals%rowtype; v_agency uuid; r record; v_to uuid; v_brand text;
begin
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(t.deal_id, false);
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(btrim(t.summary)) < 20 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = t.deal_id;
  if d.stage not in ('approved', 'contracting') then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  update public.deal_terms set status = 'superseded' where deal_id = t.deal_id and status in ('sent', 'accepted');
  update public.deal_terms set status = 'sent', sent_at = now(), sent_by = auth.uid() where id = p_terms;
  if d.stage = 'approved' then update public.deals set stage = 'contracting', stage_changed_at = now() where id = d.id; end if;
  select b.name into v_brand from public.brands b where b.id = d.brand_id;
  perform public.audit_log('terms.send', 'deal_terms', p_terms::text, jsonb_build_object('agency_id', v_agency, 'status', 'draft'),
    jsonb_build_object('agency_id', v_agency, 'status', 'sent', 'version', t.version), null, public.talent_audit_actor('agency', v_agency));
  perform public.inbox_notify_brand(d.brand_id, true, 'contract_acceptance_requested', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title), v_agency, 'proposal', p_terms, 'terms:' || p_terms::text || ':brand');
  for r in select dt.id, dt.talent_id from public.deal_talents dt where dt.deal_id = d.id and dt.status in ('proposed', 'contracted') loop
    v_to := public.talent_user_id(r.talent_id);
    perform public.inbox_notify(v_to, 'contract_acceptance_requested', '/creator/escritorio/oportunidades/' || r.id::text,
      jsonb_build_object('deal', d.title, 'brand', v_brand), v_agency, 'proposal', p_terms, 'terms:' || p_terms::text || ':' || r.id::text);
  end loop;
end $$;

create or replace function public.agency_terms_withdraw(p_terms uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; v_agency uuid;
begin
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(t.deal_id, false);
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status not in ('draft', 'sent') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  -- rascunho nunca chegou a ninguém: some (um "retirado" sem envio vazaria o texto interno para marca e creators)
  if t.status = 'draft' then delete from public.deal_terms where id = p_terms;
  else update public.deal_terms set status = 'withdrawn' where id = p_terms;
  end if;
  perform public.audit_log('terms.withdraw', 'deal_terms', p_terms::text, jsonb_build_object('agency_id', v_agency, 'status', t.status),
    jsonb_build_object('agency_id', v_agency, 'status', case when t.status = 'draft' then 'deleted' else 'withdrawn' end), null, public.talent_audit_actor('agency', v_agency));
end $$;

-- aceite (demonstrativo) pela marca: só o dono, nos termos enviados do negócio dela
create or replace function public.brand_terms_accept(p_terms uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; d public.deals%rowtype; v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.deal_terms where id = p_terms for update;
  -- rascunho não existe para a marca (a política também o esconde)
  if t.id is null or t.status = 'draft' or public.brand_member_of(t.brand_id) is distinct from 'owner' or not (t.deal_id = any (public.my_brand_deal_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if t.status <> 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.valid_until is not null and t.valid_until < current_date then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, method, accepted_by, note)
  values (t.agency_id, t.brand_id, t.deal_id, p_terms, 'brand', 'in_app', auth.uid(), v_note)
  on conflict (terms_id, party, deal_talent_id) do nothing;
  select * into d from public.deals where id = t.deal_id;
  perform public.audit_log('terms.accept', 'deal_terms', p_terms::text, null, jsonb_build_object('agency_id', t.agency_id, 'party', 'brand', 'method', 'in_app'), nullif(v_note, ''), 'brand'::public.actor_type);
  perform public.inbox_notify_agency(t.agency_id, 'manager', 'campaign_status_changed', '/agencia/negocios/' || t.deal_id::text || '/termos',
    jsonb_build_object('deal', d.title, 'status', 'brand_accepted'), 'proposal', p_terms, 'accept:' || p_terms::text || ':brand');
  if d.owner_id is not null then
    perform public.inbox_notify(d.owner_id, 'campaign_status_changed', '/agencia/negocios/' || t.deal_id::text || '/termos',
      jsonb_build_object('deal', d.title, 'status', 'brand_accepted'), t.agency_id, 'proposal', p_terms, 'accept:' || p_terms::text || ':brand:' || d.owner_id::text);
  end if;
end $$;

-- aceite (demonstrativo) pelo creator confirmado
create or replace function public.talent_terms_accept(p_terms uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; dt public.deal_talents%rowtype; d public.deals%rowtype; v_note text := btrim(coalesce(p_note, '')); v_name text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into dt from public.deal_talents where deal_id = t.deal_id and talent_id = public.my_talent_id();
  if dt.id is null or dt.status not in ('proposed', 'contracted') or t.status = 'draft' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.status <> 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.valid_until is not null and t.valid_until < current_date then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, deal_talent_id, talent_id, method, accepted_by, note)
  values (t.agency_id, t.brand_id, t.deal_id, p_terms, 'talent', dt.id, dt.talent_id, 'in_app', auth.uid(), v_note)
  on conflict (terms_id, party, deal_talent_id) do nothing;
  select * into d from public.deals where id = t.deal_id;
  select x.display_name into v_name from public.talent_profiles x where x.id = dt.talent_id;
  perform public.audit_log('terms.accept', 'deal_terms', p_terms::text, null, jsonb_build_object('agency_id', t.agency_id, 'party', 'talent', 'deal_talent_id', dt.id, 'method', 'in_app'),
    nullif(v_note, ''), 'creator'::public.actor_type);
  perform public.inbox_notify_agency(t.agency_id, 'manager', 'campaign_status_changed', '/agencia/negocios/' || t.deal_id::text || '/termos',
    jsonb_build_object('deal', d.title, 'talent', v_name, 'status', 'talent_accepted'), 'proposal', p_terms, 'accept:' || p_terms::text || ':' || dt.id::text);
end $$;

-- aceite recebido fora do app, registrado pela agência (marca por e-mail; talento sem login), com nota
create or replace function public.agency_record_acceptance(p_terms uuid, p_party text, p_deal_talent uuid default null, p_document uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; dt public.deal_talents%rowtype; v_agency uuid; v_note text := btrim(coalesce(p_note, ''));
begin
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(t.deal_id, false);
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status <> 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_party not in ('brand', 'talent') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if char_length(v_note) < 5 or char_length(v_note) > 500 then raise exception 'note_required' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from public.documents x where x.id = p_document and x.deal_id = t.deal_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_party = 'talent' then
    select * into dt from public.deal_talents where id = p_deal_talent and deal_id = t.deal_id and status in ('proposed', 'contracted');
    if dt.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if public.talent_user_id(dt.talent_id) is not null then raise exception 'talent_has_login' using errcode = 'P0001'; end if;
    insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, deal_talent_id, talent_id, document_id, method, accepted_by, note)
    values (t.agency_id, t.brand_id, t.deal_id, p_terms, 'talent', dt.id, dt.talent_id, p_document, 'recorded_by_agency', auth.uid(), v_note)
    on conflict (terms_id, party, deal_talent_id) do nothing;
  else
    insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, document_id, method, accepted_by, note)
    values (t.agency_id, t.brand_id, t.deal_id, p_terms, 'brand', p_document, 'recorded_by_agency', auth.uid(), v_note)
    on conflict (terms_id, party, deal_talent_id) do nothing;
  end if;
  perform public.audit_log('terms.accept', 'deal_terms', p_terms::text, null,
    jsonb_build_object('agency_id', v_agency, 'party', p_party, 'deal_talent_id', p_deal_talent, 'method', 'recorded_by_agency', 'document_id', p_document), v_note,
    public.talent_audit_actor('agency', v_agency));
end $$;

-- 4) modelo de tarefas (D12) e geração ----------------------------------------------------------------------------
create or replace function public.task_template_steps()
returns table (step smallint, side text, per_talent boolean, anchor text, days int) language sql immutable set search_path = '' as $$
  values (1::smallint, 'agency', false, 'A', 1), (2, 'agency', false, 'A', 2), (3, 'agency', false, 'A', 3),
         (4, 'talent', true, 'S', -7), (5, 'brand', true, 'S', -5), (6, 'talent', true, 'S', -3), (7, 'talent', true, 'S', -2),
         (8, 'brand', true, 'S', -1), (9, 'talent', true, 'S', 0), (10, 'talent', true, 'S', 2),
         (11, 'agency', false, 'E', 5), (12, 'agency', false, 'E', 10)
$$;
revoke execute on function public.task_template_steps() from public, anon;
grant execute on function public.task_template_steps() to authenticated, service_role;

create or replace function public.agency_tasks_generate(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_tz text; v_a date; v_s date; v_e date; r record; s record; v_due timestamptz; v_assignee uuid; v_count int := 0; v_id uuid; v_floor timestamptz;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or d.contract_confirmed_at is null then return 0; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = d.agency_id), 'America/Sao_Paulo');
  v_a := (d.contract_confirmed_at at time zone v_tz)::date;
  v_s := coalesce(d.expected_start, v_a + 14);
  v_e := greatest(coalesce(d.expected_end, v_s + 14), v_s);
  v_floor := ((v_a + 1)::timestamp + interval '18 hours') at time zone v_tz;
  for s in select * from public.task_template_steps() order by step loop
    v_due := greatest(((case s.anchor when 'A' then v_a when 'S' then v_s else v_e end + s.days)::timestamp + interval '18 hours') at time zone v_tz, v_floor);
    if s.per_talent then
      for r in select dt.id, dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'contracted' loop
        v_assignee := case s.side when 'talent' then public.talent_user_id(r.talent_id) when 'agency' then d.owner_id else null end;
        insert into public.tasks (agency_id, deal_id, talent_id, template_step, side, assignee_id, due_at, created_by)
        values (d.agency_id, p_deal, r.talent_id, s.step, s.side, v_assignee, v_due, auth.uid())
        on conflict (deal_id, template_step, talent_id) where template_step is not null do nothing
        returning id into v_id;
        if v_id is not null then
          v_count := v_count + 1;
          if v_assignee is not null and s.side = 'talent' then
            perform public.inbox_notify(v_assignee, 'task_assigned', '/creator/escritorio/tarefas', jsonb_build_object('deal', d.title, 'step', s.step::text, 'date', to_char(v_due, 'YYYY-MM-DD')),
              d.agency_id, 'task', v_id, 'task:' || v_id::text);
          end if;
          v_id := null;
        end if;
      end loop;
    else
      insert into public.tasks (agency_id, deal_id, talent_id, template_step, side, assignee_id, due_at, created_by)
      values (d.agency_id, p_deal, null, s.step, s.side, d.owner_id, v_due, auth.uid())
      on conflict (deal_id, template_step, talent_id) where template_step is not null do nothing
      returning id into v_id;
      if v_id is not null then
        v_count := v_count + 1;
        if d.owner_id is not null then
          perform public.inbox_notify(d.owner_id, 'task_assigned', '/agencia/negocios/' || p_deal::text || '/tarefas', jsonb_build_object('deal', d.title, 'step', s.step::text, 'date', to_char(v_due, 'YYYY-MM-DD')),
            d.agency_id, 'task', v_id, 'task:' || v_id::text);
        end if;
        v_id := null;
      end if;
    end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.agency_tasks_generate(uuid) from public, anon, authenticated;

-- conclui (ou reabre) um passo do modelo para um creator, a partir das entregas
create or replace function public.task_step_set(p_deal uuid, p_talent uuid, p_step smallint, p_status text, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set status = p_status, completed_by = case when p_status = 'done' then auth.uid() end,
    feedback = case when p_feedback is not null then left(p_feedback, 1000) else feedback end
  where deal_id = p_deal and talent_id is not distinct from p_talent and template_step = p_step and status <> 'cancelled';
end $$;
revoke execute on function public.task_step_set(uuid, uuid, smallint, text, text) from public, anon, authenticated;

-- contratação confirmada: aceite da marca + de todos os creators confirmados nos termos vivos → produção
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

-- tarefas avulsas e edição (datas, responsável, descrição; o título do modelo vem do i18n)
create or replace function public.task_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; t public.tasks%rowtype; v_agency uuid; v_deal uuid; v_talent uuid; v_assignee uuid; v_due timestamptz; v_side text; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_id is not null then
    select * into t from public.tasks where id = v_id for update;
    if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_agency := t.agency_id;
  else
    begin v_agency := (p_data ->> 'agency_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
  end if;
  if not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  begin
    v_deal := case when v_id is null then nullif(btrim(coalesce(p_data ->> 'deal_id', '')), '')::uuid else t.deal_id end;
    v_talent := case when v_id is null then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else t.talent_id end;
    v_assignee := case when p_data ? 'assignee_id' then nullif(btrim(coalesce(p_data ->> 'assignee_id', '')), '')::uuid else t.assignee_id end;
    v_due := case when p_data ? 'due_at' then nullif(btrim(coalesce(p_data ->> 'due_at', '')), '')::timestamptz else t.due_at end;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_side := coalesce(nullif(p_data ->> 'side', ''), t.side, 'agency');
  v_title := btrim(coalesce(p_data ->> 'title', t.title, ''));
  -- o negócio decide a agência: ninguém grava tarefa num negócio de outra agência (o gatilho copiaria o escopo dele)
  if v_deal is not null and (select x.agency_id from public.deals x where x.id = v_deal) is distinct from v_agency then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- tarefa avulsa nunca é do lado da marca (os passos 5 e 8 vêm só do modelo)
  if v_side = 'brand' and (v_id is null or t.template_step is null) then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- quem pode: gestor+; colaborador só sem negócio (agência/talento) ou em negócio dele; a tarefa criada por ele também
  if not public.agency_can(v_agency, 'manager') then
    if v_deal is not null then perform public.deal_write_scope(v_deal, true);
    elsif v_id is not null and t.created_by <> auth.uid() and t.assignee_id is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if v_assignee is not null then
    if v_side = 'talent' then
      if v_talent is null or public.talent_user_id(v_talent) is distinct from v_assignee then raise exception 'invalid_input' using errcode = '22023'; end if;
    elsif not exists (select 1 from public.agency_members m where m.agency_id = v_agency and m.user_id = v_assignee and m.revoked_at is null) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;
  if v_side = 'talent' and v_talent is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    if v_id is null then
      insert into public.tasks (agency_id, scope_type, deal_id, talent_id, title, description, side, assignee_id, due_at, created_by)
      values (v_agency, 'agency', v_deal, v_talent, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), v_side, v_assignee, v_due, auth.uid())
      returning id into v_id;
    else
      update public.tasks set
        title = case when t.template_step is null then v_title else '' end,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        side = case when t.template_step is null then v_side else side end,
        assignee_id = v_assignee, due_at = v_due
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_assignee is not null and v_assignee <> auth.uid() and (t.id is null or t.assignee_id is distinct from v_assignee) then
    perform public.inbox_notify(v_assignee, 'task_assigned', case when v_side = 'talent' then '/creator/escritorio/tarefas' else '/agencia/tarefas' end,
      jsonb_build_object('title', case when t.template_step is not null then '' else v_title end, 'step', coalesce(t.template_step::text, ''), 'date', coalesce(to_char(v_due, 'YYYY-MM-DD'), '')),
      v_agency, 'task', v_id, 'task:' || v_id::text || ':' || v_assignee::text);
  end if;
  return v_id;
end $$;

-- muda a situação: responsável, gestor+, colaborador do negócio, creator nas dele. Passos 5 e 8 só pelas decisões.
create or replace function public.task_set_status(p_task uuid, p_status text, p_attachment jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype; v_url text; v_doc uuid; v_side text; d public.deals%rowtype; v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_status not in ('todo', 'doing', 'blocked', 'done', 'cancelled') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into t from public.tasks where id = p_task for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.side = 'talent' and t.talent_id = public.my_talent_id() then
    v_side := 'talent';
    if p_status = 'cancelled' then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif public.agency_can(t.agency_id, 'manager') or t.assignee_id = auth.uid() or t.created_by = auth.uid()
        or (t.deal_id is not null and t.deal_id = any (public.my_staff_deal_ids())) then
    v_side := 'agency';
  elsif public.agency_can(t.agency_id, 'staff') or t.talent_id = public.my_talent_id() then
    raise exception 'forbidden' using errcode = '42501';
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- passos 5 e 8 só mudam pelas decisões da marca (nem reabrir nem cancelar por fora)
  if t.template_step in (5, 8) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.status = 'cancelled' and v_side = 'talent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.deal_id is not null and (select x.stage from public.deals x where x.id = t.deal_id) = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if p_attachment is not null then
    begin
      v_url := nullif(btrim(coalesce(p_attachment ->> 'url', '')), '');
      v_doc := nullif(btrim(coalesce(p_attachment ->> 'document_id', '')), '')::uuid;
    exception when others then raise exception 'invalid_input' using errcode = '22023';
    end;
    -- documento pronto, não restrito, do negócio (e, pelo creator, só um que ele já enxerga)
    if v_doc is not null and not exists (select 1 from public.documents x where x.id = v_doc and x.deal_id = t.deal_id and x.kind <> 'contract'
                                        and x.status = 'ready' and not x.restricted and (v_side <> 'talent' or x.share_talent)
                                        and (t.talent_id is null or x.talent_id is null or x.talent_id = t.talent_id)) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  -- passos 4 e 7 só concluem com anexo (roteiro / conteúdo)
  if t.template_step in (4, 7) and p_status = 'done' and coalesce(v_url, t.attachment_url) is null and coalesce(v_doc, t.attachment_document_id) is null then
    raise exception 'file_missing' using errcode = 'P0001';
  end if;
  begin
    update public.tasks set status = p_status, completed_by = case when p_status = 'done' then auth.uid() end,
      attachment_url = coalesce(v_url, attachment_url), attachment_document_id = coalesce(v_doc, attachment_document_id)
    where id = p_task;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  -- roteiro enviado (passo 4): o anexo vai para o passo 5 (marca), documento passa a share_brand, marca avisada
  if t.template_step = 4 and p_status = 'done' then
    select * into d from public.deals where id = t.deal_id;
    update public.tasks set status = 'todo', attachment_url = coalesce(v_url, t.attachment_url), attachment_document_id = coalesce(v_doc, t.attachment_document_id), feedback = ''
    where deal_id = t.deal_id and talent_id = t.talent_id and template_step = 5;
    if coalesce(v_doc, t.attachment_document_id) is not null then update public.documents set share_brand = true where id = coalesce(v_doc, t.attachment_document_id); end if;
    perform public.inbox_notify_brand(d.brand_id, false, 'deliverable_submitted', '/marca/campanhas/' || d.request_id::text,
      jsonb_build_object('deal', d.title, 'step', 'script'), d.agency_id, 'task', t.id, 'script:' || t.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
    if d.owner_id is not null and d.owner_id <> auth.uid() then
      perform public.inbox_notify(d.owner_id, 'deliverable_submitted', '/agencia/negocios/' || d.id::text || '/tarefas', jsonb_build_object('deal', d.title, 'step', 'script'),
        d.agency_id, 'task', t.id, 'script:' || t.id::text || ':owner:' || to_char(now(), 'YYYYMMDDHH24MI'));
    end if;
  end if;
  perform public.audit_log('task.status', 'task', p_task::text, jsonb_build_object('agency_id', t.agency_id, 'status', t.status),
    jsonb_build_object('agency_id', t.agency_id, 'status', p_status, 'step', t.template_step), null,
    case when v_side = 'talent' then 'creator'::public.actor_type else public.talent_audit_actor('agency', t.agency_id) end);
end $$;

-- decisão da marca sobre o roteiro (passo 5): aprova, ou pede ajustes (passo 4 volta com o feedback)
create or replace function public.brand_task_decide(p_task uuid, p_decision text, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype; d public.deals%rowtype; v_feedback text := btrim(coalesce(p_feedback, '')); v_side text; v_to uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'changes') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into t from public.tasks where id = p_task for update;
  if t.id is null or coalesce(t.template_step, 0) <> 5 then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where id = t.deal_id;
  if d.brand_visible and public.brand_member_of(d.brand_id) is not null then
    v_side := 'brand';
  elsif public.agency_can(t.agency_id, 'manager') or t.deal_id = any (public.my_staff_deal_ids()) then
    v_side := 'agency';
    if char_length(v_feedback) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if t.status = 'done' or not exists (select 1 from public.tasks x where x.deal_id = t.deal_id and x.talent_id = t.talent_id and x.template_step = 4 and x.status = 'done') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_decision = 'changes' and char_length(v_feedback) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(v_feedback) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'approve' then
    update public.tasks set status = 'done', completed_by = auth.uid(), feedback = v_feedback where id = p_task;
  else
    update public.tasks set status = 'todo', feedback = v_feedback where id = p_task;
    update public.tasks set status = 'todo', feedback = v_feedback where deal_id = t.deal_id and talent_id = t.talent_id and template_step = 4;
  end if;
  perform public.audit_log('task.script_decide', 'task', p_task::text, null, jsonb_build_object('agency_id', t.agency_id, 'decision', p_decision, 'side', v_side), nullif(v_feedback, ''),
    case when v_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', t.agency_id) end);
  v_to := public.talent_user_id(t.talent_id);
  perform public.inbox_notify(v_to, 'deliverable_decided', '/creator/escritorio/tarefas', jsonb_build_object('deal', d.title, 'step', 'script', 'status', p_decision),
    t.agency_id, 'task', t.id, 'script-decide:' || t.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_decided', '/agencia/negocios/' || d.id::text || '/tarefas', jsonb_build_object('deal', d.title, 'step', 'script', 'status', p_decision),
      t.agency_id, 'task', t.id, 'script-decide:' || t.id::text || ':owner:' || to_char(now(), 'YYYYMMDDHH24MI'));
  end if;
end $$;

-- 5) entregas: versões, decisão, publicação, comprovação -----------------------------------------------------------
-- quem pode agir por uma entrega: o creator dela ('talent') ou a agência (gestor+ / colaborador do negócio)
create or replace function public.deliverable_actor(p_deliverable uuid, out o_row public.deliverables, out o_side text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o_row from public.deliverables where id = p_deliverable;
  if o_row.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- creator: só enquanto confirmado/contratado (quem recusou ou saiu não age mais pela entrega)
  if o_row.deal_talent_id = any (public.my_talent_deal_talent_ids())
     and exists (select 1 from public.deal_talents dt where dt.id = o_row.deal_talent_id and dt.status in ('proposed', 'contracted')) then o_side := 'talent';
  elsif public.agency_can(o_row.agency_id, 'manager') or o_row.deal_id = any (public.my_staff_deal_ids()) then o_side := 'agency';
  elsif public.agency_can(o_row.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (select x.stage from public.deals x where x.id = o_row.deal_id) = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
end $$;
revoke execute on function public.deliverable_actor(uuid) from public, anon, authenticated;

-- envio de uma versão (creator, ou a agência pelo creator sem login): nunca herda aprovação anterior
create or replace function public.deliverable_submit(p_deliverable uuid, p_url text default null, p_document uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; x public.deliverables; v_side text; v_url text := nullif(btrim(coalesce(p_url, '')), ''); v_note text := btrim(coalesce(p_note, '')); v_id uuid; d public.deals%rowtype; v_stage text;
begin
  select * into a from public.deliverable_actor(p_deliverable);
  x := a.o_row; v_side := a.o_side;
  select d2.stage into v_stage from public.deals d2 where d2.id = x.deal_id;
  if public.deal_stage_index(v_stage) < 10 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if x.status not in ('planned', 'in_production', 'changes_requested') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_url is null and p_document is null then raise exception 'file_missing' using errcode = 'P0001'; end if;
  if v_url is not null and not public.brand_https_url_ok(v_url) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from public.documents doc where doc.id = p_document and doc.deal_id = x.deal_id and doc.kind in ('submission', 'media', 'other')
                                            and doc.status = 'ready' and not doc.restricted and (v_side <> 'talent' or doc.share_talent)
                                            and (doc.talent_id is null or doc.talent_id = x.talent_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.deliverables set status = 'submitted', revision = revision + 1, submission_url = v_url, submission_document_id = p_document, submission_note = v_note,
    submitted_at = now(), brand_feedback = '', decided_at = null, decided_by = null, decided_side = null
  where id = p_deliverable returning * into x;
  insert into public.deliverable_versions (agency_id, brand_id, deal_id, deliverable_id, deal_talent_id, talent_id, revision, kind, url, document_id, note, submitted_side, submitted_by)
  values (x.agency_id, x.brand_id, x.deal_id, x.id, x.deal_talent_id, x.talent_id, x.revision, 'submission', v_url, p_document, v_note, v_side, auth.uid())
  returning id into v_id;
  if p_document is not null then update public.documents set share_brand = true, share_talent = true where id = p_document; end if;
  perform public.task_step_set(x.deal_id, x.talent_id, 7::smallint, 'done');
  select * into d from public.deals where id = x.deal_id;
  perform public.audit_log('deliverable.submit', 'deliverable', p_deliverable::text, null, jsonb_build_object('agency_id', x.agency_id, 'revision', x.revision, 'side', v_side), nullif(v_note, ''),
    case when v_side = 'talent' then 'creator'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  perform public.inbox_notify_brand(d.brand_id, false, 'deliverable_submitted', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'revision', x.revision::text), x.agency_id, 'deliverable', x.id, 'submit:' || x.id::text || ':' || x.revision::text);
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_submitted', '/agencia/negocios/' || d.id::text || '/entregas', jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'revision', x.revision::text),
      x.agency_id, 'deliverable', x.id, 'submit:' || x.id::text || ':' || x.revision::text || ':owner');
  end if;
  return v_id;
end $$;

-- decisão: marca (dono ou equipe) ou a agência registrando decisão recebida fora (nota obrigatória)
create or replace function public.deliverable_decide(p_deliverable uuid, p_decision text, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; d public.deals%rowtype; v_feedback text := btrim(coalesce(p_feedback, '')); v_side text; v_to uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'changes_requested') then raise exception 'invalid_input' using errcode = '22023'; end if;
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
  v_status := p_decision;
  update public.deliverables set status = v_status, brand_feedback = v_feedback, decided_at = now(), decided_by = auth.uid(), decided_side = v_side where id = p_deliverable;
  update public.deliverable_versions set decision = p_decision, feedback = v_feedback, decided_side = v_side, decided_by = auth.uid(), decided_at = now()
  where deliverable_id = p_deliverable and kind = 'submission' and revision = x.revision;
  if p_decision = 'approved' then perform public.task_step_set(x.deal_id, x.talent_id, 8::smallint, 'done');
  else perform public.task_step_set(x.deal_id, x.talent_id, 7::smallint, 'todo', v_feedback); perform public.task_step_set(x.deal_id, x.talent_id, 8::smallint, 'todo'); end if;
  perform public.audit_log('deliverable.decide', 'deliverable', p_deliverable::text, jsonb_build_object('agency_id', x.agency_id, 'status', x.status),
    jsonb_build_object('agency_id', x.agency_id, 'status', v_status, 'side', v_side, 'revision', x.revision), nullif(v_feedback, ''),
    case when v_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  v_to := public.talent_user_id(x.talent_id);
  perform public.inbox_notify(v_to, 'deliverable_decided', '/creator/escritorio/oportunidades/' || x.deal_talent_id::text,
    jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'status', v_status), x.agency_id, 'deliverable', x.id, 'decide:' || x.id::text || ':' || x.revision::text);
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_decided', '/agencia/negocios/' || d.id::text || '/entregas', jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'status', v_status),
      x.agency_id, 'deliverable', x.id, 'decide:' || x.id::text || ':' || x.revision::text || ':owner');
  end if;
end $$;

-- publicação registrada (URL) e comprovação (URL ou documento)
create or replace function public.deliverable_publish(p_deliverable uuid, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record; x public.deliverables; v_side text; d public.deals%rowtype; v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  select * into a from public.deliverable_actor(p_deliverable);
  x := a.o_row; v_side := a.o_side;
  if x.status <> 'approved' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_url is null or not public.brand_https_url_ok(v_url) then raise exception 'invalid_url' using errcode = '22023'; end if;
  update public.deliverables set status = 'published', published_url = v_url, published_at = now() where id = p_deliverable;
  perform public.task_step_set(x.deal_id, x.talent_id, 9::smallint, 'done');
  select * into d from public.deals where id = x.deal_id;
  perform public.audit_log('deliverable.publish', 'deliverable', p_deliverable::text, null, jsonb_build_object('agency_id', x.agency_id, 'side', v_side), null,
    case when v_side = 'talent' then 'creator'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  perform public.inbox_notify_brand(d.brand_id, false, 'deliverable_published', '/marca/campanhas/' || d.request_id::text,
    jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind)), x.agency_id, 'deliverable', x.id, 'publish:' || x.id::text);
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_published', '/agencia/negocios/' || d.id::text || '/entregas', jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind)),
      x.agency_id, 'deliverable', x.id, 'publish:' || x.id::text || ':owner');
  end if;
end $$;

create or replace function public.deliverable_proof(p_deliverable uuid, p_url text default null, p_document uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; x public.deliverables; v_side text; d public.deals%rowtype; v_url text := nullif(btrim(coalesce(p_url, '')), ''); v_id uuid; v_rev smallint;
begin
  select * into a from public.deliverable_actor(p_deliverable);
  x := a.o_row; v_side := a.o_side;
  if x.status not in ('published', 'proof_submitted') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_url is null and p_document is null then raise exception 'file_missing' using errcode = 'P0001'; end if;
  if v_url is not null and not public.brand_https_url_ok(v_url) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from public.documents doc where doc.id = p_document and doc.deal_id = x.deal_id and doc.kind in ('proof', 'media', 'other')
                                            and doc.status = 'ready' and not doc.restricted and (v_side <> 'talent' or doc.share_talent)
                                            and (doc.talent_id is null or doc.talent_id = x.talent_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(max(revision), 0) + 1 into v_rev from public.deliverable_versions where deliverable_id = p_deliverable and kind = 'proof';
  update public.deliverables set status = 'proof_submitted', proof_url = coalesce(v_url, proof_url), proof_document_id = coalesce(p_document, proof_document_id), proof_at = now() where id = p_deliverable;
  insert into public.deliverable_versions (agency_id, brand_id, deal_id, deliverable_id, deal_talent_id, talent_id, revision, kind, url, document_id, submitted_side, submitted_by)
  values (x.agency_id, x.brand_id, x.deal_id, x.id, x.deal_talent_id, x.talent_id, v_rev, 'proof', v_url, p_document, v_side, auth.uid())
  returning id into v_id;
  if p_document is not null then update public.documents set share_brand = true, share_talent = true where id = p_document; end if;
  perform public.task_step_set(x.deal_id, x.talent_id, 10::smallint, 'done');
  select * into d from public.deals where id = x.deal_id;
  perform public.audit_log('deliverable.proof', 'deliverable', p_deliverable::text, null, jsonb_build_object('agency_id', x.agency_id, 'side', v_side, 'revision', v_rev), null,
    case when v_side = 'talent' then 'creator'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  if d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_published', '/agencia/negocios/' || d.id::text || '/entregas', jsonb_build_object('deal', d.title, 'title', coalesce(nullif(x.title, ''), x.kind), 'step', 'proof'),
      x.agency_id, 'deliverable', x.id, 'proof:' || x.id::text || ':' || v_rev::text);
  end if;
  return v_id;
end $$;

-- fechamento pela agência: comprovada → concluída; qualquer uma → cancelada (nota)
create or replace function public.agency_deliverable_close(p_deliverable uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; v_agency uuid; v_note text := btrim(coalesce(p_note, ''));
begin
  if p_status not in ('done', 'cancelled') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into x from public.deliverables where id = p_deliverable for update;
  if x.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(x.deal_id, true);
  if p_status = 'done' and x.status <> 'proof_submitted' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_status = 'cancelled' and x.status in ('done', 'cancelled') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_status = 'cancelled' and char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  update public.deliverables set status = p_status where id = p_deliverable;
  perform public.audit_log('deliverable.close', 'deliverable', p_deliverable::text, jsonb_build_object('agency_id', v_agency, 'status', x.status),
    jsonb_build_object('agency_id', v_agency, 'status', p_status), nullif(v_note, ''), public.talent_audit_actor('agency', v_agency));
end $$;

-- agência move a entrega para "em produção" (sem mudar versão) — útil antes do primeiro envio
-- (o estado 'planned' → 'in_production' já acontece na confirmação do contrato)

-- 6) leituras fechadas para marca e creator (tarefas e entregas com versões) --------------------------------------
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
           'valid_until', t.valid_until, 'sent_at', t.sent_at,
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

-- 7) demonstração: segunda campanha já em produção (termos aceitos, tarefas, entrega enviada e outra publicada) ----
create or replace function public.agency_demo_seed_execution(p_agency uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_brand uuid := public.seed_uuid('demo:brand:exemplo-marca'); v_talent uuid := public.seed_uuid('demo:talent:talento-exemplo');
        v_request uuid := public.seed_uuid('demo:request:inverno'); v_deal uuid := public.seed_uuid('demo:deal:inverno'); v_dt uuid := public.seed_uuid('demo:deal_talent:inverno');
        v_terms uuid := public.seed_uuid('demo:terms:inverno'); v_d1 uuid := public.seed_uuid('demo:deliverable:inverno-1'); v_d2 uuid := public.seed_uuid('demo:deliverable:inverno-2');
        v_admin uuid; v_staff uuid; v_owner uuid; v_talent_user uuid; v_tz text;
begin
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.is_demo) then return; end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency) then return; end if;
  select m.user_id into v_admin from public.agency_members m where m.agency_id = p_agency and m.role::text = 'admin' and m.revoked_at is null order by m.created_at limit 1;
  select m.user_id into v_staff from public.agency_members m where m.agency_id = p_agency and m.role::text = 'staff' and m.revoked_at is null order by m.created_at limit 1;
  select bm.user_id into v_owner from public.brand_members bm where bm.brand_id = v_brand and bm.role::text = 'owner' and bm.revoked_at is null limit 1;
  v_talent_user := public.talent_user_id(v_talent);
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo');
  delete from public.deals where id = v_deal;
  delete from public.campaign_requests where id = v_request;
  insert into public.campaign_requests (id, agency_id, brand_id, origin, created_by, talent_id, title, objective, product, target_audience, target_age_bands, target_states,
    period_start, period_end, format, location, networks, deliverables, segment_ids, notes, status, submitted_at)
  values (v_request, p_agency, v_brand, 'brand', v_owner, v_talent, 'Coleção de inverno', 'content', 'Jaquetas e leggings térmicas Exemplo', 'Quem treina ao ar livre no frio',
    array['25-34', '35-44'], array['SP', 'RS'], current_date - 10, current_date + 20, 'remote', '', array['instagram'],
    '[{"kind": "reels", "quantity": 1, "network": "instagram"}, {"kind": "stories", "quantity": 3, "network": "instagram"}]'::jsonb,
    (select coalesce(array_agg(s.id), '{}'::uuid[]) from public.talent_segments s where s.agency_id = p_agency and s.slug in ('fitness')),
    'Conteúdo leve, sem roteiro engessado. Dados fictícios de demonstração.', 'converted', now() - interval '30 days');
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
  values (p_agency, v_brand, v_request, 800000, 1200000, 'Valor de exemplo (simulado)', v_owner) on conflict (request_id) do nothing;
  insert into public.deals (id, agency_id, brand_id, request_id, title, stage, owner_id, created_by, brand_visible, talent_brief, segment_ids, expected_start, expected_end,
    stage_changed_at, confirmed_at, contract_confirmed_at, is_demo)
  values (v_deal, p_agency, v_brand, v_request, 'Coleção de inverno', 'production', v_staff, v_owner, true, 'Um reels de treino ao ar livre e três stories de bastidores com a jaqueta térmica.',
    (select coalesce(array_agg(s.id), '{}'::uuid[]) from public.talent_segments s where s.agency_id = p_agency and s.slug in ('fitness')),
    current_date - 10, current_date + 20, now() - interval '12 days', now() - interval '20 days', now() - interval '12 days', true);
  insert into public.deal_talents (id, agency_id, deal_id, talent_id, status, reasons, terms_ready, suggested_by, consulted_by, consulted_at, respond_by, responded_at, response_note, response_channel)
  values (v_dt, p_agency, v_deal, v_talent, 'contracted', '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb, true, v_owner, v_staff,
          now() - interval '25 days', now() - interval '18 days', now() - interval '22 days', 'Topo!', 'app');
  insert into public.deal_talent_fees (agency_id, deal_id, deal_talent_id, talent_id, fee_cents, set_by) values (p_agency, v_deal, v_dt, v_talent, 900000, v_admin);
  insert into public.deal_terms (id, agency_id, brand_id, deal_id, version, status, summary, usage_rights, exclusivity, valid_until, sent_at, sent_by, created_by)
  values (v_terms, p_agency, v_brand, v_deal, 1, 'accepted',
    'Produção de 1 reels e 3 stories com a coleção de inverno, publicados no Instagram do creator entre as datas combinadas. Aprovação de roteiro e conteúdo pela marca em até 2 dias úteis. Dados fictícios de demonstração.',
    'Uso orgânico pela marca por 6 meses, com crédito ao creator.', 'Sem exclusividade de categoria.', current_date + 60, now() - interval '14 days', v_admin, v_admin);
  insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, method, accepted_by, accepted_at, note)
  values (p_agency, v_brand, v_deal, v_terms, 'brand', 'in_app', v_owner, now() - interval '13 days', 'De acordo (demonstração).');
  insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, deal_talent_id, talent_id, method, accepted_by, accepted_at, note)
  values (p_agency, v_brand, v_deal, v_terms, 'talent', v_dt, v_talent, 'in_app', v_talent_user, now() - interval '13 days', '');
  insert into public.deliverables (id, agency_id, brand_id, deal_id, deal_talent_id, talent_id, kind, network, title, brief, due_at, publish_at, status, revision,
    submission_url, submission_note, submitted_at, created_by)
  values (v_d1, p_agency, v_brand, v_deal, v_dt, v_talent, 'reels', 'instagram', 'Reels: treino no frio', 'Treino matinal ao ar livre com a jaqueta térmica.',
          (current_date + 2)::timestamp + interval '18 hours', (current_date + 5)::timestamp + interval '12 hours', 'submitted', 1,
          'https://example.com/demo/reels-treino-v1', 'Primeira versão para aprovação.', now() - interval '1 day', v_staff);
  insert into public.deliverable_versions (agency_id, brand_id, deal_id, deliverable_id, deal_talent_id, talent_id, revision, kind, url, note, submitted_side, submitted_by, submitted_at)
  values (p_agency, v_brand, v_deal, v_d1, v_dt, v_talent, 1, 'submission', 'https://example.com/demo/reels-treino-v1', 'Primeira versão para aprovação.', 'talent', v_talent_user, now() - interval '1 day');
  insert into public.deliverables (id, agency_id, brand_id, deal_id, deal_talent_id, talent_id, kind, network, title, brief, due_at, publish_at, status, revision,
    submission_url, submission_note, submitted_at, brand_feedback, decided_at, decided_by, decided_side, published_url, published_at, created_by)
  values (v_d2, p_agency, v_brand, v_deal, v_dt, v_talent, 'stories', 'instagram', 'Stories: bastidores', 'Três stories mostrando a peça no dia a dia.',
          (current_date - 4)::timestamp + interval '18 hours', (current_date - 2)::timestamp + interval '12 hours', 'published', 2,
          'https://example.com/demo/stories-v2', 'Ajustei a legenda como a marca pediu.', now() - interval '3 days', 'Aprovado, ficou ótimo.', now() - interval '3 days', v_owner, 'brand',
          'https://example.com/demo/stories-publicado', now() - interval '2 days', v_staff);
  insert into public.deliverable_versions (agency_id, brand_id, deal_id, deliverable_id, deal_talent_id, talent_id, revision, kind, url, note, submitted_side, submitted_by, submitted_at, decision, feedback, decided_side, decided_by, decided_at)
  values (p_agency, v_brand, v_deal, v_d2, v_dt, v_talent, 1, 'submission', 'https://example.com/demo/stories-v1', 'Primeira versão.', 'talent', v_talent_user, now() - interval '5 days',
          'changes_requested', 'Pode trocar a legenda do segundo story para citar a coleção?', 'brand', v_owner, now() - interval '4 days'),
         (p_agency, v_brand, v_deal, v_d2, v_dt, v_talent, 2, 'submission', 'https://example.com/demo/stories-v2', 'Ajustei a legenda como a marca pediu.', 'talent', v_talent_user, now() - interval '3 days',
          'approved', 'Aprovado, ficou ótimo.', 'brand', v_owner, now() - interval '3 days');
  perform public.agency_tasks_generate(v_deal);
  -- passos já cumpridos no exemplo: 1..4 feitos, 5 aprovado, 6 feito, 7 feito (reels enviado), 9 do stories não se aplica por entrega → fica no fluxo
  update public.tasks set status = 'done', completed_at = now() - interval '9 days', completed_by = v_staff, attachment_url = case when template_step = 4 then 'https://example.com/demo/roteiro' end
  where deal_id = v_deal and template_step between 1 and 7 and status <> 'done';
  update public.tasks set assignee_id = v_staff where deal_id = v_deal and side = 'agency';
  insert into public.deal_messages (agency_id, brand_id, deal_id, channel, talent_id, author_id, author_side, author_label, body)
  values (p_agency, v_brand, v_deal, 'brand_agency', null, v_staff, 'agency', 'Colaborador (exemplo)', 'O reels de treino chegou para aprovação. Os stories já estão no ar!');
  perform public.calendar_sync_deal(v_deal);
end $$;
revoke execute on function public.agency_demo_seed_execution(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agency_demo_seed_execution(uuid, uuid) to service_role;

-- 8) execução ------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.agency_terms_save(uuid, jsonb)', 'public.agency_terms_send(uuid)', 'public.agency_terms_withdraw(uuid)',
    'public.brand_terms_accept(uuid, text)', 'public.talent_terms_accept(uuid, text)', 'public.agency_record_acceptance(uuid, text, uuid, uuid, text)',
    'public.agency_contract_confirm(uuid)', 'public.task_save(uuid, jsonb)', 'public.task_set_status(uuid, text, jsonb)', 'public.brand_task_decide(uuid, text, text)',
    'public.deliverable_submit(uuid, text, uuid, text)', 'public.deliverable_decide(uuid, text, text)', 'public.deliverable_publish(uuid, text)',
    'public.deliverable_proof(uuid, text, uuid)', 'public.agency_deliverable_close(uuid, text, text)', 'public.deal_execution(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
