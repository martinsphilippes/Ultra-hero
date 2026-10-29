import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeIngredientList } from "@/components/recipes/view/RecipeIngredientList";
import { matchDeclaredAllergens } from "@/lib/recipes/allergy-match";
import { ingredientCheckKey, INGREDIENT_CHECK_TTL_MS, readIngredientChecks, staleIngredientCheckKeys, writeIngredientChecks } from "@/lib/recipes/ingredient-check";
import { buildRecipeJsonLd, isoDuration, recipesSeoIndexEnabled, serializeJsonLd } from "@/lib/recipes/jsonld";
import { UNIT_LABELS_PT } from "@/lib/recipes/quantity";
import type { RecipeRows } from "@/lib/recipes/rows";
import { clampServings, parseServingsParam, scaleQuantity, servingsFactor, servingsHref } from "@/lib/recipes/scale";
import { buildRecipeViewModel, scaledAmount, type ScaledAmount } from "@/lib/recipes/view-model";

// Página da receita (fase 3): ajuste de porções (só itens numéricos, arredondamento de cozinha),
// checklist de 24 h, cruzamento de alérgenos só com o declarado, JSON-LD atrás do interruptor.

const G1: RecipeRows = {
  details: { servings: 2, yield_text: null, prep_minutes: 15, cook_minutes: 25, rest_minutes: null, total_minutes: 35, story: null, diets: [], allergens: [], allergens_declared: false, allergen_notes: null, cover_media_id: null, rating_count: 0, rating_sum: 0 },
  chefNote: null,
  categories: ["almoco"],
  ingredients: [
    { id: "a0", position: 1, name: "Peito de frango", quantity: 300, unit: "g", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [{ name: "Tofu firme", quantity: 300, unit: "g", quantity_text: null, note: null }] },
    { id: "a1", position: 2, name: "Batata-doce", quantity: 1, unit: null, quantity_text: null, to_taste: false, optional: false, note: "média", substitutions: [] },
    { id: "a2", position: 3, name: "Azeite", quantity: 2, unit: "tbsp", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [] },
    { id: "a3", position: 4, name: "Molho de ervas", quantity: null, unit: null, quantity_text: "3 colheres", to_taste: false, optional: true, note: null, substitutions: [] },
    { id: "a4", position: 5, name: "Sal", quantity: null, unit: null, quantity_text: null, to_taste: true, optional: false, note: null, substitutions: [] },
  ],
  steps: [],
  stepIngredients: [],
  media: [],
  nutrition: null,
  video: null,
};
const model = buildRecipeViewModel(G1, { labels: UNIT_LABELS_PT, title: "Bowl" });

