-- =============================================================================
-- Groscove Ultra · 0083 · Gestão: biblioteca de conteúdos, métricas, relatório, vendas, músicas e comentário no segundo
-- Bloco 6. Cenário S90. Idempotente; nenhuma função nova para anon (S14 segue 18); valores simulados.
--
-- Decisões:
--   • Biblioteca da marca (brand_library): cada entregável aprovado/publicado/comprovado/concluído que a marca já
--     enxerga (my_brand_deal_talent_ids), com link (o publicado; antes disso, o do envio aprovado), influenciador,
--     campanha, direitos de uso e vencimento. O direito vem dos termos ESTRUTURADOS da 0079 (deal_terms: canais,
--     usage_months, perpétuo, impulsionamento) da versão enviada mais recente do negócio (enviada, aceita ou
--     substituída; nunca rascunho ou retirada). Vencimento = data da publicação (no fuso da agência) + usage_months
--     meses (deliverable_usage, interna). Sem publicação o prazo ainda não começou; perpétuo ou sem prazo não vence.
--   • Aviso de vencimento (usage_rights_expiring) a todos os membros da marca, pelo cron diário que já existe
--     (/api/cron/agency chama usage_rights_expiry_scan, só service_role): faixas 15 (faltam 8–15 dias), 7 (1–7) e
--     0 (vence hoje, com tolerância de 2 dias se o cron falhar). Um aviso por faixa (dedupe por entregável +
--     vencimento + faixa: se os termos mudarem o vencimento, as faixas valem de novo). Sem valor no aviso; os
--     parâmetros usam os tokens que o sino já entende (deal, talent, date; status = today|soon; step = dias que faltam).
--   • Métricas (deliverable_metrics): uma leitura por entregável, fonte e dia (alcance, visualizações, curtidas,
--     comentários, compartilhamentos, salvamentos, cliques; cada um opcional, ao menos um). O influenciador (do
--     entregável) ou a agência (gestor+ ou equipe do negócio) informam pela RPC deliverable_metrics_record (sem
--     print; com a data da medição, entre a publicação e hoje; informar de novo no mesmo dia substitui). A marca só
--     lê. YouTube: o cron grava a fonte "youtube" com o service role pela YouTube Data API oficial (só quando
--     YOUTUBE_API_KEY existe no servidor — sem ela o app diz que a coleta automática não está configurada). O valor
--     atual de cada métrica = a leitura mais recente que a traz; totais da campanha somam isso (lógica pura no app,
--     src/lib/media/metrics.ts, com vitest).
--   • Link rastreável e cupom por influenciador na campanha (campaign_tracking_links, um por deal_talent): a agência
--     (gestor+ ou responsável/equipe do negócio) cria/edita (agency_tracking_link_save); o destino é https (padrão: o
--     site da marca) e o código curto é gerado aqui. /r/<código> é público: o servidor registra o clique com o
--     service role (tracking_link_click — SQL comum, sem security definer, só service_role; S14 não muda), confere de
--     novo que o destino é https e redireciona. Pré-visualização de link (robôs de WhatsApp, redes etc.) não conta.
--     Cupom: maiúsculas, único no negócio (erro coupon_taken). Marca, agência e o próprio influenciador leem.
--   • Vendas (campaign_sales): a marca (dono ou equipe) informa vendas por cupom/link (quantidade e receita, com a
--     data) — brand_sales_record; apaga quem lançou ou o dono (brand_sales_delete). Lê: a marca e o Adm da agência
--     (receita é valor; gestor, colaborador e influenciador não leem). O relatório soma.
--   • Músicas liberadas (campaign_music_tracks): a agência cadastra por negócio (título, artista, fonte/licença, link
--     https, redes permitidas, válida até); até 50 por negócio. O influenciador confirmado lê ("músicas liberadas
--     para usar" nas tarefas da oportunidade); a marca lê também.
--   • Comentário no segundo (deliverable_comments): por versão do entregável, com tempo opcional (0–86400 s; o app
--     mostra mm:ss). Marca (que enxerga o entregável) e agência comentam; o influenciador lê e recebe o aviso
--     deliverable_comment (quando a marca comenta, o responsável do negócio na agência também). Quem escreveu apaga.
--     Negócio fechado não recebe comentário novo.
--   • Relatório da campanha (/marca/campanhas/[id]/relatorio) é só leitura das fontes acima + verba (0082): nada
--     novo no banco.
--   • Todas as RPCs novas: search_path vazio; security definer só onde lê/escreve por cima da RLS; execute revogado
--     de public/anon; as internas só para service_role.
-- =============================================================================

-- 1) avisos novos (todos os valores anteriores da 0082 + os do bloco 6) --------------------------------------------
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
  'usage_rights_expiring', 'deliverable_comment'));

