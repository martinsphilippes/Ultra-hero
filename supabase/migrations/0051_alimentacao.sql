-- =============================================================================
-- Ultra Hero · 0051 · Alimentação completa (Etapa 2, docs/decisions/hero-showcase.md)
--   Reaproveita o que já existe: a receita é do herói autor (content.creator_id, que já assinava como
--   chef) e aparece na vitrine de outros heróis pelos vínculos creator_recipe_links (0024, só o admin
--   valida, auditado). Esta migration só preenche as lacunas:
--   1) recipe_signers: o admin escolhe quem ASSINA a receita. Sem linha = o autor assina (como antes);
--      linha com chef_id = esse herói chef assina; linha com chef_id nulo = sem chef ("indicada por").
--   2) recipe_ready_products: no máximo 1 produto "Comprar pronto" por receita (ex.: marmita).
--   3) recipe_action_counters: toques agregados por dia em fazer / comprar pronto / lista de compras,
--      por (herói da vitrine, origem, ação, receita). Sem id de pessoa e sem IP (LGPD). Nenhum grant
--      para anon/authenticated: só o servidor do app (service role) soma, por recipe_action_bump.
-- Leitura pública só do que está no ar (receita publicada; produto visível pela RLS de products).
-- Escrita só do admin (RLS com (select is_admin())), auditada em admin_audit por gatilho.
-- Regras: nada de drop de tabela; search_path fixo; grants explícitos; RLS ligada; idempotente;
-- nenhuma função nova com execute para o visitante (a lista do S14 continua com 17).
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabelas
create table if not exists public.recipe_signers (
  content_id uuid primary key references public.content (id) on delete cascade,
  -- nulo = sem chef (a receita só é indicada); herói excluído vira "sem chef"
  chef_id uuid references public.creator_profiles (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipe_signers_chef_idx on public.recipe_signers (chef_id);

drop trigger if exists trg_recipe_signers_updated on public.recipe_signers;
create trigger trg_recipe_signers_updated before update on public.recipe_signers
  for each row execute function public.set_updated_at();

create table if not exists public.recipe_ready_products (
  -- a chave primária garante 1 produto por receita
  content_id uuid primary key references public.content (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipe_ready_products_product_idx on public.recipe_ready_products (product_id);

drop trigger if exists trg_recipe_ready_products_updated on public.recipe_ready_products;
create trigger trg_recipe_ready_products_updated before update on public.recipe_ready_products
  for each row execute function public.set_updated_at();

create table if not exists public.recipe_action_counters (
  day date not null,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  source_key text not null
    constraint recipe_action_counters_source_check check (source_key in ('alimentacao', 'receita')),
  action text not null
    constraint recipe_action_counters_action_check check (action in ('fazer', 'comprar_pronto', 'lista_compras')),
  content_id uuid not null references public.content (id) on delete cascade,
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, creator_id, source_key, action, content_id)
);
create index if not exists recipe_action_counters_creator_idx on public.recipe_action_counters (creator_id, day desc);

-- ---------------------------------------------------------------- 2) grants
revoke all on table public.recipe_signers, public.recipe_ready_products, public.recipe_action_counters from public, anon, authenticated;
grant select on table public.recipe_signers, public.recipe_ready_products to anon;
grant select, insert, update, delete on table public.recipe_signers, public.recipe_ready_products to authenticated;
grant all on table public.recipe_signers, public.recipe_ready_products, public.recipe_action_counters to service_role;

-- ---------------------------------------------------------------- 3) RLS
alter table public.recipe_signers enable row level security;
alter table public.recipe_ready_products enable row level security;
alter table public.recipe_action_counters enable row level security;
-- contadores: RLS ligada e nenhuma política (só o service role, que ignora a RLS)

-- assinatura visível com a receita no ar (a RLS de content decide o que está no ar para quem lê)
drop policy if exists recipe_signers_select_published on public.recipe_signers;
create policy recipe_signers_select_published on public.recipe_signers for select to anon, authenticated
  using (exists (select 1 from public.content c where c.id = recipe_signers.content_id and c.status = 'published'));
drop policy if exists recipe_signers_admin on public.recipe_signers;
create policy recipe_signers_admin on public.recipe_signers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- produto pronto visível com a receita no ar e o produto publicado (e visível pela RLS de products)
drop policy if exists recipe_ready_products_select_published on public.recipe_ready_products;
create policy recipe_ready_products_select_published on public.recipe_ready_products for select to anon, authenticated
  using (exists (select 1 from public.content c where c.id = recipe_ready_products.content_id and c.status = 'published')
         and exists (select 1 from public.products p where p.id = recipe_ready_products.product_id and p.status = 'published'));
drop policy if exists recipe_ready_products_admin on public.recipe_ready_products;
create policy recipe_ready_products_admin on public.recipe_ready_products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------- 4) validação (security invoker)
-- Só receita; o chef escolhido precisa ser um herói ativo (o "sem chef" é chef_id nulo).
create or replace function public.recipe_showcase_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.content c where c.id = new.content_id and c.type = 'recipe') then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  -- if aninhado: new de recipe_ready_products não tem chef_id
  if tg_table_name = 'recipe_signers' then
    if new.chef_id is not null and not exists (select 1 from public.creator_profiles p where p.id = new.chef_id and p.status = 'active') then
      raise exception 'chef_unavailable' using errcode = '22023';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
