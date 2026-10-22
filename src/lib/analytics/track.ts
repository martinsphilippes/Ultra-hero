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
  | "recipe.catalog_filter"
  | "recipe.scale"
  | "recipe.share"
  | "recipe.print"
  | "recipe.rate"
  | "onboarding.complete"
  | "account.delete"
  | "error.critical";

const ANON_COOKIE = "uh-anon";
// Navegador de teste (E2E contra produção): nada é registrado, para não sujar os números reais.
const E2E_COOKIE = "uh-e2e";

// Registra um evento no servidor. Nunca envia PII (a função SQL também bloqueia chaves suspeitas).
export async function trackEvent(event: AnalyticsEvent, properties: Record<string, string | number | boolean | null> = {}) {
  try {
    const jar = await cookies();
    if (jar.get(E2E_COOKIE)?.value === "1") return;
    const supabase = await createClient();
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
