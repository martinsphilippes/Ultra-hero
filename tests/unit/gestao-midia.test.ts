import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { brandNavKeys } from "@/lib/agency/roles";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { INBOX_KINDS } from "@/lib/inbox/kinds";
import {
  campaignTotals,
  chunk,
  conversionRate,
  currentMetrics,
  engagementRate,
  isLinkPreviewBot,
  normalizeCoupon,
  parseMetricInput,
  rightsBand,
  safeHttpsDestination,
  salesTotals,
  sumMetrics,
  toMetricReading,
  trackingCodeOk,
  trackingUrl,
  youTubeStats,
  EMPTY_METRICS,
  type MetricReading,
} from "@/lib/media/metrics";
import { embedUrl, formatTimestamp, isVideoFileUrl, parseTimestamp, videoSource, vimeoId, youTubeId } from "@/lib/media/video";
import { collectYouTubeMetrics, youTubeConfigured } from "@/lib/media/youtube-collect";

const reading = (over: Partial<MetricReading>): MetricReading => ({
  id: "r",
  deliverableId: "d1",
  source: "manual",
  measuredOn: "2026-11-01",
  createdAt: "2026-11-01T10:00:00Z",
  enteredSide: "talent",
  ...EMPTY_METRICS,
  ...over,
});

