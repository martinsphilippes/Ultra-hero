"use server";

import { z } from "zod";
import { getLocaleFromCookie } from "@/i18n/server";
import { trackEvent } from "@/lib/analytics/track";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Feedback contextual (rpc submit_feedback). Funciona logado ou não; o banco limita a 20/dia por usuário.

export type Result = { ok: true; id: string } | { ok: false; error: string };

const schema = z.object({
  context: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(1000).default(""),
});

export async function submitFeedback(input: z.input<typeof schema>): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const supabase = await createClient();
    const locale = await getLocaleFromCookie();
    const { data, error } = await supabase.rpc("submit_feedback", {
      p_context: parsed.data.context,
      p_rating: parsed.data.rating,
      p_message: parsed.data.message,
      p_locale: locale ?? undefined,
    });
    if (error) return { ok: false, error: rpcErrorCode(error.message) || "generic" };
    await trackEvent("feedback.submit", { context_kind: parsed.data.context.split(":")[0], rating: parsed.data.rating, has_message: parsed.data.message.length > 0 });
    return { ok: true, id: String(data) };
  } catch (error) {
    return { ok: false, error: rpcErrorCode(error instanceof Error ? error.message : undefined) || "generic" };
  }
}
