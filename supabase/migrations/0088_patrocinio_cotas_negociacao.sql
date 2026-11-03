-- =============================================================================
-- Groscove Ultra · 0088 · Gestão: cotas de patrocínio com valor pedido e negociação em rodadas
-- Pedido do responsável (03/11): "o valor do patrocínio tem que ser uma via de mão dupla". Cenário S95. Idempotente;
-- nenhuma função nova para anon (S14 segue 18); as RPCs recriadas mantêm a MESMA assinatura (sem sobrecarga).
--
-- Decisões:
--   • Cotas (sponsorship_tiers, 1 a 3 por oportunidade): nome (2 a 40 letras, sem repetir), valor pedido em centavos
--     BRL (simulado; vazio = "Valor a combinar"), contrapartidas da cota (até 10, mesma regra da 0085) e quantas
--     marcas podem levar a cota (1 a 20, padrão 1). Uma cota única cobre o caso simples; as oportunidades da 0085
--     ganham uma "Cota única" com as contrapartidas que já tinham e sem valor. As contrapartidas gerais da
--     oportunidade passam a ser a união das cotas (até 10), para o evento, a campanha e o creator.
--   • Valor: só o Adm da agência grava o valor pedido (agency_sponsorship_save, MESMA assinatura: para gestor, o
--     price_cents é ignorado e o valor que já existia fica). O gestor cria a oportunidade sem valor e o Adm completa.
--     A tabela das cotas carrega valor: RLS só para o Adm da agência e para as marcas do público (que agora veem o
--     PEDIDO — muda a regra antiga "sem valores"), nunca para gestor/colaborador/creator; o gestor lê nome,
--     contrapartidas e vagas pela RPC de detalhe (sem valor).
--   • Negociação (sponsorship_proposals + sponsorship_rounds): uma proposta viva (rascunho ou aberta) por marca por
--     oportunidade; a marca que já fechou uma cota não abre outra. A marca: "Aceitar a cota pelo valor pedido"
--     (acordo na hora: a agência publicou o pedido) ou "Fazer proposta" (valor + contrapartidas ajustadas — marcar,
--     desmarcar e acrescentar, até 10 — + mensagem). A agência (só Adm) responde: aceitar, recusar (nota de 3+
--     letras) ou contrapropor (valor + contrapartidas + nota); a marca então aceita, recusa ou contrapropõe de novo.
--     Cada rodada registra lado, ação, valor, contrapartidas, nota, quem e quando. A proposta guarda o pedido no
--     momento em que nasceu (asked_cents) para mostrar a diferença mesmo se a agência mudar o valor depois.
--   • Aprovação interna da marca (0081): o dono envia direto; a equipe monta e a rodada que compromete dinheiro
--     (aceitar, propor, contrapropor) fica "pending_owner" até o dono aprovar (vai à agência) ou devolver (com
--     nota). Proposta cuja primeira rodada espera o dono é rascunho (invisível para a agência: RLS por sent_at).
--     Recusar não compromete dinheiro: a equipe recusa direto.
--   • Prazo: depois de respond_by (ou com a oportunidade fora de "aberta") não nasce proposta nova
--     (deadline_passed / invalid_state); as negociações já abertas seguem até a agência decidir (como a escolha de
--     vencedoras da 0085, que vale depois do prazo). O dono que aprova uma primeira rodada depois do prazo recebe
--     deadline_passed.
--   • Fechamento (sponsorship_agree): valor e contrapartidas finais congelados (agreed_cents/agreed_perks); a
--     resposta da marca vira interesse com outcome 'won' (acordo conta como vencedora); limite de marcas por cota
--     (tier_full); ao esgotar, as outras propostas vivas da cota são encerradas (end_reason 'tier_full') com aviso;
--     com todas as cotas esgotadas a oportunidade fica patrocinada sozinha (mesmo caminho da decisão). A campanha
--     da marca (campaign_request) é criada (ou o rascunho da 0085 é atualizado) com o valor acordado em
--     campaign_request_budgets (mínimo = máximo = acordado, é o "Valor oferecido" do formulário), as contrapartidas
--     acordadas no checklist do briefing (brief.checks) e a cota nas observações (sem valor: a campanha enviada é
--     lida pelo gestor). brand_request_save (MESMA assinatura) ignora mudança de valor nessa campanha (o valor é o
--     do acordo). A campanha segue o fluxo normal (equipe pede aprovação, dono envia).
--   • Decisão da agência (agency_sponsorship_decide, MESMA assinatura): marcas com acordo entram sempre entre as
--     vencedoras; "encerrar" com acordo vira "patrocinada"; cancelar com acordo é recusado (has_agreement). Ao
--     decidir, as propostas vivas são encerradas.
--   • Creator: talent_sponsorships (MESMA assinatura) traz as marcas com acordo e as contrapartidas acordadas (o que
--     ele vai fazer) — nunca valor; o cachê dele segue o fluxo de negócio.
--   • Avisos: 'sponsorship_negotiation' (status proposed | countered | agreed | declined | closed | approval |
--     returned; parâmetros sem valor), para a outra parte a cada rodada (agência: só Adm), para os donos da marca
--     quando a equipe pede aprovação e para quem montou quando o dono devolve/aprova. E-mail (fila da 0084) para
--     proposed/countered/agreed/declined/closed. Creator: sponsorship_decided 'sponsored' no acordo.
--   • Público de mão dupla (pedido do responsável, 03/11): a oportunidade ganha o público do evento com os MESMOS
--     campos e valores da campanha (público-alvo em texto até 500, faixas etárias 13-17…55+, UFs, detalhe da região
--     até 200; a campanha não tem gênero, então não há gênero aqui). A agência (gestor+) preenche; a marca do
--     público e o creator veem (não é valor). Na proposta/contraproposta a marca pode indicar o "público que me
--     interessa" (mesmos campos, opcional, guardado na rodada e mostrado à agência na linha do tempo). Ao fechar o
--     acordo, a campanha nasce com a seção Público pré-preenchida: o último público indicado pela marca, se houver,
--     senão o do evento (rascunho que já existia só é preenchido onde estava vazio); a marca ajusta no formulário.
--   • Todas as RPCs novas: search_path vazio, security definer, execute revogado de public/anon; internas só
--     service_role.
-- =============================================================================

-- 1) avisos ----------------------------------------------------------------------------------------------------------
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
  'sponsorship_negotiation'));

