import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Profissionais e serviços (Etapa 3, 0058): lista pública, perfil com selo e serviços, "Contratar"
// (visitante vê "Entrar para contratar"), "Contratar nutricionista" na receita, portal travado para
// visitante e no app das lojas, e a lista do admin. Só leitura: nada é gravado (o cookie uh-e2e=1
// também desliga o contador). Sem a 0058 no banco, as partes novas se pulam (a receita mantém a linha
// "Nutricionista: em breve").

const G1 = "bowl-de-frango-grelhado-com-legumes-assados-g1";
const NATIVE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GCHeroApp/1.0.0 (ios)";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

async function expectNoSeriousAxe(page: Page, include: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).include(include).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
}

/** Abre /profissionais e pula quando o banco não tem a 0058. */
async function openList(page: Page) {
  await page.goto("/profissionais");
  await expect(page.getByTestId("professionals-page")).toBeVisible();
  const cards = page.getByTestId("pro-card");
  test.skip((await cards.count()) === 0, "banco sem a 0058 (ou sem profissionais aprovados)");
  return cards;
}

test.describe("profissionais (público)", () => {
  test("lista com especialidades, selo de registro e 'a partir de'", async ({ page }) => {
    const cards = await openList(page);
    await expect(page.getByRole("link", { name: "Nutricionistas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Personal trainers" })).toBeVisible();
    await expect(cards.first()).toContainText(/A partir de/);
    await page.getByRole("link", { name: "Nutricionistas" }).click();
    await expect(page).toHaveURL(/especialidade=nutritionist/);
    await expect(page.getByRole("link", { name: "Nutricionistas" })).toHaveAttribute("aria-current", "page");
    for (const card of await page.getByTestId("pro-card").all()) await expect(card).toContainText("Nutricionista");
    await expectNoSeriousAxe(page, "main");
  });

  test("perfil: selo, registro, serviços com preço e 'Entrar para contratar' para o visitante", async ({ page }) => {
    const cards = await openList(page);
    const href = (await cards.first().getAttribute("href"))!;
    await page.goto(href);
    await expect(page.getByTestId("professional-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const services = page.getByTestId("pro-service");
    test.skip((await services.count()) === 0, "profissional sem serviços ativos");
    await expect(services.first()).toContainText(/R\$/);
    const login = services.first().getByTestId("hire-login");
    await expect(login).toContainText("Entrar para contratar");
    await expect(login).toHaveAttribute("href", `/login?next=${encodeURIComponent(href)}`);
    await expect(page.getByTestId("hire-button")).toHaveCount(0);
    await expectNoSeriousAxe(page, "main");
  });

  test("perfil inexistente ou fora do formato: tela de não encontrado", async ({ page }) => {
    // dentro de loading.tsx (streaming) o status fica 200; vale a tela de 404, sem o perfil
    for (const slug of ["nao-existe-s68", "..%2Fadmin"]) {
      await page.goto(`/profissionais/${slug}`);
      await expect(page.getByRole("heading", { name: /^Página não encontrada$/ })).toBeVisible();
      await expect(page.getByTestId("professional-page")).toHaveCount(0);
    }
  });

  test("receita: 'Contratar nutricionista' com sugeridos (sem a 0058, a linha 'em breve')", async ({ page }) => {
    await page.goto(`/content/${G1}`);
    const hire = page.getByTestId("hire-nutritionist");
    const soon = page.getByTestId("recipe-nutritionist-soon");
    await expect(hire.or(soon)).toBeVisible();
    test.skip((await hire.count()) === 0, "banco sem a 0058: segue a linha 'em breve'");
    await expect(hire.getByRole("heading", { name: "Contratar nutricionista" })).toBeVisible();
    const item = hire.getByTestId("hire-nutritionist-item").first();
    await expect(item).toBeVisible();
    await expect(item.getByTestId("hire-nutritionist-profile")).toHaveAttribute("href", /\/profissionais\/[a-z0-9-]+\?origem=receita/);
    await expect(item.getByTestId("hire-login")).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/content/${G1}`)}`);
  });
});

test.describe("portal e app das lojas", () => {
  test("visitante em /profissional vai para o login", async ({ page }) => {
    await page.goto("/profissional");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofissional/);
  });

  test("app das lojas: /profissional não abre; o perfil aparece sem 'Contratar'", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ userAgent: NATIVE_UA, baseURL });
    await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
    const page = await context.newPage();
    const blocked = await page.request.get("/profissional", { maxRedirects: 0 });
    expect(blocked.status()).toBe(307);
    expect(blocked.headers().location).toMatch(/\/personalities$/);
    await page.goto("/profissionais");
    const cards = page.getByTestId("pro-card");
    if ((await cards.count()) > 0) {
      await page.goto((await cards.first().getAttribute("href"))!);
      await expect(page.getByTestId("professional-page")).toBeVisible();
      await expect(page.getByTestId("hire-login")).toHaveCount(0);
      await expect(page.getByTestId("hire-button")).toHaveCount(0);
    }
    await context.close();
  });

  test("admin: lista de profissionais no menu e na página (sem a 0058, aviso de indisponível)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/professionals");
    await expect(page.getByRole("heading", { level: 1, name: "Profissionais" })).toBeVisible();
    const list = page.getByTestId("admin-pro-list");
    if ((await list.count()) > 0) await expect(list.getByRole("link").first()).toHaveAttribute("href", /\/admin\/professionals\/[0-9a-f-]{36}$/);
    else await expect(page.getByText(/ainda não está disponível|Nenhum profissional/)).toBeVisible();
  });
});