-- 2) direito de uso de um entregável: termos enviados mais recentes + data da publicação (interna) ------------------
create or replace function public.deliverable_usage(p_deliverable uuid)
returns table (terms_id uuid, base_on date, usage_months smallint, perpetual boolean, expires_on date)
language sql stable set search_path = '' as $$
  select m.id, b.base_on, m.usage_months, coalesce(m.usage_perpetual, false),
    case when m.id is null or m.usage_perpetual or m.usage_months is null or b.base_on is null then null
         else (b.base_on + make_interval(months => m.usage_months::int))::date end
  from public.deliverables x
  join public.agencies a on a.id = x.agency_id
  cross join lateral (select case when x.published_at is null then null
                                  else (x.published_at at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date end as base_on) b
  left join lateral (select t.id, t.usage_months, t.usage_perpetual from public.deal_terms t
                     where t.deal_id = x.deal_id and t.status in ('sent', 'accepted', 'superseded') and t.sent_at is not null
                     order by t.version desc limit 1) m on true
  where x.id = p_deliverable
$$;
revoke execute on function public.deliverable_usage(uuid) from public, anon, authenticated;
grant execute on function public.deliverable_usage(uuid) to service_role;

-- 3) biblioteca da marca ---------------------------------------------------------------------------------------------
create or replace function public.brand_library(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_dt uuid[]; v_today date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is not null then
    v_dt := public.my_brand_deal_talent_ids();
  elsif public.is_platform_admin() then
    select coalesce(array_agg(dt.id), '{}'::uuid[]) into v_dt from public.deal_talents dt join public.deals d on d.id = dt.deal_id
    where d.brand_id = p_brand and d.brand_visible and dt.status in ('proposed', 'contracted');
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  return jsonb_build_object('today', v_today, 'items', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'title', x.title, 'kind', x.kind, 'network', x.network, 'status', x.status,
        'url', coalesce(x.published_url, x.submission_url), 'published', x.published_url is not null,
        'published_at', x.published_at, 'approved_at', x.decided_at,
        'talent_name', tp.display_name, 'deal_talent_id', x.deal_talent_id,
        'request_id', d.request_id, 'campaign', coalesce(nullif(btrim(cr.title), ''), d.title),
        'rights', case when u.terms_id is null then null else public.deal_terms_rights(u.terms_id) end,
        'base_on', u.base_on, 'expires_on', u.expires_on,
        'days_left', case when u.expires_on is null then null else u.expires_on - v_today end)
      order by u.expires_on nulls last, x.published_at desc nulls last, x.created_at desc), '[]'::jsonb)
    from public.deliverables x
    join public.deals d on d.id = x.deal_id
    join public.talent_profiles tp on tp.id = x.talent_id
    left join public.campaign_requests cr on cr.id = d.request_id
    cross join lateral public.deliverable_usage(x.id) u
    where x.brand_id = p_brand and d.brand_visible and x.deal_talent_id = any (v_dt)
      and x.status in ('approved', 'published', 'proof_submitted', 'done')));
end $$;
revoke execute on function public.brand_library(uuid) from public, anon;
grant execute on function public.brand_library(uuid) to authenticated, service_role;

