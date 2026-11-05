-- =============================================================================
-- Groscove Ultra · 0100 · Layout dinâmico: temas sazonais ligados ao Calendário Groscove · cenário S106
-- Etapa 4 do prompt mestre da agenda (M3; auditoria-agenda.md, D9). Idempotente; nada de drop de tabela/coluna;
-- funções com search_path fixo; nenhuma função nova executável por anon (S14 segue 18).
--
-- Decisões (sem perguntar ao responsável):
--   • CAMADA sobre a identidade atual: o tema só redefine uma LISTA FECHADA de tokens (acento, acento suave, fundo e
--     superfície, por claro/escuro) por cima do template de Aparência escolhido pela pessoa, mais um fundo decorativo
--     (degradê ou imagem, com intensidade limitada), até 6 imagens decorativas nos cantos, animação on/off e uma faixa
--     opcional com texto (3 idiomas) e link. Nada de CSS livre: tudo é validado aqui (formato) e no app (contraste AA).
--   • Janela: início por data (starts_at) ou "N dias antes do evento" (lead_days, contado no fuso do tema a partir do
--     dia de início do evento); fim por data (ends_at) ou "até o fim do evento". A janela efetiva (window_start,
--     window_end, fim exclusivo) é calculada por gatilho ao salvar e quando o evento muda (datas, fuso, estado), então
--     a leitura pública não precisa enxergar calendar_events. Evento cancelado → o tema não entra (event_cancelled).
--     Evento excluído → o tema mantém a última janela calculada (vira "por data").
--   • Ativo = publicado ∧ interruptor global ligado ∧ evento não cancelado ∧ now() ∈ [window_start, window_end).
--     Sem cron e sem admin conectado: calculado na requisição (o app guarda por até 5 min). Coincidindo, vence a maior
--     prioridade; empate → início mais recente; depois o id (estável). Acabou → volta ao padrão ou ao próximo.
--   • Leitura pública SEM função nova para anon (S14 segue 18): política de SELECT para anon/authenticated só nas
--     linhas publicadas cuja janela está ativa agora (ou começa nos próximos 10 min, para o cache de 5 min não atrasar
--     o início), e grants POR COLUNA só nas colunas de apresentação (nome, notas, evento, autores e estado ficam de
--     fora: "sem dados internos"). Rascunho é invisível para todos menos o admin, que lê tudo pelas RPCs.
--   • Escrita só do admin geral (is_platform_admin, o mecanismo existente — sem comparar e-mail), sempre por RPC
--     security definer auditada. "Restaurar padrão agora" despublica (volta a rascunho) os temas ativos neste momento;
--     o interruptor global (seasonal_theme_settings.enabled) desliga tudo sem mexer nos temas.
--   • Áreas: app do consumidor ('app'), portais Hero/agência/marca ('portals') e página institucional/entrada
--     ('institutional'). Admin, checkout, carrinho, planos e pagamentos NUNCA recebem tema: a trava fica no app (lista
--     fixa de caminhos excluídos), não depende do cadastro.
--   • Imagens: bucket público próprio `theme-assets` (até 2 MiB; png, jpeg, webp — sem SVG/GIF: nada de script nem
--     animação que ignore "reduzir movimento"). Só o admin envia e apaga (políticas em storage.objects); leitura pela
--     URL pública. O banco só aceita URLs desse bucket com nome <uuid>.(png|jpg|webp).
-- =============================================================================

-- 1) validação de formato (imutáveis, uso interno dos checks) ------------------------------------------------------
create or replace function public.seasonal_theme_color_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and p ~ '^#[0-9a-f]{6}$'
$$;
revoke execute on function public.seasonal_theme_color_ok(text) from public, anon;
grant execute on function public.seasonal_theme_color_ok(text) to authenticated, service_role;

create or replace function public.seasonal_theme_asset_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) <= 300
    and p ~ '^https?://[a-z0-9.:-]+/storage/v1/object/public/theme-assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
$$;
revoke execute on function public.seasonal_theme_asset_ok(text) from public, anon;
grant execute on function public.seasonal_theme_asset_ok(text) to authenticated, service_role;

