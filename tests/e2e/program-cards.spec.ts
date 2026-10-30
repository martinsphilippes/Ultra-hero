import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Página do programa em até 5 cards (Conceito, Prepare-se, Conteúdo, Nutricional, Apoio), logo depois
// do cabeçalho. Os cards são abas: o conteúdo do escolhido aparece logo abaixo, sem trocar de tela
// (estado na URL só com ?secao=, sem entrada no histórico).
// Só leitura: visitante, sem inscrição (cookie uh-e2e: nada é gravado). Roda contra o banco remoto; os
// ramos que dependem do conceito (0048) ou dos produtos ligados ao programa (0059) pulam sem eles.

const PROGRAM = "/programs/manhas-com-intencao";
const TRANSLATED = "/programs/noites-que-descansam";
// programa com receitas e produtos de comida ligados (Nutricional aparece)
const NUTRITION = "/programs/cozinha-rapida-do-dia-a-dia";
// programa com profissional sugerido (0058: Téo Fôlego) e produtos ligados (0059: elástico e tapete)
const SUPPORT = "/programs/base-de-forca-4-semanas";

const card = (page: Page, key: string) => page.getByTestId(`program-card-${key}`);
const panel = (page: Page) => page.getByTestId("program-panel");

async function hasConcept(page: Page): Promise<boolean> {
  return (await card(page, "prepare-se").count()) > 0;
}

