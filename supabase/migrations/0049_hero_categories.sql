-- =============================================================================
-- Ultra Hero · 0049 · Categorias dos heróis (aba Hero)
--   A aba Hero (/personalities) troca os chips de pilar por categorias de QUEM é o herói:
--   "Todos" (fixo, só no app) + as categorias desta tabela, na ordem do admin. Cada herói tem
--   até 2 categorias (posição 1 e 2). Categoria inativa ou sem herói visível fica escondida.
--   Mais adiante cada categoria vai configurar os atalhos da página do herói (hero_library_tabs,
--   ver docs/decisions/hero-showcase.md): por isso id e slug estáveis e sort_order.
--
-- Rótulos: jsonb {"pt-BR","en","es"}, como product_categories.name e shop_filters.name.
-- Leitura pública: políticas simples de SELECT (categorias ativas; vínculos de categoria ativa
--   com herói ativo) para anon e authenticated; escrita só do admin, pela RLS com (select is_admin()).
-- Máximo de 2 por herói: garantido pelo banco (position só 1 ou 2 + único (creator_id, position)).
-- Troca atômica das categorias de um herói: admin_set_creator_categories (security invoker, a RLS
--   decide; sem execute para o visitante).
-- Auditoria: gatilho security definer grava em admin_audit cada mudança feita por admin (sem
--   execute para ninguém: a lista do S14 continua com 17 funções para o visitante).
-- Seed: Esporte, Música, Gastronomia, Arte e Entretenimento; Neymar, Gabriel Medina, João Fonseca,
--   Ronaldinho Gaúcho → Esporte; Anitta → Música + Arte e Entretenimento; Érick Jacquin →
--   Gastronomia. Reaplicar não sobrescreve edição do admin.
-- Regras: nada de drop de tabela; search_path fixo; grants explícitos; RLS ligada; idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabelas
create table if not exists public.hero_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40 and slug <> 'todos'),
  name jsonb not null
    check (jsonb_typeof(name) = 'object' and char_length(btrim(coalesce(name ->> 'pt-BR', ''))) between 1 and 40),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hero_categories_order_idx on public.hero_categories (sort_order, slug);

drop trigger if exists trg_hero_categories_updated on public.hero_categories;
create trigger trg_hero_categories_updated before update on public.hero_categories
  for each row execute function public.set_updated_at();

create table if not exists public.creator_category_links (
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  category_id uuid not null references public.hero_categories (id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  created_at timestamptz not null default now(),
  primary key (creator_id, category_id),
  -- com position só 1 ou 2, isto limita a 2 categorias por herói
  constraint creator_category_links_position_key unique (creator_id, position)
);
create index if not exists creator_category_links_category_idx on public.creator_category_links (category_id);

-- ---------------------------------------------------------------- 2) grants
revoke all on table public.hero_categories, public.creator_category_links from public, anon, authenticated;
grant select on table public.hero_categories, public.creator_category_links to anon;
grant select, insert, update, delete on table public.hero_categories, public.creator_category_links to authenticated;
grant all on table public.hero_categories, public.creator_category_links to service_role;

-- ---------------------------------------------------------------- 3) RLS
alter table public.hero_categories enable row level security;
alter table public.creator_category_links enable row level security;

-- leitura pública: só categorias ativas (o admin vê todas pela política FOR ALL)
drop policy if exists hero_categories_select_active on public.hero_categories;
create policy hero_categories_select_active on public.hero_categories for select to anon, authenticated
  using (is_active);
drop policy if exists hero_categories_admin on public.hero_categories;
create policy hero_categories_admin on public.hero_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- vínculo visível: categoria ativa e herói ativo
drop policy if exists creator_category_links_select_active on public.creator_category_links;
create policy creator_category_links_select_active on public.creator_category_links for select to anon, authenticated
  using (exists (select 1 from public.hero_categories c where c.id = creator_category_links.category_id and c.is_active)
         and exists (select 1 from public.creator_profiles p where p.id = creator_category_links.creator_id and p.status = 'active'));
