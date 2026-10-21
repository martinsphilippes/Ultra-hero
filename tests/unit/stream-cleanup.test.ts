import { beforeEach, describe, expect, it } from "vitest";
import { STREAM_CLEANUP_LIMIT, cleanupStreamUploads, type StreamCleanupProvider } from "@/app/api/cron/_lib/stream-cleanup";
import { CloudflareStreamError, type VideoStatus } from "@/lib/video/providers/cloudflare-stream";

// Limpeza diária dos envios do composer, com service role e Cloudflare simulados: apaga vídeo de
// envio descartado, remove rascunho nunca publicado cujo vídeo ficou incompleto/com erro/sumiu, e
// nunca toca publicado, conteúdo que já esteve no ar nem vídeo bom.

const NOW = new Date("2026-10-22T03:00:00Z");
const uid = (n: number) => n.toString(16).padStart(32, "0");

type Row = {
  uid: string;
  content_id: string | null;
  expires_at: string;
  discarded_at: string | null;
  provider_deleted_at: string | null;
};
type Content = { id: string; status: string; published_at: string | null };

let uploads: Row[];
let contents: Content[];
let audits: Record<string, unknown>[];
let statuses: Record<string, VideoStatus | Error>;
let deleted: string[];
let deleteFails: Set<string>;
let queries: { table: string; filters: string[] }[];

function adminMock() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "audit_log") audits.push(args);
      return { data: null, error: null };
    },
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let op: "select" | "update" | "delete" = "select";
      let payload: Record<string, unknown> = {};
      let limit = Infinity;
      const matches = (row: Record<string, unknown>) =>
        filters.every(([col, kind, value]) => {
          const v = row[col];
          if (kind === "eq") return v === value;
          if (kind === "is") return v === value;
          if (kind === "notnull") return v !== null;
          if (kind === "lt") return String(v) < String(value);
          return true;
        });
      const run = () => {
        queries.push({ table, filters: filters.map(([c, k]) => `${c}:${k}`) });
        if (table === "stream_uploads") {
          const rows = uploads.filter((r) => matches(r as unknown as Record<string, unknown>));
          if (op === "update") rows.forEach((r) => Object.assign(r, payload));
          const data = rows.slice(0, limit).map((r) => ({ ...r, content: contents.find((c) => c.id === r.content_id) ?? null }));
          return { data, error: null };
        }
        if (table === "content" && op === "delete") {
          const before = contents.length;
          contents = contents.filter((c) => !matches(c as unknown as Record<string, unknown>));
          // FK on delete set null
          if (contents.length !== before) uploads.forEach((u) => (u.content_id = contents.some((c) => c.id === u.content_id) ? u.content_id : null));
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };
      const chain = {
        select: () => chain,
        update(p: Record<string, unknown>) {
          op = "update";
          payload = p;
          return chain;
        },
        delete() {
          op = "delete";
          return chain;
        },
        eq(col: string, value: unknown) {
          filters.push([col, "eq", value]);
          return chain;
        },
        is(col: string, value: unknown) {
          filters.push([col, "is", value]);
          return chain;
        },
        not(col: string) {
          filters.push([col, "notnull", null]);
          return chain;
        },
        lt(col: string, value: unknown) {
          filters.push([col, "lt", value]);
          return chain;
        },
        order: () => chain,
        limit(n: number) {
          limit = n;
          return chain;
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return chain;
    },
  };
}

const provider: StreamCleanupProvider = {
  async getVideoStatus(id: string) {
    const s = statuses[id];
    if (s instanceof Error) throw s;
    return s ?? { state: "ready", durationSec: 30, creatorId: "c", reason: null };
  },
  async deleteVideo(id: string) {
    if (deleteFails.has(id)) throw new CloudflareStreamError(500, "internal");
    deleted.push(id);
  },
};

function cleanup() {
  return cleanupStreamUploads(adminMock() as never, provider, NOW);
}

const old = "2026-10-22T01:00:00Z"; // venceu há 2 h
const fresh = "2026-10-22T02:30:00Z"; // venceu há 30 min: ainda na folga de 1 h

beforeEach(() => {
  uploads = [];
  contents = [];
  audits = [];
  statuses = {};
  deleted = [];
  deleteFails = new Set();
  queries = [];
});

