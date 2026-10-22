// Credenciais do chef (P7): situação do pedido na fila do admin. Regra pura (testada no Vitest).

export type CredentialsRequest = { text: string; updated_at: string };
export type CredentialsProfile = { credentials: string | null; credentials_approved_at: string | null };
export type CredentialsDecisionAudit = { after_data: { approved?: boolean } | null; created_at: string };
export type CredentialsState = "pending" | "approved" | "rejected";

/**
 * Aprovado quando o perfil público tem exatamente o texto pedido com data de aprovação; reprovado
 * quando a última decisão (admin_audit "creator.credentials") foi "não" depois da última edição do
 * pedido; senão aguardando (pedido novo ou editado depois da decisão).
 */
export function credentialsState(request: CredentialsRequest, profile: CredentialsProfile | undefined, lastDecision: CredentialsDecisionAudit | undefined): CredentialsState {
  if (profile?.credentials_approved_at && profile.credentials === request.text.trim()) return "approved";
  if (lastDecision && lastDecision.after_data?.approved === false && Date.parse(lastDecision.created_at) >= Date.parse(request.updated_at)) return "rejected";
  return "pending";
}

export const SPECIALTIES_MAX = 6;
export const SPECIALTY_MAX_LENGTH = 40;
export const CREDENTIALS_MAX_LENGTH = 300;
