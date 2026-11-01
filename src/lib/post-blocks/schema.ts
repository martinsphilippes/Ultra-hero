import { z } from "zod";
import type { Pillar } from "@/lib/supabase/helpers";

// Blocos por pilar do Novo post (0075): lógica pura, compartilhada por composer, actions, página do
// conteúdo e testes. Rotina não tem bloco; Treino → passos marcáveis por pessoa; Nutrição → receita,
// produto ou prato; Gastronomia → cardápio do chef. O banco repete os limites (post_block_data_ok).

export const BLOCK_KINDS = ["workout", "nutrition", "menu"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const WORKOUT_STEPS_MAX = 20;
export const NUTRITION_ITEMS_MAX = 6;
export const MENU_OPTIONS_MAX = 5;
export const BLOCK_DESCRIPTION_MAX = 2000;
export const BLOCK_STEP_MAX = 200;
export const BLOCK_NAME_MAX = 80;
export const BLOCK_NOTE_MAX = 300;

/** Bloco que cada pilar abre no composer (Rotina: nenhum). */
export const PILLAR_BLOCK: Record<Pillar, BlockKind | null> = { routine: null, training: "workout", nutrition: "nutrition", gastronomy: "menu" };

const text = (max: number) => z.string().trim().max(max);
const uuid = z.uuid();

export const workoutSchema = z.object({
  description: text(BLOCK_DESCRIPTION_MAX),
  steps: z.array(z.object({ text: text(BLOCK_STEP_MAX).min(1) })).min(1).max(WORKOUT_STEPS_MAX),
});

export const nutritionItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recipe"), content_id: uuid }),
  z.object({ kind: z.literal("product"), product_id: uuid }),
  z.object({ kind: z.literal("dish"), name: text(BLOCK_NAME_MAX).min(1), description: text(BLOCK_NOTE_MAX) }),
]);
export const nutritionSchema = z.object({ items: z.array(nutritionItemSchema).min(1).max(NUTRITION_ITEMS_MAX) });

export const menuSchema = z.object({
  options: z.array(z.object({ name: text(BLOCK_NAME_MAX).min(1), description: text(BLOCK_NOTE_MAX), recipe_id: uuid.nullable() })).min(1).max(MENU_OPTIONS_MAX),
});

export const postBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workout"), data: workoutSchema }),
  z.object({ kind: z.literal("nutrition"), data: nutritionSchema }),
  z.object({ kind: z.literal("menu"), data: menuSchema }),
]);

export type WorkoutData = z.infer<typeof workoutSchema>;
export type NutritionItem = z.infer<typeof nutritionItemSchema>;
export type NutritionData = z.infer<typeof nutritionSchema>;
export type MenuData = z.infer<typeof menuSchema>;
export type PostBlock = z.infer<typeof postBlockSchema>;

/** Rascunho do composer: cada pilar guarda o seu, para trocar de pilar e voltar sem perder o texto. */
export type BlockDrafts = {
  workout: { description: string; steps: string[] };
  nutrition: { items: NutritionItem[] };
  menu: { options: { name: string; description: string; recipe_id: string | null }[] };
};

export function emptyDrafts(): BlockDrafts {
  return { workout: { description: "", steps: [""] }, nutrition: { items: [] }, menu: { options: [{ name: "", description: "", recipe_id: null }] } };
}

/** O rascunho tem alguma coisa escrita? (vazio = o post sai sem bloco, como na Rotina) */
export function draftIsEmpty(kind: BlockKind, drafts: BlockDrafts): boolean {
  if (kind === "workout") return drafts.workout.description.trim() === "" && drafts.workout.steps.every((s) => s.trim() === "");
  if (kind === "nutrition") return drafts.nutrition.items.length === 0;
  return drafts.menu.options.every((o) => o.name.trim() === "" && o.description.trim() === "" && o.recipe_id === null);
}

export type DraftResult = { ok: true; block: PostBlock | null } | { ok: false; error: "workout_steps" | "workout_step_text" | "nutrition_items" | "menu_name" | "invalid_block" };

/**
 * Bloco a publicar para o pilar: Rotina ou rascunho vazio → nenhum; senão valida. Passos e opções
 * em branco no fim da lista são descartados (a pessoa deixou uma linha a mais).
 */
export function draftToBlock(pillar: Pillar, drafts: BlockDrafts): DraftResult {
  const kind = PILLAR_BLOCK[pillar];
  if (!kind || draftIsEmpty(kind, drafts)) return { ok: true, block: null };
  if (kind === "workout") {
    const steps = drafts.workout.steps.map((s) => s.trim()).filter(Boolean);
    if (steps.length === 0) return { ok: false, error: "workout_steps" };
    const parsed = workoutSchema.safeParse({ description: drafts.workout.description, steps: steps.map((text) => ({ text })) });
    return parsed.success ? { ok: true, block: { kind, data: parsed.data } } : { ok: false, error: "invalid_block" };
  }
  if (kind === "nutrition") {
    const parsed = nutritionSchema.safeParse({ items: drafts.nutrition.items });
    return parsed.success ? { ok: true, block: { kind, data: parsed.data } } : { ok: false, error: "nutrition_items" };
  }
  const options = drafts.menu.options.filter((o) => o.name.trim() !== "" || o.description.trim() !== "" || o.recipe_id !== null);
  if (options.some((o) => o.name.trim() === "")) return { ok: false, error: "menu_name" };
  const parsed = menuSchema.safeParse({ options });
  return parsed.success ? { ok: true, block: { kind, data: parsed.data } } : { ok: false, error: "invalid_block" };
}

/** Linha do banco → bloco tipado (linha corrompida ou de outro tipo é ignorada). */
export function parsePostBlock(row: { kind: string; data: unknown }): PostBlock | null {
  const parsed = postBlockSchema.safeParse({ kind: row.kind, data: row.data });
  return parsed.success ? parsed.data : null;
}

/** Passos feitos de um treino, a partir das marcações da pessoa (índices fora da lista não contam). */
export function workoutProgress(data: WorkoutData, checked: readonly number[]): { done: number; total: number } {
  const total = data.steps.length;
  const done = new Set(checked.filter((i) => Number.isInteger(i) && i >= 0 && i < total)).size;
  return { done, total };
}
