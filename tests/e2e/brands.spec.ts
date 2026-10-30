import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Marcas, produtos externos e Smart Tags (0062). Só leitura: nada é salvo (o cookie uh-e2e=1 também
// desliga o contador de cliques). Roda contra o banco remoto; sem a 0062 lá, as partes que dependem
// dela pulam e o resto confere que nada quebrou (feed, perfil, post, programa e o admin com o aviso).

const HERO = "/personalities/gabriel-medina";
const TAGGED_POST = "/content/afiar-e-cuidar-das-facas-g7";
const PROGRAM = "/programs/hidratacao-e-energia";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectNoSeriousAxe(page: Page, include: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).include(include).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
}

test.describe("marcas e Smart Tags (público)", () => {
  test("perfil do herói: faixa de marcas abre o site da marca fora do app", async ({ page }) => {
    await page.goto(HERO);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalScroll(page);
    const strip = page.getByTestId("brand-strip");
    test.skip((await strip.count()) === 0, "banco sem a 0062 (ou herói sem marca)");
    const chip = strip.getByTestId("brand-chip").first();
    await expect(chip).toHaveAttribute("target", "_blank");
    await expect(chip).toHaveAttribute("rel", "noopener noreferrer sponsored");
    await expect(chip).toHaveAttribute("href", /^https:\/\//);
    await expect(chip).toHaveAttribute("data-relationship", /^(sponsor|mentioned|identified)$/);
    await expectNoSeriousAxe(page, "[data-testid=brand-strip]");
  });

  test("grade do herói: post com produtos marcados tem o ícone discreto", async ({ page }) => {
    await page.goto(HERO);
    await expect(page.getByTestId("hero-posts")).toBeVisible();
    test.skip((await page.getByTestId("tile-smart-tags").count()) === 0, "banco sem a 0062 (ou sem marcações)");
    await expect(page.getByTestId("tile-smart-tags").first()).toBeVisible();
  });

  test("post: marcações sobre a foto abrem o card do produto com Comprar no site da marca", async ({ page }) => {
    await page.goto(TAGGED_POST);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const layer = page.getByTestId("smart-tag-layer");
    test.skip((await layer.count()) === 0, "banco sem a 0062 (ou post sem marcações)");
    // na página do post as marcações já aparecem; o botão discreto esconde/mostra
    await expect(layer).toHaveAttribute("data-revealed", "true");
    const tags = layer.getByTestId("smart-tag");
    await expect(tags.first()).toBeVisible();
    // a marcação fica dentro da foto (object-contain: nada cai na sobra lateral)
    const [tagBox, coverBox] = await Promise.all([tags.first().boundingBox(), page.getByTestId("content-cover").boundingBox()]);
    expect(tagBox!.y).toBeGreaterThanOrEqual(coverBox!.y - 1);
    expect(tagBox!.y + tagBox!.height).toBeLessThanOrEqual(coverBox!.y + coverBox!.height + 1);

    await tags.first().click();
    const card = page.getByTestId("brand-product-card").last();
    await expect(card).toBeVisible();
    const buy = card.getByTestId("brand-product-buy");
    await expect(buy).toHaveAttribute("target", "_blank");
    await expect(buy).toHaveAttribute("rel", "noopener noreferrer sponsored");
    await expect(buy).toHaveAttribute("href", /^https:\/\//);
    await expect(card).toContainText(/Preço/);
    // Ver produto mostra os detalhes ali mesmo (sem sair do app)
    await card.getByTestId("brand-product-view").click();
    await expect(card.getByTestId("brand-product-view")).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");

    // o botão discreto esconde as marcações
    await layer.getByTestId("smart-tag-toggle").click();
    await expect(layer).toHaveAttribute("data-revealed", "false");
    await expect(layer.getByTestId("smart-tag")).toHaveCount(0);
    await noHorizontalScroll(page);
  });

  test("post: equipamentos e produtos recomendados sob o conteúdo", async ({ page }) => {
    await page.goto(TAGGED_POST);
    const block = page.getByTestId("brand-recommended");
    test.skip((await block.count()) === 0, "banco sem a 0062 (ou post sem recomendados)");
    await expect(block.getByRole("heading", { name: "Equipamentos e produtos recomendados" })).toBeVisible();
    const buy = block.getByTestId("brand-recommended-buy").first();
    await expect(buy).toHaveAttribute("target", "_blank");
    await expect(buy).toHaveAttribute("href", /^https:\/\//);
    await noHorizontalScroll(page);
  });

  test("programa: equipamentos no card Apoio, sem quebrar os cards", async ({ page }) => {
    await page.goto(PROGRAM);
    await expect(page.getByTestId("program-cards")).toBeVisible();
    await noHorizontalScroll(page);
    const apoio = page.getByTestId("program-card-apoio");
    test.skip((await apoio.count()) === 0, "banco sem a 0062 (programa sem equipamentos)");
    await apoio.click();
    const block = page.getByTestId("program-panel").getByTestId("brand-recommended");
    test.skip((await block.count()) === 0, "Apoio sem a tela de equipamentos nesta tela");
    await expect(block.getByTestId("brand-recommended-item").first()).toBeVisible();
  });

  test("feed do Início continua igual; post com marcação tem o botão discreto", async ({ page }) => {
    await page.goto("/inicio");
    const posts = page.getByTestId("feed-post");
    await expect(posts.first()).toBeVisible();
    const cover = posts.first().getByTestId("feed-post-cover");
    await expect(cover).toHaveAttribute("href", /^\/content\//);
    await noHorizontalScroll(page);
    const toggles = page.getByTestId("smart-tag-toggle");
    test.skip((await toggles.count()) === 0, "nenhum post com marcação na primeira página (ou banco sem a 0062)");
    const layer = page.getByTestId("smart-tag-layer").first();
    await expect(layer).toHaveAttribute("data-revealed", "false");
    await toggles.first().click();
    await expect(layer).toHaveAttribute("data-revealed", "true");
  });
});

test.describe("marcas e produtos (admin)", () => {
  test("menu leva a Marcas e produtos; sem a 0062, o aviso", async ({ page }) => {
    await loginAs(page, "admin");
    const link = page.locator('a[href="/admin/marcas"]').first();
    await expect(link).toBeAttached();
    await page.goto("/admin/marcas");
    await expect(page.getByTestId("admin-brands-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Marcas e produtos" })).toBeVisible();
    const missing = (await page.getByTestId("admin-brands-unavailable").count()) > 0;
    if (!missing) {
      await expect(page.getByTestId("admin-brand-form")).toBeVisible();
      await expect(page.getByText("Itens com o selo Demonstração são fictícios")).toBeVisible();
    }
    await noHorizontalScroll(page);
  });

  test("conteúdo no admin tem a seção Marcas e produtos da publicação", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/content?q=afiar");
    const row = page.locator('a[href^="/admin/content/"]').filter({ hasText: /Afiar/i }).first();
    test.skip((await row.count()) === 0, "conteúdo de exemplo não encontrado na lista");
    await row.click();
    await expect(page).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Marcas e produtos da publicação" })).toBeVisible();
    const editor = page.getByTestId("admin-smart-tag-editor");
    if ((await editor.count()) > 0) {
      await expect(editor.getByTestId("admin-smart-tag-frame")).toBeVisible();
      await expect(editor.getByTestId("admin-smart-tags-save")).toBeVisible();
    } else {
      await expect(page.getByTestId("admin-brands-unavailable")).toBeVisible();
    }
  });
});
