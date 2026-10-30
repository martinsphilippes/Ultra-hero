import "server-only";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import type { ContentTileData } from "@/components/discover/explore/tiles";
import { CONTENT_TILE_SELECT } from "@/components/discover/explore/tiles";
import { getUser } from "@/lib/auth/session";
import { LIBRARY_KEYS, buildCreatorLibraries, type CreatorLibrary, type LibraryKey } from "@/lib/catalog/creator-libraries";
import { groupCreatorProducts, mergeCreatorProducts, type CreatorProduct, type CreatorProductDirectRow, type CreatorProductLinkRow } from "@/lib/catalog/creator-products";
import type { ProgramShelfSource } from "@/lib/catalog/program-shelves";
import { PRODUCT_CARD_SELECT, PROGRAM_CARD_SELECT, liveContentFilter, type ProductCardData } from "@/lib/catalog/queries";
import { fetchCreatorLibraryConfig } from "@/lib/heroes/library-tab-queries";
import { labelForLocale, primaryCategoryId, resolveLibraryConfig, resolveLibraryTiles, type LibraryTile, type ResolvedTab } from "@/lib/heroes/library-tabs";
import type { Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Dados do hub do herói (RF-004), compartilhados entre /personalities/[slug] e as páginas de
// biblioteca: as mesmas queries, regras de direitos e de compra em um só lugar.

export type Creator = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  pillars: Pillar[];
  avatar_url: string | null;
  cover_url: string | null;
  is_fictional: boolean;
  rights_note: string | null;
  rights_status: string;
  rights_holder: string | null;
  rights_valid_until: string | null;
};

/** Produto do card + estoque demo (limite por produto no carrinho de teste). */
export type HubProduct = ProductCardData & { demo_stock: number | null };
type LinkRow = CreatorProductLinkRow<HubProduct>;
type DirectRow = CreatorProductDirectRow<HubProduct>;

export type HubLibrary = CreatorLibrary<ContentTileData, ProgramShelfSource, CreatorProduct<HubProduct>>;

export type CreatorHub = {
  contents: ContentTileData[];
  programs: ProgramShelfSource[];
  products: CreatorProduct<HubProduct>[];
  /** As 7 bibliotecas, mesmo vazias (a página de cada uma acha a sua pela chave). */
  libraries: HubLibrary[];
  /** Atalhos da página do herói: configuração do admin (0050), só visíveis e com itens (ou Alimentação). */
  tiles: LibraryTile[];
  /** Apresentação efetiva de cada fonte (inclusive as ocultas): título e ícone da página da biblioteca. */
  tabs: Record<LibraryKey, ResolvedTab & { text: string | null }>;
  /** Kill switch do comércio: desligado, produtos somem e nada é contado. */
  commerceEnabled: boolean;
  /** Quantidade já no carrinho de teste, por produto (vazio para visitante). */
  inCartByProduct: Map<string, number>;
  isLoggedIn: boolean;
  errors: { contents: boolean; programs: boolean; products: boolean };
};

// Só os campos públicos de direitos; documento e notas ficam em creator_rights_private (só admin).
const CREATOR_SELECT = "id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, rights_note, rights_status, rights_holder, rights_valid_until";
// Vínculos validados cujo conteúdo (publicado) é desta personalidade; o !inner aplica o filtro do embed à linha.
const LINK_SELECT = `id, content:content!inner(id, slug, title, creator_id, status), product:products(${PRODUCT_CARD_SELECT}, demo_stock)`;
// Receitas que o herói indica (creator_recipe_links): assinadas pelo chef (content.creator).
const RECIPE_LINK_SELECT = `sort_order, content:content!inner(${CONTENT_TILE_SELECT}, status, publish_at)`;
// Alocação direta produto↔herói (creator_products): o embed vem nulo quando a RLS esconde o produto.
const DIRECT_SELECT = `id, status, sort_order, product:products(${PRODUCT_CARD_SELECT}, demo_stock)`;

export function hubHref(slug: string, library?: string): string {
  return library ? `/personalities/${slug}/${library}` : `/personalities/${slug}`;
}

// RLS: visitantes só enxergam perfis ativos; o próprio criador vê o seu mesmo suspenso.
// Memoizado por request: generateMetadata e a página pedem o mesmo perfil.
export const loadCreator = cache(async (slug: string): Promise<Creator | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("creator_profiles").select(CREATOR_SELECT).eq("slug", slug).maybeSingle();
  return (data as Creator | null) ?? null;
});

