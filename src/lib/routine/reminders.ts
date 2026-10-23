import { z } from "zod";

// Lembretes (decisão Q5: os itens de rotina criados à mão saíram do Hoje e moram em /profile/lembretes).
// Lógica pura e validação compartilhada pelas server actions e pelos testes: o servidor valida tudo de
// novo, e o banco ainda tem os checks da 0022 (título 1–80, nota ≤ 120, dias 0–6, até 20 ativos).
// Marcar um lembrete NÃO conta na sequência (Q10, 0037): nada aqui fala de sequência.

/** Linha de routine_items como a página lê. */
export type ReminderRow = {
  id: string;
  title: string;
  note: string | null;
  /** "HH:MM" ou "HH:MM:SS" (coluna time do Postgres); null = sem horário. */
  time_of_day: string | null;
  /** 0 = domingo … 6 = sábado; null = todos os dias. */
  weekdays: number[] | null;
  active: boolean;
  sort_order: number;
};

export type ReminderInput = {
  title: string;
  note?: string | null;
  /** "HH:MM"; vazio/null = sem horário. */
  timeOfDay?: string | null;
  /** 0 = domingo … 6 = sábado; vazio/null = todos os dias. */
  weekdays?: number[] | null;
};

/** Códigos que a interface traduz (me.reminders.errors.*); qualquer outro vira "failed". */
export const REMINDER_ERRORS = ["routine_limit", "routine_item_not_found", "invalid_timezone", "unauthenticated", "invalid", "failed"] as const;
export type ReminderError = (typeof REMINDER_ERRORS)[number];

export const REMINDER_TITLE_MAX = 80;
export const REMINDER_NOTE_MAX = 120;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const reminderIdSchema = z.uuid();
export const reminderTimezoneSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/).refine(isValidTimeZone, "invalid_timezone");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdaysSchema = z.array(z.number().int().min(0).max(6)).min(1).max(7);

export const reminderSchema = z.object({
  title: z.string().trim().min(1).max(REMINDER_TITLE_MAX),
  note: z.string().trim().max(REMINDER_NOTE_MAX).nullish(),
  timeOfDay: z.union([timeSchema, z.literal(""), z.null()]).optional(),
  weekdays: weekdaysSchema.nullish(),
});

export const reminderToggleSchema = z.object({ itemId: reminderIdSchema, done: z.boolean(), timezone: reminderTimezoneSchema });

// Normaliza a entrada validada para as colunas (sem user_id: entra só da sessão).
export function toReminderRow(data: z.infer<typeof reminderSchema>) {
  const days = data.weekdays ? Array.from(new Set(data.weekdays)).sort((a, b) => a - b) : null;
  return {
    title: data.title,
    note: data.note ? data.note : null,
    time_of_day: data.timeOfDay ? `${data.timeOfDay}:00` : null,
    // Sete dias marcados = todos os dias: guarda null (mesma semântica da 0022).
    weekdays: days && days.length === 7 ? null : days,
  };
}

// Mensagem do banco/PostgREST → código conhecido ("routine_limit", …) ou "failed".
export function reminderErrorCode(message: string | null | undefined): ReminderError {
  const code = (message ?? "").split(":")[0].trim();
  return (REMINDER_ERRORS as readonly string[]).includes(code) ? (code as ReminderError) : "failed";
}

// Resposta de routine_check: só done e data local (a 0037 tirou a sequência; antes dela o campo é ignorado).
export function parseReminderCheck(value: unknown): { done: boolean; localDate: string } {
  const raw = (value && typeof value === "object" ? value : {}) as { done?: unknown; local_date?: unknown };
  return { done: raw.done === true, localDate: typeof raw.local_date === "string" ? raw.local_date : "" };
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

// Dia da semana (0 = domingo) de uma data YYYY-MM-DD, sem depender do fuso do servidor.
export function weekdayOf(localDate: string): number {
  const m = YMD.exec(localDate);
  if (!m) throw new Error(`data inválida: ${localDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

// O lembrete vale na data? weekdays null = todos os dias; inativo nunca.
export function appliesOn(item: Pick<ReminderRow, "weekdays" | "active">, localDate: string): boolean {
  return item.active && (item.weekdays === null || item.weekdays.includes(weekdayOf(localDate)));
}

// "HH:MM[:SS]" → minutos desde a meia-noite; null quando não há horário válido.
export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// "HH:MM:SS" do banco → "HH:MM" para exibir e para o <input type="time">.
export function shortTime(time: string | null): string | null {
  const minutes = timeToMinutes(time);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Com horário primeiro (crescente); depois sem horário, por sort_order e título. Não altera a lista.
export function sortReminders<T extends Pick<ReminderRow, "time_of_day" | "sort_order" | "title">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = timeToMinutes(a.time_of_day);
    const tb = timeToMinutes(b.time_of_day);
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
    if (ta !== null && tb === null) return -1;
    if (ta === null && tb !== null) return 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title);
  });
}

// Separa os lembretes ativos em "hoje" e "outros dias", já ordenados.
export function splitReminders<T extends ReminderRow>(items: T[], localDate: string): { today: T[]; other: T[] } {
  const active = sortReminders(items.filter((i) => i.active));
  return { today: active.filter((i) => appliesOn(i, localDate)), other: active.filter((i) => !appliesOn(i, localDate)) };
}

// Rótulo curto dos dias ("Seg, Qua, Sex") no idioma, começando na segunda; null quando é todo dia.
export function weekdaysLabel(weekdays: number[] | null, locale: string): string | null {
  if (!weekdays || new Set(weekdays).size >= 7) return null;
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 18/10/2026 é domingo: 18 + d dá o dia d da semana.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order
    .filter((d) => weekdays.includes(d))
    .map((d) => {
      const label = fmt.format(new Date(Date.UTC(2026, 9, 18 + d))).replace(/\.$/, "");
      return label.charAt(0).toUpperCase() + label.slice(1);
    })
    .join(", ");
}