describe("vídeo: link, player e tempo", () => {
  it("reconhece o YouTube em todos os formatos comuns", () => {
    expect(youTubeId("https://www.youtube.com/watch?v=abcdefghijk&t=10")).toBe("abcdefghijk");
    expect(youTubeId("https://youtu.be/abcdefghijk?si=x")).toBe("abcdefghijk");
    expect(youTubeId("https://m.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(youTubeId("https://www.youtube.com/embed/abcdefghijk")).toBe("abcdefghijk");
    expect(youTubeId("https://youtube.com/live/abcdefghijk")).toBe("abcdefghijk");
    expect(youTubeId("http://www.youtube.com/watch?v=abcdefghijk")).toBeNull();
    expect(youTubeId("https://www.youtube.com/watch?v=curto")).toBeNull();
    expect(youTubeId("https://evil.com/watch?v=abcdefghijk")).toBeNull();
    expect(youTubeId("não é link")).toBeNull();
  });

  it("reconhece Vimeo e arquivo de vídeo direto", () => {
    expect(vimeoId("https://vimeo.com/123456789")).toBe("123456789");
    expect(vimeoId("https://player.vimeo.com/video/123456")).toBe("123456");
    expect(vimeoId("https://vimeo.com/channels/staff/987654")).toBe("987654");
    expect(vimeoId("https://vimeo.com/about")).toBeNull();
    expect(isVideoFileUrl("https://cdn.x.com/a/b.MP4")).toBe(true);
    expect(isVideoFileUrl("https://cdn.x.com/a/b.pdf")).toBe(false);
    expect(videoSource("https://drive.google.com/file/1")).toBeNull();
    expect(videoSource("https://cdn.x.com/v.webm")).toEqual({ kind: "file", url: "https://cdn.x.com/v.webm" });
  });

  it("monta o player no segundo certo", () => {
    expect(embedUrl({ kind: "youtube", id: "abcdefghijk" }, 75)).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0&start=75&autoplay=1");
    expect(embedUrl({ kind: "youtube", id: "abcdefghijk" }, null)).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0");
    expect(embedUrl({ kind: "vimeo", id: "123456" }, 90)).toBe("https://player.vimeo.com/video/123456?autoplay=1#t=90s");
    expect(embedUrl({ kind: "file", url: "https://x.com/v.mp4#t=3" }, 12.7)).toBe("https://x.com/v.mp4#t=12");
    expect(embedUrl({ kind: "youtube", id: "abcdefghijk" }, -5)).toContain("start=0");
  });

  it("converte mm:ss nos dois sentidos", () => {
    expect(formatTimestamp(75)).toBe("1:15");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
    expect(parseTimestamp("1:15")).toBe(75);
    expect(parseTimestamp("01:02:05")).toBe(3725);
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("  ")).toBeNull();
    expect(parseTimestamp("1:75")).toBeUndefined();
    expect(parseTimestamp("1:60:00")).toBeUndefined();
    expect(parseTimestamp("abc")).toBeUndefined();
    expect(parseTimestamp("999999")).toBeUndefined();
  });
});

describe("métricas", () => {
  it("valor atual = leitura mais recente que traz a métrica (YouTube não apaga o alcance manual)", () => {
    const rows = [
      reading({ id: "a", measuredOn: "2026-10-30", reach: 900, views: 1000, likes: 80 }),
      reading({ id: "b", measuredOn: "2026-11-01", source: "youtube", enteredSide: "system", views: 1500, likes: 95, comments: 7 }),
      reading({ id: "c", measuredOn: "2026-11-01", createdAt: "2026-11-01T09:00:00Z", views: 1400 }),
    ];
    const cur = currentMetrics(rows);
    expect(cur.values).toMatchObject({ reach: 900, views: 1500, likes: 95, comments: 7, shares: null });
    expect(cur.lastOn).toBe("2026-11-01");
    expect(cur.youtube).toBe(true);
    expect(currentMetrics([]).lastOn).toBeNull();
  });

  it("totais da campanha somam por entregável e deixam null o que ninguém informou", () => {
    const rows = [reading({ deliverableId: "d1", views: 100, likes: 10 }), reading({ deliverableId: "d2", views: 50 }), reading({ deliverableId: "d1", measuredOn: "2026-10-01", views: 1 })];
    expect(campaignTotals(rows)).toMatchObject({ views: 150, likes: 10, reach: null });
    expect(sumMetrics([])).toEqual(EMPTY_METRICS);
  });

  it("lê a linha do banco e o formulário", () => {
    const r = toMetricReading({ id: "x", deliverable_id: "d", source: "youtube", measured_on: "2026-11-02", entered_side: "system", views: "12", likes: null, reach: -3 });
    expect(r).toMatchObject({ source: "youtube", enteredSide: "system", views: 12, likes: null, reach: null });
    expect(parseMetricInput("1.234")).toBe(1234);
    expect(parseMetricInput(" ")).toBeNull();
    expect(parseMetricInput("-1")).toBeUndefined();
    expect(parseMetricInput("12a")).toBeUndefined();
  });

  it("engajamento sobre o alcance (ou views)", () => {
    expect(engagementRate({ ...EMPTY_METRICS, reach: 1000, likes: 40, comments: 10 })).toBe(5);
    expect(engagementRate({ ...EMPTY_METRICS, views: 200, likes: 1 })).toBe(0.5);
    expect(engagementRate({ ...EMPTY_METRICS, views: 200 })).toBeNull();
    expect(engagementRate({ ...EMPTY_METRICS, likes: 3 })).toBeNull();
  });

  it("estatísticas da YouTube Data API (números em texto; curtidas podem faltar)", () => {
    expect(youTubeStats({ id: "abcdefghijk", statistics: { viewCount: "1500", likeCount: "90", commentCount: "4" } })).toEqual({ id: "abcdefghijk", stats: { views: 1500, likes: 90, comments: 4 } });
    expect(youTubeStats({ id: "abcdefghijk", statistics: { viewCount: "10" } })?.stats).toEqual({ views: 10, likes: null, comments: null });
    expect(youTubeStats({ id: "abcdefghijk", statistics: {} })).toBeNull();
    expect(youTubeStats(null)).toBeNull();
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("direitos de uso: faixas iguais às do aviso (15, 7, 0)", () => {
  it("classifica o vencimento", () => {
    const base = { published: true, perpetual: false, expiresOn: "2026-12-01" };
    expect(rightsBand({ ...base, daysLeft: 30 })).toBe("ok");
    expect(rightsBand({ ...base, daysLeft: 15 })).toBe("soon15");
    expect(rightsBand({ ...base, daysLeft: 7 })).toBe("soon7");
    expect(rightsBand({ ...base, daysLeft: 1 })).toBe("soon7");
    expect(rightsBand({ ...base, daysLeft: 0 })).toBe("today");
    expect(rightsBand({ ...base, daysLeft: -1 })).toBe("expired");
    expect(rightsBand({ published: true, perpetual: true, expiresOn: null, daysLeft: null })).toBe("none");
    expect(rightsBand({ published: false, perpetual: false, expiresOn: null, daysLeft: null })).toBe("pending");
    expect(rightsBand({ published: false, perpetual: true, expiresOn: null, daysLeft: null })).toBe("none");
  });
});

describe("link rastreável e vendas", () => {
  it("só redireciona para https sem credenciais", () => {
    expect(safeHttpsDestination("https://loja.com/promo?utm=x")).toBe("https://loja.com/promo?utm=x");
    expect(safeHttpsDestination("http://loja.com")).toBeNull();
    expect(safeHttpsDestination("javascript:alert(1)")).toBeNull();
    expect(safeHttpsDestination("https://user:pw@loja.com")).toBeNull();
    expect(safeHttpsDestination("https://localhost")).toBeNull();
    expect(safeHttpsDestination(null)).toBeNull();
    expect(safeHttpsDestination(`https://a.com/${"x".repeat(600)}`)).toBeNull();
  });

  it("código, cupom e URL curta", () => {
    expect(trackingCodeOk("a1b2c3d4")).toBe(true);
    expect(trackingCodeOk("A1B2C3D4")).toBe(true);
    expect(trackingCodeOk("abc")).toBe(false);
    expect(trackingCodeOk("abc-def-12")).toBe(false);
    expect(normalizeCoupon(" alfa10 ")).toBe("ALFA10");
    expect(normalizeCoupon("")).toBe("");
    expect(normalizeCoupon("DOIS 5")).toBeNull();
    expect(trackingUrl("https://app.test/", "abc12345")).toBe("https://app.test/r/abc12345");
  });

  it("pré-visualização de link não conta clique; navegador conta", () => {
    expect(isLinkPreviewBot("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(isLinkPreviewBot("facebookexternalhit/1.1")).toBe(true);
    expect(isLinkPreviewBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isLinkPreviewBot(null)).toBe(true);
    expect(isLinkPreviewBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0")).toBe(false);
    expect(isLinkPreviewBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36")).toBe(false);
  });

  it("soma as vendas por link e calcula a conversão", () => {
    const rows = [
      { id: "1", linkId: "l1", dealTalentId: "t1", coupon: "A", quantity: 3, revenueCents: 9000, reportedOn: "2026-11-01", note: "", createdBy: null },
      { id: "2", linkId: "l1", dealTalentId: "t1", coupon: "A", quantity: 2, revenueCents: 6000, reportedOn: "2026-11-02", note: "", createdBy: null },
      { id: "3", linkId: "l2", dealTalentId: "t2", coupon: "B", quantity: 1, revenueCents: 100, reportedOn: "2026-11-02", note: "", createdBy: null },
    ];
    const s = salesTotals(rows);
    expect(s.quantity).toBe(6);
    expect(s.revenueCents).toBe(15100);
    expect(s.byLink.get("l1")).toEqual({ quantity: 5, revenueCents: 15000 });
    expect(conversionRate(200, 5)).toBe(2.5);
    expect(conversionRate(0, 5)).toBeNull();
  });
});

describe("coleta do YouTube", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem YOUTUBE_API_KEY diz que não está configurada e não chama nada", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const fetchSpy = vi.fn();
    const admin = { from: vi.fn() } as never;
    expect(youTubeConfigured()).toBe(false);
    expect(await collectYouTubeMetrics(admin, fetchSpy as never)).toEqual({ youtube: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("com a chave, busca só vídeos do YouTube em lotes e grava a leitura do dia", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "chave-teste");
    const rows = [
      { id: "d1", deal_id: "deal", deal_talent_id: "dt1", talent_id: "t1", agency_id: "a", brand_id: "b", published_url: "https://youtu.be/abcdefghijk" },
      { id: "d2", deal_id: "deal", deal_talent_id: "dt2", talent_id: "t2", agency_id: "a", brand_id: "b", published_url: "https://instagram.com/p/xyz" },
    ];
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const query = { select: () => query, in: () => query, not: () => query, gte: () => query, limit: () => Promise.resolve({ data: rows, error: null }) };
    const admin = { from: (table: string) => (table === "deliverables" ? query : { upsert }) } as never;
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: "abcdefghijk", statistics: { viewCount: "321", likeCount: "12", commentCount: "3" } }] }) });
    const out = await collectYouTubeMetrics(admin, fetchSpy as never);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("part=statistics&id=abcdefghijk&key=chave-teste");
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ deliverable_id: "d1", source: "youtube", entered_side: "system", views: 321, likes: 12, comments: 3 })], { onConflict: "deliverable_id,source,measured_on" });
    expect(out).toEqual({ youtube: { videos: 1, stored: 1, failed: 0 } });
  });
});

