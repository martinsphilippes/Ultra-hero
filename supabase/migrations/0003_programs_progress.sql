-- =============================================================================
-- Ultra Hero · 0003 · Programas versionados, progresso, streak, conquistas,
-- certificados, biblioteca pessoal, interesses e recomendações.
-- =============================================================================

-- ---------------------------------------------------------------- programas --
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  creator_id uuid references public.creator_profiles (id) on delete set null,
  pillar public.pillar not null,
  cover_url text,
  status public.content_status not null default 'draft',
  is_featured boolean not null default false,
  featured_rank int,
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_programs_updated before update on public.programs
  for each row execute function public.set_updated_at();

create table public.program_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  version_no int not null,
  title text not null,
  summary text,
  description text,
  source_locale public.locale_code not null default 'pt-BR',
  estimated_weeks int,
  certificate_fields jsonb not null default '["display_name","program_title","completed_at","version"]'::jsonb,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, version_no)
);
alter table public.programs
  add constraint programs_current_version_fk foreign key (current_version_id)
  references public.program_versions (id) on delete set null;

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.program_versions (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete restrict,
  position int not null default 0,
  section text,
  is_required boolean not null default true,
  unique (version_id, content_id)
);
create index program_items_version_idx on public.program_items (version_id, position);

-- Substituição auditável de item obrigatório arquivado (vale para pendentes daquela versão).
create table public.program_item_substitutions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.program_versions (id) on delete cascade,
  original_content_id uuid not null references public.content (id) on delete restrict,
  replacement_content_id uuid not null references public.content (id) on delete restrict,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (version_id, original_content_id),
  check (original_content_id <> replacement_content_id)
);

create table public.program_localizations (
  version_id uuid not null references public.program_versions (id) on delete cascade,
  locale public.locale_code not null,
  title text not null,
  summary text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (version_id, locale)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  version_id uuid not null references public.program_versions (id) on delete restrict,
  status public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, version_id)
);
create unique index enrollments_one_active_idx on public.enrollments (user_id, program_id) where status = 'active';

-- ---------------------------------------------------------------- progresso --
create table public.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete restrict,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  timezone text not null,
  local_date date not null,
  completed_at timestamptz not null default now(),
  unique (user_id, content_id)
);
create index completions_user_idx on public.completions (user_id, completed_at desc);

create table public.content_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  position_seconds int not null default 0 check (position_seconds >= 0),
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create index content_progress_recent_idx on public.content_progress (user_id, updated_at desc);

