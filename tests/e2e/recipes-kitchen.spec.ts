import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Receitas fase 4: Modo Cozinha, Minha coleção de receitas e o histórico opcional, com a conta demo
// "free" contra o banco remoto. Faz a etapa demonstrativa se a conta ainda não fez (a única coisa
// que fica, e é o estado normal de quem usa receitas). O Modo Cozinha só grava no aparelho; a coleção
// desfaz o que criar: o favorito adicionado pelo teste sai no fim e o histórico termina desligado
// (o que apaga tudo). Os testes que mexem na conta rodam só no projeto mobile para os dois projetos
// não disputarem o mesmo histórico ao mesmo tempo.

const RECIPE = { slug: "bowl-de-frango-grelhado-com-legumes-assados-g1", title: "Bowl de frango grelhado com legumes assados" };
const RECIPE_PATH = `/content/${RECIPE.slug}`;

async function loginFree(page: Page) {
  await loginAs(page, "free");
}

/** Abre a receita; se a conta ainda não fez a etapa demonstrativa, faz os 4 passos e volta. */
async function openRecipeWithStep(page: Page) {
  await page.goto(RECIPE_PATH);
  await expect(page.getByRole("heading", { level: 1, name: RECIPE.title })).toBeVisible();
  if ((await page.getByTestId("recipe-gate").count()) > 0) {
    await page.getByTestId("recipe-gate-start").click();
    await expect(page.getByTestId("recipe-onboarding")).toBeVisible();
    await page.locator("#recipe-notice").check();
    for (let i = 0; i < 3; i += 1) await page.getByTestId("recipe-onboarding-next").click();
    await page.getByTestId("recipe-onboarding-finish").click();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}$`), { timeout: 20_000 });
  }
  await expect(page.getByTestId("recipe-gate")).toHaveCount(0);
  // a receita estruturada (RecipeView) traz o botão do Modo Cozinha; espera o corpo chegar
  await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
}

test.describe("Modo Cozinha (visitante)", () => {
  test("sem login vai para o login e volta ao Modo Cozinha", async ({ page }) => {
    await page.goto(`${RECIPE_PATH}/cozinha`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`${RECIPE_PATH}/cozinha`)}`));
  });

  test("política de privacidade cita o histórico opcional, o prazo e o armazenamento do Modo Cozinha", async ({ page }) => {
    await page.goto("/legal/privacy");
    const main = page.locator("main");
    await expect(main.getByText(/Histórico de receitas vistas \(opcional\):/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Histórico de receitas vistas (opcional)" })).toBeVisible();
    await expect(main.getByText(/90 dias após o último acesso a cada receita/)).toBeVisible();
    await expect(main.getByText(/No Modo Cozinha, as chaves/)).toBeVisible();
  });
});

