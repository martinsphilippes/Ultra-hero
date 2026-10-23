-- =============================================================================
-- 0038 · Hoje com relógio real — F3: fundação de dados de saúde
-- docs/decisions/hoje-relogio.md §8 (banco), §8.10 (retenção), §14 (auditoria), §15 (segurança/LGPD).
--
-- NÃO VAI PARA PRODUÇÃO AGORA: o app só usa este schema com WEARABLES_REAL_ENABLED=1, depois do
-- jurídico, do encarregado e da aprovação de custos (Q1, Q18, Q19). Roteiro de ligar no relatório.
--
-- Barreira de finalidade por GRANT (RN-15), não por convenção:
--   * schema health fora da API (não entra em "Exposed schemas"); sem grant para anon,
--     authenticated NEM service_role (a service_role ignora RLS e é usada pelo motor de
--     recomendação, admin e heróis) → qualquer select direto dá 42501;
--   * escrita só pelo papel health_ingest (sem BYPASSRLS), usado apenas nas rotas de ingestão,
--     OAuth e cron de wearables (src/lib/health/db.ts, server-only);
--   * a pessoa lê e age por RPCs public.* security definer com search_path vazio, filtrando
--     auth.uid(); nenhuma delas é executável por anon (a lista do S14 não cresce).
-- =============================================================================

create schema if not exists health;
revoke all on schema health from public;
revoke all on schema health from anon, authenticated, service_role;

-- Papel de ingestão. Criado SEM login: a senha nunca fica no repositório. No projeto que for
-- receber dado real: alter role health_ingest with login password '<segredo>' (roteiro de ligar).
-- Papéis são do cluster inteiro: a criação é idempotente (outros bancos locais podem já tê-lo).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'health_ingest') then
    create role health_ingest nologin noinherit nobypassrls;
  end if;
end $$;
grant usage on schema health to health_ingest;

-- Tabelas novas no schema health não herdam grants. Funções: o EXECUTE de PUBLIC é padrão global
-- (não sai por schema), por isso cada função recebe revoke explícito (o S43 confere todas).
alter default privileges in schema health revoke all on tables from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- tipos
create type health.category as enum
  ('readiness', 'sleep', 'heart', 'activity', 'workout', 'breathing', 'temperature', 'stress', 'environment', 'safety');
-- Sem agregador (Q4) e sem app nativo nesta fase (Q3): os três últimos ficam reservados.
create type health.provider as enum ('garmin', 'oura', 'whoop', 'polar', 'google_health', 'apple_health', 'health_connect');
create type health.conn_status as enum ('pending', 'active', 'token_expired', 'consent_outdated', 'revoked_by_provider', 'error');

-- ---------------------------------------------------------------- configuração (só o dono lê)
-- min_age: regra de idade A DEFINIR (Q7) — padrão 18 com autodeclaração, configurável aqui.
-- subject_secret: liga a prova de consentimento à pessoa sem guardar o id depois da exclusão.
create table health.config (
  key text primary key check (key in ('consent_version', 'min_age', 'min_age_rule_pending', 'subject_secret')),
  value text not null
);
insert into health.config (key, value) values
  ('consent_version', '2026-10-draft-1'),
  ('min_age', '18'),
  ('min_age_rule_pending', 'true'),
  ('subject_secret', encode(extensions.gen_random_bytes(32), 'hex'));

