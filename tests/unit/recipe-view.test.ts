import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { RecipeIngredientList } from "@/components/recipes/view/RecipeIngredientList";
import { RECIPE_UNITS } from "@/lib/recipes/codes";
import { UNIT_LABELS_PT } from "@/lib/recipes/quantity";
import type { RecipeRows } from "@/lib/recipes/rows";
import { buildRecipeViewModel, formatIngredientAmount, formatStepDuration } from "@/lib/recipes/view-model";

// Renderizador estruturado (RecipeView): modelo montado a partir das tabelas (fixture de g1 e g9 do
// seed) e a lista de ingredientes renderizada como na página — "Batata-doce · 1 · média" e
// "(opcional)" lado a lado com o texto do seed.

const G1: RecipeRows = {
  details: { servings: 2, yield_text: null, prep_minutes: 15, cook_minutes: 25, rest_minutes: null, total_minutes: 35, story: "Clássico de marmita.", diets: [], allergens: [], allergens_declared: false, allergen_notes: null, cover_media_id: "c0000000-0000-4000-8000-000000000002", rating_count: 3, rating_sum: 13 },
  chefNote: "Guarde por 3 dias.",
  categories: ["almoco"],
  ingredients: [
    { id: "a1", position: 4, name: "Batata-doce", quantity: 1, unit: null, quantity_text: null, to_taste: false, optional: false, note: "média", substitutions: [] },
    { id: "a0", position: 1, name: "Peito de frango", quantity: 300, unit: "g", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [{ name: "Tofu firme", quantity: 300, unit: "g", quantity_text: null, note: null }] },
    { id: "a2", position: 5, name: "Azeite", quantity: 2, unit: "tbsp", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [] },
    { id: "a3", position: 6, name: "Molho de ervas", quantity: null, unit: null, quantity_text: "3 colheres", to_taste: false, optional: true, note: null, substitutions: [] },
    { id: "a4", position: 7, name: "Sal", quantity: null, unit: null, quantity_text: null, to_taste: true, optional: false, note: null, substitutions: [] },
  ],
  steps: [
    { id: "s2", position: 2, instruction: "Grelhe o frango.", duration_seconds: 90, temperature_c: null, tip: "Seque bem antes.", image_media_id: "c0000000-0000-4000-8000-000000000009" },
    { id: "s1", position: 1, instruction: "Asse os legumes.", duration_seconds: 1500, temperature_c: 200, tip: null, image_media_id: null },
  ],
  stepIngredients: [
    { step_id: "s1", ingredient_id: "a1" },
    { step_id: "s2", ingredient_id: "a0" },
  ],
  media: [
    { id: "c0000000-0000-4000-8000-000000000001", role: "gallery", position: 1, mime: "image/webp", width: 2048, height: 1536, alt_text: "Legumes", caption: null, storage_path: "x" },
    { id: "c0000000-0000-4000-8000-000000000002", role: "gallery", position: 2, mime: "image/webp", width: 2048, height: 1536, alt_text: "Bowl pronto", caption: "Servido", storage_path: "y" },
    { id: "c0000000-0000-4000-8000-000000000009", role: "step", position: 1, mime: "image/jpeg", width: 800, height: 600, alt_text: "Frango na grelha", caption: null, storage_path: "z" },
  ],
  nutrition: { kcal: 520, protein_g: 42, carbs_g: 38, fat_g: 21, fiber_g: null, sodium_mg: 480, source: "nutritionist", source_note: null, validated: true, validated_by: "Nutri X", validated_at: "2026-01-10", validation_note: "Por porção" },
  video: null,
};

const model = buildRecipeViewModel(G1, { labels: UNIT_LABELS_PT, title: "Bowl" });

