import { z } from "zod";

// Estratégias para marcas (0111, D3): banco de ideias mensal com aprovação pela Estratégia (lógica pura, testável).
// Situação: ideia → em análise → aprovada → material pronto → enviada (a oportunidade publicada envia).

export const STRATEGY_STATUSES = ["idea", "review", "approved", "ready", "sent"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];
export const isStrategyStatus = (v: unknown): v is StrategyStatus => typeof v === "string" && (STRATEGY_STATUSES as readonly string[]).includes(v);

/** Primeiro dia do mês de uma data "AAAA-MM-DD" (ou "AAAA-MM"). */
export function monthKey(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Mês anterior/seguinte ("AAAA-MM-01"). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

/** Período padrão do relatório do casting: o mês de referência inteiro (até hoje, se for o mês corrente). */
export function reportRange(month: string, today: string): { from: string; to: string } {
  const next = shiftMonth(month, 1);
  const last = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  return { from: month, to: last < today ? last : today < month ? month : today };
}

const uuidOrEmpty = z.union([z.literal(""), z.uuid()]);
const dayOrEmpty = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const strategyIdeaSchema = z
  .object({
    id: uuidOrEmpty.default(""),
    month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    brandId: uuidOrEmpty.default(""),
    brandLabel: z.string().trim().max(120).default(""),
    segmentId: uuidOrEmpty.default(""),
    talentId: uuidOrEmpty.default(""),
    calendarEventId: uuidOrEmpty.default(""),
    ideaOn: dayOrEmpty.default(""),
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().max(4000).default(""),
  })
  .refine((d) => d.brandId !== "" || d.brandLabel.length >= 2, { path: ["brandLabel"], message: "target_required" });

export const strategyStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["review", "approved", "idea", "ready"]),
  note: z.string().trim().max(500).default(""),
});

export type StrategyFlags = { canEdit: boolean; canDelete: boolean; canSubmit: boolean; canDecide: boolean; canReady: boolean; canReopen: boolean; canSend: boolean };

/** Ações que a tela oferece (o banco confere de novo). */
export function strategyActions(status: StrategyStatus, flags: StrategyFlags): ("submit" | "approve" | "return" | "ready" | "reopen" | "send")[] {
  const out: ("submit" | "approve" | "return" | "ready" | "reopen" | "send")[] = [];
  if (status === "idea" && flags.canSubmit) out.push("submit");
  if (status === "review" && flags.canDecide) out.push("approve", "return");
  if (status === "approved" && flags.canReady) out.push("ready");
  if (status === "ready" && flags.canReopen) out.push("reopen");
  if ((status === "approved" || status === "ready") && flags.canSend) out.push("send");
  return out;
}

/** Link da oportunidade de patrocínio pré-preenchida com a ideia (Hero, data/evento, marca). */
export function sendHref(idea: { id: string; talentId: string | null; brandId: string | null; calendarEventId: string | null; ideaOn: string | null }): string {
  const qs = new URLSearchParams();
  if (idea.calendarEventId) qs.set("evento", idea.calendarEventId);
  if (idea.talentId) qs.set("heroi", idea.talentId);
  if (idea.brandId) qs.set("marca", idea.brandId);
  if (idea.ideaOn) qs.set("data", idea.ideaOn);
  qs.set("ideia", idea.id);
  return `/agencia/oportunidades/nova?${qs.toString()}`;
}
