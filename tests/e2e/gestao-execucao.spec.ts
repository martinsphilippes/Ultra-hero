import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Gestão, P2 (0068): termos demonstrativos, tarefas (12 passos + avulsas) e entregas com versões nos três
// portais. Só leitura: nada é enviado, aceito, concluído ou avaliado (as escritas são cobertas por S78).

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

test.describe("execução da campanha", () => {
  test("agência: Tarefas no menu, filtros por parâmetro e nova tarefa avulsa (sem enviar)", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/tarefas");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0068 ainda não aplicada");
    await expect(page.getByTestId("agency-tasks")).toBeVisible();
    await expect(page.getByTestId("task-filters")).toBeVisible();
    await expect(page.getByTestId("task-new")).toBeVisible();
    await expect(page.getByTestId("agency-tasks")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
    await page.getByTestId("task-filters").getByRole("link", { name: /Atrasadas/ }).click();
    await expect(page).toHaveURL(/f=overdue/);
    await expect(page.getByTestId("agency-tasks")).toBeVisible();
    // o formulário abre e fecha sem salvar
    await page.getByTestId("task-new").click();
    await expect(page.getByTestId("task-form")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("agência: ficha do negócio com abas Termos e Tarefas; termos demonstrativos sem valores", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/pipeline");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    const card = page.getByTestId("deal-card");
    test.skip((await card.count()) === 0, "negócio de demonstração ainda não semeado");
    await card.first().click();
    await expect(page).toHaveURL(/\/agencia\/negocios\/[0-9a-f-]{36}$/);
    const base = page.url();
    await page.goto(`${base}/termos`);
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0068 ainda não aplicada");
    await expect(page.getByTestId("deal-terms")).toBeVisible();
    await expect(page.getByTestId("terms-panel")).toBeVisible();
    await expect(page.getByTestId("deal-terms")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
    await page.goto(`${base}/tarefas`);
    await expect(page.getByTestId("deal-tasks")).toBeVisible();
    await expect(page.getByTestId("task-list")).toBeVisible();
    await page.goto(`${base}/entregas`);
    await expect(page.getByTestId("deliverables-editor")).toBeVisible();
  });

  test("agência: negócio em produção da demonstração traz tarefas das 12 etapas e entregas com versões", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/pipeline");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    const card = page.locator('[data-testid="deal-card"]', { hasText: /inverno/i });
    test.skip((await card.count()) === 0, "negócio em produção da demonstração ainda não semeado (0068 + Restaurar demonstração)");
    await card.first().click();
    const base = page.url().replace(/\/$/, "");
    await page.goto(`${base}/tarefas`);
    await expect(page.locator('[data-testid="task-item"][data-step="1"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="task-item"][data-step="5"]')).toHaveCount(1);
    await expect(page.getByTestId("task-item")).not.toHaveCount(0);
    await page.goto(`${base}/entregas`);
    await expect(page.getByTestId("deal-execution")).toBeVisible();
    await expect(page.getByTestId("deliverable-card").first()).toBeVisible();
    await expect(page.getByTestId("deliverable-version").first()).toBeVisible();
    await expect(page.getByTestId("deal-execution")).not.toContainText("R$");
    await page.goto(`${base}/termos`);
    await expect(page.locator('[data-testid="terms-card"][data-status="accepted"]')).toHaveCount(1);
    await noHorizontalScroll(page);
    await axe(page);
  });

  test("colaborador: tarefas sem valores e sem a confirmação da contratação", async ({ page }) => {
    await loginAs(page, "agencyStaff", { home: null });
    await page.goto("/agencia/tarefas");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0068 ainda não aplicada");
    await expect(page.getByTestId("agency-tasks")).toBeVisible();
    await expect(page.getByTestId("agency-tasks")).not.toContainText("R$");
    await page.goto("/agencia/pipeline");
    const card = page.getByTestId("deal-card");
    test.skip((await card.count()) === 0, "negócio de demonstração ainda não semeado");
    await card.first().click();
    await page.goto(`${page.url()}/termos`);
    await expect(page.getByTestId("deal-terms")).toBeVisible();
    await expect(page.getByTestId("contract-confirm")).toHaveCount(0);
    await expect(page.getByTestId("terms-send")).toHaveCount(0);
  });

  test("marca: aprovações pendentes no início e campanha com termos, roteiros e entregas sem valores", async ({ page }) => {
    await loginAs(page, "brand", { home: null });
    await expect(page.getByTestId("brand-kpis")).toBeVisible();
    await page.goto("/marca/campanhas");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    const campaign = page.getByTestId("campaign-list").getByRole("link", { name: /inverno/i });
    test.skip((await campaign.count()) === 0, "campanha em produção da demonstração ainda não semeada");
    await campaign.first().click();
    await expect(page.getByTestId("campaign-detail")).toBeVisible();
    await expect(page.getByTestId("campaign-terms")).toBeVisible();
    await expect(page.getByTestId("terms-panel")).toBeVisible();
    await expect(page.getByTestId("campaign-detail")).not.toContainText("R$");
    // a marca não vê rascunhos de termos nem tarefas internas da agência
    await expect(page.locator('[data-testid="terms-card"][data-status="draft"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="task-item"][data-step="2"]')).toHaveCount(0);
    await expect(page.getByTestId("deliverables-board")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
  });

  test("escritório: aba Tarefas e oportunidade contratada com etapas e entregas do creator", async ({ page }) => {
    await loginAs(page, "talent");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    await page.goto("/creator/escritorio/tarefas");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0068 ainda não aplicada");
    await expect(page.getByTestId("office-tasks")).toBeVisible();
    await expect(page.getByTestId("office-tasks")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
    // só etapas do lado do creator: nada da agência (1, 2) nem da marca (5, 8)
    await expect(page.locator('[data-testid="task-item"][data-step="1"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="task-item"][data-step="5"]')).toHaveCount(0);
    await page.goto("/creator/escritorio/oportunidades");
    const opp = page.getByTestId("opportunity-card").filter({ hasText: /inverno/i });
    test.skip((await opp.count()) === 0, "oportunidade em produção da demonstração ainda não semeada");
    await opp.first().click();
    await expect(page.getByTestId("opportunity-detail")).toBeVisible();
    await expect(page.getByTestId("opportunity-terms")).toBeVisible();
    await expect(page.getByTestId("opportunity-tasks")).toBeVisible();
    await expect(page.getByTestId("opportunity-execution")).toBeVisible();
    await expect(page.getByTestId("deliverable-card").first()).toBeVisible();
  });
});
