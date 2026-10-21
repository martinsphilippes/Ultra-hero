import { beforeEach, describe, expect, it } from "vitest";
import { STREAM_CLEANUP_LIMIT, cleanupStreamUploads, type StreamCleanupProvider } from "@/app/api/cron/_lib/stream-cleanup";
import { CloudflareStreamError, type VideoStatus } from "@/lib/video/providers/cloudflare-stream";

// Limpeza diária dos envios do composer, com service role e Cloudflare simulados: apaga vídeo de
// envio descartado, remove rascunho nunca publicado cujo vídeo ficou incompleto/com erro/sumiu, e
// nunca toca publicado, conteúdo que já esteve no ar nem vídeo bom. A fila do passo (b) vem da
// RPC stream_cleanup_candidates; o mock reproduz o SQL (testado de verdade no S24 do RLS).

const NOW = new Date("2026-10-22T03:00:00Z");
const uid = (n: number) => n.toString(16).padStart(32, "0");

type Row = {
  uid: string;
  content_id: string | null;
  expires_at: string;
  discarded_at: string | null;
  provider_deleted_at: string | null;
  checked_at?: string | null;
};
// media_ref: uid do Stream que o corpo do conteúdo usa (null = corpo sem vídeo do Stream)
type Content = { id: string; status: string; published_at: string | null; media_ref: string | null };

let uploads: Row[];
let contents: Content[];
let audits: Record<string, unknown>[];
let statuses: Record<string, VideoStatus | Error>;
let deleted: string[];
let deleteFails: Set<string>;
let queries: { table: string; filters: string[] }[];
let candidateCalls: { p_cutoff: string; p_limit: number }[];

// Espelho de stream_cleanup_candidates (0026).
function candidates(cutoff: string, limit: number) {
  const live = (c: Content) => c.status !== "draft" || c.published_at !== null;
  return uploads
    .filter((u) => u.discarded_at === null && u.provider_deleted_at === null && u.expires_at < cutoff)
    .filter((u) => !contents.some((c) => c.media_ref === u.uid && live(c)))
    .sort((a, b) => (a.checked_at ?? "").localeCompare(b.checked_at ?? "") || a.expires_at.localeCompare(b.expires_at))
    .slice(0, limit)
    .map((u) => ({
      uid: u.uid,
      draft_id: contents.find((c) => c.media_ref === u.uid && !live(c) && (u.content_id === null || c.id === u.content_id))?.id ?? null,
      referenced: contents.some((c) => c.media_ref === u.uid),
    }));
}

function adminMock() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "audit_log") audits.push(args);
      if (fn === "stream_cleanup_candidates") {
        const call = args as { p_cutoff: string; p_limit: number };
        candidateCalls.push(call);
        return { data: candidates(call.p_cutoff, call.p_limit), error: null };
      }
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
  candidateCalls = [];
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
    contents.push({ id: "c1", status: "draft", published_at: null, media_ref: uid(3) });
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
    contents.push({ id: "c1", status: "draft", published_at: null, media_ref: uid(4) }, { id: "c2", status: "draft", published_at: null, media_ref: uid(5) });
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

  it("(b) envio que nenhum corpo usa (nem virou rascunho): órfão, apaga o vídeo sem consultar o Cloudflare", async () => {
    uploads.push({ uid: uid(6), content_id: null, expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(6)] = { state: "ready", durationSec: 20, creatorId: "c", reason: null };
    const result = await cleanup();
    expect(deleted).toEqual([uid(6)]);
    expect(audits).toHaveLength(0);
    expect(result).toMatchObject({ stream_drafts_removed: 0, stream_videos_deleted: 1, stream_checked: 0 });
  });

  it("(b) rascunho que trocou o vídeo por YouTube no editor fica; só o vídeo vencido sai", async () => {
    contents.push({ id: "yt", status: "draft", published_at: null, media_ref: null });
    uploads.push({ uid: uid(12), content_id: "yt", expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(12)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    const result = await cleanup();
    expect(contents.map((c) => c.id)).toEqual(["yt"]);
    expect(deleted).toEqual([uid(12)]);
    expect(audits).toHaveLength(0);
    expect(result).toMatchObject({ stream_drafts_removed: 0, stream_videos_deleted: 1 });
  });

  it("(b) vídeo pronto é conferido e vai para o fim da fila (checked_at), sem apagar", async () => {
    contents.push({ id: "good", status: "draft", published_at: null, media_ref: uid(13) });
    uploads.push({ uid: uid(13), content_id: "good", expires_at: old, discarded_at: null, provider_deleted_at: null });
    const result = await cleanup();
    expect(uploads[0]).toMatchObject({ checked_at: NOW.toISOString(), discarded_at: null });
    expect(contents).toHaveLength(1);
    expect(result).toMatchObject({ stream_checked: 1, stream_videos_deleted: 0 });
  });

  it("(b) 100 publicados vencidos na frente não travam a fila: o envio abandonado mais novo sai", async () => {
    for (let i = 0; i < 120; i++) {
      contents.push({ id: `pub${i}`, status: "published", published_at: "2026-10-01T10:00:00Z", media_ref: uid(500 + i) });
      uploads.push({ uid: uid(500 + i), content_id: `pub${i}`, expires_at: "2026-10-01T00:00:00Z", discarded_at: null, provider_deleted_at: null });
    }
    contents.push({ id: "abandoned", status: "draft", published_at: null, media_ref: uid(14) });
    uploads.push({ uid: uid(14), content_id: "abandoned", expires_at: old, discarded_at: null, provider_deleted_at: null });
    statuses[uid(14)] = { state: "incomplete", durationSec: null, creatorId: "c", reason: null };
    const result = await cleanup();
    expect(candidateCalls).toEqual([{ p_cutoff: "2026-10-22T02:00:00.000Z", p_limit: 100 }]);
    expect(deleted).toEqual([uid(14)]);
    expect(contents.some((c) => c.id === "abandoned")).toBe(false);
    expect(result).toMatchObject({ stream_checked: 1, stream_drafts_removed: 1, stream_videos_deleted: 1 });
  });

  it("nunca toca publicado, despublicado (já esteve no ar), vídeo bom nem envio na validade", async () => {
    contents.push(
      { id: "pub", status: "published", published_at: "2026-10-20T10:00:00Z", media_ref: uid(7) },
      { id: "was", status: "draft", published_at: "2026-10-20T10:00:00Z", media_ref: uid(8) },
      { id: "good", status: "draft", published_at: null, media_ref: uid(9) },
      { id: "young", status: "draft", published_at: null, media_ref: uid(10) },
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
    contents.push({ id: "c1", status: "draft", published_at: null, media_ref: uid(11) });
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
