import { expect, test, type Page } from "@playwright/test";

// Entrada pelas contas de demonstração (painel "Contas de demonstração" do /login). Compartilhado pelos
// specs que repetiam o mesmo trecho; cada um continua dizendo para onde espera ir depois do login.

export type DemoKind = "creator" | "admin" | "premium" | "free";

/** Tela inicial de cada conta demo depois do login. */
export const DEMO_HOME: Record<DemoKind, RegExp> = {
  creator: /\/creator$/,
  admin: /\/admin$/,
  premium: /\/profile$/,
  free: /\/explore/,
};

type Options = {
  /** Onde a conta deve chegar (padrão: DEMO_HOME); null só confere que saiu do /login. */
  home?: RegExp | null;
};

/** Entra com a conta demo; pula o teste quando as contas de demonstração estão desligadas no ambiente. */
export async function loginAs(page: Page, kind: DemoKind, { home = DEMO_HOME[kind] }: Options = {}) {
  await page.goto("/login");
  const panel = page.getByTestId("demo-access");
  test.skip((await panel.count()) === 0, "contas de demonstração desligadas neste ambiente");
  await panel.locator(`[data-demo-kind="${kind}"]`).click();
  if (home) await expect(page).toHaveURL(home, { timeout: 20_000 });
  else await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/**
 * Encerra a sessão só neste navegador (apaga os cookies do Supabase) e confere que /profile volta a pedir
 * login. Não usa o botão "Sair": ele chama signOut() no escopo padrão (global), que derrubaria as outras
 * sessões da mesma conta demo abertas em paralelo (outros testes e quem estiver usando a demonstração).
 */
export async function endSession(page: Page) {
  await page.context().clearCookies({ name: /^sb-/ });
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}
