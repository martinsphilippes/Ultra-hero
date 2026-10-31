import { describe, expect, it } from "vitest";
import { buildSettingsSections, DELETE_ACCOUNT_HREF, type SettingsSection } from "@/lib/settings/sections";

// Configurações (/configuracoes): as linhas que saíram do Perfil, com os mesmos destinos e travas.
const hrefs = (sections: SettingsSection[]) => sections.flatMap((s) => s.items.map((i) => i.href));
const keys = (sections: SettingsSection[]) => sections.map((s) => [s.key, s.items.map((i) => i.key)]);

describe("buildSettingsSections", () => {
  it("consumidor: 4 seções na ordem, sem Portais", () => {
    expect(keys(buildSettingsSections(["consumer"]))).toEqual([
      ["routine", ["reminders", "heroes", "interests"]],
      ["collections", ["favorites", "recipes", "shoppingList"]],
      ["purchases", ["orders", "plan"]],
      ["account", ["account", "notifications", "devices", "appearance"]],
    ]);
  });

  it("mantém todos os destinos que ficavam no Perfil", () => {
    const all = hrefs(buildSettingsSections(["consumer"]));
    for (const href of [
      "/profile/lembretes",
      "/profile/plan",
      "/profile/interests",
      "/profile/herois",
      "/profile/favorites",
      "/profile/receitas",
      "/profile/lista-de-compras",
      "/orders",
      "/profile/notifications",
      "/profile/account",
    ]) {
      expect(all).toContain(href);
    }
  });

  it("portais só com o papel; o herói não tem portal; fornecedor só com o portal ligado", () => {
    expect(buildSettingsSections(["creator"]).some((s) => s.key === "portals")).toBe(false);
    const admin = buildSettingsSections(["consumer", "admin", "professional", "seller"], false);
    const portals = admin.find((s) => s.key === "portals")!;
    expect(admin.at(-1)).toBe(portals);
    // o admin geral também tem os atalhos da agência e da marca (gestão, 0064)
    expect(portals.items.map((i) => [i.key, i.href])).toEqual([
      ["professional", "/profissional"],
      ["agency", "/agencia"],
      ["brand", "/marca"],
      ["admin", "/admin"],
    ]);
    const withSeller = buildSettingsSections(["seller"], true).find((s) => s.key === "portals")!;
    expect(withSeller.items.map((i) => i.href)).toEqual(["/seller"]);
  });

  it("app das lojas: compras simuladas, plano e portais do profissional, da agência e da marca somem; o resto fica", () => {
    const items = buildSettingsSections(["admin", "professional"]).flatMap((s) => s.items);
    const hidden = items.filter((i) => i.nativeHidden).map((i) => i.href);
    expect(hidden.sort()).toEqual(["/agencia", "/marca", "/orders", "/profile/plan", "/profissional"]);
  });

  it("Excluir conta aponta para a seção da página da conta", () => {
    expect(DELETE_ACCOUNT_HREF).toBe("/profile/account#excluir-conta");
  });
});
