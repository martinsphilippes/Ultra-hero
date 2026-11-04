-- =============================================================================
-- Groscove Ultra · 0111 · Roteiros de entrega — FASE 3: recorrência, insights, estratégias, indicadores e
-- condições de pagamento do herói-cliente · cenário S117
-- Fonte: PDF "Nosso processo de entrega 2027" (Publipost, Assessoria de imprensa/artística, "Envio de estratégias p/
-- marcas") + especificação aprovada (o responsável autorizou tudo). Idempotente; nada de drop de tabela/coluna;
-- search_path fixo; nenhuma função nova executável por anon (S14 segue 18). Só RPCs security definer escrevem.
--
-- Decisões (sem perguntar ao responsável):
--   • D1 Insights do publipost: vale para todo entregável publicado (status published/proof_submitted/done) nos
--     últimos 30 dias. "Insights" = uma leitura de métricas (0083, deliverable_metrics; qualquer fonte) medida a
--     partir de 1 dia depois da publicação (24 h) e outra a partir de 7 dias (7 dias); o print é o comprovante que já
--     existe (proof_url/proof_document_id). Lembrete ao herói (titular com login) 24 h e 7 dias depois da publicação
--     (aviso 'deliverable_published' com status insights_24h|insights_7d — tipo que JÁ existe: o check de
--     inbox_notifications não muda, porque migrações antigas reaplicadas pela suíte refazem a lista). Carência de 2
--     dias: depois disso o insight fica "atrasado" e o responsável do negócio (senão os gestores) recebe
--     insights_late (uma vez por marco). A leitura de 7 dias cobre a de 24 h. Pela varredura diária existente
--     (/api/cron/agency → insights_reminder_scan). A agência vê pendentes/atrasados no Início (agency_insights_pending:
--     gestor+ tudo, colaborador só os negócios dele); o herói vê os dele (my_insights_pending).
--   • D2 Serviço recorrente: contrato do negócio em deal_recurrences (ciclo semanal|quinzenal|mensal, início, fim
--     opcional, ativo). Cada ciclo gera cópias das etapas RECORRENTES do roteiro do próprio negócio (tasks com
--     recurrence weekly/biweekly/monthly; diária não se multiplica — "acompanhamento diário" segue uma etapa só) em
--     unidades de semana (semanal 1, quinzenal 2, mensal 4 — "4 pautas/mês"): etapa menor que o ciclo repete dentro
--     dele a cada 7·u dias (mensal + semanal = 4 ocorrências; mensal + quinzenal = 2); etapa maior que o ciclo sai a
--     cada (u_etapa/u_ciclo) ciclos. Ocorrência: disponível no dia âncora (rola para dia útil), vence em n dias úteis
--     (prazo da etapa), sem cadeia entre elas. Idempotente: índice único (negócio, posição, âncora); só o ciclo
--     corrente é gerado (ciclos passados não são recriados — nada de atraso fantasma), pelo cron diário e ao salvar.
--     O roteiro base continua sendo a entrada + a 1ª ocorrência; as ocorrências de ciclo ficam fora da cadeia, do
--     andamento "Dia X de N" e da lista do roteiro (tela própria), mas entram em "Hoje no meu setor", nos avisos de
--     prazo e nos indicadores de no prazo (por serviço). Marcos do roteiro não se repetem (milestone nulo).
--     Mudar ciclo/início apaga as ocorrências ainda abertas (as concluídas ficam) e gera de novo; encurtar o fim ou
--     desativar apaga as abertas que caem depois. Quem configura: gestor+ ou responsável/equipe do negócio.
--   • D3 Estratégias para marcas (processo mensal): banco de ideias (strategy_ideas) por agência e mês, com marca
--     (atendida pela agência) ou nome da empresa-alvo (prospecção), segmento, herói do casting, data do Calendário
--     Groscove (evento da plataforma) e texto. Situação: idea → review → approved → ready → sent (ideia, em análise,
--     aprovada, material pronto, enviada). Quem aprova: setor Estratégia (agency_members.sectors) ou o Adm; devolver
--     para ajuste pede nota. Interno da agência (marca e herói nunca leem). Envio à marca: REUSO da oportunidade de
--     patrocínio a partir de evento (0085/0101: herói + data + marca escolhida como público) — é o fluxo que já leva
--     herói, data do calendário e marca-alvo, com negociação, aceite e negócio no fim. A ideia se liga à
--     oportunidade (strategy_idea_link) e vira "enviada" quando a oportunidade é publicada (gatilho). A proposta
--     proativa de negócio e a chamada da marca não servem: a primeira não tem data/herói de evento e a segunda é
--     iniciada pela marca. Relatório automático do casting por período (strategy_casting_report): posts do app
--     (content publicado pelo perfil de criador do herói) + entregas publicadas nas campanhas da agência.
--     IA opcional: coluna ai_assisted + gancho no app (src/lib/strategy/ai.ts) que responde "não configurado".
--   • D4 Indicadores (gestor+): nova venda = negócios ganhos no período que tiveram um "próximo negócio" — ligado
--     explicitamente (deals.origin_deal_id, preenchido pelo botão "próximo negócio" do clipping) ou aberto para o
--     MESMO cliente (marca ou herói-cliente) até 180 dias depois do fechamento. Satisfação (0110) e no prazo por
--     serviço (0107) continuam nas leituras que já existem.
--   • D5 Condições de pagamento do herói-cliente (0108 recusava negócio sem marca): o plano vale também quando o
--     cliente é o herói (o herói paga a agência: assessoria, mentoria, business plan). Lançamento novo
--     'client_receivable' (talent_id = herói-cliente, brand_id nulo) + comissão = tudo o que entra (sem repasse,
--     a menos que haja heróis contratados no negócio). Sem termos nem contratação para negócio só do herói: o plano
--     salvo é PREVISTO ("aguardando confirmação") e o Adm efetiva a cobrança (agency_client_billing_confirm); então
--     as parcelas ficam em aberto, a agência marca cada uma como recebida (agency_client_installment_paid) e, todas
--     pagas, o lançamento quita. O herói vê "a pagar" (client_payments, sem comissão nem nada interno); a agência vê
--     "a receber" (agency_client_receivables). Negócios com marca seguem idênticos (mesmas funções, mesmo caminho).
-- =============================================================================

-- 1) negócio de origem ("próximo negócio") ----------------------------------------------------------------------------
alter table public.deals add column if not exists origin_deal_id uuid
  constraint deals_origin_deal_fk references public.deals (id) on delete set null;
alter table public.deals drop constraint if exists deals_origin_check;
alter table public.deals add constraint deals_origin_check check (origin_deal_id is null or origin_deal_id <> id);
create index if not exists deals_origin_idx on public.deals (origin_deal_id) where origin_deal_id is not null;