-- ---------------------------------------------------------------- catálogo (espelho de src/lib/wearables/catalog.ts)
-- stored = false: índices calculados pelo Ultra Hero e agregados de treino, que são calculados na
-- leitura (TypeScript) e nunca gravados. tests/unit/health-catalog-sql.test.ts compara com o TS.
create table health.metric_catalog (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  category health.category not null,
  unit text not null,
  stored boolean not null,
  plaus_min numeric,
  plaus_max numeric
);
insert into health.metric_catalog (code, category, unit, stored, plaus_min, plaus_max) values
  ('readiness_vendor', 'readiness', 'score', true, null, null),
  ('body_battery_now', 'readiness', 'score', true, 5, 100),
  ('body_battery_high', 'readiness', 'score', true, 5, 100),
  ('body_battery_low', 'readiness', 'score', true, 5, 100),
  ('body_battery_charged', 'readiness', 'points', true, 0, 100),
  ('body_battery_drained', 'readiness', 'points', true, 0, 100),
  ('day_strain', 'readiness', 'score', true, 0, 21),
  ('cardio_load_vendor', 'readiness', 'score', true, null, null),
  ('disposition_uh', 'readiness', 'score', false, 0, 100),
  ('night_vitals_uh', 'readiness', 'count', false, 0, 5),
  ('cardio_load_day_uh', 'readiness', 'points', false, 0, 1500),
  ('training_load_acute_7d', 'readiness', 'points', false, 0, 1500),
  ('training_load_chronic_28d', 'readiness', 'points', false, 0, 1500),
  ('load_ratio', 'readiness', 'ratio', false, 0, 5),
  ('sleep_asleep_min', 'sleep', 'min', true, 0, 1200),
  ('sleep_deep_min', 'sleep', 'min', true, 0, 1200),
  ('sleep_light_min', 'sleep', 'min', true, 0, 1200),
  ('sleep_rem_min', 'sleep', 'min', true, 0, 1200),
  ('sleep_awake_min', 'sleep', 'min', true, 0, 1200),
  ('sleep_start_local', 'sleep', 'clock', true, 0, 1440),
  ('sleep_end_local', 'sleep', 'clock', true, 0, 1440),
  ('sleep_score_vendor', 'sleep', 'score', true, 0, 100),
  ('sleep_in_bed_min', 'sleep', 'min', true, 0, 1200),
  ('sleep_efficiency_pct', 'sleep', 'pct', true, 0, 100),
  ('sleep_regularity', 'sleep', 'score', false, 0, 100),
  ('nap_count', 'sleep', 'count', true, 0, 6),
  ('nap_min', 'sleep', 'min', true, 0, 300),
  ('sleep_hr_lowest', 'sleep', 'bpm', true, 25, 240),
  ('hr_resting', 'heart', 'bpm', true, 30, 120),
  ('hrv_night', 'heart', 'ms', true, 3, 300),
  ('vo2max', 'heart', 'ml_kg_min', true, 10, 95),
  ('hr_avg', 'heart', 'bpm', true, 25, 240),
  ('hr_min', 'heart', 'bpm', true, 25, 240),
  ('hr_max', 'heart', 'bpm', true, 25, 240),
  ('hr_walking_avg', 'heart', 'bpm', true, 25, 240),
  ('hrv_day_avg', 'heart', 'ms', true, 3, 300),
  ('hr_recovery_1min', 'heart', 'bpm', true, 0, 100),
  ('fitness_age', 'heart', 'years', true, 15, 100),
  ('hr_zone1_min', 'heart', 'min', true, 0, 1440),
  ('hr_zone2_min', 'heart', 'min', true, 0, 1440),
  ('hr_zone3_min', 'heart', 'min', true, 0, 1440),
  ('hr_zone4_min', 'heart', 'min', true, 0, 1440),
  ('hr_zone5_min', 'heart', 'min', true, 0, 1440),
  ('steps', 'activity', 'count', true, 0, 100000),
  ('distance_m', 'activity', 'm', true, 0, 200000),
  ('active_kcal', 'activity', 'kcal', true, 0, 10000),
  ('basal_kcal', 'activity', 'kcal', true, 500, 5000),
  ('move_goal_kcal', 'activity', 'kcal', true, 10, 5000),
  ('exercise_goal_min', 'activity', 'min', true, 1, 240),
  ('stand_goal_h', 'activity', 'h', true, 1, 24),
  ('exercise_min', 'activity', 'min', true, 0, 1440),
  ('stand_hours', 'activity', 'h', true, 0, 24),
  ('stand_min', 'activity', 'min', true, 0, 1440),
  ('steps_goal', 'activity', 'count', true, 100, 100000),
  ('intensity_min_week', 'activity', 'min', true, 0, 10080),
  ('intensity_goal_week_min', 'activity', 'min', true, 1, 10080),
  ('intensity_min_moderate', 'activity', 'min', true, 0, 1440),
  ('intensity_min_vigorous', 'activity', 'min', true, 0, 1440),
  ('intensity_min_weighted', 'activity', 'min', false, 0, 2880),
  ('floors_climbed', 'activity', 'count', true, 0, 500),
  ('floors_descended', 'activity', 'count', true, 0, 500),
  ('floors_goal', 'activity', 'count', true, 1, 500),
  ('sedentary_min', 'activity', 'min', true, 0, 1440),
  ('wheelchair_pushes', 'activity', 'count', true, 0, 100000),
  ('wheelchair_distance_m', 'activity', 'm', true, 0, 200000),
  ('workout_count', 'workout', 'count', false, 0, 20),
  ('workout_min', 'workout', 'min', false, 0, 1440),
  ('workout_kcal', 'workout', 'kcal', false, 0, 10000),
  ('workout_distance_m', 'workout', 'm', false, 0, 400000),
  ('workout_pace_s_per_km', 'workout', 's_per_km', false, 60, 3600),
  ('resp_rate_sleep', 'breathing', 'rpm', true, 4, 40),
  ('spo2_night_avg', 'breathing', 'pct', true, 70, 100),
  ('spo2_night_min', 'breathing', 'pct', true, 70, 100),
  ('resp_rate_day_avg', 'breathing', 'rpm', true, 4, 40),
  ('skin_temp_delta_c', 'temperature', 'c_delta', true, -5, 5),
  ('skin_temp_c', 'temperature', 'c', true, 25, 40),
  ('stress_avg', 'stress', 'score', true, 0, 100),
  ('stress_max', 'stress', 'score', true, 0, 100),
  ('stress_rest_min', 'stress', 'min', true, 0, 1440),
  ('stress_low_min', 'stress', 'min', true, 0, 1440),
  ('stress_medium_min', 'stress', 'min', true, 0, 1440),
  ('stress_high_min', 'stress', 'min', true, 0, 1440),
  ('recovery_high_min', 'stress', 'min', true, 0, 1440),
  ('env_noise_db_avg', 'environment', 'db', true, 20, 120),
  ('env_noise_alerts', 'environment', 'count', true, 0, 50),
  ('daylight_min', 'environment', 'min', true, 0, 1440),
  ('falls_detected', 'safety', 'count', true, 0, 20);

-- ---------------------------------------------------------------- consentimento (§8.2, RF-08, RN-13)
-- Texto arquivado no servidor; o hash é calculado AQUI (gatilho), nunca enviado pelo cliente.
-- Imutável: uma nova redação é uma nova versão. A versão abaixo é RASCUNHO para o jurídico;
-- antes de ligar entra a versão final (nova migração) e health.set_consent_version().
create table health.consent_texts (
  version text not null check (version ~ '^[a-z0-9][a-z0-9.-]{2,40}$'),
  locale text not null check (locale in ('pt-BR', 'en', 'es')),
  body text not null check (length(body) between 200 and 20000),
  sha256 text not null default '',
  material boolean not null default true,
  published_at timestamptz not null default now(),
  primary key (version, locale)
);

create or replace function health.consent_texts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.sha256 := encode(extensions.digest(convert_to(new.body, 'UTF8'), 'sha256'), 'hex');
    return new;
  end if;
  raise exception 'consent_text_immutable' using errcode = '42501';
end $$;
create trigger consent_texts_guard before insert or update or delete on health.consent_texts
  for each row execute function health.consent_texts_guard();

