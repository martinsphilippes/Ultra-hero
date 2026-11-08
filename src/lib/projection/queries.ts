import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type CampaignProjection, parseProjection } from "./campaign";

/** Projeção de campanhas (0139): agência (agencyId) ou Hero (null); ano ou null para o total. null = sem acesso. */
export async function loadCampaignProjection(agencyId: string | null, year: number | null): Promise<CampaignProjection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaign_projection", { p_agency: agencyId ?? undefined, p_year: year ?? undefined });
  if (error) return null;
  return parseProjection(data);
}
