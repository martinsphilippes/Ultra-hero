// Como trabalhamos (0136): os quatro formatos de atuação com marcas, as respostas às ações da agência e o projeto
// autoral. Lógica pura, compartilhada pelo Portal do Hero, pela ficha do casting e pelos testes.

export const FORMAT_KEYS = ["cpa", "publi", "project", "events"] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** Interesse num formato: sim, avaliar ou não (como na ata da reunião). */
export const FORMAT_INTERESTS = ["yes", "maybe", "no"] as const;
export type FormatInterest = (typeof FORMAT_INTERESTS)[number];
export type FormatChoice = { interest: FormatInterest; note: string };
export type Formats = Partial<Record<FormatKey, FormatChoice>>;

/** Resposta a uma ação (ex.: Black Friday): sim, depende das marcas e condições, ou não. */
export const ACTION_INTERESTS = ["yes", "depends", "no"] as const;
export type ActionInterest = (typeof ACTION_INTERESTS)[number];

export const IDEA_STATUSES = ["received", "studying", "prospecting", "paused", "closed"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const NOTE_MAX = 300;
export const ACTION_LIMITS = { categories: 300, availability: 500, notes: 500 } as const;
export const IDEA_LIMITS = {
  title: 120,
  concept: 1500,
  audience: 500,
  format: 300,
  location: 200,
  timeline: 200,
  stage: 300,
  partners: 500,
  needs: 500,
} as const;
export const IDEA_FIELDS = ["title", "concept", "audience", "format", "location", "timeline", "stage", "partners", "needs"] as const;
export type IdeaField = (typeof IDEA_FIELDS)[number];

export function isFormatKey(v: unknown): v is FormatKey {
  return typeof v === "string" && (FORMAT_KEYS as readonly string[]).includes(v);
}
export function isFormatInterest(v: unknown): v is FormatInterest {
  return typeof v === "string" && (FORMAT_INTERESTS as readonly string[]).includes(v);
}
export function isActionInterest(v: unknown): v is ActionInterest {
  return typeof v === "string" && (ACTION_INTERESTS as readonly string[]).includes(v);
}
export function isIdeaStatus(v: unknown): v is IdeaStatus {
  return typeof v === "string" && (IDEA_STATUSES as readonly string[]).includes(v);
}

/** JSON do banco → formatos marcados (o que vier estranho é ignorado). */
export function parseFormats(v: unknown): Formats {
  const out: Formats = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const key of FORMAT_KEYS) {
    const raw = (v as Record<string, unknown>)[key];
    if (!raw || typeof raw !== "object") continue;
    const interest = (raw as Record<string, unknown>).interest;
    const note = (raw as Record<string, unknown>).note;
    if (isFormatInterest(interest)) out[key] = { interest, note: typeof note === "string" ? note : "" };
  }
  return out;
}

/** Quantos formatos o creator já respondeu (para o "2 de 4" do cartão). */
export function answeredFormats(formats: Formats): number {
  return FORMAT_KEYS.filter((k) => formats[k] !== undefined).length;
}

/** Ação aberta hoje? (o banco confere de novo; aqui só decide se mostra o formulário) */
export function actionOpen(action: { starts_on: string; ends_on: string }, today: string): boolean {
  return action.starts_on <= today && today <= action.ends_on;
}

/** Assunto padrão do e-mail de formalização, como no guia: "ATA | Reunião Creator | Nome | AAAA-MM-DD". */
export function meetingSubject(name: string, isoDate: string): string {
  return `ATA | Reunião Creator | ${name.trim()} | ${isoDate.slice(0, 10)}`;
}
