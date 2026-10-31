import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Gestão, Etapa B (0065): casting da agência, ficha com "dados de … · declarado por …", colaborador sem
// edição, /kit inválido com 404 e noindex, escritório do talento (sem "Gerar link" na agência demo).
// Só leitura: nada é enviado, gerado ou salvo (as escritas são cobertas pela suíte RLS, S75). Sem a
// 0065 no banco, as telas mostram "em atualização" e os testes se pulam.

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

test.describe("casting e media kit", () => {
  test("/kit com token inválido: página indisponível, 404 e fora dos buscadores", async ({ page }) => {
    const response = await page.goto(`/kit/${"0".repeat(64)}`);
    expect(response?.status()).toBe(404);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.getByTestId("kit-unavailable")).toBeVisible();
    for (const meta of await page.locator('meta[name="robots"]').all()) await expect(meta).toHaveAttribute("content", /noindex/);
    const bad = await page.goto("/kit/token-invalido");
    expect(bad?.status()).toBe(404);
  });

  test("Adm da agência de demonstração: lista, ficha, redes declaradas e kit só com prévia", async ({ page }) => {
    await loginAs(page, "agency", { home: null });
    await page.goto("/agencia/casting");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    await expect(page.getByTestId("casting-filters")).toBeVisible();
    const list = page.getByTestId("casting-list");
    test.skip((await list.count()) === 0, "casting de demonstração ainda não semeado");
    await noHorizontalScroll(page);
    await axe(page);
    await list.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/agencia\/casting\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("talent-form")).toBeVisible();
    await page.goto(`${page.url()}/redes`);
    await expect(page.getByTestId("social-editor")).toBeVisible();
    // toda métrica com data e quem declarou (critério 2)
    await expect(page.getByTestId("metric-source").first()).toContainText(/dados de \d{2}\/\d{2}\/\d{4} · declarado por/);
    await page.goto(page.url().replace(/\/redes$/, "/media-kit"));
    await expect(page.getByTestId("kit-preview")).toBeVisible();
    await expect(page.getByTestId("kit-share-locked")).toBeVisible();
    await expect(page.getByTestId("kit-generate")).toHaveCount(0);
    await expect(page.getByTestId("kit-preview")).not.toContainText("R$");
    await noHorizontalScroll(page);
    await axe(page);
  });

  test("colaborador consulta o casting sem botões de edição", async ({ page }) => {
    await loginAs(page, "agencyStaff", { home: null });
    await page.goto("/agencia/casting");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    const list = page.getByTestId("casting-list");
    test.skip((await list.count()) === 0, "casting de demonstração ainda não semeado");
    await expect(page.getByRole("link", { name: /Novo talento/ })).toHaveCount(0);
    await list.getByRole("link").first().click();
    await expect(page.getByTestId("talent-form")).toBeVisible();
    await expect(page.getByTestId("talent-save")).toHaveCount(0);
    await page.goto("/agencia/casting/novo");
    await expect(page).toHaveURL(/\/agencia$/, { timeout: 20_000 });
  });

  test("escritório do talento: Início e Media kit sem link público na agência demo", async ({ page }) => {
    await loginAs(page, "talent");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0065 ainda não aplicada");
    await expect(page.getByTestId("office")).toBeVisible();
    await expect(page.getByTestId("office-kit-status")).toBeVisible();
    await noHorizontalScroll(page);
    await axe(page);
    await page.goto("/creator/escritorio/media-kit");
    await expect(page.getByTestId("kit-editor")).toBeVisible();
    await expect(page.getByTestId("kit-share-locked")).toBeVisible();
    await expect(page.getByTestId("kit-generate")).toHaveCount(0);
    await page.goto("/creator/escritorio/consentimento");
    await expect(page.getByTestId("consent-card")).toBeVisible();
    // talento sem página pública: /creator leva ao escritório e o Novo post explica que é só de herói
    await page.goto("/creator");
    await expect(page).toHaveURL(/\/creator\/escritorio$/, { timeout: 20_000 });
    await page.goto("/creator/post/new");
    await expect(page.getByTestId("post-talent-only")).toBeVisible();
  });

  test("consumidor não tem escritório", async ({ page }) => {
    await loginAs(page, "free", { home: null });
    await page.goto("/creator/escritorio");
    await expect(page).not.toHaveURL(/\/creator\/escritorio$/, { timeout: 20_000 });
  });
});
