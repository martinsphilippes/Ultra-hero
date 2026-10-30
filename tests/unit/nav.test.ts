import { describe, expect, it } from "vitest";
import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items";

describe("navegação principal", () => {
  it("tem exatamente 5 abas na ordem Hero, Início, Explorar, Comprar, Perfil", () => {
    expect(NAV_ITEMS.map((i) => i.key)).toEqual(["personalities", "home", "explore", "shop", "profile"]);
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/personalities", "/inicio", "/explore", "/shop", "/profile"]);
  });

  it("Evolução não é mais aba e fica ativa sob o Perfil", () => {
    expect(NAV_ITEMS.some((i) => i.href.includes("evolution"))).toBe(false);
    expect(isActivePath("/profile/evolution", "/profile")).toBe(true);
  });

  it("Comprar fica ativa na loja e na página do produto, não no carrinho", () => {
    expect(isActivePath("/shop", "/shop")).toBe(true);
    expect(isActivePath("/shop/e-creatina-po", "/shop")).toBe(true);
    expect(isActivePath("/shopping", "/shop")).toBe(false);
    expect(isActivePath("/cart", "/shop")).toBe(false);
    // Colecionáveis e Minhas compras moram dentro de Comprar (0054)
    expect(isActivePath("/shop/colecionaveis", "/shop")).toBe(true);
    expect(isActivePath("/shop/compras", "/shop")).toBe(true);
  });

  it("Início só fica ativo na raiz e prefixos exigem fronteira de segmento", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/explore", "/")).toBe(false);
    expect(isActivePath("/profiles", "/profile")).toBe(false);
    expect(isActivePath("/personalities/erick-jacquin/produtos", "/personalities")).toBe(true);
  });
});
