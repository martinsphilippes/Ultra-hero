import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { expectNoTestRecipe, purgeTestRecipes } from "./helpers/recipes";

// Receitas fase 5: lista de compras ligada ao comércio, contra o banco remoto (shopping_list_items e
// os vínculos já estão em produção desde a 0027). Conta demo "premium": faz a etapa demonstrativa se
// ainda não fez (sem marcar alergia nem restrição, o estado normal de quem usa receitas). O teste que
// grava roda só no projeto mobile (a lista e o carrinho são da conta, os dois projetos disputariam) e
// no fim limpa a lista e devolve o carrinho como estava. O cookie uh-e2e=1 desliga os eventos e o
// registro de interesse em produto (nada fica no remoto).

const G3 = { slug: "molho-de-ervas-em-5-minutos-g3", title: "Molho de ervas em 5 minutos" };
const G3_PATH = `/content/${G3.slug}`;
const KIT = /Kit molho de ervas/;
const LIST_PATH = "/profile/lista-de-compras";
// cada ação re-renderiza a lista a partir do banco remoto: mais folga que os 5 s padrão
const expect = baseExpect.configure({ timeout: 15_000 });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

async function expectNoSeriousAxe(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))).toEqual([]);
}

async function loginPremium(page: Page) {
  await loginAs(page, "premium", { home: null });
}

/** Abre g3; se a conta ainda não fez a etapa demonstrativa, faz os 4 passos (sem marcar nada) e volta. */
async function openG3(page: Page) {
  await page.goto(G3_PATH);
  await expect(page.getByRole("heading", { level: 1, name: G3.title })).toBeVisible();
  if ((await page.getByTestId("recipe-gate").count()) > 0) {
    await page.getByTestId("recipe-gate-start").click();
    await expect(page.getByTestId("recipe-onboarding")).toBeVisible();
    await page.locator("#recipe-notice").check();
    for (let i = 0; i < 3; i += 1) await page.getByTestId("recipe-onboarding-next").click();
    await page.getByTestId("recipe-onboarding-finish").click();
    await expect(page).toHaveURL(new RegExp(`${G3_PATH}$`), { timeout: 20_000 });
  }
  await expect(page.getByTestId("recipe-gate")).toHaveCount(0);
  await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 });
}

/** Lista vazia? (o teste não depende do estado anterior, mas limpa o que sobrou de outra execução) */
async function clearListIfAny(page: Page) {
  await page.goto(LIST_PATH);
  if ((await page.getByTestId("shopping-list").count()) === 0) return;
  await page.getByTestId("shopping-clear-all").click();
  const dialog = page.getByRole("dialog", { name: "Limpar a lista de compras?" });
  await expect(dialog).toContainText("Não dá para desfazer");
  await dialog.getByTestId("shopping-clear-all-confirm").click();
  await expect(page.getByTestId("shopping-empty")).toBeVisible();
}

/** Quantidade do kit no carrinho de teste (0 se não está). */
async function kitInCart(page: Page): Promise<number> {
  await page.goto("/cart");
  const input = page.getByLabel(/^Quantidade de Kit molho de ervas/);
  if ((await input.count()) === 0) return 0;
  return Number(await input.first().inputValue());
}

