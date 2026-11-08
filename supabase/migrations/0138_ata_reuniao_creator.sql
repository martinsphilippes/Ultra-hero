-- =============================================================================
-- 0138 — Ata de reunião com o Hero (modelo A–K do "Direcionamento de Reuniões com Creators", Groscove Group)
--   A equipe da agência do casting registra cada reunião, como no modelo do guia:
--     A identificação · B perfil e posicionamento · C marcas e histórico comercial · D interesse nos quatro formatos ·
--     E ação aberta (Black Friday) · F projeto autoral · G cadastro e materiais · H dúvidas para retorno interno ·
--     I encaminhamentos com responsável e prazo · J resumo executivo · K formalização + checklist pós-reunião.
--   Concluir a ata exige representante, resumo, data de follow-up e ao menos um encaminhamento com responsável e
--   prazo ("toda reunião precisa terminar com próximos passos claros"). Ao concluir:
--     - os formatos marcados vão para o relacionamento do Hero (aba Relacionamento);
--     - o interesse na ação aberta vira a resposta do Hero, sem nunca passar por cima do que ele mesmo respondeu;
--     - o projeto autoral entra em "Projetos autorais" quando a equipe marca (uma vez só);
--     - o follow-up entra na agenda da agência (dia inteiro, só a equipe vê) e quem ficou com encaminhamento é avisado;
--     - a "última conversa" do Hero no casting passa a ser a data da reunião.
--   Ata é documento interno: só a equipe da agência (staff+) lê; o Hero não vê. CPF e dados bancários não entram
--   (o guia manda tratar por canal seguro): o banco recusa com sensitive_data.
--   Concluída, a ata só muda no checklist, no follow-up e nos encaminhamentos; gestor+ pode reabrir para corrigir.
--   Leitura e escrita só pelas funções abaixo (tabelas sem acesso direto do app).
-- =============================================================================

-- 1) a ata e os encaminhamentos ------------------------------------------------------------------------------------------------
create table if not exists public.creator_meetings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint creator_meetings_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint creator_meetings_talent_fk references public.talent_profiles (id) on delete cascade,
  held_at timestamptz not null,
  mode text not null default 'online' constraint creator_meetings_mode_check check (mode in ('online', 'in_person')),
  representative_id uuid,
  participants text not null default '' constraint creator_meetings_participants_check check (char_length(participants) <= 500),
  full_name text not null default '' constraint creator_meetings_full_name_check check (char_length(full_name) <= 160),
  contact_confirmed text constraint creator_meetings_contact_check check (contact_confirmed in ('yes', 'no')),
  contact_fix text not null default '' constraint creator_meetings_contact_fix_check check (char_length(contact_fix) <= 300),
  notes jsonb not null default '{}'::jsonb constraint creator_meetings_notes_check check (jsonb_typeof(notes) = 'object'),
  formats jsonb not null default '{}'::jsonb constraint creator_meetings_formats_check check (jsonb_typeof(formats) = 'object'),
  action_key text constraint creator_meetings_action_fk references public.creator_actions (key) on delete set null,
  action_interest text constraint creator_meetings_action_interest_check check (action_interest in ('yes', 'no', 'depends')),
  register_idea boolean not null default false,
  checks jsonb not null default '{}'::jsonb constraint creator_meetings_checks_check check (jsonb_typeof(checks) = 'object'),
  sender_id uuid,
  sent_on date,
  follow_up_on date,
  status text not null default 'draft' constraint creator_meetings_status_check check (status in ('draft', 'final')),
  finalized_at timestamptz,
  finalized_by uuid,
  idea_id uuid constraint creator_meetings_idea_fk references public.creator_project_ideas (id) on delete set null,
  calendar_event_id uuid constraint creator_meetings_event_fk references public.calendar_events (id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists creator_meetings_talent_idx on public.creator_meetings (talent_id, held_at desc);
create index if not exists creator_meetings_agency_idx on public.creator_meetings (agency_id, held_at desc);

create table if not exists public.creator_meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null constraint creator_meeting_actions_meeting_fk references public.creator_meetings (id) on delete cascade,
  position smallint not null constraint creator_meeting_actions_position_check check (position between 1 and 20),
  title text not null constraint creator_meeting_actions_title_check check (char_length(title) between 2 and 200),
  owner_kind text not null default 'team' constraint creator_meeting_actions_owner_kind_check check (owner_kind in ('team', 'talent')),
  owner_id uuid,
  due_on date,
  status text not null default 'pending' constraint creator_meeting_actions_status_check check (status in ('pending', 'done')),
  done_at timestamptz,
  done_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_meeting_actions_owner_check check (owner_kind = 'team' or owner_id is null),
  -- adiada: a reordenação troca posições dentro da mesma chamada
  constraint creator_meeting_actions_position_unique unique (meeting_id, position) deferrable initially deferred
);
create index if not exists creator_meeting_actions_open_idx on public.creator_meeting_actions (meeting_id, status);
create index if not exists creator_meeting_actions_owner_idx on public.creator_meeting_actions (owner_id, due_on) where status = 'pending';

