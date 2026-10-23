import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildRealView, type RealWatchView, type RpcConnection, type RpcToday } from "./snapshot";
import { isHealthCategory, type HealthCategory } from "./types";

// Leitura do dono (sessão da pessoa, RPCs security definer da 0038). Banco sem a migração (o
// remoto de hoje) responde PGRST202/42883: tratamos como "indisponível" e nada muda na tela.

type Client = SupabaseClient<Database>;

export type HealthConsent = { version: string; locale: string; categories: HealthCategory[]; grantedAt: string; currentVersion: string; outdated: boolean };

function missingFunction(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? ""));
}

export async function myConsent(supabase: Client): Promise<HealthConsent | null | "unavailable"> {
  const { data, error } = await supabase.rpc("my_health_consent");
  if (error) return missingFunction(error) ? "unavailable" : null;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    version: String(d.version ?? ""),
    locale: String(d.locale ?? ""),
    categories: (Array.isArray(d.categories) ? d.categories : []).filter((c): c is HealthCategory => typeof c === "string" && isHealthCategory(c)),
    grantedAt: String(d.granted_at ?? ""),
    currentVersion: String(d.current_version ?? ""),
    outdated: d.outdated === true,
  };
}

export async function myConnections(supabase: Client): Promise<RpcConnection[] | "unavailable"> {
  const { data, error } = await supabase.rpc("my_wearable_connections");
  if (error) return missingFunction(error) ? "unavailable" : [];
  return Array.isArray(data) ? (data as unknown as RpcConnection[]) : [];
}

export async function loadRealView(supabase: Client, input: { today: string; nowMin: number; timeZone: string }): Promise<RealWatchView> {
  const { data, error } = await supabase.rpc("my_health_today", { p_until: input.today, p_days: 93 });
  if (error || !data || typeof data !== "object") return { kind: "none" };
  return buildRealView({ data: data as unknown as RpcToday, today: input.today, nowMin: input.nowMin, timeZone: input.timeZone });
}

export type ConsentText = { version: string; locale: string; body: string; sha256: string; minAge: number; minAgeRulePending: boolean };

export async function consentText(supabase: Client, locale: string): Promise<ConsentText | null> {
  const { data, error } = await supabase.rpc("health_consent_text", { p_locale: locale });
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.body !== "string" || typeof d.version !== "string") return null;
  return {
    version: d.version,
    locale: String(d.locale ?? locale),
    body: d.body,
    sha256: String(d.sha256 ?? ""),
    minAge: typeof d.min_age === "number" ? d.min_age : 18,
    minAgeRulePending: d.min_age_rule_pending === true,
  };
}
