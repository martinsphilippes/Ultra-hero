import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CookMode } from "@/components/recipes/kitchen/CookMode";
import { RecipeIngredientsPanel } from "@/components/recipes/view/RecipeIngredientsPanel";
import { RECIPE_UNITS, type RecipeUnit } from "@/lib/recipes/codes";
import { buildCookModel } from "@/lib/recipes/cook-mode";
import type { RecipeIngredientRow, RecipeRows } from "@/lib/recipes/rows";
import { parseServingsParam } from "@/lib/recipes/scale";
import { buildRecipeViewModel, type UnitLabels } from "@/lib/recipes/view-model";
import ptCommon from "../../messages/pt-BR/common.json";
import enCommon from "../../messages/en/common.json";
import esCommon from "../../messages/es/common.json";
import ptKitchen from "../../messages/pt-BR/kitchen.json";
import enKitchen from "../../messages/en/kitchen.json";
import esKitchen from "../../messages/es/kitchen.json";
import ptRecipes from "../../messages/pt-BR/recipes.json";
import enRecipes from "../../messages/en/recipes.json";
import esRecipes from "../../messages/es/recipes.json";

// Integração das fases 3 e 4: UMA regra de porções. Para as receitas do seed (g1…g9; g7 e g10 são
// vídeos) e uma receita extra com as unidades que o seed não tem, a página (RecipeIngredientsPanel)
// e o Modo Cozinha (CookMode), renderizados de verdade, mostram com ?porcoes=N as mesmas quantidades,
// o mesmo "≈", o mesmo "a gosto", "(opcional)", observação e "Não ajustado automaticamente".

vi.mock("@/app/(app)/content/recipe-actions", () => ({ trackRecipeEvent: async () => undefined }));
vi.mock("@/app/(app)/content/actions", () => ({ completeContent: async () => ({ ok: true }) }));

const ROOT = path.resolve(__dirname, "../..");
const USER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

/** Tuplas SQL `('g1', 1, 'Peito de frango', ...)` → valores (texto, número, null, booleano). */
function sqlTuples(block: string): (string | number | boolean | null)[][] {
  const out: (string | number | boolean | null)[][] = [];
  for (const line of block.split("\n")) {
    const m = line.trim().match(/^\((.*)\),?$/);
    if (!m) continue;
    const values: (string | number | boolean | null)[] = [];
    const re = /\s*('(?:[^']|'')*'|[^,]+)\s*(?:,|$)/g;
    let v: RegExpExecArray | null;
    while ((v = re.exec(m[1])) && v[0] !== "") {
      const raw = v[1].trim();
      if (raw.startsWith("'")) values.push(raw.slice(1, -1).replace(/''/g, "'"));
      else if (raw === "null") values.push(null);
      else if (raw === "true" || raw === "false") values.push(raw === "true");
      else values.push(Number(raw));
    }
    out.push(values);
  }
  return out;
}

/** As receitas do seed como a 0029 as grava (ingredientes literais) e as porções do corpo da 0008. */
function seedRecipes(): { key: string; rows: RecipeRows }[] {
  const backfill = readFileSync(path.join(ROOT, "supabase/migrations/0029_recipes_backfill.sql"), "utf8");
  const seed = readFileSync(path.join(ROOT, "supabase/migrations/0008_seed.sql"), "utf8");
  const block = backfill.slice(backfill.indexOf("-- literal:ingredients:start"), backfill.indexOf("-- literal:ingredients:end"));
  const byKey = new Map<string, RecipeIngredientRow[]>();
  for (const [key, pos, item, , quantity, unit, quantityText, toTaste, note] of sqlTuples(block)) {
    const list = byKey.get(key as string) ?? [];
    list.push({
      id: `${key}-${pos}`,
      position: pos as number,
      name: item as string,
      quantity: quantity as number | null,
      unit: unit as RecipeUnit | null,
      quantity_text: quantityText as string | null,
      to_taste: toTaste as boolean,
      optional: false,
      note: note as string | null,
      substitutions: [],
    });
    byKey.set(key as string, list);
  }
  return [...byKey.entries()].map(([key, ingredients]) => {
    const servings = Number(seed.match(new RegExp(`"servings":(\\d+)[^\\n]*seed_uuid\\('content:${key}'\\)`))?.[1]);
    expect(servings, `porções de ${key} no seed`).toBeGreaterThan(0);
    return { key, rows: recipeRows(servings, ingredients) };
  });
}

