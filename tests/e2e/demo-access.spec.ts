import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Período de demonstração encerrado (DEMO_ACCESS_OFF em src/lib/demo/server.ts): o /login não mostra mais o
// painel "Contas de demonstração" nem os botões de acesso rápido, mesmo com a senha configurada no ambiente,
// e a ação de entrar como demo só devolve ao login sem entrar. O formulário real segue acessível.

test.describe("acesso rápido desligado", () => {
  test("login sem o painel de contas de demonstração, com o formulário real e axe limpo", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("demo-access")).toHaveCount(0);
    await expect(page.locator("[data-demo-kind]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Entrar/ }).first()).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });

  test("a ação de demonstração não entra: volta ao login sem sessão", async ({ page }) => {
    await page.goto("/login?demo=error");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("demo-access")).toHaveCount(0);
  });
});
