import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { endSession, loginAs } from "./helpers/login";
import { expectNoTestRecipe, purgeTestRecipes } from "./helpers/recipes";
import { seedUuid } from "./helpers/seed";
import { publicSetting, rpcExists } from "./helpers/supabase";

// Receitas fase 6 (seção 4.5 de docs/decisions/recipes-module.md): jornadas completas contra o banco
// remoto, com as contas de demonstração. O cookie uh-e2e=1 desliga eventos e registro de interesse.
//  - chef (Helena): cria a receita "[E2E] …" com ingredientes e etapas, salva, recarrega e confere;
//  - publicação efêmera (P4, opção a): com a revisão desligada (estado atual) a receita vai ao ar, a conta
//    free (que já fez a etapa) a encontra no catálogo, a assinatura leva ao perfil do chef e o Modo Cozinha
//    abre no celular; NO FIM a receita é arquivada e excluída (try/finally) e nada "[E2E]" sobra no remoto.
//    Excluir o que esteve no ar precisa da 0036 (creator_delete_recipe): sem ela no banco a publicação é
//    pulada (o rascunho é criado, conferido e excluído). Com a revisão ligada (o botão vira "Enviar para
//    revisão") a publicação também é pulada: esse modo está no S28 (publicar dá review_required; aprovar
//    publica/agenda) e o comércio desligado no Vitest (shopping-list: commerce_off e commerce_disabled).
//    Nenhuma configuração global é alterada aqui;
//  - persistência: favoritar, recarregar, sair e entrar (g3, conta free);
//  - permissões: editar receita de outro chef dá 404; consumidor no /creator sai do portal; visitante não
//    vê ingredientes;
//  - comércio: o kit da g3 aparece na lista de compras no estado do comércio (ligado: carrinho de teste ou
//    indisponível; desligado: "Compras de teste desligadas").
// O que grava roda só no projeto mobile (as contas são compartilhadas entre os projetos).

const G1 = { slug: "bowl-de-frango-grelhado-com-legumes-assados-g1", title: "Bowl de frango grelhado com legumes assados" };
const G3 = { slug: "molho-de-ervas-em-5-minutos-g3", title: "Molho de ervas em 5 minutos" };
const G2_ID = seedUuid("content:g2"); // receita do Marcos (outro chef)
const PREFIX = "[E2E] Jornada";
const LIST_PATH = "/profile/lista-de-compras";
const CHEF_SLUG = "helena-vilar";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

/**
 * Página de 404 do app. O status HTTP fica 200 quando a rota tem loading.tsx (o streaming já começou
 * quando o notFound() roda); o que vale é a tela "Página não encontrada" (com noindex), sem o conteúdo.
 */
async function expectNotFound(page: Page) {
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
}

/** Contexto novo (outra pessoa no mesmo projeto), com o cookie que desliga os eventos. */
async function newPersonContext(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const context = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  await context.addCookies([{ name: "uh-e2e", value: "1", url: info.project.use.baseURL! }]);
  return context;
}

/** Abre a receita; se a conta ainda não fez a etapa demonstrativa, faz os 4 passos e volta. */
async function openWithStep(page: Page, slug: string, title: string) {
  const path = `/content/${slug}`;
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  if ((await page.getByTestId("recipe-gate").count()) > 0) {
    await page.getByTestId("recipe-gate-start").click();
    await expect(page.getByTestId("recipe-onboarding")).toBeVisible();
    await page.locator("#recipe-notice").check();
    for (let i = 0; i < 3; i += 1) await page.getByTestId("recipe-onboarding-next").click();
    await page.getByTestId("recipe-onboarding-finish").click();
    await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 20_000 });
  }
  await expect(page.getByTestId("recipe-gate")).toHaveCount(0);
  await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 });
}

async function clickNext(page: Page, step: string) {
  await page.getByTestId("recipe-next").click();
  await expect(page.getByTestId("recipe-wizard")).toHaveAttribute("data-step", step, { timeout: 20_000 });
}

