import { expect, test } from "@playwright/test";

// O app sempre abre no claro, mesmo com o aparelho no escuro; a pessoa alterna e a escolha fica salva.
test.describe("tema", () => {
  test.use({ colorScheme: "dark" });

  test("abre no claro com o aparelho no escuro, alterna para escuro e volta", async ({ page }) => {
    await page.goto("/explore");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe("rgb(11, 11, 11)");

    await page.getByRole("button", { name: /Mudar para Escuro/ }).filter({ visible: true }).first().click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(async () => {
      await page.reload();
      await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });

    await page.getByRole("button", { name: /Mudar para Claro/ }).filter({ visible: true }).first().click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(async () => {
      await page.reload();
      await expect(html).toHaveAttribute("data-theme", "light", { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  });

  test("preferência antiga \"sistema\" também abre no claro", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "uh-theme", value: "system", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
