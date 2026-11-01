-- =============================================================================
-- Groscove Ultra · 0075 · Blocos por pilar no Novo post
--   Decisão do responsável (01/11/2026): o pilar escolhido no Novo post define o que mais o post
--   carrega. Rotina: só foto/vídeo, título e legenda. Treino: explicação e passos "a fazer", que cada
--   seguidor marca para si. Nutrição: receita já cadastrada do herói, produto da loja ou prato livre.
--   Gastronomia: cardápio do chef (1 a 5 opções, cada uma podendo apontar para uma receita).
--
--   * post_blocks: um bloco por tipo por conteúdo (data jsonb com forma e tamanhos conferidos por
--     post_block_data_ok). Leitura segue a regra única de acesso ao conteúdo (can_access_content);
--     escrita só pela RPC post_block_set (dono do conteúdo, ou o admin pelo herói: my_creator_id).
--     Referências (receita do próprio herói publicada; produto publicado) são conferidas na RPC.
--   * post_step_checks: marcação por pessoa dos passos do treino (RPC post_step_toggle; a pessoa
--     lê só as próprias). Some junto com a conta e com o conteúdo.
-- Regras: nada de drop/truncate; search_path fixo; grants explícitos; nenhuma função nova com
-- execute para anon (a lista pública do S14 continua com 18); políticas com (select ...).
-- =============================================================================

-- ---------------------------------------------------------------- 1) forma e limites do bloco
create or replace function public.post_block_uuid_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
$$;
revoke execute on function public.post_block_uuid_ok(jsonb) from public, anon;
grant execute on function public.post_block_uuid_ok(jsonb) to authenticated, service_role;

create or replace function public.post_block_data_ok(p_kind text, p_data jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v jsonb; n int;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 16384 then return false; end if;
  if p_kind = 'workout' then
    -- "is distinct from": chave ausente é nulo, e nulo nunca pode passar (jsonb_typeof(null) é nulo)
    if jsonb_typeof(p_data -> 'description') is distinct from 'string' or char_length(p_data ->> 'description') > 2000 then return false; end if;
    if jsonb_typeof(p_data -> 'steps') is distinct from 'array' then return false; end if;
    n := jsonb_array_length(p_data -> 'steps');
    if n is null or n < 1 or n > 20 then return false; end if;
    for v in select * from jsonb_array_elements(p_data -> 'steps') loop
      if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v -> 'text') is distinct from 'string'
         or char_length(btrim(v ->> 'text')) < 1 or char_length(v ->> 'text') > 200 then return false; end if;
    end loop;
    return true;
  elsif p_kind = 'nutrition' then
    if jsonb_typeof(p_data -> 'items') is distinct from 'array' then return false; end if;
    n := jsonb_array_length(p_data -> 'items');
    if n is null or n < 1 or n > 6 then return false; end if;
    for v in select * from jsonb_array_elements(p_data -> 'items') loop
      if jsonb_typeof(v) is distinct from 'object' then return false; end if;
      if v ->> 'kind' = 'recipe' then
        if not public.post_block_uuid_ok(v -> 'content_id') then return false; end if;
      elsif v ->> 'kind' = 'product' then
        if not public.post_block_uuid_ok(v -> 'product_id') then return false; end if;
      elsif v ->> 'kind' = 'dish' then
        if jsonb_typeof(v -> 'name') is distinct from 'string' or char_length(btrim(v ->> 'name')) < 1 or char_length(v ->> 'name') > 80 then return false; end if;
        if jsonb_typeof(v -> 'description') is distinct from 'string' or char_length(v ->> 'description') > 300 then return false; end if;
      else
        return false;
      end if;
    end loop;
    return true;
  elsif p_kind = 'menu' then
    if jsonb_typeof(p_data -> 'options') is distinct from 'array' then return false; end if;
    n := jsonb_array_length(p_data -> 'options');
    if n is null or n < 1 or n > 5 then return false; end if;
    for v in select * from jsonb_array_elements(p_data -> 'options') loop
      if jsonb_typeof(v) is distinct from 'object' then return false; end if;
      if jsonb_typeof(v -> 'name') is distinct from 'string' or char_length(btrim(v ->> 'name')) < 1 or char_length(v ->> 'name') > 80 then return false; end if;
      if jsonb_typeof(v -> 'description') is distinct from 'string' or char_length(v ->> 'description') > 300 then return false; end if;
      if v ? 'recipe_id' and jsonb_typeof(v -> 'recipe_id') <> 'null' and not public.post_block_uuid_ok(v -> 'recipe_id') then return false; end if;
    end loop;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.post_block_data_ok(text, jsonb) from public, anon;