test.describe("cards do programa", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
  });

  test("cards depois do cabeçalho, na ordem, sem rolagem horizontal; Conceito aberto abaixo; Nutricional só com material", async ({ page }) => {
    await page.goto(PROGRAM);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Manhãs com Intenção");
    await expect(page.getByRole("heading", { level: 2, name: "Explore o programa" })).toBeVisible();
    const keys = await page.getByTestId("program-cards").locator("[data-testid^=program-card-]").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    const nutrition = (await card(page, "nutricional").count()) > 0;
    const support = (await card(page, "apoio").count()) > 0;
    const expected = [...((await hasConcept(page)) ? ["conceito", "prepare-se"] : ["conceito"]), "conteudo", ...(nutrition ? ["nutricional"] : []), ...(support ? ["apoio"] : [])];
    expect(keys).toEqual(expected.map((k) => `program-card-${k}`));
    // abre com o Conceito escolhido e o conteúdo dele logo abaixo, sem visualizador
    await expect(card(page, "conceito")).toHaveAttribute("aria-selected", "true");
    await expect(panel(page)).toHaveAttribute("data-section", "conceito");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const [cardsBox, panelBox] = await Promise.all([page.getByTestId("program-cards").boundingBox(), panel(page).boundingBox()]);
    expect(panelBox!.y).toBeGreaterThan(cardsBox!.y);
    if (nutrition) {
      await card(page, "nutricional").click();
      await expect(panel(page).locator('[data-testid^="program-nutrition-"]').first()).toBeVisible();
    }
    const [h1Box, cards2] = await Promise.all([page.getByRole("heading", { level: 1 }).boundingBox(), page.getByTestId("program-cards").boundingBox()]);
    expect(cards2!.y).toBeGreaterThan(h1Box!.y);
    await expect(page.getByRole("heading", { name: "Conceito do programa" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("Conceito e Prepare-se: tocar troca o conteúdo abaixo, sem trocar de tela; teclado entre abas", async ({ page }) => {
    await page.goto(PROGRAM);
    test.skip(!(await hasConcept(page)), "banco sem a 0048: o Conceito tem só a descrição");
    await expect(panel(page)).toContainText("dez minutos");
    await expect(panel(page).getByRole("heading", { name: "Para quem é" })).toBeVisible();
    await expect(panel(page)).toContainText("Não é para:");

    await card(page, "prepare-se").click();
    await expect(page).toHaveURL(/secao=prepare-se$/);
    await expect(panel(page)).toHaveAttribute("data-section", "prepare-se");
    await expect(panel(page)).toContainText("7× por semana");
    await expect(panel(page)).toContainText("~10 min por dia");
    await expect(panel(page).getByRole("note", { name: "Cuidados" })).toBeVisible();

    // teclado: seta para a esquerda volta para o Conceito
    await card(page, "prepare-se").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(card(page, "conceito")).toHaveAttribute("aria-selected", "true");
    await expect(card(page, "conceito")).toBeFocused();

    // link direto abre já na aba
    await page.goto(`${PROGRAM}?secao=prepare-se`);
    await expect(card(page, "prepare-se")).toHaveAttribute("aria-selected", "true");
  });

  test("Conteúdo: lista dos passos com estado e links para os conteúdos; acessível", async ({ page }) => {
    await page.goto(`${PROGRAM}?secao=conteudo`);
    await expect(panel(page)).toHaveAttribute("data-section", "conteudo");
    const items = panel(page).getByTestId("program-items").getByRole("listitem");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    await expect(items.first().getByRole("link")).toHaveAttribute("href", /^\/content\//);
    await expect(items.first()).toContainText(/Obrigatório|Opcional/);

    const results = await new AxeBuilder({ page }).include('[data-testid="program-panel"]').include('[data-testid="program-cards"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, help: v.help })), null, 2)).toEqual([]);
  });

  test("Nutricional: aparece com receitas e produtos de comida; conteúdos e depois produtos", async ({ page }) => {
    await page.goto(NUTRITION);
    await expect(card(page, "nutricional")).toBeVisible();
    await card(page, "nutricional").click();
    await expect(page).toHaveURL(/secao=nutricional$/);
    await expect(panel(page).getByRole("heading", { name: "Para comer bem" })).toBeVisible();
    const contents = panel(page).getByTestId("program-nutrition-contents").getByRole("link");
    expect(await contents.count()).toBeGreaterThan(0);
    await expect(panel(page).getByRole("heading", { name: "Produtos para este programa" })).toBeVisible();
    const products = panel(page).getByTestId("product-action-card");
    expect(await products.count()).toBeGreaterThan(0);
    // visitante: o carrinho pede login e volta para esta mesma aba
    await expect(products.first().getByRole("link", { name: /Entrar/ })).toHaveAttribute("href", /secao%3Dnutricional/);
  });

  test("tradução em inglês: rótulos dos cards", async ({ page }) => {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL(TRANSLATED, test.info().project.use.baseURL ?? "http://localhost:3100").toString() }]);
    await page.goto(TRANSLATED);
    await expect(page.getByRole("heading", { level: 2, name: "Explore the program" })).toBeVisible();
    test.skip(!(await hasConcept(page)), "banco sem a 0048");
    await expect(panel(page).getByTestId("program-concept-idea")).toContainText("rigid sleep rules");
  });

  test("app das lojas: Nutricional sem produtos (compra simulada não existe lá), só conteúdos", async ({ browser }) => {
    const baseURL = test.info().project.use.baseURL;
    const context = await browser.newContext({ baseURL, userAgent: "Mozilla/5.0 (Linux; Android 14) GCHeroApp/1.0.0 (android)", locale: "pt-BR" });
    await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
    const page = await context.newPage();
    await page.goto(NUTRITION);
    await card(page, "nutricional").click();
    await expect(panel(page).getByTestId("program-nutrition-contents")).toBeVisible();
    await expect(page.getByTestId("program-nutrition-products")).toHaveCount(0);
    await context.close();
  });

  test("Próximos passos: Começar, Comprar produto e Contratar profissional; card Apoio com as mesmas telas", async ({ page }) => {
    await page.goto(SUPPORT);
    test.skip((await page.getByTestId("program-actions").count()) === 0, "banco sem profissional sugerido nem produto ligado");
    const actions = page.getByTestId("program-actions");
    await expect(actions.getByRole("heading", { level: 2, name: "Próximos passos" })).toBeVisible();
    // Começar: o botão de participar sai do cabeçalho e vem para cá (visitante: entrar)
    await expect(page.getByTestId("program-action-start").getByRole("link", { name: "Entre para participar" })).toHaveAttribute("href", /\/login\?next=/);
    await expect(page.getByRole("link", { name: "Entre para participar" })).toHaveCount(1);
    // Contratar profissional: o sugerido, com o serviço e "Entrar para contratar" (visitante)
    const hire = page.getByTestId("program-action-hire");
    await expect(hire.getByRole("heading", { name: "Contratar profissional" })).toBeVisible();
    await expect(hire.getByTestId("program-support-professional").first()).toContainText("Téo Fôlego");
    await expect(hire.getByTestId("program-support-service").first()).toContainText(/R\$/);
    await expect(hire.getByTestId("hire-login").first()).toHaveAttribute("href", /\/login\?next=/);
    await expect(hire.getByTestId("program-support-profile").first()).toHaveAttribute("href", /\/profissionais\/teo-folego\?origem=programa/);

    const hasProducts = (await page.getByTestId("program-action-buy").count()) > 0;
    if (hasProducts) {
      const buy = page.getByTestId("program-action-buy");
      await expect(buy.getByTestId("program-support-product")).toHaveCount(2);
      await expect(buy.getByTestId("program-support-product").first()).toContainText("Por que este produto");
      await expect(buy.getByRole("link", { name: /Entrar/ }).first()).toHaveAttribute("href", /\/login\?next=/);
    }

    // card Apoio: produtos (se houver) e profissionais, logo abaixo dos cards
    await card(page, "apoio").click();
    await expect(panel(page)).toHaveAttribute("data-section", "apoio");
    if (hasProducts) await expect(panel(page).getByRole("heading", { name: "Produtos do programa" })).toBeVisible();
    await expect(panel(page).getByRole("heading", { name: "Profissionais indicados" })).toBeVisible();
    await expect(panel(page).getByTestId("program-support-professional").first()).toContainText("Téo Fôlego");
  });

  test("390 px: até 5 cards numa linha, rótulos sem estourar e sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SUPPORT);
    const cards = page.getByTestId("program-cards").locator("[data-testid^=program-card-]");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
    const boxes = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const label = el.querySelector("span:not([aria-hidden]):not(.sr-only)") as HTMLElement | null;
        return { top: Math.round(r.top), left: r.left, right: r.right, labelOverflow: label ? label.scrollWidth - label.clientWidth : 0 };
      }),
    );
    expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(390);
      expect(b.labelOverflow).toBeLessThanOrEqual(1);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("app das lojas: Próximos passos sem compra nem contratação (só o perfil do profissional)", async ({ browser }) => {
    const baseURL = test.info().project.use.baseURL;
    const context = await browser.newContext({ baseURL, userAgent: "Mozilla/5.0 (Linux; Android 14) GCHeroApp/1.0.0 (android)", locale: "pt-BR" });
    await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
    const page = await context.newPage();
    await page.goto(SUPPORT);
    test.skip((await page.getByTestId("program-actions").count()) === 0, "banco sem profissional sugerido");
    await expect(page.getByTestId("program-action-buy")).toHaveCount(0);
    await expect(page.getByTestId("program-support-product")).toHaveCount(0);
    const hire = page.getByTestId("program-action-hire");
    await expect(hire.getByRole("heading", { name: "Profissionais indicados" })).toBeVisible();
    await expect(hire.getByTestId("hire-button")).toHaveCount(0);
    await expect(hire.getByTestId("hire-login")).toHaveCount(0);
    await expect(hire.getByTestId("program-support-profile").first()).toBeVisible();
    await context.close();
  });

});
