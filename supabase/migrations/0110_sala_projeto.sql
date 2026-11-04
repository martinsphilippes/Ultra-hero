-- =============================================================================
-- Groscove Ultra · 0110 · Roteiros de entrega — FASE 2: sala do projeto e fechamento do ciclo · cenário S116
-- Fonte: PDF "Nosso processo de entrega 2027" + especificação aprovada (a sala SUBSTITUI o grupo de WhatsApp do staff;
-- staff externo entra no app; cliente = marca e/ou herói). Idempotente; nada de drop de tabela/coluna; search_path fixo;
-- nenhuma função nova executável por anon (S14 segue 18). Só RPCs security definer escrevem.
--
-- Decisões (sem perguntar ao responsável):
--   • D1 Sala = tabela própria (project_rooms + project_room_messages), não um canal novo em deal_messages: aquele é 1:1
--     (marca↔agência, herói↔agência), exige marca (brand_id not null) e alimenta os contadores de "não lidas"/Hoje
--     (0078/0081). A sala é multi-parte com público por mensagem: 'all' (todos da sala) ou 'internal' (agência + staff
--     externo). A marca e os heróis nunca leem 'internal'. Nada de valor passa pela sala (a tela não tem campo de valor).
--   • D2 Quem está na sala (project_room_side): agência = gestor+ ou responsável/equipe do negócio (lê tudo, inclusive
--     arquivada); staff externo = convidado ativo (project_room_members) DEPOIS de assinar o NDA; herói = herói-cliente
--     (deals.client_talent_id) ou herói contratado no negócio (deal_talents 'contracted') — assina NDA só se a agência
--     marcar "heróis também assinam" (nda_heroes); marca = membros da marca com o negócio visível (brand_visible).
--     Sala arquivada: só a agência lê (somente leitura); para os outros, a sala some (o clipping e o feedback seguem).
--   • D3 Abertura automática: ao gerar o roteiro (roadmap_started_on) ou quando o negócio chega a "aprovado" (8) ou além;
--     fechamento: negócio encerrado → sala arquivada, clipping congelado (snapshot), pedido de feedback de fechamento ao
--     cliente (só se ganho) e o acesso de staff/herói/marca termina. A agência pode arquivar/reabrir à mão (gestor+).
--   • D4 Staff externo: convite próprio (project_room_members, token com hash como invitations), por negócio, com função
--     (fotógrafo, maquiador…). NÃO passa pelo interruptor invites_enabled (0103): o convite não dá papel nenhum na
--     plataforma, só a sala daquele negócio (decisão do responsável: "convite de staff pela agência deve funcionar").
--     Aceite exige login com o MESMO e-mail. Membro da própria agência não é convidado como staff (already_member).
--   • D5 NDA: modelo editável pelo Adm (agency_project_settings, junto das Normas Groscove), versão sobe quando o texto
--     muda. Assinatura eletrônica simples igual à dos termos (0084): nome completo + CPF/CNPJ (br_tax_id_kind), e-mail
--     da conta, IP e navegador (lidos pelo servidor), hash SHA-256 do texto exato assinado (texto canônico com agência,
--     projeto, versão, NDA e normas) — a tela manda o hash visto (terms_changed se mudou). Vale por negócio e pessoa.
--   • D6 Arquivos na sala (foto, áudio, PDF): mesmo bucket privado agency-docs, caminho <agência>/room/<negócio>/<msg>.<ext>,
--     reserva → envio direto do navegador (política só para a própria reserva pendente < 1 h) → publicar. O bucket passa
--     a aceitar áudio (mp3/m4a/aac/ogg/webm). Leitura: URL assinada de 60 s com o cliente da própria pessoa; a política
--     do Storage usa a mesma regra da RPC project_room_file (sala, NDA e público; o guia de uso também pelo clipping).
--     Reservas não publicadas há > 24 h saem pelo cron (project_room_orphans).
--   • D7 Linhas de sistema: etapa do roteiro concluída ("step_done|título", público 'all' se a etapa é visível ao
--     cliente, senão 'internal'), sala aberta/arquivada, staff entrou, NDA assinado, diária publicada, chegada no local
--     (interna), prévia marcada, guia de uso. Texto "código|parâmetro" traduzido na tela.
--   • D8 Ficha da diária (project_shoot_days + project_shoot_crew): data/hora, local + link do mapa (https), estacionamento,
--     alimentação, limite de pessoas, observações e equipe com função (só quem está na sala). Vira compromisso na agenda
--     (calendar_events kind 'recording', origem manual — o sincronizador de negócios apaga eventos 'system' que ele não
--     gerou): a marca e o herói-cliente veem pelas regras da agenda; a equipe da diária (staff/heróis contratados) recebe
--     pelo feed .ics (calendar_events_for_user ganha a equipe da diária). "Cheguei ao local": cada pessoa da equipe marca
--     a própria chegada; a agência vê quem chegou.
--   • D9 Prévia (o "Demo" do PDF; a palavra "demonstração" saiu do sistema) e guia de uso: versão do entregável marcada
--     como prévia (deliverable_versions.is_preview) + data combinada da prévia (deliverables.preview_on); a aprovação é a
--     de sempre. Guia de uso = um PDF enviado na sala (público 'all') e marcado como guia (project_rooms.usage_guide_message_id):
--     fixado na sala e no clipping, visível ao cliente.
--   • D10 Feedback do cliente: project_feedback (0–10 + comentário) por negócio, momento (dia da produção | fechamento) e
--     parte (marca | herói-cliente). Pedido automático quando a etapa marco "Dia da produção" é concluída e quando o
--     negócio é encerrado como ganho; a agência também pode pedir. Responde: qualquer membro da marca / o herói-cliente.
--     Indicador (gestor+): nota média, NPS (9–10 promotores, 0–6 detratores) e as últimas respostas.
--   • D12 Avisos no sino com tipos que já existem (ver seção 4): o check de inbox_notifications não muda.
--   • D11 Clipping: montado do banco (entregas, links publicados, métricas mais recentes da 0083, equipe, prévias
--     aprovadas, guia de uso, diárias, andamento em dias úteis); congelado no arquivamento. Página imprimível (o PDF é o
--     "Salvar como PDF" do navegador). A sugestão de "próximo negócio" é calculada no app (src/lib/project-room/next-deal.ts).
-- =============================================================================

-- 1) normas e NDA da agência (Adm) ----------------------------------------------------------------------------------
create or replace function public.project_default_norms()
returns text language sql immutable set search_path = '' as $$
  select E'1. Chegue no horário combinado e confirme a chegada pelo botão "Cheguei ao local".\n'
      || E'2. Tudo o que acontece no projeto é confidencial: nada de fotos, vídeos ou comentários nas redes antes da liberação da agência.\n'
      || E'3. Combinações sobre horários, entregas e qualquer valor são feitas só com a agência, pela sala do projeto.\n'
      || E'4. Respeite o briefing, a marca, o herói e toda a equipe no set.\n'
      || E'5. Dúvidas ou imprevistos: avise na sala do projeto o quanto antes.'
$$;

create or replace function public.project_default_nda()
returns text language sql immutable set search_path = '' as $$
  select E'Pelo presente acordo, a pessoa que assina ("Participante") se compromete a manter em sigilo todas as informações a que tiver acesso em razão do projeto acima — briefings, roteiros, imagens, vídeos, áudios, materiais de marca, dados de clientes, datas e quaisquer outras informações não públicas ("Informações Confidenciais").\n\n'
      || E'1. O Participante usará as Informações Confidenciais apenas para executar o trabalho no projeto e não as divulgará, publicará, copiará ou compartilhará com terceiros, inclusive em redes sociais, sem autorização por escrito da agência.\n'
      || E'2. Fotos, vídeos e bastidores só podem ser publicados depois da liberação da agência.\n'
      || E'3. Ao fim do projeto, ou quando a agência pedir, o Participante apagará ou devolverá os materiais recebidos.\n'
      || E'4. O sigilo vale durante o projeto e por 2 (dois) anos depois do seu fim.\n'
      || E'5. O descumprimento sujeita o Participante a responder pelas perdas e danos causados, nos termos da lei.'
$$;
revoke execute on function public.project_default_norms() from public, anon;
revoke execute on function public.project_default_nda() from public, anon;
grant execute on function public.project_default_norms() to authenticated, service_role;
grant execute on function public.project_default_nda() to authenticated, service_role;

create table if not exists public.agency_project_settings (
  agency_id uuid primary key constraint agency_project_settings_agency_fk references public.agencies (id) on delete cascade,
  norms text not null,
  nda_text text not null,
  nda_version integer not null default 1,
  updated_by uuid constraint agency_project_settings_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_project_settings_texts_check check (char_length(btrim(norms)) between 10 and 6000 and char_length(btrim(nda_text)) between 50 and 20000),
  constraint agency_project_settings_version_check check (nda_version between 1 and 100000)
);

-- textos vigentes (linha da agência ou os padrões)
create or replace function public.project_settings_of(p_agency uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'norms', coalesce((select s.norms from public.agency_project_settings s where s.agency_id = p_agency), public.project_default_norms()),
    'nda_text', coalesce((select s.nda_text from public.agency_project_settings s where s.agency_id = p_agency), public.project_default_nda()),
    'nda_version', coalesce((select s.nda_version from public.agency_project_settings s where s.agency_id = p_agency), 1),
    'custom', exists (select 1 from public.agency_project_settings s where s.agency_id = p_agency),
    'updated_at', (select s.updated_at from public.agency_project_settings s where s.agency_id = p_agency))
$$;
revoke execute on function public.project_settings_of(uuid) from public, anon, authenticated;
grant execute on function public.project_settings_of(uuid) to service_role;

-- 2) sala, staff externo, NDA, mensagens, diária, feedback --------------------------------------------------------------
create table if not exists public.project_rooms (
  deal_id uuid primary key constraint project_rooms_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_rooms_agency_fk references public.agencies (id) on delete cascade,
  status text not null default 'open',
  briefing text not null default '',
  nda_heroes boolean not null default false,
  usage_guide_message_id uuid,
  clipping jsonb,
  opened_at timestamptz not null default now(),
  opened_by uuid constraint project_rooms_opened_by_fk references auth.users (id) on delete set null,
  archived_at timestamptz,
  archived_by uuid constraint project_rooms_archived_by_fk references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint project_rooms_status_check check (status in ('open', 'archived') and ((status = 'archived') = (archived_at is not null))),
  constraint project_rooms_briefing_check check (char_length(briefing) <= 6000)
);
create index if not exists project_rooms_agency_idx on public.project_rooms (agency_id, status);

create table if not exists public.project_room_members (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null constraint project_room_members_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_room_members_agency_fk references public.agencies (id) on delete cascade,
  email text not null,
  display_name text not null,
  job_function text not null,
  user_id uuid constraint project_room_members_user_fk references auth.users (id) on delete set null,
  status text not null default 'pending',
  token_hash text,
  expires_at timestamptz,
  invited_by uuid constraint project_room_members_invited_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  constraint project_room_members_status_check check (status in ('pending', 'active', 'removed')
    and ((status = 'active') = (user_id is not null and accepted_at is not null)) and ((status = 'removed') = (removed_at is not null))),
  constraint project_room_members_texts_check check (char_length(email) between 3 and 254 and char_length(btrim(display_name)) between 2 and 80
    and char_length(btrim(job_function)) between 2 and 60),
  constraint project_room_members_token_check check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$')
);
create unique index if not exists project_room_members_email_uq on public.project_room_members (deal_id, lower(email)) where status <> 'removed';
create unique index if not exists project_room_members_token_uq on public.project_room_members (token_hash) where token_hash is not null;
create index if not exists project_room_members_user_idx on public.project_room_members (user_id) where status = 'active';

