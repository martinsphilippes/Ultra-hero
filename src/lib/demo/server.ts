import "server-only";
import { cache } from "react";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Os botões de acesso rápido só existem quando a senha das contas de demonstração está configurada.
// Ela nunca vai para o navegador: o login acontece numa server action.

/**
 * Período de demonstração encerrado (decisão do responsável, 31/10/2026): a partir daqui só contas e dados
 * reais. Com a chave ligada, o acesso rápido do /login, a restauração da agência de demonstração e o login
 * rápido do profissional ficam desligados mesmo que DEMO_ACCOUNTS_PASSWORD continue configurada.
 */
export const DEMO_ACCESS_OFF = true;

export function demoPassword(): string | null {
  if (DEMO_ACCESS_OFF) return null;
  const value = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
  return value ? value : null;
}

export function isDemoAccessEnabled(): boolean {
  return demoPassword() !== null;
}

/** O profissional de exemplo já tem a conta de acesso rápido? (0058; service role, sem dado pessoal) */
export const isProfessionalDemoReady = cache(async (): Promise<boolean> => {
  if (!hasAdminClient()) return false;
  try {
    const { data, error } = await createAdminClient().from("professionals").select("id").eq("is_demo", true).not("user_id", "is", null).limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
});

/**
 * A agência de demonstração (0064) já está pronta? Cada conta só aparece no painel quando o vínculo
 * dela existe (Adm, colaborador e dono da marca). Sem a 0064 ou sem service role: nenhuma.
 */
export const isAgencyDemoReady = cache(async (): Promise<{ agency: boolean; agencyStaff: boolean; brand: boolean; talent: boolean }> => {
  const none = { agency: false, agencyStaff: false, brand: false, talent: false };
  if (!hasAdminClient()) return none;
  try {
    const client = createAdminClient();
    const { data: agency, error } = await client.from("agencies").select("id").eq("is_demo", true).eq("status", "active").limit(1).maybeSingle();
    if (error || !agency) return none;
    const [{ data: members }, { data: brandLinks }, talents] = await Promise.all([
      client.from("agency_members").select("role").eq("agency_id", agency.id).is("revoked_at", null),
      client.from("agency_brands").select("brand_id").eq("agency_id", agency.id).eq("status", "active").eq("is_demo", true),
      // talento da talento@ (0065): sem a migração a consulta falha e o botão fica escondido
      client.from("talent_profiles").select("id").eq("agency_id", agency.id).not("user_id", "is", null).is("archived_at", null).limit(1),
    ]);
    const brandIds = (brandLinks ?? []).map((b) => b.brand_id);
    const { data: owners } = brandIds.length
      ? await client.from("brand_members").select("id").in("brand_id", brandIds).eq("role", "owner").is("revoked_at", null).limit(1)
      : { data: [] };
    const roles = new Set((members ?? []).map((m) => m.role));
    return {
      agency: roles.has("admin"),
      agencyStaff: roles.has("staff"),
      brand: (owners ?? []).length > 0,
      talent: !talents.error && (talents.data ?? []).length > 0,
    };
  } catch {
    return none;
  }
});