create table public.streak_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('completion', 'progress', 'enrollment')),
  ref_id uuid,
  timezone text not null,
  local_date date not null,
  occurred_at timestamptz not null default now()
);
create index streak_events_user_date_idx on public.streak_events (user_id, local_date desc);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  icon text,
  rule jsonb not null default '{}'::jsonb,   -- ex.: {"kind":"streak","days":7} | {"kind":"completions","count":10} | {"kind":"program_completed"}
  is_active boolean not null default true,
  sort_order int not null default 100
);

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  enrollment_id uuid not null unique references public.enrollments (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  version_id uuid not null references public.program_versions (id) on delete restrict,
  snapshot jsonb not null,            -- campos congelados no momento da emissão
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------- biblioteca -
create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table public.custom_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_custom_lists_updated before update on public.custom_lists
  for each row execute function public.set_updated_at();

create table public.list_items (
  list_id uuid not null references public.custom_lists (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (list_id, content_id)
);

-- ---------------------------------------------------------------- interesses e recomendações
create table public.interest_tags (
  tag text primary key,
  label jsonb not null,               -- {"pt-BR":"...","en":"...","es":"..."}
  pillar public.pillar,
  sort_order int not null default 100
);

create table public.user_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag text not null references public.interest_tags (tag) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);

create table public.not_interested (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table public.user_recommendations (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  rank int not null,
  score numeric(6,3),
  reason text,
  engine text not null check (engine in ('deterministic', 'openai', 'gemini')),
  is_fallback boolean not null default true,
  generated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  trigger text not null,
  engine text not null,
  provider_model text,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  cost_estimate_usd numeric(10,6),
  candidates int,
  returned int,
  valid_rate numeric(5,4),
  error text,
  created_at timestamptz not null default now()
);
create index recommendation_runs_created_idx on public.recommendation_runs (created_at desc);

-- ---------------------------------------------------------------- funções ----

-- Data local calculada no servidor a partir do fuso do dispositivo (anti-manipulação).
create or replace function public.local_date_for(p_timezone text)
returns date language plpgsql stable as $$
declare d date;
begin
  begin
    d := (now() at time zone p_timezone)::date;
  exception when others then
    raise exception 'invalid_timezone';
  end;
  return d;
end $$;

create or replace function public.compute_streak(p_user uuid, p_timezone text default 'UTC')
returns int language plpgsql stable security definer set search_path = public as $$
declare v_today date; v_cursor date; v_streak int := 0; v_has boolean;
begin
  v_today := public.local_date_for(coalesce(nullif(p_timezone, ''), 'UTC'));
  -- começa hoje; se hoje não tem atividade, começa ontem (streak ainda não quebrou)
  select exists (select 1 from public.streak_events where user_id = p_user and local_date = v_today) into v_has;
  v_cursor := case when v_has then v_today else v_today - 1 end;
  loop
    select exists (select 1 from public.streak_events where user_id = p_user and local_date = v_cursor) into v_has;
    exit when not v_has;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;
  return v_streak;
end $$;

-- Avalia conquistas configuráveis (regras em JSON) e concede as que faltam.
create or replace function public.evaluate_achievements(p_user uuid, p_timezone text default 'UTC')
returns setof text language plpgsql security definer set search_path = public as $$
declare a record; v_ok boolean; v_streak int; v_completions int; v_programs int;
begin
  v_streak := public.compute_streak(p_user, p_timezone);
  select count(*) into v_completions from public.completions where user_id = p_user;
  select count(*) into v_programs from public.enrollments where user_id = p_user and status = 'completed';
  for a in select * from public.achievements where is_active loop
    if exists (select 1 from public.user_achievements where user_id = p_user and achievement_id = a.id) then continue; end if;
    v_ok := case a.rule ->> 'kind'
      when 'streak' then v_streak >= coalesce((a.rule ->> 'days')::int, 1)
      when 'completions' then v_completions >= coalesce((a.rule ->> 'count')::int, 1)
      when 'program_completed' then v_programs >= coalesce((a.rule ->> 'count')::int, 1)
      else false end;
    if v_ok then
      insert into public.user_achievements (user_id, achievement_id) values (p_user, a.id) on conflict do nothing;
      return next a.code;
    end if;
  end loop;
end $$;

-- Marca progresso (continuar de onde parou) e registra atividade válida do dia.
create or replace function public.track_progress(p_content uuid, p_position_seconds int, p_progress_pct int, p_timezone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_date date; v_mode public.completion_mode; v_threshold int; v_completed boolean := false;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.can_access_content(p_content) then raise exception 'content_forbidden' using errcode = '42501'; end if;
  v_date := public.local_date_for(p_timezone);

  insert into public.content_progress (user_id, content_id, position_seconds, progress_pct)
  values (v_uid, p_content, greatest(0, p_position_seconds), least(100, greatest(0, p_progress_pct)))
  on conflict (user_id, content_id) do update
    set position_seconds = excluded.position_seconds,
        progress_pct = greatest(public.content_progress.progress_pct, excluded.progress_pct),
        updated_at = now();

  -- conclusão automática por tipo (configurável pelo admin) com override por conteúdo
  select coalesce(c.completion_mode, s.default_completion_mode), s.auto_threshold_pct
    into v_mode, v_threshold
  from public.content c join public.content_type_settings s on s.type = c.type where c.id = p_content;
  if v_mode = 'auto' and p_progress_pct >= v_threshold then
    perform public.complete_content(p_content, p_timezone, 'auto');
    v_completed := true;
  end if;
  return jsonb_build_object('completed', v_completed);
end $$;

create or replace function public.complete_content(p_content uuid, p_timezone text, p_source text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_date date; v_new boolean := false; v_programs jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.can_access_content(p_content) then raise exception 'content_forbidden' using errcode = '42501'; end if;
  v_date := public.local_date_for(p_timezone);

  insert into public.completions (user_id, content_id, source, timezone, local_date)
  values (v_uid, p_content, p_source, p_timezone, v_date)
  on conflict (user_id, content_id) do nothing;
  if found then
    v_new := true;
    insert into public.streak_events (user_id, kind, ref_id, timezone, local_date)
    values (v_uid, 'completion', p_content, p_timezone, v_date);
    -- verifica conclusão de programas ativos que contenham este conteúdo
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_programs
    from (select public.check_program_completion(e.id) as x
          from public.enrollments e
          where e.user_id = v_uid and e.status = 'active'
            and exists (select 1 from public.program_items pi where pi.version_id = e.version_id and pi.content_id = p_content)) t
    where x is not null;
  end if;
  return jsonb_build_object('new', v_new, 'streak', public.compute_streak(v_uid, p_timezone),
    'achievements', (select coalesce(jsonb_agg(c), '[]'::jsonb) from public.evaluate_achievements(v_uid, p_timezone) c),
    'programs_completed', v_programs);
end $$;

create or replace function public.enroll_program(p_program uuid, p_timezone text default 'UTC')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_version uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select p.current_version_id into v_version from public.programs p
  where p.id = p_program and p.status = 'published';
  if v_version is null then raise exception 'program_unavailable'; end if;
  if exists (select 1 from public.enrollments where user_id = v_uid and program_id = p_program and status = 'active') then
    select id into v_id from public.enrollments where user_id = v_uid and program_id = p_program and status = 'active';
    return v_id;
  end if;
  insert into public.enrollments (user_id, program_id, version_id) values (v_uid, p_program, v_version)
  on conflict (user_id, version_id) do update set status = 'active' returning id into v_id;
  insert into public.streak_events (user_id, kind, ref_id, timezone, local_date)
  values (v_uid, 'enrollment', p_program, p_timezone, public.local_date_for(p_timezone));
  return v_id;
end $$;

-- Itens obrigatórios efetivos da versão (aplicando substituições) e se o usuário concluiu.
create or replace function public.program_required_items(p_version uuid)
returns table (content_id uuid, original_content_id uuid, item_position int, section text, is_required boolean, substituted boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(s.replacement_content_id, pi.content_id) as content_id,
         pi.content_id as original_content_id,
         pi.position as item_position, pi.section, pi.is_required, s.id is not null as substituted
  from public.program_items pi
  left join public.program_item_substitutions s on s.version_id = pi.version_id and s.original_content_id = pi.content_id
  where pi.version_id = p_version
  order by pi.position
$$;

create or replace function public.check_program_completion(p_enrollment uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e public.enrollments%rowtype; v_missing int; v_cert uuid; v_code text; v_snapshot jsonb;
begin
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or e.status <> 'active' then return null; end if;
  -- conta obrigatórios ainda não concluídos (vale conclusão do original OU do substituto)
  select count(*) into v_missing
  from public.program_required_items(e.version_id) r
  where r.is_required
    and not exists (select 1 from public.completions c where c.user_id = e.user_id and c.content_id in (r.content_id, r.original_content_id));
  if v_missing > 0 then return null; end if;

  update public.enrollments set status = 'completed', completed_at = now() where id = e.id;

  -- certificado simbólico: campos congelados, versão registrada
  select jsonb_build_object(
    'display_name', coalesce(p.display_name, 'Participante'),
    'program_title', pv.title,
    'program_slug', pr.slug,
    'version', pv.version_no,
    'completed_at', now(),
    'pillar', pr.pillar,
    'fields', pv.certificate_fields,
    'symbolic', true)
  into v_snapshot
  from public.program_versions pv join public.programs pr on pr.id = pv.program_id
  left join public.profiles p on p.id = e.user_id
  where pv.id = e.version_id;

  v_code := 'UH-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
  insert into public.certificates (code, user_id, enrollment_id, program_id, version_id, snapshot)
  values (v_code, e.user_id, e.id, e.program_id, e.version_id, v_snapshot)
  on conflict (enrollment_id) do nothing
  returning id into v_cert;
  return jsonb_build_object('enrollment_id', e.id, 'program_id', e.program_id, 'certificate_id', v_cert, 'code', v_code);
end $$;

-- Admin: nova versão de programa (histórico preservado; participantes continuam na versão antiga).
create or replace function public.admin_create_program_version(p_program uuid, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_no int; v_id uuid; src public.program_versions%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.program_versions where program_id = p_program;
  if p_copy_from is not null then
    select * into src from public.program_versions where id = p_copy_from and program_id = p_program;
  end if;
  insert into public.program_versions (program_id, version_no, title, summary, description, source_locale, estimated_weeks, certificate_fields, created_by)
  values (p_program, v_no, coalesce(src.title, 'Nova versão'), src.summary, src.description, coalesce(src.source_locale, 'pt-BR'), src.estimated_weeks,
          coalesce(src.certificate_fields, '["display_name","program_title","completed_at","version"]'::jsonb), auth.uid())
  returning id into v_id;
  if src.id is not null then
    insert into public.program_items (version_id, content_id, position, section, is_required)
    select v_id, content_id, position, section, is_required from public.program_items where version_id = src.id;
  end if;
  perform public.audit_log('program.version_create', 'program', p_program::text, null, jsonb_build_object('version_id', v_id, 'version_no', v_no, 'copied_from', p_copy_from));
  return v_id;
end $$;

create or replace function public.admin_publish_program_version(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_program uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select program_id into v_program from public.program_versions where id = p_version;
  if v_program is null then raise exception 'version_not_found'; end if;
  if not exists (select 1 from public.program_items where version_id = p_version) then raise exception 'version_has_no_items'; end if;
  update public.program_versions set status = 'published', published_at = coalesce(published_at, now()) where id = p_version;
  update public.programs set current_version_id = p_version, status = 'published' where id = v_program;
  perform public.audit_log('program.version_publish', 'program', v_program::text, null, jsonb_build_object('version_id', p_version));
end $$;

create or replace function public.admin_substitute_program_item(p_version uuid, p_original uuid, p_replacement uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.content where id = p_replacement and status = 'published') then raise exception 'replacement_not_published'; end if;
  insert into public.program_item_substitutions (version_id, original_content_id, replacement_content_id, reason, created_by)
  values (p_version, p_original, p_replacement, p_reason, auth.uid())
  on conflict (version_id, original_content_id) do update set replacement_content_id = excluded.replacement_content_id, reason = excluded.reason, created_by = auth.uid(), created_at = now();
  perform public.audit_log('program.item_substitute', 'program_version', p_version::text, null,
    jsonb_build_object('original', p_original, 'replacement', p_replacement), p_reason);
  -- participantes pendentes podem já ter concluído tudo com a substituição
  for e in select id from public.enrollments where version_id = p_version and status = 'active' loop
    perform public.check_program_completion(e.id);
  end loop;
end $$;

grant execute on function public.local_date_for(text), public.compute_streak(uuid, text), public.program_required_items(uuid) to anon, authenticated;
grant execute on function public.evaluate_achievements(uuid, text), public.track_progress(uuid, int, int, text),
  public.complete_content(uuid, text, text), public.enroll_program(uuid, text), public.check_program_completion(uuid),
  public.admin_create_program_version(uuid, uuid), public.admin_publish_program_version(uuid),
  public.admin_substitute_program_item(uuid, uuid, uuid, text) to authenticated;
