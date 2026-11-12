"use server";

import type { AuthError } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APP_ONLY_PATH, CHANGE_PASSWORD_PATH, PENDING_PATH, readAccessClaims } from "@/lib/access/gate";
import { heroChannelBlocked } from "@/lib/access/server";
import { isSignupRefusedByDatabase, readExperimentOpen } from "@/lib/auth/experiment";
import { generatePassword } from "@/lib/auth/generated-password";
import { acceptMyInvitations, hasPendingInvitation, pendingInvitationIsHero } from "@/lib/auth/invite-first-access";
import { isPasswordlessActive } from "@/lib/auth/passwordless";
import { recordPasswordlessAttempt, signInWithoutPassword, type PasswordlessResult } from "@/lib/auth/passwordless-server";
import { getOrigin } from "@/lib/auth/origin";
import { HONEYPOT_FIELD, QUICK_SIGNUP_PENDING_COOKIE, quickSignupSchema } from "@/lib/auth/quick-signup";
import { clientIp, forgetGeneratedPassword, hashForRateLimit, isMissingSchema, recordQuickSignupAttempt, storeGeneratedPassword } from "@/lib/auth/quick-signup-server";
import { BUSINESS_PROFILES, PROFILE_ONBOARDING_PATH, profileSignupSchema, startPathFor, type BusinessProfile } from "@/lib/auth/profile-signup";
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

const FIELDS: readonly AuthField[] = ["email", "password", "confirmPassword", "fullName"];

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

// Resultado do "entrar sem senha" que não abriu sessão → chave de auth.errors.*.
function passwordlessError(result: Exclude<PasswordlessResult, "ok">): string {
  switch (result) {
    case "not_found":
      return "noAccount";
    case "admin":
      return "passwordRequired";
    case "suspended":
      return "accountSuspended";
    case "limited":
      return "tooManyRequests";
    default:
      return "unknown";
  }
}

export async function loginAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  // Período do evento (passwordless.ts): o formulário só com e-mail manda passwordless=1. Fora do período o campo é
  // ignorado e vale a senha, como sempre (página antiga aberta depois do prazo cai no erro de senha obrigatória).
  if (formData.get("passwordless") === "1" && isPasswordlessActive()) return passwordlessLogin(formData);

  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const next = safeNext(formData.get("next"), LOGIN_HOME);
  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // e-mail convidado sem conta: o primeiro acesso cria a conta com a senha digitada (0077)
    if (error.code === "invalid_credentials") {
      const firstAccess = await inviteFirstAccess(parsed.data.email, parsed.data.password);
      if (firstAccess) return firstAccess;
    }
    return { status: "error", error: mapAuthError(error) };
  }

  const blocked = await accessAfterSignIn(supabase, signedIn?.user?.app_metadata);
  if (blocked) return blocked;
  return finishLogin(supabase, next);
}

/**
 * 0141, logo depois de abrir a sessão: conta Hero no navegador sai na hora com a mensagem do aplicativo; conta pendente ou
 * recusada vai para a tela de status (não aceita convites nem abre passo a passo antes da aprovação da Presidência).
 */
async function accessAfterSignIn(supabase: Awaited<ReturnType<typeof createClient>>, appMetadata: unknown): Promise<AuthActionState | null> {
  const access = readAccessClaims(appMetadata);
  if (access.appOnly && (await heroChannelBlocked())) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", error: "creatorAppOnly" };
  }
  // senha provisória (conta criada pela administração): troca obrigatória antes de qualquer tela, inclusive a de status
  if (access.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (access.status === "pending" || access.status === "rejected") redirect(PENDING_PATH);
  return null;
}

/** O mesmo, para a sessão aberta sem senha ou já aberta antes (o usuário vem da própria sessão). */
async function accessOfSession(supabase: Awaited<ReturnType<typeof createClient>>): Promise<AuthActionState | null> {
  const { data } = await supabase.auth.getUser();
  return accessAfterSignIn(supabase, data?.user?.app_metadata);
}