-- resposta da ação registrada pela equipe na reunião (null = o próprio Hero respondeu no portal)
alter table public.talent_action_responses add column if not exists meeting_id uuid
  constraint talent_action_responses_meeting_fk references public.creator_meetings (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['creator_meetings', 'creator_meeting_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- 2) avisos: encaminhamento da reunião ------------------------------------------------------------------------------------------
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
  'group_project_assigned',
  -- 0138
  'creator_meeting_action'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   'access_request',
   'casting_request', 'profile_claim',
   'onda_request',
   'creator_idea',
   'group_project',
   -- 0138
   'creator_meeting'));

-- 3) validação ------------------------------------------------------------------------------------------------------------------
-- CPF e dados bancários não entram na ata (o guia manda tratar por canal seguro)
create or replace function public.creator_meeting_text_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or not (
    p ~ '\d{3}\.\d{3}\.\d{3}-\d{2}'
    or p ~* 'cpf\D{0,4}\d{11}'
    or p ~* 'ag[eê]ncia\D{0,6}\d{3,5}[^\n]{0,30}conta\D{0,6}\d{4,}')
$$;
revoke execute on function public.creator_meeting_text_ok(text) from public, anon;
grant execute on function public.creator_meeting_text_ok(text) to authenticated, service_role;

-- campos de texto da ata (B, C, E, F, G, H, J) com o limite de cada um; vazio sai do objeto
create or replace function public.creator_meeting_notes_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare r record; v_out jsonb := '{}'::jsonb; v_max int; v_text text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  for r in select key, value from jsonb_each(p) loop
    v_max := case r.key
      when 'profile_topics' then 1000 when 'profile_platforms' then 1000 when 'profile_audience' then 1000
      when 'profile_public' then 600 when 'profile_frequency' then 600
      when 'brands_affinity' then 600 when 'brands_worked' then 600 when 'past_campaigns' then 1000
      when 'rates' then 600 when 'conflicts' then 600
      when 'action_categories' then 300 when 'action_availability' then 500 when 'action_dates' then 500
      when 'project_name' then 120 when 'project_concept' then 1500 when 'project_format' then 300
      when 'project_stage' then 300 when 'project_next' then 500
      when 'materials_notes' then 600 when 'open_questions' then 2000 when 'summary' then 2000
      else null end;
    if v_max is null or jsonb_typeof(r.value) <> 'string' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_text := btrim(r.value #>> '{}');
    if char_length(v_text) > v_max then raise exception 'invalid_input' using errcode = '22023'; end if;
    if not public.creator_meeting_text_ok(v_text) then raise exception 'sensitive_data' using errcode = '22023'; end if;
    if v_text <> '' then v_out := v_out || jsonb_build_object(r.key, v_text); end if;
  end loop;
  return v_out;
end $$;
revoke execute on function public.creator_meeting_notes_clean(jsonb) from public, anon;
grant execute on function public.creator_meeting_notes_clean(jsonb) to authenticated, service_role;

-- caixas de G (cadastro e materiais) e de K (formalização e checklist pós-reunião); só o marcado fica
create or replace function public.creator_meeting_checks_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare r record; v_out jsonb := '{}'::jsonb; v_text text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  for r in select key, value from jsonb_each(p) loop
    if r.key in ('reg_full_name', 'reg_artistic_name', 'reg_address', 'reg_phone', 'reg_email', 'reg_city',
                 'k_reviewed', 'k_saved', 'k_shared', 'k_presidency', 'k_follow_up_sent', 'k_media_kit_requested',
                 'k_calendar_sent', 'k_questions_forwarded') then
      if jsonb_typeof(r.value) <> 'boolean' then raise exception 'invalid_input' using errcode = '22023'; end if;
      if r.value = 'true'::jsonb then v_out := v_out || jsonb_build_object(r.key, true); end if;
    elsif r.key in ('media_kit', 'channels_insights', 'internal_data') then
      if jsonb_typeof(r.value) = 'null' then continue; end if;
      v_text := case when jsonb_typeof(r.value) = 'string' then r.value #>> '{}' end;
      if v_text is null or (r.key = 'internal_data' and v_text not in ('received', 'pending'))
         or (r.key <> 'internal_data' and v_text not in ('yes', 'no')) then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_object(r.key, v_text);
    else
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end loop;
  return v_out;
end $$;
revoke execute on function public.creator_meeting_checks_clean(jsonb) from public, anon;
grant execute on function public.creator_meeting_checks_clean(jsonb) to authenticated, service_role;

-- membro ativo da agência (representante, responsável, quem enviou) e o nome dele para a ata (histórico inclui ex-membro)
create or replace function public.creator_meeting_member_ok(p_agency uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.agency_members m where m.agency_id = p_agency and m.user_id = p_user and m.revoked_at is null)
$$;
revoke execute on function public.creator_meeting_member_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.creator_meeting_member_ok(uuid, uuid) to service_role;

create or replace function public.creator_meeting_member_name(p_agency uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(m.display_name), ''), u.email) from public.agency_members m join auth.users u on u.id = m.user_id
  where m.agency_id = p_agency and m.user_id = p_user
  order by m.revoked_at nulls first limit 1
