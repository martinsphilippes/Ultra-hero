import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Hub do herói (RF-004): cabeçalho + bibliotecas por tipo e pilar como botões em largura total,
// cada biblioteca com a sua página. Roda contra o banco remoto (helena-vilar e rafael-duarte do seed).

const libraries = (page: Page) => page.getByTestId("hero-libraries").getByRole("link");

async function expectNoSeriousAxe(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 2)).toEqual([]);
}

test.describe("hub do herói", () => {
  test("mostra as bibliotecas com contagem, sem abas, e cada botão tem alvo de toque de 44px", async ({ page }) => {
    await page.goto("/personalities/helena-vilar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Helena Vilar");
    await expect(page.getByRole("heading", { level: 2, name: "Bibliotecas de Helena Vilar" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);

    const buttons = libraries(page);
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);
    for (const name of ["Receitas", "Programas", "Produtos"]) {
      await expect(buttons.filter({ hasText: name })).toHaveCount(1);
    }
    // nome acessível = rótulo + contagem ("Receitas 4 itens"); contagem > 0 em todas
    const keys: string[] = [];
    for (const button of await buttons.all()) {
      const name = (await button.getAttribute("aria-label")) ?? (await button.textContent()) ?? "";
      const count = Number(name.match(/(\d+)\s*(itens|item)/i)?.[1]);
      expect(count, `contagem em "${name}"`).toBeGreaterThan(0);
      expect(await button.getAttribute("href")).toMatch(/^\/personalities\/helena-vilar\/(rotina|nutricao|receitas|treinos|gastronomia|programas|produtos)$/);
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      keys.push((await button.getAttribute("data-library")) ?? "");
    }
    // ordem fixa das bibliotecas
    const order = ["rotina", "nutricao", "receitas", "treinos", "gastronomia", "programas", "produtos"];
    expect(keys.map((k) => order.indexOf(k))).toEqual([...keys.map((k) => order.indexOf(k))].sort((a, b) => a - b));

    // a nota de direitos continua no rodapé da página
    await expect(page.getByRole("complementary", { name: /sobre este perfil/i })).toBeVisible();
    await expectNoSeriousAxe(page);
  });

  test("clicar em Receitas abre a biblioteca com o cabeçalho de volta e, para visitante, os cards com a faixa da etapa", async ({ page }) => {
    await page.goto("/personalities/helena-vilar");
    const recipes = libraries(page).filter({ hasText: "Receitas" });
    await recipes.click();
    await expect(page).toHaveURL(/\/personalities\/helena-vilar\/receitas$/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Receitas");
    // os cards também levam o nome da chef: o primeiro é o sobretítulo do cabeçalho
    await expect(page.getByText("Helena Vilar", { exact: true }).first()).toBeVisible();
    const back = page.getByRole("link", { name: "Voltar para Helena Vilar" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/personalities/helena-vilar");
    await expect(page).toHaveTitle(/Receitas · Helena Vilar/);
    // P2 (fase 3): os cards ficam abertos a todos; a faixa convida para a etapa que abre a receita.
    await expect(page.getByTestId("recipe-invite")).toBeVisible();
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    // quadro: só capa + ícones, nome acessível no sr-only, link para o conteúdo
    await expectNoSeriousAxe(page);

    await back.click();
    await expect(page).toHaveURL(/\/personalities\/helena-vilar$/);
  });

  // rafael-duarte: sem vínculo por conteúdo no seed; a biblioteca existe só pela alocação direta.
  test("a biblioteca de produtos mostra os 7 produtos Ultra.e Life", async ({ page }) => {
    await page.goto("/personalities/rafael-duarte/produtos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produtos");
    await expect(page.getByRole("link", { name: "Voltar para Rafael Duarte" })).toHaveAttribute("href", "/personalities/rafael-duarte");
    const cards = page.getByTestId("product-action-card");
    await expect(cards).toHaveCount(7);
    for (const title of ["e.water Citrus", "e.water Tangerina", "e.creatina Gummy", "e.creatina Pó", "e.focus", "e.daily", "e.melatonina"]) {
      await expect(cards.filter({ hasText: title })).toHaveCount(1);
    }
    // visitante: o login volta para esta biblioteca
    await expect(cards.first().getByRole("link", { name: /entrar para adicionar/i })).toHaveAttribute("href", /^\/login\?next=%2Fpersonalities%2Frafael-duarte%2Fprodutos$/);
    await expectNoSeriousAxe(page);
  });

  test("as abas antigas redirecionam para a biblioteca ou para o hub", async ({ page }) => {
    await page.goto("/personalities/helena-vilar?tab=produtos");
    await expect(page).toHaveURL(/\/personalities\/helena-vilar\/produtos$/);
    await expect(page.getByTestId("product-action-card").first()).toBeVisible();

    await page.goto("/personalities/helena-vilar?tab=programas");
    await expect(page).toHaveURL(/\/personalities\/helena-vilar\/programas$/);

    await page.goto("/personalities/helena-vilar?tab=conteudos");
    await expect(page).toHaveURL(/\/personalities\/helena-vilar$/);
    await expect(page.getByRole("heading", { level: 2, name: "Bibliotecas de Helena Vilar" })).toBeVisible();
  });

  test("biblioteca inexistente devolve 404", async ({ page }) => {
    const response = await page.goto("/personalities/helena-vilar/inexistente");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/não encontrad/i).first()).toBeVisible();
  });
  test("perfil no formato do Instagram: foto pequena, bio em uma linha com mais e posts 3 por linha", async ({ page }) => {
    await page.goto("/personalities/lia-monteiro");
    const avatar = page.locator("header img").first();
    const box = (await avatar.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(100);

    const bio = page.getByTestId("hero-bio");
    const line = bio.locator("p");
    const oneLine = (await line.boundingBox())!.height;
    expect(oneLine).toBeLessThan(30);
    // "mais" só aparece quando a bio não cabe numa linha (sempre no celular com a bio do seed).
    const more = bio.getByRole("button", { name: "mais" });
    if (await more.count()) {
      await more.click();
      expect((await line.boundingBox())!.height).toBeGreaterThan(oneLine);
      await expect(bio.getByRole("button", { name: "menos" })).toHaveAttribute("aria-expanded", "true");
    }

    const posts = page.getByTestId("hero-posts").locator("> a");
    expect(await posts.count()).toBeGreaterThan(0);
    const boxes = await Promise.all((await posts.all()).slice(0, 4).map((tile) => tile.boundingBox()));
    if (boxes.length >= 3) expect(boxes[0]!.y).toBeCloseTo(boxes[2]!.y, 0);
    if (boxes.length >= 4) expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y);
    for (const b of boxes) expect(Math.abs(b!.width - b!.height)).toBeLessThanOrEqual(2);
  });
});
