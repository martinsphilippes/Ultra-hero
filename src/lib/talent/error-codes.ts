import { agencyErrorCode } from "@/lib/agency/error-codes";

// Erros do escritório do creator (talent.errors): textos sem "demonstração" (namespace do app das lojas).
// Lógica pura (testável); a tradução fica em ./errors.ts.
export const TALENT_ERROR_CODES = ["consent_required", "demo_locked", "duplicate_network", "too_many_networks", "note_required", "invalid_state", "invalid_stage", "forbidden", "not_found", "unauthenticated", "invalid_input"] as const;
export type TalentErrorCode = (typeof TALENT_ERROR_CODES)[number] | "generic";

export function talentErrorCode(error: unknown): TalentErrorCode {
  const code = agencyErrorCode(error);
  return (TALENT_ERROR_CODES as readonly string[]).includes(code) ? (code as TalentErrorCode) : "generic";
}
