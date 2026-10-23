import "server-only";
import { localNow, resolveWatchView, type WatchView } from "@/lib/wearables/context";
import { createClient } from "@/lib/supabase/server";
import { availableProviders, wearablesRealEnabled } from "./config";
import { loadRealView } from "./user";

type UserLike = Parameters<typeof resolveWatchView>[0]["user"];

/**
 * Qual Hoje mostrar. Conta demo → relógio simulado (nunca lê o schema health nem vê o fluxo de
 * conectar); "Ver um exemplo" → exemplo simulado; conta real → com a chave ligada, o relógio
 * conectado (ou "sincronizando"); sem conexão, o card "Conectar relógio" com as marcas ligadas.
 * Chave desligada: exatamente como antes (card com tudo "Em breve").
 */
export async function resolveTodayView(input: { user: UserLike; roles: readonly string[]; timeZone: string; example: boolean }): Promise<WatchView> {
  const base = resolveWatchView(input);
  if (base.kind !== "connect" || !wearablesRealEnabled()) return base;
  const supabase = await createClient();
  const { date, minutes } = localNow(input.timeZone);
  const real = await loadRealView(supabase, { today: date, nowMin: minutes, timeZone: input.timeZone });
  if (real.kind === "real") return { kind: "real", provider: real.provider, snapshot: real.snapshot, lastSync: real.lastSync, stale: real.stale };
  if (real.kind === "syncing") return { kind: "syncing", provider: real.provider, deviceName: real.deviceName };
  return { kind: "connect", providers: availableProviders() };
}
