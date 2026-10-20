"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setLocaleAction } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { recalculateRecommendations } from "@/lib/recommendations/recalculate";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { setThemeAction } from "@/lib/theme/actions";
import { themes } from "@/lib/theme/constants";

// Onboarding opcional: interesses + idioma/tema → profiles.onboarding_completed = true → recalcula → Início.

export type Result = { ok: true } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return { ok: false, error: rpcErrorCode(message) || "generic" };
}

const schema = z.object({
  tags: z.array(z.string().trim().min(1).max(40).regex(/^[a-z0-9_-]+$/)).max(60),
  locale: z.enum(locales),
  theme: z.enum(themes),
});

export async function finishOnboarding(input: z.input<typeof schema>): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const tags = Array.from(new Set(parsed.data.tags));
    const { error: deleteError } = await supabase.from("user_interests").delete().eq("user_id", user.id);
    if (deleteError) return fail(deleteError.message);
    if (tags.length > 0) {
      const { error: insertError } = await supabase.from("user_interests").insert(tags.map((tag) => ({ user_id: user.id, tag })));
      if (insertError) return fail(insertError.message);
    }
    const { error: profileError } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    if (profileError) return fail(profileError.message);
    await setLocaleAction(parsed.data.locale);
    await setThemeAction(parsed.data.theme);
    try {
      await recalculateRecommendations(user.id, "onboarding");
    } catch (error) {
      console.warn("[onboarding] recálculo de recomendações falhou:", error);
    }
    await trackEvent("onboarding.complete", { interests: tags.length, locale: parsed.data.locale, theme: parsed.data.theme });
  } catch (error) {
    return fail(error);
  }
  redirect("/");
}

// "Pular": marca como concluído para o Início parar de sugerir o onboarding.
export async function skipOnboarding(): Promise<void> {
  const user = await getUser();
  if (user) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    await trackEvent("onboarding.complete", { skipped: true });
  }
  redirect("/");
}
