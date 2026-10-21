import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Acesso rápido às contas de demonstração (uma por tipo de acesso), direto abaixo da caixa de login e
// recolhido no topo do Início. Só aparece quando DEMO_ACCOUNTS_PASSWORD está configurada no servidor.

const ACCOUNTS = [
  { kind: "admin", label: "Admin", url: /\/admin$/ },
  { kind: "creator", label: "Herói / Chef", url: /\/creator$/ },
  { kind: "seller", label: "Fornecedor", url: /\/seller$/ },
  { kind: "premium", label: "Consumidor premium", url: /\/profile$/ },
  { kind: "free", label: "Consumidor gratuito", url: /\/explore$/ },
] as const;

test.describe("acesso rápido às contas de demonstração", () => {
  test("login mostra as 5 contas abaixo da caixa, sem código, e passa no axe", async ({ page }) => {
    await page.goto("/login");
    const panel = page.getByTestId("demo-access");
    test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
    await expect(panel.getByRole("heading", { name: "Entrar com uma conta de demonstração" })).toBeVisible();
    const buttons = panel.locator("[data-demo-kind]");
    await expect(buttons).toHaveCount(5);
    for (const account of ACCOUNTS) {
      const button = panel.locator(`[data-demo-kind="${account.kind}"]`);
      await expect(button).toBeVisible();
      await expect(button).toContainText(account.label);
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // abaixo da caixa de login: o botão "Entrar" do formulário vem antes do painel na tela
    const loginButton = page.getByRole("button", { name: "Entrar", exact: true });
    expect((await loginButton.boundingBox())!.y).toBeLessThan((await buttons.first().boundingBox())!.y);
    await expect(panel.getByLabel(/código/i)).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  for (const account of ACCOUNTS) {
    test(`entra como ${account.kind} com um toque na tela de login`, async ({ page }) => {
      await page.goto("/login");
      const panel = page.getByTestId("demo-access");
      test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
      await panel.locator(`[data-demo-kind="${account.kind}"]`).click();
      await expect(page).toHaveURL(account.url, { timeout: 20_000 });
      // logado: a área protegida abre sem mandar para o login
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/profile$/);
    });
  }

  test("no Início o painel fica recolhido e troca de conta com um toque", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByTestId("demo-access");
    test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
    await expect(panel.locator('[data-demo-kind="premium"]')).toBeHidden();
    await panel.locator("summary").click();
    await panel.locator('[data-demo-kind="premium"]').click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    await page.goto("/");
    await page.getByTestId("demo-access").locator("summary").click();
    await page.getByTestId("demo-access").locator('[data-demo-kind="free"]').click();
    await expect(page).toHaveURL(/\/explore$/, { timeout: 20_000 });
  });
});
