import "server-only";
import { getTranslations } from "next-intl/server";
import { parseActionError } from "./errors";

// Traduz o código de erro no servidor: a UI (inclusive ConfirmActionDialog) exibe o texto pronto.
export async function translateError(error: unknown): Promise<string> {
  const t = await getTranslations("adminContent.errors");
  const { code, detail } = parseActionError(error);
  if (code === "cannot_publish_missing") {
    const fields = (detail ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => (t.has(`fields.${f}`) ? t(`fields.${f}`) : f))
      .join(", ");
    return t("cannot_publish_missing", { fields });
  }
  return t.has(code) ? t(code) : t("generic");
}

export async function failWith(error: unknown): Promise<{ ok: false; error: string }> {
  return { ok: false, error: await translateError(error) };
}
