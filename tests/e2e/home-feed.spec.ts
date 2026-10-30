import { expect, test } from "@playwright/test";

// Início como feed do Instagram: posts um abaixo do outro, rolagem infinita, capa grande, herói no topo.
// Roda contra o banco remoto (seed: 40 posts no ar de 8 heróis).

test.describe("feed do Início", () => {
  test("mostra posts com herói no topo e capa 4:5, sem faixa de pilares nem seções", async ({ page }, info) => {
    await page.goto("/inicio");
    const posts = page.getByTestId("feed-post");
    await expect(posts.first()).toBeVisible();
    expect(await posts.count()).toBeLessThanOrEqual(10);
    await expect(posts.first().getByTestId("feed-post-hero")).toHaveAttribute("href", /^\/personalities\/[^/]+$/);

    const cover = posts.first().getByTestId("feed-post-cover");
    const box = (await cover.boundingBox())!;
    expect(box.height / box.width).toBeCloseTo(1.25, 1);
    if (info.project.name === "mobile") {
      // No celular a capa vai de borda a borda.
      expect(Math.round(box.width)).toBe(page.viewportSize()!.width);
    } else {
      expect(box.width).toBeLessThanOrEqual(472);
    }

    await expect(page.getByRole("navigation", { name: "Explorar por pilar" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Destaques" })).toHaveCount(0);
  });

  test("rolar carrega mais posts sem repetir", async ({ page }) => {
    await page.goto("/inicio");
    const posts = page.getByTestId("feed-post");
    await expect(posts.first()).toBeVisible();
    await expect(async () => {
      await page.getByTestId("feed-sentinel").scrollIntoViewIfNeeded();
      expect(await posts.count()).toBeGreaterThan(10);
    }).toPass({ timeout: 20_000 });
    const hrefs = await page.getByTestId("feed-post-cover").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("tocar no post abre o post isolado e o nome do herói leva ao perfil", async ({ page }) => {
    await page.goto("/inicio");
    const post = page.getByTestId("feed-post").first();
    const heroHref = await post.getByTestId("feed-post-hero").getAttribute("href");
    await post.getByRole("heading").getByRole("link").click();
    await expect(page).toHaveURL(/\/content\/[^/]+$/);
    await page.locator(`main a[href="${heroHref}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${heroHref}$`));
  });
});
