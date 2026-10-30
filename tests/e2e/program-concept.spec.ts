import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Seção "Conceito do programa" (0048), logo abaixo do cabeçalho e antes dos conteúdos. Roda contra o
// banco remoto: sem a 0048 a seção mostra a descrição antiga (queda); com ela, o conceito completo.
// Cada teste pula o ramo que o banco não tem, então a suíte passa com e sem a migração.

const PROGRAM = "/programs/manhas-com-intencao";
const TRANSLATED = "/programs/noites-que-descansam";

const section = (page: Page) => page.getByTestId("program-concept");

async function conceptKind(page: Page): Promise<string | null> {
  await expect(section(page)).toBeVisible();
  return section(page).getAttribute("data-concept");
}

test.describe("conceito do programa", () => {
  test("seção fica entre o cabeçalho e os conteúdos, sem o parágrafo antigo no rodapé", async ({ page }) => {
    await page.goto(PROGRAM);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Manhãs com Intenção");
    const heading = page.getByRole("heading", { level: 2, name: "Conceito do programa" });
    await expect(heading).toBeVisible();
    const contents = page.getByRole("heading", { level: 2, name: "Conteúdos do programa" });
    const [h1Box, conceptBox, contentsBox] = await Promise.all([
      page.getByRole("heading", { level: 1 }).boundingBox(),
      heading.boundingBox(),
      contents.boundingBox(),
    ]);
    expect(conceptBox!.y).toBeGreaterThan(h1Box!.y);
    expect(contentsBox!.y).toBeGreaterThan(conceptBox!.y);
    await expect(page.getByRole("heading", { name: "Sobre o programa" })).toHaveCount(0);
    // sem rolagem horizontal no celular
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("com a 0048: ideia, públicos, 3 conquistas, etapas numeradas, ritmo, itens e cuidados", async ({ page }) => {
    await page.goto(PROGRAM);
    test.skip((await conceptKind(page)) !== "concept", "banco sem a 0048: a seção cai para a descrição");
    const s = section(page);
    await expect(s.getByTestId("program-concept-idea")).toContainText("dez minutos");
    await expect(s.getByRole("heading", { level: 3, name: "Para quem é" })).toBeVisible();
    await expect(s.getByText("Não é para:")).toBeVisible();
    const outcomes = s.locator("h3", { hasText: "O que você vai conquistar" }).locator("xpath=..").getByRole("listitem");
    await expect(outcomes).toHaveCount(3);
    const steps = s.locator("h3", { hasText: "Como funciona" }).locator("xpath=..").getByRole("listitem");
    expect(await steps.count()).toBeGreaterThanOrEqual(3);
    await expect(s.getByText("1 semana")).toBeVisible();
    await expect(s.getByText("7× por semana")).toBeVisible();
    await expect(s.getByText("~10 min por dia")).toBeVisible();
    await expect(s.getByRole("heading", { level: 3, name: "Você vai precisar" })).toBeVisible();
    await expect(s.getByRole("note", { name: "Cuidados" })).toContainText("Conteúdo educativo");

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include('[data-testid="program-concept"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, help: v.help })), null, 2)).toEqual([]);
  });

  test("com a 0048: tradução publicada em inglês traz o conceito em inglês", async ({ page }) => {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL(TRANSLATED, test.info().project.use.baseURL ?? "http://localhost:3100").toString() }]);
    await page.goto(TRANSLATED);
    test.skip((await conceptKind(page)) !== "concept", "banco sem a 0048");
    await expect(page.getByRole("heading", { level: 2, name: "Program concept" })).toBeVisible();
    await expect(section(page).getByTestId("program-concept-idea")).toContainText("rigid sleep rules");
  });

  test("sem a 0048: a seção mostra a descrição como queda", async ({ page }) => {
    await page.goto(PROGRAM);
    test.skip((await conceptKind(page)) !== "description", "banco com a 0048: o conceito substitui a descrição");
    await expect(section(page)).toContainText("Conteúdo educativo; não substitui orientação profissional.");
    await expect(section(page).getByTestId("program-concept-idea")).toHaveCount(0);
  });
});
