import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Abertura animada. O script inicial nunca a mostra para navegadores automatizados (navigator.webdriver)
// nem com o cookie uh-e2e, então o resto da suíte não a vê. Aqui o contexto finge um navegador comum
// (webdriver=false) e NÃO tem o cookie uh-e2e. Só páginas públicas (/login), sem depender de login.

async function asRegularBrowser(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    // registra quando o script marcou a abertura e quando ela saiu (relógio da página, sem o atraso do
    // teste). Conta desde o script, antes até de a folha de estilo chegar: é o pior caso.
    const w = window as unknown as { __intro: { on?: number; off?: number } };
    w.__intro = {};
    new MutationObserver(() => {
      const v = document.documentElement.getAttribute("data-intro");
      if (v === "play" && w.__intro.on === undefined) w.__intro.on = performance.now();
      if (v === null && w.__intro.on !== undefined && w.__intro.off === undefined) w.__intro.off = performance.now();
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-intro"] });
  });
}

// Congela a animação (o encerramento automático só viria pela rede de segurança de 3,4 s), para o
// teste de pular não depender da velocidade do servidor.
async function holdIntro(page: Page) {
  await expect(intro(page)).toBeVisible();
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
}

const intro = (page: Page) => page.locator(".uh-intro");

test.describe("abertura animada", () => {
  test("aparece na primeira entrada, some sozinha em ≤3 s e não volta na sessão nem ao recarregar", async ({ page, context }) => {
    await asRegularBrowser(context);
    await page.goto("/login", { waitUntil: "commit" });
    await expect(intro(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-intro", "play");
    // o app continua no HTML por baixo (SEO e nada de esperar a abertura para carregar)
    await expect(page.locator("#email, input[type=email]").first()).toBeAttached();
    // leitor de tela: o palco é decorativo; só o botão Pular fica acessível
    await expect(page.locator(".uh-intro-stage")).toHaveAttribute("aria-hidden", "true");

    await expect(intro(page)).toBeHidden({ timeout: 5_000 });
    const { on, off } = await page.evaluate(() => (window as unknown as { __intro: { on: number; off: number } }).__intro);
    expect(off - on).toBeLessThanOrEqual(3_000);
    await expect(page.locator("html")).not.toHaveAttribute("data-intro", /.*/);

    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-intro", /.*/);
    await expect(intro(page)).toBeHidden();

    await page.goto("/signup");
    await expect(intro(page)).toBeHidden();
  });

  test("o botão Pular encerra na hora (alvo ≥ 44 px)", async ({ page, context }) => {
    await asRegularBrowser(context);
    await page.goto("/login", { waitUntil: "commit" });
    await holdIntro(page);
    const skip = page.getByRole("button", { name: "Pular a abertura" });
    await expect(skip).toBeVisible();
    const box = (await skip.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    await skip.click();
    await expect(intro(page)).toBeHidden({ timeout: 1_000 });
    // nada passou para a tela de baixo nem mudou de rota
    await expect(page).toHaveURL(/\/login$/);
  });

  test("Esc pula", async ({ page, context }) => {
    await asRegularBrowser(context);
    await page.goto("/login", { waitUntil: "commit" });
    await holdIntro(page);
    await page.keyboard.press("Escape");
    await expect(intro(page)).toBeHidden({ timeout: 1_000 });
  });

  test("tocar na tela pula", async ({ page, context }) => {
    await asRegularBrowser(context);
    await page.goto("/login", { waitUntil: "commit" });
    await holdIntro(page);
    await page.mouse.click(40, 300);
    await expect(intro(page)).toBeHidden({ timeout: 1_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("com movimento reduzido", () => {
    test.use({ reducedMotion: "reduce" });
    test("não aparece", async ({ page, context }) => {
      await asRegularBrowser(context);
      await page.goto("/login");
      await expect(page.locator("html")).not.toHaveAttribute("data-intro", /.*/);
      await expect(intro(page)).toBeHidden();
    });
  });

  test("com o cookie uh-e2e nunca aparece", async ({ page, context, baseURL }) => {
    await asRegularBrowser(context);
    await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
    await page.goto("/login");
    await expect(page.locator("html")).not.toHaveAttribute("data-intro", /.*/);
    await expect(intro(page)).toBeHidden();
    await page.goto("/");
    await expect(intro(page)).toBeHidden();
  });

  test("navegador automatizado (webdriver), como o resto da suíte, nunca vê a abertura", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).not.toHaveAttribute("data-intro", /.*/);
    await expect(intro(page)).toBeHidden();
  });
});
