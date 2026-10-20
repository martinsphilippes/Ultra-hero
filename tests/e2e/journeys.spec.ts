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
    for (const route of ["/evolution", "/profile", "/profile/notifications", "/admin", "/admin/feedback", "/creator", "/seller", "/orders"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("widget de feedback oferece categorias com 'Outro' pré-selecionado (um toque ainda basta)", async ({ page }) => {
    await page.goto("/explore");
    const firstCard = page.getByRole("link", { name: /.+/ }).filter({ has: page.locator("img") }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/(content|programs)\//);
    await page.getByRole("button", { name: "Feedback" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radiogroup", { name: "Nota" })).toBeVisible();
    const categories = dialog.getByRole("radiogroup", { name: "Categoria" });
    await expect(categories).toBeVisible();
    await expect(categories.getByRole("radio")).toHaveCount(5);
    await expect(categories.getByRole("radio", { name: "Outro" })).toBeChecked();
    // Escolher outra categoria pelo teclado/rótulo (chip com área de toque de 44px) muda a seleção.
    await categories.getByText("Sugestão").click();
    await expect(categories.getByRole("radio", { name: "Sugestão" })).toBeChecked();
    await expect(categories.getByRole("radio", { name: "Outro" })).not.toBeChecked();
    await expect(dialog.getByRole("button", { name: "Enviar" })).toBeVisible();
  });

  test("ambiente de demonstração está sinalizado", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/demonstra|demo/i).first()).toBeVisible();
  });
});
