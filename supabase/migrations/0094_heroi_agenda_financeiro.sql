-- =============================================================================
-- Groscove Ultra · 0094 · Agenda e financeiro do Hero (creator logado) · cenário S101
-- Pedido do responsável (03/11): "o Hero precisa acessar a agenda dele rapidamente para ver os compromissos e tudo
-- que ele precisa executar, além da parte financeira para saber quanto vai receber de cada serviço".
-- Idempotente; nada de drop de tabela/coluna; S14 segue 18 (nenhuma função nova com execute para anon; as de
-- apoio são security definer só para authenticated/service_role).
--
-- Decisões (sem perguntar ao responsável):
--   • Hero COM agência (ligado a um talento do casting): reaproveita o escritório que já existe (agenda e ganhos em
--     /creator/escritorio). Nada de tabela nova para ele. Para a tela saber se o Hero em uso é o do casting, o
--     talent_my_context() ganha a chave creator_id (mesma assinatura, só um campo a mais).
--   • Hero INDEPENDENTE (sem agência): duas tabelas escopadas ao Hero (creator_profile_id), com RLS direta (sem RPC de
--     escrita) e grants explícitos, anon nada:
--       hero_events    · compromissos do Hero (gravação | evento | reunião | entrega | outro), com o que executar
--                        em checklist simples (jsonb validado), contratante em texto e serviço vinculado opcional.
--       hero_services  · "serviços e ganhos": quem contratou, data do serviço, valor a receber (centavos BRL), vencimento,
--                        situação (a receber | recebido | cancelado; "vencido" NÃO é gravado: é calculado pela data),
--                        forma/observação e comprovante opcional.
--   • Quem enxerga o quê (a equipe não precisa ver o que o titular recebe):
--       agenda     · titular e membros da equipe leem; só o TITULAR cria, edita e exclui (membro só consulta);
--       financeiro · só o titular (e o admin, para suporte). Membro não lê nem escreve (RLS). O admin só lê.
--       Hero SUSPENSO não escreve (leitura continua para o titular poder se organizar).
--   • Itens de serviço com data aparecem na agenda sem cadastro duplo: hero_service_dates() devolve, para a equipe,
--     só título, contratante e data do serviço (nunca valor, vencimento nem situação). Um serviço que já tem
--     compromisso vinculado não aparece duas vezes (a tela deduplica).
--   • Escritório de Hero com agência: o financeiro segue a mesma regra. Antes (0091) o membro da equipe abria o
--     escritório inteiro e lia o repasse (cachê) do titular. Agora my_talent_owner_id() (nova, authenticated) só devolve
--     o talento para o titular, e talent_payouts() (MESMA assinatura) e a política de leitura do repasse a usam: o membro
--     da equipe continua na agenda, tarefas, oportunidades etc., mas não vê o cachê. Valor da marca e comissão nunca
--     chegam ao creator (regras 0072/0082 intactas).
--   • Comprovante: bucket privado hero-proofs (pdf/jpg/png/webp, até 10 MB), caminho <Hero>/<serviço>/<arquivo>.
--     A agência e o armazenamento de documentos da agência (agency-docs) não valem para quem não tem agência; aqui só o
--     titular (e o admin, leitura) lê e envia. O navegador envia direto; o caminho é validado no banco (prefixo do Hero).
--   • Feed .ics privado: calendar_feed_resolve (MESMA assinatura, 0067) passa a incluir os compromissos do Hero e as
--     datas de serviço (sem valores) dos Heros em que a pessoa está na equipe. Mesmo link/token do feed da pessoa.
--   • Lembrete de vencimento no sino: FICOU DE FORA. O sino do creator só existe no escritório do casting; o Hero
--     independente não tem onde ver o aviso. O vencido aparece em destaque no Financeiro e no resumo do Perfil.
-- =============================================================================

