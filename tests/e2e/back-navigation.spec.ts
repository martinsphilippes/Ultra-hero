import { expect, test } from "@playwright/test";

// "Voltar" volta para a tela anterior do app (não para um destino fixo). Aberta direto (link de
// fora, aba nova), a página usa o destino padrão dela. Só leitura.

test.describe("botão de voltar", () => {
  test("herói → post → Voltar retorna à página do herói", async ({ page }) => {
    await page.goto("/personalities");
    const hero = page.locator('main a[href^="/personalities/"]').first();
    const heroHref = (await hero.getAttribute("href"))!;
    await hero.click();
    await expect(page).toHaveURL(new RegExp(`${heroHref}$`));
    const post = page.getByTestId("hero-posts").locator('a[href^="/content/"]').first();
    await post.click();
    await expect(page).toHaveURL(/\/content\//);
    const back = page.getByTestId("back-link");
    await expect(back).toHaveAttribute("data-history", "true");
    await expect(back).toHaveText(/Voltar/);
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${heroHref}$`));
  });

  test("post aberto direto: o voltar leva ao Explorar", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/personalities");
    const firstPost = await (async () => {
      await page.locator('main a[href^="/personalities/"]').first().click();
      return page.getByTestId("hero-posts").locator('a[href^="/content/"]').first().getAttribute("href");
    })();
    await context.close();

    const fresh = await browser.newContext();
    const direct = await fresh.newPage();
    await direct.goto(firstPost!);
    const back = direct.getByTestId("back-link");
    await expect(back).toHaveText(/Explorar/);
    await expect(back).not.toHaveAttribute("data-history", /.*/);
    await expect(back).toHaveAttribute("href", /\/explore/);
    await fresh.close();
  });
});
