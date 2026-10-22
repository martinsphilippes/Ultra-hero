// Formatação dos valores do relógio nos 3 idiomas (RN-19: km, kcal e °C em todos; §6.6:
// "7 h 10 min" em pt, "7 h 10 m" em en/es). Sem dependências de React: testável em node.

import { metricDef, type MetricUnit } from "./catalog";

type Loc = "pt-BR" | "en" | "es";

function loc(locale: string): Loc {
  return locale === "en" || locale === "es" ? locale : "pt-BR";
}

function num(value: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(loc(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Minutos → "7 h 10 min" (pt) / "7 h 10 m" (en/es); menos de 1 h → "42 min". */
export function formatDuration(totalMin: number, locale: string): string {
  const safe = Math.max(0, Math.round(totalMin));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} min`;
  const minUnit = loc(locale) === "pt-BR" ? "min" : "m";
  return m === 0 ? `${h} h` : `${h} h ${m} ${minUnit}`;
}

/** Minutos desde a meia-noite → "07:42" (pt/es) ou "7:42 AM" (en), sem depender do fuso do servidor. */
export function formatClock(minutesFromMidnight: number, locale: string): string {
  const safe = ((Math.round(minutesFromMidnight) % 1440) + 1440) % 1440;
  const date = new Date(Date.UTC(2026, 0, 1, Math.floor(safe / 60), safe % 60));
  return new Intl.DateTimeFormat(loc(locale), { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
}

/** Minutos desde 12:00 (sleep_start_local/sleep_end_local) → horário do relógio. */
export function formatNoonClock(minutesFromNoon: number, locale: string): string {
  return formatClock(minutesFromNoon + 720, locale);
}

/** Ritmo em s/km → "5:23 /km". */
export function formatPace(secondsPerKm: number): string {
  const safe = Math.max(0, Math.round(secondsPerKm));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")} /km`;
}

export function formatDistance(meters: number, locale: string): string {
  if (meters < 1000) return `${num(Math.round(meters), locale)} m`;
  return `${num(meters / 1000, locale, meters < 10_000 ? 2 : 1)} km`;
}

/** Desvio de temperatura com sinal: "+0,1 °C" / "−0,3 °C". */
export function formatTempDelta(delta: number, locale: string): string {
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${num(Math.abs(rounded), locale, 1)} °C`;
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(loc(locale), { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
}

export function formatYears(value: number, locale: string): string {
  return new Intl.NumberFormat(loc(locale), { style: "unit", unit: "year", unitDisplay: "long", maximumFractionDigits: 0 }).format(value);
}

/** Valor de uma métrica do catálogo na unidade dela. */
export function formatValue(unit: MetricUnit, value: number, locale: string): string {
  switch (unit) {
    case "min":
      return formatDuration(value, locale);
    case "clock":
      return formatNoonClock(value, locale);
    case "h":
      return `${num(value, locale)} h`;
    case "bpm":
      return `${num(value, locale)} bpm`;
    case "ms":
      return `${num(value, locale)} ms`;
    case "pct":
      return formatPercent(value, locale);
    case "kcal":
      return `${num(value, locale)} kcal`;
    case "m":
      return formatDistance(value, locale);
    case "c":
      return `${num(value, locale, 1)} °C`;
    case "c_delta":
      return formatTempDelta(value, locale);
    case "db":
      return `${num(value, locale)} dB`;
    case "ml_kg_min":
      return `${num(value, locale, Number.isInteger(value) ? 0 : 1)} mL/kg·min`;
    case "s_per_km":
      return formatPace(value);
    case "rpm":
      return `${num(value, locale, 1)} rpm`;
    case "years":
      return formatYears(value, locale);
    case "ratio":
      return num(value, locale, 2);
    case "count":
    case "score":
    case "points":
      return num(value, locale);
  }
}

export function formatMetric(code: string, value: number, locale: string): string {
  const def = metricDef(code);
  return def ? formatValue(def.unit, value, locale) : num(value, locale);
}

/** Número inteiro com separador de milhar do idioma ("1.912" / "1,912"). */
export function formatInteger(value: number, locale: string): string {
  return num(Math.round(value), locale);
}

export function formatDecimal(value: number, locale: string, digits = 1): string {
  return num(value, locale, digits);
}
