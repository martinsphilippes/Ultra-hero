import { defaultTimeZone, type Locale } from "./config";

// Helpers de formatação independentes de contexto (servem em server e client).
// Para formatos nomeados dentro de componentes prefira useFormatter()/getFormatter().

export function formatCurrency(value: number, locale: Locale, currency = "BRL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatPercent(value: number, locale: Locale, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits }).format(value);
}

export function formatDate(
  value: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
  timeZone = defaultTimeZone,
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(new Date(value));
}

export function formatDateTime(value: Date | string | number, locale: Locale, timeZone = defaultTimeZone): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

// "há 3 dias", "in 2 hours" etc.
export function formatRelativeTime(value: Date | string | number, locale: Locale, now = new Date()): string {
  const diff = new Date(value).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "minute");
}

// Duração em minutos -> "1h 30min" / "45min" (compacto, sem tradução necessária).
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}min`;
}
