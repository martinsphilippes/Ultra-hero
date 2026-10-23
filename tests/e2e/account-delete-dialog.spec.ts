import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Diálogo "Excluir minha conta" (conta demo premium). Só abre, digita e fecha: o botão de confirmar
// NUNCA é clicado. O Dialog não avisa onOpenChange quando o fechamento vem do próprio estado (useDialog),
// então a palavra digitada precisa ser limpa pelo Cancelar; antes, ao reabrir, "Excluir definitivamente"
// já vinha habilitado com "EXCLUIR" no campo (um toque apagava a conta).

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

test("Cancelar e Escape limpam a confirmação: ao reabrir, campo vazio e exclusão desabilitada", async ({ page }) => {
  await loginAs(page, "premium");
  await page.goto("/profile/account");
  const openButton = page.getByRole("button", { name: "Excluir minha conta" });
  const dialog = page.getByRole("dialog", { name: "Excluir sua conta?" });
  const input = dialog.getByPlaceholder("Digite EXCLUIR");
  const confirm = dialog.getByRole("button", { name: "Excluir definitivamente" });

  await openButton.click();
  await expect(dialog).toBeVisible();
  await expect(confirm).toBeDisabled();
  await input.fill("EXCLUIR");
  await expect(confirm).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();

  await openButton.click();
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(confirm).toBeDisabled();

  // Escape passa pelo onOpenChange(false): também limpa
  await input.fill("EXCLUIR");
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openButton.click();
  await expect(input).toHaveValue("");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});
