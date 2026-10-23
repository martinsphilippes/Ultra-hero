import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Portais no topo do Perfil: quem tem papel de herói (ou fornecedor/admin) acha a área de trabalho como
// a primeira opção de toque da página, logo abaixo do título e antes do Hoje. Consumidor não vê o bloco.
// Só leitura: nenhum dado é gravado.

test.describe("portais no topo do Perfil", () => {
  test("herói: o Portal do herói é o primeiro link da página, acima do Hoje, e abre o portal", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/profile");

    const portals = page.getByTestId("profile-portals");
    await expect(portals).toBeVisible();
    const hero = page.getByTestId("profile-portal-creator");
    await expect(hero).toContainText("Portal do herói");
    await expect(hero).toContainText("Posts, receitas e vínculos de produtos");

    // primeira opção de toque: nenhum link antes dele no conteúdo da página
    await expect(page.locator("main a").first()).toHaveAttribute("data-testid", "profile-portal-creator");
    const heroBox = (await hero.boundingBox())!;
    expect(heroBox.height).toBeGreaterThanOrEqual(44);
    const today = page.getByTestId("today-section");
    await expect(today).toBeVisible();
    expect(heroBox.y).toBeLessThan((await today.boundingBox())!.y);
    // o bloco antigo "Seus portais", no meio da página, saiu
    await expect(page.getByRole("heading", { name: "Seus portais" })).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include("[data-testid='profile-portals']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    await hero.click();
    await expect(page).toHaveURL(/\/creator$/);
  });

  test("consumidor não vê portais", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/profile");
    await expect(page.getByTestId("today-section")).toBeVisible();
    await expect(page.getByTestId("profile-portals")).toHaveCount(0);
  });
});