create or replace function public.deal_origin_set(p_deal uuid, p_origin uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_before uuid;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if p_origin is not null and (p_origin = p_deal or not exists (select 1 from public.deals d where d.id = p_origin and d.agency_id = v_agency)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select d.origin_deal_id into v_before from public.deals d where d.id = p_deal;
  if v_before is not distinct from p_origin then return; end if;
  update public.deals set origin_deal_id = p_origin where id = p_deal;
  perform public.audit_log('deal.origin', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'origin_deal_id', v_before),
    jsonb_build_object('agency_id', v_agency, 'origin_deal_id', p_origin), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.deal_origin_set(uuid, uuid) from public, anon;
grant execute on function public.deal_origin_set(uuid, uuid) to authenticated, service_role;

-- 2) insights do publipost (D1) ----------------------------------------------------------------------------------------
-- situação dos insights: waiting | due_24h | late_24h | due_7d | late_7d | done (carência de 2 dias em cada marco)
create or replace function public.deliverable_insights_state(p_published timestamptz, p_now timestamptz, p_has24 boolean, p_has7 boolean)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_published is null then 'waiting'
    when coalesce(p_has7, false) then 'done'
    when p_now < p_published + interval '24 hours' then 'waiting'
    when not coalesce(p_has24, false) and p_now < p_published + interval '7 days' then
      case when p_now < p_published + interval '3 days' then 'due_24h' else 'late_24h' end
    when p_now < p_published + interval '7 days' then 'waiting'
    when p_now < p_published + interval '9 days' then 'due_7d'
    else 'late_7d' end
$$;
revoke execute on function public.deliverable_insights_state(timestamptz, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.deliverable_insights_state(timestamptz, timestamptz, boolean, boolean) to authenticated, service_role;

-- entregáveis publicados (últimos p_days dias) com a situação dos insights; base das leituras e do cron (interna)
create or replace function public.deliverable_insights_rows(p_days int)
returns table (deliverable_id uuid, agency_id uuid, deal_id uuid, deal_talent_id uuid, talent_id uuid, title text, kind text, network text,
               published_at timestamptz, published_url text, has_print boolean, deal_title text, owner_id uuid, talent_name text,
               brand_name text, state text, last_measured_on date)
language sql stable security definer set search_path = '' as $$
  select x.id, x.agency_id, x.deal_id, x.deal_talent_id, x.talent_id, coalesce(nullif(x.title, ''), x.kind), x.kind, x.network,
         x.published_at, x.published_url, (x.proof_url is not null or x.proof_document_id is not null), d.title, d.owner_id, tp.display_name,
         coalesce(b.name, ''),
         public.deliverable_insights_state(x.published_at, now(),
           exists (select 1 from public.deliverable_metrics m where m.deliverable_id = x.id
                   and m.measured_on >= (x.published_at at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date + 1),
           exists (select 1 from public.deliverable_metrics m where m.deliverable_id = x.id
                   and m.measured_on >= (x.published_at at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date + 7)),
         (select max(m.measured_on) from public.deliverable_metrics m where m.deliverable_id = x.id)
  from public.deliverables x
  join public.deals d on d.id = x.deal_id
  join public.agencies a on a.id = x.agency_id and a.status = 'active'
  join public.talent_profiles tp on tp.id = x.talent_id
  left join public.brands b on b.id = x.brand_id
  where x.status in ('published', 'proof_submitted', 'done') and x.published_at is not null
    and x.published_at > now() - make_interval(days => greatest(least(coalesce(p_days, 30), 120), 1))
$$;
revoke execute on function public.deliverable_insights_rows(int) from public, anon, authenticated;
grant execute on function public.deliverable_insights_rows(int) to service_role;

-- varredura diária (service role): lembrete ao herói (24 h e 7 dias) e atraso ao responsável do negócio
create or replace function public.insights_reminder_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_user uuid; v_hero int := 0; v_agency int := 0; v_params jsonb; v_mark text;
begin
  for r in select * from public.deliverable_insights_rows(30) x where x.state in ('due_24h', 'due_7d', 'late_24h', 'late_7d') loop
    v_params := jsonb_build_object('deal', left(coalesce(r.deal_title, ''), 120), 'title', left(coalesce(r.title, ''), 120),
      'talent', left(coalesce(r.talent_name, ''), 120), 'date', to_char(r.published_at, 'YYYY-MM-DD'));
    v_mark := case when r.state in ('due_24h', 'late_24h') then '24h' else '7d' end;
    if r.state in ('due_24h', 'due_7d') then
      v_user := public.talent_user_id(r.talent_id);
      if v_user is not null and public.inbox_notify(v_user, 'deliverable_published', '/creator/escritorio/oportunidades/' || r.deal_talent_id::text,
           v_params || jsonb_build_object('status', 'insights_' || v_mark), r.agency_id, 'deliverable', r.deliverable_id,
           'insights:' || r.deliverable_id::text || ':' || v_mark) is not null then
        v_hero := v_hero + 1;
      end if;
    else
      if r.owner_id is not null and exists (select 1 from public.agency_members m where m.agency_id = r.agency_id and m.user_id = r.owner_id and m.revoked_at is null) then
        if public.inbox_notify(r.owner_id, 'deliverable_published', '/agencia/negocios/' || r.deal_id::text || '/entregas',
             v_params || jsonb_build_object('status', 'insights_late'), r.agency_id, 'deliverable', r.deliverable_id,
             'insights_late:' || r.deliverable_id::text || ':' || v_mark) is not null then v_agency := v_agency + 1; end if;
      else
        v_agency := v_agency + public.inbox_notify_agency(r.agency_id, 'manager', 'deliverable_published', '/agencia/negocios/' || r.deal_id::text || '/entregas',
          v_params || jsonb_build_object('status', 'insights_late'), 'deliverable', r.deliverable_id, 'insights_late:' || r.deliverable_id::text || ':' || v_mark);
      end if;
    end if;
  end loop;
  return jsonb_build_object('hero_reminders', v_hero, 'agency_alerts', v_agency);
end $$;
revoke execute on function public.insights_reminder_scan() from public, anon, authenticated;
grant execute on function public.insights_reminder_scan() to service_role;

-- pendentes/atrasados para a agência (gestor+ tudo; colaborador só os negócios em que está)
create or replace function public.agency_insights_pending(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_manager boolean; v_deals uuid[]; v_items jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_manager := public.agency_can(p_agency, 'manager');
  v_deals := public.my_staff_deal_ids();
  select coalesce(jsonb_agg(jsonb_build_object('deliverable_id', x.deliverable_id, 'deal_id', x.deal_id, 'deal_title', x.deal_title,
           'title', x.title, 'kind', x.kind, 'network', x.network, 'talent', x.talent_name, 'brand', x.brand_name, 'published_at', x.published_at,
           'published_url', x.published_url, 'has_print', x.has_print, 'state', x.state, 'last_measured_on', x.last_measured_on)
         order by (x.state like 'late%') desc, x.published_at), '[]'::jsonb)
    into v_items
  from (select * from public.deliverable_insights_rows(45) r
        where r.agency_id = p_agency and r.state in ('due_24h', 'late_24h', 'due_7d', 'late_7d') and (v_manager or r.deal_id = any (v_deals))
        order by r.published_at limit 100) x;
  return jsonb_build_object('items', v_items,
    'late', (select count(*) from jsonb_array_elements(v_items) e where e ->> 'state' like 'late%'),
    'pending', (select count(*) from jsonb_array_elements(v_items) e where e ->> 'state' like 'due%'));
end $$;
revoke execute on function public.agency_insights_pending(uuid) from public, anon;
grant execute on function public.agency_insights_pending(uuid) to authenticated, service_role;

-- os do próprio herói (titular ou equipe, pelas mesmas regras de deal_talents do escritório)
create or replace function public.my_insights_pending()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_ids := public.my_talent_deal_talent_ids();
  if v_ids is null or cardinality(v_ids) = 0 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('deliverable_id', x.deliverable_id, 'deal_talent_id', x.deal_talent_id, 'deal_title', x.deal_title,
            'title', x.title, 'kind', x.kind, 'network', x.network, 'published_at', x.published_at, 'state', x.state, 'has_print', x.has_print)
          order by x.published_at), '[]'::jsonb)
    from public.deliverable_insights_rows(30) x
    where x.deal_talent_id = any (v_ids) and x.state in ('due_24h', 'late_24h', 'due_7d', 'late_7d'));
end $$;
revoke execute on function public.my_insights_pending() from public, anon;
grant execute on function public.my_insights_pending() to authenticated, service_role;

-- 3) serviços recorrentes (D2) -------------------------------------------------------------------------------------------
alter table public.tasks add column if not exists cycle_no smallint;
alter table public.tasks add column if not exists cycle_on date;
alter table public.tasks drop constraint if exists tasks_cycle_check;
alter table public.tasks add constraint tasks_cycle_check check ((cycle_on is null) = (cycle_no is null)
  and (cycle_on is null or (roadmap_position is not null and recurrence in ('weekly', 'biweekly', 'monthly')))
  and (cycle_no is null or cycle_no between 0 and 3000));
-- o único (negócio, posição) da 0107 passa a valer só para o roteiro base; as ocorrências têm o seu
drop index if exists public.tasks_roadmap_uq;
create unique index if not exists tasks_roadmap_base_uq on public.tasks (deal_id, roadmap_position) where roadmap_position is not null and cycle_on is null;
create unique index if not exists tasks_roadmap_cycle_uq on public.tasks (deal_id, roadmap_position, cycle_on) where cycle_on is not null;

create table if not exists public.deal_recurrences (
  deal_id uuid primary key constraint deal_recurrences_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint deal_recurrences_agency_fk references public.agencies (id) on delete cascade,
  cycle text not null default 'monthly',
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  generated_cycle int,
  last_generated_at timestamptz,
  updated_by uuid constraint deal_recurrences_updated_by_fk references auth.users (id) on delete set null,
  updated_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_recurrences_cycle_check check (cycle in ('weekly', 'biweekly', 'monthly')),
  constraint deal_recurrences_dates_check check (ends_on is null or (ends_on > starts_on and ends_on <= starts_on + 1830)),
  constraint deal_recurrences_label_check check (char_length(updated_label) <= 80)
);
create index if not exists deal_recurrences_agency_idx on public.deal_recurrences (agency_id) where active;
revoke all on table public.deal_recurrences from public, anon, authenticated;
grant select on table public.deal_recurrences to authenticated;
grant all on table public.deal_recurrences to service_role;
alter table public.deal_recurrences enable row level security;
drop policy if exists deal_recurrences_select_admin on public.deal_recurrences;
create policy deal_recurrences_select_admin on public.deal_recurrences for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists deal_recurrences_select_agency on public.deal_recurrences;
create policy deal_recurrences_select_agency on public.deal_recurrences for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop trigger if exists trg_deal_recurrences_updated on public.deal_recurrences;
create trigger trg_deal_recurrences_updated before update on public.deal_recurrences for each row execute function public.set_updated_at();

-- semanas por unidade (semanal 1, quinzenal 2, mensal 4); diária e outras: nulo
create or replace function public.recurrence_units(p text)
returns int language sql immutable set search_path = '' as $$
  select case p when 'weekly' then 1 when 'biweekly' then 2 when 'monthly' then 4 end
$$;
-- início do ciclo n (0 = o primeiro)
create or replace function public.recurrence_cycle_start(p_cycle text, p_start date, p_n int)
returns date language sql immutable set search_path = '' as $$
  select case p_cycle when 'monthly' then (p_start + make_interval(months => p_n))::date when 'biweekly' then p_start + 14 * p_n else p_start + 7 * p_n end
$$;
revoke execute on function public.recurrence_units(text) from public, anon;
revoke execute on function public.recurrence_cycle_start(text, date, int) from public, anon;
grant execute on function public.recurrence_units(text) to authenticated, service_role;
grant execute on function public.recurrence_cycle_start(text, date, int) to authenticated, service_role;

-- ciclo que contém o dia (nulo antes do início ou depois do fim)
create or replace function public.recurrence_cycle_at(p_cycle text, p_start date, p_end date, p_day date)
returns int language plpgsql immutable set search_path = '' as $$
declare n int := 0;
begin
  if p_start is null or p_day is null or p_day < p_start then return null; end if;
  if p_cycle = 'monthly' then n := greatest(((extract(year from p_day) - extract(year from p_start)) * 12 + extract(month from p_day) - extract(month from p_start))::int - 1, 0);
  else n := (p_day - p_start) / (7 * public.recurrence_units(p_cycle)) - 1; n := greatest(n, 0);
  end if;
  while public.recurrence_cycle_start(p_cycle, p_start, n + 1) <= p_day and n < 3000 loop n := n + 1; end loop;
  if p_end is not null and public.recurrence_cycle_start(p_cycle, p_start, n) >= p_end then return null; end if;
  return n;
end $$;
revoke execute on function public.recurrence_cycle_at(text, date, date, date) from public, anon;
grant execute on function public.recurrence_cycle_at(text, date, date, date) to authenticated, service_role;

-- gera as ocorrências do ciclo corrente (interna; idempotente). Devolve quantas entraram.
create or replace function public.deal_recurrence_generate(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.deal_recurrences%rowtype; d record; v_tz text; v_today date; n int; v_cs date; v_ce date; b record; s int; c int; k int; v_anchor date;
        v_avail date; v_due date; v_n int := 0; v_ins int;
begin
  select * into r from public.deal_recurrences where deal_id = p_deal;
  select x.stage, x.agency_id, x.roadmap_started_on into d from public.deals x where x.id = p_deal;
  if r.deal_id is null or not r.active or d.stage is null or d.stage = 'closed' or d.roadmap_started_on is null then return 0; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = d.agency_id), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  n := public.recurrence_cycle_at(r.cycle, r.starts_on, r.ends_on, v_today);
  if n is null then return 0; end if;
  v_cs := public.recurrence_cycle_start(r.cycle, r.starts_on, n);
  v_ce := public.recurrence_cycle_start(r.cycle, r.starts_on, n + 1);
  c := public.recurrence_units(r.cycle);
  for b in select k2.* from public.tasks k2 where k2.deal_id = p_deal and k2.roadmap_position is not null and k2.cycle_on is null
             and k2.status <> 'cancelled' and public.recurrence_units(k2.recurrence) is not null order by k2.roadmap_position loop
    s := public.recurrence_units(b.recurrence);
    for k in 0 .. greatest(c / s, 1) - 1 loop
      if s > c and n % (s / c) <> 0 then exit; end if;
      v_anchor := v_cs + 7 * s * k;
      exit when v_anchor >= v_ce or (r.ends_on is not null and v_anchor >= r.ends_on);
      v_avail := public.br_roll_business_day(v_anchor);
      v_due := public.br_add_business_days(v_avail, greatest(coalesce(b.due_days, 1), 1) - 1);
      insert into public.tasks (agency_id, deal_id, title, description, side, status, sector, sector_extra, roadmap_step_id, roadmap_position, client_visible,
                                due_rule, due_days, recurrence, depends_on_prev, automatic, milestone, assignee_id, available_on, due_on, due_at, cycle_no, cycle_on)
      values (b.agency_id, p_deal, b.title, b.description, 'agency', 'todo', b.sector, b.sector_extra, b.roadmap_step_id, b.roadmap_position, b.client_visible,
              'recurring', greatest(coalesce(b.due_days, 1), 1), b.recurrence, false, false, null, b.assignee_id, v_avail, v_due,
              ((v_due + 1)::timestamp at time zone v_tz) - interval '1 minute', n, v_anchor)
      on conflict (deal_id, roadmap_position, cycle_on) where cycle_on is not null do nothing;
      get diagnostics v_ins = row_count;
      v_n := v_n + v_ins;
    end loop;
  end loop;
  update public.deal_recurrences set generated_cycle = greatest(coalesce(generated_cycle, -1), n), last_generated_at = now() where deal_id = p_deal;
  if v_n > 0 then
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
    values (d.agency_id, 'deal', p_deal, 'system', 'recurrence_cycle|' || (n + 1)::text, null, '');
  end if;
  return v_n;
end $$;
revoke execute on function public.deal_recurrence_generate(uuid) from public, anon, authenticated;
grant execute on function public.deal_recurrence_generate(uuid) to service_role;

-- leitura: contrato, etapas recorrentes do roteiro, ciclo corrente e ocorrências (corrente e anterior) — gestor+ ou equipe
create or replace function public.deal_recurrence_json(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d record; r public.deal_recurrences%rowtype; v_tz text; v_today date; n int; v_base jsonb; v_occ jsonb; v_stats jsonb; v_can boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select x.id, x.agency_id, x.stage, x.roadmap_started_on, x.owner_id, s.recurrence as service_recurrence into d
  from public.deals x left join public.agency_services s on s.id = x.service_id where x.id = p_deal;
  if d.id is null or not (public.agency_can(d.agency_id, 'manager') or p_deal = any (public.my_staff_deal_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into r from public.deal_recurrences where deal_id = p_deal;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = d.agency_id), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  select coalesce(jsonb_agg(jsonb_build_object('position', k.roadmap_position, 'title', k.title, 'recurrence', k.recurrence, 'sector', k.sector,
           'due_days', k.due_days, 'client_visible', k.client_visible) order by k.roadmap_position), '[]'::jsonb)
    into v_base
  from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.cycle_on is null and k.status <> 'cancelled'
    and public.recurrence_units(k.recurrence) is not null;
  n := case when r.deal_id is not null then public.recurrence_cycle_at(r.cycle, r.starts_on, r.ends_on, v_today) end;
  v_can := d.stage <> 'closed' and (public.agency_can(d.agency_id, 'manager') or d.owner_id = auth.uid()
           or exists (select 1 from public.deal_team t where t.deal_id = p_deal and t.user_id = auth.uid()));
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'position', k.roadmap_position, 'title', k.title, 'sector', k.sector, 'cycle_no', k.cycle_no,
           'cycle_on', k.cycle_on, 'available_on', k.available_on, 'due_on', k.due_on, 'status', k.status, 'client_visible', k.client_visible,
           'completed_on', case when k.status = 'done' then (k.completed_at at time zone v_tz)::date end,
           'late', k.status not in ('done', 'cancelled') and k.due_on < v_today, 'assignee_name', m.display_name,
           'can_work', d.stage <> 'closed' and public.roadmap_task_can_work(k.id)) order by k.cycle_no desc, k.due_on, k.roadmap_position), '[]'::jsonb)
    into v_occ
  from public.tasks k left join public.agency_members m on m.agency_id = k.agency_id and m.user_id = k.assignee_id and m.revoked_at is null
  where k.deal_id = p_deal and k.cycle_on is not null and k.status <> 'cancelled'
    and (k.cycle_no >= coalesce(n, (select max(x.cycle_no) from public.tasks x where x.deal_id = p_deal and x.cycle_on is not null), 0) - 1
         or (k.status not in ('done', 'cancelled') and k.due_on < v_today));
  select jsonb_build_object('cycles', count(distinct k.cycle_no), 'done', count(*) filter (where k.status = 'done'),
           'on_time', count(*) filter (where k.status = 'done' and (k.completed_at at time zone v_tz)::date <= k.due_on),
           'late_open', count(*) filter (where k.status not in ('done', 'cancelled') and k.due_on < v_today))
    into v_stats
  from public.tasks k where k.deal_id = p_deal and k.cycle_on is not null and k.status <> 'cancelled';
  return jsonb_build_object('today', v_today, 'roadmap_started', d.roadmap_started_on is not null, 'service_recurrence', d.service_recurrence,
    'eligible', jsonb_array_length(v_base) > 0, 'can_edit', v_can, 'base', v_base,
    'config', case when r.deal_id is null then null else jsonb_build_object('cycle', r.cycle, 'starts_on', r.starts_on, 'ends_on', r.ends_on,
      'active', r.active, 'updated_label', r.updated_label, 'last_generated_at', r.last_generated_at) end,
    'current', case when n is null then null else jsonb_build_object('no', n, 'starts_on', public.recurrence_cycle_start(r.cycle, r.starts_on, n),
      'ends_on', public.recurrence_cycle_start(r.cycle, r.starts_on, n + 1) - 1) end,
    'next_on', case when r.deal_id is null then null when n is null and v_today < r.starts_on then r.starts_on
                    when n is not null and (r.ends_on is null or public.recurrence_cycle_start(r.cycle, r.starts_on, n + 1) < r.ends_on)
                      then public.recurrence_cycle_start(r.cycle, r.starts_on, n + 1) end,
    'occurrences', v_occ, 'stats', v_stats);
