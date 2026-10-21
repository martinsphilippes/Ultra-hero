-- 0024 · Receitas por herói e etapa demonstrativa de receitas.
--
-- 1) creator_recipe_links: o herói indica receitas assinadas por um chef (outro herói). A receita continua
--    do chef (content.creator_id = assinatura); o vínculo só diz que este herói a indica. Só o admin cria e
--    muda status (RPC auditada); o público vê só os vínculos validados.
-- 2) recipe_onboarding: etapa demonstrativa em 4 passos (aviso, restrições e alergias, interesses,
--    confirmação) que libera as receitas no app inteiro. Uma linha por pessoa, só do dono (RLS). Restrições
--    e alergias vêm de listas fixas (sem texto livre) e servem só para lembrar a pessoa na página da receita;
--    somem com a conta (on delete cascade).

-- ---------------------------------------------------------------- 1) vínculo herói ↔ receita
create table if not exists public.creator_recipe_links (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  status public.link_status not null default 'suggested',
  sort_order int not null default 100,
  created_by uuid references auth.users (id) on delete set null,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, content_id)
);
create index if not exists creator_recipe_links_content_idx on public.creator_recipe_links (content_id);
alter table public.creator_recipe_links enable row level security;
revoke all on table public.creator_recipe_links from anon, authenticated;
grant select on table public.creator_recipe_links to anon, authenticated;
grant all on table public.creator_recipe_links to service_role;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_creator_recipe_links_updated' and tgrelid = 'public.creator_recipe_links'::regclass) then
    create trigger trg_creator_recipe_links_updated before update on public.creator_recipe_links for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_policies where tablename = 'creator_recipe_links' and policyname = 'creator_recipe_links_select') then
    create policy creator_recipe_links_select on public.creator_recipe_links for select to anon, authenticated
      using (status = 'validated' or (select public.is_admin()) or creator_id = (select public.my_creator_id()));
  end if;
end $$;

-- Admin liga (ou muda o status de) uma receita a um herói. Só receitas, e nunca do próprio herói
-- (a receita própria já aparece assinada por ele).
create or replace function public.admin_set_creator_recipe(p_creator uuid, p_content uuid, p_status public.link_status, p_sort int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('validated', 'suspended', 'rejected') then raise exception 'invalid_status'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'creator_not_found'; end if;
  if not exists (select 1 from public.content where id = p_content and type = 'recipe') then raise exception 'recipe_not_found'; end if;
  if exists (select 1 from public.content where id = p_content and creator_id = p_creator) then raise exception 'own_recipe'; end if;
  select to_jsonb(l) into v_before from public.creator_recipe_links l where creator_id = p_creator and content_id = p_content;
  insert into public.creator_recipe_links (creator_id, content_id, status, sort_order, created_by, validated_by, validated_at)
  values (p_creator, p_content, p_status, coalesce(p_sort, 100), auth.uid(),
          case when p_status = 'validated' then auth.uid() end, case when p_status = 'validated' then now() end)
  on conflict (creator_id, content_id) do update
    set status = excluded.status,
        sort_order = coalesce(p_sort, public.creator_recipe_links.sort_order),
        validated_by = case when excluded.status = 'validated' then auth.uid() else public.creator_recipe_links.validated_by end,
        validated_at = case when excluded.status = 'validated' then now() else public.creator_recipe_links.validated_at end
  returning id into v_id;
  perform public.audit_log('creator_recipe.set_status', 'creator_recipe_link', v_id::text, v_before,
    jsonb_build_object('creator_id', p_creator, 'content_id', p_content, 'status', p_status, 'sort_order', p_sort), null);
  return v_id;
end $$;
revoke execute on function public.admin_set_creator_recipe(uuid, uuid, public.link_status, int) from public, anon;
grant execute on function public.admin_set_creator_recipe(uuid, uuid, public.link_status, int) to authenticated, service_role;

-- Seed: todo herói indica as receitas dos chefs que não são dele (validadas, na ordem de publicação).
insert into public.creator_recipe_links (creator_id, content_id, status, sort_order, validated_at)
select cp.id, c.id, 'validated', (row_number() over (partition by cp.id order by c.published_at desc nulls last, c.id))::int * 10, now()
from public.creator_profiles cp
join public.content c on c.type = 'recipe' and c.creator_id is not null and c.creator_id <> cp.id
on conflict (creator_id, content_id) do nothing;

-- ---------------------------------------------------------------- 2) etapa demonstrativa de receitas
create table if not exists public.recipe_onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version smallint not null default 1,
  notice_accepted_at timestamptz not null,
  restrictions text[] not null default '{}'
    check (restrictions <@ array['vegetarian', 'vegan', 'pescatarian', 'lactose_free', 'gluten_free', 'low_sugar', 'low_sodium']::text[]),
  allergies text[] not null default '{}'
    check (allergies <@ array['peanut', 'tree_nuts', 'milk', 'egg', 'wheat', 'soy', 'fish', 'shellfish', 'sesame']::text[]),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipe_onboarding enable row level security;
revoke all on table public.recipe_onboarding from anon, authenticated;
grant select, insert, update, delete on table public.recipe_onboarding to authenticated;
grant all on table public.recipe_onboarding to service_role;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_recipe_onboarding_updated' and tgrelid = 'public.recipe_onboarding'::regclass) then
    create trigger trg_recipe_onboarding_updated before update on public.recipe_onboarding for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_policies where tablename = 'recipe_onboarding' and policyname = 'recipe_onboarding_own') then
    create policy recipe_onboarding_own on public.recipe_onboarding for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
