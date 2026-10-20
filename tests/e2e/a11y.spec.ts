import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Varredura de acessibilidade (axe, WCAG 2.x A/AA) nas rotas públicas.
// Não declara conformidade: aponta violações para correção.
const PUBLIC_ROUTES = ["/", "/explore", "/personalities", "/login", "/signup", "/shop", "/offline"];

for (const route of PUBLIC_ROUTES) {
  test(`axe sem violações sérias em ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 2)).toEqual([]);
  });
}

test("navegação principal por teclado e aria-current", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation").first();
  await expect(nav).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /pular|skip|saltar/i });
  await expect(skip).toBeFocused();
  await expect(page.locator('[aria-current="page"]').first()).toBeVisible();
});

test("troca de idioma reflete na interface", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: page.url() }]);
  await page.reload();
  await expect(page.getByRole("button", { name: /sign in|log in|continue/i }).first()).toBeVisible();
});