-- 1) funções de apoio (security definer; políticas e storage chamam como o próprio usuário) -------------------------
-- Heros (não suspensos) de que a pessoa logada é titular: quem ESCREVE agenda e financeiro
create or replace function public.my_active_owned_creator_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}'::uuid[]) from public.creator_profiles c
  where c.user_id = auth.uid() and c.status <> 'suspended'
$$;
revoke execute on function public.my_active_owned_creator_ids() from public, anon;
grant execute on function public.my_active_owned_creator_ids() to authenticated, service_role;

-- talento do casting só para o TITULAR (o membro da equipe do Hero recebe null): ganhos/cachê
create or replace function public.my_talent_owner_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t from (select public.my_talent_id() as t) x where x.t is not null and public.talent_user_id(x.t) = auth.uid()
$$;
revoke execute on function public.my_talent_owner_id() from public, anon;
grant execute on function public.my_talent_owner_id() to authenticated, service_role;

-- checklist do compromisso: lista de até 30 itens {text 1..200, done boolean}
create or replace function public.hero_checklist_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 30 then return false; end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('text', 'done') then return false; end if;
    end loop;
    if coalesce(jsonb_typeof(e -> 'text'), '') <> 'string' or char_length(btrim(e ->> 'text')) not between 1 and 200 then return false; end if;
    if coalesce(jsonb_typeof(e -> 'done'), '') <> 'boolean' then return false; end if;
  end loop;
  return true;
end $$;
revoke execute on function public.hero_checklist_valid(jsonb) from public, anon;
grant execute on function public.hero_checklist_valid(jsonb) to authenticated, service_role;

-- 2) serviços e ganhos do Hero ---------------------------------------------------------------------------------------
create table if not exists public.hero_services (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  client text not null check (char_length(btrim(client)) between 1 and 120),
  service_on date not null,
  amount_cents bigint not null check (amount_cents >= 0 and amount_cents <= 100000000000),
  due_on date,
  status text not null default 'receivable' check (status in ('receivable', 'received', 'cancelled')),
  received_on date,
  payment_note text not null default '' check (char_length(payment_note) <= 500),
  proof_path text,
  proof_mime text check (proof_mime is null or proof_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_services_received_check check ((status = 'received') = (received_on is not null)),
  constraint hero_services_proof_path_check check (proof_path is null or (char_length(proof_path) <= 200 and proof_path like creator_profile_id::text || '/%')),
  constraint hero_services_proof_check check ((proof_path is null) = (proof_mime is null))
);
create index if not exists hero_services_hero_idx on public.hero_services (creator_profile_id, service_on desc);
create index if not exists hero_services_open_idx on public.hero_services (creator_profile_id, due_on) where status = 'receivable';

-- 3) compromissos do Hero --------------------------------------------------------------------------------------------
create table if not exists public.hero_events (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  kind text not null default 'other' check (kind in ('shoot', 'event', 'meeting', 'delivery', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '' check (char_length(location) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  checklist jsonb not null default '[]'::jsonb check (public.hero_checklist_valid(checklist)),
  client text not null default '' check (char_length(client) <= 120),
  service_id uuid references public.hero_services (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_events_range_check check (ends_at >= starts_at)
);
create index if not exists hero_events_hero_idx on public.hero_events (creator_profile_id, starts_at);
create index if not exists hero_events_service_idx on public.hero_events (service_id) where service_id is not null;

-- gatilho comum: updated_at, Hero imutável, serviço vinculado do mesmo Hero, created_by
create or replace function public.hero_work_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.creator_profile_id is distinct from old.creator_profile_id then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  elsif new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  if tg_table_name = 'hero_events' then
    -- (aninhado: o campo service_id só existe na linha de hero_events)
    if new.service_id is not null
       and not exists (select 1 from public.hero_services s where s.id = new.service_id and s.creator_profile_id = new.creator_profile_id) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.hero_work_guard() from public, anon, authenticated;
drop trigger if exists hero_services_guard on public.hero_services;
create trigger hero_services_guard before insert or update on public.hero_services for each row execute function public.hero_work_guard();
drop trigger if exists hero_events_guard on public.hero_events;
create trigger hero_events_guard before insert or update on public.hero_events for each row execute function public.hero_work_guard();

-- 4) RLS e grants -----------------------------------------------------------------------------------------------------
alter table public.hero_services enable row level security;
alter table public.hero_events enable row level security;
revoke all on public.hero_services from public, anon, authenticated;
revoke all on public.hero_events from public, anon, authenticated;
grant select, insert, update, delete on public.hero_services to authenticated;
grant select, insert, update, delete on public.hero_events to authenticated;
grant all on public.hero_services to service_role;
grant all on public.hero_events to service_role;

-- financeiro: só o titular lê (o admin geral também, para suporte); só o titular de Hero não suspenso escreve
drop policy if exists hero_services_select on public.hero_services;
create policy hero_services_select on public.hero_services for select to authenticated
  using (creator_profile_id = any ((select public.my_owned_creator_ids())::uuid[]) or (select public.is_platform_admin()));
drop policy if exists hero_services_insert on public.hero_services;
create policy hero_services_insert on public.hero_services for insert to authenticated
  with check (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]));
drop policy if exists hero_services_update on public.hero_services;
create policy hero_services_update on public.hero_services for update to authenticated
  using (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]))
  with check (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]));
