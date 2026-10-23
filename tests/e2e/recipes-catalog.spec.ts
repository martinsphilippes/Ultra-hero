import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Receitas fase 3 contra o banco remoto (0027–0032 já aplicadas), só leitura, salvo a etapa
// demonstrativa da conta demo "free" (que é a própria configuração da conta: a tarefa pede que ela a
// faça se ainda não fez). O cookie uh-e2e=1 desliga os eventos de uso, para não sujar os números.
//  - visitante: aba Receitas no Explorar com cards e faixa da etapa, atalhos e painel de filtros,
//    busca pelo nome da chef, página da receita com a parte pública e o bloqueio no corpo;
//  - free: etapa (se faltar), receita aberta, porções 2 → 4, checklist, imprimir e compartilhar;
//  - perfil do chef: busca dentro das receitas assinadas e herói sem receitas próprias sem filtros.

const G1 = { slug: "bowl-de-frango-grelhado-com-legumes-assados-g1", title: "Bowl de frango grelhado com legumes assados" };

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

async function expectNoSeriousAxe(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))).toEqual([]);
}

async function cardSlugs(page: Page): Promise<string[]> {
  return page.getByTestId("recipe-card").evaluateAll((cards) => cards.map((c) => c.getAttribute("data-slug") ?? ""));
}

