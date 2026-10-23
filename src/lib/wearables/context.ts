// Quem vê qual Hoje (§6.3): conta demo → relógio simulado da persona dela; conta real → card
// "Conectar relógio" (nenhuma marca ligada ainda) e, só quando pede, o "Exemplo" simulado, que
// nunca se mistura ao perfil da pessoa. Puro: a página passa usuário, papéis, fuso e o "agora".

import type { HealthProvider } from "@/lib/health/types";
import { demoPersonaFor, generateWatchDay, type DemoPersonaKey, type WatchSnapshot } from "./demo";

export type WatchView =
  | { kind: "demo"; persona: DemoPersonaKey; snapshot: WatchSnapshot }
  | { kind: "example"; persona: "example"; snapshot: WatchSnapshot }
  // relógio real (schema health), só com WEARABLES_REAL_ENABLED=1 e conta real conectada
  | { kind: "real"; provider: HealthProvider; snapshot: WatchSnapshot; lastSync: { date: string; at: number } | null; stale: boolean }
  | { kind: "syncing"; provider: HealthProvider; deviceName: string }
  // `providers`: marcas ligadas neste ambiente (vazio = todas "Em breve", como hoje)
  | { kind: "connect"; providers?: readonly HealthProvider[] };

type UserLike = { email?: string | null; app_metadata?: Record<string, unknown> | null };

/** Marcador de conta demo: só em app_metadata (gravável pelo servidor), nunca em user_metadata. */
export function isDemoUser(user: UserLike): boolean {
  return user.app_metadata?.ultra_hero_demo === true;
}

/** Data local (YYYY-MM-DD) e minutos desde a meia-noite no fuso da pessoa. */
export function localNow(timeZone: string, now = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function resolveWatchView(input: { user: UserLike; roles: readonly string[]; timeZone: string; example: boolean; now?: Date }): WatchView {
  const persona = demoPersonaFor({ isDemo: isDemoUser(input.user), email: input.user.email, roles: input.roles });
  const { date, minutes } = localNow(input.timeZone, input.now);
  if (persona) return { kind: "demo", persona, snapshot: generateWatchDay(persona, date, minutes) };
  if (input.example) return { kind: "example", persona: "example", snapshot: generateWatchDay("example", date, minutes) };
  return { kind: "connect" };
}
