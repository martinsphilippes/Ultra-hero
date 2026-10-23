import "server-only";
import { pickAllowed } from "./adapters/common";
import { GARMIN_ALLOWED, isGarminKind, normalizeGarmin, type GarminKind } from "./adapters/garmin";
import { isOuraKind, normalizeOura, type OuraKind } from "./adapters/oura";
import { normalizePolar } from "./adapters/polar";
import { normalizeWhoop, normalizeWhoopCycle, type WhoopKind } from "./adapters/whoop";
import { validateBatch } from "./normalize";
import { fetchJson, ProviderError, refreshTokens, revokeAtProvider } from "./provider-api";
import { PROVIDERS } from "./providers";
import { isAllowedProviderUrl } from "./ssrf";
import {
  applyBatch,
  claimEvent,
  connectionCtx,
  credentialsFor,
  dueEvents,
  dueRevocations,
  finishEvent,
  finishRevocation,
  setConnectionStatus,
  storeCredentials,
  storeRevocationTokens,
  type ConnectionCtx,
  type PendingRevocation,
} from "./store";
import { emptyBatch, type HealthCategory, type NormalizedBatch } from "./types";

// Processamento do inbox (§9.2): evento → (busca na marca) → lista permitida → normaliza →
// valida (catálogo, categoria consentida, plausibilidade) → grava (for share, upsert condicional).
// Roda depois da resposta 200 do webhook (after) e no tique /api/cron/wearables (novas tentativas).
// Nada é buscado fora do que a pessoa consentiu e dos escopos que a marca concedeu (§15.4): a
// inscrição do webhook é da aplicação, então chegam avisos de tipos que a pessoa não autorizou.

const TZ_FALLBACK = "America/Sao_Paulo";
const WHOOP_API = "https://api.prod.whoop.com/developer/v2";
const OURA_API = "https://api.ouraring.com/v2/usercollection";

function merge(into: NormalizedBatch, from: NormalizedBatch): NormalizedBatch {
  into.daily.push(...from.daily);
  into.sleep.push(...from.sleep);
  into.workouts.push(...from.workouts);
  into.deletions.push(...from.deletions);
  if (from.device) into.device = from.device;
  return into;
}

/** O que cada tipo da marca pode trazer e o escopo que a busca exige (null = permissão da aplicação). */
type Gate = { scope: string | null; categories: readonly HealthCategory[] };

export const OURA_GATES: Record<OuraKind, Gate> = {
  daily_readiness: { scope: "daily", categories: ["readiness", "temperature"] },
  daily_sleep: { scope: "daily", categories: ["sleep"] },
  sleep: { scope: "daily", categories: ["sleep", "heart", "breathing"] },
  daily_activity: { scope: "daily", categories: ["activity"] },
  daily_spo2: { scope: "spo2Daily", categories: ["breathing"] },
  daily_stress: { scope: "daily", categories: ["stress"] },
  workout: { scope: "workout", categories: ["workout"] },
};

export const WHOOP_GATES = {
  recovery: { scope: "read:recovery", categories: ["readiness", "heart", "breathing", "temperature"] },
  sleep: { scope: "read:sleep", categories: ["sleep", "breathing"] },
  workout: { scope: "read:workout", categories: ["workout"] },
  cycle: { scope: "read:cycles", categories: ["readiness", "heart"] },
} as const satisfies Record<string, Gate>;

const GARMIN_GATES: Record<GarminKind, readonly HealthCategory[]> = {
  dailies: ["activity", "heart", "stress", "readiness"],
  sleeps: ["sleep", "breathing"],
  activities: ["workout"],
  hrv: ["heart"],
  respiration: ["breathing"],
  skinTemp: ["temperature"],
  stressDetails: ["readiness", "stress"],
  userMetrics: ["heart"],
  deregistrations: [],
  userPermissionsChange: [],
};

const POLAR_GATES: Record<string, readonly HealthCategory[]> = {
  EXERCISE: ["workout"],
  SLEEP: ["sleep", "readiness", "heart", "breathing"],
  ACTIVITY_SUMMARY: ["activity"],
};

