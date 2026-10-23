import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/health/provider-api";
import type { ConnectionCtx, PendingRevocation } from "@/lib/health/store";
import type { HealthCategory } from "@/lib/health/types";
import { whoopCycle, whoopPrevCycle, whoopRecovery, whoopSleep, whoopWorkout } from "../fixtures/wearables/whoop";

// Pipeline (§9.2) com banco e marca substituídos: o que é buscado na marca (escopo e categoria),
// quando a conexão cai para token_expired e quando a revogação na marca é dada como concluída.

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({
  claimEvent: vi.fn(),
  connectionCtx: vi.fn(),
  credentialsFor: vi.fn(),
  setConnectionStatus: vi.fn(),
  storeCredentials: vi.fn(),
  finishEvent: vi.fn(),
  applyBatch: vi.fn(),
  dueEvents: vi.fn(),
  dueRevocations: vi.fn(),
  finishRevocation: vi.fn(),
  storeRevocationTokens: vi.fn(),
}));
vi.mock("@/lib/health/store", () => store);

const api = vi.hoisted(() => ({ fetchJson: vi.fn(), refreshTokens: vi.fn(), revokeAtProvider: vi.fn() }));
vi.mock("@/lib/health/provider-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/health/provider-api")>()), ...api }));

const { attemptRevocations, processEvent } = await import("@/lib/health/pipeline");

const unauthorized = () => new ProviderError("provider_unauthorized", 401);

function connection(provider: ConnectionCtx["provider"], categories: HealthCategory[], scopes: string[]): ConnectionCtx {
  return { id: "c1", userId: "u1", provider, providerUserId: "p1", status: "active", categories, scopes };
}