// Uma query por coleção (sem N+1); as bibliotecas e as contagens derivam do mesmo resultado,
// então o hub e cada página de biblioteca mostram sempre os mesmos números.
export const loadCreatorHub = cache(async (creator: Creator): Promise<CreatorHub> => {
  const [supabase, user, locale] = await Promise.all([createClient(), getUser(), getLocale()]);
  const [contentRes, programRes, linksRes, directRes, settingsRes, recipeLinksRes, libraryConfig] = await Promise.all([
    supabase.from("content").select(CONTENT_TILE_SELECT).eq("creator_id", creator.id).eq("status", "published").or(liveContentFilter()).order("published_at", { ascending: false }).limit(100),
    supabase.from("programs").select(`${PROGRAM_CARD_SELECT}, current_version_id`).eq("creator_id", creator.id).eq("status", "published").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("content_product_links")
      .select(LINK_SELECT)
      .eq("content.creator_id", creator.id)
      .eq("content.status", "published")
      .eq("status", "validated")
      .order("validated_at", { ascending: false })
      .order("id")
      .limit(100),
    supabase.from("creator_products").select(DIRECT_SELECT).eq("creator_id", creator.id).eq("status", "validated").order("sort_order").order("id").limit(100),
    supabase.rpc("public_settings"),
    supabase
      .from("creator_recipe_links")
      .select(RECIPE_LINK_SELECT)
      .eq("creator_id", creator.id)
      .eq("status", "validated")
      .eq("content.status", "published")
      .or(liveContentFilter(), { referencedTable: "content" })
      .order("sort_order")
      .limit(100),
    // atalhos configurados pelo admin (0050); sem a 0050: padrões do código
    fetchCreatorLibraryConfig(supabase, creator.id),
  ]);
  // Conteúdos do herói + receitas que ele indica (sem repetir): as indicadas entram em Alimentação
  // com a assinatura do chef que as fez.
  const own = (contentRes.data ?? []) as unknown as ContentTileData[];
  const ownIds = new Set(own.map((c) => c.id));
  const endorsed = ((recipeLinksRes.data ?? []) as unknown as { content: ContentTileData | null }[])
    .map((row) => row.content)
    .filter((c): c is ContentTileData => Boolean(c) && !ownIds.has(c!.id));
  const contents = [...own, ...endorsed];
  const programs = ((programRes.data ?? []) as unknown as ProgramShelfSource[]).filter((p) => p.version);
  const commerceEnabled = !settingsRes.error && isCommerceEnabled(settingsRes.data);

  // Produtos do herói: alocação direta validada primeiro, depois os ligados por conteúdo (sem repetir).
  // Mesma regra de compra do RelatedProducts: vínculo validado + product_is_purchasable.
  const productsError = Boolean(linksRes.error || directRes.error);
  let products: CreatorProduct<HubProduct>[] = [];
  let inCartByProduct = new Map<string, number>();
  if (commerceEnabled && !productsError) {
    const grouped = mergeCreatorProducts((directRes.data ?? []) as unknown as DirectRow[], groupCreatorProducts((linksRes.data ?? []) as unknown as LinkRow[]));
    const [purchasable, cartRes] = await Promise.all([
      Promise.all(grouped.map(async ({ product }) => Boolean((await supabase.rpc("product_is_purchasable", { p_product: product.id })).data))),
      user && grouped.length > 0
        ? supabase.from("cart_items").select("product_id, quantity").in("product_id", grouped.map(({ product }) => product.id))
        : Promise.resolve({ data: null }),
    ]);
    products = grouped.filter((_, index) => purchasable[index]);
    inCartByProduct = new Map((cartRes.data ?? []).map((row) => [row.product_id, row.quantity]));
  }

  const libraries = buildCreatorLibraries({ contents, programs, products, always: LIBRARY_KEYS });
  const counts = Object.fromEntries(libraries.map((library) => [library.key, library.count])) as Record<LibraryKey, number>;
  const resolved = resolveLibraryConfig({ categoryId: primaryCategoryId(libraryConfig.links), ...libraryConfig });
  const tabs = Object.fromEntries(resolved.map((tab) => [tab.key, { ...tab, text: labelForLocale(tab.label, locale) }])) as CreatorHub["tabs"];

  return {
    contents,
    programs,
    products,
    libraries,
    // Alimentação aparece mesmo vazia (como Receitas antes), salvo se o admin ocultar
    tiles: resolveLibraryTiles({ ...libraryConfig, counts, always: ["alimentacao"], locale }),
    tabs,
    commerceEnabled,
    inCartByProduct,
    isLoggedIn: Boolean(user),
    errors: { contents: Boolean(contentRes.error || recipeLinksRes.error), programs: Boolean(programRes.error), products: productsError },
  };
});
