import "server-only";
import { cache } from "react";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import type { Availability } from "./vocab";

// Contexto do escritório do creator (6.4). O creator NÃO lê talent_profiles: tudo vem de
// talent_my_context() (lista fechada de campos, 0065). Sem a migração no remoto: "unavailable".

export type TalentSelf = {
  id: string;
  displayName: string;
  city: string | null;
  state: string | null;
  availability: Availability;
  availabilityNote: string;
  consentAt: string | null;
  consentVersion: string | null;
  consentRevokedAt: string | null;
  catalogVisible: boolean;
  hasPublicPage: boolean;
  agency: string;
  agencyIsDemo: boolean;
  manager: string | null;
};

export type TalentContext = { state: "unavailable" } | { state: "none" } | { state: "ok"; talent: TalentSelf };

type ContextRow = {
  id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  availability: Availability;
  availability_note: string;
  consent_at: string | null;
  consent_version: string | null;
  consent_revoked_at: string | null;
  catalog_visible: boolean;
  has_public_page: boolean;
  agency: string;
  agency_is_demo: boolean;
  manager: string | null;
};

export function toTalentSelf(row: ContextRow): TalentSelf {
  return {
    id: row.id,
    displayName: row.display_name,
    city: row.city,
    state: row.state,
    availability: row.availability,
    availabilityNote: row.availability_note ?? "",
    consentAt: row.consent_at,
    consentVersion: row.consent_version,
    consentRevokedAt: row.consent_revoked_at,
    catalogVisible: row.catalog_visible,
    hasPublicPage: row.has_public_page,
    agency: row.agency,
    agencyIsDemo: row.agency_is_demo,
    manager: row.manager,
  };
}

/** Consentimento vigente (aceito e não revogado). */
export function consentActive(t: Pick<TalentSelf, "consentAt" | "consentRevokedAt">): boolean {
  return Boolean(t.consentAt) && !t.consentRevokedAt;
}

export const getTalentContext = cache(async (): Promise<TalentContext> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_my_context");
  if (error) return isMissingSchema(error) ? { state: "unavailable" } : { state: "none" };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { state: "none" };
  return { state: "ok", talent: toTalentSelf(data as unknown as ContextRow) };
});
