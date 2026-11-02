// Pré-seleção, comparação, aprovação pelo diretor e nota do influenciador (0081): lógica pura, testada com vitest.
// O banco confere quem pode e guarda o registro; aqui ficam as regras de tela (quais botões aparecem, a janela de
// 60 dias, o resumo da nota, a escolha de quem comparar) e a normalização das leituras fechadas.

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
export const AVAILABILITY_WINDOW_DAYS = 60;
export const SHORTLIST_MAX_ITEMS = 20;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const NOTE_MAX = 500;
export const RETURN_NOTE_MIN = 5;
export const COMMENT_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- comparar
/** Ids da URL (?ids=a,b,c ou ?ids=a&ids=b): só UUIDs, sem repetir, no máximo 4, na ordem em que vieram. */
export function parseCompareIds(raw: string | string[] | undefined | null): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => String(v).split(","));
  const out: string[] = [];
  for (const p of parts) {
    const id = p.trim().toLowerCase();
    if (UUID.test(id) && !out.includes(id)) out.push(id);
    if (out.length === COMPARE_MAX) break;
  }
  return out;
}

/** Liga/desliga um creator na seleção para comparar (não passa de 4: o quinto é ignorado). */
export function toggleCompare(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= COMPARE_MAX) return [...ids];
  return [...ids, id];
}

export const canCompare = (ids: readonly string[]) => ids.length >= COMPARE_MIN && ids.length <= COMPARE_MAX;

export const compareHref = (ids: readonly string[]) => `/marca/creators/comparar?ids=${ids.join(",")}`;

export type Period = {
  kind: "available" | "blocked";
  startsOn: string;
  endsOn: string;
  note: string;
};

const dayNum = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);

/**
 * Dias declarados nos próximos 60 dias (hoje incluído): livres e indisponíveis. Um dia marcado nos dois conta como
 * indisponível (o bloqueio vence). O resto é "não declarado" — a agência confirma na proposta.
 */
export function availabilityWindow(periods: readonly Period[], today: string, days = AVAILABILITY_WINDOW_DAYS): { available: number; blocked: number; undeclared: number } {
  const start = dayNum(today);
  if (Number.isNaN(start)) return { available: 0, blocked: 0, undeclared: days };
  const state = new Map<number, "available" | "blocked">();
  for (const p of periods) {
    const a = Math.max(dayNum(p.startsOn), start);
    const b = Math.min(dayNum(p.endsOn), start + days - 1);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    for (let d = a; d <= b; d++) {
      if (p.kind === "blocked" || !state.has(d)) state.set(d, p.kind);
    }
  }
  const blocked = [...state.values()].filter((v) => v === "blocked").length;
  const available = state.size - blocked;
  return { available, blocked, undeclared: days - available - blocked };
}

// ---------------------------------------------------------------- nota
export type RatingSummary = {
  avg: number | null;
  count: number;
  onTime: number;
  campaigns: number;
};
export const EMPTY_RATING: RatingSummary = {
  avg: null,
  count: 0,
  onTime: 0,
  campaigns: 0,
};

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function toRatingSummary(raw: unknown): RatingSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_RATING;
  const r = raw as Record<string, unknown>;
  const count = Math.max(0, Math.trunc(num(r.count)));
  const avg = r.avg === null || r.avg === undefined || count === 0 ? null : Number(r.avg);
  return {
    avg: avg !== null && Number.isFinite(avg) ? Math.round(avg * 10) / 10 : null,
    count,
    onTime: Math.min(count, Math.max(0, Math.trunc(num(r.on_time)))),
    campaigns: Math.max(0, Math.trunc(num(r.campaigns))),
  };
}

/** {talent_id: resumo} de brand_talent_ratings. */
export function toRatingMap(raw: unknown): Record<string, RatingSummary> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, toRatingSummary(v)]));
}

/** % das entregas no prazo (inteiro) ou null sem avaliação. */
export function onTimePct(s: RatingSummary): number | null {
  return s.count === 0 ? null : Math.round((s.onTime / s.count) * 100);
}

/** Média com uma casa no idioma ("4,5") ou null. */
export function formatAvg(avg: number | null, locale: string): string | null {
  return avg === null
    ? null
    : new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(avg);
}

export const RATABLE_STATUSES = ["published", "proof_submitted", "done"] as const;
export const canRate = (status: string, rated: boolean) => !rated && (RATABLE_STATUSES as readonly string[]).includes(status);