end $$;
revoke execute on function public.deal_recurrence_json(uuid) from public, anon;
grant execute on function public.deal_recurrence_json(uuid) to authenticated, service_role;

-- configurar o contrato recorrente (gestor+ ou responsável/equipe do negócio)
create or replace function public.deal_recurrence_save(p_deal uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_cycle text; v_start date; v_end date; v_active boolean; v_before public.deal_recurrences%rowtype; v_tz text; v_today date; v_removed int := 0;
        v_k int; v_new int;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, true);
  if not exists (select 1 from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.cycle_on is null
                 and k.status <> 'cancelled' and public.recurrence_units(k.recurrence) is not null) then
    raise exception 'no_recurring_steps' using errcode = 'P0001';
  end if;
  begin
    v_cycle := coalesce(nullif(btrim(coalesce(p_data ->> 'cycle', '')), ''), 'monthly');
    v_start := nullif(btrim(coalesce(p_data ->> 'starts_on', '')), '')::date;
    v_end := nullif(btrim(coalesce(p_data ->> 'ends_on', '')), '')::date;
    v_active := coalesce((p_data ->> 'active')::boolean, true);
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_cycle not in ('weekly', 'biweekly', 'monthly') or v_start is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_start := public.roadmap_start_date(v_agency, v_start);
  if v_end is not null and (v_end <= v_start or v_end > v_start + 1830) then raise exception 'invalid_date' using errcode = '22023'; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = v_agency), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  select * into v_before from public.deal_recurrences where deal_id = p_deal for update;
  -- reprogramar (ciclo ou início mudou): as ocorrências abertas saem; as concluídas ficam como histórico
  if v_before.deal_id is not null and (v_before.cycle <> v_cycle or v_before.starts_on <> v_start) then
    delete from public.tasks k where k.deal_id = p_deal and k.cycle_on is not null and k.status in ('todo', 'doing', 'blocked');
    get diagnostics v_removed = row_count;
  end if;
  -- desativado: saem as abertas que ainda não começaram; fim encurtado: saem as abertas depois do fim
  if not v_active then
    delete from public.tasks k where k.deal_id = p_deal and k.cycle_on is not null and k.status in ('todo', 'doing', 'blocked') and k.available_on > v_today;
    get diagnostics v_k = row_count; v_removed := v_removed + v_k;
  end if;
  if v_end is not null then
    delete from public.tasks k where k.deal_id = p_deal and k.cycle_on is not null and k.status in ('todo', 'doing', 'blocked') and k.cycle_on >= v_end;
    get diagnostics v_k = row_count; v_removed := v_removed + v_k;
  end if;
  insert into public.deal_recurrences (deal_id, agency_id, cycle, starts_on, ends_on, active, updated_by, updated_label)
  values (p_deal, v_agency, v_cycle, v_start, v_end, v_active, auth.uid(), public.actor_label(v_agency))
  on conflict (deal_id) do update set cycle = excluded.cycle, starts_on = excluded.starts_on, ends_on = excluded.ends_on, active = excluded.active,
    updated_by = excluded.updated_by, updated_label = excluded.updated_label,
    generated_cycle = case when public.deal_recurrences.cycle <> excluded.cycle or public.deal_recurrences.starts_on <> excluded.starts_on then null
                           else public.deal_recurrences.generated_cycle end;
  v_new := public.deal_recurrence_generate(p_deal);
  perform public.audit_log('deal.recurrence', 'deal', p_deal::text,
    case when v_before.deal_id is null then null else jsonb_build_object('agency_id', v_agency, 'cycle', v_before.cycle, 'starts_on', v_before.starts_on,
      'ends_on', v_before.ends_on, 'active', v_before.active) end,
    jsonb_build_object('agency_id', v_agency, 'cycle', v_cycle, 'starts_on', v_start, 'ends_on', v_end, 'active', v_active, 'created', v_new, 'removed', v_removed),
    null, public.talent_audit_actor('agency', v_agency));
  return jsonb_build_object('created', v_new, 'removed', v_removed);
end $$;
revoke execute on function public.deal_recurrence_save(uuid, jsonb) from public, anon;
grant execute on function public.deal_recurrence_save(uuid, jsonb) to authenticated, service_role;

-- varredura diária (service role): gera o ciclo corrente de cada contrato ativo
create or replace function public.recurrence_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_deals int := 0; v_created int := 0;
begin
  for r in select x.deal_id from public.deal_recurrences x join public.deals d on d.id = x.deal_id join public.agencies a on a.id = x.agency_id and a.status = 'active'
           where x.active and d.stage <> 'closed' loop
    v_created := v_created + public.deal_recurrence_generate(r.deal_id);
    v_deals := v_deals + 1;
  end loop;
  return jsonb_build_object('deals', v_deals, 'created', v_created);
end $$;
revoke execute on function public.recurrence_scan() from public, anon, authenticated;
grant execute on function public.recurrence_scan() to service_role;

-- 3.1) leituras/cadeia da 0107 ignoram as ocorrências de ciclo (MESMAS assinaturas; só o filtro cycle_on is null) ----
create or replace function public.roadmap_recalc(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_start date; v_agency uuid; v_tz text; v_today date; v_last date; v_next date; v_prev_start date; v_all_done boolean := true;
        t record; v_avail date; v_due date; v_end date; v_n int := 0; v_flag text;
begin
  select d.roadmap_started_on, d.agency_id into v_start, v_agency from public.deals d where d.id = p_deal;
  if v_start is null then return 0; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = v_agency), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  v_flag := coalesce(current_setting('app.roadmap_recalc', true), '');
  perform set_config('app.roadmap_recalc', '1', true);
  v_next := public.br_roll_business_day(v_start);
  v_prev_start := v_next;
  for t in select k.id, k.status, k.completed_at, k.available_on, k.due_on, k.due_rule, k.due_days, k.depends_on_prev, k.automatic
           from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.cycle_on is null and k.status <> 'cancelled'
           order by k.roadmap_position for update loop
    if t.due_rule = 'same_day' then v_avail := coalesce(v_last, v_next);
    elsif t.depends_on_prev then v_avail := v_next;
    else v_avail := v_prev_start; end if;
    v_due := case when t.due_rule = 'same_day' then v_avail else public.br_add_business_days(v_avail, greatest(coalesce(t.due_days, 1), 1) - 1) end;
    if t.status = 'done' then
      v_end := (t.completed_at at time zone v_tz)::date;
      if t.available_on is null or t.due_on is null then
        update public.tasks set available_on = coalesce(available_on, v_avail), due_on = coalesce(due_on, v_due) where id = t.id;
      end if;
      v_prev_start := coalesce(t.available_on, v_avail);
    elsif t.automatic and v_all_done then
      update public.tasks set status = 'done', completed_by = null, available_on = v_avail, due_on = greatest(v_due, v_today),
        due_at = ((greatest(v_due, v_today) + 1)::timestamp at time zone v_tz) - interval '1 minute' where id = t.id;
      v_end := v_today; v_prev_start := v_avail; v_n := v_n + 1;
    else
      v_all_done := false;
      if t.available_on is distinct from v_avail or t.due_on is distinct from v_due then
        update public.tasks set available_on = v_avail, due_on = v_due, due_at = ((v_due + 1)::timestamp at time zone v_tz) - interval '1 minute' where id = t.id;
        v_n := v_n + 1;
      end if;
      v_end := greatest(v_due, v_today);
      v_prev_start := v_avail;
    end if;
    v_last := greatest(coalesce(v_last, v_end), v_end);
    v_next := public.br_next_business_day(v_last);
  end loop;
  perform set_config('app.roadmap_recalc', v_flag, true);
  return v_n;