describe("cleanupStreamUploads", () => {
  it("(a) envio descartado sem provider_deleted_at: apaga no Cloudflare e marca", async () => {
    uploads.push({ uid: uid(1), content_id: null, expires_at: fresh, discarded_at: "2026-10-21T20:00:00Z", provider_deleted_at: null });
    uploads.push({ uid: uid(2), content_id: null, expires_at: old, discarded_at: "2026-10-21T20:00:00Z", provider_deleted_at: "2026-10-21T20:00:01Z" });
    const result = await cleanup();
    expect(deleted).toEqual([uid(1)]);
    expect(uploads[0].provider_deleted_at).toBe(NOW.toISOString());
    expect(result).toMatchObject({ stream_videos_deleted: 1, stream_errors: 0 });
  });

  it("(a) falha do Cloudflare não marca (tenta amanhã) e conta erro", async () => {
    uploads.push({ uid: uid(1), content_id: null, expires_at: old, discarded_at: "2026-10-21T20:00:00Z", provider_deleted_at: null });
    deleteFails.add(uid(1));
    const result = await cleanup();
    expect(uploads[0].provider_deleted_at).toBeNull();
    expect(result).toMatchObject({ stream_videos_deleted: 0, stream_errors: 1 });
  });

  it("(b) vencido com rascunho nunca publicado e vídeo incompleto: apaga rascunho e vídeo, marca e audita", async () => {
    contents.push({ id: "c1", status: "draft", published_at: null });
    uploads.push({ uid: uid(3), content_id: "c1", expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(3)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    const result = await cleanup();
    expect(contents).toHaveLength(0);
    expect(deleted).toEqual([uid(3)]);
    expect(uploads[0]).toMatchObject({ discarded_at: NOW.toISOString(), provider_deleted_at: NOW.toISOString(), content_id: null });
    expect(audits).toEqual([expect.objectContaining({ p_action: "content.cleanup_discard", p_resource_id: "c1", p_actor_type: "system" })]);
    expect(result).toMatchObject({ stream_drafts_removed: 1, stream_videos_deleted: 1, stream_checked: 1 });
  });

  it("(b) vídeo com erro ou que sumiu (404) também sai; 404 não chama DELETE", async () => {
    contents.push({ id: "c1", status: "draft", published_at: null }, { id: "c2", status: "draft", published_at: null });
    uploads.push({ uid: uid(4), content_id: "c1", expires_at: old, discarded_at: null, provider_deleted_at: null });
    uploads.push({ uid: uid(5), content_id: "c2", expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(4)] = { state: "errored", durationSec: null, creatorId: "c", reason: "ERR_NON_VIDEO" };
    statuses[uid(5)] = new CloudflareStreamError(404, "Not Found");
    const result = await cleanup();
    expect(contents).toHaveLength(0);
    expect(deleted).toEqual([uid(4)]);
    expect(uploads.every((u) => u.provider_deleted_at === NOW.toISOString())).toBe(true);
    expect(result).toMatchObject({ stream_drafts_removed: 2, stream_videos_deleted: 2 });
  });

  it("(b) envio que nem virou rascunho (content_id nulo) e ficou incompleto: só apaga o vídeo", async () => {
    uploads.push({ uid: uid(6), content_id: null, expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(6)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    const result = await cleanup();
    expect(deleted).toEqual([uid(6)]);
    expect(audits).toHaveLength(0);
    expect(result).toMatchObject({ stream_drafts_removed: 0, stream_videos_deleted: 1 });
  });

  it("nunca toca publicado, despublicado (já esteve no ar), vídeo bom nem envio na validade", async () => {
    contents.push(
      { id: "pub", status: "published", published_at: "2026-10-20T10:00:00Z" },
      { id: "was", status: "draft", published_at: "2026-10-20T10:00:00Z" },
      { id: "good", status: "draft", published_at: null },
      { id: "young", status: "draft", published_at: null },
    );
    uploads.push(
      { uid: uid(7), content_id: "pub", expires_at: old, discarded_at: null, provider_deleted_at: null },
      { uid: uid(8), content_id: "was", expires_at: old, discarded_at: null, provider_deleted_at: null },
      { uid: uid(9), content_id: "good", expires_at: old, discarded_at: null, provider_deleted_at: null },
      { uid: uid(10), content_id: "young", expires_at: fresh, discarded_at: null, provider_deleted_at: null },
    );
    statuses[uid(7)] = { state: "errored", durationSec: null, creatorId: "c", reason: null };
    statuses[uid(8)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    statuses[uid(9)] = { state: "ready", durationSec: 20, creatorId: "c", reason: null };
    statuses[uid(10)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    const result = await cleanup();
    expect(contents.map((c) => c.id)).toEqual(["pub", "was", "good", "young"]);
    expect(deleted).toHaveLength(0);
    expect(uploads.every((u) => u.discarded_at === null)).toBe(true);
    // só o rascunho "good" foi conferido no Cloudflare: publicado/já no ar nem chegam a consultar
    expect(result).toMatchObject({ stream_checked: 1, stream_drafts_removed: 0, stream_videos_deleted: 0 });
  });

  it("erro do Cloudflare ao consultar (fora 404) não apaga nada", async () => {
    contents.push({ id: "c1", status: "draft", published_at: null });
    uploads.push({ uid: uid(11), content_id: "c1", expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(11)] = new CloudflareStreamError(500, "internal");
    const result = await cleanup();
    expect(contents).toHaveLength(1);
    expect(result).toMatchObject({ stream_errors: 1, stream_drafts_removed: 0 });
  });

  it("no máximo 50 vídeos apagados por execução", async () => {
    for (let i = 0; i < 70; i++) uploads.push({ uid: uid(100 + i), content_id: null, expires_at: old, discarded_at: "2026-10-21T20:00:00Z", provider_deleted_at: null });
    for (let i = 0; i < 5; i++) {
      uploads.push({ uid: uid(300 + i), content_id: null, expires_at: old, discarded_at: null, provider_deleted_at: null });
      statuses[uid(300 + i)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    }
    const result = await cleanup();
    expect(deleted).toHaveLength(STREAM_CLEANUP_LIMIT);
    expect(result).toMatchObject({ stream_videos_deleted: 50, stream_checked: 0 });
  });
});
