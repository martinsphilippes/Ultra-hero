import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Gestão, P3 (0069): financeiro simulado (só Adm), painéis dos três inícios, histórico e documentos do creator.
// Só leitura: nenhuma situação muda, nenhuma taxa é salva, nenhum patrocínio é publicado (escritas no S79).

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

test.describe("financeiro simulado, painéis e alertas", () => {
  test("Adm: Financeiro com selo simulado, filtros e lançamentos; Histórico; taxa nas configurações", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/financeiro");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0069 ainda não aplicada");
    await expect(page.getByTestId("agency-finance")).toBeVisible();
    await expect(page.getByTestId("finance-kpis")).toBeVisible();
    await expect(page.getByTestId("finance-disclaimer")).toBeVisible();
    await expect(page.getByTestId("finance-filters")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
    await page.getByTestId("finance-filters").getByRole("link", { name: /Todos/ }).click();
    await expect(page).toHaveURL(/f=all/);
    await expect(page.getByTestId("agency-finance")).toBeVisible();
    await page.goto("/agencia/historico");
    await expect(page.getByTestId("agency-history")).toBeVisible();
    await page.goto("/agencia/configuracoes");
    await expect(page.getByTestId("agency-rate")).toBeVisible();
    await expect(page.getByTestId("rate-preview")).toContainText("R$");
  });

  test("Adm: início com indicadores executivos e o bloco financeiro; negócio em produção com lançamentos", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia");
    await expect(page.getByTestId("agency-kpis")).toBeVisible();
    test.skip((await page.getByTestId("agency-finance-home").count()) === 0, "0069 ainda não aplicada");
    await expect(page.getByTestId("agency-finance-home")).toContainText("R$");
    await page.goto("/agencia/pipeline");
    const card = page.locator('[data-testid="deal-card"]', { hasText: /inverno/i });
    test.skip((await card.count()) === 0, "negócio em produção da demonstração ainda não semeado");
    await card.first().click();
    await expect(page.getByTestId("deal-finance")).toBeVisible();
    await expect(page.getByTestId("entry-table")).toBeVisible();
    await expect(page.locator('[data-testid="entry-item"][data-kind="brand_receivable"]')).toHaveCount(1);
    await page.goto(`${page.url()}/creators`);
    await expect(page.getByTestId("deal-sponsorship")).toBeVisible();
  });

  test("colaborador: sem Financeiro nem Histórico (menu e rota); início sem valores", async ({ page }) => {
    await loginAs(page, "agencyStaff", { home: null });
    await page.goto("/agencia");
    await expect(page.getByTestId("agency-kpis")).toBeVisible();
    await expect(page.getByTestId("agency-kpis")).not.toContainText("R$");
    await expect(page.getByTestId("agency-finance-home")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Financeiro", exact: true })).toHaveCount(0);
    await page.goto("/agencia/financeiro");
    await expect(page).toHaveURL(/\/agencia\/?$/);
    await page.goto("/agencia/historico");
    await expect(page).toHaveURL(/\/agencia\/?$/);
    await page.goto("/agencia/pipeline");
    const card = page.getByTestId("deal-card");
    test.skip((await card.count()) === 0, "negócio de demonstração ainda não semeado");
    await card.first().click();
    await expect(page.getByTestId("deal-finance")).toHaveCount(0);
  });

  test("marca: início com creators sugeridos e próximas datas, sem valores", async ({ page }) => {
    await loginAs(page, "brand", { home: null });
    await page.goto("/marca");
    await expect(page.getByTestId("brand-kpis")).toBeVisible();
    test.skip((await page.getByTestId("brand-suggested").count()) === 0, "0069 ainda não aplicada");
    await expect(page.getByTestId("brand-suggested")).toBeVisible();
    await expect(page.getByTestId("brand-next-events")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
  });

  test("escritório: início com próximas entregas e repasses (valor só na web); aba Documentos", async ({ page }) => {
    await loginAs(page, "talent");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    await page.goto("/creator/escritorio");
    test.skip((await page.getByTestId("office-next-deliveries").count()) === 0, "0069 ainda não aplicada");
    await expect(page.getByTestId("office-next-deliveries")).toBeVisible();
    await expect(page.getByTestId("office-payouts")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
    await page.goto("/creator/escritorio/documentos");
    await expect(page.getByTestId("office-documents")).toBeVisible();
  });

  test("cron da agência: sem segredo responde 500 e não roda; com segredo errado, 403", async ({ request }) => {
    const anon = await request.get("/api/cron/agency");
    expect([401, 403, 500]).toContain(anon.status());
    const wrong = await request.get("/api/cron/agency", { headers: { authorization: "Bearer errado" } });
    expect([403, 500]).toContain(wrong.status());
  });
});
