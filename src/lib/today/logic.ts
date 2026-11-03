import type { BrandStatus } from "@/lib/deals/stages";
import type { DeliverableStatus } from "@/lib/deals/vocab";

// "Hoje" e painel por etapa (0078): lógica pura, sem banco. O banco (brand_workboard / talent_today) devolve
// só os fatos que cada lado já pode ver; aqui se decide a etapa de cada ação, a urgência e a ordem.
//
// Decisões (registradas também no relatório do bloco 1):
//   • Etapas da marca: Enviada (proposta enviada, nenhum creator ainda mostrado à marca) → Aceita (creator
//     proposto/contratado, campanha ainda sem produção) → Em criação (em produção, ajuste pedido ou aprovado
//     faltando publicar) → Aguardando aprovação (versão enviada) → Publicada (publicado, comprovado, concluído).
//   • "Aprovada, falta publicar" fica em Em criação (o trabalho ainda é do creator), com o status visível no cartão.
//   • Creator mostrado sem entregáveis planejados vira um cartão próprio (Aceita ou Em criação).
//   • Rascunho, cancelada e recusada não entram no painel (o rascunho parado aparece no "Hoje").
//   • Urgência: atrasado (prazo passou) > vence hoje (mesmo dia no fuso da agência) > próximos 3 dias > aguardando
//     (sem prazo). Empate: prazo mais cedo, depois o tipo (aprovar antes de responder), depois o mais antigo.
//   • Rascunho "parado" = sem mudança há 3 dias ou mais.

