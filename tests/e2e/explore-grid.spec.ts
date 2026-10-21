import { expect, test, type Locator, type Page } from "@playwright/test";

// Grade do Explorar (aba Conteúdos, estilo Instagram): 15 quadros por carga, quadrados, variedade de
// heróis e rolagem infinita. Roda contra o banco remoto (seed: 40 posts no ar de 8 heróis).

// Quadros da primeira carga: filhos diretos da grade (os lotes seguintes chegam dentro de `.contents`).
const firstPage = (page: Page) => page.getByTestId("explore-grid").locator("> a");
const allTiles = (page: Page) => page.getByTestId("explore-grid").locator("a");

// Nome acessível do quadro = texto do sr-only: "título · herói · tipo[ · restrição]".
async function heroOf(tile: Locator): Promise<string> {
  const label = (await tile.textContent())?.trim() ?? "";
  const parts = label.split(" · ");
  expect(parts.length, `nome acessível inesperado: "${label}"`).toBeGreaterThanOrEqual(3);
  return parts[1];
}

test.describe("grade do Explorar", () => {
  test("mostra exatamente 15 quadros na primeira carga, todos quadrados", async ({ page }) => {
    await page.goto("/explore");
    const tiles = firstPage(page);
    await expect(tiles).toHaveCount(15);
    const boxes = await Promise.all((await tiles.all()).map((tile) => tile.boundingBox()));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
      expect(box!.width).toBeGreaterThan(40);
    }
    // 3 colunas: os três primeiros na mesma linha, o quarto na linha de baixo.
    expect(boxes[0]!.y).toBeCloseTo(boxes[2]!.y, 0);
    expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 2);
    // Quadro: só capa + ícones; nenhum título visível (o nome fica no sr-only).
    await expect(tiles.first().locator("img")).toHaveAttribute("alt", "");
    await expect(tiles.first().locator("span.sr-only")).toHaveText(/ · /);
    await expect(tiles.first()).toHaveAttribute("href", /^\/content\//);
  });

  test("nos 15 primeiros não há dois quadros consecutivos do mesmo herói", async ({ page }) => {
    await page.goto("/explore");
    const tiles = firstPage(page);
    await expect(tiles).toHaveCount(15);
    const heroes: string[] = [];
    for (const tile of await tiles.all()) heroes.push(await heroOf(tile));
    expect(heroes.every((name) => name.length > 0)).toBe(true);
    for (let i = 1; i < heroes.length; i++) {
      expect(heroes[i], `posições ${i} e ${i + 1} com o mesmo herói: ${heroes.join(" | ")}`).not.toBe(heroes[i - 1]);
    }
    expect(new Set(heroes).size).toBeGreaterThan(1);
  });

  test("rolar até a sentinela carrega mais páginas até a mensagem de fim", async ({ page }) => {
    await page.goto("/explore");
    await expect(firstPage(page)).toHaveCount(15);
    const sentinel = page.getByTestId("explore-sentinel");
    const loadMore = page.getByRole("button", { name: "Carregar mais" });
    const end = page.locator("p:not([aria-live])", { hasText: "Você viu todos os posts" });

    // A rolagem dispara o IntersectionObserver; se a cota automática acabar, o botão assume.
    const nudge = async () => {
      await sentinel.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 400);
      if (await loadMore.isVisible()) await loadMore.click();
    };
    await expect(async () => {
      await nudge();
      expect(await allTiles(page).count()).toBeGreaterThanOrEqual(30);
    }).toPass({ timeout: 30_000 });

    await expect(async () => {
      await nudge();
      await expect(end).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await expect(loadMore).toHaveCount(0);
    // Nenhum quadro repetido entre as páginas (a semente fixa mantém a ordem entre offsets).
    const hrefs = await allTiles(page).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThanOrEqual(30);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("busca por texto mostra a grade com o cabeçalho de resultados", async ({ page }) => {
    await page.goto("/explore?q=sono");
    await expect(page.getByRole("heading", { level: 2, name: "Resultados para “sono”" })).toBeVisible();
    const tiles = firstPage(page);
    expect(await tiles.count()).toBeGreaterThan(0);
    expect(await tiles.count()).toBeLessThanOrEqual(15);
    await expect(page.getByRole("link", { name: "Limpar busca e filtros" })).toBeVisible();
  });

  test("filtrar por pilar mostra menos quadros que o feed completo", async ({ page }) => {
    await page.goto("/explore");
    const total = await firstPage(page).count();
    await page.goto("/explore?pillar=training");
    await expect(page.getByTestId("explore-grid")).toBeVisible();
    const filtered = await firstPage(page).count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    // Com menos de uma carga, não há mais nada para carregar.
    await expect(page.getByRole("button", { name: "Carregar mais" })).toHaveCount(0);
  });
  test("quadro focado pelo teclado mostra o indicador pintado acima da capa", async ({ page }) => {
    await page.goto("/explore");
    const tile = firstPage(page).first();
    await expect(tile).toBeVisible();
    await tile.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(tile).toBeFocused();
    const ring = tile.locator("[data-focus-ring]");
    await expect(ring).toHaveCSS("opacity", "1");
    // O indicador vem depois da imagem no DOM, então é pintado por cima dela.
    const ringAfterImage = await tile.evaluate((link) => {
      const img = link.querySelector("img");
      const span = link.querySelector("[data-focus-ring]");
      return Boolean(img && span && img.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(ringAfterImage).toBe(true);
  });

  test("cada nova carga gera um anúncio com o total na grade", async ({ page }) => {
    await page.goto("/explore");
    await expect(firstPage(page)).toHaveCount(15);
    await page.getByTestId("explore-sentinel").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("explore-announce")).toContainText("30 posts na grade", { timeout: 15_000 });
  });

  test("voltar de um conteúdo do 2º lote devolve a grade com as páginas e o quadro à vista", async ({ page }) => {
    await page.goto("/explore");
    await expect(firstPage(page)).toHaveCount(15);
    await page.getByTestId("explore-sentinel").scrollIntoViewIfNeeded();
    await expect(async () => {
      expect(await allTiles(page).count()).toBeGreaterThanOrEqual(30);
    }).toPass({ timeout: 20_000 });
    // Espera a grade assentar (nenhuma carga em andamento) antes de abrir o quadro.
    await expect(page.getByText("Carregando mais posts…")).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.getByText("Carregando mais posts…")).toHaveCount(0);
    const target = page.getByTestId("explore-grid").locator(".contents a").first();
    const href = await target.getAttribute("href");
    await target.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(async () => {
      expect(await allTiles(page).count()).toBeGreaterThanOrEqual(30);
    }).toPass({ timeout: 20_000 });
    const back = page.getByTestId("explore-grid").locator(`a[href="${href}"]`);
    await expect(back).toBeInViewport();
  });
});