/**
 * Sugestão para "cumpriu o prazo?": publicou (ou comprovou) até o fim do dia da data combinada (publicação ou, sem
 * ela, entrega). Sem as duas datas não há sugestão — a marca escolhe.
 */
export function suggestOnTime(d: { publishAt: string | null; dueAt: string | null; publishedAt?: string | null; proofAt?: string | null }): boolean | null {
  const target = d.publishAt ?? d.dueAt;
  const done = d.publishedAt ?? d.proofAt ?? null;
  if (!target || !done) return null;
  const t = Date.parse(target);
  const x = Date.parse(done);
  if (Number.isNaN(t) || Number.isNaN(x)) return null;
  return x <= t + DAY_MS;
}

export function ratingInputValid(input: { onTime: boolean | null; quality: number; comment: string }): boolean {
  return input.onTime !== null && Number.isInteger(input.quality) && input.quality >= 1 && input.quality <= 5 && input.comment.trim().length <= COMMENT_MAX;
}

// ---------------------------------------------------------------- aprovação interna
export type ApprovalStatus = "none" | "pending" | "returned" | "approved";
export type ApprovalAction = "submit" | "ask" | "withdraw" | "approve" | "return";

/**
 * Botões do rascunho por papel (o banco confere de novo):
 *   diretor (owner): envia direto; com pedido aguardando, aprova (e envia) ou devolve com nota.
 *   analista (staff): pede aprovação (também depois de devolvido); aguardando, só quem pediu retira o pedido.
 *   sem papel (admin da plataforma): nada.
 */
export function approvalActions(role: "owner" | "staff" | null, status: ApprovalStatus, requestedByMe: boolean): ApprovalAction[] {
  if (!role) return [];
  if (role === "owner") return status === "pending" ? ["approve", "return"] : ["submit"];
  if (status === "pending") return requestedByMe ? ["withdraw"] : [];
  return ["ask"];
}

/** A equipe não edita o rascunho que espera o diretor (o diretor pode ajustar antes de aprovar). */
export const draftEditable = (role: "owner" | "staff" | null, status: ApprovalStatus) => role === "owner" || (role === "staff" && status !== "pending");

export const toApprovalStatus = (v: unknown): ApprovalStatus => (v === "pending" || v === "returned" || v === "approved" ? v : "none");

// ---------------------------------------------------------------- pré-seleção
export type ShortlistStatus = "draft" | "sent" | "decided";
export type Decision = "approved" | "rejected" | null;

export function shortlistProgress(items: readonly { decision: Decision }[]): {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
} {
  const approved = items.filter((i) => i.decision === "approved").length;
  const rejected = items.filter((i) => i.decision === "rejected").length;
  return {
    total: items.length,
    approved,
    rejected,
    pending: items.length - approved - rejected,
  };
}

export type ShortlistActions = {
  edit: boolean;
  send: boolean;
  remove: boolean;
  decide: boolean;
  toCampaign: boolean;
};

/**
 * O que a pessoa pode fazer numa lista: montar (rascunho, qualquer papel), enviar (rascunho com alguém), apagar
 * (rascunho), decidir (diretor, enviada/decidida, ainda sem campanha) e virar campanha (enviada/decidida, com
 * aprovado, sem campanha aberta).
 */
export function shortlistActions(
  role: "owner" | "staff" | null,
  list: {
    status: ShortlistStatus;
    requestId: string | null;
    requestStatus: string | null;
  },
  items: readonly { decision: Decision }[],
): ShortlistActions {
  const none = {
    edit: false,
    send: false,
    remove: false,
    decide: false,
    toCampaign: false,
  };
  if (!role) return none;
  const draft = list.status === "draft";
  const openCampaign = list.requestId !== null && list.requestStatus !== "cancelled";
  const p = shortlistProgress(items);
  return {
    edit: draft,
    send: draft && items.length > 0,
    remove: draft,
    decide: role === "owner" && !draft && !openCampaign,
    toCampaign: !draft && !openCampaign && p.approved > 0,
  };
}

export const reasonValid = (v: string) => v.trim().length >= REASON_MIN && v.trim().length <= REASON_MAX;
export const shortlistTitleValid = (v: string) => v.trim().length >= 3 && v.trim().length <= 120;
