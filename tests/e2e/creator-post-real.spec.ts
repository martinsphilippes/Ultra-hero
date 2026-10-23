import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Envio REAL para o Cloudflare Stream com a conta de demonstração "Herói / Chef". Só roda com
// E2E_STREAM_REAL=1 num ambiente com Stream + service role (ex.: produção). Sobe um vídeo de 3 s,
// confere progresso e o botão Publicar, NÃO publica, descarta e confere que o rascunho sumiu.

const FIXTURE = path.join(__dirname, "..", "fixtures", "video-3s.mp4");
const EDIT_LINKS = 'a[href^="/creator/content/"][href$="/edit"]';

async function loginAsHero(page: Page) {
  await loginAs(page, "creator");
}

// Rascunhos do herói (links de edição). O id do rascunho novo não aparece na tela do composer,
// então o descarte é conferido pela lista: o rascunho criado pelo envio some de "Meus conteúdos".
async function draftLinks(page: Page): Promise<string[]> {
  await page.goto("/creator/content?status=draft");
  await page.waitForLoadState("networkidle");
  // cada rascunho tem mais de um link de edição (título e botão): conta cada um uma vez
  const hrefs = await page.locator(EDIT_LINKS).evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs)];
}

test.describe("composer: envio real para o Cloudflare (E2E_STREAM_REAL=1)", () => {
  test.skip(process.env.E2E_STREAM_REAL !== "1", "envio real desligado: defina E2E_STREAM_REAL=1 num ambiente com o Stream configurado");

  test("sobe 3 s pela galeria, libera Publicar com título, descarta e o rascunho some", async ({ page }, testInfo) => {
    // Um projeto basta: cada execução consome um dos 10 envios por hora do herói.
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAsHero(page);
    // A lista é conferida numa segunda aba: sair do composer perderia o envio (e dispara o aviso).
    const lister = await page.context().newPage();
    const before = await draftLinks(lister);

    await page.goto("/creator/post/new");
    await expect(page.getByTestId("video-not-configured"), "Stream ou service role não configurados neste ambiente").toHaveCount(0);
    // Como a pessoa faz: toca no botão e escolhe o arquivo. Esperar a hidratação antes: um arquivo
    // posto no input antes de o React ligar o onChange se perde (a tela fica no passo 1).
    await page.waitForLoadState("networkidle");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /Escolher da galeria/ }).click()]);
    await chooser.setFiles(FIXTURE);

    const progress = page.getByRole("progressbar", { name: "Envio do vídeo" });
    await expect(progress).toHaveAttribute("aria-valuenow", "100", { timeout: 120_000 });
    await expect(page.getByTestId("upload-status")).toHaveText(/Vídeo enviado/);

    const publish = page.getByRole("button", { name: "Publicar" });
    await expect(publish).toBeDisabled();
    await page.getByLabel(/Título/).fill("E2E envio real (não publicar)");
    await expect(publish).toBeEnabled();
    // não publica: o banco dos E2E é o remoto, visível para todos

    // enquanto o rascunho existe, ele aparece na lista (confirma que o envio criou um)
    const during = await draftLinks(lister);
    const created = during.filter((href) => !before.includes(href));
    expect(created, "o envio criou exatamente um rascunho").toHaveLength(1);

    await page.getByRole("button", { name: "Descartar vídeo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("O rascunho e o vídeo foram apagados.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Escolher da galeria/ })).toBeVisible();

    expect(await draftLinks(lister)).not.toContain(created[0]);
    // A página fica dentro de loading.tsx (streaming): notFound() chega com status 200 e a tela de não encontrado.
    await lister.goto(created[0]);
    await expect(lister.getByText("Conteúdo não encontrado")).toBeVisible();
  });
});