$$;
revoke execute on function public.creator_meeting_member_name(uuid, uuid) from public, anon, authenticated;
grant execute on function public.creator_meeting_member_name(uuid, uuid) to service_role;

-- 4) criar (rascunho já preenchido com o que se sabe do Hero) ----------------------------------------------------------------------
create or replace function public.creator_meeting_create(p_talent uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.talent_profiles%rowtype; v_id uuid; v_formats jsonb; v_action public.creator_actions%rowtype;
        v_resp public.talent_action_responses%rowtype; v_notes jsonb := '{}'::jsonb;
begin
  select * into t from public.talent_profiles x where x.id = p_talent and x.archived_at is null;
  if t.id is null or not public.agency_can(t.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- evita ata repetida por clique duplo: no máximo 10 por Hero em 24 h
  if (select count(*) from public.creator_meetings m where m.talent_id = t.id and m.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select r.formats into v_formats from public.talent_relationship r where r.talent_id = t.id;
  select * into v_action from public.creator_actions a
  where a.agency_id = t.agency_id and a.active and current_date between a.starts_on and a.ends_on order by a.ends_on, a.key limit 1;
  if v_action.key is not null then
    select * into v_resp from public.talent_action_responses r where r.talent_id = t.id and r.action_key = v_action.key;
    v_notes := jsonb_strip_nulls(jsonb_build_object('action_categories', nullif(v_resp.categories, ''), 'action_availability', nullif(v_resp.availability, '')));
  end if;
  insert into public.creator_meetings (agency_id, talent_id, held_at, mode, representative_id, formats, action_key, action_interest, notes,
                                       created_by, updated_by)
  values (t.agency_id, t.id, now(), 'online', case when public.creator_meeting_member_ok(t.agency_id, auth.uid()) then auth.uid() end,
          coalesce(v_formats, '{}'::jsonb), v_action.key, v_resp.interest, v_notes, auth.uid(), auth.uid())
  returning id into v_id;
  perform public.audit_log('creator_meeting.create', 'creator_meeting', v_id::text, null, jsonb_build_object('talent_id', t.id), null, 'agency');
  return v_id;
end $$;
revoke execute on function public.creator_meeting_create(uuid) from public, anon;
grant execute on function public.creator_meeting_create(uuid) to authenticated, service_role;

-- 5) salvar (rascunho: tudo; concluída: checklist, follow-up e encaminhamentos) ---------------------------------------------------
create or replace function public.creator_meeting_save(p_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.creator_meetings%rowtype; v_name text; v_link text; v_data jsonb;
  v_held timestamptz; v_mode text; v_rep uuid; v_participants text; v_full text; v_contact text; v_fix text;
  v_notes jsonb; v_formats jsonb; v_action text; v_interest text; v_register boolean;
  v_checks jsonb; v_sender uuid; v_sent date; v_follow date;
  v_actions jsonb; a jsonb; v_aid uuid; v_title text; v_kind text; v_owner uuid; v_due date; v_status text;
  v_pos int := 0; v_keep uuid[] := '{}'; v_old public.creator_meeting_actions%rowtype; r record;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into m from public.creator_meetings x where x.id = p_id for update;
  if m.id is null or not public.agency_can(m.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- campo que não veio fica como está (null explícito apaga); encaminhamentos só mudam quando a lista vem
  v_data := to_jsonb(m) || p_data;

  begin
    v_sender := nullif(btrim(coalesce(v_data ->> 'sender_id', '')), '')::uuid;
    v_sent := nullif(btrim(coalesce(v_data ->> 'sent_on', '')), '')::date;
    v_follow := nullif(btrim(coalesce(v_data ->> 'follow_up_on', '')), '')::date;
    if m.status = 'draft' then
      v_held := (v_data ->> 'held_at')::timestamptz;
      v_rep := nullif(btrim(coalesce(v_data ->> 'representative_id', '')), '')::uuid;
      v_register := coalesce((v_data ->> 'register_idea')::boolean, false);
    end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_input' using errcode = '22023';
  end;
  v_checks := public.creator_meeting_checks_clean(v_data -> 'checks');
  if v_sender is not null and not public.creator_meeting_member_ok(m.agency_id, v_sender) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_sent is not null and (v_sent < date '2020-01-01' or v_sent > current_date + 366) then raise exception 'invalid_date' using errcode = '22023'; end if;

  if m.status = 'draft' then
    if v_held is null or v_held < timestamptz '2020-01-01' or v_held > now() + interval '366 days' then
      raise exception 'invalid_date' using errcode = '22023';
    end if;
    v_mode := coalesce(nullif(v_data ->> 'mode', ''), 'online');
    v_participants := btrim(coalesce(v_data ->> 'participants', ''));
    v_full := btrim(coalesce(v_data ->> 'full_name', ''));
    v_contact := nullif(v_data ->> 'contact_confirmed', '');
    v_fix := btrim(coalesce(v_data ->> 'contact_fix', ''));
    v_action := nullif(btrim(coalesce(v_data ->> 'action_key', '')), '');
    v_interest := nullif(v_data ->> 'action_interest', '');
    if v_mode not in ('online', 'in_person') or char_length(v_participants) > 500 or char_length(v_full) > 160
       or (v_contact is not null and v_contact not in ('yes', 'no')) or char_length(v_fix) > 300
       or (v_interest is not null and v_interest not in ('yes', 'no', 'depends'))
       or (v_rep is not null and not public.creator_meeting_member_ok(m.agency_id, v_rep))
       or (v_action is not null and not exists (select 1 from public.creator_actions x where x.key = v_action and x.agency_id = m.agency_id)) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if not (public.creator_meeting_text_ok(v_participants) and public.creator_meeting_text_ok(v_full) and public.creator_meeting_text_ok(v_fix)) then
      raise exception 'sensitive_data' using errcode = '22023';
    end if;
    v_notes := public.creator_meeting_notes_clean(v_data -> 'notes');
    v_formats := public.creator_formats_clean(coalesce(nullif(v_data -> 'formats', 'null'::jsonb), '{}'::jsonb));
    for r in select value from jsonb_each(v_formats) loop
      if not public.creator_meeting_text_ok(r.value ->> 'note') then raise exception 'sensitive_data' using errcode = '22023'; end if;
    end loop;
  else
    v_held := m.held_at;
    -- concluída sempre tem follow-up (foi exigido para concluir)
    if v_follow is null then raise exception 'meeting_incomplete' using errcode = 'P0001'; end if;
  end if;
  if v_follow is not null and (v_follow < (v_held at time zone 'America/Sao_Paulo')::date or v_follow > current_date + 366) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  if m.status = 'draft' then
    update public.creator_meetings
    set held_at = v_held, mode = v_mode, representative_id = v_rep, participants = v_participants, full_name = v_full,
        contact_confirmed = v_contact, contact_fix = v_fix, notes = v_notes, formats = v_formats, action_key = v_action,
        action_interest = v_interest, register_idea = v_register,
        checks = v_checks, sender_id = v_sender, sent_on = v_sent, follow_up_on = v_follow, updated_at = now(), updated_by = auth.uid()
    where id = m.id;
  else
    update public.creator_meetings
    set checks = v_checks, sender_id = v_sender, sent_on = v_sent, follow_up_on = v_follow, updated_at = now(), updated_by = auth.uid()
    where id = m.id;
    -- concluída: o follow-up acompanha na agenda
    if v_follow is not null and m.calendar_event_id is not null and v_follow is distinct from m.follow_up_on then
      update public.calendar_events
      set starts_at = (v_follow::timestamp at time zone 'America/Sao_Paulo'),
          ends_at = ((v_follow + 1)::timestamp at time zone 'America/Sao_Paulo'), updated_by = auth.uid()
      where id = m.calendar_event_id;
    end if;
  end if;

  -- I. encaminhamentos (a ordem da lista é a ordem da ata)
  if not (p_data ? 'actions') then
    perform public.audit_log('creator_meeting.save', 'creator_meeting', m.id::text, null, jsonb_build_object('status', m.status), null, 'agency');
    return;
  end if;
  v_actions := coalesce(nullif(p_data -> 'actions', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(v_actions) <> 'array' or jsonb_array_length(v_actions) > 20 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.display_name into v_name from public.talent_profiles t where t.id = m.talent_id;
  v_link := '/agencia/casting/' || m.talent_id::text || '/reunioes/' || m.id::text;
  for a in select value from jsonb_array_elements(v_actions) loop
    v_pos := v_pos + 1;
    if jsonb_typeof(a) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    begin
      v_aid := nullif(btrim(coalesce(a ->> 'id', '')), '')::uuid;
      v_owner := nullif(btrim(coalesce(a ->> 'owner_id', '')), '')::uuid;
      v_due := nullif(btrim(coalesce(a ->> 'due_on', '')), '')::date;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_input' using errcode = '22023';
    end;
    v_title := btrim(coalesce(a ->> 'title', ''));
    v_kind := coalesce(nullif(a ->> 'owner_kind', ''), 'team');
    v_status := coalesce(nullif(a ->> 'status', ''), 'pending');
    if char_length(v_title) not between 2 and 200 or v_kind not in ('team', 'talent') or v_status not in ('pending', 'done') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if not public.creator_meeting_text_ok(v_title) then raise exception 'sensitive_data' using errcode = '22023'; end if;
    if v_kind = 'talent' then v_owner := null; end if;
    if v_owner is not null and not public.creator_meeting_member_ok(m.agency_id, v_owner) then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_due is not null and (v_due < date '2020-01-01' or v_due > current_date + 730) then raise exception 'invalid_date' using errcode = '22023'; end if;
    v_old := null;
    if v_aid is not null then
      select * into v_old from public.creator_meeting_actions x where x.id = v_aid and x.meeting_id = m.id;
      if v_old.id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
      update public.creator_meeting_actions
      set position = v_pos, title = v_title, owner_kind = v_kind, owner_id = v_owner, due_on = v_due, status = v_status,
          done_at = case when v_status = 'done' then coalesce(v_old.done_at, now()) end,
          done_by = case when v_status = 'done' then coalesce(v_old.done_by, auth.uid()) end, updated_at = now()
      where id = v_aid;
    else
      insert into public.creator_meeting_actions (meeting_id, position, title, owner_kind, owner_id, due_on, status, done_at, done_by)
      values (m.id, v_pos, v_title, v_kind, v_owner, v_due, v_status,
              case when v_status = 'done' then now() end, case when v_status = 'done' then auth.uid() end)
      returning id into v_aid;
    end if;
    if v_aid = any (v_keep) then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_keep := v_keep || v_aid;
    -- ata já concluída: quem ganhou um encaminhamento novo é avisado na hora
    if m.status = 'final' and v_owner is not null and v_owner <> auth.uid() and v_status = 'pending'
       and (v_old.id is null or v_old.owner_id is distinct from v_owner) then
      perform public.inbox_notify(v_owner, 'creator_meeting_action', v_link, jsonb_build_object('talent', left(v_name, 80), 'count', 1),
        m.agency_id, 'creator_meeting', m.id, 'creator_meeting_action:' || v_aid::text || ':' || v_owner::text);
    end if;
  end loop;
  delete from public.creator_meeting_actions x where x.meeting_id = m.id and not (x.id = any (v_keep));

  perform public.audit_log('creator_meeting.save', 'creator_meeting', m.id::text, null,
    jsonb_build_object('status', m.status, 'actions', v_pos), null, 'agency');
end $$;
revoke execute on function public.creator_meeting_save(uuid, jsonb) from public, anon;
grant execute on function public.creator_meeting_save(uuid, jsonb) to authenticated, service_role;

-- 6) concluir: confere o mínimo e leva a ata para o resto da plataforma -------------------------------------------------------------
create or replace function public.creator_meeting_finalize(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.creator_meetings%rowtype; v_name text; v_link text; v_ready int; v_idea uuid; v_event uuid; v_start timestamptz; r record;
begin
  select * into m from public.creator_meetings x where x.id = p_id for update;
  if m.id is null or not public.agency_can(m.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.status <> 'draft' then raise exception 'meeting_final' using errcode = 'P0001'; end if;
  select count(*) into v_ready from public.creator_meeting_actions x
  where x.meeting_id = m.id and x.due_on is not null and (x.owner_kind = 'talent' or x.owner_id is not null);
  if m.representative_id is null or char_length(coalesce(m.notes ->> 'summary', '')) < 10 or m.follow_up_on is null or v_ready = 0
     or (m.register_idea and (char_length(coalesce(m.notes ->> 'project_name', '')) < 3 or char_length(coalesce(m.notes ->> 'project_concept', '')) < 10)) then
    raise exception 'meeting_incomplete' using errcode = 'P0001';
  end if;
  select t.display_name into v_name from public.talent_profiles t where t.id = m.talent_id;
  v_link := '/agencia/casting/' || m.talent_id::text || '/reunioes/' || m.id::text;

  -- D. formatos → relacionamento do Hero (o que ele disse por último vale)
  if m.formats <> '{}'::jsonb then
    insert into public.talent_relationship (talent_id, formats, updated_at, updated_by)
    values (m.talent_id, m.formats, now(), auth.uid())
    on conflict (talent_id) do update
      set formats = public.talent_relationship.formats || excluded.formats, updated_at = now(), updated_by = auth.uid();
  end if;

  -- E. resposta da ação aberta: nunca por cima do que o próprio Hero respondeu no portal
  if m.action_key is not null and m.action_interest is not null then
    insert into public.talent_action_responses (talent_id, action_key, interest, categories, availability, notes, updated_at, updated_by, meeting_id)
    values (m.talent_id, m.action_key, m.action_interest, left(coalesce(m.notes ->> 'action_categories', ''), 300),
            left(coalesce(m.notes ->> 'action_availability', ''), 500), '', now(), auth.uid(), m.id)
    on conflict (talent_id, action_key) do update
      set interest = excluded.interest, categories = excluded.categories, availability = excluded.availability,
          updated_at = now(), updated_by = auth.uid(), meeting_id = excluded.meeting_id
      where public.talent_action_responses.meeting_id is not null;
  end if;

  -- F. projeto autoral (uma vez só por ata)
  if m.register_idea and m.idea_id is null then
    insert into public.creator_project_ideas (talent_id, agency_id, title, concept, format, stage, needs, created_by, updated_by)
    values (m.talent_id, m.agency_id, m.notes ->> 'project_name', m.notes ->> 'project_concept', coalesce(m.notes ->> 'project_format', ''),
            coalesce(m.notes ->> 'project_stage', ''), coalesce(m.notes ->> 'project_next', ''), auth.uid(), auth.uid())
    returning id into v_idea;
    perform public.inbox_notify_agency(m.agency_id, 'manager', 'creator_idea_received',
      '/agencia/casting/' || m.talent_id::text || '/relacionamento#projetos-autorais',
      jsonb_build_object('talent', left(v_name, 80), 'title', left(m.notes ->> 'project_name', 80)), 'creator_idea', v_idea, 'creator_idea:' || v_idea::text);
  end if;

  -- follow-up na agenda da agência (dia inteiro; o Hero e a marca não veem)
  v_start := (m.follow_up_on::timestamp at time zone 'America/Sao_Paulo');
  if m.calendar_event_id is not null and exists (select 1 from public.calendar_events e where e.id = m.calendar_event_id) then
    update public.calendar_events
    set starts_at = v_start, ends_at = ((m.follow_up_on + 1)::timestamp at time zone 'America/Sao_Paulo'),
        title = left('Follow-up · ' || v_name, 160), updated_by = auth.uid()
    where id = m.calendar_event_id;
    v_event := m.calendar_event_id;
  else
    insert into public.calendar_events (agency_id, kind, title, starts_at, ends_at, all_day, talent_id, source,
                                        visible_to_brand, visible_to_talent, created_by, timezone)
    values (m.agency_id, 'meeting', left('Follow-up · ' || v_name, 160), v_start, ((m.follow_up_on + 1)::timestamp at time zone 'America/Sao_Paulo'),
            true, m.talent_id, 'manual', false, false, auth.uid(), 'America/Sao_Paulo')
    returning id into v_event;
  end if;

  -- I. quem ficou com encaminhamento é avisado (uma vez por pessoa e ata)
  for r in select x.owner_id, count(*) as n from public.creator_meeting_actions x
           where x.meeting_id = m.id and x.owner_id is not null and x.status = 'pending' and x.owner_id <> auth.uid()
           group by x.owner_id loop
    perform public.inbox_notify(r.owner_id, 'creator_meeting_action', v_link, jsonb_build_object('talent', left(v_name, 80), 'count', r.n),
      m.agency_id, 'creator_meeting', m.id, 'creator_meeting:' || m.id::text || ':' || r.owner_id::text);
  end loop;

  -- última conversa com o Hero no casting
  update public.talent_profiles set last_contact_at = m.held_at
  where id = m.talent_id and (last_contact_at is null or last_contact_at < m.held_at);

  update public.creator_meetings
  set status = 'final', finalized_at = now(), finalized_by = auth.uid(), idea_id = coalesce(m.idea_id, v_idea), calendar_event_id = v_event,
      updated_at = now(), updated_by = auth.uid()
  where id = m.id;
  perform public.audit_log('creator_meeting.finalize', 'creator_meeting', m.id::text, null,
    jsonb_build_object('talent_id', m.talent_id, 'formats', m.formats <> '{}'::jsonb, 'action_key', m.action_key, 'idea_id', v_idea), null, 'agency');
end $$;
revoke execute on function public.creator_meeting_finalize(uuid) from public, anon;
grant execute on function public.creator_meeting_finalize(uuid) to authenticated, service_role;

-- 7) reabrir (gestor+), apagar rascunho e marcar encaminhamento --------------------------------------------------------------------
create or replace function public.creator_meeting_reopen(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.creator_meetings%rowtype;
begin
  select * into m from public.creator_meetings x where x.id = p_id for update;
  if m.id is null or not public.agency_can(m.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.status <> 'final' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  -- finalized_at fica: a ata já foi concluída uma vez (não pode mais ser apagada)
  update public.creator_meetings set status = 'draft', updated_at = now(), updated_by = auth.uid() where id = p_id;
  perform public.audit_log('creator_meeting.reopen', 'creator_meeting', p_id::text, jsonb_build_object('status', 'final'),
    jsonb_build_object('status', 'draft'), null, 'agency');
end $$;
revoke execute on function public.creator_meeting_reopen(uuid) from public, anon;
grant execute on function public.creator_meeting_reopen(uuid) to authenticated, service_role;

create or replace function public.creator_meeting_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.creator_meetings%rowtype;
begin
  select * into m from public.creator_meetings x where x.id = p_id for update;
  if m.id is null or not public.agency_can(m.agency_id, 'staff')
     or (m.created_by is distinct from auth.uid() and not public.agency_can(m.agency_id, 'manager')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if m.status <> 'draft' or m.finalized_at is not null then raise exception 'meeting_final' using errcode = 'P0001'; end if;
  delete from public.creator_meetings where id = p_id;
  perform public.audit_log('creator_meeting.delete', 'creator_meeting', p_id::text, jsonb_build_object('talent_id', m.talent_id), null, null, 'agency');
end $$;
revoke execute on function public.creator_meeting_delete(uuid) from public, anon;
grant execute on function public.creator_meeting_delete(uuid) to authenticated, service_role;

create or replace function public.creator_meeting_action_set(p_action uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid;
begin
  select m.agency_id into v_agency from public.creator_meeting_actions x join public.creator_meetings m on m.id = x.meeting_id where x.id = p_action;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('pending', 'done') then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.creator_meeting_actions
  set status = p_status, done_at = case when p_status = 'done' then coalesce(done_at, now()) end,
      done_by = case when p_status = 'done' then coalesce(done_by, auth.uid()) end, updated_at = now()
  where id = p_action;
  perform public.audit_log('creator_meeting.action_set', 'creator_meeting_action', p_action::text, null, jsonb_build_object('status', p_status), null, 'agency');
end $$;
revoke execute on function public.creator_meeting_action_set(uuid, text) from public, anon;
grant execute on function public.creator_meeting_action_set(uuid, text) to authenticated, service_role;

-- 8) leituras da equipe -----------------------------------------------------------------------------------------------------------
create or replace function public.creator_meetings_list(p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid;
begin
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'held_at', m.held_at, 'mode', m.mode, 'status', m.status,
      'representative', public.creator_meeting_member_name(m.agency_id, m.representative_id),
      'follow_up_on', m.follow_up_on, 'summary', left(coalesce(m.notes ->> 'summary', ''), 240), 'checks', m.checks,
      'formats_answered', (select count(*) from jsonb_object_keys(m.formats)),
      'has_questions', coalesce(m.notes ->> 'open_questions', '') <> '',
      'actions_total', (select count(*) from public.creator_meeting_actions x where x.meeting_id = m.id),
      'actions_pending', (select count(*) from public.creator_meeting_actions x where x.meeting_id = m.id and x.status = 'pending'),
      'actions_ready', (select count(*) from public.creator_meeting_actions x
                        where x.meeting_id = m.id and x.due_on is not null and (x.owner_kind = 'talent' or x.owner_id is not null)),
      'finalized_at', m.finalized_at) order by m.held_at desc, m.created_at desc)
    from public.creator_meetings m where m.talent_id = p_talent and m.agency_id = v_agency), '[]'::jsonb);
end $$;
revoke execute on function public.creator_meetings_list(uuid) from public, anon;
grant execute on function public.creator_meetings_list(uuid) to authenticated, service_role;

create or replace function public.creator_meeting_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.creator_meetings%rowtype; t public.talent_profiles%rowtype;
begin
  select * into m from public.creator_meetings x where x.id = p_id;
  if m.id is null or not public.agency_can(m.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into t from public.talent_profiles x where x.id = m.talent_id;
  if t.agency_id is distinct from m.agency_id then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', m.id, 'talent_id', m.talent_id, 'talent_name', t.display_name, 'contact_email', t.contact_email, 'contact_phone', t.contact_phone,
    'held_at', m.held_at, 'mode', m.mode, 'representative_id', m.representative_id,
    'representative', public.creator_meeting_member_name(m.agency_id, m.representative_id),
    'participants', m.participants, 'full_name', m.full_name, 'contact_confirmed', m.contact_confirmed, 'contact_fix', m.contact_fix,
    'notes', m.notes, 'formats', m.formats, 'action_key', m.action_key, 'action_interest', m.action_interest, 'register_idea', m.register_idea,
    'idea', (select jsonb_build_object('id', i.id, 'title', i.title, 'status', i.status) from public.creator_project_ideas i where i.id = m.idea_id),
    'checks', m.checks, 'sender_id', m.sender_id, 'sender', public.creator_meeting_member_name(m.agency_id, m.sender_id), 'sent_on', m.sent_on,
    'follow_up_on', m.follow_up_on, 'status', m.status, 'finalized_at', m.finalized_at,
    'finalized_by', public.creator_meeting_member_name(m.agency_id, m.finalized_by), 'calendar_event_id', m.calendar_event_id,
    'created_at', m.created_at, 'updated_at', m.updated_at,
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'owner_kind', x.owner_kind, 'owner_id', x.owner_id,
        'owner', public.creator_meeting_member_name(m.agency_id, x.owner_id), 'due_on', x.due_on, 'status', x.status, 'done_at', x.done_at)
        order by x.position)
      from public.creator_meeting_actions x where x.meeting_id = m.id), '[]'::jsonb),
    'available_actions', coalesce((select jsonb_agg(jsonb_build_object('key', a.key, 'title', a.title, 'ends_on', a.ends_on) order by a.ends_on, a.key)
      from public.creator_actions a where a.agency_id = m.agency_id and (a.active or a.key = m.action_key)), '[]'::jsonb),
    'can_manage', public.agency_can(m.agency_id, 'manager'),
    'can_delete', m.status = 'draft' and m.finalized_at is null and (m.created_by = auth.uid() or public.agency_can(m.agency_id, 'manager')));
end $$;
revoke execute on function public.creator_meeting_get(uuid) from public, anon;
grant execute on function public.creator_meeting_get(uuid) to authenticated, service_role;

-- encaminhamentos pendentes das atas concluídas da agência (os meus, ou todos)
create or replace function public.creator_meeting_actions_open(p_agency uuid, p_mine boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(q.item order by q.due_on nulls last, q.held_at, q.position)
    from (select jsonb_build_object('id', x.id, 'title', x.title, 'owner_kind', x.owner_kind, 'owner_id', x.owner_id,
            'owner', public.creator_meeting_member_name(m.agency_id, x.owner_id), 'due_on', x.due_on, 'meeting_id', m.id, 'held_at', m.held_at,
            'talent_id', t.id, 'talent_name', t.display_name, 'photo_url', t.photo_url) as item,
            x.due_on, m.held_at, x.position
          from public.creator_meeting_actions x
          join public.creator_meetings m on m.id = x.meeting_id
          join public.talent_profiles t on t.id = m.talent_id
          where m.agency_id = p_agency and t.agency_id = p_agency and m.status = 'final' and x.status = 'pending'
            and (not coalesce(p_mine, false) or x.owner_id = auth.uid())
          order by x.due_on nulls last, m.held_at, x.position
          limit 300) q), '[]'::jsonb);
end $$;
revoke execute on function public.creator_meeting_actions_open(uuid, boolean) from public, anon;
grant execute on function public.creator_meeting_actions_open(uuid, boolean) to authenticated, service_role;

-- 9) ação aberta: a resposta do próprio Hero substitui a registrada na reunião; a lista mostra a origem ---------------------------
create or replace function public.creator_action_respond(p_action text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid := public.my_talent_id(); v_a public.creator_actions%rowtype; v_agency uuid; v_name text;
        v_interest text; v_categories text; v_availability text; v_notes text;
begin
  if auth.uid() is null or v_t is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select t.agency_id, t.display_name into v_agency, v_name from public.talent_profiles t where t.id = v_t;
  select * into v_a from public.creator_actions a where a.key = p_action;
  if v_a.key is null or v_a.agency_id <> v_agency then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_a.active or current_date not between v_a.starts_on and v_a.ends_on then raise exception 'action_closed' using errcode = 'P0001'; end if;
  v_interest := p_data ->> 'interest';
  v_categories := btrim(coalesce(p_data ->> 'categories', ''));
  v_availability := btrim(coalesce(p_data ->> 'availability', ''));
  v_notes := btrim(coalesce(p_data ->> 'notes', ''));
  if v_interest is null or v_interest not in ('yes', 'no', 'depends')
     or char_length(v_categories) > 300 or char_length(v_availability) > 500 or char_length(v_notes) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.talent_action_responses (talent_id, action_key, interest, categories, availability, notes, updated_at, updated_by, meeting_id)
  values (v_t, v_a.key, v_interest, v_categories, v_availability, v_notes, now(), auth.uid(), null)
  on conflict (talent_id, action_key) do update
    set interest = excluded.interest, categories = excluded.categories, availability = excluded.availability,
        notes = excluded.notes, updated_at = now(), updated_by = auth.uid(), meeting_id = null;
  -- a equipe (gestor+) recebe um aviso por creator e ação (a primeira resposta; mudanças aparecem na ficha)
  perform public.inbox_notify_agency(v_agency, 'manager', 'creator_action_answered', '/agencia/casting/acoes/' || v_a.key,
    jsonb_build_object('talent', left(v_name, 80), 'action', v_a.title, 'interest', v_interest), 'talent', v_t,
    'creator_action:' || v_a.key || ':' || v_t::text);
end $$;
revoke execute on function public.creator_action_respond(text, jsonb) from public, anon;
grant execute on function public.creator_action_respond(text, jsonb) to authenticated, service_role;

create or replace function public.creator_action_answers(p_action text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_a public.creator_actions%rowtype;
begin
  select * into v_a from public.creator_actions a where a.key = p_action;
  if v_a.key is null or not public.agency_can(v_a.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'action', jsonb_build_object('key', v_a.key, 'title', v_a.title, 'summary', v_a.summary, 'starts_on', v_a.starts_on,
      'ends_on', v_a.ends_on, 'active', v_a.active, 'event_id', v_a.calendar_event_id),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('talent_id', t.id, 'name', t.display_name, 'photo_url', t.photo_url,
        'interest', r.interest, 'categories', r.categories, 'availability', r.availability, 'notes', r.notes, 'updated_at', r.updated_at,
        'from_meeting', r.meeting_id is not null)
        order by case r.interest when 'yes' then 0 when 'depends' then 1 else 2 end, r.updated_at desc)
      from public.talent_action_responses r join public.talent_profiles t on t.id = r.talent_id
      where r.action_key = v_a.key and t.agency_id = v_a.agency_id and t.archived_at is null), '[]'::jsonb));
end $$;
revoke execute on function public.creator_action_answers(text) from public, anon;
grant execute on function public.creator_action_answers(text) to authenticated, service_role;
