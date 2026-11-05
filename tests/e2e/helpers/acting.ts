import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./login";
import { seedUuid } from "./seed";
import { rpcExists } from "./supabase";

// "Publicar como hero" (0045): só o admin cria e gerencia conteúdo pelos Heros. Os fluxos que eram do
// Hero (receitas, vínculos, painel, conteúdos) agora entram como admin e escolhem o Hero no seletor
// do início do admin. O Hero escolhido nos testes é o da conta demo do Hero (seed 'creator:helena':
// o id não muda quando o nome ou o slug do Hero mudam).

export const DEMO_HERO_ID = seedUuid("creator:helena");

export type HeroCard = "post" | "newContent" | "content" | "recipes" | "links" | "dashboard";

/** Para onde cada atalho leva depois da escolha. */
export const CARD_URL: Record<HeroCard, RegExp> = {
  post: /\/heroi\/post\/novo$/,
  newContent: new RegExp(`/admin/content/new\\?creator=${DEMO_HERO_ID}$`),
  content: new RegExp(`/admin/content\\?creator=${DEMO_HERO_ID}$`),
  recipes: /\/heroi\/receitas$/,
  links: /\/heroi\/vinculos$/,
  dashboard: /\/heroi$/,
};

/** O banco dos E2E já tem a 0045? Sem ela os fluxos do admin pelo Hero ficam indisponíveis. */
export async function actingAvailable(): Promise<boolean | null> {
  return rpcExists("admin_act_as_hero", { p_creator: DEMO_HERO_ID });
}

/** Pula o teste quando o banco ainda não tem a 0045. */
export async function skipWithoutActing() {
  test.skip((await actingAvailable()) === false, "precisa da 0045 aplicada no banco (Publicar como hero)");
}

/** Já logado como admin: toca no atalho do início do admin, escolhe o Hero e confere a tela e a faixa. */
export async function actAsHero(page: Page, card: HeroCard, heroId = DEMO_HERO_ID) {
  await page.goto("/admin");
  const section = page.getByTestId("hero-publishing");
  await expect(section).toBeVisible();
  // o seletor é um componente do cliente: o toque antes da hidratação se perde
  await page.waitForLoadState("networkidle");
  await section.getByTestId(`hero-action-${card}`).click();
  const picker = page.getByTestId("hero-picker");
  await expect(picker).toBeVisible();
  await picker.locator(`[data-hero-id="${heroId}"]`).click();
  if (heroId === DEMO_HERO_ID) await expect(page).toHaveURL(CARD_URL[card], { timeout: 30_000 });
  await expect(page.getByTestId("acting-hero-banner")).toBeVisible();
}

/** Entra como admin e abre o fluxo pelo Hero da conta demo (pula sem a 0045). */
export async function loginAsAdminActing(page: Page, card: HeroCard) {
  await skipWithoutActing();
  await loginAs(page, "admin");
  await actAsHero(page, card);
}
