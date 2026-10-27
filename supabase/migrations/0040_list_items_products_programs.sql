-- =============================================================================
-- Ultra Hero · 0040 · Listas pessoais aceitam produtos e programas
-- Até aqui list_items só guardava conteúdo (content_id). Agora cada item aponta para
-- exatamente UM alvo: conteúdo, produto ou programa. O tipo (item_type) é derivado do
-- alvo preenchido (coluna gerada): não há como gravar tipo e alvo divergentes, e o app
-- antigo, que insere só content_id, continua funcionando sem mudança.
-- Idempotente: cada passo confere o estado antes de alterar (pode rodar de novo sem efeito).
-- =============================================================================

-- ---------------------------------------------------------------- colunas novas
-- id próprio substitui a chave (list_id, content_id), que exigia content_id preenchido.
alter table public.list_items add column if not exists id uuid not null default gen_random_uuid();
alter table public.list_items add column if not exists product_id uuid references public.products (id) on delete cascade;
alter table public.list_items add column if not exists program_id uuid references public.programs (id) on delete cascade;

-- ---------------------------------------------------------------- chave primária e unicidade
do $$
declare v_pk_cols text;
begin
  select string_agg(a.attname, ',' order by a.attname) into v_pk_cols
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.list_items'::regclass and c.contype = 'p';
  if v_pk_cols is distinct from 'id' then
    if v_pk_cols is not null then
      alter table public.list_items drop constraint list_items_pkey;
    end if;
    alter table public.list_items add constraint list_items_pkey primary key (id);
  end if;
  -- Únicos "cheios" (não parciais): NULL não colide, e o upsert on_conflict=list_id,content_id
  -- do app no ar continua achando o índice. Um por alvo para não duplicar item na lista.
  if not exists (select 1 from pg_constraint where conrelid = 'public.list_items'::regclass and conname = 'list_items_list_content_key') then
    alter table public.list_items add constraint list_items_list_content_key unique (list_id, content_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.list_items'::regclass and conname = 'list_items_list_product_key') then
    alter table public.list_items add constraint list_items_list_product_key unique (list_id, product_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.list_items'::regclass and conname = 'list_items_list_program_key') then
    alter table public.list_items add constraint list_items_list_program_key unique (list_id, program_id);
  end if;
end $$;

alter table public.list_items alter column content_id drop not null;

-- ---------------------------------------------------------------- tipo derivado + exatamente um alvo
alter table public.list_items add column if not exists item_type text generated always as (
  case when content_id is not null then 'content' when product_id is not null then 'product' when program_id is not null then 'program' end
) stored;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.list_items'::regclass and conname = 'list_items_one_target') then
    alter table public.list_items add constraint list_items_one_target check (num_nonnulls(content_id, product_id, program_id) = 1);
  end if;
end $$;

-- Apagar produto/programa apaga o item (cascade): os índices evitam varrer a tabela nessa hora.
create index if not exists list_items_product_idx on public.list_items (product_id) where product_id is not null;
create index if not exists list_items_program_idx on public.list_items (program_id) where program_id is not null;

-- ---------------------------------------------------------------- RLS
-- list_items_own (0007/0016) segue valendo para tudo: só o dono da lista lê e grava.
-- Esta política RESTRITIVA soma uma condição ao gravar (insert/update): produto só se estiver
-- visível ao público (publicado, sem moderação e de vendedor ativo) e programa só se publicado.
-- As condições são explícitas (não "o que a RLS me deixa ver"): o vendedor não salva o próprio
-- rascunho e o admin não salva programa em rascunho. Sem USING: leitura e remoção não mudam.
-- Conteúdo mantém a regra de antes (só a posse da lista).
drop policy if exists list_items_target_public on public.list_items;
create policy list_items_target_public on public.list_items as restrictive for all to authenticated
  with check (
    content_id is not null
    or (product_id is not null and exists (
          select 1 from public.products p join public.seller_organizations o on o.id = p.seller_org_id
          where p.id = list_items.product_id and p.status = 'published' and p.moderation_status = 'clear' and o.status = 'active'))
    or (program_id is not null and exists (
          select 1 from public.programs g where g.id = list_items.program_id and g.status = 'published'))
  );

-- O PostgREST passa a enxergar as colunas e as relações novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
