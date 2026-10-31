// Consentimento do push por tipo (puro: o envio e os testes usam). Mesma regra de public.push_allowed
// (0054, 0061): canal Push ligado + o tipo ligado; sem linha de preferências, tudo desligado (opt-in).
import type { PushKind } from "./message";

export type PushPrefs = {
  channel_push?: boolean | null;
  hero_posts?: boolean | null;
  achievements?: boolean | null;
  streak_reminders?: boolean | null;
  // ausente num banco sem a 0061: conta como desligado
  auction_outbid?: boolean | null;
  // ausente num banco sem a 0064: conta como desligado
  office_updates?: boolean | null;
};

const TYPE_OF_KIND: Record<PushKind, keyof PushPrefs> = {
  hero_post: "hero_posts",
  achievement: "achievements",
  program_completed: "achievements",
  streak_reminder: "streak_reminders",
  auction_outbid: "auction_outbid",
  office: "office_updates",
};

export function pushAllowedFor(prefs: PushPrefs | null | undefined, kind: string): boolean {
  if (!prefs?.channel_push) return false;
  const type = TYPE_OF_KIND[kind as PushKind];
  return type ? prefs[type] === true : false;
}
