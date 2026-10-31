import "server-only";
import { getTranslations } from "next-intl/server";
import { agencyErrorCode } from "./error-codes";

export { AGENCY_ERROR_CODES, agencyErrorCode, type AgencyErrorCode } from "./error-codes";

// Erro de RPC → mensagem traduzida em agency.errors.
export async function agencyFail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("agency.errors");
  return { ok: false, error: t(agencyErrorCode(error)) };
}
