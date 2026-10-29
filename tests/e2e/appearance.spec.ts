import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Aparência: 5 templates visuais escolhidos na Início. Só visual: a troca muda o atributo data-template do
// <html> na hora, sem recarregar, e fica salva no aparelho (cookie + localStorage). Nada aqui grava no banco.
const TEMPLATES = ["original", "impact", "essential", "performance", "urban"] as const;
// Fundo da página no claro de cada template (confirma que o visual mudou de fato).
const LIGHT_BG: Record<(typeof TEMPLATES)[number], string> = {
  original: "rgb(247, 244, 239)",
  impact: "rgb(255, 255, 255)",
  essential: "rgb(245, 241, 234)",
  performance: "rgb(238, 240, 243)",
  urban: "rgb(237, 237, 237)",
};

const html = (page: Page) => page.locator("html");
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("Aparência", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "free");
  });

  test("troca os 5 templates na hora, sem recarregar, com o painel aberto e o ativo destacado; a escolha persiste", async ({ page, browser }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(html(page)).toHaveAttribute("data-template", "original");
    expect(await bodyBg(page)).toBe(LIGHT_BG.original);

    // marcador em memória + rolagem: somem se a página recarregar ou remontar
    await page.evaluate(() => {
      (window as unknown as { __uhMarker: number }).__uhMarker = 42;
      window.scrollTo(0, 700);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    const button = page.getByTestId("appearance-button");
    await expect(button).toHaveAccessibleName("Aparência");
    await button.click();
    const panel = page.getByTestId("appearance-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("appearance-option-original")).toHaveAttribute("data-active", "true");
    for (const id of TEMPLATES) await expect(page.getByTestId(`appearance-option-${id}`)).toBeVisible();

    for (const id of [...TEMPLATES.slice(1), "original", "urban"] as const) {
      await page.getByTestId(`appearance-option-${id}`).click();
      await expect(html(page)).toHaveAttribute("data-template", id);
      await expect(page.getByTestId(`appearance-option-${id}`)).toHaveAttribute("data-active", "true");
      await expect(page.getByTestId(`appearance-option-${id}`).getByRole("radio")).toBeChecked();
      await expect(page.locator('[data-testid^="appearance-option-"][data-active]')).toHaveCount(1);
      await expect(panel).toBeVisible();
      expect(await bodyBg(page)).toBe(LIGHT_BG[id]);
      expect(await page.evaluate(() => (window as unknown as { __uhMarker?: number }).__uhMarker)).toBe(42);
    }

    await page.getByTestId("appearance-close").click();
    await expect(panel).toBeHidden();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(5);
    expect(await page.evaluate(() => (window as unknown as { __uhMarker?: number }).__uhMarker)).toBe(42);

    // persistência: recarregar, nova aba e novo contexto com o mesmo armazenamento
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-template", "urban");
    expect(await page.evaluate(() => localStorage.getItem("uh-template"))).toBe("urban");
    const tab = await page.context().newPage();
    await tab.goto("/explore");
    await expect(html(tab)).toHaveAttribute("data-template", "urban");
    await tab.close();
    const state = await page.context().storageState();
    const other = await browser.newContext({ storageState: state, locale: "pt-BR" });
    const otherPage = await other.newPage();
    await otherPage.goto(new URL("/profile", page.url()).toString());
    await expect(html(otherPage)).toHaveAttribute("data-template", "urban");
    await other.close();

    // volta ao Original
    await page.getByTestId("appearance-button").click();
    await page.getByTestId("appearance-option-original").click();
    await expect(html(page)).toHaveAttribute("data-template", "original");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-template", "original");
    expect(await bodyBg(page)).toBe(LIGHT_BG.original);
  });

  test("preferência inválida no armazenamento cai no Original; cookie inválido não esconde o localStorage válido", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("uh-template", "nike");
      document.cookie = "uh-template=%3Cscript%3E; path=/";
    });
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-template", "original");
    expect(await bodyBg(page)).toBe(LIGHT_BG.original);

    await page.evaluate(() => localStorage.setItem("uh-template", "essential"));
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-template", "essential");
  });

  test("a troca não apaga o que foi digitado num formulário aberto (busca do Explorar em outra aba)", async ({ page }) => {
    await page.goto("/explore");
    const search = page.getByRole("searchbox").or(page.getByRole("textbox")).first();
    await search.fill("mobilidade");
    await page.evaluate(() => ((window as unknown as { __uhMarker: number }).__uhMarker = 7));

    // escolhe na Início, em outra aba do mesmo aparelho; a aba do Explorar acompanha sem recarregar
    const home = await page.context().newPage();
    await home.goto("/");
    await home.getByTestId("appearance-button").click();
    await home.getByTestId("appearance-option-performance").click();
    await expect(html(home)).toHaveAttribute("data-template", "performance");

    await expect(html(page)).toHaveAttribute("data-template", "performance");
    await expect(search).toHaveValue("mobilidade");
    expect(await page.evaluate(() => (window as unknown as { __uhMarker?: number }).__uhMarker)).toBe(7);
    expect(await bodyBg(page)).toBe(LIGHT_BG.performance);
    await home.close();
  });

  for (const id of TEMPLATES) {
    test(`${id}: axe sem violações sérias e sem rolagem horizontal em 390px (Início, Explorar, conteúdo, /profile)`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "varredura feita no celular");
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.context().addCookies([{ name: "uh-template", value: id, url: new URL("/", page.url()).toString() }]);
      await page.goto("/explore");
      const content = await page.locator('main a[href^="/content/"]').first().getAttribute("href");
      expect(content).toBeTruthy();
      for (const route of ["/", "/explore", content!, "/profile"]) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expect(html(page)).toHaveAttribute("data-template", id);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${id} ${route}: rolagem horizontal`).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious, `${id} ${route}: ${JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target).slice(0, 5), help: v.help })), null, 2)}`).toEqual([]);
      }
    });
  }
});