insert into health.consent_texts (version, locale, material, body) values
('2026-10-draft-1', 'pt-BR', true, $txt$Consentimento para os dados do seu relógio (rascunho 2026-10-draft-1, em revisão jurídica)

Ao conectar um relógio, anel ou pulseira (Garmin, Oura, WHOOP ou Polar), você autoriza o Ultra Hero a receber e guardar dados de saúde medidos por esse aparelho. São dados pessoais sensíveis (LGPD, art. 5º, II), tratados com o seu consentimento específico e destacado (art. 11, I), só nas categorias que você marcar: índice do dia, sono, coração, atividade, treinos, respiração e oxigenação, temperatura e estresse.

O que lemos: só o que o aparelho mede sozinho, de forma automática ou num treino iniciado nele. Nunca lemos o que é digitado (água, alimentação, peso, humor, ciclo, esforço que você informa), funções médicas reguladas (ECG, ritmo irregular, apneia, pressão) nem rota de GPS.

Para quê: só para mostrar a você o Hoje, os detalhes e as tendências. Não usamos para anúncios, venda ou recomendação de produtos, estatísticas de uso, inteligência artificial externa, heróis ou fornecedores, e não compartilhamos com ninguém.

Por quanto tempo: dados diários por até 13 meses; o que a marca nos envia em formato bruto, por até 7 dias (Garmin: 30 dias, para corrigir erros). Ao desconectar, retirar uma categoria ou retirar este consentimento, apagamos na hora. Se você desautorizar o Ultra Hero no app da marca e não reconectar, apagamos em 30 dias. Cópias de segurança somem em até 7 dias.

Quem trata: o Ultra Hero (controlador) e os operadores Supabase Inc. (banco de dados, região de São Paulo) e Vercel Inc. (servidores), empresas estrangeiras que podem acessar dados fora do Brasil para suporte e operação.

Seus direitos: ver, corrigir, exportar e apagar seus dados e retirar este consentimento a qualquer momento, de graça, em Perfil › Relógios e anéis. Retirar o consentimento desconecta todos os aparelhos e apaga os dados. A retirada nunca é bloqueada.

Idade: você declara ter a idade mínima indicada nesta tela.

É bem-estar, não diagnóstico: não substitui avaliação médica.

Encarregado pelo tratamento de dados: [nome e contato a publicar antes da abertura].$txt$),
('2026-10-draft-1', 'en', true, $txt$Consent for your watch data (draft 2026-10-draft-1, under legal review)

When you connect a watch, ring or band (Garmin, Oura, WHOOP or Polar), you allow Ultra Hero to receive and store health data measured by that device. This is sensitive personal data (Brazil's LGPD, art. 5, II), processed with your specific and highlighted consent (art. 11, I), only for the categories you tick: daily index, sleep, heart, activity, workouts, breathing and oxygen, temperature and stress.

What we read: only what the device measures on its own, automatically or during a workout started on it. We never read anything typed in (water, food, weight, mood, cycle, effort you report), regulated medical features (ECG, irregular rhythm, apnea, blood pressure) or GPS routes.

What for: only to show you Today, the details and the trends. We do not use it for ads, selling or recommending products, usage statistics, external artificial intelligence, heroes or suppliers, and we share it with no one.

How long: daily data for up to 13 months; raw data the brand sends us, for up to 7 days (Garmin: 30 days, to fix errors). When you disconnect, remove a category or withdraw this consent, we delete it right away. If you deauthorize Ultra Hero in the brand's app and do not reconnect, we delete it within 30 days. Backups are cleared within 7 days.

Who processes it: Ultra Hero (controller) and the processors Supabase Inc. (database, São Paulo region) and Vercel Inc. (servers), foreign companies that may access data outside Brazil for support and operations.

Your rights: see, correct, export and delete your data and withdraw this consent at any time, free of charge, in Profile › Watches and rings. Withdrawing consent disconnects every device and deletes the data. Withdrawal is never blocked.

Age: you declare that you are at least the minimum age shown on this screen.

This is wellness, not diagnosis: it does not replace medical advice.

Data protection officer: [name and contact to be published before launch].$txt$),
('2026-10-draft-1', 'es', true, $txt$Consentimiento para los datos de tu reloj (borrador 2026-10-draft-1, en revisión jurídica)

Al conectar un reloj, anillo o pulsera (Garmin, Oura, WHOOP o Polar), autorizas a Ultra Hero a recibir y guardar datos de salud medidos por ese dispositivo. Son datos personales sensibles (LGPD de Brasil, art. 5, II), tratados con tu consentimiento específico y destacado (art. 11, I), solo en las categorías que marques: índice del día, sueño, corazón, actividad, entrenamientos, respiración y oxigenación, temperatura y estrés.

Qué leemos: solo lo que el dispositivo mide por sí solo, de forma automática o en un entrenamiento iniciado en él. Nunca leemos lo que se escribe a mano (agua, alimentación, peso, ánimo, ciclo, esfuerzo que informas), funciones médicas reguladas (ECG, ritmo irregular, apnea, presión) ni rutas de GPS.

Para qué: solo para mostrarte el Hoy, los detalles y las tendencias. No lo usamos para anuncios, venta o recomendación de productos, estadísticas de uso, inteligencia artificial externa, héroes o proveedores, y no lo compartimos con nadie.

Por cuánto tiempo: datos diarios hasta 13 meses; lo que la marca nos envía en formato bruto, hasta 7 días (Garmin: 30 días, para corregir errores). Al desconectar, quitar una categoría o retirar este consentimiento, lo borramos en el momento. Si desautorizas a Ultra Hero en la app de la marca y no vuelves a conectar, lo borramos en 30 días. Las copias de seguridad se borran en hasta 7 días.

Quién lo trata: Ultra Hero (responsable) y los encargados Supabase Inc. (base de datos, región de São Paulo) y Vercel Inc. (servidores), empresas extranjeras que pueden acceder a datos fuera de Brasil para soporte y operación.

Tus derechos: ver, corregir, exportar y borrar tus datos y retirar este consentimiento en cualquier momento, gratis, en Perfil › Relojes y anillos. Retirar el consentimiento desconecta todos los dispositivos y borra los datos. La retirada nunca se bloquea.

Edad: declaras tener la edad mínima indicada en esta pantalla.

Es bienestar, no diagnóstico: no sustituye la evaluación médica.

Encargado de protección de datos: [nombre y contacto a publicar antes de la apertura].$txt$);

create table health.consents (
  id uuid primary key default gen_random_uuid(),
  -- a prova sobrevive à exclusão da conta: user_id vira null e fica o subject_ref
  user_id uuid references auth.users (id) on delete set null,
  subject_ref text not null check (subject_ref ~ '^[0-9a-f]{64}$'),
  policy_version text not null,
  locale text not null,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  categories health.category[] not null check (cardinality(categories) between 1 and 10),
  channel text not null default 'web' check (channel in ('web', 'ios', 'android')),
  -- idade mínima vigente quando a pessoa declarou ter essa idade (autodeclaração, Q7)
  age_declared_min smallint not null check (age_declared_min between 13 and 21),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason in ('user', 'superseded', 'account_deleted', 'policy_material_change', 'admin_incident')),
  foreign key (policy_version, locale) references health.consent_texts (version, locale),
  check ((revoked_at is null) = (revoke_reason is null))
);
create unique index consents_one_active on health.consents (user_id) where revoked_at is null and user_id is not null;
create index consents_subject on health.consents (subject_ref);