describe("integração com o resto da gestão", () => {
  it("menu da marca ganha a Biblioteca depois de Campanhas", () => {
    expect(brandNavKeys()).toEqual(["dashboard", "ondaDigital", "board", "campaigns", "library", "catalog", "agenda", "sponsorships", "payments", "team", "notifications"]);
  });

  it("avisos novos e erro de cupom repetido", () => {
    expect(INBOX_KINDS).toContain("usage_rights_expiring");
    expect(INBOX_KINDS).toContain("deliverable_comment");
    expect(AGENCY_ERROR_CODES).toContain("coupon_taken");
    expect(agencyErrorCode({ message: "coupon_taken" })).toBe("coupon_taken");
  });

  it("a migração recria o check de avisos com TODOS os tipos e não abre função para o visitante", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0083_biblioteca_metricas_vendas.sql"), "utf8");
    // task_due_soon chegou depois, na 0084; os avisos do patrocínio, na 0085; os da chamada da marca, na 0089; verba e pagamentos, na 0090
    for (const kind of INBOX_KINDS.filter((k) => k !== "task_due_soon" && !k.startsWith("sponsorship_") && !k.startsWith("brand_call_") && k !== "budget_change" && !k.startsWith("payment_") && !k.startsWith("roadmap_") && k !== "payout_due" && k !== "hero_account_linked" && k !== "brand_access_granted" && !k.startsWith("agency_access_") && !k.startsWith("casting_access_") && !k.startsWith("brand_approval_") && !k.startsWith("profile_claim_") && !k.startsWith("brand_login_") && !k.startsWith("onda_") && !k.startsWith("creator_") && !k.startsWith("group_project_") && !k.startsWith("account_access_")))
      expect(sql).toContain(`'${kind}'`);
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
    expect(sql).toMatch(/revoke execute on function public\.tracking_link_click\(text\) from public, anon, authenticated/);
  });
});
