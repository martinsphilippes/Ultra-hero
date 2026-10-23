-- =============================================================================
-- 0039 · Hoje com relógio real — F4: funções de ingestão (Garmin, Oura, WHOOP, Polar)
-- docs/decisions/hoje-relogio.md §9.2–9.5. Executadas SÓ pelo papel health_ingest (security invoker:
-- os grants da 0038 valem de verdade e os cenários S43+ os provam). Os gatilhos da 0038 recusam
-- dado sem consentimento ativo, de categoria não consentida, de conexão inativa ou de conta demo.
-- =============================================================================

-- Abre (ou reabre) a conexão de uma pessoa com uma marca, ainda 'pending' até as credenciais
-- chegarem. A conta da marca não pode estar ligada a outra pessoa.
create or replace function health.connection_open(p_user uuid, p_provider health.provider, p_provider_user_id text, p_scopes text[], p_device_name text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if health.is_demo_user(p_user) then raise exception 'demo_account_cannot_connect' using errcode = '42501'; end if;
  if not exists (select 1 from health.consents k where k.user_id = p_user and k.revoked_at is null) then
    raise exception 'health_no_consent' using errcode = '42501';
  end if;
  if exists (select 1 from health.connections c where c.provider = p_provider and c.provider_user_id = p_provider_user_id
             and c.user_id <> p_user and c.status in ('pending', 'active', 'token_expired', 'consent_outdated')) then
    raise exception 'provider_account_in_use' using errcode = '23505';
  end if;
  select c.id into v_id from health.connections c
  where c.user_id = p_user and c.provider = p_provider and c.status in ('pending', 'active', 'token_expired', 'consent_outdated')
  for update;
  if v_id is null then
    -- conexão antiga desautorizada na marca é substituída pela nova (os dados dela já foram ou serão apagados)
    insert into health.connections (user_id, provider, provider_user_id, status, scopes, device_name)
    values (p_user, p_provider, p_provider_user_id, 'pending', coalesce(p_scopes, '{}'), p_device_name)
    returning id into v_id;
  else
    update health.connections set provider_user_id = p_provider_user_id, scopes = coalesce(p_scopes, '{}'),
      device_name = coalesce(p_device_name, device_name), status = 'pending'
    where id = v_id;
  end if;
  return v_id;
end $$;

-- Grava as credenciais (já cifradas pela aplicação) e ativa a conexão.
create or replace function health.credentials_store(p_connection uuid, p_access bytea, p_refresh bytea, p_expires timestamptz, p_key_version smallint, p_activate boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v health.connections;
begin
  select * into v from health.connections c where c.id = p_connection for update;
  if not found then raise exception 'connection_not_found' using errcode = '22023'; end if;
  insert into health.credentials (connection_id, access_token_enc, refresh_token_enc, token_expires_at, key_version)
  values (p_connection, p_access, p_refresh, p_expires, p_key_version)
  on conflict (connection_id) do update set access_token_enc = excluded.access_token_enc,
    refresh_token_enc = coalesce(excluded.refresh_token_enc, health.credentials.refresh_token_enc),
    token_expires_at = excluded.token_expires_at, key_version = excluded.key_version;
  if p_activate then
    update health.connections set status = 'active', consecutive_errors = 0, last_error_code = null where id = p_connection;
    if v.status <> 'active' then
      perform health.audit_write(v.user_id, 'system', 'connection.activated', v.provider, v.id, '{}'::jsonb);
    end if;
  end if;
end $$;

-- Troca de estado pedida pela marca ou pela renovação de token (desautorizado na marca → 30 dias, Q11).
create or replace function health.connection_set_status(p_connection uuid, p_status health.conn_status, p_error_code text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v health.connections;
begin
  select * into v from health.connections c where c.id = p_connection for update;
  if not found then return; end if;
  update health.connections set status = p_status, last_error_code = p_error_code,
    consecutive_errors = case when p_error_code is null then 0 else consecutive_errors + 1 end
  where id = p_connection;
  if v.status is distinct from p_status then
    perform health.audit_write(v.user_id, 'system', 'connection.status', v.provider, v.id,
      jsonb_build_object('status', p_status::text, 'code', coalesce(p_error_code, '')));
  end if;
end $$;

-- Entrada (inbox). A conexão é resolvida ANTES de gravar: sem conexão viva para aquele id na
-- marca, nada é gravado; conexão pausada/sem consentimento → só metadados ('ignored', sem payload).
-- Idempotente: o mesmo corpo (hash) ou o mesmo id de evento na mesma conexão não entra de novo.
create or replace function health.event_receive(p_provider health.provider, p_provider_user_id text, p_kind text,
  p_provider_event_id text, p_payload_sha256 text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v health.connections; v_id uuid; v_ok boolean;
begin
  select * into v from health.connections c
  where c.provider = p_provider and c.provider_user_id = p_provider_user_id
    and c.status in ('pending', 'active', 'token_expired', 'consent_outdated', 'revoked_by_provider')
  order by (c.status = 'active') desc, c.connected_at desc limit 1;
  if not found then return jsonb_build_object('status', 'no_connection'); end if;
  v_ok := v.status = 'active' and exists (select 1 from health.consents k where k.user_id = v.user_id and k.revoked_at is null);
  insert into health.ingest_events (provider, connection_id, provider_event_id, payload_sha256, kind, status, payload)
  values (p_provider, v.id, p_provider_event_id, p_payload_sha256, p_kind,
          case when v_ok then 'received' else 'ignored' end, case when v_ok then p_payload else null end)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('status', 'duplicate', 'connection_id', v.id); end if;
  return jsonb_build_object('status', case when v_ok then 'received' else 'ignored' end, 'event_id', v_id, 'connection_id', v.id);
end $$;

-- Pega um evento para processar (trava a linha; quem chegar depois pula).
create or replace function health.event_claim(p_event uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v health.ingest_events;
begin
  select * into v from health.ingest_events e where e.id = p_event and e.status in ('received', 'failed') for update skip locked;
  if not found then return null; end if;
  update health.ingest_events set status = 'processing', attempts = attempts + 1 where id = p_event;
  return jsonb_build_object('event_id', v.id, 'connection_id', v.connection_id, 'provider', v.provider, 'kind', v.kind,
                            'provider_event_id', v.provider_event_id, 'payload', v.payload, 'attempts', v.attempts + 1);
end $$;

-- Fecha o evento. Falha: novas tentativas em 1, 5, 30 min, 2 h e 12 h; na 6ª, 'dead' sem payload.
create or replace function health.event_finish(p_event uuid, p_ok boolean, p_error_code text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_attempts smallint; v_status text;
begin
  select e.attempts into v_attempts from health.ingest_events e where e.id = p_event;
  if v_attempts is null then return null; end if;
  if p_ok then
    update health.ingest_events set status = 'done', processed_at = now(), last_error_code = null, next_attempt_at = null where id = p_event;
    return 'done';
  end if;
  v_status := case when v_attempts >= 6 then 'dead' else 'failed' end;
  update health.ingest_events set status = v_status, last_error_code = p_error_code, processed_at = now(),
    payload = case when v_status = 'dead' then null else payload end,
    next_attempt_at = case when v_status = 'dead' then null
      else now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours', interval '12 hours'])[least(v_attempts, 5)] end
  where id = p_event;
  return v_status;
end $$;

-- Grava um lote normalizado (§9.2) numa transação por conexão. user_id vem da CONEXÃO, nunca do
-- lote. for share: desconexão/exclusão (for update) esperam; depois delas, nada grava.
-- Upsert condicional (RN-10): só sobrescreve quando o dado novo é tão ou mais recente.
create or replace function health.apply_batch(p_connection uuid, p_batch jsonb, p_normalizer_version smallint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v health.connections; n_daily int := 0; n_sleep int := 0; n_workouts int := 0; n_deleted int := 0; n int; v_codes text[];
begin
  select * into v from health.connections c where c.id = p_connection for share;
  if not found then return jsonb_build_object('status', 'no_connection'); end if;
  if v.status <> 'active' then return jsonb_build_object('status', 'inactive'); end if;

  insert into health.daily_metrics as d (user_id, connection_id, local_date, metric_code, value, scale, value_label, method,
    sample_count, sampled_at, coverage_pct, is_vendor_score, source_device, source_updated_at, normalizer_version)
  select v.user_id, v.id, (x ->> 'date')::date, x ->> 'code', (x ->> 'value')::numeric, x ->> 'scale', x ->> 'label', x ->> 'method',
    (x ->> 'n')::smallint, (x ->> 'at')::timestamptz, (x ->> 'cov')::smallint, coalesce((x ->> 'vendor')::boolean, false),
    x ->> 'device', (x ->> 'updated')::timestamptz, p_normalizer_version
  from jsonb_array_elements(coalesce(p_batch -> 'daily', '[]'::jsonb)) x
  on conflict (user_id, local_date, metric_code, connection_id) do update set
    value = excluded.value, scale = excluded.scale, value_label = excluded.value_label, method = excluded.method,
    sample_count = excluded.sample_count, sampled_at = excluded.sampled_at, coverage_pct = excluded.coverage_pct,
    is_vendor_score = excluded.is_vendor_score, source_device = excluded.source_device,
    source_updated_at = excluded.source_updated_at, normalizer_version = excluded.normalizer_version, ingested_at = now()
  where coalesce(excluded.source_updated_at, now()) >= coalesce(d.source_updated_at, d.ingested_at);
  get diagnostics n_daily = row_count;

  insert into health.sleep_sessions as s (user_id, connection_id, external_id, local_date, start_at, end_at, tz_offset_min, is_main, is_nap,
    in_bed_min, asleep_min, deep_min, light_min, rem_min, awake_min, latency_min, efficiency_pct, vendor_score, vendor_score_scale,
    lowest_hr, normalizer_version, source_updated_at)
  select v.user_id, v.id, x ->> 'ext', (x ->> 'date')::date, (x ->> 'start')::timestamptz, (x ->> 'end')::timestamptz,
    (x ->> 'tz')::smallint, coalesce((x ->> 'main')::boolean, true), coalesce((x ->> 'nap')::boolean, false),
    (x ->> 'inBed')::int, (x ->> 'asleep')::int, (x ->> 'deep')::int, (x ->> 'light')::int, (x ->> 'rem')::int, (x ->> 'awake')::int,
    (x ->> 'latency')::int, (x ->> 'eff')::smallint, (x ->> 'score')::smallint, x ->> 'scoreScale', (x ->> 'lowestHr')::smallint,
    p_normalizer_version, (x ->> 'updated')::timestamptz
  from jsonb_array_elements(coalesce(p_batch -> 'sleep', '[]'::jsonb)) x
  on conflict (connection_id, external_id) do update set
    local_date = excluded.local_date, start_at = excluded.start_at, end_at = excluded.end_at, tz_offset_min = excluded.tz_offset_min,
    is_main = excluded.is_main, is_nap = excluded.is_nap, in_bed_min = excluded.in_bed_min, asleep_min = excluded.asleep_min,
    deep_min = excluded.deep_min, light_min = excluded.light_min, rem_min = excluded.rem_min, awake_min = excluded.awake_min,
    latency_min = excluded.latency_min, efficiency_pct = excluded.efficiency_pct, vendor_score = excluded.vendor_score,
    vendor_score_scale = excluded.vendor_score_scale, lowest_hr = excluded.lowest_hr, normalizer_version = excluded.normalizer_version,
    source_updated_at = excluded.source_updated_at, ingested_at = now()
  where coalesce(excluded.source_updated_at, now()) >= coalesce(s.source_updated_at, s.ingested_at);
  get diagnostics n_sleep = row_count;

  insert into health.workouts as w (user_id, connection_id, external_id, local_date, sport, origin, start_at, end_at, duration_s,
    distance_m, active_kcal, avg_hr, max_hr, hr_zone_s, elevation_gain_m, avg_speed_mps, avg_cadence, avg_power_w,
    vendor_effort, vendor_effort_scale, normalizer_version, source_updated_at)
  select v.user_id, v.id, x ->> 'ext', (x ->> 'date')::date, x ->> 'sport', x ->> 'origin', (x ->> 'start')::timestamptz,
    (x ->> 'end')::timestamptz, (x ->> 'dur')::int, (x ->> 'dist')::numeric, (x ->> 'kcal')::numeric, (x ->> 'avgHr')::smallint,
    (x ->> 'maxHr')::smallint,
    case when jsonb_typeof(x -> 'zones') = 'array' then array(select (z #>> '{}')::int from jsonb_array_elements(x -> 'zones') z) end,
    (x ->> 'elev')::numeric, (x ->> 'speed')::numeric, (x ->> 'cadence')::numeric, (x ->> 'power')::numeric,
    (x ->> 'effort')::numeric, x ->> 'effortScale', p_normalizer_version, (x ->> 'updated')::timestamptz
  from jsonb_array_elements(coalesce(p_batch -> 'workouts', '[]'::jsonb)) x
  on conflict (connection_id, external_id) do update set
    local_date = excluded.local_date, sport = excluded.sport, origin = excluded.origin, start_at = excluded.start_at,
    end_at = excluded.end_at, duration_s = excluded.duration_s, distance_m = excluded.distance_m, active_kcal = excluded.active_kcal,
    avg_hr = excluded.avg_hr, max_hr = excluded.max_hr, hr_zone_s = excluded.hr_zone_s, elevation_gain_m = excluded.elevation_gain_m,
    avg_speed_mps = excluded.avg_speed_mps, avg_cadence = excluded.avg_cadence, avg_power_w = excluded.avg_power_w,
    vendor_effort = excluded.vendor_effort, vendor_effort_scale = excluded.vendor_effort_scale,
    normalizer_version = excluded.normalizer_version, source_updated_at = excluded.source_updated_at, ingested_at = now()
  where coalesce(excluded.source_updated_at, now()) >= coalesce(w.source_updated_at, w.ingested_at);
  get diagnostics n_workouts = row_count;

  -- valor corrigido ou apagado na marca: nunca mantemos o que a fonte retirou (§5.17)
  delete from health.sleep_sessions s using jsonb_array_elements(coalesce(p_batch -> 'deletions', '[]'::jsonb)) x
  where s.connection_id = v.id and x ->> 'kind' = 'sleep' and s.external_id = x ->> 'ext';
  get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from health.workouts w using jsonb_array_elements(coalesce(p_batch -> 'deletions', '[]'::jsonb)) x
  where w.connection_id = v.id and x ->> 'kind' = 'workout' and w.external_id = x ->> 'ext';
  get diagnostics n = row_count; n_deleted := n_deleted + n;

  select coalesce(array_agg(distinct x ->> 'code'), '{}') into v_codes from jsonb_array_elements(coalesce(p_batch -> 'daily', '[]'::jsonb)) x;
  update health.connections set
    capabilities = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(capabilities || v_codes) c),
    last_sync_at = now(),
    last_data_at = case when n_daily + n_sleep + n_workouts > 0 then now() else last_data_at end,
    device_name = coalesce(nullif(p_batch ->> 'device', ''), device_name),
    consecutive_errors = 0, last_error_code = null
  where id = v.id;
  return jsonb_build_object('status', 'ok', 'daily', n_daily, 'sleep', n_sleep, 'workouts', n_workouts, 'deleted', n_deleted);
end $$;

-- Fila de revogações na marca: o servidor tenta na hora e o cron tenta de novo até 7 dias.
create or replace function health.revocation_finish(p_id uuid, p_ok boolean, p_error_code text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v health.pending_revocations;
begin
  select * into v from health.pending_revocations r where r.id = p_id for update;
  if not found then return; end if;
  if p_ok then
    delete from health.pending_revocations where id = p_id;
    perform health.audit_write(null, 'system', 'revocation.done', v.provider, v.connection_ref, jsonb_build_object('attempts', v.attempts + 1));
  else
    update health.pending_revocations set attempts = attempts + 1, last_error_code = p_error_code,
      next_attempt_at = now() + least(interval '12 hours', interval '5 minutes' * power(3, attempts))
    where id = p_id;
  end if;
end $$;

revoke execute on function health.connection_open(uuid, health.provider, text, text[], text),
  health.credentials_store(uuid, bytea, bytea, timestamptz, smallint, boolean),
  health.connection_set_status(uuid, health.conn_status, text),
  health.event_receive(health.provider, text, text, text, text, jsonb), health.event_claim(uuid),
  health.event_finish(uuid, boolean, text), health.apply_batch(uuid, jsonb, smallint),
  health.revocation_finish(uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function health.connection_open(uuid, health.provider, text, text[], text),
  health.credentials_store(uuid, bytea, bytea, timestamptz, smallint, boolean),
  health.connection_set_status(uuid, health.conn_status, text),
  health.event_receive(health.provider, text, text, text, text, jsonb), health.event_claim(uuid),
  health.event_finish(uuid, boolean, text), health.apply_batch(uuid, jsonb, smallint),
  health.revocation_finish(uuid, boolean, text)
  to health_ingest;