function event(kind: string, payload: Record<string, unknown>) {
  store.claimEvent.mockResolvedValue({ event_id: "e1", connection_id: "c1", provider: "x", kind, provider_event_id: null, payload, attempts: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.credentialsFor.mockResolvedValue({ accessToken: "acc", refreshToken: "ref", expiresAt: new Date(Date.now() + 3600_000) });
  store.applyBatch.mockResolvedValue({ status: "ok" });
  store.finishEvent.mockResolvedValue(undefined);
  store.finishRevocation.mockResolvedValue(undefined);
});

describe("busca só o que a pessoa consentiu e a marca concedeu", () => {
  it("Oura sem 'Respiração e oxigenação': daily_spo2 não é buscado e a conexão continua ativa", async () => {
    // providerScopes(oura, tudo menos breathing) = personal, daily, workout (sem spo2Daily)
    store.connectionCtx.mockResolvedValue(connection("oura", ["readiness", "sleep", "heart", "activity", "workout", "temperature", "stress"], ["personal", "daily", "workout"]));
    api.fetchJson.mockRejectedValue(unauthorized());
    event("daily_spo2", { kind: "daily_spo2", objectId: "o1", eventType: "create" });
    expect(await processEvent("e1")).toBe("ok");
    expect(api.fetchJson).not.toHaveBeenCalled();
    expect(store.setConnectionStatus).not.toHaveBeenCalled();
    expect(store.finishEvent).toHaveBeenCalledWith("e1", true, null);
  });

  it("WHOOP só com Índice do dia + Coração: recovery sem ler o sono (sem read:sleep); treino nem é buscado", async () => {
    store.connectionCtx.mockResolvedValue(connection("whoop", ["readiness", "heart"], ["offline", "read:profile", "read:recovery", "read:cycles"]));
    const urls: string[] = [];
    api.fetchJson.mockImplementation(async (_p: string, url: string) => {
      urls.push(url);
      if (url.includes("/activity/sleep")) throw unauthorized();
      if (/\/recovery\?limit/.test(url)) return { records: [whoopRecovery] };
      if (/\/cycle\/93845$/.test(url)) return whoopCycle;
      if (/\/cycle\?limit=3/.test(url)) return { records: [whoopCycle, whoopPrevCycle] };
      throw new Error(`inesperado ${url}`);
    });
    event("recovery", { kind: "recovery", objectId: whoopSleep.id, deleted: false });
    expect(await processEvent("e1")).toBe("ok");
    expect(urls.some((u) => u.includes("/activity/sleep"))).toBe(false);
    expect(store.setConnectionStatus).not.toHaveBeenCalled();
    const batch = store.applyBatch.mock.calls[0][1] as { daily: { code: string; date: string; value: number }[] };
    expect(batch.daily.find((d) => d.code === "readiness_vendor")).toMatchObject({ value: 44, date: "2026-10-22" });
    // Strain final do dia anterior (ciclo fechado) e o de hoje até agora
    expect(batch.daily.filter((d) => d.code === "day_strain").map((d) => [d.date, d.value])).toEqual([
      ["2026-10-22", 5.3],
      ["2026-10-21", 12.4],
    ]);

    vi.clearAllMocks();
    store.applyBatch.mockResolvedValue({ status: "ok" });
    event("workout", { kind: "workout", objectId: whoopWorkout.id, deleted: false });
    expect(await processEvent("e1")).toBe("ok");
    expect(api.fetchJson).not.toHaveBeenCalled();
  });

  it("WHOOP treino: relê o ciclo atual (o Strain do dia muda com o treino)", async () => {
    store.connectionCtx.mockResolvedValue(connection("whoop", ["readiness", "workout"], ["read:workout", "read:cycles", "read:recovery"]));
    api.fetchJson.mockImplementation(async (_p: string, url: string) => (url.includes("/activity/workout/") ? whoopWorkout : { records: [{ ...whoopCycle, updated_at: "2026-10-22T21:40:00.000Z", score: { ...whoopCycle.score, strain: 13.9 } }] }));
    event("workout", { kind: "workout", objectId: whoopWorkout.id, deleted: false });
    expect(await processEvent("e1")).toBe("ok");
    const batch = store.applyBatch.mock.calls[0][1] as { daily: { code: string; value: number; at?: string }[]; workouts: unknown[] };
    expect(batch.workouts).toHaveLength(1);
    expect(batch.daily.find((d) => d.code === "day_strain")).toMatchObject({ value: 13.9, at: "2026-10-22T21:40:00.000Z" });
  });

  it("401 numa busca: renova uma vez; renovada e ainda recusada = fora do escopo (conexão segue ativa)", async () => {
    store.connectionCtx.mockResolvedValue(connection("oura", ["sleep"], ["personal", "daily"]));
    api.fetchJson.mockRejectedValue(unauthorized());
    api.refreshTokens.mockResolvedValue({ accessToken: "acc2", refreshToken: "ref2", expiresAt: null, providerUserId: null });
    event("sleep", { kind: "sleep", objectId: "s1", eventType: "update" });
    expect(await processEvent("e1")).toBe("failed");
    expect(api.refreshTokens).toHaveBeenCalledTimes(1);
    expect(api.fetchJson).toHaveBeenCalledTimes(2);
    expect(store.setConnectionStatus).not.toHaveBeenCalled();
    expect(store.finishEvent).toHaveBeenCalledWith("e1", false, "provider_forbidden");
  });

  it("401 e renovação recusada (desautorizou na marca): token_expired", async () => {
    store.connectionCtx.mockResolvedValue(connection("oura", ["sleep"], ["personal", "daily"]));
    api.fetchJson.mockRejectedValue(unauthorized());
    api.refreshTokens.mockRejectedValue(new ProviderError("provider_http_400", 400));
    event("sleep", { kind: "sleep", objectId: "s1", eventType: "update" });
    expect(await processEvent("e1")).toBe("failed");
    expect(store.setConnectionStatus).toHaveBeenCalledWith("c1", "token_expired", "token_refresh_failed");
  });
});

describe("revogação na marca (§8.3)", () => {
  const pending = (extra: Partial<PendingRevocation> = {}): PendingRevocation => ({ id: "r1", connectionRef: "c1", provider: "whoop", providerUserId: "p1", accessToken: "old-acc", refreshToken: "ref", attempts: 0, ...extra });

  it("401 com o token de acesso vencido: renova e revoga com o novo antes de concluir", async () => {
    store.dueRevocations.mockResolvedValue([pending()]);
    api.revokeAtProvider.mockImplementation(async (_p: string, token: string) => {
      if (token === "old-acc") throw unauthorized();
    });
    api.refreshTokens.mockResolvedValue({ accessToken: "new-acc", refreshToken: "new-ref", expiresAt: null, providerUserId: null });
    expect(await attemptRevocations()).toEqual({ done: 1, failed: 0 });
    expect(api.refreshTokens).toHaveBeenCalledWith("whoop", "ref");
    expect(api.revokeAtProvider).toHaveBeenLastCalledWith("whoop", "new-acc", "p1");
    // refresh token girado guardado antes da revogação (para a próxima tentativa, se ela falhar)
    expect(store.storeRevocationTokens).toHaveBeenCalledWith("r1", "c1", "new-acc", "new-ref");
    expect(store.finishRevocation).toHaveBeenCalledWith("r1", true, null);
  });

  it("renovação recusada (grant já inexistente na marca): concluída sem nova revogação", async () => {
    store.dueRevocations.mockResolvedValue([pending()]);
    api.revokeAtProvider.mockRejectedValue(unauthorized());
    api.refreshTokens.mockRejectedValue(new ProviderError("provider_unauthorized", 401));
    expect(await attemptRevocations()).toEqual({ done: 1, failed: 0 });
    expect(api.revokeAtProvider).toHaveBeenCalledTimes(1);
  });

  it("renovação com falha passageira: NÃO conclui (tenta de novo pela fila)", async () => {
    store.dueRevocations.mockResolvedValue([pending()]);
    api.revokeAtProvider.mockRejectedValue(unauthorized());
    api.refreshTokens.mockRejectedValue(new ProviderError("provider_unreachable"));
    expect(await attemptRevocations()).toEqual({ done: 0, failed: 1 });
    expect(store.finishRevocation).toHaveBeenCalledWith("r1", false, "provider_unreachable");
  });

  it("revogação com o token renovado ainda recusada: falha (não dá prova falsa na auditoria)", async () => {
    store.dueRevocations.mockResolvedValue([pending()]);
    api.revokeAtProvider.mockRejectedValue(unauthorized());
    api.refreshTokens.mockResolvedValue({ accessToken: "new-acc", refreshToken: null, expiresAt: null, providerUserId: null });
    expect(await attemptRevocations()).toEqual({ done: 0, failed: 1 });
    expect(store.storeRevocationTokens).toHaveBeenCalledWith("r1", "c1", "new-acc", "ref");
  });

  it("Polar (sem refresh token, token sem validade): 401 já é autorização retirada", async () => {
    store.dueRevocations.mockResolvedValue([pending({ provider: "polar", refreshToken: null })]);
    api.revokeAtProvider.mockRejectedValue(unauthorized());
    expect(await attemptRevocations()).toEqual({ done: 1, failed: 0 });
    expect(api.refreshTokens).not.toHaveBeenCalled();
  });
});
