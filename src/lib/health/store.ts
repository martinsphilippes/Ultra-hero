import "server-only";
import { decryptToken, encryptToken } from "./crypto";
import { healthDb } from "./db";
import { batchToJson } from "./normalize";
import type { HealthCategory, HealthProvider, NormalizedBatch } from "./types";
import { inboxHash } from "./webhook-parse";

// Operações do papel health_ingest no schema health. Toda a regra mora nas funções do banco
// (0039): conexão resolvida antes de gravar, idempotência, for share, upsert condicional,
// gatilhos de consentimento. Aqui só cifra tokens e chama as funções.


export async function openConnection(input: { userId: string; provider: HealthProvider; providerUserId: string; scopes: string[]; deviceName: string | null }): Promise<string> {
  const sql = healthDb();
  const [row] = await sql<{ id: string }[]>`
    select health.connection_open(${input.userId}::uuid, ${input.provider}::health.provider, ${input.providerUserId}, ${input.scopes}::text[], ${input.deviceName}) as id`;
  return row.id;
}

export async function storeCredentials(input: { connectionId: string; accessToken: string; refreshToken: string | null; expiresAt: Date | null; activate: boolean }): Promise<void> {
  const sql = healthDb();
  const access = encryptToken(input.accessToken, input.connectionId);
  const refresh = input.refreshToken ? encryptToken(input.refreshToken, input.connectionId) : null;
  await sql`
    select health.credentials_store(${input.connectionId}::uuid, ${access.data}, ${refresh?.data ?? null}, ${input.expiresAt}, ${access.keyVersion}::smallint, ${input.activate})`;
}

export type ConnectionCtx = {
  id: string;
  userId: string;
  provider: HealthProvider;
  providerUserId: string | null;
  status: string;
  categories: HealthCategory[];
  /** Escopos concedidos na marca (Oura/WHOOP): nada é buscado fora deles. */
  scopes: string[];
};

