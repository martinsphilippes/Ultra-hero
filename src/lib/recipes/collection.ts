// Minha coleção de receitas (/profile/receitas): abas e filtro por categoria vindos da URL (GET), com
// valores desconhecidos caindo no padrão em vez de erro. Puro (servidor e testes).
import { z } from "zod";

export const COLLECTION_TABS = ["salvas", "listas", "vistas"] as const;
export type CollectionTab = (typeof COLLECTION_TABS)[number];

const schema = z.object({
  aba: z.enum(COLLECTION_TABS).catch("salvas"),
  cat: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(40)
    .nullable()
    .catch(null),
});

export type CollectionParams = { tab: CollectionTab; category: string | null };

export function parseCollectionParams(raw: Record<string, string | string[] | undefined>): CollectionParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const parsed = schema.parse({ aba: first(raw.aba) ?? undefined, cat: first(raw.cat) });
  // a categoria só filtra as salvas
  return { tab: parsed.aba, category: parsed.aba === "salvas" ? parsed.cat : null };
}

export function collectionHref(tab: CollectionTab, category: string | null = null): string {
  const params = new URLSearchParams();
  if (tab !== "salvas") params.set("aba", tab);
  if (tab === "salvas" && category) params.set("cat", category);
  const qs = params.toString();
  return qs ? `/profile/receitas?${qs}` : "/profile/receitas";
}

/** Categorias presentes nas receitas salvas, com a contagem, na ordem do catálogo. */
export function categoryCounts(links: { content_id: string; category_code: string }[], savedIds: readonly string[], order: readonly string[]): { code: string; count: number }[] {
  const saved = new Set(savedIds);
  const counts = new Map<string, number>();
  for (const l of links) if (saved.has(l.content_id)) counts.set(l.category_code, (counts.get(l.category_code) ?? 0) + 1);
  const rank = new Map(order.map((code, i) => [code, i]));
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (rank.get(a.code) ?? 999) - (rank.get(b.code) ?? 999) || a.code.localeCompare(b.code));
}
