import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Configurações (pedido do responsável): as linhas que ficavam no Perfil abaixo do Hoje moram em
// /configuracoes, que abre pelo avatar do cabeçalho e pela linha "Configurações" no fim do Perfil.
// Só leitura: nada é gravado (Sair e Excluir conta só são conferidos, nunca acionados).

test.describe("Configurações", () => {
  test("sem sessão: o cabeçalho mostra Entrar e /configuracoes pede login", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("header").getByRole("link", { name: "Entrar" }).first()).toBeVisible();
    await expect(page.getByTestId("header-settings-link")).toHaveCount(0);
    await page.goto("/configuracoes");
    await expect(page).toHaveURL(/\/login/);
  });

  test("avatar do cabeçalho → Configurações com as seções; Perfil só com cabeçalho, Hoje e a linha Configurações", async ({ page }) => {
    await loginAs(page, "free", { home: null });

    // Perfil: cabeçalho + Editar perfil + Hoje + Configurações, sem as linhas antigas
    await page.goto("/profile");
    const main = page.locator("main");
    await expect(page.getByTestId("profile-account")).toBeVisible();
    await expect(page.getByTestId("today-section")).toBeVisible();
    const row = page.getByTestId("profile-settings");
    await expect(row).toHaveAttribute("href", "/configuracoes");
    const [yToday, yRow] = await Promise.all([page.getByTestId("today-section"), row].map(async (l) => (await l.boundingBox())!.y));
    expect(yToday).toBeLessThan(yRow);
    for (const href of ["/profile/lembretes", "/profile/plan", "/profile/interests", "/profile/herois", "/profile/favorites", "/profile/receitas", "/profile/lista-de-compras", "/orders", "/profile/notifications", "/profile/account"]) {
      await expect(main.locator(`a[href="${href}"]`), href).toHaveCount(0);
    }
    await expect(main.getByRole("button", { name: "Sair da conta" })).toHaveCount(0);
    await expect(page.getByTestId("profile-portals")).toHaveCount(0);

    // avatar: link de 44px com nome acessível que diz para onde vai
    const avatar = page.getByTestId("header-settings-link");
    await expect(avatar).toHaveAttribute("href", "/configuracoes");
    await expect(avatar).toHaveAccessibleName(/^Configurações da conta de \S/);
    const box = (await avatar.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    await avatar.click();
    await expect(page).toHaveURL(/\/configuracoes$/, { timeout: 15_000 });

    await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
    const sections = [
      ["routine", "Sua rotina", ["/profile/lembretes", "/profile/herois", "/profile/interests"]],
      ["collections", "Coleções", ["/profile/favorites", "/profile/receitas", "/profile/lista-de-compras"]],
      ["purchases", "Compras", ["/orders", "/profile/plan"]],
      ["account", "Conta e app", ["/profile/account", "/profile/notifications", "/profile/devices", "/profile#dados"]],
    ] as const;
    for (const [key, heading, hrefs] of sections) {
      const section = page.getByTestId(`settings-section-${key}`);
      await expect(section.getByRole("heading", { level: 2, name: heading })).toBeVisible();
      expect(await section.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual([...hrefs]);
    }
    await expect(page.getByTestId("settings-section-portals")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sair da conta" })).toBeVisible();
    await expect(page.getByTestId("settings-delete-account")).toHaveAttribute("href", "/profile/account#excluir-conta");
    // a aba Perfil segue ativa nas Configurações (celular)
    if ((page.viewportSize()?.width ?? 1000) < 768) {
      await expect(page.getByRole("navigation", { name: /navegação principal/i }).locator('a[aria-current="page"]')).toHaveAttribute("href", "/profile");
    }

    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    // uma linha abre o destino de sempre; Voltar volta às Configurações
    await page.getByTestId("settings-link-favorites").click();
    await expect(page).toHaveURL(/\/profile\/favorites$/, { timeout: 15_000 });
    const back = page.getByTestId("back-link");
    await expect(back).toHaveAttribute("data-history", "true");
    await back.click();
    await expect(page).toHaveURL(/\/configuracoes$/, { timeout: 15_000 });

    // Idioma e tema: abre o editor do Perfil na parte "Sua conta"
    await page.getByTestId("settings-link-appearance").click();
    await expect(page).toHaveURL(/\/profile#dados$/, { timeout: 15_000 });
    await expect(page.locator("#dados")).toBeVisible();
  });
});