export const BOARD_STAGES = ["sent", "accepted", "creating", "awaiting", "published"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

export const SOON_DAYS = 3;
export const STALE_DRAFT_DAYS = 3;
/** Entrega fechada há mais que isso sem avaliação sai do "Hoje" (continua avaliável na campanha). */
export const RATING_WINDOW_DAYS = 30;
const RATABLE = new Set<DeliverableStatus>(["published", "proof_submitted", "done"]);
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- dados que chegam do banco (já normalizados)
export type WbCampaign = {
  requestId: string;
  title: string;
  requestStatus: string;
  brandStatus: BrandStatus;
  dealTitle: string | null;
  submittedAt: string | null;
  updatedAt: string;
  requestedTalentName: string | null;
  requestedCount: number;
  /** aprovação interna (0081): none | pending | returned | approved */
  approvalStatus?: string;
  approvalRequestedByMe?: boolean;
  approvalRequestedAt?: string | null;
  approvalRequestedLabel?: string;
  approvalDecidedAt?: string | null;
  approvalDecisionNote?: string;
};
export type WbTalent = { dealTalentId: string; requestId: string; talentName: string; status: string };
export type WbDeliverable = {
  id: string;
  dealTalentId: string;
  requestId: string;
  kind: string;
  network: string | null;
  title: string;
  status: DeliverableStatus;
  dueAt: string | null;
  publishAt: string | null;
  submittedAt: string | null;
  talentName: string;
  /** 0081: quando a entrega fechou (comprovada/publicada) e se a marca já avaliou */
  closedAt?: string | null;
  rated?: boolean;
};
export type WbScript = { taskId: string; requestId: string; dealTitle: string; talentName: string | null; dueAt: string | null; since: string | null };
export type WbTerms = { termsId: string; requestId: string; dealTitle: string; version: number; sentAt: string | null; validUntil: string | null };
export type WbThread = { dealId: string; requestId: string; dealTitle: string; lastAt: string; authorLabel: string; excerpt: string };
/** Pré-seleção enviada ao diretor ou já decidida, ainda sem campanha (0081). */
export type WbShortlist = { id: string; title: string; status: "sent" | "decided"; sentAt: string | null; decidedAt: string | null; createdByMe: boolean; createdLabel: string; pending: number; approved: number };

export type BrandWorkboard = {
  role: "owner" | "staff" | null;
  timezone: string;
  campaigns: WbCampaign[];
  talents: WbTalent[];
  deliverables: WbDeliverable[];
  scriptApprovals: WbScript[];
  termsPending: WbTerms[];
  threads: WbThread[];
  shortlists?: WbShortlist[];
};

// ---------------------------------------------------------------- painel por etapa (marca)
export type BoardItem = {
  key: string;
  stage: BoardStage;
  /** campanha (Enviada), creator sem entregável, ou entregável */
  type: "campaign" | "talent" | "deliverable";
  requestId: string;
  href: string;
  campaignTitle: string;
  talentName: string | null;
  deliverableKind: string | null;
  network: string | null;
  title: string;
  status: string | null;
  /** data que mais importa para o cartão (prazo do entregável ou envio da proposta) */
  date: string | null;
  /** quantos entregáveis a marca pediu (só no cartão de campanha) */
  requestedCount: number;
};

const FINAL_CAMPAIGN = new Set<BrandStatus>(["draft", "cancelled"]);
const PRODUCTION = new Set<BrandStatus>(["running", "done"]);

/** Etapa de um entregável para a marca; null = não aparece (cancelado). */
export function deliverableStage(status: DeliverableStatus, inProduction: boolean): BoardStage | null {
  switch (status) {
    case "cancelled":
      return null;
    case "submitted":
      return "awaiting";
    case "published":
    case "proof_submitted":
    case "done":
      return "published";
    case "changes_requested":
    case "approved":
      return "creating";
    case "planned":
    case "in_production":
      return inProduction ? "creating" : "accepted";
    default:
      return null;
  }
}

/** Prazo que vale para o entregável: antes do envio, o prazo de entrega; aprovado, a data de publicação. */
export function deliverableDeadline(d: { status: DeliverableStatus; dueAt: string | null; publishAt: string | null }): string | null {
  if (d.status === "approved" || d.status === "submitted") return d.publishAt ?? d.dueAt;
  return d.dueAt ?? d.publishAt;
}

const campaignHref = (requestId: string, anchor?: string) => `/marca/campanhas/${requestId}${anchor ? `#${anchor}` : ""}`;

function byDate(a: BoardItem, b: BoardItem): number {
  const ta = a.date ? Date.parse(a.date) : Number.POSITIVE_INFINITY;
  const tb = b.date ? Date.parse(b.date) : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  return a.campaignTitle.localeCompare(b.campaignTitle) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
}

/** Agrupa todas as ações da marca por etapa (cada coluna já ordenada pela data mais próxima). */
export function buildBrandBoard(wb: Pick<BrandWorkboard, "campaigns" | "talents" | "deliverables">): Record<BoardStage, BoardItem[]> {
  const out: Record<BoardStage, BoardItem[]> = { sent: [], accepted: [], creating: [], awaiting: [], published: [] };
  for (const c of wb.campaigns) {
    if (FINAL_CAMPAIGN.has(c.brandStatus) || c.requestStatus === "draft" || c.requestStatus === "cancelled" || c.requestStatus === "declined") continue;
    const production = PRODUCTION.has(c.brandStatus);
    const campaignTitle = c.title || c.dealTitle || "";
    const talents = wb.talents.filter((t) => t.requestId === c.requestId);
    if (talents.length === 0) {
      // nenhum creator mostrado ainda: a proposta está com a agência/creator (uma campanha concluída sem
      // creator visível não tem o que mostrar)
      if (c.brandStatus === "done") continue;
      out.sent.push({
        key: `c:${c.requestId}`, stage: "sent", type: "campaign", requestId: c.requestId, href: campaignHref(c.requestId), campaignTitle,
        talentName: c.requestedTalentName, deliverableKind: null, network: null, title: campaignTitle, status: c.brandStatus,
        date: c.submittedAt, requestedCount: c.requestedCount,
      });
      continue;
    }
    for (const t of talents) {
      const delivs = wb.deliverables.filter((d) => d.dealTalentId === t.dealTalentId);
      if (delivs.length === 0) {
        if (c.brandStatus === "done") continue;
        const stage: BoardStage = production ? "creating" : "accepted";
        out[stage].push({
          key: `t:${t.dealTalentId}`, stage, type: "talent", requestId: c.requestId, href: campaignHref(c.requestId, "camp-talents"), campaignTitle,
          talentName: t.talentName, deliverableKind: null, network: null, title: t.talentName, status: t.status, date: null, requestedCount: 0,
        });
        continue;
      }
      for (const d of delivs) {
        const stage = deliverableStage(d.status, production);
        if (!stage) continue;
        out[stage].push({
          key: `d:${d.id}`, stage, type: "deliverable", requestId: c.requestId, href: campaignHref(c.requestId, "camp-deliverables"), campaignTitle,
          talentName: d.talentName, deliverableKind: d.kind, network: d.network, title: d.title, status: d.status,
          date: stage === "awaiting" ? (deliverableDeadline(d) ?? d.submittedAt) : deliverableDeadline(d), requestedCount: 0,
        });
      }
    }
  }
  for (const s of BOARD_STAGES) out[s].sort(byDate);
  return out;
}

export function boardCounts(board: Record<BoardStage, BoardItem[]>): Record<BoardStage, number> {
  return Object.fromEntries(BOARD_STAGES.map((s) => [s, board[s].length])) as Record<BoardStage, number>;
}

// ---------------------------------------------------------------- urgência
export const URGENCIES = ["overdue", "today", "soon", "waiting"] as const;
export type Urgency = (typeof URGENCIES)[number];

/** Dia civil (YYYY-MM-DD) de um instante num fuso. */
export function localDay(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  }
}

