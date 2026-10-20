"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setLocaleAction } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { recalculateRecommendations } from "@/lib/recommendations/recalculate";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { setThemeAction } from "@/lib/theme/actions";
import { themes } from "@/lib/theme/constants";
import { DELETE_CONFIRM_WORD, parseSubscription, type SubscriptionInfo } from "@/components/me/subscription";

// Ações do módulo "Eu": perfil, fuso, plano simulado, interesses, favoritos e exclusão de conta.
// Regras de acesso e preços ficam no banco (RLS + RPCs security definer); aqui só validamos entrada.

export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return { ok: false, error: rpcErrorCode(message) || "generic" };
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/)
  .refine(isValidTimeZone, "invalid_timezone");

// ---------------------------------------------------------------- fuso do dispositivo
export async function syncTimezone(input: { timezone: string }): Promise<Result> {
  const parsed = z.object({ timezone: timezoneSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ timezone: parsed.data.timezone }).eq("id", user.id);
    if (error) return fail(error.message);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- dados do perfil
const AVATAR_RE = /^\/placeholders\/avatar-[1-8]\.svg$/;

export async function updateProfile(input: { displayName: string; avatarUrl: string | null; locale: string; theme: string }): Promise<Result> {
  const parsed = z
    .object({
      displayName: z.string().trim().min(1).max(60),
      avatarUrl: z.string().regex(AVATAR_RE).nullable(),
      locale: z.enum(locales),
      theme: z.enum(themes),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.displayName, avatar_url: parsed.data.avatarUrl })
      .eq("id", user.id);
    if (error) return fail(error.message);
    // Idioma e tema: cookies + perfil (mesmas actions usadas pelos seletores globais).
    await setLocaleAction(parsed.data.locale);
    await setThemeAction(parsed.data.theme);
    revalidatePath("/profile");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- plano simulado
export async function selectModules(input: { moduleIds: string[]; source: "bundle" | "custom" | "free" }): Promise<Result<{ subscription: SubscriptionInfo }>> {
  const parsed = z.object({ moduleIds: z.array(z.uuid()).max(20), source: z.enum(["bundle", "custom", "free"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("select_modules", { p_module_ids: parsed.data.moduleIds });
    if (error) return { ok: false, error: error.message };
    const subscription = parseSubscription(data);
    await trackEvent("plan.select", { modules: parsed.data.moduleIds.length, source: parsed.data.source, status: subscription.status, simulated: true });
    revalidatePath("/profile/plan");
    revalidatePath("/profile");
    return { ok: true, subscription };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelSubscription(): Promise<Result<{ subscription: SubscriptionInfo }>> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_subscription");
    if (error) return fail(error.message);
    const subscription = parseSubscription(data);
    await trackEvent("plan.cancel", { status: subscription.status, simulated: true });
    revalidatePath("/profile/plan");
    revalidatePath("/profile");
    return { ok: true, subscription };
  } catch (error) {
    return fail(error);
  }
}

export async function trackPlanView(): Promise<void> {
  await trackEvent("plan.view", { simulated: true });
}

// ---------------------------------------------------------------- interesses
export async function saveInterests(input: { tags: string[] }): Promise<Result<{ recalculated: boolean }>> {
  const parsed = z.object({ tags: z.array(z.string().trim().min(1).max(40).regex(/^[a-z0-9_-]+$/)).max(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const tags = Array.from(new Set(parsed.data.tags));
    const { error: deleteError } = await supabase.from("user_interests").delete().eq("user_id", user.id);
    if (deleteError) return fail(deleteError.message);
    if (tags.length > 0) {
      const { error: insertError } = await supabase.from("user_interests").insert(tags.map((tag) => ({ user_id: user.id, tag })));
      if (insertError) return fail(insertError.message);
    }
    let recalculated = false;
    try {
      const result = await recalculateRecommendations(user.id, "interests_changed");
      recalculated = result.persisted;
    } catch (error) {
      console.warn("[profile] recálculo de recomendações falhou:", error);
    }
    revalidatePath("/profile/interests");
    revalidatePath("/");
    return { ok: true, recalculated };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreNotInterested(input: { contentId: string }): Promise<Result> {
  const parsed = z.object({ contentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { error } = await supabase.from("not_interested").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
    if (error) return fail(error.message);
    revalidatePath("/profile/interests");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- favoritos
export async function removeFavorite(input: { contentId: string }): Promise<Result> {
  const parsed = z.object({ contentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
    if (error) return fail(error.message);
    await trackEvent("favorite.remove", { content_id: parsed.data.contentId, source: "profile" });
    revalidatePath("/profile/favorites");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- exclusão de conta
export async function deleteAccount(input: { confirmation: string }): Promise<Result> {
  const parsed = z.object({ confirmation: z.string().trim() }).safeParse(input);
  if (!parsed.success || parsed.data.confirmation.toUpperCase() !== DELETE_CONFIRM_WORD) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    // Evento antes da exclusão (depois ele é desvinculado pela anonimização).
    await trackEvent("account.delete", { self_service: true });
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return fail(error.message);
    // A conta já não existe no servidor de auth: limpa só a sessão local (cookies).
    await supabase.auth.signOut({ scope: "local" });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
