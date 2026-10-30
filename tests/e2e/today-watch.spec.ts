import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Hoje com relógio simulado (F1 + F2 de docs/decisions/hoje-relogio.md): sem nenhum campo de
// digitação, rótulo "Dados de demonstração", 3 cards (Seu dia, Sua noite, Evolução) que abrem telas em
// sequência, detalhe por categoria, "Continue seus programas" dentro da Evolução. Usa as contas demo (pula se desligadas)
// e entra UMA vez por conta e projeto (página compartilhada, em série) para não esbarrar no limite
// de logins do Auth de produção. Não grava nada: o relógio é gerado na hora; concluir um passo de
// programa só com E2E_PROGRAMS_REAL=1.

const hubCard = (page: Page, key: string) => page.getByTestId(`today-hub-card-${key}`);
// cards = abas: o conteúdo do card escolhido aparece logo abaixo, na mesma página (sem tela cheia)
const panel = (page: Page) => page.getByTestId("today-hub-panel");
const panelScreens = (page: Page) => panel(page).locator("section[data-screen]").evaluateAll((els) => els.map((el) => el.getAttribute("data-screen")));

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

    test("Hoje em 3 cards (Seu dia, Sua noite, Evolução), sem digitação, avisos à vista; axe sem violações sérias", async () => {
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/profile$/);
      const today = page.getByTestId("today-section");
      await expect(today.getByRole("heading", { name: "Hoje — Seu dia, em foco" })).toBeVisible();
      await expect(today.getByTestId("watch-source")).toContainText("(simulado)");

      // 3 cards, na ordem pedida, com resumo e número de telas
      const cards = today.getByTestId("today-hub-cards");
      const keys = await cards.locator("[data-testid^='today-hub-card-']").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
      expect(keys).toEqual(["today-hub-card-dia", "today-hub-card-noite", "today-hub-card-evolucao"]);
      await expect(hubCard(page, "dia")).toContainText("Seu dia");
      await expect(hubCard(page, "dia")).toContainText(/passos|Sem dados de hoje/);
      await expect(hubCard(page, "noite")).toContainText("Sua noite");
      await expect(hubCard(page, "noite")).toContainText(/\d+ h \d+ min/);
      await expect(hubCard(page, "evolucao")).toContainText(/Sequência \d+ dias?/);

      // avisos de demonstração e de bem-estar seguem visíveis na página, abaixo dos cards
      const label = today.getByTestId("watch-demo-label");
      await expect(label).toBeVisible();
      await expect(label).toContainText("Dados de demonstração");
      await expect(today).toContainText("Não é diagnóstico");
      await expect(today.getByRole("link", { name: "Sobre seus dados" })).toBeVisible();
      const [cardsBox, labelBox] = await Promise.all([cards.boundingBox(), label.boundingBox()]);
      expect(labelBox!.y).toBeGreaterThan(cardsBox!.y);

      // nada para digitar: nenhum campo; os 3 cards são abas e "Seu dia" vem aberto abaixo deles
      await expect(today.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
      await expect(today.getByRole("tab")).toHaveCount(3);
      await expect(hubCard(page, "dia")).toHaveAttribute("aria-selected", "true");
      await expect(panel(page)).toHaveAttribute("data-section", "dia");
      await expect(page.getByRole("button", { name: /adicionar/i })).toHaveCount(0);
      await expect(page.getByText(/Hidratação|Registrar descanso|Adicionar item/)).toHaveCount(0);

      // cards compactos numa linha só: mesma altura (topo) e lado a lado; sem rolagem horizontal
      const dia = await hubCard(page, "dia").boundingBox();
      const noite = await hubCard(page, "noite").boundingBox();
      expect(Math.abs(dia!.y - noite!.y)).toBeLessThanOrEqual(4); // folga do leve "levantar" no hover
      expect(noite!.x).toBeGreaterThan(dia!.x);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(await seriousViolations(page)).toEqual([]);
    });

    test("Sua noite: tocar no card troca o conteúdo abaixo, sem ir para outra tela; teclado entre abas; axe", async () => {
      await page.goto("/profile");
      await hubCard(page, "noite").click();
      await expect(hubCard(page, "noite")).toHaveAttribute("aria-selected", "true");
      await expect(panel(page)).toHaveAttribute("data-section", "noite");
      await expect(page).toHaveURL(/\/profile\?secao=noite$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // o índice da manhã (marca ou Disposição) e o Sono, empilhados, cada um com "Ver detalhes"
      const readiness = panel(page).getByTestId("today-card-readiness");
      await expect(readiness).toBeVisible();
      if (kind === "premium") {
        await expect(panel(page).getByRole("heading", { name: "Disposição Groscove Ultra" })).toBeVisible();
        await expect(readiness).toContainText("pode diferir do número do seu relógio");
      } else {
        await expect(panel(page).getByRole("heading", { name: /Body Battery/ })).toBeVisible();
        await expect(readiness).toContainText("Training Readiness");
      }
      await expect(readiness.getByRole("link", { name: /Ver detalhes/ })).toHaveAttribute("href", "/profile/today/readiness");
      const sleep = panel(page).getByTestId("today-card-sleep");
      await expect(sleep).toContainText(/\(simulado\) · .*\d{2}:\d{2}/);
      if (kind === "free") await expect(sleep).toContainText(/ · nota Garmin \d+/);
      expect(await seriousViolations(page)).toEqual([]);

      // teclado: seta para a direita passa para a aba Evolução
      await hubCard(page, "noite").focus();
      await page.keyboard.press("ArrowRight");
      await expect(hubCard(page, "evolucao")).toHaveAttribute("aria-selected", "true");
      await expect(hubCard(page, "evolucao")).toBeFocused();
    });

    test("Seu dia: uma seção por métrica; o que o modelo não mede não aparece", async () => {
      await page.goto("/profile?secao=dia");
      const screens = await panelScreens(page);
      // antes da sincronização da manhã o "Seu dia" tem só o aviso de sem dados
      if (screens[0] === "sem-dados") {
        await expect(panel(page)).toContainText("Sem dados de hoje ainda");
      } else {
        expect(screens[0]).toBe("activity");
        expect(screens).toContain("workouts");
        // Apple não mede estresse; Garmin não mede ruído ambiente: escondidos, nunca zero
        if (kind === "premium") expect(screens).not.toContain("stress");
        else expect(screens).not.toContain("environment");
        await expect(panel(page).getByTestId("today-card-activity").getByRole("link", { name: /Ver detalhes/ })).toHaveAttribute("href", "/profile/today/activity");
      }
    });

    test("Evolução: resumo, Continue seus programas e Você vs Hero (se houver), abaixo dos cards", async () => {
      await page.goto("/profile");
      await hubCard(page, "evolucao").click();
      await expect(panel(page)).toHaveAttribute("data-section", "evolucao");
      const evolution = panel(page).getByTestId("profile-evolution");
      await expect(evolution).toContainText("Sequência atual");
      await expect(evolution.getByRole("link", { name: "Ver evolução" })).toHaveAttribute("href", "/profile/evolution");
      await expect(panel(page).getByRole("heading", { name: "Continue seus programas" })).toBeVisible();
      const programs = panel(page).getByTestId("continue-programs");
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
      const screens = await panelScreens(page);
      expect(screens.slice(0, 2)).toEqual(["resumo", "programas"]);
      if (screens.includes("comparacao")) {
        await expect(panel(page).locator("[data-testid='hero-compare'], [data-testid='hero-compare-invite']")).toBeVisible();
      }
      // o resumo leva à página completa
      await evolution.getByRole("link", { name: "Ver evolução" }).click();
      await expect(page).toHaveURL(/\/profile\/evolution$/, { timeout: 15_000 });
    });

    test("/profile/today: os mesmos 3 cards e o link direto abre a aba", async () => {
      await page.goto("/profile/today");
      await expect(page.locator("main h1").first()).toHaveText("Hoje — Seu dia, em foco");
      const keys = await page.getByTestId("today-hub-cards").locator("[data-testid^='today-hub-card-']").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
      expect(keys).toEqual(["today-hub-card-dia", "today-hub-card-noite", "today-hub-card-evolucao"]);
      await expect(page.getByTestId("watch-demo-label")).toBeVisible();
      await page.goto("/profile/today?secao=evolucao");
      await expect(hubCard(page, "evolucao")).toHaveAttribute("aria-selected", "true");
      await expect(panel(page).getByTestId("continue-programs")).toBeVisible();
    });

    test("detalhe por categoria com métricas, tendência 7/30 dias e tabela; axe sem violações sérias", async () => {
      await page.goto("/profile?secao=noite");
      await panel(page).getByTestId("today-card-sleep").getByRole("link", { name: /Ver detalhes/ }).click();
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

    test("card Treinos leva ao detalhe mesmo em dia sem treino (VO₂máx, cargas)", async () => {
      await page.goto("/profile?secao=dia");
      const screens = await panelScreens(page);
      // antes da sincronização da manhã o "Seu dia" ainda não tem métricas
      test.skip(!screens.includes("workouts"), "relógio simulado ainda não sincronizou depois do despertar");
      const card = panel(page).getByTestId("today-card-workouts");
      await expect(card).toContainText(/Carga do dia \d+/);
      await card.getByRole("link", { name: /Ver detalhes/ }).click();
      await expect(page).toHaveURL(/\/profile\/today\/workouts$/, { timeout: 15_000 });
      const detail = page.getByTestId("today-detail");
      await expect(detail.getByRole("heading", { level: 1, name: "Treinos" })).toBeVisible();
      await expect(detail.locator("[data-metric='vo2max']")).toBeVisible();
      await expect(detail.locator("[data-metric='training_load_chronic_28d']")).toBeVisible();
      // "Sinais da noite" só lista leituras do sono (FC do dia fica em Atividade)
      await page.goto("/profile/today/vitals");
      await expect(page.getByTestId("today-detail").locator("[data-metric='hr_avg'], [data-metric='hr_max'], [data-metric='hr_walking_avg']")).toHaveCount(0);
    });

    if (kind === "premium") {
      test("Sobre seus dados lista o que a marca não compartilha e as funções reguladas", async () => {
        await page.goto("/profile/today/about");
        const about = page.getByTestId("today-about");
        await expect(about.getByRole("heading", { level: 1, name: "Sobre seus dados" })).toBeVisible();
        // a afirmação é sobre o relógio (alergias da etapa de receitas são dado de saúde coletado)
        await expect(about).toContainText("não coleta dados do seu relógio");
        await expect(about).not.toContainText("não coleta dado de saúde");
        await expect(about.getByTestId("about-regulated")).toContainText("Eletrocardiograma (ECG)");
        await expect(about).toContainText("Training Readiness");
        await expect(about).toContainText("Água e hidratação");
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  });
}