describe("buildRecipeViewModel (g1 a partir das tabelas)", () => {
  it("capa primeiro na galeria, pelo proxy /media/recipe/<id>, e alt de reserva = título", () => {
    expect(model.photos.map((p) => p.src)).toEqual(["/media/recipe/c0000000-0000-4000-8000-000000000002", "/media/recipe/c0000000-0000-4000-8000-000000000001"]);
    expect(buildRecipeViewModel({ ...G1, media: [{ ...G1.media[0], alt_text: null }] }, { labels: UNIT_LABELS_PT, title: "Bowl" }).photos[0].alt).toBe("Bowl");
  });
  it("ingredientes na ordem, com quantidade formatada, texto livre, a gosto e substituições", () => {
    expect(model.ingredients.map((i) => [i.name, i.amount, i.note, i.optional, i.toTaste])).toEqual([
      ["Peito de frango", "300 g", null, false, false],
      ["Batata-doce", "1", "média", false, false],
      ["Azeite", "2 colheres de sopa", null, false, false],
      ["Molho de ervas", "3 colheres", null, true, false],
      ["Sal", null, null, false, true],
    ]);
    expect(model.ingredients[0].substitutions).toEqual([{ name: "Tofu firme", amount: "300 g", note: null }]);
  });
  it("etapas numeradas pela posição, com duração, temperatura, foto, dica e ingredientes da etapa", () => {
    expect(model.steps.map((s) => [s.number, s.instruction, s.durationSeconds, s.temperatureC])).toEqual([
      [1, "Asse os legumes.", 1500, 200],
      [2, "Grelhe o frango.", 90, null],
    ]);
    expect(model.steps[0].ingredients).toEqual(["Batata-doce"]);
    expect(model.steps[1].image).toEqual({ src: "/media/recipe/c0000000-0000-4000-8000-000000000009", alt: "Frango na grelha" });
    expect(model.steps[1].tip).toBe("Seque bem antes.");
  });
  it("nutrição validada mostra números e origem; sem validação, só o estado (RB-08)", () => {
    expect(model.nutrition).toMatchObject({ state: "validated", source: "nutritionist", validatedBy: "Nutri X", values: { kcal: 520, fiber_g: null } });
    const pending = buildRecipeViewModel({ ...G1, nutrition: { ...G1.nutrition!, validated: false } }, { labels: UNIT_LABELS_PT, title: "x" });
    expect(pending.nutrition).toMatchObject({ state: "pending", values: null, validatedBy: null });
    const none = buildRecipeViewModel({ ...G1, nutrition: null }, { labels: UNIT_LABELS_PT, title: "x" });
    expect(none.nutrition.state).toBe("hidden");
  });
  it("alérgenos: não declarados ≠ nenhum; nota média só com 3 avaliações", () => {
    expect(model.allergensDeclared).toBe(false);
    expect(model.ratingAvg).toBe(4.3);
    expect(buildRecipeViewModel({ ...G1, details: { ...G1.details!, rating_count: 2 } }, { labels: UNIT_LABELS_PT, title: "x" }).ratingAvg).toBeNull();
  });
  it("formatação de quantidade e duração", () => {
    expect(formatIngredientAmount(0.5, "bunch", null, UNIT_LABELS_PT)).toBe("1/2 maço");
    expect(formatIngredientAmount(1.5, "l", null, UNIT_LABELS_PT)).toBe("1,5 L");
    expect(formatIngredientAmount(null, null, "  ", UNIT_LABELS_PT)).toBeNull();
    expect(formatStepDuration(3725)).toEqual({ h: 1, m: 2, s: 5 });
    expect(Object.keys(UNIT_LABELS_PT).sort()).toEqual([...RECIPE_UNITS].sort());
  });
});

describe("RecipeIngredientList (markup da página e da prévia)", () => {
  const html = renderToStaticMarkup(
    createElement(RecipeIngredientList, { ingredients: model.ingredients, labels: { title: "Ingredientes", optional: "(opcional)", toTaste: "a gosto", substitutes: "Ou use" } }),
  );
  it("Batata-doce · 1 · média, e (opcional) no item opcional", () => {
    expect(html).toContain('<h2 id="recipe-ingredients"');
    expect(html).toMatch(/Batata-doce<\/span><span[^>]*> · média<\/span><\/span><span[^>]*>1<\/span>/);
    expect(html).toMatch(/Molho de ervas<\/span><span[^>]*> \(opcional\)<\/span>/);
    expect(html).toContain("a gosto");
    expect(html).toContain("Ou use: <span>Tofu firme (300 g)</span>");
    expect((html.match(/data-testid="recipe-ingredient"/g) ?? []).length).toBe(5);
  });
  it("texto do ingrediente vem como texto puro (sem HTML)", () => {
    const evil = buildRecipeViewModel({ ...G1, ingredients: [{ ...G1.ingredients[0], name: "<img src=x onerror=alert(1)>" }] }, { labels: UNIT_LABELS_PT, title: "x" });
    const out = renderToStaticMarkup(createElement(RecipeIngredientList, { ingredients: evil.ingredients, labels: { title: "I", optional: "o", toTaste: "t", substitutes: "s" } }));
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});
