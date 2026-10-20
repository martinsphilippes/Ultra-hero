import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveContentAction } from "@/app/admin/content-actions";
import { createContent, updateContent } from "@/app/creator/content/actions";
import { nutritionDisplayState, nutritionHasValues, parseNutrition, parseRecipeBody } from "@/components/content/body-types";
import {
  bodySchema,
  emptyBody,
  emptyNutrition,
  normalizeBody,
  nutritionSchema,
  parseContentForm,
  recipeBodySchema,
  stripNutritionValidation,
  toFormValues,
} from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";

// Informação nutricional validada (RF-006, RB-08): esquema, actions (personalidade não valida;
// admin só valida com responsável e data) e regra pura de exibição.

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  NEW: "5d1f3a2e-8c4b-4e6f-9a7d-2b3c4d5e6f70",
}));
const server = vi.hoisted(() => ({
  writes: [] as { table: string; op: "insert" | "update" | "upsert"; payload: Record<string, unknown> }[],
  rpcs: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => ({ id: ids.USER }), hasRole: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string) => {
      server.rpcs.push(fn);
      return fn === "my_creator_id" ? { data: ids.CREATOR, error: null } : { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ids.CONTENT, status: "draft", review_status: "none" }, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        server.writes.push({ table, op: "update", payload });
        return { eq: async () => ({ error: null }) };
      },
      insert: (payload: Record<string, unknown>) => {
        server.writes.push({ table, op: "insert", payload });
        return { select: () => ({ single: async () => ({ data: { id: ids.NEW }, error: null }) }) };
      },
      upsert: async (payload: Record<string, unknown>) => {
        server.writes.push({ table, op: "upsert", payload });
        return { error: null };
      },
    }),
  }),
}));

const NO_MEDIA = { provider: "none", ref: null, captions_url: null } as const;
const PER_SERVING = { kcal: 520, protein_g: 42, carbs_g: 38.5, fat_g: 21, fiber_g: 6, sodium_mg: 480 };
const VALIDATED = { per_serving: PER_SERVING, validated: true, validated_by: "Nutricionista CRN 00000", validated_at: "2026-10-20", note: "Estimativa." };

function recipeForm(nutrition: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: ids.CONTENT,
    title: "Bowl de frango",
    summary: "Proteína e legumes.",
    pillar: "gastronomy",
    type: "recipe",
    source_locale: "pt-BR",
    cover_url: "/placeholders/cover-gastronomy-1.svg",
    duration_minutes: 30,
    difficulty: "beginner",
    tags: ["frango"],
    has_captions: false,
    disclaimer_kind: "nutrition",
    body: {
      kind: "recipe",
      servings: 2,
      prep_minutes: 10,
      cook_minutes: 25,
      ingredients: [{ item: "Peito de frango", qty: "300 g" }],
      steps: ["Grelhe o frango."],
      allergens: [],
      note: "",
      nutrition,
    },
    media: NO_MEDIA,
    ...overrides,
  };
}
const asValues = (v: Record<string, unknown>) => v as unknown as ContentFormValues;
const bodyWrites = () => server.writes.filter((w) => w.table === "content_bodies" && w.op === "upsert").map((w) => w.payload.body as Record<string, unknown>);

function errorsOf(input: unknown): Record<string, string> {
  const result = parseContentForm(input);
  return result.ok ? {} : result.errors;
}

