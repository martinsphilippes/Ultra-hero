import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Gestão, Etapa A (0064): portais /agencia e /marca protegidos no servidor, hierarquia no menu e nas
// rotas, conta demo do admin sem nada da agência real, bloqueio no app das lojas. Só leitura: as
// escritas são cobertas pela suíte RLS (S74). Sem a 0064 no banco, as telas mostram "Módulo em
// atualização" e os testes que dependem dela se pulam.

const NATIVE_UA = "Mozilla/5.0 (Linux; Android 14) GCHeroApp/1.0.0 (android)";

test.describe("portais de gestão", () => {
  test("visitante vai ao login ao abrir /agencia e /marca", async ({ page }) => {
    await page.goto("/agencia");
    await expect(page).toHaveURL(/\/login\?next=%2Fagencia/);
    await page.goto("/marca/equipe");
    await expect(page).toHaveURL(/\/login\?next=%2Fmarca%2Fequipe/);
  });

  test("consumidor sem papel não entra nos portais", async ({ page }) => {
    await loginAs(page, "free", { home: null });
    await page.goto("/agencia");
    await expect(page).not.toHaveURL(/\/agencia/, { timeout: 20_000 });
    await page.goto("/marca");
    await expect(page).not.toHaveURL(/\/marca$/, { timeout: 20_000 });
  });

  test("admin de demonstração não vê nada da agência real", async ({ page }) => {
    await loginAs(page, "admin", { home: null });
    await page.goto("/agencia");
    // sem a 0064: módulo em atualização; com ela: indisponível para conta de demonstração
    await expect(page.getByTestId("module-unavailable").or(page.getByTestId("module-demo_forbidden"))).toBeVisible();
    await expect(page.getByTestId("agency-kpis")).toHaveCount(0);
    await page.goto("/admin/agencia");
    await expect(page.getByTestId("module-unavailable").or(page.getByTestId("admin-agency-demo-forbidden"))).toBeVisible();
  });

  test("app das lojas: /agencia e /marca não abrem", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, userAgent: NATIVE_UA, locale: "pt-BR" });
    const page = await context.newPage();
    for (const path of ["/agencia", "/marca"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
    }
    await context.close();
  });

  test("Adm da agência de demonstração: Início, Equipe com os níveis e sem rolagem lateral a 390 px", async ({ page }) => {
    await loginAs(page, "agency");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0064 ainda não aplicada");
    await expect(page.getByTestId("agency-kpis")).toBeVisible();
    await expect(page.getByTestId("agency-demo-banner")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.goto("/agencia/equipe");
    await expect(page).toHaveURL(/\/agencia\/equipe$/);
    await expect(page.getByTestId("team-list")).toBeVisible();
    // agência de demonstração: equipe fixa, sem convite
    await expect(page.getByTestId("invite-open")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("colaborador não abre Equipe nem Configurações (volta ao Início, no servidor)", async ({ page }) => {
    await loginAs(page, "agencyStaff");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0064 ainda não aplicada");
    await page.goto("/agencia/equipe");
    await expect(page).toHaveURL(/\/agencia$/, { timeout: 20_000 });
    await page.goto("/agencia/configuracoes");
    await expect(page).toHaveURL(/\/agencia$/, { timeout: 20_000 });
    await expect(page.locator('a[href="/agencia/equipe"]')).toHaveCount(0);
  });

  test("dono da marca: Início com a agência que atende e a equipe da marca", async ({ page }) => {
    await loginAs(page, "brand");
    test.skip((await page.getByTestId("module-unavailable").count()) > 0, "0064 ainda não aplicada");
    await expect(page.getByTestId("brand-inbox-note")).toBeVisible();
    await page.goto("/marca/equipe");
    await expect(page.getByTestId("brand-team")).toBeVisible();
    await page.goto("/agencia");
    await expect(page).not.toHaveURL(/\/agencia/, { timeout: 20_000 });
  });
});