-- aviso de vencimento do direito de uso (cron diário, service_role): faixas 15, 7 e 0 dias
create or replace function public.usage_rights_expiry_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_count int := 0; v_days int; v_band int;
begin
  for r in
    select x.id, x.brand_id, x.agency_id, coalesce(nullif(btrim(cr.title), ''), d.title) as title, tp.display_name, u.expires_on,
           (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date as today
    from public.deliverables x
    join public.deals d on d.id = x.deal_id
    join public.agencies a on a.id = x.agency_id
    join public.deal_talents dt on dt.id = x.deal_talent_id
    join public.talent_profiles tp on tp.id = x.talent_id
    left join public.campaign_requests cr on cr.id = d.request_id
    cross join lateral public.deliverable_usage(x.id) u
    where x.status in ('published', 'proof_submitted', 'done') and d.brand_visible and dt.status in ('proposed', 'contracted')
      and u.expires_on is not null and u.expires_on between current_date - 3 and current_date + 16
  loop
    v_days := r.expires_on - r.today;
    v_band := case when v_days between 8 and 15 then 15 when v_days between 1 and 7 then 7 when v_days between -2 and 0 then 0 end;
    continue when v_band is null;
    v_count := v_count + public.inbox_notify_brand(r.brand_id, false, 'usage_rights_expiring', '/marca/biblioteca',
      jsonb_build_object('deal', left(r.title, 120), 'talent', r.display_name, 'date', to_char(r.expires_on, 'YYYY-MM-DD'),
                         'status', case when v_days <= 0 then 'today' else 'soon' end, 'step', greatest(v_days, 0)::text),
      r.agency_id, 'deliverable', r.id, 'rights:' || r.id::text || ':' || r.expires_on::text || ':' || v_band::text);
  end loop;
  return v_count;
end $$;
revoke execute on function public.usage_rights_expiry_scan() from public, anon, authenticated;
grant execute on function public.usage_rights_expiry_scan() to service_role;

-- 4) métricas por entregável ------------------------------------------------------------------------------------------
create table if not exists public.deliverable_metrics (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deliverable_metrics_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deliverable_metrics_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint deliverable_metrics_deal_fk references public.deals (id) on delete cascade,
  deliverable_id uuid not null constraint deliverable_metrics_deliverable_fk references public.deliverables (id) on delete cascade,
  deal_talent_id uuid not null constraint deliverable_metrics_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deliverable_metrics_talent_fk references public.talent_profiles (id) on delete cascade,
  source text not null default 'manual',
  measured_on date not null,
  reach bigint, views bigint, likes bigint, comments bigint, shares bigint, saves bigint, clicks bigint,
  entered_side text not null,
  entered_by uuid constraint deliverable_metrics_entered_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverable_metrics_source_check check (source in ('manual', 'youtube')),
  constraint deliverable_metrics_side_check check (entered_side in ('talent', 'agency', 'system') and ((source = 'youtube') = (entered_side = 'system'))),
  constraint deliverable_metrics_values_check check (
    coalesce(reach, 0) between 0 and 1000000000000 and coalesce(views, 0) between 0 and 1000000000000
    and coalesce(likes, 0) between 0 and 1000000000000 and coalesce(comments, 0) between 0 and 1000000000000
    and coalesce(shares, 0) between 0 and 1000000000000 and coalesce(saves, 0) between 0 and 1000000000000
    and coalesce(clicks, 0) between 0 and 1000000000000
    and num_nonnulls(reach, views, likes, comments, shares, saves, clicks) > 0),
  constraint deliverable_metrics_uq unique (deliverable_id, source, measured_on)
);
create index if not exists deliverable_metrics_deal_idx on public.deliverable_metrics (deal_id, deliverable_id, measured_on desc);
drop trigger if exists deliverable_metrics_touch on public.deliverable_metrics;
create trigger deliverable_metrics_touch before update on public.deliverable_metrics for each row execute function public.set_updated_at();
drop trigger if exists trg_deliverable_metrics_scope on public.deliverable_metrics;
create trigger trg_deliverable_metrics_scope before insert or update on public.deliverable_metrics for each row execute function public.fill_deal_scope('with_brand', 'with_talent');

-- 5) link rastreável e cupom por influenciador na campanha -----------------------------------------------------------
create table if not exists public.campaign_tracking_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_tracking_links_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint campaign_tracking_links_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint campaign_tracking_links_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint campaign_tracking_links_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint campaign_tracking_links_talent_fk references public.talent_profiles (id) on delete cascade,
  code text not null,
  coupon text not null default '',
  destination_url text not null,
  clicks bigint not null default 0,
  last_click_at timestamptz,
  created_by uuid constraint campaign_tracking_links_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_tracking_links_code_check check (code ~ '^[a-z0-9]{6,16}$'),
  constraint campaign_tracking_links_coupon_check check (coupon ~ '^[A-Z0-9_-]{0,40}$'),
  constraint campaign_tracking_links_url_check check (public.brand_https_url_ok(destination_url)),
  constraint campaign_tracking_links_clicks_check check (clicks >= 0),
  constraint campaign_tracking_links_code_uq unique (code),
  constraint campaign_tracking_links_deal_talent_uq unique (deal_talent_id)
);
create unique index if not exists campaign_tracking_links_coupon_uq on public.campaign_tracking_links (deal_id, coupon) where coupon <> '';
create index if not exists campaign_tracking_links_deal_idx on public.campaign_tracking_links (deal_id);
drop trigger if exists campaign_tracking_links_touch on public.campaign_tracking_links;
create trigger campaign_tracking_links_touch before update on public.campaign_tracking_links for each row execute function public.set_updated_at();
drop trigger if exists trg_campaign_tracking_links_scope on public.campaign_tracking_links;
create trigger trg_campaign_tracking_links_scope before insert or update of deal_id, talent_id on public.campaign_tracking_links for each row execute function public.fill_deal_scope('with_brand', 'with_talent');