grant execute on function public.post_block_data_ok(text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- 2) tabelas
create table if not exists public.post_blocks (
  content_id uuid not null references public.content (id) on delete cascade,
  kind text not null check (kind in ('workout', 'nutrition', 'menu')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (content_id, kind),
  constraint post_blocks_data_check check (public.post_block_data_ok(kind, data))
);
drop trigger if exists trg_post_blocks_updated on public.post_blocks;
create trigger trg_post_blocks_updated before update on public.post_blocks
  for each row execute function public.set_updated_at();

create table if not exists public.post_step_checks (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  step_index smallint not null check (step_index between 0 and 19),
  checked_at timestamptz not null default now(),
  primary key (user_id, content_id, step_index)
);
create index if not exists post_step_checks_content_idx on public.post_step_checks (content_id);

alter table public.post_blocks enable row level security;
alter table public.post_step_checks enable row level security;
revoke all on table public.post_blocks from public, anon;
revoke all on table public.post_step_checks from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.post_blocks from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.post_step_checks from authenticated;
grant select on table public.post_blocks to authenticated;
grant select on table public.post_step_checks to authenticated;
grant all on table public.post_blocks to service_role;
grant all on table public.post_step_checks to service_role;

-- leitura: a mesma regra do corpo (quem pode consumir o conteúdo); as marcações, só as próprias
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_blocks' and policyname = 'post_blocks_select') then
    create policy post_blocks_select on public.post_blocks for select to authenticated
      using ((select public.can_access_content(content_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_step_checks' and policyname = 'post_step_checks_select_own') then
    create policy post_step_checks_select_own on public.post_step_checks for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------- 3) gravar o bloco (dono do conteúdo; admin ou agência pelo herói, via my_creator_id)
-- Um post tem um pilar, logo um bloco: gravar um tipo apaga os outros. p_data nulo apaga o tipo;
-- p_kind nulo apaga todos (post que volta para Rotina depois de uma tentativa com bloco). Receita:
-- conteúdo do tipo receita, do mesmo herói, no ar. Produto: publicado e sem moderação pendente.
-- Conteúdo arquivado não recebe bloco.
create or replace function public.post_block_set(p_content uuid, p_kind text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.content%rowtype; v jsonb; v_ref uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind is not null and p_kind not in ('workout', 'nutrition', 'menu') then raise exception 'invalid_block'; end if;
  if p_kind is null and p_data is not null then raise exception 'invalid_block'; end if;
  select * into c from public.content where id = p_content for update;
  if not found then raise exception 'not_found'; end if;
  -- coalesce: sem herói ligado my_creator_id() é nulo, e "nulo = x" não pode virar "pode"
  if not (public.is_admin() or coalesce(c.creator_id = public.my_creator_id(), false)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status = 'archived' then raise exception 'not_draft'; end if;
  if p_data is null then
    delete from public.post_blocks where content_id = p_content and (p_kind is null or kind = p_kind);
    if p_kind is null or p_kind = 'workout' then delete from public.post_step_checks where content_id = p_content; end if;
    return;
  end if;
  if not public.post_block_data_ok(p_kind, p_data) then raise exception 'invalid_block'; end if;
  if p_kind = 'nutrition' then
    for v in select * from jsonb_array_elements(p_data -> 'items') loop
      if v ->> 'kind' = 'recipe' then
        v_ref := (v ->> 'content_id')::uuid;
        if not exists (select 1 from public.content r where r.id = v_ref and r.type = 'recipe' and r.creator_id = c.creator_id and r.status = 'published') then
          raise exception 'invalid_reference';
        end if;
      elsif v ->> 'kind' = 'product' then
        v_ref := (v ->> 'product_id')::uuid;
        if not exists (select 1 from public.products p where p.id = v_ref and p.status = 'published' and p.moderation_status = 'clear') then
          raise exception 'invalid_reference';
        end if;
      end if;
    end loop;
  elsif p_kind = 'menu' then
    for v in select * from jsonb_array_elements(p_data -> 'options') loop
      if v ? 'recipe_id' and jsonb_typeof(v -> 'recipe_id') <> 'null' then
        v_ref := (v ->> 'recipe_id')::uuid;
        if not exists (select 1 from public.content r where r.id = v_ref and r.type = 'recipe' and r.creator_id = c.creator_id and r.status = 'published') then
          raise exception 'invalid_reference';
        end if;
      end if;
    end loop;
  end if;
  insert into public.post_blocks (content_id, kind, data) values (p_content, p_kind, p_data)
  on conflict (content_id, kind) do update set data = excluded.data;
  delete from public.post_blocks where content_id = p_content and kind <> p_kind;
  -- treino trocado ou removido: as marcações antigas dos passos deixam de valer
  delete from public.post_step_checks where content_id = p_content;
end $$;
revoke execute on function public.post_block_set(uuid, text, jsonb) from public, anon;
grant execute on function public.post_block_set(uuid, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- 4) marcar um passo do treino (por pessoa)
-- Só quem pode consumir o conteúdo; o passo precisa existir no bloco. Devolve quantos passos a
-- pessoa já marcou neste conteúdo.
create or replace function public.post_step_toggle(p_content uuid, p_step int, p_done boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_steps int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.can_access_content(p_content) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_array_length(b.data -> 'steps') into v_steps from public.post_blocks b where b.content_id = p_content and b.kind = 'workout';
  if v_steps is null then raise exception 'not_found'; end if;
  if p_step is null or p_step < 0 or p_step >= v_steps then raise exception 'invalid_step' using errcode = '22023'; end if;
  if coalesce(p_done, true) then
    insert into public.post_step_checks (user_id, content_id, step_index) values (v_uid, p_content, p_step) on conflict do nothing;
  else
    delete from public.post_step_checks where user_id = v_uid and content_id = p_content and step_index = p_step;
  end if;
  return (select count(*) from public.post_step_checks where user_id = v_uid and content_id = p_content);
end $$;
revoke execute on function public.post_step_toggle(uuid, int, boolean) from public, anon;
grant execute on function public.post_step_toggle(uuid, int, boolean) to authenticated, service_role;