create table if not exists public.project_nda_signatures (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null constraint project_nda_signatures_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_nda_signatures_agency_fk references public.agencies (id) on delete cascade,
  user_id uuid not null constraint project_nda_signatures_user_fk references auth.users (id) on delete cascade,
  side text not null,
  nda_version integer not null,
  signer_name text not null,
  signer_tax_id text not null,
  signer_tax_kind text not null,
  signer_email text not null default '',
  signer_ip text,
  signer_user_agent text not null default '',
  signed_text text not null,
  text_sha256 text not null,
  signed_at timestamptz not null default now(),
  constraint project_nda_signatures_uq unique (deal_id, user_id),
  constraint project_nda_signatures_side_check check (side in ('staff', 'talent')),
  constraint project_nda_signatures_name_check check (char_length(signer_name) between 5 and 120),
  constraint project_nda_signatures_tax_check check (signer_tax_kind in ('cpf', 'cnpj') and public.br_tax_id_kind(signer_tax_id) = signer_tax_kind
    and signer_tax_id = public.br_tax_id_normalize(signer_tax_id)),
  constraint project_nda_signatures_hash_check check (text_sha256 ~ '^[0-9a-f]{64}$'),
  constraint project_nda_signatures_meta_check check (char_length(signer_email) <= 320 and char_length(signer_user_agent) <= 400
    and (signer_ip is null or char_length(signer_ip) <= 64))
);

create table if not exists public.project_room_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null constraint project_room_messages_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_room_messages_agency_fk references public.agencies (id) on delete cascade,
  kind text not null default 'text',
  audience text not null default 'all',
  author_id uuid constraint project_room_messages_author_fk references auth.users (id) on delete set null,
  author_side text not null,
  author_label text not null default '',
  body text not null default '',
  attachment_path text,
  attachment_mime text,
  attachment_size bigint,
  attachment_name text,
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  constraint project_room_messages_kind_check check (kind in ('text', 'system') and ((kind = 'system') = (author_side = 'system'))),
  constraint project_room_messages_audience_check check (audience in ('all', 'internal')),
  constraint project_room_messages_side_check check (author_side in ('agency', 'brand', 'talent', 'staff', 'system')),
  constraint project_room_messages_status_check check (status in ('pending', 'posted')),
  constraint project_room_messages_body_check check (char_length(body) <= 4000 and char_length(author_label) <= 80
    and (status = 'pending' or char_length(btrim(body)) > 0 or attachment_path is not null)),
  constraint project_room_messages_attachment_check check ((attachment_path is null) = (attachment_mime is null)
    and (attachment_path is null or (attachment_size between 1 and 20971520 and char_length(coalesce(attachment_name, '')) between 1 and 120
      and attachment_path ~ ('^' || agency_id::text || '/room/' || deal_id::text || '/' || id::text || '\.(pdf|jpg|png|webp|mp3|m4a|aac|ogg|webm)$')))),
  constraint project_room_messages_path_uq unique (attachment_path)
);
create index if not exists project_room_messages_deal_idx on public.project_room_messages (deal_id, created_at);
create index if not exists project_room_messages_pending_idx on public.project_room_messages (created_at) where status = 'pending';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_rooms_usage_guide_fk') then
    alter table public.project_rooms add constraint project_rooms_usage_guide_fk foreign key (usage_guide_message_id)
      references public.project_room_messages (id) on delete set null;
  end if;
end $$;

create table if not exists public.project_shoot_days (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null constraint project_shoot_days_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_shoot_days_agency_fk references public.agencies (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  map_url text,
  parking text not null default '',
  food text not null default '',
  people_limit smallint,
  notes text not null default '',
  calendar_event_id uuid constraint project_shoot_days_event_fk references public.calendar_events (id) on delete set null,
  cancelled_at timestamptz,
  created_by uuid constraint project_shoot_days_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_shoot_days_range_check check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  constraint project_shoot_days_texts_check check (char_length(btrim(location)) between 2 and 200 and char_length(parking) <= 300
    and char_length(food) <= 300 and char_length(notes) <= 2000),
  constraint project_shoot_days_map_check check (map_url is null or public.brand_https_url_ok(map_url)),
  constraint project_shoot_days_limit_check check (people_limit is null or people_limit between 1 and 999)
);
create index if not exists project_shoot_days_deal_idx on public.project_shoot_days (deal_id, starts_at);

create table if not exists public.project_shoot_crew (
  id uuid primary key default gen_random_uuid(),
  shoot_day_id uuid not null constraint project_shoot_crew_day_fk references public.project_shoot_days (id) on delete cascade,
  deal_id uuid not null constraint project_shoot_crew_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_shoot_crew_agency_fk references public.agencies (id) on delete cascade,
  user_id uuid not null constraint project_shoot_crew_user_fk references auth.users (id) on delete cascade,
  side text not null,
  name text not null,
  role_label text not null default '',
  checked_in_at timestamptz,
  constraint project_shoot_crew_uq unique (shoot_day_id, user_id),
  constraint project_shoot_crew_side_check check (side in ('agency', 'talent', 'staff')),
  constraint project_shoot_crew_texts_check check (char_length(name) between 1 and 80 and char_length(role_label) <= 60)
);
create index if not exists project_shoot_crew_user_idx on public.project_shoot_crew (user_id);

create table if not exists public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null constraint project_feedback_deal_fk references public.deals (id) on delete cascade,
  agency_id uuid not null constraint project_feedback_agency_fk references public.agencies (id) on delete cascade,
  moment text not null,
  party text not null,
  score smallint,
  comment text not null default '',
  requested_at timestamptz not null default now(),
  requested_by uuid constraint project_feedback_requested_by_fk references auth.users (id) on delete set null,
  answered_at timestamptz,
  answered_by uuid constraint project_feedback_answered_by_fk references auth.users (id) on delete set null,
  constraint project_feedback_uq unique (deal_id, moment, party),
  constraint project_feedback_moment_check check (moment in ('production_day', 'closing')),
  constraint project_feedback_party_check check (party in ('brand', 'talent')),
  constraint project_feedback_score_check check ((score is null) = (answered_at is null) and (score is null or score between 0 and 10)),
  constraint project_feedback_comment_check check (char_length(comment) <= 1000)
);
create index if not exists project_feedback_agency_idx on public.project_feedback (agency_id, answered_at desc);

-- prévia (o "Demo" do PDF)
alter table public.deliverables add column if not exists preview_on date;
alter table public.deliverable_versions add column if not exists is_preview boolean not null default false;

-- grants, RLS e updated_at
do $$
declare t text;
begin
  foreach t in array array['agency_project_settings', 'project_rooms', 'project_room_members', 'project_nda_signatures', 'project_room_messages',
                           'project_shoot_days', 'project_shoot_crew', 'project_feedback'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
    execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
  end loop;
  foreach t in array array['agency_project_settings', 'project_rooms', 'project_shoot_days'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- 3) quem está na sala ------------------------------------------------------------------------------------------------
-- negócios em que a pessoa é agência na sala (gestor+ da agência ou responsável/equipe)
create or replace function public.my_project_agency_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d.id), '{}'::uuid[]) from public.deals d
  where d.agency_id = any (public.my_agency_ids('manager')) or d.id = any (public.my_staff_deal_ids())
$$;

-- salas que a pessoa lê. p_internal: só as que dão acesso às mensagens internas (agência e staff externo).
-- Agência: aberta ou arquivada. Os outros: só aberta, e o staff (e o herói quando nda_heroes) depois do NDA.
create or replace function public.my_project_room_ids(p_internal boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid, public.my_talent_id() as talent)
  select coalesce(array_agg(r.deal_id), '{}'::uuid[])
  from public.project_rooms r join public.deals d on d.id = r.deal_id cross join me
  where me.uid is not null and (
       d.id = any (public.my_project_agency_deal_ids())
    or (r.status = 'open' and (
          exists (select 1 from public.project_room_members m where m.deal_id = r.deal_id and m.user_id = me.uid and m.status = 'active'
                  and exists (select 1 from public.project_nda_signatures s where s.deal_id = r.deal_id and s.user_id = me.uid))
       or (not coalesce(p_internal, false) and (
             (me.talent is not null and (d.client_talent_id = me.talent
                or exists (select 1 from public.deal_talents dt where dt.deal_id = d.id and dt.talent_id = me.talent and dt.status = 'contracted'))
              and (not r.nda_heroes or exists (select 1 from public.project_nda_signatures s where s.deal_id = r.deal_id and s.user_id = me.uid)))
          or (d.brand_id is not null and d.brand_visible and d.brand_id = any (public.my_brand_ids(false))))))))
$$;

-- "negócio:parte" em que a pessoa é cliente (marca: membro da marca; herói: herói-cliente) — feedback e clipping
create or replace function public.my_project_client_keys()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(k), '{}'::text[]) from (
    select d.id::text || ':brand' as k from public.deals d where d.brand_id = any (public.my_brand_ids(false)) and d.brand_visible
    union all select d.id::text || ':talent' from public.deals d where public.my_talent_id() is not null and d.client_talent_id = public.my_talent_id()) x
$$;

-- lado da pessoa no negócio (sem conferir NDA nem situação da sala): agency | staff | talent | brand | null
create or replace function public.project_room_side(p_deal uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_talent uuid;
begin
  if auth.uid() is null then return null; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then return null; end if;
  if p_deal = any (public.my_project_agency_deal_ids()) then return 'agency'; end if;
  if exists (select 1 from public.project_room_members m where m.deal_id = p_deal and m.user_id = auth.uid() and m.status = 'active') then return 'staff'; end if;
  v_talent := public.my_talent_id();
  if v_talent is not null and (d.client_talent_id = v_talent
     or exists (select 1 from public.deal_talents dt where dt.deal_id = p_deal and dt.talent_id = v_talent and dt.status = 'contracted')) then
    return 'talent';
  end if;
  if d.brand_id is not null and d.brand_visible and public.brand_member_of(d.brand_id) is not null then return 'brand'; end if;
  return null;
end $$;

-- precisa assinar o NDA antes de ver a sala?
create or replace function public.project_nda_needed(p_deal uuid, p_side text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_side = 'staff' or (p_side = 'talent' and coalesce((select r.nda_heroes from public.project_rooms r where r.deal_id = p_deal), false)))
    and not exists (select 1 from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = auth.uid())
$$;

-- porteira das RPCs da sala: devolve o lado; recusa sem sala, sem lado, arquivada (fora a agência), sem NDA, ou
-- escrita em sala arquivada
create or replace function public.project_room_gate(p_deal uuid, p_write boolean default false)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_side text; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_side := public.project_room_side(p_deal);
  select r.status into v_status from public.project_rooms r where r.deal_id = p_deal;
  if v_side is null or v_status is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status = 'archived' and v_side <> 'agency' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.project_nda_needed(p_deal, v_side) then raise exception 'nda_required' using errcode = 'P0001'; end if;
  if coalesce(p_write, false) and v_status = 'archived' then raise exception 'room_archived' using errcode = 'P0001'; end if;
  return v_side;
end $$;

-- link da sala para cada lado
create or replace function public.project_room_link(p_side text, p_deal uuid)
returns text language sql immutable set search_path = '' as $$
  select case p_side when 'agency' then '/agencia/negocios/' || p_deal::text || '/sala' when 'brand' then '/marca/projetos/' || p_deal::text
                     when 'talent' then '/heroi/projetos/' || p_deal::text else '/projetos/' || p_deal::text end
$$;

-- quem recebe avisos da sala (agência = responsável + equipe do negócio; staff ativo com NDA; heróis; marca)
create or replace function public.project_room_recipients(p_deal uuid, p_internal boolean)
returns table (user_id uuid, side text) language sql stable security definer set search_path = '' as $$
  with d as (select x.*, r.nda_heroes from public.deals x join public.project_rooms r on r.deal_id = x.id where x.id = p_deal and r.status = 'open'),
  people as (
    select d.owner_id as user_id, 'agency'::text as side from d where d.owner_id is not null
    union select t.user_id, 'agency' from public.deal_team t join d on d.id = t.deal_id
    union select m.user_id, 'staff' from public.project_room_members m join d on d.id = m.deal_id
      where m.status = 'active' and exists (select 1 from public.project_nda_signatures s where s.deal_id = m.deal_id and s.user_id = m.user_id)
    union select public.talent_user_id(x.tid), 'talent' from (
        select d.client_talent_id as tid from d where d.client_talent_id is not null
        union select dt.talent_id from public.deal_talents dt join d on d.id = dt.deal_id where dt.status = 'contracted') x
      where not coalesce(p_internal, false)
    union select bm.user_id, 'brand' from public.brand_members bm join d on d.brand_id = bm.brand_id
      where bm.revoked_at is null and d.brand_visible and not coalesce(p_internal, false))
  select distinct on (p.user_id) p.user_id, p.side from people p
  where p.user_id is not null
    and (p.side <> 'talent' or not (select d.nda_heroes from d)
         or exists (select 1 from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = p.user_id))
  order by p.user_id, case p.side when 'agency' then 1 when 'staff' then 2 when 'talent' then 3 else 4 end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.my_project_agency_deal_ids()', 'public.my_project_room_ids(boolean)', 'public.project_room_side(uuid)', 'public.my_project_client_keys()',
                           'public.project_nda_needed(uuid, text)', 'public.project_room_gate(uuid, boolean)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.project_room_link(text, uuid)', 'public.project_room_recipients(uuid, boolean)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- políticas de leitura
drop policy if exists agency_project_settings_select_agency on public.agency_project_settings;
create policy agency_project_settings_select_agency on public.agency_project_settings for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('staff'))::uuid[]));
drop policy if exists project_rooms_select_member on public.project_rooms;
create policy project_rooms_select_member on public.project_rooms for select to authenticated
  using (deal_id = any ((select public.my_project_room_ids(false))::uuid[]));