export async function connectionCtx(connectionId: string): Promise<ConnectionCtx | null> {
  const sql = healthDb();
  const rows = await sql<{ id: string; user_id: string; provider: HealthProvider; provider_user_id: string | null; status: string; categories: string | null; scopes: string[] | string | null }[]>`
    select c.id, c.user_id, c.provider, c.provider_user_id, c.status, c.scopes,
           (select k.categories::text from health.consents k where k.user_id = c.user_id and k.revoked_at is null) as categories
    from health.connections c where c.id = ${connectionId}::uuid`;
  const r = rows[0];
  if (!r) return null;
  // array de enum chega como texto "{sleep,heart}"
  const categories = (r.categories ?? "").replace(/[{}]/g, "").split(",").filter(Boolean) as HealthCategory[];
  const scopes = Array.isArray(r.scopes) ? r.scopes : (r.scopes ?? "").replace(/[{}"]/g, "").split(",").filter(Boolean);
  return { id: r.id, userId: r.user_id, provider: r.provider, providerUserId: r.provider_user_id, status: r.status, categories, scopes };
}

export type Credentials = { accessToken: string; refreshToken: string | null; expiresAt: Date | null };

export async function credentialsFor(connectionId: string): Promise<Credentials | null> {
  const sql = healthDb();
  const rows = await sql<{ access_token_enc: Buffer; refresh_token_enc: Buffer | null; token_expires_at: Date | null; key_version: number }[]>`
    select access_token_enc, refresh_token_enc, token_expires_at, key_version from health.credentials where connection_id = ${connectionId}::uuid`;
  const r = rows[0];
  if (!r) return null;
  return {
    accessToken: decryptToken(r.access_token_enc, connectionId, r.key_version),
    refreshToken: r.refresh_token_enc ? decryptToken(r.refresh_token_enc, connectionId, r.key_version) : null,
    expiresAt: r.token_expires_at,
  };
}

export async function setConnectionStatus(connectionId: string, status: "active" | "token_expired" | "revoked_by_provider" | "error", errorCode: string | null): Promise<void> {
  const sql = healthDb();
  await sql`select health.connection_set_status(${connectionId}::uuid, ${status}::health.conn_status, ${errorCode})`;
}

/** Conexões vivas de uma conta na marca (deregistração da Garmin, revogação pela marca). */
export async function connectionsByProviderUser(provider: HealthProvider, providerUserId: string): Promise<string[]> {
  const sql = healthDb();
  const rows = await sql<{ id: string }[]>`
    select id from health.connections where provider = ${provider}::health.provider and provider_user_id = ${providerUserId}
      and status in ('pending','active','token_expired','consent_outdated')`;
  return rows.map((r) => r.id);
}

export type ReceiveResult = { status: "received" | "ignored" | "duplicate" | "no_connection"; event_id?: string; connection_id?: string };

export async function receiveEvent(input: { provider: HealthProvider; providerUserId: string; kind: string; eventId: string | null; payload: unknown }): Promise<ReceiveResult> {
  const sql = healthDb();
  const [row] = await sql<{ r: ReceiveResult }[]>`
    select health.event_receive(${input.provider}::health.provider, ${input.providerUserId}, ${input.kind}, ${input.eventId},
      ${inboxHash(input)}, ${sql.json(input.payload as never)}) as r`;
  return row.r;
}

export type ClaimedEvent = { event_id: string; connection_id: string; provider: HealthProvider; kind: string; provider_event_id: string | null; payload: unknown; attempts: number };

export async function claimEvent(eventId: string): Promise<ClaimedEvent | null> {
  const sql = healthDb();
  const [row] = await sql<{ r: ClaimedEvent | null }[]>`select health.event_claim(${eventId}::uuid) as r`;
  return row.r;
}

export async function finishEvent(eventId: string, ok: boolean, errorCode: string | null): Promise<void> {
  const sql = healthDb();
  await sql`select health.event_finish(${eventId}::uuid, ${ok}, ${errorCode})`;
}

export async function dueEvents(limit: number): Promise<string[]> {
  const sql = healthDb();
  const rows = await sql<{ id: string }[]>`
    select id from health.ingest_events
    where status = 'received' or (status = 'failed' and next_attempt_at <= now())
    order by received_at limit ${limit}`;
  return rows.map((r) => r.id);
}

export async function applyBatch(connectionId: string, batch: NormalizedBatch): Promise<{ status: string; daily?: number; sleep?: number; workouts?: number; deleted?: number }> {
  const sql = healthDb();
  const [row] = await sql<{ r: { status: string; daily?: number; sleep?: number; workouts?: number; deleted?: number } }[]>`
    select health.apply_batch(${connectionId}::uuid, ${sql.json(batchToJson(batch) as never)}, ${batch.normalizerVersion}::smallint) as r`;
  return row.r;
}

export type PendingRevocation = {
  id: string;
  connectionRef: string;
  provider: HealthProvider;
  providerUserId: string | null;
  accessToken: string | null;
  /** Renova o acesso vencido para revogar de verdade (o token de acesso dura pouco). */
  refreshToken: string | null;
  attempts: number;
};

type RevocationRow = { id: string; connection_ref: string; provider: HealthProvider; provider_user_id: string | null; access_token_enc: Buffer | null; refresh_token_enc: Buffer | null; key_version: number | null; attempts: number };

/** Revogações vencidas (ou só as de uma conexão apagada agora há pouco). */
export async function dueRevocations(limit: number, connectionRefs?: string[]): Promise<PendingRevocation[]> {
  const sql = healthDb();
  const rows = connectionRefs
    ? await sql<RevocationRow[]>`
        select id, connection_ref, provider, provider_user_id, access_token_enc, refresh_token_enc, key_version, attempts from health.pending_revocations
        where connection_ref = any(${connectionRefs}::uuid[]) and expires_at > now() limit ${limit}`
    : await sql<RevocationRow[]>`
        select id, connection_ref, provider, provider_user_id, access_token_enc, refresh_token_enc, key_version, attempts from health.pending_revocations
        where next_attempt_at <= now() and expires_at > now() order by next_attempt_at limit ${limit}`;
  // mesmo AAD da credencial original (connection_ref = id da conexão já apagada)
  const open = (enc: Buffer | null, r: RevocationRow): string | null => {
    try {
      return enc && r.key_version ? decryptToken(enc, r.connection_ref, r.key_version) : null;
    } catch {
      return null; // chave antiga já removida: a linha expira em 7 dias
    }
  };
  return rows.map((r) => ({
    id: r.id,
    connectionRef: r.connection_ref,
    provider: r.provider,
    providerUserId: r.provider_user_id,
    accessToken: open(r.access_token_enc, r),
    refreshToken: open(r.refresh_token_enc, r),
    attempts: r.attempts,
  }));
}

/** Tokens renovados durante a revogação: a marca pode ter girado o refresh token (o antigo deixa de valer). */
export async function storeRevocationTokens(id: string, connectionRef: string, accessToken: string, refreshToken: string | null): Promise<void> {
  const sql = healthDb();
  const access = encryptToken(accessToken, connectionRef);
  const refresh = refreshToken ? encryptToken(refreshToken, connectionRef) : null;
  await sql`
    update health.pending_revocations set access_token_enc = ${access.data}, refresh_token_enc = ${refresh?.data ?? null}, key_version = ${access.keyVersion}
    where id = ${id}::uuid`;
}

export async function finishRevocation(id: string, ok: boolean, errorCode: string | null): Promise<void> {
  const sql = healthDb();
  await sql`select health.revocation_finish(${id}::uuid, ${ok}, ${errorCode})`;
}