/** Uma etapa ligada a todos os ingredientes: o Modo Cozinha mostra a lista inteira na etapa 1. */
function recipeRows(servings: number, ingredients: RecipeIngredientRow[]): RecipeRows {
  return {
    details: { servings, yield_text: null, prep_minutes: null, cook_minutes: null, rest_minutes: null, total_minutes: null, story: null, diets: [], allergens: [], allergens_declared: false, allergen_notes: null, cover_media_id: null, rating_count: 0, rating_sum: 0 },
    chefNote: null,
    categories: [],
    ingredients,
    steps: [{ id: "s1", position: 1, instruction: "Prepare.", duration_seconds: null, temperature_c: null, tip: null, image_media_id: null }],
    stepIngredients: ingredients.map((i) => ({ step_id: "s1", ingredient_id: i.id })),
    media: [],
    nutrition: null,
    video: null,
  };
}

const ing = (id: string, position: number, name: string, extra: Partial<RecipeIngredientRow>): RecipeIngredientRow => ({
  id,
  position,
  name,
  quantity: null,
  unit: null,
  quantity_text: null,
  to_taste: false,
  optional: false,
  note: null,
  substitutions: [],
  ...extra,
});

// Receita acima do limite do ajuste (o editor aceita até 100 porções; o ajuste vai até 50).
const BIG = recipeRows(60, [
  ing("b1", 1, "Farinha", { quantity: 1000, unit: "g" }),
  ing("b2", 2, "Manteiga", { quantity_text: "um pote" }),
]);

// Unidades e marcas que o seed não cobre: kg, ml, mg, colher de chá, opcional e "a gosto" opcional.
const EXTRA = recipeRows(3, [
  ing("x1", 1, "Farinha", { quantity: 1.5, unit: "kg" }),
  ing("x2", 2, "Leite", { quantity: 250, unit: "ml", optional: true }),
  ing("x3", 3, "Fermento", { quantity: 1, unit: "tsp", note: "químico" }),
  ing("x4", 4, "Sal", { quantity: 300, unit: "mg" }),
  ing("x5", 5, "Raspas de limão", { to_taste: true, optional: true }),
  ing("x6", 6, "Gotas de chocolate", { quantity_text: "um punhado", optional: true }),
]);

const LOCALES = {
  "pt-BR": { recipes: ptRecipes, kitchen: ptKitchen, common: ptCommon },
  en: { recipes: enRecipes, kitchen: enKitchen, common: enCommon },
  es: { recipes: esRecipes, kitchen: esKitchen, common: esCommon },
} as const;
type Loc = keyof typeof LOCALES;

function unitLabels(locale: Loc): UnitLabels {
  const units = LOCALES[locale].recipes.structured.units as Record<string, { one: string; other: string }>;
  return Object.fromEntries(RECIPE_UNITS.map((u) => [u, [units[u].one, units[u].other] as const])) as UnitLabels;
}

