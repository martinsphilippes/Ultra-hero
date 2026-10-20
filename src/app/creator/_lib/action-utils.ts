import { rpcErrorCode } from "@/lib/supabase/helpers";

// Normaliza erros do Postgres/PostgREST para códigos curtos que a UI traduz.
export type ActionFailure = { ok: false; error: string };

export function failFrom(error: { message?: string; code?: string } | string | null | undefined): ActionFailure {
  const message = typeof error === "string" ? error : (error?.message ?? "");
  const code = typeof error === "string" ? undefined : error?.code;
  if (code === "23505") return { ok: false, error: "duplicate" };
  if (message.startsWith("protected_column")) return { ok: false, error: message.replace(/\s+/g, " ").trim() };
  if (/row-level security/i.test(message)) return { ok: false, error: "forbidden" };
  return { ok: false, error: rpcErrorCode(message) || "generic" };
}
