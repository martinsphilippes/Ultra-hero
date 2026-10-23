"use server";

import { revalidatePath } from "next/cache";
import { parseCreatorProfile, type CreatorProfileInput } from "@/components/creator/profile-schema";
import type { ActionResult } from "@/components/editors/types";
import { getRoles, getUser } from "@/lib/auth/session";
import { heroProfileFor } from "@/components/creator/hero-access";
import { isStoredAvatarUrl, storedAvatarOwner, supabaseBaseUrl } from "@/lib/avatar/paths";
import { releaseStoredAvatar } from "@/lib/avatar/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";

// Atualiza só as colunas liberadas do perfil da personalidade (guard no banco bloqueia o resto).
// A foto enviada (0031) só entra pelo envio do perfil (avatar-actions): aqui ela só é aceita se já é
// a atual e é da própria pessoa; trocar a foto por ilustração tira a foto do ar nos dois lados.
// Sem avatar_url (a pessoa não mexeu no avatar) o avatar do banco fica como está: o formulário pode
// estar com um valor velho (foto enviada em Dados, na mesma página) e não pode trocá-la nem apagá-la.
export async function updateCreatorProfile(values: CreatorProfileInput): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  // mesma regra da tela (herói ou admin): quem perdeu o papel não edita o perfil público por POST direto
  if (heroProfileFor((await getRoles()).map((r) => r.role), true) === null) return { ok: false, error: "forbidden" };
  const parsed = parseCreatorProfile(values);
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  const base = supabaseBaseUrl();

  const supabase = await createClient();
  const { data: me } = await supabase.from("creator_profiles").select("id, slug, status, avatar_url").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active") return { ok: false, error: "creator_unavailable" };
  const avatarChanged = v.avatar_url !== undefined;
  const nextAvatar = avatarChanged ? v.avatar_url || null : me.avatar_url;
  if (avatarChanged && isStoredAvatarUrl(nextAvatar, base) && (nextAvatar !== me.avatar_url || storedAvatarOwner(nextAvatar, base) !== user.id)) {
    return { ok: false, error: "invalid_input" };
  }

  const { error } = await supabase
    .from("creator_profiles")
    .update({
      headline: v.headline || null,
      bio: v.bio || null,
      ...(avatarChanged ? { avatar_url: nextAvatar } : {}),
      cover_url: v.cover_url || null,
      socials: v.socials,
    })
    .eq("id", me.id);
  if (error) return failFrom(error);

  if (avatarChanged && base && me.avatar_url !== nextAvatar && storedAvatarOwner(me.avatar_url, base) === user.id && hasAdminClient()) {
    await releaseStoredAvatar(createAdminClient(), { url: me.avatar_url as string, baseUrl: base });
    revalidatePath("/", "layout");
  }

  // o formulário do herói mora no /profile (seção "Seu perfil de herói")
  revalidatePath("/profile");
  revalidatePath("/creator");
  revalidatePath("/personalities");
  revalidatePath(`/personalities/${me.slug}`);
  return { ok: true };
}