-- ---------------------------------------------------------------- conexões, credenciais, revogações (§8.3)
create table health.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider health.provider not null,
  provider_user_id text check (provider_user_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  status health.conn_status not null default 'pending',
  scopes text[] not null default '{}',
  device_name text check (length(device_name) <= 80),
  capabilities text[] not null default '{}',     -- códigos já recebidos (esconde o que a fonte não manda)
  priority smallint not null default 100,
  connected_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  last_data_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text check (last_error_code ~ '^[a-z0-9_:]{1,64}$'),   -- só códigos enumerados (RN-12)
  consecutive_errors int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index conn_provider_account on health.connections (provider, provider_user_id)
  where status in ('pending', 'active', 'token_expired', 'consent_outdated');
create unique index conn_one_per_provider on health.connections (user_id, provider)
  where status in ('pending', 'active', 'token_expired', 'consent_outdated');
create index conn_user on health.connections (user_id);

-- Tokens cifrados NA APLICAÇÃO (AES-256-GCM, AAD = connection_id || key_version) com a chave
-- WEARABLE_TOKEN_KEY_V{n}, que fica só na Vercel: a chave nunca mora ao lado do dado cifrado
-- (com o Vault/pgsodium, quem lê o banco com privilégio de dono lê também a chave).
create table health.credentials (
  connection_id uuid primary key references health.connections (id) on delete cascade,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  token_expires_at timestamptz,
  key_version smallint not null check (key_version between 1 and 99),
  updated_at timestamptz not null default now()
);

-- Sem FK de propósito: sobrevive à desconexão e à exclusão da conta (a revogação na marca nunca
-- bloqueia nem atrasa o apagamento aqui). connection_ref = id da conexão já apagada (AAD da cifra).
create table health.pending_revocations (
  id uuid primary key default gen_random_uuid(),
  connection_ref uuid not null,
  provider health.provider not null,
  provider_user_id text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  key_version smallint,
  reason text not null check (reason in ('user_disconnect', 'consent_revoked', 'account_deleted', 'retention')),
  attempts smallint not null default 0,
  last_error_code text check (last_error_code ~ '^[a-z0-9_:]{1,64}$'),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index pr_due on health.pending_revocations (next_attempt_at);

-- ---------------------------------------------------------------- dados (§8.4–8.6)
create table health.daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references health.connections (id) on delete cascade,
  local_date date not null,
  metric_code text not null references health.metric_catalog (code),
  value numeric not null,
  scale text check (scale ~ '^[a-z0-9_]{1,40}$'),          -- escala original do fabricante
  value_label text check (value_label ~ '^[a-z0-9_]{1,40}$'), -- rótulo original quando categórico
  method text check (method ~ '^[a-z0-9_:]{1,40}$'),          -- 'rmssd' | 'sdnn' | ...
  sample_count smallint,
  sampled_at timestamptz,
  coverage_pct smallint check (coverage_pct between 0 and 100),
  is_vendor_score boolean not null default false,
  source_device text check (length(source_device) <= 80),
  source_updated_at timestamptz,
  -- documento da marca que gerou o valor ("sleep:<id>", "recovery:<id>", "daily_sleep:<id>"): quando a
  -- marca apaga o documento, as métricas derivadas dele saem junto (§5.17)
  source_ref text check (length(source_ref) between 1 and 220),
  normalizer_version smallint not null,
  ingested_at timestamptz not null default now(),
  primary key (user_id, local_date, metric_code, connection_id)
);
create index dm_user_metric_date on health.daily_metrics (user_id, metric_code, local_date desc);
create index dm_connection on health.daily_metrics (connection_id);
create index dm_source_ref on health.daily_metrics (connection_id, source_ref) where source_ref is not null;

create table health.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references health.connections (id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 200),
  local_date date not null,                 -- dia em que acorda (RN-05)
  start_at timestamptz not null,
  end_at timestamptz not null,
  tz_offset_min smallint check (tz_offset_min between -840 and 840),
  is_main boolean not null default true,
  is_nap boolean not null default false,
  in_bed_min int, asleep_min int, deep_min int, light_min int, rem_min int, awake_min int, latency_min int,
  efficiency_pct smallint check (efficiency_pct between 0 and 100),
  vendor_score smallint, vendor_score_scale text check (vendor_score_scale ~ '^[a-z0-9_]{1,40}$'),
  lowest_hr smallint,
  normalizer_version smallint not null,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (connection_id, external_id),
  check (end_at > start_at),
  check (end_at - start_at <= interval '20 hours')
);
create index ss_user_date on health.sleep_sessions (user_id, local_date desc);

-- Treinos de todos os tipos, SEM rota GPS. Só origem do aparelho (RN-20): digitado/upload nunca entra.
create table health.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references health.connections (id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 200),
  local_date date not null,
  sport text not null check (sport ~ '^[a-z0-9_]{2,40}$'),
  origin text not null check (origin in ('started_on_device', 'auto_detected')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_s int not null check (duration_s between 1 and 172800),
  distance_m numeric check (distance_m >= 0),
  active_kcal numeric check (active_kcal >= 0),
  avg_hr smallint check (avg_hr between 25 and 240),
  max_hr smallint check (max_hr between 25 and 240),
  hr_zone_s int[] check (hr_zone_s is null or cardinality(hr_zone_s) = 5),
  elevation_gain_m numeric,
  avg_speed_mps numeric check (avg_speed_mps >= 0),
  avg_cadence numeric,
  avg_power_w numeric,
  vendor_effort numeric,                              -- só esforço ESTIMADO pelo aparelho
  vendor_effort_scale text check (vendor_effort_scale ~ '^[a-z0-9_]{1,40}$'),
  normalizer_version smallint not null,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (connection_id, external_id),
  check (end_at > start_at)
);
create index wo_user_date on health.workouts (user_id, local_date desc);

-- ---------------------------------------------------------------- entrada bruta e auditoria (§8.8, §14)
create table health.ingest_events (
  id uuid primary key default gen_random_uuid(),
  provider health.provider not null,
  connection_id uuid not null references health.connections (id) on delete cascade,  -- resolvida ANTES de gravar
  provider_event_id text check (length(provider_event_id) <= 200),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind ~ '^[A-Za-z0-9_.:-]{1,64}$'),   -- tipos da marca (ex.: skinTemp, stressDetails)
  status text not null default 'received' check (status in ('received', 'processing', 'done', 'failed', 'dead', 'ignored')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz,
  last_error_code text check (last_error_code ~ '^[a-z0-9_:]{1,64}$'),
  payload jsonb,                       -- null quando 'ignored'/'dead'; anulado no prazo da §8.10
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (connection_id, payload_sha256)
);
create unique index ie_provider_event on health.ingest_events (connection_id, provider_event_id) where provider_event_id is not null;
create index ie_pending on health.ingest_events (status, next_attempt_at) where status in ('received', 'failed');
create index ie_received on health.ingest_events (received_at);

-- Nunca guarda valores, payloads, tokens, e-mail ou mensagens de validador (gatilho abaixo).
create table health.audit (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  actor text not null check (actor in ('user', 'system', 'admin')),
  action text not null check (action ~ '^[a-z][a-z0-9_.]{2,63}$'),
  provider health.provider,
  connection_ref uuid,
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_user on health.audit (user_id, created_at desc);

create or replace function health.audit_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb;
begin
  for k, v in select * from jsonb_each(new.detail) loop
    if k !~ '^[a-z][a-z0-9_]{0,40}$' or exists (select 1 from health.metric_catalog c where c.code = k) then
      raise exception 'audit_detail_forbidden_key' using errcode = '22023';
    end if;
    if jsonb_typeof(v) = 'string' and (v #>> '{}') !~ '^[a-z0-9_.:-]{0,64}$' then
      raise exception 'audit_detail_free_text' using errcode = '22023';
    end if;
    if jsonb_typeof(v) = 'object' then
      raise exception 'audit_detail_nested' using errcode = '22023';
    end if;
    if jsonb_typeof(v) = 'array' and exists (select 1 from jsonb_array_elements(v) e
         where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9_.:-]{0,64}$') then
      raise exception 'audit_detail_free_text' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
create trigger audit_guard before insert or update on health.audit for each row execute function health.audit_guard();

-- ---------------------------------------------------------------- funções internas (dono)
create or replace function health.is_demo_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.raw_app_meta_data ->> 'ultra_hero_demo' from auth.users u where u.id = p_user), '') = 'true'
$$;

