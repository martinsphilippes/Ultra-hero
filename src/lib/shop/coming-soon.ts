// Modo "Coming soon" da aba Comprar (Loja + Colecionáveis). Configuração num lugar só e lógica pura
// (testável sem Next). Até SHOP_OPENS_AT a loja aparece desfocada atrás de um aviso com contagem
// regressiva para todo mundo, menos o admin da plataforma (que prepara os produtos com a loja normal).
// O modo desliga sozinho na data: cada request compara "agora" com a abertura, sem deploy.
//
// Variáveis de ambiente (servidor):
//   SHOP_OPENS_AT=2027-01-01T03:00:00Z  → muda a data de abertura (ISO com fuso; inválida = padrão)
//   SHOP_COMING_SOON_DISABLED=1         → desliga o modo na hora (kill switch)

// A data e a contagem são as do lançamento (src/lib/launch.ts): a loja e o teaser da /conheca contam a mesma data.
import { LAUNCH_AT, LAUNCH_TIMEZONE, resolveLaunchAt } from "@/lib/launch";

export { countdownParts, pad2, type CountdownParts } from "@/lib/launch";

/** 01/01/2027 00:00 em America/Sao_Paulo (UTC−3, sem horário de verão desde 2019). */
export const SHOP_OPENS_AT = LAUNCH_AT;

/** Fuso em que a abertura é anunciada (data por extenso no texto para leitores de tela). */
export const SHOP_TIMEZONE = LAUNCH_TIMEZONE;

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  return typeof process === "undefined" ? {} : process.env;
}

/** Data de abertura em ISO (a do ambiente quando válida e com fuso explícito; senão a padrão). */
export function resolveShopOpensAt(env: Env = defaultEnv()): string {
  return resolveLaunchAt(env);
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

/** Aba padrão de Comprar: Colecionáveis enquanto o modo vale para quem vê; depois, a Loja de sempre. */
export function shopHomeHref(locked: boolean): "/shop" | "/shop/colecionaveis" {
  return locked ? "/shop/colecionaveis" : "/shop";
}