describe("nutritionSchema / recipeBodySchema", () => {
  it("aceita números não negativos (inclusive decimais) e nulos", () => {
    expect(nutritionSchema.safeParse({ ...VALIDATED, validated: false, validated_by: null, validated_at: null }).success).toBe(true);
    expect(nutritionSchema.safeParse({ ...emptyNutrition(), per_serving: { ...emptyNutrition().per_serving, kcal: 0 } }).success).toBe(true);
  });

  it("rejeita número negativo e acima do teto com a chave invalidNumber no caminho do nutriente", () => {
    expect(errorsOf(recipeForm({ ...VALIDATED, per_serving: { ...PER_SERVING, kcal: -1 } }))).toEqual({ "body.nutrition.per_serving.kcal": "invalidNumber" });
    expect(errorsOf(recipeForm({ ...VALIDATED, per_serving: { ...PER_SERVING, sodium_mg: 100_001 } }))).toEqual({ "body.nutrition.per_serving.sodium_mg": "invalidNumber" });
  });

  it("validado = true exige responsável e data (RB-08)", () => {
    expect(errorsOf(recipeForm({ ...VALIDATED, validated_by: null, validated_at: null }))).toEqual({
      "body.nutrition.validated_by": "validatorRequired",
      "body.nutrition.validated_at": "validatedAtRequired",
    });
    expect(errorsOf(recipeForm({ ...VALIDATED, validated_by: "   " }))).toEqual({ "body.nutrition.validated_by": "validatorRequired" });
    expect(errorsOf(recipeForm(VALIDATED))).toEqual({});
  });

  it("data da validação precisa ser um dia real no formato AAAA-MM-DD", () => {
    expect(errorsOf(recipeForm({ ...VALIDATED, validated_at: "20/10/2026" }))).toEqual({ "body.nutrition.validated_at": "invalidDate" });
    expect(errorsOf(recipeForm({ ...VALIDATED, validated_at: "2026-02-30" }))).toEqual({ "body.nutrition.validated_at": "invalidDate" });
    expect(errorsOf(recipeForm({ ...VALIDATED, validated_at: "2024-02-29" }))).toEqual({});
  });

  it("corpo sem nutrição continua válido (nutrition vira null) e o corpo vazio de receita passa", () => {
    const parsed = recipeBodySchema.safeParse({ ...recipeForm(null).body, nutrition: undefined });
    expect(parsed.success && parsed.data.nutrition).toBeNull();
    expect(bodySchema.safeParse(emptyBody("recipe")).success).toBe(true);
  });

  it("nutrição sem nada informado é compactada para null; com números é mantida", () => {
    const empty = parseContentForm(recipeForm(emptyNutrition()));
    expect(empty.ok && (empty.data.body as { nutrition: unknown }).nutrition).toBeNull();
    const filled = parseContentForm(recipeForm({ ...emptyNutrition(), per_serving: { ...emptyNutrition().per_serving, kcal: 120 } }));
    expect(filled.ok && (filled.data.body as { nutrition: { per_serving: { kcal: number } } }).nutrition.per_serving.kcal).toBe(120);
  });

  it("normalizeBody/toFormValues toleram nutrição ausente, parcial ou com strings numéricas", () => {
    expect(normalizeBody("recipe", { ingredients: [] }).kind === "recipe" && (normalizeBody("recipe", { ingredients: [] }) as { nutrition: unknown }).nutrition).toBeNull();
    const body = normalizeBody("recipe", { nutrition: { per_serving: { kcal: "250", protein_g: "x" }, validated: "true", validated_at: "2026-10-20" } });
    expect(body.kind === "recipe" && body.nutrition).toEqual({
      per_serving: { kcal: 250, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sodium_mg: null },
      validated: false,
      validated_by: null,
      validated_at: "2026-10-20",
      note: "",
    });
    const values = toFormValues({ type: "recipe", body: { nutrition: VALIDATED } });
    expect((values.body as { nutrition: unknown }).nutrition).toEqual(VALIDATED);
  });
});

describe("stripNutritionValidation (pura)", () => {
  it("zera a validação mantendo os números e a nota", () => {
    const stripped = stripNutritionValidation(asValues(recipeForm(VALIDATED)));
    expect((stripped.body as { nutrition: unknown }).nutrition).toEqual({ ...VALIDATED, validated: false, validated_by: null, validated_at: null });
  });

  it("não mexe em corpos sem nutrição nem de outros tipos", () => {
    const recipe = asValues(recipeForm(null));
    expect(stripNutritionValidation(recipe)).toBe(recipe);
    const guide = asValues(recipeForm(VALIDATED, { type: "guide", body: { kind: "guide", intro: "", sections: [{ heading: "", text: "x" }], key_points: [], nutrition: VALIDATED } }));
    expect(stripNutritionValidation(guide)).toBe(guide);
  });
});

