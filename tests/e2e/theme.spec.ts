import { expect, test } from "@playwright/test";

// O app sempre abre no escuro, mesmo com o aparelho no claro; a pessoa alterna e a escolha fica salva.
test.describe("tema", () => {
  test.use({ colorScheme: "light" });

  test("abre no escuro com o aparelho no claro, alterna para claro e volta", async ({ page }) => {
    await page.goto("/explore");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: /Mudar para Claro/ }).filter({ visible: true }).first().click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(async () => {
      await page.reload();
      await expect(html).toHaveAttribute("data-theme", "light", { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });

    await page.getByRole("button", { name: /Mudar para Escuro/ }).filter({ visible: true }).first().click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(async () => {
      await page.reload();
      await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  });

  test("a escolha vale mesmo quando a action não chega ao servidor (recarregar logo depois a interrompe)", async ({ page }) => {
    await page.goto("/explore");
    const html = page.locator("html");
    await page.getByRole("button", { name: /Mudar para Claro/ }).filter({ visible: true }).first().click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "uh-theme")?.value).toBe("light");
    // a próxima action não chega (como quando a recarga a interrompe) e a anterior pode responder depois
    // do clique: o cookie "escuro" ficava (ou voltava, pelo Set-Cookie atrasado) e, por ter prioridade no
    // script inicial, a recarga voltava ao escuro — a instabilidade do teste acima. Agora o botão grava o
    // cookie no navegador e a action dele não manda Set-Cookie.
    await page.route("**/*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await page.getByRole("button", { name: /Mudar para Escuro/ }).filter({ visible: true }).first().click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: /Mudar para Claro/ }).filter({ visible: true }).first()).toBeVisible();
    await page.unroute("**/*");
  });

  test("preferência antiga \"sistema\" também abre no escuro", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "uh-theme", value: "system", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
