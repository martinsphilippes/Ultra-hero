// Agrupa vínculos conteúdo–produto validados de uma personalidade em produtos únicos.
// Puro (sem Supabase): recebe as linhas de content_product_links com os embeds `content` e
// `product` e devolve cada produto uma vez, com a lista de conteúdos em que é "usado".

export type CreatorProductContent = { id: string; slug: string; title: string };

// O PostgREST devolve o embed como objeto (relação N:1) mas o tipo gerado pode ser array.
type Embed<T> = T | T[] | null | undefined;

export type CreatorProductLinkRow<P extends { id: string }> = {
  id: string;
  content: Embed<CreatorProductContent>;
  product: Embed<P>;
};

export type CreatorProduct<P extends { id: string }> = {
  product: P;
  /** Conteúdos publicados desta personalidade que usam o produto, em ordem alfabética de título. */
  usedIn: CreatorProductContent[];
};

function unwrap<T>(value: Embed<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function byTitle(a: CreatorProductContent, b: CreatorProductContent): number {
  const cmp = a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
  return cmp !== 0 ? cmp : a.slug.localeCompare(b.slug);
}

/**
 * Deduplica por id de produto mantendo a ordem da primeira aparição; linhas sem produto ou sem
 * conteúdo são ignoradas; conteúdos repetidos para o mesmo produto contam uma vez.
 */
export function groupCreatorProducts<P extends { id: string }>(rows: readonly CreatorProductLinkRow<P>[] | null | undefined): CreatorProduct<P>[] {
  const order: string[] = [];
  const byProduct = new Map<string, { product: P; contents: Map<string, CreatorProductContent> }>();

  for (const row of rows ?? []) {
    const product = unwrap(row.product);
    const content = unwrap(row.content);
    if (!product || !content) continue;
    let entry = byProduct.get(product.id);
    if (!entry) {
      entry = { product, contents: new Map() };
      byProduct.set(product.id, entry);
      order.push(product.id);
    }
    if (!entry.contents.has(content.id)) entry.contents.set(content.id, { id: content.id, slug: content.slug, title: content.title });
  }

  return order.map((id) => {
    const entry = byProduct.get(id)!;
    return { product: entry.product, usedIn: Array.from(entry.contents.values()).sort(byTitle) };
  });
}

/** Limite por produto no carrinho de teste: 20 ou o estoque de demonstração, o que for menor. */
export function maxCartQuantity(demoStock: number | null | undefined): number {
  if (demoStock === null || demoStock === undefined) return 20;
  return Math.max(0, Math.min(20, demoStock));
}
