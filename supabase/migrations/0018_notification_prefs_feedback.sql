-- =============================================================================
-- Ultra Hero · 0018 · Preferências de notificação (RF-023) e feedback com
-- categoria, prioridade e responsável (RF-022).
--   1. notification_preferences: opt-in por tipo e por canal, uma linha por usuário.
--      Nada é enviado na POC; a tabela guarda o consentimento que qualquer envio
--      futuro precisa respeitar. Mensagens transacionais (confirmação, senha) não
--      têm opt-out e por isso não têm coluna. A linha some com a conta (cascade).
--   2. feedback: category (validada na RPC e no check), priority, assignee e
--      admin_note só mudam pela triagem do admin (RPC auditada: feedback.triage).
--   3. submit_feedback ganha p_category. A assinatura antiga continua válida como
--      atalho (categoria 'other'), em security invoker: a lista de security definer
--      executáveis por anon não muda.
-- Idempotente e sem remoções: pode ser reaplicada.
-- =============================================================================

-- ---------------------------------------------------------------- 1) preferências de notificação
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  editorial_digest boolean not null default false,
  streak_reminders boolean not null default false,
  commerce_updates boolean not null default false,
  channel_email boolean not null default true,
  channel_push boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_notification_preferences_updated_at' and tgrelid = 'public.notification_preferences'::regclass
  ) then
    create trigger trg_notification_preferences_updated_at before update on public.notification_preferences
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- Só o próprio usuário lê e grava a própria linha. Sem política de remoção (a linha
-- vai embora com a conta) e nada para anon.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_preferences' and policyname = 'notification_prefs_select_own') then
    create policy notification_prefs_select_own on public.notification_preferences
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_preferences' and policyname = 'notification_prefs_insert_own') then
    create policy notification_prefs_insert_own on public.notification_preferences
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_preferences' and policyname = 'notification_prefs_update_own') then
    create policy notification_prefs_update_own on public.notification_preferences
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

revoke all on table public.notification_preferences from anon;
grant select, insert, update on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;

-- ---------------------------------------------------------------- 2) feedback: categoria, prioridade, responsável, nota
alter table public.feedback add column if not exists category text not null default 'other';
alter table public.feedback add column if not exists priority text;
alter table public.feedback add column if not exists assignee uuid references auth.users (id) on delete set null;
alter table public.feedback add column if not exists admin_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_category_check' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint feedback_category_check
      check (category in ('bug', 'suggestion', 'content', 'commerce', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_priority_check' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint feedback_priority_check
      check (priority is null or priority in ('low', 'medium', 'high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_admin_note_check' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint feedback_admin_note_check
      check (admin_note is null or char_length(admin_note) <= 1000);
  end if;
end $$;

create index if not exists feedback_triage_idx on public.feedback (category, priority, status);

-- ---------------------------------------------------------------- 3) submit_feedback com categoria
-- Implementação completa (security definer: a tabela não tem política de insert para usuários).
-- Sem defaults nesta assinatura: com default em p_category a chamada de 4 argumentos ficaria
-- ambígua para o Postgres e para o PostgREST.
create or replace function public.submit_feedback(p_context text, p_rating int, p_message text, p_locale public.locale_code, p_category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_category text := lower(btrim(coalesce(p_category, '')));
begin
  if v_category = '' then v_category := 'other'; end if;
  if v_category not in ('bug', 'suggestion', 'content', 'commerce', 'other') then raise exception 'invalid_category'; end if;
  if p_rating is null and nullif(btrim(coalesce(p_message, '')), '') is null then raise exception 'feedback_empty'; end if;
  -- antiabuso simples: máx. 20 feedbacks/dia por usuário
  if auth.uid() is not null and (select count(*) from public.feedback where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.feedback (user_id, context, rating, message, locale, category)
  values (auth.uid(), left(p_context, 120), p_rating, left(p_message, 1000), p_locale, v_category) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_feedback(text, int, text, public.locale_code, text) from public;
grant execute on function public.submit_feedback(text, int, text, public.locale_code, text) to anon, authenticated, service_role;

-- Assinatura antiga (0006) vira atalho com categoria 'other'. Security invoker: só delega.
create or replace function public.submit_feedback(p_context text, p_rating int, p_message text, p_locale public.locale_code default null)
returns uuid language sql security invoker set search_path = public as $$
  select public.submit_feedback(p_context, p_rating, p_message, p_locale, 'other')
$$;
revoke execute on function public.submit_feedback(text, int, text, public.locale_code) from public;
grant execute on function public.submit_feedback(text, int, text, public.locale_code) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4) triagem pelo admin (auditada)
-- p_patch: só as chaves presentes mudam; valor null limpa (prioridade, responsável, nota).
-- Ex.: {"priority":"high"}, {"assignee":null}, {"status":"reviewed","admin_note":"..."}.
create or replace function public.admin_triage_feedback(p_id uuid, p_patch jsonb, p_justification text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.feedback%rowtype;
  v_status text; v_priority text; v_assignee uuid; v_note text;
  v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_input'; end if;
  select * into f from public.feedback where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  v_status := f.status; v_priority := f.priority; v_assignee := f.assignee; v_note := f.admin_note;

  if p_patch ? 'status' then
    v_status := p_patch ->> 'status';
    if v_status is null or v_status not in ('new', 'reviewed', 'archived') then raise exception 'invalid_status'; end if;
  end if;
  if p_patch ? 'priority' then
    v_priority := nullif(btrim(coalesce(p_patch ->> 'priority', '')), '');
    if v_priority is not null and v_priority not in ('low', 'medium', 'high') then raise exception 'invalid_priority'; end if;
  end if;
  if p_patch ? 'assignee' then
    begin
      v_assignee := nullif(btrim(coalesce(p_patch ->> 'assignee', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_input';
    end;
    if v_assignee is not null and not exists (
      select 1 from public.role_assignments r where r.user_id = v_assignee and r.role = 'admin' and r.revoked_at is null
    ) then
      raise exception 'assignee_not_admin';
    end if;
  end if;
  if p_patch ? 'admin_note' then
    v_note := nullif(btrim(coalesce(p_patch ->> 'admin_note', '')), '');
    if char_length(coalesce(v_note, '')) > 1000 then raise exception 'note_too_long'; end if;
  end if;

  v_before := jsonb_build_object('status', f.status, 'priority', f.priority, 'assignee', f.assignee, 'admin_note', f.admin_note);
  v_after := jsonb_build_object('status', v_status, 'priority', v_priority, 'assignee', v_assignee, 'admin_note', v_note);
  if v_after is distinct from v_before then
    update public.feedback set status = v_status, priority = v_priority, assignee = v_assignee, admin_note = v_note where id = p_id;
  end if;
  perform public.audit_log('feedback.triage', 'feedback', p_id::text, v_before, v_after, nullif(btrim(coalesce(p_justification, '')), ''));
  return v_after;
end $$;
revoke execute on function public.admin_triage_feedback(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_triage_feedback(uuid, jsonb, text) to authenticated, service_role;

-- Lista curta de admins ativos (para o seletor de responsável). Só admin vê.
create or replace function public.admin_list_admins()
returns table (id uuid, email text, display_name text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text, p.display_name
  from auth.users u
  join public.role_assignments r on r.user_id = u.id and r.role = 'admin' and r.revoked_at is null
  left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by coalesce(p.display_name, u.email::text)
$$;
revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated, service_role;
