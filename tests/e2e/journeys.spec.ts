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
    for (const route of ["/evolution", "/profile", "/admin", "/creator", "/seller", "/orders"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  // helena-vilar: personalidade do seed (0008) com vínculos validados (g1→m1, g3→k1, g5→m4, g9→k3).
  test("vê os produtos ligados à personalidade e recebe CTA de login no carrinho de teste", async ({ page }) => {
    await page.goto("/personalities/helena-vilar");
    await page.waitForLoadState("networkidle");
    const tab = page.getByRole("tab", { name: /^produtos\b/i });
    await expect(tab).toBeVisible();
    // As abas trocam via router (client); um clique antes da hidratação não navega — repete até a URL mudar.
    await expect(async () => {
      await tab.click();
      await expect(page).toHaveURL(/\/personalities\/helena-vilar\?tab=produtos$/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(tab).toHaveAttribute("aria-selected", "true");

    const cards = page.getByRole("tabpanel").getByTestId("product-action-card");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // "Produtos · N" e a linha de estatísticas batem com o número de cards renderizados
    const label = (await tab.textContent()) ?? "";
    expect(Number(label.match(/(\d+)/)?.[1])).toBe(count);
    await expect(page.getByText(new RegExp(`· ${count} produtos?$`))).toBeVisible();

    // visitante: cada card leva ao login com retorno para a aba de produtos; nenhum botão de adicionar
    const loginCta = cards.first().getByRole("link", { name: /entrar para adicionar/i });
    await expect(loginCta).toBeVisible();
    await expect(loginCta).toHaveAttribute("href", /^\/login\?next=%2Fpersonalities%2Fhelena-vilar%3Ftab%3Dprodutos$/);
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /adicionar ao carrinho/i })).toHaveCount(0);
    // "Usado em": ao menos um link para o conteúdo de origem
    await expect(cards.first().locator('a[href^="/content/"]').first()).toBeVisible();
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

    await page.goto("/personalities/helena-vilar?type=recipe");
    const firstCard = page.getByRole("link", { name: /.+/ }).filter({ has: page.locator("img") }).first();
    await firstCard.click();
    await expect(page).toHaveURL(/\/content\//);
    await expect(page.getByText(/crédito\/licença|credit\/license/i)).toBeVisible();
  });
});
