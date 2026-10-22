import { describe, expect, it } from "vitest";
import { amountFields, buildPayload, draftFromRows, draftIssue, effectiveTotal, emptyDraft, emptyIngredient, emptyStep, isRecipeDraft, moveItem, sameDraft, type RecipeDraft } from "@/lib/recipes/draft";
import { RECIPE_EDITOR_STEPS, fieldIdForPath, parseEditorStep, stepForPath } from "@/lib/recipes/editor-steps";
import { allowedRecipeLicenses, coerceRecipeLicense, recipePayloadSchema } from "@/lib/recipes/payload";
import type { RecipeRows } from "@/lib/recipes/rows";
import { parseRecipeVideoLink, recipeVideoLinkText } from "@/lib/recipes/video";

// Editor de receitas (fase 2): rascunho → payload de recipe_save (0027) com os mesmos limites do
// banco, linhas vazias fora, quantidade "1/2"/"1,5" lida pelo parseQuantity, caminhos de erro na
// posição que a pessoa vê, e a ida e volta tabelas → rascunho → payload sem perder dado.

function base(): RecipeDraft {
  const d = emptyDraft();
  d.title = "Bowl de teste";
  return d;
}

describe("amountFields: quantidade digitada → colunas do banco", () => {
  it("número, fração e decimal com vírgula viram quantity com a unidade escolhida", () => {
    expect(amountFields("2", "", false)).toMatchObject({ quantity: 2, unit: null, quantity_text: null, to_taste: false, problem: null });
    expect(amountFields("1/2", "cup", false)).toMatchObject({ quantity: 0.5, unit: "cup" });
    expect(amountFields("1,5", "l", false)).toMatchObject({ quantity: 1.5, unit: "l" });
    expect(amountFields("2 1/2", "cup", false)).toMatchObject({ quantity: 2.5 });
  });
  it("unidade e tamanho escritos junto são lidos ('1/2 xícara', '1 média')", () => {
    expect(amountFields("1/2 xícara", "", false)).toMatchObject({ quantity: 0.5, unit: "cup" });
    expect(amountFields("1 média", "", false)).toMatchObject({ quantity: 1, unit: null, extraNote: "média" });
  });
  it("texto livre fica como quantity_text (não ajusta); com unidade escolhida é erro", () => {
    expect(amountFields("3 colheres", "", false)).toMatchObject({ quantity: null, quantity_text: "3 colheres", problem: null });
    expect(amountFields("3 colheres", "tbsp", false).problem).toBe("unitNeedsNumber");
  });
  it("a gosto e unidade sem quantidade", () => {
    expect(amountFields("", "", true)).toMatchObject({ to_taste: true, quantity: null });
    expect(amountFields("a gosto", "", false)).toMatchObject({ to_taste: true });
    expect(amountFields("", "g", false).problem).toBe("unitNeedsAmount");
    expect(amountFields("", "", false)).toMatchObject({ quantity: null, unit: null, quantity_text: null, problem: null });
  });
});

