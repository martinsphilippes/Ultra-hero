-- =============================================================================
-- Ultra Hero · 0046 · Cadastro rápido sem senha (nome completo, e-mail, celular)
--   A tela inicial cria a conta só com nome completo, e-mail e celular. O servidor gera uma senha
--   legível, cria o usuário no Auth (service role, e-mail marcado como confirmado), entra no
--   aparelho e mostra a senha uma vez. A senha fica CIFRADA (AES-256-GCM na aplicação, chave só na
--   Vercel) para a pessoa consultar no Perfil e gerar outra quando quiser.
--
--   1) profiles ganha full_name e phone_e164 (E.164). Só o dono e o admin leem (políticas de 0007,
--      reescritas em 0016). A guarda de colunas passa a permitir que o dono edite os dois.
--   2) user_generated_passwords: uma linha por pessoa (texto cifrado + versão da chave). RLS ligada,
--      NENHUMA política e nenhum grant para anon/authenticated: só o service role (server actions)
--      lê e grava. Some com a conta (on delete cascade a partir de auth.users).
--   3) quick_signup_attempts: tentativas do cadastro rápido (HMAC do IP e do e-mail, nunca o valor
--      puro) para o limite por IP/e-mail. Mesmo isolamento: só o service role.
-- Regras: nada de drop de tabela; nenhuma função nova (a lista pública do S14 continua com 17);
-- grants explícitos; RLS ligada. O kill switch "experiment.open" (0015) continua valendo: o
-- gatilho handle_new_user recusa a conta nova com o cadastro fechado, inclusive pela Admin API.
-- =============================================================================

-- ---------------------------------------------------------------- 1) perfil: nome completo e celular
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone_e164 text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_full_name_len') then
    alter table public.profiles add constraint profiles_full_name_len check (full_name is null or char_length(full_name) between 2 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_phone_e164_format') then
    alter table public.profiles add constraint profiles_phone_e164_format check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end $$;

-- Guarda de colunas (0007): mesma lista + full_name e phone_e164 (o dono edita no Perfil).
drop trigger if exists trg_a_profiles_guard on public.profiles;
create trigger trg_a_profiles_guard before update on public.profiles
  for each row execute function public.guard_protected_columns('{display_name,avatar_url,locale,theme,timezone,onboarding_completed,full_name,phone_e164}');

-- ---------------------------------------------------------------- 2) senha gerada, cifrada
create table if not exists public.user_generated_passwords (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- base64 de nonce(12) | tag(16) | texto cifrado; a chave nunca mora no banco
  ciphertext text not null check (char_length(ciphertext) between 40 and 400),
  key_version smallint not null check (key_version between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_generated_passwords enable row level security;
revoke all on table public.user_generated_passwords from public, anon, authenticated;
grant all on table public.user_generated_passwords to service_role;

-- ---------------------------------------------------------------- 3) limite do cadastro rápido
create table if not exists public.quick_signup_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists quick_signup_attempts_ip_idx on public.quick_signup_attempts (ip_hash, created_at desc);
create index if not exists quick_signup_attempts_email_idx on public.quick_signup_attempts (email_hash, created_at desc);
alter table public.quick_signup_attempts enable row level security;
revoke all on table public.quick_signup_attempts from public, anon, authenticated;
grant all on table public.quick_signup_attempts to service_role;