function render(locale: Loc, node: ReactElement): string {
  return renderToStaticMarkup(
    // arquivo .ts (sem JSX): o tipo do provider exige children nas props
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, { locale, timeZone: "America/Sao_Paulo", messages: LOCALES[locale], children: node }),
  ).replace(/<!-- -->/g, "");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const field = (chunk: string, testid: string) => {
  const m = chunk.match(new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`));
  return m ? decode(m[1]) : null;
};

/** O que a pessoa lê em cada item: quantidade (ou "a gosto"), nome, observação, opcional e o aviso. */
type Line = { name: string; amount: string | null; note: boolean; optional: boolean; notScaled: string | null };

function lines(html: string, item: string, read: (chunk: string) => Line): Line[] {
  return html
    .split(`data-testid="${item}"`)
    .slice(1)
    .map((chunk) => read(chunk.split("</li>")[0]));
}

/** n = null: a página sem ?porcoes= (e o Modo Cozinha sem porções na URL). */
function pageLines(locale: Loc, rows: RecipeRows, n: number | null): Line[] {
  const labels = unitLabels(locale);
  const tv = LOCALES[locale].recipes.view;
  const model = buildRecipeViewModel(rows, { labels, title: "Receita", locale });
  const html = render(
    locale,
    createElement(RecipeIngredientsPanel, {
      contentId: "c1",
      userId: USER,
      ingredients: model.ingredients,
      labels: { title: tv.ingredients, optional: tv.optional, toTaste: tv.toTaste, substitutes: tv.substitutes },
      unitLabels: labels,
      locale,
      baseServings: model.servings,
      // a página lê ?porcoes= com a mesma função
      initialServings: n === null ? null : parseServingsParam(String(n)),
    }),
  );
  return lines(html, "recipe-ingredient", (chunk) => ({
    name: decode(chunk.match(/<span class="font-medium">([^<]*)<\/span>/)?.[1] ?? ""),
    amount: field(chunk, "recipe-ingredient-amount") ?? field(chunk, "recipe-ingredient-to-taste"),
    note: /> · [^<]+</.test(chunk),
    optional: chunk.includes(`>${tv.optional}<`) || chunk.includes(` ${tv.optional}<`),
    notScaled: field(chunk, "recipe-ingredient-not-scaled"),
  }));
}

/** As duas listas do Modo Cozinha: "Nesta etapa" (`step`) e todos os ingredientes do painel (`all`). */
function cookLines(locale: Loc, rows: RecipeRows, n: number | null, list: "step" | "all" = "step"): Line[] {
  const tv = LOCALES[locale].recipes.view;
  const servings = n === null ? null : parseServingsParam(String(n));
  const model = buildCookModel(rows, { contentId: "c1", slug: "receita", title: "Receita", labels: unitLabels(locale), locale, servings });
  const full = render(locale, createElement(CookMode, { model, userId: USER, recipeHref: "/content/receita", completedLabel: null }));
  const marker = `data-testid="${list === "step" ? "cook-step-ingredients" : "cook-all-ingredients"}"`;
  expect(full, `lista ${list} renderizada`).toContain(marker);
  const html = full.slice(full.indexOf(marker)).split("</ul>")[0];
  return lines(html, "cook-ingredient", (chunk) => ({
    name: field(chunk, "cook-ingredient-name") ?? "",
    amount: field(chunk, "cook-ingredient-amount"),
    note: /> · [^<]+</.test(chunk),
    optional: chunk.includes(`>${tv.optional}<`),
    notScaled: field(chunk, "cook-ingredient-not-scaled"),
  }));
}

const SERVINGS = [1, 3, 4, 7, 50];
const recipes = [...seedRecipes(), { key: "extra", rows: EXTRA }];

describe("porções: página da receita × Modo Cozinha", () => {
  it("o seed traz as 8 receitas estruturadas (g1…g6, g8, g9)", () => {
    expect(recipes.map((r) => r.key)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g8", "g9", "extra"]);
  });

  for (const locale of Object.keys(LOCALES) as Loc[]) {
    for (const { key, rows } of recipes) {
      it(`${key} (${locale}): mesmas quantidades, "≈" e avisos com N = ${SERVINGS.join(", ")}`, () => {
        for (const n of SERVINGS) {
          const page = pageLines(locale, rows, n);
          expect(page.length, `${key} N=${n}`).toBe(rows.ingredients.length);
          expect(cookLines(locale, rows, n, "step"), `${key} N=${n} (etapa)`).toEqual(page);
          expect(cookLines(locale, rows, n, "all"), `${key} N=${n} (todos)`).toEqual(page);
        }
      });
    }
  }

  for (const locale of Object.keys(LOCALES) as Loc[]) {
    it(`receita de 60 porções (${locale}): sem ?porcoes= (e com ?porcoes=60, fora de 1–50) mostra os números do chef nos dois lados`, () => {
      for (const n of [null, 60]) {
        const page = pageLines(locale, BIG, n);
        expect(page.map((l) => l.amount), `N=${n}`).toEqual(["1000 g", "um pote"]);
        expect(page.every((l) => l.notScaled === null), `N=${n}: sem aviso`).toBe(true);
        expect(cookLines(locale, BIG, n, "step")).toEqual(page);
        expect(cookLines(locale, BIG, n, "all")).toEqual(page);
      }
      // com N = 4 os dois lados ajustam igual
      const page4 = pageLines(locale, BIG, 4);
      expect(page4[0].amount).toBe("≈ 65 g");
      expect(cookLines(locale, BIG, 4, "all")).toEqual(page4);
    });
  }

  it("confere valores conhecidos (pt-BR)", () => {
    const byName = (list: Line[]) => new Map(list.map((l) => [l.name, l]));
    const g1 = recipes.find((r) => r.key === "g1")!.rows;
    // g1 rende 2: com 4, "300 g" vira "600 g" e o texto livre fica com o aviso
    const g1at4 = byName(cookLines("pt-BR", g1, 4));
    expect(g1at4.get("Peito de frango")?.amount).toBe("600 g");
    expect(g1at4.get("Azeite")?.amount).toBe("4 colheres de sopa");
    expect(g1at4.get("Molho de ervas (receita da plataforma)")).toMatchObject({ amount: "3 colheres", notScaled: "Não ajustado automaticamente" });
    expect(g1at4.get("Batata-doce")).toMatchObject({ amount: "2", note: true });
    // N igual às porções da receita: nenhum aviso
    expect(cookLines("pt-BR", g1, 2).every((l) => l.notScaled === null)).toBe(true);
    // g2 rende 8: com 7, 10 ovos = 8,75 → "≈ 9"; "a gosto" com o aviso
    const g2at7 = byName(pageLines("pt-BR", recipes.find((r) => r.key === "g2")!.rows, 7));
    expect(g2at7.get("Ovos")?.amount).toBe("≈ 9");
    expect(g2at7.get("Sal e orégano")).toMatchObject({ amount: "a gosto", notScaled: "Não ajustado automaticamente" });
    // receita extra (rende 3) com 50: kg, ml, colher de chá e opcional
    const extra50 = byName(cookLines("pt-BR", EXTRA, 50));
    expect(extra50.get("Farinha")?.amount).toBe("25 kg");
    // 250 ml × 50/3 = 4166,7 → 4200 (menos de 1% de diferença: sem "≈", como na página)
    expect(extra50.get("Leite")).toMatchObject({ amount: "4200 ml", optional: true });
    expect(extra50.get("Fermento")).toMatchObject({ amount: "16 3/4 colheres de chá", note: true });
    // com 1 porção: 250/3 = 83,3 → 85 ml com "≈"
    expect(byName(cookLines("pt-BR", EXTRA, 1)).get("Leite")?.amount).toBe("≈ 85 ml");
  });
});

// A costura do merge em /content/[slug] (fases 3 e 4): conferida no código-fonte porque a página é um
// componente de servidor com banco; o E2E cobre o comportamento contra o banco remoto.
describe("costura da página da receita com o Modo Cozinha", () => {
  const page = readFileSync(path.join(ROOT, "src/app/(app)/content/[slug]/page.tsx"), "utf8");
  const cook = readFileSync(path.join(ROOT, "src/app/(focus)/content/[slug]/cozinha/page.tsx"), "utf8");

  it("a receita só abre com acesso e a etapa feita (visitante, bloqueada e sem etapa ficam de fora)", () => {
    expect(page).toMatch(/const recipeOpen = isRecipe && state === "accessible" && !recipeBlocked;/);
    expect(page).toMatch(/const state: State = !user\s*\? "visitor"/);
  });

  it("histórico e botão do Modo Cozinha só com a receita aberta; o botão fica na linha de ações, fora da impressão", () => {
    expect(page).toMatch(/\{recipeOpen && structured \? <RecipeKitchenEntry contentId=\{content\.id\} \/> : null\}/);
    expect(page.match(/<RecipeKitchenEntry/g)).toHaveLength(1);
    expect(page.match(/<CookModeLink /g)).toHaveLength(1);
    const group = page.lastIndexOf("<div", page.indexOf('role="group" aria-label={t("actionsLabel")}'));
    const actions = page.slice(group);
    expect(actions.slice(0, actions.indexOf(">"))).toContain("print:hidden");
    expect(actions.slice(0, actions.indexOf("<CookModeLink "))).toMatch(/\{recipeOpen && structured \? \(\s*<Suspense fallback=\{<CookModeLinkView/);
  });

  it("o Modo Cozinha lê a receita completa (sem publicOnly) e as porções com a regra da página", () => {
    expect(cook).toMatch(/loadRecipeRows\(supabase, content\.id\),/);
    expect(cook).not.toMatch(/publicOnly\s*:/);
    expect(cook).toContain('import { parseServingsParam } from "@/lib/recipes/scale";');
  });

  it("o rótulo do botão existe nos 3 idiomas", () => {
    expect([ptKitchen.entry.open, enKitchen.entry.open, esKitchen.entry.open]).toEqual(["Modo Cozinha", "Cook mode", "Modo cocina"]);
  });
});
