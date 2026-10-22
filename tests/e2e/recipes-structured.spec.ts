import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Fumaça da fase 1 do módulo de receitas (0027–0029): só leitura, nada é gravado no banco remoto.
// (Fase 2: o editor antigo segue só para leitura, mas "Editar" leva ao editor de receitas.)
// Funciona com o remoto antes e depois da migração: nenhuma tela usa as tabelas novas na fase 1.
//  - as páginas públicas das receitas antigas seguem iguais (título, resumo, tempo e o bloqueio);
//  - /creator/content/new não oferece mais o tipo receita;
//  - o editor antigo (herói e admin) mostra a receita só para leitura, com o aviso, sem Publicar nem Despublicar.

/** Réplica de public.seed_uuid (0008): ids determinísticos do seed. */
function seedUuid(key: string): string {
  const h = createHash("md5").update(`ultra-hero:${key}`).digest("hex");
  const variant = "89ab"[parseInt(h[16], 16) % 4];
  const x = `${h.slice(0, 12)}4${h.slice(13, 16)}${variant}${h.slice(17)}`;
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

async function loginAs(page: Page, kind: "creator" | "admin", home: RegExp) {
  await page.goto("/login");
  const panel = page.getByTestId("demo-access");
  test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
  await panel.locator(`[data-demo-kind="${kind}"]`).click();
  await expect(page).toHaveURL(home, { timeout: 20_000 });
}

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

  test("o novo conteúdo do herói não oferece o tipo receita", async ({ page }) => {
    await loginAs(page, "creator", /\/creator$/);
    await page.goto("/creator/content/new");
    const typeSelect = page.getByRole("combobox", { name: "Tipo", exact: true });
    await expect(typeSelect).toBeVisible();
    await expect(typeSelect.locator("option")).toHaveText(["Vídeo", "Treino", "Guia", "Artigo"]);
  });

  test("o editor antigo do herói mostra a receita só para leitura, com o aviso, sem Publicar/Despublicar e com Editar levando ao editor novo", async ({ page }) => {
    await loginAs(page, "creator", /\/creator$/);
    await page.goto("/creator/content");
    // desde a fase 2 a lista leva a receita direto ao editor novo
    const recipeLink = page.locator('a[data-content-type="recipe"]').first();
    test.skip((await recipeLink.count()) === 0, "a conta de demonstração do herói não assina receitas");
    const href = (await recipeLink.getAttribute("href"))!;
    expect(href).toMatch(/^\/creator\/recipes\/[0-9a-f-]+\/edit$/);
    const id = href.split("/")[3];
    await page.goto(`/creator/content/${id}/edit`);
    const notice = page.getByTestId("recipe-legacy-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Receitas agora têm editor próprio");
    await expect(page.getByTestId("recipe-open-editor")).toHaveAttribute("href", `/creator/recipes/${id}/edit`);
    await expect(page.getByText("Somente leitura", { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId("publish-content")).toHaveCount(0);
    await expect(page.getByTestId("unpublish-content")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Salvar$/ })).toHaveCount(0);
  });

  test("o editor do admin mostra a receita g1 só para leitura, com o aviso", async ({ page }) => {
    await loginAs(page, "admin", /\/admin$/);
    await page.goto(`/admin/content/${seedUuid("content:g1")}/edit`);
    const notice = page.getByTestId("recipe-legacy-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("A edição de receitas pela administração ainda não está neste formulário");
    await expect(page.getByText("Somente leitura", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Salvar$/ })).toHaveCount(0);
  });
});
