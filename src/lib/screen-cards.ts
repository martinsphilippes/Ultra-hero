// Cards que abrem telas em sequência (página do programa, Hoje). Regras puras do estado na URL:
// ?secao=<card>&tela=N (N começa em 1). Sem Supabase nem React: testável em node.

export const CARD_PARAM = "secao";
export const SCREEN_PARAM = "tela";

export type ScreenState<K extends string = string> = { card: K; /** índice 0-based */ screen: number };
export type ParamsLike = { get(name: string): string | null };

/**
 * Lê ?secao=…&tela=N. Card fora de `counts` ou sem telas = fechado (null); tela fora do intervalo ou
 * inválida vai para a mais próxima (sem tela = a primeira).
 */
export function parseScreenState<K extends string>(params: ParamsLike, counts: Partial<Record<K, number>>): ScreenState<K> | null {
  const card = params.get(CARD_PARAM);
  if (!card || !Object.prototype.hasOwnProperty.call(counts, card)) return null;
  const total = counts[card as K] ?? 0;
  if (total <= 0) return null;
  const raw = Number.parseInt(params.get(SCREEN_PARAM) ?? "", 10);
  const n = Number.isFinite(raw) ? raw : 1;
  return { card: card as K, screen: Math.min(Math.max(n, 1), total) - 1 };
}

/** Query string com o estado (ou sem ele, para fechar), preservando os outros parâmetros. */
export function screenSearch(current: string | URLSearchParams, state: ScreenState | null): string {
  const params = new URLSearchParams(current);
  params.delete(CARD_PARAM);
  params.delete(SCREEN_PARAM);
  if (state) {
    params.set(CARD_PARAM, state.card);
    params.set(SCREEN_PARAM, String(state.screen + 1));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
