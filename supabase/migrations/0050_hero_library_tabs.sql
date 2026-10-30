-- =============================================================================
-- Ultra Hero · 0050 · Atalhos da página do herói configuráveis (Etapa 1, docs/decisions/hero-showcase.md)
--   A página do herói mostra atalhos (Dia a dia, Nutrição, Alimentação, Treinos, Gastronomia,
--   Programas, Produtos). As FONTES (o que alimenta cada atalho) ficam fixas no código; o admin só
--   muda a apresentação: rótulo (pt-BR/en/es), ícone (lista fixa), ordem e visível/oculto.
--   - hero_library_tabs: configuração POR CATEGORIA do herói (hero_categories, 0049).
--   - creator_library_overrides: exceção POR HERÓI, por cima da categoria (null = herda).
--   O app usa a categoria principal (posição 1) do herói; a exceção do herói vence; sem categoria
--   ou sem linha: os padrões do código. Nada é semeado: os padrões vivem no código (Esporte com
--   "Programas" → "Treinos" daria dois atalhos "Treinos" nos heróis que já têm vídeos de treino).
--
-- Chave estável da fonte (source_key) = segmento da URL: dia-a-dia, nutricao, alimentacao, treinos,
--   gastronomia, programas, produtos. Renomear o rótulo não muda a URL.
-- Rótulo: jsonb {"pt-BR","en","es"} (pt-BR obrigatório quando há rótulo; null = rótulo padrão).
-- Leitura pública: SELECT simples (atalhos de categoria ativa; exceções de herói ativo).
-- Escrita só do admin, pela RLS com (select is_admin()); trocas atômicas por RPC security invoker
--   (sem execute para o visitante) que só mexem no que mudou (auditoria limpa).
-- Auditoria: gatilho security definer grava em admin_audit (sem execute para ninguém: a lista do
--   S14 continua com 17 funções para o visitante).
-- Regras: nada de drop de tabela; search_path fixo; grants explícitos; RLS ligada; idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabelas
create table if not exists public.hero_library_tabs (
  category_id uuid not null references public.hero_categories (id) on delete cascade,
  source_key text not null
    constraint hero_library_tabs_source_check
    check (source_key in ('dia-a-dia', 'nutricao', 'alimentacao', 'treinos', 'gastronomia', 'programas', 'produtos')),
  label jsonb
    constraint hero_library_tabs_label_check
    check (label is null or (jsonb_typeof(label) = 'object'
      and char_length(btrim(coalesce(label ->> 'pt-BR', ''))) between 1 and 40
      and char_length(coalesce(label ->> 'en', '')) <= 40 and char_length(coalesce(label ->> 'es', '')) <= 40)),
  icon text
    constraint hero_library_tabs_icon_check
    check (icon is null or icon in ('sunrise', 'camera', 'apple', 'salad', 'chef-hat', 'utensils', 'dumbbell', 'trophy',
                                    'layers', 'shopping-bag', 'music', 'mic', 'palette', 'star', 'heart', 'book-open')),
  sort_order int not null default 100,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, source_key)
);

drop trigger if exists trg_hero_library_tabs_updated on public.hero_library_tabs;
create trigger trg_hero_library_tabs_updated before update on public.hero_library_tabs
  for each row execute function public.set_updated_at();

create table if not exists public.creator_library_overrides (
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  source_key text not null
    constraint creator_library_overrides_source_check
    check (source_key in ('dia-a-dia', 'nutricao', 'alimentacao', 'treinos', 'gastronomia', 'programas', 'produtos')),
  label jsonb
    constraint creator_library_overrides_label_check
    check (label is null or (jsonb_typeof(label) = 'object'
      and char_length(btrim(coalesce(label ->> 'pt-BR', ''))) between 1 and 40
      and char_length(coalesce(label ->> 'en', '')) <= 40 and char_length(coalesce(label ->> 'es', '')) <= 40)),
  icon text
    constraint creator_library_overrides_icon_check
    check (icon is null or icon in ('sunrise', 'camera', 'apple', 'salad', 'chef-hat', 'utensils', 'dumbbell', 'trophy',
                                    'layers', 'shopping-bag', 'music', 'mic', 'palette', 'star', 'heart', 'book-open')),
  -- null = herda da categoria (ou do padrão)
  sort_order int,
  is_visible boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_id, source_key),
  -- exceção vazia não existe: "voltar ao padrão" apaga a linha
  constraint creator_library_overrides_not_empty check (num_nonnulls(label, icon, sort_order, is_visible) > 0)
);

drop trigger if exists trg_creator_library_overrides_updated on public.creator_library_overrides;
create trigger trg_creator_library_overrides_updated before update on public.creator_library_overrides
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- 2) grants
revoke all on table public.hero_library_tabs, public.creator_library_overrides from public, anon, authenticated;
grant select on table public.hero_library_tabs, public.creator_library_overrides to anon;
grant select, insert, update, delete on table public.hero_library_tabs, public.creator_library_overrides to authenticated;
grant all on table public.hero_library_tabs, public.creator_library_overrides to service_role;

-- ---------------------------------------------------------------- 3) RLS
alter table public.hero_library_tabs enable row level security;
alter table public.creator_library_overrides enable row level security;

