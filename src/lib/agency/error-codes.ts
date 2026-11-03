// Códigos de erro das RPCs do módulo (lógica pura, testável).
export const AGENCY_ERROR_CODES = [
  // sugerir heróis no negócio (0093)
  "invalid_hero_name",
  "invalid_profile_ref",
  "too_many_new_talents",
  // convites por papel, equipe do herói e primeiro acesso (0091)
  "admin_invite_max_48h",
  "admin_confirm_required",
  "invalid_role",
  "creator_role_required",
  "has_hero",
  "owner_must_transfer",
  "onboarding_not_found",
  "invalid_cnpj",
  "creator_profile_already_linked",
  "professional_profile_already_linked",
  "invitation_email_mismatch",
  "invitation_expired",
  "creator_already_in_casting",
  "user_has_talent",
  "talent_has_login",
  "talent_has_creator",
  // login do creator com herói ligado (0087)
  "creator_has_login",
  "hero_invite_pending",
  "partner_suspended",
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
  // oferta e contraproposta (0079)
  "exclusivity_conflict",
  "counteroffer_open",
  // briefing, checklists e modelos (0080)
  "checklist_incomplete",
  "limit_reached",
  // pré-seleção, aprovação interna e nota (0081)
  "approval_required",
  "awaiting_approval",
  "already_rated",
  // verba, nota fiscal e pagamento (0082)
  "invoice_open",
  "invalid_date",
  // biblioteca, métricas, vendas e músicas (0083)
  "coupon_taken",
  // assinatura eletrônica dos termos (0084)
  "signature_required",
  "already_signed",
  "terms_changed",
  "invalid_tax_id",
  "name_required",
  // oportunidade de patrocínio (0085)
  "deadline_passed",
  "already_responded",
  "not_interested",
  // cotas e negociação do patrocínio (0088)
  "tier_full",
  "already_agreed",
  "already_negotiating",
  "has_agreement",
  // chamada da marca (0089)
  "call_incomplete",
  "amount_required",
  // pedido de alteração de verba e pagamentos da marca (0090)
  "budget_locked",
  "change_open",
  "reason_required",
  "no_change",
  "installments_sum",
  "payment_open",
  "invalid_pix_key",
  "invalid_bank",
  "payment_method_required",
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

