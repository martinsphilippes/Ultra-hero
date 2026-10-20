"use server";

import { revalidatePath } from "next/cache";
import { parseCreatorProfile, type CreatorProfileValues } from "@/components/creator/profile-schema";
import type { ActionResult } from "@/components/editors/types";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";

// Atualiza só as colunas liberadas do perfil da personalidade (guard no banco bloqueia o resto).
export async function updateCreatorProfile(values: CreatorProfileValues): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const parsed = parseCreatorProfile(values);
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: me } = await supabase.from("creator_profiles").select("id, slug, status").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active") return { ok: false, error: "creator_unavailable" };

  const { error } = await supabase
    .from("creator_profiles")
    .update({
      headline: v.headline || null,
      bio: v.bio || null,
      avatar_url: v.avatar_url || null,
      cover_url: v.cover_url || null,
      socials: v.socials,
    })
    .eq("id", me.id);
  if (error) return failFrom(error);

  revalidatePath("/creator/profile");
  revalidatePath("/creator");
  revalidatePath("/personalities");
  revalidatePath(`/personalities/${me.slug}`);
  return { ok: true };
}