create or replace function health.cfg(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select c.value from health.config c where c.key = p_key
$$;

-- HMAC do id com segredo do servidor: liga a prova à pessoa sem guardar o id (§8.2).
create or replace function health.subject_ref_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_user::text, 'UTF8'), convert_to(health.cfg('subject_secret'), 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function health.audit_write(p_user uuid, p_actor text, p_action text, p_provider health.provider, p_connection uuid, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into health.audit (user_id, actor, action, provider, connection_ref, detail)
  values (p_user, p_actor, p_action, p_provider, p_connection, coalesce(p_detail, '{}'::jsonb))
$$;

-- Gatilho dos dados (§8.9): sem consentimento ativo, categoria não consentida, conexão que não
-- está ativa, conexão de outra pessoa ou conta demo → recusa (defesa além do normalizador em TS).
create or replace function health.guard_data() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid; v_status health.conn_status; v_cat health.category; v_stored boolean;
  v_min numeric; v_max numeric; v_consent health.category[];
begin
  select c.user_id, c.status into v_owner, v_status from health.connections c where c.id = new.connection_id;
  if v_owner is null or v_owner <> new.user_id then
    raise exception 'health_connection_mismatch' using errcode = '42501';
  end if;
  if v_status <> 'active' then
    raise exception 'health_connection_inactive' using errcode = '42501';
  end if;
  if health.is_demo_user(new.user_id) then
    raise exception 'demo_account_cannot_connect' using errcode = '42501';
  end if;
  if tg_table_name = 'daily_metrics' then
    select m.category, m.stored, m.plaus_min, m.plaus_max into v_cat, v_stored, v_min, v_max
    from health.metric_catalog m where m.code = new.metric_code;
    if not coalesce(v_stored, false) then
      raise exception 'health_metric_not_stored' using errcode = '22023';
    end if;
    if (v_min is not null and new.value < v_min) or (v_max is not null and new.value > v_max) then
      raise exception 'plaus_out_of_range' using errcode = '22023';
    end if;
  elsif tg_table_name = 'sleep_sessions' then
    v_cat := 'sleep';
  else
    v_cat := 'workout';
  end if;
  select c.categories into v_consent from health.consents c where c.user_id = new.user_id and c.revoked_at is null;
  if v_consent is null then
    raise exception 'health_no_consent' using errcode = '42501';
  end if;
  if not (v_cat = any (v_consent)) then
    raise exception 'health_category_not_consented' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger daily_metrics_guard before insert or update on health.daily_metrics for each row execute function health.guard_data();
create trigger sleep_sessions_guard before insert or update on health.sleep_sessions for each row execute function health.guard_data();
create trigger workouts_guard before insert or update on health.workouts for each row execute function health.guard_data();

create or replace function health.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'connections' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;
create trigger connections_touch before update on health.connections for each row execute function health.touch_updated_at();
create trigger credentials_touch before update on health.credentials for each row execute function health.touch_updated_at();

-- Apaga uma conexão e tudo o que veio dela, enfileirando antes a revogação na marca (§8.3).
-- for update: um worker que travou a conexão com for share termina antes; depois disso nada grava.
create or replace function health.purge_connection(p_connection uuid, p_reason text, p_actor text default 'user')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v health.connections; n_daily int; n_sleep int; n_workouts int; v_queued boolean := false;
begin
  select * into v from health.connections c where c.id = p_connection for update;
  if not found then return null; end if;
  insert into health.pending_revocations (connection_ref, provider, provider_user_id, access_token_enc, refresh_token_enc, key_version, reason)
  select v.id, v.provider, v.provider_user_id, cr.access_token_enc, cr.refresh_token_enc, cr.key_version, p_reason
  from health.credentials cr where cr.connection_id = v.id;
  v_queued := found;
  delete from health.daily_metrics d where d.connection_id = v.id; get diagnostics n_daily = row_count;
  delete from health.sleep_sessions s where s.connection_id = v.id; get diagnostics n_sleep = row_count;
  delete from health.workouts w where w.connection_id = v.id; get diagnostics n_workouts = row_count;
  delete from health.connections c where c.id = v.id;   -- cascata: credenciais e inbox
  perform health.audit_write(v.user_id, p_actor, 'connection.deleted', v.provider, v.id,
    jsonb_build_object('reason', p_reason, 'daily_deleted', n_daily, 'sleep_deleted', n_sleep, 'workouts_deleted', n_workouts, 'revocation_queued', v_queued));
  return jsonb_build_object('connection_ref', v.id, 'provider', v.provider, 'daily_deleted', n_daily, 'sleep_deleted', n_sleep,
                            'workouts_deleted', n_workouts, 'revocation_queued', v_queued);
end $$;

-- Apaga os dados das categorias retiradas (redução de consentimento, art. 16).
create or replace function health.purge_categories(p_user uuid, p_removed health.category[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_daily int := 0; n_sleep int := 0; n_workouts int := 0;
begin
  -- trava as conexões da pessoa contra o for share do apply_batch: um lote em andamento termina
  -- antes (e o que gravou é apagado aqui); um lote posterior já lê o consentimento novo e é recusado
  perform 1 from health.connections c where c.user_id = p_user for update;
  -- o bruto do inbox mistura categorias (os resumos da Garmin trazem atividade, coração e estresse
  -- juntos): anula todo o bruto da pessoa; o que ainda não foi processado não é mais processado
  update health.ingest_events e set payload = null,
    status = case when e.status in ('received', 'failed') then 'ignored' else e.status end,
    next_attempt_at = case when e.status in ('received', 'failed') then null else e.next_attempt_at end
  from health.connections c where c.id = e.connection_id and c.user_id = p_user and e.payload is not null;
  delete from health.daily_metrics d using health.metric_catalog m
  where d.user_id = p_user and m.code = d.metric_code and m.category = any (p_removed);
  get diagnostics n_daily = row_count;
  if 'sleep' = any (p_removed) then
    delete from health.sleep_sessions s where s.user_id = p_user; get diagnostics n_sleep = row_count;
  end if;
  if 'workout' = any (p_removed) then
    delete from health.workouts w where w.user_id = p_user; get diagnostics n_workouts = row_count;
  end if;
  return jsonb_build_object('daily_deleted', n_daily, 'sleep_deleted', n_sleep, 'workouts_deleted', n_workouts);
end $$;

-- Categorias recebidas como texto: valor desconhecido vira um código de erro, não um 22P02 cru.
create or replace function health.parse_categories(p_categories text[]) returns health.category[]
language plpgsql immutable set search_path = '' as $$
declare v health.category[];
begin
  if p_categories is null or cardinality(p_categories) = 0 then
    raise exception 'health_categories_required' using errcode = '22023';
  end if;
  begin
    select array_agg(distinct c::health.category order by c::health.category) into v from unnest(p_categories) c;
  exception when invalid_text_representation then
    raise exception 'health_invalid_category' using errcode = '22023';
  end;
  return v;
end $$;

-- Publica outra versão vigente (só o dono, pelo SQL do projeto). Mudança MATERIAL pausa a ingestão
-- de quem aceitou outra versão (consent_outdated) até novo aceite; sem aceite em 30 dias (Q20), o
-- run de retenção apaga. Mudança não material só troca a versão (a tela avisa).
create or replace function health.set_consent_version(p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_material boolean; n int := 0;
begin
  select bool_or(t.material) into v_material from health.consent_texts t where t.version = p_version;
  if v_material is null then raise exception 'consent_version_unknown' using errcode = '22023'; end if;
  if (select count(*) from health.consent_texts t where t.version = p_version) <> 3 then
    raise exception 'consent_version_incomplete' using errcode = '22023';
  end if;
  update health.config set value = p_version where key = 'consent_version';
  if v_material then
    update health.connections c set status = 'consent_outdated'
    where c.status = 'active'
      and not exists (select 1 from health.consents k where k.user_id = c.user_id and k.revoked_at is null and k.policy_version = p_version);
    get diagnostics n = row_count;
  end if;
  perform health.audit_write(null, 'admin', 'consent.version_published', null, null, jsonb_build_object('material', v_material, 'connections_paused', n));
  return jsonb_build_object('version', p_version, 'material', v_material, 'connections_paused', n);
end $$;

-- ---------------------------------------------------------------- RLS e grants (§8.9)
alter table health.config enable row level security;
alter table health.metric_catalog enable row level security;
alter table health.consent_texts enable row level security;
alter table health.consents enable row level security;
alter table health.connections enable row level security;
alter table health.credentials enable row level security;
alter table health.pending_revocations enable row level security;
alter table health.daily_metrics enable row level security;
alter table health.sleep_sessions enable row level security;
alter table health.workouts enable row level security;
alter table health.ingest_events enable row level security;
alter table health.audit enable row level security;

-- Defesa extra: mesmo que um grant escape, só health_ingest tem política (nenhuma para os demais).
create policy ingest_read on health.metric_catalog for select to health_ingest using (true);
create policy ingest_read on health.consent_texts for select to health_ingest using (true);
create policy ingest_read on health.consents for select to health_ingest using (true);
create policy ingest_all on health.connections for all to health_ingest using (true) with check (true);
create policy ingest_all on health.credentials for all to health_ingest using (true) with check (true);
create policy ingest_all on health.pending_revocations for all to health_ingest using (true) with check (true);
create policy ingest_all on health.daily_metrics for all to health_ingest using (true) with check (true);
create policy ingest_all on health.sleep_sessions for all to health_ingest using (true) with check (true);
create policy ingest_all on health.workouts for all to health_ingest using (true) with check (true);
create policy ingest_rw on health.ingest_events for all to health_ingest using (true) with check (true);
create policy ingest_insert on health.audit for insert to health_ingest with check (true);

revoke all on all tables in schema health from public, anon, authenticated, service_role;
revoke all on all sequences in schema health from public, anon, authenticated, service_role;
grant select on health.metric_catalog, health.consent_texts, health.consents to health_ingest;
grant select, insert, update, delete on health.connections, health.credentials, health.pending_revocations,
  health.daily_metrics, health.sleep_sessions, health.workouts to health_ingest;
grant select, insert, update on health.ingest_events to health_ingest;
grant insert on health.audit to health_ingest;

revoke execute on all functions in schema health from public, anon, authenticated, service_role;
-- O papel de ingestão só precisa destas (as de apagar/publicar ficam com o dono).
grant execute on function health.is_demo_user(uuid), health.audit_write(uuid, text, text, health.provider, uuid, jsonb) to health_ingest;

-- ---------------------------------------------------------------- exclusão de conta (§8.3, LGPD art. 18)
-- Gatilho em auth.users: cobre delete_my_account (que apaga a linha de auth.users depois de
-- anonymize_user_data) e a exclusão pelo painel/Auth Admin, sem depender de nenhuma das duas:
-- enfileira as revogações, apaga os dados e fecha o consentimento como prova (user_id → null).
create or replace function health.on_auth_user_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select c.id from health.connections c where c.user_id = old.id loop
    perform health.purge_connection(r.id, 'account_deleted', 'system');
  end loop;
  update health.consents set revoked_at = now(), revoke_reason = 'account_deleted'
  where user_id = old.id and revoked_at is null;
  if found then
    perform health.audit_write(old.id, 'system', 'consent.revoked', null, null, jsonb_build_object('reason', 'account_deleted'));
  end if;
  return old;
end $$;
revoke execute on function health.on_auth_user_delete() from public, anon, authenticated, service_role;
create trigger health_on_auth_user_delete before delete on auth.users
  for each row execute function health.on_auth_user_delete();

-- ---------------------------------------------------------------- RPCs da pessoa (public, security definer)
create or replace function public.health_consent_text(p_locale text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_version text := health.cfg('consent_version'); v health.consent_texts;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v from health.consent_texts t where t.version = v_version and t.locale = p_locale;
  if not found then
    select * into v from health.consent_texts t where t.version = v_version and t.locale = 'pt-BR';
  end if;
  return jsonb_build_object('version', v.version, 'locale', v.locale, 'body', v.body, 'sha256', v.sha256,
    'min_age', health.cfg('min_age')::int, 'min_age_rule_pending', health.cfg('min_age_rule_pending') = 'true');
end $$;

create or replace function public.my_health_consent()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when c.id is null then null else jsonb_build_object(
    'version', c.policy_version, 'locale', c.locale, 'categories', to_jsonb(c.categories), 'granted_at', c.granted_at,
    'current_version', health.cfg('consent_version'), 'outdated', c.policy_version <> health.cfg('consent_version'))
  end
  from (select 1) one
  left join health.consents c on c.user_id = auth.uid() and c.revoked_at is null
$$;

-- Login recente (§15.9): o JWT do Supabase traz em `amr` quando cada método de login foi usado.
-- Conceder/ampliar pela API direta (sem a server action) também exige login nos últimos 5 minutos.
create or replace function health.recent_login(p_window_s int default 300) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select max((e ->> 'timestamp')::bigint) from jsonb_array_elements(
           case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) e
         where (e ->> 'timestamp') ~ '^\d{9,11}$'), 0) >= extract(epoch from now())::bigint - p_window_s
$$;

revoke execute on function health.recent_login(int) from public, anon, authenticated, service_role;

-- Conceder ou AMPLIAR (a server action e o banco exigem login recente ≤ 5 min).
create or replace function public.health_consent_grant(p_version text, p_locale text, p_categories text[], p_age_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_cats health.category[]; v_prev health.consents; v_sha text; v_removed health.category[];
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if health.is_demo_user(v_uid) then raise exception 'demo_account_cannot_connect' using errcode = '42501'; end if;
  if not health.recent_login(300) then raise exception 'reauth_required' using errcode = '42501'; end if;
  if not coalesce(p_age_confirmed, false) then raise exception 'health_age_not_confirmed' using errcode = '22023'; end if;
  if p_version is distinct from health.cfg('consent_version') then
    raise exception 'health_consent_version_outdated' using errcode = '22023';
  end if;
  select t.sha256 into v_sha from health.consent_texts t where t.version = p_version and t.locale = p_locale;
  if v_sha is null then raise exception 'health_consent_text_missing' using errcode = '22023'; end if;
  v_cats := health.parse_categories(p_categories);

  select * into v_prev from health.consents c where c.user_id = v_uid and c.revoked_at is null for update;
  if found then
    update health.consents set revoked_at = now(), revoke_reason = 'superseded' where id = v_prev.id;
    select coalesce(array_agg(x), '{}') into v_removed from unnest(v_prev.categories) x where not (x = any (v_cats));
    if cardinality(v_removed) > 0 then perform health.purge_categories(v_uid, v_removed); end if;
  end if;
  insert into health.consents (user_id, subject_ref, policy_version, locale, text_sha256, categories, channel, age_declared_min)
  values (v_uid, health.subject_ref_of(v_uid), p_version, p_locale, v_sha, v_cats, 'web', health.cfg('min_age')::smallint);
  -- novo aceite depois de mudança material: as conexões pausadas voltam a receber
  update health.connections set status = 'active' where user_id = v_uid and status = 'consent_outdated';
  perform health.audit_write(v_uid, 'user', case when v_prev.id is null then 'consent.granted' else 'consent.updated' end, null, null,
    jsonb_build_object('version', p_version, 'categories', to_jsonb(v_cats)));
  return public.my_health_consent();
end $$;

-- Reduzir categorias: só subconjunto da atual, sem reautenticação; apaga só o que saiu (§6.1 F).
create or replace function public.health_consent_reduce(p_categories text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_cats health.category[]; v_prev health.consents; v_removed health.category[]; v_counts jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_cats := health.parse_categories(p_categories);
  select * into v_prev from health.consents c where c.user_id = v_uid and c.revoked_at is null for update;
  if not found then raise exception 'health_no_consent' using errcode = '22023'; end if;
  if not (v_cats <@ v_prev.categories) then raise exception 'health_consent_expand_requires_grant' using errcode = '22023'; end if;
  select coalesce(array_agg(x), '{}') into v_removed from unnest(v_prev.categories) x where not (x = any (v_cats));
  if cardinality(v_removed) = 0 then return public.my_health_consent(); end if;
  v_counts := health.purge_categories(v_uid, v_removed);
  update health.consents set revoked_at = now(), revoke_reason = 'superseded' where id = v_prev.id;
  insert into health.consents (user_id, subject_ref, policy_version, locale, text_sha256, categories, channel, age_declared_min, granted_at)
  values (v_uid, v_prev.subject_ref, v_prev.policy_version, v_prev.locale, v_prev.text_sha256, v_cats, v_prev.channel, v_prev.age_declared_min, now());
  perform health.audit_write(v_uid, 'user', 'consent.reduced', null, null,
    jsonb_build_object('removed', to_jsonb(v_removed), 'daily_deleted', (v_counts ->> 'daily_deleted')::int,
      'sleep_deleted', (v_counts ->> 'sleep_deleted')::int, 'workouts_deleted', (v_counts ->> 'workouts_deleted')::int));
  return public.my_health_consent();
end $$;

-- Retirar o consentimento: 1 toque + confirmação; desconecta tudo, apaga tudo, enfileira as
-- revogações na marca. Nunca é bloqueado (RF-09, art. 8º §5º). Conta demo pode chamar (não tem nada).
create or replace function public.health_consent_revoke()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r record; v_refs jsonb := '[]'::jsonb; v_res jsonb; v_had boolean;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  for r in select c.id from health.connections c where c.user_id = v_uid loop
    v_res := health.purge_connection(r.id, 'consent_revoked', 'user');
    if v_res is not null then v_refs := v_refs || jsonb_build_array(v_res ->> 'connection_ref'); end if;
  end loop;
  -- dados sem conexão não existem (FK), mas a limpeza por pessoa garante o "apaga tudo"
  delete from health.daily_metrics where user_id = v_uid;
  delete from health.sleep_sessions where user_id = v_uid;
  delete from health.workouts where user_id = v_uid;
  update health.consents set revoked_at = now(), revoke_reason = 'user' where user_id = v_uid and revoked_at is null;
  v_had := found;
  if v_had then perform health.audit_write(v_uid, 'user', 'consent.revoked', null, null, jsonb_build_object('reason', 'user')); end if;
  return jsonb_build_object('revoked', v_had, 'connection_refs', v_refs);
end $$;

-- Conexões da pessoa, só colunas seguras (sem tokens, sem id na marca).
create or replace function public.my_wearable_connections()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'provider', c.provider, 'status', c.status, 'device_name', c.device_name,
    'connected_at', c.connected_at, 'last_data_at', c.last_data_at, 'last_sync_at', c.last_sync_at,
    'last_error_code', c.last_error_code) order by c.connected_at), '[]'::jsonb)
  from health.connections c where c.user_id = auth.uid()
$$;

-- Desconectar e apagar: na hora, numa transação; a revogação na marca vai para a fila.
create or replace function public.wearable_disconnect(p_connection uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from health.connections c where c.id = p_connection and c.user_id = v_uid) then
    raise exception 'connection_not_found' using errcode = '22023';
  end if;
  return health.purge_connection(p_connection, 'user_disconnect', 'user');
end $$;

-- Leitura do Hoje (§9.3): séries dos últimos dias de todas as conexões da pessoa; a escolha de
-- uma fonte por métrica e dia (§9.6) e os índices nossos são feitos em TypeScript.
create or replace function public.my_health_today(p_until date, p_days int default 63)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_from date;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_until is null then raise exception 'date_required' using errcode = '22023'; end if;
  -- até 100 dias: a reserva das zonas (§13.4) usa a maior FC dos últimos 90 dias
  v_from := p_until - greatest(1, least(coalesce(p_days, 63), 100));
  return jsonb_build_object(
    'connections', public.my_wearable_connections(),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
        'd', d.local_date, 'c', d.metric_code, 'v', d.value, 's', d.scale, 'l', d.value_label, 'm', d.method,
        'n', d.sample_count, 'at', d.sampled_at, 'cov', d.coverage_pct, 'conn', d.connection_id, 'p', c.provider,
        'u', coalesce(d.source_updated_at, d.ingested_at)) order by d.local_date), '[]'::jsonb)
      from health.daily_metrics d join health.connections c on c.id = d.connection_id
      where d.user_id = v_uid and d.local_date between v_from and p_until),
    'sleep', (select coalesce(jsonb_agg(jsonb_build_object(
        'd', s.local_date, 'start', s.start_at, 'end', s.end_at, 'main', s.is_main, 'nap', s.is_nap, 'conn', s.connection_id,
        'p', c.provider, 'asleep', s.asleep_min, 'deep', s.deep_min, 'light', s.light_min, 'rem', s.rem_min,
        'awake', s.awake_min, 'in_bed', s.in_bed_min, 'eff', s.efficiency_pct, 'score', s.vendor_score,
        'lowest_hr', s.lowest_hr) order by s.start_at), '[]'::jsonb)
      from health.sleep_sessions s join health.connections c on c.id = s.connection_id
      where s.user_id = v_uid and s.local_date between v_from and p_until),
    'workouts', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'd', w.local_date, 'sport', w.sport, 'origin', w.origin, 'start', w.start_at, 'end', w.end_at,
        'dur', w.duration_s, 'dist', w.distance_m, 'kcal', w.active_kcal, 'avg_hr', w.avg_hr, 'max_hr', w.max_hr,
        'zones', to_jsonb(w.hr_zone_s), 'conn', w.connection_id, 'p', c.provider) order by w.start_at), '[]'::jsonb)
      from health.workouts w join health.connections c on c.id = w.connection_id
      where w.user_id = v_uid and w.local_date between v_from and p_until));
