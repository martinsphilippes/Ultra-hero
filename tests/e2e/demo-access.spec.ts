import { expect, test } from "@playwright/test";

// Acesso rápido às contas de demonstração (uma por tipo de acesso). Precisa de DEMO_ACCESS_CODE no
// ambiente do teste; sem ele, só confere que o painel fica fechado.
const CODE = process.env.DEMO_ACCESS_CODE ?? "";

const ACCOUNTS = [
  { kind: "admin", url: /\/admin$/ },
  { kind: "creator", url: /\/creator$/ },
  { kind: "seller", url: /\/seller$/ },
  { kind: "premium", url: /\/profile$/ },
  { kind: "free", url: /\/$/ },
] as const;

test.describe("acesso rápido às contas de demonstração", () => {
  test("código errado não libera; sem código não aparece nenhuma conta", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByTestId("demo-access");
    test.skip((await panel.count()) === 0, "painel desligado neste ambiente");
    await panel.locator("summary").click();
    await expect(panel.locator("[data-demo-kind]")).toHaveCount(0);
    await panel.getByLabel("Digite o código de acesso").fill("ERRADO00");
    await panel.getByRole("button", { name: "Liberar" }).click();
    await expect(panel.getByRole("alert")).toHaveText("Código incorreto.");
    await expect(panel.locator("[data-demo-kind]")).toHaveCount(0);
  });

  for (const account of ACCOUNTS) {
    test(`entra como ${account.kind} com um toque`, async ({ page }) => {
      test.skip(!CODE, "DEMO_ACCESS_CODE ausente");
      await page.goto("/");
      const panel = page.getByTestId("demo-access");
      await panel.locator("summary").click();
      await panel.getByLabel("Digite o código de acesso").fill(CODE);
      await panel.getByRole("button", { name: "Liberar" }).click();
      await expect(panel.locator("[data-demo-kind]")).toHaveCount(5);
      await panel.locator(`[data-demo-kind="${account.kind}"]`).click();
      await expect(page).toHaveURL(account.url);
      // logado: a área protegida abre sem mandar para o login
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/profile$/);
    });
  }
});
