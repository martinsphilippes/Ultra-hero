import { z } from "zod";

// Conceito do programa (0048): a ideia do programa na voz dele, para quem é, o que se conquista, como
// funciona, ritmo, o que precisa e cuidados. Vive na versão (program_versions.concept) e na tradução
// (program_localizations.concept); o banco confere a forma com program_concept_valid().

export const CONCEPT_LIMITS = {
  idea: { min: 20, max: 600 },
  forWho: { min: 3, max: 300 },
  notFor: { max: 300 },
  outcomes: { min: 1, max: 3, itemMin: 3, itemMax: 140 },
  method: { min: 3, max: 4, titleMin: 2, titleMax: 60, textMin: 3, textMax: 300 },
  sessionsPerWeek: { min: 1, max: 14 },
  minutesPerDay: { min: 1, max: 240 },
  rhythmNote: { max: 140 },
  needs: { max: 8, itemMin: 1, itemMax: 60 },
  care: { min: 10, max: 400 },
} as const;

const L = CONCEPT_LIMITS;
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
// texto opcional: vazio vira null
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));
const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

export const programConceptSchema = z.object({
  idea: text(L.idea.min, L.idea.max),
  for_who: text(L.forWho.min, L.forWho.max),
  not_for: optionalText(L.notFor.max),
  outcomes: z.array(text(L.outcomes.itemMin, L.outcomes.itemMax)).min(L.outcomes.min).max(L.outcomes.max),
  method: z
    .array(z.object({ title: text(L.method.titleMin, L.method.titleMax), text: text(L.method.textMin, L.method.textMax) }))
    .min(L.method.min)
    .max(L.method.max),
  rhythm: z.object({
    sessions_per_week: optionalInt(L.sessionsPerWeek.min, L.sessionsPerWeek.max),
    minutes_per_day: optionalInt(L.minutesPerDay.min, L.minutesPerDay.max),
    note: optionalText(L.rhythmNote.max),
  }),
  needs: z.array(text(L.needs.itemMin, L.needs.itemMax)).max(L.needs.max),
  care: text(L.care.min, L.care.max),
});

export type ProgramConcept = z.output<typeof programConceptSchema>;

/** Lê o jsonb do banco: conceito válido ou null (forma inesperada não derruba a página). */
export function parseConcept(raw: unknown): ProgramConcept | null {
  if (raw === null || raw === undefined) return null;
  const parsed = programConceptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Conceito exibido: o da tradução publicada no idioma da interface vence (mesma regra de título e
 * resumo); senão, o da versão. Quem chama já filtrou a tradução por status = published.
 */
export function pickConcept(versionConcept: unknown, localizedConcept: unknown): ProgramConcept | null {
  return parseConcept(localizedConcept) ?? parseConcept(versionConcept);
}

export type ConceptView =
  | { kind: "concept"; concept: ProgramConcept }
  | { kind: "description"; description: string }
  | { kind: "empty" };

/** Sem conceito, a seção cai para a descrição antiga (quando houver). */
export function conceptView(concept: ProgramConcept | null, description: string | null | undefined): ConceptView {
  if (concept) return { kind: "concept", concept };
  const d = description?.trim();
  return d ? { kind: "description", description: d } : { kind: "empty" };
}

export type RhythmChip = { key: "weeks" | "sessions" | "minutes"; n: number };

/** Chips de ritmo na ordem semanas → sessões/semana → minutos/dia; some o que for nulo. */
export function rhythmChips(estimatedWeeks: number | null | undefined, concept: ProgramConcept | null): RhythmChip[] {
  const chips: RhythmChip[] = [];
  if (estimatedWeeks && estimatedWeeks > 0) chips.push({ key: "weeks", n: estimatedWeeks });
  const r = concept?.rhythm;
  if (r?.sessions_per_week) chips.push({ key: "sessions", n: r.sessions_per_week });
  if (r?.minutes_per_day) chips.push({ key: "minutes", n: r.minutes_per_day });
  return chips;
}

// ---------------------------------------------------------------- formulário (admin)
// Estado do formulário: tudo string (inputs controlados). Vazio por completo = sem conceito.
export type ConceptForm = {
  idea: string;
  for_who: string;
  not_for: string;
  outcomes: string[];
  method: { title: string; text: string }[];
  sessions_per_week: string;
  minutes_per_day: string;
  rhythm_note: string;
  needs: string[];
  care: string;
};

export function emptyConceptForm(): ConceptForm {
  return {
    idea: "",
    for_who: "",
    not_for: "",
    outcomes: [""],
    method: [
      { title: "", text: "" },
      { title: "", text: "" },
      { title: "", text: "" },
    ],
    sessions_per_week: "",
    minutes_per_day: "",
    rhythm_note: "",
    needs: [],
    care: "",
  };
}

export function conceptToForm(raw: unknown): ConceptForm {
  const c = parseConcept(raw);
  if (!c) return emptyConceptForm();
  return {
    idea: c.idea,
    for_who: c.for_who,
    not_for: c.not_for ?? "",
    outcomes: [...c.outcomes],
    method: c.method.map((m) => ({ ...m })),
    sessions_per_week: c.rhythm.sessions_per_week ? String(c.rhythm.sessions_per_week) : "",
    minutes_per_day: c.rhythm.minutes_per_day ? String(c.rhythm.minutes_per_day) : "",
    rhythm_note: c.rhythm.note ?? "",
    needs: [...c.needs],
    care: c.care,
  };
}

function isBlankForm(f: ConceptForm): boolean {
  const strings = [f.idea, f.for_who, f.not_for, f.sessions_per_week, f.minutes_per_day, f.rhythm_note, f.care, ...f.outcomes, ...f.needs, ...f.method.flatMap((m) => [m.title, m.text])];
  return strings.every((s) => !s.trim());
}

// número inválido vira NaN e reprova no schema
function toInt(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Converte o formulário em conceito. Linhas vazias de listas são ignoradas; formulário todo vazio = null
 * (remove o conceito). Erro devolve os caminhos inválidos (ex.: "outcomes", "method.1.text").
 */
export function formToConcept(f: ConceptForm): { ok: true; concept: ProgramConcept | null } | { ok: false; paths: string[] } {
  if (isBlankForm(f)) return { ok: true, concept: null };
  const candidate = {
    idea: f.idea,
    for_who: f.for_who,
    not_for: f.not_for,
    outcomes: f.outcomes.filter((o) => o.trim()),
    method: f.method.filter((m) => m.title.trim() || m.text.trim()),
    rhythm: { sessions_per_week: toInt(f.sessions_per_week), minutes_per_day: toInt(f.minutes_per_day), note: f.rhythm_note },
    needs: f.needs.filter((n) => n.trim()),
    care: f.care,
  };
  const parsed = programConceptSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, concept: parsed.data };
  return { ok: false, paths: Array.from(new Set(parsed.error.issues.map((i) => i.path.join(".")))) };
}

/** Erro do PostgREST/Postgres por coluna inexistente (banco sem a 0048). */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .*concept.* does not exist|could not find the 'concept' column/i.test(error.message ?? "");
}
