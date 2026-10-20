import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Kill switch "experiment.open". Quem decide é o banco (trigger handle_new_user, 0015):
// fechado, só cria conta quem está na lista de bootstrap ou tem convite pendente.
// Aqui ficam apenas leitura (para avisar na interface) e tradução dos erros do Auth.

/** Interpreta o retorno de public_settings(). Setting ausente ou ilegível = aberto. */
export function isExperimentOpen(settings: unknown): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return true;
  const value = (settings as Record<string, unknown>)["experiment.open"];
  return !(value === false || value === "false");
}

/** Lê public_settings() (anon/authenticated). Em erro, assume aberto: o banco continua barrando. */
export async function readExperimentOpen(supabase: SupabaseClient<Database>): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("public_settings");
    if (error) return true;
    return isExperimentOpen(data);
  } catch {
    return true;
  }
}

type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

// O Supabase Auth não repassa a mensagem do trigger: responde 500 "Database error saving new user"
// (ou "...creating new user" no Admin API), code "unexpected_failure".
const DB_SIGNUP_ERROR = /database error (saving|creating) new user|experiment_closed/i;

/** Erro do Auth que indica recusa do banco ao criar o usuário (candidato a experiment_closed). */
export function isSignupRefusedByDatabase(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.message && DB_SIGNUP_ERROR.test(error.message)) return true;
  return error.code === "unexpected_failure" && (error.status === undefined || error.status >= 500);
}

/** Mesmo diagnóstico para o retorno do OAuth (?error=…&error_code=…&error_description=…). */
export function isOAuthSignupRefused(params: URLSearchParams): boolean {
  const description = params.get("error_description") ?? "";
  if (DB_SIGNUP_ERROR.test(description)) return true;
  return params.get("error_code") === "unexpected_failure";
}

/** Conta suspensa (ban do Auth Admin API) no retorno do OAuth. */
export function isOAuthUserBanned(params: URLSearchParams): boolean {
  return params.get("error_code") === "user_banned" || /user is banned/i.test(params.get("error_description") ?? "");
}
