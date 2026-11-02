-- =============================================================================
-- Groscove Ultra · 0081 · Gestão: pré-seleção, comparação, aprovação pelo diretor e nota do influenciador
-- Bloco 4. Cenário S88. Idempotente; nenhuma função nova para anon (S14 segue 18); nenhum valor em lugar nenhum.
--
-- Decisões:
--   • Papéis na marca: owner = diretor (aprova e envia à agência), staff = analista (monta). O analista monta a
--     campanha e pede aprovação interna (brand_request_ask_approval: rascunho completo, situação "pending"; o
--     diretor é avisado no sino). Só o diretor envia à agência: brand_request_submit (MESMA assinatura) passa a
--     recusar a equipe com approval_required, e o diretor pode enviar direto. O diretor decide o pedido
--     (brand_request_approval_decide): "approve" aprova e envia na hora (mesmo caminho do envio), "return" devolve
--     com nota (≥ 5 letras) para o analista ajustar; quem pediu (ou o diretor) pode "withdraw" (retirar o pedido).
--     Quem aprovou e quando fica no próprio pedido (approval_decided_by/label/at) e aparece na campanha. Enquanto
--     o pedido espera o diretor, a equipe não edita o rascunho (awaiting_approval); o diretor pode editar antes de
--     aprovar. Rascunho da marca continua invisível para a agência (a política de leitura já excluía rascunhos).
--   • Pré-seleção (brand_shortlists + brand_shortlist_items, leitura por RLS só para membros da marca — a agência
--     não vê a lista interna da marca): o analista monta uma lista de creators do catálogo autorizado
--     (talent_brand_card_ok, até 20 por lista) com o motivo de cada um e envia ao diretor; o diretor aprova ou
--     recusa cada um (quem e quando ficam no item; nota opcional). Lista só é editada em rascunho. Quando todos
--     estão decididos, a lista fica "decided" e quem montou é avisado. Os aprovados viram campanha
--     (brand_shortlist_to_campaign): rascunho novo com o primeiro aprovado como creator escolhido e a lista ligada
--     ao pedido (campaign_requests.shortlist_id); no envio à agência, todos os aprovados que ainda estão no
--     catálogo entram sugeridos no negócio com o motivo "Escolha da marca" (o mesmo do creator escolhido).
--   • Comparar (brand_talent_compare, 2 a 4 creators do catálogo autorizado): o cartão autorizado (público,
--     nicho, redes e seguidores, só o que o kit libera), períodos declarados nos próximos 60 dias, nota média e
--     campanhas com esta marca. Faixa de valor: a regra do catálogo é que a marca não vê valores (a proposta
--     comercial é feita com a agência), então a comparação não traz valor — o app diz isso.
--   • Nota do influenciador (talent_ratings): a marca (dono ou equipe) avalia cada entregável publicado,
--     comprovado ou concluído que ela enxerga — cumpriu o prazo (sim/não), qualidade 1–5, comentário opcional
--     (até 500) — uma avaliação por entregável (already_rated), sem edição. A marca lê as próprias avaliações
--     (média e histórico no catálogo e no detalhe do creator são só desta marca: a opinião de outras marcas não é
--     dela); a agência (qualquer papel, não é valor) lê todas as do seu elenco (agency_talent_ratings).
--   • brand_workboard, brand_campaigns e brand_campaign_detail são recriadas com a MESMA assinatura, acrescentando
--     a aprovação interna, as listas e as avaliações; brand_request_save idem (só a trava de awaiting_approval).
--   • Avisos novos: internal_approval_requested / internal_approval_decided / shortlist_sent / shortlist_decided
--     (só membros da marca; nenhum vira push).
--   • Todas as RPCs novas: security definer, search_path vazio, só authenticated/service_role.
-- =============================================================================

-- 1) avisos novos ---------------------------------------------------------------------------------------------
alter table public.inbox_notifications drop constraint if exists inbox_notifications_kind_check;
alter table public.inbox_notifications add constraint inbox_notifications_kind_check check (kind in (
  'member_joined', 'brand_member_joined',
  'talent_consent_given', 'talent_consent_revoked',
  'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
  'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
  'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
  'calendar_event_added', 'commercial_date_published',
  'relationship_alert', 'task_overdue', 'payout_updated',
  'internal_approval_requested', 'internal_approval_decided', 'shortlist_sent', 'shortlist_decided'));
alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist'));

-- 2) pré-seleção -----------------------------------------------------------------------------------------------
create table if not exists public.brand_shortlists (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null constraint brand_shortlists_brand_fk references public.brands (id) on delete cascade,
  -- agência cujo catálogo valeu na montagem (a marca pode trocar de agência: a lista antiga fica só para leitura)
  agency_id uuid not null constraint brand_shortlists_agency_fk references public.agencies (id) on delete cascade,
  title text not null,
  note text not null default '',
  status text not null default 'draft',
  created_by uuid constraint brand_shortlists_created_by_fk references auth.users (id) on delete set null,
  created_label text not null default '',
  sent_by uuid constraint brand_shortlists_sent_by_fk references auth.users (id) on delete set null,
  sent_at timestamptz,
  decided_at timestamptz,
  request_id uuid constraint brand_shortlists_request_fk references public.campaign_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_shortlists_title_check check (char_length(title) between 3 and 120 and title = btrim(title)),
  constraint brand_shortlists_note_check check (char_length(note) <= 1000),
  constraint brand_shortlists_status_check check (status in ('draft', 'sent', 'decided')),
  constraint brand_shortlists_sent_check check (status = 'draft' or sent_at is not null)
);
create index if not exists brand_shortlists_brand_idx on public.brand_shortlists (brand_id, updated_at desc);

create table if not exists public.brand_shortlist_items (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null constraint brand_shortlist_items_list_fk references public.brand_shortlists (id) on delete cascade,
  brand_id uuid not null constraint brand_shortlist_items_brand_fk references public.brands (id) on delete cascade,
  talent_id uuid not null constraint brand_shortlist_items_talent_fk references public.talent_profiles (id) on delete cascade,
  reason text not null,
  sort_order int not null default 0,
  added_by uuid constraint brand_shortlist_items_added_by_fk references auth.users (id) on delete set null,
  decision text,
  decision_note text not null default '',
  decided_by uuid constraint brand_shortlist_items_decided_by_fk references auth.users (id) on delete set null,
  decided_label text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_shortlist_items_reason_check check (char_length(reason) between 3 and 500 and reason = btrim(reason)),
  constraint brand_shortlist_items_decision_check check (decision is null or decision in ('approved', 'rejected')),
  constraint brand_shortlist_items_decided_check check ((decision is null) = (decided_at is null)),
  constraint brand_shortlist_items_note_check check (char_length(decision_note) <= 500)
);
create unique index if not exists brand_shortlist_items_uq on public.brand_shortlist_items (shortlist_id, talent_id);
create index if not exists brand_shortlist_items_brand_idx on public.brand_shortlist_items (brand_id, talent_id);

