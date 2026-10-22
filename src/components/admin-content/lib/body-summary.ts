import { parseGuideBody, parseRecipeBody, parseVideoBody, parseWorkoutBody } from "@/components/content/body-types";
import type { RecipeRows } from "@/lib/recipes/rows";
import type { ContentType } from "@/lib/supabase/helpers";

// Números resumidos do corpo por tipo (para o admin bater o olho sem ler o JSON).
export type BodySummary =
  | { kind: "video"; points: number; transcript: number }
  | { kind: "recipe"; ingredients: number; steps: number; servings: number; allergens: string[] }
  /** Receita estruturada (0027): contagens das tabelas; alérgenos declarados (lista vazia = "nenhum") ou não informados. */
  | { kind: "recipeStructured"; ingredients: number; steps: number; servings: number | null; allergensDeclared: boolean; allergens: string[] }
  /** Corpo é só o marcador do editor novo e as tabelas não foram lidas: ver a prévia. */
  | { kind: "structured" }
  | { kind: "workout"; blocks: number; exercises: number; safetyNote: boolean }
  | { kind: "guide"; sections: number; points: number }
  | { kind: "article"; sections: number }
  | { kind: "empty" };

/** Marcador gravado por recipe_save no content_bodies.body: o conteúdo mora nas tabelas. */
export function isStructuredRecipeMarker(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.kind === "recipe" && b.schema === 2;
}

/** Resumo da receita estruturada a partir das tabelas (o que o admin aprova na revisão). */
export function summarizeRecipeRows(rows: Pick<RecipeRows, "details" | "ingredients" | "steps">): BodySummary {
  const d = rows.details;
  return {
    kind: "recipeStructured",
    ingredients: rows.ingredients.length,
    steps: rows.steps.length,
    servings: d?.servings ?? null,
    allergensDeclared: d?.allergens_declared ?? false,
    allergens: d?.allergens_declared ? (d.allergens ?? []) : [],
  };
}

export function summarizeBody(type: ContentType, body: unknown): BodySummary {
  if (!body || typeof body !== "object" || Object.keys(body as object).length === 0) return { kind: "empty" };
  // o marcador lido como corpo v1 daria "0 ingredientes · 0 passos"
  if (type === "recipe" && isStructuredRecipeMarker(body)) return { kind: "structured" };
  switch (type) {
    case "video": {
      const v = parseVideoBody(body);
      const transcript = Array.isArray((body as Record<string, unknown>).transcript) ? ((body as Record<string, unknown>).transcript as unknown[]).length : 0;
      return { kind: "video", points: v.keyPoints.length, transcript };
    }
    case "recipe": {
      const r = parseRecipeBody(body);
      return { kind: "recipe", ingredients: r.ingredients.length, steps: r.steps.length, servings: r.servings ?? 0, allergens: r.allergens };
    }
    case "workout": {
      const w = parseWorkoutBody(body);
      return { kind: "workout", blocks: w.blocks.length, exercises: w.blocks.reduce((n, b) => n + b.exercises.length, 0), safetyNote: Boolean(w.safetyNote) };
    }
    case "guide": {
      const g = parseGuideBody(body);
      return { kind: "guide", sections: g.sections.length, points: g.keyPoints.length };
    }
    default: {
      const g = parseGuideBody(body);
      return { kind: "article", sections: g.sections.length };
    }
  }
}
