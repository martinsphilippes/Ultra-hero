-- =============================================================================
-- Groscove Ultra · 0101 · Agenda conectada: propostas a partir do evento, conteúdos editoriais e Real-Time Culture · S107
-- Etapas 5, 2.1 (M2) e 6 do prompt mestre da agenda (auditoria-agenda.md). Idempotente; nada de drop de tabela/coluna;
-- funções com search_path fixo; nenhuma função nova executável por anon (S14 segue 18); sem sobrecarga.
--
-- Decisões (sem perguntar ao responsável):
--   • Vínculo proposta ↔ evento: coluna calendar_event_id OPCIONAL em campaign_requests (campanha da marca), brand_calls
--     (chamada da marca) e sponsorship_opportunities (patrocínio da agência), FK a calendar_events (evento da plataforma
--     OU da agência; apagar o evento da agência solta o vínculo, on delete set null). As RPCs de salvar NÃO mudam (os
--     fluxos de aprovação interna 0081, negociação e publicação seguem como estão): o app salva pelo fluxo de sempre e
--     grava o vínculo com commercial_event_link, ANTES de enviar/publicar (campanha e chamada) — o vínculo só se mexe no
--     rascunho (campanha/chamada) ou em rascunho/aberta (patrocínio): depois disso o histórico fica preservado.
--   • Quem liga: quem edita o item pelas regras de hoje (marca: dono ou equipe, rascunho, equipe não mexe com aprovação
--     pendente; patrocínio: gestor+ da agência). O evento precisa estar VISÍVEL a quem liga (plataforma: publicado e no ar
--     para quem tem portal; agência: o que calendar_events_for_user devolve) e, se for evento de agência, ser da MESMA
--     agência do item (chamada da marca: só evento da plataforma — ela vai a várias agências).
--   • Território → segmento: a marca não lê os segmentos da agência (RLS). O app manda os slugs sugeridos pelo
--     território do evento (lib pura testada) e o banco resolve para os segmentos ATIVOS da agência da campanha com o
--     mesmo slug — só se a campanha ainda não tem segmento (nunca sobrescreve escolha). Sem correspondência, nada muda.
--   • Histórico no evento: calendar_event_commercial(p_event) devolve os itens ligados que a pessoa pode ver, pelas MESMAS
--     regras de leitura de hoje (marca: só os dela, inclusive rascunhos; agência gestor+: os dela, sem rascunho de marca;
--     colaborador: negócios dele; herói: negócios em que foi consultado e patrocínios dele já publicados; admin: tudo o que
--     não é rascunho de marca). Nunca valores. A marca nunca recebe herói por aqui.
--   • Oportunidades abertas por evento (Real-Time Culture): calendar_event_opportunities() devolve, por evento da
--     plataforma, quantos patrocínios/chamadas ABERTOS ligados a pessoa vê (só números).
--   • Conteúdos editoriais (M2): tabela leve agenda_posts (a auditoria recomendou não usar content, que exige herói autor
--     e cairia no Explorar público). Notícia ou dica: título, texto, imagem opcional (URL https — sem upload novo nesta
--     etapa), link opcional, evento opcional, estado draft | scheduled | published com published_at (programado vira
--     publicado sozinho quando a data chega, sem cron — mesma regra e mesma função platform_event_state da 0098). Autor:
--     admin (escopo 'platform', para todos com portal) ou agência gestor+ (escopo 'agency', para a própria rede: equipe da
--     agência, marcas que ela atende e heróis do casting). Rascunho e programado futuro só os editores veem. Não há feed
--     do consumidor: o conteúdo aparece só na Real-Time Culture e no detalhe do evento dos portais.
--   • Hashtags do mês e trending topics do trimestre: calendar_imports.meta (0099) é só dos editores; platform_culture_meta
--     devolve só o mês/trimestre pedido para quem tem portal.
-- =============================================================================

-- 1) vínculo com o evento ---------------------------------------------------------------------------------------------
alter table public.campaign_requests add column if not exists calendar_event_id uuid
  constraint campaign_requests_calendar_event_fk references public.calendar_events (id) on delete set null;
