import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Gestão, P1b (0067): agenda nos três portais, navegação por mês, feed .ics (rota 404 sem token válido).
// Só leitura: nenhum evento é criado e nenhum link de feed é gerado (as escritas são cobertas por S77).

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

test.describe("agenda integrada", () => {
  test("feed .ics: token inválido ou inexistente devolve 404 sem indexar", async ({ request }) => {
    const bad = await request.get("/api/agenda/token-invalido.ics");
    expect(bad.status()).toBe(404);
    const none = await request.get(`/api/agenda/${"0".repeat(64)}.ics`);
    expect(none.status()).toBe(404);
    expect(none.headers()["x-robots-tag"]).toContain("noindex");
    expect(none.headers()["cache-control"]).toContain("no-store");
  });

  test("agência: agenda do mês com filtros, botão de novo compromisso e cartão do feed", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/agenda");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0067 ainda não aplicada");
    await expect(page.getByTestId("agency-agenda")).toBeVisible();
    await expect(page.getByTestId("month-nav")).toBeVisible();
    await expect(page.getByTestId("agenda-filters")).toBeVisible();
    await expect(page.getByTestId("event-new")).toBeVisible();
    await expect(page.getByTestId("feed-card")).toBeVisible();
    await expect(page.getByTestId("feed-url")).toHaveCount(0);
    await noHorizontalScroll(page);
    await axe(page);
    // próximo mês navega pelo parâmetro
    await page.getByRole("link", { name: /Próximo mês/ }).click();
    await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
    await expect(page.getByTestId("agency-agenda")).toBeVisible();
  });

  test("colaborador: sem publicar data comercial; eventos da demonstração não trazem valores", async ({ page }) => {
    await loginAs(page, "agencyStaff", { home: null });
    await page.goto("/agencia/agenda");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0067 ainda não aplicada");
    await expect(page.getByTestId("agency-agenda")).not.toContainText("R$");
    await page.getByTestId("event-new").click();
    await expect(page.getByTestId("event-form")).toBeVisible();
    await expect(page.getByTestId("event-form").locator("option", { hasText: /Data comercial/ })).toHaveCount(0);
  });

  test("marca: agenda sem prazos internos nem valores; feed disponível ao dono", async ({ page }) => {
    await loginAs(page, "brand", { home: null });
    await page.goto("/marca/agenda");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0067 ainda não aplicada");
    await expect(page.getByTestId("brand-agenda")).toBeVisible();
    await expect(page.getByTestId("brand-agenda")).not.toContainText("R$");
    await expect(page.locator('[data-testid="event-item"][data-kind="consult_deadline"]')).toHaveCount(0);
    await expect(page.getByTestId("feed-card")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
  });

  test("escritório: aba Agenda com o mês e o feed", async ({ page }) => {
    await loginAs(page, "talent");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    await page.goto("/creator/escritorio/agenda");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0067 ainda não aplicada");
    await expect(page.getByTestId("office-agenda")).toBeVisible();
    await expect(page.getByTestId("month-nav")).toBeVisible();
    await expect(page.getByTestId("feed-card")).toBeVisible();
    await expect(page.getByTestId("office-agenda")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
  });
});
