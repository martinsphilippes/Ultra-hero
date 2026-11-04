import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import {
  approvalActions,
  availabilityWindow,
  canCompare,
  canRate,
  compareHref,
  draftEditable,
  formatAvg,
  onTimePct,
  parseCompareIds,
  ratingInputValid,
  reasonValid,
  shortlistActions,
  shortlistProgress,
  shortlistTitleValid,
  suggestOnTime,
  toApprovalStatus,
  toggleCompare,
  toRatingMap,
  toRatingSummary,
} from "@/lib/selection/logic";
import { buildBrandToday, type BrandWorkboard, type WbCampaign, type WbDeliverable } from "@/lib/today/logic";
import { toBrandWorkboard } from "@/lib/today/normalize";

// Bloco 4 (0081): pré-seleção, comparação, aprovação pelo diretor e nota do influenciador — regras de tela.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const E = "55555555-5555-4555-8555-555555555555";

describe("comparar", () => {
  it("lê os ids da URL: só UUID, sem repetir, no máximo 4, na ordem", () => {
    expect(parseCompareIds(`${A},${B},lixo,${A.toUpperCase()},${C}`)).toEqual([A, B, C]);
    expect(parseCompareIds([A, `${B},${C}`, D, E])).toEqual([A, B, C, D]);
    expect(parseCompareIds(undefined)).toEqual([]);
    expect(parseCompareIds("")).toEqual([]);
  });
  it("liga/desliga sem passar de 4 e só compara de 2 a 4", () => {
    let ids: string[] = [];
    for (const id of [A, B, C, D, E]) ids = toggleCompare(ids, id);
    expect(ids).toEqual([A, B, C, D]);
    expect(toggleCompare(ids, B)).toEqual([A, C, D]);
    expect(canCompare([A])).toBe(false);
    expect(canCompare([A, B])).toBe(true);
    expect(canCompare([A, B, C, D, E])).toBe(false);
    expect(compareHref([A, B])).toBe(`/marca/herois/comparar?ids=${A},${B}`);
  });
  it("janela de 60 dias: conta livres e indisponíveis, o bloqueio vence a sobreposição e o resto é não declarado", () => {
    const w = availabilityWindow(
      [
        { kind: "available", startsOn: "2026-11-01", endsOn: "2026-11-10", note: "" },
        { kind: "blocked", startsOn: "2026-11-08", endsOn: "2026-11-12", note: "" },
        { kind: "available", startsOn: "2026-12-20", endsOn: "2027-02-01", note: "" },
      ],
      "2026-11-02",
    );
    // livres: 02–07 (6) + 20/12–31/12 (12) = 18; bloqueados: 08–12 (5); janela 02/11–31/12
    expect(w).toEqual({ available: 18, blocked: 5, undeclared: 60 - 23 });
    expect(availabilityWindow([], "2026-11-02")).toEqual({ available: 0, blocked: 0, undeclared: 60 });
  });
});

