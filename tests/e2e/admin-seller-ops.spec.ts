import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Operação dos fornecedores pelo admin (0053): o que o portal do fornecedor fazia (painel, produtos,
// remessas, perfil) vive nas abas da organização em /admin/sellers/[id] e na tela global de Remessas.
// O portal /seller fica desligado: o admin é levado ao admin e as demais contas veem um aviso.
// Só leitura: nada é gravado (nenhum formulário é enviado, nenhuma transição é feita).

async function axeSerious(page: Page, include?: string) {
  await page.waitForLoadState("networkidle");
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

/** Abre a primeira organização da lista e devolve o caminho dela. */
async function openFirstSeller(page: Page): Promise<string> {
  await page.goto("/admin/sellers");
  const link = page.locator('main a[href^="/admin/sellers/"]:not([href="/admin/sellers/new"])').first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  return href;
}

test.describe("admin opera os fornecedores", () => {
  test("menu do admin tem Remessas e a tela global filtra por status e fornecedor", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/shipments");
    await expect(page.getByRole("heading", { level: 1, name: "Remessas" })).toBeVisible();
    // as três contagens abertas viram filtro
    for (const s of ["awaiting", "preparing", "ready_for_dispatch"]) await expect(page.getByTestId(`shipments-open-${s}`)).toBeVisible();
    await page.getByTestId("shipments-open-awaiting").click();
    await expect(page).toHaveURL(/\/admin\/shipments\?status=awaiting$/);
    await expect(page.getByTestId("shipments-open-awaiting")).toHaveAttribute("aria-current", "true");
    // o link do menu existe (lateral no desktop; menu de três linhas no celular)
    await expect(page.locator('a[href="/admin/shipments"]').first()).toBeAttached();
    expect(await axeSerious(page, "main")).toEqual([]);
  });

  test("organização: abas Visão geral, Produtos, Remessas e Organização (cadastro e membros mantidos)", async ({ page }) => {
    await loginAs(page, "admin");
    const base = await openFirstSeller(page);
    const tabs = page.getByRole("navigation", { name: "Seções da organização" });
    await expect(tabs.getByRole("link")).toHaveText(["Visão geral", "Produtos", "Remessas", "Organização"]);
    await expect(tabs.getByRole("link", { name: "Visão geral" })).toHaveAttribute("aria-current", "page");
    // visão geral: o mesmo painel do fornecedor
    const overview = page.getByTestId("seller-overview");
    await expect(overview.getByRole("heading", { name: "Produtos por status" })).toBeVisible();
    await expect(overview.getByRole("heading", { name: "Remessas" })).toBeVisible();
    await expect(overview.getByRole("heading", { name: "Moderação recente" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo produto" })).toHaveAttribute("href", `${base}/products/new`);
    expect(await axeSerious(page, "main")).toEqual([]);

    // produtos: filtros e lista (ou vazio com "Novo produto")
    await tabs.getByRole("link", { name: "Produtos" }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/products$`));
    await expect(tabs.getByRole("link", { name: "Produtos" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("form", { name: "Filtros" })).toBeVisible();
    expect(await axeSerious(page, "main")).toEqual([]);

    // remessas da organização
    await tabs.getByRole("link", { name: "Remessas" }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/shipments$`));
    await expect(page.getByLabel("Status")).toBeVisible();

    // organização: cadastro (nome, slug, descrição, logo) + membros + convite, como antes
    await tabs.getByRole("link", { name: "Organização" }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/organization$`));
    await expect(page.getByRole("heading", { name: "Editar organização" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Convidar membro" })).toBeVisible();
    expect(await axeSerious(page, "main")).toEqual([]);
  });

  test("novo produto e edição usam o formulário do fornecedor (sem salvar)", async ({ page }) => {
    await loginAs(page, "admin");
    const base = await openFirstSeller(page);
    await page.goto(`${base}/products/new`);
    await expect(page.getByRole("heading", { name: "Novo produto" })).toBeVisible();
    await expect(page.getByRole("button", { name: /salvar|criar/i }).first()).toBeVisible();

    await page.goto(`${base}/products`);
    const edit = page.locator(`main a[href^="${base}/products/"][href$="/edit"]`).first();
    test.skip((await edit.count()) === 0, "organização sem produtos neste ambiente");
    await edit.click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}\/edit$/);
    await expect(page.getByTestId("hub-product-moderation")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Histórico de versões" })).toBeVisible();
    expect(await axeSerious(page, "main")).toEqual([]);
  });

  test("remessa abre na organização com linha do tempo e ações do admin (sem clicar)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/shipments");
    const open = page.locator('main a[href*="/shipments/"]').first();
    test.skip((await open.count()) === 0, "nenhuma remessa neste ambiente");
    await open.click();
    await expect(page).toHaveURL(/\/admin\/sellers\/[0-9a-f-]{36}\/shipments\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();
    await expect(page.getByTestId("fulfillment-actions").getByRole("heading", { name: "Ações da administração" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir o pedido" })).toHaveAttribute("href", /\/admin\/orders\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("navigation", { name: "Seções da organização" }).getByRole("link", { name: "Remessas" })).toHaveAttribute("aria-current", "page");
  });

  test("painel do admin: pendências de remessas levam à tela de Remessas", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page.locator('main a[href="/admin/shipments?status=awaiting"]')).toBeVisible();
    await expect(page.locator('main a[href="/admin/shipments?status=preparing"]')).toBeVisible();
  });
});

test.describe("portal do fornecedor desligado", () => {
  test("admin que abre /seller vai para Fornecedores no admin", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/seller/products");
    await expect(page).toHaveURL(/\/admin\/sellers$/);
  });

  test("outra conta vê o aviso, sem o portal; o Perfil não tem atalho de fornecedor", async ({ page }) => {
    await loginAs(page, "free");
    for (const route of ["/seller", "/seller/fulfillments"]) {
      await page.goto(route);
      const notice = page.getByTestId("seller-portal-closed");
      await expect(notice.getByRole("heading", { level: 1, name: "Portal do fornecedor desativado" })).toBeVisible();
      await expect(notice.getByRole("link", { name: "Ir para o app" })).toHaveAttribute("href", "/personalities");
      await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
    }
    expect(await axeSerious(page)).toEqual([]);
    await page.goto("/profile");
    await expect(page.getByTestId("profile-portal-seller")).toHaveCount(0);
  });
});
