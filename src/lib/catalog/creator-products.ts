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

// ---------------------------------------------------------------- alocação direta (creator_products)

/** Linha de creator_products com o produto embutido (mesmo select do card + estoque demo). */
export type CreatorProductDirectRow<P extends { id: string }> = {
  id: string;
  status: string;
  sort_order: number;
  product: Embed<P>;
};

/**
 * Une as duas origens da aba Produtos do herói: alocações diretas validadas (ordem de sort_order,
 * desempate pela ordem de chegada) primeiro, depois os produtos vinculados por conteúdo que ainda
 * não apareceram. Produto repetido entre as origens conta uma vez e mantém o "usado em" do vínculo.
 * Linhas sem produto (RLS escondeu, arquivado) ou com status diferente de validated são ignoradas.
 */
export function mergeCreatorProducts<P extends { id: string }>(
  direct: readonly CreatorProductDirectRow<P>[] | null | undefined,
  linked: readonly CreatorProduct<P>[] | null | undefined,
): CreatorProduct<P>[] {
  const usedInByProduct = new Map<string, CreatorProductContent[]>();
  for (const item of linked ?? []) usedInByProduct.set(item.product.id, item.usedIn);

  const validated: { product: P; sort: number; index: number }[] = [];
  (direct ?? []).forEach((row, index) => {
    const product = unwrap(row.product);
    if (row.status === "validated" && product) validated.push({ product, sort: row.sort_order, index });
  });
  // sort é estável, mas o índice garante a ordem de chegada mesmo com sort_order repetido.
  validated.sort((a, b) => a.sort - b.sort || a.index - b.index);

  const seen = new Set<string>();
  const result: CreatorProduct<P>[] = [];
  for (const { product } of validated) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    result.push({ product, usedIn: usedInByProduct.get(product.id) ?? [] });
  }
  for (const item of linked ?? []) {
    if (seen.has(item.product.id)) continue;
    seen.add(item.product.id);
    result.push(item);
  }
  return result;
}

/** Limite por produto no carrinho de teste: 20 ou o estoque de demonstração, o que for menor. */
export function maxCartQuantity(demoStock: number | null | undefined): number {
  if (demoStock === null || demoStock === undefined) return 20;
  return Math.max(0, Math.min(20, demoStock));
}