// Depois de abrir a sessão: convites pendentes do e-mail entram junto e o passo a passo em aberto é retomado.
async function finishLogin(supabase: Awaited<ReturnType<typeof createClient>>, next: string): Promise<never> {
  // convites pendentes do e-mail da conta entram junto com o login
  const home = await acceptMyInvitations(supabase);
  // 0103: passo a passo em aberto (cadastro por perfil ou convite) e nenhum destino pedido: retoma de onde parou
  if (!home && next === LOGIN_HOME && (await hasOpenOnboarding(supabase))) redirect(PROFILE_ONBOARDING_PATH);
  redirect(afterInvites(next, home));
}

// Entrar só com o e-mail (período do evento). Sem conta: convidado ganha a conta na hora (como o primeiro acesso da
// 0077, com senha gerada); os demais recebem "noAccount" e a tela oferece "Criar conta". Admin: "passwordRequired".
async function passwordlessLogin(formData: FormData): Promise<AuthActionState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  const { email } = parsed.data;
  const next = safeNext(formData.get("next"), LOGIN_HOME);
  if (!hasAdminClient()) return { status: "error", error: "passwordRequired" };
  const admin = createAdminClient();

  const ip = clientIp(await headers());
  const attempt = await recordPasswordlessAttempt(admin, ip, email);
  if (attempt === "limited") return { status: "error", error: "tooManyRequests" };
  if (attempt !== "ok") return { status: "error", error: "unknown" };

  const supabase = await createClient();
  let result = await signInWithoutPassword(admin, supabase, email);
  if (result === "not_found" && (await hasPendingInvitation(admin, email))) {
    // 0141: convite de Hero/Creator só se aceita pelo aplicativo (a conta nem é criada no navegador)
    if ((await pendingInvitationIsHero(admin, email)) && (await heroChannelBlocked())) return { status: "error", error: "creatorAppOnly" };
    const { error: createError } = await admin.auth.admin.createUser({ email, password: generatePassword(), email_confirm: true, app_metadata: { invite_first_access: true } });
    if (createError) return { status: "error", error: isSignupRefusedByDatabase(createError) ? "experimentClosed" : "unknown" };
    result = await signInWithoutPassword(admin, supabase, email);
  }
  if (result !== "ok") return { status: "error", error: passwordlessError(result) };
  // 0141: mesma regra do login com senha (Hero no navegador sai; pendente ou recusada vai para a tela de status)
  const blocked = await accessOfSession(supabase);
  if (blocked) return blocked;
  return finishLogin(supabase, next);
}

