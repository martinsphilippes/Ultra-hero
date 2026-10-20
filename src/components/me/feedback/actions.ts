"use server";

import { submitFeedbackSchema, type SubmitFeedbackInput } from "@/components/feedback/schema";
import { getLocale } from "@/i18n/server";
import { trackEvent } from "@/lib/analytics/track";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Feedback contextual (rpc submit_feedback). Funciona logado ou não; o banco limita a 20/dia por usuário
// e valida a categoria de novo (check + RPC). Prioridade, responsável e nota só mudam pela triagem do admin.

export type Result = { ok: true; id: string } | { ok: false; error: string };

export async function submitFeedback(input: SubmitFeedbackInput): Promise<Result> {
  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data, error } = await supabase.rpc("submit_feedback", {
      p_context: parsed.data.context,
      p_rating: parsed.data.rating,
      p_message: parsed.data.message,
      p_locale: locale,
      p_category: parsed.data.category,
    });
    if (error) return { ok: false, error: rpcErrorCode(error.message) || "generic" };
    await trackEvent("feedback.submit", {
      context_kind: parsed.data.context.split(":")[0],
      rating: parsed.data.rating,
      has_message: parsed.data.message.length > 0,
      category: parsed.data.category,
    });
    return { ok: true, id: String(data) };
  } catch (error) {
    return { ok: false, error: rpcErrorCode(error instanceof Error ? error.message : undefined) || "generic" };
  }
}