end $$;
revoke execute on function public.roadmap_recalc(uuid) from public, anon, authenticated;
grant execute on function public.roadmap_recalc(uuid) to service_role;

create or replace function public.roadmap_progress(p_deal uuid, p_client boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d record; v_tz text; v_today date; v_day int; v_late boolean; v_open int; v_done int; v_total int; v_forecast date; v_milestone date;
begin
  select x.id, x.agency_id, x.roadmap_started_on, s.sla_days, s.milestone_days, s.milestone_label, s.name as service_name, s.recurrence
    into d from public.deals x left join public.agency_services s on s.id = x.service_id where x.id = p_deal;
  if d.roadmap_started_on is null then return null; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = d.agency_id), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  v_day := case when v_today < public.br_roll_business_day(d.roadmap_started_on) then 0
                else 1 + public.br_business_days_between(public.br_roll_business_day(d.roadmap_started_on), v_today) end;
  select count(*) filter (where k.status = 'done'), count(*), count(*) filter (where k.status <> 'done'),
         coalesce(bool_or(k.status <> 'done' and k.due_on < v_today), false),
         max(case when k.status = 'done' then (k.completed_at at time zone v_tz)::date else k.due_on end)
    into v_done, v_total, v_open, v_late, v_forecast
  from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.cycle_on is null and k.status <> 'cancelled' and (not p_client or k.client_visible);
  if d.milestone_days is not null then
    v_milestone := public.br_add_business_days(public.br_roll_business_day(d.roadmap_started_on), d.milestone_days - 1);
  end if;
  return jsonb_build_object('service', d.service_name, 'recurrence', d.recurrence, 'started_on', d.roadmap_started_on, 'today', v_today, 'day', v_day,
    'total', d.sla_days, 'milestone_days', d.milestone_days, 'milestone_label', coalesce(d.milestone_label, ''), 'milestone_on', v_milestone,
    'target_on', case when d.sla_days is not null then public.br_add_business_days(public.br_roll_business_day(d.roadmap_started_on), d.sla_days - 1) end,
    'status', case when v_total > 0 and v_open = 0 then 'done' when v_late then 'late' else 'on_time' end,
    'done', v_done, 'steps', v_total, 'forecast', v_forecast);
end $$;
revoke execute on function public.roadmap_progress(uuid, boolean) from public, anon, authenticated;
grant execute on function public.roadmap_progress(uuid, boolean) to service_role;

create or replace function public.deal_roadmap(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid; v_stage text; v_can_edit boolean; v_tz text; v_today date; v_tasks jsonb; v_service jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.agency_id, d.stage into v_agency, v_stage from public.deals d where d.id = p_deal;
  if v_agency is null or not (public.agency_can(v_agency, 'manager') or p_deal = any (public.my_staff_deal_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_can_edit := v_stage <> 'closed';
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = v_agency), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  select jsonb_build_object('id', s.id, 'name', s.name, 'sla_days', s.sla_days, 'client_kind', s.client_kind) into v_service
  from public.deals d join public.agency_services s on s.id = d.service_id where d.id = p_deal;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'position', k.roadmap_position, 'title', k.title, 'description', k.description, 'sector', k.sector, 'sector_extra', k.sector_extra,
      'due_rule', k.due_rule, 'due_days', k.due_days, 'recurrence', k.recurrence, 'client_visible', k.client_visible, 'automatic', k.automatic,
      'milestone', k.milestone, 'status', k.status, 'available_on', k.available_on, 'due_on', k.due_on,
      'completed_on', case when k.status = 'done' then (k.completed_at at time zone v_tz)::date end,
      'assignee_id', k.assignee_id, 'assignee_name', m.display_name,
      'late', k.status not in ('done', 'cancelled') and k.due_on < v_today,
      'can_work', v_can_edit and public.roadmap_task_can_work(k.id)) order by k.roadmap_position), '[]'::jsonb)
    into v_tasks
  from public.tasks k left join public.agency_members m on m.agency_id = k.agency_id and m.user_id = k.assignee_id and m.revoked_at is null
  where k.deal_id = p_deal and k.roadmap_position is not null and k.cycle_on is null and k.status <> 'cancelled';
  return jsonb_build_object('service', v_service, 'progress', public.roadmap_progress(p_deal, false), 'tasks', v_tasks, 'can_edit', v_can_edit,
    'can_replace', v_can_edit and not exists (select 1 from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.status = 'done' and not k.automatic));
end $$;
revoke execute on function public.deal_roadmap(uuid) from public, anon;
grant execute on function public.deal_roadmap(uuid) to authenticated, service_role;

-- herói-cliente: + 'recurring' (ocorrências visíveis ao cliente do ciclo corrente e do anterior)
create or replace function public.client_projects()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id(); v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_talent is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'deal_id', d.id, 'title', d.title, 'agency', a.name, 'brand', b.name, 'stage', d.stage, 'closed', d.stage = 'closed',
      'progress', public.roadmap_progress(d.id, true),
      'steps', (select coalesce(jsonb_agg(jsonb_build_object('title', k.title, 'due_on', k.due_on, 'done', k.status = 'done',
                   'completed_on', case when k.status = 'done' then (k.completed_at at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date end,
                   'milestone', k.milestone) order by k.roadmap_position), '[]'::jsonb)
                from public.tasks k where k.deal_id = d.id and k.roadmap_position is not null and k.cycle_on is null and k.client_visible and k.status <> 'cancelled'),
      'recurring', (select coalesce(jsonb_agg(jsonb_build_object('title', k.title, 'due_on', k.due_on, 'cycle_on', k.cycle_on, 'done', k.status = 'done')
                       order by k.due_on, k.roadmap_position), '[]'::jsonb)
                    from public.tasks k where k.deal_id = d.id and k.cycle_on is not null and k.client_visible and k.status <> 'cancelled'
                      and k.cycle_no >= (select max(x.cycle_no) from public.tasks x where x.deal_id = d.id and x.cycle_on is not null) - 1))
    order by (d.stage = 'closed'), d.roadmap_started_on desc), '[]'::jsonb)
    into v_out
  from public.deals d join public.agencies a on a.id = d.agency_id and a.status = 'active'
  left join public.brands b on b.id = d.brand_id
  where d.client_talent_id = v_talent and d.roadmap_started_on is not null and (d.outcome is null or d.outcome = 'won');
  return v_out;
end $$;
revoke execute on function public.client_projects() from public, anon;
grant execute on function public.client_projects() to authenticated, service_role;

-- 4) estratégias para marcas (D3) ---------------------------------------------------------------------------------------
create table if not exists public.strategy_ideas (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint strategy_ideas_agency_fk references public.agencies (id) on delete cascade,
  month date not null,
  brand_id uuid constraint strategy_ideas_brand_fk references public.brands (id) on delete set null,
  brand_label text not null default '',
  segment_id uuid constraint strategy_ideas_segment_fk references public.talent_segments (id) on delete set null,
  talent_id uuid constraint strategy_ideas_talent_fk references public.talent_profiles (id) on delete set null,
  calendar_event_id uuid constraint strategy_ideas_event_fk references public.calendar_events (id) on delete set null,
  idea_on date,
  title text not null,
  body text not null default '',
  status text not null default 'idea',
  review_note text not null default '',
  author_id uuid constraint strategy_ideas_author_fk references auth.users (id) on delete set null,
  author_label text not null default '',
  reviewed_by uuid constraint strategy_ideas_reviewed_by_fk references auth.users (id) on delete set null,
  reviewed_label text not null default '',
  reviewed_at timestamptz,
  sponsorship_id uuid constraint strategy_ideas_sponsorship_fk references public.sponsorship_opportunities (id) on delete set null,
  sent_at timestamptz,
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategy_ideas_month_check check (month = date_trunc('month', month)::date),
  constraint strategy_ideas_target_check check (brand_id is not null or char_length(btrim(brand_label)) between 2 and 120),
  constraint strategy_ideas_text_check check (char_length(btrim(title)) between 3 and 120 and char_length(body) <= 4000
    and char_length(brand_label) <= 120 and char_length(review_note) <= 500 and char_length(author_label) <= 80 and char_length(reviewed_label) <= 80),
  constraint strategy_ideas_status_check check (status in ('idea', 'review', 'approved', 'ready', 'sent')),
  constraint strategy_ideas_sent_check check ((status = 'sent') = (sent_at is not null))
);
create index if not exists strategy_ideas_agency_idx on public.strategy_ideas (agency_id, month desc, status);
create index if not exists strategy_ideas_sponsorship_idx on public.strategy_ideas (sponsorship_id) where sponsorship_id is not null;
revoke all on table public.strategy_ideas from public, anon, authenticated;
grant select on table public.strategy_ideas to authenticated;
grant all on table public.strategy_ideas to service_role;
alter table public.strategy_ideas enable row level security;
drop policy if exists strategy_ideas_select_admin on public.strategy_ideas;
create policy strategy_ideas_select_admin on public.strategy_ideas for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists strategy_ideas_select_agency on public.strategy_ideas;
create policy strategy_ideas_select_agency on public.strategy_ideas for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop trigger if exists trg_strategy_ideas_updated on public.strategy_ideas;
create trigger trg_strategy_ideas_updated before update on public.strategy_ideas for each row execute function public.set_updated_at();

-- quem aprova: setor Estratégia ou o Adm
create or replace function public.strategy_can_approve(p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.agency_can(p_agency, 'admin')
    or exists (select 1 from public.agency_members m join public.agencies a on a.id = m.agency_id and a.status = 'active'
               where m.agency_id = p_agency and m.user_id = auth.uid() and m.revoked_at is null and 'estrategia' = any (m.sectors)))
$$;
revoke execute on function public.strategy_can_approve(uuid) from public, anon;
grant execute on function public.strategy_can_approve(uuid) to authenticated, service_role;