async function hasOpenOnboarding(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("onboarding_pending");
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

// Ao entrar, todo mundo cai na aba Hero (todos os Heros), mesmo depois de aceitar convite(s): pedido do
// responsável. Os portais ficam no menu. Vindo do link do convite (que diria "já usado"), também vai para a Hero.
function afterInvites(next: string, home: string | null): string {
  if (!home) return next;
  return next === "/invite" || next.startsWith("/invite?") ? LOGIN_HOME : next;
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
  // 0141: convite de Hero/Creator só se aceita pelo aplicativo (a conta nem é criada no navegador)
  if ((await pendingInvitationIsHero(admin, email)) && (await heroChannelBlocked())) return { status: "error", error: "creatorAppOnly" };
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
  const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { status: "error", error: mapAuthError(signInError) };
  // conta nova: pendente da Presidência → tela de status (os convites entram depois da aprovação)
  const blocked = await accessAfterSignIn(supabase, signedIn?.user?.app_metadata);
  if (blocked) return blocked;
  await acceptMyInvitations(supabase);
  redirect(LOGIN_HOME);
}

// Cadastro rápido (tela inicial): nome completo e e-mail. O servidor gera a senha, cria a conta
// já confirmada (service role), entra neste aparelho e devolve a senha UMA vez para a tela "Sua senha".
// Cria SOMENTE consumidores (papéis vêm do gatilho no banco, que também aplica o kill switch).
// E-mail já cadastrado: nunca entra sem a senha (seria tomar a conta de alguém digitando o e-mail dela).
export async function quickSignupAction(_prev: QuickSignupState, formData: FormData): Promise<QuickSignupState> {
  // campo-isca preenchido: robô. Resposta genérica, sem pista do motivo.
  const honeypot = formData.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") return { status: "error", error: "unknown" };

  const parsed = quickSignupSchema.safeParse({ fullName: formData.get("fullName"), email: formData.get("email") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  const { fullName, email } = parsed.data;

  if (!hasAdminClient()) return { status: "error", error: "signupUnavailable" };
  const admin = createAdminClient();
  // 0141: e-mail com convite de Hero/Creator só entra pelo aplicativo
  if ((await pendingInvitationIsHero(admin, email)) && (await heroChannelBlocked())) return { status: "error", error: "creatorAppOnly" };

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
    user_metadata: { full_name: fullName },
    app_metadata: { quick_signup: true, quick_signup_unverified: true },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (createError?.code === "email_exists" || createError?.code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg)) {
      // período sem senha (evento): e-mail já cadastrado só entra (admin continua exigindo senha)
      if (isPasswordlessActive()) {
        const supabase = await createClient();
        const result = await signInWithoutPassword(admin, supabase, email);
        if (result !== "ok") return { status: "error", error: passwordlessError(result) };
        // 0141: Hero no navegador sai com a mensagem do app; pendente ou recusada vai para a tela de status
        if (await accessOfSession(supabase)) return { status: "error", error: "creatorAppOnly" };
        return finishLogin(supabase, safeNext(formData.get("next"), LOGIN_HOME));
      }
      return { status: "error", error: "emailExists" };
    }
    if (isSignupRefusedByDatabase(createError) && !(await readExperimentOpen(await createClient()))) return { status: "error", error: "experimentClosed" };
    if (createError?.status === 429) return { status: "error", error: "tooManyRequests" };
    return { status: "error", error: "unknown" };
  }
  const userId = created.user.id;

  // nome completo no perfil (o gatilho já criou a linha com o nome de exibição)
  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (profileError && !isMissingSchema(profileError)) console.warn("[quick-signup] perfil sem nome completo:", profileError.code ?? "erro");

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

// "Já anotei": libera a tela e segue para o app. 0141: o redirecionamento de uma action não passa pelo middleware, então
// a conta pendente (toda conta nova) vai daqui direto para a tela de status, sem abrir o destino antes.
export async function finishQuickSignup(formData: FormData): Promise<void> {
  (await cookies()).delete(QUICK_SIGNUP_PENDING_COOKIE);
  if (await accessOfSession(await createClient())) redirect(APP_ONLY_PATH);
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
      const meta: Record<string, boolean> = {};
      if (user.app_metadata?.quick_signup_unverified === true) meta.quick_signup_unverified = false;
      // a senha provisória (troca obrigatória) também deixa de valer: a pessoa já escolheu a própria
      if (user.app_metadata?.must_change_password === true) meta.must_change_password = false;
      if (Object.keys(meta).length > 0) await admin.auth.admin.updateUserById(user.id, { app_metadata: meta });
    } catch {
      // melhor esforço: a senha nova já vale
    }
  }
  await supabase.auth.signOut({ scope: "others" });

  return { status: "success" };
}

// Troca obrigatória da senha provisória (conta criada pela administração com uma senha combinada). A pessoa escolhe a
// própria senha; a marca must_change_password sai do app_metadata (só o servidor grava), as outras sessões abertas com a
// senha provisória caem e o token é renovado sem a marca. Depois: tela de status (pendente/recusada) ou o app.
export async function forcedPasswordChangeAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasAdminClient()) return { status: "error", error: "unknown" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", error: mapAuthError(error) };

  const { error: flagError } = await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { must_change_password: false } });
  if (flagError) return { status: "error", error: "unknown" };
  await supabase.auth.signOut({ scope: "others" });
  const { data: refreshed } = await supabase.auth.refreshSession();

  const access = readAccessClaims(refreshed?.user?.app_metadata ?? user.app_metadata);
  if (access.status === "pending" || access.status === "rejected") redirect(PENDING_PATH);
  redirect(LOGIN_HOME);
}