-- 2) tabelas ---------------------------------------------------------------------------------------------------------
-- público (mesmos campos e valores de campaign_requests): {target_audience, target_age_bands[], target_states[], region_note}
create or replace function public.sponsorship_audience_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('target_audience', 'target_age_bands', 'target_states', 'region_note') then return false; end if;
  end loop;
  if p ? 'target_audience' and (jsonb_typeof(p -> 'target_audience') <> 'string' or char_length(p ->> 'target_audience') > 500) then return false; end if;
  if p ? 'region_note' and (jsonb_typeof(p -> 'region_note') <> 'string' or char_length(p ->> 'region_note') > 200) then return false; end if;
  if p ? 'target_age_bands' and (jsonb_typeof(p -> 'target_age_bands') <> 'array'
     or exists (select 1 from jsonb_array_elements(p -> 'target_age_bands') e where jsonb_typeof(e) <> 'string'
                or (e #>> '{}') not in ('13-17', '18-24', '25-34', '35-44', '45-54', '55+'))) then return false; end if;
  if p ? 'target_states' and (jsonb_typeof(p -> 'target_states') <> 'array' or jsonb_array_length(p -> 'target_states') > 27
     or exists (select 1 from jsonb_array_elements(p -> 'target_states') e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Z]{2}$')) then return false; end if;
  return true;
end $$;
revoke execute on function public.sponsorship_audience_valid(jsonb) from public, anon;
grant execute on function public.sponsorship_audience_valid(jsonb) to authenticated, service_role;

-- público limpo: textos aparados, listas sem repetir; null quando vem tudo vazio (lança invalid_input se inválido)
create or replace function public.sponsorship_audience_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if not public.sponsorship_audience_valid(p) then raise exception 'invalid_input' using errcode = '22023'; end if;
  v := jsonb_build_object(
    'target_audience', btrim(coalesce(p ->> 'target_audience', '')),
    'target_age_bands', coalesce((select jsonb_agg(x order by x) from (select distinct e as x from jsonb_array_elements_text(coalesce(p -> 'target_age_bands', '[]')) e) s), '[]'::jsonb),
    'target_states', coalesce((select jsonb_agg(x order by x) from (select distinct upper(e) as x from jsonb_array_elements_text(coalesce(p -> 'target_states', '[]')) e) s), '[]'::jsonb),
    'region_note', btrim(coalesce(p ->> 'region_note', '')));
  if v ->> 'target_audience' = '' and v ->> 'region_note' = '' and jsonb_array_length(v -> 'target_age_bands') = 0 and jsonb_array_length(v -> 'target_states') = 0 then
    return null;
  end if;
  return v;
end $$;
revoke execute on function public.sponsorship_audience_clean(jsonb) from public, anon, authenticated;
grant execute on function public.sponsorship_audience_clean(jsonb) to service_role;

alter table public.sponsorship_opportunities add column if not exists target_audience text not null default '';
alter table public.sponsorship_opportunities add column if not exists target_age_bands text[] not null default '{}';
alter table public.sponsorship_opportunities add column if not exists target_states text[] not null default '{}';
alter table public.sponsorship_opportunities add column if not exists region_note text not null default '';
alter table public.sponsorship_opportunities drop constraint if exists sponsorship_opportunities_public_check;
alter table public.sponsorship_opportunities add constraint sponsorship_opportunities_public_check check (char_length(target_audience) <= 500
  and char_length(region_note) <= 200 and target_age_bands <@ array['13-17','18-24','25-34','35-44','45-54','55+']::text[]
  and cardinality(target_states) <= 27);

create table if not exists public.sponsorship_tiers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null constraint sponsorship_tiers_opportunity_fk references public.sponsorship_opportunities (id) on delete cascade,
  agency_id uuid not null constraint sponsorship_tiers_agency_fk references public.agencies (id) on delete cascade,
  position smallint not null default 1,
  name text not null,
  price_cents bigint,
  perks text[] not null default '{}',
  slots smallint not null default 1,
  price_updated_by uuid constraint sponsorship_tiers_price_by_fk references auth.users (id) on delete set null,
  price_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsorship_tiers_position_check check (position between 1 and 3),
  constraint sponsorship_tiers_name_check check (char_length(name) between 2 and 40 and name = btrim(name)),
  constraint sponsorship_tiers_price_check check (price_cents is null or price_cents between 1 and 10000000000),
  constraint sponsorship_tiers_perks_check check (public.sponsorship_perks_valid(perks)),
  constraint sponsorship_tiers_slots_check check (slots between 1 and 20)
);
create unique index if not exists sponsorship_tiers_name_uq on public.sponsorship_tiers (opportunity_id, lower(name));
create index if not exists sponsorship_tiers_opportunity_idx on public.sponsorship_tiers (opportunity_id, position);

-- contrapartidas de uma proposta: pelo menos uma, e a regra da 0085 (até 10, 3 a 120 letras, sem repetir)
create or replace function public.sponsorship_proposal_perks_valid(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and cardinality(p) >= 1 and public.sponsorship_perks_valid(p)
$$;
revoke execute on function public.sponsorship_proposal_perks_valid(text[]) from public, anon;
grant execute on function public.sponsorship_proposal_perks_valid(text[]) to authenticated, service_role;

create table if not exists public.sponsorship_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null constraint sponsorship_proposals_opportunity_fk references public.sponsorship_opportunities (id) on delete cascade,
  tier_id uuid not null constraint sponsorship_proposals_tier_fk references public.sponsorship_tiers (id) on delete cascade,
  agency_id uuid not null constraint sponsorship_proposals_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint sponsorship_proposals_brand_fk references public.brands (id) on delete cascade,
  status text not null default 'draft',
  awaiting text,
  asked_cents bigint,
  amount_cents bigint not null,
  perks text[] not null,
  rounds int not null default 0,
  sent_at timestamptz,
  agreed_cents bigint,
  agreed_perks text[],
  agreed_side text,
  agreed_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  request_id uuid constraint sponsorship_proposals_request_fk references public.campaign_requests (id) on delete set null,
  created_by uuid constraint sponsorship_proposals_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsorship_proposals_status_check check (status in ('draft', 'open', 'agreed', 'declined', 'closed')),
  constraint sponsorship_proposals_awaiting_check check ((status = 'open') = (awaiting is not null) and (awaiting is null or awaiting in ('agency', 'brand'))),
  constraint sponsorship_proposals_amount_check check (amount_cents between 1 and 10000000000 and (asked_cents is null or asked_cents between 1 and 10000000000)),
  constraint sponsorship_proposals_perks_check check (public.sponsorship_proposal_perks_valid(perks)),
  constraint sponsorship_proposals_sent_check check (status = 'draft' or status = 'closed' or sent_at is not null),
  constraint sponsorship_proposals_agreed_check check ((status = 'agreed') = (agreed_at is not null)
    and (status <> 'agreed' or (agreed_cents is not null and agreed_perks is not null and agreed_side in ('agency', 'brand')))),
  constraint sponsorship_proposals_end_check check ((status in ('declined', 'closed')) = (end_reason is not null)
    and (end_reason is null or end_reason in ('declined_brand', 'declined_agency', 'tier_full', 'decided', 'cancelled', 'returned')))
);
create unique index if not exists sponsorship_proposals_live_uq on public.sponsorship_proposals (opportunity_id, brand_id) where status in ('draft', 'open');
create index if not exists sponsorship_proposals_opportunity_idx on public.sponsorship_proposals (opportunity_id, created_at);
create index if not exists sponsorship_proposals_brand_idx on public.sponsorship_proposals (brand_id, updated_at desc);
create index if not exists sponsorship_proposals_tier_idx on public.sponsorship_proposals (tier_id) where status = 'agreed';

create table if not exists public.sponsorship_rounds (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null constraint sponsorship_rounds_proposal_fk references public.sponsorship_proposals (id) on delete cascade,
  opportunity_id uuid not null constraint sponsorship_rounds_opportunity_fk references public.sponsorship_opportunities (id) on delete cascade,
  agency_id uuid not null constraint sponsorship_rounds_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint sponsorship_rounds_brand_fk references public.brands (id) on delete cascade,
  seq int not null,
  side text not null,
  action text not null,
  amount_cents bigint,
  perks text[],
  audience jsonb,
  note text not null default '',
  state text not null default 'sent',
  actor_id uuid constraint sponsorship_rounds_actor_fk references auth.users (id) on delete set null,
  actor_label text not null default '',
  reviewed_by uuid constraint sponsorship_rounds_reviewed_by_fk references auth.users (id) on delete set null,
  reviewed_label text not null default '',
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  constraint sponsorship_rounds_seq_uq unique (proposal_id, seq),
  constraint sponsorship_rounds_side_check check (side in ('brand', 'agency')),
  constraint sponsorship_rounds_action_check check (action in ('accept_asked', 'propose', 'counter', 'accept', 'decline')
    and (side = 'brand' or action in ('counter', 'accept', 'decline'))),
  constraint sponsorship_rounds_amount_check check ((action = 'decline') = (amount_cents is null)
    and (amount_cents is null or amount_cents between 1 and 10000000000)),
  constraint sponsorship_rounds_perks_check check ((action = 'decline') = (perks is null) and (perks is null or public.sponsorship_proposal_perks_valid(perks))),
  constraint sponsorship_rounds_texts_check check (char_length(note) <= 500 and char_length(review_note) <= 500
    and char_length(actor_label) <= 80 and char_length(reviewed_label) <= 80),
  constraint sponsorship_rounds_audience_check check (audience is null or (side = 'brand' and public.sponsorship_audience_valid(audience))),
  constraint sponsorship_rounds_state_check check (state in ('sent', 'pending_owner', 'returned') and (state = 'sent' or side = 'brand'))
);
create index if not exists sponsorship_rounds_proposal_idx on public.sponsorship_rounds (proposal_id, seq);
create index if not exists sponsorship_rounds_pending_idx on public.sponsorship_rounds (brand_id) where state = 'pending_owner';

do $$
declare t text;
begin
  foreach t in array array['sponsorship_tiers', 'sponsorship_proposals', 'sponsorship_rounds'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
  end loop;
  drop trigger if exists trg_sponsorship_tiers_updated on public.sponsorship_tiers;
  create trigger trg_sponsorship_tiers_updated before update on public.sponsorship_tiers for each row execute function public.set_updated_at();
  drop trigger if exists trg_sponsorship_proposals_updated on public.sponsorship_proposals;
  create trigger trg_sponsorship_proposals_updated before update on public.sponsorship_proposals for each row execute function public.set_updated_at();
end $$;

-- quem lê: cotas (com valor) — Adm da agência e marcas do público; propostas e rodadas — Adm da agência (só o que já
-- foi enviado) e a própria marca. Gestor, colaborador e creator: só pelas RPCs (sem valor).
drop policy if exists sponsorship_tiers_select_agency on public.sponsorship_tiers;
create policy sponsorship_tiers_select_agency on public.sponsorship_tiers for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists sponsorship_tiers_select_brand on public.sponsorship_tiers;
create policy sponsorship_tiers_select_brand on public.sponsorship_tiers for select to authenticated
  using (opportunity_id = any ((select public.my_brand_sponsorship_ids(false))::uuid[]));

drop policy if exists sponsorship_proposals_select_agency on public.sponsorship_proposals;
create policy sponsorship_proposals_select_agency on public.sponsorship_proposals for select to authenticated
  using (sent_at is not null and agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists sponsorship_proposals_select_brand on public.sponsorship_proposals;
create policy sponsorship_proposals_select_brand on public.sponsorship_proposals for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

drop policy if exists sponsorship_rounds_select_agency on public.sponsorship_rounds;
create policy sponsorship_rounds_select_agency on public.sponsorship_rounds for select to authenticated
  using (state = 'sent' and agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
drop policy if exists sponsorship_rounds_select_brand on public.sponsorship_rounds;
create policy sponsorship_rounds_select_brand on public.sponsorship_rounds for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- 3) cota única para as oportunidades que já existiam (sem valor; vagas = vencedoras já escolhidas, no mínimo 1) -------
insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, perks, slots)
select o.id, o.agency_id, 1, 'Cota única', o.perks,
       least(20, greatest(1, (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.outcome = 'won')))::smallint
from public.sponsorship_opportunities o
where not exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = o.id);

-- 4) auxiliares internas -----------------------------------------------------------------------------------------------
create or replace function public.sponsorship_tier_agreed(p_tier uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.sponsorship_proposals p where p.tier_id = p_tier and p.status = 'agreed'
$$;
revoke execute on function public.sponsorship_tier_agreed(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_tier_agreed(uuid) to service_role;

-- aviso de negociação: para a marca (todos os membros, ou só donos) ou para os Adms da agência. Nunca valor.
create or replace function public.sponsorship_negotiation_notify(p_proposal uuid, p_to text, p_status text, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.sponsorship_proposals%rowtype; v_title text; v_tier text; v_brand text; v_params jsonb;
begin
  select * into p from public.sponsorship_proposals where id = p_proposal;
  if p.id is null then return; end if;
  select o.title into v_title from public.sponsorship_opportunities o where o.id = p.opportunity_id;
  select t.name into v_tier from public.sponsorship_tiers t where t.id = p.tier_id;
  select b.name into v_brand from public.brands b where b.id = p.brand_id;
  v_params := jsonb_build_object('title', left(coalesce(v_title, ''), 120), 'tier', left(coalesce(v_tier, ''), 40),
                                 'brand', left(coalesce(v_brand, ''), 120), 'status', p_status);
  if p_to = 'agency' then
    perform public.inbox_notify_agency(p.agency_id, 'admin', 'sponsorship_negotiation', '/agencia/oportunidades/' || p.opportunity_id::text,
      v_params, 'sponsorship', p.opportunity_id, p_dedupe);
  else
    perform public.inbox_notify_brand(p.brand_id, p_to = 'brand_owners', 'sponsorship_negotiation', '/marca/oportunidades/' || p.opportunity_id::text,
      v_params, p.agency_id, 'sponsorship', p.opportunity_id, p_dedupe);
  end if;
end $$;
revoke execute on function public.sponsorship_negotiation_notify(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.sponsorship_negotiation_notify(uuid, text, text, text) to service_role;

-- campanha em rascunho nascida da oportunidade (a mesma montagem da 0085), com contrapartidas e observação dadas
create or replace function public.sponsorship_campaign_draft(p_opportunity uuid, p_brand uuid, p_created_by uuid, p_perks text[], p_notes text, p_audience jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_tz text; v_start date; v_end date; v_minutes int; v_request uuid;
begin
  select * into o from public.sponsorship_opportunities where id = p_opportunity;
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = o.agency_id;
  v_tz := coalesce(v_tz, 'America/Sao_Paulo');
  v_start := (o.starts_at at time zone v_tz)::date;
  v_end := ((case when o.all_day and o.ends_at > o.starts_at then o.ends_at - interval '1 minute' else o.ends_at end) at time zone v_tz)::date;
  if v_end < v_start then v_end := v_start; end if;
  v_minutes := case when o.all_day then null else greatest(15, (extract(epoch from (o.ends_at - o.starts_at)) / 60)::int) end;
  if v_minutes is not null and v_minutes > 14400 then v_minutes := null; end if;
  insert into public.campaign_requests (agency_id, brand_id, origin, created_by, talent_id, title, objective, period_start, period_end, desired_at,
                                        duration_minutes, format, location, networks, deliverables, notes, brief, sponsorship_id,
                                        target_audience, target_age_bands, target_states, region_note)
  values (o.agency_id, p_brand, 'brand', p_created_by, o.talent_id, left(o.title, 120), 'event', v_start, v_end,
          case when o.all_day then null else o.starts_at end, v_minutes, case when o.location <> '' then 'in_person' end, o.location, o.networks,
          jsonb_build_array(jsonb_build_object('kind', 'event', 'quantity', 1, 'network', o.networks[1])), left(coalesce(p_notes, ''), 2000),
          case when cardinality(coalesce(p_perks, '{}')) > 0 then jsonb_build_object('checks', to_jsonb(p_perks)) else '{}'::jsonb end, o.id,
          left(coalesce(p_audience ->> 'target_audience', ''), 500),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_audience -> 'target_age_bands', '[]')) x), '{}'::text[]),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_audience -> 'target_states', '[]')) x), '{}'::text[]),
          left(coalesce(p_audience ->> 'region_note', ''), 200))
  returning id into v_request;
  return v_request;
