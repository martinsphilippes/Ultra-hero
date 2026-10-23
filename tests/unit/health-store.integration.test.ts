import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { garminPush } from "../fixtures/wearables/garmin";

// Integração do store.ts REAL com o banco local, como o papel health_ingest (o mesmo caminho da
// produção, só que com o papel assumido na conexão). Só roda com HEALTH_DB_TEST_URL apontando para
// um banco local com as migrações (ex.: postgresql://postgres:postgres@127.0.0.1:5432/uh_relogio_local);
// sem a variável, pula. Nunca aponta para o remoto.
vi.mock("server-only", () => ({}));

const ADMIN_URL = process.env.HEALTH_DB_TEST_URL;
const UID = "10000000-0000-4000-8000-0000000000ab";

describe.skipIf(!ADMIN_URL)("store.ts contra o banco local (health_ingest)", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.HEALTH_INGEST_DATABASE_URL = `${ADMIN_URL}?options=-c%20role%3Dhealth_ingest`;
    process.env.WEARABLE_TOKEN_KEY_V1 = randomBytes(32).toString("base64");
    admin = postgres(ADMIN_URL!, { prepare: false, onnotice: () => {} });
    await admin`delete from auth.users where id = ${UID}`;
    await admin`insert into auth.users (id, email) values (${UID}, 'store-it@test.local')`;
    // login recente (amr com o horário do login): o banco exige ≤ 5 min para conceder
    const claims = { sub: UID, role: "authenticated", amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 30 }] };
    await admin.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.health_consent_grant('2026-10-draft-1', 'pt-BR', array['sleep','heart','activity','readiness'], true)`;
    });
  });

  afterAll(async () => {
    if (!admin) return;
    await admin`delete from auth.users where id = ${UID}`;
    await admin`delete from health.consents where user_id is null and subject_ref = health.subject_ref_of(${UID}::uuid)`;
    await admin`delete from health.pending_revocations where provider_user_id = 'garmin-user-1'`;
    await admin.end();
    const { healthDb } = await import("@/lib/health/db");
    await healthDb().end();
  });

  it("conecta, cifra, recebe (idempotente), grava como health_ingest e desconecta com revogação na fila", async () => {
    const store = await import("@/lib/health/store");
    const { normalizeGarmin, splitGarminBody } = await import("@/lib/health/adapters/garmin");
    const { validateBatch } = await import("@/lib/health/normalize");
    const { healthDb } = await import("@/lib/health/db");

    expect((await healthDb()`select current_user as u`)[0].u).toBe("health_ingest");
    const conn = await store.openConnection({ userId: UID, provider: "garmin", providerUserId: "garmin-user-1", scopes: [], deviceName: null });
    await store.storeCredentials({ connectionId: conn, accessToken: "acc-123", refreshToken: "ref-456", expiresAt: new Date(Date.now() + 3600_000), activate: true });
    expect(await store.credentialsFor(conn)).toMatchObject({ accessToken: "acc-123", refreshToken: "ref-456" });
    // o token não fica em claro no banco
    const raw = await admin`select encode(access_token_enc, 'escape') as t from health.credentials where connection_id = ${conn}::uuid`;
    expect(String(raw[0].t)).not.toContain("acc-123");

    const ctx = await store.connectionCtx(conn);
    expect(ctx).toMatchObject({ status: "active", categories: ["readiness", "sleep", "heart", "activity"] });
    const [daily] = splitGarminBody(garminPush);
    const first = await store.receiveEvent({ provider: "garmin", providerUserId: daily.providerUserId, kind: daily.kind, eventId: daily.eventId, payload: daily.payload });
    const again = await store.receiveEvent({ provider: "garmin", providerUserId: daily.providerUserId, kind: daily.kind, eventId: daily.eventId, payload: daily.payload });
    expect(first.status).toBe("received");
    expect(again.status).toBe("duplicate");

    const claimed = await store.claimEvent(first.event_id!);
    const { batch, dropped } = validateBatch(normalizeGarmin("dailies", claimed!.payload), ctx!.categories);
    expect(dropped.every((d) => d === "category_not_consented:stress")).toBe(true);
    const applied = await store.applyBatch(conn, batch);
    expect(applied).toMatchObject({ status: "ok", daily: batch.daily.length });
    await store.finishEvent(first.event_id!, true, null);
    const stored = await admin`select metric_code, value from health.daily_metrics where connection_id = ${conn}::uuid and metric_code = 'steps'`;
    expect(Number(stored[0].value)).toBe(6234);
    expect(await admin`select 1 from health.daily_metrics where connection_id = ${conn}::uuid and metric_code like 'stress%'`).toHaveLength(0);

    await admin.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: UID, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.wearable_disconnect(${conn}::uuid)`;
    });
    const due = await store.dueRevocations(10, [conn]);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ provider: "garmin", providerUserId: "garmin-user-1", accessToken: "acc-123" });
    await store.finishRevocation(due[0].id, true, null);
    expect(await store.dueRevocations(10, [conn])).toHaveLength(0);
  });
});