/** Pode buscar? Categoria consentida E (Oura/WHOOP) escopo concedido. */
export function gateOpen(conn: Pick<ConnectionCtx, "provider" | "categories" | "scopes">, gate: Gate): boolean {
  if (gate.scope && (conn.provider === "oura" || conn.provider === "whoop") && !conn.scopes.includes(gate.scope)) return false;
  return gate.categories.some((c) => conn.categories.includes(c));
}

/** Renovação recusada (400/401) = a pessoa desautorizou na marca: token_expired (30 dias, Q11). */
async function refreshOrExpire(conn: ConnectionCtx, refreshToken: string | null): Promise<string> {
  if (!refreshToken) {
    await setConnectionStatus(conn.id, "token_expired", "provider_unauthorized");
    throw new ProviderError("token_expired");
  }
  try {
    const next = await refreshTokens(conn.provider, refreshToken);
    await storeCredentials({ connectionId: conn.id, accessToken: next.accessToken, refreshToken: next.refreshToken, expiresAt: next.expiresAt, activate: false });
    return next.accessToken;
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 400 || error.status === 401)) await setConnectionStatus(conn.id, "token_expired", "token_refresh_failed");
    throw error;
  }
}

/**
 * Busca na marca com o token da pessoa (renova quando falta < 1 min). 401/403 numa busca NÃO
 * rebaixa a conexão: renova uma vez; se a renovação for recusada, a pessoa desautorizou
 * (token_expired); se renovar e a marca ainda recusar, é recurso fora do escopo (a conexão segue).
 */
class ProviderApi {
  private token: string | null = null;
  private refreshed = false;
  constructor(private readonly conn: ConnectionCtx) {}

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;
    const cred = await credentialsFor(this.conn.id);
    if (!cred) throw new ProviderError("credentials_missing");
    this.token = cred.expiresAt && cred.expiresAt.getTime() - Date.now() < 60_000 ? await this.refresh(cred.refreshToken) : cred.accessToken;
    return this.token;
  }

  private async refresh(refreshToken: string | null): Promise<string> {
    this.refreshed = true;
    this.token = await refreshOrExpire(this.conn, refreshToken);
    return this.token;
  }

  async get(url: string): Promise<unknown> {
    const token = await this.accessToken();
    try {
      return await fetchJson(this.conn.provider, url, token);
    } catch (error) {
      if (!(error instanceof ProviderError && error.code === "provider_unauthorized")) throw error;
      if (this.refreshed) throw new ProviderError("provider_forbidden", error.status);
      const cred = await credentialsFor(this.conn.id);
      const fresh = await this.refresh(cred?.refreshToken ?? null);
      try {
        return await fetchJson(this.conn.provider, url, fresh);
      } catch (retry) {
        if (retry instanceof ProviderError && retry.code === "provider_unauthorized") throw new ProviderError("provider_forbidden", retry.status);
        throw retry;
      }
    }
  }
}

