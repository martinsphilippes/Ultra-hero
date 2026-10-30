-- 0055 · Corrige a ambiguidade conteúdo → herói na API (introduzida pela 0051).
-- recipe_action_counters tinha FK para content e para creator_profiles, ambas na chave primária:
-- a API (PostgREST) passou a ver um segundo caminho content ↔ creator_profiles (muitos-para-muitos)
-- e o embed "creator:creator_profiles(...)" em content falhou (PGRST201), derrubando as seções da
-- página do herói. Os contadores não precisam da FK do herói: são só agregados do service role.
alter table public.recipe_action_counters drop constraint if exists recipe_action_counters_creator_id_fkey;

-- herói removido: limpa seus contadores (o que a FK fazia com on delete cascade)
create or replace function public.recipe_action_counters_creator_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.recipe_action_counters where creator_id = old.id;
  return old;
end $$;
revoke all on function public.recipe_action_counters_creator_cleanup() from public, anon, authenticated;

drop trigger if exists trg_recipe_action_counters_creator_cleanup on public.creator_profiles;
create trigger trg_recipe_action_counters_creator_cleanup
  after delete on public.creator_profiles
  for each row execute function public.recipe_action_counters_creator_cleanup();

notify pgrst, 'reload schema';
