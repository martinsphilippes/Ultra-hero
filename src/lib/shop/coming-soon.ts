// Modo "Coming soon" da aba Comprar (Loja + Colecionáveis). Configuração num lugar só e lógica pura
// (testável sem Next). Até SHOP_OPENS_AT a loja aparece desfocada atrás de um aviso com contagem
// regressiva para todo mundo, menos o admin da plataforma (que prepara os produtos com a loja normal).
// O modo desliga sozinho na data: cada request compara "agora" com a abertura, sem deploy.
//
// Variáveis de ambiente (servidor):
//   SHOP_OPENS_AT=2027-01-01T03:00:00Z  → muda a data de abertura (ISO com fuso; inválida = padrão)
//   SHOP_COMING_SOON_DISABLED=1         → desliga o modo na hora (kill switch)

/** 01/01/2027 00:00 em America/Sao_Paulo (UTC−3, sem horário de verão desde 2019). */
export const SHOP_OPENS_AT = "2027-01-01T03:00:00Z";

/** Fuso em que a abertura é anunciada (data por extenso no texto para leitores de tela). */
export const SHOP_TIMEZONE = "America/Sao_Paulo";

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  return typeof process === "undefined" ? {} : process.env;
}

/** Data de abertura em ISO (a do ambiente quando válida e com fuso explícito; senão a padrão). */
export function resolveShopOpensAt(env: Env = defaultEnv()): string {
  const raw = env.SHOP_OPENS_AT?.trim();
  // exige fuso (Z ou ±hh:mm): "2027-01-01T00:00" sem fuso mudaria conforme o servidor
  if (raw && /(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date(Date.parse(SHOP_OPENS_AT)).toISOString();
}

export function isShopComingSoonDisabled(env: Env = defaultEnv()): boolean {
  const raw = env.SHOP_COMING_SOON_DISABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** O modo está ativo agora? (antes da abertura e sem kill switch). Não olha papel: veja shopLockedFor. */
export function isShopComingSoon(now: number | Date = Date.now(), env: Env = defaultEnv()): boolean {
  if (isShopComingSoonDisabled(env)) return false;
  const ms = typeof now === "number" ? now : now.getTime();
  return ms < Date.parse(resolveShopOpensAt(env));
}

/** Loja trancada para quem vê: modo ativo e a pessoa não é admin da plataforma. */
export function shopLockedFor(input: { comingSoon: boolean; isAdmin: boolean }): boolean {
  return input.comingSoon && !input.isAdmin;
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

/** Aba padrão de Comprar: Colecionáveis enquanto o modo vale para quem vê; depois, a Loja de sempre. */
export function shopHomeHref(locked: boolean): "/shop" | "/shop/colecionaveis" {
  return locked ? "/shop/colecionaveis" : "/shop";
}
