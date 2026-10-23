"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setLocaleAction } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { ILLUSTRATION_RE } from "@/lib/avatar/constants";
import { isStoredAvatarUrl, storedAvatarOwner, supabaseBaseUrl } from "@/lib/avatar/paths";
import { releaseStoredAvatar } from "@/lib/avatar/server";
import { recalculateRecommendations } from "@/lib/recommendations/recalculate";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { setThemeAction } from "@/lib/theme/actions";
import { themes } from "@/lib/theme/constants";
import { notificationPreferencesSchema, type NotificationPreferences } from "@/components/me/notifications/schema";
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
// Avatar: ilustração local, nenhum, ou a foto enviada (0031). A foto só entra pelo envio
// (avatar-actions): aqui ela só é aceita se já é a atual da própria pessoa (salvar sem trocar).
// avatarUrl ausente = a pessoa não mexeu no avatar: o do banco fica (o formulário pode estar com um
// valor velho, ex.: o herói trocou a ilustração pública na mesma página e a foto saiu do ar).
export async function updateProfile(input: { displayName: string; avatarUrl?: string | null; locale: string; theme: string }): Promise<Result> {
  const base = supabaseBaseUrl();
  const parsed = z
    .object({
      displayName: z.string().trim().min(1).max(60),
      avatarUrl: z
        .string()
        .max(300)
        .refine((v) => ILLUSTRATION_RE.test(v) || isStoredAvatarUrl(v, base))
        .nullable()
        .optional(),
      locale: z.enum(locales),
      theme: z.enum(themes),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const avatarChanged = parsed.data.avatarUrl !== undefined;
    let previous: string | null = null;
    let next: string | null = null;
    if (avatarChanged) {
      const { data: current } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
      previous = current?.avatar_url ?? null;
      next = parsed.data.avatarUrl ?? null;
      if (isStoredAvatarUrl(next, base) && (next !== previous || storedAvatarOwner(next, base) !== user.id)) return { ok: false, error: "invalid_input" };
    }
    const { error } = await supabase
      .from("profiles")
      .update(avatarChanged ? { display_name: parsed.data.displayName, avatar_url: next } : { display_name: parsed.data.displayName })
      .eq("id", user.id);
    if (error) return fail(error.message);
    // Trocou a foto por ilustração (ou nenhuma): a foto sai do ar também no perfil de herói.
    if (avatarChanged && base && previous !== next && storedAvatarOwner(previous, base) === user.id && hasAdminClient()) {
      await releaseStoredAvatar(createAdminClient(), { url: previous as string, baseUrl: base });
      revalidatePath("/creator", "layout");
      revalidatePath("/personalities", "layout");
    }
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

// ---------------------------------------------------------------- preferências de notificação
// Nada é enviado na POC: a linha guarda o consentimento (opt-in por tipo e canal) que qualquer
// envio futuro precisa respeitar. Upsert pelo cliente do usuário: a RLS só aceita a própria linha.
export async function saveNotificationPreferences(input: NotificationPreferences): Promise<Result> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" });
    if (error) return fail(error.message);
    revalidatePath("/profile/notifications");
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
    // Fotos de perfil próprias lidas antes (depois o perfil some e o herói fica sem usuário).
    const base = supabaseBaseUrl();
    let photos: string[] = [];
    if (base && hasAdminClient()) {
      const [{ data: profile }, { data: hero }] = await Promise.all([
        supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("creator_profiles").select("avatar_url").eq("user_id", user.id).maybeSingle(),
      ]);
      photos = Array.from(new Set([profile?.avatar_url, hero?.avatar_url].filter((u): u is string => storedAvatarOwner(u, base) === user.id)));
    }
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return fail(error.message);
    // Só depois da exclusão confirmada (exclusão bloqueada não perde a foto): a foto sai do Storage e
    // do perfil público do herói, que fica no ar sem usuário. Melhor esforço: o envio ficou sem dono
    // (user_id nulo) e a limpeza diária apaga o que falhar aqui.
    if (base && photos.length > 0) {
      try {
        const admin = createAdminClient();
        for (const url of photos) await releaseStoredAvatar(admin, { url, baseUrl: base });
      } catch (releaseError) {
        console.warn("[profile] remoção da foto após a exclusão falhou:", releaseError instanceof Error ? releaseError.message : releaseError);
      }
    }
    // A conta já não existe no servidor de auth: limpa só a sessão local (cookies).
    await supabase.auth.signOut({ scope: "local" });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
