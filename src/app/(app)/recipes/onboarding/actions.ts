"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveInterests } from "@/app/(app)/profile/actions";
import { getUser } from "@/lib/auth/session";
import { RECIPE_ALLERGIES, RECIPE_RESTRICTIONS } from "@/lib/recipes/onboarding";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  acceptNotice: z.literal(true),
  restrictions: z.array(z.enum(RECIPE_RESTRICTIONS)).max(RECIPE_RESTRICTIONS.length),
  allergies: z.array(z.enum(RECIPE_ALLERGIES)).max(RECIPE_ALLERGIES.length),
  interests: z.array(z.string().trim().min(1).max(40).regex(/^[a-z0-9_-]+$/)).max(60),
});

export type CompleteRecipeOnboardingResult = { ok: true } | { ok: false; error: "invalid" | "unauthenticated" | "failed" };

// Conclui a etapa demonstrativa: grava aviso aceito, restrições e alergias (listas fixas) e os
// interesses. O user_id vem sempre da sessão; a RLS só aceita a linha do próprio usuário.
export async function completeRecipeOnboarding(input: z.input<typeof schema>): Promise<CompleteRecipeOnboardingResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { restrictions, allergies, interests } = parsed.data;
    const { error } = await supabase.from("recipe_onboarding").upsert(
      {
        user_id: user.id,
        version: 1,
        notice_accepted_at: new Date().toISOString(),
        restrictions: Array.from(new Set(restrictions)),
        allergies: Array.from(new Set(allergies)),
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: "failed" };
    const saved = await saveInterests({ tags: interests });
    if (!saved.ok) return { ok: false, error: "failed" };
    revalidatePath("/personalities", "layout");
    revalidatePath("/content", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}