const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);

/** Urgência de um prazo (instante). "later" = depois dos próximos dias (fora do "Hoje"). */
export function urgencyOf(deadline: string | null, now: Date, timeZone: string, soonDays = SOON_DAYS): Urgency | "later" {
  if (!deadline) return "waiting";
  const at = new Date(deadline);
  if (Number.isNaN(at.getTime())) return "waiting";
  if (at.getTime() < now.getTime()) return "overdue";
  const diffDays = dayNumber(localDay(at, timeZone)) - dayNumber(localDay(now, timeZone));
  if (diffDays <= 0) return "today";
  if (diffDays <= soonDays) return "soon";
  return "later";
}

/** Urgência de uma data civil (validade dos termos): vale até o fim do dia. */
export function urgencyOfDay(day: string | null, now: Date, timeZone: string, soonDays = SOON_DAYS): Urgency | "later" {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "waiting";
  const diffDays = dayNumber(day) - dayNumber(localDay(now, timeZone));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= soonDays) return "soon";
  return "later";
}

// ---------------------------------------------------------------- itens do "Hoje"
// 0081: aprovação interna (diretor aprova / analista ajusta o devolvido), pré-seleção e avaliar entrega fechada
// 0082: verba estourada (marca); nota fiscal pendente e pagamento agendado (creator)
// 0085: oportunidade de patrocínio aberta, no prazo e sem resposta da marca
export const BRAND_TODAY_KINDS = ["approval", "internalApproval", "shortlist", "script", "terms", "sponsorship", "budget", "message", "deadline", "rating", "draft"] as const;
export type BrandTodayKind = (typeof BRAND_TODAY_KINDS)[number];
export const TALENT_TODAY_KINDS = ["adjustment", "scriptAdjustment", "terms", "offer", "deliverable", "task", "invoice", "payment"] as const;
export type TalentTodayKind = (typeof TALENT_TODAY_KINDS)[number];

export type TodayItem<K extends string = string> = {
  key: string;
  kind: K;
  urgency: Urgency;
  /** prazo (instante ISO ou data YYYY-MM-DD) */
  deadline: string | null;
  /** desde quando espera (envio, última mensagem, última edição) */
  since: string | null;
  href: string;
  /** texto principal (título do entregável, da campanha, da tarefa) */
  title: string;
  /** contexto (campanha · creator / marca · campanha) */
  context: string;
  /** extra opcional (trecho da mensagem, feedback) */
  note: string | null;
  /** status cru quando ajuda o rótulo (ex.: approved = falta publicar) */
  status: string | null;
  /** passo do modelo (tarefas) */
  step: number | null;
};

