import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { conflictsByTalent, toConflicts, toCounteroffers, type Conflict, type Counteroffer } from "./counteroffer";

// Leituras fechadas da oferta (0079). O banco decide quem vê o quê (valor só para o creator dono e o Adm).

export type TalentOfferState = { counteroffers: Counteroffer[]; conflicts: Conflict[]; canFee: boolean; canDate: boolean; timezone: string };
export type AgencyOfferState = { counteroffers: Counteroffer[]; conflicts: Record<string, Conflict[]>; canDecideFee: boolean; canDecideDate: boolean };

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function getTalentOfferState(dealTalentId: string): Promise<{ available: boolean; data: TalentOfferState | null }> {
  if (!isId(dealTalentId)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_offer_state", { p_deal_talent: dealTalentId });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const raw = data as Record<string, unknown>;
  return { available: true, data: { counteroffers: toCounteroffers(raw.counteroffers), conflicts: toConflicts(raw.conflicts), canFee: raw.can_fee === true, canDate: raw.can_date === true, timezone: typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "America/Sao_Paulo" } };
}

export async function getAgencyOfferState(dealId: string, talentIds: string[] = []): Promise<{ available: boolean; data: AgencyOfferState | null }> {
  if (!isId(dealId)) return { available: true, data: null };
  const supabase = await createClient();
  const ids = Array.from(new Set(talentIds.filter(isId))).slice(0, 300);
  const { data, error } = await supabase.rpc("agency_offer_state", { p_deal: dealId, p_talent_ids: ids.length > 0 ? ids : undefined });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const raw = data as Record<string, unknown>;
  return {
    available: true,
    data: { counteroffers: toCounteroffers(raw.counteroffers), conflicts: conflictsByTalent(raw.conflicts), canDecideFee: raw.can_decide_fee === true, canDecideDate: raw.can_decide_date === true },
  };
}
