import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Foto de perfil pelo celular (0031) com a conta de demonstração "Herói / Chef".
// Sem flag: só telas e estados (botões grandes, câmera frontal, aviso quando o envio não está
// disponível, axe). Com E2E_AVATAR_REAL=1 (produção, com a 0031 e o service role): envia a foto de
// verdade, confere o cabeçalho e o perfil público do herói, remove e confere que voltou à ilustração.
// O banco dos E2E é o remoto: o teste real remove a foto no fim, mesmo quando falha no meio.

const FIXTURE = path.join(__dirname, "..", "fixtures", "avatar-640x480.jpg");

async function loginAsHero(page: Page) {
  await page.goto("/login");
  const panel = page.getByTestId("demo-access");
  test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
  await panel.locator('[data-demo-kind="creator"]').click();
  await expect(page).toHaveURL(/\/creator$/, { timeout: 20_000 });
}

// src de next/image vem como /_next/image?url=<codificada>: decodifica para achar o bucket
async function avatarSrc(page: Page, scope: string): Promise<string> {
  const src = (await page.locator(scope).first().getAttribute("src")) ?? "";
  return decodeURIComponent(src);
}

test.describe("foto de perfil: telas", () => {
  test("/profile → Dados: Tirar foto (câmera frontal) e Escolher da galeria, alvos grandes e sem violações sérias", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/profile");
    const picker = page.getByTestId("avatar-photo");
    await expect(picker).toBeVisible();
    await expect(picker.getByText("Sua foto", { exact: true })).toBeVisible();

    const take = picker.getByRole("button", { name: "Tirar foto" });
    const gallery = picker.getByRole("button", { name: "Escolher da galeria" });
    await expect(take).toBeVisible();
    await expect(gallery).toBeVisible();
    expect((await take.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await gallery.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await expect(page.getByTestId("avatar-camera-input")).toHaveAttribute("accept", "image/*");
    await expect(page.getByTestId("avatar-camera-input")).toHaveAttribute("capture", "user");
    await expect(page.getByTestId("avatar-gallery-input")).not.toHaveAttribute("capture", /.*/);

    // Adaptativo: sem service role ou sem a 0031 no banco, aviso e botões desabilitados.
    const notice = page.getByTestId("avatar-photo-unavailable");
    if ((await notice.count()) === 0) {
      await expect(take).toBeEnabled();
      await expect(gallery).toBeEnabled();
    } else {
      await expect(take).toBeDisabled();
      await expect(gallery).toBeDisabled();
    }
    // as ilustrações continuam como alternativa
    await expect(page.getByRole("radiogroup", { name: "Ilustrações" })).toBeVisible();

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("prévia em círculo gerada no aparelho (512 px); Cancelar fecha sem enviar; arquivo que não é imagem é recusado", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    // direto no input (os botões podem estar desabilitados sem service role): nada vai ao servidor
    await page.getByTestId("avatar-gallery-input").setInputFiles(FIXTURE);
    const dialog = page.getByRole("dialog", { name: "Prévia da foto" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const preview = dialog.getByRole("img", { name: "Prévia da sua nova foto" });
    await expect(preview).toBeVisible();
    // 640x480 vira 512x512 (recorte central), redimensionado no navegador
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`)).toBe("512x512");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Foto atualizada.")).toHaveCount(0);

    await page.getByTestId("avatar-gallery-input").setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não é foto") });
    await expect(page.getByTestId("avatar-photo").getByRole("alert")).toHaveText("Esse arquivo não é uma imagem. Escolha uma foto JPG, PNG ou WebP.");
  });

  test("/creator/profile também oferece a foto, com o texto do perfil de herói", async ({ page }) => {
    await loginAsHero(page);
    await page.goto("/creator/profile");
    const picker = page.getByTestId("avatar-photo");
    await expect(picker).toBeVisible();
    await expect(picker.getByText(/aparece no seu avatar e na sua página pública de herói/)).toBeVisible();
    await expect(picker.getByRole("button", { name: "Tirar foto" })).toBeVisible();
    await expect(picker.getByRole("button", { name: "Escolher da galeria" })).toBeVisible();
  });
});

type Illustrations = { profile: string | null; creator: string | null };

// Ilustrações marcadas antes do teste: a foto substitui as duas e, removida, deixa o avatar vazio;
// o fim do teste devolve à conta demo as ilustrações que ela tinha.
async function readIllustrations(page: Page): Promise<Illustrations> {
  await page.goto("/creator/profile");
  const creatorRadio = page.locator('input[type="radio"][name$="-avatar"]:checked');
  const creator = (await creatorRadio.count()) > 0 ? await creatorRadio.getAttribute("value") : null;
  await page.goto("/profile");
  const profileRadio = page.locator('input[type="radio"][name="avatar"]:checked');
  const profile = (await profileRadio.count()) > 0 ? await profileRadio.getAttribute("value") : null;
  return { profile, creator };
}

async function restoreIllustrations(page: Page, original: Illustrations) {
  if (original.creator) {
    await page.goto("/creator/profile");
    await page.waitForLoadState("networkidle");
    await page.locator(`input[type="radio"][name$="-avatar"][value="${original.creator}"]`).check({ force: true });
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Salvo").first()).toBeVisible({ timeout: 20_000 });
  }
  if (original.profile) {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await page.locator(`input[type="radio"][name="avatar"][value="${original.profile}"]`).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Perfil atualizado.").first()).toBeVisible({ timeout: 20_000 });
  }
}

test.describe("foto de perfil: envio real (E2E_AVATAR_REAL=1)", () => {
  test.skip(process.env.E2E_AVATAR_REAL !== "1", "envio real desligado: defina E2E_AVATAR_REAL=1 num ambiente com a 0031 e o service role");

  let original: Illustrations | null = null;

  // garante que a conta demo não fica com a foto de teste e volta às ilustrações que tinha
  test.afterEach(async ({ page }) => {
    await page.goto("/profile");
    const remove = page.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" });
    if ((await remove.count()) > 0) {
      await remove.click();
      await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
      await expect(page.getByText("Foto removida.").first()).toBeVisible({ timeout: 20_000 });
    }
    if (original) await restoreIllustrations(page, original);
    original = null;
  });

  test("envia pela galeria, aparece no cabeçalho e no perfil público, e remove", async ({ page }, testInfo) => {
    // um projeto basta: cada execução consome envios da cota diária da conta demo
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAsHero(page);
    original = await readIllustrations(page);
    await page.goto("/creator/profile");
    const publicHref = await page.getByRole("link", { name: "Ver página pública" }).getAttribute("href");
    expect(publicHref).toMatch(/^\/personalities\//);

    await page.goto("/profile");
    await expect(page.getByTestId("avatar-photo-unavailable"), "0031 ou service role ausentes neste ambiente").toHaveCount(0);
    // esperar a hidratação: arquivo escolhido antes de o React ligar o onChange se perde
    await page.waitForLoadState("networkidle");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("avatar-photo").getByRole("button", { name: "Escolher da galeria" }).click(),
    ]);
    await chooser.setFiles(FIXTURE);

    const dialog = page.getByRole("dialog", { name: "Prévia da foto" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole("img", { name: "Prévia da sua nova foto" })).toBeVisible();
    await dialog.getByRole("button", { name: "Usar esta foto" }).click();
    await expect(page.getByText("Foto atualizada.").first()).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toBeHidden();

    await page.reload();
    expect(await avatarSrc(page, 'header a[href="/profile"] img')).toContain("/storage/v1/object/public/avatars/");
    await expect(page.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" })).toBeVisible();

    await page.goto(publicHref!);
    expect(await avatarSrc(page, "main header img")).toContain("/storage/v1/object/public/avatars/");

    await page.goto("/profile");
    await page.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
    await expect(page.getByText("Foto removida.").first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    expect(await avatarSrc(page, 'header a[href="/profile"] img')).not.toContain("/avatars/");
    await page.goto(publicHref!);
    expect(await avatarSrc(page, "main header img")).not.toContain("/avatars/");
  });
});