const records = (list: unknown): Record<string, unknown>[] => {
  const r = list && typeof list === "object" ? (list as Record<string, unknown>).records : null;
  return Array.isArray(r) ? (r.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * Recovery da WHOOP (o id é o do sono). O sono só é lido com read:sleep; sem ele, o recovery vem
 * da lista. Com read:cycles, o ciclo atual (Strain até agora) e o anterior, já fechado (Strain
 * final do dia anterior: a WHOOP não avisa por webhook quando um ciclo muda).
 */
async function whoopRecovery(api: ProviderApi, conn: ConnectionCtx, sleepId: string, known?: Record<string, unknown>): Promise<NormalizedBatch> {
  const ctx = { tzFallback: TZ_FALLBACK };
  const has = (scope: string) => conn.scopes.includes(scope);
  const sleep = has("read:sleep") ? ((await api.get(`${WHOOP_API}/activity/sleep/${encodeURIComponent(sleepId)}`)) as Record<string, unknown> | null) : null;
  let recovery = known ?? null;
  if (!recovery && (!sleep || sleep.cycle_id === undefined)) {
    recovery = records(await api.get(`${WHOOP_API}/recovery?limit=10`)).find((r) => String(r.sleep_id) === sleepId) ?? null;
  }
  const cycleId = sleep?.cycle_id ?? recovery?.cycle_id;
  if ((typeof cycleId !== "number" && typeof cycleId !== "string") || !SAFE_ID.test(String(cycleId))) return emptyBatch("whoop", 1);
  const cid = encodeURIComponent(String(cycleId));
  const [cycle, rec] = await Promise.all([
    gateOpen(conn, WHOOP_GATES.cycle) ? api.get(`${WHOOP_API}/cycle/${cid}`) : Promise.resolve(null),
    recovery ? Promise.resolve(recovery) : api.get(`${WHOOP_API}/cycle/${cid}/recovery`),
  ]);
  const batch = normalizeWhoop("recovery", { recovery: rec, sleep: sleep ?? undefined, cycle: cycle ?? undefined }, ctx);
  if (sleep && gateOpen(conn, WHOOP_GATES.sleep)) merge(batch, normalizeWhoop("sleep", sleep, ctx));
  const start = cycle && typeof cycle === "object" ? (cycle as Record<string, unknown>).start : null;
  if (typeof start === "string" && !Number.isNaN(Date.parse(start))) {
    // [NC] `end` devolve os ciclos que cruzam o instante ou terminaram antes; +1 s inclui o que termina no início deste
    const end = new Date(Date.parse(start) + 1000).toISOString();
    const prev = records(await api.get(`${WHOOP_API}/cycle?limit=3&end=${encodeURIComponent(end)}`)).find((c) => String(c.id) !== String(cycleId) && typeof c.end === "string");
    if (prev) merge(batch, normalizeWhoopCycle(prev, ctx));
  }
  return batch;
}

/** Data local (YYYY-MM-DD) com deslocamento de dias, no fuso de reserva. */
function ymdIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ_FALLBACK, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Carga inicial (logo depois de conectar): os webhooks só avisam do que muda dali em diante, então
 * a noite de hoje e o recovery já pontuado nunca chegariam. Oura: ontem e hoje; WHOOP: o recovery
 * mais recente. Garmin e Polar não liberam dado anterior à conexão (o Hoje explica).
 */
async function initialBatch(api: ProviderApi, conn: ConnectionCtx): Promise<NormalizedBatch | null> {
  const ctx = { tzFallback: TZ_FALLBACK };
  if (conn.provider === "oura") {
    const batch = emptyBatch("oura", 1);
    const range = `start_date=${ymdIn(-1)}&end_date=${ymdIn(1)}`;
    for (const kind of ["daily_readiness", "daily_sleep", "sleep", "daily_activity", "daily_spo2", "daily_stress"] as const) {
      if (!gateOpen(conn, OURA_GATES[kind])) continue;
      const list = (await api.get(`${OURA_API}/${kind}?${range}`)) as Record<string, unknown> | null;
      const data = Array.isArray(list?.data) ? (list.data as unknown[]).slice(0, 10) : [];
      for (const doc of data) merge(batch, normalizeOura(kind, doc, ctx));
    }
    return batch;
  }
  if (conn.provider === "whoop") {
    if (gateOpen(conn, WHOOP_GATES.recovery)) {
      const latest = records(await api.get(`${WHOOP_API}/recovery?limit=1`))[0];
      const sleepId = latest ? String(latest.sleep_id ?? "") : "";
      return latest && SAFE_ID.test(sleepId) ? whoopRecovery(api, conn, sleepId, latest) : emptyBatch("whoop", 1);
    }
    if (gateOpen(conn, WHOOP_GATES.sleep)) {
      const latest = records(await api.get(`${WHOOP_API}/activity/sleep?limit=1`))[0];
      return latest ? normalizeWhoop("sleep", latest, ctx) : emptyBatch("whoop", 1);
    }
  }
  return null;
}

/** Lote do evento; null = nada a buscar (tipo não consentido/sem escopo): o evento fecha sem gravar. */
async function buildBatch(conn: ConnectionCtx, kind: string, payload: Record<string, unknown>): Promise<NormalizedBatch | null> {
  const ctx = { tzFallback: TZ_FALLBACK };
  const api = new ProviderApi(conn);
  if (kind === "initial") return initialBatch(api, conn);
  switch (conn.provider) {
    case "garmin": {
      if (!isGarminKind(kind)) return null;
      if (kind === "deregistrations") {
        // a pessoa desautorizou na Garmin: ingestão para; 30 dias para reconectar ou apagar (Q11)
        await setConnectionStatus(conn.id, "revoked_by_provider", "revoked_by_provider");
        return null;
      }
      const callbackURL = typeof payload.callbackURL === "string" ? payload.callbackURL : null;
      if (!callbackURL) return normalizeGarmin(kind, payload);
      if (!gateOpen(conn, { scope: null, categories: GARMIN_GATES[kind] })) return null;
      // ping: só busca em https://apis.garmin.com/wellness-api/rest/… (anti-SSRF com o nosso token)
      if (!isAllowedProviderUrl(callbackURL, PROVIDERS.garmin.apiHosts, "/wellness-api/rest/")) throw new ProviderError("ssrf_blocked");
      const list = await api.get(callbackURL);
      const batch = emptyBatch("garmin", 1);
      for (const item of Array.isArray(list) ? list.slice(0, 500) : []) merge(batch, normalizeGarmin(kind, pickAllowed(item, GARMIN_ALLOWED[kind])));
      return batch;
    }
    case "oura": {
      const k = String(payload.kind ?? kind);
      const objectId = String(payload.objectId ?? "");
      if (!isOuraKind(k) || !SAFE_ID.test(objectId)) return null;
      if (payload.eventType === "delete") return normalizeOura(k, { id: objectId }, ctx, true);
      if (!gateOpen(conn, OURA_GATES[k])) return null;
      return normalizeOura(k, await api.get(`${OURA_API}/${k}/${encodeURIComponent(objectId)}`), ctx);
    }
    case "whoop": {
      const k = String(payload.kind ?? kind) as WhoopKind;
      const objectId = String(payload.objectId ?? "");
      if (!SAFE_ID.test(objectId) || !["recovery", "sleep", "workout"].includes(k)) return null;
      if (payload.deleted === true) return normalizeWhoop(k, null, ctx, true, objectId);
      if (!gateOpen(conn, WHOOP_GATES[k])) return null;
      if (k === "sleep") return normalizeWhoop("sleep", await api.get(`${WHOOP_API}/activity/sleep/${encodeURIComponent(objectId)}`), ctx);
      if (k === "recovery") return whoopRecovery(api, conn, objectId);
      const batch = normalizeWhoop("workout", await api.get(`${WHOOP_API}/activity/workout/${encodeURIComponent(objectId)}`), ctx);
      // treino muda o Strain do dia: relê o ciclo atual (sem webhook de ciclo na WHOOP)
      if (gateOpen(conn, WHOOP_GATES.cycle)) {
        const current = records(await api.get(`${WHOOP_API}/cycle?limit=1`))[0];
        if (current) merge(batch, normalizeWhoopCycle(current, ctx));
      }
      return batch;
    }
    case "polar": {
      const event = String(payload.event ?? "");
      if (!POLAR_GATES[event] || !gateOpen(conn, { scope: null, categories: POLAR_GATES[event] })) return null;
      const base = "https://www.polaraccesslink.com/v3";
      if (event === "EXERCISE") {
        const id = String(payload.entityId ?? "");
        if (!SAFE_ID.test(id)) return null;
        return normalizePolar("exercise", await api.get(`${base}/exercises/${encodeURIComponent(id)}?zones=true`));
      }
      const date = String(payload.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      if (event === "SLEEP") {
        const batch = normalizePolar("sleep", await api.get(`${base}/users/sleep/${date}`));
        try {
          merge(batch, normalizePolar("nightly_recharge", await api.get(`${base}/users/nightly-recharge/${date}`)));
        } catch (error) {
          // Nightly Recharge pode ainda não existir para a noite (404): fica só o sono
          if (!(error instanceof ProviderError && error.status === 404)) throw error;
        }
        return batch;
      }
      return normalizePolar("activity", await api.get(`${base}/users/activities/${date}`));
    }
  }
}

/** Processa um evento do inbox. Nunca registra payload nem valor: só id, marca, status e código. */
export async function processEvent(eventId: string): Promise<string> {
  const ev = await claimEvent(eventId);
  if (!ev) return "skipped";
  const conn = await connectionCtx(ev.connection_id);
  if (!conn) return "gone";
  try {
    if (conn.status !== "active" && !(conn.provider === "garmin" && ev.kind === "deregistrations")) {
      await finishEvent(ev.event_id, false, "connection_inactive");
      return "inactive";
    }
    const payload = (ev.payload && typeof ev.payload === "object" ? ev.payload : {}) as Record<string, unknown>;
    const raw = await buildBatch(conn, ev.kind, payload);
    if (!raw) {
      // nada a buscar (não consentido, sem escopo, tipo sem dado): fecha sem tocar na conexão
      await finishEvent(ev.event_id, true, null);
      return "ok";
    }
    const { batch, dropped } = validateBatch(raw, conn.categories);
    const result = await applyBatch(conn.id, batch);
    await finishEvent(ev.event_id, result.status === "ok" || result.status === "inactive", result.status === "ok" ? null : result.status);
    console.log("[wearables] evento", JSON.stringify({ id: ev.event_id, provider: conn.provider, status: result.status, dropped: dropped.length }));
    return result.status;
  } catch (error) {
    // a conexão só cai para token_expired quando a RENOVAÇÃO é recusada (ProviderApi), nunca por um recurso
    const code = error instanceof ProviderError ? error.code : "processing_error";
    await finishEvent(ev.event_id, false, code).catch(() => {});
    console.warn("[wearables] falha", JSON.stringify({ id: ev.event_id, provider: conn.provider, code }));
    return "failed";
  }
}

export async function processEvents(ids: readonly string[]): Promise<void> {
  for (const id of ids) await processEvent(id);
}

const unauthorized = (e: unknown) => e instanceof ProviderError && e.code === "provider_unauthorized";

/**
 * Revoga uma autorização na marca. O token de acesso dura pouco e só é renovado quando chega um
 * evento: um 401 com ele NÃO prova que a autorização acabou (o refresh token pode seguir válido).
 * Renova e revoga com o token novo; só conta como concluída sem revogar quando a própria
 * renovação é recusada (grant já inexistente) ou não há refresh token (Polar: token sem validade).
 */
export async function revokeOne(r: PendingRevocation): Promise<"revoked" | "already_gone"> {
  if (r.accessToken) {
    try {
      await revokeAtProvider(r.provider, r.accessToken, r.providerUserId);
      return "revoked";
    } catch (error) {
      if (!unauthorized(error)) throw error;
    }
  }
  if (!r.refreshToken) {
    if (!r.accessToken) throw new ProviderError("token_unavailable");
    return "already_gone";
  }
  let next;
  try {
    next = await refreshTokens(r.provider, r.refreshToken);
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 400 || error.status === 401)) return "already_gone";
    throw error;
  }
  // a marca pode girar o refresh token: guarda o novo antes, para a próxima tentativa
  await storeRevocationTokens(r.id, r.connectionRef, next.accessToken, next.refreshToken ?? r.refreshToken);
  try {
    await revokeAtProvider(r.provider, next.accessToken, r.providerUserId);
  } catch (error) {
    if (unauthorized(error)) throw new ProviderError("revocation_unauthorized", error instanceof ProviderError ? error.status : 0);
    throw error;
  }
  return "revoked";
}

/** Tenta as revogações na marca (na hora, depois de desconectar; e no tique, até 7 dias). */
export async function attemptRevocations(connectionRefs?: string[], limit = 25): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const r of await dueRevocations(limit, connectionRefs)) {
    try {
      await revokeOne(r);
      await finishRevocation(r.id, true, null);
      done += 1;
    } catch (error) {
      // conta na marca já inexistente (404): nada a revogar
      if (error instanceof ProviderError && error.code === "provider_not_found") {
        await finishRevocation(r.id, true, null);
        done += 1;
      } else {
        await finishRevocation(r.id, false, error instanceof ProviderError ? error.code : "revocation_error");
        failed += 1;
      }
    }
  }
  return { done, failed };
}

/** Tique de wearables: novas tentativas do inbox e da fila de revogações. */
export async function tick(): Promise<Record<string, number>> {
  const ids = await dueEvents(50);
  let ok = 0;
  for (const id of ids) if ((await processEvent(id)) === "ok") ok += 1;
  const revocations = await attemptRevocations(undefined, 50);
  return { events_seen: ids.length, events_ok: ok, revocations_done: revocations.done, revocations_failed: revocations.failed };
}
