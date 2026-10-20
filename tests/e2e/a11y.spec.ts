import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Varredura de acessibilidade (axe, WCAG 2.x A/AA) nas rotas públicas.
// Não declara conformidade: aponta violações para correção.
const PUBLIC_ROUTES = ["/", "/explore", "/personalities", "/personalities/helena-vilar?tab=produtos", "/login", "/signup", "/shop", "/offline", "/legal/terms", "/legal/privacy"];

for (const route of PUBLIC_ROUTES) {
  test(`axe sem violações sérias em ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 2)).toEqual([]);
  });
}

test("documentos legais: públicos, um h1, aviso de demonstração, data e tabelas acessíveis", async ({ page }) => {
  for (const route of ["/legal/terms", "/legal/privacy"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main h3, main h4, main h5, main h6")).toHaveCount(0);
    await expect(page.getByRole("note")).toContainText(/revisão jurídica antes da abertura pública/);
    await expect(page.getByText("Última atualização: 20/10/2026")).toBeVisible();
  }
  const tables = page.locator("main table");
  await expect(tables).toHaveCount(2);
  for (const table of await tables.all()) {
    await expect(table.locator("caption")).toHaveCount(1);
    await expect(table.locator('thead th[scope="col"]').first()).toBeVisible();
    await expect(table.locator('tbody th[scope="row"]').first()).toBeVisible();
  }
  await page.goto("/signup");
  await expect(page.locator('form a[href="/legal/terms"]')).toHaveCount(1);
  await expect(page.locator('form a[href="/legal/privacy"]')).toHaveCount(1);
});

test("navegação principal por teclado e aria-current", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation").first();
  await expect(nav).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /pular|skip|saltar/i });
  await expect(skip).toBeFocused();
  // No mobile a navegação superior fica oculta; a barra inferior deve expor o item ativo.
  await expect(page.locator('[aria-current="page"]').filter({ visible: true }).first()).toBeVisible();
});

test("troca de idioma reflete na interface", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: page.url() }]);
  await page.reload();
  await expect(page.getByRole("button", { name: /sign in|log in|continue/i }).first()).toBeVisible();
});
