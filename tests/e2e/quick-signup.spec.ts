import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Tela inicial = cadastro rápido (nome completo, e-mail, celular) → senha gerada. Os testes comuns não
// criam conta: passam com e sem a migração 0046 e com e sem o service role no servidor. O cadastro
// REAL (cria usuário no projeto compartilhado e apaga no fim) só roda com E2E_QUICK_SIGNUP_REAL=1.

const form = (page: Page) => page.getByTestId("quick-signup");

test.describe("cadastro rápido na tela inicial", () => {
  test("campos, Google em destaque, 'Já tenho senha' recolhido, aceite legal e axe limpo", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Entre em segundos" })).toBeVisible();
    await expect(form(page).getByLabel("Nome completo")).toBeVisible();
    await expect(form(page).getByLabel("E-mail")).toBeVisible();
    await expect(form(page).getByLabel("Celular")).toHaveAttribute("type", "tel");
    await expect(form(page).getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    // sem campo de senha no cadastro
    await expect(form(page).locator('input[type="password"]')).toHaveCount(0);
    // aceite (18+, termos e privacidade) no próprio formulário
    await expect(form(page).locator('a[href="/legal/terms"]')).toHaveCount(1);
    await expect(form(page).locator('a[href="/legal/privacy"]')).toHaveCount(1);
    await expect(form(page)).toContainText("18 anos");
    // Google logo abaixo, alto o bastante para o polegar
    const google = page.getByRole("button", { name: "Continuar com Google" });
    await expect(google).toBeVisible();
    expect((await google.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // campo-isca fora da árvore de acessibilidade e da tabulação
    await expect(page.locator('input[name="website"]')).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("textbox", { name: /não preencha/i })).toHaveCount(0);

    const havePassword = page.getByTestId("have-password");
    await expect(havePassword.locator('input[type="password"]')).toBeHidden();
    await havePassword.locator("summary").click();
    await expect(havePassword.locator('input[name="password"]')).toBeVisible();
    await expect(havePassword.getByRole("button", { name: "Entrar com senha" })).toBeVisible();
    await expect(havePassword.getByRole("link", { name: "Esqueci minha senha" })).toBeVisible();

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual([]);
  });

  test("validação: obrigatórios, nome e sobrenome, celular com DDD (sem criar conta)", async ({ page }) => {
    await page.goto("/login");
    await form(page).getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(form(page).getByText("Campo obrigatório.")).toHaveCount(3);
    await expect(form(page).getByLabel("Nome completo")).toHaveAttribute("aria-invalid", "true");

    await form(page).getByLabel("Nome completo").fill("Maria");
    await form(page).getByLabel("E-mail").fill("maria@");
    await form(page).getByLabel("Celular").pressSequentially("1131234567");
    await expect(form(page).getByLabel("Celular")).toHaveValue("(11) 31234-567");
    await form(page).getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(form(page).getByText("Digite seu nome e sobrenome (só letras).")).toBeVisible();
    await expect(form(page).getByText("Informe um e-mail válido.")).toBeVisible();
    await expect(form(page).getByText("Informe um celular com DDD, por exemplo (11) 91234-5678.")).toBeVisible();
    // ainda na tela inicial, nada criado
    await expect(page).toHaveURL(/\/login/);
  });

  test("máscara do celular aceita +55 e DDD", async ({ page }) => {
    await page.goto("/login");
    const phone = form(page).getByLabel("Celular");
    await phone.pressSequentially("11912345678");
    await expect(phone).toHaveValue("(11) 91234-5678");
    await phone.fill("");
    await phone.pressSequentially("+5521998765432");
    await expect(phone).toHaveValue("+55 (21) 99876-5432");
  });

  test("/signup leva para o cadastro rápido, mantendo o destino", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/signup?next=%2Fprofile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
    await expect(form(page)).toBeVisible();
  });

  test("sem o service role ou sem a 0046, avisa que o cadastro está indisponível (o resto da tela funciona)", async ({ page }) => {
    await page.goto("/login");
    const unavailable = page.getByTestId("quick-signup-unavailable");
    test.skip((await unavailable.count()) === 0, "cadastro rápido disponível neste ambiente");
    await expect(unavailable).toContainText("Cadastro rápido indisponível no momento");
    await expect(page.getByRole("button", { name: "Continuar com Google" })).toBeVisible();
  });
});

