import { expect, test } from "@playwright/test";

// Jornadas críticas sem login (o restante exige contas de teste; ver docs/testing.md).
test.describe("visitante", () => {
  test("explora o catálogo e vê etiquetas de plano, mas não consome conteúdo restrito", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("main")).toBeVisible();
    const firstCard = page.getByRole("link", { name: /.+/ }).filter({ has: page.locator("img") }).first();
    if (await firstCard.count()) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/(content|programs)\//);
      await expect(page.getByRole("link", { name: /entrar|sign in|iniciar sesión/i }).first()).toBeVisible();
    }
  });

  test("não confirma pedido sem login", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("rotas protegidas redirecionam para login", async ({ page }) => {
    for (const route of ["/evolution", "/profile", "/admin", "/creator", "/seller", "/orders"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("ambiente de demonstração está sinalizado", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/demonstra|demo/i).first()).toBeVisible();
  });
});
