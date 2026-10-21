import { expect, test } from "@playwright/test";

// Receitas por herói: o botão existe em todo herói e, até concluir a etapa demonstrativa, abre a tela
// de bloqueio. Roda contra o banco remoto (seed: 8 heróis; Helena e Marcos são os chefs das receitas).

const HEROES = ["lia-monteiro", "rafael-duarte", "camila-sato", "helena-vilar", "marcos-ferraz"];

test.describe("receitas do herói", () => {
  for (const slug of HEROES) {
    test(`${slug} tem o botão Receitas`, async ({ page }) => {
      await page.goto(`/personalities/${slug}`);
      await expect(page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Receitas" })).toBeVisible();
    });
  }

  test("visitante vê a tela de bloqueio com 4 passos e os dois botões", async ({ page }) => {
    await page.goto("/personalities/lia-monteiro/receitas");
    const gate = page.getByTestId("recipe-gate");
    await expect(gate).toBeVisible();
    await expect(gate.getByText("Etapa demonstrativa pendente.")).toBeVisible();
    await expect(gate.getByRole("list", { name: /4 passos/ }).getByRole("listitem")).toHaveCount(4);
    await expect(gate.getByRole("link", { name: "Voltar para Hoje" })).toHaveAttribute("href", "/profile");

    await gate.getByTestId("recipe-gate-start").click();
    // A etapa exige conta: o visitante vai ao login e volta para a etapa depois.
    await expect(page).toHaveURL(/\/login\?next=%2Frecipes%2Fonboarding/);
  });

  test("a página de uma receita também fica bloqueada até concluir a etapa", async ({ page }) => {
    await page.goto("/content/molho-de-ervas-em-5-minutos-g3");
    await expect(page.getByTestId("recipe-gate")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Molho de ervas em 5 minutos" })).toBeVisible();
  });
});