const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, today: 1, soon: 2, waiting: 3 };
const time = (v: string | null) => {
  if (!v) return Number.POSITIVE_INFINITY;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59Z` : v);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/** Ordena por urgência, prazo, prioridade do tipo e espera mais longa. */
export function sortToday<K extends string>(items: TodayItem<K>[], kindOrder: readonly K[]): TodayItem<K>[] {
  const rank = (k: K) => {
    const i = kindOrder.indexOf(k);
    return i === -1 ? kindOrder.length : i;
  };
  return [...items].sort(
    (a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      time(a.deadline) - time(b.deadline) ||
      rank(a.kind) - rank(b.kind) ||
      time(a.since) - time(b.since) ||
      a.key.localeCompare(b.key),
  );
}

export function countByKind<K extends string>(items: TodayItem<K>[], kinds: readonly K[]): Record<K, number> {
  const out = Object.fromEntries(kinds.map((k) => [k, 0])) as Record<K, number>;
  for (const i of items) out[i.kind] = (out[i.kind] ?? 0) + 1;
  return out;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(" · ");
const pick = (u: Urgency | "later"): Urgency => (u === "later" ? "waiting" : u);

/** Verba de uma campanha para o "Hoje" (0082, vem de brand_budget_overview): só o que precisa de atenção entra. */
export type TodayBudget = { requestId: string; title: string; over: boolean; talentsOver: number };

/** Oportunidade de patrocínio para o "Hoje" (0085, vem de brand_sponsorships): só a aberta, no prazo e sem resposta entra. */
export type TodaySponsorship = { id: string; title: string; talentName: string; respondBy: string; open: boolean; answered: boolean };

/** "Depende de mim hoje" da marca. */
export function buildBrandToday(
  wb: BrandWorkboard,
  now: Date,
  opts: { staleDraftDays?: number; soonDays?: number; budgets?: TodayBudget[]; sponsorships?: TodaySponsorship[] } = {},
): TodayItem<BrandTodayKind>[] {
  const tz = wb.timezone;
  const soon = opts.soonDays ?? SOON_DAYS;
  const stale = opts.staleDraftDays ?? STALE_DRAFT_DAYS;
  const titleOf = new Map(wb.campaigns.map((c) => [c.requestId, c.title || c.dealTitle || ""]));
  const items: TodayItem<BrandTodayKind>[] = [];
  const base = { note: null, status: null, step: null };

  for (const d of wb.deliverables) {
    const deadline = deliverableDeadline(d);
    if (d.status === "submitted") {
      // aprovação pendente: o prazo (se houver) dá a urgência; sem prazo, aguardando
      items.push({ ...base, key: `approval:${d.id}`, kind: "approval", urgency: pick(urgencyOf(deadline, now, tz, soon)), deadline, since: d.submittedAt,
        href: campaignHref(d.requestId, "camp-deliverables"), title: d.title || d.kind, context: join(titleOf.get(d.requestId), d.talentName), status: d.status });
      continue;
    }
    if (!["planned", "in_production", "changes_requested", "approved"].includes(d.status)) continue;
    const u = urgencyOf(deadline, now, tz, soon);
    if (u === "later" || u === "waiting") continue;
    items.push({ ...base, key: `deadline:${d.id}`, kind: "deadline", urgency: u, deadline, since: null,
      href: campaignHref(d.requestId, "camp-deliverables"), title: d.title || d.kind, context: join(titleOf.get(d.requestId), d.talentName), status: d.status });
  }
  for (const s of wb.scriptApprovals) {
    items.push({ ...base, key: `script:${s.taskId}`, kind: "script", urgency: pick(urgencyOf(s.dueAt, now, tz, soon)), deadline: s.dueAt, since: s.since,
      href: campaignHref(s.requestId, "camp-tasks"), title: s.dealTitle, context: join(titleOf.get(s.requestId), s.talentName) });
  }
  for (const m of wb.termsPending) {
    items.push({ ...base, key: `terms:${m.termsId}`, kind: "terms", urgency: pick(urgencyOfDay(m.validUntil, now, tz, soon)), deadline: m.validUntil, since: m.sentAt,
      href: campaignHref(m.requestId, "camp-terms"), title: m.dealTitle, context: titleOf.get(m.requestId) ?? "", status: wb.role === "owner" ? "can_accept" : "owner_only" });
  }
  for (const th of wb.threads) {
    items.push({ ...base, key: `message:${th.dealId}`, kind: "message", urgency: "waiting", deadline: null, since: th.lastAt,
      href: campaignHref(th.requestId, "camp-messages"), title: titleOf.get(th.requestId) || th.dealTitle, context: th.authorLabel, note: th.excerpt || null });
  }
  // 0081: só quem tem papel na marca age (o admin da plataforma só lê)
  if (wb.role) {
    for (const c of wb.campaigns) {
      if (c.requestStatus !== "draft") continue;
      if (wb.role === "owner" && c.approvalStatus === "pending") {
        items.push({ ...base, key: `internalApproval:${c.requestId}`, kind: "internalApproval", urgency: "waiting", deadline: null, since: c.approvalRequestedAt ?? c.updatedAt,
          href: campaignHref(c.requestId, "camp-approval"), title: c.title, context: c.approvalRequestedLabel ?? "", status: "pending" });
      } else if (wb.role === "staff" && c.approvalStatus === "returned" && c.approvalRequestedByMe) {
        items.push({ ...base, key: `internalApproval:${c.requestId}`, kind: "internalApproval", urgency: "waiting", deadline: null, since: c.approvalDecidedAt ?? c.updatedAt,
          href: campaignHref(c.requestId, "camp-approval"), title: c.title, context: "", note: c.approvalDecisionNote || null, status: "returned" });
      }
    }
    for (const s of wb.shortlists ?? []) {
      const href = `/marca/creators/pre-selecao/${s.id}`;
      if (wb.role === "owner" && s.status === "sent" && s.pending > 0) {
        items.push({ ...base, key: `shortlist:${s.id}`, kind: "shortlist", urgency: "waiting", deadline: null, since: s.sentAt, href, title: s.title, context: s.createdLabel, status: "sent" });
      } else if (s.status === "decided" && s.createdByMe && s.approved > 0) {
        items.push({ ...base, key: `shortlist:${s.id}`, kind: "shortlist", urgency: "waiting", deadline: null, since: s.decidedAt, href, title: s.title, context: "", status: "decided" });
      }
    }
    for (const d of wb.deliverables) {
      if (!RATABLE.has(d.status) || d.rated !== false || !d.closedAt) continue;
      const closed = Date.parse(d.closedAt);
      if (Number.isNaN(closed) || now.getTime() - closed > RATING_WINDOW_DAYS * DAY_MS) continue;
      items.push({ ...base, key: `rating:${d.id}`, kind: "rating", urgency: "waiting", deadline: null, since: d.closedAt,
        href: campaignHref(d.requestId, "camp-ratings"), title: d.title || d.kind, context: join(titleOf.get(d.requestId), d.talentName) });
    }
  }
  // 0082: verba estourada (da campanha ou de algum influenciador); só quem tem papel na marca vê como pendência
  if (wb.role) {
    for (const b of opts.budgets ?? []) {
      if (!b.over && b.talentsOver <= 0) continue;
      items.push({ ...base, key: `budget:${b.requestId}`, kind: "budget", urgency: "waiting", deadline: null, since: null,
        href: campaignHref(b.requestId, "camp-budget"), title: b.title || titleOf.get(b.requestId) || "", context: "", status: b.over ? "over" : "talents_over" });
    }
  }
  // 0085: oportunidade de patrocínio esperando "Quero patrocinar" ou "Não tenho interesse" (só quem tem papel responde)
  if (wb.role) {
    for (const o of opts.sponsorships ?? []) {
      if (!o.open || o.answered) continue;
      const deadline = Date.parse(o.respondBy);
      if (Number.isNaN(deadline) || deadline < now.getTime()) continue;
      items.push({ ...base, key: `sponsorship:${o.id}`, kind: "sponsorship", urgency: pick(urgencyOf(o.respondBy, now, tz, soon)), deadline: o.respondBy, since: null,
        href: `/marca/oportunidades/${o.id}`, title: o.title, context: o.talentName });
    }
  }
  for (const c of wb.campaigns) {
    if (c.requestStatus !== "draft" || c.brandStatus !== "draft") continue;
    // aguardando o diretor não é rascunho parado (para o diretor ele já aparece como aprovação interna)
    if (c.approvalStatus === "pending") continue;
    const age = now.getTime() - Date.parse(c.updatedAt);
    if (!(age >= stale * DAY_MS)) continue;
    items.push({ ...base, key: `draft:${c.requestId}`, kind: "draft", urgency: "waiting", deadline: null, since: c.updatedAt,
      href: campaignHref(c.requestId), title: c.title, context: c.requestedTalentName ?? "" });
  }
  return sortToday(items, BRAND_TODAY_KINDS);
}

// ---------------------------------------------------------------- "Hoje" do creator
export type TdTask = { id: string; step: number | null; title: string; status: string; dueAt: string | null; feedback: string; dealId: string | null; dealTitle: string | null; brandName: string | null; dealTalentId: string | null };
/** counterStatus: última contraproposta do creator nesta consulta (0079), se houver (retirada não conta). */
export type TdOffer = { dealTalentId: string; status: string; respondBy: string | null; consultedAt: string | null; dealTitle: string; brandName: string; counterStatus?: "open" | "accepted" | "rejected" | null };
export type TdDeliverable = {
  id: string; dealTalentId: string; dealId: string; kind: string; network: string | null; title: string; status: DeliverableStatus;
  dueAt: string | null; publishAt: string | null; brandFeedback: string; decidedAt: string | null; dealTitle: string; brandName: string;
};
export type TdTerms = { termsId: string; dealTalentId: string; version: number; sentAt: string | null; validUntil: string | null; dealTitle: string; brandName: string };
/** Repasse aberto (0082, sem valor): entrega feita, situação da última nota e data agendada. */
export type TdPayout = {
  id: string; dealTalentId: string; dealTitle: string; brandName: string; status: string; dueOn: string | null; scheduledOn: string | null;
  delivered: boolean; invoiceStatus: "submitted" | "approved" | "rejected" | null; invoiceNote: string;
};
export type TalentTodayData = { timezone: string; tasks: TdTask[]; offers: TdOffer[]; deliverables: TdDeliverable[]; terms: TdTerms[]; payouts?: TdPayout[] };

const oppHref = (dealTalentId: string, anchor?: string) => `/creator/escritorio/oportunidades/${dealTalentId}${anchor ? `#${anchor}` : ""}`;
/** Passos do modelo que repetem o que o entregável já mostra (enviar conteúdo, publicar, comprovar). */
const DELIVERABLE_STEPS = new Set([7, 9, 10]);

/** "Hoje" do creator: tarefas vencendo hoje/atrasadas, consultas, entregáveis próximos, ajustes e termos. */
export function buildTalentToday(data: TalentTodayData, now: Date, opts: { soonDays?: number } = {}): TodayItem<TalentTodayKind>[] {
  const tz = data.timezone;
  const soon = opts.soonDays ?? SOON_DAYS;
  const items: TodayItem<TalentTodayKind>[] = [];
  const base = { note: null, status: null, step: null };
  const dealsWithDeliverable = new Set<string>();

  for (const d of data.deliverables) {
    const deadline = deliverableDeadline(d);
    const u = urgencyOf(deadline, now, tz, soon);
    if (d.status === "changes_requested") {
      dealsWithDeliverable.add(d.dealId);
      items.push({ ...base, key: `adjustment:${d.id}`, kind: "adjustment", urgency: pick(u), deadline, since: d.decidedAt, href: oppHref(d.dealTalentId, "opp-execution"),
        title: d.title || d.kind, context: join(d.brandName, d.dealTitle), note: d.brandFeedback || null, status: d.status });
      continue;
    }
    if (u === "later" || u === "waiting") continue;
    dealsWithDeliverable.add(d.dealId);
    items.push({ ...base, key: `deliverable:${d.id}`, kind: "deliverable", urgency: u, deadline, since: null, href: oppHref(d.dealTalentId, "opp-execution"),
      title: d.title || d.kind, context: join(d.brandName, d.dealTitle), status: d.status });
  }
  for (const k of data.tasks) {
    const isScriptAdjustment = k.step === 4 && k.status === "todo" && k.feedback.trim() !== "";
    if (isScriptAdjustment) {
      items.push({ ...base, key: `scriptAdjustment:${k.id}`, kind: "scriptAdjustment", urgency: pick(urgencyOf(k.dueAt, now, tz, soon)), deadline: k.dueAt, since: null,
        href: k.dealTalentId ? oppHref(k.dealTalentId, "opp-tasks") : "/creator/escritorio/tarefas", title: k.dealTitle ?? "", context: k.brandName ?? "", note: k.feedback, step: 4 });
      continue;
    }
    // tarefa só entra vencendo hoje ou atrasada; os passos que o entregável já mostra não se repetem
    const u = urgencyOf(k.dueAt, now, tz, soon);
    if (u !== "overdue" && u !== "today") continue;
    if (k.step !== null && DELIVERABLE_STEPS.has(k.step) && k.dealId && dealsWithDeliverable.has(k.dealId)) continue;
    items.push({ ...base, key: `task:${k.id}`, kind: "task", urgency: u, deadline: k.dueAt, since: null, href: "/creator/escritorio/tarefas",
      title: k.title, context: join(k.brandName, k.dealTitle), status: k.status, step: k.step });
  }
  for (const o of data.offers) {
    // com contraproposta, o status vira counter_<situação> (a tela mostra "aguardando a agência", "aceita", "recusada")
    items.push({ ...base, key: `offer:${o.dealTalentId}`, kind: "offer", urgency: pick(urgencyOf(o.respondBy, now, tz, soon)), deadline: o.respondBy, since: o.consultedAt,
      href: oppHref(o.dealTalentId), title: o.dealTitle, context: o.brandName, status: o.counterStatus ? `counter_${o.counterStatus}` : o.status });
  }
  for (const m of data.terms) {
    items.push({ ...base, key: `terms:${m.termsId}:${m.dealTalentId}`, kind: "terms", urgency: pick(urgencyOfDay(m.validUntil, now, tz, soon)), deadline: m.validUntil, since: m.sentAt,
      href: oppHref(m.dealTalentId, "opp-terms"), title: m.dealTitle, context: m.brandName });
  }
  // 0082: entregou e falta a nota (ou foi recusada) → enviar nota; pagamento agendado para os próximos dias → aviso
  for (const p of data.payouts ?? []) {
    if (p.status !== "planned" && p.status !== "due") continue;
    const href = `/creator/escritorio/ganhos#pay-${p.id}`;
    if (p.scheduledOn) {
      const u = urgencyOfDay(p.scheduledOn, now, tz, soon);
      if (u === "later" || u === "waiting") continue;
      items.push({ ...base, key: `payment:${p.id}`, kind: "payment", urgency: u, deadline: p.scheduledOn, since: null, href, title: p.dealTitle, context: p.brandName, status: "scheduled" });
      continue;
    }
    if (!p.delivered || p.invoiceStatus === "submitted" || p.invoiceStatus === "approved") continue;
    items.push({ ...base, key: `invoice:${p.id}`, kind: "invoice", urgency: pick(urgencyOfDay(p.dueOn, now, tz, soon)), deadline: p.dueOn, since: null, href,
      title: p.dealTitle, context: p.brandName, note: p.invoiceStatus === "rejected" && p.invoiceNote ? p.invoiceNote : null, status: p.invoiceStatus === "rejected" ? "rejected" : "missing" });
  }
  return sortToday(items, TALENT_TODAY_KINDS);
}
