// Lançamento do Groscove Ultra: a data única que a loja (Coming soon da aba Comprar) e o teaser público (/conheca)
// contam. Módulo puro (testável sem Next). A loja reexporta isto com os nomes antigos (src/lib/shop/coming-soon.ts).
//
// Variável de ambiente (servidor):
//   SHOP_OPENS_AT=2027-01-01T03:00:00Z  → muda a data do lançamento (ISO com fuso; inválida = padrão). O nome ficou o
//   da loja de propósito: é UMA data só, e quem já configurou na Vercel não precisa mudar nada.

/** 01/01/2027 00:00 em America/Sao_Paulo (UTC−3, sem horário de verão desde 2019). */
export const LAUNCH_AT = "2027-01-01T03:00:00Z";

/** Fuso em que o lançamento é anunciado (data por extenso no texto para leitores de tela). */
export const LAUNCH_TIMEZONE = "America/Sao_Paulo";

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  return typeof process === "undefined" ? {} : process.env;
}

/** Data do lançamento em ISO (a do ambiente quando válida e com fuso explícito; senão a padrão). */
export function resolveLaunchAt(env: Env = defaultEnv()): string {
  const raw = env.SHOP_OPENS_AT?.trim();
  // exige fuso (Z ou ±hh:mm): "2027-01-01T00:00" sem fuso mudaria conforme o servidor
  if (raw && /(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date(Date.parse(LAUNCH_AT)).toISOString();
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
};

/** Tempo que falta em DIAS · HORAS · MIN · SEG (nunca negativo). */
export function countdownParts(remainingMs: number): CountdownParts {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
    done: total === 0,
  };
}

/** Dois dígitos (dias podem ter três). */
export function pad2(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(2, "0");
}

/** Data do lançamento curta e igual em todos os idiomas (01.01.2027), no fuso do anúncio. */
export function launchDateLabel(iso: string = resolveLaunchAt()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: LAUNCH_TIMEZONE }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")}`;
}
