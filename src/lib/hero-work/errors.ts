import "server-only";
import { getTranslations } from "next-intl/server";

// Erros das telas do herói independente (heroWork.errors): o banco responde por código de erro do Postgres/PostgREST.
export type HeroWorkErrorCode = "forbidden" | "not_found" | "invalid_input" | "unauthenticated" | "generic";

export function heroWorkErrorCode(error: unknown): HeroWorkErrorCode {
  if (typeof error === "string") return (["forbidden", "not_found", "invalid_input", "unauthenticated"] as const).find((c) => c === error) ?? "generic";
  const e = error as { code?: string | null; message?: string | null } | null;
  const code = e?.code ?? "";
  const message = e?.message ?? "";
  if (code === "42501" || /row-level security|forbidden|permission denied/i.test(message)) return "forbidden";
  if (code === "22023" || code === "23514" || code === "23502" || code === "22P02" || /invalid_input/.test(message)) return "invalid_input";
  if (code === "23503") return "invalid_input";
  return "generic";
}

export async function heroWorkFail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("heroWork.errors");
  return { ok: false, error: t(heroWorkErrorCode(error)) };
}
