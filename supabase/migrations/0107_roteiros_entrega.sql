-- =============================================================================
-- Groscove Ultra · 0107 · Roteiros de entrega — FASE 1 (organizar a operação) · cenário S113
-- Fonte: PDF "Nosso processo de entrega 2027" (8 produtos, 4 setores fixos, prazos em dias úteis) e a especificação
-- aprovada pelo responsável ("está tudo autorizado"). Idempotente; nada de drop de tabela/coluna; search_path fixo;
-- nenhuma função nova executável por anon (S14 segue 18). Só RPCs security definer escrevem.
--
-- Decisões (sem perguntar ao responsável):
--   • D1 Dias úteis: segunda a sexta, fora os feriados NACIONAIS (fixos + móveis pela Páscoa: Carnaval seg/ter,
--     Paixão de Cristo, Corpus Christi; Consciência Negra 20/11). É a mesma lista "Feriados Nacionais" do Calendário
--     Groscove (0099, conferida para 2026 e 2027); os aniversários de cidades/estados que estão no mesmo território do
--     calendário NÃO param a agência. Calculado (br_holidays), então vale para qualquer ano sem importar dados.
--     Espelho em TypeScript: src/lib/roadmap/business-days.ts (testado no vitest com as mesmas datas).
--   • D2 Contagem: o início do roteiro é o Dia 1 (se cair em fim de semana/feriado, rola para o próximo dia útil).
--     Etapa de n dias úteis que começa no dia A vence em A + (n−1) dias úteis; a etapa seguinte começa no próximo dia
--     útil depois do fim da anterior. "Mesmo dia" vence no dia em que a anterior termina. Etapa "em paralelo"
--     (depends_on_prev = false) começa junto com a anterior. Assim a soma dos prazos do PDF dá exatamente o total
--     (Vídeo 40, Foto 25, Imprensa 20 até as 1ªs publicações, Artística 13 até as 1ªs intermediações, Mentoria 28,
--     Business Plan 40 até a apresentação / 60 no total, Publipost 7 no ar / 15 no total, Live Session 35).
--   • D3 Cadeia: quando uma etapa é concluída (ou reaberta) o prazo das seguintes é recalculado a partir da data real
--     (gatilho em tasks → roadmap_recalc). Etapa aberta e vencida "termina hoje" para a previsão das seguintes (a
--     previsão anda com o atraso; o cron diário recalcula). Etapa "automática" (ex.: passar prazos ao cliente) se
--     conclui sozinha quando todas as anteriores estão concluídas.
--   • D4 Reuso: as etapas viram linhas da tabela de tarefas existente (0068, public.tasks) com colunas novas (setor,
--     etapa do roteiro, posição, visível ao cliente, regra/prazo, recorrência, marco, disponível em, vence em).
--     Elas aparecem também em /agencia/tarefas e na aba Tarefas do negócio. Os avisos antigos de prazo (24 h e
--     atrasada, 0072/0084) passam a ignorar as tarefas do roteiro, que têm aviso próprio em dias úteis.
--   • D5 Cliente do negócio = marca e/ou herói: deals.brand_id deixa de ser obrigatório e ganha client_talent_id
--     (ficha do casting da mesma agência); um check exige pelo menos um dos dois. Negócio só do herói nasce SEM pedido
--     de campanha (campaign_requests exige marca) e as telas escondem as abas que dependem da marca (termos, entregas,
--     conversa com a marca). O herói-cliente vê o projeto (só as etapas visíveis ao cliente) no Portal do Herói pela
--     RPC client_projects — a RLS de deals não foi aberta para ele.
--   • D6 Setores fixos (gestor, estratégia, operação, comunicação) em agency_members.sectors (0..4 por pessoa), só o Adm
--     define. Quem é do setor lê (RLS nova tasks_select_sector) e conclui as tarefas do setor, mesmo fora da equipe do
--     negócio; o link do negócio só aparece para quem já pode abri-lo (gestor+ ou equipe do negócio).
--   • D7 Catálogo por agência (agency_services + agency_service_steps), editável só pelo Adm; o modelo padrão Groscove
--     (groscove_service_model) é semeado em todas as agências existentes e, por gatilho, nas novas. "Restaurar modelo"
--     só acrescenta os serviços que faltam (por slug), nunca sobrescreve o que o Adm editou. Serviço não se exclui:
--     desativa (os negócios antigos continuam apontando para ele).
--   • D8 Avisos: roadmap_due_soon (1 dia útil antes: responsável, ou o setor, ou os gestores) e roadmap_overdue (atraso:
--     quem é do setor Gestor, ou os gestores da agência) pelo cron diário existente (/api/cron/agency). Só no sino.
--   • D9 Ganchos para as Fases 2 e 3: marco da etapa (abertura/fechamento da sala, diária, demo, guia de uso, feedback,
--     clipping, insights…), recorrência da etapa e do serviço, visível ao cliente e cliente herói já ficam no modelo.
-- =============================================================================

-- 1) dias úteis BR ------------------------------------------------------------------------------------------------
create or replace function public.br_easter(p_year int)
returns date language plpgsql immutable set search_path = '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  -- algoritmo anônimo gregoriano (Meeus/Jones/Butcher)
  a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

create or replace function public.br_holidays(p_year int)
returns table (day date, name text) language plpgsql immutable set search_path = '' as $$
declare e date := public.br_easter(p_year);
begin
  return query values
    (make_date(p_year, 1, 1), 'Confraternização Universal'::text),
    (e - 48, 'Carnaval'), (e - 47, 'Carnaval'), (e - 2, 'Paixão de Cristo'),
    (make_date(p_year, 4, 21), 'Tiradentes'), (make_date(p_year, 5, 1), 'Dia do Trabalho'), (e + 60, 'Corpus Christi'),
    (make_date(p_year, 9, 7), 'Independência do Brasil'), (make_date(p_year, 10, 12), 'Nossa Senhora Aparecida'),
    (make_date(p_year, 11, 2), 'Finados'), (make_date(p_year, 11, 15), 'Proclamação da República'),
    (make_date(p_year, 11, 20), 'Consciência Negra'), (make_date(p_year, 12, 25), 'Natal');
end $$;

create or replace function public.br_is_business_day(p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select p_day is not null and extract(isodow from p_day) < 6
    and not exists (select 1 from public.br_holidays(extract(year from p_day)::int) h where h.day = p_day)
$$;

-- próximo dia útil DEPOIS do dia dado
create or replace function public.br_next_business_day(p_day date)
returns date language plpgsql immutable set search_path = '' as $$
declare v date := p_day + 1;
begin
  while not public.br_is_business_day(v) loop v := v + 1; end loop;
  return v;
end $$;

-- o próprio dia, se útil; senão o próximo útil
create or replace function public.br_roll_business_day(p_day date)
returns date language sql immutable set search_path = '' as $$
  select case when public.br_is_business_day(p_day) then p_day else public.br_next_business_day(p_day) end
$$;

-- anda n dias úteis para a frente (n <= 0 devolve o próprio dia)
create or replace function public.br_add_business_days(p_day date, p_n int)
returns date language plpgsql immutable set search_path = '' as $$
declare v date := p_day; i int := 0;
begin
  if p_day is null then return null; end if;
  while i < coalesce(p_n, 0) loop v := public.br_next_business_day(v); i := i + 1; end loop;
  return v;
end $$;

-- dias úteis no intervalo (de, até] (0 quando até <= de)
create or replace function public.br_business_days_between(p_from date, p_to date)
returns int language sql immutable set search_path = '' as $$
  select case when p_from is null or p_to is null or p_to <= p_from then 0
         else (select count(*)::int from generate_series(p_from + 1, p_to, interval '1 day') g(d) where public.br_is_business_day(g.d::date)) end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.br_easter(int)', 'public.br_holidays(int)', 'public.br_is_business_day(date)', 'public.br_next_business_day(date)',
                           'public.br_roll_business_day(date)', 'public.br_add_business_days(date, int)', 'public.br_business_days_between(date, date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 2) setores da equipe --------------------------------------------------------------------------------------------
create or replace function public.roadmap_sector_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p in ('gestor', 'estrategia', 'operacao', 'comunicacao')
$$;
revoke execute on function public.roadmap_sector_ok(text) from public, anon;
grant execute on function public.roadmap_sector_ok(text) to authenticated, service_role;

alter table public.agency_members add column if not exists sectors text[] not null default '{}'::text[];
alter table public.agency_members drop constraint if exists agency_members_sectors_check;
alter table public.agency_members add constraint agency_members_sectors_check
  check (sectors <@ array['gestor', 'estrategia', 'operacao', 'comunicacao']::text[] and cardinality(sectors) <= 4);

-- "agência:setor" de cada setor da pessoa (políticas de tarefas por setor)
create or replace function public.my_agency_sector_keys()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.agency_id::text || ':' || s.sector), '{}'::text[])
  from public.agency_members m
  join public.agencies a on a.id = m.agency_id and a.status = 'active'
  cross join lateral unnest(m.sectors) s(sector)
  where m.user_id = auth.uid() and m.revoked_at is null
$$;
revoke execute on function public.my_agency_sector_keys() from public, anon;
grant execute on function public.my_agency_sector_keys() to authenticated, service_role;

