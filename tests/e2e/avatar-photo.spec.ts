import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { readOwnAvatars, restoreOwnAvatars, type OwnAvatars } from "./helpers/supabase";

// Foto de perfil pelo celular (0031) com a conta de demonstração "Herói / Chef".
// Herói ativo: um avatar só, no editor "Editar perfil" do /profile (foto + ilustrações valem no app e
// na página pública); conta comum: o avatar fica em Dados.
// Sem flag: só telas e estados (botões grandes, câmera frontal, aviso quando o envio não está
// disponível, axe). Com E2E_AVATAR_REAL=1 (produção, com a 0031 e o service role): envia a foto de
// verdade, confere o cabeçalho e o perfil público do herói, troca por ilustração (os dois lados) e
// remove. O banco dos E2E é o remoto: o fim do teste devolve os DOIS avatares ao que eram, mesmo
// quando o teste falha no meio.

const FIXTURE = path.join(__dirname, "..", "fixtures", "avatar-640x480.jpg");
const BUCKET = "/storage/v1/object/public/avatars/";

async function loginAsHero(page: Page) {
  await loginAs(page, "creator");
}

/** Abre "Editar perfil" no topo do /profile (o seletor de foto mora nele, para todas as contas). */
async function openHeroEditor(page: Page) {
  await page.goto("/profile");
  await page.waitForLoadState("networkidle");
  const toggle = page.getByRole("button", { name: "Editar perfil", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator("#editar-perfil")).toBeVisible();
  return page.locator("#editar-perfil");
}

// src de next/image vem como /_next/image?url=<codificada>: decodifica para achar o bucket
async function avatarSrc(page: Page, scope: string): Promise<string> {
  const src = (await page.locator(scope).first().getAttribute("src")) ?? "";
  return decodeURIComponent(src);
}

test.describe("foto de perfil: telas", () => {
  test("/profile do herói → Editar perfil: Tirar foto (câmera frontal) e Escolher da galeria, alvos grandes e sem violações sérias", async ({ page }) => {
    await loginAsHero(page);
    const editor = await openHeroEditor(page);
    const picker = editor.getByTestId("avatar-photo");
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
    // as ilustrações continuam como alternativa, no mesmo grupo da foto
    await expect(editor.getByRole("group", { name: "Sua foto ou ilustração" }).getByRole("radiogroup", { name: "Ilustrações" })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("prévia em círculo gerada no aparelho (512 px); Cancelar fecha sem enviar; arquivo que não é imagem é recusado", async ({ page }) => {
    await loginAsHero(page);
    await openHeroEditor(page);
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
    // o foco volta para a seção da foto, não para o topo da página (WCAG 2.4.3)
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="avatar-photo"]')))).toBe(true);

    await page.getByTestId("avatar-gallery-input").setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não é foto") });
    await expect(page.getByTestId("avatar-photo").getByRole("alert")).toHaveText("Esse arquivo não é uma imagem. Escolha uma foto JPG, PNG ou WebP.");

    // "Cancelar" e escolher outro arquivo em seguida: o evento "close" do <dialog> chega numa tarefa depois
    // e não pode apagar o aviso do arquivo novo (o Dialog avisava o fechamento de novo e a tela limpava o
    // erro — a causa do aviso que às vezes não aparecia). Aqui os dois passos vão na mesma tarefa.
    await page.getByTestId("avatar-gallery-input").setInputFiles(FIXTURE);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const alertAfterClose = await page.evaluate(async () => {
      const open = document.querySelector("dialog[open]") as HTMLDialogElement;
      const closed = new Promise((resolve) => open.addEventListener("close", resolve, { once: true }));
      Array.from(open.querySelectorAll("button"))
        .find((b) => b.textContent?.trim() === "Cancelar")!
        .click();
      const input = document.querySelector('[data-testid="avatar-gallery-input"]') as HTMLInputElement;
      const files = new DataTransfer();
      files.items.add(new File(["não é foto"], "nota.txt", { type: "text/plain" }));
      input.files = files.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await closed;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return document.querySelector('[data-testid="avatar-photo"] [role="alert"]')?.textContent ?? null;
    });
    expect(alertAfterClose).toBe("Esse arquivo não é uma imagem. Escolha uma foto JPG, PNG ou WebP.");
  });

  test("/profile do herói: um avatar só na página (no editor), Dados sem avatar", async ({ page }) => {
    await loginAsHero(page);
    const editor = await openHeroEditor(page);
    await expect(page.getByTestId("avatar-photo")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Tirar foto" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Escolher da galeria" })).toHaveCount(1);
    const picker = editor.getByTestId("avatar-photo");
    await expect(picker).toBeVisible();
    await expect(picker.getByText(/aparece no seu avatar e na sua página pública de herói/)).toBeVisible();
    await expect(page.locator("#dados").getByTestId("avatar-photo")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Editar perfil/ })).toHaveCount(1);
  });
});

