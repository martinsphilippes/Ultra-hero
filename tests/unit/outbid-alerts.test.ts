import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectibleHref,
  isOnItemPage,
  OUTBID_ALERT_MAX_AGE_MS,
  OUTBID_PUSH_WINDOW_MS,
  outbidAlertText,
  outbidDecision,
  parseOutbidAlert,
  pickOutbidPopup,
  type OutbidAlert,
  type OutbidItemState,
} from "@/lib/collectibles/outbid";
import { pushAllowedFor } from "@/lib/push/consent";
import { buildPushMessage } from "@/lib/push/message";

// Lance superado nos Colecionáveis (0061): consentimento, janela do push, escolha do pop-up e textos.

const NOW = Date.parse("2026-10-30T15:00:00Z");
const ITEM = "71000000-0000-4000-8000-0000000007c1";
const messages = (locale: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "push.json"), "utf8"));
const consent = { channel_push: true, auction_outbid: true };

describe("pushAllowedFor (mesma regra de push_allowed)", () => {
  it("canal Push + tipo ligados; sem linha ou sem a coluna (banco sem a 0061) = desligado", () => {
    expect(pushAllowedFor(consent, "auction_outbid")).toBe(true);
    expect(pushAllowedFor({ channel_push: false, auction_outbid: true }, "auction_outbid")).toBe(false);
    expect(pushAllowedFor({ channel_push: true, auction_outbid: false }, "auction_outbid")).toBe(false);
    expect(pushAllowedFor({ channel_push: true }, "auction_outbid")).toBe(false);
    expect(pushAllowedFor(null, "auction_outbid")).toBe(false);
    expect(pushAllowedFor(undefined, "hero_post")).toBe(false);
  });

  it("os tipos antigos seguem como na 0054; tipo desconhecido nunca", () => {
    const all = { channel_push: true, hero_posts: true, achievements: true, streak_reminders: true, auction_outbid: false };
    expect(pushAllowedFor(all, "hero_post")).toBe(true);
    expect(pushAllowedFor(all, "achievement")).toBe(true);
    expect(pushAllowedFor(all, "program_completed")).toBe(true);
    expect(pushAllowedFor(all, "streak_reminder")).toBe(true);
    expect(pushAllowedFor({ ...all, achievements: false }, "program_completed")).toBe(false);
    expect(pushAllowedFor(all, "auction_outbid")).toBe(false);
    expect(pushAllowedFor(all, "outro")).toBe(false);
  });
});

describe("outbidDecision (espelho do gatilho)", () => {
  const base = { previousLeader: "a", newLeader: "b", prefs: consent, hasDevice: true, lastPushAtMs: null, nowMs: NOW };

  it("avisa só quem vencia; o push exige consentimento e aparelho", () => {
    expect(outbidDecision(base)).toEqual({ notify: true, push: true });
    expect(outbidDecision({ ...base, prefs: { channel_push: true, auction_outbid: false } })).toEqual({ notify: true, push: false });
    expect(outbidDecision({ ...base, prefs: null })).toEqual({ notify: true, push: false });
    expect(outbidDecision({ ...base, hasDevice: false })).toEqual({ notify: true, push: false });
  });

  it("primeiro lance (ninguém vencia) ou a mesma pessoa: ninguém é avisado", () => {
    expect(outbidDecision({ ...base, previousLeader: null })).toEqual({ notify: false, push: false });
    expect(outbidDecision({ ...base, newLeader: "a" })).toEqual({ notify: false, push: false });
  });

  it("janela de 2 min por pessoa e item: guerra de lances não vira spam", () => {
    expect(OUTBID_PUSH_WINDOW_MS).toBe(120_000);
    expect(outbidDecision({ ...base, lastPushAtMs: NOW - 30_000 }).push).toBe(false);
    expect(outbidDecision({ ...base, lastPushAtMs: NOW - 119_999 }).push).toBe(false);
    expect(outbidDecision({ ...base, lastPushAtMs: NOW - 120_000 }).push).toBe(true);
    expect(outbidDecision({ ...base, lastPushAtMs: NOW - 10 * 60_000 }).push).toBe(true);
    // o aviso dentro do app não depende da janela
    expect(outbidDecision({ ...base, lastPushAtMs: NOW - 1000 }).notify).toBe(true);
  });
});

