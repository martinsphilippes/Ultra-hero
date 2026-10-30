"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Ações da seção "Para você": "não me interessa" e eventos de analytics (sem PII).

export type Result = { ok: true } | { ok: false; error: string };

export async function dismissRecommendation(input: { contentId: string }): Promise<Result> {
  const parsed = z.object({ contentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("not_interested")
      .upsert({ user_id: user.id, content_id: parsed.data.contentId }, { onConflict: "user_id,content_id" });
    if (error) return { ok: false, error: rpcErrorCode(error.message) || "generic" };
    // user_recommendations só aceita escrita do service role; sem ele a seção filtra por not_interested.
    if (hasAdminClient()) {
      await createAdminClient().from("user_recommendations").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
    }
    await trackEvent("recommendation.not_interested", { content_id: parsed.data.contentId, source: "home" });
    revalidatePath("/inicio");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: rpcErrorCode(error instanceof Error ? error.message : undefined) || "generic" };
  }
}

const eventSchema = z.object({
  kind: z.enum(["view", "click"]),
  contentId: z.uuid().optional(),
  engine: z.enum(["deterministic", "openai", "gemini", "open_picks"]).optional(),
  isFallback: z.boolean().optional(),
  count: z.number().int().min(0).max(50).optional(),
  rank: z.number().int().min(1).max(50).optional(),
});

export async function trackRecommendationEvent(input: z.input<typeof eventSchema>): Promise<void> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return;
  const { kind, contentId, engine, isFallback, count, rank } = parsed.data;
  await trackEvent(kind === "view" ? "recommendation.view" : "recommendation.click", {
    engine: engine ?? null,
    recommendation_source: isFallback ? "fallback" : engine ?? null,
    count: count ?? null,
    content_id: contentId ?? null,
    rank: rank ?? null,
  });
}
