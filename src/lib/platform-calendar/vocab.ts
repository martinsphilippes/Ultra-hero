// Calendário Groscove (0098): vocabulário e regras puras (sem servidor), testadas em tests/unit/platform-calendar.test.ts.
// Um evento da plataforma é uma linha de calendar_events com scope='platform' e kind='institutional'.

export const TERRITORIES = ["futebol", "esporte", "entretenimento", "musica", "geek_tech", "social", "saude", "varejo", "feriados", "moda", "sustentabilidade"] as const;
export type Territory = (typeof TERRITORIES)[number];

export const PLATFORM_STATUSES = ["draft", "scheduled", "published", "cancelled"] as const;
export type PlatformStatus = (typeof PLATFORM_STATUSES)[number];

export const INTEREST_STATES = ["interested", "withdrawn"] as const;
export type InterestState = (typeof INTEREST_STATES)[number];

/** Fuso padrão de um evento da plataforma (o banco usa o mesmo). */
export const PLATFORM_DEFAULT_TZ = "America/Sao_Paulo";

/** Fusos oferecidos no formulário do admin (o banco aceita qualquer nome IANA válido). */
export const PLATFORM_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
] as const;

/** Evento com mais dias que isso aparece na grade só no início e no fim (temporadas, como o [Início]/[Final] do PDF). */
export const LONG_EVENT_DAYS = 31;

export function isTerritory(value: unknown): value is Territory {
  return typeof value === "string" && (TERRITORIES as readonly string[]).includes(value);
}

export function isPlatformStatus(value: unknown): value is PlatformStatus {
  return typeof value === "string" && (PLATFORM_STATUSES as readonly string[]).includes(value);
}

/** Texto sem acento, minúsculo, só letras/números separados por um espaço. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slug ASCII (a-z, 0-9, hífen). */
export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

// palavras que identificam cada território (rótulos do PDF: "Geek & Tech", "Varejo & Comemorativas", "Feriados Nacionais"…)
const TERRITORY_RULES: readonly [Territory, RegExp][] = [
  ["futebol", /\bfutebol\b/],
  ["sustentabilidade", /\bsustent|\bmeio ambiente\b/],
  ["feriados", /\bferiado/],
  ["varejo", /\bvarejo\b|\bcomemorativ/],
  ["geek_tech", /\bgeek\b|\btech\b|\btecnologia\b|\bgames?\b/],
  ["musica", /\bmusica/],
  ["saude", /\bsaude\b|\bbem estar\b/],
  ["moda", /\bmoda\b/],
  ["entretenimento", /\bentreten/],
  ["social", /\bsocial\b|\bcausas?\b/],
  ["esporte", /\besporte/],
];

/** Rótulo de território (como vem do PDF/planilha ou já a chave) → chave; desconhecido → null. */
export function territoryFromLabel(value: unknown): Territory | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (isTerritory(value.trim())) return value.trim() as Territory;
  const norm = normalizeText(value);
  if (!norm) return null;
  for (const [key, re] of TERRITORY_RULES) if (re.test(norm)) return key;
  return null;
}

/**
 * Coleção (linha do calendário) a partir do nome da fonte: o trecho depois do último travessão.
 * "Calendário Groscove 2026 — Sustentabilidade em Campo" → "sustentabilidade-em-campo"; "… — Geral" → "geral".
 */
export function collectionFromSource(source: string): string | null {
  const parts = source.split(/\s[—–-]\s/);
  const tail = parts.length > 1 ? parts[parts.length - 1] : source;
  const slug = slugify(tail.replace(/\b(19|20)\d{2}\b/g, "")).slice(0, 60).replace(/-+$/g, "");
  return slug || null;
}

/** Estado que quem lê enxerga agora: "programado" com a data já passada é publicado (sem cron, como no banco). */
export function effectiveStatus(status: PlatformStatus, publishedAt: string | null, now: Date = new Date()): PlatformStatus {
  if (status === "scheduled" && publishedAt && new Date(publishedAt).getTime() <= now.getTime()) return "published";
  return status;
}

/** Hashtags: sem '#', sem espaços, sem repetição (ignora maiúsculas), até 30, cada uma até 60. */
export function normalizeHashtags(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : typeof value === "string"
      ? value.split(/[\s,;|]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (!tag || tag.length > 60) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 30) break;
  }
  return out;
}

/** Agenda: "tudo", só o Calendário Groscove ou só os meus (da agência/marca/herói). */
export type AgendaMode = "all" | "groscove" | "mine";

export function parseAgendaMode(value: unknown): AgendaMode {
  return value === "groscove" || value === "mine" ? value : "all";
}

export type AgendaFilters = { mode: AgendaMode; territory: Territory | null; collection: string | null };

export function parseAgendaFilters(sp: { cal?: string; territorio?: string; colecao?: string }): AgendaFilters {
  const collection = typeof sp.colecao === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(sp.colecao) && sp.colecao.length <= 60 ? sp.colecao : null;
  return { mode: parseAgendaMode(sp.cal), territory: isTerritory(sp.territorio) ? sp.territorio : null, collection };
}

/** Dados da plataforma presos a um item da agenda (o que não é da plataforma não tem). */
export type PlatformInfo = {
  territory: Territory | null;
  status: PlatformStatus;
  hashtags: string[];
  highlight: boolean;
  tentative: boolean;
  category: string | null;
  collection: string | null;
  timezone: string;
};

/**
 * Filtros da agenda sobre a lista já carregada: modo (tudo / só Groscove / só meus), território e coleção (estes dois
 * só valem para o Calendário Groscove; os compromissos próprios seguem o modo).
 */
export function filterAgenda<E extends { platform?: PlatformInfo | null }>(events: readonly E[], filters: AgendaFilters): E[] {
  return events.filter((e) => {
    const p = e.platform ?? null;
    if (!p) return filters.mode !== "groscove";
    if (filters.mode === "mine") return false;
    if (filters.territory && p.territory !== filters.territory) return false;
    if (filters.collection && p.collection !== filters.collection) return false;
    return true;
  });
}

/** Parâmetros da URL que acompanham a troca de mês (sem os vazios). */
export function agendaFilterParams(filters: AgendaFilters): Record<string, string | undefined> {
  return {
    cal: filters.mode === "all" ? undefined : filters.mode,
    territorio: filters.territory ?? undefined,
    colecao: filters.collection ?? undefined,
  };
}

