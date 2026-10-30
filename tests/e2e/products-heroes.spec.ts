import { expect, test, type Locator, type Page } from "@playwright/test";

// Produtos Ultra.e Life (migração 0021): 7 produtos reais com imagem e link para a loja oficial. A 0021
// alocava os 7 a TODOS os heróis; a 0052 tira essa alocação em massa e cada herói passa a mostrar só o
// que indica (alocação feita pelo admin + produtos dos próprios conteúdos). Roda contra o banco remoto,
// com e sem a 0052: cada teste confere o estado que encontrar.

const ULTRAE_TITLES = ["e.water Citrus", "e.water Tangerina", "e.creatina Gummy", "e.creatina Pó", "e.focus", "e.daily", "e.melatonina"];
const STORE = /^https:\/\/selvaje\.lojavirtualnuvem\.com\.br\//;

const productCards = (page: Page) => page.getByTestId("library-products").getByTestId("product-action-card");

/** Banco sem a 0052: o Ronaldinho (sem vínculo por conteúdo) ainda mostra os 7 da alocação em massa. */
async function hasBlanketAllocation(page: Page): Promise<boolean> {
  await page.goto("/personalities/ronaldinho-gaucho");
  await expect(page.getByTestId("hero-stats")).toBeVisible();
  return (await page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Produtos" }).filter({ hasText: /7 itens/i }).count()) === 1;
}

/** Conteúdos do próprio herói (grade de posts da página dele). */
async function ownContentHrefs(page: Page, slug: string): Promise<Set<string>> {
  await page.goto(`/personalities/${slug}`);
  await expect(page.getByTestId("hero-stats")).toBeVisible();
  return new Set(await page.getByTestId("hero-posts").locator('a[href^="/content/"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? "")));
}

async function titlesOf(cards: Locator): Promise<string[]> {
  return cards.evaluateAll((nodes) => nodes.map((n) => n.querySelector("h3")?.textContent?.trim() ?? ""));
}

// next/image carrega sob demanda (loading="lazy"): rola até o card antes de medir o naturalWidth.
async function expectLoadedImage(img: Locator) {
  await expect(img).toBeVisible();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(async () => img.evaluate((el) => ((el as HTMLImageElement).complete ? (el as HTMLImageElement).naturalWidth : 0)), { timeout: 15_000 }).toBeGreaterThan(0);
}

test.describe("produtos do herói", () => {
  // ronaldinho-gaucho: sem vínculo por conteúdo no seed. Com a 0052 não indica produto nenhum: sem atalho.
  test("com a 0052, herói que não indica produto não mostra o atalho Produtos e a biblioteca fica vazia", async ({ page }) => {
    test.skip(await hasBlanketAllocation(page), "banco sem a 0052 (alocação em massa da 0021)");
    for (const slug of ["ronaldinho-gaucho", "neymar"]) {
      await page.goto(`/personalities/${slug}`);
      await expect(page.getByTestId("hero-stats")).toContainText(/(^|\D)0\s*produtos/i);
      await expect(page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Produtos" })).toHaveCount(0);
      await page.goto(`/personalities/${slug}/produtos`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produtos");
      await expect(productCards(page)).toHaveCount(0);
      await expect(page.getByText("Nenhum produto disponível")).toBeVisible();
      await expect(page.getByRole("link", { name: "Ver a loja de demonstração" })).toHaveAttribute("href", "/shop");
    }
  });

  test("os produtos ligados por conteúdo são só de conteúdos do próprio herói", async ({ page }) => {
    for (const slug of ["erick-jacquin", "joao-fonseca"]) {
      const own = await ownContentHrefs(page, slug);
      await page.goto(`/personalities/${slug}/produtos`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produtos");
      const usedIn = await page.getByTestId("library-products").locator('a[href^="/content/"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? ""));
      for (const href of usedIn) expect(own.has(href), `${slug}: "usado em" ${href} é do próprio herói`).toBe(true);
    }
  });

  // ronaldinho-gaucho: sem vínculo por conteúdo no seed; a biblioteca existe só pela alocação direta.
  test("sem a 0052: herói só com alocação direta mostra os 7 produtos da marca, em ordem e com imagem", async ({ page }) => {
    test.skip(!(await hasBlanketAllocation(page)), "banco com a 0052: a alocação em massa saiu (teste acima)");
    await page.goto("/personalities/ronaldinho-gaucho");
    await expect(page.getByTestId("hero-stats")).toContainText(/7\s*produtos/i);
    const button = page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Produtos" });
    await expect(button).toHaveText(/7 itens/i);
    await expect(button).toHaveAttribute("href", "/personalities/ronaldinho-gaucho/produtos");
    await page.goto("/personalities/ronaldinho-gaucho/produtos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produtos");

    const cards = productCards(page);
    await expect(cards).toHaveCount(7);
    const titles = await titlesOf(cards);
    for (let i = 0; i < ULTRAE_TITLES.length; i += 1) expect(titles[i], `card ${i}`).toContain(ULTRAE_TITLES[i]);

    for (const card of await cards.all()) {
      await expect(card.locator("img").first()).toHaveAttribute("src", /\/products\/e-.*\.jpg|_next\/image/);
      await expectLoadedImage(card.locator("img").first());
      // preço real da marca, com o rótulo de demonstração do carrinho de teste
      await expect(card.getByText(/R\$\s?(69,90|89,90)/)).toBeVisible();
      await expect(card.getByText(/preço ilustrativo/i)).toBeVisible();
      // alocação direta: nenhum "usado em" neste herói
      await expect(card.locator('a[href^="/content/"]')).toHaveCount(0);
    }
  });

  // erick-jacquin: tem vínculos validados por conteúdo (seed 0008); sem a 0052, também a alocação em massa.
  test("herói com produtos ligados por conteúdo: alocação direta primeiro, depois os vinculados, sem repetir", async ({ page }) => {
    const blanket = await hasBlanketAllocation(page);
    await page.goto("/personalities/erick-jacquin/produtos");
    const cards = productCards(page);
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    const titles = await titlesOf(cards);
    // nenhum produto repetido entre as duas origens
    expect(new Set(titles).size).toBe(titles.length);

    // os vinculados por conteúdo vêm depois e mostram "usado em" com link para o conteúdo
    const linked = cards.filter({ has: page.locator('a[href^="/content/"]') });
    expect(await linked.count()).toBeGreaterThanOrEqual(1);
    await expect(linked.first().getByText(/usado em/i)).toBeVisible();
    const direct = count - (await linked.count());
    for (let i = 0; i < direct; i += 1) await expect(cards.nth(i).locator('a[href^="/content/"]')).toHaveCount(0);
    if (blanket) {
      // sem a 0052: os 7 da marca na frente
      expect(count).toBeGreaterThan(7);
      for (let i = 0; i < ULTRAE_TITLES.length; i += 1) expect(titles[i], `card ${i}`).toContain(ULTRAE_TITLES[i]);
    }

    // cabeçalho do hub e botão da biblioteca contam a união
    await page.goto("/personalities/erick-jacquin");
    const button = page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Produtos" });
    expect(Number(((await button.textContent()) ?? "").match(/(\d+)/)?.[1])).toBe(count);
    await expect(page.getByTestId("hero-stats")).toContainText(new RegExp(`${count}\\s*produtos`, "i"));
  });

  test("cada card da Ultra.e Life tem o link da loja oficial em nova aba, sem tirar o carrinho de teste", async ({ page }) => {
    // com a 0052 nenhum herói do seed indica produto da marca; o link da loja segue coberto na página do produto (abaixo)
    test.skip(!(await hasBlanketAllocation(page)), "banco com a 0052: nenhum herói com os produtos da marca alocados");
    await page.goto("/personalities/ronaldinho-gaucho/produtos");
    const cards = productCards(page);
    await expect(cards).toHaveCount(7);
    for (const card of await cards.all()) {
      const link = card.getByTestId("official-store-link");
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
      await expect(link).toHaveAttribute("rel", /noreferrer/);
      await expect(link).toHaveAttribute("href", STORE);
      await expect(link).toHaveText(/ver na loja oficial/i);
      await expect(link.locator(".sr-only")).toHaveText(/abre em nova aba/i);
      // visitante: o carrinho de teste segue presente (CTA de login)
      await expect(card.getByRole("link", { name: /entrar para adicionar/i })).toBeVisible();
    }
    // o link externo não fica aninhado dentro do link do produto (WCAG: nada interativo aninhado)
    expect(await page.locator('a[href^="/shop/"] a').count()).toBe(0);
  });

  test("página do produto na loja mostra o link da loja oficial e não marca a marca como fictícia", async ({ page }) => {
    await page.goto("/shop/e-creatina-gummy");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("e.creatina Gummy");
    const link = page.getByTestId("official-store-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", STORE);
    await expect(page.getByText("Ultra.e Life").first()).toBeVisible();
    await expect(page.getByText(/fornecedor fictício/i)).toHaveCount(0);
    // a URL externa não aparece como característica solta
    await expect(page.getByText(/external_url|external url/i)).toHaveCount(0);
  });

  test("a aba Comprar lista os produtos da marca com imagem carregada e filtra Suplementos (com a 0047)", async ({ page }) => {
    await page.goto("/shop");
    const grid = page.getByTestId("shop-grid");
    for (const title of ["e.creatina Gummy", "e.water Citrus"]) {
      const card = grid.getByRole("link", { name: new RegExp(title.replace(".", "\\.")) }).first();
      await expect(card).toBeVisible();
      await expectLoadedImage(card.locator("img").first());
    }
    // sem a 0047 no banco só há "Tudo"; com ela, Suplementos mostra a categoria supplement (5 da marca)
    const filters = page.getByRole("group", { name: /filtros da loja/i });
    const supplements = filters.getByRole("link", { name: "Suplementos", exact: true });
    test.skip((await supplements.count()) === 0, "banco sem a migração 0047 (filtros da loja)");
    await supplements.click();
    await expect(page).toHaveURL(/\/shop\?filtro=suplementos$/);
    await expect(supplements).toHaveAttribute("aria-current", "true");
    await expect(grid.getByRole("listitem")).toHaveCount(5);
    await expect(grid.getByRole("link", { name: /e\.water Citrus/ })).toHaveCount(0);
  });
});