describe("buildPayload", () => {
  it("rascunho mínimo (só o título) já grava: o salvamento parcial aceita receita incompleta", () => {
    const r = buildPayload(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.content.title).toBe("Bowl de teste");
    expect(r.payload.ingredients).toEqual([]);
    expect(r.payload.details.total_minutes).toBeNull();
    expect(r.payload.nutrition).toBeNull();
    expect("video" in r.payload).toBe(false); // ausente = recipe_save mantém o vídeo atual
    expect(recipePayloadSchema.safeParse(r.payload).success).toBe(true);
  });

  it("sem título: erro no campo certo (content.title → etapa básicos)", () => {
    const d = base();
    d.title = "  ";
    const r = buildPayload(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]).toEqual({ path: "content.title", fieldId: "recipe-content-title", message: "required" });
    expect(stepForPath(r.issues[0].path)).toBe("basicos");
  });

  it("linhas vazias ficam fora e o erro aponta a posição do rascunho, não a do payload", () => {
    const d = base();
    const ok = { ...emptyIngredient(), name: "Ovo", amount: "2" };
    const bad = { ...emptyIngredient(), name: "", amount: "100", unit: "g" as const };
    d.ingredients = [emptyIngredient(), ok, emptyIngredient(), bad];
    const r = buildPayload(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.path)).toContain("ingredients.3.name");
    expect(r.issues.find((i) => i.path === "ingredients.3.name")?.fieldId).toBe("recipe-ingredients-3-name");
  });

  it("ingredientes e etapas: ids, a gosto, texto, substituições, duração min:s, temperatura e ingredientes da etapa", () => {
    const d = base();
    const egg = { ...emptyIngredient(), name: "Ovo", amount: "2" };
    const flour = { ...emptyIngredient(), name: "Farinha", amount: "1/2", unit: "cup" as const, substitutions: [{ name: "Aveia", amount: "1/2", unit: "cup" as const, note: "" }] };
    const salt = { ...emptyIngredient(), name: "Sal", toTaste: true };
    d.ingredients = [egg, flour, salt];
    d.steps = [{ ...emptyStep(), instruction: "Misture", minutes: "1", seconds: "30", ingredientIds: [egg.id, flour.id, "00000000-0000-4000-8000-000000000000"] }, emptyStep(), { ...emptyStep(), instruction: "Asse", minutes: "25", temperature: "200" }];
    const r = buildPayload(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ingredients.map((i) => [i.name, i.quantity, i.unit, i.to_taste])).toEqual([
      ["Ovo", 2, null, false],
      ["Farinha", 0.5, "cup", false],
      ["Sal", null, null, true],
    ]);
    expect(r.payload.ingredients[1].substitutions).toEqual([{ name: "Aveia", quantity: 0.5, unit: "cup", quantity_text: null, note: null }]);
    expect(r.payload.steps).toHaveLength(2);
    expect(r.payload.steps[0]).toMatchObject({ duration_seconds: 90, temperature_c: null, ingredient_ids: [egg.id, flour.id] });
    expect(r.payload.steps[1]).toMatchObject({ duration_seconds: 1500, temperature_c: 200 });
    expect(r.stepIndex).toEqual([0, 2]);
  });

  it("segundos fora de 0–59 e temperatura não numérica são erros da etapa", () => {
    const d = base();
    d.steps = [{ ...emptyStep(), instruction: "x", seconds: "75", temperature: "quente" }];
    const r = buildPayload(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.path).sort()).toEqual(["steps.0.duration_seconds", "steps.0.temperature_c"]);
  });

  it("tempo total acompanha a soma até ser digitado; menor que a soma vai assim mesmo (o checklist avisa)", () => {
    const d = base();
    d.prep = "10";
    d.cook = "20";
    expect(effectiveTotal(d)).toBe(30);
    d.totalTouched = true;
    d.total = "25";
    const r = buildPayload(d);
    expect(r.ok && r.payload.details.total_minutes).toBe(25);
  });

  it("alérgenos: não declarados vão vazios; 'Nenhum alérgeno' é declaração explícita", () => {
    const d = base();
    d.allergens = ["egg"];
    let r = buildPayload(d);
    expect(r.ok && r.payload.details).toMatchObject({ allergens: [], allergens_declared: false });
    d.allergensDeclared = true;
    d.allergens = [];
    r = buildPayload(d);
    expect(r.ok && r.payload.details).toMatchObject({ allergens: [], allergens_declared: true });
  });

  it("alérgenos: 'Contém alérgenos' sem nenhum marcado não vira 'Nenhum alérgeno' (vai como não declarado)", () => {
    const d = base();
    d.allergensDeclared = true;
    d.allergensSome = true;
    d.allergens = [];
    let r = buildPayload(d);
    expect(r.ok && r.payload.details).toMatchObject({ allergens: [], allergens_declared: false });
    d.allergens = ["egg"];
    r = buildPayload(d);
    expect(r.ok && r.payload.details).toMatchObject({ allergens: ["egg"], allergens_declared: true });
  });

  it("nutrição com vírgula arredonda em 1 casa; desligada vira null (remove a linha)", () => {
    const d = base();
    d.nutritionEnabled = true;
    d.nutrition = { ...d.nutrition, kcal: "420,46", protein_g: "18" };
    let r = buildPayload(d);
    expect(r.ok && r.payload.nutrition).toMatchObject({ kcal: 420.5, protein_g: 18, carbs_g: null, source: "chef" });
    d.nutrition.kcal = "abc";
    r = buildPayload(d);
    expect(!r.ok && r.issues[0].path).toBe("nutrition.kcal");
  });

  it("vídeo só vai quando muda, e a licença acompanha o provedor", () => {
    const d = base();
    d.video = { provider: "embed_youtube", ref: "dQw4w9WgXcQ" };
    d.videoDirty = true;
    d.licenseKind = "own";
    const r = buildPayload(d);
    expect(r.ok && r.payload.video).toEqual({ provider: "embed_youtube", ref: "dQw4w9WgXcQ" });
    expect(r.ok && r.payload.content.media_license_kind).toBe("third_party_embed");
  });

  it("galeria na ordem da tela (1..n) e capa só se for foto de galeria", () => {
    const d = base();
    d.media = [
      { id: "11111111-1111-4111-8111-111111111111", role: "gallery", position: 7, alt: "a", caption: "", width: null, height: null },
      { id: "22222222-2222-4222-8222-222222222222", role: "step", position: 3, alt: "", caption: "", width: null, height: null },
      { id: "33333333-3333-4333-8333-333333333333", role: "gallery", position: 1, alt: "b", caption: "x", width: null, height: null },
    ];
    d.coverMediaId = "22222222-2222-4222-8222-222222222222";
    const r = buildPayload(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.media.map((m) => m.position)).toEqual([1, 3, 2]);
    expect(r.payload.details.cover_media_id).toBeNull();
  });

  it("draftIssue traduz o caminho do banco ('invalid_payload: ingredients.1.unit') para a posição do rascunho", () => {
    expect(draftIssue({ path: "ingredients.1.unit", message: "invalid" }, [0, 4], [])).toEqual({ path: "ingredients.4.unit", fieldId: "recipe-ingredients-4-unit", message: "invalid" });
    expect(draftIssue({ path: "content.title", message: "invalid" }, [], []).path).toBe("content.title");
  });
});

