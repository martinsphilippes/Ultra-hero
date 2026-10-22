// Estado do editor de receitas (RecipeWizard) e as conversões tabelas → rascunho → payload.
// Números ficam como texto no rascunho (a pessoa digita "1/2", "1,5", apaga e redigita); viram
// número só ao montar o payload, com os mesmos limites do banco. Regras puras, sem diretiva.
import { RECIPE_ALLERGENS, RECIPE_DIETS, RECIPE_UNITS, type RecipeAllergen, type RecipeDiet, type RecipeUnit } from "./codes";
import { recipePayloadSchema, coerceRecipeLicense, payloadIssues, type PayloadIssue, type RecipeLicenseKind, type RecipePayload, type RecipeVideoProvider } from "./payload";
import { formatAmount, parseQuantity } from "./quantity";
import { fieldIdForPath } from "./editor-steps";
import type { RecipeContentRow, RecipeRows } from "./rows";

export type DraftSubstitution = { name: string; amount: string; unit: RecipeUnit | ""; note: string };
export type DraftIngredient = {
  id: string;
  name: string;
  amount: string;
  unit: RecipeUnit | "";
  toTaste: boolean;
  optional: boolean;
  note: string;
  substitutions: DraftSubstitution[];
};
export type DraftStep = {
  id: string;
  instruction: string;
  minutes: string;
  seconds: string;
  temperature: string;
  tip: string;
  imageMediaId: string | null;
  ingredientIds: string[];
};
export type DraftMedia = { id: string; role: "gallery" | "step"; position: number; alt: string; caption: string; width: number | null; height: number | null };
export const NUTRITION_FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg"] as const;
export type NutritionField = (typeof NUTRITION_FIELDS)[number];
export type DraftNutrition = Record<NutritionField, string> & { source: "chef" | "nutritionist" | "food_table" | "lab"; sourceNote: string };
export type DraftVideo = { provider: RecipeVideoProvider; ref: string | null };

export type RecipeDraft = {
  title: string;
  summary: string;
  story: string;
  categories: string[];
  difficulty: "" | "beginner" | "intermediate" | "advanced";
  yieldText: string;
  servings: string;
  prep: string;
  cook: string;
  rest: string;
  total: string;
  /** false = o total acompanha preparo + cozimento + descanso; true = a pessoa digitou outro valor. */
  totalTouched: boolean;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  media: DraftMedia[];
  coverMediaId: string | null;
  video: DraftVideo;
  /** O vídeo só vai no payload quando muda (ausente = recipe_save mantém o atual). */
  videoDirty: boolean;
  tags: string[];
  allergensDeclared: boolean;
  allergens: RecipeAllergen[];
  allergenNotes: string;
  diets: RecipeDiet[];
  nutritionEnabled: boolean;
  nutrition: DraftNutrition;
  licenseKind: RecipeLicenseKind;
  licenseRef: string;
  credit: string;
  chefNote: string;
  // campos que a receita já tinha e o editor não mostra: voltam iguais no payload
  pillar: "routine" | "training" | "nutrition" | "gastronomy";
  disclaimerKind: "general" | "training" | "nutrition" | "none" | null;
};