-- 3) catálogo de serviços e roteiros --------------------------------------------------------------------------------
create table if not exists public.agency_services (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint agency_services_agency_fk references public.agencies (id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  client_kind text not null default 'both',
  recurrence text not null default 'none',
  sla_days smallint not null,
  milestone_days smallint,
  milestone_label text not null default '',
  active boolean not null default true,
  position smallint not null default 0,
  from_model boolean not null default false,
  created_by uuid constraint agency_services_created_by_fk references auth.users (id) on delete set null,
  updated_by uuid constraint agency_services_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_services_slug_uq unique (agency_id, slug),
  constraint agency_services_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  constraint agency_services_name_check check (char_length(btrim(name)) between 3 and 80),
  constraint agency_services_desc_check check (char_length(description) <= 1000 and char_length(milestone_label) <= 60),
  constraint agency_services_client_check check (client_kind in ('brand', 'talent', 'both')),
  constraint agency_services_recurrence_check check (recurrence in ('none', 'weekly', 'biweekly', 'monthly')),
  constraint agency_services_sla_check check (sla_days between 1 and 365 and (milestone_days is null or milestone_days between 1 and 365)),
  constraint agency_services_position_check check (position between 0 and 999)
);
create index if not exists agency_services_agency_idx on public.agency_services (agency_id, active, position);

create table if not exists public.agency_service_steps (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint agency_service_steps_agency_fk references public.agencies (id) on delete cascade,
  service_id uuid not null constraint agency_service_steps_service_fk references public.agency_services (id) on delete cascade,
  position smallint not null,
  title text not null,
  description text not null default '',
  sector text not null,
  sector_extra text,
  due_rule text not null default 'business_days',
  due_days smallint not null default 1,
  recurrence text,
  depends_on_prev boolean not null default true,
  client_visible boolean not null default false,
  automatic boolean not null default false,
  milestone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_service_steps_position_uq unique (service_id, position) deferrable initially immediate,
  constraint agency_service_steps_position_check check (position between 1 and 60),
  constraint agency_service_steps_title_check check (char_length(btrim(title)) between 3 and 160 and char_length(description) <= 1000),
  constraint agency_service_steps_sector_check check (public.roadmap_sector_ok(sector) and (sector_extra is null or (public.roadmap_sector_ok(sector_extra) and sector_extra <> sector))),
  constraint agency_service_steps_rule_check check (
    (due_rule = 'same_day' and due_days = 0 and recurrence is null) or
    (due_rule = 'business_days' and due_days between 1 and 120 and recurrence is null) or
    (due_rule = 'recurring' and due_days between 1 and 120 and recurrence in ('daily', 'weekly', 'biweekly', 'monthly'))),
  constraint agency_service_steps_milestone_check check (milestone is null or milestone in ('client_entry', 'briefing', 'nda', 'opening', 'production_day',
    'client_feedback', 'demo', 'delivery', 'usage_guide', 'presentation', 'first_result', 'go_live', 'insights', 'clipping', 'closing'))
);
create index if not exists agency_service_steps_service_idx on public.agency_service_steps (service_id, position);

-- etapa herda a agência do serviço
create or replace function public.agency_service_steps_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  select s.agency_id into new.agency_id from public.agency_services s where s.id = new.service_id;
  if new.agency_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return new;
end $$;
revoke execute on function public.agency_service_steps_scope() from public, anon, authenticated;
drop trigger if exists trg_agency_service_steps_scope on public.agency_service_steps;
create trigger trg_agency_service_steps_scope before insert or update of service_id on public.agency_service_steps
  for each row execute function public.agency_service_steps_scope();

do $$
declare t text;
begin
  foreach t in array array['agency_services', 'agency_service_steps'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
    execute format('drop policy if exists %1$s_select_agency on public.%1$I', t);
    execute format('create policy %1$s_select_agency on public.%1$I for select to authenticated using (agency_id = any ((select public.my_agency_ids(''staff''))::uuid[]))', t);
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- 4) negócio: serviço e cliente (marca e/ou herói) ------------------------------------------------------------------
alter table public.deals alter column brand_id drop not null;
alter table public.deals add column if not exists client_talent_id uuid
  constraint deals_client_talent_fk references public.talent_profiles (id) on delete restrict;
alter table public.deals add column if not exists service_id uuid
  constraint deals_service_fk references public.agency_services (id) on delete set null;
alter table public.deals add column if not exists roadmap_started_on date;
alter table public.deals drop constraint if exists deals_client_check;
alter table public.deals add constraint deals_client_check check (brand_id is not null or client_talent_id is not null);
create index if not exists deals_client_talent_idx on public.deals (client_talent_id) where client_talent_id is not null;

-- herói-cliente e serviço sempre da mesma agência do negócio
create or replace function public.deals_client_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.client_talent_id is not null and (select t.agency_id from public.talent_profiles t where t.id = new.client_talent_id) is distinct from new.agency_id then
    raise exception 'talent_agency_mismatch' using errcode = '22023';
  end if;
  if new.service_id is not null and (select s.agency_id from public.agency_services s where s.id = new.service_id) is distinct from new.agency_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return new;
end $$;
revoke execute on function public.deals_client_scope() from public, anon, authenticated;
drop trigger if exists trg_deals_client_scope on public.deals;
create trigger trg_deals_client_scope before insert or update of client_talent_id, service_id, agency_id on public.deals
  for each row execute function public.deals_client_scope();

-- 5) tarefas do roteiro (tabela existente) --------------------------------------------------------------------------
alter table public.tasks add column if not exists sector text;
alter table public.tasks add column if not exists sector_extra text;
alter table public.tasks add column if not exists roadmap_step_id uuid
  constraint tasks_roadmap_step_fk references public.agency_service_steps (id) on delete set null;
alter table public.tasks add column if not exists roadmap_position smallint;
alter table public.tasks add column if not exists client_visible boolean not null default false;
alter table public.tasks add column if not exists due_rule text;
alter table public.tasks add column if not exists due_days smallint;
alter table public.tasks add column if not exists recurrence text;
alter table public.tasks add column if not exists depends_on_prev boolean not null default true;
alter table public.tasks add column if not exists automatic boolean not null default false;
alter table public.tasks add column if not exists milestone text;
alter table public.tasks add column if not exists available_on date;
alter table public.tasks add column if not exists due_on date;
alter table public.tasks drop constraint if exists tasks_sector_check;
alter table public.tasks add constraint tasks_sector_check check ((sector is null or public.roadmap_sector_ok(sector))
  and (sector_extra is null or (sector is not null and public.roadmap_sector_ok(sector_extra) and sector_extra <> sector)));
alter table public.tasks drop constraint if exists tasks_roadmap_check;
alter table public.tasks add constraint tasks_roadmap_check check (roadmap_position is null or (deal_id is not null and template_step is null and sector is not null
  and roadmap_position between 1 and 60 and due_rule in ('business_days', 'same_day', 'recurring') and due_days between 0 and 120
  and (recurrence is null or recurrence in ('daily', 'weekly', 'biweekly', 'monthly'))));
create unique index if not exists tasks_roadmap_uq on public.tasks (deal_id, roadmap_position) where roadmap_position is not null;
create index if not exists tasks_roadmap_sector_idx on public.tasks (agency_id, sector, due_on) where roadmap_position is not null and status in ('todo', 'doing', 'blocked');

-- quem é do setor lê as tarefas do setor (as outras políticas de tasks continuam)
drop policy if exists tasks_select_sector on public.tasks;
create policy tasks_select_sector on public.tasks for select to authenticated
  using (sector is not null and ((agency_id::text || ':' || sector) = any ((select public.my_agency_sector_keys())::text[])
         or (sector_extra is not null and (agency_id::text || ':' || sector_extra) = any ((select public.my_agency_sector_keys())::text[]))));