end $$;
revoke execute on function public.sponsorship_campaign_draft(uuid, uuid, uuid, text[], text, jsonb) from public, anon, authenticated;
grant execute on function public.sponsorship_campaign_draft(uuid, uuid, uuid, text[], text, jsonb) to service_role;

-- encerra a oportunidade (decisão da agência ou cotas esgotadas): situação, vencedoras, rascunhos das outras,
-- propostas vivas, agenda, auditoria e avisos. Interna; quem chama já conferiu o papel.
create or replace function public.sponsorship_close_out(p_id uuid, p_action text, p_winners uuid[], p_note text, p_actor_type public.actor_type)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_status text; v_winners uuid[] := coalesce(p_winners, '{}'::uuid[]); v_winner_names text; r record;
        v_label text; v_by uuid;
begin
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  v_status := case p_action when 'sponsor' then 'sponsored' when 'close' then 'closed' else 'cancelled' end;
  v_by := case when public.agency_role_of(o.agency_id) is not null then auth.uid() end;
  update public.sponsorship_opportunities set status = v_status, closed_reason = 'decision', decided_at = now(), decided_by = v_by,
    decision_note = left(coalesce(p_note, ''), 500)
  where id = p_id;
  update public.sponsorship_responses x set outcome = case when x.brand_id = any (v_winners) then 'won' else 'lost' end, decided_at = coalesce(x.decided_at, now())
  where x.opportunity_id = p_id and x.response = 'interested';
  update public.campaign_requests c set status = 'cancelled', approval_status = 'none'
  where c.sponsorship_id = p_id and c.status = 'draft' and not (c.brand_id = any (v_winners));
  update public.sponsorship_proposals p set status = 'closed', awaiting = null, ended_at = now(),
    end_reason = case when p_action = 'cancel' then 'cancelled' else 'decided' end
  where p.opportunity_id = p_id and p.status in ('draft', 'open');
  perform public.sponsorship_sync_event(p_id);
  select string_agg(b.name, ', ' order by b.name) into v_winner_names from public.brands b where b.id = any (v_winners);
  v_label := public.actor_label(o.agency_id, null);
  perform public.audit_log('sponsorship.decide', 'sponsorship', p_id::text, jsonb_build_object('agency_id', o.agency_id, 'status', o.status),
    jsonb_build_object('agency_id', o.agency_id, 'status', v_status, 'winners', to_jsonb(v_winners), 'by', v_label), nullif(btrim(coalesce(p_note, '')), ''),
    p_actor_type);
  for r in select x.brand_id from public.sponsorship_responses x where x.opportunity_id = p_id loop
    perform public.inbox_notify_brand(r.brand_id, false, 'sponsorship_decided', '/marca/oportunidades/' || p_id::text,
      jsonb_build_object('title', left(o.title, 120), 'status', case when r.brand_id = any (v_winners) then 'won' when p_action = 'cancel' then 'cancelled' else 'closed' end),
      o.agency_id, 'sponsorship', p_id, 'sponsor-decided:' || p_id::text || ':' || r.brand_id::text);
  end loop;
  perform public.inbox_notify(public.talent_user_id(o.talent_id), 'sponsorship_decided', '/creator/escritorio/agenda',
    jsonb_build_object('title', left(o.title, 120), 'status', v_status, 'brand', left(coalesce(v_winner_names, ''), 120)),
    o.agency_id, 'sponsorship', p_id, 'sponsor-decided:' || p_id::text || ':talent');
end $$;
revoke execute on function public.sponsorship_close_out(uuid, text, uuid[], text, public.actor_type) from public, anon, authenticated;
grant execute on function public.sponsorship_close_out(uuid, text, uuid[], text, public.actor_type) to service_role;

