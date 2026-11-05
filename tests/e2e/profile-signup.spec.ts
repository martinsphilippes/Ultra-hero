import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// 0103: a primeira página pergunta "Como você vai usar o Ultra?" (Hero, Marca, Agência ou só o app). Os testes
// comuns não criam conta (passam em qualquer ambiente); o cadastro de verdade fica nos cenários de RLS (S109).

test.describe("entrada por perfil", () => {
  test("quatro cartões grandes, 'Já tenho conta' embaixo e axe limpo", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Como você vai usar o Ultra?" })).toBeVisible();
    const chooser = page.getByTestId("profile-chooser");
    for (const [kind, title] of [
      ["hero", "Hero"],
      ["brand", "Marca"],
      ["agency", "Agência"],
      ["consumer", "Só quero usar o app"],
    ] as const) {
      const card = chooser.getByTestId(`profile-card-${kind}`);
      await expect(card).toContainText(title);
      expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    }
    // entrar com conta existente continua igual (Google e senha)
    await expect(page.getByRole("button", { name: "Continuar com Google" })).toBeVisible();
    await expect(page.getByTestId("have-password").locator("summary")).toContainText("Já tenho conta");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual([]);
  });

  test("Marca: cadastro com senha, passo 1 de 2, validação sem criar conta e trocar perfil", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("profile-card-brand").click();
    await expect(page).toHaveURL(/\/login\?perfil=marca$/);
    await expect(page.getByRole("heading", { level: 1, name: "Conta de Marca" })).toBeVisible();
    const form = page.getByTestId("profile-signup");
    await expect(form.getByLabel("Senha")).toHaveAttribute("type", "password");
    await form.getByLabel("Senha").fill("123");
    await form.getByRole("button", { name: "Criar conta e continuar" }).click();
    await expect(form.getByText("A senha precisa ter pelo menos 8 caracteres.")).toBeVisible();
    await expect(page).toHaveURL(/\/login\?perfil=marca/);
    await page.getByTestId("profile-change").click();
    await expect(page.getByTestId("profile-chooser")).toBeVisible();
  });

  test("/comecar/<perfil> sem sessão leva à entrada já com o perfil", async ({ page }) => {
    await page.goto("/comecar/agencia");
    await expect(page).toHaveURL(/\/login\?perfil=agencia$/);
    await expect(page.getByRole("heading", { level: 1, name: "Conta de Agência" })).toBeVisible();
  });
});
