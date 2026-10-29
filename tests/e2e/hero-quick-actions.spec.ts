import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { actAsHero, actingAvailable, CARD_URL, DEMO_HERO_ID, skipWithoutActing, type HeroCard } from "./helpers/acting";
import { loginAs } from "./helpers/login";

// "Publicar como hero" (0045): só o admin cria e gerencia conteúdo pelos heróis. Os 6 atalhos saíram do
// Perfil do herói e foram para o topo do início do admin; ao tocar, o admin escolhe o herói. O herói fica
// só com o "Novo post". Escolher um herói grava uma linha de auditoria (hero_act.select); nada mais é gravado.

const CARDS: HeroCard[] = ["post", "newContent", "content", "recipes", "links", "dashboard"];

test.describe("admin: Publicar como hero", () => {
  test("6 atalhos no topo do início do admin, alvos de 44 px; o seletor lista os heróis ativos e é acessível", async ({ page }) => {
    await loginAs(page, "admin");
    const section = page.getByTestId("hero-publishing");
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { level: 2, name: "Publicar como hero" })).toBeVisible();
    // logo abaixo do título da página, antes dos indicadores
    const kpis = page.getByRole("heading", { level: 2, name: "Indicadores do período" });
    await expect(kpis).toBeVisible();
    expect((await section.boundingBox())!.y).toBeLessThan((await kpis.boundingBox())!.y);
    for (const card of CARDS) {
      const button = section.getByTestId(`hero-action-${card}`);
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if ((await actingAvailable()) === false) {
      // banco sem a 0045: aviso "indisponível" e atalhos desligados (nada quebra)
      await expect(page.getByTestId("hero-publishing-unavailable")).toBeVisible();
      await expect(section.getByTestId("hero-action-post")).toBeDisabled();
      return;
    }
    await page.waitForLoadState("networkidle");
    await section.getByTestId("hero-action-recipes").click();
    const dialog = page.getByRole("dialog", { name: "Escolha o hero" });
    await expect(dialog).toBeVisible();
    const options = dialog.getByTestId("hero-picker-option");
    expect(await options.count()).toBeGreaterThan(0);
    for (const option of await options.all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(dialog.locator(`[data-hero-id="${DEMO_HERO_ID}"]`)).toBeVisible();
    const results = await new AxeBuilder({ page }).include("[data-testid='hero-picker']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
    // Esc fecha sem escolher
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/admin(\?.*)?$/);
  });

  test("cada atalho leva ao fluxo do herói escolhido, com a faixa Publicando como", async ({ page }) => {
    await skipWithoutActing();
    test.setTimeout(120_000);
    await loginAs(page, "admin");
    for (const card of CARDS) {
      await actAsHero(page, card);
      await expect(page).toHaveURL(CARD_URL[card]);
      await expect(page.getByTestId("acting-hero-name")).not.toBeEmpty();
    }
    // Novo conteúdo: o herói já vem escolhido no editor do admin
    await actAsHero(page, "newContent");
    await expect(page.locator(`select option[value="${DEMO_HERO_ID}"]`)).toHaveJSProperty("selected", true);
  });

  test("Trocar hero volta ao seletor no mesmo atalho, com o último hero marcado como atual", async ({ page }) => {
    await skipWithoutActing();
    await loginAs(page, "admin");
    await actAsHero(page, "links");
    const name = (await page.getByTestId("acting-hero-name").textContent())!.trim();
    await page.getByTestId("acting-hero-switch").click();
    await expect(page).toHaveURL(/\/admin\?heroi=links#publicar-como-hero$/);
    const dialog = page.getByRole("dialog", { name: "Escolha o hero" });
    await expect(dialog).toBeVisible();
    const first = dialog.getByTestId("hero-picker-option").first();
    await expect(first).toHaveAttribute("data-hero-id", DEMO_HERO_ID);
    await expect(first).toContainText(name);
    await expect(first).toContainText("Atual");
    await expect(page.getByTestId("hero-publishing-current")).toContainText(name);
  });
});

test.describe("herói: só o Novo post", () => {
  test("Perfil com um botão Novo post entre o cabeçalho e Editar perfil; nenhum dos outros atalhos", async ({ page }) => {
    await loginAs(page, "creator");
    const button = page.getByTestId("hero-new-post");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/creator/post/new");
    await expect(button).toHaveText("Novo post");
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const header = (await page.getByTestId("profile-hero").boundingBox())!;
    const toggle = (await page.getByRole("button", { name: "Editar perfil", exact: true }).boundingBox())!;
    const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThan(header.y);
    expect(box.y).toBeLessThan(toggle.y);
    await expect(page.getByTestId("hero-quick-actions")).toHaveCount(0);
    await expect(page.locator('[data-testid^="hero-action-"]')).toHaveCount(0);
    for (const href of ["/creator", "/creator/content", "/creator/content/new", "/creator/recipes", "/creator/links"]) {
      await expect(page.locator(`main a[href="${href}"]`)).toHaveCount(0);
    }
    await button.click();
    await expect(page).toHaveURL(/\/creator\/post\/new$/);
  });

  test("as telas de gestão do portal voltam ao Perfil", async ({ page }) => {
    await loginAs(page, "creator");
    for (const path of ["/creator", "/creator/content", "/creator/content/new", "/creator/recipes", "/creator/recipes/new", "/creator/links"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/profile$/);
    }
  });

  test("conta comum não vê o Novo post nem os atalhos", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/profile");
    await expect(page.getByRole("button", { name: "Editar perfil", exact: true })).toBeVisible();
    await expect(page.getByTestId("hero-new-post")).toHaveCount(0);
    await expect(page.getByTestId("hero-quick-actions")).toHaveCount(0);
  });
});