-- 6) modelo padrão Groscove (os 8 produtos do PDF) ------------------------------------------------------------------
-- Etapa: t título · s setor · s2 setor compartilhado · d dias úteis (0 = mesmo dia da anterior) · rec recorrência ·
-- par começa junto com a anterior · v visível ao cliente · a automática · m marco (ganchos das Fases 2 e 3).
-- Etapas sem prazo no PDF receberam 1 dia útil (ou "mesmo dia" quando acontecem junto da anterior) para fechar o total.
create or replace function public.groscove_service_model()
returns jsonb language sql immutable set search_path = '' as $$
  select $json$[
  {"slug":"producao-de-video","name":"Produção de vídeo","client":"both","rec":"none","sla":40,"steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing de marca com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Selecionar e aprovar o orçamento da equipe de staff","s":"operacao","d":7},
    {"t":"Enviar as normas Groscove à equipe e recolher o NDA","s":"operacao","d":1,"m":"nda"},
    {"t":"Abrir o grupo de staff","s":"operacao","d":2,"m":"opening"},
    {"t":"Aprovar o briefing da produção","s":"operacao","d":2,"v":true},
    {"t":"Agendar o estúdio ou local","s":"comunicacao","d":1},
    {"t":"Alinhar com o cliente data, horário, local, estacionamento, alimentação e limite de pessoas","s":"comunicacao","d":0,"v":true},
    {"t":"Confirmar a equipe do set e delegar responsabilidades","s":"operacao","d":1},
    {"t":"Confirmar o agendamento e a equipe da diária","s":"gestor","d":1},
    {"t":"Dia oficial da gravação: conferir a chegada do staff","s":"gestor","d":3,"v":true,"m":"production_day"},
    {"t":"Executar a gravação conforme o briefing","s":"operacao","d":0,"v":true},
    {"t":"Receber o feedback do cliente sobre o dia da produção","s":"comunicacao","d":1,"v":true,"m":"client_feedback"},
    {"t":"Enviar ao cliente o feedback sobre o desenvolvimento","s":"comunicacao","d":1,"v":true},
    {"t":"Alinhar a data de envio da prévia (fase propícia a mudanças)","s":"comunicacao","d":1,"v":true},
    {"t":"Apresentar e aprovar a prévia (até 20 dias úteis após a gravação, de preferência presencial)","s":"operacao","s2":"gestor","d":14,"v":true,"m":"demo"},
    {"t":"Entregar o vídeo oficial","s":"operacao","d":1,"v":true,"m":"delivery"},
    {"t":"Enviar o PDF guia de uso (projeção e uso ideal do material)","s":"estrategia","d":1,"v":true,"m":"usage_guide"},
    {"t":"Arquivar o clipping","s":"gestor","d":1,"m":"clipping"},
    {"t":"Fechar o staff: remover todos e apagar o grupo","s":"operacao","d":0,"m":"closing"}]},
  {"slug":"producao-fotografica","name":"Produção fotográfica","client":"both","rec":"none","sla":25,"steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing de marca com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Selecionar e aprovar o orçamento da equipe de staff","s":"operacao","d":2},
    {"t":"Enviar as normas Groscove à equipe e recolher o NDA","s":"operacao","d":1,"m":"nda"},
    {"t":"Abrir o grupo de staff","s":"operacao","d":2,"m":"opening"},
    {"t":"Aprovar o briefing da produção","s":"operacao","d":2,"v":true},
    {"t":"Agendar o estúdio ou local","s":"comunicacao","d":1},
    {"t":"Alinhar com o cliente data, horário, local, estacionamento, alimentação e limite de pessoas","s":"comunicacao","d":0,"v":true},
    {"t":"Confirmar a equipe do set e delegar responsabilidades","s":"operacao","d":1},
    {"t":"Confirmar o agendamento e a equipe da diária","s":"gestor","d":1},
    {"t":"Dia oficial das fotos: conferir a chegada do staff","s":"gestor","d":2,"v":true,"m":"production_day"},
    {"t":"Executar as fotos conforme o briefing","s":"operacao","d":0,"v":true},
    {"t":"Receber o feedback do cliente sobre o dia da produção","s":"comunicacao","d":1,"v":true,"m":"client_feedback"},
    {"t":"Alinhar as expectativas de edição","s":"comunicacao","d":1,"v":true},
    {"t":"Enviar ao cliente o feedback sobre o desenvolvimento","s":"comunicacao","d":1,"v":true},
    {"t":"Alinhar a data de envio da prévia","s":"comunicacao","d":0,"v":true},
    {"t":"Apresentar e aprovar a prévia (até 10 dias úteis após as fotos)","s":"operacao","s2":"gestor","d":5,"v":true,"m":"demo"},
    {"t":"Entregar as fotos aprovadas","s":"operacao","d":1,"v":true,"m":"delivery"},
    {"t":"Enviar o PDF guia de uso (projeção e uso ideal do material)","s":"estrategia","d":1,"v":true,"m":"usage_guide"},
    {"t":"Arquivar o clipping","s":"gestor","d":1,"m":"clipping"},
    {"t":"Fechar o staff: remover todos e apagar o grupo","s":"operacao","d":0,"m":"closing"}]},
  {"slug":"assessoria-de-imprensa","name":"Assessoria de imprensa","client":"both","rec":"monthly","sla":20,"mdays":20,"mlabel":"1ªs publicações","steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing de marca com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Aprovar o direcionamento: jornalistas, canais e interesses","s":"estrategia","d":2,"v":true},
    {"t":"Enviar o PDF de mapeamento de interesses","s":"estrategia","d":1,"v":true},
    {"t":"Fazer a call de alinhamento","s":"comunicacao","s2":"estrategia","d":1,"v":true},
    {"t":"Enviar os temas das 4 pautas do mês","s":"comunicacao","d":3,"rec":"monthly","v":true},
    {"t":"Receber as informações da pauta (texto, áudio ou foto) — 1 pauta por semana","s":"comunicacao","d":3,"rec":"weekly","v":true},
    {"t":"Escrever a pauta","s":"comunicacao","d":5,"rec":"weekly"},
    {"t":"Aprovar e soltar a pauta","s":"comunicacao","d":1,"rec":"weekly","v":true},
    {"t":"Enviar os links das pautas publicadas","s":"comunicacao","d":2,"rec":"weekly","v":true,"m":"first_result"},
    {"t":"Arquivar o clipping mensal","s":"gestor","d":1,"rec":"monthly","m":"clipping"},
    {"t":"Clipping geral: produção, links, oportunidades e equipe","s":"gestor","d":1,"v":true,"m":"closing"}]},
  {"slug":"assessoria-artistica","name":"Assessoria artística","client":"talent","rec":"monthly","sla":13,"mdays":13,"mlabel":"1ªs intermediações","steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Prospectar marcas e parcerias para o cliente","s":"estrategia","d":2},
    {"t":"Alinhar projeção, tempo e interesses","s":"estrategia","d":1,"v":true},
    {"t":"Criar a estratégia","s":"estrategia","d":2},
    {"t":"Fazer a reunião de alinhamento","s":"gestor","s2":"estrategia","d":2,"v":true},
    {"t":"Sugerir profissionais terceirizados (estratégia de vendas)","s":"estrategia","d":1,"v":true},
    {"t":"Enviar as normas Groscove e recolher o NDA dos profissionais","s":"operacao","d":0,"m":"nda"},
    {"t":"Enviar os contatos dos profissionais indicados (cashback)","s":"comunicacao","d":1,"v":true},
    {"t":"Confirmar o serviço entre o cliente e o profissional","s":"comunicacao","d":2,"v":true,"m":"first_result"},
    {"t":"Acompanhamento diário (RP)","s":"comunicacao","d":1,"rec":"daily"},
    {"t":"Enviar o relatório semanal","s":"comunicacao","d":5,"rec":"weekly","par":true,"v":true},
    {"t":"Troca de feedbacks quinzenal (Meet)","s":"gestor","d":10,"rec":"biweekly","par":true,"v":true,"m":"client_feedback"},
    {"t":"Clipping quinzenal por profissional","s":"gestor","d":10,"rec":"biweekly","par":true,"v":true,"m":"clipping"},
    {"t":"Clipping geral","s":"gestor","d":1,"v":true,"m":"closing"}]},
  {"slug":"mentoria-jonathas","name":"Mentoria do Jonathas","client":"talent","rec":"none","sla":28,"steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Recolher dados e materiais do cliente (redes e projetos)","s":"estrategia","d":2,"v":true},
    {"t":"Consultar a disponibilidade do mentor e agendar","s":"gestor","d":2,"v":true},
    {"t":"Fazer o treinamento básico","s":"operacao","d":1},
    {"t":"Selecionar o staff","s":"operacao","d":2},
    {"t":"Recolher o NDA do staff","s":"operacao","d":1,"m":"nda"},
    {"t":"Organizar transporte, alimentação e agenda do mentor","s":"operacao","d":2},
    {"t":"Reservar local, ceia e papelaria (até 10 dias antes)","s":"operacao","d":3},
    {"t":"Produzir a placa do certificado (7 a 10 dias úteis)","s":"comunicacao","d":7,"par":true},
    {"t":"Confirmar com o cliente e o mentor","s":"gestor","d":1,"v":true},
    {"t":"Dia da mentoria: gravar o áudio","s":"operacao","d":1,"v":true,"m":"production_day"},
    {"t":"Entregar o certificado","s":"gestor","d":0,"v":true},
    {"t":"Enviar o material em áudio e o PDF resumo","s":"estrategia","d":7,"v":true,"m":"delivery"},
    {"t":"Arquivar o clipping","s":"gestor","d":0,"m":"clipping"}]},
  {"slug":"business-plan","name":"Business Plan","client":"talent","rec":"none","sla":60,"mdays":40,"mlabel":"Apresentação","steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Reunir referências visuais segmentadas","s":"estrategia","d":2},
    {"t":"Alinhar a estratégia com o Jon","s":"estrategia","s2":"gestor","d":2,"v":true},
    {"t":"Criar o conteúdo e o design","s":"estrategia","s2":"comunicacao","d":30},
    {"t":"Acompanhamento semanal com o cliente (texto ou áudio)","s":"gestor","d":5,"rec":"weekly","par":true,"v":true},
    {"t":"Agendar a apresentação (3ª semana)","s":"gestor","d":15,"par":true,"v":true},
    {"t":"Enviar lembretes ao cliente 72 h e 24 h antes da apresentação","s":"comunicacao","d":2,"v":true},
    {"t":"Fazer a apresentação gravada","s":"gestor","d":2,"v":true,"m":"presentation"},
    {"t":"Acompanhar a aprovação","s":"gestor","d":5,"v":true},
    {"t":"Gerar o PDF final","s":"estrategia","d":3,"v":true},
    {"t":"Imprimir e montar o kit","s":"operacao","d":5},
    {"t":"Enviar por Sedex com o código de rastreio","s":"operacao","d":1,"v":true,"m":"delivery"},
    {"t":"Enviar o cronograma: checklist de execução do 1º trimestre","s":"estrategia","d":3,"v":true},
    {"t":"Reunião de feedback e overdelivery (oferta de assessoria)","s":"gestor","d":3,"v":true,"m":"client_feedback"},
    {"t":"Arquivar o clipping","s":"gestor","d":0,"m":"clipping"}]},
  {"slug":"publipost","name":"Publipost","client":"both","rec":"none","sla":15,"mdays":7,"mlabel":"No ar","steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Estudar a ação","s":"estrategia","d":0},
    {"t":"Selecionar o casting estratégico","s":"estrategia","d":0},
    {"t":"Fazer o esboço e a média de valores","s":"gestor","d":0},
    {"t":"Aprovar as especificações com o cliente","s":"gestor","d":1,"v":true},
    {"t":"Contatar o casting e alinhar valores (RP, até 2 dias corridos)","s":"comunicacao","d":1},
    {"t":"Atualizar diariamente o status da proposta","s":"comunicacao","d":1,"rec":"daily","par":true,"v":true},
    {"t":"Fechar a proposta e os contratos","s":"gestor","d":1,"v":true},
    {"t":"Solicitar o briefing de entrega da ação","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Enviar a demanda ao artista","s":"operacao","d":0},
    {"t":"Verificar os prazos com o artista","s":"operacao","d":0},
    {"t":"Passar os prazos ao cliente","s":"comunicacao","d":0,"v":true,"a":true},
    {"t":"Calendário em tempo real do processo","s":"comunicacao","d":0,"v":true,"a":true},
    {"t":"Entrega final das demandas (no ar)","s":"operacao","d":2,"v":true,"m":"go_live"},
    {"t":"Receber os insights do artista (24 h após feed e story)","s":"comunicacao","d":7,"v":true,"m":"insights"},
    {"t":"Estratégia de nova venda","s":"estrategia","d":1},
    {"t":"Feedbacks","s":"comunicacao","d":0,"v":true,"m":"client_feedback"},
    {"t":"Fechamento","s":"gestor","d":0,"m":"closing"}]},
  {"slug":"live-session","name":"Live Session","client":"both","rec":"none","sla":35,"steps":[
    {"t":"Preencher o formulário de Entrada de cliente","s":"gestor","d":1,"m":"client_entry"},
    {"t":"Preencher o formulário do briefing de marca com o cliente","s":"estrategia","d":1,"v":true,"m":"briefing"},
    {"t":"Selecionar o staff","s":"operacao","d":2},
    {"t":"Enviar as normas Groscove e recolher o NDA","s":"operacao","d":1,"m":"nda"},
    {"t":"Abrir o grupo de staff","s":"operacao","d":1,"m":"opening"},
    {"t":"Captar os nomes das músicas e as guias","s":"operacao","d":2,"v":true},
    {"t":"Montar o protótipo da produção","s":"operacao","d":3,"v":true},
    {"t":"Definir as referências de moda (make e hair)","s":"operacao","d":2,"v":true},
    {"t":"Alinhamento logístico: data, local, estacionamento, alimentação e limite de pessoas","s":"comunicacao","d":1,"v":true},
    {"t":"Ativar o staff operacional (músicos, maquiador, estilista)","s":"operacao","d":1},
    {"t":"Confirmar o agendamento e a equipe da diária","s":"gestor","d":1},
    {"t":"Dia da live: conferir a chegada do staff e executar","s":"gestor","s2":"operacao","d":1,"v":true,"m":"production_day"},
    {"t":"Receber o feedback do cliente sobre o dia da produção","s":"comunicacao","d":1,"v":true,"m":"client_feedback"},
    {"t":"Alinhar a data de envio da prévia","s":"comunicacao","d":0,"v":true},
    {"t":"Apresentar e aprovar a prévia (até 20 dias úteis após a live)","s":"operacao","s2":"gestor","d":14,"v":true,"m":"demo"},
    {"t":"Entregar o vídeo oficial","s":"operacao","d":1,"v":true,"m":"delivery"},
    {"t":"Enviar o PDF guia de uso","s":"estrategia","d":1,"v":true,"m":"usage_guide"},
    {"t":"Arquivar o clipping","s":"gestor","d":1,"m":"clipping"},
    {"t":"Fechar o staff: remover todos e apagar o grupo","s":"operacao","d":0,"m":"closing"}]}
  ]$json$::jsonb