test.describe("catálogo de receitas (visitante)", () => {
  test("aba Receitas: cards com tempo, porções e alérgenos declarados, faixa da etapa e sem selo de adequação", async ({ page }) => {
    await page.goto("/explore?tab=receitas");
    await expect(page.getByRole("tab", { name: "Receitas" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("recipe-invite")).toBeVisible();
    const cards = page.getByTestId("recipe-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    const g1 = cards.filter({ has: page.locator(`[href="/content/${G1.slug}"]`) }).first();
    await expect(g1).toContainText(G1.title);
    await expect(g1.getByTestId("recipe-card-time")).toHaveText("35 min");
    await expect(g1).toContainText("2 porções");
    await expect(g1.getByTestId("recipe-card-allergens")).toHaveText("Alérgenos não informados");
    // nenhum selo de adequação (o catálogo não usa os dados de saúde da etapa)
    await expect(page.getByText(/combina com você/i)).toHaveCount(0);
    await expectNoSeriousAxe(page);
  });

  test("atalho 'Até 15 min' traz g3 e g9; chip ativo removível volta ao catálogo inteiro", async ({ page }) => {
    await page.goto("/explore?tab=receitas");
    await page.getByTestId("recipe-filters").getByRole("link", { name: "Até 15 min" }).click();
    await expect(page).toHaveURL(/tab=receitas&tempo=15/);
    await expect(page.getByTestId("recipe-active-filters")).toBeVisible();
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    const slugs = await cardSlugs(page);
    expect(slugs).toEqual(expect.arrayContaining(["molho-de-ervas-em-5-minutos-g3", "panqueca-de-aveia-e-banana-g9"]));
    for (const time of await page.getByTestId("recipe-card-time").allTextContents()) expect(Number(time.replace(/\D/g, ""))).toBeLessThanOrEqual(15);
    await page.getByTestId("recipe-active-filters").getByRole("link", { name: /Remover filtro: Até 15 min/ }).click();
    await expect(page).toHaveURL(/\/explore\?tab=receitas$/);
  });

  test("painel de filtros: 'Sem Ovo' (declarado pelo chef) só deixa receitas com alérgenos declarados e sem ovo", async ({ page }) => {
    await page.goto("/explore?tab=receitas");
    const panel = page.getByTestId("recipe-filters-panel");
    await panel.locator("summary").click();
    await expect(panel.getByText("Sem alérgeno · declarado pelo chef")).toBeVisible();
    await panel.getByText("Sem Ovo", { exact: true }).click();
    await panel.getByTestId("recipe-filters-apply").click();
    await expect(page).toHaveURL(/sem=egg/);
    await expect(page.getByTestId("recipe-active-filters")).toContainText("Sem Ovo");
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    const allergens = await page.getByTestId("recipe-card-allergens").allTextContents();
    expect(allergens.length).toBeGreaterThan(0);
    for (const text of allergens) {
      expect(text).not.toMatch(/Ovo|não informados/);
    }
    expect(await cardSlugs(page)).toContain("salmao-ao-forno-com-batata-doce-g5");
    // vazio com "Limpar filtros"
    await page.goto("/explore?tab=receitas&q=zzzz-nada-assim");
    await expect(page.getByTestId("recipe-catalog-empty")).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
  });

  test("busca pelo nome da chef traz só receitas da Helena", async ({ page }) => {
    await page.goto("/explore?tab=receitas");
    const search = page.getByTestId("recipe-search");
    await search.getByRole("searchbox").fill("Helena");
    await search.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/tab=receitas&q=Helena/);
    await expect(page.getByRole("heading", { name: "Receitas para “Helena”" })).toBeVisible();
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    const signatures = await page.getByTestId("recipe-signature").allTextContents();
    expect(signatures.length).toBeGreaterThan(0);
    for (const s of signatures) expect(s).toContain("Helena Vilar");
  });

  test("página da receita para o visitante: parte pública, compartilhar, bloqueio no corpo e sem ingredientes", async ({ page }) => {
    await page.goto(`/content/${G1.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: G1.title })).toBeVisible();
    await expect(page.getByTestId("recipe-view-public")).toBeVisible();
    await expect(page.getByTestId("recipe-allergens")).toContainText("Alérgenos não informados pelo chef");
    await expect(page.getByTestId("recipe-gate")).toBeVisible();
    await expect(page.getByTestId("recipe-ingredient")).toHaveCount(0);
    await expect(page.getByTestId("recipe-share")).toBeVisible();
    await expect(page.getByTestId("recipe-print")).toHaveCount(0);
    await expect(page.getByTestId("recipe-cook-mode")).toHaveCount(0);
    // SEO: canonical sem parâmetros; JSON-LD só com RECIPES_SEO_INDEX (desligado)
    await page.goto(`/content/${G1.slug}?porcoes=4`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/content/${G1.slug}$`));
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", G1.title);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });

  test("robots.txt tira as áreas de trabalho e o Modo Cozinha dos buscadores", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const path of ["/creator", "/admin", "/profile", "/*/cozinha"]) expect(body).toContain(`Disallow: ${path}`);
  });
});

test.describe("receita aberta (conta free com a etapa)", () => {
  test.describe.configure({ mode: "serial" });

  test("faz a etapa se faltar, abre g1, ajusta porções, marca ingredientes, imprime e compartilha", async ({ page, context }) => {
    await loginAs(page, "free", { home: /\/explore$/ });
    await page.goto(`/content/${G1.slug}`);
    if ((await page.getByTestId("recipe-gate").count()) > 0) {
      // etapa demonstrativa: aceitar o aviso e seguir até concluir (sem marcar alergia)
      await page.getByTestId("recipe-gate-start").click();
      await expect(page.getByTestId("recipe-onboarding")).toBeVisible();
      await page.getByText("Li e aceito o aviso").click();
      for (let i = 0; i < 3; i++) await page.getByTestId("recipe-onboarding-next").click();
      await page.getByTestId("recipe-onboarding-finish").click();
      await expect(page).toHaveURL(new RegExp(`/content/${G1.slug}`), { timeout: 20_000 });
    }
    await expect(page.getByTestId("recipe-view")).toBeVisible();

    // porções de 2 para 4: "300 g" vira "600 g"; "3 colheres" não ajusta
    const chicken = page.getByTestId("recipe-ingredient").filter({ hasText: "Peito de frango" });
    await expect(chicken).toContainText("300 g");
    await expect(page.getByTestId("servings-value")).toHaveValue("2");
    await page.getByTestId("servings-more").click();
    await page.getByTestId("servings-more").click();
    await expect(page.getByTestId("servings-value")).toHaveValue("4");
    await expect(chicken).toContainText("600 g");
    await expect(page.getByTestId("servings-announce")).toHaveText("Quantidades para 4 porções.");
    const herbs = page.getByTestId("recipe-ingredient").filter({ hasText: "Molho de ervas" });
    await expect(herbs).toContainText("3 colheres");
    await expect(herbs.getByTestId("recipe-ingredient-not-scaled")).toHaveText("Não ajustado automaticamente");
    await expect(page).toHaveURL(/porcoes=4/);
    await expect(page.getByTestId("recipe-cook-mode")).toHaveAttribute("href", `/content/${G1.slug}/cozinha?porcoes=4`);

    // digitar no campo: apagar o "4" deixa o campo vazio e "6" dá 6 porções (não 46)
    const field = page.getByTestId("servings-value");
    await field.click();
    await field.press("End");
    await field.press("Backspace");
    await expect(field).toHaveValue("");
    await field.pressSequentially("6");
    await expect(field).toHaveValue("6");
    await expect(page).toHaveURL(/porcoes=6/);
    await expect(chicken).toContainText("900 g");
    // "0" não é aceito, mas o campo mostra o que foi digitado; ao sair, volta ao último valor válido
    await field.press("Backspace");
    await field.pressSequentially("0");
    await expect(field).toHaveValue("0");
    await field.blur();
    await expect(field).toHaveValue("6");
    await field.fill("4");
    await expect(page).toHaveURL(/porcoes=4/);

    // recarregar mantém as porções (servidor lê ?porcoes=) e a marcação do checklist (24 h no aparelho)
    await page.getByRole("checkbox", { name: "Separei: Azeite" }).check();
    // chave do formato antigo (sem a conta): a página a apaga ao montar
    await page.evaluate(() => window.localStorage.setItem("uh-recipe-check:legado", JSON.stringify({ at: Date.now(), ids: [] })));
    await page.reload();
    await expect(page.getByTestId("recipe-ingredient").filter({ hasText: "Peito de frango" })).toContainText("600 g");
    await expect(page.getByRole("checkbox", { name: "Separei: Azeite" })).toBeChecked();
    // as marcações ficam por conta e receita (uh-recipe-check:<conta>:<receita>)
    const checkKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("uh-recipe-check:")));
    expect(checkKeys).toHaveLength(1);
    expect(checkKeys[0]).toMatch(/^uh-recipe-check:[0-9a-f-]{36}:[0-9a-f-]{36}$/);
    // "Limpar marcações" pelo teclado: o botão some e o foco vai para a primeira caixa (não para o <body>)
    await page.getByTestId("ingredient-checks-clear").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("checkbox", { name: "Separei: Azeite" })).not.toBeChecked();
    await expect(page.getByTestId("ingredient-checks-clear")).toHaveCount(0);
    await expect(page.getByTestId("recipe-ingredient").first().getByRole("checkbox")).toBeFocused();

    // cada item do checklist é um alvo de toque de 44px ou mais, na largura toda da linha
    const row = page.getByTestId("recipe-ingredient").first();
    const [rowBox, labelBox] = await Promise.all([row.boundingBox(), row.getByTestId("recipe-ingredient-check").boundingBox()]);
    expect(labelBox!.height).toBeGreaterThanOrEqual(44);
    expect(labelBox!.height).toBeGreaterThanOrEqual(rowBox!.height - 1);
    expect(labelBox!.width).toBeGreaterThanOrEqual(rowBox!.width - 1);

    // no limite, o "−" continua focado (aria-disabled) e outro Enter não faz nada; "Voltar a 2" some e
    // o foco vai para o campo
    await page.getByTestId("servings-value").fill("2");
    const less = page.getByTestId("servings-less");
    await less.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("servings-value")).toHaveValue("1");
    await expect(less).toBeFocused();
    await expect(less).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("servings-value")).toHaveValue("1");
    await page.getByTestId("servings-reset").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("servings-value")).toHaveValue("2");
    await expect(page.getByTestId("servings-reset")).toHaveCount(0);
    await expect(page.getByTestId("servings-value")).toBeFocused();

    // imprimir chama window.print (stub); compartilhar sem Web Share copia o link
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => void ((window as unknown as { __printed: number }).__printed += 1);
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await page.getByTestId("recipe-print").click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    await page.getByTestId("recipe-share").click();
    // com a área de transferência: toast; sem ela: o campo para copiar à mão
    await expect(page.getByText("Link copiado.").or(page.getByTestId("recipe-share-fallback"))).toBeVisible();
    await expectNoSeriousAxe(page);
  });

  test("com a etapa feita, a busca por ingrediente encontra receita que a conta pode abrir", async ({ page }) => {
    await loginAs(page, "free", { home: /\/explore$/ });
    await page.goto("/explore?tab=receitas&q=espinafre");
    test.skip((await page.getByTestId("recipe-invite").count()) > 0, "a conta free ainda não fez a etapa demonstrativa");
    await expect(page.getByTestId("recipe-invite")).toHaveCount(0);
    expect(await cardSlugs(page)).toContain("omelete-de-forno-para-a-semana-g2");
  });
});