// g1 do seed como as tabelas devolvem depois da 0029 (fixture de teste)
const G1_ROWS: RecipeRows = {
  details: { servings: 2, yield_text: null, prep_minutes: 15, cook_minutes: 25, rest_minutes: null, total_minutes: 35, story: null, diets: [], allergens: [], allergens_declared: false, allergen_notes: null, cover_media_id: null, rating_count: 0, rating_sum: 0 },
  chefNote: "Dá para preparar no domingo.",
  categories: ["almoco", "marmitas"],
  ingredients: [
    { id: "a1000000-0000-4000-8000-000000000001", position: 1, name: "Peito de frango", quantity: 300, unit: "g", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [] },
    { id: "a1000000-0000-4000-8000-000000000004", position: 4, name: "Batata-doce", quantity: 1, unit: null, quantity_text: null, to_taste: false, optional: false, note: "média", substitutions: [] },
    { id: "a1000000-0000-4000-8000-000000000005", position: 5, name: "Azeite", quantity: 2, unit: "tbsp", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [] },
    { id: "a1000000-0000-4000-8000-000000000006", position: 6, name: "Molho de ervas (receita da plataforma)", quantity: null, unit: null, quantity_text: "3 colheres", to_taste: false, optional: true, note: null, substitutions: [] },
  ],
  steps: [{ id: "b1000000-0000-4000-8000-000000000001", position: 1, instruction: "Asse a 200 °C por 25 minutos.", duration_seconds: 1500, temperature_c: 200, tip: null, image_media_id: null }],
  stepIngredients: [{ step_id: "b1000000-0000-4000-8000-000000000001", ingredient_id: "a1000000-0000-4000-8000-000000000004" }],
  media: [],
  nutrition: { kcal: 520, protein_g: 42, carbs_g: 38, fat_g: 21, fiber_g: 6, sodium_mg: 480, source: "chef", source_note: null, validated: true, validated_by: "Nutri", validated_at: "2026-01-10", validation_note: null },
  video: { provider: "none", ref: null },
};
const G1_CONTENT = { title: "Bowl de frango", summary: "O bowl clássico", tags: ["marmita"], difficulty: "beginner" as const, pillar: "gastronomy" as const, disclaimer_kind: "nutrition" as const, media_license_kind: "platform_demo" as const, media_license_ref: null, media_credit: null };

