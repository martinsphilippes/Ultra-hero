// Favoritos: conteúdo, produto ou programa (migração 0041), no mesmo desenho dos itens de lista (0040).
// Lógica pura, usada pelas ações, pelas páginas e pelos testes; nada aqui fala com o banco.
import { CONTENT_CARD_SELECT, PRODUCT_CARD_SELECT, PROGRAM_CARD_SELECT } from "@/lib/catalog/queries";
import { isMissingMixedListsError, toListEntries, type ListEntry, type ListItemRow, type ListTarget, type ListTargetColumn, targetColumn } from "./list-items";

/**
 * O banco ainda não tem a 0041? Os sinais do PostgREST são os mesmos das listas: 42703 (coluna
 * inexistente), PGRST204 (coluna fora do cache ao gravar) ou PGRST200 (relação inexistente no embed).
 */
export const isMissingMixedFavoritesError = isMissingMixedListsError;

/** Linha de favorites só com a coluna do alvo (o banco antigo aceita a de conteúdo). */
export function favoriteRow(userId: string, target: ListTarget): { user_id: string } & Partial<Record<ListTargetColumn, string>> {
  return { user_id: userId, [targetColumn(target.kind)]: target.id };
}

/** Props dos eventos favorite.*: content_id mantém a série antiga do painel; item_type/item_id cobrem os tipos novos. */
export function favoriteEventProps(target: ListTarget, source?: string): Record<string, string> {
  return { ...(target.kind === "content" ? { content_id: target.id } : {}), item_type: target.kind, item_id: target.id, ...(source ? { source } : {}) };
}

// ---------------------------------------------------------------- leitura (Explorar › Listas e Perfil › Favoritos)
/** Com a 0041: os três alvos embutidos, cada um com o select do seu card. */
export const FAVORITE_SELECT =
  `id, item_type, created_at, content:content(${CONTENT_CARD_SELECT}), ` +
  `product:products(${PRODUCT_CARD_SELECT}), program:programs(${PROGRAM_CARD_SELECT})`;
/** Sem a 0041 (banco antigo): só conteúdos. */
export const FAVORITE_SELECT_LEGACY = `created_at, content:content(${CONTENT_CARD_SELECT})`;

export type FavoriteRow = Omit<ListItemRow, "added_at" | "position"> & { created_at: string };

/**
 * Linhas do banco → favoritos na tela, do mais recente ao mais antigo. Favorito cujo alvo a RLS
 * escondeu (despublicado, suspenso) some, como já acontecia com conteúdo.
 */
export function toFavoriteEntries(rows: readonly FavoriteRow[]): ListEntry[] {
  // reaproveita a montagem dos itens de lista: sem posição, a ordem é só pela data
  return toListEntries(rows.map(({ created_at, ...rest }) => ({ ...rest, added_at: created_at, position: 0 })));
}
