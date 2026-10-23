import "server-only";
import { pickAllowed } from "./adapters/common";
import { GARMIN_ALLOWED, isGarminKind, normalizeGarmin, type GarminKind } from "./adapters/garmin";
import { isOuraKind, normalizeOura } from "./adapters/oura";
import { normalizePolar } from "./adapters/polar";
import { normalizeWhoop, type WhoopKind } from "./adapters/whoop";
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
  type ConnectionCtx,
} from "./store";
import { emptyBatch, type NormalizedBatch } from "./types";

// Processamento do inbox (§9.2): evento → (busca na marca) → lista permitida → normaliza →
// valida (catálogo, categoria consentida, plausibilidade) → grava (for share, upsert condicional).
// Roda depois da resposta 200 do webhook (after) e no tique /api/cron/wearables (novas tentativas).

const TZ_FALLBACK = "America/Sao_Paulo";

function merge(into: NormalizedBatch, from: NormalizedBatch): NormalizedBatch {
  into.daily.push(...from.daily);
  into.sleep.push(...from.sleep);
  into.workouts.push(...from.workouts);
  into.deletions.push(...from.deletions);
  if (from.device) into.device = from.device;
  return into;
}

/** Token válido (renova quando falta < 1 min). Falha na renovação → token_expired. */
async function accessTokenFor(conn: ConnectionCtx): Promise<string> {
  const cred = await credentialsFor(conn.id);
  if (!cred) throw new ProviderError("credentials_missing");
  if (cred.expiresAt && cred.expiresAt.getTime() - Date.now() < 60_000) {
    if (!cred.refreshToken) {
      await setConnectionStatus(conn.id, "token_expired", "token_expired");
      throw new ProviderError("token_expired");
    }
    try {
      const next = await refreshTokens(conn.provider, cred.refreshToken);
      await storeCredentials({ connectionId: conn.id, accessToken: next.accessToken, refreshToken: next.refreshToken, expiresAt: next.expiresAt, activate: false });
      return next.accessToken;
    } catch (error) {
      if (error instanceof ProviderError && (error.status === 400 || error.status === 401)) await setConnectionStatus(conn.id, "token_expired", "token_refresh_failed");
      throw error;
    }
  }
  return cred.accessToken;
}

