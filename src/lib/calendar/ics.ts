// Geração de iCalendar (RFC 5545) em módulo puro: feed por pessoa e download. Sem dependências.
// Datas sempre em UTC ("Z"); evento de dia inteiro vira VALUE=DATE (fim exclusivo). Linhas dobradas em 75 octetos.

export type IcsEvent = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  updatedAt?: string | null;
  url?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function icsDateTime(value: string | Date): string {
  const d = new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Data civil (sem hora) de um instante num fuso IANA, no formato YYYYMMDD. */
export function icsDate(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Escapa texto de propriedade (vírgula, ponto e vírgula, barra invertida, quebras de linha). */
export function icsEscape(text: string): string {
  // controles C0 (fora de \n) nunca entram no arquivo; \r sozinho vira quebra
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Dobra uma linha em pedaços de no máximo 75 octetos (UTF-8), continuação com espaço. */
export function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  if (current) out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

export type IcsOptions = { calendarName: string; timeZone: string; now?: Date; domain?: string };

export function buildIcs(events: readonly IcsEvent[], options: IcsOptions): string {
  const now = options.now ?? new Date();
  const domain = options.domain ?? "groscove-ultra";
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Groscove Ultra//Agenda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(options.calendarName)}`, `X-WR-TIMEZONE:${options.timeZone}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@${domain}`);
    lines.push(`DTSTAMP:${icsDateTime(now)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.startsAt, options.timeZone)}`);
      // fim exclusivo: o dia seguinte ao último dia
      const end = new Date(e.endsAt);
      const endDate = icsDate(end, options.timeZone);
      const startDate = icsDate(e.startsAt, options.timeZone);
      lines.push(`DTEND;VALUE=DATE:${endDate > startDate ? endDate : nextDay(startDate)}`);
    } else {
      lines.push(`DTSTART:${icsDateTime(e.startsAt)}`);
      lines.push(`DTEND:${icsDateTime(new Date(e.endsAt).getTime() > new Date(e.startsAt).getTime() ? e.endsAt : new Date(new Date(e.startsAt).getTime() + 30 * 60_000))}`);
    }
    const summary = e.subtitle ? `${e.title} · ${e.subtitle}` : e.title;
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.updatedAt) lines.push(`LAST-MODIFIED:${icsDateTime(e.updatedAt)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function nextDay(yyyymmdd: string): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

/** Mês "YYYY-MM" válido (para o parâmetro da agenda); padrão: mês atual no fuso. */
export function parseMonth(value: string | undefined, timeZone: string, now = new Date()): { year: number; month: number } {
  const m = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 2020 && Number(m[1]) <= 2100) return { year: Number(m[1]), month: Number(m[2]) };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
}

/** "YYYY-MM-DD" + n dias (aritmética em UTC, sem fuso). */
export function plusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}
