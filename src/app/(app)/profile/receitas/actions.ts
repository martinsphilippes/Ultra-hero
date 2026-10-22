"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { decideHistoryChange, isMissingRelation, loadHistoryPref } from "@/lib/recipes/history";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Minha coleção de receitas: remover salvas, ligar/desligar o histórico (desligar apaga, com
// confirmação), limpar o histórico ou tirar uma receita dele. A RLS só deixa mexer na própria linha.

export type CollectionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const COLLECTION_PATH = "/profile/receitas";

function fail(error: { code?: string | null; message?: string | null } | null | undefined): { ok: false; error: string } {
  if (isMissingRelation(error)) return { ok: false, error: "history_unavailable" };
  return { ok: false, error: rpcErrorCode(error?.message) || "generic" };
}

export async function setRecipeHistory(input: { enabled: boolean; confirm?: boolean }): Promise<CollectionResult<{ enabled: boolean }>> {
  const parsed = z.object({ enabled: z.boolean(), confirm: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const pref = await loadHistoryPref(supabase, user.id);
  if (!pref.available) return { ok: false, error: "history_unavailable" };
  const change = decideHistoryChange(pref.enabled, parsed.data.enabled, parsed.data.confirm === true);
  if (change === "noop") return { ok: true, enabled: pref.enabled };
  if (change === "needs_confirmation") return { ok: false, error: "confirmation_required" };
  if (change === "enable") {
    // a data do consentimento é gravada pelo banco (gatilho), não pelo app
    const { error } = await supabase.from("user_recipe_prefs").upsert({ user_id: user.id, history_enabled: true }, { onConflict: "user_id" });
    if (error) return fail(error);
  } else {
    // o gatilho apaga recipe_view_history na mesma transação
    const { error } = await supabase.from("user_recipe_prefs").update({ history_enabled: false }).eq("user_id", user.id);
    if (error) return fail(error);
  }
  revalidatePath(COLLECTION_PATH);
  return { ok: true, enabled: change === "enable" };
}

export async function clearRecipeHistory(input: { confirm: boolean }): Promise<CollectionResult> {
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "confirmation_required" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_view_history").delete().eq("user_id", user.id);
  if (error) return fail(error);
  revalidatePath(COLLECTION_PATH);
  return { ok: true };
}

export async function removeHistoryItem(input: { contentId: string }): Promise<CollectionResult> {
  const parsed = z.object({ contentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_view_history").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
  if (error) return fail(error);
  revalidatePath(COLLECTION_PATH);
  return { ok: true };
}

export async function removeSavedRecipe(input: { contentId: string }): Promise<CollectionResult> {
  const parsed = z.object({ contentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
  if (error) return fail(error);
  await trackEvent("favorite.remove", { content_id: parsed.data.contentId, source: "recipe_collection" });
  revalidatePath(COLLECTION_PATH);
  revalidatePath("/profile/favorites");
  return { ok: true };
}
