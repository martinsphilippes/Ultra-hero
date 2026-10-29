import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Atalhos do Portal do herói no Perfil, perto de "Editar perfil". Só leitura.
const ACTIONS: Array<[string, string]> = [
  ["post", "/creator/post/new"],
  ["newContent", "/creator/content/new"],
  ["content", "/creator/content"],
  ["recipes", "/creator/recipes"],
  ["links", "/creator/links"],
  ["dashboard", "/creator"],
];

test("herói: 6 atalhos do portal entre o cabeçalho e Editar perfil, alvos de 44 px", async ({ page }) => {
  await loginAs(page, "creator");
  await page.goto("/profile");
  const nav = page.getByTestId("hero-quick-actions");
  await expect(nav).toBeVisible();
  for (const [key, href] of ACTIONS) {
    const link = nav.getByTestId(`hero-action-${key}`);
    await expect(link).toHaveAttribute("href", href);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const portal = (await page.getByTestId("profile-hero").boundingBox())!;
  const toggle = (await page.getByRole("button", { name: "Editar perfil", exact: true }).boundingBox())!;
  const box = (await nav.boundingBox())!;
  expect(box.y).toBeGreaterThan(portal.y);
  expect(box.y).toBeLessThan(toggle.y);
  await nav.getByTestId("hero-action-recipes").click();
  await expect(page).toHaveURL(/\/creator\/recipes$/);
});

test("conta comum não vê os atalhos do herói", async ({ page }) => {
  await loginAs(page, "free");
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Editar perfil", exact: true })).toBeVisible();
  await expect(page.getByTestId("hero-quick-actions")).toHaveCount(0);
});