describe("actions: personalidade nunca valida; admin só com responsável e data", () => {
  beforeEach(() => {
    server.writes.length = 0;
    server.rpcs.length = 0;
  });

  it("createContent (personalidade) grava a nutrição com validação zerada mesmo recebendo validated=true", async () => {
    const result = await createContent(asValues(recipeForm(VALIDATED, { id: undefined })));
    expect(result).toEqual({ ok: true, id: ids.NEW });
    expect(bodyWrites()).toHaveLength(1);
    expect(bodyWrites()[0].nutrition).toEqual({ ...VALIDATED, validated: false, validated_by: null, validated_at: null });
  });

  it("updateContent (personalidade) também zera a validação", async () => {
    const result = await updateContent(asValues(recipeForm(VALIDATED)));
    expect(result).toEqual({ ok: true, id: ids.CONTENT });
    expect(bodyWrites()[0].nutrition).toMatchObject({ validated: false, validated_by: null, validated_at: null, per_serving: PER_SERVING });
  });

  it("saveContentAction (admin) recusa validated=true sem responsável/data, sem tocar no banco", async () => {
    expect(await saveContentAction({ id: ids.CONTENT, creatorId: ids.CREATOR }, asValues(recipeForm({ ...VALIDATED, validated_by: null })))).toEqual({
      ok: false,
      error: "adminContent.errors.invalid_input",
    });
    expect(await saveContentAction({ id: ids.CONTENT, creatorId: ids.CREATOR }, asValues(recipeForm({ ...VALIDATED, validated_at: null })))).toEqual({
      ok: false,
      error: "adminContent.errors.invalid_input",
    });
    expect(server.writes).toEqual([]);
  });

  it("saveContentAction (admin) grava a validação completa", async () => {
    const result = await saveContentAction({ id: ids.CONTENT, creatorId: ids.CREATOR }, asValues(recipeForm(VALIDATED)));
    expect(result).toEqual({ ok: true, id: ids.CONTENT, message: "adminContent.content.form.updated" });
    expect(bodyWrites()[0].nutrition).toEqual(VALIDATED);
  });
});

describe("nutritionDisplayState (regra pura de exibição, RB-08)", () => {
  const parsed = (raw: unknown) => parseRecipeBody({ kind: "recipe", ingredients: [], steps: [], nutrition: raw }).nutrition;

  it("sem nutrição ou sem números: nada é exibido", () => {
    expect(nutritionDisplayState(null)).toBe("hidden");
    expect(nutritionDisplayState(parsed({ validated: true, validated_by: "X", validated_at: "2026-10-20" }))).toBe("hidden");
    expect(nutritionDisplayState(parsed({ per_serving: { kcal: null }, validated: false }))).toBe("hidden");
  });

  it("números validados com responsável e data: tabela", () => {
    expect(nutritionDisplayState(parsed(VALIDATED))).toBe("validated");
  });

  it("números sem validação completa: só 'em validação', nunca como certificado", () => {
    expect(nutritionDisplayState(parsed({ ...VALIDATED, validated: false }))).toBe("pending");
    expect(nutritionDisplayState(parsed({ ...VALIDATED, validated_by: null }))).toBe("pending");
    expect(nutritionDisplayState(parsed({ ...VALIDATED, validated_at: "ontem" }))).toBe("pending");
    expect(nutritionDisplayState(parsed({ ...VALIDATED, validated: "true" }))).toBe("pending");
  });

  it("parseNutrition normaliza o JSON do seed (0017) para camelCase e ignora lixo", () => {
    expect(parseNutrition(VALIDATED)).toEqual({
      perServing: { kcal: 520, proteinG: 42, carbsG: 38.5, fatG: 21, fiberG: 6, sodiumMg: 480 },
      validated: true,
      validatedBy: "Nutricionista CRN 00000",
      validatedAt: "2026-10-20",
      note: "Estimativa.",
    });
    expect(parseNutrition("x")).toBeNull();
    expect(nutritionHasValues(parseNutrition({ per_serving: { kcal: -5 } }))).toBe(false);
  });
});