do $$
declare t text;
begin
  foreach t in array array['brand_shortlists', 'brand_shortlist_items'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists trg_%s_updated on public.%I', t, t);
    execute format('create trigger trg_%s_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
    execute format('drop policy if exists %s_select_admin on public.%I', t, t);
    execute format('create policy %s_select_admin on public.%I for select to authenticated using ((select public.is_platform_admin()))', t, t);
    execute format('drop policy if exists %s_select_brand on public.%I', t, t);
    execute format('create policy %s_select_brand on public.%I for select to authenticated using (brand_id = any ((select public.my_brand_ids(false))::uuid[]))', t, t);
  end loop;
end $$;

-- 3) aprovação interna no pedido --------------------------------------------------------------------------------
alter table public.campaign_requests add column if not exists approval_status text not null default 'none';
alter table public.campaign_requests add column if not exists approval_requested_by uuid constraint campaign_requests_approval_requested_by_fk references auth.users (id) on delete set null;
alter table public.campaign_requests add column if not exists approval_requested_label text not null default '';
alter table public.campaign_requests add column if not exists approval_requested_at timestamptz;
alter table public.campaign_requests add column if not exists approval_request_note text not null default '';
alter table public.campaign_requests add column if not exists approval_decided_by uuid constraint campaign_requests_approval_decided_by_fk references auth.users (id) on delete set null;
alter table public.campaign_requests add column if not exists approval_decided_label text not null default '';
alter table public.campaign_requests add column if not exists approval_decided_at timestamptz;
alter table public.campaign_requests add column if not exists approval_decision_note text not null default '';
alter table public.campaign_requests add column if not exists shortlist_id uuid constraint campaign_requests_shortlist_fk references public.brand_shortlists (id) on delete set null;
alter table public.campaign_requests drop constraint if exists campaign_requests_approval_check;
alter table public.campaign_requests add constraint campaign_requests_approval_check check (approval_status in ('none', 'pending', 'returned', 'approved')
  and char_length(approval_request_note) <= 500 and char_length(approval_decision_note) <= 500
  and (approval_status <> 'pending' or approval_requested_at is not null));

-- 4) avaliação do influenciador ------------------------------------------------------------------------------------
create table if not exists public.talent_ratings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_ratings_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint talent_ratings_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid not null constraint talent_ratings_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint talent_ratings_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint talent_ratings_talent_fk references public.talent_profiles (id) on delete cascade,
  deliverable_id uuid not null constraint talent_ratings_deliverable_fk references public.deliverables (id) on delete cascade,
  on_time boolean not null,
  quality smallint not null,
  comment text not null default '',
  rated_by uuid constraint talent_ratings_rated_by_fk references auth.users (id) on delete set null,
  rated_label text not null default '',
  created_at timestamptz not null default now(),
  constraint talent_ratings_quality_check check (quality between 1 and 5),
  constraint talent_ratings_comment_check check (char_length(comment) <= 500)
);
create unique index if not exists talent_ratings_deliverable_uq on public.talent_ratings (deliverable_id);
create index if not exists talent_ratings_talent_idx on public.talent_ratings (talent_id, created_at desc);
create index if not exists talent_ratings_brand_idx on public.talent_ratings (brand_id, talent_id);
revoke all on table public.talent_ratings from public, anon, authenticated;
grant select on table public.talent_ratings to authenticated;
grant all on table public.talent_ratings to service_role;
alter table public.talent_ratings enable row level security;
drop policy if exists talent_ratings_select_admin on public.talent_ratings;
create policy talent_ratings_select_admin on public.talent_ratings for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists talent_ratings_select_brand on public.talent_ratings;
create policy talent_ratings_select_brand on public.talent_ratings for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));
drop policy if exists talent_ratings_select_agency on public.talent_ratings;
create policy talent_ratings_select_agency on public.talent_ratings for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));

-- resumo das avaliações de UMA marca para um creator (média 1 casa, total, % no prazo) e campanhas com ela
create or replace function public.brand_rating_summary(p_brand uuid, p_talent uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'avg', (select round(avg(r.quality)::numeric, 1) from public.talent_ratings r where r.brand_id = p_brand and r.talent_id = p_talent),
    'count', (select count(*) from public.talent_ratings r where r.brand_id = p_brand and r.talent_id = p_talent),
    'on_time', (select count(*) filter (where r.on_time) from public.talent_ratings r where r.brand_id = p_brand and r.talent_id = p_talent),
    'campaigns', (select count(distinct d.id) from public.deal_talents dt join public.deals d on d.id = dt.deal_id
                  where d.brand_id = p_brand and d.brand_visible and dt.talent_id = p_talent and dt.status = 'contracted'))
$$;
revoke execute on function public.brand_rating_summary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.brand_rating_summary(uuid, uuid) to service_role;

-- creators (deal_talents) que a marca enxerga num negócio: a mesma regra de my_brand_deal_talent_ids, por marca
create or replace function public.brand_visible_deal_talent(p_brand uuid, p_deal_talent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deal_talents dt join public.deals d on d.id = dt.deal_id
                 where dt.id = p_deal_talent and d.brand_id = p_brand and d.brand_visible and d.request_id is not null
                   and dt.status in ('proposed', 'contracted')
                   and d.stage in ('proposal_sent', 'negotiation', 'approved', 'contracting', 'production', 'approval', 'delivery', 'closed'))
$$;
revoke execute on function public.brand_visible_deal_talent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.brand_visible_deal_talent(uuid, uuid) to service_role;

