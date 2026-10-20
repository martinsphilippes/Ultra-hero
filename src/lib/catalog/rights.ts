// Direitos de nome e imagem por personalidade (RF-003, RF-004, RB-05). Regra pura, usada na
// página pública e no card: nunca apresenta como autorizado o que não está documentado e válido.

export type RightsStatus = "fictional" | "authorized" | "pending";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Estado exibido ao público: autorização vencida (rights_valid_until < hoje) volta a "em validação". */
export function effectiveRightsStatus(status: string | null | undefined, validUntil: string | null | undefined, today: Date = new Date()): RightsStatus {
  if (status === "authorized") {
    if (validUntil) {
      const m = ISO_DATE.exec(validUntil);
      if (!m) return "pending";
      const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      if (end < todayUtc) return "pending";
    }
    return "authorized";
  }
  if (status === "pending") return "pending";
  return "fictional";
}

/** O selo "personagem fictício" só sai quando o uso está autorizado e válido. */
export function showsFictionalBadge(status: RightsStatus): boolean {
  return status !== "authorized";
}