-- 6) vendas informadas pela marca -------------------------------------------------------------------------------------
create table if not exists public.campaign_sales (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_sales_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint campaign_sales_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint campaign_sales_deal_fk references public.deals (id) on delete cascade,
  link_id uuid not null constraint campaign_sales_link_fk references public.campaign_tracking_links (id) on delete cascade,
  deal_talent_id uuid not null constraint campaign_sales_deal_talent_fk references public.deal_talents (id) on delete cascade,
  coupon text not null default '',
  quantity integer not null default 0,
  revenue_cents bigint not null default 0,
  reported_on date not null,
  note text not null default '',
  created_by uuid constraint campaign_sales_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campaign_sales_values_check check (quantity between 0 and 10000000 and revenue_cents between 0 and 1000000000000 and (quantity > 0 or revenue_cents > 0)),
  constraint campaign_sales_note_check check (char_length(note) <= 280)
);
create index if not exists campaign_sales_deal_idx on public.campaign_sales (deal_id, reported_on desc);
create index if not exists campaign_sales_link_idx on public.campaign_sales (link_id);
drop trigger if exists trg_campaign_sales_scope on public.campaign_sales;
create trigger trg_campaign_sales_scope before insert or update of deal_id on public.campaign_sales for each row execute function public.fill_deal_scope('with_brand');

-- 7) músicas liberadas por campanha -----------------------------------------------------------------------------------
create table if not exists public.campaign_music_tracks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_music_tracks_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint campaign_music_tracks_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint campaign_music_tracks_deal_fk references public.deals (id) on delete cascade,
  title text not null,
  artist text not null default '',
  source text not null default '',
  url text,
  networks text[] not null default '{}',
  valid_until date,
  created_by uuid constraint campaign_music_tracks_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_music_tracks_texts_check check (char_length(btrim(title)) between 1 and 120 and char_length(artist) <= 120 and char_length(source) <= 200),
  constraint campaign_music_tracks_url_check check (url is null or public.brand_https_url_ok(url)),
  constraint campaign_music_tracks_networks_check check (networks <@ array['instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other']::text[])
);
create index if not exists campaign_music_tracks_deal_idx on public.campaign_music_tracks (deal_id, created_at);
drop trigger if exists campaign_music_tracks_touch on public.campaign_music_tracks;
create trigger campaign_music_tracks_touch before update on public.campaign_music_tracks for each row execute function public.set_updated_at();
drop trigger if exists trg_campaign_music_tracks_scope on public.campaign_music_tracks;
create trigger trg_campaign_music_tracks_scope before insert or update of deal_id on public.campaign_music_tracks for each row execute function public.fill_deal_scope('with_brand');

-- 8) comentários por versão, com o segundo do vídeo --------------------------------------------------------------------
create table if not exists public.deliverable_comments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deliverable_comments_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deliverable_comments_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint deliverable_comments_deal_fk references public.deals (id) on delete cascade,
  deliverable_id uuid not null constraint deliverable_comments_deliverable_fk references public.deliverables (id) on delete cascade,
  version_id uuid not null constraint deliverable_comments_version_fk references public.deliverable_versions (id) on delete cascade,
  deal_talent_id uuid not null constraint deliverable_comments_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deliverable_comments_talent_fk references public.talent_profiles (id) on delete cascade,
  author_side text not null,
  author_id uuid constraint deliverable_comments_author_fk references auth.users (id) on delete set null,
  author_label text not null default '',
  body text not null,
  at_seconds integer,
  created_at timestamptz not null default now(),
  constraint deliverable_comments_side_check check (author_side in ('brand', 'agency')),
  constraint deliverable_comments_body_check check (char_length(btrim(body)) between 1 and 1000 and char_length(author_label) <= 80),
  constraint deliverable_comments_time_check check (at_seconds is null or at_seconds between 0 and 86400)
);
create index if not exists deliverable_comments_version_idx on public.deliverable_comments (version_id, at_seconds nulls first, created_at);
create index if not exists deliverable_comments_deal_idx on public.deliverable_comments (deal_id);
drop trigger if exists trg_deliverable_comments_scope on public.deliverable_comments;
create trigger trg_deliverable_comments_scope before insert or update of deal_id, talent_id on public.deliverable_comments for each row execute function public.fill_deal_scope('with_brand', 'with_talent');