const EMPTY_NUTRITION: DraftNutrition = { kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", sodium_mg: "", source: "chef", sourceNote: "" };

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function emptyIngredient(): DraftIngredient {
  return { id: newId(), name: "", amount: "", unit: "", toTaste: false, optional: false, note: "", substitutions: [] };
}

export function emptyStep(): DraftStep {
  return { id: newId(), instruction: "", minutes: "", seconds: "", temperature: "", tip: "", imageMediaId: null, ingredientIds: [] };
}

export function emptyDraft(): RecipeDraft {
  return {
    title: "",
    summary: "",
    story: "",
    categories: [],
    difficulty: "",
    yieldText: "",
    servings: "",
    prep: "",
    cook: "",
    rest: "",
    total: "",
    totalTouched: false,
    ingredients: [],
    steps: [],
    media: [],
    coverMediaId: null,
    video: { provider: "none", ref: null },
    videoDirty: false,
    tags: [],
    allergensDeclared: false,
    allergens: [],
    allergenNotes: "",
    diets: [],
    nutritionEnabled: false,
    nutrition: { ...EMPTY_NUTRITION },
    licenseKind: "own",
    licenseRef: "",
    credit: "",
    chefNote: "",
    pillar: "gastronomy",
    disclaimerKind: "nutrition",
  };
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/** Texto do campo de quantidade a partir do banco: número no formato de cozinha ou o texto livre. */
export function amountText(quantity: number | null, unit: RecipeUnit | null, quantityText: string | null): string {
  if (quantity !== null) return formatAmount(quantity, unit);
  return quantityText ?? "";
}

function videoProvider(provider: string | undefined | null): RecipeVideoProvider {
  return provider === "embed_youtube" || provider === "embed_vimeo" || provider === "cloudflare_stream" ? provider : "none";
}

/** Rascunho do editor a partir das tabelas (receita nova, antiga convertida ou editada). */
export function draftFromRows(content: Pick<RecipeContentRow, "title" | "summary" | "tags" | "difficulty" | "pillar" | "disclaimer_kind" | "media_license_kind" | "media_license_ref" | "media_credit">, rows: RecipeRows): RecipeDraft {
  const d = rows.details;
  const prep = d?.prep_minutes ?? null;
  const cook = d?.cook_minutes ?? null;
  const rest = d?.rest_minutes ?? null;
  const sum = (prep ?? 0) + (cook ?? 0) + (rest ?? 0);
  const total = d?.total_minutes ?? null;
  const links = rows.stepIngredients;
  const provider = videoProvider(rows.video?.provider);
  const n = rows.nutrition;
  return {
    title: content.title ?? "",
    summary: content.summary ?? "",
    story: d?.story ?? "",
    categories: rows.categories,
    difficulty: content.difficulty ?? "",
    yieldText: d?.yield_text ?? "",
    servings: str(d?.servings),
    prep: str(prep),
    cook: str(cook),
    rest: str(rest),
    total: str(total),
    totalTouched: total !== null && total !== sum,
    ingredients: rows.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.to_taste ? "" : amountText(i.quantity, i.unit, i.quantity_text),
      unit: i.unit ?? "",
      toTaste: i.to_taste,
      optional: i.optional,
      note: i.note ?? "",
      substitutions: i.substitutions.map((s) => ({ name: s.name, amount: amountText(s.quantity, s.unit, s.quantity_text), unit: s.unit ?? "", note: s.note ?? "" })),
    })),
    steps: rows.steps.map((s) => ({
      id: s.id,
      instruction: s.instruction,
      minutes: s.duration_seconds ? String(Math.floor(s.duration_seconds / 60)) : "",
      seconds: s.duration_seconds && s.duration_seconds % 60 ? String(s.duration_seconds % 60) : "",
      temperature: str(s.temperature_c),
      tip: s.tip ?? "",
      imageMediaId: s.image_media_id,
      ingredientIds: links.filter((l) => l.step_id === s.id).map((l) => l.ingredient_id),
    })),
    media: rows.media.map((m) => ({ id: m.id, role: m.role, position: m.position, alt: m.alt_text ?? "", caption: m.caption ?? "", width: m.width, height: m.height })),
    coverMediaId: d?.cover_media_id ?? null,
    video: { provider, ref: provider === "none" ? null : (rows.video?.ref ?? null) },
    videoDirty: false,
    tags: content.tags ?? [],
    allergensDeclared: d?.allergens_declared ?? false,
    allergens: (d?.allergens ?? []).filter((a): a is RecipeAllergen => (RECIPE_ALLERGENS as readonly string[]).includes(a)),
    allergenNotes: d?.allergen_notes ?? "",
    diets: (d?.diets ?? []).filter((x): x is RecipeDiet => (RECIPE_DIETS as readonly string[]).includes(x)),
    nutritionEnabled: n !== null,
    nutrition: n
      ? { kcal: str(n.kcal), protein_g: str(n.protein_g), carbs_g: str(n.carbs_g), fat_g: str(n.fat_g), fiber_g: str(n.fiber_g), sodium_mg: str(n.sodium_mg), source: n.source, sourceNote: n.source_note ?? "" }
      : { ...EMPTY_NUTRITION },
    licenseKind: coerceRecipeLicense(provider, content.media_license_kind),
    licenseRef: content.media_license_ref ?? "",
    credit: content.media_credit ?? "",
    chefNote: rows.chefNote ?? "",
    pillar: content.pillar ?? "gastronomy",
    disclaimerKind: content.disclaimer_kind ?? null,
  };
}

