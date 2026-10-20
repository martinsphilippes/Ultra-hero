-- =============================================================================
-- Ultra Hero · 0002 · Planos simulados, módulos, direitos de acesso e conteúdo
-- =============================================================================

-- ---------------------------------------------------------------- módulos ----
-- Um "módulo" é a unidade de direito de acesso (ex.: base, training_full).
-- Planos são apenas pacotes de apresentação (atalhos) para selecionar módulos.
create table public.plan_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents_demo int not null default 0 check (price_cents_demo >= 0),
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_plan_modules_updated before update on public.plan_modules
  for each row execute function public.set_updated_at();

-- Dependências configuráveis pelo admin (FULL não exige Base por padrão).
create table public.module_dependencies (
  module_id uuid not null references public.plan_modules (id) on delete cascade,
  requires_module_id uuid not null references public.plan_modules (id) on delete cascade,
  primary key (module_id, requires_module_id),
  check (module_id <> requires_module_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_free boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

create table public.plan_bundle_modules (
  plan_id uuid not null references public.plans (id) on delete cascade,
  module_id uuid not null references public.plan_modules (id) on delete cascade,
  primary key (plan_id, module_id)
);

-- ---------------------------------------------------------------- assinaturas simuladas
-- Uma linha por usuário; histórico em subscription_events. Nenhum pagamento real.
create table public.simulated_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status public.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  auto_renew boolean not null default true,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_sim_subs_updated before update on public.simulated_subscriptions
  for each row execute function public.set_updated_at();

create table public.subscription_modules (
  subscription_id uuid not null references public.simulated_subscriptions (id) on delete cascade,
  module_id uuid not null references public.plan_modules (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'scheduled_removal')),
  activated_at timestamptz not null default now(),
  removal_at timestamptz,
  primary key (subscription_id, module_id)
);

create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.simulated_subscriptions (id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index subscription_events_sub_idx on public.subscription_events (subscription_id, created_at desc);

-- Renovação simulada (30 dias corridos). Idempotente; chamada por cron e sob demanda.
create or replace function public.sync_subscription(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.simulated_subscriptions%rowtype;
begin
  select * into s from public.simulated_subscriptions where user_id = p_user for update;
  if not found then return; end if;

  while s.current_period_end <= now() and s.status in ('active', 'cancelled') loop
    -- remoções agendadas (downgrade) valem no fim do período
    delete from public.subscription_modules
    where subscription_id = s.id and status = 'scheduled_removal';

    if s.status = 'cancelled' or not s.auto_renew then
      update public.simulated_subscriptions set status = 'expired' where id = s.id;
      insert into public.subscription_events (subscription_id, event) values (s.id, 'expired');
      exit;
    end if;

    update public.simulated_subscriptions
    set current_period_start = s.current_period_end,
        current_period_end = s.current_period_end + interval '30 days'
    where id = s.id
    returning * into s;
    insert into public.subscription_events (subscription_id, event, payload)
    values (s.id, 'renewed', jsonb_build_object('period_end', s.current_period_end, 'simulated', true));
  end loop;
end $$;

-- Módulos com direito ativo (inclui removidos-agendados até o fim do período).
create or replace function public.user_entitled_modules(p_user uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select sm.module_id
  from public.simulated_subscriptions s
  join public.subscription_modules sm on sm.subscription_id = s.id
  where s.user_id = p_user
    and s.status in ('active', 'cancelled')
    and s.current_period_end > now()
$$;

create or replace function public.my_entitled_modules()
returns setof uuid language sql stable security definer set search_path = public as $$
  select public.user_entitled_modules(auth.uid())
$$;

-- ---------------------------------------------------------------- conteúdo ---
-- array_to_string é "stable"; wrapper imutável para colunas geradas de busca
create or replace function public.f_array_join(text[])
returns text language sql immutable parallel safe as $$ select coalesce(array_to_string($1, ' '), '') $$;

create table public.content_type_settings (
  type public.content_type primary key,
  default_completion_mode public.completion_mode not null default 'manual',
  auto_threshold_pct int not null default 90 check (auto_threshold_pct between 1 and 100)
);
insert into public.content_type_settings (type, default_completion_mode) values
  ('video', 'auto'), ('recipe', 'manual'), ('workout', 'manual'), ('guide', 'manual'), ('article', 'auto');

-- Metadados públicos (card/catálogo). O corpo/mídia fica em content_bodies (gate server-side).
create table public.content (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  creator_id uuid references public.creator_profiles (id) on delete set null,
  pillar public.pillar not null,
  type public.content_type not null,
  source_locale public.locale_code not null default 'pt-BR',
  title text not null,
  summary text,
  cover_url text,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tags text[] not null default '{}',
  has_captions boolean not null default false,
  status public.content_status not null default 'draft',
  review_status public.review_status not null default 'none',
  access_level public.access_level,
  required_module_id uuid references public.plan_modules (id) on delete restrict,
  completion_mode public.completion_mode,
  is_featured boolean not null default false,
  featured_rank int,
  disclaimer_kind text check (disclaimer_kind in ('general', 'training', 'nutrition', 'none')),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce(summary, ''))), 'B') ||
    setweight(to_tsvector('simple', public.f_unaccent(public.f_array_join(tags))), 'C')
  ) stored,
  constraint content_premium_requires_module check (access_level is distinct from 'premium' or required_module_id is not null)
);
create index content_status_idx on public.content (status, published_at desc);
create index content_pillar_idx on public.content (pillar) where status = 'published';
create index content_creator_idx on public.content (creator_id);
create index content_featured_idx on public.content (featured_rank) where is_featured and status = 'published';
create index content_search_idx on public.content using gin (search);
create index content_title_trgm_idx on public.content using gin (title extensions.gin_trgm_ops);
create index content_tags_idx on public.content using gin (tags);
create trigger trg_content_updated before update on public.content
  for each row execute function public.set_updated_at();

create table public.content_bodies (
  content_id uuid primary key references public.content (id) on delete cascade,
  body jsonb not null default '{}'::jsonb,
  media_provider public.media_provider not null default 'none',
  media_ref text,
  captions_url text,
  updated_at timestamptz not null default now()
);
create trigger trg_content_bodies_updated before update on public.content_bodies
  for each row execute function public.set_updated_at();

create table public.content_localizations (
  content_id uuid not null references public.content (id) on delete cascade,
  locale public.locale_code not null,
  title text not null,
  summary text,
  body jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (content_id, locale)
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  round int not null default 1,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  decision public.review_status not null default 'in_review',
  feedback text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);
create index content_reviews_content_idx on public.content_reviews (content_id, submitted_at desc);

-- O usuário pode consumir? Regra única, avaliada no servidor.
create or replace function public.can_access_content(p_content uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c public.content%rowtype;
begin
  select * into c from public.content where id = p_content;
  if not found then return false; end if;
  if public.is_admin() then return true; end if;
  if c.creator_id is not null and c.creator_id = public.my_creator_id() then return true; end if;
  if c.status <> 'published' then return false; end if;
  if c.access_level is null then return false; end if;              -- sem regra: indisponível
  if auth.uid() is null then return false; end if;                   -- visitante não consome
  if c.access_level = 'free' then return true; end if;
  return c.required_module_id in (select public.user_entitled_modules(auth.uid()));
end $$;

grant execute on function public.can_access_content(uuid), public.my_entitled_modules(), public.user_entitled_modules(uuid) to anon, authenticated;
grant execute on function public.sync_subscription(uuid) to authenticated;