create or replace function public.brand_deliverable_rate(p_deliverable uuid, p_on_time boolean, p_quality int, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; v_id uuid; v_comment text := btrim(coalesce(p_comment, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into x from public.deliverables where id = p_deliverable for update;
  if x.id is null or public.brand_member_of(x.brand_id) is null or not public.brand_visible_deal_talent(x.brand_id, x.deal_talent_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if x.status not in ('published', 'proof_submitted', 'done') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_on_time is null or p_quality is null or p_quality not between 1 and 5 or char_length(v_comment) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (select 1 from public.talent_ratings r where r.deliverable_id = x.id) then raise exception 'already_rated' using errcode = 'P0001'; end if;
  insert into public.talent_ratings (agency_id, brand_id, deal_id, deal_talent_id, talent_id, deliverable_id, on_time, quality, comment, rated_by, rated_label)
  values (x.agency_id, x.brand_id, x.deal_id, x.deal_talent_id, x.talent_id, x.id, p_on_time, p_quality, v_comment, auth.uid(),
          public.actor_label(x.agency_id, x.brand_id))
  returning id into v_id;
  perform public.audit_log('talent.rating', 'deliverable', x.id::text, null,
    jsonb_build_object('agency_id', x.agency_id, 'brand_id', x.brand_id, 'talent_id', x.talent_id, 'on_time', p_on_time, 'quality', p_quality),
    null, 'brand'::public.actor_type);
  return v_id;
end $$;
revoke execute on function public.brand_deliverable_rate(uuid, boolean, int, text) from public, anon;
grant execute on function public.brand_deliverable_rate(uuid, boolean, int, text) to authenticated, service_role;

-- média e campanhas por creator para o catálogo da marca: {talent_id: {avg, count, on_time, campaigns}}
create or replace function public.brand_talent_ratings(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_object_agg(u.talent_id::text, public.brand_rating_summary(p_brand, u.talent_id)), '{}'::jsonb)
    from (select r.talent_id from public.talent_ratings r where r.brand_id = p_brand
          union
          select dt.talent_id from public.deal_talents dt join public.deals d on d.id = dt.deal_id
          where d.brand_id = p_brand and d.brand_visible and dt.status = 'contracted') u);
end $$;
revoke execute on function public.brand_talent_ratings(uuid) from public, anon;
grant execute on function public.brand_talent_ratings(uuid) to authenticated, service_role;

-- histórico do creator com a marca: campanhas (as que a marca enxerga) e as avaliações dela
create or replace function public.brand_talent_history(p_brand uuid, p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'summary', public.brand_rating_summary(p_brand, p_talent),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('request_id', d.request_id, 'title', coalesce(nullif(r.title, ''), d.title),
        'brand_status', public.deal_brand_status(d.stage, d.outcome), 'talent_status', dt.status,
        'period_start', coalesce(d.expected_start, r.period_start), 'period_end', coalesce(d.expected_end, r.period_end)) order by coalesce(d.expected_start, r.period_start) desc nulls last), '[]'::jsonb)
      from public.deal_talents dt join public.deals d on d.id = dt.deal_id left join public.campaign_requests r on r.id = d.request_id
      where dt.talent_id = p_talent and public.brand_visible_deal_talent(p_brand, dt.id)),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'deliverable_id', g.deliverable_id, 'deliverable_title', x.title, 'kind', x.kind,
        'network', x.network, 'request_id', d.request_id, 'campaign_title', coalesce(nullif(r.title, ''), d.title), 'on_time', g.on_time,
        'quality', g.quality, 'comment', g.comment, 'rated_label', g.rated_label, 'created_at', g.created_at) order by g.created_at desc), '[]'::jsonb)
      from public.talent_ratings g join public.deliverables x on x.id = g.deliverable_id join public.deals d on d.id = g.deal_id
      left join public.campaign_requests r on r.id = d.request_id
      where g.brand_id = p_brand and g.talent_id = p_talent));
end $$;
revoke execute on function public.brand_talent_history(uuid, uuid) from public, anon;
grant execute on function public.brand_talent_history(uuid, uuid) to authenticated, service_role;

-- agência: avaliações de todas as marcas para um creator do elenco (qualquer papel: não é valor)
create or replace function public.agency_talent_ratings(p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if v_agency is null or not (v_agency = any (public.my_agency_ids('staff')) or public.is_platform_admin()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'summary', (select jsonb_build_object('avg', round(avg(g.quality)::numeric, 1), 'count', count(*), 'on_time', count(*) filter (where g.on_time),
                 'brands', count(distinct g.brand_id)) from public.talent_ratings g where g.talent_id = p_talent and g.agency_id = v_agency),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'brand_name', b.name, 'deal_id', g.deal_id, 'deal_title', d.title,
        'deliverable_title', x.title, 'kind', x.kind, 'network', x.network, 'on_time', g.on_time, 'quality', g.quality, 'comment', g.comment,
        'rated_label', g.rated_label, 'created_at', g.created_at) order by g.created_at desc), '[]'::jsonb)
      from (select * from public.talent_ratings where talent_id = p_talent and agency_id = v_agency order by created_at desc limit 50) g
      join public.brands b on b.id = g.brand_id join public.deals d on d.id = g.deal_id join public.deliverables x on x.id = g.deliverable_id));
end $$;
revoke execute on function public.agency_talent_ratings(uuid) from public, anon;
grant execute on function public.agency_talent_ratings(uuid) to authenticated, service_role;

-- 5) comparar 2 a 4 creators do catálogo autorizado --------------------------------------------------------------
create or replace function public.brand_talent_compare(p_brand uuid, p_talents uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select count(distinct x) into v_n from unnest(coalesce(p_talents, '{}'::uuid[])) x where x is not null;
  if v_n < 2 or v_n > 4 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then return '[]'::jsonb; end if;
  -- quem saiu do catálogo some da comparação (o app avisa que faltou alguém)
  return (select coalesce(jsonb_agg(public.talent_public_card(o.id) || jsonb_build_object(
      'periods', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'starts_on', greatest(a.starts_on, current_date),
                    'ends_on', least(a.ends_on, current_date + 59), 'note', case when a.kind = 'available' then a.note else '' end) order by a.starts_on), '[]'::jsonb)
                  from public.talent_availability a where a.talent_id = o.id and a.ends_on >= current_date and a.starts_on <= current_date + 59),
      'rating', public.brand_rating_summary(p_brand, o.id)) order by o.n), '[]'::jsonb)
    from (select distinct on (u.id) u.id, u.n from unnest(p_talents) with ordinality u(id, n) where u.id is not null order by u.id, u.n) o
    where public.talent_brand_card_ok(o.id, v_agency));
