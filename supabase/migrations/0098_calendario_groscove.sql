-- =============================================================================
-- Groscove Ultra · 0098 · Calendário Groscove (agenda central da plataforma) + interesse em evento · cenário S105
-- Pedido do responsável (04/11): "Faça o input desse calendário todo no sistema. Todos devem ver nas suas agendas:
-- Marca, Agência, Hero, Administrador." (Calendário Groscove 2026/2027 — Geral e 2026 — Sustentabilidade em Campo.)
-- Etapas 2 e 3 do prompt mestre da agenda (auditoria-agenda.md). Idempotente; nada de drop de tabela/coluna;
-- funções com search_path fixo; nenhuma função nova executável por anon (S14 segue 18).
--
-- Decisões (sem perguntar ao responsável):
--   • D1: REUSO de calendar_events (uma linha por evento, sem cópias). Os eventos da plataforma têm scope='platform',
--     kind='institutional' e agency_id NULO (a coluna deixa de ser obrigatória; um check garante que só o escopo
--     'platform' fica sem agência). Nenhuma política antiga enxerga essas linhas (todas exigem agência, negócio,
--     talento, data comercial ou patrocínio); duas políticas novas cuidam delas.
--   • Quem publica: o admin geral (is_platform_admin). Agências podem ser co-editoras por uma flag em agencies
--     (platform_calendar_editor, DESLIGADA em todas; só o admin liga, pela RPC admin_set_platform_calendar_editor).
--   • Quem lê: qualquer pessoa autenticada com portal — admin, membro de agência ativa, membro de marca ativa (com ou sem
--     agência), Hero titular/membro (Hero ativo ou pendente, inclusive sem agência) e ficha de casting com login.
--     Visitante (anon) nada. Leitura direta pela RLS (sem RPC), como as outras agendas.
--   • Estados: draft (só editores) | scheduled (publish_at no futuro: ninguém de fora vê; quando a data chega, vira
--     publicado SEM cron — a regra é "published_at <= now()") | published | cancelled (continua visível, riscado; não
--     some). published_at guarda quando o evento foi/será visto: draft = nulo; published = momento da publicação;
--     scheduled = publish_at. Cancelar exige que já tenha sido publicado; rascunho/programado se exclui (sem histórico).
--   • Fuso por evento (timezone, padrão America/Sao_Paulo, validado em pg_timezone_names). Dia inteiro = meia-noite do
--     primeiro dia até a meia-noite do dia seguinte ao último (fim exclusivo, a mesma convenção da agenda e do .ics).
--     Duração até 1 ano para eventos da plataforma (temporadas: Brasileirão, Libertadores…); os da agência seguem 62.
--     A grade mostra evento longo (> 31 dias) só no dia de início e no de fim (como o PDF: [Início]/[Final]).
--   • Território (lista fechada de 11 chaves) + hashtags (até 30, sem '#') + destaque + "data a confirmar" (tentative:
--     o asterisco do PDF, "datas previstas sem confirmação"; o evento entra PUBLICADO com selo, não como rascunho) +
--     categoria livre (ex.: "Pra você", "Causas" no Sustentabilidade em Campo) + coleção (slug da linha do calendário:
--     'geral', 'sustentabilidade-em-campo'…; filtrável na agenda) + extra (página de origem, "incerto" do extrator,
--     observação).
--   • Importação: tabela calendar_imports (fonte, arquivo, hash, ano, formato, quem, quando, contagens e metadados —
--     months/quarters do JSON ficam guardados para a futura Real-Time Culture). O evento aponta para a última importação
--     que o criou/atualizou (import_id). Idempotência por source_key ÚNICO no escopo da plataforma: reimportar o mesmo
--     arquivo nunca duplica (linha existente → ignorar ou atualizar, decisão do admin na pré-visualização). Tudo numa
--     RPC transacional (platform_events_import): ou entra o lote inteiro, ou nada.
--   • Interesse (calendar_event_interests, tabela única): Hero (por creator_profile_id; só o TITULAR de Hero ATIVO
--     manifesta/retira; a equipe vê) e marca (dono ou equipe). Estados interested | withdrawn; "não manifestou" = sem
--     linha; histórico em calendar_event_interest_log (estado, quem, quando). Interesse NUNCA cria negócio/contrato.
--     Quem vê a lista: admin tudo; agência (gestor+) os Heros do PRÓPRIO casting e as marcas que atende; Hero só o
--     dele; marca só o dela (M4: a marca NUNCA vê Heros interessados). Contagens totais (Heros/marcas) para todos
--     os leitores por platform_event_interest_summary (só números).
--   • Avisos no sino: ficaram de fora nesta etapa (opcional no pedido; o check de kinds do sino não muda aqui).
--   • Feed .ics: calendar_feed_resolve (MESMA assinatura) inclui os eventos da plataforma que a pessoa vê, com
--     "status":"cancelled" quando cancelado (o app escreve STATUS:CANCELLED). calendar_events_for_user (MESMA
--     assinatura) passa a devolver só o escopo da agência (o admin geral não recebe rascunhos da plataforma no feed,
--     no painel da marca nem nas contagens).
-- =============================================================================

-- 1) importações (cronograma de origem) ---------------------------------------------------------------------------
create table if not exists public.calendar_imports (
  id uuid primary key default gen_random_uuid(),
  source_name text not null constraint calendar_imports_source_check check (char_length(btrim(source_name)) between 1 and 200),
  file_name text not null default '' constraint calendar_imports_file_check check (char_length(file_name) <= 200),
  file_hash text constraint calendar_imports_hash_check check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),
  format text not null constraint calendar_imports_format_check check (format in ('json', 'csv', 'script')),
  year int constraint calendar_imports_year_check check (year is null or year between 2000 and 2100),
  counts jsonb not null default '{}'::jsonb constraint calendar_imports_counts_check check (jsonb_typeof(counts) = 'object'),
  meta jsonb not null default '{}'::jsonb constraint calendar_imports_meta_check check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) <= 262144),
  imported_by uuid constraint calendar_imports_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists calendar_imports_created_idx on public.calendar_imports (created_at desc);