-- acordo: congela, marca a vencedora, cria/atualiza a campanha com o valor e as contrapartidas, encerra a cota cheia
create or replace function public.sponsorship_agree(p_proposal uuid, p_side text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype; t public.sponsorship_tiers%rowtype;
        x public.sponsorship_responses%rowtype; v_request uuid; v_status text; v_notes text; v_brand_name text; r record; v_agreed int; v_audience jsonb;
begin
  select * into p from public.sponsorship_proposals where id = p_proposal for update;
  select * into t from public.sponsorship_tiers where id = p.tier_id for update;
  select * into o from public.sponsorship_opportunities where id = p.opportunity_id;
  if public.sponsorship_tier_agreed(t.id) >= t.slots then raise exception 'tier_full' using errcode = 'P0001'; end if;
  update public.sponsorship_proposals set status = 'agreed', awaiting = null, agreed_cents = amount_cents, agreed_perks = perks, agreed_side = p_side,
    agreed_at = now(), sent_at = coalesce(sent_at, now())
  where id = p.id returning * into p;
  -- acordo conta como vencedora (a resposta da 0085 vira interesse, se ainda não era)
  select * into x from public.sponsorship_responses where opportunity_id = o.id and brand_id = p.brand_id for update;
  if x.id is null then
    insert into public.sponsorship_responses (opportunity_id, agency_id, brand_id, response, responded_by, responded_label, outcome, decided_at)
    values (o.id, o.agency_id, p.brand_id, 'interested', p.created_by,
            coalesce((select left(bm.display_name, 80) from public.brand_members bm where bm.brand_id = p.brand_id and bm.user_id = p.created_by), ''), 'won', now())
    returning * into x;
  else
    update public.sponsorship_responses set response = 'interested', outcome = 'won', decided_at = now() where id = x.id returning * into x;
  end if;
  -- campanha: atualiza o rascunho que já existe (0085) ou cria um novo; contrapartidas no checklist, cota nas notas
  v_notes := left(concat_ws(E'\n',
    'Patrocínio acordado: ' || o.title || ' — cota ' || t.name,
    case when o.expected_reach <> '' then 'Alcance esperado: ' || o.expected_reach end,
    'Contrapartidas acordadas: ' || array_to_string(p.agreed_perks, '; '),
    case when o.description <> '' then o.description end), 2000);
  -- público: o último indicado pela marca nesta negociação, senão o do evento
  select r2.audience into v_audience from public.sponsorship_rounds r2 where r2.proposal_id = p.id and r2.state = 'sent' and r2.audience is not null
  order by r2.seq desc limit 1;
  v_audience := coalesce(v_audience, jsonb_build_object('target_audience', o.target_audience, 'target_age_bands', to_jsonb(o.target_age_bands),
                                                        'target_states', to_jsonb(o.target_states), 'region_note', o.region_note));
  select c.status into v_status from public.campaign_requests c where c.id = coalesce(p.request_id, x.request_id);
  if v_status = 'draft' then
    v_request := coalesce(p.request_id, x.request_id);
    update public.campaign_requests c set brief = (case when jsonb_typeof(c.brief) = 'object' then c.brief else '{}'::jsonb end) || jsonb_build_object('checks', to_jsonb(p.agreed_perks)),
      notes = v_notes, approval_status = case when c.approval_status = 'returned' then 'none' else c.approval_status end,
      target_audience = case when c.target_audience = '' then left(coalesce(v_audience ->> 'target_audience', ''), 500) else c.target_audience end,
      target_age_bands = case when cardinality(c.target_age_bands) = 0
        then coalesce((select array_agg(z) from jsonb_array_elements_text(coalesce(v_audience -> 'target_age_bands', '[]')) z), '{}'::text[]) else c.target_age_bands end,
      target_states = case when cardinality(c.target_states) = 0
        then coalesce((select array_agg(z) from jsonb_array_elements_text(coalesce(v_audience -> 'target_states', '[]')) z), '{}'::text[]) else c.target_states end,
      region_note = case when c.region_note = '' then left(coalesce(v_audience ->> 'region_note', ''), 200) else c.region_note end
    where c.id = v_request;
  elsif v_status is not null and v_status <> 'cancelled' then
    v_request := coalesce(p.request_id, x.request_id);   -- já enviada: segue no pipeline; só o valor oferecido é atualizado
  else
    v_request := public.sponsorship_campaign_draft(o.id, p.brand_id, coalesce(p.created_by, auth.uid()), p.agreed_perks, v_notes, v_audience);
  end if;
  insert into public.campaign_request_budgets (agency_id, brand_id, request_id, budget_min_cents, budget_max_cents, note, updated_by)
  values (o.agency_id, p.brand_id, v_request, p.agreed_cents, p.agreed_cents, left('Patrocínio acordado — cota ' || t.name, 300), auth.uid())
  on conflict (request_id) do update set budget_min_cents = excluded.budget_min_cents, budget_max_cents = excluded.budget_max_cents,
    note = excluded.note, updated_by = excluded.updated_by;
  update public.sponsorship_proposals set request_id = v_request where id = p.id;
  update public.sponsorship_responses set request_id = v_request where id = x.id;
  perform public.audit_log('sponsorship.agree', 'sponsorship', o.id::text, null,
    jsonb_build_object('agency_id', o.agency_id, 'brand_id', p.brand_id, 'proposal_id', p.id, 'tier_id', t.id, 'side', p_side, 'request_id', v_request),
    null, case when p_side = 'agency' then public.talent_audit_actor('agency', o.agency_id) else 'brand'::public.actor_type end);
  -- avisos: a outra parte; o creator (patrocinada por esta marca)
  perform public.sponsorship_negotiation_notify(p.id, case when p_side = 'agency' then 'brand' else 'agency' end, 'agreed', 'sponsor-agreed:' || p.id::text);
  select b.name into v_brand_name from public.brands b where b.id = p.brand_id;
  perform public.inbox_notify(public.talent_user_id(o.talent_id), 'sponsorship_decided', '/creator/escritorio/agenda',
    jsonb_build_object('title', left(o.title, 120), 'status', 'sponsored', 'brand', left(coalesce(v_brand_name, ''), 120)),
    o.agency_id, 'sponsorship', o.id, 'sponsor-agreed:' || p.id::text || ':talent');
  -- cota esgotada: as outras propostas vivas dela são encerradas (com aviso)
  v_agreed := public.sponsorship_tier_agreed(t.id);
  if v_agreed >= t.slots then
    for r in update public.sponsorship_proposals q set status = 'closed', awaiting = null, ended_at = now(), end_reason = 'tier_full'
             where q.tier_id = t.id and q.status in ('draft', 'open') returning q.id loop
      perform public.sponsorship_negotiation_notify(r.id, 'brand', 'closed', 'sponsor-closed:' || r.id::text);
    end loop;
  end if;
  -- todas as cotas esgotadas: patrocinada (mesmo caminho da decisão)
  if o.decided_at is null and not exists (select 1 from public.sponsorship_tiers z where z.opportunity_id = o.id and public.sponsorship_tier_agreed(z.id) < z.slots) then
    perform public.sponsorship_close_out(o.id, 'sponsor',
      (select array_agg(distinct q.brand_id) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'agreed'), '',
      case when p_side = 'agency' then public.talent_audit_actor('agency', o.agency_id) else 'brand'::public.actor_type end);
  end if;
end $$;
revoke execute on function public.sponsorship_agree(uuid, text) from public, anon, authenticated;
grant execute on function public.sponsorship_agree(uuid, text) to service_role;

-- aplica uma rodada enviada (do dono da marca, da agência, ou aprovada pelo dono)
create or replace function public.sponsorship_round_apply(p_round uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.sponsorship_rounds%rowtype; p public.sponsorship_proposals%rowtype; v_other text;
begin
  select * into r from public.sponsorship_rounds where id = p_round;
  select * into p from public.sponsorship_proposals where id = r.proposal_id for update;
  update public.sponsorship_rounds set state = 'sent' where id = r.id;
  v_other := case when r.side = 'brand' then 'agency' else 'brand' end;
  -- a marca entrou na negociação: a resposta dela vira "quer patrocinar" (a agência vê no painel)
  if r.side = 'brand' and r.action <> 'decline' then
    insert into public.sponsorship_responses (opportunity_id, agency_id, brand_id, response, message, responded_by, responded_label)
    values (p.opportunity_id, p.agency_id, p.brand_id, 'interested', left(r.note, 500), r.actor_id, r.actor_label)
    on conflict (opportunity_id, brand_id) do update set response = 'interested', responded_by = excluded.responded_by,
      responded_label = excluded.responded_label, responded_at = now()
      where public.sponsorship_responses.response = 'declined';
  end if;
  if r.action = 'decline' then
    update public.sponsorship_proposals set status = 'declined', awaiting = null, ended_at = now(),
      end_reason = case when r.side = 'brand' then 'declined_brand' else 'declined_agency' end, rounds = rounds + 1
    where id = p.id;
    perform public.sponsorship_negotiation_notify(p.id, v_other, 'declined', 'sponsor-round:' || r.id::text);
    return 'declined';
  end if;
  update public.sponsorship_proposals set amount_cents = r.amount_cents, perks = r.perks, rounds = rounds + 1, sent_at = coalesce(sent_at, now()),
    status = 'open', awaiting = v_other
  where id = p.id;
  if r.action in ('accept_asked', 'accept') then
    perform public.sponsorship_agree(p.id, r.side);
    return 'agreed';
  end if;
  perform public.sponsorship_negotiation_notify(p.id, v_other, case when r.action = 'propose' then 'proposed' else 'countered' end, 'sponsor-round:' || r.id::text);
  return 'open';
end $$;
revoke execute on function public.sponsorship_round_apply(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_round_apply(uuid) to service_role;

-- valida valor/contrapartidas de uma rodada (lança invalid_input)
create or replace function public.sponsorship_terms_check(p_amount bigint, p_perks text[])
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > 10000000000 or not public.sponsorship_proposal_perks_valid(p_perks) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.sponsorship_terms_check(bigint, text[]) from public, anon, authenticated;
grant execute on function public.sponsorship_terms_check(bigint, text[]) to service_role;

-- contrapartidas limpas (sem vazios, sem espaços nas pontas)
create or replace function public.sponsorship_clean_perks(p text[])
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(btrim(regexp_replace(x, '\s+', ' ', 'g')) order by n), '{}'::text[])
  from unnest(coalesce(p, '{}'::text[])) with ordinality u(x, n) where x is not null and btrim(x) <> ''
$$;
revoke execute on function public.sponsorship_clean_perks(text[]) from public, anon, authenticated;
grant execute on function public.sponsorship_clean_perks(text[]) to service_role;

-- 5) marca: proposta, resposta e aprovação do dono ---------------------------------------------------------------------
-- p_action: 'accept_asked' (pelo valor pedido e as contrapartidas da cota) | 'propose' (valor + contrapartidas + nota)
-- p_audience: "público que me interessa" (opcional, mesmos campos da campanha)
create or replace function public.brand_sponsorship_propose(p_id uuid, p_brand uuid, p_tier uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text,
  p_audience jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; t public.sponsorship_tiers%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_id uuid; v_round uuid; v_label text; v_audience jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.sponsorship_brand_in_audience(p_id, p_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.sponsorship_tiers where id = p_tier and opportunity_id = p_id;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept_asked', 'propose') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_audience := public.sponsorship_audience_clean(p_audience);
  if o.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if o.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = p_id and q.brand_id = p_brand and q.status = 'agreed') then
    raise exception 'already_agreed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = p_id and q.brand_id = p_brand and q.status in ('draft', 'open')) then
    raise exception 'already_negotiating' using errcode = 'P0001';
  end if;
  if public.sponsorship_tier_agreed(t.id) >= t.slots then raise exception 'tier_full' using errcode = 'P0001'; end if;
  if p_action = 'accept_asked' then
    if t.price_cents is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_amount := t.price_cents;
    v_perks := t.perks;
    if cardinality(v_perks) = 0 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  else
    v_amount := p_amount_cents;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks);
  end if;
  v_label := public.actor_label(o.agency_id, p_brand);
  insert into public.sponsorship_proposals (opportunity_id, tier_id, agency_id, brand_id, status, asked_cents, amount_cents, perks, created_by)
  values (p_id, t.id, o.agency_id, p_brand, 'draft', t.price_cents, v_amount, v_perks, auth.uid())
  returning id into v_id;
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, audience, note, state, actor_id, actor_label)
  values (v_id, p_id, o.agency_id, p_brand, 1, 'brand', p_action, v_amount, v_perks, v_audience, v_note, case when v_role = 'owner' then 'sent' else 'pending_owner' end,
          auth.uid(), v_label)
  returning id into v_round;
  perform public.audit_log('sponsorship.propose', 'sponsorship', p_id::text, null,
    jsonb_build_object('agency_id', o.agency_id, 'brand_id', p_brand, 'proposal_id', v_id, 'tier_id', t.id, 'action', p_action, 'pending_owner', v_role <> 'owner'),
    nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' then
    perform public.sponsorship_round_apply(v_round);
  else
    perform public.sponsorship_negotiation_notify(v_id, 'brand_owners', 'approval', 'sponsor-approval:' || v_round::text);
  end if;
  return v_id;
end $$;

-- a marca responde à contraproposta da agência: 'accept' | 'decline' | 'counter'
create or replace function public.brand_sponsorship_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text, p_audience jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype; v_role text; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_round uuid; v_seq int; v_audience jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.sponsorship_proposals where id = p_proposal for update;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_role := public.brand_member_of(p.brand_id);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into o from public.sponsorship_opportunities where id = p.opportunity_id;
  if p.status <> 'open' or p.awaiting <> 'brand' or o.decided_at is not null or o.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sponsorship_rounds r where r.proposal_id = p.id and r.state = 'pending_owner') then
    raise exception 'awaiting_approval' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    v_amount := p_amount_cents;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks);
    v_audience := public.sponsorship_audience_clean(p_audience);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_perks := p.perks;
    if public.sponsorship_tier_agreed(p.tier_id) >= (select t.slots from public.sponsorship_tiers t where t.id = p.tier_id) then
      raise exception 'tier_full' using errcode = 'P0001';
    end if;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.sponsorship_rounds r where r.proposal_id = p.id;
  -- recusar não compromete dinheiro: a equipe recusa direto; aceitar e contrapropor pela equipe esperam o dono
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, audience, note, state, actor_id, actor_label)
  values (p.id, p.opportunity_id, p.agency_id, p.brand_id, v_seq, 'brand', p_action, v_amount, v_perks, v_audience, v_note,
          case when v_role = 'owner' or p_action = 'decline' then 'sent' else 'pending_owner' end, auth.uid(), public.actor_label(p.agency_id, p.brand_id))
  returning id into v_round;
  perform public.audit_log('sponsorship.brand_reply', 'sponsorship', p.opportunity_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'brand_id', p.brand_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''), 'brand'::public.actor_type);
  if v_role = 'owner' or p_action = 'decline' then
    return public.sponsorship_round_apply(v_round);
  end if;
  perform public.sponsorship_negotiation_notify(p.id, 'brand_owners', 'approval', 'sponsor-approval:' || v_round::text);
  return 'pending_owner';
