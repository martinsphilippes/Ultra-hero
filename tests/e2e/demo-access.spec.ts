import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Acesso rápido às contas de demonstração (uma por tipo de acesso), direto abaixo da caixa de login e
// recolhido no fim do Perfil (saiu do Início). Todas as contas entram direto na aba Hero. Só aparece quando DEMO_ACCOUNTS_PASSWORD está configurada no servidor.
// Sem o portal do fornecedor (a operação é do admin, 0053), a conta do fornecedor sai do painel.

const ACCOUNTS = [
  { kind: "admin", label: "Admin", url: /\/personalities$/ },
  { kind: "creator", label: "Herói / Chef", url: /\/personalities$/ },
  { kind: "premium", label: "Consumidor premium", url: /\/personalities$/ },
  { kind: "free", label: "Consumidor gratuito", url: /\/personalities$/ },
] as const;

test.describe("acesso rápido às contas de demonstração", () => {
  test("login mostra as 4 contas abaixo da caixa (sem o fornecedor), sem código, e passa no axe", async ({ page }) => {
    await page.goto("/login");
    const panel = page.getByTestId("demo-access");
    test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
    await expect(panel.getByRole("heading", { name: "Entrar com uma conta de demonstração" })).toBeVisible();
    // 4 contas fixas + as opcionais que o admin já criou: "Profissional" (0058) e as da gestão (0064)
    const buttons = panel.locator("[data-demo-kind]");
    let optional = 0;
    for (const kind of ["professional", "agency", "agencyStaff", "brand", "talent"]) optional += (await panel.locator(`[data-demo-kind="${kind}"]`).count()) > 0 ? 1 : 0;
    await expect(buttons).toHaveCount(4 + optional);
    await expect(panel.locator('[data-demo-kind="seller"]')).toHaveCount(0);
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
      // a aba Hero é a primeira da navegação e fica marcada
      const tabs = page.getByRole("navigation", { name: "Navegação principal" }).first().getByRole("link");
      await expect(tabs.first()).toHaveText(/Hero/);
      await expect(tabs.first()).toHaveAttribute("aria-current", "page");
      // logado: a área protegida abre sem mandar para o login
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/profile$/);
    });
  }

  test("Início não mostra o painel; no Perfil ele fica recolhido no fim e troca de conta com um toque", async ({ page }) => {
    await page.goto("/login");
    const login = page.getByTestId("demo-access");
    test.skip((await login.count()) === 0, "contas de demonstração desligadas neste ambiente");
    await login.locator('[data-demo-kind="premium"]').click();
    await expect(page).toHaveURL(/\/personalities$/, { timeout: 20_000 });

    await page.goto("/inicio");
    await expect(page.getByTestId("feed-post").first()).toBeVisible();
    await expect(page.getByTestId("demo-access")).toHaveCount(0);

    await page.goto("/profile");
    const panel = page.getByTestId("demo-access");
    await expect(panel).toHaveCount(1);
    // no fim do Perfil, depois do Hoje
    const today = page.getByTestId("today-section");
    await panel.scrollIntoViewIfNeeded();
    expect((await today.boundingBox())!.y).toBeLessThan((await panel.boundingBox())!.y);
    await expect(panel.locator('[data-demo-kind="free"]')).toBeHidden();
    await panel.locator("summary").click();
    await panel.locator('[data-demo-kind="free"]').click();
    await expect(page).toHaveURL(/\/personalities$/, { timeout: 20_000 });
  });
});
