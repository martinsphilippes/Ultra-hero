import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Aba Hero (/personalities): chips de categoria do herói ("Todos" + as do admin, 0049) e selos de
// categoria nos cards; telas do admin. Só leitura: nada é gravado. Sem a 0049 no banco a aba mostra
// só "Todos" e os testes que dependem das categorias se pulam.

async function chipsInfo(page: Page) {
  const group = page.getByRole("group", { name: "Filtrar por categoria" });
  const available = (await page.getByTestId("hero-category-chips").getAttribute("data-available")) === "true";
  return { group, chips: group.getByRole("link"), available };
}

const heroCards = (page: Page) => page.locator('main li a[href^="/personalities/"]');

test.describe("aba Hero: categorias", () => {
  test("'Todos' vem primeiro e marcado; a contagem bate com os cards; sem chips de pilar", async ({ page }) => {
    await page.goto("/personalities");
    await expect(page.getByRole("heading", { level: 1, name: "Heróis" })).toBeVisible();
    await expect(page.getByText("Atletas, artistas e chefs que você acompanha.")).toBeVisible();
    const { chips } = await chipsInfo(page);
    await expect(chips.first()).toHaveText("Todos");
    await expect(chips.first()).toHaveAttribute("aria-current", "true");
    await expect(chips.first()).toHaveAttribute("href", "/personalities");
    // os pilares saíram da aba Hero
    for (const pillar of ["Rotina", "Treino", "Nutrição"]) await expect(chips.filter({ hasText: pillar })).toHaveCount(0);
    const total = await heroCards(page).count();
    expect(total).toBeGreaterThan(0);
    await expect(page.getByText(total === 1 ? "1 herói" : `${total} heróis`, { exact: true })).toBeVisible();
  });

  test("categoria desconhecida na URL cai em 'Todos'; o chip navega e o voltar restaura", async ({ page }) => {
    await page.goto("/personalities?categoria=nao-existe-123");
    const { chips } = await chipsInfo(page);
    await expect(chips.first()).toHaveAttribute("aria-current", "true");
    const total = await heroCards(page).count();
    expect(total).toBeGreaterThan(0);
    await chips.first().click();
    await expect(page).toHaveURL(/\/personalities$/);
    await expect(heroCards(page)).toHaveCount(total);
    await page.goBack();
    await expect(page).toHaveURL(/\/personalities\?categoria=nao-existe-123$/);
    await expect(chips.first()).toHaveAttribute("aria-current", "true");
  });

  test("sem a 0049: só 'Todos' e cards sem selo de categoria", async ({ page }) => {
    await page.goto("/personalities");
    const { chips, available } = await chipsInfo(page);
    test.skip(available, "banco com a 0049: coberto pelos testes com categorias");
    await expect(chips).toHaveCount(1);
    await expect(page.getByTestId("hero-category-badge")).toHaveCount(0);
  });

  test("com a 0049: chips do seed na ordem; Esporte filtra, fica na URL e o voltar restaura", async ({ page }) => {
    await page.goto("/personalities?categoria=nao-existe-123");
    const { chips, group, available } = await chipsInfo(page);
    test.skip(!available, "banco sem a 0049 (categorias indisponíveis)");
    // desconhecida cai em Todos
    await expect(chips.first()).toHaveAttribute("aria-current", "true");
    const all = await heroCards(page).count();
    await expect(chips).toHaveText(["Todos", "Esporte", "Música", "Gastronomia", "Arte e Entretenimento"]);

    await group.getByRole("link", { name: "Esporte", exact: true }).click();
    await expect(page).toHaveURL(/\/personalities\?categoria=esporte$/);
    await expect(group.getByRole("link", { name: "Esporte", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.getByText("4 heróis", { exact: true })).toBeVisible();
    const cards = heroCards(page);
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(cards.nth(i).getByTestId("hero-category-badge").first()).toHaveText("Esporte");
    expect(await cards.count()).toBeLessThan(all);

    await page.goBack();
    await expect(page).toHaveURL(/\/personalities\?categoria=nao-existe-123$/);
    await expect(chips.first()).toHaveAttribute("aria-current", "true");
  });

  test("com a 0049: Anitta mostra 2 selos (Música, Arte e Entretenimento) e aparece nas duas", async ({ page }) => {
    await page.goto("/personalities");
    const { available } = await chipsInfo(page);
    test.skip(!available, "banco sem a 0049 (categorias indisponíveis)");
    const anitta = page.locator('main a[href="/personalities/anitta"]');
    await expect(anitta.getByTestId("hero-category-badge")).toHaveText(["Música", "Arte e Entretenimento"]);
    for (const slug of ["musica", "arte-e-entretenimento"]) {
      await page.goto(`/personalities?categoria=${slug}`);
      await expect(page.locator('main a[href="/personalities/anitta"]')).toBeVisible();
      await expect(page.getByText("1 herói", { exact: true })).toBeVisible();
    }
    await page.goto("/personalities?categoria=gastronomia");
    await expect(heroCards(page)).toHaveCount(1);
    await expect(page.locator('main a[href="/personalities/erick-jacquin"]').getByTestId("hero-category-badge")).toHaveText(["Gastronomia"]);
  });

  test("sem violações sérias de acessibilidade", async ({ page }) => {
    await page.goto("/personalities");
    await expect(heroCards(page).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});

test.describe("admin: categorias dos heróis (só leitura)", () => {
  test("a tela abre pelo menu do portal; com a 0049 lista as 4 do seed com a contagem", async ({ page }, testInfo) => {
    await loginAs(page, "admin");
    if (testInfo.project.name === "desktop") {
      await page.getByRole("link", { name: "Categorias dos heróis" }).first().click();
      await expect(page).toHaveURL(/\/admin\/hero-categories$/);
    } else {
      await page.goto("/admin/hero-categories");
    }
    await expect(page.getByRole("heading", { level: 1, name: "Categorias dos heróis" })).toBeVisible();
    const rows = page.getByTestId("hero-category-row");
    const notice = page.getByTestId("hero-categories-unavailable");
    await expect(rows.first().or(notice)).toBeVisible();
    test.skip((await rows.count()) === 0, "banco sem a 0049: a tela mostra o aviso");
    await expect(page.getByRole("button", { name: "Nova categoria" })).toBeVisible();
    await expect(rows.filter({ hasText: "esporte" }).first().getByTestId("hero-category-count")).toHaveText("Heróis: 4");
    await expect(rows.filter({ hasText: "gastronomia" }).first().getByTestId("hero-category-count")).toHaveText("Heróis: 1");
    // o diálogo de edição abre com o rótulo e o slug (sem salvar)
    await page.getByRole("button", { name: "Editar · Esporte" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Nome (pt-BR)")).toHaveValue("Esporte");
    await expect(dialog.getByLabel("Slug (endereço)")).toHaveValue("esporte");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a tela do herói mostra o campo Categorias (até 2, em ordem)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/creators");
    await page.locator('main a[href^="/admin/creators/"]').filter({ hasText: "Anitta" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Anitta" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Categorias" })).toBeVisible();
    const field = page.getByTestId("hero-categories-field");
    const notice = page.getByTestId("hero-categories-unavailable");
    await expect(field.or(notice)).toBeVisible();
    test.skip((await field.count()) === 0, "banco sem a 0049: a seção mostra o aviso");
    const first = page.getByTestId("hero-category-first");
    const second = page.getByTestId("hero-category-second");
    await expect(first.locator("option:checked")).toHaveText("Música");
    await expect(second.locator("option:checked")).toHaveText("Arte e Entretenimento");
    // a segunda lista não oferece a primeira escolhida; sem mudança, salvar fica desligado
    await expect(second.locator("option", { hasText: "Música" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar categorias" })).toBeDisabled();
  });
});
