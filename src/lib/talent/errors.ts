import "server-only";
import { getTranslations } from "next-intl/server";
import { agencyErrorCode } from "@/lib/agency/error-codes";

// Erros do escritório do creator (talent.errors): textos sem "demonstração" (namespace do app das lojas).
export const TALENT_ERROR_CODES = ["consent_required", "demo_locked", "duplicate_network", "too_many_networks", "forbidden", "not_found", "unauthenticated", "invalid_input"] as const;
export type TalentErrorCode = (typeof TALENT_ERROR_CODES)[number] | "generic";

export function talentErrorCode(error: unknown): TalentErrorCode {
  const code = agencyErrorCode(error);
  return (TALENT_ERROR_CODES as readonly string[]).includes(code) ? (code as TalentErrorCode) : "generic";
}

export async function talentFail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("talent.errors");
  return { ok: false, error: t(talentErrorCode(error)) };
}