describe("nota do influenciador", () => {
  it("resumo tolera nulos, arredonda a média e limita o 'no prazo' ao total", () => {
    expect(toRatingSummary({ avg: "4.333", count: 3, on_time: 2, campaigns: 1 })).toEqual({ avg: 4.3, count: 3, onTime: 2, campaigns: 1 });
    expect(toRatingSummary({ avg: null, count: 0, campaigns: 2 })).toEqual({ avg: null, count: 0, onTime: 0, campaigns: 2 });
    expect(toRatingSummary(null)).toEqual({ avg: null, count: 0, onTime: 0, campaigns: 0 });
    expect(toRatingSummary({ avg: 5, count: 1, on_time: 9 }).onTime).toBe(1);
    expect(toRatingMap({ [A]: { avg: 4, count: 1, on_time: 1 } })[A].avg).toBe(4);
    expect(toRatingMap([])).toEqual({});
  });
  it("% no prazo e média no idioma", () => {
    expect(onTimePct({ avg: 4, count: 3, onTime: 2, campaigns: 0 })).toBe(67);
    expect(onTimePct({ avg: null, count: 0, onTime: 0, campaigns: 0 })).toBeNull();
    expect(formatAvg(4.5, "pt-BR")).toBe("4,5");
    expect(formatAvg(4, "en")).toBe("4.0");
    expect(formatAvg(null, "pt-BR")).toBeNull();
  });
  it("só entrega publicada, comprovada ou concluída e ainda sem nota pode ser avaliada", () => {
    expect(canRate("published", false)).toBe(true);
    expect(canRate("proof_submitted", false)).toBe(true);
    expect(canRate("done", false)).toBe(true);
    expect(canRate("done", true)).toBe(false);
    expect(canRate("approved", false)).toBe(false);
  });
  it("sugestão de prazo pelas datas (até o fim do dia combinado); sem datas, sem sugestão", () => {
    expect(suggestOnTime({ publishAt: "2026-11-02T12:00:00Z", dueAt: null, publishedAt: "2026-11-02T20:00:00Z" })).toBe(true);
    expect(suggestOnTime({ publishAt: "2026-11-02T12:00:00Z", dueAt: null, publishedAt: "2026-11-04T20:00:00Z" })).toBe(false);
    expect(suggestOnTime({ publishAt: null, dueAt: "2026-11-02T12:00:00Z", proofAt: "2026-11-01T12:00:00Z" })).toBe(true);
    expect(suggestOnTime({ publishAt: null, dueAt: null, publishedAt: "2026-11-01T12:00:00Z" })).toBeNull();
  });
  it("formulário: precisa do prazo (sim/não), 1 a 5 estrelas e comentário até 500", () => {
    expect(ratingInputValid({ onTime: true, quality: 5, comment: "" })).toBe(true);
    expect(ratingInputValid({ onTime: null, quality: 5, comment: "" })).toBe(false);
    expect(ratingInputValid({ onTime: false, quality: 0, comment: "" })).toBe(false);
    expect(ratingInputValid({ onTime: false, quality: 6, comment: "" })).toBe(false);
    expect(ratingInputValid({ onTime: false, quality: 3, comment: "x".repeat(501) })).toBe(false);
  });
});

describe("aprovação interna", () => {
  it("diretor envia direto; com pedido aguardando, aprova ou devolve", () => {
    expect(approvalActions("owner", "none", false)).toEqual(["submit"]);
    expect(approvalActions("owner", "returned", false)).toEqual(["submit"]);
    expect(approvalActions("owner", "pending", false)).toEqual(["approve", "return"]);
  });
  it("analista pede aprovação (também depois de devolvida); aguardando, só quem pediu retira", () => {
    expect(approvalActions("staff", "none", false)).toEqual(["ask"]);
    expect(approvalActions("staff", "returned", true)).toEqual(["ask"]);
    expect(approvalActions("staff", "pending", true)).toEqual(["withdraw"]);
    expect(approvalActions("staff", "pending", false)).toEqual([]);
    expect(approvalActions(null, "pending", false)).toEqual([]);
  });
  it("a equipe não edita o rascunho que espera o diretor; o diretor edita", () => {
    expect(draftEditable("staff", "pending")).toBe(false);
    expect(draftEditable("staff", "returned")).toBe(true);
    expect(draftEditable("owner", "pending")).toBe(true);
    expect(draftEditable(null, "none")).toBe(false);
    expect(toApprovalStatus("estranho")).toBe("none");
  });
  it("erros novos traduzidos (e o mais específico primeiro)", () => {
    for (const c of ["approval_required", "awaiting_approval", "already_rated"]) expect(AGENCY_ERROR_CODES).toContain(c);
    expect(agencyErrorCode({ message: "approval_required" })).toBe("approval_required");
    expect(agencyErrorCode({ message: "awaiting_approval" })).toBe("awaiting_approval");
    expect(agencyErrorCode({ message: "already_rated" })).toBe("already_rated");
  });
});

