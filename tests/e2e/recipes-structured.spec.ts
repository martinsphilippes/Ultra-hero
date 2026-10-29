import { expect, test } from "@playwright/test";
import { loginAsAdminActing } from "./helpers/acting";
import { loginAs } from "./helpers/login";
import { seedUuid } from "./helpers/seed";

// Fumaça da fase 1 do módulo de receitas (0027–0029): só leitura, nada é gravado no banco remoto.
// (Fase 2: o editor antigo segue só para leitura, mas "Editar" leva ao editor de receitas.)
// Funciona com o remoto antes e depois da migração: nenhuma tela usa as tabelas novas na fase 1.
//  - as páginas públicas das receitas antigas seguem iguais (título, resumo, tempo e o bloqueio);
//  - o herói não cria mais conteúdo pelo portal (0045: só o admin, pelo herói escolhido);
//  - o endereço antigo do editor leva a receita ao editor de receitas; o editor do admin mostra a receita só
//    para leitura, com o aviso, sem Publicar nem Despublicar.

const OLD_RECIPES = [
  { slug: "bowl-de-frango-grelhado-com-legumes-assados-g1", title: "Bowl de frango grelhado com legumes assados", summary: "O bowl clássico da cozinha de base", minutes: 35 },
  { slug: "panqueca-de-aveia-e-banana-g9", title: "Panqueca de aveia e banana", summary: "Três ingredientes, cinco minutos", minutes: 15 },
];

test.describe("receitas estruturadas (fase 1): nada visível muda e o editor antigo fica só para leitura", () => {
  for (const recipe of OLD_RECIPES) {
    test(`a página de ${recipe.slug} segue igual para o visitante`, async ({ page }) => {
      await page.goto(`/content/${recipe.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: recipe.title })).toBeVisible();
      await expect(page.getByText(recipe.summary, { exact: false }).first()).toBeVisible();
      await expect(page.getByText(`${recipe.minutes} min`, { exact: false }).first()).toBeVisible();
      // receita antiga continua atrás da etapa demonstrativa, como antes
      await expect(page.getByTestId("recipe-gate")).toBeVisible();
    });
  }

  test("o herói não cria mais conteúdo pelo portal: o endereço antigo volta ao Perfil", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/creator/content/new");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("combobox", { name: "Tipo", exact: true })).toHaveCount(0);
  });

  test("admin pelo herói: o endereço antigo do editor leva a receita ao editor de receitas", async ({ page }) => {
    await loginAsAdminActing(page, "content");
    const id = seedUuid("content:g1"); // receita do herói da conta demo
    await page.goto(`/creator/content/${id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/creator/recipes/${id}/edit$`));
    // receita no ar: o editor mostra o estado e as ações possíveis, sem o assistente
    await expect(page.getByTestId("recipe-status-panel")).toBeVisible();
    await expect(page.getByTestId("recipe-wizard")).toHaveCount(0);
  });

  test("o editor do admin mostra a receita g1 só para leitura, com o aviso", async ({ page }) => {
    await loginAs(page, "admin", { home: /\/admin$/ });
    await page.goto(`/admin/content/${seedUuid("content:g1")}/edit`);
    const notice = page.getByTestId("recipe-legacy-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("A edição de receitas pela administração ainda não está neste formulário");
    await expect(page.getByText("Somente leitura", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Salvar$/ })).toHaveCount(0);
  });
});
