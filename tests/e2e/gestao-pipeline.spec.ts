import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Gestão, P1a (0066): pipeline da agência, ficha do negócio com abas, catálogo e campanhas da marca
// (sem valores para quem não deve ver), oportunidades e disponibilidade no escritório. Só leitura: nada
// é enviado, consultado ou confirmado (as escritas são cobertas pela suíte RLS, S76). Sem a 0066 no
// banco, as telas mostram "em atualização" e os testes se pulam; sem a demonstração restaurada, idem.

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

test.describe("pipeline, proposta e oportunidades", () => {
  test("Adm da agência: pipeline com o negócio de demonstração e ficha com abas (cachê só para o Adm)", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/pipeline");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    await expect(page.getByTestId("pipeline-filters")).toBeVisible();
    const card = page.getByTestId("deal-card");
    test.skip((await card.count()) === 0, "negócio de demonstração ainda não semeado");
    await noHorizontalScroll(page);
    await axe(page);
    await card.first().click();
    await expect(page).toHaveURL(/\/agencia\/negocios\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("deal-page")).toBeVisible();
    await expect(page.getByTestId("deal-form")).toBeVisible();
    await expect(page.getByTestId("request-summary")).toBeVisible();
    const base = page.url();
    await page.goto(`${base}/creators`);
    await expect(page.getByTestId("shortlist-panel")).toBeVisible();
    await expect(page.getByTestId("deal-talent").first()).toBeVisible();
    // o Adm vê o cachê definido na demonstração
    await expect(page.getByTestId("deal-fee").first()).toContainText("R$");
    await page.goto(`${base}/conversa`);
    await expect(page.getByTestId("thread-brand_agency")).toBeVisible();
    await page.goto(`${base}/entregas`);
    await expect(page.getByTestId("deliverables-editor")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
  });

  test("colaborador: pipeline sem Novo negócio e sem cachê na ficha", async ({ page }) => {
    await loginAs(page, "agencyStaff", { home: null });
    await page.goto("/agencia/pipeline");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    await expect(page.getByRole("link", { name: /Novo negócio/ })).toHaveCount(0);
    await page.goto("/agencia/pipeline/novo");
    await expect(page).toHaveURL(/\/agencia$/, { timeout: 20_000 });
    const card = page.getByTestId("deal-card");
    test.skip((await card.count()) === 0, "colaborador sem negócio atribuído");
    await card.first().click();
    await page.goto(`${page.url()}/creators`);
    await expect(page.getByTestId("shortlist-panel")).toBeVisible();
    await expect(page.getByTestId("deal-fee")).toHaveCount(0);
    await expect(page.getByTestId("shortlist-panel")).not.toContainText("R$");
  });

  test("marca: catálogo autorizado sem valores, detalhe com disponibilidade e campanha com andamento", async ({ page }) => {
    await loginAs(page, "brand", { home: null });
    await page.goto("/marca/creators");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    await expect(page.getByTestId("catalog-filters")).toBeVisible();
    const cards = page.getByTestId("catalog-card");
    test.skip((await cards.count()) === 0, "catálogo de demonstração ainda não liberado");
    await expect(page.getByTestId("catalog-list")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
    await cards.first().click();
    await expect(page).toHaveURL(/\/marca\/creators\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("catalog-detail")).toBeVisible();
    await expect(page.getByTestId("catalog-availability")).toBeVisible();
    await expect(page.getByTestId("catalog-detail")).not.toContainText("R$");
    await expect(page.getByTestId("propose-to-creator")).toBeVisible();
    await page.goto("/marca/campanhas");
    const campaign = page.getByTestId("campaign-list").getByRole("link");
    test.skip((await campaign.count()) === 0, "campanha de demonstração ainda não semeada");
    await campaign.first().click();
    await expect(page.getByTestId("campaign-detail")).toBeVisible();
    await expect(page.getByTestId("campaign-steps")).toBeVisible();
    await expect(page.getByTestId("brand-status-badge").first()).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
    // nova proposta abre o formulário em 5 blocos sem enviar nada
    await page.goto("/marca/campanhas/nova");
    await expect(page.getByTestId("campaign-form")).toBeVisible();
    await expect(page.getByTestId("campaign-submit")).toBeVisible();
  });

  test("escritório: oportunidades com a consulta de demonstração e disponibilidade declarável", async ({ page }) => {
    await loginAs(page, "talent");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    await page.goto("/creator/escritorio/oportunidades");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0066 ainda não aplicada");
    await expect(page.getByTestId("opportunities")).toBeVisible();
    const card = page.getByTestId("opportunity-card");
    test.skip((await card.count()) === 0, "oportunidade de demonstração ainda não semeada");
    await noHorizontalScroll(page);
    await axe(page);
    await card.first().click();
    await expect(page.getByTestId("opportunity-detail")).toBeVisible();
    await expect(page.getByTestId("opportunity-respond")).toBeVisible();
    await expect(page.getByTestId("thread-talent_agency")).toBeVisible();
    await page.goto("/creator/escritorio/disponibilidade");
    await expect(page.getByTestId("availability-editor")).toBeVisible();
    await expect(page.getByTestId("availability-add")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
  });
});
