import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import {
  toAgencyBrandCallDetail,
  toAgencyBrandCalls,
  toAgencyOptions,
  toBrandCallDetail,
  toBrandCalls,
  toTalentBrandCalls,
  type AgencyBrandCallDetail,
  type AgencyBrandCallRow,
  type AgencyOption,
  type BrandCallDetail,
  type BrandCallRow,
  type TalentBrandCall,
} from "./logic";

// Leituras fechadas da chamada da marca (0089): o banco decide o escopo (a própria marca; gestor+ da agência do
// alvo, valor só para o Adm; o creator da agência do alvo, sem valor). Sem a migração: { available: false }.
// 0140: a forma de pagamento vem junto (sem os números para quem não lê valores).

const UUID = /^[0-9a-f-]{36}$/i;

export async function listBrandCalls(brandId: string): Promise<{ available: boolean; items: BrandCallRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_calls_list", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toBrandCalls(data) };
}

export async function getBrandCall(id: string): Promise<BrandCallDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_call_detail", { p_id: id });
  if (error) return null;
  return toBrandCallDetail(data);
}

export async function listCallAgencyOptions(brandId: string): Promise<AgencyOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_call_agency_options", { p_brand: brandId });
  if (error) return [];
  return toAgencyOptions(data);
}

/** canValues = false (gestor): a forma de pagamento (0140) volta sem os números, mesmo que o banco os mande. */
export async function listAgencyBrandCalls(agencyId: string, opts: { canValues?: boolean } = {}): Promise<{ available: boolean; items: AgencyBrandCallRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_brand_calls", { p_agency: agencyId });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toAgencyBrandCalls(data, opts.canValues ?? true) };
}

export async function getAgencyBrandCall(id: string, agencyId: string): Promise<AgencyBrandCallDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_brand_call_detail", { p_id: id, p_agency: agencyId });
  if (error) return null;
  return toAgencyBrandCallDetail(data);
}

export async function listTalentBrandCalls(): Promise<{ available: boolean; items: TalentBrandCall[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_brand_calls");
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toTalentBrandCalls(data) };
}
