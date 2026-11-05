import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Aba Portal na barra de baixo, à esquerda do Perfil: com um portal abre direto nele, com mais de um abre a escolha em
// /portais, e a barra segue dentro do portal. Os atalhos saíram do Perfil e das Configurações. Só leitura.

const NATIVE_UA = "Mozilla/5.0 (Linux; Android 14) GCHeroApp/1.0.0 (android)";
const PHONE = { width: 390, height: 844 };

test.describe("aba Portal", () => {
  test.use({ viewport: PHONE });

  test("agência: abre direto o portal, à esquerda do Perfil, e a barra continua lá dentro", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/profile");
    await expect(page.getByTestId("profile-portals")).toHaveCount(0);
    const tab = page.getByTestId("nav-portal");
    await expect(tab).toHaveAttribute("href", "/agencia");
    const nav = page.locator(".uh-bottomnav");
    const hrefs = await nav.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(hrefs.indexOf("/agencia")).toBe(hrefs.indexOf("/profile") - 1);
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include(".uh-bottomnav").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await tab.click();
    await expect(page).toHaveURL(/\/agencia/, { timeout: 20_000 });
    await expect(page.getByTestId("nav-portal")).toHaveAttribute("aria-current", "page");
    await nav.locator('a[href="/explore"]').click();
    await expect(page).toHaveURL(/\/explore/, { timeout: 20_000 });
  });

  test("/portais com um portal só leva direto a ele", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/portais");
    await expect(page).toHaveURL(/\/agencia/, { timeout: 20_000 });
  });

  test("admin da conta de demonstração: só a Administração (agência e marca seriam \"indisponível\")", async ({ page }) => {
    await loginAs(page, "admin", { home: null });
    await page.goto("/profile");
    await expect(page.getByTestId("nav-portal")).toHaveAttribute("href", "/admin");
  });

  test("app das lojas: a agência tem a aba Portal, como na web", async ({ page, browser, baseURL }) => {
    // o painel de contas demo não aparece no app: entra pelo navegador e leva a sessão para o app
    await loginAs(page, "agency", { home: null });
    const context = await browser.newContext({ baseURL, userAgent: NATIVE_UA, locale: "pt-BR", viewport: PHONE, storageState: await page.context().storageState() });
    const app = await context.newPage();
    await app.goto("/profile");
    await expect(app.getByTestId("nav-portal")).toHaveAttribute("href", "/agencia");
    await context.close();
  });

  test("consumidor não tem a aba nem a tela de escolha", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/profile");
    await expect(page.getByTestId("today-section")).toBeVisible();
    await expect(page.getByTestId("nav-portal")).toHaveCount(0);
    await page.goto("/portais");
    await expect(page).toHaveURL(/\/profile/, { timeout: 20_000 });
    await page.goto("/configuracoes");
    await expect(page.getByTestId("settings-section-account")).toBeVisible();
    await expect(page.getByTestId("settings-section-portals")).toHaveCount(0);
  });
});
