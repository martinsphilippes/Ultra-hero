import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { seedUuid } from "./helpers/seed";

// Alimentação completa (0051): assinatura da vitrine ("Receita de <chef> · indicada por <herói>"),
// ações nos cards da Alimentação (Fazer, Lista de compras, Comprar pronto com produto ligado), a linha
// "Nutricionista: em breve" (com a 0058, "Contratar nutricionista") e o painel "Vitrine (Alimentação)" do admin. Só leitura: nada é gravado
// (o cookie uh-e2e=1 também desliga o contador de toques). Sem a 0051 no banco, a assinatura e as
// ações continuam (vêm do modelo da 0024); quem assina e Comprar pronto ficam de fora e os testes que
// dependem deles se pulam.

const G1 = { slug: "bowl-de-frango-grelhado-com-legumes-assados-g1", title: "Bowl de frango grelhado com legumes assados" };

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

async function expectNoSeriousAxe(page: Page, include: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).include(include).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
}

test.describe("Alimentação do herói", () => {
  test("cards indicados pela Anitta: assinatura do chef, 'Indicada por Anitta' e as ações Fazer e Lista", async ({ page }) => {
    await page.goto("/personalities/anitta/alimentacao");
    const card = page.getByTestId("recipe-card").first();
    await expect(card).toBeVisible();
    const slug = (await card.getAttribute("data-slug"))!;
    await expect(card.getByTestId("recipe-endorsed")).toContainText("Indicada por Anitta");
    await expect(card.getByTestId("recipe-signature")).toBeVisible();
    // o título leva o herói da vitrine para a página da receita
    await expect(card.getByRole("link").first()).toHaveAttribute("href", `/content/${slug}?vitrine=anitta`);
    const actions = card.getByTestId("recipe-card-actions");
    await expect(actions.getByTestId("recipe-card-make")).toHaveAttribute("href", `/content/${slug}/cozinha`);
    await expect(actions.getByTestId("recipe-card-make")).toHaveText("Fazer");
    await expect(actions.getByTestId("recipe-card-list")).toHaveAttribute("href", `/content/${slug}?vitrine=anitta#lista-de-compras`);
    // nutricionista: com a 0058, "Contratar nutricionista" com sugeridos; sem ela, só a linha "em breve"
    const hire = page.getByTestId("hire-nutritionist");
    if ((await hire.count()) > 0) {
      await expect(hire.getByTestId("hire-nutritionist-item").first()).toBeVisible();
    } else {
      const soon = page.getByTestId("recipe-nutritionist-soon");
      await expect(soon).toHaveText("Nutricionista: em breve");
      await expect(soon.getByRole("button")).toHaveCount(0);
      await expect(soon.getByRole("link")).toHaveCount(0);
    }
    await expectNoSeriousAxe(page, "main");
  });

  test("Lista de compras no card abre a receita na linha de ações, com a assinatura da vitrine", async ({ page }) => {
    await page.goto("/personalities/anitta/alimentacao");
    const card = page.getByTestId("recipe-card").first();
    const title = (await card.getByRole("heading").textContent())!.trim();
    await card.getByTestId("recipe-card-list").click();
    await expect(page).toHaveURL(/\/content\/[a-z0-9-]+\?vitrine=anitta#lista-de-compras$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("#lista-de-compras")).toBeVisible();
    const signature = page.getByTestId("recipe-page-signature");
    await expect(signature).toHaveAttribute("data-kind", "chefIndicated");
    await expect(signature).toContainText("indicada por Anitta");
    await expect(signature.getByRole("link", { name: "Anitta" })).toHaveAttribute("href", "/personalities/anitta");
  });

  test("Érick Jacquin: as próprias receitas têm as ações e só 'Receita de'", async ({ page }) => {
    await page.goto("/personalities/erick-jacquin/alimentacao");
    const card = page.getByTestId("recipe-catalog-grid").getByTestId("recipe-card").first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("recipe-card-actions")).toBeVisible();
    await expect(card.getByTestId("recipe-signature")).toContainText("Érick Jacquin");
    await expect(card.getByTestId("recipe-endorsed")).toHaveCount(0);
  });
});

test.describe("página da receita", () => {
  test("sem vitrine: 'Receita de Érick Jacquin'; vitrine que não tem a receita é ignorada", async ({ page }) => {
    await page.goto(`/content/${G1.slug}`);
    const signature = page.getByTestId("recipe-page-signature");
    await expect(signature).toHaveAttribute("data-kind", "chef");
    await expect(signature).toHaveText(/Receita de Érick Jacquin/);
    // sem a 0058: "em breve"; com ela, a seção "Contratar nutricionista"
    await expect(page.getByTestId("recipe-nutritionist-soon").or(page.getByTestId("hire-nutritionist"))).toBeVisible();

    // herói suspenso / inexistente / formato inválido: vale o autor
    for (const vitrine of ["bruna-castellano", "nao-existe", "..%2Fadmin"]) {
      await page.goto(`/content/${G1.slug}?vitrine=${vitrine}`);
      await expect(page.getByTestId("recipe-page-signature")).toHaveAttribute("data-kind", "chef");
    }
  });

  test("com a vitrine de quem indica: 'Receita de Érick Jacquin · indicada por Anitta'", async ({ page }) => {
    await page.goto(`/content/${G1.slug}?vitrine=anitta`);
    const signature = page.getByTestId("recipe-page-signature");
    const kind = await signature.getAttribute("data-kind");
    test.skip(kind !== "chefIndicated", "a Anitta não indica esta receita no remoto");
    await expect(signature).toHaveText(/Receita de Érick Jacquin · indicada por Anitta/);
  });

  test("Comprar pronto (com a 0051 e produto ligado): visitante vê 'Entrar para comprar' com o produto e o preço de teste", async ({ page }) => {
    await page.goto(`/content/${G1.slug}`);
    const login = page.getByTestId("recipe-ready-login");
    test.skip((await login.count()) === 0, "sem produto 'Comprar pronto' ligado (ou banco sem a 0051)");
    await expect(login).toContainText("Entrar para comprar");
    await expect(login).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/content/${G1.slug}`)}`);
  });
});

test.describe("admin: vitrine da receita (só leitura)", () => {
  test("/admin/content/[id] de uma receita mostra 'Vitrine (Alimentação)' com o autor e os heróis da vitrine", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto(`/admin/content/${seedUuid("content:g1")}`);
    await expect(page.getByRole("heading", { level: 2, name: "Vitrine (Alimentação)" })).toBeVisible();
    const panel = page.getByTestId("recipe-showcase-admin");
    await expect(panel.getByTestId("showcase-hero-list")).toContainText("Érick Jacquin");
    await expect(panel.getByTestId("showcase-hero-list")).toContainText("Autor");
    // nada muda sem escolher: adicionar e salvar ficam desligados
    const add = panel.getByRole("button", { name: "Adicionar", exact: true });
    if ((await add.count()) > 0) await expect(add).toBeDisabled();

    const signer = panel.getByTestId("showcase-signer-select");
    const notice = panel.getByTestId("recipe-showcase-unavailable");
    await expect(signer.or(notice)).toBeVisible();
    test.skip((await signer.count()) === 0, "banco sem a 0051: o painel mostra o aviso");
    await expect(signer.locator("option").first()).toHaveText("O autor (Érick Jacquin)");
    await expect(panel.getByTestId("showcase-signer-save")).toBeDisabled();
    await expect(panel.getByRole("heading", { level: 3, name: "Comprar pronto" })).toBeVisible();
    await expectNoSeriousAxe(page, "#vitrine");
  });
});