-- 2) co-edição por agência (pronta, desligada) ----------------------------------------------------------------------
alter table public.agencies add column if not exists platform_calendar_editor boolean not null default false;

-- 3) calendar_events: escopo da plataforma -------------------------------------------------------------------------
alter table public.calendar_events alter column agency_id drop not null;
alter table public.calendar_events add column if not exists scope text not null default 'agency';
alter table public.calendar_events add column if not exists status text not null default 'published';
alter table public.calendar_events add column if not exists published_at timestamptz;
alter table public.calendar_events add column if not exists timezone text not null default 'America/Sao_Paulo';
alter table public.calendar_events add column if not exists territory text;
alter table public.calendar_events add column if not exists hashtags text[] not null default '{}'::text[];
alter table public.calendar_events add column if not exists highlight boolean not null default false;
alter table public.calendar_events add column if not exists import_id uuid
  constraint calendar_events_import_fk references public.calendar_imports (id) on delete set null;
alter table public.calendar_events add column if not exists cancelled_at timestamptz;
alter table public.calendar_events add column if not exists cancel_reason text not null default '';
alter table public.calendar_events add column if not exists updated_by uuid
  constraint calendar_events_updated_by_fk references auth.users (id) on delete set null;
alter table public.calendar_events add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.calendar_events add column if not exists tentative boolean not null default false;
alter table public.calendar_events add column if not exists category text;
alter table public.calendar_events add column if not exists collection text;

alter table public.calendar_events drop constraint if exists calendar_events_scope_check;
alter table public.calendar_events add constraint calendar_events_scope_check check (scope in ('agency', 'platform'));
alter table public.calendar_events drop constraint if exists calendar_events_status_check;
alter table public.calendar_events add constraint calendar_events_status_check check (status in ('draft', 'scheduled', 'published', 'cancelled'));
alter table public.calendar_events drop constraint if exists calendar_events_timezone_check;
alter table public.calendar_events add constraint calendar_events_timezone_check check (char_length(timezone) between 1 and 64);
alter table public.calendar_events drop constraint if exists calendar_events_territory_check;
alter table public.calendar_events add constraint calendar_events_territory_check check (territory is null or territory in
  ('futebol', 'esporte', 'entretenimento', 'musica', 'geek_tech', 'social', 'saude', 'varejo', 'feriados', 'moda', 'sustentabilidade'));
alter table public.calendar_events drop constraint if exists calendar_events_hashtags_check;
alter table public.calendar_events add constraint calendar_events_hashtags_check check (cardinality(hashtags) <= 30);
alter table public.calendar_events drop constraint if exists calendar_events_cancel_check;
alter table public.calendar_events add constraint calendar_events_cancel_check check (char_length(cancel_reason) <= 300 and ((status = 'cancelled') = (cancelled_at is not null)));
alter table public.calendar_events drop constraint if exists calendar_events_category_check;
alter table public.calendar_events add constraint calendar_events_category_check check ((category is null or char_length(btrim(category)) between 1 and 60)
  and (collection is null or collection ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(collection) <= 60));
alter table public.calendar_events drop constraint if exists calendar_events_extra_check;
alter table public.calendar_events add constraint calendar_events_extra_check check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) <= 4000);
-- kinds atuais (0085) + institucional
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check check (kind in
  ('campaign', 'deliverable', 'consult_deadline', 'meeting', 'recording', 'commercial_date', 'other', 'sponsorship', 'institutional'));
-- origem: + importação (eventos da plataforma)
alter table public.calendar_events drop constraint if exists calendar_events_source_check;
alter table public.calendar_events add constraint calendar_events_source_check check (source in ('manual', 'system', 'import'));
-- 0067: só evento de sistema tem chave (na agência). Na plataforma a chave é SEMPRE obrigatória (reimportação idempotente).
alter table public.calendar_events drop constraint if exists calendar_events_system_key_check;
alter table public.calendar_events add constraint calendar_events_system_key_check check (
  case when scope = 'platform' then source_key is not null and source in ('manual', 'import')
       else (source = 'system') = (source_key is not null) and source <> 'import' end);
alter table public.calendar_events drop constraint if exists calendar_events_range_check;
alter table public.calendar_events add constraint calendar_events_range_check check (ends_at >= starts_at
  and (ends_at - starts_at <= interval '62 days' or (scope = 'platform' and ends_at - starts_at <= interval '367 days')));
-- escopo: agência exige agência e fica como antes (sempre "publicado", sem território); plataforma não tem agência,
-- negócio, talento, marca, entregável nem patrocínio e é sempre institucional; rascunho não tem published_at
alter table public.calendar_events drop constraint if exists calendar_events_platform_check;
alter table public.calendar_events add constraint calendar_events_platform_check check (
  case when scope = 'platform' then agency_id is null and kind = 'institutional' and deal_id is null and deal_talent_id is null
         and talent_id is null and brand_id is null and deliverable_id is null and sponsorship_id is null
         and not visible_to_brand and not visible_to_talent and ((status = 'draft') = (published_at is null))
       else agency_id is not null and kind <> 'institutional' and status = 'published' and territory is null
         and import_id is null and cardinality(hashtags) = 0 and not highlight and not tentative and category is null and collection is null end);

create unique index if not exists calendar_events_platform_key_uq on public.calendar_events (source_key) where scope = 'platform';
create index if not exists calendar_events_platform_starts_idx on public.calendar_events (starts_at) where scope = 'platform';
create index if not exists calendar_events_platform_collection_idx on public.calendar_events (collection, starts_at) where scope = 'platform';
create index if not exists calendar_events_import_idx on public.calendar_events (import_id) where import_id is not null;

