-- =============================================================================
-- Groscove Ultra · 0076 · Programa como bloco do conteúdo
--   Decisão do responsável (01/11/2026): o "Novo conteúdo" passa a ser um conteúdo estruturado,
--   com o bloco do pilar (treino, nutrição ou cardápio; 0075) e, além dele, um programa do herói
--   "aí dentro". O programa é um bloco à parte: convive com o bloco do pilar (dois slots), aponta para
--   um programa publicado do mesmo herói e a página do conteúdo mostra o cartão com o atalho.
--
--   * post_blocks.kind aceita 'program'; data = {"program_id": uuid, "note": texto ≤ 300}.
--   * post_block_set: 'program' não apaga o bloco do pilar nem as marcações do treino; o bloco do
--     pilar continua apagando os outros do pilar, mas preserva o programa. p_kind nulo segue apagando
--     tudo (post rápido que volta para Rotina). Referência conferida: programa existe, publicado, com
--     versão atual, do mesmo herói do conteúdo.
-- Regras: nada de drop de tabela/coluna; search_path fixo; grants explícitos; nenhuma função nova com
-- execute para anon (a lista pública do S14 continua com 18); políticas inalteradas.
-- =============================================================================

-- ---------------------------------------------------------------- 1) forma do bloco de programa
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
  elsif p_kind = 'program' then
    -- um programa por conteúdo, com uma chamada curta opcional ("note" sempre presente, pode ser vazia)
    if not public.post_block_uuid_ok(p_data -> 'program_id') then return false; end if;
    if jsonb_typeof(p_data -> 'note') is distinct from 'string' or char_length(p_data ->> 'note') > 300 then return false; end if;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.post_block_data_ok(text, jsonb) from public, anon;
grant execute on function public.post_block_data_ok(text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- 2) o tipo novo na tabela
alter table public.post_blocks drop constraint if exists post_blocks_kind_check;
alter table public.post_blocks add constraint post_blocks_kind_check check (kind in ('workout', 'nutrition', 'menu', 'program'));

-- ---------------------------------------------------------------- 3) gravar o bloco (dois slots: pilar e programa)
-- Pilar (treino, nutrição, cardápio): um por conteúdo, gravar um apaga os outros dois e as marcações do
-- treino; o programa fica. Programa: não mexe no bloco do pilar nem nas marcações. p_data nulo apaga o
-- tipo; p_kind nulo apaga tudo. Programa: publicado, com versão atual, do mesmo herói do conteúdo.
create or replace function public.post_block_set(p_content uuid, p_kind text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.content%rowtype; v jsonb; v_ref uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_kind is not null and p_kind not in ('workout', 'nutrition', 'menu', 'program') then raise exception 'invalid_block'; end if;
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
  elsif p_kind = 'program' then
    v_ref := (p_data ->> 'program_id')::uuid;
    -- coalesce: conteúdo sem herói (creator_id nulo) não aponta para programa de ninguém
    if not exists (select 1 from public.programs g where g.id = v_ref and g.status = 'published' and g.current_version_id is not null and coalesce(g.creator_id = c.creator_id, false)) then
      raise exception 'invalid_reference';
    end if;
  end if;
  insert into public.post_blocks (content_id, kind, data) values (p_content, p_kind, p_data)
  on conflict (content_id, kind) do update set data = excluded.data;
  if p_kind <> 'program' then
    -- um pilar por conteúdo: os outros blocos do pilar saem; o programa fica
    delete from public.post_blocks where content_id = p_content and kind not in (p_kind, 'program');
    -- treino trocado ou removido: as marcações antigas dos passos deixam de valer
    delete from public.post_step_checks where content_id = p_content;
  end if;
end $$;
revoke execute on function public.post_block_set(uuid, text, jsonb) from public, anon;
grant execute on function public.post_block_set(uuid, text, jsonb) to authenticated, service_role;
