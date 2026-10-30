"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { EXPO_PUSH_TOKEN, PUSH_TOKEN_COOKIE } from "@/lib/push/constants";
import { createClient } from "@/lib/supabase/server";

// Seguir herói (hero_favorites) e push do app das lojas (0054; docs/decisions/push-notifications.md). Regras de
// acesso no banco: RLS de hero_favorites, RPC register_push_token, RLS de notification_preferences.

type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: unknown): { ok: false; error: string } => {
  console.error("[push-actions]", error instanceof Error ? error.message : String(error));
  return { ok: false, error: "generic" };
};

export async function toggleHeroFavorite(input: { creatorId: string; favorite: boolean; path?: string }): Promise<Result<{ favorite: boolean }>> {
  const parsed = z
    // caminhos onde o botão Seguir aparece (página do herói, aba Hero, Início e Heróis que sigo)
    .object({ creatorId: z.uuid(), favorite: z.boolean(), path: z.string().regex(/^\/(personalities(\/[a-z0-9-]+)?|inicio|profile\/herois)$/).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { creatorId, favorite, path } = parsed.data;
    if (favorite) {
      const { error } = await supabase.from("hero_favorites").upsert({ user_id: user.id, creator_id: creatorId }, { onConflict: "user_id,creator_id", ignoreDuplicates: true });
      // 42501: herói fora do ar (política hero_favorites_insert_own)
      if (error) return error.code === "42501" ? { ok: false, error: "hero_unavailable" } : fail(error.message);
      await trackEvent("favorite.add", { item_type: "hero", item_id: creatorId });
    } else {
      const { error } = await supabase.from("hero_favorites").delete().eq("user_id", user.id).eq("creator_id", creatorId);
      if (error) return fail(error.message);
      await trackEvent("favorite.remove", { item_type: "hero", item_id: creatorId });
    }
    if (path) revalidatePath(path);
    // seguir alimenta o feed "Seguindo", a gestão no Perfil e a comparação (0056)
    revalidatePath("/profile/herois");
    revalidatePath("/profile/today");
    revalidatePath("/profile/evolution");
    return { ok: true, favorite };
  } catch (error) {
    return fail(error);
  }
}

// O app manda o token do aparelho (só existe dentro da casca, com a permissão do sistema dada).
export async function registerPushToken(input: { token: string }): Promise<Result> {
  const parsed = z.object({ token: z.string().regex(EXPO_PUSH_TOKEN) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const [user, nativeApp] = await Promise.all([getUser(), getNativeApp()]);
    if (!user) return { ok: false, error: "unauthenticated" };
    if (!nativeApp) return { ok: false, error: "native_only" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("register_push_token", { p_token: parsed.data.token, p_platform: nativeApp.platform, p_app_version: nativeApp.version });
    if (error) return fail(error.message);
    // o "Sair" lê daqui qual token desligar; não é segredo (sem o token de acesso da Expo não envia nada)
    (await cookies()).set(PUSH_TOKEN_COOKIE, parsed.data.token, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365 });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// A pessoa aceitou o push no contexto (favoritou um herói, ligou na tela de avisos): liga o canal e
// os tipos pedidos, sem mexer nos outros.
export async function enablePush(input: { types: Array<"hero_posts" | "achievements" | "streak_reminders"> }): Promise<Result> {
  const parsed = z.object({ types: z.array(z.enum(["hero_posts", "achievements", "streak_reminders"])).max(3) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const values = Object.fromEntries(parsed.data.types.map((type) => [type, true]));
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, channel_push: true, ...values }, { onConflict: "user_id" });
    if (error) return fail(error.message);
    revalidatePath("/profile/notifications");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