-- 4) quem lê e quem escreve --------------------------------------------------------------------------------------
-- pessoa com portal (o feed .ics usa a versão por id; as políticas, a da sessão)
create or replace function public.platform_calendar_reader_for(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
       exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role::text = 'admin' and r.scope_type = 'global' and r.revoked_at is null)
    or exists (select 1 from public.agency_members m join public.agencies a on a.id = m.agency_id and a.status = 'active'
               where m.user_id = p_user and m.revoked_at is null)
    or exists (select 1 from public.brand_members bm join public.brands b on b.id = bm.brand_id and b.status = 'active'
               where bm.user_id = p_user and bm.revoked_at is null)
    or exists (select 1 from public.creator_team_members m join public.creator_profiles c on c.id = m.creator_profile_id and c.status::text in ('active', 'pending')
               where m.user_id = p_user and m.status = 'active')
    or exists (select 1 from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active'
               where t.user_id = p_user and t.archived_at is null))
$$;
revoke execute on function public.platform_calendar_reader_for(uuid) from public, anon, authenticated;
grant execute on function public.platform_calendar_reader_for(uuid) to service_role;

create or replace function public.platform_calendar_reader()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.platform_calendar_reader_for(auth.uid())
$$;
revoke execute on function public.platform_calendar_reader() from public, anon;
grant execute on function public.platform_calendar_reader() to authenticated, service_role;

-- admin geral (conta real) ou gestor+ de agência ativa marcada como co-editora
create or replace function public.platform_calendar_can_write()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.is_platform_admin()
    or exists (select 1 from public.agency_members m join public.agencies a on a.id = m.agency_id and a.status = 'active' and a.platform_calendar_editor
               where m.user_id = auth.uid() and m.revoked_at is null and public.agency_role_rank(m.role) >= 2))
$$;
revoke execute on function public.platform_calendar_can_write() from public, anon;
grant execute on function public.platform_calendar_can_write() to authenticated, service_role;

-- marcas de que a pessoa é membro (marca ativa, com ou sem agência: o calendário da plataforma não depende da agência)
create or replace function public.my_member_brand_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct bm.brand_id), '{}'::uuid[]) from public.brand_members bm
  join public.brands b on b.id = bm.brand_id and b.status = 'active'
  where bm.user_id = auth.uid() and bm.revoked_at is null
$$;
revoke execute on function public.my_member_brand_ids() from public, anon;
grant execute on function public.my_member_brand_ids() to authenticated, service_role;

drop policy if exists calendar_events_select_platform on public.calendar_events;
create policy calendar_events_select_platform on public.calendar_events for select to authenticated
  using (scope = 'platform' and status <> 'draft' and published_at <= now() and (select public.platform_calendar_reader()));
drop policy if exists calendar_events_select_platform_editor on public.calendar_events;
create policy calendar_events_select_platform_editor on public.calendar_events for select to authenticated
  using (scope = 'platform' and (select public.platform_calendar_can_write()));

do $$
begin
  execute 'revoke all on table public.calendar_imports from public, anon, authenticated';
  execute 'grant select on table public.calendar_imports to authenticated';
  execute 'grant all on table public.calendar_imports to service_role';
  execute 'alter table public.calendar_imports enable row level security';
  execute 'drop policy if exists calendar_imports_select_editor on public.calendar_imports';
  execute 'create policy calendar_imports_select_editor on public.calendar_imports for select to authenticated using ((select public.platform_calendar_can_write()))';
end $$;