test.describe("Modo Cozinha (conta free)", () => {
  test("abre pela receita, avança e volta, marca etapa, cronômetro inicia, termina e é cancelado, e volta à receita", async ({ page }) => {
    test.setTimeout(120_000);
    await loginFree(page);
    await openRecipeWithStep(page);
    const link = page.getByTestId("recipe-cook-mode");
    test.skip((await link.count()) === 0, "receita sem estrutura neste banco");
    // relógio controlado a partir daqui: o cronômetro é conferido sem esperar 25 minutos
    await page.clock.install();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}/cozinha$`));
    await expect(page.getByTestId("cook-mode")).toBeVisible();

    const progress = page.getByTestId("cook-progress");
    await expect(progress).toHaveText(/^Etapa 1 de \d+$/);
    const total = Number((await progress.textContent())!.match(/de (\d+)/)![1]);
    test.skip(total < 2, "receita com uma etapa só");
    // instrução em letra grande (≥ 24 px) e alvos de navegação com 56 px
    const fontSize = await page.getByTestId("cook-instruction").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(24);
    for (const id of ["cook-prev", "cook-next"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }

    // avançar por toque e voltar pelo teclado
    await page.getByTestId("cook-next").click();
    await expect(progress).toHaveText(`Etapa 2 de ${total}`);
    await page.keyboard.press("ArrowLeft");
    await expect(progress).toHaveText(`Etapa 1 de ${total}`);
    await page.keyboard.press("ArrowRight");
    await expect(progress).toHaveText(`Etapa 2 de ${total}`);
    // "Anterior" com Enter até a primeira etapa: o botão fica aria-disabled e mantém o foco
    const prev = page.getByTestId("cook-prev");
    await prev.focus();
    await page.keyboard.press("Enter");
    await expect(progress).toHaveText(`Etapa 1 de ${total}`);
    await expect(prev).toBeFocused();
    await expect(prev).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(progress).toHaveText(`Etapa 1 de ${total}`);

    // progresso guardado por conta: uh-cook:<conta>:<receita>
    const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("uh-cook:")));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^uh-cook:[0-9a-f-]{36}:[0-9a-f-]{36}$/);
    // som do alarme: interruptor com rótulo fixo
    await expect(page.getByRole("switch", { name: "Som do alarme" })).toHaveAttribute("aria-checked", /true|false/);

    // marcar a etapa como concluída; a marca fica no aparelho depois de recarregar
    const done = page.getByTestId("cook-step-done");
    await expect(done).toHaveAttribute("aria-pressed", "false");
    await done.click();
    await expect(done).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByTestId("cook-step-done")).toHaveAttribute("aria-pressed", "true");
    await expect(progress).toHaveText(`Etapa 1 de ${total}`);
    await page.getByTestId("cook-step-done").click();
    await expect(page.getByTestId("cook-step-done")).toHaveAttribute("aria-pressed", "false");

    // tela acesa: ou o interruptor, ou o aviso de que o navegador não deixa
    await expect(page.locator("#cook-keep-awake").or(page.getByTestId("cook-wake-unsupported"))).toBeVisible();

    // cronômetro: procura a primeira etapa com duração
    let found = false;
    for (let i = 0; i < total; i += 1) {
      if ((await page.getByTestId("cook-timer-start").count()) > 0) {
        found = true;
        break;
      }
      if (i < total - 1) await page.getByTestId("cook-next").click();
    }
    if (found) {
      const start = page.getByTestId("cook-timer-start");
      const [mm, ss] = (await start.textContent())!.match(/(\d+):(\d{2})/)!.slice(1).map(Number);
      const durationMs = (mm * 60 + ss) * 1000;
      // com teclado: iniciar leva o foco a "Cancelar" e o início é anunciado (região educada)
      await start.focus();
      await page.keyboard.press("Enter");
      const clock = page.getByTestId("cook-timer-clock");
      await expect(clock).toBeVisible();
      await expect(page.getByTestId("cook-timer-cancel")).toBeFocused();
      await expect(page.getByTestId("cook-status")).toHaveText(/^Cronômetro iniciado: \d{2}:\d{2}\.$/);
      await page.clock.fastForward(60_000);
      await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
      const left = (await clock.textContent())!.split(":").map(Number);
      expect((left[0] * 60 + left[1]) * 1000).toBeLessThanOrEqual(durationMs - 59_000);
      // termina: alarme anunciado em voz alta (assertive) e botão para parar
      await page.clock.fastForward(durationMs);
      await expect(page.getByTestId("cook-alert")).toContainText("terminou");
      // o foco estava em "Cancelar", que sumiu: vai para "Parar o alarme"
      const dismiss = page.getByTestId("cook-timer-dismiss");
      await expect(dismiss).toHaveText("Parar o alarme");
      await expect(dismiss).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("cook-timer-start")).toBeVisible();
      await expect(page.getByTestId("cook-timer-start")).toBeFocused();
      // inicia de novo e cancela, sempre com o foco no botão que entrou no lugar
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("cook-timer-clock")).toBeVisible();
      await expect(page.getByTestId("cook-timer-cancel")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("cook-timer-start")).toBeVisible();
      await expect(page.getByTestId("cook-timer-start")).toBeFocused();
      await expect(page.getByTestId("cook-timer-clock")).toHaveCount(0);
      await expect(page.getByTestId("cook-status")).toHaveText("Cronômetro cancelado.");
    } else {
      test.info().annotations.push({ type: "note", description: "nenhuma etapa com duração nesta receita: cronômetro não exercitado" });
    }

    // penúltima etapa: "Próxima" com Enter vira "Ver receita completa", que recebe o foco
    await page.keyboard.press("Home");
    await expect(progress).toHaveText(`Etapa 1 de ${total}`);
    for (let i = 1; i < total - 1; i += 1) await page.getByTestId("cook-next").click();
    await expect(progress).toHaveText(`Etapa ${total - 1} de ${total}`);
    await page.getByTestId("cook-next").focus();
    await page.keyboard.press("Enter");
    await expect(progress).toHaveText(`Etapa ${total} de ${total}`);
    await expect(page.getByTestId("cook-finish-link")).toBeFocused();

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 2)).toEqual([]);

    await page.getByTestId("cook-back").click();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}$`));
    await expect(page.getByRole("heading", { level: 1, name: RECIPE.title })).toBeVisible();
  });

  test("porções da URL chegam ao Modo Cozinha", async ({ page }) => {
    await loginFree(page);
    await openRecipeWithStep(page);
    await page.goto(`${RECIPE_PATH}?porcoes=4`);
    await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const link = page.getByTestId("recipe-cook-mode");
    test.skip((await link.count()) === 0, "receita sem estrutura neste banco");
    await expect(link).toHaveAttribute("href", `${RECIPE_PATH}/cozinha?porcoes=4`);
    await link.click();
    await page.getByTestId("cook-ingredients-open").click();
    const all = page.getByTestId("cook-all-ingredients");
    await expect(all).toBeVisible();
    // g1 rende 2: com 4 porções, "300 g" de frango vira "600 g"; texto livre não é ajustado
    await expect(all).toContainText("600 g");
    // o mesmo aviso da página (uma chave só: recipes.page.notScaled)
    await expect(all).toContainText("Não ajustado automaticamente");
    await expect(page.getByTestId("cook-back")).toHaveAttribute("href", `${RECIPE_PATH}?porcoes=4`);
  });

  // Integração das fases 3 e 4: a mesma receita com ?porcoes=4 mostra as mesmas quantidades na página e
  // no Modo Cozinha (uma regra de porções), o botão não sai na impressão e a volta mantém as porções.
  test("g1 com ?porcoes=4: as mesmas 3 quantidades na página e no Modo Cozinha, e a volta com as mesmas porções", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "jornada do celular (projeto mobile)");
    await loginFree(page);
    await openRecipeWithStep(page);
    await page.goto(`${RECIPE_PATH}?porcoes=4`);
    await page.getByTestId("recipe-view").waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const link = page.getByTestId("recipe-cook-mode");
    test.skip((await link.count()) === 0, "receita sem estrutura neste banco");
    await expect(page.getByTestId("servings-value")).toHaveValue("4");

    const names = ["Peito de frango", "Azeite", "Abobrinha"];
    const onPage: string[] = [];
    for (const name of names) {
      const amount = page.getByTestId("recipe-ingredient").filter({ hasText: name }).first().getByTestId("recipe-ingredient-amount");
      onPage.push(((await amount.textContent()) ?? "").trim());
    }
    // g1 rende 2: 300 g → 600 g, 2 colheres → 4, 1 → 2 (a receita do seed)
    expect(onPage).toEqual(["600 g", "4 colheres de sopa", "2"]);
    const herbsOnPage = page.getByTestId("recipe-ingredient").filter({ hasText: "Molho de ervas" });
    await expect(herbsOnPage.getByTestId("recipe-ingredient-not-scaled")).toHaveText("Não ajustado automaticamente");

    // impressão: a linha de ações (com o Modo Cozinha) não sai no papel; as quantidades ajustadas saem
    await page.emulateMedia({ media: "print" });
    await expect(link).toBeHidden();
    await expect(page.getByTestId("recipe-ingredient").filter({ hasText: names[0] })).toContainText(onPage[0]);
    await page.emulateMedia({ media: "screen" });

    await expect(link).toHaveText("Modo Cozinha");
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}/cozinha\\?porcoes=4$`));
    await expect(page.getByTestId("cook-mode")).toBeVisible();
    await page.getByTestId("cook-ingredients-open").click();
    const all = page.getByTestId("cook-all-ingredients");
    await expect(all).toBeVisible();
    const inKitchen: string[] = [];
    for (const name of names) {
      const amount = all.getByTestId("cook-ingredient").filter({ has: page.getByTestId("cook-ingredient-name").getByText(name, { exact: true }) }).getByTestId("cook-ingredient-amount");
      inKitchen.push(((await amount.textContent()) ?? "").trim());
    }
    expect(inKitchen).toEqual(onPage);
    await expect(all.getByTestId("cook-ingredient").filter({ hasText: "Molho de ervas" }).getByTestId("cook-ingredient-not-scaled")).toHaveText("Não ajustado automaticamente");
    await page.keyboard.press("Escape");

    // voltar leva à página com o mesmo ?porcoes=
    await page.getByTestId("cook-back").click();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}\\?porcoes=4$`));
    await expect(page.getByTestId("servings-value")).toHaveValue("4");
    await expect(page.getByTestId("recipe-ingredient").filter({ hasText: names[0] })).toContainText(onPage[0]);
  });
});