test.describe("perfil público do chef", () => {
  test("Helena: busca dentro das receitas assinadas; as indicadas saem com aviso enquanto há busca", async ({ page }) => {
    await page.goto("/personalities/helena-vilar/receitas");
    const search = page.getByTestId("recipe-search");
    await expect(search).toBeVisible();
    await search.getByRole("searchbox").fill("panqueca");
    await search.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/personalities\/helena-vilar\/receitas\?q=panqueca/);
    await expect.poll(() => cardSlugs(page)).toEqual(["panqueca-de-aveia-e-banana-g9"]);
    await expect(page.getByTestId("chef-endorsed")).toHaveCount(0);
    await expectNoSeriousAxe(page);
  });

  test("Helena: o atalho 'Até 15 min' filtra a partir da biblioteca sem parâmetros", async ({ page }) => {
    await page.goto("/personalities/helena-vilar/receitas");
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    await page.getByTestId("recipe-filters").getByRole("link", { name: "Até 15 min" }).click();
    await expect(page).toHaveURL(/\/personalities\/helena-vilar\/receitas\?tempo=15$/);
    await expect(page.getByTestId("recipe-active-filters")).toContainText("Até 15 min");
    await expect(page.getByTestId("recipe-filters").getByRole("link", { name: "Até 15 min", exact: true })).toHaveAttribute("aria-current", "true");
    const times = await page.getByTestId("recipe-card-time").allTextContents();
    expect(times.length).toBeGreaterThan(0);
    for (const time of times) expect(Number(time.replace(/\D/g, ""))).toBeLessThanOrEqual(15);
    // categoria a partir de um filtro já ativo (consulta → consulta) também navega
    const category = page.getByTestId("recipe-filters").getByRole("link", { name: "Café da manhã" });
    await category.click();
    await expect(page).toHaveURL(/tempo=15/);
    await expect(page).toHaveURL(/cat=cafe-da-manha/);
  });

  test("herói sem receitas próprias: só as indicadas, sem busca nem filtros", async ({ page }) => {
    await page.goto("/personalities/lia-monteiro/receitas");
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    await expect(page.getByTestId("recipe-search")).toHaveCount(0);
    await expect(page.getByTestId("recipe-filters")).toHaveCount(0);
    await expect(page.getByTestId("recipe-endorsed").first()).toContainText("Indicada por Lia Monteiro");
  });

  test("perfil da Helena mantém o selo de personagem fictício e mostra especialidades e credenciais quando aprovadas", async ({ page }) => {
    await page.goto("/personalities/helena-vilar");
    await expect(page.getByText("Personagem fictício").first()).toBeVisible();
    const highlights = page.getByTestId("chef-highlights");
    test.skip((await highlights.count()) === 0, "a Helena ainda não tem especialidades nem credenciais aprovadas no remoto");
    const credentials = page.getByTestId("chef-credentials");
    if ((await credentials.count()) > 0) await expect(credentials).toContainText("Credenciais informadas pelo herói");
  });
});