test.describe("foto de perfil: envio real (E2E_AVATAR_REAL=1)", () => {
  test.skip(process.env.E2E_AVATAR_REAL !== "1", "envio real desligado: defina E2E_AVATAR_REAL=1 num ambiente com a 0031 e o service role");

  // os dois avatares (app e página pública) lidos antes do teste, pela sessão do próprio navegador
  let original: OwnAvatars | null = null;

  // garante que a conta demo não fica com a foto de teste e volta aos DOIS avatares que tinha
  test.afterEach(async ({ page }) => {
    if (!original) return;
    await openHeroEditor(page);
    const remove = page.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" });
    if ((await remove.count()) > 0) {
      await remove.click();
      await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
      await expect(page.getByText("Foto removida.").first()).toBeVisible({ timeout: 20_000 });
    }
    await restoreOwnAvatars(page, original);
    const now = await readOwnAvatars(page);
    expect({ profile: now.profile, creator: now.creator }).toEqual({ profile: original.profile, creator: original.creator });
    original = null;
  });

  test("herói: envia pela galeria (app e página pública), troca por ilustração nos dois lados e remove", async ({ page }, testInfo) => {
    // um projeto basta: cada execução consome envios da cota diária da conta demo
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAsHero(page);
    const before = await readOwnAvatars(page);
    // foto enviada antes do teste seria apagada pela troca e não teria como voltar
    test.skip([before.profile, before.creator].some((u) => u?.includes(BUCKET)), "a conta demo já tem uma foto enviada; o teste não a apagaria");
    original = before;

    let editor = await openHeroEditor(page);
    const publicHref = await page.getByRole("link", { name: "Ver página pública" }).getAttribute("href");
    expect(publicHref).toMatch(/^\/personalities\//);
    await expect(page.getByTestId("avatar-photo-unavailable"), "0031 ou service role ausentes neste ambiente").toHaveCount(0);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), editor.getByTestId("avatar-photo").getByRole("button", { name: "Escolher da galeria" }).click()]);
    await chooser.setFiles(FIXTURE);

    const dialog = page.getByRole("dialog", { name: "Prévia da foto" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole("img", { name: "Prévia da sua nova foto" })).toBeVisible();
    await dialog.getByRole("button", { name: "Usar esta foto" }).click();
    await expect(page.getByText("Foto atualizada.").first()).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toBeHidden();

    // a mesma foto nos dois lados
    const withPhoto = await readOwnAvatars(page);
    expect(withPhoto.profile).toContain(BUCKET);
    expect(withPhoto.creator).toBe(withPhoto.profile);
    await page.reload();
    const headerSrc = await avatarSrc(page, 'header a[href="/profile"] img');
    expect(headerSrc).toContain(BUCKET);
    // cache curto na origem: a foto removida não fica servida por meses
    const photoUrl = headerSrc.match(/url=([^&]+)/)?.[1] ?? headerSrc;
    expect((await page.request.get(photoUrl)).headers()["cache-control"]).toContain("max-age=3600");
    await page.goto(publicHref!);
    expect(await avatarSrc(page, "main header img")).toContain(BUCKET);

    // tocar numa ilustração com a foto salva: aviso de que salvar apaga a foto; "Manter minha foto" volta
    editor = await openHeroEditor(page);
    const illustrations = editor.getByRole("radiogroup", { name: "Ilustrações" });
    await illustrations.locator("label").nth(1).click();
    const warning = page.getByTestId("hero-avatar-discard-warning");
    await expect(warning).toContainText("Ao salvar, sua foto será apagada");
    await warning.getByRole("button", { name: "Manter minha foto" }).click();
    await expect(warning).toBeEmpty();
    await expect(editor.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" })).toBeVisible();

    // escolher a ilustração e salvar: a mesma ilustração no app e na página pública, foto fora do ar
    await illustrations.locator("label").nth(1).click();
    await editor.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Salvo").first()).toBeVisible({ timeout: 20_000 });
    const withIllustration = await readOwnAvatars(page);
    expect(withIllustration).toMatchObject({ profile: "/placeholders/avatar-2.svg", creator: "/placeholders/avatar-2.svg" });
    await page.reload();
    expect(await avatarSrc(page, 'header a[href="/profile"] img')).toContain("/placeholders/avatar-2.svg");
    await page.goto(publicHref!);
    expect(await avatarSrc(page, "main header img")).toContain("/placeholders/avatar-2.svg");

    // envia de novo e remove: os dois lados ficam sem foto
    editor = await openHeroEditor(page);
    const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), editor.getByTestId("avatar-photo").getByRole("button", { name: "Escolher da galeria" }).click()]);
    await chooser2.setFiles(FIXTURE);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Usar esta foto" }).click();
    await expect(page.getByText("Foto atualizada.").first()).toBeVisible({ timeout: 30_000 });
    await editor.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
    await expect(page.getByText("Foto removida.").first()).toBeVisible({ timeout: 20_000 });
    const removed = await readOwnAvatars(page);
    expect(removed.profile ?? "").not.toContain(BUCKET);
    expect(removed.creator ?? "").not.toContain(BUCKET);
    await page.reload();
    expect(await avatarSrc(page, 'header a[href="/profile"] img')).not.toContain("/avatars/");
    await page.goto(publicHref!);
    expect(await avatarSrc(page, "main header img")).not.toContain("/avatars/");
  });

  test("conta comum: envia pela galeria em Dados, aparece no cabeçalho e remove", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "envio real roda só no projeto mobile");
    test.setTimeout(180_000);
    await loginAs(page, "premium");
    const before = await readOwnAvatars(page);
    test.skip(before.profile?.includes(BUCKET) ?? false, "a conta demo já tem uma foto enviada; o teste não a apagaria");
    original = before;
    await openHeroEditor(page);
    await expect(page.getByTestId("avatar-photo-unavailable"), "0031 ou service role ausentes neste ambiente").toHaveCount(0);
    const picker = page.locator("#dados").getByTestId("avatar-photo");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), picker.getByRole("button", { name: "Escolher da galeria" }).click()]);
    await chooser.setFiles(FIXTURE);
    const dialog = page.getByRole("dialog", { name: "Prévia da foto" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Usar esta foto" }).click();
    await expect(page.getByText("Foto atualizada.").first()).toBeVisible({ timeout: 30_000 });
    await openHeroEditor(page);
    expect(await avatarSrc(page, 'header a[href="/profile"] img')).toContain(BUCKET);
    await page.getByTestId("avatar-photo").getByRole("button", { name: "Remover foto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
    await expect(page.getByText("Foto removida.").first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    expect(await avatarSrc(page, 'header a[href="/profile"] img')).not.toContain("/avatars/");
  });
});