end $$;
revoke execute on function public.brand_talent_compare(uuid, uuid[]) from public, anon;
grant execute on function public.brand_talent_compare(uuid, uuid[]) to authenticated, service_role;

-- 6) pré-seleção: RPCs ---------------------------------------------------------------------------------------------
-- lista que a pessoa (membro da marca) pode mexer; trava a linha
create or replace function public.brand_shortlist_lock(p_id uuid)
returns public.brand_shortlists language plpgsql security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.brand_shortlists where id = p_id for update;
  if s.id is null or public.brand_member_of(s.brand_id) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return s;
end $$;
revoke execute on function public.brand_shortlist_lock(uuid) from public, anon, authenticated;
grant execute on function public.brand_shortlist_lock(uuid) to service_role;

create or replace function public.brand_shortlist_save(p_id uuid, p_brand uuid, p_title text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype; v_agency uuid; v_title text := btrim(coalesce(p_title, '')); v_note text := btrim(coalesce(p_note, '')); v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 or char_length(v_note) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_id is null then
    if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_agency := public.brand_active_agency(p_brand);
    if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
    if (select count(*) from public.brand_shortlists x where x.brand_id = p_brand and x.status <> 'decided') >= 30 then
      raise exception 'limit_reached' using errcode = 'P0001';
    end if;
    insert into public.brand_shortlists (brand_id, agency_id, title, note, created_by, created_label)
    values (p_brand, v_agency, v_title, v_note, auth.uid(), public.actor_label(v_agency, p_brand))
    returning id into v_id;
    return v_id;
  end if;
  s := public.brand_shortlist_lock(p_id);
  if s.brand_id <> p_brand then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.brand_shortlists set title = v_title, note = v_note where id = p_id;
  return p_id;
end $$;
revoke execute on function public.brand_shortlist_save(uuid, uuid, text, text) from public, anon;
grant execute on function public.brand_shortlist_save(uuid, uuid, text, text) to authenticated, service_role;

-- acrescenta (ou troca o motivo de) um creator do catálogo autorizado; só em rascunho; até 20 por lista
create or replace function public.brand_shortlist_item_set(p_shortlist uuid, p_talent uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype; v_reason text := btrim(coalesce(p_reason, '')); v_id uuid;
begin
  s := public.brand_shortlist_lock(p_shortlist);
  if s.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_active_agency(s.brand_id) is distinct from s.agency_id or not public.talent_brand_card_ok(p_talent, s.agency_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select i.id into v_id from public.brand_shortlist_items i where i.shortlist_id = s.id and i.talent_id = p_talent;
  if v_id is not null then
    update public.brand_shortlist_items set reason = v_reason where id = v_id;
    return v_id;
  end if;
  if (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id) >= 20 then raise exception 'limit_reached' using errcode = 'P0001'; end if;
  insert into public.brand_shortlist_items (shortlist_id, brand_id, talent_id, reason, sort_order, added_by)
  values (s.id, s.brand_id, p_talent, v_reason, (select coalesce(max(i.sort_order), 0) + 1 from public.brand_shortlist_items i where i.shortlist_id = s.id), auth.uid())
  returning id into v_id;
  update public.brand_shortlists set updated_at = now() where id = s.id;
  return v_id;
end $$;
revoke execute on function public.brand_shortlist_item_set(uuid, uuid, text) from public, anon;
grant execute on function public.brand_shortlist_item_set(uuid, uuid, text) to authenticated, service_role;

create or replace function public.brand_shortlist_item_remove(p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.brand_shortlist_items%rowtype; s public.brand_shortlists%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into i from public.brand_shortlist_items where id = p_item;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  s := public.brand_shortlist_lock(i.shortlist_id);
  if s.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  delete from public.brand_shortlist_items where id = p_item;
  update public.brand_shortlists set updated_at = now() where id = s.id;
end $$;
revoke execute on function public.brand_shortlist_item_remove(uuid) from public, anon;
grant execute on function public.brand_shortlist_item_remove(uuid) to authenticated, service_role;

-- envia ao diretor (avisa os donos da marca)
create or replace function public.brand_shortlist_send(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype; v_label text;
begin
  s := public.brand_shortlist_lock(p_id);
  if s.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.brand_shortlist_items i where i.shortlist_id = s.id) then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_label := public.actor_label(s.agency_id, s.brand_id);
  update public.brand_shortlists set status = 'sent', sent_by = auth.uid(), sent_at = now() where id = s.id;
  perform public.audit_log('brand.shortlist_send', 'brand_shortlist', s.id::text, null,
    jsonb_build_object('brand_id', s.brand_id, 'items', (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id)), null, 'brand'::public.actor_type);
  perform public.inbox_notify_brand(s.brand_id, true, 'shortlist_sent', '/marca/creators/pre-selecao/' || s.id::text,
    jsonb_build_object('list', s.title, 'name', v_label), null, 'shortlist', s.id, null);
end $$;
revoke execute on function public.brand_shortlist_send(uuid) from public, anon;
grant execute on function public.brand_shortlist_send(uuid) to authenticated, service_role;

-- o diretor aprova ou recusa cada creator (pode mudar a decisão enquanto a lista não virou campanha)
create or replace function public.brand_shortlist_decide(p_item uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.brand_shortlist_items%rowtype; s public.brand_shortlists%rowtype; v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into i from public.brand_shortlist_items where id = p_item;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  s := public.brand_shortlist_lock(i.shortlist_id);
  if public.brand_member_of(s.brand_id) <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.status = 'draft' or s.request_id is not null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.brand_shortlist_items set decision = p_decision, decision_note = v_note, decided_by = auth.uid(),
    decided_label = public.actor_label(s.agency_id, s.brand_id), decided_at = now() where id = i.id;
  perform public.audit_log('brand.shortlist_decide', 'brand_shortlist', s.id::text, jsonb_build_object('decision', i.decision),
    jsonb_build_object('brand_id', s.brand_id, 'talent_id', i.talent_id, 'decision', p_decision), nullif(v_note, ''), 'brand'::public.actor_type);
  if s.status = 'sent' and not exists (select 1 from public.brand_shortlist_items x where x.shortlist_id = s.id and x.decision is null) then
    update public.brand_shortlists set status = 'decided', decided_at = now() where id = s.id;
    if s.created_by is not null and s.created_by <> auth.uid() then
      perform public.inbox_notify(s.created_by, 'shortlist_decided', '/marca/creators/pre-selecao/' || s.id::text,
        jsonb_build_object('list', s.title), null, 'shortlist', s.id, 'shortlist_decided:' || s.id::text);
    end if;
  end if;
end $$;
revoke execute on function public.brand_shortlist_decide(uuid, text, text) from public, anon;
grant execute on function public.brand_shortlist_decide(uuid, text, text) to authenticated, service_role;

-- apagar: só rascunho (depois de enviada, a lista é o registro da decisão)
create or replace function public.brand_shortlist_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype;
begin
  s := public.brand_shortlist_lock(p_id);
  if s.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  delete from public.brand_shortlists where id = s.id;
end $$;
revoke execute on function public.brand_shortlist_delete(uuid) from public, anon;
grant execute on function public.brand_shortlist_delete(uuid) to authenticated, service_role;

-- os aprovados viram campanha: rascunho com o primeiro aprovado como creator escolhido; o envio leva todos
create or replace function public.brand_shortlist_to_campaign(p_id uuid, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype; v_agency uuid; v_first uuid; v_req uuid; v_title text;
begin
  s := public.brand_shortlist_lock(p_id);
  if s.status = 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if s.request_id is not null and exists (select 1 from public.campaign_requests r where r.id = s.request_id and r.status <> 'cancelled') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  v_agency := public.brand_active_agency(s.brand_id);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  select i.talent_id into v_first from public.brand_shortlist_items i
  where i.shortlist_id = s.id and i.decision = 'approved' and public.talent_brand_card_ok(i.talent_id, v_agency)
  order by i.sort_order, i.created_at limit 1;
  if v_first is null then raise exception 'no_talents' using errcode = 'P0001'; end if;
  v_title := left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), s.title), 120);
  v_req := public.brand_request_save(null, s.brand_id, jsonb_build_object('title', v_title, 'talent_id', v_first));
  update public.campaign_requests set shortlist_id = s.id where id = v_req;
  update public.brand_shortlists set request_id = v_req where id = s.id;
  return v_req;
end $$;
revoke execute on function public.brand_shortlist_to_campaign(uuid, text) from public, anon;
grant execute on function public.brand_shortlist_to_campaign(uuid, text) to authenticated, service_role;

-- leituras: listas da marca e uma lista com os cartões autorizados
create or replace function public.brand_shortlists_list(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'status', s.status, 'created_label', s.created_label,
      'created_by_me', s.created_by = auth.uid(), 'sent_at', s.sent_at, 'decided_at', s.decided_at, 'updated_at', s.updated_at, 'request_id', s.request_id,
      'items', (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id),
      'approved', (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id and i.decision = 'approved'),
      'rejected', (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id and i.decision = 'rejected'))
    order by s.updated_at desc), '[]'::jsonb)
    from public.brand_shortlists s where s.brand_id = p_brand);