drop policy if exists hero_services_delete on public.hero_services;
create policy hero_services_delete on public.hero_services for delete to authenticated
  using (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]));

-- agenda: titular e membros leem (o admin geral também); só o titular escreve
drop policy if exists hero_events_select on public.hero_events;
create policy hero_events_select on public.hero_events for select to authenticated
  using (creator_profile_id = any ((select public.my_team_creator_ids())::uuid[]) or (select public.is_platform_admin()));
drop policy if exists hero_events_insert on public.hero_events;
create policy hero_events_insert on public.hero_events for insert to authenticated
  with check (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]));
drop policy if exists hero_events_update on public.hero_events;
create policy hero_events_update on public.hero_events for update to authenticated
  using (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]))
  with check (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]));
drop policy if exists hero_events_delete on public.hero_events;
create policy hero_events_delete on public.hero_events for delete to authenticated
  using (creator_profile_id = any ((select public.my_active_owned_creator_ids())::uuid[]));

-- 5) datas de serviço para a agenda da equipe (sem valor, vencimento nem situação) -------------------------------------
create or replace function public.hero_service_dates(p_creator uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_creator is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 120 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not (p_creator = any (public.my_team_creator_ids())) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'client', s.client, 'service_on', s.service_on) order by s.service_on, s.created_at)
                   from public.hero_services s
                   where s.creator_profile_id = p_creator and s.status <> 'cancelled' and s.service_on between p_from and p_to), '[]'::jsonb);
end $$;
revoke execute on function public.hero_service_dates(uuid, date, date) from public, anon;
grant execute on function public.hero_service_dates(uuid, date, date) to authenticated, service_role;

