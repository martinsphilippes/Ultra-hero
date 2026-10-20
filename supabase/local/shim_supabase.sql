-- Shim para rodar as migrations do Ultra Hero num Postgres local (dev/testes).
-- Reproduz o mínimo do ambiente Supabase: schemas auth/extensions, papéis,
-- auth.uid()/auth.jwt() lendo request.jwt.claims (mesma convenção do PostgREST).
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists supabase_migrations;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key, name text, statements text[]
);

grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Privilégios padrão iguais aos da Supabase: tabelas/sequências/funções novas em public
-- ficam acessíveis a anon/authenticated/service_role (RLS continua valendo). As migrations
-- revogam explicitamente o que não deve ser chamado pela API.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
