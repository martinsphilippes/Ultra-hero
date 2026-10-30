// Categorias dos heróis (0049): regras puras, sem servidor nem banco, testadas em unidade.
// A aba Hero mostra "Todos" + as categorias ativas com ao menos um herói visível, na ordem do admin.

/** Parâmetro da URL com a categoria escolhida (/personalities?categoria=esporte). Sem ele: "Todos". */
export const HERO_CATEGORY_PARAM = "categoria";

/** Slug reservado para o chip fixo "Todos" (nunca é gravado no banco). */
export const HERO_ALL_SLUG = "todos";

/** Máximo de categorias por herói (o banco garante o mesmo: posição 1 ou 2). */
export const HERO_CATEGORY_MAX = 2;

export const HERO_CATEGORY_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type HeroCategory = {
  id: string;
  slug: string;
  /** Rótulo por idioma: {"pt-BR","en","es"}. */
  name: unknown;
  sortOrder: number;
};

/** Vínculo herói → categoria; position 1 ou 2 (ordem dos selos no card). */
export type HeroCategoryLink = { creatorId: string; categoryId: string; position: number };

/** Lê ?categoria= da URL: slug válido em minúsculas ou null ("Todos"). Lixo e "todos" viram null. */
export function parseCategoryParam(raw: string | string[] | null | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const slug = value.trim().toLowerCase().slice(0, 40);
  if (!slug || slug === HERO_ALL_SLUG || !HERO_CATEGORY_SLUG_RE.test(slug)) return null;
  return slug;
}

/** Categorias na ordem do admin (desempate pelo slug), só as com ao menos um herói visível. */
export function visibleCategories<C extends HeroCategory>(
  categories: readonly C[],
  links: readonly HeroCategoryLink[],
  visibleCreatorIds: readonly string[],
): (C & { count: number })[] {
  const visible = new Set(visibleCreatorIds);
  const counts = new Map<string, Set<string>>();
  for (const link of links) {
    if (!visible.has(link.creatorId)) continue;
    const set = counts.get(link.categoryId) ?? new Set<string>();
    set.add(link.creatorId);
    counts.set(link.categoryId, set);
  }
  return [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((category) => ({ ...category, count: counts.get(category.id)?.size ?? 0 }))
    .filter((category) => category.count > 0);
}

/** Categoria escolhida entre as visíveis; slug desconhecido ou sem herói cai em "Todos" (null). */
export function resolveCategory<C extends { slug: string }>(slug: string | null, visible: readonly C[]): C | null {
  if (!slug) return null;
  return visible.find((category) => category.slug === slug) ?? null;
}

/** Heróis da categoria, na ordem recebida; sem categoria ("Todos"), todos. */
export function creatorsForCategory<T extends { id: string }>(creators: readonly T[], links: readonly HeroCategoryLink[], categoryId: string | null): T[] {
  if (!categoryId) return [...creators];
  const ids = new Set(links.filter((link) => link.categoryId === categoryId).map((link) => link.creatorId));
  return creators.filter((creator) => ids.has(creator.id));
}

/** Categorias de cada herói na ordem da posição (1, 2), só entre as conhecidas (ativas). */
export function categoriesByCreator<C extends { id: string }>(links: readonly HeroCategoryLink[], categories: readonly C[]): Map<string, C[]> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const out = new Map<string, C[]>();
  for (const link of [...links].sort((a, b) => a.position - b.position)) {
    const category = byId.get(link.categoryId);
    if (!category) continue;
    const list = out.get(link.creatorId) ?? [];
    if (list.length < HERO_CATEGORY_MAX) list.push(category);
    out.set(link.creatorId, list);
  }
  return out;
}

/** Link do chip: "Todos" é a aba sem parâmetro. */
export function personalitiesHref(slug: string | null): string {
  return slug ? `/personalities?${HERO_CATEGORY_PARAM}=${encodeURIComponent(slug)}` : "/personalities";
}

/** Valida a escolha do admin: sem repetição, no máximo 2, na ordem dada. */
export function validateCategorySelection(ids: readonly string[]): { ok: true; ids: string[] } | { ok: false; error: "duplicate" | "too_many" } {
  if (new Set(ids).size !== ids.length) return { ok: false, error: "duplicate" };
  if (ids.length > HERO_CATEGORY_MAX) return { ok: false, error: "too_many" };
  return { ok: true, ids: [...ids] };
}