/** Cria pelo editor de 6 etapas: básicos, 2 ingredientes, 2 etapas e "Nenhum alérgeno". Devolve o id. */
async function createRecipe(page: Page, title: string): Promise<string> {
  await page.goto("/creator/recipes/new");
  await page.getByTestId("recipe-title").fill(title);
  await page.getByTestId("recipe-summary").fill("Receita do teste automático das jornadas; sai do ar e é excluída no fim.");
  await page.getByTestId("recipe-category-cafe-da-manha").click();
  await page.getByTestId("recipe-servings").fill("2");
  await page.getByTestId("recipe-prep").fill("5");
  await page.getByTestId("recipe-cook").fill("10");
  await page.getByTestId("recipe-next").click();
  await expect(page).toHaveURL(/\/creator\/recipes\/[0-9a-f-]+\/edit\?step=ingredientes$/, { timeout: 30_000 });
  const id = page.url().split("/")[5];

  await page.getByTestId("add-ingredient").click();
  await page.getByTestId("ingredient-name").nth(0).fill("Farinha de aveia");
  await page.getByTestId("ingredient-amount").nth(0).fill("1/2");
  await page.getByTestId("ingredient-unit").nth(0).selectOption("cup");
  await page.getByTestId("add-ingredient").click();
  await page.getByTestId("ingredient-name").nth(1).fill("Ovo");
  await page.getByTestId("ingredient-amount").nth(1).fill("2");
  await clickNext(page, "preparo");

  await page.getByTestId("add-step").click();
  await page.getByTestId("step-instruction").nth(0).fill("Misture a aveia com os ovos.");
  await page.getByTestId("step-minutes").nth(0).fill("2");
  await page.getByTestId("add-step").click();
  await page.getByTestId("step-instruction").nth(1).fill("Doure dos dois lados em frigideira untada.");
  await clickNext(page, "midia");
  await clickNext(page, "complementos");
  await page.getByTestId("allergens-none").check();
  await clickNext(page, "revisao");
  await page.getByTestId("recipe-save").click();
  await expect(page.getByTestId("recipe-save-state")).toContainText("Salvo às", { timeout: 20_000 });
  return id;
}

