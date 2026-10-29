import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";
import { loginAs } from "./helpers/login";
import { expectNoTestRecipe, purgeTestRecipes } from "./helpers/recipes";

// Receitas fase 2 (Portal do Chef) com a conta de demonstração do herói, contra o banco remoto:
// Minhas Receitas com filtros e axe; criar um rascunho e passar pelas 6 etapas (2 ingredientes,
// reordenar, 2 etapas, "Nenhum alérgeno"), checklist verde com o botão do modo atual, prévia com o
// RecipeView, recarregar e conferir, perder a rede e "Recuperar", e EXCLUIR o rascunho no fim
// (nada fica no remoto; sobras de execuções anteriores deste projeto são apagadas no início).
// Publicar de verdade fica para a fase 6 (P4). Envio real de foto só com E2E_RECIPE_MEDIA_REAL=1.
// A decisão de credenciais presa ao texto (0032) é coberta no S34 e no Vitest: o remoto ainda não
// tem a 0032 e a fila não é exercitada aqui (aprovar mexeria no perfil público de um herói).

const REAL_MEDIA = process.env.E2E_RECIPE_MEDIA_REAL === "1";

function prefix(info: TestInfo) {
  return `[E2E] Receita ${info.project.name}`;
}

async function axeMain(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
}

async function clickNext(page: Page, step: string) {
  await page.getByTestId("recipe-next").click();
  await expect(page.getByTestId("recipe-wizard")).toHaveAttribute("data-step", step, { timeout: 20_000 });
}

test.describe("Portal do Chef: Minhas Receitas", () => {
  test("lista com filtros por GET, Nova receita e axe; o menu do portal tem Minhas Receitas depois de Novo post", async ({ page }) => {
    await loginAs(page, "creator", { home: /\/creator$/ });
    await page.goto("/creator/recipes");
    await expect(page.getByRole("heading", { level: 1, name: "Minhas Receitas" })).toBeVisible();
    await expect(page.getByTestId("new-recipe")).toHaveAttribute("href", "/creator/recipes/new");
    await expect(page.getByTestId("recipes-count")).toBeVisible();

    // filtros recolhidos atrás de "Filtros" (busca sempre à vista); abre ao tocar e já vem aberto com filtro ativo
    const panel = page.getByTestId("my-recipes-filters-panel");
    await expect(page.getByRole("combobox", { name: "Situação" })).toBeHidden();
    await panel.locator("summary").click();
    await page.getByRole("combobox", { name: "Situação" }).selectOption("draft");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(page.getByRole("link", { name: "Limpar filtros" })).toBeVisible();
    await expect(panel).toHaveAttribute("open", "");
    await expect(panel.locator("summary")).toContainText("1 filtro ativo");
    await axeMain(page);

    // sem menu no portal do herói: volta ao Perfil, onde ficam os atalhos (Minhas receitas incluso)
    await expect(page.getByTestId("portal-back-profile")).toHaveAttribute("href", "/profile");
  });

  test("perfil do herói mostra especialidades e o pedido de credenciais com o aviso de aprovação", async ({ page }) => {
    await loginAs(page, "creator", { home: /\/creator$/ });
    // o perfil do herói (com a parte de chef) mora no /profile, no editor recolhido "Editar perfil"
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Editar perfil", exact: true }).click();
    const chef = page.locator("#editar-perfil").getByTestId("chef-profile");
    await expect(chef).toBeVisible();
    await expect(chef).toContainText("Especialidades e credenciais");
    await expect(chef).toContainText("só depois da aprovação da administração");
  });
});

