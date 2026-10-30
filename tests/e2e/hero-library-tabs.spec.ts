import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Atalhos da página do herói (0050): "Rotina" virou Dia a dia e "Receitas" virou Alimentação (com
// os endereços novos e 308 dos antigos); rótulo/ícone/ordem/visibilidade configurados pelo admin por
// categoria e por herói. Só leitura: nada é gravado. Sem a 0050 no banco a página usa os padrões e
// os testes das telas do admin que dependem dela se pulam.

const tiles = (page: Page) => page.getByTestId("hero-libraries").getByRole("link");

test.describe("atalhos renomeados", () => {
  test("Anitta mostra Dia a dia e Alimentação nos endereços novos; nenhum Rotina/Receitas", async ({ page }) => {
    await page.goto("/personalities/anitta");
    const day = tiles(page).filter({ hasText: "Dia a dia" });
    await expect(day).toHaveAttribute("href", "/personalities/anitta/dia-a-dia");
    await expect(tiles(page).filter({ hasText: "Alimentação" })).toHaveAttribute("href", "/personalities/anitta/alimentacao");
    await expect(tiles(page).filter({ hasText: /^Rotina|^Receitas/ })).toHaveCount(0);
    for (const href of await tiles(page).evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))) {
      expect(href).not.toMatch(/\/(rotina|receitas)$/);
    }

    await day.click();
    await expect(page).toHaveURL(/\/personalities\/anitta\/dia-a-dia$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dia a dia");
    await expect(page).toHaveTitle(/Dia a dia · Anitta/);
    await expect(page.getByTestId("library-grid").locator("> a").first()).toBeVisible();
  });

  test("Alimentação continua em todo herói (sempre visível, como Receitas)", async ({ page }) => {
    await page.goto("/personalities/neymar");
    await expect(tiles(page).filter({ hasText: "Alimentação" })).toBeVisible();
    await page.goto("/personalities/erick-jacquin/alimentacao");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alimentação");
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
  });
});

test.describe("endereços antigos", () => {
  test("/rotina e /receitas respondem 308 para os novos, mantendo a busca", async ({ request }) => {
    for (const [from, to] of [
      ["/personalities/anitta/rotina", "/personalities/anitta/dia-a-dia"],
      ["/personalities/erick-jacquin/receitas", "/personalities/erick-jacquin/alimentacao"],
      ["/personalities/erick-jacquin/receitas?tempo=15&q=ovo", "/personalities/erick-jacquin/alimentacao?tempo=15&q=ovo"],
    ]) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      const location = new URL(response.headers().location, "http://x");
      expect(location.pathname + location.search).toBe(to);
    }
  });

  test("abrir o endereço antigo chega à página nova", async ({ page }) => {
    await page.goto("/personalities/anitta/receitas");
    await expect(page).toHaveURL(/\/personalities\/anitta\/alimentacao$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alimentação");
  });
});

test.describe("admin: atalhos (só leitura)", () => {
  test("/admin/hero-categories tem o editor de atalhos por categoria (com a 0050)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/hero-categories");
    await expect(page.getByRole("heading", { level: 2, name: "Atalhos da página do herói" })).toBeVisible();
    const editor = page.getByTestId("category-tabs-editor");
    const notice = page.getByTestId("category-tabs-unavailable");
    await expect(editor.or(notice)).toBeVisible();
    test.skip((await editor.count()) === 0, "banco sem a 0050: o painel mostra o aviso");

    const rows = editor.getByTestId("library-tab-row");
    await expect(rows).toHaveCount(7);
    // as 7 fontes fixas; cada linha com nome pt-BR/en/es, ícone e visível
    const sources = await rows.evaluateAll((items) => items.map((li) => li.getAttribute("data-source")));
    expect([...sources].sort()).toEqual(["alimentacao", "dia-a-dia", "gastronomia", "nutricao", "produtos", "programas", "treinos"]);
    const first = rows.first();
    await expect(first.getByLabel("Nome (pt-BR)")).toBeVisible();
    await expect(first.getByLabel("Nome (inglês)")).toBeVisible();
    await expect(first.getByLabel("Ícone")).toBeVisible();
    await expect(first.getByRole("switch", { name: "Visível" })).toBeVisible();
    // sem mudança, salvar fica desligado; trocar a categoria troca o editor
    await expect(page.getByRole("button", { name: "Salvar atalhos" })).toBeDisabled();
    await page.getByTestId("category-tabs-select").selectOption({ label: "Música" });
    await expect(page.getByTestId("category-tabs-editor").getByTestId("library-tab-row")).toHaveCount(7);

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include("#atalhos").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("a tela do herói mostra 'Atalhos deste herói' com a categoria de origem (com a 0050)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/creators");
    await page.locator('main a[href^="/admin/creators/"]').filter({ hasText: "Anitta" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Anitta" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Atalhos deste herói" })).toBeVisible();
    const editor = page.getByTestId("hero-tabs-editor");
    const notice = page.getByTestId("hero-tabs-unavailable");
    await expect(editor.or(notice)).toBeVisible();
    test.skip((await editor.count()) === 0, "banco sem a 0050: a seção mostra o aviso");

    // Anitta: Música é a principal (posição 1)
    await expect(page.getByTestId("hero-tabs-inherited")).toHaveText("Herdado da categoria Música.");
    await expect(editor.getByTestId("library-tab-row")).toHaveCount(7);
    await expect(editor.getByTestId("library-tab-origin").first()).toHaveText(/Herdado|Exceção/);
    await expect(editor.getByRole("button", { name: "Salvar atalhos" })).toBeDisabled();
  });
});
