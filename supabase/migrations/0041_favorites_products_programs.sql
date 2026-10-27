-- =============================================================================
-- Ultra Hero · 0041 · Favoritos aceitam produtos e programas
-- Até aqui favorites só guardava conteúdo (content_id). Agora cada favorito aponta para
-- exatamente UM alvo: conteúdo, produto ou programa — o mesmo desenho da 0040 nas listas.
-- O tipo (item_type) é derivado do alvo preenchido (coluna gerada): não há como gravar tipo e
-- alvo divergentes, e o app antigo, que grava só content_id (upsert on_conflict user_id,content_id),
-- continua funcionando sem mudança.
-- Funções que leem favoritos (conferidas; nenhuma precisa mudar):
--   · creator_recipe_stats: conta "f.content_id = c.id" — favorito de produto/programa (content_id
--     nulo) nunca casa, então a contagem da receita segue só com conteúdos;
--   · anonymize_user_data: "delete ... where user_id" — apaga os três tipos, como deve;
--   · admin_metrics: conta favoritos criados na janela — passa a somar os três tipos (é engajamento).
-- Idempotente: cada passo confere o estado antes de alterar (pode rodar de novo sem efeito).
-- =============================================================================

-- ---------------------------------------------------------------- colunas novas
-- id próprio substitui a chave (user_id, content_id), que exigia content_id preenchido.
alter table public.favorites add column if not exists id uuid not null default gen_random_uuid();
alter table public.favorites add column if not exists product_id uuid references public.products (id) on delete cascade;
alter table public.favorites add column if not exists program_id uuid references public.programs (id) on delete cascade;

-- ---------------------------------------------------------------- chave primária e unicidade
do $$
declare v_pk_cols text;
begin
  -- Únicos "cheios" (não parciais): NULL não colide, e o upsert on_conflict=user_id,content_id
  -- do app no ar continua achando o índice. Um por alvo para não favoritar duas vezes.
  -- Criados antes de trocar a chave: a tabela nunca fica sem a unicidade (pessoa, conteúdo).
  if not exists (select 1 from pg_constraint where conrelid = 'public.favorites'::regclass and conname = 'favorites_user_content_key') then
    alter table public.favorites add constraint favorites_user_content_key unique (user_id, content_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.favorites'::regclass and conname = 'favorites_user_product_key') then
    alter table public.favorites add constraint favorites_user_product_key unique (user_id, product_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.favorites'::regclass and conname = 'favorites_user_program_key') then
    alter table public.favorites add constraint favorites_user_program_key unique (user_id, program_id);
  end if;

  select string_agg(a.attname, ',' order by a.attname) into v_pk_cols
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.favorites'::regclass and c.contype = 'p';
  if v_pk_cols is distinct from 'id' then
    if v_pk_cols is not null then
      alter table public.favorites drop constraint favorites_pkey;
    end if;
    alter table public.favorites add constraint favorites_pkey primary key (id);
  end if;
end $$;

alter table public.favorites alter column content_id drop not null;

-- ---------------------------------------------------------------- tipo derivado + exatamente um alvo
alter table public.favorites add column if not exists item_type text generated always as (
  case when content_id is not null then 'content' when product_id is not null then 'product' when program_id is not null then 'program' end
) stored;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.favorites'::regclass and conname = 'favorites_one_target') then
    alter table public.favorites add constraint favorites_one_target check (num_nonnulls(content_id, product_id, program_id) = 1);
  end if;
end $$;

-- Apagar conteúdo/produto/programa apaga o favorito (cascade) e a contagem por receita filtra por
-- content_id: os índices evitam varrer a tabela nessas horas.
create index if not exists favorites_content_idx on public.favorites (content_id) where content_id is not null;
create index if not exists favorites_product_idx on public.favorites (product_id) where product_id is not null;
create index if not exists favorites_program_idx on public.favorites (program_id) where program_id is not null;

-- ---------------------------------------------------------------- RLS
-- favorites_own (0007/0016) segue valendo para tudo: só o dono lê e grava os próprios favoritos.
-- Esta política RESTRITIVA soma uma condição ao gravar (insert/update): produto só se estiver
-- visível ao público (publicado, sem moderação e de vendedor ativo) e programa só se publicado.
-- As condições são explícitas (não "o que a RLS me deixa ver"): o vendedor não favorita o próprio
-- rascunho e o admin não favorita programa em rascunho. Sem USING: leitura e remoção não mudam.
-- Conteúdo mantém a regra de antes (só a posse).
drop policy if exists favorites_target_public on public.favorites;
create policy favorites_target_public on public.favorites as restrictive for all to authenticated
  with check (
    content_id is not null
    or (product_id is not null and exists (
          select 1 from public.products p join public.seller_organizations o on o.id = p.seller_org_id
          where p.id = favorites.product_id and p.status = 'published' and p.moderation_status = 'clear' and o.status = 'active'))
    or (program_id is not null and exists (
          select 1 from public.programs g where g.id = favorites.program_id and g.status = 'published'))
  );

-- O PostgREST passa a enxergar as colunas e as relações novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
