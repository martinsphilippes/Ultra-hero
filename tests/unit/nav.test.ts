import { describe, expect, it } from "vitest";
import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items";

describe("navegação principal", () => {
  it("tem exatamente 4 abas na ordem Hero, Início, Explorar, Perfil", () => {
    expect(NAV_ITEMS.map((i) => i.key)).toEqual(["personalities", "home", "explore", "profile"]);
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/personalities", "/", "/explore", "/profile"]);
  });

  it("Evolução não é mais aba e fica ativa sob o Perfil", () => {
    expect(NAV_ITEMS.some((i) => i.href.includes("evolution"))).toBe(false);
    expect(isActivePath("/profile/evolution", "/profile")).toBe(true);
  });

  it("Início só fica ativo na raiz e prefixos exigem fronteira de segmento", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/explore", "/")).toBe(false);
    expect(isActivePath("/profiles", "/profile")).toBe(false);
    expect(isActivePath("/personalities/erick-jacquin/produtos", "/personalities")).toBe(true);
  });
});
