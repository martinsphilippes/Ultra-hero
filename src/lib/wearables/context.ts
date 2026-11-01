// Quem vê qual Hoje (§6.3): card "Conectar relógio" (nenhuma marca ligada ainda) e, só quando a
// pessoa pede, o "Exemplo" simulado, que nunca se mistura ao perfil dela. Puro: a página passa
// usuário, papéis, fuso e o "agora".

import type { HealthProvider } from "@/lib/health/types";
import { generateWatchDay, type WatchSnapshot } from "./demo";

export type WatchView =
  | { kind: "example"; persona: "example"; snapshot: WatchSnapshot }
  // relógio real (schema health), só com WEARABLES_REAL_ENABLED=1 e conta real conectada
  | { kind: "real"; provider: HealthProvider; snapshot: WatchSnapshot; lastSync: { date: string; at: number } | null; stale: boolean }
  | { kind: "syncing"; provider: HealthProvider; deviceName: string }
  // `providers`: marcas ligadas neste ambiente (vazio = todas "Em breve", como hoje)
  | { kind: "connect"; providers?: readonly HealthProvider[] };

type UserLike = { email?: string | null; app_metadata?: Record<string, unknown> | null };

/** Data local (YYYY-MM-DD) e minutos desde a meia-noite no fuso da pessoa. */
export function localNow(timeZone: string, now = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function resolveWatchView(input: { user: UserLike; roles: readonly string[]; timeZone: string; example: boolean; now?: Date }): WatchView {
  const { date, minutes } = localNow(input.timeZone, input.now);
  if (input.example) return { kind: "example", persona: "example", snapshot: generateWatchDay("example", date, minutes) };
  return { kind: "connect" };
}
