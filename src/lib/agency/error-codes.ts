// Códigos de erro das RPCs do módulo (lógica pura, testável).
export const AGENCY_ERROR_CODES = [
  "demo_account_forbidden",
  "demo_locked",
  "demo_brand",
  "demo_limit",
  "brand_linked_elsewhere",
  "brand_linked_to_agency",
  "brand_has_members",
  "brand_has_documents",
  "brand_not_linked",
  "last_agency_admin",
  "last_brand_owner",
  "agency_member_elsewhere",
  "already_member",
  "justification_required",
  "invitation_invalid",
  "invalid_email",
  "invalid_timezone",
  "invalid_url",
  "invalid_image",
  "duplicate_slug",
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_input",
] as const;
export type AgencyErrorCode = (typeof AGENCY_ERROR_CODES)[number] | "generic";

/** Código conhecido a partir da mensagem do erro (a mais específica primeiro). */
export function agencyErrorCode(error: unknown): AgencyErrorCode {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  const code = AGENCY_ERROR_CODES.find((c) => message.includes(c));
  if (code) return code;
  return message.includes("_check") || message.includes("violates") ? "invalid_input" : "generic";
}

