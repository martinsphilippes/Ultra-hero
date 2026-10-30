-- =============================================================================
-- Groscove Ultra · 0056 · Seguir heróis e comparar "Você vs Hero"
--   Pedido do responsável: o consumidor segue heróis (Início, aba Hero e página do herói), gere os
--   que segue no Perfil e escolhe UM deles para comparar os próprios indicadores (sono, passos,
--   treinos, carga, dias ativos, conteúdos e receitas). Ver docs/decisions/seguir-e-comparar.md.
--
--   "Seguir" = public.hero_favorites (0054): a mesma relação que já dispara o push de post novo.
--   Nada é duplicado; esta migração só acrescenta o que faltava:
--   1) profiles.compare_creator_id: o "Hero de comparação". Só aceita herói que a pessoa segue
--      (gatilho) e é limpo quando ela deixa de seguir (gatilho em hero_favorites).
--   2) creator_follower_counts (creator_id, followers): contagem pública por herói, mantida por
--      gatilho security definer, sem identidades (a RLS de hero_favorites continua só-dono).
--   3) creator_reference_metrics (creator_id, metric_key, value, unit, source): "Referência do
--      herói" definida pela EQUIPE (não é dado medido de ninguém). Leitura pública para herói ativo;
--      escrita só do admin (RLS), auditada em admin_audit. source = 'reference' por enquanto (se um
--      dia o herói ligar um relógio de verdade, a fonte muda sem trocar a tabela).
--   4) Conta anonimizada (LGPD) deixa de seguir (e perde o Hero de comparação).
--
-- Embeds da API (PGRST201, ver 0055): profiles ganha UMA FK para creator_profiles (não havia caminho
-- entre as duas; hero_favorites aponta para auth.users, fora da API); as tabelas novas só têm FK para
-- creator_profiles. Nenhum caminho novo ambíguo.
-- Regras: nada de drop de dados; search_path fixo; grants explícitos; RLS ligada; reaplicável;
-- funções de gatilho security definer sem execute para anon/authenticated (o S14 continua com 17).
-- =============================================================================

-- ---------------------------------------------------------------- 1) Hero de comparação
alter table public.profiles add column if not exists compare_creator_id uuid
  references public.creator_profiles (id) on delete set null;

-- Guarda de colunas (0007/0046): mesma lista + compare_creator_id (o dono escolhe no Perfil).
drop trigger if exists trg_a_profiles_guard on public.profiles;
create trigger trg_a_profiles_guard before update on public.profiles
  for each row execute function public.guard_protected_columns('{display_name,avatar_url,locale,theme,timezone,onboarding_completed,full_name,phone_e164,compare_creator_id}');

-- só um herói que a pessoa segue
create or replace function public.profiles_compare_requires_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.compare_creator_id is not null
     and (tg_op = 'INSERT' or new.compare_creator_id is distinct from old.compare_creator_id)
     and not exists (select 1 from public.hero_favorites f where f.user_id = new.id and f.creator_id = new.compare_creator_id) then
    raise exception 'compare_requires_follow' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_compare_requires_follow() from public, anon, authenticated;
grant execute on function public.profiles_compare_requires_follow() to service_role;

drop trigger if exists trg_profiles_compare_requires_follow on public.profiles;
create trigger trg_profiles_compare_requires_follow before insert or update of compare_creator_id on public.profiles
  for each row execute function public.profiles_compare_requires_follow();

-- ---------------------------------------------------------------- 2) contagem pública
create table if not exists public.creator_follower_counts (
  creator_id uuid primary key references public.creator_profiles (id) on delete cascade,
  followers integer not null default 0 check (followers >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 3) referências para comparação
create table if not exists public.creator_reference_metrics (
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  metric_key text not null
    constraint creator_reference_metrics_key_check check (metric_key in (
      'sleep_hours', 'steps_day', 'workouts_week', 'cardio_load_day', 'active_days_week', 'contents_week', 'recipes_week')),
  value numeric(10, 2) not null,
  unit text not null,
  -- 'reference' = definida pela equipe; outras fontes (relógio do herói) entram depois
  source text not null default 'reference' constraint creator_reference_metrics_source_check check (source in ('reference')),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_id, metric_key),
  -- unidade e faixa fixas por indicador (o app usa as mesmas, src/lib/heroes/compare.ts)
  constraint creator_reference_metrics_unit_range check (
    (metric_key = 'sleep_hours' and unit = 'h' and value > 0 and value <= 14)
    or (metric_key = 'steps_day' and unit = 'steps' and value > 0 and value <= 60000)
    or (metric_key = 'workouts_week' and unit = 'workouts' and value > 0 and value <= 21)
    or (metric_key = 'cardio_load_day' and unit = 'points' and value > 0 and value <= 1500)
    or (metric_key = 'active_days_week' and unit = 'days' and value > 0 and value <= 7)
    or (metric_key = 'contents_week' and unit = 'contents' and value > 0 and value <= 100)
    or (metric_key = 'recipes_week' and unit = 'recipes' and value > 0 and value <= 50))
);