/** Soma de preparo + cozimento + descanso (vazio conta 0). */
export function timesSum(draft: Pick<RecipeDraft, "prep" | "cook" | "rest">): number {
  return [draft.prep, draft.cook, draft.rest].reduce((acc, v) => acc + (toInt(v) ?? 0), 0);
}

/** Total exibido: acompanha a soma até a pessoa digitar outro valor. */
export function effectiveTotal(draft: Pick<RecipeDraft, "prep" | "cook" | "rest" | "total" | "totalTouched">): number | null {
  if (draft.totalTouched) return toInt(draft.total);
  const sum = timesSum(draft);
  return sum >= 1 ? sum : null;
}

/** "12" → 12; "" → null; "1,5" em campo inteiro → NaN (vira erro "invalid"). */
export function toInt(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  return /^-?\d+$/.test(s) ? Number(s) : Number.NaN;
}

export function toDecimal(value: string): number | null {
  const s = value.trim().replace(",", ".");
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

const blank = (s: string) => s.trim() === "";
const orNull = (s: string) => (blank(s) ? null : s.trim());

export function isBlankIngredient(i: DraftIngredient): boolean {
  return blank(i.name) && blank(i.amount) && !i.toTaste && blank(i.note) && i.substitutions.length === 0;
}
export function isBlankStep(s: DraftStep): boolean {
  return blank(s.instruction) && blank(s.tip) && blank(s.minutes) && blank(s.seconds) && blank(s.temperature) && !s.imageMediaId;
}

type AmountFields = { quantity: number | null; unit: RecipeUnit | null; quantity_text: string | null; to_taste: boolean; extraNote: string | null; problem: string | null };

/**
 * Quantidade digitada → colunas do banco. Número ("2", "1/2", "1,5", "2 1/2") com a unidade
 * escolhida; unidade ou tamanho escritos junto ("1/2 xícara", "1 média") também são lidos.
 * Texto que não dá para separar ("3 colheres") fica como texto livre e não ajusta com as porções.
 */
export function amountFields(amount: string, unit: RecipeUnit | "", toTaste: boolean): AmountFields {
  const none = { quantity: null, unit: null, quantity_text: null, to_taste: false, extraNote: null, problem: null };
  if (toTaste) return { ...none, to_taste: true };
  const parsed = parseQuantity(amount);
  if (parsed.kind === "empty") return unit ? { ...none, problem: "unitNeedsAmount" } : none;
  if (parsed.kind === "to_taste") return { ...none, to_taste: true };
  if (parsed.kind === "text") {
    if (parsed.text.length > 60) return { ...none, problem: "tooLong" };
    return unit ? { ...none, problem: "unitNeedsNumber" } : { ...none, quantity_text: parsed.text };
  }
  return { ...none, quantity: parsed.quantity, unit: unit || parsed.unit, extraNote: parsed.note };
}

export type DraftIssue = { path: string; fieldId: string; message: string };

export type BuildResult =
  | { ok: true; payload: RecipePayload; ingredientIndex: number[]; stepIndex: number[] }
  | { ok: false; issues: DraftIssue[] };

function issueFor(path: string, message: string): DraftIssue {
  return { path, fieldId: fieldIdForPath(path), message };
}

/**
 * Monta o payload de recipe_save. Linhas totalmente vazias (ingrediente ou etapa recém-adicionados)
 * ficam fora; o resto passa pelo mesmo Zod do servidor. Os caminhos dos erros usam a posição NO
 * RASCUNHO (o que a pessoa vê), e ingredientIndex/stepIndex traduzem a posição do payload de volta.
 */
export function buildPayload(draft: RecipeDraft): BuildResult {
  const issues: DraftIssue[] = [];
  const ingredientIndex: number[] = [];
  const stepIndex: number[] = [];

  const ingredients = draft.ingredients.flatMap((ing, index) => {
    if (isBlankIngredient(ing)) return [];
    const fields = amountFields(ing.amount, ing.unit, ing.toTaste);
    if (fields.problem) issues.push(issueFor(`ingredients.${index}.amount`, fields.problem));
    const note = orNull(ing.note) ?? fields.extraNote;
    const substitutions = ing.substitutions
      .filter((s) => !(blank(s.name) && blank(s.amount) && blank(s.note)))
      .map((s, sIndex) => {
        const sf = amountFields(s.amount, s.unit, false);
        if (sf.problem) issues.push(issueFor(`ingredients.${index}.substitutions.${sIndex}.amount`, sf.problem));
        return { name: s.name.trim(), quantity: sf.quantity, unit: sf.unit, quantity_text: sf.quantity_text, note: orNull(s.note) ?? sf.extraNote };
      });
    ingredientIndex.push(index);
    return [{ id: ing.id, name: ing.name.trim(), quantity: fields.quantity, unit: fields.unit, quantity_text: fields.quantity_text, to_taste: fields.to_taste, optional: ing.optional, note, substitutions }];
  });
  const keptIngredients = new Set(ingredients.map((i) => i.id));

  const steps = draft.steps.flatMap((step, index) => {
    if (isBlankStep(step)) return [];
    const minutes = toInt(step.minutes);
    const seconds = toInt(step.seconds);
    let duration: number | null = null;
    if (Number.isNaN(minutes) || Number.isNaN(seconds) || (minutes ?? 0) < 0 || (seconds ?? 0) < 0 || (seconds ?? 0) > 59) {
      issues.push(issueFor(`steps.${index}.duration_seconds`, "invalid"));
    } else {
      const total = (minutes ?? 0) * 60 + (seconds ?? 0);
      duration = total > 0 ? total : null;
    }
    const temperature = toInt(step.temperature);
    if (Number.isNaN(temperature)) issues.push(issueFor(`steps.${index}.temperature_c`, "invalid"));
    stepIndex.push(index);
    return [
      {
        id: step.id,
        instruction: step.instruction.trim(),
        duration_seconds: duration,
        temperature_c: Number.isNaN(temperature) ? null : temperature,
        tip: orNull(step.tip),
        image_media_id: step.imageMediaId,
        ingredient_ids: step.ingredientIds.filter((id) => keptIngredients.has(id)),
      },
    ];
  });

  // galeria na ordem da tela (1..n); foto de etapa mantém a posição
  let galleryPos = 0;
  const media = draft.media.map((m) => ({
    id: m.id,
    position: m.role === "gallery" ? Math.min(++galleryPos, 40) : Math.min(Math.max(m.position, 1), 40),
    alt_text: orNull(m.alt),
    caption: orNull(m.caption),
  }));
  const coverOk = draft.coverMediaId && draft.media.some((m) => m.id === draft.coverMediaId && m.role === "gallery");

  const intField = (value: string, path: string) => {
    const n = toInt(value);
    if (Number.isNaN(n)) {
      issues.push(issueFor(path, "invalid"));
      return null;
    }
    return n;
  };
  const servings = intField(draft.servings, "details.servings");
  const prep = intField(draft.prep, "details.prep_minutes");
  const cook = intField(draft.cook, "details.cook_minutes");
  const rest = intField(draft.rest, "details.rest_minutes");
  const totalRaw = effectiveTotal(draft);
  if (Number.isNaN(totalRaw)) issues.push(issueFor("details.total_minutes", "invalid"));
  const total = totalRaw !== null && !Number.isNaN(totalRaw) ? totalRaw : null;

  let nutrition: RecipePayload["nutrition"] = null;
  if (draft.nutritionEnabled) {
    const values = {} as Record<(typeof NUTRITION_FIELDS)[number], number | null>;
    for (const key of NUTRITION_FIELDS) {
      const n = toDecimal(draft.nutrition[key]);
      if (Number.isNaN(n)) issues.push(issueFor(`nutrition.${key}`, "invalid"));
      values[key] = n === null || Number.isNaN(n) ? null : Math.round(n * 10) / 10;
    }
    nutrition = { ...values, source: draft.nutrition.source, source_note: orNull(draft.nutrition.sourceNote) };
  }

  const candidate = {
    content: {
      title: draft.title.trim(),
      summary: orNull(draft.summary),
      tags: draft.tags.map((t) => t.trim()).filter(Boolean),
      difficulty: draft.difficulty || null,
      pillar: draft.pillar,
      disclaimer_kind: draft.disclaimerKind,
      media_license_kind: coerceRecipeLicense(draft.video.provider, draft.licenseKind),
      media_license_ref: orNull(draft.licenseRef),
      media_credit: orNull(draft.credit),
    },
    details: {
      servings,
      yield_text: orNull(draft.yieldText),
      prep_minutes: prep,
      cook_minutes: cook,
      rest_minutes: rest,
      total_minutes: total,
      story: orNull(draft.story),
      diets: draft.diets,
      // "nenhum" é declaração explícita; sem declarar, a lista vai vazia
      allergens: draft.allergensDeclared ? draft.allergens : [],
      allergens_declared: draft.allergensDeclared,
      allergen_notes: orNull(draft.allergenNotes),
      cover_media_id: coverOk ? draft.coverMediaId : null,
    },
    extras: { chef_note: orNull(draft.chefNote) },
    categories: draft.categories,
    ingredients,
    steps,
    media,
    nutrition,
    ...(draft.videoDirty ? { video: { provider: draft.video.provider, ref: draft.video.provider === "none" ? null : draft.video.ref } } : {}),
  };

  const parsed = recipePayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of payloadIssues(parsed.error)) issues.push(draftIssue(issue, ingredientIndex, stepIndex));
  }
  if (issues.length > 0 || !parsed.success) return { ok: false, issues: dedupe(issues) };
  return { ok: true, payload: parsed.data, ingredientIndex, stepIndex };
}

