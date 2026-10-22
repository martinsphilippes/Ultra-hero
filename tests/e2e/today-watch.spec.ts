import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Hoje com relógio simulado (F1 + F2 de docs/decisions/hoje-relogio.md): sem nenhum campo de
// digitação, rótulo "Dados de demonstração", blocos "Sua noite" e "Seu dia até agora", detalhe por
// categoria, "Continue seus programas" depois da Evolução. Usa as contas demo (pula se desligadas)
// e entra UMA vez por conta e projeto (página compartilhada, em série) para não esbarrar no limite
// de logins do Auth de produção. Não grava nada: o relógio é gerado na hora; concluir um passo de
// programa só com E2E_PROGRAMS_REAL=1.

async function seriousViolations(page: Page) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const kind of ["premium", "free"] as const) {
  test.describe(`Hoje com relógio simulado — conta ${kind}`, () => {
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
      await panel.locator(`[data-demo-kind="${kind}"]`).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    });

    test.afterAll(async () => {
      await context?.close();
    });

    test.beforeEach(() => {
      test.skip(!enabled, "contas de demonstração desligadas neste ambiente");
    });

    test("Hoje sem digitação, com rótulo de demonstração, dois blocos e cards; axe sem violações sérias", async () => {
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/profile$/);
      const today = page.getByTestId("today-section");
      await expect(today.getByRole("heading", { name: "Hoje — Seu dia, em foco" })).toBeVisible();
      const label = today.getByTestId("watch-demo-label");
      await expect(label).toBeVisible();
      await expect(label).toContainText("Dados de demonstração");
      await expect(today.getByTestId("watch-source")).toContainText("(simulado)");

      // nada para digitar: nenhum campo, nenhum botão, nada de "Adicionar", hidratação ou descanso
      await expect(today.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
      await expect(today.getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /adicionar/i })).toHaveCount(0);
      await expect(page.getByText(/Hidratação|Registrar descanso|Adicionar item/)).toHaveCount(0);

      await expect(today.getByTestId("today-night").getByRole("heading", { name: "Sua noite" })).toBeVisible();
      await expect(today.getByTestId("today-day").getByRole("heading", { name: /Seu dia até agora/ })).toBeVisible();
      await expect(today.getByTestId("today-card-sleep")).toBeVisible();
      await expect(today.getByTestId("today-card-readiness")).toBeVisible();
      expect(await today.locator("[data-testid^='today-card-']").count()).toBeGreaterThanOrEqual(3);
      // cada card mostra fonte e horário ("… (simulado) · HH:MM")
      await expect(today.getByTestId("today-card-sleep")).toContainText(/\(simulado\) · .*\d{2}:\d{2}/);

      const model = await today.getByTestId("watch-today").getAttribute("data-model");
      if (kind === "premium") {
        expect(model).toBe("apple_s12");
        await expect(today.getByTestId("today-card-readiness")).toContainText("Disposição Ultra Hero");
        await expect(today.getByTestId("today-card-readiness")).toContainText("pode diferir do número do seu relógio");
        // Apple não mede estresse: escondido, nunca zero
        await expect(today.getByTestId("today-card-stress")).toHaveCount(0);
      } else {
        expect(model).toBe("garmin_vivo");
        await expect(today.getByTestId("today-card-readiness")).toContainText("Body Battery");
        await expect(today.getByTestId("today-card-readiness")).toContainText("Training Readiness");
        // Garmin não mede ruído ambiente: a linha de Ambiente não existe
        await expect(today.getByTestId("today-environment")).toHaveCount(0);
      }
      await expect(today).toContainText("Não é diagnóstico");

      // 1 coluna no celular: os cards ocupam a largura toda
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 600) {
        const box = await today.getByTestId("today-card-sleep").boundingBox();
        expect(box!.width).toBeGreaterThan(viewport.width * 0.8);
      }

      expect(await seriousViolations(page)).toEqual([]);
    });

    test("Continue seus programas fica depois da Evolução, que segue intacta", async () => {
      await page.goto("/profile");
      const today = page.getByTestId("today-section");
      const evolution = page.getByTestId("profile-evolution");
      const programs = page.getByTestId("continue-programs");
      await expect(evolution).toBeVisible();
      await expect(evolution).toContainText("Sequência");
      await expect(programs.getByRole("heading", { name: "Continue seus programas" })).toBeVisible();
      const [yToday, yEvolution, yPrograms] = await Promise.all([today, evolution, programs].map(async (l) => (await l.boundingBox())!.y));
      expect(yToday).toBeLessThan(yEvolution);
      expect(yEvolution).toBeLessThan(yPrograms);

      const list = programs.getByTestId("continue-programs-list");
      if ((await list.count()) === 0) {
        await expect(programs.getByRole("link", { name: "Ver programas" })).toHaveAttribute("href", /programas/);
      } else {
        const first = list.locator("li").first();
        const done = first.getByRole("button", { name: "Marcar como feito" });
        await expect(done).toBeEnabled();
        // concluir grava no banco: só quando o ambiente aceita (E2E_PROGRAMS_REAL=1)
        if (process.env.E2E_PROGRAMS_REAL === "1") {
          await done.click();
          await expect(first.getByText("Feito", { exact: true })).toBeVisible({ timeout: 15_000 });
        }
      }

      await page.waitForLoadState("networkidle");
      await evolution.getByRole("link").click();
      await expect(page).toHaveURL(/\/profile\/evolution$/, { timeout: 15_000 });
    });

    test("detalhe por categoria com métricas, tendência 7/30 dias e tabela; axe sem violações sérias", async () => {
      await page.goto("/profile");
      await page.getByTestId("today-card-sleep").click();
      await expect(page).toHaveURL(/\/profile\/today\/sleep$/, { timeout: 15_000 });
      const detail = page.getByTestId("today-detail");
      await expect(detail.getByRole("heading", { level: 1, name: "Sono" })).toBeVisible();
      await expect(detail.getByTestId("watch-demo-label")).toContainText("Dados de demonstração");
      await expect(detail.getByTestId("detail-metrics").locator("[data-metric='sleep_asleep_min']")).toBeVisible();
      if (kind === "premium") {
        // Apple: "na cama" vem do iPhone, não do relógio → escondido
        await expect(detail.locator("[data-metric='sleep_in_bed_min']")).toHaveCount(0);
      } else {
        await expect(detail.locator("[data-metric='sleep_in_bed_min']")).toBeVisible();
      }
      const chart = detail.getByTestId("trend-sleep_asleep_min");
      await expect(chart.getByRole("img")).toHaveAttribute("aria-label", /últimos 7 dias/);
      await expect(detail.getByRole("link", { name: "7 dias" })).toHaveAttribute("aria-current", "page");
      // período por link (sem campo): o endereço muda e o servidor redesenha o gráfico
      const thirty = detail.getByRole("link", { name: "30 dias" });
      await expect(thirty).toHaveAttribute("href", "/profile/today/sleep?p=30");
      await page.goto("/profile/today/sleep?p=30");
      await expect(page.getByTestId("today-detail").getByRole("link", { name: "30 dias" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("trend-sleep_asleep_min").getByRole("img")).toHaveAttribute("aria-label", /últimos 30 dias/);
      await page.getByTestId("trend-sleep_asleep_min").getByText("Ver como tabela").click();
      await expect(page.getByTestId("trend-sleep_asleep_min").locator("tbody tr")).toHaveCount(30);
      await expect(page.getByTestId("today-detail").locator("input, textarea, select")).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);

      // categoria que o modelo não mede não existe para ele (escondida, nunca zero)
      await page.goto(`/profile/today/${kind === "premium" ? "stress" : "environment"}`);
      await expect(page.getByText("Página não encontrada")).toBeVisible();
      await expect(page.getByTestId("today-detail")).toHaveCount(0);
    });

    if (kind === "premium") {
      test("Sobre seus dados lista o que a marca não compartilha e as funções reguladas", async () => {
        await page.goto("/profile/today/about");
        const about = page.getByTestId("today-about");
        await expect(about.getByRole("heading", { level: 1, name: "Sobre seus dados" })).toBeVisible();
        await expect(about).toContainText("não coleta dado de saúde");
        await expect(about.getByTestId("about-regulated")).toContainText("Eletrocardiograma (ECG)");
        await expect(about).toContainText("Training Readiness");
        await expect(about).toContainText("Água e hidratação");
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  });
}