async function buildBatch(conn: ConnectionCtx, kind: string, payload: Record<string, unknown>): Promise<NormalizedBatch> {
  const ctx = { tzFallback: TZ_FALLBACK };
  switch (conn.provider) {
    case "garmin": {
      if (!isGarminKind(kind)) return emptyBatch("garmin", 1);
      if (kind === "deregistrations") {
        // a pessoa desautorizou na Garmin: ingestão para; 30 dias para reconectar ou apagar (Q11)
        await setConnectionStatus(conn.id, "revoked_by_provider", "revoked_by_provider");
        return emptyBatch("garmin", 1);
      }
      const callbackURL = typeof payload.callbackURL === "string" ? payload.callbackURL : null;
      if (!callbackURL) return normalizeGarmin(kind, payload);
      // ping: só busca em https://apis.garmin.com/wellness-api/rest/… (anti-SSRF com o nosso token)
      if (!isAllowedProviderUrl(callbackURL, PROVIDERS.garmin.apiHosts, "/wellness-api/rest/")) throw new ProviderError("ssrf_blocked");
      const list = await fetchJson("garmin", callbackURL, await accessTokenFor(conn));
      const batch = emptyBatch("garmin", 1);
      for (const item of Array.isArray(list) ? list.slice(0, 500) : []) merge(batch, normalizeGarmin(kind as GarminKind, pickAllowed(item, GARMIN_ALLOWED[kind as GarminKind])));
      return batch;
    }
    case "oura": {
      const k = String(payload.kind ?? kind);
      const objectId = String(payload.objectId ?? "");
      if (!isOuraKind(k) || !/^[A-Za-z0-9_-]{1,200}$/.test(objectId)) return emptyBatch("oura", 1);
      if (payload.eventType === "delete") return normalizeOura(k, { id: objectId }, ctx, true);
      const doc = await fetchJson("oura", `https://api.ouraring.com/v2/usercollection/${k}/${encodeURIComponent(objectId)}`, await accessTokenFor(conn));
      return normalizeOura(k, doc, ctx);
    }
    case "whoop": {
      const k = String(payload.kind ?? kind) as WhoopKind;
      const objectId = String(payload.objectId ?? "");
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(objectId) || !["recovery", "sleep", "workout"].includes(k)) return emptyBatch("whoop", 1);
      if (payload.deleted === true) return normalizeWhoop(k, null, ctx, true, objectId);
      const token = await accessTokenFor(conn);
      const base = "https://api.prod.whoop.com/developer/v2";
      if (k === "workout") return normalizeWhoop("workout", await fetchJson("whoop", `${base}/activity/workout/${encodeURIComponent(objectId)}`, token), ctx);
      const sleep = await fetchJson("whoop", `${base}/activity/sleep/${encodeURIComponent(objectId)}`, token);
      if (k === "sleep") return normalizeWhoop("sleep", sleep, ctx);
      // recovery.updated traz o id do sono: recovery e strain vêm do ciclo desse sono
      const cycleId = sleep && typeof sleep === "object" ? (sleep as Record<string, unknown>).cycle_id : undefined;
      if (typeof cycleId !== "number" && typeof cycleId !== "string") return emptyBatch("whoop", 1);
      const [cycle, recovery] = await Promise.all([
        fetchJson("whoop", `${base}/cycle/${encodeURIComponent(String(cycleId))}`, token),
        fetchJson("whoop", `${base}/cycle/${encodeURIComponent(String(cycleId))}/recovery`, token),
      ]);
      return merge(normalizeWhoop("recovery", { recovery, sleep, cycle }, ctx), normalizeWhoop("sleep", sleep, ctx));
    }
    case "polar": {
      const event = String(payload.event ?? "");
      const token = await accessTokenFor(conn);
      const base = "https://www.polaraccesslink.com/v3";
      if (event === "EXERCISE") {
        const id = String(payload.entityId ?? "");
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return emptyBatch("polar", 1);
        return normalizePolar("exercise", await fetchJson("polar", `${base}/exercises/${encodeURIComponent(id)}?zones=true`, token));
      }
      const date = String(payload.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return emptyBatch("polar", 1);
      if (event === "SLEEP") {
        const batch = normalizePolar("sleep", await fetchJson("polar", `${base}/users/sleep/${date}`, token));
        try {
          merge(batch, normalizePolar("nightly_recharge", await fetchJson("polar", `${base}/users/nightly-recharge/${date}`, token)));
        } catch (error) {
          // Nightly Recharge pode ainda não existir para a noite (404): fica só o sono
          if (!(error instanceof ProviderError && error.status === 404)) throw error;
        }
        return batch;
      }
      if (event === "ACTIVITY_SUMMARY") return normalizePolar("activity", await fetchJson("polar", `${base}/users/activities/${date}`, token));
      return emptyBatch("polar", 1);
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
    const { batch, dropped } = validateBatch(raw, conn.categories);
    const result = await applyBatch(conn.id, batch);
    await finishEvent(ev.event_id, result.status === "ok" || result.status === "inactive", result.status === "ok" ? null : result.status);
    console.log("[wearables] evento", JSON.stringify({ id: ev.event_id, provider: conn.provider, status: result.status, dropped: dropped.length }));
    return result.status;
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "processing_error";
    if (error instanceof ProviderError && error.code === "provider_unauthorized") await setConnectionStatus(conn.id, "token_expired", "provider_unauthorized").catch(() => {});
    await finishEvent(ev.event_id, false, code).catch(() => {});
    console.warn("[wearables] falha", JSON.stringify({ id: ev.event_id, provider: conn.provider, code }));
    return "failed";
  }
}

export async function processEvents(ids: readonly string[]): Promise<void> {
  for (const id of ids) await processEvent(id);
}

/** Tenta as revogações na marca (na hora, depois de desconectar; e no tique, até 7 dias). */
export async function attemptRevocations(connectionRefs?: string[], limit = 25): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const r of await dueRevocations(limit, connectionRefs)) {
    try {
      if (!r.accessToken) throw new ProviderError("token_unavailable");
      await revokeAtProvider(r.provider, r.accessToken, r.providerUserId);
      await finishRevocation(r.id, true, null);
      done += 1;
    } catch (error) {
      // token já inválido na marca = acesso já revogado: conta como concluída
      if (error instanceof ProviderError && (error.code === "provider_unauthorized" || error.code === "provider_not_found")) {
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