drop trigger if exists trg_creator_reference_metrics_updated on public.creator_reference_metrics;
create trigger trg_creator_reference_metrics_updated before update on public.creator_reference_metrics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- 4) grants
revoke all on table public.creator_follower_counts, public.creator_reference_metrics from public, anon, authenticated;
grant select on table public.creator_follower_counts to anon, authenticated;
grant select on table public.creator_reference_metrics to anon;
grant select, insert, update, delete on table public.creator_reference_metrics to authenticated;
grant all on table public.creator_follower_counts, public.creator_reference_metrics to service_role;

-- ---------------------------------------------------------------- 5) RLS
alter table public.creator_follower_counts enable row level security;
alter table public.creator_reference_metrics enable row level security;

-- contagem: pública para herói ativo (o admin vê todas)
drop policy if exists creator_follower_counts_select on public.creator_follower_counts;
create policy creator_follower_counts_select on public.creator_follower_counts for select to anon, authenticated
  using (exists (select 1 from public.creator_profiles p where p.id = creator_follower_counts.creator_id and p.status = 'active')
         or (select public.is_admin()));

-- referências: leitura pública para herói ativo; escrita só do admin
drop policy if exists creator_reference_metrics_select on public.creator_reference_metrics;
create policy creator_reference_metrics_select on public.creator_reference_metrics for select to anon, authenticated
  using (exists (select 1 from public.creator_profiles p where p.id = creator_reference_metrics.creator_id and p.status = 'active'));
drop policy if exists creator_reference_metrics_admin on public.creator_reference_metrics;
create policy creator_reference_metrics_admin on public.creator_reference_metrics for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------- 6) gatilhos em hero_favorites
-- seguir: +1; deixar de seguir: -1 e limpa o Hero de comparação se era este
create or replace function public.hero_favorites_follow_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.creator_follower_counts (creator_id, followers) values (new.creator_id, 1)
    on conflict (creator_id) do update set followers = public.creator_follower_counts.followers + 1, updated_at = now();
    return new;
  end if;
  update public.creator_follower_counts set followers = greatest(followers - 1, 0), updated_at = now()
  where creator_id = old.creator_id;
  update public.profiles set compare_creator_id = null
  where id = old.user_id and compare_creator_id = old.creator_id;
  return old;
end $$;
revoke execute on function public.hero_favorites_follow_sync() from public, anon, authenticated;
grant execute on function public.hero_favorites_follow_sync() to service_role;

drop trigger if exists trg_hero_favorites_follow_sync on public.hero_favorites;
create trigger trg_hero_favorites_follow_sync after insert or delete on public.hero_favorites
  for each row execute function public.hero_favorites_follow_sync();

-- reaplicar: recalcula a partir das linhas (nunca diverge)
insert into public.creator_follower_counts (creator_id, followers)
select creator_id, count(*)::int from public.hero_favorites group by creator_id
on conflict (creator_id) do update set followers = excluded.followers, updated_at = now()
where public.creator_follower_counts.followers <> excluded.followers;

-- ---------------------------------------------------------------- 7) conta anonimizada (LGPD) deixa de seguir
create or replace function public.hero_favorites_forget_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.hero_favorites where user_id = new.id;
  return new;
end $$;
revoke execute on function public.hero_favorites_forget_user() from public, anon, authenticated;
grant execute on function public.hero_favorites_forget_user() to service_role;

drop trigger if exists trg_hero_favorites_forget_user on public.profiles;
create trigger trg_hero_favorites_forget_user after update of anonymized_at on public.profiles
  for each row when (new.anonymized_at is not null and old.anonymized_at is null)
  execute function public.hero_favorites_forget_user();