end $$;
revoke execute on function public.brand_shortlists_list(uuid) from public, anon;
grant execute on function public.brand_shortlists_list(uuid) to authenticated, service_role;

create or replace function public.brand_shortlist_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.brand_shortlists%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.brand_shortlists where id = p_id;
  if s.id is null or (public.brand_member_of(s.brand_id) is null and not public.is_platform_admin()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', s.id, 'brand_id', s.brand_id, 'title', s.title, 'note', s.note, 'status', s.status, 'created_label', s.created_label,
    'created_by_me', s.created_by = auth.uid(), 'sent_at', s.sent_at, 'decided_at', s.decided_at, 'created_at', s.created_at, 'request_id', s.request_id,
    'request_status', (select r.status from public.campaign_requests r where r.id = s.request_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'talent_id', i.talent_id, 'reason', i.reason, 'decision', i.decision,
        'decision_note', i.decision_note, 'decided_label', i.decided_label, 'decided_at', i.decided_at,
        'in_catalog', public.talent_brand_card_ok(i.talent_id, s.agency_id),
        'card', public.talent_brand_card(i.talent_id, s.agency_id), 'rating', public.brand_rating_summary(s.brand_id, i.talent_id))
      order by i.sort_order, i.created_at), '[]'::jsonb)
      from public.brand_shortlist_items i where i.shortlist_id = s.id));
end $$;
revoke execute on function public.brand_shortlist_detail(uuid) from public, anon;
grant execute on function public.brand_shortlist_detail(uuid) to authenticated, service_role;

