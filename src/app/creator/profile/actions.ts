"use server";

import { revalidatePath } from "next/cache";
import { parseCreatorProfile, type CreatorProfileValues } from "@/components/creator/profile-schema";
import type { ActionResult } from "@/components/editors/types";
import { getUser } from "@/lib/auth/session";
import { isStoredAvatarUrl, storedAvatarOwner, supabaseBaseUrl } from "@/lib/avatar/paths";
import { releaseStoredAvatar } from "@/lib/avatar/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";

// Atualiza só as colunas liberadas do perfil da personalidade (guard no banco bloqueia o resto).
// A foto enviada (0031) só entra pelo envio do perfil (avatar-actions): aqui ela só é aceita se já é
// a atual e é da própria pessoa; trocar a foto por ilustração tira a foto do ar nos dois lados.
export async function updateCreatorProfile(values: CreatorProfileValues): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const parsed = parseCreatorProfile(values);
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  const base = supabaseBaseUrl();

  const supabase = await createClient();
  const { data: me } = await supabase.from("creator_profiles").select("id, slug, status, avatar_url").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active") return { ok: false, error: "creator_unavailable" };
  const nextAvatar = v.avatar_url || null;
  if (isStoredAvatarUrl(nextAvatar, base) && (nextAvatar !== me.avatar_url || storedAvatarOwner(nextAvatar, base) !== user.id)) {
    return { ok: false, error: "invalid_input" };
  }

  const { error } = await supabase
    .from("creator_profiles")
    .update({
      headline: v.headline || null,
      bio: v.bio || null,
      avatar_url: nextAvatar,
      cover_url: v.cover_url || null,
      socials: v.socials,
    })
    .eq("id", me.id);
  if (error) return failFrom(error);

  if (base && me.avatar_url !== nextAvatar && storedAvatarOwner(me.avatar_url, base) === user.id && hasAdminClient()) {
    await releaseStoredAvatar(createAdminClient(), { url: me.avatar_url as string, baseUrl: base });
    revalidatePath("/", "layout");
    revalidatePath("/profile");
  }

  revalidatePath("/creator/profile");
  revalidatePath("/creator");
  revalidatePath("/personalities");
  revalidatePath(`/personalities/${me.slug}`);
  return { ok: true };
}
