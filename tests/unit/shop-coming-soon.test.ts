import { describe, expect, it } from "vitest";
import { navHref } from "@/components/layout/nav-items";
import { countdownParts, isShopComingSoon, isShopComingSoonDisabled, pad2, resolveShopOpensAt, SHOP_OPENS_AT, shopHomeHref, shopLockedFor } from "@/lib/shop/coming-soon";

const OPEN = Date.parse("2027-01-01T03:00:00Z");

describe("Coming soon da aba Comprar", () => {
  it("abre em 01/01/2027 00:00 de São Paulo", () => {
    expect(SHOP_OPENS_AT).toBe("2027-01-01T03:00:00Z");
    expect(resolveShopOpensAt({})).toBe("2027-01-01T03:00:00.000Z");
    const local = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(OPEN));
    expect(local).toBe("01/01/2027, 00:00");
  });

  it("vale até a abertura e desliga sozinho na data", () => {
    expect(isShopComingSoon(Date.parse("2026-11-04T12:00:00Z"), {})).toBe(true);
    expect(isShopComingSoon(OPEN - 1, {})).toBe(true);
    expect(isShopComingSoon(OPEN, {})).toBe(false);
    expect(isShopComingSoon(new Date(OPEN + 60_000), {})).toBe(false);
  });

  it("aceita data do ambiente só com fuso explícito", () => {
    expect(resolveShopOpensAt({ SHOP_OPENS_AT: "2026-12-01T00:00:00-03:00" })).toBe("2026-12-01T03:00:00.000Z");
    expect(resolveShopOpensAt({ SHOP_OPENS_AT: "2026-12-01T03:00:00Z" })).toBe("2026-12-01T03:00:00.000Z");
    // sem fuso ou inválida: padrão
    expect(resolveShopOpensAt({ SHOP_OPENS_AT: "2026-12-01T00:00" })).toBe("2027-01-01T03:00:00.000Z");
    expect(resolveShopOpensAt({ SHOP_OPENS_AT: "amanhã" })).toBe("2027-01-01T03:00:00.000Z");
    expect(
      isShopComingSoon(Date.parse("2026-12-02T00:00:00Z"), {
        SHOP_OPENS_AT: "2026-12-01T03:00:00Z",
      }),
    ).toBe(false);
  });

  it("kill switch SHOP_COMING_SOON_DISABLED", () => {
    expect(isShopComingSoonDisabled({ SHOP_COMING_SOON_DISABLED: "1" })).toBe(true);
    expect(isShopComingSoonDisabled({ SHOP_COMING_SOON_DISABLED: "true" })).toBe(true);
    expect(isShopComingSoonDisabled({ SHOP_COMING_SOON_DISABLED: "0" })).toBe(false);
    expect(isShopComingSoonDisabled({})).toBe(false);
    expect(isShopComingSoon(OPEN - 1, { SHOP_COMING_SOON_DISABLED: "1" })).toBe(false);
  });

  it("admin nunca fica trancado", () => {
    expect(shopLockedFor({ comingSoon: true, isAdmin: false })).toBe(true);
    expect(shopLockedFor({ comingSoon: true, isAdmin: true })).toBe(false);
    expect(shopLockedFor({ comingSoon: false, isAdmin: false })).toBe(false);
  });

  it("contagem em dias, horas, minutos e segundos", () => {
    const ms = ((58 * 24 + 15) * 3600 + 7 * 60 + 9) * 1000 + 999;
    expect(countdownParts(ms)).toEqual({
      days: 58,
      hours: 15,
      minutes: 7,
      seconds: 9,
      done: false,
    });
    expect(countdownParts(-5000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      done: true,
    });
    expect(pad2(7)).toBe("07");
    expect(pad2(123)).toBe("123");
  });

  it("aba padrão: Colecionáveis no modo, Loja depois", () => {
    expect(shopHomeHref(true)).toBe("/shop/colecionaveis");
    expect(shopHomeHref(false)).toBe("/shop");
    expect(navHref("shop", "/shop", true)).toBe("/shop/colecionaveis");
    expect(navHref("shop", "/shop", false)).toBe("/shop");
    expect(navHref("profile", "/profile", true)).toBe("/profile");
  });
});