-- leitura pública: atalhos de categoria ativa (o admin vê todos pela política FOR ALL)
drop policy if exists hero_library_tabs_select_active on public.hero_library_tabs;
create policy hero_library_tabs_select_active on public.hero_library_tabs for select to anon, authenticated
  using (exists (select 1 from public.hero_categories c where c.id = hero_library_tabs.category_id and c.is_active));
drop policy if exists hero_library_tabs_admin on public.hero_library_tabs;
create policy hero_library_tabs_admin on public.hero_library_tabs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- exceção visível: herói ativo
drop policy if exists creator_library_overrides_select_active on public.creator_library_overrides;
create policy creator_library_overrides_select_active on public.creator_library_overrides for select to anon, authenticated
  using (exists (select 1 from public.creator_profiles p where p.id = creator_library_overrides.creator_id and p.status = 'active'));
drop policy if exists creator_library_overrides_admin on public.creator_library_overrides;
create policy creator_library_overrides_admin on public.creator_library_overrides for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------- 4) auditoria das mudanças do admin
-- Atalho da categoria: resource_type 'hero_library_tab', resource_id = id da categoria.
-- Exceção do herói: resource_type 'creator_library_override', resource_id = id do herói.
create or replace function public.hero_library_tabs_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', tg_table_name || '.' || lower(tg_op),
          case when tg_table_name = 'hero_library_tabs' then 'hero_library_tab' else 'creator_library_override' end,
          case when tg_table_name = 'hero_library_tabs' then v_row ->> 'category_id' else v_row ->> 'creator_id' end,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.hero_library_tabs_audit() from public, anon, authenticated;
grant execute on function public.hero_library_tabs_audit() to service_role;

drop trigger if exists trg_audit_hero_library_tabs on public.hero_library_tabs;
create trigger trg_audit_hero_library_tabs after insert or update or delete on public.hero_library_tabs
  for each row execute function public.hero_library_tabs_audit();
drop trigger if exists trg_audit_creator_library_overrides on public.creator_library_overrides;
create trigger trg_audit_creator_library_overrides after insert or update or delete on public.creator_library_overrides
  for each row execute function public.hero_library_tabs_audit();

-- ---------------------------------------------------------------- 5) trocas atômicas (security invoker: a RLS decide)
-- p_rows: [{"source_key","label","icon","sort_order","is_visible"}]. Fonte ausente da lista = linha
-- apagada (volta ao padrão). Só grava o que mudou.
create or replace function public.admin_set_category_library_tabs(p_category uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(v_rows) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.hero_categories where id = p_category) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) <> count(distinct r ->> 'source_key') from jsonb_array_elements(v_rows) r) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  delete from public.hero_library_tabs t
  where t.category_id = p_category
    and not exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'source_key' = t.source_key);

  insert into public.hero_library_tabs as t (category_id, source_key, label, icon, sort_order, is_visible)
  select p_category, r ->> 'source_key', nullif(r -> 'label', 'null'::jsonb), r ->> 'icon',
         coalesce((r ->> 'sort_order')::int, 100), coalesce((r ->> 'is_visible')::boolean, true)
  from jsonb_array_elements(v_rows) r
  on conflict (category_id, source_key) do update
    set label = excluded.label, icon = excluded.icon, sort_order = excluded.sort_order, is_visible = excluded.is_visible
    where (t.label, t.icon, t.sort_order, t.is_visible) is distinct from (excluded.label, excluded.icon, excluded.sort_order, excluded.is_visible);
end $$;
revoke execute on function public.admin_set_category_library_tabs(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_category_library_tabs(uuid, jsonb) to authenticated, service_role;

-- Mesmo formato; campos null herdam. Linha sem nenhum campo = sem exceção (apagada).
create or replace function public.admin_set_creator_library_overrides(p_creator uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(v_rows) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) <> count(distinct r ->> 'source_key') from jsonb_array_elements(v_rows) r) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- só as linhas com algum campo definido contam
  v_rows := coalesce((select jsonb_agg(r) from jsonb_array_elements(v_rows) r
                      where num_nonnulls(nullif(r -> 'label', 'null'::jsonb), r ->> 'icon', r ->> 'sort_order', r ->> 'is_visible') > 0), '[]'::jsonb);

  delete from public.creator_library_overrides o
  where o.creator_id = p_creator
    and not exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'source_key' = o.source_key);

  insert into public.creator_library_overrides as o (creator_id, source_key, label, icon, sort_order, is_visible)
  select p_creator, r ->> 'source_key', nullif(r -> 'label', 'null'::jsonb), r ->> 'icon', (r ->> 'sort_order')::int, (r ->> 'is_visible')::boolean
  from jsonb_array_elements(v_rows) r
  on conflict (creator_id, source_key) do update
    set label = excluded.label, icon = excluded.icon, sort_order = excluded.sort_order, is_visible = excluded.is_visible
    where (o.label, o.icon, o.sort_order, o.is_visible) is distinct from (excluded.label, excluded.icon, excluded.sort_order, excluded.is_visible);
end $$;
revoke execute on function public.admin_set_creator_library_overrides(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_creator_library_overrides(uuid, jsonb) to authenticated, service_role;

-- O PostgREST passa a enxergar as tabelas novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
