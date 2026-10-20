"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSignupRefusedByDatabase, readExperimentOpen } from "@/lib/auth/experiment";
import { getOrigin } from "@/lib/auth/origin";
import { safeNext } from "@/lib/auth/safe-next";
import type { AuthActionState, AuthField, AuthFieldErrors } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

// Mensagens dos schemas são CHAVES de auth.errors.*, traduzidas no cliente.
const emailSchema = z.string({ error: "required" }).trim().toLowerCase().min(1, { error: "required" }).max(254, { error: "invalidEmail" }).pipe(z.email({ error: "invalidEmail" }));

const passwordSchema = z.string({ error: "required" }).min(8, { error: "passwordTooShort" }).max(72, { error: "passwordTooLong" });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "required" }).min(1, { error: "required" }).max(72, { error: "passwordTooLong" }),
});

const signupSchema = z
  .object({
    displayName: z.string({ error: "required" }).trim().min(2, { error: "nameTooShort" }).max(80, { error: "nameTooShort" }),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: "required" }),
  })
  .refine((data) => data.password === data.confirmPassword, { error: "passwordsDontMatch", path: ["confirmPassword"] });

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string({ error: "required" }) })
  .refine((data) => data.password === data.confirmPassword, { error: "passwordsDontMatch", path: ["confirmPassword"] });

const FIELDS: readonly AuthField[] = ["email", "password", "confirmPassword", "displayName"];

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

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: "error", error: mapAuthError(error) };

  redirect(next);
}

// Cadastro público: cria SOMENTE consumidores (papéis vêm do trigger no banco).
export async function signupAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const next = safeNext(formData.get("next"));
  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Só nome de exibição; nunca papéis ou flags vindos do cliente.
      data: { full_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // E-mail já cadastrado: resposta idêntica ao sucesso para não revelar existência.
    if (error.code === "user_already_exists" || error.code === "email_exists") return { status: "success" };
    // Banco recusou a conta nova: com o cadastro fechado (kill switch), avisa com educação.
    if (isSignupRefusedByDatabase(error) && !(await readExperimentOpen(supabase))) {
      return { status: "error", error: "experimentClosed" };
    }
    return { status: "error", error: mapAuthError(error) };
  }

  // Confirmação de e-mail desativada no projeto: já há sessão.
  if (data.session) redirect(next);

  return { status: "success" };
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

  return { status: "success" };
}