end $$;

-- o dono da marca aprova (envia à agência) ou devolve (nota de 3+ letras) a rodada que a equipe montou
create or replace function public.brand_sponsorship_round_review(p_round uuid, p_decision text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.sponsorship_rounds%rowtype; p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype;
        v_note text := btrim(coalesce(p_note, '')); v_label text; v_result text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into r from public.sponsorship_rounds where id = p_round for update;
  if r.id is null or public.brand_member_of(r.brand_id) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.brand_member_of(r.brand_id) <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approve', 'return') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'return' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into p from public.sponsorship_proposals where id = r.proposal_id for update;
  select * into o from public.sponsorship_opportunities where id = r.opportunity_id;
  if r.state <> 'pending_owner' or p.status not in ('draft', 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  v_label := public.actor_label(r.agency_id, r.brand_id);
  update public.sponsorship_rounds set reviewed_by = auth.uid(), reviewed_label = v_label, reviewed_at = now(), review_note = v_note where id = r.id;
  if p_decision = 'return' then
    update public.sponsorship_rounds set state = 'returned' where id = r.id;
    if p.status = 'draft' then
      update public.sponsorship_proposals set status = 'closed', ended_at = now(), end_reason = 'returned' where id = p.id;
    end if;
    perform public.inbox_notify(r.actor_id, 'sponsorship_negotiation', '/marca/oportunidades/' || r.opportunity_id::text,
      jsonb_build_object('title', left(o.title, 120), 'tier', left(coalesce((select t.name from public.sponsorship_tiers t where t.id = p.tier_id), ''), 40),
                         'status', 'returned'), r.agency_id, 'sponsorship', r.opportunity_id, 'sponsor-review:' || r.id::text);
    v_result := 'returned';
  else
    -- as regras valem de novo na hora de enviar
    if o.decided_at is not null or (p.status = 'draft' and o.status <> 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if p.status = 'draft' and o.respond_by < now() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
    if r.action in ('accept', 'accept_asked') and public.sponsorship_tier_agreed(p.tier_id) >= (select t.slots from public.sponsorship_tiers t where t.id = p.tier_id) then
      raise exception 'tier_full' using errcode = 'P0001';
    end if;
    if p.status = 'open' and p.awaiting <> 'brand' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if p.status = 'draft' then update public.sponsorship_proposals set status = 'open', awaiting = 'agency', sent_at = now() where id = p.id; end if;
    v_result := public.sponsorship_round_apply(r.id);
    if r.actor_id is distinct from auth.uid() then
      perform public.inbox_notify(r.actor_id, 'sponsorship_negotiation', '/marca/oportunidades/' || r.opportunity_id::text,
        jsonb_build_object('title', left(o.title, 120), 'status', 'approved'), r.agency_id, 'sponsorship', r.opportunity_id, 'sponsor-review:' || r.id::text);
    end if;
  end if;
  perform public.audit_log('sponsorship.round_review', 'sponsorship', r.opportunity_id::text, null,
    jsonb_build_object('brand_id', r.brand_id, 'round_id', r.id, 'decision', p_decision), nullif(v_note, ''), 'brand'::public.actor_type);
  return v_result;
end $$;

-- 6) agência (só Adm): aceitar, recusar (com nota) ou contrapropor ------------------------------------------------------
create or replace function public.agency_sponsorship_reply(p_proposal uuid, p_action text, p_amount_cents bigint, p_perks text[], p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.sponsorship_proposals%rowtype; o public.sponsorship_opportunities%rowtype; v_note text := btrim(coalesce(p_note, ''));
        v_amount bigint; v_perks text[]; v_round uuid; v_seq int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into p from public.sponsorship_proposals where id = p_proposal for update;
  if p.id is null or p.sent_at is null or not public.agency_can(p.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_action = 'decline' and char_length(v_note) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  select * into o from public.sponsorship_opportunities where id = p.opportunity_id;
  if p.status <> 'open' or p.awaiting <> 'agency' or o.decided_at is not null or o.status not in ('open', 'closed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_action = 'counter' then
    v_amount := p_amount_cents;
    v_perks := public.sponsorship_clean_perks(p_perks);
    perform public.sponsorship_terms_check(v_amount, v_perks);
  elsif p_action = 'accept' then
    v_amount := p.amount_cents; v_perks := p.perks;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.sponsorship_rounds r where r.proposal_id = p.id;
  insert into public.sponsorship_rounds (proposal_id, opportunity_id, agency_id, brand_id, seq, side, action, amount_cents, perks, note, state, actor_id, actor_label)
  values (p.id, p.opportunity_id, p.agency_id, p.brand_id, v_seq, 'agency', p_action, v_amount, v_perks, v_note, 'sent', auth.uid(), public.actor_label(p.agency_id, null))
  returning id into v_round;
  perform public.audit_log('sponsorship.agency_reply', 'sponsorship', p.opportunity_id::text, null,
    jsonb_build_object('agency_id', p.agency_id, 'brand_id', p.brand_id, 'proposal_id', p.id, 'action', p_action), nullif(v_note, ''),
    public.talent_audit_actor('agency', p.agency_id));
  return public.sponsorship_round_apply(v_round);
end $$;

-- 7) criar/editar a oportunidade com cotas (MESMA assinatura da 0085). p_data além da 0085:
--    tiers: [{id?, name, price_cents?, perks[], slots}] (1 a 3). Sem "tiers": mantém as cotas (ou cria a "Cota única").
create or replace function public.agency_sponsorship_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before public.sponsorship_opportunities%rowtype; v_id uuid := p_id; v_talent uuid; v_start timestamptz; v_end timestamptz; v_respond timestamptz;
        v_all_day boolean; v_title text; v_audience text; v_perks text[]; v_networks text[]; v_brands uuid[]; v_has_responses boolean := false;
        v_admin boolean; v_tiers jsonb; e jsonb; v_pos int := 0; v_tier_id uuid; v_keep uuid[] := '{}'::uuid[]; v_tname text; v_tperks text[];
        v_tslots int; v_tprice bigint; v_old public.sponsorship_tiers%rowtype; v_public jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  if v_id is not null then
    select * into v_before from public.sponsorship_opportunities o where o.id = v_id and o.agency_id = p_agency for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.status <> 'open' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_has_responses := exists (select 1 from public.sponsorship_responses r where r.opportunity_id = v_id);
  end if;
  v_tiers := case when jsonb_typeof(p_data -> 'tiers') = 'array' then p_data -> 'tiers' end;
  if p_data ? 'tiers' and (v_tiers is null or jsonb_array_length(v_tiers) not between 1 and 3) then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_start := coalesce(nullif(btrim(coalesce(p_data ->> 'starts_at', '')), '')::timestamptz, v_before.starts_at);
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_at', '')), '')::timestamptz, v_before.ends_at, v_start);
    v_respond := coalesce(nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz, v_before.respond_by);
    v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
    if v_tiers is not null then
      -- contrapartidas gerais = união das cotas (na ordem, sem repetir, até 10)
      select coalesce((array_agg(x order by f))[1:10], '{}'::text[]) into v_perks
      from (select distinct on (lower(btrim(x))) btrim(x) as x, (t.n * 100 + e2.m) as f
            from jsonb_array_elements(v_tiers) with ordinality t(v, n)
            cross join lateral jsonb_array_elements_text(coalesce(t.v -> 'perks', '[]'::jsonb)) with ordinality e2(x, m)
            where btrim(x) <> '' order by lower(btrim(x)), (t.n * 100 + e2.m)) s;
    elsif p_data ? 'perks' then
      select coalesce(array_agg(btrim(x) order by n), '{}'::text[]) into v_perks
      from jsonb_array_elements_text(p_data -> 'perks') with ordinality as e(x, n) where btrim(x) <> '';
    else v_perks := coalesce(v_before.perks, '{}'::text[]); end if;
    if p_data ? 'networks' then
      select coalesce(array_agg(distinct lower(btrim(x))), '{}'::text[]) into v_networks from jsonb_array_elements_text(p_data -> 'networks') x;
    else v_networks := coalesce(v_before.networks, '{}'::text[]); end if;
    if p_data ? 'brand_ids' then
      select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_brands from jsonb_array_elements_text(p_data -> 'brand_ids') x where btrim(x) <> '';
    end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_title := btrim(coalesce(p_data ->> 'title', v_before.title, ''));
  v_audience := coalesce(nullif(p_data ->> 'audience', ''), v_before.audience, 'all');
  -- público do evento (mesmos campos da campanha); ausente = mantém
  v_public := case when p_data ?| array['target_audience', 'target_age_bands', 'target_states', 'region_note'] then
    coalesce(public.sponsorship_audience_clean(jsonb_strip_nulls(jsonb_build_object('target_audience', p_data -> 'target_audience',
      'target_age_bands', p_data -> 'target_age_bands', 'target_states', p_data -> 'target_states', 'region_note', p_data -> 'region_note'))),
      '{}'::jsonb) end;
  if v_talent is null or v_start is null or v_respond is null or v_audience not in ('all', 'selected') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_has_responses and v_talent <> v_before.talent_id then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.consent_at is not null and t.consent_revoked_at is null) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  if (v_before.id is null or v_respond is distinct from v_before.respond_by) and v_respond <= now() then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_respond > v_end then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_audience = 'selected' then
    if v_brands is null then
      select coalesce(array_agg(g.brand_id), '{}'::uuid[]) into v_brands from public.sponsorship_targets g where g.opportunity_id = v_id;
    end if;
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_brands
    from (select unnest(v_brands) as x union select r.brand_id from public.sponsorship_responses r where r.opportunity_id = v_id
          union select q.brand_id from public.sponsorship_proposals q where q.opportunity_id = v_id) s;
    if cardinality(v_brands) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_brands) b where not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = b and ab.status = 'active')) then
      raise exception 'brand_not_linked' using errcode = 'P0001';
    end if;
  end if;
  begin
    if v_id is null then
      insert into public.sponsorship_opportunities (agency_id, talent_id, title, description, location, starts_at, ends_at, all_day, expected_reach, perks, networks,
                                                    respond_by, audience, created_by)
      values (p_agency, v_talent, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_start, v_end, v_all_day, btrim(coalesce(p_data ->> 'expected_reach', '')), v_perks, v_networks, v_respond, v_audience, auth.uid())
      returning id into v_id;
    else
      update public.sponsorship_opportunities set talent_id = v_talent, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        expected_reach = case when p_data ? 'expected_reach' then btrim(coalesce(p_data ->> 'expected_reach', '')) else expected_reach end,
        perks = v_perks, networks = v_networks, respond_by = v_respond, audience = v_audience
      where id = v_id;
    end if;
    if v_public is not null then
      update public.sponsorship_opportunities set target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', '')
      where id = v_id;
    end if;
    -- cotas
    if v_tiers is not null then
      for e in select value from jsonb_array_elements(v_tiers) loop
        v_pos := v_pos + 1;
        if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
        begin
          v_tier_id := nullif(btrim(coalesce(e ->> 'id', '')), '')::uuid;
          v_tname := regexp_replace(btrim(coalesce(e ->> 'name', '')), '\s+', ' ', 'g');
          select coalesce(array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g') order by n), '{}'::text[]) into v_tperks
          from jsonb_array_elements_text(coalesce(e -> 'perks', '[]'::jsonb)) with ordinality q(x, n) where btrim(x) <> '';
          v_tslots := coalesce(nullif(btrim(coalesce(e ->> 'slots', '')), '')::int, 1);
          v_tprice := nullif(btrim(coalesce(e ->> 'price_cents', '')), '')::bigint;
        exception when others then raise exception 'invalid_input' using errcode = '22023';
        end;
        v_old := null;
        if v_tier_id is not null then
          select * into v_old from public.sponsorship_tiers t where t.id = v_tier_id and t.opportunity_id = v_id for update;
          if v_old.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
          -- vagas não descem abaixo dos acordos já fechados
          if v_tslots < public.sponsorship_tier_agreed(v_old.id) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
          update public.sponsorship_tiers set position = v_pos, name = v_tname, perks = v_tperks, slots = v_tslots,
            price_cents = case when v_admin then v_tprice else price_cents end,
            price_updated_by = case when v_admin and v_tprice is distinct from price_cents then auth.uid() else price_updated_by end,
            price_updated_at = case when v_admin and v_tprice is distinct from price_cents then now() else price_updated_at end
          where id = v_old.id;
        else
          insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, price_cents, perks, slots, price_updated_by, price_updated_at)
          values (v_id, p_agency, v_pos, v_tname, case when v_admin then v_tprice end, v_tperks, v_tslots,
                  case when v_admin and v_tprice is not null then auth.uid() end, case when v_admin and v_tprice is not null then now() end)
          returning id into v_tier_id;
        end if;
        v_keep := v_keep || v_tier_id;
      end loop;
      -- cota com proposta (de qualquer situação) não sai
      if exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep))
                 and exists (select 1 from public.sponsorship_proposals q where q.tier_id = t.id)) then
        raise exception 'invalid_state' using errcode = 'P0001';
      end if;
      delete from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep));
    elsif not exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id) then
      insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, perks, slots) values (v_id, p_agency, 1, 'Cota única', v_perks, 1);
    end if;
  exception when check_violation or not_null_violation or unique_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_audience = 'selected' then
    delete from public.sponsorship_targets g where g.opportunity_id = v_id and not (g.brand_id = any (v_brands));
    insert into public.sponsorship_targets (opportunity_id, brand_id, agency_id) select v_id, b, p_agency from unnest(v_brands) b
    on conflict (opportunity_id, brand_id) do nothing;
  else
    delete from public.sponsorship_targets g where g.opportunity_id = v_id;
  end if;
  perform public.sponsorship_sync_event(v_id);
  perform public.audit_log('sponsorship.save', 'sponsorship', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('agency_id', p_agency, 'talent_id', v_before.talent_id, 'starts_at', v_before.starts_at,
      'respond_by', v_before.respond_by, 'audience', v_before.audience) end,
    jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent, 'starts_at', v_start, 'respond_by', v_respond, 'audience', v_audience,
      'brands', case when v_audience = 'selected' then to_jsonb(v_brands) else null end,
      'tiers', (select count(*) from public.sponsorship_tiers t where t.opportunity_id = v_id)), null,
    public.talent_audit_actor('agency', p_agency));
  perform public.sponsorship_notify_audience(v_id);
  return v_id;
