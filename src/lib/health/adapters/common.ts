// Ajudantes puros dos adaptadores: lista permitida (RN-02b), datas no fuso da amostra (RN-05),
// esporte canônico e números seguros. Nenhum campo fora da lista permitida chega ao normalizador.

/**
 * Copia SÓ os caminhos permitidos ("a", "a.b.c"); o resto do payload é descartado antes de
 * qualquer leitura. Arrays e objetos aninhados só passam se o caminho inteiro estiver listado.
 */
export function pickAllowed(source: unknown, paths: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return out;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = source;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || Array.isArray(cur)) {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
    if (cur === undefined) continue;
    let target = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = target[parts[i]];
      target = (next && typeof next === "object" ? next : (target[parts[i]] = {})) as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = cur;
  }
  return out;
}

export function get(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Número finito ou undefined (nada de zero fabricado, RN-04). */
export function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function str(value: unknown, max = 200): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

export const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function mean(values: readonly number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

export function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Data local (YYYY-MM-DD) de um instante com deslocamento conhecido (em minutos). */
export function localDateAt(epochMs: number, offsetMin: number): string {
  return new Date(epochMs + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Data local num fuso IANA (reserva quando a amostra não traz deslocamento). */
export function localDateInZone(epochMs: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

/** "-03:00" / "+0530" / "Z" → minutos; null se ilegível. */
export function parseOffset(value: unknown): number | null {
  if (value === "Z") return 0;
  if (typeof value !== "string") return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

/** Deslocamento embutido num ISO ("2026-10-20T23:39:07.000+03:00") em minutos. */
export function isoOffset(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /([+-]\d{2}:?\d{2}|Z)$/.exec(value);
  return m ? parseOffset(m[1]) : null;
}

export function isoAt(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/** Duração ISO 8601 ("PT1H2M3.5S") em segundos. */
export function isoDurationSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return Number.isFinite(total) && total > 0 ? Math.round(total) : undefined;
}

/** Esportes com nome na interface; o resto vira "other" (todos os tipos entram, sem rota GPS). */
export const CANONICAL_SPORTS = ["run", "trail_run", "walk", "cycle", "strength", "swim", "hike", "yoga", "row", "other"] as const;
export type CanonicalSport = (typeof CANONICAL_SPORTS)[number];

const SPORT_PATTERNS: [RegExp, CanonicalSport][] = [
  [/trail/, "trail_run"],
  // "track" sozinho não: TRACK_CYCLING é ciclismo (TRACK_RUNNING já casa com "run")
  [/run|jog|treadmill/, "run"],
  [/walk/, "walk"],
  [/hik/, "hike"],
  [/cycl|bik|spin|ride/, "cycle"],
  [/swim|pool|open_water/, "swim"],
  [/row/, "row"],
  [/yoga|pilates/, "yoga"],
  [/strength|weight|functional|crossfit|hiit|lift/, "strength"],
];

export function canonicalSport(raw: unknown): CanonicalSport {
  if (typeof raw !== "string") return "other";
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  for (const [re, sport] of SPORT_PATTERNS) if (re.test(s)) return sport;
  return "other";
}
