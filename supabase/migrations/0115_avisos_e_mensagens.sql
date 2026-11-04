-- =============================================================================
-- Groscove Ultra · 0115 · "Avisos e mensagens": todas as conversas num lugar só, com contexto e etapa · cenário S120
-- Pedido do responsável (04/11): "Onde acontece a mensageria, o chat dentro dos eventos/oportunidades? Deveria ter fácil
-- acesso; colocar as mensagens na parte de avisos (...) quem vê a mensagem sabe exatamente do que se trata, que vem do
-- evento tal e está na etapa tal do processo. Em todos os tipos de login." Idempotente; nada de drop de tabela/coluna;
-- search_path fixo; nenhuma função nova executável por anon (S14 segue 18). Nenhum sistema de chat novo: a lista só
-- LÊ as conversas que já existem.
--
-- Decisões (sem perguntar ao responsável):
--   • Fontes unificadas (as únicas tabelas de conversa do sistema): deal_messages (0066) — canal marca↔agência
--     ('campaign') e canal herói↔agência por herói ('opportunity') — e project_room_messages (0110, 'room', sala do
--     projeto multi-parte). Rodadas de negociação (deal_offer_rounds 0106, brand_call_rounds 0089), respostas de
--     patrocínio (0085) e comentários por versão de entrega (0083) NÃO são conversas: são decisões com valor/estado
--     próprios e já geram avisos no sino; ficam fora da lista (a etapa do negócio aparece no chip de cada conversa).
--   • Chave da conversa (texto estável, usada também pelo app): 'deal:<negócio>:brand', 'deal:<negócio>:talent:<herói>',
--     'room:<negócio>'.
--   • Quem vê o quê (mesmas regras das RLS/RPCs de origem, por portal — quem é de dois portais vê cada lista no seu):
--       agência  = gestor+ da agência ou responsável/equipe do negócio (my_project_agency_deal_ids): canal da marca e
--                  canais dos heróis que têm mensagem; salas abertas e arquivadas, inclusive mensagens internas;
--       marca    = membros com o negócio visível (brand_visible) e com pedido (a página da campanha é por pedido): canal
--                  da marca (vazio também, se o negócio está aberto: é onde ela começa a conversa); salas abertas, só
--                  público 'all' (nunca as internas);
--       herói    = o próprio canal de cada oportunidade consultada (vazio também se aberta e não recusada/removida) e
--                  as salas abertas em que é herói-cliente ou contratado, só 'all';
--       staff    = salas abertas em que é membro ativo, com as internas.
--     Sala que pede NDA ainda não assinado aparece travada (locked), sem prévia nem contagem: o título e a agência já
--     aparecem em "Meus projetos" (my_project_rooms, 0110).
--   • Não lidas: não existia marcador de leitura nas duas tabelas (os painéis da 0078/0081 usam "última mensagem é do
--     outro lado"). Novo marcador por pessoa e conversa (conversation_reads), gravado só pela RPC
--     conversation_mark_read (as páginas da conversa chamam ao abrir). Leitura efetiva = o mais recente entre o
--     marcador e a última mensagem da própria pessoa naquela conversa (quem respondeu leu); sem marcador e sem
--     mensagem própria, tudo o que veio do outro lado conta. Nos canais 1:1 (deal_messages) conta só o OUTRO lado
--     (resposta de um colega da agência não vira "não lida"); na sala (multi-parte) conta qualquer pessoa que não seja
--     você. Linhas de sistema da sala não contam nem viram prévia (são "código|parâmetro", traduzidas só na sala).
--   • Abrir a conversa também marca como lidos os avisos "Nova mensagem" daquela conversa (mesmo negócio e link do
--     mesmo tipo: sala x canal), para o sino e a lista não contarem a mesma coisa duas vezes.
--   • Uma chamada só por tela: conversation_list devolve a página (limite 1–200, padrão 50, "carregar mais" pelo
--     deslocamento) já filtrada (tipo, não lidas, busca por nome/título) e as contagens de não lidas por tipo;
--     conversation_unread devolve só o total (sino). Nada de valor sai daqui (prévia = texto da mensagem, até 140).
-- =============================================================================

-- 1) marcador de leitura por pessoa e conversa ----------------------------------------------------------------------
create table if not exists public.conversation_reads (
  user_id uuid not null constraint conversation_reads_user_fk references auth.users (id) on delete cascade,
  conv_key text not null,
  read_at timestamptz not null default now(),
  constraint conversation_reads_pk primary key (user_id, conv_key),
  constraint conversation_reads_key_check check (conv_key ~ ('^(deal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(brand|talent:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
                                                             || '|room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))
);
alter table public.conversation_reads enable row level security;
revoke all on table public.conversation_reads from public, anon, authenticated;
grant select on table public.conversation_reads to authenticated;
grant all on table public.conversation_reads to service_role;
drop policy if exists conversation_reads_select_own on public.conversation_reads;
create policy conversation_reads_select_own on public.conversation_reads for select to authenticated
  using (user_id = (select auth.uid()));

-- índice para "última mensagem do canal do herói" (o de 0066 cobre deal_id, channel, created_at)
create index if not exists deal_messages_talent_thread_idx on public.deal_messages (deal_id, talent_id, created_at) where channel = 'talent_agency';

-- 2) núcleo: as conversas da pessoa num portal (interno; só as RPCs abaixo chamam) ------------------------------------
create or replace function public.conversation_rows(p_portal text)
returns table (conv_key text, kind text, deal_id uuid, request_id uuid, deal_talent_id uuid, talent_id uuid, title text,
               counterpart text, avatar_url text, stage text, outcome text, talent_status text, room_status text, locked boolean,
               last_at timestamptz, last_author text, last_body text, last_attachment boolean, unread integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_talent uuid; v_agency_deals uuid[] := '{}'::uuid[]; v_brands uuid[] := '{}'::uuid[];
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_portal is null or p_portal not in ('agency', 'brand', 'hero', 'staff') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_portal = 'agency' then v_agency_deals := public.my_project_agency_deal_ids(); end if;
  if p_portal = 'brand' then v_brands := public.my_brand_ids(false); end if;
  if p_portal = 'hero' then v_talent := public.my_talent_id(); end if;

  return query
  with cand as (
    -- agência: canal da marca com mensagem
    select 'deal:' || d.id::text || ':brand' as k, 'campaign'::text as knd, d.id as did, null::uuid as tid, null::uuid as dtid,
           false as internal, 'agency'::text as side, false as lck
    from public.deals d
    where p_portal = 'agency' and d.id = any (v_agency_deals)
      and exists (select 1 from public.deal_messages m where m.deal_id = d.id and m.channel = 'brand_agency')
    union all
    -- agência: um canal por herói com mensagem
    select 'deal:' || x.deal_id::text || ':talent:' || x.talent_id::text, 'opportunity', x.deal_id, x.talent_id,
           (select dt.id from public.deal_talents dt where dt.deal_id = x.deal_id and dt.talent_id = x.talent_id), false, 'agency', false
    from (select distinct m.deal_id, m.talent_id from public.deal_messages m
          where p_portal = 'agency' and m.channel = 'talent_agency' and m.deal_id = any (v_agency_deals)) x
    union all
    -- agência: salas (abertas e arquivadas), com as internas
    select 'room:' || r.deal_id::text, 'room', r.deal_id, null, null, true, 'agency', false
    from public.project_rooms r where p_portal = 'agency' and r.deal_id = any (v_agency_deals)
    union all
    -- marca: canal com a agência (vazio só se o negócio está aberto)
    select 'deal:' || d.id::text || ':brand', 'campaign', d.id, null, null, false, 'brand', false
    from public.deals d
    where p_portal = 'brand' and d.brand_visible and d.brand_id = any (v_brands) and d.request_id is not null
      and (d.stage <> 'closed' or exists (select 1 from public.deal_messages m where m.deal_id = d.id and m.channel = 'brand_agency'))
    union all
    -- marca: salas abertas, só público 'all'
    select 'room:' || r.deal_id::text, 'room', r.deal_id, null, null, false, 'brand', false
    from public.project_rooms r join public.deals d on d.id = r.deal_id
    where p_portal = 'brand' and r.status = 'open' and d.brand_visible and d.brand_id = any (v_brands)
    union all
    -- herói: o próprio canal de cada oportunidade consultada
    select 'deal:' || dt.deal_id::text || ':talent:' || dt.talent_id::text, 'opportunity', dt.deal_id, dt.talent_id, dt.id, false, 'talent', false
    from public.deal_talents dt join public.deals d on d.id = dt.deal_id
    where p_portal = 'hero' and v_talent is not null and dt.talent_id = v_talent and dt.consulted_at is not null
      and ((d.stage <> 'closed' and dt.status not in ('declined', 'removed'))
           or exists (select 1 from public.deal_messages m where m.deal_id = dt.deal_id and m.channel = 'talent_agency' and m.talent_id = dt.talent_id))
    union all
    -- herói: salas abertas como herói-cliente ou contratado (travada se a agência pediu NDA dos heróis e falta assinar)
    select 'room:' || r.deal_id::text, 'room', r.deal_id, null, null, false, 'talent',
           r.nda_heroes and not exists (select 1 from public.project_nda_signatures s where s.deal_id = r.deal_id and s.user_id = v_uid)
    from public.project_rooms r join public.deals d on d.id = r.deal_id
    where p_portal = 'hero' and v_talent is not null and r.status = 'open'
      and (d.client_talent_id = v_talent
           or exists (select 1 from public.deal_talents dt where dt.deal_id = d.id and dt.talent_id = v_talent and dt.status = 'contracted'))
    union all
    -- staff externo: salas abertas em que é membro ativo (travada até o NDA), com as internas
    select 'room:' || r.deal_id::text, 'room', r.deal_id, null, null, true, 'staff',
           not exists (select 1 from public.project_nda_signatures s where s.deal_id = r.deal_id and s.user_id = v_uid)
    from public.project_rooms r
    where p_portal = 'staff' and r.status = 'open'
      and exists (select 1 from public.project_room_members pm where pm.deal_id = r.deal_id and pm.user_id = v_uid and pm.status = 'active')
  ),
  msgs as (
    -- mensagens legíveis de cada conversa (texto/arquivo; nunca as de sistema da sala)
    select c.k, m.id, m.created_at, m.author_id, m.author_side, m.author_label, m.body, false as att
    from cand c join public.deal_messages m on m.deal_id = c.did
      and m.channel = case c.knd when 'campaign' then 'brand_agency' else 'talent_agency' end
      and (c.knd = 'campaign' or m.talent_id = c.tid)
    where c.knd <> 'room'
    union all
    select c.k, pm.id, pm.created_at, pm.author_id, pm.author_side, pm.author_label, pm.body, pm.attachment_path is not null
    from cand c join public.project_room_messages pm on pm.deal_id = c.did and pm.status = 'posted' and pm.kind = 'text'
      and (pm.audience = 'all' or c.internal)
    where c.knd = 'room' and not c.lck
  ),
  seen as (
    select c.k, greatest((select cr.read_at from public.conversation_reads cr where cr.user_id = v_uid and cr.conv_key = c.k),
                         (select max(mm.created_at) from msgs mm where mm.k = c.k and mm.author_id = v_uid)) as at
    from cand c
  )
  select c.k, c.knd, d.id, d.request_id, c.dtid, c.tid, d.title,
         case when c.side <> 'agency' then a.name
              when c.knd = 'campaign' then b.name
              when c.knd = 'opportunity' then tp.display_name
              else coalesce(b.name, ct.display_name, a.name) end,
         case when c.side <> 'agency' then null
              when c.knd = 'opportunity' then cp.avatar_url
              when b.id is not null then b.logo_url
              else ccp.avatar_url end,
         d.stage, d.outcome,
         (select dt.status from public.deal_talents dt where dt.id = c.dtid),
         r.status, c.lck,
         coalesce(lm.created_at, r.opened_at, d.updated_at),
         lm.author_label, left(lm.body, 140), coalesce(lm.att, false),
         (select count(*)::int from msgs mm join seen s on s.k = mm.k
          where mm.k = c.k and mm.created_at > coalesce(s.at, '-infinity'::timestamptz)
            and (case when c.knd = 'room' then mm.author_id is distinct from v_uid else mm.author_side <> c.side end))
  from cand c
  join public.deals d on d.id = c.did
  join public.agencies a on a.id = d.agency_id
  left join public.brands b on b.id = d.brand_id
  left join public.talent_profiles tp on tp.id = c.tid
  left join public.creator_profiles cp on cp.id = tp.creator_id
  left join public.talent_profiles ct on ct.id = d.client_talent_id
  left join public.creator_profiles ccp on ccp.id = ct.creator_id
  left join public.project_rooms r on c.knd = 'room' and r.deal_id = d.id
  left join lateral (select mm.created_at, mm.author_label, mm.body, mm.att from msgs mm where mm.k = c.k
                     order by mm.created_at desc, mm.id desc limit 1) lm on true;
end $$;
revoke execute on function public.conversation_rows(text) from public, anon, authenticated;
grant execute on function public.conversation_rows(text) to service_role;

-- 3) a lista (uma chamada por tela) e o total de não lidas (sino) -------------------------------------------------------
create or replace function public.conversation_list(p_portal text, p_limit integer default 50, p_offset integer default 0,
  p_kind text default null, p_unread boolean default false, p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200); v_offset int := greatest(coalesce(p_offset, 0), 0);
        v_q text := nullif(btrim(left(coalesce(p_q, ''), 80)), ''); v_pat text; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind is not null and p_kind not in ('campaign', 'opportunity', 'room') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with x as materialized (select * from public.conversation_rows(p_portal)),
  f as (
    select * from x
    where (p_kind is null or x.kind = p_kind) and (not coalesce(p_unread, false) or x.unread > 0)
      and (v_pat is null or x.title ilike v_pat or x.counterpart ilike v_pat)
  ),
  pg as (select * from f order by f.last_at desc, f.conv_key limit v_limit + 1 offset v_offset)
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('key', pg.conv_key, 'kind', pg.kind, 'deal_id', pg.deal_id, 'request_id', pg.request_id,
        'deal_talent_id', pg.deal_talent_id, 'talent_id', pg.talent_id, 'title', pg.title, 'counterpart', pg.counterpart, 'avatar_url', pg.avatar_url,
        'stage', pg.stage, 'outcome', pg.outcome, 'talent_status', pg.talent_status, 'room_status', pg.room_status, 'locked', pg.locked,
        'last_at', pg.last_at, 'last_author', pg.last_author, 'last_body', pg.last_body, 'last_attachment', pg.last_attachment, 'unread', pg.unread)
        order by pg.last_at desc, pg.conv_key)
      from (select * from pg order by pg.last_at desc, pg.conv_key limit v_limit) pg), '[]'::jsonb),
    'has_more', (select count(*) from pg) > v_limit,
    'total', (select count(*) from x),
    'unread', jsonb_build_object(
      'total', (select count(*) from x where x.unread > 0),
      'campaign', (select count(*) from x where x.unread > 0 and x.kind = 'campaign'),
      'opportunity', (select count(*) from x where x.unread > 0 and x.kind = 'opportunity'),
      'room', (select count(*) from x where x.unread > 0 and x.kind = 'room')),
    'kinds', jsonb_build_object(
      'campaign', (select count(*) from x where x.kind = 'campaign'),
      'opportunity', (select count(*) from x where x.kind = 'opportunity'),
      'room', (select count(*) from x where x.kind = 'room')))
  into v_out;
  return v_out;