alter table public.brand_calls add column if not exists calendar_event_id uuid
  constraint brand_calls_calendar_event_fk references public.calendar_events (id) on delete set null;
alter table public.sponsorship_opportunities add column if not exists calendar_event_id uuid
  constraint sponsorship_opportunities_calendar_event_fk references public.calendar_events (id) on delete set null;
create index if not exists campaign_requests_calendar_event_idx on public.campaign_requests (calendar_event_id) where calendar_event_id is not null;
create index if not exists brand_calls_calendar_event_idx on public.brand_calls (calendar_event_id) where calendar_event_id is not null;
create index if not exists sponsorship_opportunities_calendar_event_idx on public.sponsorship_opportunities (calendar_event_id) where calendar_event_id is not null;

-- evento visível para uma pessoa (interna): plataforma publicada e no ar para quem tem portal; agência pelo feed
create or replace function public.calendar_event_visible_for(p_user uuid, p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_event is not null and (
       exists (select 1 from public.calendar_events e where e.id = p_event and e.scope = 'platform' and e.status <> 'draft'
               and e.published_at <= now() and public.platform_calendar_reader_for(p_user))
    or exists (select 1 from public.calendar_events_for_user(p_user) e where e.id = p_event))
$$;
revoke execute on function public.calendar_event_visible_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.calendar_event_visible_for(uuid, uuid) to service_role;

-- ligar / soltar. p_kind: 'campaign' | 'brand_call' | 'sponsorship'. p_event null = soltar. p_segments: slugs sugeridos
-- pelo território (só campanha; só se ela ainda não tem segmento). Devolve o evento ligado (ou null).
create or replace function public.commercial_event_link(p_kind text, p_id uuid, p_event uuid, p_segments text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; c public.brand_calls%rowtype; o public.sponsorship_opportunities%rowtype;
        e public.calendar_events%rowtype; v_agency uuid; v_before uuid; v_role text; v_segs uuid[]; v_actor public.actor_type;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('campaign', 'brand_call', 'sponsorship') or p_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_segments is not null and (cardinality(p_segments) > 5 or exists (select 1 from unnest(p_segments) s where s is null or s !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(s) > 40)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind = 'campaign' then
    select * into r from public.campaign_requests where id = p_id for update;
    v_role := case when r.id is null then null else public.brand_member_of(r.brand_id) end;
    if r.id is null or v_role is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
    if r.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if v_role <> 'owner' and r.approval_status = 'pending' then raise exception 'awaiting_approval' using errcode = 'P0001'; end if;
    v_agency := r.agency_id; v_before := r.calendar_event_id; v_actor := 'brand';
  elsif p_kind = 'brand_call' then
    select * into c from public.brand_calls where id = p_id for update;
    v_role := case when c.id is null then null else public.brand_member_of(c.brand_id) end;
    if c.id is null or v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if c.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if v_role <> 'owner' and c.approval_status = 'pending' then raise exception 'awaiting_approval' using errcode = 'P0001'; end if;
    v_before := c.calendar_event_id; v_actor := 'brand';
  else
    select * into o from public.sponsorship_opportunities where id = p_id for update;
    if o.id is null or not public.agency_can(o.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not public.agency_can(o.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    if o.status not in ('draft', 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_agency := o.agency_id; v_before := o.calendar_event_id; v_actor := public.talent_audit_actor('agency', o.agency_id);
  end if;
  if p_event is not null then
    select * into e from public.calendar_events where id = p_event;
    if e.id is null or not public.calendar_event_visible_for(auth.uid(), p_event) then raise exception 'not_found' using errcode = 'P0002'; end if;
    -- evento de agência: só da mesma agência do item (a chamada da marca vai a várias agências: só plataforma)
    if e.scope = 'agency' and (p_kind = 'brand_call' or e.agency_id is distinct from v_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  if p_kind = 'campaign' then
    update public.campaign_requests set calendar_event_id = p_event where id = p_id;
    if p_event is not null and cardinality(coalesce(p_segments, '{}'::text[])) > 0 and cardinality(r.segment_ids) = 0 then
      select coalesce(array_agg(s.id order by s.sort_order), '{}'::uuid[]) into v_segs from public.talent_segments s
      where s.agency_id = r.agency_id and s.active and s.slug = any (p_segments);
      if cardinality(v_segs) > 0 then update public.campaign_requests set segment_ids = v_segs where id = p_id; end if;
    end if;
  elsif p_kind = 'brand_call' then
    update public.brand_calls set calendar_event_id = p_event where id = p_id;
  else
    update public.sponsorship_opportunities set calendar_event_id = p_event where id = p_id;
  end if;
  if v_before is distinct from p_event then
    perform public.audit_log('calendar.commercial_link', p_kind, p_id::text, jsonb_build_object('calendar_event_id', v_before),
      jsonb_build_object('calendar_event_id', p_event), null, v_actor);
  end if;
  return p_event;
end $$;
revoke execute on function public.commercial_event_link(text, uuid, uuid, text[]) from public, anon;
grant execute on function public.commercial_event_link(text, uuid, uuid, text[]) to authenticated, service_role;

-- 2) histórico comercial do evento (o que a pessoa pode ver) ----------------------------------------------------------
-- itens: {kind: campaign|brand_call|sponsorship, id, title, status, starts_on, side: brand|agency|staff|hero|admin, deal_id?}
create or replace function public.calendar_event_commercial(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean; v_talent uuid; v_staff uuid[]; v_tdeals uuid[]; out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_admin := public.is_platform_admin();
  if not (v_admin or public.calendar_event_visible_for(auth.uid(), p_event)) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_talent := public.my_talent_id();
  v_staff := public.my_staff_deal_ids();
  v_tdeals := public.my_talent_deal_ids();
  select coalesce(jsonb_agg(x.item order by x.at desc), '[]'::jsonb) into out from (
    -- campanhas da marca (e o negócio que nasceu delas)
    select r.created_at as at, jsonb_strip_nulls(jsonb_build_object('kind', 'campaign', 'id', r.id, 'title', r.title, 'status', r.status,
             'starts_on', r.period_start, 'side', s.side,
             'deal_id', case when s.side in ('agency', 'staff', 'hero', 'admin') then d.id end,
             'deal_stage', case when s.side in ('agency', 'staff', 'admin') then d.stage end)) as item
    from public.campaign_requests r
    left join lateral (select d0.id, d0.stage from public.deals d0 where d0.request_id = r.id order by d0.created_at limit 1) d on true
    cross join lateral (select case
        when public.brand_member_of(r.brand_id) is not null then 'brand'
        when r.origin = 'brand' and r.status = 'draft' then null
        when r.agency_id = any (public.my_agency_ids('manager')) then 'agency'
        when v_admin then 'admin'
        when d.id is not null and d.id = any (v_staff) then 'staff'
        when d.id is not null and d.id = any (v_tdeals) then 'hero'
      end as side) s
    where r.calendar_event_id = p_event and s.side is not null
    union all
    -- chamadas da marca (agência: publicadas que chegaram a ela; herói: nunca)
    select c.created_at, jsonb_build_object('kind', 'brand_call', 'id', c.id, 'title', c.title, 'status', c.status, 'starts_on', c.starts_on, 'side', s.side)
    from public.brand_calls c
    cross join lateral (select case
        when public.brand_member_of(c.brand_id) is not null then 'brand'
        when c.status = 'draft' then null
        when exists (select 1 from unnest(public.my_agency_ids('manager')) g where public.brand_call_agency_ok(c.id, g)) then 'agency'
        when v_admin then 'admin'
      end as side) s
    where c.calendar_event_id = p_event and s.side is not null
    union all
    -- patrocínios da agência (marca: os que chegam a ela; herói: os dele já publicados)
    select o.created_at, jsonb_build_object('kind', 'sponsorship', 'id', o.id, 'title', o.title, 'status', o.status,
             'starts_on', (o.starts_at at time zone 'America/Sao_Paulo')::date, 'side', s.side)
    from public.sponsorship_opportunities o
    cross join lateral (select case
        when o.agency_id = any (public.my_agency_ids('manager')) then 'agency'
        when v_admin then 'admin'
        when o.id = any (public.brand_sponsorship_ids_for(auth.uid(), false)) then 'brand'
        when o.status <> 'draft' and v_talent is not null and o.talent_id = v_talent then 'hero'
      end as side) s
    where o.calendar_event_id = p_event and s.side is not null
  ) x;
  return jsonb_build_object('items', out);
end $$;
revoke execute on function public.calendar_event_commercial(uuid) from public, anon;
grant execute on function public.calendar_event_commercial(uuid) to authenticated, service_role;

-- 3) eventos com oportunidades abertas (Real-Time Culture): só números, só o que a pessoa vê ------------------------------
create or replace function public.calendar_event_opportunities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean; v_talent uuid; v_brand_sp uuid[]; v_agencies uuid[]; out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.platform_calendar_reader() then return '[]'::jsonb; end if;
  v_admin := public.is_platform_admin();
  v_talent := public.my_talent_id();
  v_brand_sp := public.brand_sponsorship_ids_for(auth.uid(), false);
  v_agencies := public.my_agency_ids('manager');
  select coalesce(jsonb_agg(jsonb_build_object('event_id', z.event_id, 'sponsorships', z.sp, 'calls', z.bc) order by z.event_id), '[]'::jsonb) into out from (
    select y.event_id, sum(y.sp)::int as sp, sum(y.bc)::int as bc from (
      select o.calendar_event_id as event_id, 1 as sp, 0 as bc from public.sponsorship_opportunities o
      where o.calendar_event_id is not null and o.status = 'open'
        and (v_admin or o.agency_id = any (v_agencies) or o.id = any (v_brand_sp) or (v_talent is not null and o.talent_id = v_talent))
      union all
      select c.calendar_event_id, 0, 1 from public.brand_calls c
      where c.calendar_event_id is not null and c.status = 'open'
        and (v_admin or public.brand_member_of(c.brand_id) is not null or exists (select 1 from unnest(v_agencies) g where public.brand_call_agency_ok(c.id, g)))
    ) y join public.calendar_events e on e.id = y.event_id and e.scope = 'platform' and e.status = any (array['published', 'scheduled']) and e.published_at <= now()
    group by y.event_id
  ) z;
  return out;
end $$;
revoke execute on function public.calendar_event_opportunities() from public, anon;
grant execute on function public.calendar_event_opportunities() to authenticated, service_role;

-- 4) hashtags do mês e trending topics do trimestre (de calendar_imports.meta) para quem tem portal -------------------------
create or replace function public.platform_culture_meta(p_year int, p_month int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_month jsonb; v_quarter jsonb; q text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_year is null or p_month is null or p_year not between 2000 and 2100 or p_month not between 1 and 12 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not (public.platform_calendar_reader() or public.platform_calendar_can_write()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  q := 'Q' || ((p_month - 1) / 3 + 1)::text;
  select m into v_month from public.calendar_imports i
  cross join lateral jsonb_array_elements(case when jsonb_typeof(i.meta -> 'months') = 'array' then i.meta -> 'months' else '[]'::jsonb end) m
  where i.year = p_year and (m ->> 'month') = p_month::text
  order by i.created_at desc limit 1;
  select x into v_quarter from public.calendar_imports i
  cross join lateral jsonb_array_elements(case when jsonb_typeof(i.meta -> 'quarters') = 'array' then i.meta -> 'quarters' else '[]'::jsonb end) x
  where i.year = p_year and (x ->> 'quarter') = q
  order by i.created_at desc limit 1;
  return jsonb_build_object(
    'month', case when v_month is null then null else jsonb_build_object('label', coalesce(v_month ->> 'label', v_month ->> 'title'), 'hashtags', coalesce(v_month -> 'hashtags', '[]'::jsonb)) end,
    'quarter', case when v_quarter is null then null else jsonb_build_object('quarter', q, 'trending_topics', coalesce(v_quarter -> 'trending_topics', '[]'::jsonb),
      'territories', coalesce(v_quarter -> 'territories', '[]'::jsonb), 'summary', coalesce(v_quarter ->> 'summary', '')) end);
end $$;
revoke execute on function public.platform_culture_meta(int, int) from public, anon;
grant execute on function public.platform_culture_meta(int, int) to authenticated, service_role;

-- 5) conteúdos editoriais (notícias e dicas) ---------------------------------------------------------------------------
create table if not exists public.agenda_posts (
  id uuid primary key default gen_random_uuid(),
  scope text not null constraint agenda_posts_scope_check check (scope in ('platform', 'agency')),
  agency_id uuid constraint agenda_posts_agency_fk references public.agencies (id) on delete cascade,
  kind text not null default 'news' constraint agenda_posts_kind_check check (kind in ('news', 'tip')),
  title text not null constraint agenda_posts_title_check check (char_length(title) between 3 and 140 and title = btrim(title)),
  body text not null default '' constraint agenda_posts_body_check check (char_length(body) <= 3000),
  image_url text constraint agenda_posts_image_check check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^https://[^\s<>"]+$')),
  link_url text constraint agenda_posts_link_check check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^https://[^\s<>"]+$')),
  calendar_event_id uuid constraint agenda_posts_event_fk references public.calendar_events (id) on delete set null,
  status text not null default 'draft' constraint agenda_posts_status_check check (status in ('draft', 'scheduled', 'published')),
  published_at timestamptz,
  created_by uuid constraint agenda_posts_created_by_fk references auth.users (id) on delete set null,
  updated_by uuid constraint agenda_posts_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_posts_scope_agency_check check ((scope = 'platform') = (agency_id is null)),
  constraint agenda_posts_published_check check ((status = 'draft') = (published_at is null))
);
create index if not exists agenda_posts_published_idx on public.agenda_posts (published_at desc) where status <> 'draft';
create index if not exists agenda_posts_agency_idx on public.agenda_posts (agency_id, published_at desc) where agency_id is not null;
create index if not exists agenda_posts_event_idx on public.agenda_posts (calendar_event_id) where calendar_event_id is not null;

-- rede de uma agência para a pessoa: equipe (qualquer papel), marcas atendidas (vínculo ativo) e heróis do casting
-- (a ficha com login ou o herói ligado à ficha, titular e equipe)
create or replace function public.my_agency_network_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.agency_id), '{}'::uuid[]) from (
    select m.agency_id from public.agency_members m where m.user_id = auth.uid() and m.revoked_at is null
    union
    select ab.agency_id from public.agency_brands ab join public.brand_members bm on bm.brand_id = ab.brand_id and bm.user_id = auth.uid() and bm.revoked_at is null
    where ab.status = 'active'
    union
    select t.agency_id from public.talent_profiles t
    where t.archived_at is null and (t.user_id = auth.uid() or (t.creator_id is not null and t.creator_id = any (public.my_team_creator_ids())))
  ) x join public.agencies a on a.id = x.agency_id and a.status = 'active'
$$;
revoke execute on function public.my_agency_network_ids() from public, anon;
grant execute on function public.my_agency_network_ids() to authenticated, service_role;

do $$
begin
  execute 'revoke all on table public.agenda_posts from public, anon, authenticated';
  execute 'grant select on table public.agenda_posts to authenticated';
  execute 'grant all on table public.agenda_posts to service_role';
  execute 'alter table public.agenda_posts enable row level security';
  drop trigger if exists trg_agenda_posts_updated on public.agenda_posts;
  create trigger trg_agenda_posts_updated before update on public.agenda_posts for each row execute function public.set_updated_at();
end $$;

-- editores: admin (tudo), co-editora da plataforma (escopo plataforma), gestor+ da agência (os da agência)
drop policy if exists agenda_posts_select_editor on public.agenda_posts;
create policy agenda_posts_select_editor on public.agenda_posts for select to authenticated
  using ((select public.is_platform_admin())
         or (scope = 'platform' and (select public.platform_calendar_can_write()))
         or (scope = 'agency' and agency_id = any ((select public.my_agency_ids('manager'))::uuid[])));
-- leitores: publicado e no ar; plataforma para quem tem portal, agência para a rede dela
drop policy if exists agenda_posts_select_reader on public.agenda_posts;
create policy agenda_posts_select_reader on public.agenda_posts for select to authenticated
  using (status <> 'draft' and published_at <= now()
         and ((scope = 'platform' and (select public.platform_calendar_reader()))
              or (scope = 'agency' and agency_id = any ((select public.my_agency_network_ids())::uuid[]))));

-- salvar: p_agency null = Groscove (admin / co-editora); senão a agência (gestor+). p_data: kind, title, body, image_url,
-- link_url, calendar_event_id, status (draft|scheduled|published), publish_at (programado).
create or replace function public.agenda_post_save(p_id uuid, p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before public.agenda_posts%rowtype; v_id uuid := p_id; v_scope text; v_kind text; v_title text; v_body text; v_img text; v_link text;
        v_event uuid; e public.calendar_events%rowtype; st jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_scope := case when p_agency is null then 'platform' else 'agency' end;
  if v_scope = 'platform' then
    if not public.platform_calendar_can_write() then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if v_id is not null then
    select * into v_before from public.agenda_posts p where p.id = v_id and p.scope = v_scope and p.agency_id is not distinct from p_agency for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  v_kind := coalesce(nullif(p_data ->> 'kind', ''), v_before.kind, 'news');
  v_title := regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g');
  v_body := btrim(coalesce(p_data ->> 'body', ''));
  v_img := nullif(btrim(coalesce(p_data ->> 'image_url', '')), '');
  v_link := nullif(btrim(coalesce(p_data ->> 'link_url', '')), '');
  begin
    v_event := nullif(btrim(coalesce(p_data ->> 'calendar_event_id', '')), '')::uuid;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_event is not null then
    select * into e from public.calendar_events where id = v_event;
    -- plataforma: evento da plataforma que não é rascunho; agência: da plataforma (no ar) ou dela mesma
    if e.id is null
       or (v_scope = 'platform' and (e.scope <> 'platform' or e.status = 'draft'))
       or (v_scope = 'agency' and not ((e.scope = 'platform' and e.status <> 'draft' and e.published_at <= now()) or (e.scope = 'agency' and e.agency_id = p_agency))) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  st := public.platform_event_state(coalesce(nullif(p_data ->> 'status', ''), 'draft'), p_data ->> 'publish_at', v_before.status, v_before.published_at);
  begin
    if v_id is null then
      insert into public.agenda_posts (scope, agency_id, kind, title, body, image_url, link_url, calendar_event_id, status, published_at, created_by, updated_by)
      values (v_scope, p_agency, v_kind, v_title, v_body, v_img, v_link, v_event, st ->> 'status', (st ->> 'published_at')::timestamptz, auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.agenda_posts set kind = v_kind, title = v_title, body = v_body, image_url = v_img, link_url = v_link, calendar_event_id = v_event,
        status = st ->> 'status', published_at = (st ->> 'published_at')::timestamptz, updated_by = auth.uid()
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('agenda.post', 'agenda_post', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('status', v_before.status, 'title', v_before.title) end,
    jsonb_build_object('scope', v_scope, 'agency_id', p_agency, 'status', st ->> 'status', 'title', v_title, 'calendar_event_id', v_event), null,
    case when v_scope = 'platform' and public.is_platform_admin() then 'admin'::public.actor_type else 'agency'::public.actor_type end);
  return v_id;
end $$;
revoke execute on function public.agenda_post_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.agenda_post_save(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.agenda_post_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.agenda_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.agenda_posts where id = p_id for update;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.scope = 'platform' and not public.platform_calendar_can_write() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.scope = 'agency' and not public.agency_can(p.agency_id, 'manager') then
    if public.agency_can(p.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.agenda_posts where id = p_id;
  perform public.audit_log('agenda.post_delete', 'agenda_post', p_id::text, jsonb_build_object('status', p.status, 'title', p.title), null, null,
    case when p.scope = 'platform' and public.is_platform_admin() then 'admin'::public.actor_type else 'agency'::public.actor_type end);
end $$;
revoke execute on function public.agenda_post_delete(uuid) from public, anon;
grant execute on function public.agenda_post_delete(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
