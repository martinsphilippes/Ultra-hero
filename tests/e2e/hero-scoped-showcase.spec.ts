import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login";

// Página do herói só com o que é do herói (0052). Só leitura, contra o banco remoto, com e sem a 0052:
// - Treinos = só o que foi postado como treino (tipo workout); vídeo/guia do pilar treino vai para Dia a
//   dia (regra do app, vale com ou sem a 0052);
// - as bibliotecas de conteúdo (menos Alimentação, que também tem as receitas indicadas) e a grade de posts
//   só têm conteúdo do próprio herói;
// - Programas: com a 0052, toda etapa é conteúdo do próprio herói (sem ela, a tela do admin marca as de
//   outro herói).

const HEROES = [
  { slug: "neymar", name: "Neymar" },
  { slug: "joao-fonseca", name: "João Fonseca" },
  { slug: "anitta", name: "Anitta" },
  { slug: "ronaldinho-gaucho", name: "Ronaldinho Gaúcho" },
  { slug: "gabriel-medina", name: "Gabriel Medina" },
  { slug: "erick-jacquin", name: "Érick Jacquin" },
];
// a página do herói não mostra o "Treino" sozinho: o nome acessível do quadro é "Título · Herói · Tipo[ · restrição]"
const TYPE_LABELS = ["Vídeo", "Receita", "Treino", "Guia", "Artigo"];

const shortcuts = (page: Page) => page.getByTestId("hero-libraries").getByRole("link");

/** Nome acessível (sr-only) de cada quadro da grade. */
async function tileLabels(page: Page, testId: string): Promise<string[]> {
  return page.getByTestId(testId).locator("> a").evaluateAll((nodes) => nodes.map((n) => n.querySelector(".sr-only")?.textContent?.trim() ?? ""));
}

function typeOf(label: string): string | undefined {
  return label.split(" · ").find((part) => TYPE_LABELS.includes(part));
}

/** Conteúdos do próprio herói (grade de posts da página dele). */
async function ownContentHrefs(page: Page, slug: string): Promise<Set<string>> {
  await page.goto(`/personalities/${slug}`);
  await expect(page.getByTestId("hero-stats")).toBeVisible();
  return new Set(await page.getByTestId("hero-posts").locator('a[href^="/content/"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? "")));
}

test.describe("página do herói: só o que é do herói", () => {
  test("Treinos do Neymar só tem o que foi postado como treino; o guia do tênis fica em Dia a dia", async ({ page }) => {
    await page.goto("/personalities/neymar");
    await expect(shortcuts(page).first()).toBeVisible();
    await expect(page.locator('[data-testid="hero-libraries"] a[data-library="treinos"]')).toHaveCount(1);

    await page.goto("/personalities/neymar/treinos");
    const labels = await tileLabels(page, "library-grid");
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(typeOf(label), `Treinos: "${label}"`).toBe("Treino");
      expect(label, `Treinos: "${label}"`).toContain("Neymar");
    }

    await page.goto("/personalities/neymar/dia-a-dia");
    await expect(page.getByTestId("library-grid").locator('a[href="/content/como-escolher-o-tenis-de-corrida-t8"]')).toHaveCount(1);
    for (const label of await tileLabels(page, "library-grid")) expect(typeOf(label), `Dia a dia: "${label}"`).not.toBe("Treino");
  });

  test("grade de posts e bibliotecas de conteúdo (menos Alimentação) só com conteúdo do herói; Treinos só com treinos", async ({ page }) => {
    for (const hero of HEROES) {
      await page.goto(`/personalities/${hero.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(hero.name);
      for (const label of await tileLabels(page, "hero-posts")) expect(label, `${hero.slug} posts: "${label}"`).toContain(` · ${hero.name} · `);

      const keys = await page.locator('[data-testid="hero-libraries"] a[data-library]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-library") ?? ""));
      for (const key of keys.filter((k) => ["dia-a-dia", "nutricao", "treinos", "gastronomia"].includes(k))) {
        await page.goto(`/personalities/${hero.slug}/${key}`);
        const labels = await tileLabels(page, "library-grid");
        expect(labels.length, `${hero.slug}/${key} tem itens`).toBeGreaterThan(0);
        for (const label of labels) {
          expect(label, `${hero.slug}/${key}: "${label}"`).toContain(` · ${hero.name} · `);
          if (key === "treinos") expect(typeOf(label), `${hero.slug}/treinos: "${label}"`).toBe("Treino");
          else expect(typeOf(label), `${hero.slug}/${key}: "${label}"`).not.toBe("Treino");
        }
      }
    }
  });

  test("com a 0052, toda etapa dos programas do herói é conteúdo dele", async ({ page }) => {
    const foreignBySlug: Record<string, string[]> = {};
    for (const slug of ["neymar", "anitta", "joao-fonseca", "ronaldinho-gaucho"]) {
      const own = await ownContentHrefs(page, slug);
      await page.goto(`/personalities/${slug}/programas`);
      await expect(page.getByTestId("program-shelf").first()).toBeVisible();
      const hrefs = await page.getByTestId("shelf-step").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? ""));
      expect(hrefs.length, `${slug}: etapas`).toBeGreaterThan(0);
      foreignBySlug[slug] = hrefs.filter((href) => !own.has(href));
    }
    // sem a 0052 os programas ainda têm etapas de outro herói (legado da 0044; o Neymar tem 4)
    test.skip(foreignBySlug.neymar.length === 4, "banco sem a 0052: programas com etapas de outro herói");
    expect(foreignBySlug).toEqual({ neymar: [], anitta: [], "joao-fonseca": [], "ronaldinho-gaucho": [] });
  });
});

test.describe("admin: programa e produtos do herói (só leitura)", () => {
  test("a versão do programa marca etapa de outro herói (sem a 0052) e não marca nenhuma com ela", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/programs");
    await page.locator('main a[href^="/admin/programs/"]').filter({ hasText: "Mobilidade para Correr Melhor" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.locator('main a[href*="/versions/"]').first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Mobilidade para Correr Melhor" })).toBeVisible();
    const items = page.getByRole("list", { name: "Itens da versão" }).getByRole("listitem");
    await expect(items.first()).toBeVisible();
    const total = await items.count();
    const foreign = await items.filter({ hasText: "De outro herói" }).count();
    // remoto sem a 0052: 6 etapas, 2 do João Fonseca; com a 0052: 4, todas do Neymar
    if (total === 6) expect(foreign).toBe(2);
    else expect(foreign).toBe(0);
  });

  test("a tela do herói tem o atalho para os produtos que ele indica", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/creators");
    await page.locator('main a[href^="/admin/creators/"]').filter({ hasText: "Neymar" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Neymar" })).toBeVisible();
    const jump = page.getByTestId("hero-products-jump");
    await expect(jump).toHaveText(/Produtos vinculados \(\d+\)/);
    await expect(jump).toHaveAttribute("href", "#hero-products");
    await jump.click();
    await expect(page.getByRole("heading", { level: 2, name: "Produtos do herói" })).toBeInViewport();
  });
});
