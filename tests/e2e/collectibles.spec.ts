import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { supabaseEnv } from "./helpers/supabase";

// Colecionáveis (0057) e Minhas compras: só leitura. Funciona com e sem a 0057 no banco do servidor
// (o E2E local usa o remoto): sem ela, a loja não mostra "Loja | Colecionáveis", a vitrine avisa
// "chegam em breve", Minhas compras só tem Pedidos e o admin mostra o aviso da migração.

/** O banco do servidor já tem a 0057? A tabela existe = 200 (a RLS decide as linhas). */
async function collectiblesInDb(): Promise<boolean | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const res = await fetch(`${env.url}/rest/v1/collectibles?select=id&limit=0`, { headers: { apikey: env.key } }).catch(() => null);
  if (!res) return null;
  return res.ok;
}

test.describe("Colecionáveis e Minhas compras", () => {
  test("loja: seletor Loja | Colecionáveis só com a 0057; filtros intactos", async ({ page }) => {
    const has = await collectiblesInDb();
    await page.goto("/shop");
    await expect(page.getByRole("group", { name: /filtros da loja/i })).toBeVisible();
    const segment = page.getByTestId("shop-segment");
    if (has) {
      await expect(segment.getByRole("link", { name: "Loja" })).toHaveAttribute("aria-current", "page");
      const link = segment.getByRole("link", { name: /Colecionáveis/ });
      await expect(link).toHaveAttribute("href", "/shop/colecionaveis");
      // nunca "leilão" no seletor
      await expect(segment).not.toContainText(/leil[aã]o/i);
    } else {
      await expect(segment).toHaveCount(0);
    }
  });

  test("vitrine renderiza (itens ou aviso), sem violações sérias de acessibilidade", async ({ page }) => {
    const has = await collectiblesInDb();
    await page.goto("/shop/colecionaveis");
    await expect(page.getByRole("heading", { level: 1, name: "Colecionáveis" })).toBeVisible();
    const cards = page.getByTestId("collectible-card");
    const empty = page.getByText(has ? /nenhum colecionável no momento/i : /colecionáveis chegam em breve/i);
    await expect(cards.first().or(empty)).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/leil[aã]o/i);
    // a aba Comprar continua marcada
    const nav = page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true }).first();
    await expect(nav.getByRole("link", { name: "Comprar" })).toHaveAttribute("aria-current", "page");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("item: id inexistente dá a tela de não encontrado; com itens, a página abre com preço e contagem", async ({ page }) => {
    await page.goto("/shop/colecionaveis/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText(/não encontrad/i).first()).toBeVisible();

    test.skip(!(await collectiblesInDb()), "banco sem a 0057");
    await page.goto("/shop/colecionaveis");
    const first = page.getByTestId("collectible-card").first();
    test.skip((await first.count()) === 0, "nenhum colecionável público no banco");
    await first.getByRole("link").click();
    await expect(page).toHaveURL(/\/shop\/colecionaveis\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("auction-room")).toBeVisible();
    await expect(page.getByTestId("auction-price")).toContainText(/R\$/);
    // visitante assiste; para dar lance, entra
    const phase = await page.getByTestId("auction-room").getAttribute("data-phase");
    if (phase === "live") await expect(page.getByRole("link", { name: "Entrar para dar lance" })).toBeVisible();
  });

  test("Minhas compras pede login; logado, fica dentro de Comprar e /orders leva para lá", async ({ page }, testInfo) => {
    await page.goto("/shop/compras");
    await expect(page).toHaveURL(/\/login/);

    await loginAs(page, "free", { home: null });
    await page.goto("/shop");
    const link = page.getByTestId("my-purchases-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Minhas compras");
    await link.click();
    await expect(page).toHaveURL(/\/shop\/compras$/);
    await expect(page.getByRole("heading", { level: 1, name: "Minhas compras" })).toBeVisible();
    await expect(page.getByTestId("purchases-orders")).toBeVisible();
    if (testInfo.project.name === "mobile") {
      const nav = page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true }).first();
      await expect(nav.getByRole("link", { name: "Comprar" })).toHaveAttribute("aria-current", "page");
    }

    const bidsTab = page.getByRole("link", { name: /Lances e arremates/ });
    if (await collectiblesInDb()) {
      await bidsTab.click();
      await expect(page).toHaveURL(/\/shop\/compras\?aba=lances$/);
      await expect(page.getByTestId("purchases-bids")).toBeVisible();
    } else {
      await expect(bidsTab).toHaveCount(0);
    }

    await page.goto("/orders");
    await expect(page).toHaveURL(/\/shop\/compras$/);
  });

  test("admin: tela de Colecionáveis pelo menu (itens ou aviso da migração)", async ({ page }, testInfo) => {
    await loginAs(page, "admin");
    if (testInfo.project.name === "desktop") {
      await page.getByRole("link", { name: "Colecionáveis" }).first().click();
      await expect(page).toHaveURL(/\/admin\/collectibles$/);
    } else {
      await page.goto("/admin/collectibles");
    }
    await expect(page.getByRole("heading", { level: 1, name: "Colecionáveis" })).toBeVisible();
    const rows = page.getByTestId("admin-collectible-row");
    const notice = page.getByText(/aplique a migração 0057/i);
    await expect(rows.first().or(notice)).toBeVisible();
    if ((await rows.count()) > 0) await expect(page.getByRole("link", { name: "Novo colecionável" })).toBeVisible();
  });

  test("Social e página do herói continuam abrindo (destaque e banner só com item ao vivo)", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
    const highlight = page.getByTestId("live-collectible-highlight");
    if ((await highlight.count()) > 0) await expect(highlight).toHaveAttribute("href", /^\/shop\/colecionaveis/);
    await page.goto("/personalities/neymar");
    await expect(page.getByRole("heading", { level: 1, name: "Neymar" })).toBeVisible();
    const banner = page.getByTestId("hero-collectible-banner");
    if ((await banner.count()) > 0) await expect(banner).toHaveAttribute("href", /^\/shop\/colecionaveis\/[0-9a-f-]{36}$/);
  });
});
