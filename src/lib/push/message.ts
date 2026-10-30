// Texto e destino de cada aviso de push (puro: testado em tests/unit/push-message.test.ts).
// Textos em messages/<locale>/push.json; o link é um caminho do site que a casca abre ao tocar.
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import type { Locale } from "@/i18n/config";

export type PushKind = "hero_post" | "achievement" | "program_completed" | "streak_reminder";

export type PushEvent =
  | { kind: "hero_post"; hero: string; contentTitle: string | null; contentSlug: string }
  | { kind: "achievement"; name: string }
  | { kind: "program_completed"; program: string; programSlug: string }
  | { kind: "streak_reminder"; streak: number };

export type PushMessage = { title: string; body: string; url: string };

// iOS corta o corpo do banner por volta disso; o resto não aparece
const MAX_TITLE = 65;
const MAX_BODY = 178;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function buildPushMessage(event: PushEvent, locale: Locale, messages: AbstractIntlMessages): PushMessage {
  // só o namespace push.json, fora da tipagem global das mensagens (que exige a árvore inteira)
  const t = (createTranslator as unknown as (config: { locale: Locale; messages: AbstractIntlMessages }) => Translate)({ locale, messages });
  const out = (title: string, body: string, url: string): PushMessage => ({ title: clip(title, MAX_TITLE), body: clip(body, MAX_BODY), url });
  switch (event.kind) {
    case "hero_post": {
      const title = event.contentTitle?.trim();
      return out(t("heroPost.title", { hero: event.hero }), title ? t("heroPost.body", { title }) : t("heroPost.bodyFallback", { hero: event.hero }), `/content/${event.contentSlug}`);
    }
    case "achievement":
      return out(t("achievement.title"), t("achievement.body", { name: event.name }), "/profile/evolution");
    case "program_completed":
      return out(t("programCompleted.title"), t("programCompleted.body", { program: event.program }), `/programs/${event.programSlug}`);
    case "streak_reminder":
      return out(t("streakReminder.title"), t("streakReminder.body", { streak: event.streak }), "/inicio");
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

export type TicketOutcome = { status: "ok" } | { status: "gone" } | { status: "failed"; error: string };

/**
 * Resposta da Expo para cada mensagem, pela posição (a resposta vem na ordem do envio). Pela
 * posição e não pelo token: o mesmo aparelho pode ter dois avisos no mesmo lote.
 */
export function ticketOutcomes(count: number, tickets: ExpoTicket[]): TicketOutcome[] {
  return Array.from({ length: count }, (_, index): TicketOutcome => {
    const ticket = tickets[index];
    if (!ticket) return { status: "failed", error: "missing_ticket" };
    if (ticket.status === "ok") return { status: "ok" };
    if (ticket.details?.error === "DeviceNotRegistered") return { status: "gone" };
    return { status: "failed", error: ticket.details?.error ?? ticket.message ?? "error" };
  });
}