end $$;

-- 8) decidir (MESMA assinatura): acordos são sempre vencedores; "encerrar" com acordo vira patrocinada ---------------------
create or replace function public.agency_sponsorship_decide(p_id uuid, p_action text, p_brands uuid[], p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_note text := btrim(coalesce(p_note, '')); v_winners uuid[]; v_agreed uuid[]; v_action text := p_action;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.agency_can(o.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(o.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('sponsor', 'close', 'cancel') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if o.status not in ('open', 'closed') or o.decided_at is not null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct q.brand_id), '{}'::uuid[]) into v_agreed from public.sponsorship_proposals q where q.opportunity_id = p_id and q.status = 'agreed';
  if p_action = 'cancel' and cardinality(v_agreed) > 0 then raise exception 'has_agreement' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct b), '{}'::uuid[]) into v_winners from unnest(coalesce(p_brands, '{}'::uuid[]) || v_agreed) b;
  if p_action = 'close' and cardinality(v_agreed) > 0 then v_action := 'sponsor'; v_winners := v_agreed; end if;
  if v_action = 'sponsor' then
    if cardinality(v_winners) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_winners) b where not exists (select 1 from public.sponsorship_responses x where x.opportunity_id = p_id and x.brand_id = b and x.response = 'interested')) then
      raise exception 'not_interested' using errcode = 'P0001';
    end if;
  else
    v_winners := '{}'::uuid[];
  end if;
  perform public.sponsorship_close_out(p_id, v_action, v_winners, v_note, public.talent_audit_actor('agency', o.agency_id));
