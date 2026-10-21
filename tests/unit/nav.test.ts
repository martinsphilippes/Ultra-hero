import { describe, expect, it } from "vitest";
import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items";

describe("navegação principal", () => {
  it("tem exatamente 4 abas na ordem Início, Explorar, Heróis, Perfil", () => {
    expect(NAV_ITEMS.map((i) => i.key)).toEqual(["home", "explore", "personalities", "profile"]);
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/explore", "/personalities", "/profile"]);
  });

  it("Evolução não é mais aba e fica ativa sob o Perfil", () => {
    expect(NAV_ITEMS.some((i) => i.href.includes("evolution"))).toBe(false);
    expect(isActivePath("/profile/evolution", "/profile")).toBe(true);
  });

  it("Início só fica ativo na raiz e prefixos exigem fronteira de segmento", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/explore", "/")).toBe(false);
    expect(isActivePath("/profiles", "/profile")).toBe(false);
    expect(isActivePath("/personalities/helena-vilar/produtos", "/personalities")).toBe(true);
  });
});
