import { expect, test } from "@playwright/test";

// Receitas por herói: o atalho Alimentação (antes "Receitas") existe em todo herói; os cards ficam abertos e abrir a receita pede a
// etapa demonstrativa (P2). Roda contra o banco remoto (0044: 6 heróis reais; Érick Jacquin é o chef das receitas no ar).

const HEROES = ["anitta", "ronaldinho-gaucho", "joao-fonseca", "erick-jacquin", "neymar", "gabriel-medina"];

test.describe("receitas do herói", () => {
  for (const slug of HEROES) {
    test(`${slug} tem o atalho Alimentação`, async ({ page }) => {
      await page.goto(`/personalities/${slug}`);
      await expect(page.getByTestId("hero-libraries").getByRole("link").filter({ hasText: "Alimentação" })).toBeVisible();
    });
  }

  // P2 (fase 3): a biblioteca não troca mais a lista pela tela de bloqueio; os cards ficam abertos e
  // uma faixa convida para a etapa, que continua exigindo conta.
  test("visitante vê os cards da biblioteca e a faixa da etapa, que leva ao login", async ({ page }) => {
    await page.goto("/personalities/anitta/alimentacao");
    await expect(page.getByTestId("recipe-gate")).toHaveCount(0);
    await expect(page.getByTestId("recipe-card").first()).toBeVisible();
    const invite = page.getByTestId("recipe-invite");
    await expect(invite).toContainText("4 passos");
    await invite.getByTestId("recipe-invite-start").click();
    await expect(page).toHaveURL(/\/login\?next=%2Frecipes%2Fonboarding/);
  });

  test("a página de uma receita fica bloqueada até concluir a etapa (com os 4 passos e os dois botões)", async ({ page }) => {
    await page.goto("/content/molho-de-ervas-em-5-minutos-g3");
    const gate = page.getByTestId("recipe-gate");
    await expect(gate).toBeVisible();
    await expect(gate.getByText("Etapa demonstrativa pendente.")).toBeVisible();
    await expect(gate.getByRole("list", { name: /4 passos/ }).getByRole("listitem")).toHaveCount(4);
    await expect(gate.getByRole("link", { name: "Voltar para Hoje" })).toHaveAttribute("href", "/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Molho de ervas em 5 minutos" })).toBeVisible();
  });
});
