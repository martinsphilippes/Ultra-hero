import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Composer de post do herói com a conta de demonstração "Herói / Chef". Só telas e estados:
// nada é publicado nem enviado (o banco dos E2E é o remoto, visível para todos). O envio real
// para o Cloudflare fica em creator-post-real.spec.ts, ligado só com E2E_STREAM_REAL=1.

async function loginAsHero(page: Page) {
  await loginAs(page, "creator");
}

test.describe("portal do herói: novo post em vídeo", () => {
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

  test("/creator/post/new abre com Gravar vídeo e Escolher da galeria; habilitados com o Stream configurado, senão aviso e desabilitados", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/post/new");
    await expect(page.getByRole("heading", { level: 1, name: "Novo post" })).toBeVisible();

    const record = page.getByRole("button", { name: /Gravar vídeo/ });
    const gallery = page.getByRole("button", { name: /Escolher da galeria/ });
    await expect(record).toBeVisible();
    await expect(gallery).toBeVisible();
    expect((await record.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect((await gallery.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(page.getByText("Até 3 minutos · até 2 GB")).toBeVisible();

    // inputs escondidos: câmera com capture, galeria sem
    await expect(page.getByTestId("post-camera-input")).toHaveAttribute("accept", "video/*");
    await expect(page.getByTestId("post-camera-input")).toHaveAttribute("capture", "environment");
    await expect(page.getByTestId("post-gallery-input")).not.toHaveAttribute("capture", /.*/);

    // Adaptativo: com Stream + service role (produção) os botões ficam habilitados e sem aviso;
    // sem eles (local), aviso e botões desabilitados. Nada é enviado aqui.
    const notice = page.getByTestId("video-not-configured");
    if ((await notice.count()) === 0) {
      await expect(record).toBeEnabled();
      await expect(gallery).toBeEnabled();
    } else {
      await expect(notice).toContainText("Vídeo ainda não configurado: peça ao administrador para ligar o Cloudflare Stream.");
      await expect(record).toBeDisabled();
      await expect(gallery).toBeDisabled();
    }

    await page.waitForLoadState("networkidle");
    // Só o conteúdo da página: o atalho "Minha conta" do cabeçalho do portal tem um achado antigo
    // (label-content-name-mismatch) que não é desta tela.
    const results = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
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
