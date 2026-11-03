// Aba aberta numa versão antiga do app depois de uma publicação nova (a Vercel no plano atual não tem
// "skew protection"): a server action roda na versão nova (o id da action é estável entre builds, então
// a gravação acontece), mas a resposta traz a árvore da versão nova e o navegador ainda roda o JavaScript
// antigo. Isso estoura no cliente (pedaço de JS que não existe mais, módulo do webpack ausente, resposta
// que o roteador não reconhece) sem nenhum erro no servidor, e o usuário caía em "Algo deu errado"
// mesmo com a ação gravada. Esses erros são reconhecidos aqui e a tela se recupera recarregando a página
// uma vez (com trava para não entrar em laço).

const STALE_PATTERNS: RegExp[] = [
  /loading (css )?chunk [\w/.-]+ failed/i,
  /chunkloaderror/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /server action ".*" was not found on the server/i,
  /failed to find server action/i,
  /an unexpected response was received from the server/i,
  // módulo do webpack ausente no runtime antigo: __webpack_require__ chama modules[id].call(...)
  /cannot read properties of undefined \(reading 'call'\)/i,
  /undefined is not an object \(evaluating '\w+\[\w+\]\.call'\)/i,
];

/** O erro tem cara de versão desatualizada do app (o JavaScript da aba é de uma publicação anterior)? */
export function isStaleBuildError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "ChunkLoadError" || e.name === "UnrecognizedActionError") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return message !== "" && STALE_PATTERNS.some((re) => re.test(message));
}

/** Intervalo mínimo entre duas recargas automáticas (evita laço se o erro persistir depois de recarregar). */
export const STALE_RELOAD_COOLDOWN_MS = 60_000;
export const STALE_RELOAD_KEY = "uh:stale-build-reload";

/** Recarrega agora? Só quando a última recarga automática (epoch ms gravado, ou nada) foi há mais de 1 min. */
export function shouldReloadForStaleBuild(lastReloadAt: string | null, now: number): boolean {
  const last = lastReloadAt === null ? NaN : Number(lastReloadAt);
  if (!Number.isFinite(last)) return true;
  return now - last > STALE_RELOAD_COOLDOWN_MS || now < last;
}

/**
 * No cliente: se o erro for de versão desatualizada e a trava permitir, recarrega a página e devolve true
 * (a tela de erro nem chega a aparecer de verdade). Armazenamento bloqueado: não recarrega (sem trava, laço).
 */
export function recoverFromStaleBuild(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleBuildError(error)) return false;
  try {
    const store = window.sessionStorage;
    const now = Date.now();
    if (!shouldReloadForStaleBuild(store.getItem(STALE_RELOAD_KEY), now)) return false;
    store.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
