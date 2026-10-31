// Códigos de erro das RPCs do módulo (lógica pura, testável).
export const AGENCY_ERROR_CODES = [
  "creator_already_in_casting",
  "user_has_talent",
  "talent_has_login",
  "talent_has_creator",
  "talent_already_linked",
  "talent_archived",
  "too_many_segments",
  "too_many_networks",
  "duplicate_network",
  "consent_required",
  "invalid_file_type",
  "file_too_large",
  "file_missing",
  "invalid_state",
  // núcleo comercial (0066)
  "request_incomplete",
  "note_required",
  "stage_gate",
  "invalid_stage",
  "fee_missing",
  "no_talents",
  "schedule_conflict",
  "deliverables_open",
  // execução (0068)
  "terms_missing",
  "acceptance_missing",
  // financeiro e patrocínio (0069)
  "finance_identity",
  "brand_inactive",
  "no_hero",
  "reservation_expired",
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