test.describe("jornada do chef e publicação efêmera (P4)", () => {
  test("chef cria, salva e recarrega; publicada, a conta free acha no catálogo, a assinatura leva ao perfil e o Modo Cozinha abre; no fim sai do remoto", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "mobile", "grava no remoto: roda só no projeto mobile");
    test.setTimeout(360_000);
    // a exclusão do que esteve no ar é a 0036; sem ela a receita não pode ir ao ar (sobraria no remoto)
    const canPurgePublished = (await rpcExists("creator_delete_recipe", { p_content: "00000000-0000-4000-8000-000000000000" })) === true;

    await loginAs(page, "creator");
    await purgeTestRecipes(page, PREFIX); // sobras antigas de execuções interrompidas
    const title = `${PREFIX} ${Date.now()}`;
    let consumer: BrowserContext | null = null;
    let publicPath: string | null = null;

    try {
      // ---- criar, salvar, recarregar e conferir
      const id = await createRecipe(page, title);
      await page.goto(`/creator/recipes/${id}/edit?step=ingredientes`);
      await expect(page.getByTestId("ingredient-name").nth(0)).toHaveValue("Farinha de aveia");
      await expect(page.getByTestId("ingredient-amount").nth(0)).toHaveValue("1/2");
      await expect(page.getByTestId("ingredient-unit").nth(0)).toHaveValue("cup");
      await expect(page.getByTestId("ingredient-name").nth(1)).toHaveValue("Ovo");
      await page.getByTestId("recipe-step-preparo").click();
      await expect(page.getByTestId("step-instruction").nth(0)).toHaveValue("Misture a aveia com os ovos.");
      await expect(page.getByTestId("step-minutes").nth(0)).toHaveValue("2");
      await expect(page.getByTestId("step-instruction").nth(1)).toHaveValue("Doure dos dois lados em frigideira untada.");
      await page.getByTestId("recipe-step-basicos").click();
      await expect(page.getByTestId("recipe-title")).toHaveValue(title);
      await expect(page.getByTestId("recipe-total")).toHaveValue("15");

      // ---- publicar (só com a revisão desligada e a 0036 no banco)
      await page.goto(`/creator/recipes/${id}/edit?step=revisao`);
      await expect(page.getByText("Tudo pronto para publicar.")).toBeVisible();
      const publish = page.getByTestId("recipe-publish");
      if (!canPurgePublished || (await publish.count()) === 0) {
        info.annotations.push({
          type: "publicação pulada",
          description: !canPurgePublished
            ? "banco sem a 0036 (creator_delete_recipe): a receita não pode ir ao ar sem poder ser excluída depois"
            : "revisão de receitas ligada: o envio para revisão e a aprovação estão no S28",
        });
        return;
      }
      await publish.click();
      await expect(page).toHaveURL(/\/creator\/recipes$/, { timeout: 30_000 });
      await page.goto(`/creator/recipes?q=${encodeURIComponent(title)}`);
      await expect(page.getByTestId("recipes-count")).toHaveText("1 receita");
      await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();

      // ---- conta free (outra pessoa): catálogo, assinatura → perfil do chef, página e Modo Cozinha
      consumer = await newPersonContext(browser, info);
      const free = await consumer.newPage();
      await loginAs(free, "free");
      await openWithStep(free, G3.slug, G3.title); // garante a etapa feita
      await free.goto(`/explore?tab=receitas&q=${encodeURIComponent(title)}`);
      const card = free.getByTestId("recipe-card").filter({ hasText: title });
      await expect(card).toHaveCount(1);
      const slug = (await card.getAttribute("data-slug"))!;
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      publicPath = `/content/${slug}`;
      await expect(card.getByTestId("recipe-signature")).toHaveAttribute("href", `/personalities/${CHEF_SLUG}`);
      await card.getByTestId("recipe-signature").click();
      await expect(free).toHaveURL(new RegExp(`/personalities/${CHEF_SLUG}$`));
      await expect(free.getByRole("heading", { level: 1 })).toContainText("Helena");
      // a receita nova está entre as assinadas pelo chef
      await free.goto(`/personalities/${CHEF_SLUG}/receitas?q=${encodeURIComponent(title)}`);
      await expect(free.getByTestId("recipe-card").filter({ hasText: title })).toHaveCount(1);

      await free.goto(publicPath);
      await expect(free.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await free.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 });
      await expect(free.getByTestId("recipe-ingredient").filter({ hasText: "Farinha de aveia" })).toContainText("1/2 xícara");
      await expect(free.getByTestId("recipe-steps")).toContainText("Misture a aveia com os ovos.");
      await free.getByTestId("recipe-cook-mode").click();
      await expect(free).toHaveURL(new RegExp(`${publicPath}/cozinha$`));
      const progress = free.getByTestId("cook-progress");
      await expect(progress).toHaveText("Etapa 1 de 2");
      await expect(free.getByTestId("cook-instruction")).toHaveText("Misture a aveia com os ovos.");
      await free.getByTestId("cook-next").click();
      await expect(progress).toHaveText("Etapa 2 de 2");
      await expect(free.getByTestId("cook-instruction")).toHaveText("Doure dos dois lados em frigideira untada.");
      await free.getByTestId("cook-back").click();
      await expect(free).toHaveURL(new RegExp(`${publicPath}$`));
    } finally {
      // ---- sai do remoto: arquivar e excluir (ou só excluir o rascunho); nada desta execução sobra
      await purgeTestRecipes(page, PREFIX, { title });
      await expectNoTestRecipe(page, title);
      if (publicPath && consumer) {
        const visitor = await consumer.newPage();
        await visitor.goto(`/explore?tab=receitas&q=${encodeURIComponent(title)}`);
        await expect(visitor.getByTestId("recipe-card").filter({ hasText: title })).toHaveCount(0);
        await visitor.goto(publicPath);
        await expectNotFound(visitor);
        await expect(visitor.getByRole("heading", { level: 1, name: title })).toHaveCount(0);
      }
      await consumer?.close();
    }
  });
});

test.describe("persistência (conta free)", () => {
  test("favoritar g3, recarregar, sair e entrar: segue favorita e na coleção; o estado inicial volta no fim", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "grava na conta compartilhada: roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAs(page, "free");
    await openWithStep(page, G3.slug, G3.title);
    const fav = () => page.getByRole("button", { name: /^(Favoritar|Remover dos favoritos)$/ });
    const wasFavorite = (await fav().getAttribute("aria-pressed")) === "true";
    try {
      if (!wasFavorite) {
        await fav().click();
        await expect(page.getByText("Adicionado aos favoritos")).toBeVisible();
      }
      await expect(fav()).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await expect(fav()).toHaveAttribute("aria-pressed", "true");

      // sair (só este navegador) e entrar de novo: veio do banco, não do aparelho
      await endSession(page);
      await loginAs(page, "free");
      await page.goto(`/content/${G3.slug}`);
      await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 });
      await expect(fav()).toHaveAttribute("aria-pressed", "true");
      await page.goto("/profile/receitas");
      await expect(page.getByTestId("saved-list")).toContainText(G3.title);
    } finally {
      if (!wasFavorite) {
        await page.goto("/profile/receitas");
        const remove = page.getByRole("button", { name: `Remover ${G3.title} das salvas` });
        if ((await remove.count()) > 0) {
          await remove.click();
          await page.getByTestId("saved-remove-confirm").click();
          await expect(page.getByRole("button", { name: `Remover ${G3.title} das salvas` })).toHaveCount(0);
        }
      }
    }
  });
});

