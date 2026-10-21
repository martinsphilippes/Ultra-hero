// Lógica pura do "Hoje" (Perfil): quais itens de rotina valem na data local, a ordem da lista,
// as sugestões vindas dos programas e o contador do ritmo. Sem dependências de React ou banco.

export type RoutineItemLike = {
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

export type ProgramItemLike = {
  position: number;
  is_required: boolean;
  content: { id: string; slug: string; title: string; cover_url: string | null; creatorName: string | null } | null;
};

export type EnrollmentLike = {
  id: string;
  status: "active" | "completed" | "abandoned";
  programName: string;
  programSlug: string;
  items: ProgramItemLike[];
};

export type ProgramSuggestion = {
  enrollmentId: string;
  programName: string;
  programSlug: string;
  contentId: string;
  contentSlug: string;
  title: string;
  coverUrl: string | null;
  creatorName: string | null;
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

// Dia da semana (0 = domingo) de uma data YYYY-MM-DD, sem depender do fuso do servidor.
export function weekdayOf(localDate: string): number {
  const m = YMD.exec(localDate);
  if (!m) throw new Error(`data inválida: ${localDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

// Itens ativos que valem na data: weekdays null = todos os dias.
export function itemsForDate<T extends Pick<RoutineItemLike, "weekdays" | "active">>(items: T[], localDate: string): T[] {
  const weekday = weekdayOf(localDate);
  return items.filter((item) => item.active && (item.weekdays === null || item.weekdays.includes(weekday)));
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

// Com horário primeiro (crescente); depois sem horário, por sort_order e título.
export function sortRoutine<T extends Pick<RoutineItemLike, "time_of_day" | "sort_order" | "title">>(items: T[]): T[] {
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

// Próximos itens obrigatórios não concluídos dos programas ativos: no máximo `perProgram` por
// programa e `max` no total, na ordem de posição. Itens sem conteúdo (apagado) são ignorados.
export function pickProgramSuggestions(enrollments: EnrollmentLike[], completedContentIds: Iterable<string>, max = 3, perProgram = 2): ProgramSuggestion[] {
  const completed = new Set(completedContentIds);
  const out: ProgramSuggestion[] = [];
  const seen = new Set<string>();
  for (const enrollment of enrollments) {
    if (enrollment.status !== "active") continue;
    let taken = 0;
    const items = [...enrollment.items].sort((a, b) => a.position - b.position);
    for (const item of items) {
      if (out.length >= max || taken >= perProgram) break;
      if (!item.is_required || !item.content) continue;
      if (completed.has(item.content.id) || seen.has(item.content.id)) continue;
      seen.add(item.content.id);
      taken++;
      out.push({
        enrollmentId: enrollment.id,
        programName: enrollment.programName,
        programSlug: enrollment.programSlug,
        contentId: item.content.id,
        contentSlug: item.content.slug,
        title: item.content.title,
        coverUrl: item.content.cover_url,
        creatorName: item.content.creatorName,
      });
    }
    if (out.length >= max) break;
  }
  return out;
}

// Contador "feito/total" do ritmo, sempre dentro de 0..total.
export function rhythmCounter(done: number, total: number): { done: number; total: number; label: string; complete: boolean } {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const safeDone = Math.min(safeTotal, Math.max(0, Math.floor(Number.isFinite(done) ? done : 0)));
  return { done: safeDone, total: safeTotal, label: `${safeDone}/${safeTotal}`, complete: safeTotal > 0 && safeDone === safeTotal };
}

// "HH:MM:SS" do banco → "HH:MM" para exibição e para o <input type="time">.
export function shortTime(time: string | null): string | null {
  const minutes = timeToMinutes(time);
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
