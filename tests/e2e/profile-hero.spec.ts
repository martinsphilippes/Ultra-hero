import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Perfil do herói no topo da tela Perfil (/profile), no formato do Instagram: cabeçalho público (foto,
// nome, selo, bio recolhida), Portais logo abaixo, "Editar perfil" / "Ver página pública" e o editor
// recolhido na mesma tela. Um avatar só para o herói, só com foto real (sem foto, as iniciais), e a
// capa só com foto real; nenhuma ilustração. SÓ LEITURA: o banco dos E2E é o remoto; nada é salvo aqui.

async function seriousViolations(page: Page, scope: string) {
  const results = await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

// a ordem no documento: cada elemento vem antes do seguinte
async function expectInOrder(locators: Locator[]) {
  for (let i = 0; i < locators.length - 1; i++) {
    const next = await locators[i + 1].elementHandle();
    const before = await locators[i].evaluate((a, b) => Boolean(a.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING), next);
    expect(before, `item ${i} antes do item ${i + 1}`).toBe(true);
  }
}

async function expectFocusVisible(target: Locator) {
  await expect(target).toBeFocused();
  expect(await target.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
}

test.describe("perfil do herói no topo do /profile", () => {
  test("herói: cabeçalho antes dos Portais, editor fechado por padrão, abre e fecha com o foco certo, um avatar só", async ({ page }, testInfo) => {
    await loginAs(page, "creator");
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    const header = page.getByTestId("profile-hero");
    const toggle = page.getByRole("button", { name: "Editar perfil", exact: true });
    const publicLink = page.getByRole("link", { name: "Ver página pública" });
    const editor = page.locator("#editar-perfil");

    // cabeçalho: avatar, nome (h2) e bio recolhida; herói real (0044) não tem selo de personagem fictício
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("id", "perfil-publico");
    await expect(header.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(header.getByText("Personagem fictício", { exact: true })).toHaveCount(0);
    await expect(header.getByTestId("hero-bio")).toBeVisible();
    await expect(main.getByRole("heading", { level: 1, name: "Perfil" })).toBeVisible();
    // nenhum link antes dos atalhos do portal (o cartão "Portal do herói" saiu: o Painel está nos atalhos)
    await expect(header.locator("a")).toHaveCount(0);
    await expect(main.locator("a").first()).toHaveAttribute("data-testid", "hero-action-post");
    await expect(page.getByTestId("profile-portal-creator")).toHaveCount(0);

    // ordem: cabeçalho → atalhos do portal → Editar perfil / Ver página pública → editor (com "Sua conta" dentro) → Hoje
    await expectInOrder([main.locator("h1"), header, page.getByTestId("hero-quick-actions"), toggle, publicLink, editor, page.getByTestId("today-section")]);
    await expect(editor.locator("#dados")).toHaveCount(1);
    // sem as seções antigas de baixo: "Dados" e a visão geral repetiam nome e foto
    await expect(page.getByRole("heading", { name: "Dados", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Editar perfil/ })).toHaveCount(1);
    // a seção antiga "Seu perfil de herói" saiu do meio da página
    await expect(page.getByRole("heading", { name: "Seu perfil de herói" })).toHaveCount(0);

    // dois botões lado a lado, alvos >= 44 px
    const [toggleBox, linkBox] = [(await toggle.boundingBox())!, (await publicLink.boundingBox())!];
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);
    expect(linkBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(toggleBox.y - linkBox.y)).toBeLessThan(2);
    expect(toggleBox.x).toBeLessThan(linkBox.x);
    await expect(publicLink).toHaveAttribute("href", /^\/personalities\//);

    // fechado por padrão
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "editar-perfil");
    await expect(editor).toBeHidden();

    // "Sua conta" do herói, dentro do editor: nome, idioma e tema (o avatar é o do perfil público)
    const data = page.locator("#dados");
    await expect(data.getByTestId("avatar-photo")).toHaveCount(0);
    await expect(data.locator('input[type="radio"][name="avatar"]')).toHaveCount(0);
    await expect(data).toContainText("Nome exibido, idioma e tema do app.");

    // abre pelo teclado: foco visível no botão e, aberto, no título do editor
    await toggle.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expectFocusVisible(toggle);
    await page.keyboard.press("Enter");
    await expect(editor).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const editorTitle = editor.getByRole("heading", { level: 2, name: "Editar perfil" });
    await expect(editorTitle).toBeFocused();

    // o editor completo, logo abaixo dos botões
    await expect(editor.getByLabel("Headline")).toBeVisible();
    await expect(editor.getByLabel("Bio")).toBeVisible();
    await expect(editor.getByRole("group", { name: "Foto de perfil", exact: true })).toContainText("Vale no app e na sua página pública.");
    await expect(editor.getByRole("region", { name: "Capa", exact: true })).toBeVisible();
    await expect(editor.getByRole("group", { name: "Redes (texto simples)" })).toBeVisible();
    await expect(editor.getByTestId("chef-profile")).toBeVisible();
    await expect(editor.getByRole("heading", { level: 3, name: "Especialidades e credenciais" })).toBeVisible();
    await expect(editor.getByRole("heading", { level: 3, name: "Nota de direitos e licenças" })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();

    // um avatar só na página: um seletor de foto (no editor) e nenhuma ilustração; a capa tem o próprio envio
    await expect(page.getByTestId("avatar-photo")).toHaveCount(1);
    await expect(editor.getByTestId("avatar-photo")).toBeVisible();
    await expect(editor.getByTestId("avatar-photo").getByRole("button", { name: "Tirar foto" })).toHaveCount(1);
    await expect(editor.getByTestId("hero-cover").getByRole("button", { name: "Tirar foto" })).toHaveCount(1);
    await expect(page.getByRole("radiogroup", { name: "Ilustrações" })).toHaveCount(0);
    await expect(editor.getByText("Nenhuma opção escolhida")).toHaveCount(0);
    const editorImages = await editor.locator("img").evaluateAll((imgs) => imgs.map((i) => decodeURIComponent(i.getAttribute("src") ?? "")));
    expect(editorImages.filter((src) => src.includes("/placeholders/"))).toEqual([]);

    // ids únicos, sem rolagem horizontal, axe sem violações sérias com o editor aberto
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll("[id]"))) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      return Array.from(seen).filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const serious = await seriousViolations(page, "main");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    // "Fechar" do topo (próximo foco depois do título): fecha e devolve o foco a "Editar perfil"
    await editorTitle.focus();
    await page.keyboard.press("Tab");
    await expectFocusVisible(editor.getByRole("button", { name: "Fechar" }).first());
    await page.keyboard.press("Enter");
    await expect(editor).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expectFocusVisible(toggle);

    // abre de novo pelo toque e fecha pelo "Fechar" do fim
    await toggle.click();
    await expect(editorTitle).toBeFocused();
    await editor.getByRole("button", { name: "Fechar" }).last().click();
    await expect(editor).toBeHidden();
    await expect(toggle).toBeFocused();

    // "Editar perfil" existe só no topo: Dados não repete o atalho nem o avatar
    await expect(data.getByRole("button", { name: /Editar perfil/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Editar perfil/ })).toHaveCount(1);
  });

  // Um avatar só e só foto real: o mesmo rosto (a foto ou, sem foto, as iniciais) no cabeçalho, no
  // menu, na prévia do editor e na página pública. Compara a imagem de cada lugar, sem o otimizador.
  test("herói: o mesmo avatar (foto real ou iniciais) no cabeçalho, no menu, na prévia do editor e na página pública", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    // "img:<endereço sem o otimizador e sem a origem do app>" ou "initials:<letras>"
    const face = async (scope: Locator) => {
      const img = scope.locator("img").first();
      if ((await img.count()) === 0) return `initials:${(await scope.locator("[data-avatar-initials]").first().textContent())?.trim()}`;
      const here = new URL(page.url());
      const raw = new URL((await img.getAttribute("src")) ?? "", here);
      const url = raw.pathname === "/_next/image" ? new URL(raw.searchParams.get("url") ?? "", here) : raw;
      return `img:${url.origin === here.origin ? url.pathname : url.href}`;
    };
    const header = await face(page.getByTestId("profile-hero"));
    expect(header).not.toMatch(/placeholders|^initials:$/);
    // o menu usa o nome exibido da conta: sem foto, as iniciais podem ser outras (mas nunca imagem)
    const menu = await face(page.locator('a[href="/profile"][title]').first());
    if (header.startsWith("img:")) expect(menu).toBe(header);
    else expect(menu).toMatch(/^initials:\S+/);
    await page.getByRole("button", { name: "Editar perfil", exact: true }).click();
    expect(await face(page.locator("#editar-perfil").getByTestId("avatar-photo"))).toBe(header);
    const href = await page.getByRole("link", { name: "Ver página pública" }).getAttribute("href");
    await page.goto(href!);
    expect(await face(page.getByTestId("hero-page-avatar"))).toBe(header);
  });

  test("abre sozinho em /profile#perfil-publico", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/profile#perfil-publico");
    const editor = page.locator("#editar-perfil");
    await expect(editor).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar perfil", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(editor.getByRole("heading", { level: 2, name: "Editar perfil" })).toBeFocused();
  });

  test("o endereço antigo /creator/profile leva ao /profile com o editor aberto", async ({ page }) => {
    await loginAs(page, "creator");
    await page.goto("/creator/profile");
    await expect(page).toHaveURL(/\/profile#perfil-publico$/);
    await expect(page.getByTestId("profile-hero")).toBeVisible();
    await expect(page.locator("#editar-perfil")).toBeVisible();
    await expect(page.locator("#editar-perfil").getByTestId("chef-profile")).toBeVisible();
  });

  test("o painel do herói não tem mais o cartão nem o item de menu Meu perfil", async ({ page }) => {
    await loginAs(page, "creator");
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: /Vínculos de produtos/ }).first()).toBeVisible();
    await expect(main.getByText("Meu perfil")).toHaveCount(0);
    await expect(page.locator('a[href="/creator/profile"]')).toHaveCount(0);
    // o portal do herói não tem mais menu: os atalhos ficam no Perfil
    await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
  });

  test("conta comum: topo com foto e nome, um só Editar perfil com nome, foto, idioma e tema; nada do herói", async ({ page }) => {
    await loginAs(page, "free");
    await page.goto("/profile");
    const main = page.locator("main");
    const top = page.getByTestId("profile-account");
    await expect(top.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(page.getByTestId("profile-hero")).toHaveCount(0);
    await expect(page.locator("#perfil-publico")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dados", exact: true })).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Editar perfil", exact: true });
    await expect(toggle).toHaveCount(1);
    await expectInOrder([main.locator("h1"), top, toggle, page.getByTestId("today-section")]);
    const data = page.locator("#dados");
    await expect(data).toBeHidden();
    await toggle.click();
    await expect(data).toBeVisible();
    await expect(data.getByLabel("Nome exibido")).toBeVisible();
    await expect(page.getByTestId("avatar-in-hero-editor")).toHaveCount(0);
    await expect(data.getByTestId("avatar-photo")).toBeVisible();
    await expect(data.getByTestId("avatar-photo")).not.toContainText("página pública de herói");
    await expect(data.getByRole("radiogroup", { name: "Ilustrações" })).toHaveCount(0);
    await expect(data.locator('input[name="avatar"]')).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    const serious = await seriousViolations(page, "#dados");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});