drop policy if exists creator_category_links_admin on public.creator_category_links;
create policy creator_category_links_admin on public.creator_category_links for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------- 4) auditoria das mudanças do admin
-- Categoria: resource_type 'hero_category', resource_id = id da categoria.
-- Vínculo: resource_type 'hero_category_link', resource_id = id do herói (trilha por herói).
create or replace function public.hero_categories_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', tg_table_name || '.' || lower(tg_op),
          case when tg_table_name = 'hero_categories' then 'hero_category' else 'hero_category_link' end,
          case when tg_table_name = 'hero_categories' then v_row ->> 'id' else v_row ->> 'creator_id' end,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.hero_categories_audit() from public, anon, authenticated;
grant execute on function public.hero_categories_audit() to service_role;

drop trigger if exists trg_audit_hero_categories on public.hero_categories;
create trigger trg_audit_hero_categories after insert or update or delete on public.hero_categories
  for each row execute function public.hero_categories_audit();
drop trigger if exists trg_audit_creator_category_links on public.creator_category_links;
create trigger trg_audit_creator_category_links after insert or update or delete on public.creator_category_links
  for each row execute function public.hero_categories_audit();

-- ---------------------------------------------------------------- 5) troca atômica das categorias de um herói
-- Security invoker: a RLS de admin decide (quem não é admin recebe forbidden antes).
-- p_categories na ordem desejada (posição 1, 2); vazio remove todas.
create or replace function public.admin_set_creator_categories(p_creator uuid, p_categories uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare v_list uuid[] := coalesce(p_categories, '{}');
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if cardinality(v_list) > 2 then raise exception 'hero_categories_max_2' using errcode = '23514'; end if;
  if cardinality(v_list) = 2 and v_list[1] = v_list[2] then raise exception 'hero_categories_duplicate' using errcode = '23505'; end if;
  if array_position(v_list, null) is not null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- só mexe no que mudou (a auditoria fica limpa)
  if (select coalesce(array_agg(category_id order by position), '{}') from public.creator_category_links where creator_id = p_creator) = v_list then
    return;
  end if;
  delete from public.creator_category_links where creator_id = p_creator;
  insert into public.creator_category_links (creator_id, category_id, position)
  select p_creator, c, i::smallint from unnest(v_list) with ordinality as u (c, i);
end $$;
revoke execute on function public.admin_set_creator_categories(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_creator_categories(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------- 6) seed (não sobrescreve edição do admin)
insert into public.hero_categories (id, slug, name, sort_order) values
  (public.seed_uuid('herocat:esporte'), 'esporte', '{"pt-BR":"Esporte","en":"Sports","es":"Deporte"}', 10),
  (public.seed_uuid('herocat:musica'), 'musica', '{"pt-BR":"Música","en":"Music","es":"Música"}', 20),
  (public.seed_uuid('herocat:gastronomia'), 'gastronomia', '{"pt-BR":"Gastronomia","en":"Food","es":"Gastronomía"}', 30),
  (public.seed_uuid('herocat:arte-e-entretenimento'), 'arte-e-entretenimento',
   '{"pt-BR":"Arte e Entretenimento","en":"Arts & Entertainment","es":"Arte y Entretenimiento"}', 40)
on conflict do nothing;

-- Liga pelo slug do herói só quando: a categoria é a do seed, o herói ainda não tem categoria e o
-- admin nunca mexeu nas categorias dele (sem trilha em admin_audit).
insert into public.creator_category_links (creator_id, category_id, position)
select cp.id, c.id, m.position
from (values
  ('neymar', 'esporte', 1),
  ('gabriel-medina', 'esporte', 1),
  ('joao-fonseca', 'esporte', 1),
  ('ronaldinho-gaucho', 'esporte', 1),
  ('anitta', 'musica', 1),
  ('anitta', 'arte-e-entretenimento', 2),
  ('erick-jacquin', 'gastronomia', 1)
) as m (hero, category, position)
join public.creator_profiles cp on cp.slug = m.hero
join public.hero_categories c on c.slug = m.category and c.id = public.seed_uuid('herocat:' || m.category)
where not exists (select 1 from public.creator_category_links l where l.creator_id = cp.id)
  and not exists (select 1 from public.admin_audit a where a.resource_type = 'hero_category_link' and a.resource_id = cp.id::text)
on conflict do nothing;

-- O PostgREST passa a enxergar as tabelas novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
