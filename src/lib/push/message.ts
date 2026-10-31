// Texto e destino de cada aviso de push (puro: testado em tests/unit/push-message.test.ts).
// Textos em messages/<locale>/push.json; o link é um caminho do site que a casca abre ao tocar.
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";

export type PushKind = "hero_post" | "achievement" | "program_completed" | "streak_reminder" | "auction_outbid" | "office";

export type PushEvent =
  | { kind: "hero_post"; hero: string; contentTitle: string | null; contentSlug: string }
  | { kind: "achievement"; name: string }
  | { kind: "program_completed"; program: string; programSlug: string }
  | { kind: "streak_reminder"; streak: number }
  // lance superado nos Colecionáveis (0061): valor atual do item e link para dar outro lance
  | { kind: "auction_outbid"; item: string; amountCents: number; collectibleId: string }
  // aviso do escritório do creator (0064): o texto vem do tipo do aviso, com os mesmos parâmetros do sino
  | { kind: "office"; inboxKind: string; params: Record<string, string>; link: string };

// Tokens que os textos do escritório podem usar (sempre presentes; vazio quando o aviso não traz).
const OFFICE_TOKENS = ["name", "brand", "deal", "talent", "step", "date", "status"] as const;

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
    case "auction_outbid":
      return out(
        t("auctionOutbid.title"),
        t("auctionOutbid.body", { item: event.item.trim(), price: formatCurrency(event.amountCents / 100, locale) }),
        `/shop/colecionaveis/${event.collectibleId}`,
      );
    case "office": {
      const values = Object.fromEntries(OFFICE_TOKENS.map((k) => [k, event.params[k] ?? ""]));
      return out(t(`office.${event.inboxKind}.title`, values), t(`office.${event.inboxKind}.body`, values), event.link);
    }
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
