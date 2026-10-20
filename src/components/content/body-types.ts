// Normalização tolerante dos corpos estruturados (content_bodies.body) por tipo.
// O banco não valida o JSON; aqui garantimos formas previsíveis para a UI.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((v): v is string => Boolean(v)) : [];
}

export type RecipeBody = {
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: { item: string; qty: string | null }[];
  steps: string[];
  allergens: string[];
  note: string | null;
};

export function parseRecipeBody(body: unknown): RecipeBody {
  const b = isRecord(body) ? body : {};
  const ingredients = Array.isArray(b.ingredients)
    ? b.ingredients
        .map((entry) => {
          if (typeof entry === "string") return str(entry) ? { item: entry.trim(), qty: null } : null;
          if (!isRecord(entry)) return null;
          const item = str(entry.item) ?? str(entry.name);
          return item ? { item, qty: str(entry.qty) ?? str(entry.quantity) } : null;
        })
        .filter((v): v is { item: string; qty: string | null } => Boolean(v))
    : [];
  return {
    servings: num(b.servings),
    prepMinutes: num(b.prep_minutes),
    cookMinutes: num(b.cook_minutes),
    ingredients,
    steps: strList(b.steps),
    allergens: strList(b.allergens),
    note: str(b.note),
  };
}

export type WorkoutExercise = { name: string; sets: number | null; reps: string | null; restSeconds: number | null };
export type WorkoutBlock = { name: string; exercises: WorkoutExercise[] };
export type WorkoutBody = { equipment: string[]; blocks: WorkoutBlock[]; safetyNote: string | null };

export function parseWorkoutBody(body: unknown): WorkoutBody {
  const b = isRecord(body) ? body : {};
  const blocks: WorkoutBlock[] = Array.isArray(b.blocks)
    ? b.blocks
        .map((block, index) => {
          if (!isRecord(block)) return null;
          const exercises: WorkoutExercise[] = Array.isArray(block.exercises)
            ? block.exercises
                .map((ex) => {
                  if (!isRecord(ex)) return null;
                  const name = str(ex.name);
                  if (!name) return null;
                  const reps = typeof ex.reps === "number" ? String(ex.reps) : str(ex.reps);
                  return { name, sets: num(ex.sets), reps, restSeconds: num(ex.rest_seconds) };
                })
                .filter((v): v is WorkoutExercise => Boolean(v))
            : [];
          return { name: str(block.name) ?? `Bloco ${index + 1}`, exercises };
        })
        .filter((v): v is WorkoutBlock => Boolean(v))
    : [];
  return { equipment: strList(b.equipment), blocks, safetyNote: str(b.safety_note) };
}

export type GuideBody = { intro: string | null; sections: { heading: string | null; text: string }[]; keyPoints: string[] };

export function parseGuideBody(body: unknown): GuideBody {
  const b = isRecord(body) ? body : {};
  const sections = Array.isArray(b.sections)
    ? b.sections
        .map((section) => {
          if (typeof section === "string") return str(section) ? { heading: null, text: section.trim() } : null;
          if (!isRecord(section)) return null;
          const text = str(section.text) ?? str(section.body);
          return text ? { heading: str(section.heading) ?? str(section.title), text } : null;
        })
        .filter((v): v is { heading: string | null; text: string } => Boolean(v))
    : [];
  return { intro: str(b.intro), sections, keyPoints: strList(b.key_points) };
}

export type VideoBodyMeta = { intro: string | null; keyPoints: string[] };

export function parseVideoBody(body: unknown): VideoBodyMeta {
  const b = isRecord(body) ? body : {};
  return { intro: str(b.intro), keyPoints: strList(b.key_points) };
}
