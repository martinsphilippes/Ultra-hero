"use server";

import type { AuthError } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSignupRefusedByDatabase, readExperimentOpen } from "@/lib/auth/experiment";
import { generatePassword } from "@/lib/auth/generated-password";
import { acceptMyInvitations, hasPendingInvitation } from "@/lib/auth/invite-first-access";
import { getOrigin } from "@/lib/auth/origin";
import { HONEYPOT_FIELD, QUICK_SIGNUP_PENDING_COOKIE, quickSignupSchema } from "@/lib/auth/quick-signup";
import { clientIp, forgetGeneratedPassword, hashForRateLimit, isMissingSchema, recordQuickSignupAttempt, storeGeneratedPassword } from "@/lib/auth/quick-signup-server";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import type { AuthActionState, AuthField, AuthFieldErrors, QuickSignupState } from "@/lib/auth/types";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Mensagens dos schemas são CHAVES de auth.errors.*, traduzidas no cliente.
const emailSchema = z.string({ error: "required" }).trim().toLowerCase().min(1, { error: "required" }).max(254, { error: "invalidEmail" }).pipe(z.email({ error: "invalidEmail" }));

const passwordSchema = z.string({ error: "required" }).min(8, { error: "passwordTooShort" }).max(72, { error: "passwordTooLong" });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "required" }).min(1, { error: "required" }).max(72, { error: "passwordTooLong" }),
});

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string({ error: "required" }) })
  .refine((data) => data.password === data.confirmPassword, { error: "passwordsDontMatch", path: ["confirmPassword"] });

const FIELDS: readonly AuthField[] = ["email", "password", "confirmPassword", "fullName", "phone"];

function toFieldErrors(error: z.ZodError): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && (FIELDS as readonly string[]).includes(field) && !errors[field as AuthField]) {
      errors[field as AuthField] = issue.message;
    }
  }
  return errors;
}

// Mapeia erros do Supabase para chaves genéricas (não revela se o e-mail existe).
function mapAuthError(error: AuthError): string {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return "tooManyRequests";
  }
  switch (error.code) {
    case "invalid_credentials":
    case "email_not_confirmed":
    case "user_not_found":
      return "invalidCredentials";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "provider_disabled":
    case "oauth_provider_not_supported":
      return "providerUnavailable";
    case "session_not_found":
    case "session_expired":
      return "sessionRequired";
    case "user_banned":
      return "accountSuspended";
    default:
      return "unknown";
  }
}

export async function loginAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const next = safeNext(formData.get("next"), LOGIN_HOME);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // e-mail convidado sem conta: o primeiro acesso cria a conta com a senha digitada (0077)
    if (error.code === "invalid_credentials") {
      const firstAccess = await inviteFirstAccess(parsed.data.email, parsed.data.password);
      if (firstAccess) return firstAccess;
    }
    return { status: "error", error: mapAuthError(error) };
  }

  // convites pendentes do e-mail da conta entram junto com o login
  redirect(afterInvites(next, await acceptMyInvitations(supabase)));
}

// Depois de aceitar convite(s), abre a área deles (agência, marca…) em vez da tela padrão. Vindo do link
// do convite, a página do convite diria "já usado": também vai direto para a área.
function afterInvites(next: string, home: string | null): string {
  if (!home) return next;
  return next === LOGIN_HOME || next === "/invite" || next.startsWith("/invite?") ? home : next;
}

/**
 * Primeiro acesso do convidado: só quando há convite pendente e válido para o e-mail e ainda não existe
 * conta. A senha digitada vira a senha da conta (mínimo de 8). Devolve nulo para seguir com o erro
 * normal de login (sem convite, ou a conta já existe e a senha está errada); senão o erro do campo ou
 * o redirecionamento para a área do convite.
 */
async function inviteFirstAccess(email: string, password: string): Promise<AuthActionState | null> {
  if (!hasAdminClient()) return null;
  const admin = createAdminClient();
  if (!(await hasPendingInvitation(admin, email))) return null;
  const strong = passwordSchema.safeParse(password);
  if (!strong.success) return { status: "error", fieldErrors: { password: strong.error.issues[0]?.message ?? "passwordTooShort" } };

  // mesmo limite do cadastro rápido (por IP e por e-mail, HMAC)
  const ip = clientIp(await headers());
  const attempt = await recordQuickSignupAttempt(admin, hashForRateLimit("ip", ip), hashForRateLimit("email", email));
  if (attempt === "limited") return { status: "error", error: "tooManyRequests" };

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { invite_first_access: true },
  });
  if (createError) {
    const msg = createError.message ?? "";
    // já existe conta com o e-mail: é senha errada mesmo
    if (createError.code === "email_exists" || createError.code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg)) return null;
    return { status: "error", error: "unknown" };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { status: "error", error: mapAuthError(signInError) };
  const home = await acceptMyInvitations(supabase);
  redirect(home ?? LOGIN_HOME);
}

