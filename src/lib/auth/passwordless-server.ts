import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hashForRateLimit, recordQuickSignupAttempt } from "./quick-signup-server";
import { PASSWORDLESS_LIMITS } from "./passwordless";

// Entrar só com o e-mail (período do evento, ver passwordless.ts). Tudo pelo service role, sem enviar e-mail:
// 1. generateLink tipo 'recovery' — devolve o usuário e o hashed_token, e FALHA para e-mail sem conta (o tipo
//    'magiclink' criaria a conta sozinho para e-mail desconhecido, pulando o cadastro e o kill switch);
// 2. conta suspensa (ban no Auth) é recusada; administrador da plataforma (role_assignments 'admin' ativo) exige
//    senha — se a consulta falhar, trata como admin (falha fechada);
// 3. verifyOtp com o cliente SSR (cookies) abre a sessão neste aparelho.
// Nunca registra e-mail, IP ou token em log.

type Admin = SupabaseClient<Database>;
type Server = SupabaseClient<Database>;

export type PasswordlessResult = "ok" | "not_found" | "admin" | "suspended" | "limited" | "unavailable" | "error";

function isSuspended(user: Pick<User, "banned_until"> & { banned_until?: string | null }): boolean {
  const until = user.banned_until;
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isNaN(t) || t > Date.now();
}

/** Administrador da plataforma ou a Presidência (quem aprova os cadastros, 0141)? Falha fechada (erro = sim). */
export async function isPlatformAdmin(admin: Admin, userId: string): Promise<boolean> {
  const { data, error } = await admin.from("role_assignments").select("user_id").eq("user_id", userId).eq("role", "admin").is("revoked_at", null).limit(1);
  if (error) return true;
  if ((data ?? []).length > 0) return true;
  const approver = await admin.from("access_approvers").select("user_id").eq("user_id", userId).limit(1);
  // sem a tabela (antes da 0141) não há Presidência; outro erro = fecha
  if (approver.error) return !/access_approvers|does not exist|42P01|PGRST205/i.test(`${approver.error.message} ${approver.error.code}`);
  return (approver.data ?? []).length > 0;
}

/** Limite próprio do "entrar sem senha" (namespace separado do cadastro rápido). */
export async function recordPasswordlessAttempt(admin: Admin, ip: string, email: string): Promise<"ok" | "limited" | "unavailable"> {
  const r = await recordQuickSignupAttempt(admin, hashForRateLimit("ip", `passwordless:${ip}`), hashForRateLimit("email", `passwordless:${email}`), PASSWORDLESS_LIMITS);
  if (r === "limited") return "limited";
  return r === "ok" ? "ok" : "unavailable";
}

/**
 * Abre a sessão (cookies de `supabase`) para a conta do e-mail, sem senha. Não aplica limite (quem chama aplica).
 * `not_found`: não há conta com o e-mail; `admin`: a conta precisa de senha.
 */
export async function signInWithoutPassword(admin: Admin, supabase: Server, email: string): Promise<PasswordlessResult> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.user || !data.properties?.hashed_token) {
    if (error && (error.status === 404 || error.code === "user_not_found")) return "not_found";
    if (error?.status === 429) return "limited";
    return "error";
  }
  if (isSuspended(data.user as User & { banned_until?: string | null })) return "suspended";
  if (await isPlatformAdmin(admin, data.user.id)) return "admin";

  await supabase.auth.signOut({ scope: "local" });
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: data.properties.hashed_token });
  if (verifyError) {
    if (verifyError.code === "user_banned") return "suspended";
    return "error";
  }
  // marca o método (sem dado pessoal) para auditoria/consulta posterior; melhor esforço
  try {
    await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { last_login_method: "email_only" } });
  } catch {
    // ignora
  }
  return "ok";
}
