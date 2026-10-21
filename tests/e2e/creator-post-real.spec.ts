import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Envio REAL para o Cloudflare Stream com a conta de demonstração "Herói / Chef". Só roda com
// E2E_STREAM_REAL=1 num ambiente com Stream + service role (ex.: produção). Sobe um vídeo de 3 s,
// confere progresso e o botão Publicar, NÃO publica, descarta e confere que o rascunho sumiu.

const FIXTURE = path.join(__dirname, "..", "fixtures", "video-3s.mp4");

async function loginAsHero(page: Page) {
  await page.goto("/login");
  const panel = page.getByTestId("demo-access");
  test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
  await panel.locator('[data-demo-kind="creator"]').click();
  await expect(page).toHaveURL(/\/creator$/, { timeout: 20_000 });
}

test.describe("composer: envio real para o Cloudflare (E2E_STREAM_REAL=1)", () => {
  test.skip(process.env.E2E_STREAM_REAL !== "1", "envio real desligado: defina E2E_STREAM_REAL=1 num ambiente com o Stream configurado");

  test("sobe 3 s pela galeria, libera Publicar com título, descarta e o rascunho some", async ({ page }, testInfo) => {
    // Um projeto basta: cada execução consome um dos 10 envios por hora do herói.
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAsHero(page);

    // O contentId só existe na resposta da server action startVideoPost (o cliente não mostra).
    let contentId: string | null = null;
    page.on("response", async (response) => {
      if (contentId || response.request().method() !== "POST" || !response.request().headers()["next-action"]) return;
      const text = await response.text().catch(() => "");
      const match = text.match(/"contentId":"([0-9a-f-]{36})"/);
      if (match) contentId = match[1];
    });

    await page.goto("/creator/post/new");
    await expect(page.getByTestId("video-not-configured"), "Stream ou service role não configurados neste ambiente").toHaveCount(0);
    await page.getByTestId("post-gallery-input").setInputFiles(FIXTURE);

    const progress = page.getByRole("progressbar", { name: "Envio do vídeo" });
    await expect(progress).toHaveAttribute("aria-valuenow", "100", { timeout: 120_000 });
    await expect(page.getByTestId("upload-status")).toHaveText(/Vídeo enviado/);
    expect(contentId, "startVideoPost devolveu o id do rascunho").not.toBeNull();

    const publish = page.getByRole("button", { name: "Publicar" });
    await expect(publish).toBeDisabled();
    await page.getByLabel(/Título/).fill("E2E envio real (não publicar)");
    await expect(publish).toBeEnabled();
    // não publica: o banco dos E2E é o remoto, visível para todos

    await page.getByRole("button", { name: "Descartar vídeo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("O rascunho e o vídeo foram apagados.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Escolher da galeria/ })).toBeVisible();

    await page.goto("/creator/content?status=draft");
    await expect(page.locator(`a[href="/creator/content/${contentId}/edit"]`)).toHaveCount(0);
    const edit = await page.goto(`/creator/content/${contentId}/edit`);
    expect(edit?.status()).toBe(404);
  });
});