// Cadastro rápido (tela inicial): nome completo, e-mail e celular. O servidor gera a senha, cria a conta
// já confirmada (service role), entra neste aparelho e devolve a senha UMA vez para a tela "Sua senha".
// Cria SOMENTE consumidores (papéis vêm do gatilho no banco, que também aplica o kill switch).
// E-mail já cadastrado: nunca entra sem a senha (seria tomar a conta de alguém digitando o e-mail dela).
export async function quickSignupAction(_prev: QuickSignupState, formData: FormData): Promise<QuickSignupState> {
  // campo-isca preenchido: robô. Resposta genérica, sem pista do motivo.
  const honeypot = formData.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") return { status: "error", error: "unknown" };

  const parsed = quickSignupSchema.safeParse({ fullName: formData.get("fullName"), email: formData.get("email"), phone: formData.get("phone") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  const { fullName, email, phone } = parsed.data;

  if (!hasAdminClient()) return { status: "error", error: "signupUnavailable" };
  const admin = createAdminClient();

  // limite por IP e por e-mail (HMAC, nunca o valor puro)
  const ip = clientIp(await headers());
  const attempt = await recordQuickSignupAttempt(admin, hashForRateLimit("ip", ip), hashForRateLimit("email", email));
  if (attempt === "schema_missing" || attempt === "error") return { status: "error", error: "signupUnavailable" };
  if (attempt === "limited") return { status: "error", error: "tooManyRequests" };

  const password = generatePassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // sem e-mail de confirmação nem etapa bloqueante (pedido do responsável); o e-mail fica marcado
    // como "não verificado pelo app" até a pessoa provar que é dona dele (Google ou recuperação)
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
    app_metadata: { quick_signup: true, quick_signup_unverified: true },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (createError?.code === "email_exists" || createError?.code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg)) {
      return { status: "error", error: "emailExists" };
    }
    if (isSignupRefusedByDatabase(createError) && !(await readExperimentOpen(await createClient()))) return { status: "error", error: "experimentClosed" };
    if (createError?.status === 429) return { status: "error", error: "tooManyRequests" };
    return { status: "error", error: "unknown" };
  }
  const userId = created.user.id;

  // nome completo e celular no perfil (o gatilho já criou a linha com o nome de exibição)
  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName, phone_e164: phone }).eq("id", userId);
  if (profileError && !isMissingSchema(profileError)) console.warn("[quick-signup] perfil sem celular:", profileError.code ?? "erro");

  const stored = await storeGeneratedPassword(admin, userId, password);

  // entra neste aparelho (cookies de sessão) com a senha recém-gerada
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  const signedIn = !signInError;
  // convidado que preferiu o cadastro rápido: os convites do e-mail já entram (0077)
  if (signedIn) await acceptMyInvitations(supabase);
  if (signedIn) {
    // segura a tela "Sua senha": sem isto, o /login (que agora vê a sessão) mandaria direto para o app
    (await cookies()).set(QUICK_SIGNUP_PENDING_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 15 * 60 });
  }
  return { status: "created", password, stored, signedIn };
}

// "Já anotei": libera a tela e segue para o app.
export async function finishQuickSignup(formData: FormData): Promise<void> {
  (await cookies()).delete(QUICK_SIGNUP_PENDING_COOKIE);
  redirect(safeNext(formData.get("next"), LOGIN_HOME));
}

export async function forgotPasswordAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const origin = await getOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });

  // Mensagem genérica mesmo em erro (exceto rate limit), para não revelar e-mails.
  if (error && (error.status === 429 || error.code?.includes("rate_limit"))) {
    return { status: "error", error: "tooManyRequests" };
  }
  return { status: "success" };
}

// Requer sessão de recuperação (criada pelo /auth/callback ou /auth/confirm).
export async function resetPasswordAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "sessionRequired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", error: mapAuthError(error) };

  // A pessoa provou que é dona do e-mail e escolheu a própria senha: a gerada (se havia) deixa de
  // valer e sai do cofre; as outras sessões caem (quem cadastrou o e-mail alheio perde o acesso).
  if (hasAdminClient()) {
    try {
      const admin = createAdminClient();
      await forgetGeneratedPassword(admin, user.id);
      if (user.app_metadata?.quick_signup_unverified === true) {
        await admin.auth.admin.updateUserById(user.id, { app_metadata: { quick_signup_unverified: false } });
      }
    } catch {
      // melhor esforço: a senha nova já vale
    }
  }
  await supabase.auth.signOut({ scope: "others" });

  return { status: "success" };
}
