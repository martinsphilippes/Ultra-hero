import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// O menu "Mais opções" (Não tenho interesse) abre inteiro dentro da tela, também quando o botão fica
// perto da borda esquerda no celular. Só abre e fecha o menu: nada é gravado.
test("menu Mais opções da página de conteúdo cabe na tela", async ({ page }) => {
  await loginAs(page, "free");
  await page.goto("/content/bowl-de-frango-grelhado-com-legumes-assados-g1");
  const trigger = page.locator('main [aria-haspopup="menu"]').first();
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});