describe("pop-up", () => {
  const alert = (over: Partial<OutbidAlert> = {}): OutbidAlert => ({
    id: "al1",
    collectibleId: ITEM,
    title: "Bola assinada",
    amountCents: 156000,
    updatedAt: new Date(NOW - 60_000).toISOString(),
    ...over,
  });
  const live: OutbidItemState = { status: "live", startsAt: "2026-10-30T10:00:00Z", endsAt: "2026-10-31T10:00:00Z" };
  const items = (state: OutbidItemState = live, id = ITEM) => new Map([[id, state]]);

  it("lê a linha de user_alerts com defesa", () => {
    expect(parseOutbidAlert({ id: "x", kind: "auction_outbid", collectible_id: ITEM, title: "T", amount_cents: 100, updated_at: "2026-10-30T10:00:00Z" })).toEqual({
      id: "x",
      collectibleId: ITEM,
      title: "T",
      amountCents: 100,
      updatedAt: "2026-10-30T10:00:00Z",
    });
    expect(parseOutbidAlert({ id: "x", collectible_id: ITEM, title: null, amount_cents: "250", updated_at: "2026-10-30T10:00:00Z" })?.amountCents).toBe(250);
    expect(parseOutbidAlert({ id: "x", kind: "outro", collectible_id: ITEM, amount_cents: 1, updated_at: "x" })).toBeNull();
    expect(parseOutbidAlert({ id: "x", collectible_id: ITEM, amount_cents: -1, updated_at: "x" })).toBeNull();
    expect(parseOutbidAlert({ collectible_id: ITEM, amount_cents: 1, updated_at: "x" })).toBeNull();
    expect(parseOutbidAlert(null)).toBeNull();
  });

  it("mostra o aviso que vale; link para o item", () => {
    expect(pickOutbidPopup([alert()], { pathname: "/inicio", nowMs: NOW, items: items() })).toEqual({ show: alert(), silent: [] });
    expect(collectibleHref(ITEM)).toBe(`/shop/colecionaveis/${ITEM}`);
  });

  it("na página do próprio item não aparece (o aviso de lá basta) e é dado como visto", () => {
    expect(isOnItemPage(`/shop/colecionaveis/${ITEM}`, ITEM)).toBe(true);
    expect(isOnItemPage(`/shop/colecionaveis/${ITEM}/`, ITEM)).toBe(true);
    expect(isOnItemPage("/shop/colecionaveis", ITEM)).toBe(false);
    expect(isOnItemPage(null, ITEM)).toBe(false);
    expect(pickOutbidPopup([alert()], { pathname: `/shop/colecionaveis/${ITEM}`, nowMs: NOW, items: items() })).toEqual({ show: null, silent: ["al1"] });
    // em outro item, aparece
    expect(pickOutbidPopup([alert()], { pathname: "/shop/colecionaveis/outro", nowMs: NOW, items: items() }).show?.id).toBe("al1");
  });

  it("item encerrado, cancelado, fora do ar ou aviso velho: some sem aparecer", () => {
    const ended = { ...live, endsAt: new Date(NOW - 1000).toISOString() };
    expect(pickOutbidPopup([alert()], { pathname: "/", nowMs: NOW, items: items(ended) }).silent).toEqual(["al1"]);
    expect(pickOutbidPopup([alert()], { pathname: "/", nowMs: NOW, items: items({ ...live, status: "cancelled" }) }).silent).toEqual(["al1"]);
    expect(pickOutbidPopup([alert()], { pathname: "/", nowMs: NOW, items: new Map() }).silent).toEqual(["al1"]);
    const old = alert({ updatedAt: new Date(NOW - OUTBID_ALERT_MAX_AGE_MS - 1).toISOString() });
    expect(pickOutbidPopup([old], { pathname: "/", nowMs: NOW, items: items() })).toEqual({ show: null, silent: ["al1"] });
  });

  it("vários avisos: o mais recente aparece; os outros esperam a próxima rodada", () => {
    const other = "72000000-0000-4000-8000-0000000007c2";
    const older = alert({ id: "old", collectibleId: other, updatedAt: new Date(NOW - 300_000).toISOString() });
    const newer = alert({ id: "new" });
    const both = new Map([...items(), ...items(live, other)]);
    expect(pickOutbidPopup([older, newer], { pathname: "/", nowMs: NOW, items: both })).toEqual({ show: newer, silent: [] });
  });

  it("texto: título do item cortado e valor no idioma da pessoa", () => {
    expect(outbidAlertText(alert(), "pt-BR")).toEqual({ item: "Bola assinada", price: "R$\u00a01.560,00" });
    expect(outbidAlertText(alert(), "en").price).toBe("R$1,560.00");
    const long = outbidAlertText(alert({ title: `  ${"Camisa ".repeat(20)}  ` }), "pt-BR").item;
    expect(Array.from(long).length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("push de lance superado", () => {
  const event = { kind: "auction_outbid" as const, item: "Bola assinada", amountCents: 156000, collectibleId: ITEM };

  it("título, corpo com item e valor, e link para dar outro lance (três idiomas)", () => {
    expect(buildPushMessage(event, "pt-BR", messages("pt-BR"))).toEqual({
      title: "Seu lance foi superado",
      body: "Bola assinada: o lance agora é R$\u00a01.560,00. Toque para dar um novo lance.",
      url: `/shop/colecionaveis/${ITEM}`,
    });
    expect(buildPushMessage(event, "en", messages("en")).title).toBe("You've been outbid");
    expect(buildPushMessage(event, "es", messages("es")).body).toMatch(/^Bola assinada: la puja ahora es .*1560,00/);
  });
});