-- tokens: {"light": {...}, "dark": {...}}; chaves accent, accentSoft, bg, surface; valores #rrggbb (minúsculas)
create or replace function public.seasonal_theme_tokens_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('light', 'dark'))
    and not exists (
      select 1 from jsonb_each(p) m
      where jsonb_typeof(m.value) <> 'object'
         or exists (select 1 from jsonb_each(m.value) t
                    where t.key not in ('accent', 'accentSoft', 'bg', 'surface')
                       or jsonb_typeof(t.value) <> 'string'
                       or not public.seasonal_theme_color_ok(t.value #>> '{}')))
$$;
revoke execute on function public.seasonal_theme_tokens_ok(jsonb) from public, anon;
grant execute on function public.seasonal_theme_tokens_ok(jsonb) to authenticated, service_role;

-- fundo: {"type":"none"} | {"type":"gradient","from","to","angle":0..360,"intensity":5..40} | {"type":"image","url","fit":"cover|repeat","intensity":5..40}
create or replace function public.seasonal_theme_background_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and case p ->> 'type'
    when 'none' then true
    when 'gradient' then public.seasonal_theme_color_ok(p ->> 'from') and public.seasonal_theme_color_ok(p ->> 'to')
      and jsonb_typeof(p -> 'angle') = 'number' and (p ->> 'angle')::numeric between 0 and 360
      and jsonb_typeof(p -> 'intensity') = 'number' and (p ->> 'intensity')::numeric between 5 and 40
    when 'image' then public.seasonal_theme_asset_ok(p ->> 'url') and coalesce(p ->> 'fit', 'cover') in ('cover', 'repeat')
      and jsonb_typeof(p -> 'intensity') = 'number' and (p ->> 'intensity')::numeric between 5 and 40
    else false end
$$;
revoke execute on function public.seasonal_theme_background_ok(jsonb) from public, anon;
grant execute on function public.seasonal_theme_background_ok(jsonb) to authenticated, service_role;

-- decorativos: até 6 [{"url","position","size"}]
create or replace function public.seasonal_theme_decorations_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 6
    and not exists (
      select 1 from jsonb_array_elements(p) d
      where jsonb_typeof(d) <> 'object'
         or not public.seasonal_theme_asset_ok(d ->> 'url')
         or coalesce(d ->> 'position', '') not in ('top-left', 'top-right', 'bottom-left', 'bottom-right')
         or coalesce(d ->> 'size', '') not in ('sm', 'md', 'lg'))
$$;
revoke execute on function public.seasonal_theme_decorations_ok(jsonb) from public, anon;
grant execute on function public.seasonal_theme_decorations_ok(jsonb) to authenticated, service_role;

-- faixa: {} (sem faixa) | {"text":{"pt-BR","en","es"},"label":{...},"href"}; pt-BR obrigatório; link interno (/…) ou https
create or replace function public.seasonal_theme_banner_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and (
    p = '{}'::jsonb
    or (jsonb_typeof(p -> 'text') = 'object'
        and char_length(btrim(coalesce(p #>> '{text,pt-BR}', ''))) between 1 and 120
        and coalesce(char_length(p #>> '{text,en}'), 0) <= 120 and coalesce(char_length(p #>> '{text,es}'), 0) <= 120
        and (p -> 'label' is null or (jsonb_typeof(p -> 'label') = 'object'
             and coalesce(char_length(p #>> '{label,pt-BR}'), 0) <= 40 and coalesce(char_length(p #>> '{label,en}'), 0) <= 40
             and coalesce(char_length(p #>> '{label,es}'), 0) <= 40))
        and (coalesce(p ->> 'href', '') = '' or (char_length(p ->> 'href') <= 300 and (p ->> 'href') ~ '^(/[^/\\\s][^\s]*|/|https://[^\s/]+(/[^\s]*)?)$'))
        and not exists (select 1 from jsonb_object_keys(p) k where k not in ('text', 'label', 'href'))))
$$;
revoke execute on function public.seasonal_theme_banner_ok(jsonb) from public, anon;
grant execute on function public.seasonal_theme_banner_ok(jsonb) to authenticated, service_role;

-- 2) tabelas -------------------------------------------------------------------------------------------------------
create table if not exists public.seasonal_theme_settings (
  id boolean primary key default true constraint seasonal_theme_settings_single check (id),
  enabled boolean not null default true,
  updated_by uuid constraint seasonal_theme_settings_by_fk references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.seasonal_theme_settings (id, enabled) values (true, true) on conflict (id) do nothing;

create table if not exists public.seasonal_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint seasonal_themes_name_check check (char_length(btrim(name)) between 1 and 80),
  notes text not null default '' constraint seasonal_themes_notes_check check (char_length(notes) <= 500),
  status text not null default 'draft' constraint seasonal_themes_status_check check (status in ('draft', 'published')),
  event_id uuid constraint seasonal_themes_event_fk references public.calendar_events (id) on delete set null,
  start_mode text not null default 'date' constraint seasonal_themes_start_mode_check check (start_mode in ('date', 'lead_days')),
  lead_days int not null default 0 constraint seasonal_themes_lead_days_check check (lead_days between 0 and 120),
  starts_at timestamptz,
  end_mode text not null default 'date' constraint seasonal_themes_end_mode_check check (end_mode in ('date', 'event_end')),
  ends_at timestamptz,
  timezone text not null default 'America/Sao_Paulo' constraint seasonal_themes_timezone_check check (char_length(timezone) between 1 and 64),
  priority int not null default 100 constraint seasonal_themes_priority_check check (priority between 0 and 1000),
  areas text[] not null default array['app', 'portals', 'institutional']::text[]
    constraint seasonal_themes_areas_check check (cardinality(areas) between 1 and 3 and areas <@ array['app', 'portals', 'institutional']::text[]),
  tokens jsonb not null default '{}'::jsonb constraint seasonal_themes_tokens_check check (public.seasonal_theme_tokens_ok(tokens)),
  background jsonb not null default '{"type":"none"}'::jsonb constraint seasonal_themes_background_check check (public.seasonal_theme_background_ok(background)),
  decorations jsonb not null default '[]'::jsonb constraint seasonal_themes_decorations_check check (public.seasonal_theme_decorations_ok(decorations)),
  animations boolean not null default false,
  banner jsonb not null default '{}'::jsonb constraint seasonal_themes_banner_check check (public.seasonal_theme_banner_ok(banner)),
  window_start timestamptz,
  window_end timestamptz,
  event_cancelled boolean not null default false,
  published_at timestamptz,
  created_by uuid constraint seasonal_themes_created_by_fk references auth.users (id) on delete set null,
  updated_by uuid constraint seasonal_themes_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasonal_themes_start_check check ((start_mode = 'date') = (starts_at is not null)),
  constraint seasonal_themes_end_check check ((end_mode = 'date') = (ends_at is not null)),
  constraint seasonal_themes_event_mode_check check (event_id is not null or (start_mode = 'date' and end_mode = 'date')),
  constraint seasonal_themes_window_check check (
    (window_start is null and window_end is null)
    or (window_start is not null and window_end is not null and window_end > window_start and window_end - window_start <= interval '400 days')),
  constraint seasonal_themes_published_check check (status = 'draft' or window_start is not null)
);
-- leitura pública: só publicados, pela janela
create index if not exists seasonal_themes_window_idx on public.seasonal_themes (window_end, window_start) where status = 'published';
create index if not exists seasonal_themes_event_idx on public.seasonal_themes (event_id) where event_id is not null;

alter table public.seasonal_themes enable row level security;
alter table public.seasonal_theme_settings enable row level security;
revoke all on table public.seasonal_themes from public, anon, authenticated;
revoke all on table public.seasonal_theme_settings from public, anon, authenticated;
-- só as colunas de apresentação (nada interno: nome, notas, evento, estado, autores)
grant select (id, priority, areas, tokens, background, decorations, animations, banner, window_start, window_end, updated_at)
  on table public.seasonal_themes to anon, authenticated;
grant select (enabled) on table public.seasonal_theme_settings to anon, authenticated;
grant all on table public.seasonal_themes to service_role;
grant all on table public.seasonal_theme_settings to service_role;

drop policy if exists seasonal_theme_settings_read on public.seasonal_theme_settings;
create policy seasonal_theme_settings_read on public.seasonal_theme_settings for select to anon, authenticated using (true);

drop policy if exists seasonal_themes_public_active on public.seasonal_themes;
create policy seasonal_themes_public_active on public.seasonal_themes for select to anon, authenticated
  using (status = 'published' and not event_cancelled
         and window_start <= now() + interval '10 minutes' and window_end > now()
         and exists (select 1 from public.seasonal_theme_settings s where s.enabled));

-- 3) janela efetiva (gatilhos) -------------------------------------------------------------------------------------
create or replace function public.seasonal_themes_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare v_ev_start timestamptz; v_ev_end timestamptz; v_ev_status text;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'timezone';
  end if;
  -- evento excluído (on delete set null): congela a última janela como datas
  if tg_op = 'UPDATE' and new.event_id is null and old.event_id is not null then
    if new.start_mode = 'lead_days' then new.start_mode := 'date'; new.starts_at := old.window_start; end if;
    if new.end_mode = 'event_end' then new.end_mode := 'date'; new.ends_at := old.window_end; end if;
    new.event_cancelled := false;
  end if;
  if new.event_id is not null then
    select e.starts_at, e.ends_at, e.status into v_ev_start, v_ev_end, v_ev_status from public.calendar_events e where e.id = new.event_id;
    if not found then raise exception 'not_found' using errcode = 'P0002', detail = 'event'; end if;
    new.event_cancelled := v_ev_status = 'cancelled';
  else
    new.event_cancelled := false;
  end if;
  new.window_start := case when new.start_mode = 'date' then new.starts_at
    else (((v_ev_start at time zone new.timezone)::date - new.lead_days)::timestamp at time zone new.timezone) end;
  new.window_end := case when new.end_mode = 'date' then new.ends_at else v_ev_end end;
  if new.window_start is null or new.window_end is null or new.window_end <= new.window_start then
    if new.status = 'published' then raise exception 'invalid_input' using errcode = '22023', detail = 'window'; end if;
    new.window_start := null; new.window_end := null;
  elsif new.window_end - new.window_start > interval '400 days' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'window';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.seasonal_themes_before_write() from public, anon, authenticated;

drop trigger if exists trg_seasonal_themes_window on public.seasonal_themes;
create trigger trg_seasonal_themes_window before insert or update on public.seasonal_themes
  for each row execute function public.seasonal_themes_before_write();

-- evento mudou (datas, fuso, estado): recalcula os temas ligados. Definer: a co-editora da agenda (0098) pode mudar o
-- evento sem ter escrita nos temas; o gatilho só toca nas linhas ligadas àquele evento.
create or replace function public.calendar_events_sync_seasonal_themes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.seasonal_themes t set event_id = t.event_id where t.event_id = new.id;
  return null;
exception when sqlstate '22023' then
  -- a mudança do evento deixou a janela inválida para um tema publicado: o tema volta a rascunho (não bloqueia a agenda)
  update public.seasonal_themes t set status = 'draft' where t.event_id = new.id and t.status = 'published';
  update public.seasonal_themes t set event_id = t.event_id where t.event_id = new.id;
  return null;
end $$;
revoke execute on function public.calendar_events_sync_seasonal_themes() from public, anon, authenticated;

drop trigger if exists trg_calendar_events_seasonal_themes on public.calendar_events;
create trigger trg_calendar_events_seasonal_themes after update of starts_at, ends_at, status on public.calendar_events
  for each row when (old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at or old.status is distinct from new.status)
  execute function public.calendar_events_sync_seasonal_themes();

-- 4) RPCs do admin -------------------------------------------------------------------------------------------------
create or replace function public.seasonal_theme_require_admin()
returns void language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke execute on function public.seasonal_theme_require_admin() from public, anon, authenticated;
grant execute on function public.seasonal_theme_require_admin() to service_role;

create or replace function public.seasonal_theme_json(t public.seasonal_themes)
returns jsonb language sql stable set search_path = '' as $$
  select to_jsonb(t) || jsonb_build_object('event', (
    select jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status, 'timezone', e.timezone)
    from public.calendar_events e where e.id = t.event_id))
$$;
revoke execute on function public.seasonal_theme_json(public.seasonal_themes) from public, anon, authenticated;
grant execute on function public.seasonal_theme_json(public.seasonal_themes) to service_role;

-- salvar (criar/editar). p_data: name, notes, event_id, start_mode, lead_days, starts_at, end_mode, ends_at, timezone,
-- priority, areas, tokens, background, decorations, animations, banner. O estado não muda aqui (novo = rascunho).
create or replace function public.seasonal_theme_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_before public.seasonal_themes%rowtype; v_event uuid; v_areas text[];
begin
  perform public.seasonal_theme_require_admin();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_id is not null then
    select * into v_before from public.seasonal_themes where id = v_id for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  begin
    v_event := nullif(p_data ->> 'event_id', '')::uuid;
    v_areas := array(select jsonb_array_elements_text(coalesce(p_data -> 'areas', '[]'::jsonb)));
    if v_event is not null and not exists (select 1 from public.calendar_events e where e.id = v_event and e.scope = 'platform') then
      raise exception 'not_found' using errcode = 'P0002', detail = 'event';
    end if;
    if v_id is null then
      insert into public.seasonal_themes (name, notes, event_id, start_mode, lead_days, starts_at, end_mode, ends_at, timezone, priority, areas,
                                          tokens, background, decorations, animations, banner, created_by, updated_by)
      values (btrim(coalesce(p_data ->> 'name', '')), btrim(coalesce(p_data ->> 'notes', '')), v_event,
              coalesce(p_data ->> 'start_mode', 'date'), coalesce((p_data ->> 'lead_days')::int, 0), nullif(p_data ->> 'starts_at', '')::timestamptz,
              coalesce(p_data ->> 'end_mode', 'date'), nullif(p_data ->> 'ends_at', '')::timestamptz,
              coalesce(nullif(p_data ->> 'timezone', ''), 'America/Sao_Paulo'), coalesce((p_data ->> 'priority')::int, 100), v_areas,
              coalesce(p_data -> 'tokens', '{}'::jsonb), coalesce(p_data -> 'background', '{"type":"none"}'::jsonb), coalesce(p_data -> 'decorations', '[]'::jsonb),
              coalesce((p_data ->> 'animations')::boolean, false), coalesce(p_data -> 'banner', '{}'::jsonb), auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.seasonal_themes set name = btrim(coalesce(p_data ->> 'name', '')), notes = btrim(coalesce(p_data ->> 'notes', '')), event_id = v_event,
        start_mode = coalesce(p_data ->> 'start_mode', 'date'), lead_days = coalesce((p_data ->> 'lead_days')::int, 0), starts_at = nullif(p_data ->> 'starts_at', '')::timestamptz,
        end_mode = coalesce(p_data ->> 'end_mode', 'date'), ends_at = nullif(p_data ->> 'ends_at', '')::timestamptz,
        timezone = coalesce(nullif(p_data ->> 'timezone', ''), 'America/Sao_Paulo'), priority = coalesce((p_data ->> 'priority')::int, 100), areas = v_areas,
        tokens = coalesce(p_data -> 'tokens', '{}'::jsonb), background = coalesce(p_data -> 'background', '{"type":"none"}'::jsonb),
        decorations = coalesce(p_data -> 'decorations', '[]'::jsonb), animations = coalesce((p_data ->> 'animations')::boolean, false),
        banner = coalesce(p_data -> 'banner', '{}'::jsonb), updated_by = auth.uid()
      where id = v_id;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('seasonal_theme.save', 'seasonal_theme', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('name', v_before.name, 'status', v_before.status, 'window_start', v_before.window_start, 'window_end', v_before.window_end) end,
    jsonb_build_object('name', btrim(coalesce(p_data ->> 'name', ''))), null, 'admin');
  return v_id;
end $$;
revoke execute on function public.seasonal_theme_save(uuid, jsonb) from public, anon;
grant execute on function public.seasonal_theme_save(uuid, jsonb) to authenticated, service_role;

-- publicar / despublicar (volta a rascunho)
create or replace function public.seasonal_theme_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.seasonal_themes%rowtype;
begin
  perform public.seasonal_theme_require_admin();
  if p_status not in ('draft', 'published') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into t from public.seasonal_themes where id = p_id for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status = 'published' and (t.window_start is null or t.window_end <= now()) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.seasonal_themes set status = p_status, published_at = case when p_status = 'published' then now() else published_at end, updated_by = auth.uid()
  where id = p_id;
  perform public.audit_log('seasonal_theme.status', 'seasonal_theme', p_id::text, jsonb_build_object('status', t.status), jsonb_build_object('status', p_status), null, 'admin');
end $$;
revoke execute on function public.seasonal_theme_set_status(uuid, text) from public, anon;
grant execute on function public.seasonal_theme_set_status(uuid, text) to authenticated, service_role;

create or replace function public.seasonal_theme_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.seasonal_themes%rowtype;
begin
  perform public.seasonal_theme_require_admin();
  select * into t from public.seasonal_themes where id = p_id for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.seasonal_themes where id = p_id;
  perform public.audit_log('seasonal_theme.delete', 'seasonal_theme', p_id::text, jsonb_build_object('name', t.name, 'status', t.status), null, null, 'admin');
end $$;
revoke execute on function public.seasonal_theme_delete(uuid) from public, anon;
grant execute on function public.seasonal_theme_delete(uuid) to authenticated, service_role;

-- "restaurar padrão agora": todo tema publicado em vigor (ou começando nos próximos 10 min) volta a rascunho
create or replace function public.seasonal_theme_restore_default()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.seasonal_theme_require_admin();
  update public.seasonal_themes set status = 'draft', updated_by = auth.uid()
  where status = 'published' and window_start <= now() + interval '10 minutes' and window_end > now();
  get diagnostics n = row_count;
  perform public.audit_log('seasonal_theme.restore_default', 'seasonal_theme', null, null, jsonb_build_object('unpublished', n), null, 'admin');
  return n;
end $$;
revoke execute on function public.seasonal_theme_restore_default() from public, anon;
grant execute on function public.seasonal_theme_restore_default() to authenticated, service_role;

-- interruptor global "layouts dinâmicos ativados"
create or replace function public.seasonal_themes_set_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before boolean;
begin
  perform public.seasonal_theme_require_admin();
  select enabled into v_before from public.seasonal_theme_settings where id;
  insert into public.seasonal_theme_settings (id, enabled, updated_by, updated_at) values (true, coalesce(p_enabled, false), auth.uid(), now())
  on conflict (id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.audit_log('seasonal_theme.enabled', 'seasonal_theme_settings', null, jsonb_build_object('enabled', v_before), jsonb_build_object('enabled', coalesce(p_enabled, false)), null, 'admin');
end $$;
revoke execute on function public.seasonal_themes_set_enabled(boolean) from public, anon;
grant execute on function public.seasonal_themes_set_enabled(boolean) to authenticated, service_role;

-- leitura do admin: interruptor + todos os temas (com o evento ligado); p_id = um só (editor e pré-visualização)
create or replace function public.seasonal_themes_admin(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.seasonal_theme_require_admin();
  return jsonb_build_object(
    'enabled', coalesce((select s.enabled from public.seasonal_theme_settings s where s.id), true),
    'now', now(),
    'themes', coalesce((select jsonb_agg(public.seasonal_theme_json(t) order by t.window_start nulls last, t.priority desc, t.created_at)
                        from public.seasonal_themes t where p_id is null or t.id = p_id), '[]'::jsonb));
end $$;
revoke execute on function public.seasonal_themes_admin(uuid) from public, anon;
grant execute on function public.seasonal_themes_admin(uuid) to authenticated, service_role;

-- 5) bucket público theme-assets: só o admin geral envia e apaga ------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0100: schema storage ausente; bucket theme-assets não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('theme-assets', 'theme-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  execute 'drop policy if exists theme_assets_admin_insert on storage.objects';
  execute $sql$
    create policy theme_assets_admin_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'theme-assets' and (select public.is_platform_admin())
                  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')
  $sql$;
  execute 'drop policy if exists theme_assets_admin_delete on storage.objects';
  execute $sql$
    create policy theme_assets_admin_delete on storage.objects for delete to authenticated
      using (bucket_id = 'theme-assets' and (select public.is_platform_admin()))
  $sql$;
  -- o upload do supabase-js lê o objeto de volta (select) ao gravar: o admin também lê pela API
  execute 'drop policy if exists theme_assets_admin_select on storage.objects';
  execute $sql$
    create policy theme_assets_admin_select on storage.objects for select to authenticated
      using (bucket_id = 'theme-assets' and (select public.is_platform_admin()))
  $sql$;
end $$;
