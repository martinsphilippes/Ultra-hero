import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { generatePassword } from "./generated-password";
import { isPasswordVaultConfigured, openPassword, sealPassword } from "./password-crypto";
import { QUICK_SIGNUP_LIMITS, quickSignupRateLimited } from "./quick-signup";

// Cadastro rápido e cofre da senha gerada: tudo pelo service role (as tabelas da 0046 não têm
// acesso nenhum pela API). Nunca registre senha, e-mail, celular ou IP em log.

type Admin = SupabaseClient<Database>;
type PgError = { code?: string; message?: string } | null | undefined;

/** Tabela/coluna da 0046 ausente (banco remoto ainda sem a migração). */
export function isMissingSchema(error: PgError): boolean {
  if (!error) return false;
  if (error.code && ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)) return true;
  return /does not exist|could not find the .*(table|column)/i.test(error.message ?? "");
}

export type QuickSignupAvailability = "ok" | "no_service_role" | "schema_missing";

let cached: { at: number; value: QuickSignupAvailability } | null = null;

/** O cadastro rápido depende do service role e da 0046; consulta leve, memorizada por 60 s. */
export async function quickSignupAvailability(): Promise<QuickSignupAvailability> {
  if (!hasAdminClient()) return "no_service_role";
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let value: QuickSignupAvailability = "ok";
  try {
    const { error } = await createAdminClient().from("user_generated_passwords").select("user_id", { head: true, count: "exact" }).limit(1);
    if (error) value = isMissingSchema(error) ? "schema_missing" : "ok";
  } catch {
    value = "ok"; // rede instável: deixa a action tentar e responder
  }
  cached = { at: Date.now(), value };
  return value;
}

/** IP do cliente (Vercel/proxy põem o real no começo de x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** HMAC (chave do servidor) para guardar IP/e-mail sem o valor puro. */
export function hashForRateLimit(kind: "ip" | "email", value: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""): string {
  return createHmac("sha256", secret || "ultra-hero").update(`quick-signup:${kind}:${value}`).digest("hex");
}

/** Conta tentativas na janela e registra esta. Limpa o que tem mais de 1 dia (melhor esforço). */
export async function recordQuickSignupAttempt(admin: Admin, ipHash: string, emailHash: string): Promise<"ok" | "limited" | "schema_missing" | "error"> {
  const since = new Date(Date.now() - QUICK_SIGNUP_LIMITS.windowMinutes * 60_000).toISOString();
  const [byIp, byEmail] = await Promise.all([
    admin.from("quick_signup_attempts").select("id", { head: true, count: "exact" }).eq("ip_hash", ipHash).gte("created_at", since),
    admin.from("quick_signup_attempts").select("id", { head: true, count: "exact" }).eq("email_hash", emailHash).gte("created_at", since),
  ]);
  const err = byIp.error ?? byEmail.error;
  if (err) return isMissingSchema(err) ? "schema_missing" : "error";
  if (quickSignupRateLimited({ ip: byIp.count ?? 0, email: byEmail.count ?? 0 })) return "limited";
  const { error } = await admin.from("quick_signup_attempts").insert({ ip_hash: ipHash, email_hash: emailHash });
  if (error) return isMissingSchema(error) ? "schema_missing" : "error";
  // o resultado não importa: o que sobrar sai na próxima tentativa
  await admin.from("quick_signup_attempts").delete().lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return "ok";
}

/** Grava a senha cifrada. false = cofre desligado (sem chave) ou falha: a senha não fica consultável. */
export async function storeGeneratedPassword(admin: Admin, userId: string, password: string): Promise<boolean> {
  if (!isPasswordVaultConfigured()) return false;
  try {
    const { ciphertext, keyVersion } = sealPassword(password, userId);
    const { error } = await admin
      .from("user_generated_passwords")
      .upsert({ user_id: userId, ciphertext, key_version: keyVersion, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.warn("[quick-signup] senha não guardada:", error.code ?? "erro");
    return !error;
  } catch {
    console.warn("[quick-signup] senha não guardada: cifra indisponível");
    return false;
  }
}

/** Apaga a senha guardada (a pessoa escolheu outra pela recuperação por e-mail). Melhor esforço. */
export async function forgetGeneratedPassword(admin: Admin, userId: string): Promise<void> {
  await admin.from("user_generated_passwords").delete().eq("user_id", userId);
}

export type StoredPasswordState = { status: "ok"; password: string } | { status: "none" } | { status: "unavailable" };

/** Lê e decifra a senha guardada DA PESSOA INDICADA (quem chama garante que é a da sessão). */
export async function readGeneratedPassword(admin: Admin, userId: string): Promise<StoredPasswordState> {
  if (!isPasswordVaultConfigured()) return { status: "unavailable" };
  const { data, error } = await admin.from("user_generated_passwords").select("ciphertext, key_version").eq("user_id", userId).maybeSingle();
  if (error) return { status: "unavailable" };
  if (!data) return { status: "none" };
  try {
    return { status: "ok", password: openPassword(data.ciphertext, userId, data.key_version) };
  } catch {
    // chave antiga removida ou dado corrompido: trata como indisponível (a pessoa pode gerar outra)
    return { status: "unavailable" };
  }
}

/** Existe senha guardada? (sem decifrar) */
export async function hasGeneratedPassword(admin: Admin, userId: string): Promise<boolean | null> {
  const { data, error } = await admin.from("user_generated_passwords").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return null;
  return Boolean(data);
}

/**
 * Troca a senha da conta por uma nova gerada e guarda cifrada. `appMetadata` (opcional) é gravado junto.
 * Devolve a senha nova (e se ficou guardada), ou null se o Auth recusar. Quem chama mostra a senha
 * mesmo quando `stored` é false: a conta já está com ela.
 */
export async function rotateGeneratedPassword(
  admin: Admin,
  userId: string,
  appMetadata?: Record<string, unknown>,
): Promise<{ password: string; stored: boolean } | null> {
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password, ...(appMetadata ? { app_metadata: appMetadata } : {}) });
  if (error) return null;
  const stored = await storeGeneratedPassword(admin, userId, password);
  // senha antiga guardada não vale mais: sem cofre, apaga para não mostrar a errada
  if (!stored) await forgetGeneratedPassword(admin, userId);
  return { password, stored };
}

/** Conta de demonstração: senha compartilhada, nunca trocada pelo app. */
export function isDemoUser(user: { email?: string | null; app_metadata?: Record<string, unknown> | null }, demoEmails: readonly string[]): boolean {
  if (user.app_metadata?.ultra_hero_demo === true) return true;
  const email = user.email?.toLowerCase();
  return Boolean(email && demoEmails.includes(email));
}
