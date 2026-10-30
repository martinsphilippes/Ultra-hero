import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Portais: saíram do topo do Perfil para a seção "Portais" das Configurações (pedido do responsável;
// abre pelo avatar do cabeçalho). O herói segue com o Novo post como primeira opção do Perfil.
// Consumidor não vê a seção. Só leitura: nenhum dado é gravado.

test.describe("portais nas Configurações", () => {
  test("herói ativo: sem o cartão Portal do herói; a primeira opção de toque do Perfil é o Novo post", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/profile");
    await expect(page.getByTestId("hero-new-post")).toBeVisible();
    await expect(page.getByTestId("profile-portal-creator")).toHaveCount(0);
    await expect(page.getByText("Portal do herói", { exact: true })).toHaveCount(0);
    // primeira opção de toque: o Novo post (o resto do portal é da administração, 0045)
    await expect(page.locator("main a").first()).toHaveAttribute("data-testid", "hero-new-post");
    await page.goto("/configuracoes");
    await expect(page.getByTestId("settings-section-portals")).toHaveCount(0);
    await expect(page.getByText("Portal do herói", { exact: true })).toHaveCount(0);
  });

  test("admin: o portal fica em Configurações → Portais (alvo de 44px, sem violação séria) e abre o portal", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/profile");
    await expect(page.getByTestId("today-section")).toBeVisible();
    await expect(page.getByTestId("profile-portals")).toHaveCount(0);

    await page.goto("/configuracoes");
    const portals = page.getByTestId("settings-section-portals");
    await expect(portals.getByRole("heading", { level: 2, name: "Portais" })).toBeVisible();
    const admin = page.getByTestId("settings-portal-admin");
    await expect(admin).toHaveAttribute("href", "/admin");
    const box = (await admin.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include("[data-testid='settings-section-portals']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    await admin.click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test("consumidor não vê portais", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/configuracoes");
    await expect(page.getByTestId("settings-section-account")).toBeVisible();
    await expect(page.getByTestId("settings-section-portals")).toHaveCount(0);
  });
});