-- 9) RLS: leitura por política, escrita só pelas RPCs ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['deliverable_metrics', 'campaign_tracking_links', 'campaign_sales', 'campaign_music_tracks', 'deliverable_comments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
    if t <> 'campaign_sales' then
      execute format('drop policy if exists %1$s_select_agency on public.%1$I', t);
      execute format('create policy %1$s_select_agency on public.%1$I for select to authenticated using (agency_id = any ((select public.my_agency_ids(''manager''))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]))', t);
    end if;
    if t in ('deliverable_metrics', 'campaign_tracking_links', 'deliverable_comments') then
      execute format('drop policy if exists %1$s_select_brand on public.%1$I', t);
      execute format('create policy %1$s_select_brand on public.%1$I for select to authenticated using (deal_talent_id = any ((select public.my_brand_deal_talent_ids())::uuid[]))', t);
      execute format('drop policy if exists %1$s_select_talent on public.%1$I', t);
      execute format('create policy %1$s_select_talent on public.%1$I for select to authenticated using (deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]))', t);
    end if;
  end loop;
end $$;
-- vendas: a marca e o Adm da agência (receita é valor)
drop policy if exists campaign_sales_select_brand on public.campaign_sales;
create policy campaign_sales_select_brand on public.campaign_sales for select to authenticated
  using (deal_id = any ((select public.my_brand_deal_ids())::uuid[]) and brand_id = any ((select public.my_brand_ids(false))::uuid[]));
drop policy if exists campaign_sales_select_agency on public.campaign_sales;
create policy campaign_sales_select_agency on public.campaign_sales for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
-- músicas: a marca do negócio e o influenciador confirmado/contratado
drop policy if exists campaign_music_tracks_select_brand on public.campaign_music_tracks;
create policy campaign_music_tracks_select_brand on public.campaign_music_tracks for select to authenticated
  using (deal_id = any ((select public.my_brand_deal_ids())::uuid[]));
drop policy if exists campaign_music_tracks_select_talent on public.campaign_music_tracks;
create policy campaign_music_tracks_select_talent on public.campaign_music_tracks for select to authenticated
  using (deal_id = any ((select public.my_talent_contract_deal_ids())::uuid[]));

-- 10) métricas: influenciador do entregável ou agência informam (upsert por dia) ----------------------------------------
create or replace function public.deliverable_metrics_record(p_deliverable uuid, p_measured_on date, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; v_side text; v_tz text; v_today date; v_vals jsonb := '{}'::jsonb; k text; v jsonb; v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into x from public.deliverables where id = p_deliverable;
  if x.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if x.deal_talent_id = any (public.my_talent_deal_talent_ids())
     and exists (select 1 from public.deal_talents dt where dt.id = x.deal_talent_id and dt.status in ('proposed', 'contracted')) then v_side := 'talent';
  elsif public.agency_can(x.agency_id, 'manager') or x.deal_id = any (public.my_staff_deal_ids()) then v_side := 'agency';
  elsif public.agency_can(x.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  if x.status not in ('published', 'proof_submitted', 'done') or x.published_at is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = x.agency_id;
  v_today := (now() at time zone v_tz)::date;
  if p_measured_on is null or p_measured_on > v_today or p_measured_on < (x.published_at at time zone v_tz)::date then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_data) loop
    if k not in ('reach', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks') then raise exception 'invalid_input' using errcode = '22023'; end if;
    if jsonb_typeof(v) = 'null' then continue; end if;
    if jsonb_typeof(v) not in ('number', 'string') or (v #>> '{}') !~ '^[0-9]{1,13}$' or (v #>> '{}')::bigint > 1000000000000 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_vals := v_vals || jsonb_build_object(k, (v #>> '{}')::bigint);
  end loop;
  if v_vals = '{}'::jsonb then raise exception 'invalid_input' using errcode = '22023'; end if;
  insert into public.deliverable_metrics (agency_id, brand_id, deal_id, deliverable_id, deal_talent_id, talent_id, source, measured_on,
    reach, views, likes, comments, shares, saves, clicks, entered_side, entered_by)
  values (x.agency_id, x.brand_id, x.deal_id, x.id, x.deal_talent_id, x.talent_id, 'manual', p_measured_on,
    (v_vals ->> 'reach')::bigint, (v_vals ->> 'views')::bigint, (v_vals ->> 'likes')::bigint, (v_vals ->> 'comments')::bigint,
    (v_vals ->> 'shares')::bigint, (v_vals ->> 'saves')::bigint, (v_vals ->> 'clicks')::bigint, v_side, auth.uid())
  on conflict (deliverable_id, source, measured_on) do update set
    reach = excluded.reach, views = excluded.views, likes = excluded.likes, comments = excluded.comments,
    shares = excluded.shares, saves = excluded.saves, clicks = excluded.clicks, entered_side = excluded.entered_side, entered_by = excluded.entered_by
  returning id into v_id;
  perform public.audit_log('deliverable.metrics', 'deliverable', x.id::text, null,
    jsonb_build_object('agency_id', x.agency_id, 'measured_on', p_measured_on, 'side', v_side) || v_vals, null,
    case when v_side = 'talent' then 'creator'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  return v_id;
end $$;
revoke execute on function public.deliverable_metrics_record(uuid, date, jsonb) from public, anon;
grant execute on function public.deliverable_metrics_record(uuid, date, jsonb) to authenticated, service_role;

-- 11) link rastreável: a agência cria/edita (destino https; padrão = site da marca) -------------------------------------
create or replace function public.agency_tracking_link_save(p_deal_talent uuid, p_destination text, p_coupon text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare dt public.deal_talents%rowtype; v_agency uuid; v_dest text := nullif(btrim(coalesce(p_destination, '')), '');
        v_coupon text := upper(btrim(coalesce(p_coupon, ''))); v_id uuid; v_code text; v_before jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into dt from public.deal_talents where id = p_deal_talent;
  if dt.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(dt.deal_id, true);
  if dt.status not in ('proposed', 'contracted') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_dest is null then
    select b.site_url into v_dest from public.deals d join public.brands b on b.id = d.brand_id where d.id = dt.deal_id;
  end if;
  if v_dest is null or not public.brand_https_url_ok(v_dest) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if v_coupon !~ '^[A-Z0-9_-]{0,40}$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_coupon <> '' and exists (select 1 from public.campaign_tracking_links l where l.deal_id = dt.deal_id and l.coupon = v_coupon and l.deal_talent_id <> dt.id) then
    raise exception 'coupon_taken' using errcode = '23505';
  end if;
  select l.id, jsonb_build_object('destination_url', l.destination_url, 'coupon', l.coupon) into v_id, v_before
  from public.campaign_tracking_links l where l.deal_talent_id = dt.id for update;
  if v_id is null then
    loop
      v_code := substr(md5(gen_random_uuid()::text), 1, 8);
      exit when not exists (select 1 from public.campaign_tracking_links l where l.code = v_code);
    end loop;
    insert into public.campaign_tracking_links (agency_id, brand_id, deal_id, deal_talent_id, talent_id, code, coupon, destination_url, created_by)
    select d.agency_id, d.brand_id, d.id, dt.id, dt.talent_id, v_code, v_coupon, v_dest, auth.uid() from public.deals d where d.id = dt.deal_id
    returning id into v_id;
  else
    update public.campaign_tracking_links set destination_url = v_dest, coupon = v_coupon where id = v_id;
  end if;
  perform public.audit_log('tracking.save', 'campaign_tracking_link', v_id::text, v_before,
    jsonb_build_object('agency_id', v_agency, 'deal_talent_id', dt.id, 'destination_url', v_dest, 'coupon', v_coupon), null, public.talent_audit_actor('agency', v_agency));
  return v_id;
end $$;
revoke execute on function public.agency_tracking_link_save(uuid, text, text) from public, anon;
grant execute on function public.agency_tracking_link_save(uuid, text, text) to authenticated, service_role;

-- clique em /r/<código>: só o servidor (service role) registra; SQL comum (sem security definer). Devolve o destino.
create or replace function public.tracking_link_click(p_code text)
returns text language sql volatile set search_path = '' as $$
  update public.campaign_tracking_links set clicks = clicks + 1, last_click_at = now()
  where code = lower(btrim(coalesce(p_code, ''))) and public.brand_https_url_ok(destination_url)
  returning destination_url
$$;
revoke execute on function public.tracking_link_click(text) from public, anon, authenticated;
grant execute on function public.tracking_link_click(text) to service_role;

-- 12) vendas: a marca informa por cupom/link; apaga quem lançou ou o dono --------------------------------------------
create or replace function public.brand_sales_record(p_link uuid, p_quantity integer, p_revenue_cents bigint, p_reported_on date, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.campaign_tracking_links%rowtype; v_note text := btrim(coalesce(p_note, '')); v_id uuid; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into l from public.campaign_tracking_links where id = p_link;
  if l.id is null or public.brand_member_of(l.brand_id) is null or not (l.deal_talent_id = any (public.my_brand_deal_talent_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_quantity is null or p_revenue_cents is null or p_quantity < 0 or p_quantity > 10000000 or p_revenue_cents < 0 or p_revenue_cents > 1000000000000
     or (p_quantity = 0 and p_revenue_cents = 0) or char_length(v_note) > 280 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_reported_on is null or p_reported_on > v_today or p_reported_on < v_today - 730 then raise exception 'invalid_date' using errcode = '22023'; end if;
  insert into public.campaign_sales (agency_id, brand_id, deal_id, link_id, deal_talent_id, coupon, quantity, revenue_cents, reported_on, note, created_by)
  values (l.agency_id, l.brand_id, l.deal_id, l.id, l.deal_talent_id, l.coupon, p_quantity, p_revenue_cents, p_reported_on, v_note, auth.uid())
  returning id into v_id;
  perform public.audit_log('brand.sales_record', 'campaign_sale', v_id::text, null,
    jsonb_build_object('brand_id', l.brand_id, 'link_id', l.id, 'quantity', p_quantity, 'revenue_cents', p_revenue_cents, 'reported_on', p_reported_on), null, 'brand'::public.actor_type);
  return v_id;
end $$;
revoke execute on function public.brand_sales_record(uuid, integer, bigint, date, text) from public, anon;
grant execute on function public.brand_sales_record(uuid, integer, bigint, date, text) to authenticated, service_role;

create or replace function public.brand_sales_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.campaign_sales%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.campaign_sales where id = p_id;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(s.brand_id);
  if v_role is null or not (s.deal_id = any (public.my_brand_deal_ids())) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role <> 'owner' and s.created_by is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.campaign_sales where id = s.id;
  perform public.audit_log('brand.sales_delete', 'campaign_sale', s.id::text,
    jsonb_build_object('brand_id', s.brand_id, 'quantity', s.quantity, 'revenue_cents', s.revenue_cents, 'reported_on', s.reported_on), null, null, 'brand'::public.actor_type);
end $$;
revoke execute on function public.brand_sales_delete(uuid) from public, anon;
grant execute on function public.brand_sales_delete(uuid) to authenticated, service_role;

-- 13) músicas liberadas: a agência cadastra, edita e remove -------------------------------------------------------------
create or replace function public.agency_music_save(p_id uuid, p_deal uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_deal uuid := p_deal; v_agency uuid; v_id uuid; v_title text; v_artist text; v_source text; v_url text; v_nets text[] := '{}'; v_until date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_id is not null then
    select m.deal_id into v_deal from public.campaign_music_tracks m where m.id = p_id;
    if v_deal is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_deal is not null and p_deal <> v_deal then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  if v_deal is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(v_deal, true);
  v_title := btrim(coalesce(p_data ->> 'title', ''));
  v_artist := btrim(coalesce(p_data ->> 'artist', ''));
  v_source := btrim(coalesce(p_data ->> 'source', ''));
  v_url := nullif(btrim(coalesce(p_data ->> 'url', '')), '');
  if char_length(v_title) not between 1 and 120 or char_length(v_artist) > 120 or char_length(v_source) > 200 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_url is not null and not public.brand_https_url_ok(v_url) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if p_data ? 'networks' then
    if jsonb_typeof(p_data -> 'networks') <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct x order by x), '{}') into v_nets from jsonb_array_elements_text(p_data -> 'networks') x;
  end if;
  begin
    v_until := nullif(btrim(coalesce(p_data ->> 'valid_until', '')), '')::date;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  begin
    if p_id is null then
      if (select count(*) from public.campaign_music_tracks m where m.deal_id = v_deal) >= 50 then raise exception 'limit_reached' using errcode = 'P0001'; end if;
      insert into public.campaign_music_tracks (agency_id, brand_id, deal_id, title, artist, source, url, networks, valid_until, created_by)
      select d.agency_id, d.brand_id, d.id, v_title, v_artist, v_source, v_url, v_nets, v_until, auth.uid() from public.deals d where d.id = v_deal
      returning id into v_id;
    else
      update public.campaign_music_tracks set title = v_title, artist = v_artist, source = v_source, url = v_url, networks = v_nets, valid_until = v_until
      where id = p_id returning id into v_id;
    end if;
  exception when check_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('music.save', 'campaign_music_track', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'deal_id', v_deal, 'title', v_title), null, public.talent_audit_actor('agency', v_agency));
  return v_id;
end $$;
revoke execute on function public.agency_music_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.agency_music_save(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.agency_music_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.campaign_music_tracks%rowtype; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into m from public.campaign_music_tracks where id = p_id;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(m.deal_id, true);
  delete from public.campaign_music_tracks where id = m.id;
  perform public.audit_log('music.delete', 'campaign_music_track', m.id::text, jsonb_build_object('agency_id', v_agency, 'deal_id', m.deal_id, 'title', m.title), null, null,
    public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.agency_music_delete(uuid) from public, anon;
grant execute on function public.agency_music_delete(uuid) to authenticated, service_role;

-- 14) comentário numa versão do entregável (marca ou agência), com o segundo do vídeo opcional --------------------------
create or replace function public.deliverable_comment_add(p_version uuid, p_body text, p_at_seconds integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.deliverable_versions%rowtype; x public.deliverables%rowtype; d public.deals%rowtype; v_side text; v_body text := btrim(coalesce(p_body, '')); v_id uuid; v_to uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v from public.deliverable_versions where id = p_version;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into x from public.deliverables where id = v.deliverable_id;
  select * into d from public.deals where id = x.deal_id;
  if d.brand_visible and public.brand_member_of(d.brand_id) is not null and x.deal_talent_id = any (public.my_brand_deal_talent_ids()) then v_side := 'brand';
  elsif public.agency_can(x.agency_id, 'manager') or x.deal_id = any (public.my_staff_deal_ids()) then v_side := 'agency';
  elsif public.agency_can(x.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  if d.stage = 'closed' or x.status = 'cancelled' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 1000 or (p_at_seconds is not null and p_at_seconds not between 0 and 86400) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.deliverable_comments (agency_id, brand_id, deal_id, deliverable_id, version_id, deal_talent_id, talent_id, author_side, author_id, author_label, body, at_seconds)
  values (x.agency_id, x.brand_id, x.deal_id, x.id, v.id, x.deal_talent_id, x.talent_id, v_side, auth.uid(), public.actor_label(x.agency_id, x.brand_id), v_body, p_at_seconds)
  returning id into v_id;
  perform public.audit_log('deliverable.comment', 'deliverable', x.id::text, null,
    jsonb_build_object('agency_id', x.agency_id, 'version_id', v.id, 'side', v_side, 'at_seconds', p_at_seconds), null,
    case when v_side = 'brand' then 'brand'::public.actor_type else public.talent_audit_actor('agency', x.agency_id) end);
  v_to := public.talent_user_id(x.talent_id);
  perform public.inbox_notify(v_to, 'deliverable_comment', '/creator/escritorio/oportunidades/' || x.deal_talent_id::text,
    jsonb_build_object('deal', d.title, 'status', v_side), x.agency_id, 'deliverable', x.id, 'comment:' || v_id::text);
  if v_side = 'brand' and d.owner_id is not null and d.owner_id <> auth.uid() then
    perform public.inbox_notify(d.owner_id, 'deliverable_comment', '/agencia/negocios/' || d.id::text || '/entregas',
      jsonb_build_object('deal', d.title, 'status', v_side), x.agency_id, 'deliverable', x.id, 'comment:' || v_id::text || ':owner');
  end if;
  return v_id;
end $$;
revoke execute on function public.deliverable_comment_add(uuid, text, integer) from public, anon;
grant execute on function public.deliverable_comment_add(uuid, text, integer) to authenticated, service_role;

create or replace function public.deliverable_comment_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.deliverable_comments%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into c from public.deliverable_comments where id = p_id;
  if c.id is null or c.author_id is distinct from auth.uid() then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.deliverable_comments where id = c.id;
end $$;
revoke execute on function public.deliverable_comment_delete(uuid) from public, anon;
grant execute on function public.deliverable_comment_delete(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