test.describe("Perfil › Conta: cartão da senha", () => {
  test("conta demo: senha compartilhada, sem mostrar nem gerar outra", async ({ page }) => {
    await loginAs(page, "premium", { home: null });
    await page.goto("/profile/account");
    const card = page.getByTestId("account-password");
    await expect(card.getByRole("heading", { name: "Sua senha" })).toBeVisible();
    await expect(card).toContainText("Conta de demonstração");
    await expect(card.getByRole("button", { name: /Gerar nova senha|Criar uma senha|Mostrar/ })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- cadastro real (opt-in)
const REAL = process.env.E2E_QUICK_SIGNUP_REAL === "1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("cadastro rápido de verdade (E2E_QUICK_SIGNUP_REAL=1)", () => {
  test.skip(!REAL || !SUPABASE_URL || !SERVICE_KEY, "opt-in: cria um usuário real no projeto compartilhado");
  test.describe.configure({ mode: "serial" });

  const email = `qs-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.ultrahero.app`;

  test.afterAll(async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (let page = 1; page <= 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const found = data?.users.find((u) => u.email === email);
      if (found) {
        await admin.auth.admin.deleteUser(found.id);
        return;
      }
      if (!data || data.users.length < 200) return;
    }
  });

  test("cria a conta, mostra a senha uma vez, entra no app e a senha confere no Perfil", async ({ page, browser }, testInfo) => {
    // uma conta só por execução (o projeto mobile repetiria o cadastro)
    test.skip(testInfo.project.name !== "desktop", "roda só no projeto desktop");
    await page.goto("/login");
    test.skip((await page.getByTestId("quick-signup-unavailable").count()) > 0, "cadastro rápido indisponível neste ambiente");
    await form(page).getByLabel("Nome completo").fill("Pessoa Teste E2E");
    await form(page).getByLabel("E-mail").fill(email);
    await form(page).getByLabel("Celular").pressSequentially("11912345678");
    await form(page).getByRole("button", { name: "Entrar", exact: true }).click();

    const panel = page.getByTestId("generated-password");
    await expect(panel.getByRole("heading", { name: "Sua senha" })).toBeVisible({ timeout: 20_000 });
    const password = (await page.getByTestId("generated-password-value").textContent())?.trim() ?? "";
    expect(password).toMatch(/^[A-HJKMNP-Z][a-hjkmnp-z2-9]{3}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
    // a senha nunca vai para a URL
    expect(page.url()).not.toContain(password);
    await panel.getByRole("button", { name: "Já anotei" }).click();
    await expect(page).toHaveURL(/\/personalities$/, { timeout: 20_000 });

    await page.goto("/profile/account");
    const card = page.getByTestId("account-password");
    if (await card.getByRole("button", { name: "Mostrar" }).count()) {
      await card.getByRole("button", { name: "Mostrar" }).click();
      await expect(page.getByTestId("account-password-value")).toHaveText(password);
    }
    await expect(page.getByTestId("account-phone").getByRole("textbox")).toHaveValue("(11) 91234-5678");

    // mesmo e-mail de novo, noutro navegador: não entra sem a senha
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/login");
    await form(otherPage).getByLabel("Nome completo").fill("Outra Pessoa");
    await form(otherPage).getByLabel("E-mail").fill(email);
    await form(otherPage).getByLabel("Celular").pressSequentially("11912345678");
    await form(otherPage).getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(otherPage.getByTestId("quick-signup-error")).toContainText("Este e-mail já tem conta");
    await expect(otherPage).toHaveURL(/\/login/);
    // com a senha gerada, entra em "Já tenho senha"
    await otherPage.getByTestId("have-password").locator("summary").click();
    await otherPage.getByTestId("have-password").getByLabel("E-mail").fill(email);
    await otherPage.getByTestId("have-password").locator('input[name="password"]').fill(password);
    await otherPage.getByTestId("have-password").getByRole("button", { name: "Entrar com senha" }).click();
    await expect(otherPage).toHaveURL(/\/personalities$/, { timeout: 20_000 });
    await other.close();
  });
});