-- 7) aprovação interna: RPCs ---------------------------------------------------------------------------------------
-- rascunho da marca (0080) + trava: enquanto o pedido espera o diretor, a equipe não edita
create or replace function public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb; v_brief jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  if p_id is not null then
    -- D19: o pedido precisa ser desta marca, de origem marca e ainda rascunho
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.brand_id = p_brand and r.origin = 'brand') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.status = 'draft') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    -- 0081: aguardando o diretor, só ele mexe (a equipe retira o pedido para voltar a editar)
    if public.brand_member_of(p_brand) <> 'owner' and exists (select 1 from public.campaign_requests r where r.id = p_id and r.approval_status = 'pending') then
      raise exception 'awaiting_approval' using errcode = 'P0001';
    end if;
  end if;
  begin
    if p_data ? 'talent_id' then v_talent := nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid; end if;
    v_period_start := nullif(btrim(coalesce(p_data ->> 'period_start', '')), '')::date;
    v_period_end := nullif(btrim(coalesce(p_data ->> 'period_end', '')), '')::date;
    v_desired := nullif(btrim(coalesce(p_data ->> 'desired_at', '')), '')::timestamptz;
    v_duration := nullif(btrim(coalesce(p_data ->> 'duration_minutes', '')), '')::int;
    v_min := nullif(btrim(coalesce(p_data ->> 'budget_min_cents', '')), '')::bigint;
    v_max := nullif(btrim(coalesce(p_data ->> 'budget_max_cents', '')), '')::bigint;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_segments from jsonb_array_elements_text(coalesce(p_data -> 'segment_ids', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_ages from jsonb_array_elements_text(coalesce(p_data -> 'target_age_bands', '[]'::jsonb)) x;
    select coalesce(array_agg(upper(x)), '{}'::text[]) into v_states from jsonb_array_elements_text(coalesce(p_data -> 'target_states', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}'::text[]) into v_networks from jsonb_array_elements_text(coalesce(p_data -> 'networks', '[]'::jsonb)) x;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_deliverables := coalesce(p_data -> 'deliverables', '[]'::jsonb);
  v_brief := coalesce(p_data -> 'brief', '{}'::jsonb);
  if not public.campaign_brief_valid(v_brief) then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- o creator desejado precisa estar no catálogo autorizado da agência que atende a marca
  if v_talent is not null and not public.talent_brand_card_ok(v_talent, v_agency) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if cardinality(v_segments) > 0 and exists (select 1 from unnest(v_segments) s where not exists (select 1 from public.talent_segments g where g.id = s and g.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    if p_id is null then
      insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, product, target_audience, target_age_bands,
                                            target_states, region_note, period_start, period_end, desired_at, duration_minutes, format, location, networks,
                                            deliverables, segment_ids, notes, brief)
      values (v_agency, p_brand, 'brand', auth.uid(), v_talent, btrim(coalesce(p_data ->> 'title', '')), nullif(p_data ->> 'objective', ''),
              btrim(coalesce(p_data ->> 'product', '')), btrim(coalesce(p_data ->> 'target_audience', '')), v_ages, v_states,
              btrim(coalesce(p_data ->> 'region_note', '')), v_period_start, v_period_end, v_desired, v_duration, nullif(p_data ->> 'format', ''),
              btrim(coalesce(p_data ->> 'location', '')), v_networks, v_deliverables, v_segments, btrim(coalesce(p_data ->> 'notes', '')), v_brief)
      returning id into v_id;
    else
      update public.campaign_requests set
        talent_id = case when p_data ? 'talent_id' then v_talent else talent_id end,
        title = case when p_data ? 'title' then btrim(coalesce(p_data ->> 'title', '')) else title end,
        objective = case when p_data ? 'objective' then nullif(p_data ->> 'objective', '') else objective end,
        product = case when p_data ? 'product' then btrim(coalesce(p_data ->> 'product', '')) else product end,
        target_audience = case when p_data ? 'target_audience' then btrim(coalesce(p_data ->> 'target_audience', '')) else target_audience end,
        target_age_bands = case when p_data ? 'target_age_bands' then v_ages else target_age_bands end,
        target_states = case when p_data ? 'target_states' then v_states else target_states end,
        region_note = case when p_data ? 'region_note' then btrim(coalesce(p_data ->> 'region_note', '')) else region_note end,
        period_start = case when p_data ? 'period_start' then v_period_start else period_start end,
        period_end = case when p_data ? 'period_end' then v_period_end else period_end end,
        desired_at = case when p_data ? 'desired_at' then v_desired else desired_at end,
        duration_minutes = case when p_data ? 'duration_minutes' then v_duration else duration_minutes end,
        format = case when p_data ? 'format' then nullif(p_data ->> 'format', '') else format end,
        location = case when p_data ? 'location' then btrim(coalesce(p_data ->> 'location', '')) else location end,
        networks = case when p_data ? 'networks' then v_networks else networks end,
        deliverables = case when p_data ? 'deliverables' then v_deliverables else deliverables end,
        segment_ids = case when p_data ? 'segment_ids' then v_segments else segment_ids end,
        notes = case when p_data ? 'notes' then btrim(coalesce(p_data ->> 'notes', '')) else notes end,
        brief = case when p_data ? 'brief' then v_brief else brief end
      where id = p_id returning id into v_id;
    end if;
    -- valor oferecido pela marca (tabela de valor: a marca lê o próprio; gestor e colaborador não leem)
    if p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note' then
      insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
      values (v_agency, p_brand, v_id, v_min, v_max, btrim(coalesce(p_data ->> 'budget_note', '')), auth.uid())
      on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
        note = excluded.note, updated_by = excluded.updated_by;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end $$;
revoke execute on function public.brand_request_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.brand_request_save(uuid, uuid, jsonb) to authenticated, service_role;

-- pedido completo para envio (a mesma regra de brand_request_submit)
create or replace function public.campaign_request_complete(r public.campaign_requests)
returns boolean language sql immutable set search_path = '' as $$
  select char_length(btrim(r.title)) >= 3 and r.objective is not null and r.period_start is not null and cardinality(r.networks) > 0
     and jsonb_array_length(r.deliverables) > 0
$$;
revoke execute on function public.campaign_request_complete(public.campaign_requests) from public, anon, authenticated;
grant execute on function public.campaign_request_complete(public.campaign_requests) to service_role;

-- envio à agência (0066) + só o diretor envia; registra quem aprovou e quando; leva os aprovados da pré-seleção
create or replace function public.brand_request_submit(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_deal uuid; v_owner uuid; v_brand_name text; v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if public.brand_member_of(r.brand_id) <> 'owner' then raise exception 'approval_required' using errcode = '42501'; end if;
  if not public.campaign_request_complete(r) then raise exception 'request_incomplete' using errcode = '22023'; end if;
  if not exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id
                 where ab.agency_id = r.agency_id and ab.brand_id = r.brand_id and ab.status = 'active' and a.status = 'active') then
    raise exception 'brand_not_linked' using errcode = 'P0001';
  end if;
  select ab.account_manager_id into v_owner from public.agency_brands ab where ab.agency_id = r.agency_id and ab.brand_id = r.brand_id;
  if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = r.agency_id and m.user_id = v_owner and m.revoked_at is null) then
    v_owner := null;
  end if;
  insert into public.deals (agency_id, brand_id, request_id, title, stage, owner_id, created_by, brand_visible, segment_ids, expected_start, expected_end, is_demo)
  values (r.agency_id, r.brand_id, r.id, btrim(r.title), 'briefing_received', v_owner, auth.uid(), true, r.segment_ids, r.period_start,
          coalesce(r.period_end, r.period_start), public.agency_is_demo(r.agency_id))
  returning id into v_deal;
  -- o creator desejado entra sugerido no negócio (a agência decide se consulta)
  if r.talent_id is not null then
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    values (r.agency_id, v_deal, r.talent_id, 'suggested', auth.uid(), '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb)
    on conflict (deal_id, talent_id) do nothing;
  end if;
  -- 0081: os aprovados da pré-seleção que ainda estão no catálogo entram sugeridos, com o mesmo motivo
  if r.shortlist_id is not null then
    insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
    select r.agency_id, v_deal, i.talent_id, 'suggested', auth.uid(), '[{"code": "brand_choice", "met": true, "detail": []}]'::jsonb
    from public.brand_shortlist_items i
    where i.shortlist_id = r.shortlist_id and i.decision = 'approved' and public.talent_brand_card_ok(i.talent_id, r.agency_id)
    order by i.sort_order
    on conflict (deal_id, talent_id) do nothing;
  end if;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  update public.campaign_requests set status = 'converted', submitted_at = now(), approval_status = 'approved',
    approval_decided_by = auth.uid(), approval_decided_label = v_label, approval_decided_at = now()
  where id = p_id;
  select b.name into v_brand_name from public.brands b where b.id = r.brand_id;
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (r.agency_id, 'deal', v_deal, 'system', 'briefing_received', auth.uid(), v_label);
  perform public.audit_log('request.submit', 'campaign_request', p_id::text, null,
    jsonb_build_object('agency_id', r.agency_id, 'brand_id', r.brand_id, 'deal_id', v_deal, 'talent_id', r.talent_id,
                       'approved_by', auth.uid(), 'requested_by', r.approval_requested_by, 'shortlist_id', r.shortlist_id), null, 'brand'::public.actor_type);
  perform public.inbox_notify_agency(r.agency_id, 'manager', 'briefing_received', '/agencia/negocios/' || v_deal::text,
    jsonb_build_object('brand', v_brand_name, 'deal', btrim(r.title)), 'deal', v_deal, 'briefing:' || v_deal::text);
  if v_owner is not null and not exists (select 1 from public.agency_members m where m.agency_id = r.agency_id and m.user_id = v_owner
                                         and m.revoked_at is null and m.role::text in ('admin', 'manager')) then
    perform public.inbox_notify(v_owner, 'briefing_received', '/agencia/negocios/' || v_deal::text,
      jsonb_build_object('brand', v_brand_name, 'deal', btrim(r.title)), r.agency_id, 'deal', v_deal, 'briefing:' || v_deal::text || ':' || v_owner::text);
  end if;
  return v_deal;
end $$;
revoke execute on function public.brand_request_submit(uuid) from public, anon;
grant execute on function public.brand_request_submit(uuid) to authenticated, service_role;

-- a equipe (ou o diretor) pede aprovação interna de um rascunho completo
create or replace function public.brand_request_ask_approval(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_note text := btrim(coalesce(p_note, '')); v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' or r.approval_status = 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.campaign_request_complete(r) then raise exception 'request_incomplete' using errcode = '22023'; end if;
  if public.brand_active_agency(r.brand_id) is distinct from r.agency_id then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  update public.campaign_requests set approval_status = 'pending', approval_requested_by = auth.uid(), approval_requested_label = v_label,
    approval_requested_at = now(), approval_request_note = v_note, approval_decided_by = null, approval_decided_label = '',
    approval_decided_at = null, approval_decision_note = ''
  where id = p_id;
  perform public.audit_log('request.ask_approval', 'campaign_request', p_id::text, null,
    jsonb_build_object('brand_id', r.brand_id, 'agency_id', r.agency_id), nullif(v_note, ''), 'brand'::public.actor_type);
  perform public.inbox_notify_brand(r.brand_id, true, 'internal_approval_requested', '/marca/campanhas/' || p_id::text,
    jsonb_build_object('campaign', left(btrim(r.title), 120), 'name', v_label), null, 'request', p_id, null);
end $$;
revoke execute on function public.brand_request_ask_approval(uuid, text) from public, anon;
grant execute on function public.brand_request_ask_approval(uuid, text) to authenticated, service_role;

-- decisão: approve (diretor; envia à agência) | return (diretor; nota obrigatória) | withdraw (quem pediu ou o diretor)
create or replace function public.brand_request_approval_decide(p_id uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; v_role text; v_note text := btrim(coalesce(p_note, '')); v_deal uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_id for update;
  v_role := case when r.id is null then null else public.brand_member_of(r.brand_id) end;
  if r.id is null or v_role is null or r.origin <> 'brand' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_decision is null or p_decision not in ('approve', 'return', 'withdraw') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if r.status <> 'draft' or r.approval_status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_decision = 'withdraw' then
    if v_role <> 'owner' and r.approval_requested_by is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.campaign_requests set approval_status = 'none' where id = p_id;
    return null;
  end if;
  if v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision = 'return' then
    if char_length(v_note) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
    update public.campaign_requests set approval_status = 'returned', approval_decided_by = auth.uid(),
      approval_decided_label = public.actor_label(r.agency_id, r.brand_id), approval_decided_at = now(), approval_decision_note = v_note
    where id = p_id;
    perform public.audit_log('request.approval_return', 'campaign_request', p_id::text, null, jsonb_build_object('brand_id', r.brand_id), v_note, 'brand'::public.actor_type);
  else
    v_deal := public.brand_request_submit(p_id);
    update public.campaign_requests set approval_decision_note = v_note where id = p_id;
  end if;
  if r.approval_requested_by is not null and r.approval_requested_by <> auth.uid() then
    perform public.inbox_notify(r.approval_requested_by, 'internal_approval_decided', '/marca/campanhas/' || p_id::text,
      jsonb_build_object('campaign', left(btrim(r.title), 120), 'decision', p_decision), null, 'request', p_id, null);
  end if;
  return v_deal;
end $$;
revoke execute on function public.brand_request_approval_decide(uuid, text, text) from public, anon;
grant execute on function public.brand_request_approval_decide(uuid, text, text) to authenticated, service_role;

-- 8) leituras da marca (mesmas assinaturas) --------------------------------------------------------------------------
create or replace function public.brand_campaigns(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'request_id', r.id, 'title', r.title, 'origin', r.origin, 'deal_id', d.id,
      'brand_status', case when d.id is null then case when r.status = 'cancelled' then 'cancelled' else 'draft' end else public.deal_brand_status(d.stage, d.outcome) end,
      'updated_at', greatest(r.updated_at, coalesce(d.stage_changed_at, r.updated_at)),
      'period_start', coalesce(d.expected_start, r.period_start),
      'talent_name', case when r.talent_id is null then null else (select t.display_name from public.talent_profiles t where t.id = r.talent_id) end,
      'approval_status', r.approval_status)
    order by greatest(r.updated_at, coalesce(d.stage_changed_at, r.updated_at)) desc), '[]'::jsonb)
    from public.campaign_requests r
    left join public.deals d on d.request_id = r.id
    where r.brand_id = p_brand and (r.origin = 'brand' or (d.id is not null and d.brand_visible)));
end $$;
revoke execute on function public.brand_campaigns(uuid) from public, anon;
grant execute on function public.brand_campaigns(uuid) to authenticated, service_role;

-- campanha (0080) + aprovação interna, pré-seleção ligada e as avaliações das entregas
create or replace function public.brand_campaign_detail(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.campaign_requests%rowtype; d public.deals%rowtype; v_brand_status text; v_visible_dt uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.campaign_requests where id = p_request;
  if r.id is null or (public.brand_member_of(r.brand_id) is null and not public.is_platform_admin()) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where request_id = p_request;
  if r.origin = 'agency' and (d.id is null or not d.brand_visible) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_brand_status := case when d.id is null then case when r.status = 'cancelled' then 'cancelled' else 'draft' end
                         else public.deal_brand_status(d.stage, d.outcome) end;
  v_visible_dt := public.my_brand_deal_talent_ids();
  return jsonb_build_object(
    'request', jsonb_build_object('id', r.id, 'title', r.title, 'objective', r.objective, 'product', r.product, 'target_audience', r.target_audience,
      'target_age_bands', to_jsonb(r.target_age_bands), 'target_states', to_jsonb(r.target_states), 'region_note', r.region_note,
      'period_start', r.period_start, 'period_end', r.period_end, 'desired_at', r.desired_at, 'duration_minutes', r.duration_minutes,
      'format', r.format, 'location', r.location, 'networks', to_jsonb(r.networks), 'deliverables', r.deliverables,
      -- notas de pedido aberto pela agência são internas (a mesma máscara de talent_opportunities)
      'notes', case when r.origin = 'brand' then r.notes else '' end,
      'brief', r.brief,
      'status', r.status, 'submitted_at', r.submitted_at, 'created_at', r.created_at, 'talent_id', r.talent_id, 'origin', r.origin),
    'brand_status', v_brand_status,
    -- aprovação interna (só pedidos da marca): quem pediu, quem decidiu e quando
    'approval', case when r.origin <> 'brand' then null else jsonb_build_object('status', r.approval_status,
      'requested_label', r.approval_requested_label, 'requested_at', r.approval_requested_at, 'request_note', r.approval_request_note,
      'requested_by_me', r.approval_requested_by is not distinct from auth.uid() and r.approval_requested_by is not null,
      'decided_label', r.approval_decided_label, 'decided_at', r.approval_decided_at, 'decision_note', r.approval_decision_note) end,
    'shortlist', case when r.shortlist_id is null then null else (select jsonb_build_object('id', s.id, 'title', s.title,
      'approved', (select coalesce(jsonb_agg(t.display_name order by i.sort_order), '[]'::jsonb) from public.brand_shortlist_items i
                   join public.talent_profiles t on t.id = i.talent_id where i.shortlist_id = s.id and i.decision = 'approved'))
      from public.brand_shortlists s where s.id = r.shortlist_id) end,
    'deal', case when d.id is null then null else jsonb_build_object('id', d.id, 'title', d.title, 'stage_changed_at', d.stage_changed_at,
      'expected_start', d.expected_start, 'expected_end', d.expected_end, 'confirmed_at', d.confirmed_at, 'closed_at', d.closed_at, 'outcome', d.outcome) end,
    -- o creator desejado pela marca aparece sempre (ela escolheu); os demais só depois da confirmação
    'requested_talent', case when r.talent_id is null then null else public.talent_brand_card(r.talent_id, r.agency_id) end,
    'talents', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(
        public.talent_brand_card(dt.talent_id, r.agency_id) || jsonb_build_object('deal_talent_id', dt.id, 'status', dt.status) order by dt.created_at), '[]')
      from public.deal_talents dt where dt.deal_id = d.id and dt.id = any (v_visible_dt)) end,
    'deliverables', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'network', x.network,
        'title', x.title, 'due_at', x.due_at, 'publish_at', x.publish_at, 'status', x.status, 'talent_name', t.display_name) order by x.due_at nulls last), '[]')
      from public.deliverables x join public.talent_profiles t on t.id = x.talent_id where x.deal_id = d.id and x.deal_talent_id = any (v_visible_dt)) end,
    -- avaliações das entregas desta campanha (feitas pela marca)
    'ratings', case when d.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('deliverable_id', g.deliverable_id, 'on_time', g.on_time,
        'quality', g.quality, 'comment', g.comment, 'rated_label', g.rated_label, 'created_at', g.created_at) order by g.created_at), '[]'::jsonb)
      from public.talent_ratings g where g.deal_id = d.id and g.brand_id = r.brand_id) end);
