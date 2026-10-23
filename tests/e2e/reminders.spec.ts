import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Lembretes (decisão Q5): os itens de rotina criados à mão moram em /profile/lembretes, com atalho no
// Perfil depois de "Continue seus programas" — nunca dentro do Hoje, que segue sem campo de digitação.
// Conta demo gratuita, login UMA vez por projeto (padrão do today-watch.spec.ts). O fluxo que grava
// (criar → marcar → editar → excluir) roda só no projeto mobile e apaga no fim tudo o que criou
// (títulos "E2E lembrete …"), mesmo se um passo falhar. Não depende de migração nova: as tabelas são
// da 0022; a 0037 só muda a sequência, e a resposta de marcar nunca fala de sequência.

const PREFIX = "E2E lembrete";

async function seriousViolations(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

// Exclui pela interface todo lembrete criado por este spec que tenha sobrado na conta.
async function purge(page: Page) {
  for (let i = 0; i < 10; i++) {
    await page.goto("/profile/lembretes");
    const leftover = page.locator(`[data-testid="reminder-item"][data-reminder-title^="${PREFIX}"]`).first();
    if ((await leftover.count()) === 0) return;
    const title = (await leftover.getAttribute("data-reminder-title")) ?? "";
    await leftover.getByRole("button", { name: `Opções de ${title}` }).click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    const confirm = page.getByRole("dialog", { name: "Excluir lembrete?" });
    await confirm.getByRole("button", { name: "Excluir" }).click();
    await expect(confirm).toBeHidden({ timeout: 15_000 });
  }
}

test.describe("Lembretes fora do Hoje — conta gratuita", () => {
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

  test.afterAll(async ({}, testInfo) => {
    // rede de segurança: nada criado por este spec fica no banco remoto
    if (enabled && page && testInfo.project.name === "mobile") await purge(page).catch(() => undefined);
    await context?.close();
  });

  test.beforeEach(() => {
    test.skip(!enabled, "contas de demonstração desligadas neste ambiente");
  });

  test("atalho no Perfil depois de Continue seus programas; o Hoje não tem campo nem link de lembrete", async () => {
    await page.goto("/profile");
    const today = page.getByTestId("today-section");
    const programs = page.getByTestId("continue-programs");
    const shortcut = page.getByTestId("profile-reminders");
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toContainText("Lembretes");
    await expect(shortcut).toHaveAttribute("href", "/profile/lembretes");
    const [yToday, yPrograms, yShortcut] = await Promise.all([today, programs, shortcut].map(async (l) => (await l.boundingBox())!.y));
    expect(yToday).toBeLessThan(yPrograms);
    expect(yPrograms).toBeLessThan(yShortcut);

    await expect(today.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
    await expect(today.locator('a[href*="lembretes"]')).toHaveCount(0);
    await expect(today.getByText(/lembrete/i)).toHaveCount(0);

    await shortcut.click();
    await expect(page).toHaveURL(/\/profile\/lembretes$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Lembretes" })).toBeVisible();
    await expect(page.getByTestId("reminders-info")).toContainText("não conta na sequência");
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("criar, ver só em Lembretes (não no Hoje), marcar feito, editar e excluir", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "o fluxo que grava roda só no projeto mobile");
    await purge(page);
    await page.goto("/profile/lembretes");
    const add = page.getByTestId("reminder-add").first();
    test.skip(await add.isDisabled(), "a conta demo já tem 20 lembretes");
    const title = `${PREFIX} ${Date.now().toString(36)}`;
    const localDate = await page.getByTestId("reminders-date").getAttribute("datetime");
    expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const weekdayIndex = new Date(`${localDate}T12:00:00Z`).getUTCDay();
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

    // criar: título e horário; todos os dias (padrão) → aparece em "Para hoje"
    await add.click();
    const dialog = page.getByRole("dialog", { name: "Novo lembrete" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Título").fill(title);
    await dialog.getByLabel("Horário").fill("06:40");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("Lembrete criado.")).toBeVisible();
    const item = page.getByTestId("reminders-today").locator(`[data-testid="reminder-item"][data-reminder-title="${title}"]`);
    await expect(item).toBeVisible({ timeout: 15_000 });
    await expect(item).toContainText("06:40 · Todos os dias");

    // alvo de toque: o "Adicionar lembrete" da lista com itens tem 44px como os demais alvos
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // teclado: menu → Editar → Esc e menu → Excluir → Cancelar devolvem o foco ao gatilho (nunca ao <body>)
    const trigger = item.getByRole("button", { name: `Opções de ${title}` });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Editar" })).toBeFocused();
    await page.keyboard.press("Enter");
    const kbEdit = page.getByRole("dialog", { name: "Editar lembrete" });
    await expect(kbEdit.getByLabel("Título")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(kbEdit).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Editar" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Excluir" })).toBeFocused();
    await page.keyboard.press("Enter");
    const kbConfirm = page.getByRole("dialog", { name: "Excluir lembrete?" });
    await expect(kbConfirm).toBeVisible();
    await kbConfirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(kbConfirm).toBeHidden();
    await expect(trigger).toBeFocused();

    // não aparece no Hoje (nem no Perfil fora do atalho)
    await page.goto("/profile");
    await expect(page.getByTestId("today-section")).not.toContainText(title);
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByTestId("profile-reminders")).toContainText(/para hoje/);

    // marcar feito hoje: sem nenhuma menção à sequência; persiste depois de recarregar
    await page.goto("/profile/lembretes");
    const check = page.getByRole("button", { name: `Marcar como feito hoje: ${title}` });
    await check.click();
    await expect(page.getByText("Feito hoje!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sequência:/)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: `Desmarcar: ${title}` })).toHaveAttribute("aria-pressed", "true");

    // editar: novo título e tira o dia de hoje → vai para "Outros dias"
    const edited = `${title} editado`;
    await page.getByRole("button", { name: `Opções de ${title}` }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const editDialog = page.getByRole("dialog", { name: "Editar lembrete" });
    await expect(editDialog.getByLabel("Título")).toHaveValue(title);
    await expect(editDialog.getByLabel("Horário")).toHaveValue("06:40");
    await editDialog.getByLabel("Título").fill(edited);
    await editDialog.getByRole("button", { name: dayNames[weekdayIndex] }).click();
    await editDialog.getByRole("button", { name: "Salvar" }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("Lembrete atualizado.")).toBeVisible();
    const moved = page.getByTestId("reminders-other").locator(`[data-testid="reminder-item"][data-reminder-title="${edited}"]`);
    await expect(moved).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("reminders-today").locator(`[data-reminder-title="${edited}"]`)).toHaveCount(0);
    await expect(moved.getByRole("button", { name: /Marcar como feito hoje/ })).toHaveCount(0);

    // excluir com confirmação; cancelar não apaga
    await moved.getByRole("button", { name: `Opções de ${edited}` }).click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    const confirm = page.getByRole("dialog", { name: "Excluir lembrete?" });
    await expect(confirm).toContainText(edited);
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(moved).toBeVisible();
    await moved.getByRole("button", { name: `Opções de ${edited}` }).click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page.getByRole("dialog", { name: "Excluir lembrete?" }).getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Lembrete excluído.")).toBeVisible({ timeout: 15_000 });
    // a linha some: o foco vai para "Adicionar lembrete" em vez de cair no <body>
    await expect(page.getByTestId("reminder-add").first()).toBeFocused({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator(`[data-reminder-title^="${title}"]`)).toHaveCount(0);
  });
});
