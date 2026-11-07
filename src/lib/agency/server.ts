import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUser } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { agencyCan, isAgencyRole, type AgencyRole } from "./roles";

// Contexto do portal da agência (6.2): agência, papel e se quem está é o admin geral (conta real).
// A RLS é a fonte da verdade; aqui só decidimos a tela e o menu.

/** Cookie com a agência escolhida pelo admin geral (quem é membro tem uma só, D10). */
export const AGENCY_COOKIE = "uh-agency";

export type AgencySummary = {
  id: string;
  slug: string;
  name: string;
  status: string;
  isDemo: boolean;
  timezone: string;
  relationshipAlertDays: number;
  contactEmail: string | null;
};

export type AgencyContext =
  | { state: "unavailable" }
  | { state: "demo_forbidden" }
  | { state: "none"; platformAdmin: boolean }
  | {
      state: "ok";
      agency: AgencySummary;
      role: AgencyRole | null;
      platformAdmin: boolean;
      agencies: AgencySummary[];
      memberName: string | null;
      memberTitle: string | null;
      /** 0125: cadastro PJ do colaborador (CNPJ, nível, termo). Null para o admin da plataforma sem vínculo. */
      memberProfile: { cnpj: string | null; level: string | null; termsVersion: string | null } | null;
    };

const AGENCY_SELECT = "id, slug, name, status, is_demo, timezone, relationship_alert_days, contact_email";

type AgencyRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  is_demo: boolean;
  timezone: string;
  relationship_alert_days: number;
  contact_email: string | null;
};

export function toAgency(row: AgencyRow): AgencySummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    isDemo: row.is_demo,
    timezone: row.timezone,
    relationshipAlertDays: row.relationship_alert_days,
    contactEmail: row.contact_email,
  };
}

export const getAgencyContext = cache(async (): Promise<AgencyContext> => {
  const user = await getUser();
  if (!user) return { state: "none", platformAdmin: false };
  try {
    const supabase = await createClient();
    // velocidade: as três consultas saem juntas e a agência vem embutida no vínculo (uma ida ao banco, não três)
    const [{ data: platformAdmin, error: adminError }, { data: demo }, { data: member, error: memberError }] = await Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.rpc("is_demo_account"),
      supabase
        .from("agency_members")
        .select(`agency_id, role, display_name, job_title, cnpj, level, terms_version, agency:agencies!agency_members_agency_fk(${AGENCY_SELECT})`)
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle(),
    ]);
    if (adminError) return isMissingSchema(adminError) ? { state: "unavailable" } : { state: "none", platformAdmin: false };
    if (memberError && isMissingSchema(memberError)) return { state: "unavailable" };

    if (member && isAgencyRole(member.role)) {
      const embedded = (member as { agency?: AgencyRow | AgencyRow[] | null }).agency;
      const agencyRow = Array.isArray(embedded) ? embedded[0] : embedded;
      if (!agencyRow) return { state: "none", platformAdmin: Boolean(platformAdmin) };
      const agency = toAgency(agencyRow as AgencyRow);
      const m = member as { cnpj?: string | null; level?: string | null; terms_version?: string | null };
      return {
        state: "ok",
        agency,
        role: member.role,
        platformAdmin: Boolean(platformAdmin),
        agencies: [agency],
        memberName: member.display_name,
        memberTitle: member.job_title,
        memberProfile: { cnpj: m.cnpj ?? null, level: m.level ?? null, termsVersion: m.terms_version ?? null },
      };
    }

    if (platformAdmin) {
      const { data: rows } = await supabase.from("agencies").select(AGENCY_SELECT).order("is_demo").order("name");
      const agencies = ((rows ?? []) as AgencyRow[]).map(toAgency);
      if (agencies.length === 0) return { state: "none", platformAdmin: true };
      const chosen = (await cookies()).get(AGENCY_COOKIE)?.value;
      const agency = agencies.find((a) => a.id === chosen) ?? agencies[0];
      return { state: "ok", agency, role: null, platformAdmin: true, agencies, memberName: null, memberTitle: null, memberProfile: null };
    }
    // conta demo com papel admin e sem vínculo (admin@demo): nada da agência real (D6)
    if (demo) return { state: "demo_forbidden" };
    return { state: "none", platformAdmin: false };
  } catch {
    return { state: "unavailable" };
  }
});

export type ReadyAgencyContext = Extract<AgencyContext, { state: "ok" }>;

/** Exige o papel mínimo na agência; sem ele volta ao Início do portal (no servidor, não só no menu). */
export async function requireAgency(min: AgencyRole = "staff"): Promise<ReadyAgencyContext> {
  const ctx = await getAgencyContext();
  if (ctx.state !== "ok") redirect("/agencia");
  if (!agencyCan(ctx.role, min, ctx.platformAdmin)) redirect("/agencia");
  return ctx;
}
