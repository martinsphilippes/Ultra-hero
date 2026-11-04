// Regra pura do interruptor "Convites ativos" (0103): o resultado de invites_enabled() vira ligado/desligado.
// Só `false` explícito desliga; erro, RPC ausente ou resposta estranha = ligado (o banco segue barrando de verdade).
export function invitesEnabledFrom(result: { data: unknown; error: unknown }): boolean {
  if (result.error) return true;
  return result.data !== false;
}

/** Código que o banco devolve quando alguém tenta criar convite com o interruptor desligado. */
export const INVITES_DISABLED_CODE = "invites_disabled";

export function isInvitesDisabledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  return message.includes(INVITES_DISABLED_CODE);
}
