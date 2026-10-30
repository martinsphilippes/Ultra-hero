import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers/login";

// 0061: aviso de lance superado (pop-up na casca, chave nas Notificações) e visitas à página do herói
// (contador e indicadores). Só leitura: o cookie uh-e2e=1 desliga o contador, e o pop-up é exercitado com
// as leituras do Supabase interceptadas (nenhuma escrita chega ao banco: o "visto" também é interceptado).
// Sem a 0061 no banco remoto, o que depende dela se pula ou cai no comportamento de reserva.

const ITEM = "71000000-0000-4000-8000-0000000007c1";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

/** Responde as leituras do pop-up com um aviso pendente e um item ao vivo; registra o "visto". */
async function fakeOutbid(page: Page) {
  const seen: string[] = [];
  const now = Date.now();
  await page.route("**/rest/v1/user_alerts**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      seen.push(request.url());
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "a1b2c3d4-0000-4000-8000-000000000001", kind: "auction_outbid", collectible_id: ITEM, title: "Bola assinada pelo herói", amount_cents: 156000, updated_at: new Date(now - 30_000).toISOString() },
      ]),
    });
  });
  await page.route("**/rest/v1/collectibles?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: ITEM, status: "live", starts_at: new Date(now - 3_600_000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString() }]),
    }),
  );
  return seen;
}

test.describe("lance superado", () => {
  test("pop-up em qualquer tela: texto, link para o item, não rouba o foco, fecha no X e com Esc", async ({ page }) => {
    await loginAs(page, "free", { home: null });
    const seen = await fakeOutbid(page);
    await page.goto("/explore");
    const alert = page.getByTestId("outbid-alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toHaveAttribute("role", "status");
    await expect(alert).toContainText("Seu lance em Bola assinada pelo herói foi superado");
    await expect(alert).toContainText("Lance atual: R$ 1.560,00");
    await expect(page.getByTestId("outbid-alert-cta")).toHaveAttribute("href", `/shop/colecionaveis/${ITEM}`);
    await expect(page.getByTestId("outbid-alert-cta")).toHaveText("Dar novo lance");
    // não rouba o foco
    expect(await page.evaluate(() => document.activeElement?.closest("[data-testid='outbid-alert']") ?? null)).toBeNull();
    // ao aparecer vira "visto" (uma vez por aviso)
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    const close = alert.getByRole("button", { name: "Fechar aviso" });
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(alert).toHaveCount(0);
  });

  test("Esc fecha; na página do próprio item não aparece (lá já existe o aviso do item)", async ({ page }) => {
    await loginAs(page, "free", { home: null });
    await fakeOutbid(page);
    await page.goto("/explore");
    await expect(page.getByTestId("outbid-alert")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("outbid-alert")).toHaveCount(0);

    const seen = await fakeOutbid(page);
    await page.goto(`/shop/colecionaveis/${ITEM}`);
    test.skip(!page.url().endsWith(`/shop/colecionaveis/${ITEM}`), "rota do item redirecionou (banco sem a 0057)");
    await expect.poll(() => seen.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId("outbid-alert")).toHaveCount(0);
  });

  test("sem sessão o pop-up não é montado (nenhuma leitura de avisos)", async ({ page }) => {
    let reads = 0;
    await page.route("**/rest/v1/user_alerts**", (route) => {
      reads += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.goto("/personalities");
    await page.waitForLoadState("networkidle");
    expect(reads).toBe(0);
  });

  test("Notificações: chave 'Lance superado nos Colecionáveis', desligada por padrão no texto de opt-in", async ({ page }) => {
    await loginAs(page, "free", { home: null });
    await page.goto("/profile/notifications");
    const toggle = page.getByRole("switch", { name: /Lance superado nos Colecionáveis/ });
    await expect(toggle).toBeVisible();
    await expect(page.getByText("no máximo um por item a cada 2 minutos")).toBeVisible();
  });
});

test.describe("visitas à página do herói", () => {
  test("abrir a página do herói avisa o contador (204), sem esperar; corpo inválido também 204", async ({ page }) => {
    const beacon = page.waitForResponse((r) => r.url().endsWith("/api/hero-page-views") && r.request().method() === "POST", { timeout: 15_000 });
    await page.goto("/personalities/erick-jacquin");
    expect((await beacon).status()).toBe(204);
    const res = await page.request.post("/api/hero-page-views", { data: { creatorId: "nao-uuid", email: "x@y.z" } });
    expect(res.status()).toBe(204);
  });

  test("indicadores: cartão, gráfico por dia, ranking e CSV com as visitas", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/indicadores?secao=herois&days=30");
    test.skip((await page.getByTestId("indicators-missing").count()) > 0, "banco sem a 0060: indicadores mostram 'Sem dados ainda'");
    await expect(page.getByText("Visitas à página do herói").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visitas à página do herói por dia" })).toBeVisible();
    const csv = await page.request.get("/admin/indicadores/export?secao=herois&days=30");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toMatch(/,page_views,\d+/);

    await page.goto("/admin/indicadores?secao=ranking&days=30");
    await expect(page.getByRole("heading", { name: "Heróis por visitas à página" })).toBeVisible();
  });
});
