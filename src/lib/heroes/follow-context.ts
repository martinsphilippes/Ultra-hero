import "server-only";
import { cache } from "react";
import { getUser } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { createClient } from "@/lib/supabase/server";
import { loadMyFollows } from "./follow-queries";

export type FollowContext = {
  signedIn: boolean;
  /** hero_favorites disponível no banco (sem a tabela, os botões somem). */
  available: boolean;
  following: ReadonlySet<string>;
  /** No app das lojas: push de posts de heróis já ligado com aparelho registrado. */
  pushReady: boolean;
  nativeApp: boolean;
};

// Contexto do botão Seguir para a requisição (memoizado): quem está logado, quem segue e o push.
export const getFollowContext = cache(async (): Promise<FollowContext> => {
  const [user, nativeApp] = await Promise.all([getUser(), getNativeApp()]);
  const supabase = await createClient();
  const [follows, pushReady] = await Promise.all([
    loadMyFollows(supabase, user?.id ?? null),
    user && nativeApp
      ? Promise.all([
          supabase.from("notification_preferences").select("channel_push, hero_posts").eq("user_id", user.id).maybeSingle(),
          supabase.from("push_tokens").select("token", { count: "exact", head: true }).eq("user_id", user.id),
        ]).then(([prefs, tokens]) => Boolean(prefs.data?.channel_push && prefs.data?.hero_posts && (tokens.count ?? 0) > 0))
      : Promise.resolve(false),
  ]);
  return { signedIn: Boolean(user), available: follows.available, following: new Set(follows.ids), pushReady, nativeApp: Boolean(nativeApp) };
});