function dedupe(issues: DraftIssue[]): DraftIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.path) ? false : (seen.add(i.path), true)));
}

/** Caminho do payload ("ingredients.2.name") → caminho do rascunho (posição que a pessoa vê). */
export function draftIssue(issue: PayloadIssue, ingredientIndex: number[], stepIndex: number[]): DraftIssue {
  const parts = issue.path.split(".");
  if ((parts[0] === "ingredients" || parts[0] === "steps") && /^\d+$/.test(parts[1] ?? "")) {
    const map = parts[0] === "ingredients" ? ingredientIndex : stepIndex;
    const original = map[Number(parts[1])];
    if (original !== undefined) parts[1] = String(original);
  }
  return issueFor(parts.join("."), issue.message);
}

/** Dois rascunhos iguais no que vai para o banco (ignora a ordem de chaves e o estado de UI). */
export function sameDraft(a: RecipeDraft, b: RecipeDraft): boolean {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

function normalizeForCompare(d: RecipeDraft) {
  const { videoDirty: _videoDirty, ...rest } = d;
  void _videoDirty;
  return { ...rest, total: d.totalTouched ? d.total : "", ingredients: d.ingredients.filter((i) => !isBlankIngredient(i)), steps: d.steps.filter((s) => !isBlankStep(s)) };
}

/** Garante que um rascunho vindo do localStorage tem a forma esperada (versões antigas ou lixo). */
export function isRecipeDraft(value: unknown): value is RecipeDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.title === "string" &&
    Array.isArray(d.ingredients) &&
    Array.isArray(d.steps) &&
    Array.isArray(d.media) &&
    Array.isArray(d.categories) &&
    typeof d.video === "object" &&
    d.video !== null &&
    typeof d.nutrition === "object" &&
    d.nutrition !== null &&
    (d.ingredients as unknown[]).every((i) => typeof i === "object" && i !== null && typeof (i as { id?: unknown }).id === "string" && (RECIPE_UNITS as readonly string[]).concat("").includes(String((i as { unit?: unknown }).unit ?? "")))
  );
}

/** Move um item da lista (reordenar com ↑/↓). Fora dos limites, devolve a mesma lista. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
