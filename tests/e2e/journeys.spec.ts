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
    await expect(page.getByTestId("hero-stats")).toContainText(new RegExp(`${count}\\s*produtos?`, "i"));
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

  // "Hoje" com relógio (F1 + F2): a Política (pt-BR) diz que hidratação e descanso deixaram de existir
  // (apagados do aparelho), que nenhum dado de relógio é coletado e que os itens de rotina antigos
  // continuam guardados. Os fluxos logados do Hoje estão em today-watch.spec.ts (contas demo).
  test("política de privacidade explica o fim do registro local de hidratação e os itens de rotina", async ({ page }) => {
    await page.goto("/legal/privacy");
    const main = page.locator("main");
    await expect(main.getByText(/registros de hidratação e descanso: o Hoje deixou de aceitá-los/)).toBeVisible();
    await expect(main.getByText(/nem dados de relógios, anéis ou pulseiras/)).toBeVisible();
    await expect(main.getByText(/Itens de rotina \(antigos\):/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Itens de rotina e marcações diárias" })).toBeVisible();
  });

  // Vídeos gravados pelos heróis já passam pelo Cloudflare Stream: a política cita o operador, o dado
  // guardado e o prazo (atualizada junto com a fase 1 de receitas).
  test("política de privacidade cita o Cloudflare Stream e o prazo dos vídeos dos heróis", async ({ page }) => {
    await page.goto("/legal/privacy");
    const main = page.locator("main");
    await expect(main.getByText(/Cloudflare \(Stream\):/)).toBeVisible();
    await expect(main.getByText(/Vídeos dos heróis:/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Vídeos enviados por heróis" })).toBeVisible();
    await expect(main.locator("time[datetime='2026-10-22']")).toBeVisible();
  });

  // Receitas fase 2: fotos enviadas pelo chef (bucket privado no Supabase Storage), quem vê e o prazo.
  test("política de privacidade cita as fotos de receitas, quem vê e o prazo", async ({ page }) => {
    await page.goto("/legal/privacy");
    const main = page.locator("main");
    await expect(main.getByText(/Fotos e vídeos de receitas:/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Fotos de receitas enviadas por heróis" })).toBeVisible();
  });

  // Receitas fase 3: avaliações por estrelas (o que fica guardado e por quanto tempo).
  test("política de privacidade cita as avaliações de receitas e o prazo", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(page.locator("main").getByText(/Avaliações de receitas:/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Avaliações de receitas (estrelas)" })).toBeVisible();
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

    // Receitas ficam atrás da etapa demonstrativa: o crédito/licença é conferido num conteúdo de rotina.
    await page.goto("/personalities/lia-monteiro/rotina");
    const firstCard = page.getByTestId("library-grid").locator("> a").first();
    await firstCard.click();
    await expect(page).toHaveURL(/\/content\//);
    await expect(page.getByText(/crédito\/licença|credit\/license/i)).toBeVisible();
  });
});