end $$;
revoke execute on function public.brand_campaign_detail(uuid) from public, anon;
grant execute on function public.brand_campaign_detail(uuid) to authenticated, service_role;

-- "Hoje" da marca (0078) + aprovação interna nos rascunhos, pré-seleções e entregas sem avaliação
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
        'requested_count', (select coalesce(sum((e ->> 'quantity')::int), 0) from jsonb_array_elements(r.deliverables) e),
        'approval_status', r.approval_status, 'approval_requested_at', r.approval_requested_at, 'approval_requested_label', r.approval_requested_label,
        'approval_requested_by_me', r.approval_requested_by is not null and r.approval_requested_by = auth.uid(),
        'approval_decided_at', r.approval_decided_at, 'approval_decision_note', r.approval_decision_note)
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
        'talent_name', t.display_name, 'closed_at', coalesce(x.proof_at, x.published_at, x.updated_at),
        'rated', exists (select 1 from public.talent_ratings g where g.deliverable_id = x.id)) order by x.due_at nulls last, x.created_at), '[]'::jsonb)
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
      where s.author_side = 'agency'),
    -- pré-seleções enviadas ou decididas que ainda não viraram campanha
    'shortlists', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'status', s.status, 'sent_at', s.sent_at,
        'decided_at', s.decided_at, 'created_by_me', s.created_by is not null and s.created_by = auth.uid(), 'created_label', s.created_label,
        'pending', (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id and i.decision is null),
        'approved', (select count(*) from public.brand_shortlist_items i where i.shortlist_id = s.id and i.decision = 'approved')) order by s.sent_at), '[]'::jsonb)
      from public.brand_shortlists s where s.brand_id = p_brand and s.status in ('sent', 'decided') and s.request_id is null));
end $$;
revoke execute on function public.brand_workboard(uuid) from public, anon;
grant execute on function public.brand_workboard(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