$$;
revoke execute on function public.groscove_service_model() from public, anon;
grant execute on function public.groscove_service_model() to authenticated, service_role;

-- semeia na agência os serviços do modelo que ela ainda não tem (por slug); devolve quantos entraram
create or replace function public.agency_services_seed(p_agency uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare s jsonb; st jsonb; v_service uuid; v_pos int; v_n int := 0; v_order int := 0; v_d int;
begin
  if not exists (select 1 from public.agencies a where a.id = p_agency) then return 0; end if;
  for s in select x from jsonb_array_elements(public.groscove_service_model()) x loop
    v_order := v_order + 1;
    if exists (select 1 from public.agency_services x where x.agency_id = p_agency and x.slug = s ->> 'slug') then continue; end if;
    insert into public.agency_services (agency_id, slug, name, client_kind, recurrence, sla_days, milestone_days, milestone_label, position, from_model, created_by)
    values (p_agency, s ->> 'slug', s ->> 'name', s ->> 'client', s ->> 'rec', (s ->> 'sla')::smallint, (s ->> 'mdays')::smallint,
            coalesce(s ->> 'mlabel', ''), v_order, true, auth.uid())
    returning id into v_service;
    v_pos := 0;
    for st in select y from jsonb_array_elements(s -> 'steps') y loop
      v_pos := v_pos + 1;
      v_d := coalesce((st ->> 'd')::int, 1);
      insert into public.agency_service_steps (service_id, agency_id, position, title, sector, sector_extra, due_rule, due_days, recurrence,
                                               depends_on_prev, client_visible, automatic, milestone)
      values (v_service, p_agency, v_pos, st ->> 't', st ->> 's', st ->> 's2',
              case when st ? 'rec' then 'recurring' when v_d = 0 then 'same_day' else 'business_days' end,
              v_d, st ->> 'rec', not coalesce((st ->> 'par')::boolean, false), coalesce((st ->> 'v')::boolean, false),
              coalesce((st ->> 'a')::boolean, false), st ->> 'm');
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.agency_services_seed(uuid) from public, anon, authenticated;
grant execute on function public.agency_services_seed(uuid) to service_role;

create or replace function public.agencies_seed_services()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.agency_services_seed(new.id);
  return null;
end $$;
revoke execute on function public.agencies_seed_services() from public, anon, authenticated;
drop trigger if exists trg_agencies_seed_services on public.agencies;
create trigger trg_agencies_seed_services after insert on public.agencies for each row execute function public.agencies_seed_services();

-- agências que já existem
do $$ begin perform public.agency_services_seed(a.id) from public.agencies a; end $$;

-- 7) catálogo: escrita (só o Adm) ------------------------------------------------------------------------------------
create or replace function public.roadmap_slugify(p text)
returns text language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'), '-'), 50)
$$;
revoke execute on function public.roadmap_slugify(text) from public, anon;
grant execute on function public.roadmap_slugify(text) to authenticated, service_role;