test.describe("Portal do Chef: editor em 6 etapas", () => {
  test.describe.configure({ mode: "serial" });

  test("cria, passa pelas 6 etapas, pré-visualiza, recarrega, recupera a cópia local e exclui o rascunho", async ({ page, context }, info) => {
    test.setTimeout(240_000);
    await loginAs(page, "creator", { home: /\/creator$/ });
    const titlePrefix = prefix(info);
    // sobras antigas deste projeto; o rascunho de outra execução em andamento (conta compartilhada) fica
    await purgeTestRecipes(page, titlePrefix);
    const title = `${titlePrefix} ${Date.now()}`;

    try {
      // ---- etapa 1 (rascunho ainda não existe)
      await page.goto("/creator/recipes/new");
      await expect(page.getByRole("heading", { level: 2, name: "Informações básicas" })).toBeVisible();
      await axeMain(page);
      await page.getByTestId("recipe-title").fill(title);
      await page.getByTestId("recipe-summary").fill("Rascunho criado pelo teste automático; é excluído no fim.");
      await page.getByTestId("recipe-category-cafe-da-manha").click();
      // rendimento: o teclado e o que a caixa aceita seguem o tipo (kg decimal, forma inteiro)
      await page.getByTestId("recipe-yield-unit").selectOption("kg");
      await expect(page.getByTestId("recipe-yield-amount")).toHaveAttribute("inputmode", "decimal");
      await page.getByTestId("recipe-yield-amount").fill("1.5");
      await expect(page.getByTestId("recipe-yield-amount")).toHaveValue("1,5");
      await expect(page.getByTestId("recipe-yield")).toContainText("Na receita: Rende 1,5 kg");
      await page.getByTestId("recipe-yield-unit").selectOption("pan");
      await expect(page.getByTestId("recipe-yield-amount")).toHaveAttribute("inputmode", "numeric");
      await expect(page.getByTestId("recipe-yield-amount")).toHaveValue("2");
      await expect(page.getByTestId("recipe-yield")).toContainText("Na receita: Rende 2 formas");
      // porções pelos botões − e + (caixa vazia: + vai a 1, depois 2; − não passa de 1)
      await page.getByTestId("recipe-servings-more").click();
      await page.getByTestId("recipe-servings-more").click();
      await expect(page.getByTestId("recipe-servings")).toHaveValue("2");
      await expect(page.getByText("Para quantas pessoas a receita serve.", { exact: false })).toBeVisible();
      await expect(page.getByText("Calculado sozinho quando você preencher os tempos acima.")).toBeVisible();
      await page.getByTestId("recipe-prep").fill("5");
      await page.getByTestId("recipe-cook").fill("1a0");
      await expect(page.getByTestId("recipe-cook")).toHaveValue("10");
      await expect(page.getByTestId("recipe-total")).toHaveValue("15");
      await expect(page.getByText(/preparo \+ cozimento \+ descanso = 15\smin/)).toBeVisible();
      await page.getByTestId("recipe-next").click();
      await expect(page).toHaveURL(/\/creator\/recipes\/[0-9a-f-]+\/edit\?step=ingredientes$/, { timeout: 30_000 });
      const id = page.url().split("/")[5];

      // ---- etapa 2: dois ingredientes e reordenação com ↓
      const wizard = page.getByTestId("recipe-wizard");
      await expect(wizard).toHaveAttribute("data-step", "ingredientes");
      await page.getByTestId("add-ingredient").click();
      await page.getByTestId("ingredient-name").nth(0).fill("Ovo");
      await page.getByTestId("ingredient-amount").nth(0).fill("2");
      await page.getByTestId("add-ingredient").click();
      await page.getByTestId("ingredient-name").nth(1).fill("Farinha de aveia");
      await page.getByTestId("ingredient-amount").nth(1).fill("1/2");
      await page.getByTestId("ingredient-unit").nth(1).selectOption("cup");
      await page.getByTestId("ingredient-item").nth(0).getByTestId("move-down").click();
      await expect(page.getByTestId("ingredient-name").nth(0)).toHaveValue("Farinha de aveia");
      await expect(page.getByText("agora é o item 2 de 2", { exact: false })).toBeAttached();
      // a quantidade segue a unidade: xícara → teclado numérico + atalhos de fração; sem unidade → texto
      const flourAmount = page.getByTestId("ingredient-amount").nth(0);
      await expect(flourAmount).toHaveAttribute("inputmode", "decimal");
      await expect(page.getByTestId("ingredient-amount").nth(1)).toHaveAttribute("inputmode", "text");
      await flourAmount.fill("1 xícara");
      await expect(flourAmount).toHaveValue("1 ");
      await page.getByTestId("ingredient-item").nth(0).getByTestId("ingredient-fraction-1-2").click();
      await expect(flourAmount).toHaveValue("1 1/2");
      await flourAmount.fill("1/2");
      // trocar para kg converte o número (1/2 → 0,5) e volta à fração na xícara
      await page.getByTestId("ingredient-unit").nth(0).selectOption("kg");
      await expect(flourAmount).toHaveValue("0,5");
      await expect(page.getByTestId("ingredient-item").nth(0).getByTestId("ingredient-fraction-1-2")).toHaveCount(0);
      await page.getByTestId("ingredient-unit").nth(0).selectOption("cup");
      await expect(flourAmount).toHaveValue("1/2");
      // substituição: mesma regra (ml → teclado numérico, só número) e remover pelo X do cabeçalho
      const flourItem = page.getByTestId("ingredient-item").nth(0);
      await flourItem.getByRole("button", { name: "Adicionar substituição" }).click();
      const sub = flourItem.getByTestId("substitution-item");
      await sub.getByTestId("substitution-unit").selectOption("ml");
      await expect(sub.getByTestId("substitution-amount")).toHaveAttribute("inputmode", "decimal");
      await sub.getByTestId("substitution-amount").fill("100 ml");
      await expect(sub.getByTestId("substitution-amount")).toHaveValue("100");
      await expect(sub.getByText("Peso ou volume: só número", { exact: false })).toBeVisible();
      await sub.getByRole("button", { name: /^Remover Substituição 1/ }).click();
      await expect(flourItem.getByTestId("substitution-item")).toHaveCount(0);
      // remover o último: o foco vai ao item anterior e a remoção é anunciada
      await page.getByTestId("add-ingredient").click();
      await page.getByTestId("ingredient-name").nth(2).fill("Sal");
      await page.getByRole("button", { name: "Remover Ingrediente 3: Sal" }).click();
      await expect(page.getByTestId("ingredient-item")).toHaveCount(2);
      await expect(page.getByTestId("ingredient-name").nth(1)).toBeFocused();
      await expect(page.getByText("Item removido: Ingrediente 3: Sal.")).toBeAttached();
      await clickNext(page, "preparo");

      // ---- etapa 3: duas etapas, uma com duração e ingrediente ligado
      await page.getByTestId("add-step").click();
      await page.getByTestId("step-instruction").nth(0).fill("Misture a aveia com os ovos.");
      await page.getByTestId("step-minutes").nth(0).fill("2");
      await page.getByTestId("step-item").nth(0).getByLabel("Ovo").check();
      await page.getByTestId("add-step").click();
      await page.getByTestId("step-instruction").nth(1).fill("Doure dos dois lados em frigideira untada.");
      await clickNext(page, "midia");

      // ---- etapa 4: fotos (envio real só com a variável) e vídeo
      await expect(page.getByText("Galeria", { exact: true })).toBeVisible();
      if (REAL_MEDIA) {
        const uploader = page.getByTestId("recipe-uploader-gallery");
        await uploader.getByLabel("Texto alternativo da nova foto").fill("Panqueca dourada no prato");
        await uploader.getByLabel("Tenho direito de uso desta imagem").check();
        await page.getByTestId("recipe-file-gallery").setInputFiles(path.join(__dirname, "../fixtures/recipe-photo.png"));
        await expect(page.getByTestId("gallery-item")).toHaveCount(1, { timeout: 30_000 });
      } else {
        await expect(page.getByTestId("recipe-uploader-gallery").or(page.getByText("O envio de fotos está pausado"))).toBeVisible();
      }
      await clickNext(page, "complementos");

      // ---- etapa 5 sem declarar alérgenos: a Revisão aponta e "Ir para Complementos" mostra o que falta
      await clickNext(page, "revisao");
      await expect(page.getByTestId("recipe-checklist").locator('li[data-ok="false"]')).toHaveCount(1);
      await page.getByTestId("recipe-fix-allergens").click();
      await expect(page.getByTestId("recipe-wizard")).toHaveAttribute("data-step", "complementos", { timeout: 20_000 });
      const fixPanel = page.getByTestId("recipe-fix-panel");
      await expect(fixPanel).toContainText("Falta completar nesta etapa para publicar:");
      await expect(page.getByTestId("recipe-fix-item-allergens")).toHaveAttribute("data-ok", "false");
      await expect(fixPanel).toContainText("Alérgenos: marque “Nenhum alérgeno” ou “Contém alérgenos” e escolha quais.");
      await expect(page.locator("#recipe-details-allergens_declared")).toBeFocused();
      // "Contém" sem nada marcado fica pendente; "Nenhum alérgeno" é declaração explícita
      await page.getByTestId("allergens-some").check();
      await expect(page.getByTestId("allergens-pick-one")).toBeVisible();
      await expect(page.getByTestId("recipe-fix-item-allergens")).toHaveAttribute("data-ok", "false");
      await page.getByTestId("allergens-none").check();
      await expect(page.getByTestId("allergens-pick-one")).toHaveCount(0);
      await expect(page.getByTestId("recipe-fix-item-allergens")).toHaveAttribute("data-ok", "true");
      await expect(fixPanel).toContainText("Tudo certo nesta etapa.");
      await page.getByTestId("recipe-fix-back").click();
      await expect(page.getByTestId("recipe-wizard")).toHaveAttribute("data-step", "revisao", { timeout: 20_000 });

      // ---- etapa 6: checklist verde e o botão do modo atual (sem publicar: P4, fase 6)
      await expect(page.getByTestId("recipe-checklist").locator('li[data-ok="false"]')).toHaveCount(0);
      await expect(page.getByText("Tudo pronto para publicar.")).toBeVisible();
      const publish = page.getByTestId("recipe-publish");
      const submit = page.getByTestId("recipe-submit");
      await expect(publish.or(submit)).toBeEnabled();
      if ((await publish.count()) > 0) await expect(page.getByTestId("recipe-schedule")).toBeVisible();

      // ---- prévia com o RecipeView
      await page.getByTestId("recipe-open-preview").click();
      await expect(page).toHaveURL(new RegExp(`/creator/recipes/${id}/preview$`), { timeout: 20_000 });
      await expect(page.getByTestId("recipe-preview-banner")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      const flour = page.getByTestId("recipe-ingredient").filter({ hasText: "Farinha de aveia" });
      await expect(flour).toContainText("1/2 xícara");
      await expect(page.getByTestId("recipe-ingredient").nth(1)).toContainText("Ovo");
      await expect(page.getByTestId("recipe-steps")).toContainText("Misture a aveia com os ovos.");
      await expect(page.getByTestId("recipe-steps")).toContainText("2 min");
      await expect(page.getByTestId("recipe-allergens")).toContainText("Nenhum alérgeno declarado pelo chef.");
      await expect(page.getByText("Rende 2 formas")).toBeVisible();
      if (REAL_MEDIA) await expect(page.getByTestId("recipe-gallery")).toBeVisible();

      // ---- recarregar: tudo veio do banco
      await page.goto(`/creator/recipes/${id}/edit?step=ingredientes`);
      await expect(page.getByTestId("ingredient-name").nth(0)).toHaveValue("Farinha de aveia");
      await expect(page.getByTestId("ingredient-amount").nth(0)).toHaveValue("1/2");
      await expect(page.getByTestId("ingredient-name").nth(1)).toHaveValue("Ovo");
      await expect(page.getByTestId("recipe-recovery")).toHaveCount(0);

      // ---- sem rede: o erro não perde nada e "Recuperar" traz a alteração de volta
      await page.getByTestId("recipe-step-basicos").click();
      await expect(page.getByTestId("recipe-wizard")).toHaveAttribute("data-step", "basicos");
      await expect(page.getByTestId("recipe-yield-unit")).toHaveValue("pan");
      await expect(page.getByTestId("recipe-yield-amount")).toHaveValue("2");
      const offlineTitle = `${title} (offline)`;
      await page.getByTestId("recipe-title").fill(offlineTitle);
      await page.waitForTimeout(1_500); // cópia local com debounce de 1 s
      await context.setOffline(true);
      await page.getByTestId("recipe-save").click();
      await expect(page.getByTestId("recipe-save-error")).toContainText("Sem conexão", { timeout: 20_000 });
      await context.setOffline(false);
      await page.reload();
      await expect(page.getByTestId("recipe-recovery")).toBeVisible();
      await expect(page.getByTestId("recipe-title")).toHaveValue(title);
      await page.getByTestId("recipe-recover").click();
      await expect(page.getByTestId("recipe-title")).toHaveValue(offlineTitle);
      await page.getByTestId("recipe-save").click();
      await expect(page.getByTestId("recipe-save-state")).toContainText("Salvo às", { timeout: 20_000 });
      await page.reload();
      await expect(page.getByTestId("recipe-title")).toHaveValue(offlineTitle);
      await expect(page.getByTestId("recipe-recovery")).toHaveCount(0);

      // ---- versões: rascunho nunca publicado ainda não tem versão
      await page.goto(`/creator/recipes/${id}/versions`);
      await expect(page.getByText("Ainda não há versões.", { exact: false })).toBeVisible();
    } finally {
      // ---- excluir o rascunho (e as fotos, se houve envio real): nada fica no remoto
      await context.setOffline(false);
      await purgeTestRecipes(page, titlePrefix, { title });
      await expectNoTestRecipe(page, title);
    }
  });
});

test.describe("renderizador estruturado na página pública", () => {
  test("g1 aparece pelo RecipeView com 'Batata-doce · 1 · média' quando a conta já fez a etapa", async ({ page }) => {
    await loginAs(page, "premium", { home: /\/profile$/ });
    await page.goto("/content/bowl-de-frango-grelhado-com-legumes-assados-g1");
    await expect(page.getByRole("heading", { level: 1, name: "Bowl de frango grelhado com legumes assados" })).toBeVisible();
    test.skip((await page.getByTestId("recipe-gate").count()) > 0, "a conta premium de demonstração ainda não fez a etapa demonstrativa de receitas");
    await expect(page.getByTestId("recipe-view")).toBeVisible();
    const sweetPotato = page.getByTestId("recipe-ingredient").filter({ hasText: "Batata-doce" });
    await expect(sweetPotato).toContainText("média");
    await expect(sweetPotato).toContainText("1");
    await expect(page.getByTestId("recipe-ingredient").filter({ hasText: "Peito de frango" })).toContainText("300 g");
  });
});

test.describe("admin: revisão por tipo e fila de credenciais", () => {
  test("configurações mostram a regra de revisão por tipo (só leitura aqui) e /admin/creators a fila de credenciais", async ({ page }) => {
    await loginAs(page, "admin", { home: /\/admin$/ });
    await page.goto("/admin/content/settings");
    const review = page.getByTestId("review-required-settings");
    await expect(review).toBeVisible();
    await expect(review.locator('tr[data-type="recipe"]')).toContainText(/Ligada|Desligada/);
    // só receita tem "Enviar para revisão" no portal: os outros tipos não ganham "Ligar"
    await expect(review.locator('tr[data-type="recipe"]')).toHaveAttribute("data-toggle", "toggle");
    for (const type of ["video", "workout", "guide", "article"]) {
      const row = review.locator(`tr[data-type="${type}"]`);
      await expect(row).not.toHaveAttribute("data-toggle", "toggle");
      await expect(row.getByRole("button", { name: "Ligar" })).toHaveCount(0);
    }
    await page.goto("/admin/creators");
    await expect(page.getByRole("heading", { level: 2, name: "Credenciais dos heróis" })).toBeVisible();
  });

  test("detalhe de receita estruturada resume pelas tabelas e abre a prévia com o RecipeView", async ({ page }) => {
    await loginAs(page, "admin", { home: /\/admin$/ });
    await page.goto(`/admin/content?q=${encodeURIComponent("Bowl de frango grelhado")}`);
    await page.getByRole("link", { name: "Bowl de frango grelhado com legumes assados" }).first().click();
    await expect(page).toHaveURL(/\/admin\/content\/[0-9a-f-]+$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 2, name: "Metadados" })).toBeVisible({ timeout: 20_000 });
    const preview = page.getByTestId("admin-recipe-preview");
    test.skip((await preview.count()) === 0, "banco sem recipe_details para g1");
    await expect(page.getByText(/Receita · \d+ ingredientes · \d+ passos/)).toBeVisible();
    await expect(page.getByText("Receita · 0 ingredientes")).toHaveCount(0);
    await preview.click();
    await expect(page.getByTestId("admin-recipe-preview-banner")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("recipe-view")).toBeVisible();
    await expect(page.getByTestId("recipe-ingredient").filter({ hasText: "Peito de frango" })).toContainText("300 g");
  });
});
