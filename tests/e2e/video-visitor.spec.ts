import { expect, test } from "@playwright/test";

// Vídeo para visitante: a capa ganha um play que leva ao login e volta ao vídeo. Só leitura.
const VIDEO = "/content/mobilidade-de-quadril-em-8-minutos-t2";

test("visitante vê o play sobre a capa do vídeo, que leva ao login com volta para o vídeo", async ({ page }) => {
  await page.goto(VIDEO);
  const play = page.getByTestId("content-visitor-play");
  await expect(play).toBeVisible();
  await expect(play).toHaveText(/Entre para assistir/);
  await expect(play).toHaveAttribute("href", `/login?next=${encodeURIComponent(VIDEO)}`);
});