-- cria (p_id nulo) ou edita um serviço com TODA a lista de etapas na ordem (etapa com id existente é atualizada,
-- sem id é criada, a que sumiu da lista é apagada — as tarefas já geradas ficam com o texto copiado)
create or replace function public.agency_service_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_name text; v_slug text; v_base text; v_i int := 1; st jsonb; v_pos int := 0; v_keep uuid[] := '{}'::uuid[];
        v_step uuid; v_rule text; v_days int; v_rec text; v_before jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'steps') is distinct from 'array'
     or jsonb_array_length(p_data -> 'steps') not between 1 and 60 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_name := btrim(coalesce(p_data ->> 'name', ''));
  if v_id is not null then
    select to_jsonb(s) into v_before from public.agency_services s where s.id = v_id and s.agency_id = p_agency for update;
    if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  begin
    if v_id is null then
      v_base := coalesce(nullif(public.roadmap_slugify(v_name), ''), 'servico');
      if char_length(v_base) < 2 then v_base := 'servico-' || v_base; end if;
      v_slug := v_base;
      while exists (select 1 from public.agency_services s where s.agency_id = p_agency and s.slug = v_slug) loop
        v_i := v_i + 1; v_slug := left(v_base, 55) || '-' || v_i::text;
      end loop;
      insert into public.agency_services (agency_id, slug, name, description, client_kind, recurrence, sla_days, milestone_days, milestone_label, active, position, created_by, updated_by)
      values (p_agency, v_slug, v_name, btrim(coalesce(p_data ->> 'description', '')), coalesce(p_data ->> 'client_kind', 'both'), coalesce(p_data ->> 'recurrence', 'none'),
              (p_data ->> 'sla_days')::smallint, nullif(p_data ->> 'milestone_days', '')::smallint, btrim(coalesce(p_data ->> 'milestone_label', '')),
              coalesce((p_data ->> 'active')::boolean, true),
              coalesce((select max(s.position) + 1 from public.agency_services s where s.agency_id = p_agency), 1), auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.agency_services set name = v_name, description = btrim(coalesce(p_data ->> 'description', '')),
        client_kind = coalesce(p_data ->> 'client_kind', client_kind), recurrence = coalesce(p_data ->> 'recurrence', recurrence),
        sla_days = (p_data ->> 'sla_days')::smallint, milestone_days = nullif(p_data ->> 'milestone_days', '')::smallint,
        milestone_label = btrim(coalesce(p_data ->> 'milestone_label', '')), active = coalesce((p_data ->> 'active')::boolean, active), updated_by = auth.uid()
      where id = v_id;
    end if;
    -- reordenar sem esbarrar no único (serviço, posição)
    set constraints public.agency_service_steps_position_uq deferred;
    for st in select x from jsonb_array_elements(p_data -> 'steps') x loop
      v_pos := v_pos + 1;
      v_days := coalesce((st ->> 'due_days')::int, 1);
      v_rule := coalesce(st ->> 'due_rule', 'business_days');
      v_rec := case when v_rule = 'recurring' then nullif(st ->> 'recurrence', '') end;
      if v_rule = 'same_day' then v_days := 0; end if;
      v_step := nullif(st ->> 'id', '')::uuid;
      if v_step is not null and not exists (select 1 from public.agency_service_steps x where x.id = v_step and x.service_id = v_id) then v_step := null; end if;
      if v_step is null then
        insert into public.agency_service_steps (service_id, agency_id, position, title, description, sector, sector_extra, due_rule, due_days, recurrence,
                                                 depends_on_prev, client_visible, automatic, milestone)
        values (v_id, p_agency, v_pos, btrim(coalesce(st ->> 'title', '')), btrim(coalesce(st ->> 'description', '')), st ->> 'sector', nullif(st ->> 'sector_extra', ''),
                v_rule, v_days, v_rec, coalesce((st ->> 'depends_on_prev')::boolean, true), coalesce((st ->> 'client_visible')::boolean, false),
                coalesce((st ->> 'automatic')::boolean, false), nullif(st ->> 'milestone', ''))
        returning id into v_step;
      else
        update public.agency_service_steps set position = v_pos, title = btrim(coalesce(st ->> 'title', '')), description = btrim(coalesce(st ->> 'description', '')),
          sector = st ->> 'sector', sector_extra = nullif(st ->> 'sector_extra', ''), due_rule = v_rule, due_days = v_days, recurrence = v_rec,
          depends_on_prev = coalesce((st ->> 'depends_on_prev')::boolean, true), client_visible = coalesce((st ->> 'client_visible')::boolean, false),
          automatic = coalesce((st ->> 'automatic')::boolean, false), milestone = nullif(st ->> 'milestone', '')
        where id = v_step;
      end if;
      v_keep := v_keep || v_step;
    end loop;
    delete from public.agency_service_steps x where x.service_id = v_id and not (x.id = any (v_keep));
    set constraints public.agency_service_steps_position_uq immediate;
  exception
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or unique_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log(case when p_id is null then 'service.create' else 'service.update' end, 'agency_service', v_id::text, v_before,
    jsonb_build_object('agency_id', p_agency, 'name', v_name, 'steps', jsonb_array_length(p_data -> 'steps')), null, public.talent_audit_actor('agency', p_agency));
  return v_id;
end $$;
revoke execute on function public.agency_service_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.agency_service_save(uuid, uuid, jsonb) to authenticated, service_role;

-- acrescenta os serviços do modelo Groscove que faltam (nunca sobrescreve)
create or replace function public.agency_services_restore(p_agency uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  v_n := public.agency_services_seed(p_agency);
  perform public.audit_log('service.restore_model', 'agency', p_agency::text, null, jsonb_build_object('agency_id', p_agency, 'added', v_n), null,
    public.talent_audit_actor('agency', p_agency));
  return v_n;
end $$;
revoke execute on function public.agency_services_restore(uuid) from public, anon;
grant execute on function public.agency_services_restore(uuid) to authenticated, service_role;

-- setores de um membro (só o Adm)
create or replace function public.agency_member_sectors_set(p_agency uuid, p_user uuid, p_sectors text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_before text[]; v_after text[];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct s order by s), '{}'::text[]) into v_after from unnest(coalesce(p_sectors, '{}'::text[])) s;
  if exists (select 1 from unnest(v_after) s where not public.roadmap_sector_ok(s)) then raise exception 'invalid_input' using errcode = '22023'; end if;
  select m.sectors into v_before from public.agency_members m where m.agency_id = p_agency and m.user_id = p_user and m.revoked_at is null for update;
  if v_before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.agency_members set sectors = v_after where agency_id = p_agency and user_id = p_user and revoked_at is null;
  perform public.audit_log('agency.member_sectors', 'agency_member', p_user::text, jsonb_build_object('agency_id', p_agency, 'sectors', to_jsonb(v_before)),
    jsonb_build_object('agency_id', p_agency, 'sectors', to_jsonb(v_after)), null, public.talent_audit_actor('agency', p_agency));
  return v_after;
end $$;
revoke execute on function public.agency_member_sectors_set(uuid, uuid, text[]) from public, anon;
grant execute on function public.agency_member_sectors_set(uuid, uuid, text[]) to authenticated, service_role;

-- 8) roteiro do negócio: geração e cadeia de prazos ------------------------------------------------------------------
-- recalcula disponível/vence de cada etapa aberta (ver D2/D3) e conclui as automáticas alcançadas. Devolve quantas mudaram.
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
           from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.status <> 'cancelled'
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
      -- etapa aberta e vencida termina "hoje" para a previsão das seguintes
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

-- concluir/reabrir uma etapa (por qualquer RPC) recalcula a cadeia
create or replace function public.tasks_roadmap_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.roadmap_recalc', true), '') = '1' then return null; end if;
  perform public.roadmap_recalc(new.deal_id);
  return null;
end $$;
revoke execute on function public.tasks_roadmap_after() from public, anon, authenticated;
drop trigger if exists trg_tasks_roadmap on public.tasks;
create trigger trg_tasks_roadmap after update of status on public.tasks for each row
  when (new.roadmap_position is not null and old.status is distinct from new.status) execute function public.tasks_roadmap_after();

-- gera as etapas do serviço como tarefas do negócio (interna: as RPCs conferem quem pode)
create or replace function public.deal_roadmap_generate(p_deal uuid, p_service uuid, p_start date)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; s public.agency_services%rowtype; v_n int;
begin
  select * into d from public.deals where id = p_deal for update;
  select * into s from public.agency_services where id = p_service;
  if d.id is null or s.id is null or s.agency_id <> d.agency_id or not s.active then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.agency_service_steps x where x.service_id = s.id) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.deals set service_id = s.id, roadmap_started_on = p_start where id = p_deal;
  insert into public.tasks (agency_id, deal_id, title, description, side, status, sector, sector_extra, roadmap_step_id, roadmap_position, client_visible,
                            due_rule, due_days, recurrence, depends_on_prev, automatic, milestone, created_by)
  select d.agency_id, p_deal, x.title, x.description, 'agency', 'todo', x.sector, x.sector_extra, x.id, row_number() over (order by x.position), x.client_visible,
         x.due_rule, x.due_days, x.recurrence, x.depends_on_prev, x.automatic, x.milestone, auth.uid()
  from public.agency_service_steps x where x.service_id = s.id order by x.position;
  get diagnostics v_n = row_count;
  perform public.roadmap_recalc(p_deal);
  insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
  values (d.agency_id, 'deal', p_deal, 'system', 'roadmap_started|' || s.name, auth.uid(), public.actor_label(d.agency_id));
  return v_n;
