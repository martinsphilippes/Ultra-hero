import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Perfil do herói dentro da tela Perfil (/profile): o que ficava em /creator/profile virou a seção
// "Seu perfil de herói", entre a Visão geral e Dados, com uma foto só na página (enviada em Dados).
// SÓ LEITURA: o banco dos E2E é o remoto; nada é salvo aqui.

test.describe("perfil do herói no /profile", () => {
  test("herói: a seção fica depois da Visão geral e antes de Dados, com tudo do perfil público", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/profile");

    const hero = page.getByTestId("profile-hero");
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { level: 2, name: "Seu perfil de herói" })).toBeVisible();

    // ordem: Visão geral (com "Sair da conta") → Seu perfil de herói → Dados
    const order = await page.evaluate(() => {
      const section = document.getElementById("perfil-publico");
      return {
        afterOverview: Boolean(section?.previousElementSibling?.querySelector('form[action="/auth/signout"]')),
        next: section?.nextElementSibling?.id ?? null,
      };
    });
    expect(order).toEqual({ afterOverview: true, next: "dados" });

    // cabeçalho do perfil público, formulário, perfil de chef e nota de direitos
    await expect(hero.getByText("Personagem fictício").first()).toBeVisible();
    await expect(hero.getByRole("link", { name: "Ver página pública" })).toHaveAttribute("href", /^\/personalities\//);
    await expect(hero.getByLabel("Headline")).toBeVisible();
    await expect(hero.getByLabel("Bio")).toBeVisible();
    await expect(hero.getByRole("radiogroup", { name: "Avatar da página pública (ilustração)" })).toBeVisible();
    await expect(hero.getByRole("radiogroup", { name: "Capa" })).toBeVisible();
    await expect(hero.getByRole("group", { name: "Redes (texto simples)" })).toBeVisible();
    await expect(hero.getByLabel("Instagram")).toBeVisible();
    await expect(hero.getByTestId("chef-profile")).toBeVisible();
    await expect(hero.getByRole("heading", { level: 3, name: "Especialidades e credenciais" })).toBeVisible();
    await expect(hero.getByRole("heading", { level: 3, name: "Nota de direitos e licenças" })).toBeVisible();
    await expect(hero.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();

    // uma foto só na página: o seletor fica em Dados e o perfil do herói aponta para lá
    await expect(hero.getByTestId("avatar-photo")).toHaveCount(0);
    await expect(page.getByTestId("avatar-photo")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Tirar foto" })).toHaveCount(1);
    await expect(page.locator("#dados").getByTestId("avatar-photo")).toContainText("aparece no seu avatar e na sua página pública de herói");
    const toData = hero.getByTestId("profile-hero-photo-note").getByRole("link", { name: "Dados" });
    await expect(toData).toHaveAttribute("href", "#dados");
    // a nota fica no lugar do envio de foto e descreve o grupo do avatar público (leitor de tela ouve)
    const heroAvatars = hero.getByRole("radiogroup", { name: "Avatar da página pública (ilustração)" });
    await expect(heroAvatars).toHaveAccessibleDescription(/A foto da sua página pública é a mesma do app/);
    const gap = await page.evaluate(() => {
      const note = document.querySelector("[data-testid='profile-hero-photo-note']")!.getBoundingClientRect();
      const group = document.querySelector("#perfil-publico [role='radiogroup']")!.getBoundingClientRect();
      return group.top - note.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(80);
    // em Dados, a ilustração vale só no app (a pública fica no perfil de herói)
    await expect(page.locator("#dados").getByRole("radiogroup", { name: "Ilustrações" })).toHaveAccessibleDescription(
      "Vale só para o avatar do app. A ilustração da página pública fica em Seu perfil de herói.",
    );

    // ids únicos com os dois formulários juntos (avatar-1, theme-label, avatar-illustrations-label…)
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll("[id]"))) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      return Array.from(seen).filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);

    // celular primeiro: sem rolagem horizontal e alvos de toque >= 44 px
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const target of [toData, hero.getByRole("link", { name: "Ver página pública" }), hero.getByRole("button", { name: "Salvar", exact: true })]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include("[data-testid='profile-hero']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    // foco visível no link e o link leva à seção Dados
    await toData.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(toData).toBeFocused();
    expect(await toData.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/profile#dados$/);
    await expect(page.locator("#dados")).toBeInViewport();
  });

  test("o endereço antigo /creator/profile leva à seção no /profile", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/creator/profile");
    await expect(page).toHaveURL(/\/profile#perfil-publico$/);
    await expect(page.getByTestId("profile-hero")).toBeVisible();
  });

  test("o painel do herói não tem mais o cartão nem o item de menu Meu perfil", async ({ page }) => {
    await loginAs(page, "creator");
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: /Vínculos de produtos/ }).first()).toBeVisible();
    await expect(main.getByText("Meu perfil")).toHaveCount(0);
    await expect(page.locator('a[href="/creator/profile"]')).toHaveCount(0);
    const menuButton = page.getByRole("button", { name: "Abrir menu" });
    if (await menuButton.isVisible()) await menuButton.click();
    const nav = page.getByRole("navigation", { name: "Portal" }).filter({ visible: true }).first();
    await expect(nav.getByRole("link", { name: "Vínculos de produtos" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Meu perfil" })).toHaveCount(0);
  });

  test("conta comum não vê a seção do herói", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/profile");
    await expect(page.locator("#dados")).toBeVisible();
    await expect(page.getByTestId("profile-hero")).toHaveCount(0);
    await expect(page.locator("#perfil-publico")).toHaveCount(0);
    await expect(page.locator("#dados").getByTestId("avatar-photo")).not.toContainText("página pública de herói");
    await expect(page.getByTestId("avatar-illustrations-app-only")).toHaveCount(0);
  });
});
