import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import {
  toAgencySponsorshipDetail,
  toAgencySponsorships,
  toBrandSponsorships,
  toTalentSponsorships,
  type AgencySponsorshipDetail,
  type AgencySponsorshipRow,
  type BrandSponsorship,
  type TalentSponsorship,
} from "./vocab";

// Leituras fechadas da 0085 (o banco decide o escopo: gestor+ da agência, marca do público, o próprio creator).
// Sem a migração: { available: false }.

const UUID = /^[0-9a-f-]{36}$/i;

export async function listAgencySponsorships(agencyId: string): Promise<{ available: boolean; items: AgencySponsorshipRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_sponsorships", { p_agency: agencyId });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toAgencySponsorships(data) };
}

export async function getAgencySponsorship(id: string): Promise<AgencySponsorshipDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_sponsorship_detail", { p_id: id });
  if (error) return null;
  return toAgencySponsorshipDetail(data);
}

export async function listBrandSponsorships(brandId: string): Promise<{ available: boolean; items: BrandSponsorship[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_sponsorships", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toBrandSponsorships(data) };
}

export async function listTalentSponsorships(): Promise<{ available: boolean; items: TalentSponsorship[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_sponsorships");
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toTalentSponsorships(data) };
}