end $$;

-- ---------------------------------------------------------------- retenção (§8.10, Q11, Q15, Q20)
-- Chamada pelo cron diário existente (/api/cron/retention, service role). Só apaga: não devolve dado.
create or replace function public.health_run_retention()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n_daily int; n_sleep int; n_workouts int; n_payload int; n_events int; n_revocations int; n_audit int; n_consents int;
  n_revoked int := 0; n_outdated int := 0; n_inactive int := 0; r record;
  v_cutoff date := (now() at time zone 'UTC')::date - interval '13 months';
begin
  -- 13 meses de dados diários, sono e treinos (Q11)
  delete from health.daily_metrics where local_date < v_cutoff; get diagnostics n_daily = row_count;
  delete from health.sleep_sessions where local_date < v_cutoff; get diagnostics n_sleep = row_count;
  delete from health.workouts where local_date < v_cutoff; get diagnostics n_workouts = row_count;
  -- payload bruto: 7 dias; Garmin 30 dias (Q15, sem histórico para re-buscar); metadados: 30 dias
  update health.ingest_events set payload = null
  where payload is not null and ((provider <> 'garmin' and received_at < now() - interval '7 days')
                                 or (provider = 'garmin' and received_at < now() - interval '30 days'));
  get diagnostics n_payload = row_count;
  delete from health.ingest_events where received_at < now() - interval '30 days'; get diagnostics n_events = row_count;
  -- revogação na marca: até sucesso ou 7 dias
  delete from health.pending_revocations where expires_at < now(); get diagnostics n_revocations = row_count;
  delete from health.audit where created_at < now() - interval '365 days'; get diagnostics n_audit = row_count;
  -- prova de consentimento: 5 anos após a revogação (prazo a confirmar com o jurídico)
  delete from health.consents where revoked_at < now() - interval '5 years'; get diagnostics n_consents = row_count;
  -- desautorizado na marca (Q11), mudança material sem novo aceite (Q20) ou conexão que falhou ao
  -- abrir: 30 dias para decidir. token_expired só é posto quando a marca recusa o token ou a renovação
  -- (desautorizar o app na Oura/WHOOP/Polar chega assim); a tela já pede para reconectar.
  for r in select c.id, c.status from health.connections c
           where c.status in ('revoked_by_provider', 'token_expired', 'consent_outdated', 'error') and c.status_changed_at < now() - interval '30 days' loop
    perform health.purge_connection(r.id, 'retention', 'system');
    if r.status = 'consent_outdated' then n_outdated := n_outdated + 1; else n_revoked := n_revoked + 1; end if;
  end loop;
  -- conexão sem dado há 12 meses: desconecta e apaga
  for r in select c.id from health.connections c where coalesce(c.last_data_at, c.connected_at) < now() - interval '12 months' loop
    perform health.purge_connection(r.id, 'retention', 'system');
    n_inactive := n_inactive + 1;
  end loop;
  return jsonb_build_object('health_daily_deleted', n_daily, 'health_sleep_deleted', n_sleep, 'health_workouts_deleted', n_workouts,
    'health_payloads_cleared', n_payload, 'health_events_deleted', n_events, 'health_revocations_expired', n_revocations,
    'health_audit_deleted', n_audit, 'health_consents_deleted', n_consents, 'health_revoked_purged', n_revoked,
    'health_outdated_purged', n_outdated, 'health_inactive_purged', n_inactive);
end $$;

-- Grants das RPCs: nada para anon (lista do S14 inalterada) nem para service_role, exceto a retenção.
revoke execute on function public.health_consent_text(text), public.my_health_consent(),
  public.health_consent_grant(text, text, text[], boolean), public.health_consent_reduce(text[]),
  public.health_consent_revoke(), public.my_wearable_connections(), public.wearable_disconnect(uuid),
  public.my_health_today(date, int), public.health_run_retention()
  from public, anon, authenticated, service_role;
grant execute on function public.health_consent_text(text), public.my_health_consent(),
  public.health_consent_grant(text, text, text[], boolean), public.health_consent_reduce(text[]),
  public.health_consent_revoke(), public.my_wearable_connections(), public.wearable_disconnect(uuid),
  public.my_health_today(date, int) to authenticated;
grant execute on function public.health_run_retention() to service_role;
