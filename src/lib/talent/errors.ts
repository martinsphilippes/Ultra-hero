import "server-only";
import { getTranslations } from "next-intl/server";
import { talentErrorCode } from "./error-codes";

export { TALENT_ERROR_CODES, talentErrorCode, type TalentErrorCode } from "./error-codes";

export async function talentFail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("talent.errors");
  return { ok: false, error: t(talentErrorCode(error)) };
}
