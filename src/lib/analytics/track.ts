"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getLocaleFromCookie } from "@/i18n/server";

// Nomes de eventos essenciais do experimento (lista fechada para manter o dashboard consistente).
export type AnalyticsEvent =
  | "signup"
  | "login"
  | "content.view"
  | "content.consume"
  | "content.complete"
  | "program.view"
  | "program.enroll"
  | "program.complete"
  | "favorite.add"
  | "favorite.remove"
  | "list.add"
  | "plan.view"
  | "plan.select"
  | "plan.cancel"
  | "recommendation.view"
  | "recommendation.click"
  | "recommendation.not_interested"
  | "product.view"
  | "product.interest"
  | "cart.add"
  | "cart.remove"
  | "checkout.start"
  | "order.test_confirmed"
  | "order.cancelled"
  | "progress.update"
  | "feedback.submit"
  | "search"
  | "onboarding.complete"
  | "account.delete"
  | "error.critical";

const ANON_COOKIE = "uh-anon";

// Registra um evento no servidor. Nunca envia PII (a função SQL também bloqueia chaves suspeitas).
export async function trackEvent(event: AnalyticsEvent, properties: Record<string, string | number | boolean | null> = {}) {
  try {
    const supabase = await createClient();
    const jar = await cookies();
    const anonId = jar.get(ANON_COOKIE)?.value ?? null;
    const locale = await getLocaleFromCookie();
    await supabase.rpc("track_event", {
      p_event: event,
      p_properties: properties,
      p_anon_id: anonId ?? undefined,
      p_locale: locale ?? undefined,
    });
  } catch {
    // analytics nunca deve quebrar a experiência
  }
}