-- 5) normalização de um evento (interna: save e import) --------------------------------------------------------------
-- Entrada: title, description, location, all_day, timezone, start_date/end_date (dia inteiro) ou starts_at/ends_at
-- (com hora), territory, hashtags, highlight, extra. Saída: os mesmos campos já validados, com starts_at/ends_at.
create or replace function public.platform_event_normalize(p jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_title text; v_desc text; v_loc text; v_all_day boolean; v_tz text; v_start timestamptz; v_end timestamptz;
        v_sd date; v_ed date; v_terr text; v_tags text[] := '{}'::text[]; v_tag text; v_extra jsonb; e jsonb; v_cat text; v_col text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_title := regexp_replace(btrim(coalesce(p ->> 'title', '')), '\s+', ' ', 'g');
  if char_length(v_title) not between 1 and 160 then raise exception 'invalid_input' using errcode = '22023', detail = 'title'; end if;
  v_desc := btrim(coalesce(p ->> 'description', ''));
  if char_length(v_desc) > 2000 then raise exception 'invalid_input' using errcode = '22023', detail = 'description'; end if;
  v_loc := btrim(coalesce(p ->> 'location', ''));
  if char_length(v_loc) > 200 then raise exception 'invalid_input' using errcode = '22023', detail = 'location'; end if;
  v_tz := coalesce(nullif(btrim(coalesce(p ->> 'timezone', '')), ''), 'America/Sao_Paulo');
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then raise exception 'invalid_input' using errcode = '22023', detail = 'timezone'; end if;
  begin
    v_all_day := coalesce((p ->> 'all_day')::boolean, true);
    if v_all_day then
      v_sd := (p ->> 'start_date')::date;
      v_ed := coalesce(nullif(p ->> 'end_date', '')::date, v_sd);
      if v_sd is null or v_ed < v_sd then raise exception 'invalid_input' using errcode = '22023', detail = 'dates'; end if;
      v_start := v_sd::timestamp at time zone v_tz;
      v_end := (v_ed + 1)::timestamp at time zone v_tz;
    else
      v_start := (p ->> 'starts_at')::timestamptz;
      v_end := coalesce(nullif(p ->> 'ends_at', '')::timestamptz, v_start);
      if v_start is null or v_end < v_start then raise exception 'invalid_input' using errcode = '22023', detail = 'dates'; end if;
    end if;
  exception when invalid_parameter_value then raise;
            when others then raise exception 'invalid_input' using errcode = '22023', detail = 'dates';
  end;
  if v_end - v_start > interval '367 days' then raise exception 'invalid_input' using errcode = '22023', detail = 'dates'; end if;
  v_terr := nullif(btrim(coalesce(p ->> 'territory', '')), '');
  if v_terr is not null and v_terr not in ('futebol', 'esporte', 'entretenimento', 'musica', 'geek_tech', 'social', 'saude', 'varejo', 'feriados', 'moda', 'sustentabilidade') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'territory';
  end if;
  if p ? 'hashtags' and jsonb_typeof(p -> 'hashtags') = 'array' then
    for e in select value from jsonb_array_elements(p -> 'hashtags') loop
      if jsonb_typeof(e) <> 'string' then raise exception 'invalid_input' using errcode = '22023', detail = 'hashtags'; end if;
      v_tag := regexp_replace(btrim(e #>> '{}'), '^#+', '');
      v_tag := regexp_replace(v_tag, '\s+', '', 'g');
      if v_tag = '' then continue; end if;
      if char_length(v_tag) > 60 then raise exception 'invalid_input' using errcode = '22023', detail = 'hashtags'; end if;
      if not (lower(v_tag) = any (select lower(x) from unnest(v_tags) x)) then v_tags := v_tags || v_tag; end if;
    end loop;
  elsif p ? 'hashtags' and jsonb_typeof(p -> 'hashtags') <> 'null' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'hashtags';
  end if;
  if cardinality(v_tags) > 30 then raise exception 'invalid_input' using errcode = '22023', detail = 'hashtags'; end if;
  v_cat := nullif(regexp_replace(btrim(coalesce(p ->> 'category', '')), '\s+', ' ', 'g'), '');
  if char_length(v_cat) > 60 then raise exception 'invalid_input' using errcode = '22023', detail = 'category'; end if;
  v_col := nullif(btrim(coalesce(p ->> 'collection', '')), '');
  if v_col is not null and (v_col !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_col) > 60) then raise exception 'invalid_input' using errcode = '22023', detail = 'collection'; end if;
  v_extra := coalesce(p -> 'extra', '{}'::jsonb);
  if jsonb_typeof(v_extra) <> 'object' or octet_length(v_extra::text) > 4000 then raise exception 'invalid_input' using errcode = '22023', detail = 'extra'; end if;
  return jsonb_build_object('title', v_title, 'description', v_desc, 'location', v_loc, 'all_day', v_all_day, 'timezone', v_tz,
    'starts_at', v_start, 'ends_at', v_end, 'territory', v_terr, 'hashtags', to_jsonb(v_tags),
    'highlight', coalesce((p ->> 'highlight')::boolean, false), 'tentative', coalesce((p ->> 'tentative')::boolean, false),
    'category', v_cat, 'collection', v_col, 'extra', v_extra);
end $$;
revoke execute on function public.platform_event_normalize(jsonb) from public, anon, authenticated;
grant execute on function public.platform_event_normalize(jsonb) to service_role;

-- estado pedido → (status, published_at). Interna.
create or replace function public.platform_event_state(p_status text, p_publish_at text, p_current_status text, p_current_published timestamptz)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_at timestamptz;
begin
  if p_status = 'draft' then return jsonb_build_object('status', 'draft', 'published_at', null); end if;
  if p_status = 'published' then
    -- mantém a data de quem já estava no ar (reeditar não "republica")
    return jsonb_build_object('status', 'published', 'published_at',
      case when p_current_status in ('published', 'scheduled', 'cancelled') and p_current_published <= now() then p_current_published else now() end);
  end if;
  if p_status = 'scheduled' then
    begin v_at := p_publish_at::timestamptz; exception when others then raise exception 'invalid_input' using errcode = '22023', detail = 'publish_at'; end;
    if v_at is null then raise exception 'invalid_input' using errcode = '22023', detail = 'publish_at'; end if;
    return jsonb_build_object('status', 'scheduled', 'published_at', v_at);
  end if;
  raise exception 'invalid_input' using errcode = '22023', detail = 'status';
end $$;
revoke execute on function public.platform_event_state(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_event_state(text, text, text, timestamptz) to service_role;

-- 6) RPCs de escrita (admin / co-editora) ----------------------------------------------------------------------------
create or replace function public.platform_event_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before public.calendar_events%rowtype; n jsonb; st jsonb; v_id uuid := p_id; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.platform_calendar_can_write() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_id is not null then
    select * into v_before from public.calendar_events e where e.id = v_id and e.scope = 'platform' for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  n := public.platform_event_normalize(p_data);
  v_status := coalesce(nullif(p_data ->> 'status', ''), case when v_before.status = 'cancelled' then 'cancelled' else v_before.status end, 'draft');
  if v_status = 'cancelled' then
    -- edição de cancelado mantém cancelado (reativar = mandar 'published')
    if v_before.status is distinct from 'cancelled' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    st := jsonb_build_object('status', 'cancelled', 'published_at', v_before.published_at);
  else
    st := public.platform_event_state(v_status, p_data ->> 'publish_at', v_before.status, v_before.published_at);
  end if;
  begin
    if v_id is null then
      insert into public.calendar_events (scope, agency_id, kind, title, description, location, starts_at, ends_at, all_day, timezone, territory, hashtags,
                                          highlight, tentative, category, collection, extra, status, published_at, source, source_key, created_by, updated_by)
      values ('platform', null, 'institutional', n ->> 'title', n ->> 'description', n ->> 'location', (n ->> 'starts_at')::timestamptz, (n ->> 'ends_at')::timestamptz,
              (n ->> 'all_day')::boolean, n ->> 'timezone', n ->> 'territory', array(select jsonb_array_elements_text(n -> 'hashtags')),
              (n ->> 'highlight')::boolean, (n ->> 'tentative')::boolean, n ->> 'category', n ->> 'collection', n -> 'extra', st ->> 'status', (st ->> 'published_at')::timestamptz, 'manual', 'manual:' || gen_random_uuid()::text, auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.calendar_events set title = n ->> 'title', description = n ->> 'description', location = n ->> 'location',
        starts_at = (n ->> 'starts_at')::timestamptz, ends_at = (n ->> 'ends_at')::timestamptz, all_day = (n ->> 'all_day')::boolean,
        timezone = n ->> 'timezone', territory = n ->> 'territory', hashtags = array(select jsonb_array_elements_text(n -> 'hashtags')),
        highlight = (n ->> 'highlight')::boolean, tentative = (n ->> 'tentative')::boolean, category = n ->> 'category',
        collection = case when p_data ? 'collection' then n ->> 'collection' else collection end,
        extra = case when p_data ? 'extra' then n -> 'extra' else extra end,
        status = st ->> 'status', published_at = (st ->> 'published_at')::timestamptz,
        cancelled_at = case when st ->> 'status' = 'cancelled' then cancelled_at else null end,
        cancel_reason = case when st ->> 'status' = 'cancelled' then cancel_reason else '' end,
        updated_by = auth.uid()
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('calendar.platform_event', 'calendar_event', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('status', v_before.status, 'starts_at', v_before.starts_at, 'title', v_before.title) end,
    jsonb_build_object('status', st ->> 'status', 'starts_at', n ->> 'starts_at', 'title', n ->> 'title'), null,
    case when public.is_platform_admin() then 'admin'::public.actor_type else 'agency'::public.actor_type end);
  return v_id;
end $$;
revoke execute on function public.platform_event_save(uuid, jsonb) from public, anon;
grant execute on function public.platform_event_save(uuid, jsonb) to authenticated, service_role;

create or replace function public.platform_event_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.platform_calendar_can_write() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.calendar_events where id = p_id and scope = 'platform' for update;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- só o que já esteve no ar; rascunho e programado futuro se excluem
  if e.status = 'cancelled' then return; end if;
  if e.status = 'draft' or e.published_at > now() then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.calendar_events set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(coalesce(p_reason, '')), updated_by = auth.uid() where id = p_id;
  perform public.audit_log('calendar.platform_event_cancel', 'calendar_event', p_id::text, jsonb_build_object('status', e.status), jsonb_build_object('status', 'cancelled'), nullif(btrim(coalesce(p_reason, '')), ''),
    case when public.is_platform_admin() then 'admin'::public.actor_type else 'agency'::public.actor_type end);
end $$;
revoke execute on function public.platform_event_cancel(uuid, text) from public, anon;
grant execute on function public.platform_event_cancel(uuid, text) to authenticated, service_role;

create or replace function public.platform_event_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.platform_calendar_can_write() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.calendar_events where id = p_id and scope = 'platform' for update;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- o que já esteve no ar não some: cancela
  if e.status <> 'draft' and e.published_at <= now() then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  delete from public.calendar_events where id = p_id;
  perform public.audit_log('calendar.platform_event_delete', 'calendar_event', p_id::text, jsonb_build_object('status', e.status, 'title', e.title, 'source_key', e.source_key), null, null,
    case when public.is_platform_admin() then 'admin'::public.actor_type else 'agency'::public.actor_type end);
end $$;
revoke execute on function public.platform_event_delete(uuid) from public, anon;
grant execute on function public.platform_event_delete(uuid) to authenticated, service_role;

-- importação em lote: tudo ou nada. p_import: source_name, file_name, file_hash, format, year, meta.
-- p_events: [{source_key, action create|update|skip, target_id?, status draft|published|scheduled, publish_at?, ...campos}]
-- Linha cuja chave (ou alvo) já existe: 'update' atualiza o conteúdo (mantém o estado e a chave); 'create'/'skip' ignora.
create or replace function public.platform_events_import(p_import jsonb, p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_import uuid; r jsonb; n jsonb; st jsonb; v_key text; v_action text; v_target uuid; v_existing public.calendar_events%rowtype;
        v_created int := 0; v_updated int := 0; v_skipped int := 0; v_drafts int := 0; v_idx int := 0; v_format text; v_year int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.platform_calendar_can_write() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_import is null or jsonb_typeof(p_import) <> 'object' or p_events is null or jsonb_typeof(p_events) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 2000 then raise exception 'invalid_input' using errcode = '22023', detail = 'events'; end if;
  v_format := coalesce(nullif(p_import ->> 'format', ''), 'json');
  begin v_year := nullif(p_import ->> 'year', '')::int; exception when others then raise exception 'invalid_input' using errcode = '22023', detail = 'year'; end;
  begin
    insert into public.calendar_imports (source_name, file_name, file_hash, format, year, meta, imported_by)
    values (btrim(coalesce(p_import ->> 'source_name', '')), left(btrim(coalesce(p_import ->> 'file_name', '')), 200), nullif(p_import ->> 'file_hash', ''), v_format, v_year,
            coalesce(case when jsonb_typeof(p_import -> 'meta') = 'object' then p_import -> 'meta' end, '{}'::jsonb), auth.uid())
    returning id into v_import;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023', detail = 'import';
  end;
  for r in select value from jsonb_array_elements(p_events) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(r) <> 'object' then raise exception 'invalid_input' using errcode = '22023', detail = 'row:' || v_idx; end if;
    v_action := coalesce(nullif(r ->> 'action', ''), 'create');
    if v_action not in ('create', 'update', 'skip') then raise exception 'invalid_input' using errcode = '22023', detail = 'row:' || v_idx; end if;
    if v_action = 'skip' then v_skipped := v_skipped + 1; continue; end if;
    v_key := btrim(coalesce(r ->> 'source_key', ''));
    if v_key !~ '^[a-z0-9][a-z0-9:._-]{0,119}$' then raise exception 'invalid_input' using errcode = '22023', detail = 'row:' || v_idx || ':source_key'; end if;
    v_target := null;
    if nullif(r ->> 'target_id', '') is not null then
      begin v_target := (r ->> 'target_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023', detail = 'row:' || v_idx; end;
    end if;
    v_existing := null;
    if v_target is not null then select * into v_existing from public.calendar_events e where e.id = v_target and e.scope = 'platform' for update; end if;
    if v_existing.id is null then select * into v_existing from public.calendar_events e where e.scope = 'platform' and e.source_key = v_key for update; end if;
    begin
      n := public.platform_event_normalize(r);
    exception when sqlstate '22023' then raise exception 'invalid_input' using errcode = '22023', detail = 'row:' || v_idx;
    end;
    if v_existing.id is not null then
      if v_action <> 'update' then v_skipped := v_skipped + 1; continue; end if;
      update public.calendar_events set title = n ->> 'title', description = n ->> 'description', location = n ->> 'location',
        starts_at = (n ->> 'starts_at')::timestamptz, ends_at = (n ->> 'ends_at')::timestamptz, all_day = (n ->> 'all_day')::boolean,
        timezone = n ->> 'timezone', territory = n ->> 'territory', hashtags = array(select jsonb_array_elements_text(n -> 'hashtags')),
        highlight = (n ->> 'highlight')::boolean, tentative = (n ->> 'tentative')::boolean, category = n ->> 'category', collection = n ->> 'collection',
        extra = n -> 'extra', import_id = v_import, updated_by = auth.uid()
      where id = v_existing.id;
      v_updated := v_updated + 1;
    else
      st := public.platform_event_state(coalesce(nullif(r ->> 'status', ''), 'draft'), r ->> 'publish_at', null, null);
      if st ->> 'status' = 'draft' then v_drafts := v_drafts + 1; end if;
      begin
        insert into public.calendar_events (scope, agency_id, kind, title, description, location, starts_at, ends_at, all_day, timezone, territory, hashtags,
                                            highlight, tentative, category, collection, extra, status, published_at, source, source_key, import_id, created_by, updated_by)
        values ('platform', null, 'institutional', n ->> 'title', n ->> 'description', n ->> 'location', (n ->> 'starts_at')::timestamptz, (n ->> 'ends_at')::timestamptz,
                (n ->> 'all_day')::boolean, n ->> 'timezone', n ->> 'territory', array(select jsonb_array_elements_text(n -> 'hashtags')),
                (n ->> 'highlight')::boolean, (n ->> 'tentative')::boolean, n ->> 'category', n ->> 'collection', n -> 'extra', st ->> 'status', (st ->> 'published_at')::timestamptz, 'import', v_key, v_import, auth.uid(), auth.uid());
      exception when unique_violation then
        -- a mesma chave duas vezes no lote: a segunda é ignorada (idempotente)
        v_skipped := v_skipped + 1; continue;
      end;
      v_created := v_created + 1;
    end if;
  end loop;
  update public.calendar_imports set counts = jsonb_build_object('rows', v_idx, 'created', v_created, 'updated', v_updated, 'skipped', v_skipped, 'drafts', v_drafts)
  where id = v_import;
  perform public.audit_log('calendar.platform_import', 'calendar_import', v_import::text, null,
    jsonb_build_object('source', p_import ->> 'source_name', 'file', p_import ->> 'file_name', 'created', v_created, 'updated', v_updated, 'skipped', v_skipped), null,
    case when public.is_platform_admin() then 'admin'::public.actor_type else 'agency'::public.actor_type end);
  return jsonb_build_object('import_id', v_import, 'rows', v_idx, 'created', v_created, 'updated', v_updated, 'skipped', v_skipped, 'drafts', v_drafts);
end $$;
revoke execute on function public.platform_events_import(jsonb, jsonb) from public, anon;
grant execute on function public.platform_events_import(jsonb, jsonb) to authenticated, service_role;

-- liga/desliga a co-edição de uma agência (só o admin geral; nasce desligada)
create or replace function public.admin_set_platform_calendar_editor(p_agency uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.agencies set platform_calendar_editor = coalesce(p_on, false) where id = p_agency;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.audit_log('calendar.platform_editor', 'agency', p_agency::text, null, jsonb_build_object('platform_calendar_editor', coalesce(p_on, false)), null, 'admin');
end $$;
revoke execute on function public.admin_set_platform_calendar_editor(uuid, boolean) from public, anon;
grant execute on function public.admin_set_platform_calendar_editor(uuid, boolean) to authenticated, service_role;

-- 7) interesse em evento da plataforma ----------------------------------------------------------------------------
create table if not exists public.calendar_event_interests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null constraint calendar_event_interests_event_fk references public.calendar_events (id) on delete cascade,
  party text not null constraint calendar_event_interests_party_check check (party in ('hero', 'brand')),
  creator_profile_id uuid constraint calendar_event_interests_creator_fk references public.creator_profiles (id) on delete cascade,
  brand_id uuid constraint calendar_event_interests_brand_fk references public.brands (id) on delete cascade,
  state text not null constraint calendar_event_interests_state_check check (state in ('interested', 'withdrawn')),
  created_by uuid constraint calendar_event_interests_created_by_fk references auth.users (id) on delete set null,
  updated_by uuid constraint calendar_event_interests_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_interests_owner_check check ((party = 'hero') = (creator_profile_id is not null) and (party = 'brand') = (brand_id is not null))
);
create unique index if not exists calendar_event_interests_hero_uq on public.calendar_event_interests (event_id, creator_profile_id) where creator_profile_id is not null;
create unique index if not exists calendar_event_interests_brand_uq on public.calendar_event_interests (event_id, brand_id) where brand_id is not null;
create index if not exists calendar_event_interests_creator_idx on public.calendar_event_interests (creator_profile_id) where creator_profile_id is not null;
create index if not exists calendar_event_interests_brand_idx on public.calendar_event_interests (brand_id) where brand_id is not null;

create table if not exists public.calendar_event_interest_log (
  id bigint generated always as identity primary key,
  interest_id uuid not null constraint calendar_event_interest_log_interest_fk references public.calendar_event_interests (id) on delete cascade,
  state text not null constraint calendar_event_interest_log_state_check check (state in ('interested', 'withdrawn')),
  actor uuid constraint calendar_event_interest_log_actor_fk references auth.users (id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists calendar_event_interest_log_interest_idx on public.calendar_event_interest_log (interest_id, at);

do $$
declare t text;
begin
  foreach t in array array['calendar_event_interests', 'calendar_event_interest_log'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  drop trigger if exists trg_calendar_event_interests_updated on public.calendar_event_interests;
  create trigger trg_calendar_event_interests_updated before update on public.calendar_event_interests for each row execute function public.set_updated_at();
end $$;

drop policy if exists calendar_event_interests_select_admin on public.calendar_event_interests;
create policy calendar_event_interests_select_admin on public.calendar_event_interests for select to authenticated
  using ((select public.is_platform_admin()));
-- Hero: o titular e a equipe veem o do Hero (só o titular escreve, pela RPC)
drop policy if exists calendar_event_interests_select_hero on public.calendar_event_interests;
create policy calendar_event_interests_select_hero on public.calendar_event_interests for select to authenticated
  using (creator_profile_id = any ((select public.my_team_creator_ids())::uuid[]));
-- marca: só o dela (nunca Heros)
drop policy if exists calendar_event_interests_select_brand on public.calendar_event_interests;
create policy calendar_event_interests_select_brand on public.calendar_event_interests for select to authenticated
  using (brand_id = any ((select public.my_member_brand_ids())::uuid[]));
-- agência (gestor+): Heros do próprio casting; marcas que ela atende
drop policy if exists calendar_event_interests_select_agency on public.calendar_event_interests;
create policy calendar_event_interests_select_agency on public.calendar_event_interests for select to authenticated
  using (creator_profile_id = any ((select public.agency_hero_ids())::uuid[])
         or (brand_id is not null and brand_id = any ((select public.my_agency_brand_ids(true))::uuid[]) and cardinality((select public.my_agency_ids('manager'))) > 0));
-- histórico: quem vê o interesse vê o histórico dele
drop policy if exists calendar_event_interest_log_select on public.calendar_event_interest_log;
create policy calendar_event_interest_log_select on public.calendar_event_interest_log for select to authenticated
  using (exists (select 1 from public.calendar_event_interests i where i.id = interest_id));

-- manifestar / retirar. p_party 'hero' (p_owner = Hero, só o titular de Hero ativo) | 'brand' (p_owner = marca, dono ou
-- equipe). Evento precisa estar visível; manifestar exige evento não cancelado e não encerrado. Devolve o estado.
create or replace function public.platform_event_set_interest(p_event uuid, p_party text, p_owner uuid, p_interested boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype; i public.calendar_event_interests%rowtype; v_state text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_party is null or p_party not in ('hero', 'brand') or p_owner is null or p_interested is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into e from public.calendar_events where id = p_event and scope = 'platform';
  if e.id is null or e.status = 'draft' or e.published_at > now() or not public.platform_calendar_reader() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_party = 'hero' then
    if not exists (select 1 from public.creator_profiles c where c.id = p_owner and c.user_id = auth.uid() and c.status::text = 'active') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select * into i from public.calendar_event_interests where event_id = p_event and creator_profile_id = p_owner for update;
  else
    if not exists (select 1 from public.brand_members bm join public.brands b on b.id = bm.brand_id and b.status = 'active'
                   where bm.brand_id = p_owner and bm.user_id = auth.uid() and bm.revoked_at is null) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select * into i from public.calendar_event_interests where event_id = p_event and brand_id = p_owner for update;
  end if;
  v_state := case when p_interested then 'interested' else 'withdrawn' end;
  if p_interested and (e.status = 'cancelled' or e.ends_at < now()) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if i.id is null then
    if not p_interested then return 'none'; end if;
    insert into public.calendar_event_interests (event_id, party, creator_profile_id, brand_id, state, created_by, updated_by)
    values (p_event, p_party, case when p_party = 'hero' then p_owner end, case when p_party = 'brand' then p_owner end, v_state, auth.uid(), auth.uid())
    returning * into i;
  elsif i.state = v_state then
    return v_state;
  else
    update public.calendar_event_interests set state = v_state, updated_by = auth.uid() where id = i.id;
  end if;
  insert into public.calendar_event_interest_log (interest_id, state, actor) values (i.id, v_state, auth.uid());
  return v_state;
end $$;
revoke execute on function public.platform_event_set_interest(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.platform_event_set_interest(uuid, text, uuid, boolean) to authenticated, service_role;

-- contagens (só números) de interessados de um evento visível: para todos os leitores (a marca não vê a lista de Heros)
create or replace function public.platform_event_interest_summary(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into e from public.calendar_events where id = p_event and scope = 'platform';
  if e.id is null or not (public.platform_calendar_can_write() or (e.status <> 'draft' and e.published_at <= now() and public.platform_calendar_reader())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'heroes', (select count(*) from public.calendar_event_interests i where i.event_id = p_event and i.party = 'hero' and i.state = 'interested'),
    'brands', (select count(*) from public.calendar_event_interests i where i.event_id = p_event and i.party = 'brand' and i.state = 'interested'));
end $$;
revoke execute on function public.platform_event_interest_summary(uuid) from public, anon;
grant execute on function public.platform_event_interest_summary(uuid) to authenticated, service_role;

-- 8) feed e funções da agenda das agências (MESMAS assinaturas) -----------------------------------------------------
-- calendar_events_for_user (0085): só o escopo da agência (o admin geral não recebe a plataforma por aqui)
create or replace function public.calendar_events_for_user(p_user uuid)
returns setof public.calendar_events language sql stable security definer set search_path = '' as $$
  with agencies_m as (
    select m.agency_id, public.agency_role_rank(m.role) as rank from public.agency_members m
    join public.agencies a on a.id = m.agency_id and a.status = 'active' where m.user_id = p_user and m.revoked_at is null),
  staff_deals as (
    select d.id from public.deals d join agencies_m am on am.agency_id = d.agency_id and am.rank = 1
    where d.owner_id = p_user or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = p_user)),
  brands_m as (
    select distinct bm.brand_id from public.brand_members bm where bm.user_id = p_user and bm.revoked_at is null
      and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active' where ab.brand_id = bm.brand_id and ab.status = 'active')),
  brand_deals as (select d.id from public.deals d where d.brand_visible and d.brand_id in (select brand_id from brands_m)),
  served as (select distinct ab.agency_id from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
             where ab.status = 'active' and ab.brand_id in (select brand_id from brands_m)),
  brand_sponsorships as (select unnest(public.brand_sponsorship_ids_for(p_user, true)) as id),
  talent as (select t.id from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active'
             where t.archived_at is null and public.talent_user_id(t.id) = p_user order by t.created_at limit 1),
  platform_admin as (select exists (select 1 from public.role_assignments r join auth.users u on u.id = r.user_id
                                    where r.user_id = p_user and r.role::text = 'admin' and r.scope_type = 'global' and r.revoked_at is null
                                      and coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') not in ('true', 't')) as ok)
  select e.* from public.calendar_events e
  where e.scope = 'agency' and (
        (select ok from platform_admin)
     or e.agency_id in (select agency_id from agencies_m where rank >= 2)
     or e.deal_id in (select id from staff_deals)
     or (e.deal_id is null and e.talent_id is null and e.agency_id in (select agency_id from agencies_m))
     or (e.visible_to_brand and ((e.deal_id is not null and e.deal_id in (select id from brand_deals))
                                 or (e.deal_id is null and e.kind = 'commercial_date' and e.agency_id in (select agency_id from served) and (e.brand_id is null or e.brand_id in (select brand_id from brands_m)))
                                 or (e.kind = 'sponsorship' and e.sponsorship_id in (select id from brand_sponsorships))))
     or (e.visible_to_talent and e.talent_id = (select id from talent)))
$$;
revoke execute on function public.calendar_events_for_user(uuid) from public, anon, authenticated;

-- feed .ics (0094, mesma assinatura): + Calendário Groscove (publicados e cancelados que a pessoa vê)
create or replace function public.calendar_feed_resolve(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.calendar_feeds%rowtype; out jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into f from public.calendar_feeds where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if f.id is null or f.revoked_at is not null then return null; end if;
  update public.calendar_feeds set last_fetched_at = now(), fetch_count = fetch_count + 1 where id = f.id;
  select coalesce(jsonb_agg(s.ev order by (s.ev ->> 'starts_at')::timestamptz), '[]'::jsonb) into out from (
    select jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'subtitle', e.subtitle, 'description', e.description,
             'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day, 'location', e.location, 'updated_at', e.updated_at,
             'deal_id', e.deal_id, 'brand', (select b.name from public.brands b where b.id = e.brand_id)) as ev
    from public.calendar_events_for_user(f.user_id) e
    where e.starts_at >= now() - interval '90 days' and e.starts_at <= now() + interval '366 days'
    union all
    -- 0094: compromissos do Hero (titular e equipe); o contratante vai no lugar da marca e o checklist na descrição
    select jsonb_build_object('id', h.id, 'kind', 'hero_' || h.kind, 'title', h.title, 'subtitle', null,
             'description', nullif(btrim(h.notes || case when jsonb_array_length(h.checklist) > 0 then E'\n' || (
                 select string_agg((case when (i ->> 'done')::boolean then '[x] ' else '[ ] ' end) || (i ->> 'text'), E'\n')
                 from jsonb_array_elements(h.checklist) i) else '' end), ''),
             'starts_at', h.starts_at, 'ends_at', h.ends_at, 'all_day', h.all_day, 'location', h.location, 'updated_at', h.updated_at,
             'deal_id', null, 'brand', nullif(h.client, '')) as ev
    from public.hero_events h
    join public.creator_team_members m on m.creator_profile_id = h.creator_profile_id and m.user_id = f.user_id and m.status = 'active'
    join public.creator_profiles c on c.id = h.creator_profile_id and c.status <> 'suspended'
    where h.starts_at >= now() - interval '90 days' and h.starts_at <= now() + interval '366 days'
    union all
    -- 0094: datas de serviço (dia inteiro, sem valor); o que já tem compromisso vinculado não repete
    select jsonb_build_object('id', s.id, 'kind', 'hero_service', 'title', s.title, 'subtitle', null, 'description', null,
             'starts_at', (s.service_on::timestamp at time zone 'America/Sao_Paulo'),
             'ends_at', ((s.service_on + 1)::timestamp at time zone 'America/Sao_Paulo'), 'all_day', true, 'location', '',
             'updated_at', s.updated_at, 'deal_id', null, 'brand', nullif(s.client, '')) as ev
    from public.hero_services s
    join public.creator_team_members m on m.creator_profile_id = s.creator_profile_id and m.user_id = f.user_id and m.status = 'active'
    join public.creator_profiles c on c.id = s.creator_profile_id and c.status <> 'suspended'
    where s.status <> 'cancelled'
      and s.service_on between (current_date - 90) and (current_date + 366)
      and not exists (select 1 from public.hero_events h2 where h2.service_id = s.id)
    union all
    -- 0098: Calendário Groscove (o que a pessoa vê na agenda: publicado ou cancelado, já no ar); hashtags na descrição
    select jsonb_build_object('id', e.id, 'kind', 'institutional', 'title', e.title, 'subtitle', 'Calendário Groscove',
             'description', nullif(btrim(e.description || case when cardinality(e.hashtags) > 0 then E'\n' || (select string_agg('#' || h, ' ') from unnest(e.hashtags) h) else '' end), ''),
             'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day, 'location', e.location, 'updated_at', e.updated_at,
             'deal_id', null, 'brand', null, 'status', e.status) as ev
    from public.calendar_events e
    where e.scope = 'platform' and e.status <> 'draft' and e.published_at <= now() and public.platform_calendar_reader_for(f.user_id)
      and e.starts_at >= now() - interval '90 days' and e.starts_at <= now() + interval '366 days'
  ) s;
  return jsonb_build_object('user_id', f.user_id, 'events', out);
end $$;
revoke execute on function public.calendar_feed_resolve(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_resolve(text) to service_role;

notify pgrst, 'reload schema';