drop policy if exists project_room_members_select_agency on public.project_room_members;
create policy project_room_members_select_agency on public.project_room_members for select to authenticated
  using (deal_id = any ((select public.my_project_agency_deal_ids())::uuid[]));
drop policy if exists project_room_members_select_self on public.project_room_members;
create policy project_room_members_select_self on public.project_room_members for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists project_nda_signatures_select_agency on public.project_nda_signatures;
create policy project_nda_signatures_select_agency on public.project_nda_signatures for select to authenticated
  using (deal_id = any ((select public.my_project_agency_deal_ids())::uuid[]));
drop policy if exists project_nda_signatures_select_self on public.project_nda_signatures;
create policy project_nda_signatures_select_self on public.project_nda_signatures for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists project_room_messages_select_member on public.project_room_messages;
create policy project_room_messages_select_member on public.project_room_messages for select to authenticated
  using (status = 'posted' and deal_id = any ((select public.my_project_room_ids(false))::uuid[])
         and (audience = 'all' or deal_id = any ((select public.my_project_room_ids(true))::uuid[])));
drop policy if exists project_room_messages_select_author on public.project_room_messages;
create policy project_room_messages_select_author on public.project_room_messages for select to authenticated
  using (status = 'pending' and author_id = (select auth.uid()));
drop policy if exists project_shoot_days_select_member on public.project_shoot_days;
create policy project_shoot_days_select_member on public.project_shoot_days for select to authenticated
  using (deal_id = any ((select public.my_project_room_ids(false))::uuid[]));
drop policy if exists project_shoot_crew_select_member on public.project_shoot_crew;
create policy project_shoot_crew_select_member on public.project_shoot_crew for select to authenticated
  using (deal_id = any ((select public.my_project_room_ids(false))::uuid[]));
drop policy if exists project_feedback_select_agency on public.project_feedback;
create policy project_feedback_select_agency on public.project_feedback for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists project_feedback_select_client on public.project_feedback;
create policy project_feedback_select_client on public.project_feedback for select to authenticated
  using ((deal_id::text || ':' || party) = any ((select public.my_project_client_keys())::text[]));

-- 4) avisos: tipos que já existem (nenhum tipo novo no check de inbox_notifications) -------------------------------------
-- D12: sala aberta, feedback pedido/recebido e clipping pronto vão como 'campaign_status_changed' com params.status
-- (room_opened | feedback_requested | feedback_received | clipping_ready); mensagem nova como 'message_received'; diária
-- como 'calendar_event_added'. Assim o check (recriado por 0081..0108) não muda e nada de e-mail/push novo sai sem querer.

-- 5) linhas de sistema e abertura/arquivamento -------------------------------------------------------------------------
create or replace function public.project_room_system(p_deal uuid, p_body text, p_audience text default 'all')
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_room_messages (deal_id, agency_id, kind, audience, author_id, author_side, author_label, body)
  select r.deal_id, r.agency_id, 'system', case when p_audience = 'internal' then 'internal' else 'all' end, auth.uid(), 'system', '', left(p_body, 4000)
  from public.project_rooms r where r.deal_id = p_deal and r.status = 'open';
end $$;
revoke execute on function public.project_room_system(uuid, text, text) from public, anon, authenticated;
grant execute on function public.project_room_system(uuid, text, text) to service_role;

-- abre a sala (interna; idempotente). Avisa heróis e marca na primeira abertura.
create or replace function public.project_room_ensure(p_deal uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_rows int; r record;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or d.stage = 'closed' then return false; end if;
  insert into public.project_rooms (deal_id, agency_id, opened_by) values (p_deal, d.agency_id, auth.uid())
  on conflict (deal_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    perform public.project_room_system(p_deal, 'room_opened|' || d.title, 'all');
    -- abertura em lote da migração (salas dos negócios que já existiam) não manda aviso
    if coalesce(current_setting('app.project_room_silent', true), '') = '1' then return true; end if;
    for r in select x.user_id, x.side from public.project_room_recipients(p_deal, false) x where x.side in ('talent', 'brand') loop
      perform public.inbox_notify(r.user_id, 'campaign_status_changed', public.project_room_link(r.side, p_deal), jsonb_build_object('deal', d.title, 'status', 'room_opened'),
        d.agency_id, 'deal', p_deal, 'room_open:' || p_deal::text || ':' || r.user_id::text);
    end loop;
  end if;
  return v_rows > 0;
end $$;
revoke execute on function public.project_room_ensure(uuid) from public, anon, authenticated;
grant execute on function public.project_room_ensure(uuid) to service_role;

-- pedido de feedback (interno; um por negócio, momento e parte; não repete). Devolve quantos foram pedidos.
create or replace function public.project_feedback_open(p_deal uuid, p_moment text)
returns int language plpgsql security definer set search_path = '' as $$
declare d public.deals%rowtype; v_n int := 0; v_id uuid; v_user uuid;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or p_moment not in ('production_day', 'closing') then return 0; end if;
  if d.brand_id is not null and d.brand_visible then
    insert into public.project_feedback (deal_id, agency_id, moment, party, requested_by) values (p_deal, d.agency_id, p_moment, 'brand', auth.uid())
    on conflict (deal_id, moment, party) do nothing returning id into v_id;
    if v_id is not null then
      v_n := v_n + 1;
      perform public.inbox_notify_brand(d.brand_id, false, 'campaign_status_changed', '/marca/projetos/' || p_deal::text || '/clipping#feedback',
        jsonb_build_object('deal', d.title, 'status', 'feedback_requested', 'step', p_moment), d.agency_id, 'deal', p_deal, 'fb:' || v_id::text);
    end if;
  end if;
  v_id := null;
  if d.client_talent_id is not null then
    insert into public.project_feedback (deal_id, agency_id, moment, party, requested_by) values (p_deal, d.agency_id, p_moment, 'talent', auth.uid())
    on conflict (deal_id, moment, party) do nothing returning id into v_id;
    if v_id is not null then
      v_n := v_n + 1;
      v_user := public.talent_user_id(d.client_talent_id);
      perform public.inbox_notify(v_user, 'campaign_status_changed', '/heroi/projetos/' || p_deal::text || '/clipping#feedback',
        jsonb_build_object('deal', d.title, 'status', 'feedback_requested', 'step', p_moment), d.agency_id, 'deal', p_deal, 'fb:' || v_id::text);
    end if;
  end if;
  return v_n;
end $$;
revoke execute on function public.project_feedback_open(uuid, text) from public, anon, authenticated;
grant execute on function public.project_feedback_open(uuid, text) to service_role;

-- clipping (interno): entregas, links, métricas, equipe, prévias aprovadas, guia de uso, diárias, andamento. Sem valores.
create or replace function public.project_clipping_build(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d record; v_tz text; v_deliv jsonb; v_team jsonb; v_prev jsonb; v_guide jsonb; v_days jsonb; v_tot jsonb;
begin
  select x.id, x.title, x.agency_id, x.stage, x.outcome, x.closed_at, x.roadmap_started_on, x.brand_id, x.client_talent_id, x.owner_id,
         a.name as agency_name, a.timezone, b.name as brand_name, tp.display_name as talent_name, s.name as service_name, s.slug as service_slug
    into d
  from public.deals x join public.agencies a on a.id = x.agency_id
  left join public.brands b on b.id = x.brand_id left join public.talent_profiles tp on tp.id = x.client_talent_id
  left join public.agency_services s on s.id = x.service_id
  where x.id = p_deal;
  if d.id is null then return null; end if;
  v_tz := coalesce(d.timezone, 'America/Sao_Paulo');
  with m as (
    select distinct on (dm.deliverable_id) dm.deliverable_id, dm.reach, dm.views, dm.likes, dm.comments, dm.shares, dm.saves, dm.clicks, dm.measured_on
    from public.deliverable_metrics dm where dm.deal_id = p_deal order by dm.deliverable_id, dm.measured_on desc, dm.updated_at desc)
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'network', x.network, 'talent', t.display_name, 'status', x.status,
           'published_url', x.published_url, 'published_at', x.published_at,
           'metrics', case when m.deliverable_id is null then null else jsonb_build_object('reach', m.reach, 'views', m.views, 'likes', m.likes, 'comments', m.comments,
             'shares', m.shares, 'saves', m.saves, 'clicks', m.clicks, 'measured_on', m.measured_on) end)
         order by x.published_at nulls last, x.created_at), '[]'::jsonb),
         jsonb_build_object('deliverables', count(*), 'published', count(*) filter (where x.published_url is not null),
           'reach', coalesce(sum(m.reach), 0), 'views', coalesce(sum(m.views), 0),
           'engagement', coalesce(sum(coalesce(m.likes, 0) + coalesce(m.comments, 0) + coalesce(m.shares, 0) + coalesce(m.saves, 0)), 0),
           'clicks', coalesce(sum(m.clicks), 0))
    into v_deliv, v_tot
  from public.deliverables x join public.talent_profiles t on t.id = x.talent_id left join m on m.deliverable_id = x.id
  where x.deal_id = p_deal and x.status <> 'cancelled';
  select coalesce(jsonb_agg(p.j order by p.o, p.j ->> 'name'), '[]'::jsonb) into v_team from (
    select 1 as o, jsonb_build_object('name', am.display_name, 'role', 'agency') as j from public.agency_members am
      where am.agency_id = d.agency_id and am.revoked_at is null
        and (am.user_id = d.owner_id or exists (select 1 from public.deal_team tm where tm.deal_id = p_deal and tm.user_id = am.user_id))
    union all select 2, jsonb_build_object('name', t.display_name, 'role', 'talent') from public.talent_profiles t
      where t.id = d.client_talent_id or t.id in (select dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'contracted')
    union all select 3, jsonb_build_object('name', m.display_name, 'role', m.job_function) from public.project_room_members m
      where m.deal_id = p_deal and m.status = 'active') p;
  select coalesce(jsonb_agg(jsonb_build_object('deliverable', coalesce(nullif(x.title, ''), x.kind), 'revision', v.revision, 'url', v.url,
           'decided_at', v.decided_at, 'preview_on', x.preview_on) order by v.decided_at), '[]'::jsonb) into v_prev
  from public.deliverable_versions v join public.deliverables x on x.id = v.deliverable_id
  where v.deal_id = p_deal and v.is_preview and v.decision = 'approved';
  select jsonb_build_object('message_id', g.id, 'name', g.attachment_name) into v_guide
  from public.project_rooms r join public.project_room_messages g on g.id = r.usage_guide_message_id and g.status = 'posted'
  where r.deal_id = p_deal;
  select coalesce(jsonb_agg(jsonb_build_object('starts_at', sd.starts_at, 'location', sd.location) order by sd.starts_at), '[]'::jsonb) into v_days
  from public.project_shoot_days sd where sd.deal_id = p_deal and sd.cancelled_at is null;
  return jsonb_build_object('generated_at', now(), 'deal_id', d.id, 'title', d.title, 'agency', d.agency_name, 'brand', d.brand_name, 'talent', d.talent_name,
    'service', d.service_name, 'service_slug', d.service_slug, 'stage', d.stage, 'outcome', d.outcome,
    'started_on', d.roadmap_started_on, 'closed_on', case when d.closed_at is not null then (d.closed_at at time zone v_tz)::date end,
    'progress', public.roadmap_progress(p_deal, true), 'deliverables', v_deliv, 'totals', v_tot, 'team', v_team, 'previews', v_prev,
    'usage_guide', v_guide, 'shoot_days', v_days);