revoke execute on function public.recipe_showcase_guard() from public, anon;
grant execute on function public.recipe_showcase_guard() to authenticated, service_role;

drop trigger if exists trg_a_recipe_signers_guard on public.recipe_signers;
create trigger trg_a_recipe_signers_guard before insert or update on public.recipe_signers
  for each row execute function public.recipe_showcase_guard();
drop trigger if exists trg_a_recipe_ready_products_guard on public.recipe_ready_products;
create trigger trg_a_recipe_ready_products_guard before insert or update on public.recipe_ready_products
  for each row execute function public.recipe_showcase_guard();

-- ---------------------------------------------------------------- 5) auditoria das mudanças do admin
-- resource_type 'recipe_signer' / 'recipe_ready_product', resource_id = id da receita.
create or replace function public.recipe_showcase_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  -- update sem mudança (salvar de novo o mesmo valor) não gera linha
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return new;
  end if;
  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', tg_table_name || '.' || lower(tg_op),
          case when tg_table_name = 'recipe_signers' then 'recipe_signer' else 'recipe_ready_product' end,
          v_row ->> 'content_id',
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.recipe_showcase_audit() from public, anon, authenticated;
grant execute on function public.recipe_showcase_audit() to service_role;

drop trigger if exists trg_audit_recipe_signers on public.recipe_signers;
create trigger trg_audit_recipe_signers after insert or update or delete on public.recipe_signers
  for each row execute function public.recipe_showcase_audit();
drop trigger if exists trg_audit_recipe_ready_products on public.recipe_ready_products;
create trigger trg_audit_recipe_ready_products after insert or update or delete on public.recipe_ready_products
  for each row execute function public.recipe_showcase_audit();

-- ---------------------------------------------------------------- 6) contador de toques (só o service role)
-- Soma 1 no dia (horário de Brasília). Só conta receita publicada na vitrine do herói (autor ou
-- vínculo validado) de herói ativo; fora disso não faz nada (devolve false). Security invoker: quem
-- executa é o service role (sem RLS); anon e authenticated não executam.
create or replace function public.recipe_action_bump(p_creator uuid, p_source text, p_action text, p_content uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_creator is null or p_content is null
     or p_source is null or p_source not in ('alimentacao', 'receita')
     or p_action is null or p_action not in ('fazer', 'comprar_pronto', 'lista_compras') then
    return false;
  end if;
  if not exists (
    select 1 from public.content c
    join public.creator_profiles p on p.id = p_creator and p.status = 'active'
    where c.id = p_content and c.type = 'recipe' and c.status = 'published'
      and (c.creator_id = p_creator
           or exists (select 1 from public.creator_recipe_links l
                      where l.content_id = c.id and l.creator_id = p_creator and l.status = 'validated'))
  ) then
    return false;
  end if;
  insert into public.recipe_action_counters as r (day, creator_id, source_key, action, content_id, count)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_creator, p_source, p_action, p_content, 1)
  on conflict (day, creator_id, source_key, action, content_id)
  do update set count = r.count + 1, updated_at = now();
  return true;
end $$;
revoke execute on function public.recipe_action_bump(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.recipe_action_bump(uuid, text, text, uuid) to service_role;

-- O PostgREST passa a enxergar as tabelas novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
