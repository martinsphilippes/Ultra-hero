import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Relógio real (F3/F4 de docs/decisions/hoje-relogio.md) atrás da chave WEARABLES_REAL_ENABLED,
// DESLIGADA por padrão: com ela desligada nada muda para ninguém — as rotas de OAuth e webhook
// respondem 404 sem ler o corpo, o tique não faz nada e as contas demo seguem com o relógio
// simulado, sem o fluxo de conectar. Não grava nada no banco (nem o webhook, que nem existe).
// O fluxo com marca ligada (consentimento → OAuth → Hoje real) só roda em staging com
// E2E_WEARABLES_REAL=1 e credenciais de desenvolvedor das marcas (roteiro de ligar).

const REAL = process.env.E2E_WEARABLES_REAL === "1";

test.describe("relógio real com a chave desligada: rotas não existem", () => {
  test.skip(REAL, "ambiente com a chave ligada (staging)");

  test("OAuth, callback, webhook e marcas desconhecidas respondem 404; o tique não faz nada", async ({ request }) => {
    for (const provider of ["garmin", "oura", "whoop", "polar"]) {
      expect((await request.get(`/api/wearables/${provider}/connect`, { maxRedirects: 0 })).status(), `${provider} connect`).toBe(404);
      expect((await request.get(`/api/wearables/${provider}/callback?code=x&state=y`, { maxRedirects: 0 })).status(), `${provider} callback`).toBe(404);
      const hook = await request.post(`/api/wearables/${provider}/webhook`, { data: { user_id: "x", type: "sleep.updated", id: "1" } });
      expect(hook.status(), `${provider} webhook`).toBe(404);
    }
    expect((await request.post(`/api/wearables/garmin/webhook/${"a".repeat(43)}`, { data: { dailies: [{ userId: "x", summaryId: "s" }] } })).status()).toBe(404);
    expect((await request.get("/api/wearables/oura/webhook?verification_token=x&challenge=abc")).status()).toBe(404);
    expect((await request.get("/api/wearables/fitbit/connect", { maxRedirects: 0 })).status()).toBe(404);
    const tick = await request.get("/api/cron/wearables");
    expect(tick.status()).toBe(200);
    expect(await tick.json()).toMatchObject({ ok: true, skipped: "disabled" });
  });
});

test.describe("conta demo: relógio simulado intacto e sem o fluxo de conectar", () => {
  test.describe.configure({ mode: "serial" });
  let context: BrowserContext;
  let page: Page;
  let enabled = true;

  test.beforeAll(async ({ browser }, testInfo) => {
    context = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
    page = await context.newPage();
    await page.goto("/login");
    const panel = page.getByTestId("demo-access");
    if ((await panel.count()) === 0) {
      enabled = false;
      return;
    }
    await panel.locator('[data-demo-kind="free"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.beforeEach(() => {
    test.skip(!enabled, "contas de demonstração desligadas neste ambiente");
  });

  test("Hoje continua com o relógio simulado e o selo de demonstração; nenhum link de conectar", async () => {
    await page.goto("/profile");
    const today = page.getByTestId("today-section");
    await expect(today.getByTestId("watch-demo-label")).toBeVisible();
    await expect(today.getByTestId("watch-today")).toHaveAttribute("data-mode", "demo");
    await expect(today.getByTestId("today-syncing")).toHaveCount(0);
    await expect(page.locator('a[href^="/profile/devices/connect/"]')).toHaveCount(0);
  });

  test("Relógios e anéis: conta demo vê só o aviso; a tela de consentimento não abre", async () => {
    await page.goto("/profile/devices");
    const devices = page.getByTestId("devices-page");
    await expect(devices).toHaveAttribute("data-state", "demo");
    await expect(devices).toContainText("Contas de demonstração usam o relógio simulado");
    await expect(devices).not.toContainText("Conecte um relógio");
    await expect(page.locator('a[href^="/profile/devices/connect/"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Desconectar|Retirar consentimento/ })).toHaveCount(0);

    await page.goto("/profile/devices/connect/garmin");
    await expect(page).toHaveURL(/\/profile\/devices\?erro=demo$/);
    await expect(page.getByTestId("consent-form")).toHaveCount(0);
  });
});