describe("ajuste de porções", () => {
  it("lê ?porcoes= só de 1 a 50 e inteiro", () => {
    expect(parseServingsParam("4")).toBe(4);
    expect(parseServingsParam(["8", "2"])).toBe(8);
    for (const bad of ["0", "51", "2.5", "-1", "abc", "", undefined, null]) expect(parseServingsParam(bad as string)).toBeNull();
    expect(clampServings(0)).toBe(1);
    expect(clampServings(99)).toBe(50);
  });

  it("fator = alvo / porções da receita; sem porções não ajusta", () => {
    expect(servingsFactor(2, 4)).toBe(2);
    expect(servingsFactor(2, null)).toBe(1);
    expect(servingsFactor(null, 4)).toBe(1);
    // receita acima do limite do ajuste (até 100 no editor): nas porções originais, nada muda
    expect(servingsFactor(60, 60)).toBe(1);
    expect(servingsFactor(60, 50)).toBeCloseTo(50 / 60);
  });

  it("g1 de 2 para 4 porções: '300 g' vira '600 g' e '3 colheres' não ajusta", () => {
    const f = servingsFactor(2, 4);
    const amounts = Object.fromEntries(model.ingredients.map((i) => [i.name, scaledAmount(i, f, UNIT_LABELS_PT)]));
    expect(amounts["Peito de frango"]).toEqual({ text: "600 g", approx: false, scaled: true });
    expect(amounts["Batata-doce"]).toEqual({ text: "2", approx: false, scaled: true });
    expect(amounts["Azeite"]).toEqual({ text: "4 colheres de sopa", approx: false, scaled: true });
    expect(amounts["Molho de ervas"]).toEqual({ text: "3 colheres", approx: false, scaled: false });
    expect(amounts["Sal"]).toEqual({ text: null, approx: false, scaled: false });
    // a substituição também acompanha
    expect(scaledAmount(model.ingredients[0].substitutions[0], f, UNIT_LABELS_PT).text).toBe("600 g");
  });

  it("massa e volume: 2 algarismos significativos acima de 10; g e ml em múltiplos de 5", () => {
    expect(scaleQuantity(300, "g", 4 / 3)).toEqual({ quantity: 400, approx: false });
    expect(scaleQuantity(250, "g", 1 / 3)).toEqual({ quantity: 85, approx: true }); // 83,3 → 83 → 85
    expect(scaleQuantity(1234, "g", 1.01).quantity).toBe(1200);
    expect(scaleQuantity(1.5, "l", 1 / 3)).toEqual({ quantity: 0.5, approx: false });
    expect(scaleQuantity(1.5, "l", 7 / 6)).toEqual({ quantity: 1.75, approx: false });
    expect(scaleQuantity(5, "g", 0.5)).toEqual({ quantity: 2.5, approx: false });
    expect(scaleQuantity(30, "kg", 1.5)).toEqual({ quantity: 45, approx: false });
  });

  it("xícara e colheres no quarto mais próximo; contagem no meio, com ≈", () => {
    expect(scaleQuantity(1, "cup", 1 / 3)).toEqual({ quantity: 0.25, approx: true });
    expect(scaleQuantity(0.5, "cup", 3)).toEqual({ quantity: 1.5, approx: false });
    expect(scaleQuantity(1, null, 1 / 3)).toEqual({ quantity: 0.5, approx: true });
    expect(scaleQuantity(10, null, 1.25)).toEqual({ quantity: 12.5, approx: false });
    expect(scaleQuantity(3, "clove", 1 / 2)).toEqual({ quantity: 1.5, approx: false });
    // fator 1: o número do chef, sem arredondar
    expect(scaleQuantity(0.333, "cup", 1)).toEqual({ quantity: 0.333, approx: false });
  });

  it("formatação no idioma: frações e plural", () => {
    expect(scaledAmount({ quantity: 1, unit: "cup", quantityText: null }, 1.5, UNIT_LABELS_PT).text).toBe("1 1/2 xícara");
    expect(scaledAmount({ quantity: 2, unit: "bunch", quantityText: null }, 0.25, UNIT_LABELS_PT)).toEqual({ text: "1/2 maço", approx: false, scaled: true });
  });

  it("URL: ?porcoes= entra quando muda e sai quando volta ao original", () => {
    expect(servingsHref("/content/g1", "", 4, 2)).toBe("/content/g1?porcoes=4");
    expect(servingsHref("/content/g1", "?porcoes=4&x=1", 2, 2)).toBe("/content/g1?x=1");
    expect(servingsHref("/content/g1", "?porcoes=4", 99, 2)).toBe("/content/g1?porcoes=50");
  });
});