-- ---------------------------------------------------------------- 8) auditoria das referências
-- resource_type 'creator_reference', resource_id = id do herói (trilha por herói).
create or replace function public.creator_reference_metrics_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', 'creator_reference_metrics.' || lower(tg_op), 'creator_reference',
          coalesce(new.creator_id, old.creator_id)::text,
          case when tg_op in ('UPDATE', 'DELETE') then jsonb_build_object('metric_key', old.metric_key, 'value', old.value, 'unit', old.unit) end,
          case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object('metric_key', new.metric_key, 'value', new.value, 'unit', new.unit) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.creator_reference_metrics_audit() from public, anon, authenticated;
grant execute on function public.creator_reference_metrics_audit() to service_role;

drop trigger if exists trg_audit_creator_reference_metrics on public.creator_reference_metrics;
create trigger trg_audit_creator_reference_metrics after insert or update or delete on public.creator_reference_metrics
  for each row execute function public.creator_reference_metrics_audit();

-- ---------------------------------------------------------------- 9) seed: referências de demonstração
-- Valores editáveis pelo admin (não são dados medidos dos heróis). Só entra para herói que ainda não
-- tem nenhuma referência e cujo admin nunca mexeu nelas (sem trilha em admin_audit).
insert into public.creator_reference_metrics (creator_id, metric_key, value, unit)
select cp.id, m.metric_key, m.value, m.unit
from (values
  ('neymar', 'sleep_hours', 8, 'h'), ('neymar', 'steps_day', 12000, 'steps'), ('neymar', 'workouts_week', 6, 'workouts'),
  ('neymar', 'cardio_load_day', 250, 'points'), ('neymar', 'active_days_week', 6, 'days'), ('neymar', 'contents_week', 5, 'contents'),
  ('neymar', 'recipes_week', 3, 'recipes'),
  ('gabriel-medina', 'sleep_hours', 8, 'h'), ('gabriel-medina', 'steps_day', 11000, 'steps'), ('gabriel-medina', 'workouts_week', 6, 'workouts'),
  ('gabriel-medina', 'cardio_load_day', 240, 'points'), ('gabriel-medina', 'active_days_week', 6, 'days'), ('gabriel-medina', 'contents_week', 5, 'contents'),
  ('gabriel-medina', 'recipes_week', 4, 'recipes'),
  ('joao-fonseca', 'sleep_hours', 8.5, 'h'), ('joao-fonseca', 'steps_day', 12000, 'steps'), ('joao-fonseca', 'workouts_week', 6, 'workouts'),
  ('joao-fonseca', 'cardio_load_day', 260, 'points'), ('joao-fonseca', 'active_days_week', 6, 'days'), ('joao-fonseca', 'contents_week', 5, 'contents'),
  ('joao-fonseca', 'recipes_week', 3, 'recipes'),
  ('ronaldinho-gaucho', 'sleep_hours', 7.5, 'h'), ('ronaldinho-gaucho', 'steps_day', 9000, 'steps'), ('ronaldinho-gaucho', 'workouts_week', 4, 'workouts'),
  ('ronaldinho-gaucho', 'cardio_load_day', 170, 'points'), ('ronaldinho-gaucho', 'active_days_week', 5, 'days'), ('ronaldinho-gaucho', 'contents_week', 4, 'contents'),
  ('ronaldinho-gaucho', 'recipes_week', 3, 'recipes'),
  ('anitta', 'sleep_hours', 7, 'h'), ('anitta', 'steps_day', 10000, 'steps'), ('anitta', 'workouts_week', 5, 'workouts'),
  ('anitta', 'cardio_load_day', 200, 'points'), ('anitta', 'active_days_week', 6, 'days'), ('anitta', 'contents_week', 5, 'contents'),
  ('anitta', 'recipes_week', 3, 'recipes'),
  ('erick-jacquin', 'sleep_hours', 7, 'h'), ('erick-jacquin', 'steps_day', 9000, 'steps'), ('erick-jacquin', 'workouts_week', 3, 'workouts'),
  ('erick-jacquin', 'cardio_load_day', 120, 'points'), ('erick-jacquin', 'active_days_week', 5, 'days'), ('erick-jacquin', 'contents_week', 4, 'contents'),
  ('erick-jacquin', 'recipes_week', 7, 'recipes')
) as m (hero, metric_key, value, unit)
join public.creator_profiles cp on cp.slug = m.hero
where not exists (select 1 from public.creator_reference_metrics r where r.creator_id = cp.id)
  and not exists (select 1 from public.admin_audit a where a.resource_type = 'creator_reference' and a.resource_id = cp.id::text)
on conflict do nothing;

-- O PostgREST passa a enxergar as tabelas novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