-- criar/editar (qualquer membro cria; edita quem escreveu enquanto é ideia/em análise, ou quem aprova/gestor+ até enviar)
create or replace function public.strategy_idea_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; x public.strategy_ideas%rowtype; v_month date; v_brand uuid; v_label text; v_segment uuid; v_talent uuid; v_event uuid;
        v_on date; v_title text; v_body text; v_ai boolean; v_ev_start date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if v_id is not null then
    select * into x from public.strategy_ideas where id = v_id and agency_id = p_agency for update;
    if x.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if x.status = 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if not (public.strategy_can_approve(p_agency) or public.agency_can(p_agency, 'manager') or (x.author_id = auth.uid() and x.status in ('idea', 'review'))) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  begin
    v_month := date_trunc('month', coalesce(nullif(btrim(coalesce(p_data ->> 'month', '')), '')::date, x.month,
                 (now() at time zone coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo'))::date))::date;
    v_brand := nullif(btrim(coalesce(p_data ->> 'brand_id', '')), '')::uuid;
    v_label := regexp_replace(btrim(coalesce(p_data ->> 'brand_label', '')), '\s+', ' ', 'g');
    v_segment := nullif(btrim(coalesce(p_data ->> 'segment_id', '')), '')::uuid;
    v_talent := nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid;
    v_event := nullif(btrim(coalesce(p_data ->> 'calendar_event_id', '')), '')::uuid;
    v_on := nullif(btrim(coalesce(p_data ->> 'idea_on', '')), '')::date;
    v_title := regexp_replace(btrim(coalesce(p_data ->> 'title', '')), '\s+', ' ', 'g');
    v_body := btrim(coalesce(p_data ->> 'body', ''));
    v_ai := coalesce((p_data ->> 'ai_assisted')::boolean, x.ai_assisted, false);
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_brand is not null then
    if not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = v_brand) then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_label := '';
  end if;
  if v_segment is not null and not exists (select 1 from public.talent_segments s where s.id = v_segment and s.agency_id = p_agency) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_talent is not null and not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_event is not null then
    select (e.starts_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date into v_ev_start
    from public.calendar_events e where e.id = v_event and e.scope = 'platform' and e.status in ('published', 'scheduled') and e.published_at <= now();
    if v_ev_start is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_on := coalesce(v_on, v_ev_start);
  end if;
  if v_on is not null and (v_on < v_month - 366 or v_on > v_month + 731) then raise exception 'invalid_date' using errcode = '22023'; end if;
  begin
    if v_id is null then
      insert into public.strategy_ideas (agency_id, month, brand_id, brand_label, segment_id, talent_id, calendar_event_id, idea_on, title, body,
                                         author_id, author_label, ai_assisted)
      values (p_agency, v_month, v_brand, v_label, v_segment, v_talent, v_event, v_on, v_title, v_body, auth.uid(), public.actor_label(p_agency), v_ai)
      returning id into v_id;
    else
      update public.strategy_ideas set month = v_month, brand_id = v_brand, brand_label = v_label, segment_id = v_segment, talent_id = v_talent,
        calendar_event_id = v_event, idea_on = v_on, title = v_title, body = v_body, ai_assisted = v_ai
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log(case when p_id is null then 'strategy.create' else 'strategy.update' end, 'strategy_idea', v_id::text,
    case when p_id is null then null else jsonb_build_object('agency_id', p_agency, 'title', x.title, 'status', x.status) end,
    jsonb_build_object('agency_id', p_agency, 'title', v_title, 'month', v_month), null, public.talent_audit_actor('agency', p_agency));
  return v_id;
end $$;
revoke execute on function public.strategy_idea_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.strategy_idea_save(uuid, uuid, jsonb) to authenticated, service_role;

-- mudar a situação: idea→review (quem escreveu, quem aprova, gestor+) · review→approved|idea (quem aprova; devolver pede
-- nota) · approved→ready (membro) · ready→approved (quem aprova). 'sent' só pelo vínculo com a oportunidade.
create or replace function public.strategy_idea_status(p_id uuid, p_status text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare x public.strategy_ideas%rowtype; v_note text := btrim(coalesce(p_note, '')); v_approver boolean; v_n int := 0; u record; v_params jsonb; v_link text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into x from public.strategy_ideas where id = p_id for update;
  if x.id is null or not public.agency_can(x.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_approver := public.strategy_can_approve(x.agency_id);
  if char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_link := '/agencia/estrategias/' || x.id::text;
  v_params := jsonb_build_object('title', left(x.title, 120), 'name', left(public.actor_label(x.agency_id), 80));
  if x.status = 'idea' and p_status = 'review' then
    if not (x.author_id = auth.uid() or v_approver or public.agency_can(x.agency_id, 'manager')) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.strategy_ideas set status = 'review', review_note = '' where id = p_id;
    -- avisa a Estratégia (senão o Adm); quem pediu não recebe o próprio aviso
    for u in select m.user_id from public.agency_members m where m.agency_id = x.agency_id and m.revoked_at is null and 'estrategia' = any (m.sectors)
               and m.user_id <> auth.uid() loop
      if public.inbox_notify(u.user_id, 'internal_approval_requested', v_link, v_params || jsonb_build_object('status', 'strategy_review'),
           x.agency_id, 'agency', x.agency_id, 'strategy_review:' || x.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS') || ':' || u.user_id::text) is not null then
        v_n := v_n + 1;
      end if;
    end loop;
    if v_n = 0 and not exists (select 1 from public.agency_members m where m.agency_id = x.agency_id and m.revoked_at is null and 'estrategia' = any (m.sectors)) then
      perform public.inbox_notify_agency(x.agency_id, 'admin', 'internal_approval_requested', v_link, v_params || jsonb_build_object('status', 'strategy_review'),
        'agency', x.agency_id, 'strategy_review:' || x.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
    end if;
  elsif x.status = 'review' and p_status in ('approved', 'idea') then
    if not v_approver then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_status = 'idea' and char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.strategy_ideas set status = p_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_label = public.actor_label(x.agency_id),
      reviewed_at = now() where id = p_id;
    if x.author_id is not null and x.author_id <> auth.uid() then
      perform public.inbox_notify(x.author_id, 'internal_approval_decided', v_link,
        v_params || jsonb_build_object('status', case when p_status = 'approved' then 'strategy_approved' else 'strategy_returned' end),
        x.agency_id, 'agency', x.agency_id, 'strategy_decided:' || x.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
    end if;
  elsif x.status = 'approved' and p_status = 'ready' then
    update public.strategy_ideas set status = 'ready' where id = p_id;
  elsif x.status = 'ready' and p_status = 'approved' then
    if not v_approver then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.strategy_ideas set status = 'approved' where id = p_id;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  perform public.audit_log('strategy.status', 'strategy_idea', p_id::text, jsonb_build_object('agency_id', x.agency_id, 'status', x.status),
    jsonb_build_object('agency_id', x.agency_id, 'status', p_status), nullif(v_note, ''), public.talent_audit_actor('agency', x.agency_id));
  return p_status;
end $$;
revoke execute on function public.strategy_idea_status(uuid, text, text) from public, anon;
grant execute on function public.strategy_idea_status(uuid, text, text) to authenticated, service_role;

-- ligar a ideia aprovada à oportunidade de patrocínio da agência (gestor+); publicada = enviada
create or replace function public.strategy_idea_link(p_id uuid, p_sponsorship uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare x public.strategy_ideas%rowtype; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into x from public.strategy_ideas where id = p_id for update;
  if x.id is null or not public.agency_can(x.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(x.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if x.status not in ('approved', 'ready') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select s.status into v_status from public.sponsorship_opportunities s where s.id = p_sponsorship and s.agency_id = x.agency_id;
  if v_status is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status = 'cancelled' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.strategy_ideas set sponsorship_id = p_sponsorship,
    status = case when v_status <> 'draft' then 'sent' else status end,
    sent_at = case when v_status <> 'draft' then now() else sent_at end
  where id = p_id;
  perform public.audit_log('strategy.link', 'strategy_idea', p_id::text, jsonb_build_object('agency_id', x.agency_id, 'sponsorship_id', x.sponsorship_id),
    jsonb_build_object('agency_id', x.agency_id, 'sponsorship_id', p_sponsorship), null, public.talent_audit_actor('agency', x.agency_id));
  return case when v_status <> 'draft' then 'sent' else x.status end;
end $$;
revoke execute on function public.strategy_idea_link(uuid, uuid) from public, anon;
grant execute on function public.strategy_idea_link(uuid, uuid) to authenticated, service_role;

-- excluir: quem escreveu (ainda ideia) ou quem aprova/gestor+ (antes de enviar)
create or replace function public.strategy_idea_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.strategy_ideas%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into x from public.strategy_ideas where id = p_id for update;
  if x.id is null or not public.agency_can(x.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if x.status = 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if not (public.strategy_can_approve(x.agency_id) or public.agency_can(x.agency_id, 'manager') or (x.author_id = auth.uid() and x.status = 'idea')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.strategy_ideas where id = p_id;
  perform public.audit_log('strategy.delete', 'strategy_idea', p_id::text, jsonb_build_object('agency_id', x.agency_id, 'title', x.title, 'status', x.status),
    null, null, public.talent_audit_actor('agency', x.agency_id));
end $$;
revoke execute on function public.strategy_idea_delete(uuid) from public, anon;
grant execute on function public.strategy_idea_delete(uuid) to authenticated, service_role;

-- oportunidade publicada → ideias ligadas viram "enviada"
create or replace function public.sponsorship_strategy_sent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('open', 'closed', 'sponsored') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.strategy_ideas set status = 'sent', sent_at = now() where sponsorship_id = new.id and status in ('approved', 'ready');
  end if;
  return null;
end $$;
revoke execute on function public.sponsorship_strategy_sent() from public, anon, authenticated;
drop trigger if exists trg_sponsorship_strategy_sent on public.sponsorship_opportunities;
create trigger trg_sponsorship_strategy_sent after update of status on public.sponsorship_opportunities
  for each row execute function public.sponsorship_strategy_sent();

-- uma ideia com os nomes (membro da agência); null quando não acha
create or replace function public.strategy_idea_json(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_agency uuid; v_approver boolean; v_manager boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select x.agency_id into v_agency from public.strategy_ideas x where x.id = p_id;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then return null; end if;
  v_approver := public.strategy_can_approve(v_agency);
  v_manager := public.agency_can(v_agency, 'manager');
  select jsonb_build_object('id', x.id, 'month', x.month, 'brand_id', x.brand_id, 'brand', coalesce(b.name, x.brand_label), 'brand_label', x.brand_label,
      'segment_id', x.segment_id, 'segment', sg.name, 'talent_id', x.talent_id, 'talent', tp.display_name,
      'calendar_event_id', x.calendar_event_id, 'event', e.title, 'event_on', (e.starts_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date,
      'idea_on', x.idea_on, 'title', x.title, 'body', x.body, 'status', x.status, 'review_note', x.review_note, 'author_label', x.author_label,
      'reviewed_label', x.reviewed_label, 'reviewed_at', x.reviewed_at, 'sponsorship_id', x.sponsorship_id, 'sponsorship', sp.title,
      'sponsorship_status', sp.status, 'sent_at', x.sent_at, 'ai_assisted', x.ai_assisted, 'created_at', x.created_at, 'updated_at', x.updated_at,
      'mine', x.author_id = auth.uid(),
      'can_edit', x.status <> 'sent' and (v_approver or v_manager or (x.author_id = auth.uid() and x.status in ('idea', 'review'))),
      'can_delete', x.status <> 'sent' and (v_approver or v_manager or (x.author_id = auth.uid() and x.status = 'idea')),
      'can_submit', x.status = 'idea' and (x.author_id = auth.uid() or v_approver or v_manager),
      'can_decide', x.status = 'review' and v_approver,
      'can_ready', x.status = 'approved',
      'can_reopen', x.status = 'ready' and v_approver,
      'can_send', x.status in ('approved', 'ready') and v_manager)
    into v_out
  from public.strategy_ideas x
  left join public.brands b on b.id = x.brand_id
  left join public.talent_segments sg on sg.id = x.segment_id
  left join public.talent_profiles tp on tp.id = x.talent_id
  left join public.calendar_events e on e.id = x.calendar_event_id
  left join public.sponsorship_opportunities sp on sp.id = x.sponsorship_id
  where x.id = p_id;
  return v_out;
end $$;
revoke execute on function public.strategy_idea_json(uuid) from public, anon;
grant execute on function public.strategy_idea_json(uuid) to authenticated, service_role;

-- banco de ideias do mês (ou de todos os meses quando p_month é nulo; até 300)
create or replace function public.strategy_ideas_list(p_agency uuid, p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('can_approve', public.strategy_can_approve(p_agency), 'is_manager', public.agency_can(p_agency, 'manager'),
    'items', (select coalesce(jsonb_agg(public.strategy_idea_json(z.id) order by z.ord, z.updated_at desc), '[]'::jsonb) from (
       select x.id, x.updated_at, array_position(array['review', 'idea', 'approved', 'ready', 'sent'], x.status) as ord
       from public.strategy_ideas x where x.agency_id = p_agency and (p_month is null or x.month = date_trunc('month', p_month)::date)
       order by array_position(array['review', 'idea', 'approved', 'ready', 'sent'], x.status), x.updated_at desc limit 300) z));
end $$;
revoke execute on function public.strategy_ideas_list(uuid, date) from public, anon;
grant execute on function public.strategy_ideas_list(uuid, date) to authenticated, service_role;

-- relatório automático do que o casting postou no período (até 93 dias): posts do app + entregas publicadas na agência
create or replace function public.strategy_casting_report(p_agency uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_from timestamptz; v_to timestamptz; v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then raise exception 'invalid_date' using errcode = '22023'; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo');
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  with talents as (
    select t.id, t.display_name, t.creator_id, t.user_id from public.talent_profiles t where t.agency_id = p_agency and t.archived_at is null
  ), posts as (
    select tl.id as talent_id, c.title, c.slug, c.type::text as type, c.published_at
    from talents tl join public.creator_profiles cp on cp.id = tl.creator_id or (tl.user_id is not null and cp.user_id = tl.user_id)
    join public.content c on c.creator_id = cp.id
    where c.status = 'published' and c.published_at >= v_from and c.published_at < v_to
  ), dels as (
    select x.talent_id, coalesce(nullif(x.title, ''), x.kind) as title, x.kind, x.network, x.published_url, x.published_at, d.title as deal_title, coalesce(b.name, '') as brand
    from public.deliverables x join public.deals d on d.id = x.deal_id left join public.brands b on b.id = x.brand_id
    where x.agency_id = p_agency and x.published_at >= v_from and x.published_at < v_to and x.status in ('published', 'proof_submitted', 'done')
  ), per as (
    select tl.id, tl.display_name,
      (select count(*) from posts p where p.talent_id = tl.id) as n_posts,
      (select count(*) from dels x where x.talent_id = tl.id) as n_dels,
      (select coalesce(jsonb_agg(jsonb_build_object('title', p.title, 'slug', p.slug, 'type', p.type, 'published_at', p.published_at) order by p.published_at desc), '[]'::jsonb)
         from (select * from posts p where p.talent_id = tl.id order by p.published_at desc limit 20) p) as posts,
      (select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'kind', x.kind, 'network', x.network, 'url', x.published_url, 'published_at', x.published_at,
                 'deal', x.deal_title, 'brand', x.brand) order by x.published_at desc), '[]'::jsonb)
         from (select * from dels x where x.talent_id = tl.id order by x.published_at desc limit 20) x) as deliverables,
      (select coalesce(jsonb_agg(s.name order by s.sort_order, s.name), '[]'::jsonb) from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
         where l.talent_id = tl.id) as segments
    from talents tl
  )
  select coalesce(jsonb_agg(jsonb_build_object('talent_id', p.id, 'name', p.display_name, 'segments', p.segments, 'posts_count', p.n_posts,
           'deliverables_count', p.n_dels, 'posts', p.posts, 'deliverables', p.deliverables) order by p.n_posts + p.n_dels desc, p.display_name), '[]'::jsonb)
    into v_rows
  from (select * from per order by n_posts + n_dels desc, display_name limit 300) p;
  return jsonb_build_object('from', p_from, 'to', p_to, 'talents', v_rows,
    'totals', jsonb_build_object('talents', jsonb_array_length(v_rows),
      'active', (select count(*) from jsonb_array_elements(v_rows) e where (e ->> 'posts_count')::int + (e ->> 'deliverables_count')::int > 0),
      'posts', (select coalesce(sum((e ->> 'posts_count')::int), 0) from jsonb_array_elements(v_rows) e),
      'deliverables', (select coalesce(sum((e ->> 'deliverables_count')::int), 0) from jsonb_array_elements(v_rows) e)));
end $$;
revoke execute on function public.strategy_casting_report(uuid, date, date) from public, anon;
grant execute on function public.strategy_casting_report(uuid, date, date) to authenticated, service_role;

-- 5) indicadores: nova venda (D4) -----------------------------------------------------------------------------------------
create or replace function public.agency_growth_indicators(p_agency uuid, p_days int default 180)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_from := now() - make_interval(days => greatest(least(coalesce(p_days, 180), 730), 30));
  with won as (
    select w.id, w.title, w.brand_id, w.client_talent_id, coalesce(w.closed_at, w.stage_changed_at) as closed_at, s.name as service
    from public.deals w left join public.agency_services s on s.id = w.service_id
    where w.agency_id = p_agency and w.stage = 'closed' and w.outcome = 'won' and coalesce(w.closed_at, w.stage_changed_at) >= v_from
  ), nx as (
    select w.*,
      exists (select 1 from public.deals n where n.agency_id = p_agency and n.origin_deal_id = w.id) as linked,
      exists (select 1 from public.deals n where n.agency_id = p_agency and n.id <> w.id and (n.origin_deal_id = w.id
                or (n.created_at >= w.closed_at and n.created_at < w.closed_at + interval '180 days'
                    and ((w.brand_id is not null and n.brand_id = w.brand_id) or (w.client_talent_id is not null and n.client_talent_id = w.client_talent_id))))) as has_next
    from won w
  )
  select jsonb_build_object('from', v_from, 'won', (select count(*) from nx), 'with_next', (select count(*) from nx where has_next),
    'linked', (select count(*) from nx where linked),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('service', z.service, 'won', z.won, 'with_next', z.with_next) order by z.won desc, z.service), '[]'::jsonb)
                 from (select coalesce(service, '') as service, count(*) as won, count(*) filter (where has_next) as with_next from nx group by coalesce(service, '')) z),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'origin_id', o.id, 'origin', o.title, 'created_at', n.created_at)
                 order by n.created_at desc), '[]'::jsonb)
               from (select * from public.deals n where n.agency_id = p_agency and n.origin_deal_id is not null order by n.created_at desc limit 5) n
               join public.deals o on o.id = n.origin_deal_id))
    into v_out;
  return v_out;
end $$;
revoke execute on function public.agency_growth_indicators(uuid, int) from public, anon;
grant execute on function public.agency_growth_indicators(uuid, int) to authenticated, service_role;

-- 6) condições de pagamento do herói-cliente (D5) -----------------------------------------------------------------------
alter table public.financial_entries alter column brand_id drop not null;
alter table public.financial_entries drop constraint if exists financial_entries_kind_check;
alter table public.financial_entries add constraint financial_entries_kind_check check (kind in ('brand_receivable', 'commission', 'talent_payout', 'client_receivable'));
alter table public.financial_entries drop constraint if exists financial_entries_client_check;
alter table public.financial_entries add constraint financial_entries_client_check check (
  (kind <> 'client_receivable' or (brand_id is null and talent_id is not null and deal_talent_id is null))
  and (brand_id is not null or kind in ('client_receivable', 'commission', 'talent_payout')));
alter table public.brand_payment_installments alter column brand_id drop not null;
-- o herói lê só pela RPC (client_payments); a política do herói continua só para os repasses dele

-- escreve os lançamentos do plano (MESMA assinatura da 0108): sem marca, o a receber é do herói-cliente
create or replace function public.deal_payment_write(p_deal uuid, p_total bigint, p_plan jsonb, p_status text)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_effective boolean := p_status <> 'forecast'; v_fees bigint; v_comm bigint; v_rate int; ev jsonb; v_parts jsonb;
        v_first date; v_last date; v_pay date; v_recv uuid; v_n int := 0; v_check bigint; r record; v_agency_rate int; v_pay_rule boolean; v_kind text;
begin
  select * into d from public.deals where id = p_deal;
  v_kind := case when d.brand_id is null then 'client_receivable' else 'brand_receivable' end;
  if d.brand_id is null and d.client_talent_id is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  v_fees := public.deal_payment_fees(p_deal, v_effective);
  if p_total < v_fees then raise exception 'agreed_below_payouts' using errcode = 'P0001'; end if;
  ev := public.deal_payment_events(p_deal);
  v_parts := public.payment_plan_parts(p_plan, p_total, (ev ->> 'signature')::date, (ev ->> 'delivery')::date, (ev ->> 'publication')::date);
  select min((x ->> 'due_on')::date), max((x ->> 'due_on')::date) into v_first, v_last from jsonb_array_elements(v_parts) x;
  v_pay := public.payment_plan_payout_due(p_plan, v_last, (ev ->> 'delivery')::date);
  v_pay_rule := p_plan ->> 'payout_rule' <> 'fixed_date';
  v_comm := p_total - v_fees;
  select coalesce(d.service_rate_bp, a.service_rate_bp, 0) into v_agency_rate from public.agencies a where a.id = d.agency_id;
  v_rate := case when v_fees > 0 then least(5000, greatest(0, round(v_comm * 10000.0 / v_fees)))::int else least(v_agency_rate, 5000) end;
  for r in select dt.id, dt.talent_id, coalesce(f.fee_cents, 0) as fee
           from public.deal_talents dt left join public.deal_talent_fees f on f.deal_talent_id = dt.id
           where dt.deal_id = p_deal and ((v_effective and dt.status = 'contracted') or (not v_effective and dt.status in ('proposed', 'contracted') and f.fee_cents is not null))
           order by dt.created_at loop
    insert into public.financial_entries (agency_id, brand_id, deal_id, talent_id, deal_talent_id, kind, amount_cents, rate_bp, status, due_on, from_plan, created_by)
    values (d.agency_id, d.brand_id, p_deal, r.talent_id, r.id, 'talent_payout', r.fee, v_rate, p_status, v_pay, v_pay_rule, auth.uid())
    on conflict (deal_id, kind, deal_talent_id) do nothing;
    v_n := v_n + 1;
  end loop;
  insert into public.financial_entries (agency_id, brand_id, deal_id, talent_id, kind, amount_cents, rate_bp, status, due_on, from_plan, created_by)
  values (d.agency_id, d.brand_id, p_deal, case when v_kind = 'client_receivable' then d.client_talent_id end, v_kind, p_total, v_rate, p_status, v_first, true, auth.uid())
  on conflict (deal_id, kind, deal_talent_id) do nothing returning id into v_recv;
  if v_recv is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  insert into public.financial_entries (agency_id, brand_id, deal_id, kind, amount_cents, rate_bp, status, due_on, from_plan, created_by)
  values (d.agency_id, d.brand_id, p_deal, 'commission', v_comm, v_rate, p_status, v_last, true, auth.uid())
  on conflict (deal_id, kind, deal_talent_id) do nothing;
  delete from public.brand_payment_installments i where i.entry_id = v_recv;
  insert into public.brand_payment_installments (agency_id, brand_id, deal_id, entry_id, seq, label, amount_cents, due_on, from_plan)
  select d.agency_id, d.brand_id, p_deal, v_recv, (x ->> 'seq')::int, '', (x ->> 'amount_cents')::bigint, (x ->> 'due_on')::date, true
  from jsonb_array_elements(v_parts) x;
  -- identidade: o que o cliente paga = comissão + repasses
  select coalesce(sum(case when kind in ('brand_receivable', 'client_receivable') then amount_cents else -amount_cents end), 0) into v_check
  from public.financial_entries where deal_id = p_deal and status = p_status;
  if v_check <> 0 then raise exception 'finance_identity' using errcode = 'P0001'; end if;
  return v_n + 2;
end $$;
revoke execute on function public.deal_payment_write(uuid, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.deal_payment_write(uuid, bigint, jsonb, text) to service_role;

-- previsto (MESMA assinatura da 0108): também para o herói-cliente
create or replace function public.deal_payment_forecast(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; pl public.deal_payment_plans%rowtype; v_n int := 0;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or public.deal_payment_effective(p_deal) then return 0; end if;
  delete from public.financial_entries f where f.deal_id = p_deal and (f.status = 'forecast'
    or (f.status = 'cancelled' and f.settled_at is null and f.note in ('deal_lost', 'deal_cancelled')));
  if d.stage = 'closed' or (d.brand_id is null and d.client_talent_id is null) then return 0; end if;
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  if pl.deal_id is null then return 0; end if;
  begin
    v_n := public.deal_payment_write(p_deal, pl.total_cents, pl.plan, 'forecast');
  exception when others then v_n := 0;
  end;
  return v_n;
end $$;
revoke execute on function public.deal_payment_forecast(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_forecast(uuid) to service_role;

-- salvar as condições (MESMA assinatura da 0108): negócio só do herói passa (o herói é avisado, sem a comissão)
create or replace function public.agency_payment_plan_save(p_deal uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_total bigint; v_plan jsonb; v_tz text; v_today date; v_day date; v_before public.deal_payment_plans%rowtype;
        v_version int; v_n int; v_parts int; v_brand text; v_user uuid;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  if d.brand_id is null and d.client_talent_id is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if public.deal_payment_effective(p_deal) then raise exception 'plan_locked' using errcode = 'P0001'; end if;
  begin
    v_total := nullif(btrim(coalesce(p_data ->> 'total_cents', '')), '')::bigint;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_total is null or v_total < 1 or v_total > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_plan := public.payment_plan_clean(p_data -> 'plan');
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = d.agency_id;
  v_today := (now() at time zone v_tz)::date;
  for v_day in select x::date from (
      select v_plan ->> 'first_on' as x union all select v_plan ->> 'balance_on' union all select v_plan ->> 'payout_on'
      union all select jsonb_array_elements_text(case when jsonb_typeof(v_plan -> 'dates') = 'array' then v_plan -> 'dates' else '[]'::jsonb end)) s
    where x is not null loop
    if v_day < v_today - 366 or v_day > v_today + 731 then raise exception 'invalid_date' using errcode = '22023'; end if;
  end loop;
  if v_total < public.deal_payment_fees(p_deal, false) then raise exception 'agreed_below_payouts' using errcode = 'P0001'; end if;
  select * into v_before from public.deal_payment_plans where deal_id = p_deal;
  if v_before.deal_id is not null and v_before.total_cents = v_total and v_before.plan = v_plan then
    return jsonb_build_object('version', v_before.version, 'changed', false, 'forecast', public.deal_payment_forecast(p_deal));
  end if;
  insert into public.deal_payment_plans (deal_id, agency_id, brand_id, total_cents, plan, version, updated_by, updated_label)
  values (p_deal, d.agency_id, d.brand_id, v_total, v_plan, 1, auth.uid(), public.actor_label(d.agency_id))
  on conflict (deal_id) do update set total_cents = excluded.total_cents, plan = excluded.plan, brand_id = excluded.brand_id,
    version = public.deal_payment_plans.version + 1, updated_by = excluded.updated_by, updated_label = excluded.updated_label
  returning version into v_version;
  perform public.audit_log('finance.payment_plan', 'deal', p_deal::text,
    case when v_before.deal_id is null then null else jsonb_build_object('agency_id', d.agency_id, 'total_cents', v_before.total_cents, 'plan', v_before.plan) end,
    jsonb_build_object('agency_id', d.agency_id, 'total_cents', v_total, 'plan', v_plan, 'version', v_version), null, public.talent_audit_actor('agency', d.agency_id));
  v_n := public.deal_payment_forecast(p_deal);
  v_parts := jsonb_array_length(public.payment_plan_parts(v_plan, v_total, v_today, v_today, v_today));
  if d.brand_id is not null and d.brand_visible then
    select b.name into v_brand from public.brands b where b.id = d.brand_id;
    perform public.inbox_notify_brand(d.brand_id, false, 'payment_plan', '/marca/pagamentos', jsonb_build_object('deal', left(d.title, 120), 'step', v_parts::text),
      d.agency_id, 'deal', d.id, 'payment_plan:' || d.id::text || ':' || v_version::text);
  elsif d.brand_id is null then
    v_user := public.talent_user_id(d.client_talent_id);
    perform public.inbox_notify(v_user, 'payment_plan', '/heroi/projetos/' || d.id::text, jsonb_build_object('deal', left(d.title, 120), 'step', v_parts::text),
      d.agency_id, 'deal', d.id, 'payment_plan:' || d.id::text || ':' || v_version::text);
  end if;
  return jsonb_build_object('version', v_version, 'changed', true, 'forecast', v_n);
end $$;
revoke execute on function public.agency_payment_plan_save(uuid, jsonb) from public, anon;
grant execute on function public.agency_payment_plan_save(uuid, jsonb) to authenticated, service_role;

-- efetivar a cobrança do herói-cliente (Adm): o previsto vira em aberto com as datas do plano
create or replace function public.agency_client_billing_confirm(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; pl public.deal_payment_plans%rowtype; v_n int; v_user uuid;
begin
  v_agency := public.deal_write_scope(p_deal, false);
  if not public.agency_can(v_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal for update;
  if d.brand_id is not null or d.client_talent_id is null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if public.deal_payment_effective(p_deal) then raise exception 'plan_locked' using errcode = 'P0001'; end if;
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  if pl.deal_id is null then raise exception 'payment_terms_required' using errcode = 'P0001'; end if;
  delete from public.financial_entries f where f.deal_id = p_deal and (f.status = 'forecast'
    or (f.status = 'cancelled' and f.settled_at is null and f.note in ('deal_lost', 'deal_cancelled')));
  v_n := public.deal_payment_write(p_deal, pl.total_cents, pl.plan, 'planned');
  perform public.audit_log('finance.client_billing', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', v_agency, 'total_cents', pl.total_cents, 'entries', v_n), null, public.talent_audit_actor('agency', v_agency));
  v_user := public.talent_user_id(d.client_talent_id);
  perform public.inbox_notify(v_user, 'payment_plan', '/heroi/projetos/' || d.id::text,
    jsonb_build_object('deal', left(d.title, 120), 'step', (select count(*)::text from public.brand_payment_installments i join public.financial_entries f on f.id = i.entry_id
                                                             where f.deal_id = p_deal and f.kind = 'client_receivable' and f.status <> 'cancelled')),
    d.agency_id, 'deal', d.id, 'payment_plan:' || d.id::text || ':confirmed');
  return v_n;
end $$;
revoke execute on function public.agency_client_billing_confirm(uuid) from public, anon;
grant execute on function public.agency_client_billing_confirm(uuid) to authenticated, service_role;

-- parcela do herói-cliente recebida (ou desfeita) pelo Adm; todas recebidas → lançamento quitado
create or replace function public.agency_client_installment_paid(p_installment uuid, p_paid boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare i public.brand_payment_installments%rowtype; e public.financial_entries%rowtype; v_open int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into i from public.brand_payment_installments where id = p_installment for update;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.financial_entries where id = i.entry_id for update;
  if not public.agency_can(e.agency_id, 'admin') then
    if public.agency_can(e.agency_id, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.kind <> 'client_receivable' or e.status not in ('planned', 'due', 'settled') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if coalesce(p_paid, false) then
    if i.status = 'paid' then return 'paid'; end if;
    update public.brand_payment_installments set status = 'paid', paid_at = now(), paid_by = auth.uid() where id = i.id;
  else
    if i.status = 'open' then return 'open'; end if;
    update public.brand_payment_installments set status = 'open', paid_at = null, paid_by = null where id = i.id;
  end if;
  select count(*) into v_open from public.brand_payment_installments x where x.entry_id = e.id and x.status = 'open';
  if v_open = 0 and e.status <> 'settled' then
    update public.financial_entries set status = 'settled', settled_at = now(), settled_by = auth.uid() where id = e.id;
    update public.financial_entries set status = 'settled', settled_at = now(), settled_by = auth.uid()
    where deal_id = e.deal_id and kind = 'commission' and status in ('planned', 'due');
  elsif v_open > 0 and e.status = 'settled' then
    update public.financial_entries set status = 'planned', settled_at = null, settled_by = null where id = e.id;
    update public.financial_entries set status = 'planned', settled_at = null, settled_by = null
    where deal_id = e.deal_id and kind = 'commission' and status = 'settled';
  end if;
  update public.financial_entries set due_on = (select min(x.due_on) from public.brand_payment_installments x where x.entry_id = e.id and x.status = 'open')
  where id = e.id and v_open > 0;
  perform public.audit_log('finance.client_installment', 'brand_payment_installment', i.id::text,
    jsonb_build_object('agency_id', e.agency_id, 'status', i.status), jsonb_build_object('agency_id', e.agency_id, 'status', case when p_paid then 'paid' else 'open' end),
    null, public.talent_audit_actor('agency', e.agency_id));
  return case when coalesce(p_paid, false) then 'paid' else 'open' end;
end $$;
revoke execute on function public.agency_client_installment_paid(uuid, boolean) from public, anon;
grant execute on function public.agency_client_installment_paid(uuid, boolean) to authenticated, service_role;

-- parcelas de um a receber do herói-cliente (interna)
create or replace function public.client_receivable_json(p_entry uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('entry_id', f.id, 'deal_id', f.deal_id, 'title', d.title, 'talent_id', f.talent_id, 'talent_name', t.display_name,
    'agency_id', f.agency_id, 'agency_name', a.name, 'total_cents', f.amount_cents, 'entry_status', f.status, 'due_on', f.due_on, 'settled_at', f.settled_at,
    'plan', case when p.deal_id is null then null else jsonb_build_object('method', p.plan ->> 'method', 'method_note', p.plan ->> 'method_note',
              'structure', p.plan ->> 'structure', 'invoice_agency', (p.plan ->> 'invoice_agency')::boolean, 'notes', p.plan ->> 'notes') end,
    'installments', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'seq', i.seq, 'amount_cents', i.amount_cents, 'due_on', i.due_on,
        'status', case when f.status = 'settled' then 'paid' else i.status end, 'paid_at', coalesce(i.paid_at, f.settled_at)) order by i.seq), '[]'::jsonb)
      from public.brand_payment_installments i where i.entry_id = f.id))
  from public.financial_entries f join public.deals d on d.id = f.deal_id join public.agencies a on a.id = f.agency_id
  join public.talent_profiles t on t.id = f.talent_id
  left join public.deal_payment_plans p on p.deal_id = f.deal_id
  where f.id = p_entry and f.kind = 'client_receivable'
$$;
revoke execute on function public.client_receivable_json(uuid) from public, anon, authenticated;
grant execute on function public.client_receivable_json(uuid) to service_role;

-- "a pagar" do herói-cliente (só os dele; previsto aparece como previsto; sem comissão nem nada interno)
create or replace function public.client_payments()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id();
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(public.client_receivable_json(f.id) order by f.due_on nulls last, f.created_at), '[]'::jsonb)
          from public.financial_entries f join public.agencies a on a.id = f.agency_id and a.status = 'active'
          where f.kind = 'client_receivable' and f.talent_id = v_talent and f.status <> 'cancelled');
end $$;
revoke execute on function public.client_payments() from public, anon;
grant execute on function public.client_payments() to authenticated, service_role;

-- "a receber" dos heróis-clientes para o Adm da agência
create or replace function public.agency_client_receivables(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return (select coalesce(jsonb_agg(public.client_receivable_json(f.id) order by (f.status = 'settled'), f.due_on nulls last, f.created_at), '[]'::jsonb)
          from public.financial_entries f where f.agency_id = p_agency and f.kind = 'client_receivable' and f.status <> 'cancelled');
end $$;
revoke execute on function public.agency_client_receivables(uuid) from public, anon;
grant execute on function public.agency_client_receivables(uuid) to authenticated, service_role;

-- datas relativas no cron (MESMA assinatura da 0108): o a receber do herói-cliente também acompanha
create or replace function public.deal_payment_refresh(p_deal uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare pl public.deal_payment_plans%rowtype; recv public.financial_entries%rowtype; ev jsonb; v_parts jsonb; v_n int := 0; v_k int; v_last date;
        v_received date; v_pay date; v_tz text;
begin
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  if pl.deal_id is null then return 0; end if;
  if not public.deal_payment_effective(p_deal) then return public.deal_payment_forecast(p_deal); end if;
  select * into recv from public.financial_entries f where f.deal_id = p_deal and f.kind in ('brand_receivable', 'client_receivable') and f.status in ('planned', 'due') and f.from_plan;
  ev := public.deal_payment_events(p_deal);
  if recv.id is not null and not exists (select 1 from public.brand_payment_installments i where i.entry_id = recv.id and not i.from_plan) then
    v_parts := public.payment_plan_parts(pl.plan, recv.amount_cents, (ev ->> 'signature')::date, (ev ->> 'delivery')::date, (ev ->> 'publication')::date);
    with upd as (
      update public.brand_payment_installments i set due_on = (x ->> 'due_on')::date
      from jsonb_array_elements(v_parts) x
      where i.entry_id = recv.id and i.seq = (x ->> 'seq')::int and i.amount_cents = (x ->> 'amount_cents')::bigint and i.status = 'open'
        and i.due_on is distinct from (x ->> 'due_on')::date
        and not exists (select 1 from public.brand_payment_reports r where r.installment_id = i.id and r.status = 'reported')
      returning 1)
    select count(*) into v_k from upd;
    v_n := v_n + v_k;
    update public.financial_entries set due_on = (select min(i.due_on) from public.brand_payment_installments i where i.entry_id = recv.id and i.status = 'open')
    where id = recv.id and exists (select 1 from public.brand_payment_installments i where i.entry_id = recv.id and i.status = 'open');
  end if;
  select coalesce(a.timezone, 'America/Sao_Paulo') into v_tz from public.agencies a where a.id = pl.agency_id;
  select max(i.due_on), case when bool_and(i.status = 'paid') then max((i.paid_at at time zone v_tz)::date) end into v_last, v_received
  from public.brand_payment_installments i join public.financial_entries f on f.id = i.entry_id
  where f.deal_id = p_deal and f.kind in ('brand_receivable', 'client_receivable') and f.status <> 'cancelled';
  v_pay := public.payment_plan_payout_due(pl.plan, coalesce(v_received, v_last), (ev ->> 'delivery')::date);
  if v_pay is not null then
    with upd as (
      update public.financial_entries set due_on = v_pay
      where deal_id = p_deal and kind = 'talent_payout' and from_plan and status in ('planned', 'due') and scheduled_on is null and due_on is distinct from v_pay
      returning 1)
    select count(*) into v_k from upd;
    v_n := v_n + v_k;
  end if;
  return v_n;
end $$;
revoke execute on function public.deal_payment_refresh(uuid) from public, anon, authenticated;
grant execute on function public.deal_payment_refresh(uuid) to service_role;

-- resumo do Adm (MESMA assinatura da 0108): o a receber do herói-cliente entra no "a receber"
create or replace function public.agency_finance_summary(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date;
begin
  if not public.agency_can(p_agency, 'admin') then
    if public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date into v_today from public.agencies a where a.id = p_agency;
  return (select jsonb_build_object(
    'receivable_open_cents', coalesce(sum(amount_cents) filter (where kind in ('brand_receivable', 'client_receivable') and status in ('planned', 'due')), 0),
    'receivable_settled_cents', coalesce(sum(amount_cents) filter (where kind in ('brand_receivable', 'client_receivable') and status = 'settled'), 0),
    'commission_open_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status in ('planned', 'due')), 0),
    'commission_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status = 'settled'), 0),
    'payout_open_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status in ('planned', 'due')), 0),
    'payout_settled_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status = 'settled'), 0),
    'receivable_forecast_cents', coalesce(sum(amount_cents) filter (where kind in ('brand_receivable', 'client_receivable') and status = 'forecast'), 0),
    'payout_forecast_cents', coalesce(sum(amount_cents) filter (where kind = 'talent_payout' and status = 'forecast'), 0),
    'commission_forecast_cents', coalesce(sum(amount_cents) filter (where kind = 'commission' and status = 'forecast'), 0),
    'overdue_count', count(*) filter (where status in ('planned', 'due') and coalesce(scheduled_on, due_on) < coalesce(v_today, current_date)),
    'open_count', count(*) filter (where status in ('planned', 'due')),
    'forecast_count', count(*) filter (where status = 'forecast'),
    'deals', count(distinct deal_id) filter (where status <> 'cancelled'))
  from public.financial_entries where agency_id = p_agency);
end $$;
revoke execute on function public.agency_finance_summary(uuid) from public, anon;
grant execute on function public.agency_finance_summary(uuid) to authenticated, service_role;

-- leitura por quem vê (MESMA assinatura da 0108): + herói-cliente ('client': total e parcelas, sem comissão nem repasses)
create or replace function public.deal_payment_plan_json(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_viewer text; v_values boolean := false; v_dt public.deal_talents%rowtype; pl public.deal_payment_plans%rowtype;
        v_eff boolean; recv public.financial_entries%rowtype; ev jsonb; v_parts jsonb; v_fees bigint; v_last date; v_pay date; v_status text;
        v_live public.deal_terms%rowtype; snap public.deal_terms_payments%rowtype; v_pending boolean := false; o jsonb; v_plan jsonb; my public.financial_entries%rowtype;
        v_client boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_client := d.brand_id is null and d.client_talent_id is not null;
  if public.agency_can(d.agency_id, 'manager') or (public.agency_can(d.agency_id, 'staff') and d.id = any (public.my_staff_deal_ids())) then
    v_viewer := 'agency'; v_values := public.agency_can(d.agency_id, 'admin');
  elsif d.brand_visible and d.brand_id is not null and public.brand_member_of(d.brand_id) is not null then
    v_viewer := 'brand'; v_values := true;
  elsif v_client and d.client_talent_id = public.my_talent_id() and (d.outcome is null or d.outcome = 'won') then
    v_viewer := 'client'; v_values := true;
  else
    select * into v_dt from public.deal_talents x where x.deal_id = p_deal and x.talent_id = public.my_talent_owner_id() and x.status in ('proposed', 'contracted');
    if v_dt.id is not null then v_viewer := 'talent'; v_values := true; end if;
  end if;
  if v_viewer is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into pl from public.deal_payment_plans where deal_id = p_deal;
  v_eff := public.deal_payment_effective(p_deal);
  select * into recv from public.financial_entries f where f.deal_id = p_deal and f.kind in ('brand_receivable', 'client_receivable') and f.status <> 'cancelled';
  ev := public.deal_payment_events(p_deal);
  if recv.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seq', i.seq, 'amount_cents', i.amount_cents, 'due_on', i.due_on, 'label', i.label,
             'status', case when recv.status = 'settled' then 'paid' else i.status end) order by i.seq), '[]'::jsonb)
      into v_parts from public.brand_payment_installments i where i.entry_id = recv.id;
  elsif pl.deal_id is not null then
    v_parts := public.payment_plan_parts(pl.plan, pl.total_cents, (ev ->> 'signature')::date, (ev ->> 'delivery')::date, (ev ->> 'publication')::date);
  else v_parts := '[]'::jsonb;
  end if;
  select max((x ->> 'due_on')::date) into v_last from jsonb_array_elements(v_parts) x;
  v_status := case when v_eff then 'effective' when recv.status = 'forecast' then 'forecast' when pl.deal_id is not null then 'saved' else 'none' end;
  select * into v_live from public.deal_terms t where t.deal_id = p_deal and t.status in ('sent', 'accepted') order by t.version desc limit 1;
  if v_live.id is not null and pl.deal_id is not null and not v_eff then
    select * into snap from public.deal_terms_payments s where s.terms_id = v_live.id;
    v_pending := snap.terms_id is null or snap.total_cents <> pl.total_cents or snap.plan <> pl.plan;
  end if;
  o := jsonb_build_object('enabled', d.brand_id is not null or v_client, 'client', v_client, 'viewer', v_viewer, 'values', v_values, 'status', v_status,
    'has_plan', pl.deal_id is not null, 'locked', v_eff, 'version', pl.version, 'updated_at', pl.updated_at, 'events', ev);
  if v_viewer = 'agency' then
    v_fees := public.deal_payment_fees(p_deal, v_eff);
    o := o || jsonb_build_object('plan', pl.plan, 'terms_pending', v_pending, 'stage', d.stage,
      'can_edit', v_values and not v_eff and d.stage <> 'closed' and (d.brand_id is not null or v_client),
      'can_confirm', v_values and v_client and not v_eff and d.stage <> 'closed' and pl.deal_id is not null,
      'agreed', coalesce((public.deal_offer_state(p_deal) ->> 'agreed')::boolean, false),
      'parts', case when v_values then v_parts else (select coalesce(jsonb_agg(x - 'amount_cents'), '[]'::jsonb) from jsonb_array_elements(v_parts) x) end);
    if v_values then
      o := o || jsonb_build_object('total_cents', pl.total_cents, 'updated_label', pl.updated_label, 'suggested', public.deal_payment_suggested(p_deal),
        'payouts_cents', v_fees, 'commission_cents', case when pl.deal_id is null then null else pl.total_cents - v_fees end,
        'ok', pl.deal_id is null or pl.total_cents >= v_fees,
        'payout_due_on', case when pl.deal_id is null then null else public.payment_plan_payout_due(pl.plan, v_last, (ev ->> 'delivery')::date) end,
        'payouts', (select coalesce(jsonb_agg(jsonb_build_object('deal_talent_id', dt.id, 'name', t.display_name, 'status', dt.status, 'fee_cents', f.fee_cents,
                      'entry_status', e.status, 'due_on', e.due_on, 'scheduled_on', e.scheduled_on) order by dt.created_at), '[]'::jsonb)
                    from public.deal_talents dt join public.talent_profiles t on t.id = dt.talent_id
                    left join public.deal_talent_fees f on f.deal_talent_id = dt.id
                    left join public.financial_entries e on e.deal_talent_id = dt.id and e.kind = 'talent_payout' and e.status <> 'cancelled'
                    where dt.deal_id = p_deal and dt.status in ('proposed', 'contracted')));
    end if;
  elsif v_viewer in ('brand', 'client') then
    v_plan := case when pl.deal_id is null then null else pl.plan - 'payout_rule' - 'payout_days' - 'payout_on' - 'payout_method' - 'invoice_talent' end;
    o := o || jsonb_build_object('plan', v_plan, 'total_cents', pl.total_cents, 'parts', case when pl.deal_id is null and recv.id is null then '[]'::jsonb else v_parts end,
      'request_id', d.request_id);
  else
    select * into my from public.financial_entries f where f.deal_talent_id = v_dt.id and f.kind = 'talent_payout' and f.status <> 'cancelled';
    v_pay := case when pl.deal_id is null then null else public.payment_plan_payout_due(pl.plan, v_last, (ev ->> 'delivery')::date) end;
    o := o || jsonb_build_object('plan', case when pl.deal_id is null then null else jsonb_build_object('payout_rule', pl.plan ->> 'payout_rule',
        'payout_days', (pl.plan ->> 'payout_days')::int, 'payout_on', pl.plan ->> 'payout_on', 'payout_method', pl.plan ->> 'payout_method',
        'invoice_talent', (pl.plan ->> 'invoice_talent')::boolean) end,
      'my_payout', jsonb_build_object('deal_talent_id', v_dt.id,
        'amount_cents', coalesce(my.amount_cents, (select f.fee_cents from public.deal_talent_fees f where f.deal_talent_id = v_dt.id)),
        'status', my.status, 'due_on', coalesce(my.scheduled_on, my.due_on, v_pay), 'entry_id', my.id));
  end if;
  return o;
end $$;
revoke execute on function public.deal_payment_plan_json(uuid) from public, anon;
grant execute on function public.deal_payment_plan_json(uuid) to authenticated, service_role;
