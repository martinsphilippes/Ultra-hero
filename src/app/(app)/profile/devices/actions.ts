"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";
import { providerReady } from "@/lib/health/config";
import { hasHealthDb } from "@/lib/health/db";
import { recentlyAuthenticated } from "@/lib/health/oauth";
import { attemptRevocations } from "@/lib/health/pipeline";
import { HEALTH_CATEGORIES, HEALTH_PROVIDERS } from "@/lib/health/types";
import { myConsent } from "@/lib/health/user";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isDemoUser } from "@/lib/wearables/context";

// Ações de "Relógios e anéis". As regras ficam no banco (RPCs security definer da 0038: demo,
// versão vigente, idade, categorias, apagar na hora); aqui validamos a entrada, exigimos login
// recente para conceder/ampliar (§15.9) e tentamos a revogação na marca logo depois de apagar.

export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  demo_account_cannot_connect: "demo",
  health_disabled: "unavailable",
  reauth_required: "reauth",
  health_age_not_confirmed: "age",
  health_consent_version_outdated: "version",
  health_categories_required: "categories",
  health_invalid_category: "categories",
  health_no_consent: "noConsent",
};

function fail(message: string | undefined): { ok: false; error: string } {
  return { ok: false, error: ERRORS[rpcErrorCode(message)] ?? "generic" };
}

/** Revogação na marca, na hora e sem bloquear: se falhar, o tique tenta de novo por até 7 dias. */
async function revokeNow(refs: string[]): Promise<void> {
  if (refs.length === 0 || !hasHealthDb()) return;
  try {
    await attemptRevocations(refs);
  } catch {
    // fica na fila (health.pending_revocations)
  }
}

const grantSchema = z.object({
  provider: z.enum(HEALTH_PROVIDERS),
  version: z.string().min(3).max(41),
  locale: z.enum(["pt-BR", "en", "es"]),
  categories: z.array(z.enum(HEALTH_CATEGORIES)).min(1).max(10),
  ageConfirmed: z.literal(true),
});

/** Conceder ou ampliar (nunca reduz aqui: a união com o que já foi autorizado evita apagar por engano). */
export async function grantHealthConsent(input: unknown): Promise<Result<{ next: string }>> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    const ageMissing = typeof input === "object" && input !== null && (input as { ageConfirmed?: unknown }).ageConfirmed !== true;
    return { ok: false, error: ageMissing ? "age" : "categories" };
  }
  const { provider, version, locale, categories } = parsed.data;
  if (!providerReady(provider)) return { ok: false, error: "unavailable" };
  const user = await getUser();
  if (!user) return { ok: false, error: "reauth" };
  if (isDemoUser(user)) return { ok: false, error: "demo" };
  if (!recentlyAuthenticated(user.last_sign_in_at)) return { ok: false, error: "reauth" };
  const supabase = await createClient();
  const current = await myConsent(supabase);
  if (current === "unavailable") return { ok: false, error: "unavailable" };
  const union = Array.from(new Set([...(current?.categories ?? []), ...categories]));
  const { error } = await supabase.rpc("health_consent_grant", { p_version: version, p_locale: locale, p_categories: union, p_age_confirmed: true });
  if (error) return fail(error.message);
  revalidatePath("/profile/devices");
  return { ok: true, next: `/api/wearables/${provider}/connect` };
}

const reduceSchema = z.object({ categories: z.array(z.enum(HEALTH_CATEGORIES)).min(1).max(10) });

/** Retirar categorias (subconjunto): apaga na hora só os dados delas. */
export async function reduceHealthConsent(input: unknown): Promise<Result> {
  const parsed = reduceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "categories" };
  // sem checar a chave: retirar categorias nunca é bloqueado (banco sem a RPC → erro genérico)
  const user = await getUser();
  if (!user) return { ok: false, error: "reauth" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("health_consent_reduce", { p_categories: parsed.data.categories });
  if (error) return fail(error.message);
  revalidatePath("/profile/devices");
  revalidatePath("/profile");
  return { ok: true };
}

/** Retirar o consentimento: desconecta tudo, apaga tudo, revoga nas marcas. Nunca é bloqueado (RF-09). */
export async function revokeHealthConsent(): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "reauth" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("health_consent_revoke");
  if (error) return fail(error.message);
  const refs = data && typeof data === "object" && Array.isArray((data as { connection_refs?: unknown }).connection_refs) ? ((data as { connection_refs: unknown[] }).connection_refs.filter((r) => typeof r === "string") as string[]) : [];
  await revokeNow(refs);
  revalidatePath("/profile/devices");
  revalidatePath("/profile");
  return { ok: true };
}

/** Desconectar e apagar: na hora, numa transação; a revogação na marca vem depois, pela fila. */
export async function disconnectWearable(input: unknown): Promise<Result> {
  const parsed = z.object({ connectionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  const user = await getUser();
  if (!user) return { ok: false, error: "reauth" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wearable_disconnect", { p_connection: parsed.data.connectionId });
  if (error) return fail(error.message);
  const ref = data && typeof data === "object" ? (data as { connection_ref?: unknown }).connection_ref : null;
  await revokeNow(typeof ref === "string" ? [ref] : []);
  revalidatePath("/profile/devices");
  revalidatePath("/profile");
  return { ok: true };
}

/** Login recente para dado de saúde: sai e volta pela tela de login direto para o consentimento. */
export async function reauthenticate(formData: FormData): Promise<void> {
  const next = safeNext(String(formData.get("next") ?? ""), "/profile/devices");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
