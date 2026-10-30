"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { isMissingFollowSchema } from "@/lib/heroes/follows";
import { createClient } from "@/lib/supabase/server";

// Hero de comparação (0056): profiles.compare_creator_id. O banco só aceita herói que a pessoa segue
// (gatilho 'compare_requires_follow') e limpa a escolha quando ela deixa de seguir. Seguir em si é
// toggleHeroFavorite (push-actions.ts, hero_favorites da 0054).

export type CompareResult = { ok: true } | { ok: false; error: "unauthenticated" | "unavailable" | "invalid_input" | "not_following" | "generic" };

export async function setCompareHeroAction(input: { creatorId: string | null }): Promise<CompareResult> {
  const parsed = z.object({ creatorId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ compare_creator_id: parsed.data.creatorId }).eq("id", user.id);
    if (error) {
      if (isMissingFollowSchema(error)) return { ok: false, error: "unavailable" };
      if ((error.message ?? "").includes("compare_requires_follow")) return { ok: false, error: "not_following" };
      return { ok: false, error: "generic" };
    }
    revalidatePath("/profile/herois");
    revalidatePath("/profile/today");
    revalidatePath("/profile/evolution");
    return { ok: true };
  } catch {
    return { ok: false, error: "generic" };
  }
}
