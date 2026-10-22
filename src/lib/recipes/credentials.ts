// Credenciais do chef (P7): situação do pedido na fila do admin. Regra pura (testada no Vitest).

/** `decision` vem do próprio pedido desde a 0032 (o herói lê; editar o texto limpa). */
export type CredentialsRequest = { text: string; updated_at: string; decision?: string | null };
export type CredentialsProfile = { credentials: string | null; credentials_approved_at: string | null };
export type CredentialsDecisionAudit = { after_data: { approved?: boolean } | null; created_at: string };
export type CredentialsState = "pending" | "approved" | "rejected";

/**
 * Aprovado quando o perfil público tem exatamente o texto pedido com data de aprovação; reprovado
 * quando o pedido marca "rejected" (0032) ou, para decisões antigas e no banco sem a 0032, quando a
 * última decisão (admin_audit "creator.credentials", só o admin lê) foi "não" depois da última
 * edição do pedido; senão aguardando (pedido novo ou editado depois da decisão).
 */
export function credentialsState(request: CredentialsRequest, profile: CredentialsProfile | undefined, lastDecision: CredentialsDecisionAudit | undefined): CredentialsState {
  if (profile?.credentials_approved_at && profile.credentials === request.text.trim()) return "approved";
  if (request.decision === "rejected") return "rejected";
  if (lastDecision && lastDecision.after_data?.approved === false && Date.parse(lastDecision.created_at) >= Date.parse(request.updated_at)) return "rejected";
  return "pending";
}

export const SPECIALTIES_MAX = 6;
export const SPECIALTY_MAX_LENGTH = 40;
export const CREDENTIALS_MAX_LENGTH = 300;
