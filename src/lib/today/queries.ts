import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import type { BrandWorkboard, TalentTodayData } from "./logic";
import { toBrandWorkboard, toTalentToday } from "./normalize";

// Leituras fechadas da 0078 (brand_workboard / talent_today). O banco decide o escopo; aqui só se chama.

export async function getBrandWorkboard(brandId: string): Promise<{ available: boolean; data: BrandWorkboard | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_workboard", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toBrandWorkboard(data) };
}

export async function getTalentToday(): Promise<{ available: boolean; data: TalentTodayData | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_today");
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toTalentToday(data) };
}
