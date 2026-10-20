// Configuração de idiomas da interface. Conteúdo do banco pode ficar no idioma original.
export const locales = ["pt-BR", "en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "pt-BR";

// Cookie lido pelo next-intl (sem prefixo de idioma na URL).
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const defaultTimeZone = "America/Sao_Paulo";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// Formatos nomeados usados por useFormatter()/getFormatter().
export const formats = {
  dateTime: {
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
    medium: { day: "numeric", month: "short", year: "numeric" },
    long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    time: { hour: "2-digit", minute: "2-digit" },
  },
  number: {
    currency: { style: "currency", currency: "BRL" },
    percent: { style: "percent", maximumFractionDigits: 0 },
    compact: { notation: "compact", maximumFractionDigits: 1 },
  },
} as const;
