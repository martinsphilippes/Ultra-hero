// Etapas do negócio (espelho de public.deal_stage_index / deal_brand_status / deal_stage_can, 0066).
// Lógica pura, testada contra a tabela 4.3 da spec.

export const DEAL_STAGES = [
  "briefing_received",
  "qualification",
  "shortlist",
  "consultation",
  "proposal_prep",
  "proposal_sent",
  "negotiation",
  "approved",
  "contracting",
  "production",
  "approval",
  "delivery",
  "closed",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_OUTCOMES = ["won", "lost", "cancelled"] as const;
export type DealOutcome = (typeof DEAL_OUTCOMES)[number];

/** Porteiras: só as RPCs próprias levam até aqui (proposta, confirmação, contrato). */
export const GATED_STAGES: readonly DealStage[] = ["proposal_sent", "approved", "production"];

export const BRAND_STATUSES = ["draft", "received", "building", "proposal", "contracting", "running", "done", "cancelled"] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

export function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && (DEAL_STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: DealStage): number {
  return DEAL_STAGES.indexOf(stage) + 1;
}

/** Etapa vista pela marca (6.3). */
export function brandStatus(stage: DealStage, outcome: DealOutcome | null): BrandStatus {
  if (stage === "closed") return outcome === "won" ? "done" : "cancelled";
  const i = stageIndex(stage);
  if (i <= 2) return "received";
  if (i <= 5) return "building";
  if (i <= 7) return "proposal";
  if (i <= 9) return "contracting";
  return "running";
}

/** Situação da oportunidade pela ótica do creator (talent_opportunities). */
export type OpportunityDealStatus = "open" | "confirmed" | "running" | "won" | "lost" | "cancelled";

type Role = "admin" | "manager" | "staff" | null;

/** Movimento manual permitido? (mesma regra de public.deal_stage_can) */
export function canMove(role: Role, isOwner: boolean, from: DealStage, to: DealStage): boolean {
  if (from === to || to === "closed" || from === "closed") return false;
  if ((GATED_STAGES as readonly string[]).includes(to)) return false;
  const rank = role === "admin" ? 3 : role === "manager" ? 2 : role === "staff" ? 1 : 0;
  if (!(rank >= 2 || (role === "staff" && isOwner))) return false;
  const a = stageIndex(from);
  const b = stageIndex(to);
  if (a >= 10 && b < 10) return false;
  if ((from === "approved" || from === "contracting") && b < 8) return false;
  return true;
}

/** Voltar de etapa pede nota (≥ 5). */
export function moveNeedsNote(from: DealStage, to: DealStage): boolean {
  return to !== "closed" && stageIndex(to) < stageIndex(from);
}

/** Próximas etapas que a tela oferece (manuais; as porteiras aparecem como ação própria). */
export function nextStages(role: Role, isOwner: boolean, from: DealStage): DealStage[] {
  return DEAL_STAGES.filter((to) => canMove(role, isOwner, from, to));
}

/** Etapas abertas antes da confirmação (onde a agência ainda pode mexer no elenco e consultar). */
export function isPreConfirmation(stage: DealStage): boolean {
  return stageIndex(stage) < 8;
}

export function canConfirm(stage: DealStage): boolean {
  const i = stageIndex(stage);
  return i >= 4 && i < 8;
}
