import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Página do programa em 4 cards (Conceito, Prepare-se, Conteúdo, Nutricional), logo depois do
// cabeçalho. Cada card abre um visualizador em tela cheia com as telas em sequência (estado na URL).
// Só leitura: visitante, sem inscrição. Roda contra o banco remoto; os ramos que dependem do conceito
// (0048) pulam quando o banco cai na descrição.

const PROGRAM = "/programs/manhas-com-intencao";
const TRANSLATED = "/programs/noites-que-descansam";
// programa com receitas e produtos de comida ligados (Nutricional aparece)
const NUTRITION = "/programs/cozinha-rapida-do-dia-a-dia";

const card = (page: Page, key: string) => page.getByTestId(`program-card-${key}`);
const viewer = (page: Page) => page.getByRole("dialog");
const position = (page: Page) => page.getByTestId("program-screen-position");
const current = (page: Page) => page.getByTestId("program-screen-current");

async function hasConcept(page: Page): Promise<boolean> {
  return (await card(page, "prepare-se").count()) > 0;
}

test.describe("cards do programa", () => {
  test("cards depois do cabeçalho, na ordem, sem rolagem horizontal; Nutricional só com material", async ({ page }) => {
    await page.goto(PROGRAM);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Manhãs com Intenção");
    await expect(page.getByRole("heading", { level: 2, name: "Explore o programa" })).toBeVisible();
    const keys = await page.getByTestId("program-cards").locator("[data-testid^=program-card-]").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    const nutrition = (await card(page, "nutricional").count()) > 0;
    const expected = [...((await hasConcept(page)) ? ["conceito", "prepare-se"] : ["conceito"]), "conteudo", ...(nutrition ? ["nutricional"] : [])];
    expect(keys).toEqual(expected.map((k) => `program-card-${k}`));
    // o Nutricional, quando aparece, tem material (receitas indicadas pelo herói, conteúdos ou produtos);
    // sem material ele some (regra coberta em tests/unit/program-cards.test.ts: no banco remoto todo herói indica receitas)
    if (nutrition) {
      await card(page, "nutricional").click();
      await expect(current(page).locator('[data-testid^="program-nutrition-"]').first()).toBeVisible();
      await page.getByTestId("program-screen-close").click();
      await expect(viewer(page)).toBeHidden();
    }
    // cabeçalho antes dos cards; antigos blocos fora da página
    const [h1Box, cardsBox] = await Promise.all([page.getByRole("heading", { level: 1 }).boundingBox(), page.getByTestId("program-cards").boundingBox()]);
    expect(cardsBox!.y).toBeGreaterThan(h1Box!.y);
    await expect(page.getByRole("heading", { name: "Conceito do programa" })).toHaveCount(0);
    await expect(card(page, "conceito")).toContainText(/\d+ telas?/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("Conceito: abre em tela cheia, avança, volta, fecha; URL acompanha e o foco volta ao card", async ({ page }) => {
    await page.goto(PROGRAM);
    test.skip(!(await hasConcept(page)), "banco sem a 0048: o Conceito tem só a descrição");
    await card(page, "conceito").click();
    await expect(viewer(page)).toBeVisible();
    await expect(page).toHaveURL(/secao=conceito&tela=1/);
    await expect(position(page)).toHaveText("Tela 1 de 4");
    await expect(current(page)).toContainText("dez minutos");
    await expect(page.getByTestId("program-screen-back")).toBeDisabled();

    await page.getByTestId("program-screen-next").click();
    await expect(position(page)).toHaveText("Tela 2 de 4");
    await expect(page).toHaveURL(/secao=conceito&tela=2/);
    await expect(current(page).getByRole("heading", { name: "Para quem é" })).toBeFocused();
    await expect(current(page)).toContainText("Não é para:");

    // teclado: seta direita avança, esquerda volta
    await page.keyboard.press("ArrowRight");
    await expect(position(page)).toHaveText("Tela 3 de 4");
    await expect(current(page).getByRole("listitem")).toHaveCount(3);
    await page.keyboard.press("ArrowLeft");
    await expect(position(page)).toHaveText("Tela 2 de 4");

    await page.getByTestId("program-screen-back").click();
    await expect(position(page)).toHaveText("Tela 1 de 4");

    await page.getByTestId("program-screen-close").click();
    await expect(viewer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/secao=/);
    await expect(card(page, "conceito")).toBeFocused();
  });

  test("Prepare-se: ritmo, o que precisa e cuidados; Voltar do navegador fecha; link direto abre na tela", async ({ page }) => {
    await page.goto(PROGRAM);
    test.skip(!(await hasConcept(page)), "banco sem a 0048");
    await card(page, "prepare-se").click();
    await expect(position(page)).toHaveText("Tela 1 de 3");
    await expect(current(page)).toContainText("7× por semana");
    await expect(current(page)).toContainText("~10 min por dia");
    await page.getByTestId("program-screen-next").click();
    await page.getByTestId("program-screen-next").click();
    await expect(current(page).getByRole("note", { name: "Cuidados" })).toContainText("Conteúdo educativo");
    await expect(page.getByTestId("program-screen-done")).toBeVisible();

    await page.goBack();
    await expect(viewer(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${PROGRAM}$`));

    await page.goto(`${PROGRAM}?secao=prepare-se&tela=3`);
    await expect(viewer(page)).toBeVisible();
    await expect(position(page)).toHaveText("Tela 3 de 3");
    await page.getByTestId("program-screen-done").click();
    await expect(viewer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/secao=/);
  });

  test("Conteúdo: lista dos passos com estado e links para os conteúdos; acessível", async ({ page }) => {
    await page.goto(`${PROGRAM}?secao=conteudo`);
    await expect(viewer(page)).toBeVisible();
    const items = current(page).getByTestId("program-items").getByRole("listitem");
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    await expect(items.first().getByRole("link")).toHaveAttribute("href", /^\/content\//);
    await expect(items.first()).toContainText(/Obrigatório|Opcional/);

    const results = await new AxeBuilder({ page }).include('[data-testid="program-screen-viewer"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, help: v.help })), null, 2)).toEqual([]);
  });

  test("Nutricional: aparece com receitas e produtos de comida; conteúdos e depois produtos", async ({ page }) => {
    await page.goto(NUTRITION);
    await expect(card(page, "nutricional")).toBeVisible();
    await card(page, "nutricional").click();
    await expect(page).toHaveURL(/secao=nutricional&tela=1/);
    await expect(current(page).getByRole("heading", { name: "Para comer bem" })).toBeVisible();
    const contents = current(page).getByTestId("program-nutrition-contents").getByRole("link");
    expect(await contents.count()).toBeGreaterThan(0);
    await page.getByTestId("program-screen-next").click();
    await expect(current(page).getByRole("heading", { name: "Produtos para este programa" })).toBeVisible();
    const products = current(page).getByTestId("product-action-card");
    expect(await products.count()).toBeGreaterThan(0);
    // visitante: o carrinho pede login e volta para esta mesma tela
    await expect(products.first().getByRole("link", { name: /Entrar/ })).toHaveAttribute("href", /secao%3Dnutricional%26tela%3D2/);
  });

  test("tradução em inglês: rótulos dos cards e do visualizador", async ({ page }) => {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL(TRANSLATED, test.info().project.use.baseURL ?? "http://localhost:3100").toString() }]);
    await page.goto(TRANSLATED);
    await expect(page.getByRole("heading", { level: 2, name: "Explore the program" })).toBeVisible();
    await card(page, "conceito").click();
    await expect(position(page)).toHaveText(/^Screen 1 of \d+$/);
    test.skip(!(await hasConcept(page)), "banco sem a 0048");
    await expect(current(page).getByTestId("program-concept-idea")).toContainText("rigid sleep rules");
  });

  test("app das lojas: Nutricional sem produtos (compra simulada não existe lá), só conteúdos", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, userAgent: "Mozilla/5.0 (Linux; Android 14) GCHeroApp/1.0.0 (android)", locale: "pt-BR" });
    const page = await context.newPage();
    await page.goto(NUTRITION);
    await card(page, "nutricional").click();
    await expect(position(page)).toHaveText("Tela 1 de 1");
    await expect(current(page).getByTestId("program-nutrition-contents")).toBeVisible();
    await expect(page.getByTestId("program-nutrition-products")).toHaveCount(0);
    await context.close();
  });

  test("celular: deslizar para o lado troca de tela", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "gesto de toque só no celular");
    await page.goto(PROGRAM);
    await card(page, "conceito").click();
    await expect(position(page)).toHaveText(/^Tela 1 de \d+$/);
    test.skip((await position(page).textContent()) === "Tela 1 de 1", "Conceito com uma tela só (banco sem a 0048)");
    const swipe = (fromX: number, toX: number) =>
      current(page).evaluate((el, [a, b]) => {
        const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
        el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(a)], changedTouches: [touch(a)] }));
        el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(b)] }));
      }, [fromX, toX]);
    await swipe(320, 60);
    await expect(position(page)).toHaveText(/^Tela 2 de \d+$/);
    await swipe(60, 320);
    await expect(position(page)).toHaveText(/^Tela 1 de \d+$/);
  });
});