describe("pré-seleção", () => {
  const items = [{ decision: "approved" as const }, { decision: "rejected" as const }, { decision: null }];
  it("progresso", () => {
    expect(shortlistProgress(items)).toEqual({ total: 3, approved: 1, rejected: 1, pending: 1 });
  });
  it("rascunho: monta, envia (com alguém) e apaga; o diretor só decide depois do envio", () => {
    const draft = { status: "draft" as const, requestId: null, requestStatus: null };
    expect(shortlistActions("staff", draft, items)).toEqual({ edit: true, send: true, remove: true, decide: false, toCampaign: false });
    expect(shortlistActions("owner", draft, []).send).toBe(false);
    expect(shortlistActions("owner", draft, items).decide).toBe(false);
  });
  it("enviada: diretor decide; com aprovado vira campanha; com campanha aberta, nada muda (cancelada libera)", () => {
    const sent = { status: "sent" as const, requestId: null, requestStatus: null };
    expect(shortlistActions("owner", sent, items)).toEqual({ edit: false, send: false, remove: false, decide: true, toCampaign: true });
    expect(shortlistActions("staff", sent, items).decide).toBe(false);
    expect(shortlistActions("staff", sent, [{ decision: "rejected" }]).toCampaign).toBe(false);
    const linked = { status: "decided" as const, requestId: A, requestStatus: "draft" };
    expect(shortlistActions("owner", linked, items)).toEqual({ edit: false, send: false, remove: false, decide: false, toCampaign: false });
    expect(shortlistActions("owner", { ...linked, requestStatus: "cancelled" }, items).toCampaign).toBe(true);
    expect(shortlistActions(null, sent, items).decide).toBe(false);
  });
  it("validações de nome e motivo", () => {
    expect(shortlistTitleValid("  ab ")).toBe(false);
    expect(shortlistTitleValid("Lista")).toBe(true);
    expect(reasonValid("ok")).toBe(false);
    expect(reasonValid("Bom alcance")).toBe(true);
    expect(reasonValid("x".repeat(501))).toBe(false);
  });
});

