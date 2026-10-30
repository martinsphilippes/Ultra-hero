import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Biblioteca "Programas" do herói como pilha de prateleiras (estilo playlists): título por programa
// e quadrados das etapas com rolagem lateral. Roda contra o banco remoto: antes da 0035 a Anitta tem
// 1 programa (5 etapas); depois, 3 (5, 8 e 6 etapas). O que depende da 0035 pula sem ela.

const LIBRARY = "/personalities/anitta/programas";

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

  test("a Anitta tem 3 prateleiras (seed 0035)", async ({ page }) => {
    await page.goto(LIBRARY);
    await expect(shelves(page).first()).toBeVisible();
    const count = await shelves(page).count();
    test.skip(count < 3, `banco sem a 0035 (${count} programa da Anitta)`);
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
    // focus() não espera o elemento aparecer: com o streaming, logo após o "load" o React ainda pode
    // estar com a prateleira no <div hidden> (Suspense ainda não revelado), onde nada recebe foco e o
    // Tab saía do <body> para o "Pular para o conteúdo". Espera a prateleira de verdade, à vista.
    await expect(tiles.first()).toBeVisible();
    await tiles.first().focus();
    await expect(tiles.first()).toBeFocused();
    const total = await tiles.count();
    for (let i = 1; i < total; i++) {
      await page.keyboard.press("Tab");
      await expect(tiles.nth(i)).toBeFocused();
      await expect.poll(() => visibleFraction(page, tiles.nth(i)), { message: `quadrado ${i + 1} focado à vista` }).toBeGreaterThan(0.99);
    }
  });

  test("teclado: o contorno de foco do título da prateleira não é cortado", async ({ page }) => {
    await page.goto(LIBRARY);
    const link = shelves(page).first().getByRole("heading", { level: 2 }).getByRole("link");
    // mesmo motivo do teste anterior: só foca depois que a prateleira saiu do contêiner escondido do streaming
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
    // o contorno fica fora da caixa do link (2px + offset 2px); nenhum ancestro com overflow pode cortá-lo
    const clipped = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) === 0) return "sem contorno";
      const reach = parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset));
      const box = el.getBoundingClientRect();
      for (let node = el.parentElement; node && node.tagName !== "SECTION"; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const r = node.getBoundingClientRect();
        if (box.left - reach < r.left - 0.5 || box.right + reach > r.right + 0.5 || box.top - reach < r.top - 0.5 || box.bottom + reach > r.bottom + 0.5) {
          return `${node.tagName.toLowerCase()} (overflow ${s.overflowX}/${s.overflowY}) corta o contorno`;
        }
      }
      return null;
    });
    expect(clipped).toBeNull();
  });

  test("rótulos de seção aparecem inteiros no celular (es no Pixel 7; pt-BR em 360px)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "largura do celular");
    const notElided = (label: Locator) =>
      label.evaluate((el) => !(getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth));
    await page.goto(LIBRARY);
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "es", url: page.url() }]);
    await page.reload();
    const beyondEs = shelves(page).first().getByText("Para ir más allá", { exact: true });
    await expect(beyondEs).toBeAttached();
    expect(await notElided(beyondEs), "'Para ir más allá' sem reticências").toBe(true);

    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "pt-BR", url: page.url() }]);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.reload();
    const beyond = shelves(page).first().getByText("Para ir além", { exact: true });
    await expect(beyond).toBeAttached();
    expect(await notElided(beyond), "'Para ir além' sem reticências").toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
    // mesmo antes da 0035 (no remoto a Anitta tem 1 programa de 5 etapas)
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
    // até o fim pelo teclado: a seta "próximas" desabilita (aria-disabled) e o foco continua nela,
    // sem cair no <body>; o último quadrado fica inteiro
    await next.focus();
    for (let i = 0; i < 5 && (await next.isEnabled()); i++) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
    }
    await expect(next).toBeDisabled();
    await expect(next).toBeFocused();
    await expect.poll(() => visibleFraction(page, steps(shelf).last())).toBeGreaterThan(0.99);
    // Enter na seta desabilitada não faz nada
    const atEnd = await rail.evaluate((el) => el.scrollLeft);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(await rail.evaluate((el) => el.scrollLeft)).toBe(atEnd);
    await prev.click();
    await expect(next).toBeEnabled();
  });
});
