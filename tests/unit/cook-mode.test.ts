import { describe, expect, it } from "vitest";
import {
  ALARM_GRACE_MS,
  applyNav,
  buildCookModel,
  clampStep,
  COOK_PROGRESS_TTL_MS,
  cookModeHref,
  formatClock,
  keyToNav,
  parseCookProgress,
  recipeHref,
  serializeCookProgress,
  shouldAlarmOnRestore,
  startTimer,
  swipeToNav,
  timerDone,
  timerRemainingMs,
  toggleDone,
} from "@/lib/recipes/cook-mode";
import { UNIT_LABELS_PT } from "@/lib/recipes/quantity";
import type { RecipeIngredientRow, RecipeRows } from "@/lib/recipes/rows";
import { parseServingsParam } from "@/lib/recipes/scale";

// Modo Cozinha (fase 4): porções da URL (a mesma regra da página, scale.ts), etapas com os
// ingredientes ligados, navegação por teclado/gesto, cronômetro pelo horário de término e progresso
// por 24 h. O arredondamento de cozinha é testado em recipe-page.test.ts (uma regra só) e a igualdade
// página × Modo Cozinha em recipe-servings-parity.test.ts.

const ing = (id: string, position: number, name: string, extra: Partial<RecipeIngredientRow> = {}): RecipeIngredientRow => ({
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

// g1 do seed (bowl de frango), com vínculos etapa→ingrediente para o Modo Cozinha
const G1: Pick<RecipeRows, "details" | "ingredients" | "steps" | "stepIngredients" | "media"> = {
  details: {
    servings: 2,
    yield_text: null,
    prep_minutes: 10,
    cook_minutes: 25,
    rest_minutes: null,
    total_minutes: 35,
    story: null,
    diets: [],
    allergens: [],
    allergens_declared: false,
    allergen_notes: null,
    cover_media_id: null,
    rating_count: 0,
    rating_sum: 0,
  },
  ingredients: [
    ing("i-frango", 1, "Peito de frango", { quantity: 300, unit: "g" }),
    ing("i-abobrinha", 2, "Abobrinha", { quantity: 1 }),
    ing("i-batata", 4, "Batata-doce", { quantity: 1, note: "média" }),
    ing("i-azeite", 5, "Azeite", { quantity: 2, unit: "tbsp" }),
    ing("i-molho", 6, "Molho de ervas", { quantity_text: "3 colheres", optional: true }),
    ing("i-sal", 3, "Sal", { to_taste: true }),
  ],
  steps: [
    { id: "s2", position: 2, instruction: "Grelhe o frango.", duration_seconds: null, temperature_c: null, tip: null, image_media_id: null },
    { id: "s1", position: 1, instruction: "Asse os legumes a 200 °C por 25 minutos.", duration_seconds: 1500, temperature_c: 200, tip: "Vire na metade.", image_media_id: "m1" },
    { id: "s3", position: 3, instruction: "Monte o bowl.", duration_seconds: null, temperature_c: null, tip: null, image_media_id: null },
  ],
  stepIngredients: [
    { step_id: "s1", ingredient_id: "i-azeite" },
    { step_id: "s1", ingredient_id: "i-batata" },
    { step_id: "s1", ingredient_id: "i-abobrinha" },
    { step_id: "s2", ingredient_id: "i-sal" },
    { step_id: "s2", ingredient_id: "i-frango" },
    { step_id: "s3", ingredient_id: "i-molho" },
  ],
  media: [{ id: "m1", role: "step", position: 1, mime: "image/webp", width: 10, height: 10, alt_text: "Legumes na assadeira", caption: null, storage_path: "a/b/c.webp" }],
};

const opts = { contentId: "c1", slug: "bowl-g1", title: "Bowl", labels: UNIT_LABELS_PT, locale: "pt-BR" };

describe("porções vindas da URL", () => {
  it("a mesma leitura da página: de 1 a 50, inteiro; o resto não ajusta", () => {
    expect(parseServingsParam("4")).toBe(4);
    expect(parseServingsParam(["6", "8"])).toBe(6);
    expect(parseServingsParam("2")).toBe(2); // igual à base: fator 1, a URL de volta mantém o número
    for (const bad of ["0", "51", "4.5", "abc", undefined]) expect(parseServingsParam(bad)).toBeNull();
  });

  it("leva o ajuste para o Modo Cozinha e de volta para a receita", () => {
    expect(cookModeHref("bowl-g1", "4")).toBe("/content/bowl-g1/cozinha?porcoes=4");
    expect(cookModeHref("bowl-g1", "<script>")).toBe("/content/bowl-g1/cozinha");
    expect(cookModeHref("bowl-g1", null)).toBe("/content/bowl-g1/cozinha");
    // fora de 1–50 não vai para a URL (antes passava qualquer número de 1 a 3 dígitos)
    expect(cookModeHref("bowl-g1", "0")).toBe("/content/bowl-g1/cozinha");
    expect(cookModeHref("bowl-g1", "99")).toBe("/content/bowl-g1/cozinha");
    expect(recipeHref("bowl-g1", 4)).toBe("/content/bowl-g1?porcoes=4");
    expect(recipeHref("bowl-g1", null)).toBe("/content/bowl-g1");
  });
});

describe("modelo do Modo Cozinha", () => {
  it("etapas na ordem, com os ingredientes ligados na ordem da lista, foto e dica", () => {
    const model = buildCookModel(G1, { ...opts, servings: null });
    expect(model.steps.map((s) => [s.id, s.number])).toEqual([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
    ]);
    const s1 = model.steps[0];
    expect(s1.ingredients.map((i) => i.name)).toEqual(["Abobrinha", "Batata-doce", "Azeite"]);
    expect(s1.ingredients.map((i) => i.amount)).toEqual(["1", "1", "2 colheres de sopa"]);
    expect(s1.image).toEqual({ src: "/media/recipe/m1", alt: "Legumes na assadeira" });
    expect(s1.durationSeconds).toBe(1500);
    // vínculos gravados fora de ordem voltam na ordem da lista (frango é o 1º, sal o 3º)
    expect(model.steps[1].ingredients.map((i) => [i.name, i.amount, i.toTaste])).toEqual([
      ["Peito de frango", "300 g", false],
      ["Sal", null, true],
    ]);
    expect(model.servings).toBeNull();
    expect(model.ingredients.every((i) => !i.notScaled && !i.approx)).toBe(true);
  });

  it("com ?porcoes=4 (receita de 2) dobra o que tem número e marca texto e 'a gosto' como não ajustados", () => {
    const model = buildCookModel(G1, { ...opts, servings: 4 });
    const byName = new Map(model.ingredients.map((i) => [i.name, i]));
    expect(byName.get("Peito de frango")?.amount).toBe("600 g");
    expect(byName.get("Azeite")?.amount).toBe("4 colheres de sopa");
    expect(byName.get("Abobrinha")?.amount).toBe("2");
    expect(byName.get("Molho de ervas")).toMatchObject({ amount: "3 colheres", notScaled: true });
    expect(byName.get("Sal")).toMatchObject({ amount: null, toTaste: true, notScaled: true });
    expect(model.steps[1].ingredients.find((i) => i.name === "Peito de frango")?.amount).toBe("600 g");
    expect(model.servings).toBe(4);
    expect(model.baseServings).toBe(2);
  });

  it("3 porções de uma receita de 2 arredonda como a página (kg com 2 casas) e usa o separador do idioma", () => {
    const pt = buildCookModel(G1, { ...opts, servings: 3 });
    expect(pt.ingredients.find((i) => i.name === "Peito de frango")).toMatchObject({ amount: "450 g", approx: false });
    expect(pt.ingredients.find((i) => i.name === "Abobrinha")).toMatchObject({ amount: "1 1/2", approx: false });
    const kg = buildCookModel({ ...G1, ingredients: [ing("k", 1, "Farinha", { quantity: 1.5, unit: "kg" })], stepIngredients: [] }, { ...opts, servings: 3 });
    expect(kg.ingredients[0]).toMatchObject({ amount: "2,25 kg", approx: false });
    const en = buildCookModel({ ...G1, ingredients: [ing("k", 1, "Flour", { quantity: 1.5, unit: "kg" })], stepIngredients: [] }, { ...opts, locale: "en", servings: 3 });
    expect(en.ingredients[0].amount).toBe("2.25 kg");
    // 1 xícara para 1/3 → 1/4 com "≈" (o arredondamento afastou mais de 1% do cálculo)
    const cup = buildCookModel({ ...G1, details: { ...G1.details!, servings: 3 }, ingredients: [ing("c", 1, "Arroz", { quantity: 1, unit: "cup" })], stepIngredients: [] }, { ...opts, servings: 1 });
    expect(cup.ingredients[0]).toMatchObject({ amount: "1/4 xícara", approx: true });
  });

  it("?porcoes= igual às porções da receita: nada ajustado, nenhum aviso", () => {
    const model = buildCookModel(G1, { ...opts, servings: 2 });
    expect(model.servings).toBe(2);
    expect(model.ingredients.every((i) => !i.notScaled && !i.approx)).toBe(true);
    expect(model.ingredients.find((i) => i.name === "Peito de frango")?.amount).toBe("300 g");
  });

  it("sem porção-base ignora o ajuste", () => {
    const model = buildCookModel({ ...G1, details: null }, { ...opts, servings: 4 });
    expect(model.servings).toBeNull();
    expect(model.ingredients.find((i) => i.name === "Peito de frango")?.amount).toBe("300 g");
  });
});

describe("navegação entre etapas", () => {
  it("anterior/próxima/primeira/última sem sair dos limites", () => {
    expect(applyNav(0, "next", 3)).toBe(1);
    expect(applyNav(2, "next", 3)).toBe(2);
    expect(applyNav(0, "prev", 3)).toBe(0);
    expect(applyNav(1, "first", 3)).toBe(0);
    expect(applyNav(0, "last", 3)).toBe(2);
    expect(clampStep(99, 3)).toBe(2);
    expect(clampStep(-4, 3)).toBe(0);
    expect(clampStep(5, 0)).toBe(0);
  });

  it("setas, Page Up/Down, Home e End; nada em campo de texto ou com modificador", () => {
    expect(keyToNav({ key: "ArrowRight" })).toBe("next");
    expect(keyToNav({ key: "PageDown" })).toBe("next");
    expect(keyToNav({ key: "ArrowLeft" })).toBe("prev");
    expect(keyToNav({ key: "PageUp" })).toBe("prev");
    expect(keyToNav({ key: "Home" })).toBe("first");
    expect(keyToNav({ key: "End" })).toBe("last");
    expect(keyToNav({ key: "ArrowRight", targetTag: "input" })).toBeNull();
    expect(keyToNav({ key: "ArrowLeft", targetTag: "TEXTAREA" })).toBeNull();
    expect(keyToNav({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(keyToNav({ key: "ArrowRight", metaKey: true })).toBeNull();
    expect(keyToNav({ key: "Enter" })).toBeNull();
  });

  it("deslizar: para a esquerda avança, para a direita volta; rolagem vertical e toque curto não contam", () => {
    expect(swipeToNav(-120, 10)).toBe("next");
    expect(swipeToNav(120, -15)).toBe("prev");
    expect(swipeToNav(-40, 0)).toBeNull();
    expect(swipeToNav(-90, 80)).toBeNull();
  });
});

describe("cronômetro pelo horário de término", () => {
  const t0 = 1_700_000_000_000;

  it("conta pelo alvo absoluto: um intervalo atrasado (tela bloqueada) não atrasa o relógio", () => {
    const timer = startTimer("s1", 1500, t0);
    expect(timer).toEqual({ stepId: "s1", durationMs: 1_500_000, endsAt: t0 + 1_500_000 });
    // a aba ficou 10 minutos sem nenhum tick: ao voltar, o restante já está certo
    expect(timerRemainingMs(timer, t0 + 600_000)).toBe(900_000);
    expect(formatClock(timerRemainingMs(timer, t0 + 600_000))).toBe("15:00");
    expect(timerDone(timer, t0 + 1_499_999)).toBe(false);
    expect(timerDone(timer, t0 + 1_500_000)).toBe(true);
    expect(timerRemainingMs(timer, t0 + 2_000_000)).toBe(0);
  });

  it("relógio arredonda para cima e mostra horas quando passa de 60 min", () => {
    expect(formatClock(1_500_000)).toBe("25:00");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(3_723_000)).toBe("1:02:03");
  });

  it("ao reabrir, só toca o alarme do que terminou há pouco", () => {
    const timer = startTimer("s1", 60, t0);
    expect(shouldAlarmOnRestore(timer, t0 + 30_000)).toBe(false); // ainda correndo
    expect(shouldAlarmOnRestore(timer, t0 + 60_000 + 1_000)).toBe(true);
    expect(shouldAlarmOnRestore(timer, t0 + 60_000 + ALARM_GRACE_MS + 1)).toBe(false);
  });
});

describe("progresso guardado no aparelho", () => {
  const now = 1_700_000_000_000;
  const ids = ["s1", "s2", "s3"];

  it("ida e volta com etapa atual, concluídas e cronômetros", () => {
    const timer = startTimer("s1", 1500, now);
    const raw = serializeCookProgress({ step: 1, done: ["s1"], timers: [timer] }, now);
    expect(parseCookProgress(raw, now + 1000, ids)).toEqual({ step: 1, done: ["s1"], timers: [timer] });
  });

  it("descarta depois de 24 h, JSON quebrado, versão desconhecida e data no futuro", () => {
    const raw = serializeCookProgress({ step: 2, done: ["s2"], timers: [] }, now);
    expect(parseCookProgress(raw, now + COOK_PROGRESS_TTL_MS + 1, ids)).toEqual({ step: 0, done: [], timers: [] });
    expect(parseCookProgress("{", now, ids)).toEqual({ step: 0, done: [], timers: [] });
    expect(parseCookProgress(JSON.stringify({ v: 2, savedAt: now, step: 1, done: [], timers: [] }), now, ids).step).toBe(0);
    expect(parseCookProgress(JSON.stringify({ v: 1, savedAt: now + 3_600_000, step: 1, done: ["s1"], timers: [] }), now, ids).done).toEqual([]);
    expect(parseCookProgress(null, now, ids).step).toBe(0);
  });

  it("filtra etapas que não existem mais, repetidas, cronômetro forjado e etapa fora do limite", () => {
    const raw = JSON.stringify({
      v: 1,
      savedAt: now,
      step: 9,
      done: ["s1", "s1", "sumiu", 3],
      timers: [
        { stepId: "s2", durationMs: 60_000, endsAt: now + 30_000 },
        { stepId: "s3", durationMs: 60_000, endsAt: now + 86_400_000 },
        { stepId: "sumiu", durationMs: 60_000, endsAt: now + 1_000 },
        { stepId: "s1", durationMs: -5, endsAt: now },
      ],
    });
    expect(parseCookProgress(raw, now, ids)).toEqual({ step: 2, done: ["s1"], timers: [{ stepId: "s2", durationMs: 60_000, endsAt: now + 30_000 }] });
  });

  it("marcar e desmarcar etapa", () => {
    expect(toggleDone([], "s1")).toEqual(["s1"]);
    expect(toggleDone(["s1", "s2"], "s1")).toEqual(["s2"]);
  });
});
