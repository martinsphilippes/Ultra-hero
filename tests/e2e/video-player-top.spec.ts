import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Página de vídeo: o player fica no topo, no lugar da capa (não há mais uma capa grande em cima e o
// player embaixo). Só leitura. Usa um vídeo de demonstração gratuito (player simulado) e o vídeo
// postado pelo herói (Cloudflare Stream), quando existir no ambiente.
const PROVIDER_NOT_CONFIGURED = /provedor ainda não configurado/;

for (const slug of ["mobilidade-de-quadril-em-8-minutos-t2", "lasanha-xwmqs5"]) {
  test(`vídeo ${slug}: player no topo, sem a capa por cima`, async ({ page }) => {
    await loginAs(page, "free");
    const response = await page.goto(`/content/${slug}`);
    test.skip(response?.status() === 404, "vídeo não existe neste ambiente");
    const top = page.getByTestId("content-top-player");
    // sem as chaves do Cloudflare (E2E local), o vídeo do Stream não toca e a capa continua
    const notConfigured = page.getByText(PROVIDER_NOT_CONFIGURED);
    await expect(top.or(notConfigured).first()).toBeVisible();
    test.skip((await notConfigured.count()) > 0, "provedor de vídeo sem chaves neste ambiente");
    // o player vem antes do título e não há imagem de capa no cabeçalho
    const title = page.locator("main h1").first();
    expect((await top.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y);
    await expect(page.locator("main header > div.relative img")).toHaveCount(0);
  });
}