end $$;

-- 9) leituras ------------------------------------------------------------------------------------------------------------
-- público do evento em json (interna)
create or replace function public.sponsorship_public_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('target_audience', o.target_audience, 'target_age_bands', to_jsonb(o.target_age_bands),
                            'target_states', to_jsonb(o.target_states), 'region_note', o.region_note)
  from public.sponsorship_opportunities o where o.id = p_id
$$;
revoke execute on function public.sponsorship_public_json(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_public_json(uuid) to service_role;

create or replace function public.agency_sponsorships(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'talent_id', o.talent_id, 'talent_name', t.display_name,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'location', o.location, 'respond_by', o.respond_by,
      'status', o.status, 'closed_reason', o.closed_reason, 'audience', o.audience, 'decided_at', o.decided_at,
      'audience_count', (select count(*) from public.sponsorship_audience_brands(o.id)),
      'interested', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'interested'),
      'declined', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'declined'),
      'negotiating', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'open'),
      'awaiting_agency', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'open' and q.awaiting = 'agency'),
      'agreed', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'agreed'),
      'tiers', (select count(*) from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'missing_price', (select count(*) from public.sponsorship_tiers z where z.opportunity_id = o.id and z.price_cents is null),
      'winners', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb) from public.sponsorship_responses r join public.brands b on b.id = r.brand_id
                  where r.opportunity_id = o.id and r.outcome = 'won'))
    order by (o.status = 'open') desc, o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o join public.talent_profiles t on t.id = o.talent_id
    where o.agency_id = p_agency);
end $$;

-- rodadas de uma proposta (interna): p_values = com valor; p_sent_only = só o que a agência pode ver
create or replace function public.sponsorship_rounds_json(p_proposal uuid, p_values boolean, p_sent_only boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'side', r.side, 'action', r.action,
      'amount_cents', case when p_values then r.amount_cents end, 'perks', to_jsonb(r.perks), 'audience', r.audience, 'note', r.note, 'state', r.state,
      'actor_label', r.actor_label, 'created_at', r.created_at, 'reviewed_label', r.reviewed_label, 'reviewed_at', r.reviewed_at,
      'review_note', r.review_note) order by r.seq), '[]'::jsonb)
  from public.sponsorship_rounds r where r.proposal_id = p_proposal and (not p_sent_only or r.state = 'sent')
$$;
revoke execute on function public.sponsorship_rounds_json(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.sponsorship_rounds_json(uuid, boolean, boolean) to service_role;

create or replace function public.agency_sponsorship_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not public.agency_can(o.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(o.agency_id, 'admin');
  return jsonb_build_object(
    'can_values', v_admin,
    'opportunity', jsonb_build_object('id', o.id, 'agency_id', o.agency_id, 'talent_id', o.talent_id,
      'talent_name', (select t.display_name from public.talent_profiles t where t.id = o.talent_id),
      'title', o.title, 'description', o.description, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day,
      'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks), 'networks', to_jsonb(o.networks), 'respond_by', o.respond_by,
      'audience', o.audience, 'status', o.status, 'closed_reason', o.closed_reason, 'decision_note', o.decision_note, 'decided_at', o.decided_at,
      'decided_label', (select m.display_name from public.agency_members m where m.agency_id = o.agency_id and m.user_id = o.decided_by),
      'created_at', o.created_at, 'public', public.sponsorship_public_json(o.id),
      'target_ids', (select coalesce(jsonb_agg(g.brand_id), '[]'::jsonb) from public.sponsorship_targets g where g.opportunity_id = o.id)),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'position', z.position, 'name', z.name, 'perks', to_jsonb(z.perks), 'slots', z.slots,
        'price_cents', case when v_admin then z.price_cents end, 'has_price', z.price_cents is not null,
        'agreed', public.sponsorship_tier_agreed(z.id),
        'has_proposals', exists (select 1 from public.sponsorship_proposals q where q.tier_id = z.id)) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'brand_id', q.brand_id, 'brand_name', b.name, 'tier_id', q.tier_id,
        'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting, 'perks', to_jsonb(q.perks), 'rounds', q.rounds,
        'asked_cents', case when v_admin then q.asked_cents end, 'amount_cents', case when v_admin then q.amount_cents end,
        'agreed_cents', case when v_admin then q.agreed_cents end, 'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id,
        'history', public.sponsorship_rounds_json(q.id, v_admin, true))
      order by (q.status = 'open' and q.awaiting = 'agency') desc, (q.status = 'open') desc, q.sent_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.sent_at is not null),
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand_id', b.id, 'name', b.name, 'response', r.response, 'message', coalesce(r.message, ''),
        'responded_label', coalesce(r.responded_label, ''), 'responded_at', r.responded_at, 'outcome', r.outcome, 'request_id', r.request_id,
        'request_status', c.status, 'deal_id', d.id)
      order by case r.response when 'interested' then 0 when 'declined' then 2 else 1 end, r.responded_at, b.name), '[]'::jsonb)
      from (select distinct x as brand_id from public.sponsorship_audience_brands(o.id) x) s
      join public.brands b on b.id = s.brand_id
      left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = b.id
      left join public.campaign_requests c on c.id = r.request_id
      left join public.deals d on d.request_id = c.id));
