import { expect, test } from "@playwright/test";

// Jornadas críticas sem login (o restante exige contas de teste; ver docs/testing.md).
test.describe("visitante", () => {
  test("explora o catálogo e vê etiquetas de plano, mas não consome conteúdo restrito", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("main")).toBeVisible();
    const firstCard = page.getByRole("link", { name: /.+/ }).filter({ has: page.locator("img") }).first();
    if (await firstCard.count()) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/(content|programs)\//);
      await expect(page.getByRole("link", { name: /entrar|sign in|iniciar sesión/i }).first()).toBeVisible();
    }
  });

  test("não confirma pedido sem login", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("rotas protegidas redirecionam para login", async ({ page }) => {
    for (const route of ["/profile/evolution", "/profile", "/profile/notifications", "/admin", "/admin/feedback", "/creator", "/seller", "/orders"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("a rota antiga da Evolução vira 308 para o Perfil, preservando a query", async ({ request }) => {
    for (const [from, to] of [
      ["/evolution", /\/profile\/evolution$/],
      ["/evolution?x=1", /\/profile\/evolution\?x=1$/],
    ] as const) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status()).toBe(308);
      expect(res.headers()["location"]).toMatch(to);
    }
  });

  test("navegação principal tem 4 abas e a Evolução não é uma delas", async ({ page }) => {
    await page.goto("/explore");
    const nav = page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true }).first();
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(4);
    await expect(links).toHaveText(["Início", "Explorar", "Heróis", "Perfil"]);
  });

  // helena-vilar: personalidade do seed (0008) com vínculos validados (g1→m1, g3→k1, g5→m4, g9→k3).
  test("vê os produtos ligados à personalidade e recebe CTA de login no carrinho de teste", async ({ page }) => {
    await page.goto("/personalities/helena-vilar");
    const button = page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Produtos" });
    await expect(button).toBeVisible();
    const label = (await button.textContent()) ?? "";
    await button.click();
    await expect(page).toHaveURL(/\/personalities\/helena-vilar\/produtos$/);

    const cards = page.getByTestId("product-action-card");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // "Produtos · N itens" no hub bate com o número de cards renderizados na biblioteca
    expect(Number(label.match(/(\d+)/)?.[1])).toBe(count);
    await page.goBack();
    await expect(page.getByText(new RegExp(`· ${count} produtos?$`, "i"))).toBeVisible();
    await page.goForward();

    // visitante: cada card leva ao login com retorno para a biblioteca de produtos; nenhum botão de adicionar
    const loginCta = cards.first().getByRole("link", { name: /entrar para adicionar/i });
    await expect(loginCta).toBeVisible();
    await expect(loginCta).toHaveAttribute("href", /^\/login\?next=%2Fpersonalities%2Fhelena-vilar%2Fprodutos$/);
    await expect(page.getByRole("button", { name: /adicionar ao carrinho/i })).toHaveCount(0);
    // "Usado em": ao menos um card (os vinculados por conteúdo vêm depois dos alocados diretamente) com link para o conteúdo de origem
    await expect(cards.filter({ has: page.locator('a[href^="/content/"]') }).first().locator('a[href^="/content/"]').first()).toBeVisible();
  });

  test("widget de feedback oferece categorias com 'Outro' pré-selecionado (um toque ainda basta)", async ({ page }) => {
    await page.goto("/explore");
    const firstCard = page.getByRole("link", { name: /.+/ }).filter({ has: page.locator("img") }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/(content|programs)\//);
    await page.getByRole("button", { name: "Feedback" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radiogroup", { name: "Nota" })).toBeVisible();
    const categories = dialog.getByRole("radiogroup", { name: "Categoria" });
    await expect(categories).toBeVisible();
    await expect(categories.getByRole("radio")).toHaveCount(5);
    await expect(categories.getByRole("radio", { name: "Outro" })).toBeChecked();
    // Escolher outra categoria pelo teclado/rótulo (chip com área de toque de 44px) muda a seleção.
    await categories.getByText("Sugestão").click();
    await expect(categories.getByRole("radio", { name: "Sugestão" })).toBeChecked();
    await expect(categories.getByRole("radio", { name: "Outro" })).not.toBeChecked();
    await expect(dialog.getByRole("button", { name: "Enviar" })).toBeVisible();
  });

  // "Hoje" no Perfil: a Política de Privacidade (pt-BR) diz que hidratação e descanso ficam só no aparelho
  // e que os itens de rotina são guardados. Os fluxos logados do "Hoje" não têm E2E (sem contas de teste).
  test("política de privacidade explica o registro local de hidratação e os itens de rotina", async ({ page }) => {
    await page.goto("/legal/privacy");
    const main = page.locator("main");
    await expect(main.getByText(/registros de hidratação e descanso: ficam só no seu aparelho/)).toBeVisible();
    await expect(main.getByText(/Itens de rotina:/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Itens de rotina e marcações diárias" })).toBeVisible();
  });

  test("ambiente de demonstração está sinalizado", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/demonstra|demo/i).first()).toBeVisible();
  });

  // RB-05/RB-06: perfil do seed segue fictício (nota de direitos + selo) e todo conteúdo expõe crédito/licença.
  test("perfil de personalidade mostra a nota de direitos como fictício e o conteúdo mostra crédito/licença", async ({ page }) => {
    await page.goto("/personalities/lia-monteiro");
    const notice = page.getByRole("complementary", { name: /sobre este perfil|about this profile/i });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/fict/i);
    await expect(notice).not.toContainText(/autorizado por|authorized by/i);
    await expect(page.getByText(/personagem fictício|fictional character/i).first()).toBeVisible();

    await page.goto("/personalities/helena-vilar/receitas");
    const firstCard = page.getByTestId("library-grid").locator("> a").first();
    await firstCard.click();
    await expect(page).toHaveURL(/\/content\//);
    await expect(page.getByText(/crédito\/licença|credit\/license/i)).toBeVisible();
  });
});
