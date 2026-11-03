// Valores do formulário de campanha da marca, num módulo comum (sem "use client"): as páginas do servidor
// importam EMPTY_CAMPAIGN daqui e o espalham em objetos de verdade.
import { EMPTY_BRIEF_DRAFT, type BriefDraft } from "@/lib/brief/brief";
import type { BrandRequestInput } from "@/lib/deals/schemas";

export type CampaignFormValues = Omit<BrandRequestInput, "budgetMaxCents" | "brief"> & { budgetText: string; briefDraft: BriefDraft };

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
  briefDraft: EMPTY_BRIEF_DRAFT,
};