async function addG3FromRecipe(page: Page, servings?: number) {
  await page.goto(servings ? `${G3_PATH}?porcoes=${servings}` : G3_PATH);
  await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("recipe-shopping-add").click();
  const sheet = page.getByTestId("recipe-shopping-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("lista de compras (visitante)", () => {
  test("receita fechada não oferece a lista (o convite fica no lugar) e a página da lista pede login", async ({ page }) => {
    await page.goto(G3_PATH);
    await expect(page.getByRole("heading", { level: 1, name: G3.title })).toBeVisible();
    await expect(page.getByTestId("recipe-shopping-add")).toHaveCount(0);
    await page.goto(LIST_PATH);
    await expect(page).toHaveURL(/\/login/);
  });

  test("política de privacidade cita a lista de compras e o prazo", async ({ page }) => {
    await page.goto("/legal/privacy");
    const main = page.locator("main");
    await expect(main.getByText(/Lista de compras \(opcional\):/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Lista de compras", exact: true })).toBeVisible();
    await expect(main.getByText("Até você remover ou excluir a conta")).toBeVisible();
  });
});

test.describe("lista de compras (só leitura)", () => {
  test("premium: o Sheet abre com as porções da URL, 'a gosto' desmarcado, e cancelar não grava", async ({ page }) => {
    await loginPremium(page);
    await openG3(page);
    const sheet = await addG3FromRecipe(page, 3);
    const dialog = page.getByRole("dialog", { name: "Adicionar à lista de compras" });
    await expect(dialog).toContainText("3 porções");
    await expect(sheet.getByRole("checkbox", { name: /^Sal a gosto/ })).not.toBeChecked();
    // 6 → 3 porções: 1 maço de salsinha vira 1/2 maço (a unidade do chef não muda)
    await expect(sheet.getByRole("checkbox", { name: /^Salsinha 1\/2 maço/ })).toBeChecked();
    await sheet.getByRole("button", { name: "Desmarcar todos" }).click();
    await expect(sheet).toContainText("Nenhum item escolhido");
    await expect(page.getByTestId("recipe-shopping-submit")).toBeDisabled();
    await sheet.getByRole("button", { name: "Marcar todos", exact: true }).click();
    await expect(sheet).toContainText("6 itens escolhidos");
    await expectNoSeriousAxe(page);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  });

  test("admin: /admin/links tem a aba Ingredientes com a fila", async ({ page }) => {
    await loginAs(page, "admin", { home: null });
    await page.goto("/admin/links");
    const tabs = page.getByRole("navigation", { name: "Tipo de vínculo" });
    await expect(tabs.getByRole("link", { name: "Conteúdos" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Ingredientes" }).click();
    await expect(page).toHaveURL(/\/admin\/links\?aba=ingredientes$/);
    await expect(tabs.getByRole("link", { name: "Ingredientes" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("ingredient-links")).toContainText("Só o vínculo validado aparece na lista de compras");
    const status = page.getByLabel("Situação");
    await expect(status).toHaveValue("suggested");
    // um só "Todos" (o do FilterBar, que manda situacao= vazio = todas as situações)
    await expect(status.getByRole("option", { name: /^Tod[oa]s$/ })).toHaveCount(1);
    await status.selectOption("");
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(/aba=ingredientes&situacao=$/);
    await expect(page.getByLabel("Situação")).toHaveValue("");
    // "Limpar filtros" fica na aba Ingredientes e volta à fila
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/admin\/links\?aba=ingredientes$/);
    await expect(page.getByLabel("Situação")).toHaveValue("suggested");
    await expectNoSeriousAxe(page);
  });
});

test.describe("produto correspondente no editor (conta do herói)", () => {
  test("ingrediente gravado recebe a sugestão de produto (pendente de validação), retirada em seguida; o rascunho é excluído", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "grava um rascunho no remoto: roda só no mobile");
    test.setTimeout(180_000);
    await loginAs(page, "creator");
    const titlePrefix = "[E2E] Lista de compras";
    // sobras antigas de execuções interrompidas (os vínculos saem em cascata); a conta é compartilhada,
    // então o rascunho de outra execução em andamento fica
    await purgeTestRecipes(page, titlePrefix);
    const title = `${titlePrefix} ${Date.now()}`;
    try {
      await page.goto("/creator/recipes/new");
      // só preenche depois da hidratação (antes disso o React refaz os campos e o clique se perde)
      await expect(page.getByTestId("recipe-wizard")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
      await page.getByTestId("recipe-title").fill(title);
      await page.getByTestId("recipe-summary").fill("Rascunho do teste automático da lista de compras; é excluído no fim.");
      await page.getByTestId("recipe-category-cafe-da-manha").click();
      await page.getByTestId("recipe-servings").fill("2");
      await page.getByTestId("recipe-prep").fill("5");
      await page.getByTestId("recipe-cook").fill("10");
      await page.getByTestId("recipe-next").click();
      await expect(page).toHaveURL(/\/creator\/recipes\/[0-9a-f-]+\/edit\?step=ingredientes$/, { timeout: 30_000 });

      await page.getByTestId("add-ingredient").click();
      await page.getByTestId("ingredient-name").nth(0).fill("Azeite");
      await page.getByTestId("ingredient-amount").nth(0).fill("2");
      await page.getByTestId("ingredient-unit").nth(0).selectOption("tbsp");
      const field = page.getByTestId("ingredient-product").first();
      // ingrediente ainda não gravado: a RPC recusaria, então o campo pede para salvar
      await expect(field.getByTestId("ingredient-product-save-first")).toBeVisible();
      await page.getByTestId("recipe-save").click();
      await expect(field.getByTestId("ingredient-product-choose")).toBeVisible();

      await field.getByTestId("ingredient-product-choose").click();
      await field.getByRole("combobox", { name: "Buscar produto para Azeite" }).fill("Kit");
      const option = field.getByRole("option").first();
      await expect(option).toBeVisible();
      await option.click();
      const link = field.getByTestId("ingredient-product-link");
      await expect(link).toHaveAttribute("data-status", "pending");
      await expect(link).toContainText("Pendente de validação");
      await expect(field).toContainText("Só vale depois de validada pela administração");
      await expectNoSeriousAxe(page);

      // retirar a própria sugestão pendente (creator_withdraw_ingredient_product)
      await field.getByRole("button", { name: "Retirar sugestão" }).click();
      await expect(field.getByTestId("ingredient-product-link")).toHaveCount(0);
      await expect(field.getByTestId("ingredient-product-choose")).toHaveText("Escolher produto");
    } finally {
      await purgeTestRecipes(page, titlePrefix, { title });
      await expectNoTestRecipe(page, title);
    }
  });
});

test.describe("lista de compras (conta premium)", () => {
  test("g3 na lista com o kit no carrinho de teste, sem duplicar ao adicionar de novo; limpa no fim", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "lista e carrinho da conta: roda só no mobile para os projetos não disputarem");
    test.setTimeout(180_000);
    await loginPremium(page);
    await openG3(page);
    await clearListIfAny(page);
    const cartBefore = await kitInCart(page);

    try {
      // 1) Sheet com as porções da página (6 → 12): "a gosto" vem desmarcado, nada é convertido
      let sheet = await addG3FromRecipe(page, 12);
      await expect(page.getByRole("dialog", { name: "Adicionar à lista de compras" })).toContainText("12 porções");
      const items = sheet.getByTestId("recipe-shopping-item");
      await expect(items).toHaveCount(6);
      await expect(sheet.getByRole("checkbox", { name: /^Sal a gosto/ })).not.toBeChecked();
      await expect(sheet.getByRole("checkbox", { name: /^Salsinha/ })).toBeChecked();
      await expect(sheet.getByText("2 maços", { exact: true })).toBeVisible();
      await expect(sheet.getByText("a gosto", { exact: true })).toBeVisible();
      await expect(sheet).toContainText("5 itens escolhidos");
      await page.getByTestId("recipe-shopping-submit").click();
      await expect(page.getByText("Lista de compras atualizada").first()).toBeVisible();
      // atalho "Ver lista" depois de adicionar
      await page.getByTestId("recipe-shopping-view").click();
      await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));

      // 2) a lista: grupo da receita com link, 5 itens, kit com o carrinho de teste e a nota
      await expect(page.getByRole("heading", { level: 1, name: "Lista de compras" })).toBeVisible();
      const group = page.locator(`[data-testid="shopping-group"][data-recipe="${G3.slug}"]`);
      await expect(group.getByRole("link", { name: G3.title })).toHaveAttribute("href", G3_PATH);
      await expect(group.getByTestId("shopping-item")).toHaveCount(5);
      await expect(group.getByTestId("shopping-item").first()).toContainText("2 maços");
      // os ingredientes não têm produto avulso: "Sem produto correspondente"
      await expect(group.getByTestId("shopping-item").getByTestId("shopping-offer-none")).toHaveCount(5);
      const kit = group.getByTestId("shopping-kit");
      await expect(kit).toContainText("Kit ou produto desta receita");
      await expect(kit).toContainText(KIT);
      await expect(kit).toContainText("A embalagem pode não corresponder à quantidade da receita");
      const addKit = kit.getByRole("button", { name: /Adicionar ao carrinho de teste/ });
      await expect(addKit).toBeVisible();

      // 3) marcar comprado: otimista e anunciado
      const first = group.getByTestId("shopping-item").first();
      // a Server Action é um POST na própria página; espera o servidor confirmar antes de navegar
      const checkSaved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(LIST_PATH));
      await first.getByTestId("shopping-item-check").check();
      await checkSaved;
      await expect(page.getByTestId("shopping-announce")).toHaveText("Salsinha marcado como comprado");
      await expect(page.getByTestId("shopping-count")).toHaveText("5 itens · 1 comprado");
      // ir à receita e voltar (gesto de voltar do celular): a marcação revalidou a página, então o
      // Router Cache não devolve a lista antiga desmarcada
      await group.getByRole("link", { name: G3.title }).click();
      await expect(page).toHaveURL(new RegExp(`${G3_PATH}$`));
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
      await expect(page.getByTestId("shopping-count")).toHaveText("5 itens · 1 comprado");
      await expect(group.getByTestId("shopping-item").first()).toHaveAttribute("data-checked", "true");

      // 4) editar a quantidade (sem conversão: só o número muda)
      await first.getByTestId("shopping-item-edit").click();
      await first.getByLabel("Quantidade de Salsinha", { exact: true }).fill("3");
      await first.getByTestId("shopping-item-save").click();
      await expect(first).toContainText("3 maços", { timeout: 15_000 });

      // 5) kit no carrinho de teste
      await addKit.click();
      await expect(page.getByText("Adicionado ao carrinho de teste").first()).toBeVisible();
      await expectNoSeriousAxe(page);

      // 6) adicionar g3 de novo (porções originais): atualiza, não duplica, desmarca
      sheet = await addG3FromRecipe(page);
      await page.getByTestId("recipe-shopping-submit").click();
      await expect(page.getByText("Lista de compras atualizada").first()).toBeVisible();
      await page.goto(LIST_PATH);
      await expect(group.getByTestId("shopping-item")).toHaveCount(5);
      await expect(group.getByTestId("shopping-item").first()).toContainText("1 maço");
      await expect(page.getByTestId("shopping-count")).toHaveText("5 itens · nenhum comprado");

      // 7) "Limpar comprados" tira só o marcado
      await group.getByTestId("shopping-item").filter({ hasText: "Limão" }).getByTestId("shopping-item-check").check();
      await expect(page.getByTestId("shopping-count")).toHaveText("5 itens · 1 comprado");
      await page.getByTestId("shopping-clear-checked").click();
      // apaga sem desfazer: pede confirmação com a contagem
      const confirmChecked = page.getByRole("dialog", { name: "Remover os itens comprados?" });
      await expect(confirmChecked).toContainText("1 item comprado será removido da lista. Não dá para desfazer.");
      await confirmChecked.getByTestId("shopping-clear-checked-confirm").click();
      await expect(page.getByText("1 item comprado removido").first()).toBeVisible();
      await expect(group.getByTestId("shopping-item")).toHaveCount(4);
      await expect(group).not.toContainText("Limão");

      // 8) o kit está no carrinho de teste
      expect(await kitInCart(page)).toBe(cartBefore + 1);

      // 9) Perfil leva à lista
      await page.goto("/profile");
      await expect(page.locator(`a[href="${LIST_PATH}"]`)).toBeVisible();
    } finally {
      // limpeza: carrinho como estava e lista vazia (com o caminho de volta ao catálogo)
      const now = await kitInCart(page);
      if (now > cartBefore) {
        const row = page.locator("li").filter({ has: page.getByRole("link", { name: KIT }) });
        if (cartBefore === 0) {
          await row.getByRole("button", { name: /^Remover Kit molho de ervas.* do carrinho$/ }).click();
          await expect(page.getByLabel(/^Quantidade de Kit molho de ervas/)).toHaveCount(0);
        } else {
          await row.getByRole("button", { name: "Diminuir quantidade" }).click();
          await expect(page.getByLabel(/^Quantidade de Kit molho de ervas/)).toHaveValue(String(cartBefore));
        }
      }
      await clearListIfAny(page);
      await expect(page.getByTestId("shopping-empty").getByRole("link", { name: "Explorar receitas" })).toHaveAttribute("href", "/explore?tab=receitas");
    }
  });
});
