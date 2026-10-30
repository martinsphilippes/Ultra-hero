import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Portais no topo do Perfil: quem tem papel de herói (ou fornecedor/admin) acha a área de trabalho como
// a primeira opção de toque da página, logo abaixo do título e antes do Hoje. Consumidor não vê o bloco.
// Só leitura: nenhum dado é gravado.

test.describe("portais no topo do Perfil", () => {
  test("herói ativo: sem o cartão Portal do herói; a primeira opção de toque é o Novo post", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/profile");
    await expect(page.getByTestId("hero-new-post")).toBeVisible();
    await expect(page.getByTestId("profile-portal-creator")).toHaveCount(0);
    await expect(page.getByText("Portal do herói", { exact: true })).toHaveCount(0);
    // primeira opção de toque: o Novo post (o resto do portal é da administração, 0045)
    await expect(page.locator("main a").first()).toHaveAttribute("data-testid", "hero-new-post");
    await page.getByTestId("hero-new-post").click();
    await expect(page).toHaveURL(/\/creator\/post\/new$/);
  });

  test("admin: o portal continua como primeiro link da página, acima do Hoje, e abre o portal", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/profile");
    const portals = page.getByTestId("profile-portals");
    await expect(portals).toBeVisible();
    const admin = page.getByTestId("profile-portal-admin");
    await expect(page.locator("main a").first()).toHaveAttribute("data-testid", "profile-portal-admin");
    const box = (await admin.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    const today = page.getByTestId("today-section");
    await expect(today).toBeVisible();
    expect(box.y).toBeLessThan((await today.boundingBox())!.y);
    await expect(page.getByRole("heading", { name: "Seus portais" })).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include("[data-testid='profile-portals']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    await admin.click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test("consumidor não vê portais", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/profile");
    await expect(page.getByTestId("today-section")).toBeVisible();
    await expect(page.getByTestId("profile-portals")).toHaveCount(0);
  });
});