end $$;
revoke execute on function public.project_clipping_build(uuid) from public, anon, authenticated;
grant execute on function public.project_clipping_build(uuid) to service_role;

-- arquiva (interna): clipping congelado; acesso de staff/heróis/marca termina (porteira)
create or replace function public.project_room_close(p_deal uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select r.status into v_status from public.project_rooms r where r.deal_id = p_deal for update;
  if v_status is distinct from 'open' then return false; end if;
  perform public.project_room_system(p_deal, 'room_archived|', 'all');
  update public.project_rooms set status = 'archived', archived_at = now(), archived_by = auth.uid(), clipping = public.project_clipping_build(p_deal)
  where deal_id = p_deal;
  return true;
end $$;
revoke execute on function public.project_room_close(uuid) from public, anon, authenticated;
grant execute on function public.project_room_close(uuid) to service_role;

-- negócio: roteiro gerado ou confirmado (≥ aprovado) abre; encerrado arquiva (+ feedback e clipping se ganho)
create or replace function public.deals_project_room_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_had boolean;
begin
  if new.stage = 'closed' then
    if old.stage is distinct from 'closed' then
      v_had := public.project_room_close(new.id);
      if new.outcome = 'won' and (v_had or new.roadmap_started_on is not null) then
        perform public.project_feedback_open(new.id, 'closing');
        for r in select distinct u.user_id, u.side from (
                   select bm.user_id, 'brand'::text as side from public.brand_members bm where bm.brand_id = new.brand_id and bm.revoked_at is null and new.brand_visible
                   union select public.talent_user_id(new.client_talent_id), 'talent' where new.client_talent_id is not null) u where u.user_id is not null loop
          perform public.inbox_notify(r.user_id, 'campaign_status_changed',
            case r.side when 'brand' then '/marca/projetos/' else '/heroi/projetos/' end || new.id::text || '/clipping',
            jsonb_build_object('deal', new.title, 'status', 'clipping_ready'), new.agency_id, 'deal', new.id, 'clip:' || new.id::text || ':' || r.user_id::text);
        end loop;
      end if;
    end if;
    return null;
  end if;
  if new.roadmap_started_on is not null or public.deal_stage_index(new.stage) between 8 and 12 then
    perform public.project_room_ensure(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.deals_project_room_after() from public, anon, authenticated;
drop trigger if exists trg_deals_project_room on public.deals;
create trigger trg_deals_project_room after update of stage, roadmap_started_on on public.deals for each row
  when (old.stage is distinct from new.stage or old.roadmap_started_on is distinct from new.roadmap_started_on)
  execute function public.deals_project_room_after();

-- etapa do roteiro concluída → linha na sala; marco "dia da produção" → pede feedback do dia
create or replace function public.tasks_project_room_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    perform public.project_room_system(new.deal_id, 'step_done|' || new.title, case when new.client_visible then 'all' else 'internal' end);
    if new.milestone = 'production_day' then perform public.project_feedback_open(new.deal_id, 'production_day'); end if;
  end if;
  return null;
end $$;
revoke execute on function public.tasks_project_room_after() from public, anon, authenticated;
drop trigger if exists trg_tasks_project_room on public.tasks;
create trigger trg_tasks_project_room after update of status on public.tasks for each row
  when (new.roadmap_position is not null and old.status is distinct from new.status) execute function public.tasks_project_room_after();

-- negócios que já têm roteiro ou estão confirmados: sala aberta agora
do $$ begin
  perform set_config('app.project_room_silent', '1', true);
  perform public.project_room_ensure(d.id) from public.deals d
  where d.stage <> 'closed' and (d.roadmap_started_on is not null or public.deal_stage_index(d.stage) between 8 and 12);
  perform set_config('app.project_room_silent', '', true);
end $$;

-- 6) RPCs: configurações (Adm) e sala (agência) ------------------------------------------------------------------------
create or replace function public.agency_project_settings_save(p_agency uuid, p_norms text, p_nda text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_norms text := btrim(coalesce(p_norms, '')); v_nda text := btrim(coalesce(p_nda, '')); v_version int;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.agency_is_demo(p_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if char_length(v_norms) not between 10 and 6000 or char_length(v_nda) not between 50 and 20000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_before := public.project_settings_of(p_agency);
  v_version := (v_before ->> 'nda_version')::int + case when v_before ->> 'nda_text' = v_nda then 0 else 1 end;
  insert into public.agency_project_settings (agency_id, norms, nda_text, nda_version, updated_by)
  values (p_agency, v_norms, v_nda, v_version, auth.uid())
  on conflict (agency_id) do update set norms = excluded.norms, nda_text = excluded.nda_text, nda_version = excluded.nda_version, updated_by = excluded.updated_by;
  perform public.audit_log('agency.project_settings', 'agency', p_agency::text, jsonb_build_object('agency_id', p_agency, 'nda_version', v_before -> 'nda_version'),
    jsonb_build_object('agency_id', p_agency, 'nda_version', v_version), null, public.talent_audit_actor('agency', p_agency));
  return v_version;
end $$;
revoke execute on function public.agency_project_settings_save(uuid, text, text) from public, anon;
grant execute on function public.agency_project_settings_save(uuid, text, text) to authenticated, service_role;

-- textos vigentes para a tela de configurações (equipe da agência)
create or replace function public.agency_project_settings_get(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.project_settings_of(p_agency);
end $$;
revoke execute on function public.agency_project_settings_get(uuid) from public, anon;
grant execute on function public.agency_project_settings_get(uuid) to authenticated, service_role;

-- abrir/reabrir à mão (responsável/equipe ou gestor+; negócio aberto)
create or replace function public.project_room_open(p_deal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if exists (select 1 from public.project_rooms r where r.deal_id = p_deal and r.status = 'archived') then
    if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.project_rooms set status = 'open', archived_at = null, archived_by = null, clipping = null where deal_id = p_deal;
    perform public.project_room_system(p_deal, 'room_reopened|', 'all');
  else
    perform public.project_room_ensure(p_deal);
  end if;
  perform public.audit_log('project_room.open', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.project_room_open(uuid) from public, anon;
grant execute on function public.project_room_open(uuid) to authenticated, service_role;

-- arquivar à mão (gestor+)
create or replace function public.project_room_archive(p_deal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid;
begin
  v_agency := public.deal_write_scope(p_deal, false, false);
  if not public.project_room_close(p_deal) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  perform public.audit_log('project_room.archive', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.project_room_archive(uuid) from public, anon;
grant execute on function public.project_room_archive(uuid) to authenticated, service_role;

-- briefing fixado e "heróis também assinam o NDA"
create or replace function public.project_room_update(p_deal uuid, p_briefing text, p_nda_heroes boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_brief text := btrim(coalesce(p_briefing, ''));
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if char_length(v_brief) > 6000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.project_rooms set briefing = v_brief, nda_heroes = coalesce(p_nda_heroes, nda_heroes) where deal_id = p_deal and status = 'open';
  if not found then raise exception 'room_archived' using errcode = 'P0001'; end if;
  perform public.audit_log('project_room.update', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency, 'nda_heroes', p_nda_heroes), null,
    public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.project_room_update(uuid, text, boolean) from public, anon;
grant execute on function public.project_room_update(uuid, text, boolean) to authenticated, service_role;

-- 7) staff externo ----------------------------------------------------------------------------------------------------
create or replace function public.project_staff_invite(p_deal uuid, p_email text, p_name text, p_function text, p_days int default 7)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_name text := btrim(coalesce(p_name, ''));
        v_fn text := btrim(coalesce(p_function, '')); v_token text; v_id uuid;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if not exists (select 1 from public.project_rooms r where r.deal_id = p_deal and r.status = 'open') then raise exception 'room_archived' using errcode = 'P0001'; end if;
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
  if char_length(v_name) not between 2 and 80 or char_length(v_fn) not between 2 and 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if exists (select 1 from public.agency_members m join auth.users u on u.id = m.user_id
             where m.agency_id = v_agency and m.revoked_at is null and lower(u.email::text) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.project_room_members m where m.deal_id = p_deal and lower(m.email) = v_email and m.status = 'active') then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  -- convite novo do mesmo e-mail substitui o pendente (novo link)
  update public.project_room_members set display_name = v_name, job_function = v_fn, token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    expires_at = now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), invited_by = auth.uid()
  where deal_id = p_deal and lower(email) = v_email and status = 'pending'
  returning id into v_id;
  if v_id is null then
    insert into public.project_room_members (deal_id, agency_id, email, display_name, job_function, token_hash, expires_at, invited_by)
    values (p_deal, v_agency, v_email, v_name, v_fn, encode(extensions.digest(v_token, 'sha256'), 'hex'),
            now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), auth.uid())
    returning id into v_id;
  end if;
  perform public.audit_log('project_staff.invite', 'project_room_member', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'deal_id', p_deal, 'email', v_email, 'function', v_fn), null, public.talent_audit_actor('agency', v_agency));
  return jsonb_build_object('member_id', v_id, 'token', v_token);
end $$;
revoke execute on function public.project_staff_invite(uuid, text, text, text, int) from public, anon;
grant execute on function public.project_staff_invite(uuid, text, text, text, int) to authenticated, service_role;

-- aceite (conta com o MESMO e-mail do convite). Devolve o negócio.
create or replace function public.project_staff_accept(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.project_room_members%rowtype; v_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  select * into m from public.project_room_members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if m.id is null or m.status <> 'pending' then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  if m.expires_at < now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  select lower(u.email::text) into v_email from auth.users u where u.id = auth.uid();
  if v_email is distinct from lower(m.email) then raise exception 'invitation_email_mismatch' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.project_rooms r where r.deal_id = m.deal_id and r.status = 'open') then raise exception 'room_archived' using errcode = 'P0001'; end if;
  if exists (select 1 from public.project_room_members x where x.deal_id = m.deal_id and x.user_id = auth.uid() and x.status = 'active') then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.project_room_members set user_id = auth.uid(), status = 'active', accepted_at = now(), token_hash = null where id = m.id;
  perform public.project_room_system(m.deal_id, 'staff_joined|' || m.display_name || ' · ' || m.job_function, 'internal');
  perform public.audit_log('project_staff.accept', 'project_room_member', m.id::text, null, jsonb_build_object('agency_id', m.agency_id, 'deal_id', m.deal_id), null, 'consumer');
  return m.deal_id;
end $$;
revoke execute on function public.project_staff_accept(text) from public, anon;
grant execute on function public.project_staff_accept(text) to authenticated, service_role;

create or replace function public.project_staff_remove(p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.project_room_members%rowtype; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into m from public.project_room_members where id = p_member;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(m.deal_id, true, false);
  if m.status = 'removed' then return; end if;
  update public.project_room_members set status = 'removed', removed_at = now(), token_hash = null where id = p_member;
  delete from public.project_shoot_crew c where c.deal_id = m.deal_id and c.user_id = m.user_id and m.user_id is not null;
  if m.status = 'active' then perform public.project_room_system(m.deal_id, 'staff_removed|' || m.display_name, 'internal'); end if;
  perform public.audit_log('project_staff.remove', 'project_room_member', p_member::text, null, jsonb_build_object('agency_id', v_agency, 'deal_id', m.deal_id), null,
    public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.project_staff_remove(uuid) from public, anon;
grant execute on function public.project_staff_remove(uuid) to authenticated, service_role;

-- 8) NDA ------------------------------------------------------------------------------------------------------------------
-- texto canônico (o que é assinado e entra no hash): agência, projeto, versão, NDA e normas. Interna.
create or replace function public.project_nda_signable_text(p_deal uuid)
returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(E'\n',
    'ACORDO DE CONFIDENCIALIDADE (NDA)',
    'Agência: ' || a.name,
    'Projeto: ' || d.title,
    'Versão do modelo: ' || (s ->> 'nda_version'),
    '',
    s ->> 'nda_text',
    '',
    'NORMAS PARA A EQUIPE',
    s ->> 'norms',
    '',
    'Assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I).')
  from public.deals d join public.agencies a on a.id = d.agency_id cross join lateral public.project_settings_of(d.agency_id) s
  where d.id = p_deal
$$;
revoke execute on function public.project_nda_signable_text(uuid) from public, anon, authenticated;
grant execute on function public.project_nda_signable_text(uuid) to service_role;

create or replace function public.project_nda_preview(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_side text; v_text text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_side := public.project_room_side(p_deal);
  if v_side is null or not exists (select 1 from public.project_rooms r where r.deal_id = p_deal and r.status = 'open') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_text := public.project_nda_signable_text(p_deal);
  return jsonb_build_object('deal_id', p_deal, 'version', (public.project_settings_of((select d.agency_id from public.deals d where d.id = p_deal)) ->> 'nda_version')::int,
    'text', v_text, 'sha256', public.text_sha256_hex(v_text), 'required', public.project_nda_needed(p_deal, v_side),
    'signed', exists (select 1 from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = auth.uid()));
end $$;
revoke execute on function public.project_nda_preview(uuid) from public, anon;
grant execute on function public.project_nda_preview(uuid) to authenticated, service_role;

create or replace function public.project_nda_sign(p_deal uuid, p_full_name text, p_tax_id text, p_expected_hash text default null,
  p_ip text default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_side text; d public.deals%rowtype; v_name text; v_doc text; v_kind text; v_text text; v_hash text; v_email text; v_ip text; v_ua text; v_id uuid;
        v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_side := public.project_room_side(p_deal);
  if v_side is null or v_side not in ('staff', 'talent') or not exists (select 1 from public.project_rooms r where r.deal_id = p_deal and r.status = 'open') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = auth.uid()) then raise exception 'already_signed' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = p_deal;
  v_name := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 5 or char_length(v_name) > 120 or v_name !~ '^\S+( \S+)+$' then raise exception 'name_required' using errcode = '22023'; end if;
  v_doc := public.br_tax_id_normalize(p_tax_id);
  v_kind := public.br_tax_id_kind(v_doc);
  if v_kind is null then raise exception 'invalid_tax_id' using errcode = '22023'; end if;
  v_text := public.project_nda_signable_text(p_deal);
  v_hash := public.text_sha256_hex(v_text);
  if nullif(btrim(coalesce(p_expected_hash, '')), '') is not null and lower(btrim(p_expected_hash)) <> v_hash then
    raise exception 'terms_changed' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  begin
    v_ip := host(nullif(btrim(coalesce(p_ip, '')), '')::inet);
  exception when others then v_ip := null;
  end;
  v_ua := left(regexp_replace(btrim(coalesce(p_user_agent, '')), '[[:cntrl:]]', '', 'g'), 400);
  insert into public.project_nda_signatures (deal_id, agency_id, user_id, side, nda_version, signer_name, signer_tax_id, signer_tax_kind, signer_email,
                                             signer_ip, signer_user_agent, signed_text, text_sha256)
  values (p_deal, d.agency_id, auth.uid(), v_side, (public.project_settings_of(d.agency_id) ->> 'nda_version')::int, v_name, v_doc, v_kind,
          left(coalesce(v_email, ''), 320), v_ip, v_ua, v_text, v_hash)
  returning id into v_id;
  v_label := coalesce((select m.display_name from public.project_room_members m where m.deal_id = p_deal and m.user_id = auth.uid() and m.status = 'active'), v_name);
  perform public.project_room_system(p_deal, 'nda_signed|' || v_label, 'internal');
  perform public.audit_log('project_nda.sign', 'project_nda_signature', v_id::text, null,
    jsonb_build_object('agency_id', d.agency_id, 'deal_id', p_deal, 'side', v_side, 'sha256', v_hash), null, case when v_side = 'talent' then 'creator' else 'consumer' end::public.actor_type);
  return v_id;
end $$;
revoke execute on function public.project_nda_sign(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.project_nda_sign(uuid, text, text, text, text, text) to authenticated, service_role;

-- comprovante do NDA (quem assinou e a agência do negócio)
create or replace function public.project_nda_receipt(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.project_nda_signatures%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.project_nda_signatures where id = p_id;
  if s.id is null or not (s.user_id = auth.uid() or s.deal_id = any (public.my_project_agency_deal_ids())) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', s.id, 'deal_id', s.deal_id, 'deal', (select d.title from public.deals d where d.id = s.deal_id), 'side', s.side,
    'version', s.nda_version, 'name', s.signer_name, 'tax_kind', s.signer_tax_kind,
    'tax_id', case when s.user_id = auth.uid() then s.signer_tax_id else overlay(s.signer_tax_id placing repeat('•', greatest(char_length(s.signer_tax_id) - 4, 0)) from 3 for greatest(char_length(s.signer_tax_id) - 4, 0)) end,
    'email', s.signer_email, 'ip', s.signer_ip, 'user_agent', s.signer_user_agent, 'signed_at', s.signed_at, 'text', s.signed_text, 'sha256', s.text_sha256,
    'valid', public.text_sha256_hex(s.signed_text) = s.text_sha256);
end $$;
revoke execute on function public.project_nda_receipt(uuid) from public, anon;
grant execute on function public.project_nda_receipt(uuid) to authenticated, service_role;

-- 9) mensagens e arquivos ---------------------------------------------------------------------------------------------
create or replace function public.project_room_mime_ext(p_mime text)
returns text language sql immutable set search_path = '' as $$
  select case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/x-m4a' then 'm4a' when 'audio/aac' then 'aac' when 'audio/ogg' then 'ogg'
    when 'audio/webm' then 'webm' end
$$;
revoke execute on function public.project_room_mime_ext(text) from public, anon;
grant execute on function public.project_room_mime_ext(text) to authenticated, service_role;

-- reserva de arquivo: o banco escolhe o caminho; o navegador envia ao Storage e depois publica com project_room_post
create or replace function public.project_room_attach_reserve(p_deal uuid, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_side text; v_agency uuid; v_id uuid := gen_random_uuid(); v_mime text; v_ext text; v_size bigint; v_name text; v_path text;
begin
  v_side := public.project_room_gate(p_deal, true);
  select d.agency_id into v_agency from public.deals d where d.id = p_deal;
  if public.agency_is_demo(v_agency) then raise exception 'demo_locked' using errcode = 'P0001'; end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_mime := coalesce(p_meta ->> 'mime_type', '');
  v_ext := public.project_room_mime_ext(v_mime);
  if v_ext is null then raise exception 'invalid_file_type' using errcode = '22023'; end if;
  begin v_size := (p_meta ->> 'size_bytes')::bigint; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
  if v_size is null or v_size < 1 or v_size > 20971520 then raise exception 'file_too_large' using errcode = '22023'; end if;
  v_name := left(btrim(coalesce(p_meta ->> 'name', '')), 120);
  if v_name = '' then v_name := 'arquivo.' || v_ext; end if;
  -- uma conta não segura mais que 10 reservas abertas
  if (select count(*) from public.project_room_messages m where m.author_id = auth.uid() and m.status = 'pending' and m.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  v_path := v_agency::text || '/room/' || p_deal::text || '/' || v_id::text || '.' || v_ext;
  insert into public.project_room_messages (id, deal_id, agency_id, kind, audience, author_id, author_side, author_label, body,
                                            attachment_path, attachment_mime, attachment_size, attachment_name, status)
  values (v_id, p_deal, v_agency, 'text', 'all', auth.uid(), v_side, '', '', v_path, v_mime, v_size, v_name, 'pending');
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;
revoke execute on function public.project_room_attach_reserve(uuid, jsonb) from public, anon;
grant execute on function public.project_room_attach_reserve(uuid, jsonb) to authenticated, service_role;

-- publica mensagem (texto e/ou arquivo reservado). p_internal: só agência e staff podem marcar "interno".
create or replace function public.project_room_post(p_deal uuid, p_body text, p_internal boolean default false, p_attachment uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_side text; d public.deals%rowtype; v_body text := btrim(coalesce(p_body, '')); v_audience text; v_id uuid; v_label text; m public.project_room_messages%rowtype;
        r record; v_hour text := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');
begin
  v_side := public.project_room_gate(p_deal, true);
  select * into d from public.deals where id = p_deal;
  if char_length(v_body) > 4000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_audience := case when coalesce(p_internal, false) then 'internal' else 'all' end;
  if v_audience = 'internal' and v_side not in ('agency', 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_label := left(coalesce(
    case when v_side = 'staff' then (select x.display_name || ' · ' || x.job_function from public.project_room_members x
                                     where x.deal_id = p_deal and x.user_id = auth.uid() and x.status = 'active') end,
    nullif(public.actor_label(d.agency_id, d.brand_id), ''), ''), 80);
  if p_attachment is not null then
    select * into m from public.project_room_messages where id = p_attachment and deal_id = p_deal and author_id = auth.uid() and status = 'pending' for update;
    if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if to_regclass('storage.objects') is not null then
      if not exists (select 1 from storage.objects o where o.bucket_id = 'agency-docs' and o.name = m.attachment_path) then
        raise exception 'file_missing' using errcode = 'P0001';
      end if;
    end if;
    update public.project_room_messages set body = v_body, audience = v_audience, author_label = v_label, status = 'posted', created_at = now()
    where id = m.id returning id into v_id;
  else
    if v_body = '' then raise exception 'invalid_input' using errcode = '22023'; end if;
    insert into public.project_room_messages (deal_id, agency_id, kind, audience, author_id, author_side, author_label, body)
    values (p_deal, d.agency_id, 'text', v_audience, auth.uid(), v_side, v_label, v_body)
    returning id into v_id;
  end if;
  -- aviso no sino: no máximo um por pessoa, sala e hora
  for r in select x.user_id, x.side from public.project_room_recipients(p_deal, v_audience = 'internal') x where x.user_id <> auth.uid() loop
    perform public.inbox_notify(r.user_id, 'message_received', public.project_room_link(r.side, p_deal),
      jsonb_build_object('deal', d.title, 'name', v_label), d.agency_id, 'deal', p_deal, 'room_msg:' || p_deal::text || ':' || r.user_id::text || ':' || v_hour);
  end loop;
  return v_id;
end $$;
revoke execute on function public.project_room_post(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.project_room_post(uuid, text, boolean, uuid) to authenticated, service_role;

-- arquivo de uma mensagem que a pessoa pode ler: o servidor assina a URL (60 s) com o caminho devolvido
create or replace function public.project_room_file(p_message uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.project_room_messages%rowtype; v_side text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into m from public.project_room_messages where id = p_message and status = 'posted' and attachment_path is not null;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- guia de uso: o cliente baixa também pelo clipping (sala arquivada)
  if exists (select 1 from public.project_rooms r where r.deal_id = m.deal_id and r.usage_guide_message_id = m.id)
     and public.project_room_side(m.deal_id) in ('agency', 'brand', 'talent') then
    return jsonb_build_object('path', m.attachment_path, 'mime', m.attachment_mime, 'name', m.attachment_name);
  end if;
  v_side := public.project_room_gate(m.deal_id, false);
  if m.audience = 'internal' and v_side not in ('agency', 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('path', m.attachment_path, 'mime', m.attachment_mime, 'name', m.attachment_name);
end $$;
revoke execute on function public.project_room_file(uuid) from public, anon;
grant execute on function public.project_room_file(uuid) to authenticated, service_role;

-- política de leitura do Storage (URL assinada com o cliente da própria pessoa): mesma regra de project_room_file
create or replace function public.project_room_path_readable(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_path is null then return false; end if;
  select m.id into v_id from public.project_room_messages m where m.attachment_path = p_path and m.status = 'posted';
  if v_id is null then return false; end if;
  perform public.project_room_file(v_id);
  return true;
exception when others then
  return false;
end $$;
revoke execute on function public.project_room_path_readable(text) from public, anon;
grant execute on function public.project_room_path_readable(text) to authenticated, service_role;

-- guia de uso: PDF já publicado na sala para todos
create or replace function public.project_room_usage_guide_set(p_deal uuid, p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; m public.project_room_messages%rowtype;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if p_message is not null then
    select * into m from public.project_room_messages where id = p_message and deal_id = p_deal and status = 'posted';
    if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if m.attachment_mime is distinct from 'application/pdf' or m.audience <> 'all' then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  update public.project_rooms set usage_guide_message_id = p_message where deal_id = p_deal and status = 'open';
  if not found then raise exception 'room_archived' using errcode = 'P0001'; end if;
  if p_message is not null then perform public.project_room_system(p_deal, 'usage_guide|' || m.attachment_name, 'all'); end if;
  perform public.audit_log('project_room.usage_guide', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency, 'message_id', p_message), null,
    public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.project_room_usage_guide_set(uuid, uuid) from public, anon;
grant execute on function public.project_room_usage_guide_set(uuid, uuid) to authenticated, service_role;

-- reservas não publicadas há mais de 24 h (cron: apaga no Storage e depois as linhas)
create or replace function public.project_room_orphans(p_limit int default 200)
returns setof text language sql stable security definer set search_path = '' as $$
  select m.attachment_path from public.project_room_messages m
  where m.status = 'pending' and m.attachment_path is not null and m.created_at < now() - interval '24 hours'
  order by m.created_at limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;
create or replace function public.project_room_orphans_purge(p_paths text[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from public.project_room_messages m where m.status = 'pending' and m.attachment_path = any (coalesce(p_paths, '{}'::text[]))
    and m.created_at < now() - interval '24 hours';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.project_room_orphans(int) from public, anon, authenticated;
revoke execute on function public.project_room_orphans_purge(text[]) from public, anon, authenticated;
grant execute on function public.project_room_orphans(int) to service_role;
grant execute on function public.project_room_orphans_purge(text[]) to service_role;

-- 10) ficha da diária e check-in -------------------------------------------------------------------------------------
-- pessoas da sala (com conta) que podem entrar na equipe da diária. Interna.
create or replace function public.project_room_people(p_deal uuid)
returns table (user_id uuid, side text, name text, role_label text) language sql stable security definer set search_path = '' as $$
  with d as (select * from public.deals where id = p_deal)
  select x.user_id, x.side, x.name, x.role_label from (
    select am.user_id, 'agency'::text as side, am.display_name as name, ''::text as role_label from public.agency_members am join d on d.agency_id = am.agency_id
      where am.revoked_at is null and (am.user_id = d.owner_id or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = am.user_id))
    union all select public.talent_user_id(t.id), 'talent', t.display_name, '' from public.talent_profiles t join d on true
      where t.id = d.client_talent_id or t.id in (select dt.talent_id from public.deal_talents dt where dt.deal_id = d.id and dt.status = 'contracted')
    union all select m.user_id, 'staff', m.display_name, m.job_function from public.project_room_members m join d on d.id = m.deal_id where m.status = 'active') x
  where x.user_id is not null
$$;
revoke execute on function public.project_room_people(uuid) from public, anon, authenticated;
grant execute on function public.project_room_people(uuid) to service_role;

-- cria (p_id nulo) ou edita a diária. p_data: starts_at, ends_at, location, map_url, parking, food, people_limit, notes,
-- crew: [{user_id, role}] (só pessoas da sala; vazio = toda a equipe da sala). Vira compromisso na agenda e avisa a equipe.
create or replace function public.project_shoot_day_save(p_deal uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; d public.deals%rowtype; v_id uuid := p_id; v_start timestamptz; v_end timestamptz; v_loc text; v_map text; v_limit int;
        v_event uuid; c jsonb; v_user uuid; p record; v_tz text; v_new boolean := p_id is null; v_link text; v_pside text; v_pname text; v_prole text;
begin
  v_agency := public.deal_write_scope(p_deal, true);
  if not exists (select 1 from public.project_rooms r where r.deal_id = p_deal and r.status = 'open') then raise exception 'room_archived' using errcode = 'P0001'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into d from public.deals where id = p_deal;
  v_tz := coalesce((select a.timezone from public.agencies a where a.id = v_agency), 'America/Sao_Paulo');
  begin
    v_start := (p_data ->> 'starts_at')::timestamptz;
    v_end := coalesce(nullif(p_data ->> 'ends_at', '')::timestamptz, v_start + interval '8 hours');
    v_limit := nullif(p_data ->> 'people_limit', '')::int;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_loc := btrim(coalesce(p_data ->> 'location', ''));
  v_map := nullif(btrim(coalesce(p_data ->> 'map_url', '')), '');
  if v_start is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_map is not null and not public.brand_https_url_ok(v_map) then raise exception 'invalid_url' using errcode = '22023'; end if;
  begin
    if v_id is null then
      insert into public.project_shoot_days (deal_id, agency_id, starts_at, ends_at, location, map_url, parking, food, people_limit, notes, created_by)
      values (p_deal, v_agency, v_start, v_end, v_loc, v_map, btrim(coalesce(p_data ->> 'parking', '')), btrim(coalesce(p_data ->> 'food', '')), v_limit,
              btrim(coalesce(p_data ->> 'notes', '')), auth.uid())
      returning id, calendar_event_id into v_id, v_event;
    else
      update public.project_shoot_days set starts_at = v_start, ends_at = v_end, location = v_loc, map_url = v_map, parking = btrim(coalesce(p_data ->> 'parking', '')),
        food = btrim(coalesce(p_data ->> 'food', '')), people_limit = v_limit, notes = btrim(coalesce(p_data ->> 'notes', ''))
      where id = v_id and deal_id = p_deal and cancelled_at is null
      returning calendar_event_id into v_event;
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    end if;
  exception when check_violation or numeric_value_out_of_range then raise exception 'invalid_input' using errcode = '22023';
  end;
  -- equipe: quem sai perde a linha; quem entra ganha; quem fica mantém a chegada
  if jsonb_typeof(p_data -> 'crew') = 'array' and jsonb_array_length(p_data -> 'crew') > 0 then
    delete from public.project_shoot_crew x where x.shoot_day_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_data -> 'crew') e where (e ->> 'user_id') = x.user_id::text);
    for c in select e from jsonb_array_elements(p_data -> 'crew') e loop
      begin v_user := (c ->> 'user_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      select x.side, x.name, x.role_label into v_pside, v_pname, v_prole from public.project_room_people(p_deal) x where x.user_id = v_user limit 1;
      if not found then raise exception 'invalid_input' using errcode = '22023'; end if;
      insert into public.project_shoot_crew (shoot_day_id, deal_id, agency_id, user_id, side, name, role_label)
      values (v_id, p_deal, v_agency, v_user, v_pside, left(v_pname, 80), left(btrim(coalesce(nullif(c ->> 'role', ''), v_prole, '')), 60))
      on conflict (shoot_day_id, user_id) do update set role_label = excluded.role_label, name = excluded.name, side = excluded.side;
    end loop;
  elsif v_new then
    insert into public.project_shoot_crew (shoot_day_id, deal_id, agency_id, user_id, side, name, role_label)
    select distinct on (x.user_id) v_id, p_deal, v_agency, x.user_id, x.side, left(x.name, 80), left(x.role_label, 60) from public.project_room_people(p_deal) x
    on conflict (shoot_day_id, user_id) do nothing;
  end if;
  -- agenda (origem manual: o sincronizador do negócio apaga eventos 'system' que não gerou)
  if v_event is not null and exists (select 1 from public.calendar_events e where e.id = v_event) then
    update public.calendar_events set title = 'Diária · ' || left(d.title, 140), subtitle = left(v_loc, 160), starts_at = v_start, ends_at = v_end,
      location = left(v_loc, 200), description = left(concat_ws(E'\n', nullif(v_map, ''), nullif(btrim(coalesce(p_data ->> 'parking', '')), ''),
        nullif(btrim(coalesce(p_data ->> 'food', '')), '')), 2000)
    where id = v_event;
  else
    insert into public.calendar_events (agency_id, kind, title, subtitle, description, starts_at, ends_at, all_day, location, brand_id, deal_id, talent_id,
                                        source, visible_to_brand, visible_to_talent, created_by, timezone)
    values (v_agency, 'recording', 'Diária · ' || left(d.title, 140), left(v_loc, 160),
            left(concat_ws(E'\n', nullif(v_map, ''), nullif(btrim(coalesce(p_data ->> 'parking', '')), ''), nullif(btrim(coalesce(p_data ->> 'food', '')), '')), 2000),
            v_start, v_end, false, left(v_loc, 200), d.brand_id, p_deal, d.client_talent_id, 'manual', d.brand_id is not null, d.client_talent_id is not null,
            auth.uid(), v_tz)
    returning id into v_event;
    update public.project_shoot_days set calendar_event_id = v_event where id = v_id;
  end if;
  perform public.project_room_system(p_deal, (case when v_new then 'shoot_day|' else 'shoot_day_updated|' end) || to_char(v_start at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI') || '|' || v_loc, 'all');
  for p in select distinct c2.user_id, coalesce((select x.side from public.project_room_people(p_deal) x where x.user_id = c2.user_id limit 1), c2.side) as side
           from public.project_shoot_crew c2 where c2.shoot_day_id = v_id and c2.user_id <> auth.uid() loop
    v_link := public.project_room_link(p.side, p_deal);
    perform public.inbox_notify(p.user_id, 'calendar_event_added', v_link,
      jsonb_build_object('deal', d.title, 'date', to_char(v_start at time zone v_tz, 'YYYY-MM-DD HH24:MI'), 'name', v_loc), v_agency, 'deal', p_deal,
      'shoot:' || v_id::text || ':' || p.user_id::text || ':' || extract(epoch from v_start)::bigint::text);
  end loop;
  perform public.audit_log(case when v_new then 'project_shoot.create' else 'project_shoot.update' end, 'project_shoot_day', v_id::text, null,
    jsonb_build_object('agency_id', v_agency, 'deal_id', p_deal, 'starts_at', v_start), null, public.talent_audit_actor('agency', v_agency));
  return v_id;
end $$;
revoke execute on function public.project_shoot_day_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.project_shoot_day_save(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.project_shoot_day_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.project_shoot_days%rowtype; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.project_shoot_days where id = p_id;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(s.deal_id, true);
  if s.cancelled_at is not null then return; end if;
  update public.project_shoot_days set cancelled_at = now() where id = p_id;
  if s.calendar_event_id is not null then delete from public.calendar_events e where e.id = s.calendar_event_id; end if;
  perform public.project_room_system(s.deal_id, 'shoot_day_cancelled|' || to_char(s.starts_at at time zone coalesce((select a.timezone from public.agencies a where a.id = v_agency), 'America/Sao_Paulo'),
    'YYYY-MM-DD"T"HH24:MI'), 'all');
  perform public.audit_log('project_shoot.cancel', 'project_shoot_day', p_id::text, null, jsonb_build_object('agency_id', v_agency, 'deal_id', s.deal_id), null,
    public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.project_shoot_day_cancel(uuid) from public, anon;
grant execute on function public.project_shoot_day_cancel(uuid) to authenticated, service_role;

-- "Cheguei ao local": só a própria pessoa da equipe, na sala aberta, no dia (a partir de 12 h antes)
create or replace function public.project_checkin(p_shoot_day uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare s public.project_shoot_days%rowtype; c public.project_shoot_crew%rowtype; v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.project_shoot_days where id = p_shoot_day;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.project_room_gate(s.deal_id, true);
  select * into c from public.project_shoot_crew where shoot_day_id = p_shoot_day and user_id = auth.uid() for update;
  if c.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.cancelled_at is not null or now() < s.starts_at - interval '12 hours' or now() > s.ends_at + interval '12 hours' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if c.checked_in_at is not null then return c.checked_in_at; end if;
  update public.project_shoot_crew set checked_in_at = now() where id = c.id returning checked_in_at into v_at;
  perform public.project_room_system(s.deal_id, 'checkin|' || c.name, 'internal');
  return v_at;
end $$;
revoke execute on function public.project_checkin(uuid) from public, anon;
grant execute on function public.project_checkin(uuid) to authenticated, service_role;

-- 11) leitura da sala ---------------------------------------------------------------------------------------------------
-- tudo o que o lado da pessoa pode ver. NDA pendente: só o necessário para assinar (locked = 'nda').
create or replace function public.project_room_view(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_side text; v_status text; d record; r public.project_rooms%rowtype; v_internal boolean; v_can_manage boolean; v_tz text;
        v_settings jsonb; v_members jsonb; v_days jsonb; v_msgs jsonb; v_guide jsonb; v_fb jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_side := public.project_room_side(p_deal);
  select * into r from public.project_rooms where deal_id = p_deal;
  if v_side is null or r.deal_id is null or (r.status = 'archived' and v_side <> 'agency') then raise exception 'not_found' using errcode = 'P0002'; end if;
  select x.id, x.title, x.stage, x.outcome, x.agency_id, x.brand_id, x.client_talent_id, x.owner_id, a.name as agency_name, a.timezone,
         b.name as brand_name, tp.display_name as talent_name, s.name as service_name
    into d from public.deals x join public.agencies a on a.id = x.agency_id left join public.brands b on b.id = x.brand_id
    left join public.talent_profiles tp on tp.id = x.client_talent_id left join public.agency_services s on s.id = x.service_id where x.id = p_deal;
  v_tz := coalesce(d.timezone, 'America/Sao_Paulo');
  if public.project_nda_needed(p_deal, v_side) then
    return jsonb_build_object('side', v_side, 'status', r.status, 'locked', 'nda',
      'deal', jsonb_build_object('id', d.id, 'title', d.title, 'agency', d.agency_name, 'service', d.service_name));
  end if;
  v_internal := v_side in ('agency', 'staff');
  v_can_manage := v_side = 'agency' and r.status = 'open' and d.stage <> 'closed'
    and (public.agency_can(d.agency_id, 'manager') or d.owner_id = auth.uid() or exists (select 1 from public.deal_team t where t.deal_id = p_deal and t.user_id = auth.uid()));
  v_settings := public.project_settings_of(d.agency_id);
  -- pessoas: e-mail e convite só para a agência
  select coalesce(jsonb_agg(p.j order by p.o, p.j ->> 'name'), '[]'::jsonb) into v_members from (
    select 1 as o, jsonb_build_object('side', 'agency', 'name', am.display_name, 'role', '', 'user_id', case when v_side = 'agency' then am.user_id end) as j
      from public.agency_members am where am.agency_id = d.agency_id and am.revoked_at is null
        and (am.user_id = d.owner_id or exists (select 1 from public.deal_team t where t.deal_id = p_deal and t.user_id = am.user_id))
    union all select 2, jsonb_build_object('side', 'talent', 'name', t.display_name, 'role', case when t.id = d.client_talent_id then 'client' else 'contracted' end,
        'user_id', case when v_side = 'agency' then public.talent_user_id(t.id) end,
        'nda', case when v_side = 'agency' and r.nda_heroes then exists (select 1 from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = public.talent_user_id(t.id)) end)
      from public.talent_profiles t
      where t.id = d.client_talent_id or t.id in (select dt.talent_id from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'contracted')
    union all select 3, jsonb_build_object('side', 'staff', 'name', m.display_name, 'role', m.job_function, 'status', m.status,
        'id', case when v_side = 'agency' then m.id end, 'email', case when v_side = 'agency' then m.email end,
        'user_id', case when v_side = 'agency' then m.user_id end,
        'expired', case when v_side = 'agency' then m.status = 'pending' and m.expires_at < now() end,
        'nda', exists (select 1 from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = m.user_id),
        'nda_id', case when v_side = 'agency' then (select s.id from public.project_nda_signatures s where s.deal_id = p_deal and s.user_id = m.user_id) end)
      from public.project_room_members m where m.deal_id = p_deal and m.status <> 'removed' and (v_side = 'agency' or m.status = 'active')
    union all select 4, jsonb_build_object('side', 'brand', 'name', bm.display_name, 'role', '')
      from public.brand_members bm where bm.brand_id = d.brand_id and bm.revoked_at is null and v_side in ('agency', 'brand')) p;
  select coalesce(jsonb_agg(jsonb_build_object('id', sd.id, 'starts_at', sd.starts_at, 'ends_at', sd.ends_at, 'location', sd.location, 'map_url', sd.map_url,
           'parking', sd.parking, 'food', sd.food, 'people_limit', sd.people_limit, 'notes', sd.notes,
           'crew', (select coalesce(jsonb_agg(jsonb_build_object('user_id', case when v_side = 'agency' or c.user_id = auth.uid() then c.user_id end, 'name', c.name,
                      'role', c.role_label, 'side', c.side, 'checked_in_at', case when v_internal or c.user_id = auth.uid() then c.checked_in_at end,
                      'me', c.user_id = auth.uid()) order by c.side, c.name), '[]'::jsonb)
                    from public.project_shoot_crew c where c.shoot_day_id = sd.id),
           'arrived', case when v_internal then (select count(*) from public.project_shoot_crew c where c.shoot_day_id = sd.id and c.checked_in_at is not null) end,
           'total', (select count(*) from public.project_shoot_crew c where c.shoot_day_id = sd.id))
         order by sd.starts_at), '[]'::jsonb) into v_days
  from public.project_shoot_days sd where sd.deal_id = p_deal and sd.cancelled_at is null and sd.ends_at > now() - interval '30 days';
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'audience', x.audience, 'author_side', x.author_side, 'author_label', x.author_label,
           'body', x.body, 'created_at', x.created_at, 'mine', x.author_id = auth.uid(),
           'attachment', case when x.attachment_path is null then null else jsonb_build_object('name', x.attachment_name, 'mime', x.attachment_mime, 'size', x.attachment_size) end)
         order by x.created_at, x.id), '[]'::jsonb) into v_msgs
  from (select * from public.project_room_messages m where m.deal_id = p_deal and m.status = 'posted' and (v_internal or m.audience = 'all')
        order by m.created_at desc limit 300) x;
  select jsonb_build_object('message_id', g.id, 'name', g.attachment_name) into v_guide
  from public.project_room_messages g where g.id = r.usage_guide_message_id and g.status = 'posted';
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'moment', f.moment, 'party', f.party, 'score', f.score, 'comment', f.comment, 'answered_at', f.answered_at)
         order by f.requested_at), '[]'::jsonb) into v_fb
  from public.project_feedback f where f.deal_id = p_deal
    and (v_side = 'agency' or (v_side = 'brand' and f.party = 'brand') or (v_side = 'talent' and f.party = 'talent' and d.client_talent_id = public.my_talent_id()));
  return jsonb_build_object('side', v_side, 'status', r.status, 'locked', null, 'can_post', r.status = 'open', 'can_internal', v_internal and r.status = 'open',
    'can_manage', v_can_manage, 'is_manager', v_side = 'agency' and public.agency_can(d.agency_id, 'manager'),
    'deal', jsonb_build_object('id', d.id, 'title', d.title, 'stage', d.stage, 'outcome', d.outcome, 'agency', d.agency_name, 'brand', d.brand_name,
      'talent', d.talent_name, 'service', d.service_name),
    'norms', v_settings ->> 'norms', 'briefing', r.briefing, 'nda_heroes', r.nda_heroes, 'opened_at', r.opened_at, 'archived_at', r.archived_at,
    'members', v_members, 'shoot_days', v_days, 'messages', v_msgs, 'usage_guide', v_guide, 'feedback', v_fb, 'timezone', v_tz,
    'progress', public.roadmap_progress(p_deal, v_side not in ('agency', 'staff')));
end $$;
revoke execute on function public.project_room_view(uuid) from public, anon;
grant execute on function public.project_room_view(uuid) to authenticated, service_role;

-- salas da pessoa fora da agência (staff, herói, marca): "Meus projetos"
create or replace function public.my_project_rooms()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  with cand as (
    select m.deal_id from public.project_room_members m where m.user_id = auth.uid() and m.status = 'active'
    union select d.id from public.deals d where public.my_talent_id() is not null and (d.client_talent_id = public.my_talent_id()
        or exists (select 1 from public.deal_talents dt where dt.deal_id = d.id and dt.talent_id = public.my_talent_id() and dt.status = 'contracted'))
    union select d.id from public.deals d where d.brand_id = any (public.my_brand_ids(false)) and d.brand_visible)
  select coalesce(jsonb_agg(x.j order by x.o, x.j ->> 'title'), '[]'::jsonb) into v_out from (
    select case when public.project_nda_needed(r.deal_id, s.side) then 0 else 1 end as o,
      jsonb_build_object('deal_id', r.deal_id, 'title', d.title, 'agency', a.name, 'service', sv.name, 'side', s.side, 'status', r.status,
        'nda_needed', public.project_nda_needed(r.deal_id, s.side),
        'role', (select m.job_function from public.project_room_members m where m.deal_id = r.deal_id and m.user_id = auth.uid() and m.status = 'active'),
        'next_shoot', (select jsonb_build_object('id', sd.id, 'starts_at', sd.starts_at, 'location', sd.location) from public.project_shoot_days sd
                       where sd.deal_id = r.deal_id and sd.cancelled_at is null and sd.ends_at > now() order by sd.starts_at limit 1)) as j
    from cand join public.project_rooms r on r.deal_id = cand.deal_id and r.status = 'open'
    join public.deals d on d.id = r.deal_id join public.agencies a on a.id = d.agency_id and a.status = 'active'
    left join public.agency_services sv on sv.id = d.service_id
    cross join lateral (select public.project_room_side(r.deal_id) as side) s
    where s.side in ('staff', 'talent', 'brand')) x;
  return v_out;
end $$;
revoke execute on function public.my_project_rooms() from public, anon;
grant execute on function public.my_project_rooms() to authenticated, service_role;

-- situação da sala para um negócio (botões nos portais): {exists, status, side, nda_needed}
create or replace function public.project_room_access(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_side text; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_side := public.project_room_side(p_deal);
  if v_side is null then return null; end if;
  select r.status into v_status from public.project_rooms r where r.deal_id = p_deal;
  return jsonb_build_object('side', v_side, 'exists', v_status is not null, 'status', v_status,
    'readable', v_status is not null and (v_side = 'agency' or v_status = 'open'),
    'nda_needed', v_status = 'open' and public.project_nda_needed(p_deal, v_side));
end $$;
revoke execute on function public.project_room_access(uuid) from public, anon;
grant execute on function public.project_room_access(uuid) to authenticated, service_role;

-- 12) prévia nas entregas ---------------------------------------------------------------------------------------------------
create or replace function public.deliverable_preview_set(p_version uuid, p_preview boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.deliverable_versions%rowtype; v_agency uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v from public.deliverable_versions where id = p_version;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(v.deal_id, true);
  if v.kind <> 'submission' then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.deliverable_versions set is_preview = coalesce(p_preview, false) where id = p_version;
  if coalesce(p_preview, false) and not v.is_preview then
    select coalesce(nullif(x.title, ''), x.kind) into v_title from public.deliverables x where x.id = v.deliverable_id;
    perform public.project_room_system(v.deal_id, 'preview|' || v_title, 'all');
  end if;
  perform public.audit_log('deliverable.preview', 'deliverable_version', p_version::text, jsonb_build_object('agency_id', v_agency, 'is_preview', v.is_preview),
    jsonb_build_object('agency_id', v_agency, 'is_preview', coalesce(p_preview, false)), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.deliverable_preview_set(uuid, boolean) from public, anon;
grant execute on function public.deliverable_preview_set(uuid, boolean) to authenticated, service_role;

create or replace function public.deliverable_preview_date_set(p_deliverable uuid, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into x from public.deliverables where id = p_deliverable;
  if x.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_agency := public.deal_write_scope(x.deal_id, true);
  if p_date is not null and (p_date < current_date - 366 or p_date > current_date + 366) then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.deliverables set preview_on = p_date where id = p_deliverable;
  perform public.audit_log('deliverable.preview_date', 'deliverable', p_deliverable::text, jsonb_build_object('agency_id', v_agency, 'preview_on', x.preview_on),
    jsonb_build_object('agency_id', v_agency, 'preview_on', p_date), null, public.talent_audit_actor('agency', v_agency));
end $$;
revoke execute on function public.deliverable_preview_date_set(uuid, date) from public, anon;
grant execute on function public.deliverable_preview_date_set(uuid, date) to authenticated, service_role;

-- prévias do negócio para quem lê as entregas (agência, marca com o negócio visível, herói do negócio)
create or replace function public.deal_previews(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not (p_deal = any (public.my_project_agency_deal_ids()) or p_deal = any (public.my_brand_deal_ids()) or p_deal = any (public.my_talent_contract_deal_ids())) then
    return '[]'::jsonb;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('deliverable_id', x.id, 'preview_on', x.preview_on,
            'version_ids', (select coalesce(jsonb_agg(v.id order by v.revision), '[]'::jsonb) from public.deliverable_versions v where v.deliverable_id = x.id and v.is_preview))
          order by x.created_at), '[]'::jsonb)
          from public.deliverables x where x.deal_id = p_deal and (x.preview_on is not null or exists (select 1 from public.deliverable_versions v where v.deliverable_id = x.id and v.is_preview)));
end $$;
revoke execute on function public.deal_previews(uuid) from public, anon;
grant execute on function public.deal_previews(uuid) to authenticated, service_role;

-- 13) feedback do cliente ------------------------------------------------------------------------------------------------
create or replace function public.project_feedback_request(p_deal uuid, p_moment text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_n int;
begin
  v_agency := public.deal_write_scope(p_deal, true, false);
  if p_moment is null or p_moment not in ('production_day', 'closing') then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_n := public.project_feedback_open(p_deal, p_moment);
  perform public.audit_log('project_feedback.request', 'deal', p_deal::text, null, jsonb_build_object('agency_id', v_agency, 'moment', p_moment, 'requested', v_n), null,
    public.talent_audit_actor('agency', v_agency));
  return v_n;
end $$;
revoke execute on function public.project_feedback_request(uuid, text) from public, anon;
grant execute on function public.project_feedback_request(uuid, text) to authenticated, service_role;

create or replace function public.project_feedback_answer(p_id uuid, p_score int, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.project_feedback%rowtype; d public.deals%rowtype; v_comment text := btrim(coalesce(p_comment, '')); v_first boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into f from public.project_feedback where id = p_id for update;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where id = f.deal_id;
  if not ((f.party = 'brand' and d.brand_id is not null and public.brand_member_of(d.brand_id) is not null)
          or (f.party = 'talent' and d.client_talent_id is not null and d.client_talent_id = public.my_talent_id())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_score is null or p_score < 0 or p_score > 10 or char_length(v_comment) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_first := f.answered_at is null;
  update public.project_feedback set score = p_score, comment = v_comment, answered_at = now(), answered_by = auth.uid() where id = p_id;
  if v_first then
    perform public.inbox_notify_agency(d.agency_id, 'manager', 'campaign_status_changed', '/agencia/negocios/' || d.id::text || '/clipping',
      jsonb_build_object('deal', d.title, 'step', p_score::text, 'status', 'feedback_received'), 'deal', d.id, 'fb_in:' || p_id::text);
    if d.owner_id is not null then
      perform public.inbox_notify(d.owner_id, 'campaign_status_changed', '/agencia/negocios/' || d.id::text || '/clipping',
        jsonb_build_object('deal', d.title, 'step', p_score::text, 'status', 'feedback_received'), d.agency_id, 'deal', d.id, 'fb_in:' || p_id::text || ':' || d.owner_id::text);
    end if;
  end if;
  perform public.audit_log('project_feedback.answer', 'project_feedback', p_id::text, null,
    jsonb_build_object('agency_id', d.agency_id, 'deal_id', d.id, 'score', p_score), null, case when f.party = 'brand' then 'brand' else 'creator' end::public.actor_type);
end $$;
revoke execute on function public.project_feedback_answer(uuid, int, text) from public, anon;
grant execute on function public.project_feedback_answer(uuid, int, text) to authenticated, service_role;

-- indicador de satisfação (gestor+): nota média, NPS e as últimas respostas
create or replace function public.project_feedback_indicator(p_agency uuid, p_days int default 180)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_from := now() - make_interval(days => greatest(least(coalesce(p_days, 180), 730), 7));
  return (
    with a as (select f.*, d.title from public.project_feedback f join public.deals d on d.id = f.deal_id
               where f.agency_id = p_agency and f.answered_at >= v_from)
    select jsonb_build_object('days', greatest(least(coalesce(p_days, 180), 730), 7),
      'answered', (select count(*) from a), 'pending', (select count(*) from public.project_feedback f where f.agency_id = p_agency and f.answered_at is null),
      'avg', (select round(avg(score)::numeric, 1) from a),
      'promoters', (select count(*) from a where score >= 9), 'passives', (select count(*) from a where score between 7 and 8),
      'detractors', (select count(*) from a where score <= 6),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('deal_id', x.deal_id, 'deal', x.title, 'party', x.party, 'moment', x.moment, 'score', x.score,
                   'comment', x.comment, 'answered_at', x.answered_at) order by x.answered_at desc), '[]'::jsonb)
                 from (select * from a order by answered_at desc limit 5) x)));
end $$;
revoke execute on function public.project_feedback_indicator(uuid, int) from public, anon;
grant execute on function public.project_feedback_indicator(uuid, int) to authenticated, service_role;

-- 14) clipping -----------------------------------------------------------------------------------------------------------
-- agência (sala), marca (negócio visível) e herói-cliente; congelado se a sala foi arquivada. + feedback do lado.
create or replace function public.project_clipping(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_side text; v_clip jsonb; v_fb jsonb; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_deal = any (public.my_project_agency_deal_ids()) then v_side := 'agency';
  elsif d.brand_id is not null and d.brand_visible and public.brand_member_of(d.brand_id) is not null then v_side := 'brand';
  elsif d.client_talent_id is not null and d.client_talent_id = public.my_talent_id() then v_side := 'talent';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_side <> 'agency' and d.roadmap_started_on is null and not exists (select 1 from public.project_rooms r where r.deal_id = p_deal) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select r.clipping, r.status into v_clip, v_status from public.project_rooms r where r.deal_id = p_deal;
  v_clip := coalesce(v_clip, public.project_clipping_build(p_deal));
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'moment', f.moment, 'party', f.party, 'score', f.score, 'comment', f.comment, 'answered_at', f.answered_at)
         order by f.requested_at), '[]'::jsonb) into v_fb
  from public.project_feedback f where f.deal_id = p_deal and (v_side = 'agency' or f.party = v_side);
  return v_clip || jsonb_build_object('side', v_side, 'room_status', v_status, 'frozen', v_status = 'archived', 'feedback', v_fb,
    'brand_id', case when v_side = 'agency' then d.brand_id end, 'client_talent_id', case when v_side = 'agency' then d.client_talent_id end);
end $$;
revoke execute on function public.project_clipping(uuid) from public, anon;
grant execute on function public.project_clipping(uuid) to authenticated, service_role;

-- 15) agenda: a equipe da diária recebe o compromisso no feed .ics (0098 + equipe da diária; MESMA assinatura)
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
  shoot_events as (select sd.calendar_event_id as id from public.project_shoot_crew c
                   join public.project_shoot_days sd on sd.id = c.shoot_day_id and sd.cancelled_at is null and sd.calendar_event_id is not null
                   join public.project_rooms r on r.deal_id = sd.deal_id and r.status = 'open'
                   where c.user_id = p_user),
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
     or (e.visible_to_talent and e.talent_id = (select id from talent))
     or e.id in (select id from shoot_events))
$$;
revoke execute on function public.calendar_events_for_user(uuid) from public, anon, authenticated;

-- 16) Storage: áudio no bucket agency-docs e envio das reservas da sala -----------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0110: schema storage ausente; bucket e política da sala não foram alterados';
    return;
  end if;
  execute $sql$
    update storage.buckets set allowed_mime_types = (
      select array_agg(distinct m order by m) from unnest(coalesce(allowed_mime_types, '{}'::text[])
        || array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm']) m)
    where id = 'agency-docs'
  $sql$;
  execute 'drop policy if exists agency_docs_room_select on storage.objects';
  execute $sql$
    create policy agency_docs_room_select on storage.objects for select to authenticated
      using (bucket_id = 'agency-docs' and name like '%/room/%' and public.project_room_path_readable(name))
  $sql$;
  execute 'drop policy if exists agency_docs_room_insert on storage.objects';
  execute $sql$
    create policy agency_docs_room_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'agency-docs'
                  and exists (select 1 from public.project_room_messages m where m.attachment_path = storage.objects.name
                              and m.status = 'pending' and m.author_id = (select auth.uid())
                              and m.created_at > now() - interval '1 hour'))
  $sql$;
end $$;

notify pgrst, 'reload schema';