describe("lista de ingredientes com porções e checklist", () => {
  const f = servingsFactor(2, 4);
  const amounts: Record<string, ScaledAmount> = {};
  for (const ing of model.ingredients) {
    amounts[ing.id] = scaledAmount(ing, f, UNIT_LABELS_PT);
    ing.substitutions.forEach((s, i) => (amounts[`${ing.id}#${i}`] = scaledAmount(s, f, UNIT_LABELS_PT)));
  }
  const labels = { title: "Ingredientes", optional: "(opcional)", toTaste: "a gosto", substitutes: "Ou use" };

  it("mostra as quantidades ajustadas e o aviso só nos itens que não mudam", () => {
    const html = renderToStaticMarkup(createElement(RecipeIngredientList, { ingredients: model.ingredients, labels, amounts, notScaledLabel: "Não ajustado automaticamente" }));
    expect(html).toContain(">600 g<");
    expect(html).toContain("Ou use: <span>Tofu firme (600 g)</span>");
    expect((html.match(/data-testid="recipe-ingredient-not-scaled"/g) ?? []).length).toBe(2); // texto livre e "a gosto"
  });

  it("≈ quando o arredondamento afastou do cálculo exato", () => {
    const third = Object.fromEntries(model.ingredients.map((i) => [i.id, scaledAmount(i, 1 / 3, UNIT_LABELS_PT)]));
    const html = renderToStaticMarkup(createElement(RecipeIngredientList, { ingredients: model.ingredients, labels, amounts: third }));
    expect(html).toContain(">≈ 1/2<"); // 1 batata-doce ÷ 3
    expect(html).toContain(">100 g<"); // 300 g ÷ 3 exato
  });

  it("checklist: caixas nativas com nome acessível e item marcado riscado", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeIngredientList, { ingredients: model.ingredients, labels, checklist: { checked: new Set(["a2"]), onToggle: () => {}, label: (n: string) => `Separei: ${n}` } }),
    );
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(5);
    expect(html).toContain('aria-label="Separei: Azeite"');
    expect(html).toMatch(/data-checked="true"/);
    expect(html).toContain("line-through");
  });

  it("checklist: o label ocupa a linha toda com toque mínimo de 44px (o padding saiu do <li>)", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeIngredientList, { ingredients: model.ingredients, labels, checklist: { checked: new Set<string>(), onToggle: () => {}, label: (n: string) => `Separei: ${n}` } }),
    );
    const labelsHtml = html.match(/<label [^>]*data-testid="recipe-ingredient-check"[^>]*>/g) ?? [];
    expect(labelsHtml).toHaveLength(5);
    for (const tag of labelsHtml) expect(tag).toMatch(/min-h-11[^"]*px-4 py-2\.5/);
    for (const li of html.match(/<li [^>]*>/g) ?? []) expect(li).not.toMatch(/py-2\.5/);
    // sem checklist (prévia do chef), o <li> mantém o padding
    const plain = renderToStaticMarkup(createElement(RecipeIngredientList, { ingredients: model.ingredients, labels }));
    for (const li of plain.match(/<li [^>]*>/g) ?? []) expect(li).toMatch(/px-4 py-2\.5/);
  });
});

describe("marcações do checklist (24 h no aparelho)", () => {
  const now = 1_800_000_000_000;
  it("grava e lê; vencido, malformado ou de ingrediente que saiu some", () => {
    const raw = writeIngredientChecks(["a1", "a2", "a1"], now)!;
    expect(readIngredientChecks(raw, ["a1", "a2"], now + 1000)).toEqual(["a1", "a2"]);
    expect(readIngredientChecks(raw, ["a2"], now)).toEqual(["a2"]);
    expect(readIngredientChecks(raw, ["a1", "a2"], now + INGREDIENT_CHECK_TTL_MS + 1)).toEqual([]);
    expect(readIngredientChecks("{nope", ["a1"], now)).toEqual([]);
    expect(readIngredientChecks(JSON.stringify({ at: "x", ids: ["a1"] }), ["a1"], now)).toEqual([]);
    expect(writeIngredientChecks([], now)).toBeNull();
  });

  it("uma chave por conta e receita: outra conta no mesmo aparelho não lê as marcações", () => {
    expect(ingredientCheckKey("u1", "c1")).toBe("uh-recipe-check:u1:c1");
    expect(ingredientCheckKey("u2", "c1")).not.toBe(ingredientCheckKey("u1", "c1"));
  });

  it("limpeza ao montar: apaga vencidas, ilegíveis e as antigas sem conta; mantém as válidas e as de outros prefixos", () => {
    const fresh = writeIngredientChecks(["a1"], now)!;
    const old = writeIngredientChecks(["a1"], now - INGREDIENT_CHECK_TTL_MS - 1)!;
    const stale = staleIngredientCheckKeys(
      [
        ["uh-recipe-check:u1:c1", fresh],
        ["uh-recipe-check:u1:c2", old],
        ["uh-recipe-check:u2:c3", "{nope"],
        ["uh-recipe-check:c1", fresh],
        ["uh-cook:u1:c1", old],
        ["uh-theme", "dark"],
      ],
      now,
    );
    expect(stale).toEqual(["uh-recipe-check:u1:c2", "uh-recipe-check:u2:c3", "uh-recipe-check:c1"]);
  });
});