end $$;
revoke execute on function public.conversation_list(text, integer, integer, text, boolean, text) from public, anon;
grant execute on function public.conversation_list(text, integer, integer, text, boolean, text) to authenticated, service_role;

create or replace function public.conversation_unread(p_portal text)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  return (select count(*)::int from public.conversation_rows(p_portal) x where x.unread > 0);
end $$;
revoke execute on function public.conversation_unread(text) from public, anon;
grant execute on function public.conversation_unread(text) to authenticated, service_role;

-- 4) marcar como lida (ao abrir a conversa): só quem participa; limpa também os avisos "Nova mensagem" dela ----------
create or replace function public.conversation_mark_read(p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_key text := lower(btrim(coalesce(p_key, ''))); v_deal uuid; v_talent uuid; v_room boolean;
        v_ok boolean := false; v_dts uuid[];
        c_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_key ~ ('^room:' || c_uuid || '$') then
    v_room := true; v_deal := substr(v_key, 6, 36)::uuid;
    v_ok := public.project_room_side(v_deal) is not null and exists (select 1 from public.project_rooms r where r.deal_id = v_deal);
  elsif v_key ~ ('^deal:' || c_uuid || ':brand$') then
    v_room := false; v_deal := substr(v_key, 6, 36)::uuid;
    v_ok := v_deal = any (public.my_project_agency_deal_ids()) or v_deal = any (public.my_brand_deal_ids());
  elsif v_key ~ ('^deal:' || c_uuid || ':talent:' || c_uuid || '$') then
    v_room := false; v_deal := substr(v_key, 6, 36)::uuid; v_talent := substr(v_key, 50, 36)::uuid;
    v_ok := v_deal = any (public.my_project_agency_deal_ids())
         or (v_talent = public.my_talent_id() and v_deal = any (public.my_talent_deal_ids()));
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not coalesce(v_ok, false) then return false; end if;

  insert into public.conversation_reads (user_id, conv_key, read_at) values (v_uid, v_key, now())
  on conflict (user_id, conv_key) do update set read_at = excluded.read_at;

  -- avisos "Nova mensagem" desta conversa (sala x canal pelo link; canal do herói também pelo deal_talent)
  select coalesce(array_agg(dt.id), '{}'::uuid[]) into v_dts from public.deal_talents dt
  where dt.deal_id = v_deal and (v_talent is null or dt.talent_id = v_talent);
  update public.inbox_notifications n set read_at = now()
  where n.user_id = v_uid and n.read_at is null and n.kind = 'message_received'
    and (n.entity_id = v_deal or (not v_room and n.entity_id = any (v_dts)))
    and ((n.link = '/agencia/negocios/' || v_deal::text || '/sala' or n.link like '%/projetos/' || v_deal::text) = v_room);
  return true;
end $$;
revoke execute on function public.conversation_mark_read(text) from public, anon;
grant execute on function public.conversation_mark_read(text) to authenticated, service_role;
