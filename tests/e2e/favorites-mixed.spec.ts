import { expect as baseExpect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { favoritesAcceptProductsAndPrograms, ownFavoriteTargets, publicIdBySlug, setOwnFavorite, type FavoriteColumn } from "./helpers/supabase";

// Favoritos com produtos e programas (migração 0041), contra o banco remoto. Conta demo free: favorita
// um produto Ultra.e Life e um programa pelo coração das páginas deles, confere o bloco Favoritos
// (Explorar › Listas) e Perfil › Favoritos, DESFAVORITA (um pelo Perfil, outro pelo coração) e, no
// afterEach — mesmo em falha —, devolve os dois ao estado de antes do teste. Os favoritos de conteúdo
// da conta (g1 e g3) não são tocados: o teste confere que seguem iguais.
// Enquanto o remoto não tiver a 0041 o teste pula: a pergunta é feita ao próprio banco.
// Roda só no projeto mobile: a conta é a mesma nos dois projetos e os favoritos disputariam o estado.

const PRODUCT = { slug: "e-creatina-po", path: "/shop/e-creatina-po", title: /e\.creatina Pó/, column: "product_id" as FavoriteColumn, kind: "product" };
const PROGRAM = { slug: "manhas-com-intencao", path: "/programs/manhas-com-intencao", title: "Manhãs com Intenção", column: "program_id" as FavoriteColumn, kind: "program" };
// cada passo relê o banco remoto: mais folga que os 5 s padrão
const expect = baseExpect.configure({ timeout: 15_000 });

const favoritesBlock = (page: Page) => page.locator('section[aria-labelledby="favorites-title"]');
const entry = (scope: ReturnType<Page["locator"]> | Page, kind: string) => scope.locator(`[data-testid="favorite-entry"][data-kind="${kind}"]`);

test.beforeEach(async ({ context, baseURL }) => {
  // uh-e2e=1: nenhum evento de análise é gravado por este navegador
  await context.addCookies([{ name: "uh-e2e", value: "1", url: baseURL! }]);
});

test.describe("favoritos com produto e programa", () => {
  // estado de antes do teste (id do alvo → estava favoritado?), devolvido no afterEach
  let initial: { column: FavoriteColumn; id: string; favorite: boolean }[] = [];

  test.afterEach(async ({ page }) => {
    // limpeza mesmo quando o teste falha ou estoura o tempo (a página ainda tem a sessão)
    for (const item of initial) await setOwnFavorite(page, item.column, item.id, item.favorite).catch(() => undefined);
    initial = [];
  });

  test("favorita um produto e um programa, confere nas telas de favoritos e desfavorita", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a conta demo é compartilhada entre os projetos");
    const supported = await favoritesAcceptProductsAndPrograms();
    test.skip(supported !== true, "o banco ainda não tem a 0041 (favorites.item_type)");
    const [productId, programId] = await Promise.all([publicIdBySlug("products", PRODUCT.slug), publicIdBySlug("programs", PROGRAM.slug)]);
    test.skip(!productId || !programId, "produto ou programa de referência fora do ar");

    await loginAs(page, "free");
    const contentBefore = await ownFavoriteTargets(page, "content_id");
    for (const [target, id] of [[PRODUCT, productId!], [PROGRAM, programId!]] as const) {
      const had = (await ownFavoriteTargets(page, target.column)).includes(id);
      initial.push({ column: target.column, id, favorite: had });
      // começa sempre sem o favorito (o estado de antes volta no afterEach)
      if (had) await setOwnFavorite(page, target.column, id, false);
    }

    // 1) coração nas páginas: abre vazio, favorita, e abre cheio depois de recarregar
    for (const target of [PRODUCT, PROGRAM]) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { level: 1, name: target.title })).toBeVisible();
      const heart = page.getByTestId("favorite-button");
      await expect(heart).toHaveAttribute("aria-pressed", "false");
      await expect(heart).toHaveAccessibleName("Favoritar");
      await heart.click();
      await expect(page.getByText("Adicionado aos favoritos").first()).toBeVisible();
      // o coração é controlado pelo servidor (revalida a página): espera o estado, não só o clique
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await expect(page.getByTestId("favorite-button")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("favorite-button")).toHaveAccessibleName("Remover dos favoritos");
    }

    // 2) bloco Favoritos (Explorar › Listas): os dois com o card do seu tipo
    await page.goto("/explore?tab=listas");
    const block = favoritesBlock(page);
    await expect(entry(block, "product").getByRole("heading", { name: PRODUCT.title })).toBeVisible();
    await expect(entry(block, "program").getByRole("heading", { name: PROGRAM.title })).toBeVisible();

    // 3) Perfil › Favoritos: os dois, e a contagem é a dos cards na tela
    await page.goto("/profile/favorites");
    const productEntry = entry(page, "product").filter({ has: page.getByRole("heading", { name: PRODUCT.title }) });
    await expect(productEntry).toBeVisible();
    await expect(entry(page, "program").filter({ has: page.getByRole("heading", { name: PROGRAM.title }) })).toBeVisible();
    const shown = await page.getByTestId("favorite-entry").count();
    await expect(page.getByText(shown === 1 ? "1 favorito" : `${shown} favoritos`, { exact: true })).toBeVisible();

    // 4) desfavorita o produto pelo Perfil
    await productEntry.getByRole("button", { name: /^Remover e\.creatina Pó.* dos favoritos$/ }).click();
    await expect(page.getByText("Removido dos favoritos.").first()).toBeVisible();
    await expect(productEntry).toHaveCount(0);

    // 5) desfavorita o programa pelo coração da página
    await page.goto(PROGRAM.path);
    const heart = page.getByTestId("favorite-button");
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await heart.click();
    await expect(page.getByText("Removido dos favoritos").first()).toBeVisible();
    await expect(heart).toHaveAttribute("aria-pressed", "false");

    // 6) o bloco Favoritos volta sem os dois; os favoritos de conteúdo seguem iguais
    await page.goto("/explore?tab=listas");
    await expect(favoritesBlock(page).getByRole("heading", { level: 2 })).toBeVisible();
    await expect(entry(favoritesBlock(page), "product")).toHaveCount(0);
    await expect(entry(favoritesBlock(page), "program")).toHaveCount(0);
    expect(await ownFavoriteTargets(page, "content_id")).toEqual(contentBefore);
  });

  // O app vai ao ar antes da migração: nesse intervalo, produto e programa abrem sem o coração e as telas
  // de favoritos leem só conteúdos, sem erro. Só leitura.
  test("sem a 0041 no banco: produto e programa sem coração, telas de favoritos como antes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a conta demo é compartilhada entre os projetos");
    const supported = await favoritesAcceptProductsAndPrograms();
    test.skip(supported !== false, "o banco já tem a 0041 (o teste acima cobre o coração)");

    await loginAs(page, "free");
    for (const target of [PRODUCT, PROGRAM]) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { level: 1, name: target.title })).toBeVisible();
      await expect(page.getByTestId("favorite-button")).toHaveCount(0);
    }
    await page.goto("/explore?tab=listas");
    await expect(favoritesBlock(page).getByRole("heading", { level: 2 })).toBeVisible();
    await expect(page.getByText("Não foi possível carregar")).toHaveCount(0);
    // os favoritos de conteúdo da conta aparecem como antes (só conteúdos)
    await expect(entry(favoritesBlock(page), "content").first()).toBeVisible();
    await expect(entry(favoritesBlock(page), "product")).toHaveCount(0);

    await page.goto("/profile/favorites");
    await expect(page.getByRole("heading", { level: 1, name: "Favoritos" })).toBeVisible();
    await expect(entry(page, "content").first()).toBeVisible();
    const shown = await page.getByTestId("favorite-entry").count();
    await expect(page.getByText(shown === 1 ? "1 favorito" : `${shown} favoritos`, { exact: true })).toBeVisible();
  });
});