test.describe("permissões", () => {
  test("visitante não vê ingredientes nem o Modo Cozinha (o corpo nem chega ao HTML)", async ({ page }) => {
    await page.goto(`/content/${G1.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: G1.title })).toBeVisible();
    await expect(page.getByTestId("recipe-gate")).toBeVisible();
    await expect(page.getByTestId("recipe-ingredient")).toHaveCount(0);
    expect(await page.content()).not.toContain("Peito de frango");
    await page.goto(`/content/${G1.slug}/cozinha`);
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("chef: editar a receita de outro chef dá 404", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto(`/creator/recipes/${G2_ID}/edit`);
    await expectNotFound(page);
    await expect(page.getByTestId("recipe-wizard")).toHaveCount(0);
    await expect(page.getByText("Omelete de forno")).toHaveCount(0);
    // a prévia e as versões também não abrem
    await page.goto(`/creator/recipes/${G2_ID}/preview`);
    await expectNotFound(page);
    await expect(page.getByTestId("recipe-view")).toHaveCount(0);
    await page.goto(`/creator/recipes/${G2_ID}/versions`);
    await expectNotFound(page);
  });

  test("consumidor no /creator sai do portal (vai para o início) e o visitante vai para o login", async ({ page }) => {
    await page.goto("/creator/recipes");
    await expect(page).toHaveURL(/\/login\?next=/);
    await loginAs(page, "free");
    await page.goto("/creator/recipes");
    await expect(page).not.toHaveURL(/\/creator/);
    await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Minhas Receitas" })).toHaveCount(0);
  });
});

test.describe("comércio (conta free)", () => {
  test("g3 na lista de compras: o kit aparece no estado do comércio; a lista é limpa no fim", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "grava na lista da conta compartilhada: roda só no projeto mobile");
    test.setTimeout(180_000);
    const commerce = await publicSetting("commerce.enabled");
    test.skip(commerce === undefined, "não deu para ler public_settings");
    await loginAs(page, "free");
    await openWithStep(page, G3.slug, G3.title);

    const clearList = async () => {
      await page.goto(LIST_PATH);
      if ((await page.getByTestId("shopping-list").count()) === 0) return;
      await page.getByTestId("shopping-clear-all").click();
      await page.getByTestId("shopping-clear-all-confirm").click();
      await expect(page.getByTestId("shopping-empty")).toBeVisible();
    };
    await clearList();
    try {
      await page.goto(`/content/${G3.slug}`);
      await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 });
      await page.getByTestId("recipe-shopping-add").click();
      await expect(page.getByTestId("recipe-shopping-sheet")).toBeVisible();
      await page.getByTestId("recipe-shopping-submit").click();
      await expect(page.getByText("Lista de compras atualizada").first()).toBeVisible();
      await page.goto(LIST_PATH);
      const group = page.locator(`[data-testid="shopping-group"][data-recipe="${G3.slug}"]`);
      await expect(group).toBeVisible();
      const kit = group.getByTestId("shopping-kit");
      await expect(kit).toContainText(/Kit molho de ervas/);
      if (commerce === true) {
        await expect(page.getByTestId("shopping-commerce-off")).toHaveCount(0);
        // disponível: carrinho de teste; sem estoque: marcado como indisponível (não some)
        await expect(kit.getByTestId("shopping-offer-available").or(kit.getByTestId("shopping-offer-unavailable"))).toBeVisible();
        if ((await kit.getByTestId("shopping-offer-available").count()) > 0) {
          await expect(kit.getByRole("button", { name: /Adicionar ao carrinho de teste/ })).toBeVisible();
        }
      } else {
        await expect(page.getByTestId("shopping-commerce-off")).toBeVisible();
        await expect(kit.getByTestId("shopping-offer-commerce_off")).toBeVisible();
        await expect(kit.getByRole("button", { name: /Adicionar ao carrinho de teste/ })).toHaveCount(0);
      }
    } finally {
      await clearList();
    }
  });
});