// Cadastro por perfil (0103): Hero, Marca ou Agência sem convite. Mesmas regras do cadastro rápido (campo-isca,
// limite por IP e por e-mail, kill switch do cadastro no gatilho do banco, e-mail existente nunca entra sem senha),
// mas a pessoa escolhe a senha. Cria a conta, entra, guarda a escolha (account_onboardings 'self') e abre o passo a
// passo; se guardar a escolha falhar (ex.: cadastro de perfis fechado), /comecar/<perfil> mostra o motivo.
export async function profileSignupAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const honeypot = formData.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") return { status: "error", error: "unknown" };
  const profile = formData.get("profile");
  if (typeof profile !== "string" || !(BUSINESS_PROFILES as readonly string[]).includes(profile)) return { status: "error", error: "unknown" };
  const kind = profile as BusinessProfile;
  // 0141: cadastro de Hero/Creator só pelo aplicativo (nada é criado no navegador)
  if (kind === "hero" && (await heroChannelBlocked())) return { status: "error", error: "creatorAppOnly" };

  // Período sem senha (evento): o campo Senha some; o servidor gera uma senha forte (guardada no cofre, como no
  // cadastro rápido, para a pessoa consultar em Perfil › Conta) e e-mail já cadastrado só entra e segue.
  const passwordless = isPasswordlessActive();
  const parsed = (passwordless ? quickSignupSchema : profileSignupSchema).safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  const { fullName, email } = parsed.data;
  const password = "password" in parsed.data && typeof parsed.data.password === "string" ? parsed.data.password : generatePassword();

  if (!hasAdminClient()) return { status: "error", error: "signupUnavailable" };
  const admin = createAdminClient();
  // 0125: agência só com e-mail de domínio autorizado (Groscove). A conta nasce e o pedido de acesso vai aos Adms.
  if (kind === "agency") {
    const { data: allowed, error: domainError } = await admin.rpc("agency_email_domain_allowed", { p_email: email });
    if (domainError) return { status: "error", error: "signupUnavailable" };
    if (!allowed) return { status: "error", fieldErrors: { email: "agencyDomain" } };
  }
  const ip = clientIp(await headers());
  const attempt = await recordQuickSignupAttempt(admin, hashForRateLimit("ip", ip), hashForRateLimit("email", email));
  if (attempt === "schema_missing" || attempt === "error") return { status: "error", error: "signupUnavailable" };
  if (attempt === "limited") return { status: "error", error: "tooManyRequests" };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // como o cadastro rápido: sem etapa bloqueante de confirmação; o e-mail fica "não verificado pelo app"
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { quick_signup: true, quick_signup_unverified: true, signup_profile: kind },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (createError?.code === "email_exists" || createError?.code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg)) {
      if (passwordless) {
        const supabase = await createClient();
        const result = await signInWithoutPassword(admin, supabase, email);
        if (result !== "ok") return { status: "error", error: passwordlessError(result) };
        const blocked = await accessOfSession(supabase);
        if (blocked) return blocked;
        await acceptMyInvitations(supabase);
        const { error: startError } = await supabase.rpc("self_onboarding_start", { p_kind: kind });
        redirect(startError ? startPathFor(kind) : PROFILE_ONBOARDING_PATH);
      }
      return { status: "error", error: "emailExists" };
    }
    if (createError?.code === "weak_password") return { status: "error", fieldErrors: { password: "weakPassword" } };
    if (isSignupRefusedByDatabase(createError) && !(await readExperimentOpen(await createClient()))) return { status: "error", error: "experimentClosed" };
    if (createError?.status === 429) return { status: "error", error: "tooManyRequests" };
    return { status: "error", error: "unknown" };
  }
  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);
  if (profileError && !isMissingSchema(profileError)) console.warn("[profile-signup] perfil sem nome completo:", profileError.code ?? "erro");
  if (passwordless) await storeGeneratedPassword(admin, created.user.id, password);

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { status: "error", error: mapAuthError(signInError) };
  // conta nova: pendente da Presidência → tela de status; o passo a passo do perfil abre depois da aprovação
  const blocked = await accessAfterSignIn(supabase, signedIn?.user?.app_metadata);
  if (blocked) return blocked;
  await acceptMyInvitations(supabase);
  const { error: startError } = await supabase.rpc("self_onboarding_start", { p_kind: kind });
  redirect(startError ? startPathFor(kind) : PROFILE_ONBOARDING_PATH);
}