end $$;

-- marca (MESMA assinatura): + cotas com o valor PEDIDO (nunca propostas de outras marcas; "esgotada" só como sim/não)
-- e o resumo da própria negociação. 'won' quando a marca tem acordo (antes mesmo da decisão final).
create or replace function public.brand_sponsorships(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'description', o.description, 'location', o.location,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'networks', to_jsonb(o.networks), 'respond_by', o.respond_by, 'public', public.sponsorship_public_json(o.id),
      'status', case when o.status = 'cancelled' then 'cancelled'
                     when r.outcome = 'won' then 'won'
                     when o.status in ('sponsored', 'closed') then 'closed'
                     when o.respond_by < now() then 'expired' else 'open' end,
      'agency_name', (select a.name from public.agencies a where a.id = o.agency_id),
      'timezone', (select a.timezone from public.agencies a where a.id = o.agency_id),
      'talent', (select jsonb_build_object('id', t.id, 'name', t.display_name, 'in_catalog', public.talent_brand_card_ok(t.id, o.agency_id),
                   'photo_url', case when public.talent_brand_card_ok(t.id, o.agency_id) then public.talent_public_card(t.id) ->> 'photo_url' end)
                 from public.talent_profiles t where t.id = o.talent_id),
      'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
                  'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots) order by z.position), '[]'::jsonb)
                from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'negotiation', (select jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting, 'tier_name', z.name,
                        'pending_owner', exists (select 1 from public.sponsorship_rounds x where x.proposal_id = q.id and x.state = 'pending_owner'))
                      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
                      where q.opportunity_id = o.id and q.brand_id = p_brand order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc limit 1),
      'my_response', case when r.id is null then null else jsonb_build_object('response', r.response, 'message', r.message, 'responded_label', r.responded_label,
        'responded_at', r.responded_at, 'request_id', r.request_id, 'outcome', r.outcome) end)
    order by (o.status = 'open' and o.respond_by >= now()) desc, o.starts_at), '[]'::jsonb)
    from public.sponsorship_opportunities o
    left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = p_brand
    where public.sponsorship_brand_in_audience(o.id, p_brand) or r.id is not null);
end $$;

-- marca: a negociação inteira desta oportunidade (só as próprias propostas, com todas as rodadas)
create or replace function public.brand_sponsorship_negotiation(p_id uuid, p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_role := public.brand_member_of(p_brand);
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not (public.sponsorship_brand_in_audience(p_id, p_brand)
                          or exists (select 1 from public.sponsorship_responses r where r.opportunity_id = p_id and r.brand_id = p_brand)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'role', v_role,
    'can_propose', o.status = 'open' and o.respond_by >= now()
      and not exists (select 1 from public.sponsorship_proposals q where q.opportunity_id = o.id and q.brand_id = p_brand and q.status in ('draft', 'open', 'agreed')),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
        'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'tier_id', q.tier_id, 'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting,
        'asked_cents', q.asked_cents, 'amount_cents', q.amount_cents, 'perks', to_jsonb(q.perks), 'agreed_cents', q.agreed_cents,
        'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side, 'agreed_at', q.agreed_at, 'ended_at', q.ended_at,
        'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id, 'created_at', q.created_at,
        'history', public.sponsorship_rounds_json(q.id, true, false))
      order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.brand_id = p_brand));
end $$;

-- creator (MESMA assinatura): + o que ficou acordado com cada marca (cota e contrapartidas). Nunca valor.
create or replace function public.talent_sponsorships()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at,
      'all_day', o.all_day, 'respond_by', o.respond_by, 'status', o.status, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'public', public.sponsorship_public_json(o.id),
      'sponsors', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb)
                   from public.sponsorship_responses r join public.brands b on b.id = r.brand_id where r.opportunity_id = o.id and r.outcome = 'won'),
      'agreements', (select coalesce(jsonb_agg(jsonb_build_object('brand', b.name, 'tier', z.name, 'perks', to_jsonb(q.agreed_perks)) order by q.agreed_at), '[]'::jsonb)
                     from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
                     where q.opportunity_id = o.id and q.status = 'agreed'))
    order by o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o where o.talent_id = v_talent and o.status <> 'cancelled');
end $$;

-- 10) brand_request_save (MESMA assinatura): na campanha de um patrocínio acordado, o valor oferecido é o do acordo
create or replace function public.brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_id uuid; v_talent uuid; v_min bigint; v_max bigint; v_period_start date; v_period_end date; v_desired timestamptz;
  v_duration int; v_segments uuid[]; v_ages text[]; v_states text[]; v_networks text[]; v_deliverables jsonb; v_brief jsonb; v_locked boolean := false;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if public.brand_member_of(p_brand) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.brand_active_agency(p_brand);
  if v_agency is null then raise exception 'brand_not_linked' using errcode = 'P0001'; end if;
  if p_id is not null then
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.brand_id = p_brand and r.origin = 'brand') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.campaign_requests r where r.id = p_id and r.status = 'draft') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if public.brand_member_of(p_brand) <> 'owner' and exists (select 1 from public.campaign_requests r where r.id = p_id and r.approval_status = 'pending') then
      raise exception 'awaiting_approval' using errcode = 'P0001';
    end if;
    v_locked := exists (select 1 from public.sponsorship_proposals q where q.request_id = p_id and q.status = 'agreed');
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
  if v_talent is not null and not public.talent_brand_card_ok(v_talent, v_agency)
     and not (p_id is not null and exists (select 1 from public.campaign_requests r join public.sponsorship_opportunities o on o.id = r.sponsorship_id
                                           where r.id = p_id and o.talent_id = v_talent and o.agency_id = v_agency)) then
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
    -- valor oferecido pela marca; na campanha de um patrocínio acordado, fica o valor do acordo (0088)
    if not v_locked and (p_data ? 'budget_min_cents' or p_data ? 'budget_max_cents' or p_data ? 'budget_note') then
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

-- 11) e-mail (0084, MESMA assinatura): + negociação (rodadas e desfecho; não os avisos internos da marca) -------------------
create or replace function public.inbox_kind_emails(p_kind text, p_link text, p_params jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case p_kind
    when 'opportunity_received' then coalesce(p_link, '') like '/creator/escritorio%'
    when 'opportunity_updated' then coalesce(p_link, '') like '/creator/escritorio%' and coalesce(p_params ->> 'status', '') in ('counter_accepted', 'counter_rejected')
    when 'deliverable_decided' then coalesce(p_link, '') like '/creator/escritorio%' and coalesce(p_params ->> 'status', '') = 'changes_requested'
    when 'deliverable_submitted' then coalesce(p_link, '') like '/marca/%'
    when 'contract_acceptance_requested' then true
    when 'task_due_soon' then true
    when 'sponsorship_published' then coalesce(p_link, '') like '/marca/%'
    when 'sponsorship_interest' then coalesce(p_link, '') like '/agencia/%'
    when 'sponsorship_decided' then true
    when 'sponsorship_negotiation' then coalesce(p_params ->> 'status', '') in ('proposed', 'countered', 'agreed', 'declined', 'closed')
    else false end
$$;
revoke execute on function public.inbox_kind_emails(text, text, jsonb) from public, anon;
grant execute on function public.inbox_kind_emails(text, text, jsonb) to authenticated, service_role;

-- 12) execução -------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.agency_sponsorship_save(uuid, uuid, jsonb)', 'public.agency_sponsorship_decide(uuid, text, uuid[], text)',
                           'public.agency_sponsorships(uuid)', 'public.agency_sponsorship_detail(uuid)', 'public.brand_sponsorships(uuid)',
                           'public.talent_sponsorships()', 'public.brand_sponsorship_propose(uuid, uuid, uuid, text, bigint, text[], text, jsonb)',
                           'public.brand_sponsorship_reply(uuid, text, bigint, text[], text, jsonb)', 'public.brand_sponsorship_round_review(uuid, text, text)',
                           'public.agency_sponsorship_reply(uuid, text, bigint, text[], text)', 'public.brand_sponsorship_negotiation(uuid, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