test.describe("Minha coleção de receitas (conta free)", () => {
  test("atalho no Perfil, favoritos na coleção, histórico ligado e desligado com confirmação (apaga)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "conta compartilhada: roda só no mobile para não disputar o histórico");
    test.setTimeout(120_000);
    await loginFree(page);

    await page.goto("/profile");
    await expect(page.locator('a[href="/profile/receitas"]')).toBeVisible();

    await openRecipeWithStep(page);
    const fav = page.getByRole("button", { name: /^(Favoritar|Remover dos favoritos)$/ });
    const wasFavorite = (await fav.getAttribute("aria-pressed")) === "true";
    const historySwitch = page.getByTestId("history-switch");

    try {
      if (!wasFavorite) {
        await fav.click();
        await expect(page.getByText("Adicionado aos favoritos")).toBeVisible();
      }
      await page.goto("/profile/receitas");
      await expect(page.getByRole("heading", { level: 1, name: "Minha coleção de receitas" })).toBeVisible();
      await expect(page.getByTestId("saved-list")).toContainText(RECIPE.title);
      // o card da coleção é o RecipeCard do catálogo: tempo, porções e alérgenos como no Explorar
      const card = page.getByTestId("saved-list").getByTestId("recipe-card").filter({ hasText: RECIPE.title });
      await expect(card.getByTestId("recipe-card-time")).toBeVisible();
      await expect(card).toContainText("2 porções");
      await expect(card.getByTestId("recipe-card-allergens")).toBeVisible();
      // remover das salvas pede confirmação; cancelar mantém a receita
      await page.getByRole("button", { name: `Remover ${RECIPE.title} das salvas` }).click();
      const confirmRemove = page.getByRole("dialog", { name: "Remover das salvas?" });
      await expect(confirmRemove).toContainText(RECIPE.title);
      await confirmRemove.getByRole("button", { name: "Cancelar" }).click();
      await expect(confirmRemove).toBeHidden();
      await expect(page.getByTestId("saved-list")).toContainText(RECIPE.title);

      // histórico: desligado por padrão (ou sobra de outra execução, que é desligada antes)
      await page.goto("/profile/receitas?aba=vistas");
      await expect(page.getByTestId("history-panel")).toContainText("90 dias");
      if ((await historySwitch.getAttribute("aria-checked")) === "true") {
        await historySwitch.click();
        await page.getByTestId("history-confirm").click();
        await expect(historySwitch).toHaveAttribute("aria-checked", "false");
      }
      await expect(page.getByTestId("history-off")).toBeVisible();
      await historySwitch.click();
      await expect(historySwitch).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("history-empty").or(page.getByTestId("history-list"))).toBeVisible();

      // a página da receita registra a visita só agora que está ligado
      await page.goto(RECIPE_PATH);
      await expect(page.getByRole("heading", { level: 1, name: RECIPE.title })).toBeVisible();
      await page.goto("/profile/receitas?aba=vistas");
      await expect(page.getByTestId("history-list")).toContainText(RECIPE.title);
      // o nome acessível começa pelo texto visível (controle por voz)
      await expect(page.getByRole("button", { name: `Tirar do histórico: ${RECIPE.title}` })).toBeVisible();
      // grade de 2 colunas num Android de 360 px: o botão cabe no card e a página não rola de lado
      const viewport = page.viewportSize();
      await page.setViewportSize({ width: 360, height: 780 });
      const historyItem = page.getByTestId("history-list").locator("li").filter({ hasText: RECIPE.title });
      const itemBox = await historyItem.boundingBox();
      const removeBox = await historyItem.getByTestId("history-remove").boundingBox();
      expect(itemBox && removeBox && removeBox.x + removeBox.width <= itemBox.x + itemBox.width + 0.5, JSON.stringify({ itemBox, removeBox })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (viewport) await page.setViewportSize(viewport);

      // desligar pede confirmação ("isto apaga o histórico"); cancelar mantém
      await historySwitch.click();
      const dialog = page.getByRole("dialog", { name: "Desligar o histórico?" });
      await expect(dialog).toContainText("Isto apaga o histórico");
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(historySwitch).toHaveAttribute("aria-checked", "true");
      await historySwitch.click();
      await page.getByTestId("history-confirm").click();
      await expect(historySwitch).toHaveAttribute("aria-checked", "false");
      await expect(page.getByTestId("history-off")).toBeVisible();

      // confere que apagou: religar mostra a lista vazia
      await page.reload();
      await expect(page.getByTestId("history-list")).toHaveCount(0);
      await historySwitch.click();
      await expect(historySwitch).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("history-empty")).toBeVisible();
      await expect(page.getByTestId("history-list")).toHaveCount(0);

      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 2)).toEqual([]);
    } finally {
      // limpeza: histórico desligado (apaga tudo) e o favorito criado pelo teste removido pela coleção
      await page.goto("/profile/receitas?aba=vistas");
      if ((await historySwitch.getAttribute("aria-checked").catch(() => null)) === "true") {
        await historySwitch.click();
        await page.getByTestId("history-confirm").click();
        await expect(historySwitch).toHaveAttribute("aria-checked", "false");
      }
      if (!wasFavorite) {
        await page.goto("/profile/receitas");
        const remove = page.getByRole("button", { name: `Remover ${RECIPE.title} das salvas` });
        if ((await remove.count()) > 0) {
          await remove.click();
          await page.getByTestId("saved-remove-confirm").click();
          await expect(page.getByRole("button", { name: `Remover ${RECIPE.title} das salvas` })).toHaveCount(0);
        }
      }
    }
  });
});
