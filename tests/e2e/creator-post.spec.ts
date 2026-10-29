import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { deletePhotoPostAsService, serviceRoleKey } from "./helpers/supabase";

// Composer de post do herói com a conta de demonstração "Herói / Chef". Só telas e estados:
// nada é publicado nem enviado (o banco dos E2E é o remoto, visível para todos). O envio real
// para o Cloudflare fica em creator-post-real.spec.ts, ligado só com E2E_STREAM_REAL=1; o envio
// real de foto (0043) fica no fim deste arquivo, ligado só com E2E_POST_PHOTO_REAL=1.

const PHOTO = path.join(__dirname, "..", "fixtures", "avatar-640x480.jpg");

async function loginAsHero(page: Page) {
  await loginAs(page, "creator");
}

test.describe("portal do herói: novo post com foto ou vídeo", () => {
  test("portal do herói sem menu: só “← Perfil” no topo; Novo post fica nos atalhos do Perfil", async ({ page }) => {
    await loginAsHero(page);
    // sem botão de três linhas, sem menu lateral e sem os botões repetidos no painel
    await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
    await expect(page.locator("main").getByTestId("new-post")).toHaveCount(0);
    const back = page.getByTestId("portal-back-profile");
    await expect(back).toHaveAttribute("href", "/profile");
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId("hero-action-post")).toHaveAttribute("href", "/creator/post/new");
  });

  test("a lista de conteúdos também leva ao novo post", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/content");
    await expect(page.getByTestId("new-post")).toHaveAttribute("href", "/creator/post/new");
  });

  test("/creator/post/new abre com Tirar foto, Gravar vídeo e Escolher da galeria; foto independe do Stream", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/post/new");
    await expect(page.getByRole("heading", { level: 1, name: "Novo post" })).toBeVisible();
    await expect(page.getByText("Tire ou escolha uma foto, ou grave um vídeo de até 3 minutos.", { exact: false })).toBeVisible();

    const take = page.getByRole("button", { name: /Tirar foto/ });
    const record = page.getByRole("button", { name: /Gravar vídeo/ });
    const gallery = page.getByRole("button", { name: /Escolher da galeria/ });
    for (const button of [take, record, gallery]) {
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    await expect(page.getByText("Foto até 30 MB · vídeo até 3 minutos e 2 GB")).toBeVisible();

    // inputs escondidos: foto e vídeo com a câmera traseira; a galeria aceita os dois, sem capture
    await expect(page.getByTestId("post-photo-camera-input")).toHaveAttribute("accept", "image/*");
    await expect(page.getByTestId("post-photo-camera-input")).toHaveAttribute("capture", "environment");
    await expect(page.getByTestId("post-camera-input")).toHaveAttribute("accept", "video/*");
    await expect(page.getByTestId("post-camera-input")).toHaveAttribute("capture", "environment");
    await expect(page.getByTestId("post-gallery-input")).toHaveAttribute("accept", "image/*,video/*");
    await expect(page.getByTestId("post-gallery-input")).not.toHaveAttribute("capture", /.*/);

    // Adaptativo e independente: vídeo depende do Stream + service role; foto depende da 0043 +
    // service role. Os avisos são separados e a foto funciona mesmo com o aviso do Stream na tela.
    const videoNotice = page.getByTestId("video-not-configured");
    const photoNotice = page.getByTestId("photo-unavailable");
    const videoOn = (await videoNotice.count()) === 0;
    const photoOn = (await photoNotice.count()) === 0;
    if (videoOn) {
      await expect(record).toBeEnabled();
    } else {
      await expect(videoNotice).toContainText("Vídeo ainda não configurado: peça ao administrador para ligar o Cloudflare Stream.");
      await expect(record).toBeDisabled();
    }
    if (photoOn) {
      await expect(take).toBeEnabled();
    } else {
      await expect(photoNotice).toHaveText(/não está disponível neste ambiente|pausado pela administração/);
      await expect(take).toBeDisabled();
    }
    if (videoOn || photoOn) await expect(gallery).toBeEnabled();
    else await expect(gallery).toBeDisabled();

    await page.waitForLoadState("networkidle");
    // Só o conteúdo da página: o atalho "Minha conta" do cabeçalho do portal tem um achado antigo
    // (label-content-name-mismatch) que não é desta tela.
    const results = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("arquivo escolhido vai para foto ou vídeo pelo tipo; o que não está disponível avisa sem enviar nada", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/post/new");
    // esperar a hidratação: arquivo posto antes de o React ligar o onChange se perde
    await page.waitForLoadState("networkidle");
    const alert = page.locator("main").getByRole("alert");

    // nem foto nem vídeo: recusado no aparelho (nada vai ao servidor)
    await page.getByTestId("post-gallery-input").setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não é foto") });
    await expect(alert).toHaveText("Esse arquivo não é foto nem vídeo. Escolha outro da galeria.");

    // Foto pela galeria sem o envio de foto disponível: aviso, sem sair do passo 1. Com a foto
    // disponível o arquivo seria enviado de verdade (o banco é o remoto): isso fica no teste real.
    if ((await page.getByTestId("photo-unavailable").count()) > 0) {
      await page.getByTestId("post-gallery-input").setInputFiles(PHOTO);
      await expect(alert).toHaveText(/O envio de foto (não está disponível neste ambiente|está pausado pela administração)\./);
      await expect(page.getByTestId("post-photo-preview")).toHaveCount(0);
    }
    // Vídeo pela galeria sem o Stream: o aviso do vídeo (o mesmo do topo)
    if ((await page.getByTestId("video-not-configured").count()) > 0) {
      await page.getByTestId("post-gallery-input").setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("00") });
      await expect(alert).toHaveText("Vídeo ainda não configurado: peça ao administrador para ligar o Cloudflare Stream.");
    }
    await expect(page.getByRole("button", { name: /Tirar foto/ })).toBeVisible();
  });

  test("o editor de um rascunho mostra Publicar e não Enviar para revisão", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/content?status=draft");
    // receita fica só para leitura no editor antigo (0027): o teste usa outro tipo
    const editLink = page.locator('a[href^="/creator/content/"][href$="/edit"][data-content-type]:not([data-content-type="recipe"])').first();
    test.skip((await editLink.count()) === 0, "a conta de demonstração não tem rascunhos");
    // navegação direta pelo href: o clique logo após o carregamento às vezes chega antes da hidratação
    await page.goto((await editLink.getAttribute("href"))!);
    await expect(page).toHaveURL(/\/creator\/content\/[0-9a-f-]+\/edit$/);
    await expect(page.getByTestId("publish-content")).toHaveText(/Publicar/);
    await expect(page.getByRole("button", { name: "Enviar para revisão" })).toHaveCount(0);
    await expect(page.getByText("Você publica e despublica seus conteúdos.", { exact: false })).toBeVisible();

    // abre a confirmação para ver o checklist de ajuda e cancela: nada vai ao ar
    await page.getByTestId("publish-content").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("list", { name: "Checklist de ajuda" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  });

  test("o editor de um publicado mostra Despublicar", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/content?status=published");
    const editLink = page.locator('a[href^="/creator/content/"][href$="/edit"][data-content-type]:not([data-content-type="recipe"])').first();
    test.skip((await editLink.count()) === 0, "a conta de demonstração não tem publicados");
    // navegação direta pelo href: o clique logo após o carregamento às vezes chega antes da hidratação
    await page.goto((await editLink.getAttribute("href"))!);
    await expect(page).toHaveURL(/\/creator\/content\/[0-9a-f-]+\/edit$/);
    await expect(page.getByTestId("unpublish-content")).toHaveText(/Despublicar/, { timeout: 15_000 });
    await expect(page.getByTestId("publish-content")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- envio real de foto (0043)
// Só com E2E_POST_PHOTO_REAL=1 num ambiente com a 0043 e o service role (o banco dos E2E é o remoto).
// O descarte é conferido pela própria tela; a publicação limpa tudo no fim com o service role do
// .env.local (o herói não apaga um post que já foi ao ar), inclusive se o teste falhar no meio.
test.describe("composer: envio real de foto (E2E_POST_PHOTO_REAL=1)", () => {
  test.skip(process.env.E2E_POST_PHOTO_REAL !== "1", "envio real de foto desligado: defina E2E_POST_PHOTO_REAL=1 num ambiente com a 0043");

  let published: string | null = null;
  test.afterEach(async () => {
    if (!published) return;
    const removed = await deletePhotoPostAsService(published);
    published = null;
    expect(removed.content, "o post de teste saiu do banco").toBe(1);
  });

  async function pickPhoto(page: Page) {
    await page.goto("/creator/post/new");
    await expect(page.getByTestId("photo-unavailable"), "0043 ou service role ausentes neste ambiente").toHaveCount(0);
    await page.waitForLoadState("networkidle");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /Escolher da galeria/ }).click()]);
    await chooser.setFiles(PHOTO);
    await expect(page.getByTestId("post-photo-preview")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("upload-status")).toHaveText(/Foto enviada/, { timeout: 30_000 });
  }

  test("envia pela galeria, descarta e volta ao passo 1", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(120_000);
    await loginAsHero(page);
    await pickPhoto(page);
    await page.getByRole("button", { name: "Descartar foto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("O rascunho e a foto foram apagados.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Tirar foto/ })).toBeVisible();
  });

  test("envia, publica com título e a foto aparece grande no topo do post", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.skip(!serviceRoleKey(), "sem SUPABASE_SERVICE_ROLE_KEY no .env.local: não daria para limpar o post publicado");
    test.setTimeout(120_000);
    await loginAsHero(page);
    await pickPhoto(page);
    const title = `E2E foto ${Date.now()}`;
    await page.getByLabel(/Título/).fill(title);
    await page.getByLabel(/Legenda/).fill("Legenda do teste de foto (apagado no fim).");
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByRole("heading", { name: "Publicado!" })).toBeVisible({ timeout: 30_000 });
    const href = await page.getByRole("link", { name: "Ver post" }).getAttribute("href");
    published = href!.replace("/content/", "");
    await page.goto(href!);
    const photo = page.getByTestId("content-top-photo").locator("img");
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute("alt", title);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Legenda do teste de foto (apagado no fim).")).toBeVisible();
  });
});
