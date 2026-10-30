import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Aba Comprar (/shop): barra inferior com 5 abas, chips de filtro ("Tudo" + os do admin, 0047) e
// grade de 3 produtos por linha no celular. Só leitura: funciona com e sem a 0047 no banco
// (sem ela, só "Tudo" aparece e a loja mostra todos os produtos).

test.describe("aba Comprar", () => {
  test("a barra inferior cabe em 360px com 5 abas de toque ≥ 44px e rótulos inteiros", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "barra inferior só no celular");
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/shop");
    const nav = page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true }).first();
    const links = nav.getByRole("link");
    await expect(links).toHaveText(["Hero", "Início", "Explorar", "Comprar", "Perfil"]);
    // na loja, Comprar fica marcada
    await expect(links.nth(3)).toHaveAttribute("aria-current", "page");
    for (let i = 0; i < 5; i++) {
      const box = (await links.nth(i).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(360.5);
      // rótulo sem reticências: o texto cabe na largura da aba
      const truncated = await links.nth(i).locator("span").last().evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
      expect(truncated).toBe(false);
    }
    // sem rolagem horizontal da página
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  test("chips com 'Tudo' primeiro e marcado; grade de 3 por linha no celular levando ao produto", async ({ page }, testInfo) => {
    await page.goto("/shop");
    const filters = page.getByRole("group", { name: /filtros da loja/i });
    const chips = filters.getByRole("link");
    await expect(chips.first()).toHaveText("Tudo");
    await expect(chips.first()).toHaveAttribute("aria-current", "true");
    await expect(chips.first()).toHaveAttribute("href", "/shop");

    const grid = page.getByTestId("shop-grid");
    const tiles = grid.getByTestId("shop-tile");
    await expect(tiles.first()).toBeVisible();
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(15);

    if (testInfo.project.name === "mobile" && count >= 4) {
      const boxes = await Promise.all([0, 1, 2, 3].map(async (i) => (await tiles.nth(i).boundingBox())!));
      // 3 na mesma linha, o 4º na linha de baixo
      expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(2);
      expect(boxes[3].y).toBeGreaterThan(boxes[0].y + 10);
      expect(boxes[0].width).toBeGreaterThan(100);
    }

    // cada quadro tem nome e preço visíveis e abre a página do produto
    const first = tiles.first().getByRole("link");
    await expect(first).toContainText(/R\$/);
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^\/shop\/[a-z0-9-]+$/);
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("filtro na URL: escolhido fica marcado; desconhecido cai em 'Tudo'; voltar restaura", async ({ page }) => {
    await page.goto("/shop?filtro=nao-existe-123");
    const filters = page.getByRole("group", { name: /filtros da loja/i });
    await expect(filters.getByRole("link").first()).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("shop-tile").first()).toBeVisible();
    const all = await page.getByTestId("shop-tile").count();

    const chips = filters.getByRole("link");
    test.skip((await chips.count()) < 2, "banco sem filtros ativos com produto (sem a 0047)");
    const second = chips.nth(1);
    const label = (await second.textContent())!.trim();
    await second.click();
    await expect(page).toHaveURL(/\/shop\?filtro=[a-z0-9-]+$/);
    await expect(filters.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("shop-tile").first()).toBeVisible();
    expect(await page.getByTestId("shop-tile").count()).toBeLessThanOrEqual(all);

    await page.goBack();
    await expect(page).toHaveURL(/\/shop\?filtro=nao-existe-123$/);
    await expect(filters.getByRole("link").first()).toHaveAttribute("aria-current", "true");
  });

  test("sem violações sérias de acessibilidade", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByTestId("shop-tile").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("admin vê a tela de filtros da loja pelo menu do portal (só leitura)", async ({ page }, testInfo) => {
    await loginAs(page, "admin");
    if (testInfo.project.name === "desktop") {
      await page.getByRole("link", { name: "Filtros da loja" }).first().click();
      await expect(page).toHaveURL(/\/admin\/shop-filters$/);
    } else {
      await page.goto("/admin/shop-filters");
    }
    await expect(page.getByRole("heading", { level: 1, name: "Filtros da loja" })).toBeVisible();
    // com a 0047: os filtros do seed na lista; sem ela: o aviso, sem quebrar a tela
    const rows = page.getByTestId("shop-filter-row");
    const notice = page.getByText(/aplique a migração 0047/i);
    await expect(rows.first().or(notice)).toBeVisible();
    if ((await rows.count()) > 0) {
      await expect(page.getByRole("button", { name: "Novo filtro" })).toBeVisible();
      await expect(rows.filter({ hasText: "suplementos" }).first()).toBeVisible();
    }
  });
});
