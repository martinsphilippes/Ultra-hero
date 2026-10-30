// Filtros da aba Comprar (0047): regras puras, sem servidor nem banco, testadas em unidade.
// Um produto entra num filtro se a categoria dele está entre as do filtro OU se foi escolhido à mão.

/** Parâmetro da URL com o filtro escolhido (/shop?filtro=suplementos). Sem ele: "Tudo". */
export const SHOP_FILTER_PARAM = "filtro";

/** Produtos por carga: 15 = 5 linhas de 3, como a grade do Explorar. */
export const SHOP_PAGE_SIZE = 15;

/** Maior offset aceito pela ação "carregar mais". */
export const SHOP_MAX_OFFSET = 5000;

/** Slug reservado para o chip fixo "Tudo" (nunca é gravado no banco). */
export const SHOP_ALL_SLUG = "tudo";

export const SHOP_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ShopFilterRule = {
  id: string;
  slug: string;
  /** Rótulo por idioma: {"pt-BR","en","es"}. */
  name: unknown;
  sortOrder: number;
  categoryCodes: readonly string[];
  productIds: readonly string[];
};

/** Produto visível na loja, só com o que a regra do filtro precisa (na ordem de exibição). */
export type ShopIndexItem = { id: string; categoryCode: string | null };

/** Lê ?filtro= da URL: slug válido em minúsculas ou null ("Tudo"). Lixo e "tudo" viram null. */
export function parseFilterParam(raw: string | string[] | null | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const slug = value.trim().toLowerCase().slice(0, 40);
  if (!slug || slug === SHOP_ALL_SLUG || !SHOP_SLUG_RE.test(slug)) return null;
  return slug;
}

/** Categoria do produto entre as do filtro OU produto escolhido à mão. */
export function matchesFilter(item: ShopIndexItem, rule: Pick<ShopFilterRule, "categoryCodes" | "productIds">): boolean {
  return (item.categoryCode !== null && rule.categoryCodes.includes(item.categoryCode)) || rule.productIds.includes(item.id);
}

/** Produtos do filtro, na ordem recebida; sem filtro ("Tudo"), todos. */
export function productsForFilter<T extends ShopIndexItem>(items: readonly T[], rule: Pick<ShopFilterRule, "categoryCodes" | "productIds"> | null): T[] {
  if (!rule) return [...items];
  const categories = new Set(rule.categoryCodes);
  const products = new Set(rule.productIds);
  return items.filter((item) => (item.categoryCode !== null && categories.has(item.categoryCode)) || products.has(item.id));
}

/** Filtros na ordem do admin (desempate pelo slug), só os que têm ao menos um produto visível. */
export function visibleFilters<R extends ShopFilterRule>(rules: readonly R[], items: readonly ShopIndexItem[]): (R & { count: number })[] {
  return [...rules]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((rule) => ({ ...rule, count: productsForFilter(items, rule).length }))
    .filter((rule) => rule.count > 0);
}

/** Filtro escolhido entre os visíveis; slug desconhecido ou sem produto cai em "Tudo" (null). */
export function resolveFilter<R extends { slug: string }>(slug: string | null, visible: readonly R[]): R | null {
  if (!slug) return null;
  return visible.find((rule) => rule.slug === slug) ?? null;
}

/** Link do chip: "Tudo" é a loja sem parâmetro. */
export function shopHref(slug: string | null): string {
  return slug ? `/shop?${SHOP_FILTER_PARAM}=${encodeURIComponent(slug)}` : "/shop";
}

/** Fatia de uma página e o cursor da próxima. */
export function pageSlice<T>(items: readonly T[], offset: number, size: number = SHOP_PAGE_SIZE): { page: T[]; hasMore: boolean; nextOffset: number } {
  const start = Math.max(0, Math.floor(offset));
  const nextOffset = start + size;
  return { page: items.slice(start, nextOffset), hasMore: items.length > nextOffset && nextOffset <= SHOP_MAX_OFFSET, nextOffset };
}

/** Sugestão de slug a partir do rótulo (sem acento, minúsculas, hífens). */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
