import { expect as baseExpect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { deleteOwnListsNamed, listsAcceptProductsAndPrograms } from "./helpers/supabase";

// Listas com conteúdos, produtos e programas (migração 0040), contra o banco remoto. Conta demo free:
// cria "[E2E] Lista mista", guarda um produto Ultra.e Life e um programa pelas páginas deles, confere
// a página da lista (os dois cards, a contagem, a remoção) e APAGA a lista no afterEach, mesmo em
// falha. Enquanto o remoto não tiver a 0040 o teste pula: a pergunta é feita ao próprio banco.
// Roda só no projeto mobile: a conta é a mesma nos dois projetos e as listas disputariam o nome.

const LIST_NAME = "[E2E] Lista mista";
const PRODUCT = { path: "/shop/e-creatina-po", title: /e\.creatina Pó/ };
const PROGRAM = { path: "/programs/manhas-com-intencao", title: "Manhãs com Intenção" };
const MIX_HINT = "Guarde conteúdos, receitas, produtos e programas.";
// cada passo relê o banco remoto: mais folga que os 5 s padrão
const expect = baseExpect.configure({ timeout: 15_000 });

test.beforeEach(async ({ context, baseURL }) => {
  // uh-e2e=1: nenhum evento de análise é gravado por este navegador
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

test.describe("listas com produto e programa", () => {
  test.afterEach(async ({ page }) => {
    // limpeza mesmo quando o teste falha ou estoura o tempo (a página ainda tem a sessão)
    await deleteOwnListsNamed(page, LIST_NAME).catch(() => 0);
  });

  test("cria a lista, guarda um produto e um programa, confere e remove", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a conta demo é compartilhada entre os projetos");
    const supported = await listsAcceptProductsAndPrograms();
    test.skip(supported !== true, "o banco ainda não tem a 0040 (list_items.item_type)");

    await loginAs(page, "free");
    // sobra de uma execução anterior interrompida
    await deleteOwnListsNamed(page, LIST_NAME);

    // 1) cria a lista pela aba Listas; o diálogo explica o que dá para guardar
    await page.goto("/explore?tab=listas");
    await page.getByRole("button", { name: "Nova lista" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Criar lista" });
    await expect(dialog).toContainText(MIX_HINT);
    await dialog.getByLabel("Nome da lista").fill(LIST_NAME);
    await dialog.getByRole("button", { name: "Nova lista" }).click();
    await expect(page).toHaveURL(/\/explore\/lists\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const listUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: LIST_NAME })).toBeVisible();
    await expect(page.getByText(MIX_HINT)).toBeVisible();

    // 2) produto: botão "Salvar em lista" na página do produto
    for (const target of [PRODUCT, PROGRAM]) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { level: 1, name: target.title })).toBeVisible();
      await page.getByTestId("add-to-list").click();
      const sheet = page.getByRole("dialog", { name: "Minhas listas" });
      const box = sheet.getByRole("checkbox", { name: `Salvar em ${LIST_NAME}` });
      await expect(box).not.toBeChecked();
      await box.click();
      await expect(page.getByText(`Salvo em ${LIST_NAME}`).first()).toBeVisible();
      await expect(box).toBeChecked();
      await page.keyboard.press("Escape");
    }

    // 3) página da lista: um card de produto e um de programa, contagem certa
    await page.goto(listUrl);
    const items = page.getByTestId("list-item");
    await expect(items).toHaveCount(2);
    await expect(page.locator('[data-testid="list-item"][data-kind="product"]').getByRole("heading", { name: PRODUCT.title })).toBeVisible();
    await expect(page.locator('[data-testid="list-item"][data-kind="program"]').getByRole("heading", { name: PROGRAM.title })).toBeVisible();
    await expect(page.getByText(/2 itens/)).toBeVisible();

    // 4) remove o produto; fica só o programa
    await page.getByRole("button", { name: /Remover “e\.creatina Pó/ }).click();
    await expect(page.getByText("Removido da lista").first()).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute("data-kind", "program");
    await expect(page.getByText(/1 item\b/)).toBeVisible();

    // 5) a aba Listas conta o mesmo
    await page.goto("/explore?tab=listas");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: LIST_NAME }) });
    await expect(card).toContainText(/1 item\b/);
  });

  // O app vai ao ar antes da migração: nesse intervalo, produto e programa abrem normalmente, só sem o
  // botão de lista; o de conteúdo continua lá e a aba Listas abre sem erro. Só leitura.
  test("sem a 0040 no banco: produto e programa sem botão de lista, conteúdo e listas como antes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a conta demo é compartilhada entre os projetos");
    const supported = await listsAcceptProductsAndPrograms();
    test.skip(supported !== false, "o banco já tem a 0040 (o teste acima cobre o botão)");

    await loginAs(page, "free");
    for (const target of [PRODUCT, PROGRAM]) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { level: 1, name: target.title })).toBeVisible();
      await expect(page.getByTestId("add-to-list")).toHaveCount(0);
    }
    await page.goto("/content/higiene-do-sono-8-ajustes-simples-r9");
    await page.getByTestId("add-to-list").click();
    // o painel lê as listas pelo caminho antigo (só content_id) e abre sem erro
    const sheet = page.getByRole("dialog", { name: "Minhas listas" });
    await expect(sheet.getByRole("button", { name: "Criar e salvar" })).toBeVisible();
    await expect(sheet.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
    await expect(sheet.getByRole("alert")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/explore?tab=listas");
    await expect(page.getByRole("heading", { name: "Minhas listas" })).toBeVisible();
    await expect(page.getByText("Não foi possível carregar")).toHaveCount(0);
  });
});
