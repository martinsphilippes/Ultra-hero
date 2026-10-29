import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { readOwnCover, restoreOwnCover, type OwnCover } from "./helpers/supabase";

// Capa do herói só com foto real (0042), com a conta de demonstração "Herói / Chef".
// Sem flag: SÓ LEITURA (o banco dos E2E é o remoto): a grade de capas desenhadas sumiu, o envio de
// foto (câmera traseira e galeria) aparece com alvos grandes, a prévia 16:9 é gerada no aparelho e,
// sem a 0042 no banco ou sem service role, o envio aparece "indisponível neste ambiente" sem erro.
// Com E2E_COVER_REAL=1 (ambiente com a 0042 e o service role): envia a capa de verdade, confere o
// card na lista de heróis e remove; o fim do teste devolve a capa que a conta tinha.

const FIXTURE = path.join(__dirname, "..", "fixtures", "avatar-640x480.jpg");
const BUCKET = "/storage/v1/object/public/hero-covers/";

/** Abre "Editar perfil" no topo do /profile e devolve a seção da capa. */
async function openCover(page: Page) {
  await page.goto("/profile");
  await page.waitForLoadState("networkidle");
  const toggle = page.getByRole("button", { name: "Editar perfil", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const editor = page.locator("#editar-perfil");
  await expect(editor).toBeVisible();
  return editor.getByTestId("hero-cover");
}

const imageSources = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((imgs) => imgs.map((i) => decodeURIComponent((i as HTMLImageElement).getAttribute("src") ?? "")));

test.describe("capa do herói: telas", () => {
  test("Editar perfil: capa com foto real (câmera traseira e galeria), sem grade de capas desenhadas, alvos grandes e axe sem violações sérias", async ({ page }) => {
    await loginAs(page, "creator");
    const cover = await openCover(page);
    await expect(cover.getByRole("heading", { level: 3, name: "Capa" })).toBeVisible();
    await expect(cover).toContainText("lista de heróis");

    // nada das capas desenhadas nem da escolha por opções
    const editor = page.locator("#editar-perfil");
    await expect(editor.getByRole("radiogroup", { name: "Capa" })).toHaveCount(0);
    await expect(editor.getByText("Nenhuma opção escolhida")).toHaveCount(0);
    expect((await imageSources(page, "#editar-perfil img")).filter((src) => src.includes("/placeholders/"))).toEqual([]);

    // a capa atual: foto real ou superfície lisa ("Sem capa"), em 16:9
    const frame = cover.locator('[data-testid="hero-cover-image"], [data-testid="hero-cover-empty"]').first();
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.05);
    if ((await cover.getByTestId("hero-cover-empty").count()) > 0) await expect(cover.getByTestId("hero-cover-none")).toHaveText("Sem capa");

    const take = cover.getByRole("button", { name: "Tirar foto" });
    const gallery = cover.getByRole("button", { name: "Escolher da galeria" });
    await expect(take).toBeVisible();
    await expect(gallery).toBeVisible();
    expect((await take.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await gallery.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId("hero-cover-camera-input")).toHaveAttribute("accept", "image/*");
    await expect(page.getByTestId("hero-cover-camera-input")).toHaveAttribute("capture", "environment");
    await expect(page.getByTestId("hero-cover-gallery-input")).not.toHaveAttribute("capture", /.*/);

    // Adaptativo: sem a 0042 no banco ou sem service role, aviso (sem erro) e botões desabilitados.
    const notice = cover.getByTestId("hero-cover-unavailable");
    if ((await notice.count()) === 0) {
      await expect(take).toBeEnabled();
      await expect(gallery).toBeEnabled();
    } else {
      await expect(notice).toHaveText(/não está disponível neste ambiente|pausado pela administração/);
      await expect(take).toBeDisabled();
      await expect(gallery).toBeDisabled();
      await expect(cover.getByRole("alert")).toHaveCount(0);
    }

    const results = await new AxeBuilder({ page }).include("#editar-perfil").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("prévia 16:9 gerada no aparelho (1600x900); Cancelar fecha sem enviar; arquivo que não é imagem é recusado", async ({ page }) => {
    await loginAs(page, "creator");
    await openCover(page);
    // direto no input (os botões podem estar desabilitados sem a 0042): nada vai ao servidor
    await page.getByTestId("hero-cover-gallery-input").setInputFiles(FIXTURE);
    const dialog = page.getByRole("dialog", { name: "Prévia da capa" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const preview = dialog.getByRole("img", { name: "Prévia da sua nova capa" });
    await expect(preview).toBeVisible();
    // 640x480 vira 1600x900 (recorte central 16:9), reduzido/ampliado no navegador, sem EXIF
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`)).toBe("1600x900");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Capa atualizada.")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="hero-cover"]')))).toBe(true);

    await page.getByTestId("hero-cover-gallery-input").setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não é foto") });
    await expect(page.getByTestId("hero-cover").getByRole("alert")).toHaveText("Esse arquivo não é uma imagem. Escolha uma foto JPG, PNG ou WebP.");
  });

  test("lista de heróis: capa só com foto real ou superfície lisa; avatar com foto real ou iniciais; nada desenhado", async ({ page }) => {
    await page.goto("/personalities");
    const cards = page.locator('main a[href^="/personalities/"]').filter({ has: page.locator('[data-testid="hero-cover-image"], [data-testid="hero-cover-empty"]') });
    await expect(cards.first()).toBeVisible();
    const total = await cards.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      const card = cards.nth(i);
      await expect(card.locator('[data-testid="hero-cover-image"], [data-testid="hero-cover-empty"]')).toHaveCount(1);
      // avatar: uma foto ou as iniciais
      expect((await card.locator("img").count()) + (await card.locator("[data-avatar-initials]").count())).toBeGreaterThan(0);
    }
    expect((await imageSources(page, "main img")).filter((src) => src.includes("/placeholders/avatar-") || src.includes("/placeholders/cover-"))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("capa do herói: envio real (E2E_COVER_REAL=1)", () => {
  test.skip(process.env.E2E_COVER_REAL !== "1", "envio real desligado: defina E2E_COVER_REAL=1 num ambiente com a 0042 e o service role");

  let original: OwnCover | null = null;

  // garante que a conta demo volta à capa que tinha (a foto de teste sai do bucket pelo "Remover capa")
  test.afterEach(async ({ page }) => {
    if (!original) return;
    const cover = await openCover(page);
    const remove = cover.getByRole("button", { name: "Remover capa" });
    if ((await remove.count()) > 0 && (await readOwnCover(page)).cover?.includes(BUCKET)) {
      await remove.click();
      await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
      await expect(page.getByText("Capa removida.").first()).toBeVisible({ timeout: 20_000 });
    }
    await restoreOwnCover(page, original);
    expect((await readOwnCover(page)).cover).toBe(original.cover);
    original = null;
  });

  test("herói: envia a capa pela galeria, ela aparece no card da lista e remove (card com superfície lisa)", async ({ page }, testInfo) => {
    // um projeto basta: cada execução consome envios da cota diária da conta demo
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAs(page, "creator");
    const before = await readOwnCover(page);
    test.skip(before.cover?.includes(BUCKET) ?? false, "a conta demo já tem uma capa enviada; o teste não a apagaria");
    original = before;

    let cover = await openCover(page);
    const publicHref = await page.getByRole("link", { name: "Ver página pública" }).getAttribute("href");
    await expect(cover.getByTestId("hero-cover-unavailable"), "0042 ou service role ausentes neste ambiente").toHaveCount(0);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), cover.getByRole("button", { name: "Escolher da galeria" }).click()]);
    await chooser.setFiles(FIXTURE);
    const dialog = page.getByRole("dialog", { name: "Prévia da capa" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Usar esta capa" }).click();
    await expect(page.getByText("Capa atualizada.").first()).toBeVisible({ timeout: 30_000 });

    const uploaded = await readOwnCover(page);
    expect(uploaded.cover).toContain(BUCKET);
    // cache curto na origem: a capa removida não fica servida por meses
    expect((await page.request.get(uploaded.cover!)).headers()["cache-control"]).toContain("max-age=3600");
    const slug = publicHref!.split("/").pop();
    await page.goto("/personalities");
    const card = page.locator(`main a[href="/personalities/${slug}"]`);
    expect(decodeURIComponent((await card.locator('[data-testid="hero-cover-image"] img').getAttribute("src")) ?? "")).toContain(BUCKET);

    cover = await openCover(page);
    await cover.getByRole("button", { name: "Remover capa" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
    await expect(page.getByText("Capa removida.").first()).toBeVisible({ timeout: 20_000 });
    expect((await readOwnCover(page)).cover).toBeNull();
    await expect(cover.getByTestId("hero-cover-none")).toHaveText("Sem capa");
    await page.goto("/personalities");
    await expect(page.locator(`main a[href="/personalities/${slug}"]`).getByTestId("hero-cover-empty")).toBeVisible();
  });
});
