// Aviso de lance superado nos Colecionáveis (0061): regras puras, testadas em unidade.
// O banco decide (gatilho collectible_outbid_notify); aqui ficam o espelho da regra (para os testes e
// a documentação) e o que o pop-up do app faz com os avisos que chegam (user_alerts).
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { pushAllowedFor, type PushPrefs } from "@/lib/push/consent";
import { collectiblePhase } from "./rules";

/** Push: no máximo um por pessoa e item nesta janela (guerra de lances não vira spam). */
export const OUTBID_PUSH_WINDOW_MS = 2 * 60 * 1000;
/** Pop-up: aviso mais velho que isso não aparece mais (o momento passou). */
export const OUTBID_ALERT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Consulta de reserva sem Realtime (só com a aba visível). */
export const OUTBID_POLL_MS = 20_000;
/** Com Realtime ligado, uma conferência de segurança de vez em quando. */
export const OUTBID_SAFETY_POLL_MS = 60_000;
/** Título longo do item é cortado no pop-up. */
export const OUTBID_TITLE_MAX = 60;

export type OutbidDecision = { notify: boolean; push: boolean };

/**
 * Espelho do gatilho: quem vencia (e só ela, nunca quem deu o lance) é avisada dentro do app; o push
 * exige canal Push + tipo ligados, aparelho registrado e nenhum push do mesmo item nos últimos 2 min.
 */
export function outbidDecision(input: {
  previousLeader: string | null;
  newLeader: string | null;
  prefs: PushPrefs | null | undefined;
  hasDevice: boolean;
  lastPushAtMs: number | null;
  nowMs: number;
}): OutbidDecision {
  const notify = input.previousLeader !== null && input.previousLeader !== input.newLeader;
  if (!notify) return { notify: false, push: false };
  const recent = input.lastPushAtMs !== null && input.nowMs - input.lastPushAtMs < OUTBID_PUSH_WINDOW_MS;
  return { notify, push: pushAllowedFor(input.prefs, "auction_outbid") && input.hasDevice && !recent };
}

// ---------------------------------------------------------------- pop-up
export type OutbidAlert = { id: string; collectibleId: string; title: string; amountCents: number; updatedAt: string };
export type OutbidItemState = { status: string; startsAt: string | null; endsAt: string | null };

/** Linha de user_alerts (leitura defensiva) → aviso; null se faltar algo. */
export function parseOutbidAlert(row: unknown): OutbidAlert | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.kind !== undefined && r.kind !== "auction_outbid") return null;
  if (typeof r.id !== "string" || typeof r.collectible_id !== "string" || typeof r.updated_at !== "string") return null;
  const amount = typeof r.amount_cents === "number" ? r.amount_cents : Number(r.amount_cents);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { id: r.id, collectibleId: r.collectible_id, title: typeof r.title === "string" ? r.title : "", amountCents: amount, updatedAt: r.updated_at };
}

export const collectibleHref = (collectibleId: string) => `/shop/colecionaveis/${collectibleId}`;

/** A pessoa já está na página do item (lá o aviso "Seu lance foi superado" já aparece). */
export function isOnItemPage(pathname: string | null | undefined, collectibleId: string): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "");
  return path === collectibleHref(collectibleId);
}

/**
 * Escolhe o pop-up: o aviso mais recente que ainda vale. Os que não valem mais (velhos, item fora do
 * ar ou encerrado, ou a pessoa já está na página do item) são marcados como vistos sem aparecer.
 */
export function pickOutbidPopup(
  alerts: readonly OutbidAlert[],
  opts: { pathname: string | null | undefined; nowMs: number; items: ReadonlyMap<string, OutbidItemState> },
): { show: OutbidAlert | null; silent: string[] } {
  const silent: string[] = [];
  let show: OutbidAlert | null = null;
  const newest = [...alerts].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const alert of newest) {
    const item = opts.items.get(alert.collectibleId);
    const age = opts.nowMs - Date.parse(alert.updatedAt);
    const live = item ? collectiblePhase(item.status, item.startsAt, item.endsAt, opts.nowMs) === "live" : false;
    if (!live || !(age <= OUTBID_ALERT_MAX_AGE_MS) || isOnItemPage(opts.pathname, alert.collectibleId)) silent.push(alert.id);
    else if (!show) show = alert;
  }
  return { show, silent };
}

/** Textos do pop-up: título do item (cortado) e valor atual no idioma da pessoa. */
export function outbidAlertText(alert: Pick<OutbidAlert, "title" | "amountCents">, locale: Locale): { item: string; price: string } {
  const title = alert.title.trim().replace(/\s+/g, " ");
  const chars = Array.from(title);
  const item = chars.length <= OUTBID_TITLE_MAX ? title : `${chars.slice(0, OUTBID_TITLE_MAX - 1).join("").trimEnd()}…`;
  return { item, price: formatCurrency(alert.amountCents / 100, locale) };
}
