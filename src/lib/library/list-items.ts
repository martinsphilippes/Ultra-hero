// Itens das listas pessoais: conteúdo, produto ou programa (migração 0040). Lógica pura, usada
// pelas ações, pelas páginas e pelos testes; nada aqui fala com o banco.
import { z } from "zod";
import type { ContentCardData, ProductCardData, ProgramCardData } from "@/lib/catalog/queries";
import { CONTENT_CARD_SELECT, PRODUCT_CARD_SELECT, PROGRAM_CARD_SELECT } from "@/lib/catalog/queries";

export const LIST_ITEM_KINDS = ["content", "product", "program"] as const;
export type ListItemKind = (typeof LIST_ITEM_KINDS)[number];

/** Alvo de um item: o tipo e o id do conteúdo, produto ou programa. */
export const listTargetSchema = z.object({ kind: z.enum(LIST_ITEM_KINDS), id: z.uuid() });
export type ListTarget = z.infer<typeof listTargetSchema>;

const TARGET_COLUMN = { content: "content_id", product: "product_id", program: "program_id" } as const;
export type ListTargetColumn = (typeof TARGET_COLUMN)[ListItemKind];

/** Coluna de list_items que guarda o alvo deste tipo. */
export function targetColumn(kind: ListItemKind): ListTargetColumn {
  return TARGET_COLUMN[kind];
}

/**
 * O banco ainda não tem a 0040? O PostgREST responde 42703 (coluna inexistente), PGRST204 (coluna fora
 * do cache ao gravar) ou PGRST200 (relação inexistente no embed). Nesses casos o app volta ao modo
 * "só conteúdos" em vez de mostrar erro.
 */
export function isMissingMixedListsError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST200") return true;
  return /(item_type|product_id|program_id).*does not exist/i.test(error.message ?? "");
}

// ---------------------------------------------------------------- leitura da página da lista
/** Select da página da lista com a 0040: os três alvos embutidos, cada um com o select do seu card. */
export const LIST_ITEM_SELECT =
  `id, item_type, position, added_at, content:content(${CONTENT_CARD_SELECT}), ` +
  `product:products(${PRODUCT_CARD_SELECT}), program:programs(${PROGRAM_CARD_SELECT})`;
/** Sem a 0040 (banco antigo): só conteúdos. */
export const LIST_ITEM_SELECT_LEGACY = `position, added_at, content:content(${CONTENT_CARD_SELECT})`;

export type ListItemRow = {
  id?: string | null;
  item_type?: string | null;
  position?: number | null;
  added_at: string;
  content?: ContentCardData | ContentCardData[] | null;
  product?: ProductCardData | ProductCardData[] | null;
  program?: ProgramCardData | ProgramCardData[] | null;
};

export type ListEntry =
  | { key: string; kind: "content"; id: string; title: string; content: ContentCardData }
  | { key: string; kind: "product"; id: string; title: string; product: ProductCardData }
  | { key: string; kind: "program"; id: string; title: string; program: ProgramCardData };

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Linhas do banco → itens da página, na ordem da lista: position crescente e, empatado, o mais
 * recente primeiro. Item cujo alvo a RLS escondeu (despublicado, suspenso) some, como antes.
 */
export function toListEntries(rows: readonly ListItemRow[]): ListEntry[] {
  const sorted = [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || Date.parse(b.added_at) - Date.parse(a.added_at));
  const out: ListEntry[] = [];
  for (const row of sorted) {
    const content = one(row.content);
    const product = one(row.product);
    const program = one(row.program);
    const kind = row.item_type ?? (content ? "content" : product ? "product" : program ? "program" : null);
    if (kind === "content" && content) out.push({ key: row.id ?? `content:${content.id}`, kind, id: content.id, title: content.title, content });
    else if (kind === "product" && product) out.push({ key: row.id ?? `product:${product.id}`, kind, id: product.id, title: product.title, product });
    else if (kind === "program" && program)
      out.push({ key: row.id ?? `program:${program.id}`, kind, id: program.id, title: program.version?.title ?? program.slug, program });
  }
  return out;
}

// ---------------------------------------------------------------- contagem (aba Listas e painel)
/** Com a 0040: os alvos embutidos só com id, para contar o que a pessoa de fato vê na lista. */
export const LIST_COUNT_ITEMS = "items:list_items(content:content(id), product:products(id), program:programs(id))";
export const LIST_COUNT_ITEMS_LEGACY = "items:list_items(content:content(id))";

type CountRow = { content?: unknown; product?: unknown; program?: unknown };

/** Itens visíveis (alvo que a RLS deixa ver), a mesma conta que a página da lista mostra. */
export function visibleItemCount(items: readonly CountRow[] | null | undefined): number {
  return (items ?? []).filter((i) => Boolean(one(i.content as object | null) ?? one(i.product as object | null) ?? one(i.program as object | null))).length;
}

/** Linhas cruas de list_items com os ids dos alvos (painel "Salvar em lista"). */
export type ListTargetIds = { content_id?: string | null; product_id?: string | null; program_id?: string | null };

/** A lista já contém este alvo? */
export function listContains(items: readonly ListTargetIds[] | null | undefined, target: ListTarget): boolean {
  const column = targetColumn(target.kind);
  return (items ?? []).some((i) => i[column] === target.id);
}
