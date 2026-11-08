// Valores do formulário de campanha da marca, num módulo comum (sem "use client"): as páginas do servidor
// importam EMPTY_CAMPAIGN daqui e o espalham em objetos de verdade.
import { EMPTY_BRIEF_DRAFT, type BriefDraft } from "@/lib/brief/brief";
import { draftToCompensation, MONEY_ONLY, toDb, type Compensation, type CompensationDb, type CompensationDraft, type CompensationError } from "@/lib/compensation/model";
import { parseBrlToCents, type BrandRequestInput } from "@/lib/deals/schemas";
import { brlToCents } from "@/lib/money/brl-input";
import { validateTerms, type ValueModel } from "@/lib/value-model/model";

/** 0140: `compensation` = forma de pagamento gravada (valor, permuta e/ou performance); o formulário edita um rascunho dela. */
export type CampaignFormValues = Omit<BrandRequestInput, "budgetMaxCents" | "brief" | "compensation"> & { budgetText: string; briefDraft: BriefDraft; compensation: Compensation };

export const EMPTY_CAMPAIGN: CampaignFormValues = {
  id: null,
  talentId: "",
  title: "",
  objective: "",
  product: "",
  targetAudience: "",
  targetAgeBands: [],
  targetStates: [],
  regionNote: "",
  periodStart: "",
  periodEnd: "",
  desiredTime: "",
  durationMinutes: "",
  format: "",
  location: "",
  networks: [],
  deliverables: [],
  notes: "",
  budgetText: "",
  valueModel: "fixo",
  maxHeroes: null,
  budgetNote: "",
  compensation: { ...MONEY_ONLY },
  briefDraft: EMPTY_BRIEF_DRAFT,
};

/**
 * 0096/0140: "editable" = campanha livre (a marca escolhe a forma de pagamento e o modelo); "frozen" = campanha de um
 * acordo de chamada (tudo congelado); "hidden" = patrocínio (o valor segue o da oportunidade, sem escolher o modelo).
 */
export type CampaignValueMode = "editable" | "frozen" | "hidden";

export type CampaignValueError = { kind: "compensation"; code: CompensationError } | { kind: "budget" } | { kind: "value"; code: "value_per_hero_required" | "max_heroes_required" };

export type CampaignValuePayload = Pick<BrandRequestInput, "budgetMaxCents" | "valueModel" | "maxHeroes"> & { compensation?: CompensationDb };

/**
 * Bloco "Pagamento" do formulário → campos do pedido. Campanha livre: a forma de pagamento vai junto e, sem "Valor"
 * marcado, não há dinheiro — valor vazio, modelo fixo e sem máximo (os campos de valor escondidos não contam; o banco faz
 * o mesmo). Campanha de um acordo: a forma de pagamento não vai (o banco mantém a do acordo) e o valor segue como estava.
 */
export function campaignValuePayload(
  v: Pick<CampaignFormValues, "budgetText" | "valueModel" | "maxHeroes">,
  draft: CompensationDraft,
  mode: CampaignValueMode,
): { ok: true; value: CampaignValuePayload } | { ok: false; error: CampaignValueError } {
  let compensation: CompensationDb | undefined;
  if (mode === "editable") {
    const checked = draftToCompensation(draft, brlToCents);
    if (!checked.ok) return { ok: false, error: { kind: "compensation", code: checked.error } };
    compensation = toDb(checked.value);
    if (!compensation.money) return { ok: true, value: { budgetMaxCents: null, valueModel: "fixo", maxHeroes: null, compensation } };
  }
  const cents = parseBrlToCents(v.budgetText);
  if (cents === undefined) return { ok: false, error: { kind: "budget" } };
  // 0096: por Hero exige o valor por Hero e o máximo de Heros (o banco confere de novo)
  if (mode === "editable") {
    const problem = validateTerms({ model: v.valueModel, amountCents: cents, maxHeroes: v.maxHeroes });
    if (problem === "value_per_hero_required" || problem === "max_heroes_required") return { ok: false, error: { kind: "value", code: problem } };
  }
  const model: ValueModel = v.valueModel;
  return { ok: true, value: { budgetMaxCents: cents, valueModel: model, maxHeroes: model === "por_heroi" ? v.maxHeroes : null, ...(compensation ? { compensation } : {}) } };
}
