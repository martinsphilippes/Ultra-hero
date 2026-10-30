import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Indicadores (Etapa 5, 0060): /admin/indicadores com seções e período na URL, CSV por seção e o
// contador de aberturas de atalho. Só leitura: nada é gravado (o cookie uh-e2e=1 desliga o contador).
// Sem a 0060 no banco, a página mostra "Sem dados ainda" e as partes que dependem dela se pulam.

const SECTIONS = ["herois", "atalhos", "conversao", "profissionais", "colecionaveis", "ranking"] as const;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

async function expectNoSeriousAxe(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
}

test.describe("indicadores (admin)", () => {
  test("menu leva aos Indicadores; Métricas continua", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/metrics");
    await expect(page.locator('a[href="/admin/metrics"]').first()).toBeAttached();
    const link = page.locator('a[href="/admin/indicadores"]').first();
    await expect(link).toBeAttached();
    await expect(link).toContainText("Indicadores");
  });

  test("seções e período na URL; CSV por seção; sem dados vira 'Sem dados ainda'", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/indicadores");
    await expect(page.getByTestId("indicators-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Indicadores" })).toBeVisible();
    await expect(page.getByText("nenhuma pessoa aparece aqui")).toBeVisible();
    // padrão: Por herói, 30 dias
    await expect(page.getByTestId("indicator-tab-herois")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("radio", { name: "30 dias" })).toHaveAttribute("aria-checked", "true");

    // período 7 dias vai para a URL e fica ao trocar de seção
    await page.getByRole("radio", { name: "7 dias" }).click();
    await expect(page).toHaveURL(/days=7/);
    await page.getByTestId("indicator-tab-atalhos").click();
    await expect(page).toHaveURL(/secao=atalhos&days=7/);
    await expect(page.getByTestId("indicators-page")).toHaveAttribute("data-section", "atalhos");

    await expectNoSeriousAxe(page);
    const missing = await page.getByTestId("indicators-missing").count();
    if (missing > 0) {
      await expect(page.getByTestId("indicators-missing")).toContainText("Sem dados ainda");
      await expect(page.getByTestId("indicators-export")).toHaveCount(0);
      test.skip(true, "banco sem a 0060: indicadores mostram 'Sem dados ainda'");
    }

    for (const section of SECTIONS) {
      await page.goto(`/admin/indicadores?secao=${section}&days=90`);
      await expect(page.getByTestId("indicators-page")).toHaveAttribute("data-section", section);
      await expect(page.getByTestId("indicator-block").first()).toBeVisible();
      const href = await page.getByTestId("indicators-export").getAttribute("href");
      expect(href).toBe(`/admin/indicadores/export?secao=${section}&days=90`);
      const res = await page.request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/csv");
      expect(res.headers()["content-disposition"]).toContain(`indicadores-${section}-90d`);
      const body = await res.text();
      expect(body.split("\n")[0]).toBe("block,key,label,metric,value");
      // só agregados: nada de e-mail no CSV
      expect(body).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    }
    await expectNoSeriousAxe(page);
  });

  test("CSV e página são só do admin", async ({ page }) => {
    const res = await page.request.get("/admin/indicadores/export?secao=herois&days=7", { maxRedirects: 0 });
    expect([302, 303, 307, 308, 403]).toContain(res.status());
    await page.goto("/admin/indicadores");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("contador de atalhos", () => {
  test("abrir um atalho do herói avisa o contador (204), sem esperar; corpo inválido também 204", async ({ page }) => {
    const beacon = page.waitForResponse((r) => r.url().endsWith("/api/shortcut-opens") && r.request().method() === "POST", { timeout: 15_000 });
    await page.goto("/personalities/erick-jacquin/alimentacao");
    expect((await beacon).status()).toBe(204);
    // o navegador do E2E (uh-e2e=1) nunca grava; lixo é ignorado em silêncio
    const res = await page.request.post("/api/shortcut-opens", { data: { creatorId: "nao-uuid", sourceKey: "rotina", email: "x@y.z" } });
    expect(res.status()).toBe(204);
  });
});
