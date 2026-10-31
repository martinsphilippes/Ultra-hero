import { expect, test, type Page } from "@playwright/test";

// Entrada pelas contas de demonstração (painel "Contas de demonstração" do /login). Compartilhado pelos
// specs que repetiam o mesmo trecho; cada um continua dizendo para onde espera ir depois do login.

export type DemoKind = "creator" | "admin" | "premium" | "free" | "agency" | "agencyStaff" | "brand";

/** Todo login chega na aba Hero. */
export const LOGIN_LANDING = /\/personalities$/;

/** Área de cada conta demo (o portal ou a tela que os specs usam depois do login). O herói não tem mais
 *  painel (0045: só o admin gerencia conteúdo pelos heróis): a área dele é o Perfil, com o Novo post. */
export const DEMO_HOME: Record<DemoKind, RegExp> = {
  creator: /\/profile$/,
  admin: /\/admin$/,
  premium: /\/profile$/,
  free: /\/explore/,
  // gestão (0064): contas criadas pelo admin geral em /admin/agencia
  agency: /\/agencia$/,
  agencyStaff: /\/agencia$/,
  brand: /\/marca$/,
};
const DEMO_PATH: Record<DemoKind, string> = {
  creator: "/profile",
  admin: "/admin",
  premium: "/profile",
  free: "/explore",
  agency: "/agencia",
  agencyStaff: "/agencia",
  brand: "/marca",
};

type Options = {
  /** Onde a conta deve estar depois do login (padrão: DEMO_HOME); null fica na aba Hero, onde o login chega. */
  home?: RegExp | null;
};

/**
 * Entra com a conta demo, confere que o login chegou na aba Hero e, se pedido, abre a área da conta.
 * Pula o teste quando as contas de demonstração estão desligadas no ambiente.
 */
export async function loginAs(page: Page, kind: DemoKind, { home = DEMO_HOME[kind] }: Options = {}) {
  await page.goto("/login");
  const panel = page.getByTestId("demo-access");
  test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
  // conta opcional ainda não criada pelo admin (gestão): pula em vez de estourar o tempo
  test.skip((await panel.locator(`[data-demo-kind="${kind}"]`).count()) === 0, `conta de demonstração ${kind} ainda não criada`);
  await panel.locator(`[data-demo-kind="${kind}"]`).click();
  await expect(page).toHaveURL(LOGIN_LANDING, { timeout: 20_000 });
  if (!home) return;
  await page.goto(DEMO_PATH[kind]);
  await expect(page).toHaveURL(home, { timeout: 20_000 });
}

/**
 * Encerra a sessão só neste navegador (apaga os cookies do Supabase) e confere que /profile volta a pedir
 * login. Não depende do botão "Sair" (que hoje encerra só este aparelho), para não mexer nas outras
 * sessões da mesma conta demo abertas em paralelo (outros testes e quem estiver usando a demonstração).
 */
export async function endSession(page: Page) {
  await page.context().clearCookies({ name: /^sb-/ });
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}