describe("cruzamento de alérgenos (só declarados e marcados)", () => {
  it("Esta receita declara ovo, que você marcou", () => {
    expect(matchDeclaredAllergens({ allergensDeclared: true, allergens: ["milk", "egg"] }, ["egg", "peanut"])).toEqual(["egg"]);
  });
  it("receita sem declaração não gera aviso, mesmo com o código na lista", () => {
    expect(matchDeclaredAllergens({ allergensDeclared: false, allergens: ["egg"] }, ["egg"])).toEqual([]);
  });
  it("nada marcado ou declarado 'nenhum': sem aviso; ordem fixa da lista", () => {
    expect(matchDeclaredAllergens({ allergensDeclared: true, allergens: ["egg"] }, [])).toEqual([]);
    expect(matchDeclaredAllergens({ allergensDeclared: true, allergens: [] }, ["egg"])).toEqual([]);
    expect(matchDeclaredAllergens({ allergensDeclared: true, allergens: ["sesame", "milk", "peanut"] }, ["sesame", "peanut", "milk"])).toEqual(["peanut", "milk", "sesame"]);
  });
});

describe("JSON-LD schema.org/Recipe (P6)", () => {
  const base = {
    url: "https://ultra.example/content/g1",
    title: "Bowl",
    summary: "Clássico",
    image: "https://ultra.example/media/recipe/x",
    publishedAt: "2026-10-01T00:00:00Z",
    chef: { name: "Helena Vilar", url: "https://ultra.example/personalities/helena-vilar", fictional: true },
    prepMinutes: 15,
    cookMinutes: 25,
    totalMinutes: 65,
    servings: 2,
    categories: ["Almoço"],
    diets: ["vegan", "pescatarian"] as ("vegan" | "pescatarian")[],
    keywords: ["marmita"],
  };

  it("desligado por padrão; só '1' ou 'true' ligam", () => {
    expect(recipesSeoIndexEnabled({})).toBe(false);
    expect(recipesSeoIndexEnabled({ RECIPES_SEO_INDEX: "0" })).toBe(false);
    expect(recipesSeoIndexEnabled({ RECIPES_SEO_INDEX: "true" })).toBe(true);
    expect(recipesSeoIndexEnabled({ RECIPES_SEO_INDEX: "1" })).toBe(true);
  });

  it("durações em ISO 8601", () => {
    expect(isoDuration(35)).toBe("PT35M");
    expect(isoDuration(65)).toBe("PT1H5M");
    expect(isoDuration(120)).toBe("PT2H");
    expect(isoDuration(0)).toBeUndefined();
    expect(isoDuration(null)).toBeUndefined();
  });

  it("herói fictício: autor é a Organization Groscove Ultra; sem acesso, sem ingredientes nem preparo", () => {
    const ld = buildRecipeJsonLd(base);
    expect(ld.author).toEqual({ "@type": "Organization", name: "Groscove Ultra" });
    expect(ld).toMatchObject({ "@type": "Recipe", prepTime: "PT15M", cookTime: "PT25M", totalTime: "PT1H5M", recipeYield: "2", suitableForDiet: ["https://schema.org/VeganDiet"] });
    expect(ld).not.toHaveProperty("recipeIngredient");
    expect(ld).not.toHaveProperty("recipeInstructions");
    expect(ld).not.toHaveProperty("aggregateRating");
  });

  it("chef real vira Person; com acesso, ingredientes e etapas; nota só com 3 avaliações", () => {
    const ld = buildRecipeJsonLd({ ...base, chef: { ...base.chef, fictional: false }, ingredients: ["300 g Peito de frango"], steps: ["Asse."], ratingAvg: 4.5, ratingCount: 3 });
    expect(ld.author).toEqual({ "@type": "Person", name: "Helena Vilar", url: base.chef.url });
    expect(ld.recipeIngredient).toEqual(["300 g Peito de frango"]);
    expect(ld.recipeInstructions).toEqual([{ "@type": "HowToStep", text: "Asse." }]);
    expect(ld.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.5, ratingCount: 3 });
  });

  it("escapa < no JSON embutido (nada fecha o <script>)", () => {
    const out = serializeJsonLd(buildRecipeJsonLd({ ...base, title: "</script><script>alert(1)</script>" }));
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