-- 6) comprovante: bucket privado hero-proofs -------------------------------------------------------------------------
create or replace function public.hero_proof_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and split_part(coalesce(p_name, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and ((p_write and split_part(p_name, '/', 1)::uuid = any (public.my_active_owned_creator_ids()))
         or (not p_write and (split_part(p_name, '/', 1)::uuid = any (public.my_owned_creator_ids()) or public.is_platform_admin())))
$$;
revoke execute on function public.hero_proof_access(text, boolean) from public, anon;
grant execute on function public.hero_proof_access(text, boolean) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0094: schema storage ausente; bucket e políticas de hero-proofs não foram criados';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('hero-proofs', 'hero-proofs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  execute 'drop policy if exists hero_proofs_select on storage.objects';
  execute $sql$ create policy hero_proofs_select on storage.objects for select to authenticated
    using (bucket_id = 'hero-proofs' and (select public.hero_proof_access(storage.objects.name, false))) $sql$;
  execute 'drop policy if exists hero_proofs_insert on storage.objects';
  execute $sql$ create policy hero_proofs_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'hero-proofs' and (select public.hero_proof_access(storage.objects.name, true))) $sql$;
  execute 'drop policy if exists hero_proofs_delete on storage.objects';
  execute $sql$ create policy hero_proofs_delete on storage.objects for delete to authenticated
    using (bucket_id = 'hero-proofs' and (select public.hero_proof_access(storage.objects.name, true))) $sql$;
end $$;

-- 7) escritório: talent_my_context + creator_id (MESMA assinatura, copiada da 0091) -----------------------------------
create or replace function public.talent_my_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid := public.my_talent_id(); v jsonb;
begin
  if v_talent is null then return null; end if;
  select jsonb_build_object(
    'id', t.id, 'display_name', t.display_name, 'city', t.city, 'state', t.state,
    'availability', t.availability, 'availability_note', t.availability_note,
    'consent_at', t.consent_at, 'consent_version', t.consent_version, 'consent_revoked_at', t.consent_revoked_at,
    'catalog_visible', t.catalog_visible, 'has_public_page', t.creator_id is not null,
    -- 0094: o Hero (página pública) ligado ao talento: a tela sabe se o Hero em uso é o do casting
    'creator_id', t.creator_id,
    'agency', a.name, 'agency_is_demo', a.is_demo,
    'is_team_member', public.talent_user_id(t.id) is distinct from auth.uid(),
    'manager', (select m.display_name from public.agency_members m
                where m.agency_id = t.agency_id and m.user_id = t.manager_id and m.revoked_at is null))
  into v
  from public.talent_profiles t join public.agencies a on a.id = t.agency_id
  where t.id = v_talent;
  return v;
end $$;
revoke execute on function public.talent_my_context() from public, anon;
grant execute on function public.talent_my_context() to authenticated, service_role;

-- 8) ganhos (cachê) só para o titular: política de leitura e talent_payouts (MESMA assinatura, copiada da 0082) --------
drop policy if exists financial_entries_select_talent on public.financial_entries;
create policy financial_entries_select_talent on public.financial_entries for select to authenticated
  using (kind = 'talent_payout' and talent_id = (select public.my_talent_owner_id()));

create or replace function public.talent_payouts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'deal_title', d.title, 'deal_talent_id', f.deal_talent_id, 'status', f.status,
           'amount_cents', f.amount_cents, 'due_on', f.due_on, 'settled_at', f.settled_at,
           'brand_name', b.name, 'deal_id', f.deal_id, 'agency_id', f.agency_id, 'scheduled_on', f.scheduled_on,
           'delivered', (d.stage = 'closed' and d.outcome = 'won')
                        or (exists (select 1 from public.deliverables x where x.deal_talent_id = f.deal_talent_id and x.status <> 'cancelled')
                            and not exists (select 1 from public.deliverables x where x.deal_talent_id = f.deal_talent_id
                                            and x.status not in ('published', 'proof_submitted', 'done', 'cancelled'))),
           'invoice', (select jsonb_build_object('id', i.id, 'status', i.status, 'review_note', i.review_note, 'document_id', i.document_id,
                         'submitted_at', i.created_at, 'reviewed_at', i.reviewed_at)
                       from public.payout_invoices i where i.entry_id = f.id
                       order by (i.status in ('submitted', 'approved')) desc, i.created_at desc, i.id desc limit 1))
         order by f.due_on nulls last, f.created_at), '[]'::jsonb)
  from public.financial_entries f join public.deals d on d.id = f.deal_id join public.brands b on b.id = d.brand_id
  where f.kind = 'talent_payout' and f.talent_id = public.my_talent_owner_id()
$$;
revoke execute on function public.talent_payouts() from public, anon;
grant execute on function public.talent_payouts() to authenticated, service_role;

-- 9) feed .ics: + compromissos e datas de serviço do Hero (MESMA assinatura, copiada da 0067) ------------------------
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
  ) s;
  return jsonb_build_object('user_id', f.user_id, 'events', out);
end $$;
revoke execute on function public.calendar_feed_resolve(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_resolve(text) to service_role;

notify pgrst, 'reload schema';
