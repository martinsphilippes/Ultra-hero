"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorCode } from "@/lib/supabase/helpers";

// Ações da página da receita (fase 3): avaliação por estrelas e os eventos de uso sem PII
// (ajuste de porções, compartilhar, imprimir). As regras da avaliação ficam no banco: a política de
// recipe_ratings exige recipes.ratings_enabled, acesso à receita, não ser o chef e ter concluído.

export type RateResult = { ok: true; stars: number } | { ok: false; error: "invalid" | "unauthenticated" | "forbidden" | "failed" };

const pathSchema = z.string().regex(/^\/content\/[a-z0-9-]+$/);
const rateSchema = z.object({ contentId: z.uuid(), stars: z.number().int().min(1).max(5), path: pathSchema });

export async function rateRecipe(input: z.input<typeof rateSchema>): Promise<RateResult> {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { contentId, stars, path } = parsed.data;
  try {
    const supabase = await createClient();
    // Sem upsert: o grant de update é só em `stars` e o "on conflict do update" do PostgREST
    // regravaria content_id. Lê a própria avaliação e atualiza ou insere.
    const { data: existing, error: readError } = await supabase.from("recipe_ratings").select("stars").eq("content_id", contentId).eq("user_id", user.id).maybeSingle();
    if (readError) return { ok: false, error: "failed" };
    const { error } = existing
      ? await supabase.from("recipe_ratings").update({ stars }).eq("content_id", contentId).eq("user_id", user.id)
      : await supabase.from("recipe_ratings").insert({ content_id: contentId, stars });
    if (error) {
      // 42501 = a política recusou (sem conclusão, avaliações desligadas, chef da própria receita)
      const code = rpcErrorCode(error.message);
      return { ok: false, error: error.code === "42501" || code === "forbidden" ? "forbidden" : "failed" };
    }
    await trackEvent("recipe.rate", { stars });
    revalidatePath(path);
    return { ok: true, stars };
  } catch {
    return { ok: false, error: "failed" };
  }
}

const RECIPE_EVENTS = ["recipe.scale", "recipe.share", "recipe.print"] as const;
const eventSchema = z.object({
  event: z.enum(RECIPE_EVENTS),
  // só números e um método curto; nada de texto livre
  servings: z.number().int().min(1).max(50).optional(),
  method: z.enum(["native", "copy"]).optional(),
});

/** Evento de uso da página da receita (nunca quebra a tela). */
export async function trackRecipeEvent(input: z.input<typeof eventSchema>): Promise<void> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return;
  const { event, servings, method } = parsed.data;
  await trackEvent(event, { ...(servings ? { servings } : {}), ...(method ? { method } : {}) });
}