describe("Depende de mim hoje (0081)", () => {
  const NOW = new Date("2026-11-02T18:00:00Z");
  const h = (hours: number) => new Date(NOW.getTime() + hours * 3600_000).toISOString();
  const camp = (over: Partial<WbCampaign>): WbCampaign => ({
    requestId: "r1", title: "Campanha", requestStatus: "draft", brandStatus: "draft", dealTitle: null, submittedAt: null, updatedAt: h(-24 * 10),
    requestedTalentName: null, requestedCount: 1, ...over,
  });
  const deliv = (over: Partial<WbDeliverable>): WbDeliverable => ({
    id: "d1", dealTalentId: "dt1", requestId: "r9", kind: "reels", network: null, title: "Reels", status: "published", dueAt: null, publishAt: null,
    submittedAt: null, talentName: "Ana", ...over,
  });
  const wb = (role: "owner" | "staff" | null, over: Partial<BrandWorkboard> = {}): BrandWorkboard => ({
    role, timezone: "America/Sao_Paulo", campaigns: [], talents: [], deliverables: [], scriptApprovals: [], termsPending: [], threads: [], ...over,
  });

  it("diretor vê o pedido aguardando (e não como rascunho parado); a analista vê o devolvido a ela", () => {
    const campaigns = [
      camp({ requestId: "p", approvalStatus: "pending", approvalRequestedAt: h(-5), approvalRequestedLabel: "Analista" }),
      camp({ requestId: "r", approvalStatus: "returned", approvalRequestedByMe: true, approvalDecidedAt: h(-2), approvalDecisionNote: "Trocar a data" }),
    ];
    const owner = buildBrandToday(wb("owner", { campaigns }), NOW);
    expect(owner.find((i) => i.key === "internalApproval:p")).toMatchObject({ href: "/marca/campanhas/p#camp-approval", status: "pending", context: "Analista" });
    expect(owner.some((i) => i.key === "draft:p")).toBe(false);
    expect(owner.some((i) => i.key === "internalApproval:r")).toBe(false);
    const staff = buildBrandToday(wb("staff", { campaigns }), NOW);
    expect(staff.find((i) => i.key === "internalApproval:r")).toMatchObject({ status: "returned", note: "Trocar a data" });
    expect(staff.some((i) => i.key === "internalApproval:p")).toBe(false);
    expect(buildBrandToday(wb(null, { campaigns }), NOW).some((i) => i.kind === "internalApproval")).toBe(false);
  });
  it("pré-seleção: o diretor decide a enviada; quem montou cria a campanha da decidida", () => {
    const shortlists = [
      { id: "s1", title: "Lista 1", status: "sent" as const, sentAt: h(-3), decidedAt: null, createdByMe: false, createdLabel: "Analista", pending: 2, approved: 0 },
      { id: "s2", title: "Lista 2", status: "decided" as const, sentAt: h(-30), decidedAt: h(-1), createdByMe: true, createdLabel: "Eu", pending: 0, approved: 1 },
    ];
    // createdByMe é relativo a quem lê: para o diretor, a s2 não é dele
    const forOwner = shortlists.map((s) => ({ ...s, createdByMe: false }));
    expect(buildBrandToday(wb("owner", { shortlists: forOwner }), NOW).map((i) => i.key)).toEqual(["shortlist:s1"]);
    const staff = buildBrandToday(wb("staff", { shortlists }), NOW);
    expect(staff.map((i) => i.key)).toEqual(["shortlist:s2"]);
    expect(staff[0]).toMatchObject({ href: "/marca/herois/pre-selecao/s2", status: "decided" });
  });
  it("avaliar: entrega fechada há até 30 dias e ainda sem nota", () => {
    const deliverables = [
      deliv({ id: "new", closedAt: h(-24), rated: false }),
      deliv({ id: "rated", closedAt: h(-24), rated: true }),
      deliv({ id: "old", closedAt: h(-24 * 40), rated: false }),
      deliv({ id: "prod", status: "in_production", closedAt: h(-1), rated: false }),
    ];
    const items = buildBrandToday(wb("staff", { deliverables }), NOW);
    expect(items.filter((i) => i.kind === "rating").map((i) => i.key)).toEqual(["rating:new"]);
    expect(items.find((i) => i.kind === "rating")?.href).toBe("/marca/campanhas/r9#camp-ratings");
  });
  it("normaliza os campos novos da leitura", () => {
    const n = toBrandWorkboard({
      role: "owner",
      campaigns: [{ request_id: "r1", request_status: "draft", brand_status: "draft", updated_at: h(0), approval_status: "pending", approval_requested_by_me: true }],
      deliverables: [{ id: "d1", status: "done", closed_at: h(-1), rated: false }],
      shortlists: [{ id: "s1", status: "sent", pending: "2" }, { id: "s2", status: "draft" }],
    });
    expect(n?.campaigns[0]).toMatchObject({ approvalStatus: "pending", approvalRequestedByMe: true });
    expect(n?.deliverables[0]).toMatchObject({ rated: false, closedAt: h(-1) });
    expect(n?.shortlists).toHaveLength(1);
    expect(n?.shortlists?.[0].pending).toBe(2);
    expect(toBrandWorkboard({ campaigns: [{ request_id: "x", approval_status: "zzz" }] })?.campaigns[0].approvalStatus).toBe("none");
  });
});

describe("migração 0081", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0081_preselecao_aprovacao_notas.sql"), "utf8");
  it("recria as leituras e o envio com a mesma assinatura (sem sobrecarga) e fecha tudo para visitante", () => {
    for (const sig of ["brand_request_save(p_id uuid, p_brand uuid, p_data jsonb)", "brand_request_submit(p_id uuid)", "brand_workboard(p_brand uuid)", "brand_campaigns(p_brand uuid)", "brand_campaign_detail(p_request uuid)"]) {
      expect(sql).toContain(`create or replace function public.${sig}`);
    }
    const created = [...sql.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    for (const fn of created) expect(sql, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon`));
    expect(sql).not.toMatch(/grant execute[^;]*to [^;]*anon/);
  });
});
