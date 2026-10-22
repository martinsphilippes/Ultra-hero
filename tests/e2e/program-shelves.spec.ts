import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Biblioteca "Programas" do herói como pilha de prateleiras (estilo playlists): título por programa
// e quadrados das etapas com rolagem lateral. Roda contra o banco remoto: antes da 0035 a Lia tem
// 1 programa (5 etapas); depois, 3 (5, 8 e 6 etapas). O que depende da 0035 pula sem ela.

const LIBRARY = "/personalities/lia-monteiro/programas";

const shelves = (page: Page) => page.getByTestId("program-shelf");
const steps = (shelf: Locator) => shelf.getByTestId("shelf-step");

async function viewportWidth(page: Page) {
  return page.evaluate(() => document.documentElement.clientWidth);
}

/** Quanto do quadrado está dentro da janela (0 a 1), na horizontal. */
async function visibleFraction(page: Page, tile: Locator) {
  const box = (await tile.boundingBox())!;
  const width = await viewportWidth(page);
  const visible = Math.max(0, Math.min(box.x + box.width, width) - Math.max(box.x, 0));
  return visible / box.width;
}

async function expectNoSeriousAxe(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 2)).toEqual([]);
}

test.describe("prateleiras de programas", () => {
  test("cada prateleira tem eyebrow, título com link, meta e ação; lista nomeada e quadrados com nome completo", async ({ page }) => {
    await page.goto(LIBRARY);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Programas");
    const all = shelves(page);
    await expect(all.first()).toBeVisible();
    const count = await all.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (const shelf of await all.all()) {
      const heading = shelf.getByRole("heading", { level: 2 });
      const title = (await heading.textContent())!.trim();
      expect(title.length).toBeGreaterThan(3);
      await expect(heading.getByRole("link")).toHaveAttribute("href", /^\/programs\/[a-z0-9-]+$/);
      await expect(shelf.getByText(/· Programa$/)).toBeVisible();
      await expect(shelf.getByTestId("shelf-meta")).toContainText(/\d+ etapas/);
      await expect(shelf.getByRole("link", { name: new RegExp(`^(Ver programa|Continuar): ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })).toBeVisible();

      const list = shelf.getByRole("list", { name: `Etapas de ${title}` });
      await expect(list).toBeVisible();
      const tiles = steps(shelf);
      const total = await tiles.count();
      expect(total).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < total; i++) {
        // nome vindo do texto visível + trechos só para leitor de tela: "Etapa 2 de 6: Título[, concluída]"
        await expect(tiles.nth(i)).toHaveAccessibleName(new RegExp(`^Etapa ${i + 1} de ${total}: \\S.+$`));
        await expect(tiles.nth(i)).toHaveAttribute("href", /^\/content\/[a-z0-9-]+$/);
      }
      // seção como rótulo discreto: "Essencial" no primeiro quadrado
      await expect(shelf.getByText("Essencial", { exact: true }).first()).toBeVisible();
    }
    await expectNoSeriousAxe(page);
  });

  test("a Lia tem 3 prateleiras (seed 0035)", async ({ page }) => {
    await page.goto(LIBRARY);
    await expect(shelves(page).first()).toBeVisible();
    const count = await shelves(page).count();
    test.skip(count < 3, `banco sem a 0035 (${count} programa da Lia)`);
    expect(count).toBe(3);
    // o original (em destaque) vem primeiro
    await expect(shelves(page).first()).toHaveAttribute("data-program", "manhas-com-intencao");
    for (const shelf of await shelves(page).all()) expect(await steps(shelf).count()).toBeGreaterThanOrEqual(5);
  });

  test("no celular: 3 quadrados inteiros e a ponta do 4º; rolar para a direita revela mais", async ({ page, isMobile }) => {
    test.skip(!isMobile, "medida do Pixel 7");
    await page.goto(LIBRARY);
    await expect(shelves(page).first()).toBeVisible();
    for (const shelf of await shelves(page).all()) {
      const tiles = steps(shelf);
      for (let i = 0; i < 3; i++) expect(await visibleFraction(page, tiles.nth(i)), `quadrado ${i + 1} inteiro`).toBeGreaterThan(0.99);
      const fourth = await visibleFraction(page, tiles.nth(3));
      expect(fourth, "ponta do 4º quadrado").toBeGreaterThan(0.15);
      expect(fourth).toBeLessThan(0.75);
      // primeiro quadrado alinhado à margem de 16px, sem barra de rolagem visível e sem rolar a página
      expect(Math.round((await tiles.first().boundingBox())!.x)).toBe(16);
      const rail = shelf.getByTestId("shelf-rail");
      expect(await rail.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain("x");
      expect(await rail.evaluate((el) => (el as HTMLElement).offsetHeight - el.clientHeight)).toBe(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // rolar a primeira prateleira até o fim: o último quadrado fica inteiro à vista e o primeiro sai
    const shelf = shelves(page).first();
    const tiles = steps(shelf);
    const last = tiles.last();
    expect(await visibleFraction(page, last)).toBeLessThan(0.99);
    await shelf.getByTestId("shelf-rail").evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
    await expect.poll(() => visibleFraction(page, last)).toBeGreaterThan(0.99);
    expect(await visibleFraction(page, tiles.first())).toBeLessThan(0.5);
  });

  test("teclado: Tab percorre os quadrados e o focado entra na vista", async ({ page }) => {
    await page.goto(LIBRARY);
    const shelf = shelves(page).first();
    const tiles = steps(shelf);
    await tiles.first().focus();
    const total = await tiles.count();
    for (let i = 1; i < total; i++) {
      await page.keyboard.press("Tab");
      await expect(tiles.nth(i)).toBeFocused();
      await expect.poll(() => visibleFraction(page, tiles.nth(i)), { message: `quadrado ${i + 1} focado à vista` }).toBeGreaterThan(0.99);
    }
  });

  test("clicar num quadrado abre o conteúdo da etapa", async ({ page }) => {
    await page.goto(LIBRARY);
    const tile = steps(shelves(page).first()).nth(1);
    const href = (await tile.getAttribute("href"))!;
    const title = (await tile.locator("span.line-clamp-2").evaluate((el) => el.firstChild?.textContent ?? "")).trim();
    expect(title.length).toBeGreaterThan(3);
    await tile.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  });

  test("no desktop: setas ‹ › rolam a linha e ficam desabilitadas nas pontas", async ({ page, isMobile }) => {
    test.skip(isMobile, "setas só no desktop");
    // tablet/desktop estreito (≥ md): 5 quadrados de 11rem já passam da largura, então as setas têm o que fazer
    // mesmo antes da 0035 (no remoto a Lia tem 1 programa de 5 etapas)
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto(LIBRARY);
    await expect(shelves(page).first()).toBeVisible();
    // setas existem em todas as prateleiras; numa linha que cabe inteira, as duas ficam desabilitadas
    let overflowing: Locator | null = null;
    for (const shelf of await shelves(page).all()) {
      const prev = shelf.locator("[data-shelf-prev]");
      const next = shelf.locator("[data-shelf-next]");
      await expect(prev).toBeVisible();
      await expect(prev).toHaveAttribute("aria-label", /^Etapas anteriores de /);
      await expect(next).toHaveAttribute("aria-label", /^Próximas etapas de /);
      await expect(prev).toBeDisabled();
      const rail = shelf.getByTestId("shelf-rail");
      const overflows = await rail.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      if (overflows) overflowing ??= shelf;
      else await expect(next).toBeDisabled();
    }
    test.skip(!overflowing, "nenhuma prateleira passa da largura (banco sem a 0035)");
    const shelf = overflowing!;
    const rail = shelf.getByTestId("shelf-rail");
    const prev = shelf.locator("[data-shelf-prev]");
    const next = shelf.locator("[data-shelf-next]");
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(prev).toBeEnabled();
    // até o fim: a seta "próximas" desabilita e o último quadrado fica inteiro
    for (let i = 0; i < 5 && (await next.isEnabled()); i++) {
      // force: entre a checagem e o clique a rolagem suave pode terminar e desabilitar a seta (clique vira no-op)
      await next.click({ force: true });
      await page.waitForTimeout(400);
    }
    await expect(next).toBeDisabled();
    await expect.poll(() => visibleFraction(page, steps(shelf).last())).toBeGreaterThan(0.99);
    await prev.click();
    await expect(next).toBeEnabled();
  });
});
