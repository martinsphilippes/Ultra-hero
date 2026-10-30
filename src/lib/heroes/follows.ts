// Seguir heróis (0056): helpers puros (feed, botão e detecção do banco sem a migração).

/** Abas do feed do Início, guardadas na URL (?feed=seguindo|todos). */
export const FEED_TABS = ["seguindo", "todos"] as const;
export type FeedTab = (typeof FEED_TABS)[number];
export const FEED_PARAM = "feed";

export function parseFeedParam(value: string | string[] | undefined): FeedTab | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "seguindo" || v === "todos" ? v : null;
}

/**
 * Aba do feed: a da URL quando existe; senão "Seguindo" para quem segue ao menos um herói e "Todos"
 * para o resto. Sem a 0056 no banco (follows indisponível) é sempre "Todos".
 */
export function resolveFeedTab(input: { param: FeedTab | null; followCount: number; available: boolean; signedIn: boolean }): FeedTab {
  if (!input.available || !input.signedIn) return "todos";
  if (input.param) return input.param;
  return input.followCount > 0 ? "seguindo" : "todos";
}

export function feedHref(tab: FeedTab): string {
  return `/inicio?${FEED_PARAM}=${tab}`;
}

// ---------------------------------------------------------------- botão Seguir (estado otimista)
export type FollowState = { following: boolean; followers: number | null };
export type FollowAction = { type: "toggle" } | { type: "set"; following: boolean };

/** Alterna seguir e acompanha a contagem (quando ela aparece); nunca deixa a contagem negativa. */
export function followReducer(state: FollowState, action: FollowAction): FollowState {
  const following = action.type === "toggle" ? !state.following : action.following;
  if (following === state.following) return state;
  const followers = state.followers === null ? null : Math.max(0, state.followers + (following ? 1 : -1));
  return { following, followers };
}

// ---------------------------------------------------------------- banco sem a 0056
type DbError = { code?: string | null; message?: string | null } | null | undefined;

/** Tabela/coluna inexistente (42P01/42703) ou fora do cache da API (PGRST205/PGRST204/PGRST200). */
export function isMissingFollowSchema(error: DbError): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST205", "PGRST204", "PGRST200"].includes(error.code ?? "");
}