end $$;
revoke execute on function public.deal_roadmap_generate(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.deal_roadmap_generate(uuid, uuid, date) to service_role;

-- data de início válida (hoje no fuso da agência quando vazia; até 1 ano para trás ou para a frente)
create or replace function public.roadmap_start_date(p_agency uuid, p_start date)
returns date language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo'))::date;
begin
  if p_start is null then return v_today; end if;
  if p_start < v_today - 366 or p_start > v_today + 366 then raise exception 'invalid_input' using errcode = '22023'; end if;
  return p_start;
end $$;
revoke execute on function public.roadmap_start_date(uuid, date) from public, anon, authenticated;
grant execute on function public.roadmap_start_date(uuid, date) to service_role;

-- escolher o serviço do negócio e gerar o roteiro (responsável/equipe do negócio ou gestor+). Trocar o serviço só
-- enquanto nenhuma etapa foi concluída (p_replace apaga as etapas abertas do roteiro anterior).
create or replace function public.deal_roadmap_start(p_deal uuid, p_service uuid, p_start date default null, p_replace boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_n int;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if not exists (select 1 from public.agency_services s where s.id = p_service and s.agency_id = v_agency and s.active) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null) then
    if exists (select 1 from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.status = 'done' and not k.automatic) then
      raise exception 'roadmap_started' using errcode = 'P0001';
    end if;
    if not coalesce(p_replace, false) then raise exception 'roadmap_exists' using errcode = 'P0001'; end if;
    delete from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null;
  end if;
  v_n := public.deal_roadmap_generate(p_deal, p_service, public.roadmap_start_date(v_agency, p_start));
  perform public.audit_log('deal.roadmap_start', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', v_agency, 'service_id', p_service, 'steps', v_n, 'replace', coalesce(p_replace, false)), null, public.talent_audit_actor('agency', v_agency));
  return v_n;
end $$;
revoke execute on function public.deal_roadmap_start(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.deal_roadmap_start(uuid, uuid, date, boolean) to authenticated, service_role;

-- herói-cliente do negócio (gestor+ ou responsável/equipe); nulo só se houver marca
create or replace function public.deal_client_set(p_deal uuid, p_talent uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_brand uuid; v_before uuid;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  select d.brand_id, d.client_talent_id into v_brand, v_before from public.deals d where d.id = p_deal;
  if p_talent is null and v_brand is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_talent is not null and not exists (select 1 from public.talent_profiles t where t.id = p_talent and t.agency_id = v_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.deals set client_talent_id = p_talent where id = p_deal;
  perform public.audit_log('deal.client', 'deal', p_deal::text, jsonb_build_object('agency_id', v_agency, 'client_talent_id', v_before),
    jsonb_build_object('agency_id', v_agency, 'client_talent_id', p_talent), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.deal_client_set(uuid, uuid) from public, anon;
grant execute on function public.deal_client_set(uuid, uuid) to authenticated, service_role;

-- abrir negócio com cliente (marca e/ou herói) e, opcionalmente, o serviço (gera o roteiro na hora)
create or replace function public.agency_deal_open(p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_brand uuid; v_talent uuid; v_service uuid; v_start date; v_deal uuid; v_title text; v_from date; v_to date; v_owner uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency and a.status = 'active') or not public.agency_can(p_agency, 'staff') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    v_brand := nullif(btrim(coalesce(p_data ->> 'brand_id', '')), '')::uuid;
    v_talent := nullif(btrim(coalesce(p_data ->> 'client_talent_id', '')), '')::uuid;
    v_service := nullif(btrim(coalesce(p_data ->> 'service_id', '')), '')::uuid;
    v_start := nullif(btrim(coalesce(p_data ->> 'start_on', '')), '')::date;
    v_from := nullif(btrim(coalesce(p_data ->> 'expected_start', '')), '')::date;
    v_to := nullif(btrim(coalesce(p_data ->> 'expected_end', '')), '')::date;
    if p_data ? 'owner_id' then v_owner := nullif(btrim(coalesce(p_data ->> 'owner_id', '')), '')::uuid; end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_brand is null and v_talent is null then raise exception 'client_required' using errcode = '22023'; end if;
  if v_talent is not null and not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_service is not null and not exists (select 1 from public.agency_services s where s.id = v_service and s.agency_id = p_agency and s.active) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_start := public.roadmap_start_date(p_agency, v_start);
  if v_brand is not null then
    -- mesmo caminho de sempre (pedido de origem "agência" + negócio); depois o herói-cliente
    v_deal := public.agency_deal_create(p_agency, v_brand, p_data);
    if v_talent is not null then update public.deals set client_talent_id = v_talent where id = v_deal; end if;
  else
    -- só o herói: sem pedido de campanha (que exige marca)
    v_title := btrim(coalesce(p_data ->> 'title', ''));
    if not public.agency_can(p_agency, 'manager') then v_owner := auth.uid(); end if;
    v_owner := coalesce(v_owner, auth.uid());
    if not exists (select 1 from public.agency_members m where m.agency_id = p_agency and m.user_id = v_owner and m.revoked_at is null)
       and not (v_owner = auth.uid() and public.is_platform_admin()) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    begin
      insert into public.deals (agency_id, brand_id, client_talent_id, title, stage, owner_id, created_by, brand_visible, talent_brief, expected_start, expected_end, is_demo)
      values (p_agency, null, v_talent, v_title, 'briefing_received', v_owner, auth.uid(), false, btrim(coalesce(p_data ->> 'talent_brief', '')), v_from, v_to,
              public.agency_is_demo(p_agency))
      returning id into v_deal;
    exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
    end;
    insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
    values (p_agency, 'deal', v_deal, 'system', 'deal_created', auth.uid(), public.actor_label(p_agency));
    if btrim(coalesce(p_data ->> 'notes', '')) <> '' then
      insert into public.activities (agency_id, subject_type, deal_id, kind, body, author_id, author_label)
      values (p_agency, 'deal', v_deal, 'note', left(btrim(p_data ->> 'notes'), 2000), auth.uid(), public.actor_label(p_agency));
    end if;
    perform public.audit_log('deal.create', 'deal', v_deal::text, null,
      jsonb_build_object('agency_id', p_agency, 'client_talent_id', v_talent, 'owner_id', v_owner), null, public.talent_audit_actor('agency', p_agency));
    if v_owner <> auth.uid() then
      perform public.inbox_notify(v_owner, 'deal_assigned', '/agencia/negocios/' || v_deal::text, jsonb_build_object('deal', v_title), p_agency, 'deal', v_deal, null);
    end if;
  end if;
  if v_service is not null then perform public.deal_roadmap_generate(v_deal, v_service, v_start); end if;
  return v_deal;
end $$;
revoke execute on function public.agency_deal_open(uuid, jsonb) from public, anon;
grant execute on function public.agency_deal_open(uuid, jsonb) to authenticated, service_role;

-- 9) etapas: concluir/reabrir e reatribuir ---------------------------------------------------------------------------
-- quem trabalha a etapa: gestor+, responsável, quem criou, equipe do negócio ou quem é do setor da etapa
create or replace function public.roadmap_task_can_work(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks k where k.id = p_task and k.roadmap_position is not null and public.agency_can(k.agency_id, 'staff')
    and (public.agency_can(k.agency_id, 'manager') or k.assignee_id = auth.uid() or k.created_by = auth.uid() or k.deal_id = any (public.my_staff_deal_ids())
         or (k.agency_id::text || ':' || k.sector) = any (public.my_agency_sector_keys())
         or (k.sector_extra is not null and (k.agency_id::text || ':' || k.sector_extra) = any (public.my_agency_sector_keys()))))
$$;
revoke execute on function public.roadmap_task_can_work(uuid) from public, anon;
grant execute on function public.roadmap_task_can_work(uuid) to authenticated, service_role;

create or replace function public.roadmap_task_set(p_task uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype; v_stage text; v_status text := case when coalesce(p_done, false) then 'done' else 'todo' end;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.tasks where id = p_task and roadmap_position is not null for update;
  if t.id is null or not public.agency_can(t.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.roadmap_task_can_work(p_task) then raise exception 'forbidden' using errcode = '42501'; end if;
  select d.stage into v_stage from public.deals d where d.id = t.deal_id;
  if v_stage = 'closed' then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  if t.status = 'cancelled' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.status = v_status then return; end if;
  update public.tasks set status = v_status, completed_by = case when v_status = 'done' then auth.uid() end where id = p_task;
  perform public.audit_log('task.status', 'task', p_task::text, jsonb_build_object('agency_id', t.agency_id, 'status', t.status),
    jsonb_build_object('agency_id', t.agency_id, 'status', v_status, 'roadmap_position', t.roadmap_position), null, public.talent_audit_actor('agency', t.agency_id));
end $$;
revoke execute on function public.roadmap_task_set(uuid, boolean) from public, anon;
grant execute on function public.roadmap_task_set(uuid, boolean) to authenticated, service_role;

-- reatribuir: responsável (membro ativo ou ninguém) e setor; gestor+ ou responsável/equipe do negócio
create or replace function public.roadmap_task_assign(p_task uuid, p_assignee uuid, p_sector text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.tasks where id = p_task and roadmap_position is not null;
  if t.id is null or not public.agency_can(t.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.deal_write_scope(t.deal_id, true);
  if p_sector is null or not public.roadmap_sector_ok(p_sector) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_assignee is not null and not exists (select 1 from public.agency_members m where m.agency_id = t.agency_id and m.user_id = p_assignee and m.revoked_at is null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.tasks set assignee_id = p_assignee, sector = p_sector, sector_extra = case when sector_extra = p_sector then null else sector_extra end where id = p_task;
  if p_assignee is not null and p_assignee <> auth.uid() and t.assignee_id is distinct from p_assignee then
    select d.title into v_title from public.deals d where d.id = t.deal_id;
    perform public.inbox_notify(p_assignee, 'task_assigned', '/agencia', jsonb_build_object('deal', v_title, 'title', t.title), t.agency_id, 'task', p_task,
      'task:' || p_task::text || ':' || p_assignee::text);
  end if;
  perform public.audit_log('task.assign', 'task', p_task::text, jsonb_build_object('agency_id', t.agency_id, 'assignee_id', t.assignee_id, 'sector', t.sector),
    jsonb_build_object('agency_id', t.agency_id, 'assignee_id', p_assignee, 'sector', p_sector), null, public.talent_audit_actor('agency', t.agency_id));
end $$;
revoke execute on function public.roadmap_task_assign(uuid, uuid, text) from public, anon;
grant execute on function public.roadmap_task_assign(uuid, uuid, text) to authenticated, service_role;

-- 10) leituras ---------------------------------------------------------------------------------------------------------
-- situação do roteiro: dia X de N úteis, no prazo/atrasado, previsão (p_client: só as etapas visíveis ao cliente)
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
  from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.status <> 'cancelled' and (not p_client or k.client_visible);
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

-- roteiro completo para a agência (gestor+ ou responsável/equipe do negócio)
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
  where k.deal_id = p_deal and k.roadmap_position is not null and k.status <> 'cancelled';
  return jsonb_build_object('service', v_service, 'progress', public.roadmap_progress(p_deal, false), 'tasks', v_tasks, 'can_edit', v_can_edit,
    'can_replace', v_can_edit and not exists (select 1 from public.tasks k where k.deal_id = p_deal and k.roadmap_position is not null and k.status = 'done' and not k.automatic));
end $$;
revoke execute on function public.deal_roadmap(uuid) from public, anon;
grant execute on function public.deal_roadmap(uuid) to authenticated, service_role;

-- "Hoje no meu setor": atrasadas, vencem hoje e no próximo dia útil + % no prazo no mês. Escopo: sector | mine | all.
-- Colaborador só enxerga etapas do setor dele, as dele e as dos negócios em que está.
create or replace function public.roadmap_today(p_agency uuid, p_scope text default 'sector')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_scope text := case when p_scope in ('sector', 'mine', 'all') then p_scope else 'sector' end; v_manager boolean; v_sectors text[];
        v_tz text; v_today date; v_next date; v_month date; v_staff_deals uuid[]; v_items jsonb; v_done int; v_on_time int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_manager := public.agency_can(p_agency, 'manager');
  select coalesce(m.sectors, '{}'::text[]) into v_sectors from public.agency_members m where m.agency_id = p_agency and m.user_id = auth.uid() and m.revoked_at is null;
  v_sectors := coalesce(v_sectors, '{}'::text[]);
  v_staff_deals := public.my_staff_deal_ids();
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  v_next := public.br_next_business_day(v_today);
  v_month := date_trunc('month', v_today)::date;
  with base as (
    select k.*, d.title as deal_title, d.stage as deal_stage, coalesce(b.name, '') as brand_name, coalesce(tp.display_name, '') as talent_name
    from public.tasks k
    join public.deals d on d.id = k.deal_id
    left join public.brands b on b.id = d.brand_id
    left join public.talent_profiles tp on tp.id = d.client_talent_id
    where k.agency_id = p_agency and k.roadmap_position is not null and d.stage <> 'closed'
      and (v_manager or k.sector = any (v_sectors) or k.sector_extra = any (v_sectors) or k.assignee_id = auth.uid() or k.deal_id = any (v_staff_deals))
      and case v_scope when 'sector' then (k.sector = any (v_sectors) or k.sector_extra = any (v_sectors))
                       when 'mine' then k.assignee_id = auth.uid() else true end
  ), open_items as (
    select x.*, case when x.due_on < v_today then 'overdue' when x.due_on = v_today then 'today' else 'next' end as bucket
    from base x where x.status in ('todo', 'doing', 'blocked') and x.due_on is not null and x.due_on <= v_next
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'bucket', o.bucket, 'title', o.title, 'sector', o.sector, 'sector_extra', o.sector_extra,
           'deal_id', o.deal_id, 'deal_title', o.deal_title, 'client', concat_ws(' · ', nullif(o.brand_name, ''), nullif(o.talent_name, '')),
           'due_on', o.due_on, 'assignee_id', o.assignee_id, 'assignee_name', m.display_name, 'position', o.roadmap_position,
           'can_open', v_manager or o.deal_id = any (v_staff_deals)) order by o.due_on, o.deal_title, o.roadmap_position), '[]'::jsonb)
    into v_items
  from (select * from open_items order by due_on, roadmap_position limit 150) o
  left join public.agency_members m on m.agency_id = o.agency_id and m.user_id = o.assignee_id and m.revoked_at is null;
  select count(*), count(*) filter (where (k.completed_at at time zone v_tz)::date <= k.due_on) into v_done, v_on_time
  from public.tasks k join public.deals d on d.id = k.deal_id
  where k.agency_id = p_agency and k.roadmap_position is not null and k.status = 'done' and k.due_on is not null and not k.automatic
    and (k.completed_at at time zone v_tz)::date >= v_month
    and (v_manager or k.sector = any (v_sectors) or k.sector_extra = any (v_sectors) or k.assignee_id = auth.uid() or k.deal_id = any (v_staff_deals))
    and case v_scope when 'sector' then (k.sector = any (v_sectors) or k.sector_extra = any (v_sectors)) when 'mine' then k.assignee_id = auth.uid() else true end;
  return jsonb_build_object('scope', v_scope, 'sectors', to_jsonb(v_sectors), 'is_manager', v_manager, 'today', v_today, 'next', v_next,
    'items', v_items, 'month', jsonb_build_object('done', v_done, 'on_time', v_on_time));
end $$;
revoke execute on function public.roadmap_today(uuid, text) from public, anon;
grant execute on function public.roadmap_today(uuid, text) to authenticated, service_role;

-- indicadores (gestor+): % no prazo, tempo médio por etapa (dias úteis), setor com mais atraso, por serviço
create or replace function public.roadmap_indicators(p_agency uuid, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_today date; v_from date; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = p_agency), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - greatest(least(coalesce(p_days, 90), 366), 7);
  with done as (
    select k.sector, k.title, s.name as service_name, (k.completed_at at time zone v_tz)::date as done_on, k.due_on, k.available_on
    from public.tasks k left join public.deals d on d.id = k.deal_id left join public.agency_services s on s.id = d.service_id
    where k.agency_id = p_agency and k.roadmap_position is not null and k.status = 'done' and not k.automatic and k.due_on is not null
      and (k.completed_at at time zone v_tz)::date >= v_from
  ), dd as (
    select x.*, x.done_on <= x.due_on as on_time,
           case when x.available_on is null or x.done_on < x.available_on then 1 else 1 + public.br_business_days_between(x.available_on, x.done_on) end as took
    from done x
  ), late_open as (
    select k.sector, count(*) as n from public.tasks k join public.deals d on d.id = k.deal_id
    where k.agency_id = p_agency and k.roadmap_position is not null and k.status in ('todo', 'doing', 'blocked') and k.due_on < v_today and d.stage <> 'closed'
    group by k.sector
  ), sectors as (
    select s.sector,
      (select count(*) from dd where dd.sector = s.sector) as done,
      (select count(*) from dd where dd.sector = s.sector and dd.on_time) as on_time,
      (select count(*) from dd where dd.sector = s.sector and not dd.on_time) as late_done,
      coalesce((select n from late_open l where l.sector = s.sector), 0) as late_open,
      (select round(avg(dd.took)::numeric, 1) from dd where dd.sector = s.sector) as avg_days
    from unnest(array['gestor', 'estrategia', 'operacao', 'comunicacao']) s(sector)
  )
  select jsonb_build_object(
    'from', v_from, 'today', v_today,
    'done', (select count(*) from dd), 'on_time', (select count(*) from dd where on_time),
    'late_open', (select coalesce(sum(n), 0) from late_open),
    'avg_days', (select round(avg(took)::numeric, 1) from dd),
    'sectors', (select coalesce(jsonb_agg(jsonb_build_object('sector', sector, 'done', done, 'on_time', on_time, 'late_done', late_done, 'late_open', late_open,
                  'avg_days', avg_days) order by sector), '[]'::jsonb) from sectors),
    'worst_sector', (select sector from sectors where late_done + late_open > 0 order by late_done + late_open desc, sector limit 1),
    'slowest_steps', (select coalesce(jsonb_agg(x order by (x ->> 'avg_days')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('service', coalesce(service_name, ''), 'title', title, 'count', count(*), 'avg_days', round(avg(took)::numeric, 1)) as x
        from dd group by service_name, title order by avg(took) desc, title limit 5) z),
    'services', (select coalesce(jsonb_agg(x order by x ->> 'service'), '[]'::jsonb) from (
        select jsonb_build_object('service', coalesce(service_name, ''), 'done', count(*), 'on_time', count(*) filter (where on_time)) as x
        from dd group by service_name) z))
  into v_out;
  return v_out;
end $$;
revoke execute on function public.roadmap_indicators(uuid, int) from public, anon;
grant execute on function public.roadmap_indicators(uuid, int) to authenticated, service_role;

-- projetos em que o herói é cliente (Portal do Herói): só as etapas visíveis ao cliente, sem responsáveis nem valores
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
                from public.tasks k where k.deal_id = d.id and k.roadmap_position is not null and k.client_visible and k.status <> 'cancelled'))
    order by (d.stage = 'closed'), d.roadmap_started_on desc), '[]'::jsonb)
    into v_out
  from public.deals d join public.agencies a on a.id = d.agency_id and a.status = 'active'
  left join public.brands b on b.id = d.brand_id
  where d.client_talent_id = v_talent and d.roadmap_started_on is not null and (d.outcome is null or d.outcome = 'won');
  return v_out;
end $$;
revoke execute on function public.client_projects() from public, anon;
grant execute on function public.client_projects() to authenticated, service_role;

-- 11) avisos -----------------------------------------------------------------------------------------------------------
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
  'roadmap_due_soon', 'roadmap_overdue'));

-- link do aviso para a pessoa: o roteiro do negócio se ela pode abrir; senão o painel "Hoje no meu setor"
create or replace function public.roadmap_link_for(p_user uuid, p_agency uuid, p_deal uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.agency_members m where m.agency_id = p_agency and m.user_id = p_user and m.revoked_at is null and m.role in ('admin', 'manager'))
                or exists (select 1 from public.deals d where d.id = p_deal and d.owner_id = p_user)
                or exists (select 1 from public.deal_team t where t.deal_id = p_deal and t.user_id = p_user)
              then '/agencia/negocios/' || p_deal::text || '/roteiro' else '/agencia' end
$$;
revoke execute on function public.roadmap_link_for(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.roadmap_link_for(uuid, uuid, uuid) to service_role;

-- varredura diária (service role): recalcula a previsão dos roteiros abertos, avisa 1 dia útil antes (responsável,
-- senão o setor, senão os gestores) e avisa o atraso a quem é do setor Gestor (senão aos gestores). 1 aviso por prazo.
create or replace function public.roadmap_alert_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; k record; u record; v_today date; v_next date; v_soon int := 0; v_over int := 0; v_deals int := 0; v_params jsonb; v_sent boolean;
begin
  for r in select distinct x.deal_id from public.tasks x join public.deals d on d.id = x.deal_id join public.agencies a on a.id = d.agency_id and a.status = 'active'
           where x.roadmap_position is not null and x.status in ('todo', 'doing', 'blocked') and d.stage <> 'closed' loop
    perform public.roadmap_recalc(r.deal_id);
    v_deals := v_deals + 1;
  end loop;
  for k in select tk.id, tk.agency_id, tk.deal_id, tk.title, tk.sector, tk.sector_extra, tk.assignee_id, tk.due_on, d.title as deal_title,
                  (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date as today
           from public.tasks tk join public.deals d on d.id = tk.deal_id join public.agencies a on a.id = tk.agency_id and a.status = 'active'
           where tk.roadmap_position is not null and tk.status in ('todo', 'doing', 'blocked') and d.stage <> 'closed' and tk.due_on is not null and not tk.automatic loop
    v_today := k.today; v_next := public.br_next_business_day(v_today);
    v_params := jsonb_build_object('deal', k.deal_title, 'title', k.title, 'date', to_char(k.due_on, 'YYYY-MM-DD'));
    if k.due_on = v_next then
      v_sent := false;
      if k.assignee_id is not null and exists (select 1 from public.agency_members m where m.agency_id = k.agency_id and m.user_id = k.assignee_id and m.revoked_at is null) then
        if public.inbox_notify(k.assignee_id, 'roadmap_due_soon', public.roadmap_link_for(k.assignee_id, k.agency_id, k.deal_id), v_params, k.agency_id, 'task', k.id,
             'rm_soon:' || k.id::text || ':' || k.due_on::text || ':' || k.assignee_id::text) is not null then v_soon := v_soon + 1; end if;
        v_sent := true;
      end if;
      if not v_sent then
        for u in select m.user_id from public.agency_members m where m.agency_id = k.agency_id and m.revoked_at is null
                 and (k.sector = any (m.sectors) or k.sector_extra = any (m.sectors)) loop
          if public.inbox_notify(u.user_id, 'roadmap_due_soon', public.roadmap_link_for(u.user_id, k.agency_id, k.deal_id), v_params, k.agency_id, 'task', k.id,
               'rm_soon:' || k.id::text || ':' || k.due_on::text || ':' || u.user_id::text) is not null then v_soon := v_soon + 1; end if;
          v_sent := true;
        end loop;
      end if;
      if not v_sent then
        v_soon := v_soon + public.inbox_notify_agency(k.agency_id, 'manager', 'roadmap_due_soon', '/agencia/negocios/' || k.deal_id::text || '/roteiro', v_params, 'task', k.id,
          'rm_soon:' || k.id::text || ':' || k.due_on::text);
      end if;
    elsif k.due_on < v_today then
      v_sent := false;
      for u in select m.user_id from public.agency_members m where m.agency_id = k.agency_id and m.revoked_at is null and 'gestor' = any (m.sectors) loop
        if public.inbox_notify(u.user_id, 'roadmap_overdue', public.roadmap_link_for(u.user_id, k.agency_id, k.deal_id), v_params, k.agency_id, 'task', k.id,
             'rm_over:' || k.id::text || ':' || k.due_on::text || ':' || u.user_id::text) is not null then v_over := v_over + 1; end if;
        v_sent := true;
      end loop;
      if not v_sent then
        v_over := v_over + public.inbox_notify_agency(k.agency_id, 'manager', 'roadmap_overdue', '/agencia/negocios/' || k.deal_id::text || '/roteiro', v_params, 'task', k.id,
          'rm_over:' || k.id::text || ':' || k.due_on::text);
      end if;
    end if;
  end loop;
  perform public.audit_log('agency.roadmap_scan', 'agency', 'all', null, jsonb_build_object('deals', v_deals, 'due_soon', v_soon, 'overdue', v_over), null, 'system');
  return jsonb_build_object('deals', v_deals, 'due_soon', v_soon, 'overdue', v_over);
end $$;
revoke execute on function public.roadmap_alert_scan() from public, anon, authenticated;
grant execute on function public.roadmap_alert_scan() to service_role;

-- os avisos antigos de prazo (0072/0084) deixam as etapas do roteiro para a varredura própria (MESMAS assinaturas)
create or replace function public.agency_relationship_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; t record; k record; v_ag int := 0; v_rel int := 0; v_over int := 0; v_week text := to_char(now(), 'IYYY-IW');
        v_to uuid; v_talent_user uuid; v_link text; v_params jsonb; v_dedupe text;
begin
  for a in select * from public.agencies where status = 'active' loop
    v_ag := v_ag + 1;
    for t in select tp.id, tp.display_name, tp.manager_id, extract(day from now() - coalesce(tp.last_contact_at, tp.created_at))::int as days
             from public.talent_profiles tp
             where tp.agency_id = a.id and tp.archived_at is null and tp.commercial_status = 'active'
               and coalesce(tp.last_contact_at, tp.created_at) < now() - make_interval(days => a.relationship_alert_days) loop
      v_params := jsonb_build_object('talent', t.display_name, 'days', t.days::text);
      v_dedupe := 'rel:' || t.id::text || ':' || v_week;
      if t.manager_id is not null and exists (select 1 from public.agency_members m where m.agency_id = a.id and m.user_id = t.manager_id and m.revoked_at is null) then
        if public.inbox_notify(t.manager_id, 'relationship_alert', '/agencia/casting/' || t.id::text, v_params, a.id, 'talent', t.id, v_dedupe) is not null then v_rel := v_rel + 1; end if;
      else
        v_rel := v_rel + public.inbox_notify_agency(a.id, 'manager', 'relationship_alert', '/agencia/casting/' || t.id::text, v_params, 'talent', t.id, v_dedupe);
      end if;
    end loop;
    for k in select tk.id, tk.title, tk.template_step, tk.side, tk.assignee_id, tk.deal_id, tk.talent_id, d.owner_id, d.title as deal_title
             from public.tasks tk left join public.deals d on d.id = tk.deal_id
             where tk.agency_id = a.id and tk.status in ('todo', 'doing', 'blocked') and tk.due_at < now() and tk.roadmap_position is null loop
      v_talent_user := case when k.side = 'talent' then public.talent_user_id(k.talent_id) end;
      v_to := coalesce(k.assignee_id, v_talent_user, k.owner_id);
      v_params := jsonb_build_object('deal', coalesce(k.deal_title, nullif(k.title, ''), ''), 'step', coalesce(k.template_step::text, ''));
      v_dedupe := 'overdue:' || k.id::text || ':' || current_date::text;
      if v_to is not null then
        v_link := case when v_to = v_talent_user then '/creator/escritorio/tarefas' when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas?f=overdue' end;
        if public.inbox_notify(v_to, 'task_overdue', v_link, v_params, a.id, 'task', k.id, v_dedupe) is not null then v_over := v_over + 1; end if;
      else
        v_link := case when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas?f=overdue' end;
        v_over := v_over + public.inbox_notify_agency(a.id, 'manager', 'task_overdue', v_link, v_params, 'task', k.id, v_dedupe);
      end if;
    end loop;
  end loop;
  perform public.audit_log('agency.relationship_scan', 'agency', 'all', null, jsonb_build_object('agencies', v_ag, 'relationship_alerts', v_rel, 'overdue_alerts', v_over), null, 'system');
  return jsonb_build_object('agencies', v_ag, 'relationship_alerts', v_rel, 'overdue_alerts', v_over);
end $$;
revoke execute on function public.agency_relationship_scan() from public, anon, authenticated;
grant execute on function public.agency_relationship_scan() to service_role;

create or replace function public.task_due_soon_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare k record; v_to uuid; v_talent_user uuid; v_link text; v_params jsonb; v_dedupe text; v_n int := 0;
begin
  for k in select tk.id, tk.agency_id, tk.title, tk.template_step, tk.side, tk.assignee_id, tk.deal_id, tk.talent_id, tk.due_at, d.owner_id, d.title as deal_title,
                  coalesce(ag.timezone, 'America/Sao_Paulo') as tz
           from public.tasks tk
           join public.agencies ag on ag.id = tk.agency_id and ag.status = 'active'
           left join public.deals d on d.id = tk.deal_id
           where tk.status in ('todo', 'doing', 'blocked') and tk.due_at > now() and tk.due_at <= now() + interval '24 hours' and tk.roadmap_position is null loop
    v_talent_user := case when k.side = 'talent' then public.talent_user_id(k.talent_id) end;
    v_to := coalesce(k.assignee_id, v_talent_user, k.owner_id);
    v_params := jsonb_build_object('deal', coalesce(k.deal_title, nullif(k.title, ''), ''), 'step', coalesce(k.template_step::text, ''),
      'date', to_char(k.due_at at time zone k.tz, 'YYYY-MM-DD HH24:MI'));
    v_dedupe := 'due_soon:' || k.id::text || ':' || to_char(k.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
    if v_to is not null then
      v_link := case when v_to = v_talent_user then '/creator/escritorio/tarefas' when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas' end;
      if public.inbox_notify(v_to, 'task_due_soon', v_link, v_params, k.agency_id, 'task', k.id, v_dedupe) is not null then v_n := v_n + 1; end if;
    else
      v_link := case when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas' end;
      v_n := v_n + public.inbox_notify_agency(k.agency_id, 'manager', 'task_due_soon', v_link, v_params, 'task', k.id, v_dedupe);
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.task_due_soon_scan() from public, anon, authenticated;
grant execute on function public.task_due_soon_scan() to service_role;