describe("draftFromRows: receita antiga convertida (g1) abre no editor e grava igual", () => {
  const draft = draftFromRows(G1_CONTENT, G1_ROWS);
  it("quantidade no formato de cozinha, texto livre, observação e ligação etapa → ingrediente", () => {
    expect(draft.ingredients.map((i) => [i.name, i.amount, i.unit, i.note])).toEqual([
      ["Peito de frango", "300", "g", ""],
      ["Batata-doce", "1", "", "média"],
      ["Azeite", "2", "tbsp", ""],
      ["Molho de ervas (receita da plataforma)", "3 colheres", "", ""],
    ]);
    expect(draft.steps[0]).toMatchObject({ minutes: "25", seconds: "", temperature: "200", ingredientIds: ["a1000000-0000-4000-8000-000000000004"] });
    // 15 + 25 = 40 ≠ 35: o total gravado vale como digitado (não é recalculado em silêncio)
    expect(draft.totalTouched).toBe(true);
  });
  it("ida e volta: o payload repete os números (a validação da nutrição não cai)", () => {
    const r = buildPayload(draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ingredients.map((i) => [i.quantity, i.unit, i.quantity_text, i.note, i.optional])).toEqual([
      [300, "g", null, null, false],
      [1, null, null, "média", false],
      [2, "tbsp", null, null, false],
      [null, null, "3 colheres", null, true],
    ]);
    expect(r.payload.nutrition).toMatchObject({ kcal: 520, protein_g: 42, sodium_mg: 480, source: "chef" });
    expect(r.payload.details.total_minutes).toBe(35);
    expect(r.payload.content.media_license_kind).toBe("platform_demo");
    expect(sameDraft(draft, draftFromRows(G1_CONTENT, G1_ROWS))).toBe(true);
  });
});

describe("regras auxiliares do editor", () => {
  it("etapas na URL e o mapa caminho → etapa/campo", () => {
    expect(RECIPE_EDITOR_STEPS).toEqual(["basicos", "ingredientes", "preparo", "midia", "complementos", "revisao"]);
    expect(parseEditorStep("midia")).toBe("midia");
    expect(parseEditorStep("xyz")).toBe("basicos");
    expect(parseEditorStep(["preparo"])).toBe("basicos");
    expect(stepForPath("steps.2.instruction")).toBe("preparo");
    expect(stepForPath("details.allergens_declared")).toBe("complementos");
    expect(stepForPath("details.cover_media_id")).toBe("midia");
    expect(stepForPath("content.tags")).toBe("complementos");
    expect(stepForPath("details.servings")).toBe("basicos");
    expect(stepForPath("nutrition.kcal")).toBe("complementos");
    expect(fieldIdForPath("nutrition.protein_g")).toBe("recipe-nutrition-protein_g");
  });
  it("reordenar com ↑/↓", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
  it("licença coerente com o vídeo (espelha media_license_compatible)", () => {
    expect(allowedRecipeLicenses("none")).toEqual(["platform_demo", "own"]);
    expect(allowedRecipeLicenses("embed_vimeo")).toEqual(["third_party_embed"]);
    expect(coerceRecipeLicense("cloudflare_stream", "third_party_embed")).toBe("own");
    expect(coerceRecipeLicense("cloudflare_stream", "licensed")).toBe("licensed");
  });
  it("link de vídeo: YouTube e Vimeo pelos parsers da reprodução", () => {
    expect(parseRecipeVideoLink("https://youtu.be/dQw4w9WgXcQ")).toEqual({ provider: "embed_youtube", ref: "dQw4w9WgXcQ" });
    expect(parseRecipeVideoLink("https://vimeo.com/123456789")).toEqual({ provider: "embed_vimeo", ref: "123456789" });
    expect(parseRecipeVideoLink("https://example.com/v.mp4")).toBeNull();
    expect(recipeVideoLinkText("embed_youtube", "dQw4w9WgXcQ")).toBe("https://youtu.be/dQw4w9WgXcQ");
  });
  it("isRecipeDraft recusa lixo do localStorage", () => {
    expect(isRecipeDraft(emptyDraft())).toBe(true);
    expect(isRecipeDraft({ title: "x" })).toBe(false);
    expect(isRecipeDraft({ ...emptyDraft(), ingredients: [{ id: "1", unit: "furlong" }] })).toBe(false);
  });
  it("o schema do payload recusa unidade fora dos códigos e etapa com ingrediente de outra lista", () => {
    const r = buildPayload(base());
    if (!r.ok) throw new Error("payload base inválido");
    const bad = { ...r.payload, ingredients: [{ id: "a1000000-0000-4000-8000-000000000001", name: "x", quantity: 1, unit: "furlong", quantity_text: null, to_taste: false, optional: false, note: null, substitutions: [] }] };
    expect(recipePayloadSchema.safeParse(bad).success).toBe(false);
    const orphan = { ...r.payload, steps: [{ id: "b1000000-0000-4000-8000-000000000001", instruction: "x", duration_seconds: null, temperature_c: null, tip: null, image_media_id: null, ingredient_ids: ["a1000000-0000-4000-8000-000000000009"] }] };
    expect(recipePayloadSchema.safeParse(orphan).success).toBe(false);
  });
});
