import { expect, type Page } from "@playwright/test";

// Limpeza das receitas de teste da conta demo do herói (Minhas Receitas), pela própria tela: rascunho é
// excluído; publicada é arquivada e depois excluída (0036). A conta demo é compartilhada com outras
// execuções simultâneas (outro projeto do Playwright, outras máquinas): por isso a limpeza só leva o que
// é desta execução (título exato) ou sobras antigas (título "<prefixo> <Date.now()>" com mais de 15 min),
// nunca o rascunho que outra execução ainda está usando.

const STALE_MS = 15 * 60_000;

/** Título "<prefixo> <Date.now()>[...]" → horário de criação, ou null. */
function createdAt(title: string, prefix: string): number | null {
  const match = title.slice(prefix.length).match(/^\s+(\d{13})/);
  return match ? Number(match[1]) : null;
}

type Options = {
  /** Só as receitas cujo título começa com este texto (as desta execução). */
  title?: string;
};

/**
 * Tira do remoto as receitas de teste do herói com o prefixo: as desta execução (`title`) ou, sem
 * `title`, as sobras com mais de 15 minutos. Devolve quantas saíram.
 */
export async function purgeTestRecipes(page: Page, prefix: string, { title }: Options = {}): Promise<number> {
  let removed = 0;
  for (let i = 0; i < 12; i++) {
    await page.goto(`/creator/recipes?q=${encodeURIComponent(title ?? prefix)}`);
    const menus = page.getByTestId("recipe-row-menu");
    const labels = await menus.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    const index = labels.findIndex((label) => {
      const rowTitle = label.replace(/^Ações de /, "");
      if (title) return rowTitle.startsWith(title);
      if (!rowTitle.startsWith(prefix)) return false;
      const at = createdAt(rowTitle, prefix);
      return at === null || Date.now() - at > STALE_MS;
    });
    if (index < 0) return removed;
    await menus.nth(index).click();
    const remove = page.getByTestId("recipe-delete");
    const archive = page.getByRole("button", { name: "Arquivar", exact: true });
    if (await remove.isVisible()) await remove.click();
    else if (await archive.isVisible()) await archive.click();
    else throw new Error(`receita de teste sem "Arquivar" nem "Excluir": ${labels[index]}`);
    await page.getByTestId("recipe-confirm").click();
    await expect(page.getByTestId("recipe-confirm")).toHaveCount(0, { timeout: 20_000 });
    removed += 1;
  }
  throw new Error(`não consegui tirar do remoto as receitas "${title ?? prefix}"`);
}

/** Confere que nenhuma receita desta execução sobrou (o título exato não aparece mais na lista). */
export async function expectNoTestRecipe(page: Page, title: string) {
  await page.goto(`/creator/recipes?q=${encodeURIComponent(title)}`);
  await expect(page.getByTestId("recipes-count")).toHaveText("Nenhuma receita");
}
