import { parseGuideBody, parseRecipeBody, parseVideoBody, parseWorkoutBody } from "@/components/content/body-types";
import type { ContentType } from "@/lib/supabase/helpers";

// Números resumidos do corpo por tipo (para o admin bater o olho sem ler o JSON).
export type BodySummary =
  | { kind: "video"; points: number; transcript: number }
  | { kind: "recipe"; ingredients: number; steps: number; servings: number; allergens: string[] }
  | { kind: "workout"; blocks: number; exercises: number; safetyNote: boolean }
  | { kind: "guide"; sections: number; points: number }
  | { kind: "article"; sections: number }
  | { kind: "empty" };

export function summarizeBody(type: ContentType, body: unknown): BodySummary {
  if (!body || typeof body !== "object" || Object.keys(body as object).length === 0) return { kind: "empty" };
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
