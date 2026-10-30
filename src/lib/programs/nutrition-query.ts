import "server-only";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { groupCreatorProducts, maxCartQuantity, mergeCreatorProducts, type CreatorProduct, type CreatorProductDirectRow, type CreatorProductLinkRow } from "@/lib/catalog/creator-products";
import { CONTENT_CARD_SELECT, liveContentFilter, type ContentCardData, type ProductCardData } from "@/lib/catalog/queries";
import type { createClient } from "@/lib/supabase/server";
import { isNutritionContent, isNutritionProduct, mergeUnique, nutritionProductsAllowed } from "./program-cards";

type Client = Awaited<ReturnType<typeof createClient>>;

// Material do card Nutricional: conteúdos de nutrição/receitas do programa e do mesmo herói, e
// produtos de comida (categoria is_food) ligados aos conteúdos do programa, aos do herói ou direto ao
// herói (creator_products). Mesmas regras de compra do hub do herói: vínculo validado +
// product_is_purchasable, kill switch do comércio e nada de produto no app das lojas.

const CONTENT_LIMIT = 8;
const PRODUCT_LIMIT = 8;

// Select do card de produto + is_food (filtro nutricional) + estoque demo (limite do carrinho).
const PRODUCT_SELECT =
  "id, slug, title, image_url, price_cents_demo, availability, attributes, demo_stock, " +
  "category:product_categories(code, name, is_food), seller:seller_organizations(slug, name)";

export type NutritionProductData = ProductCardData & { demo_stock: number | null; category: (ProductCardData["category"] & { is_food?: boolean | null }) | null };

export type NutritionProduct = CreatorProduct<NutritionProductData> & { maxQuantity: number; inCart: number };

export type ProgramNutrition = {
  contents: ContentCardData[];
  products: NutritionProduct[];
  productsAllowed: boolean;
};

type Input = {
  creatorId: string | null;
  /** Conteúdos do programa já carregados, na ordem dos itens. */
  programContents: readonly ContentCardData[];
  userId: string | null;
  nativeApp: boolean;
};

export async function loadProgramNutrition(supabase: Client, { creatorId, programContents, userId, nativeApp }: Input): Promise<ProgramNutrition> {
  const programIds = programContents.map((c) => c.id);
  const programNutrition = programContents.filter(isNutritionContent);

  try {
    const [settingsRes, heroContentRes, endorsedRes] = await Promise.all([
      nativeApp ? null : supabase.rpc("public_settings"),
      creatorId
        ? supabase
            .from("content")
            .select(CONTENT_CARD_SELECT)
            .eq("creator_id", creatorId)
            .eq("status", "published")
            .or(liveContentFilter())
            .or("pillar.eq.nutrition,type.eq.recipe")
            .order("published_at", { ascending: false })
            .limit(CONTENT_LIMIT)
        : null,
      // receitas que o herói indica (creator_recipe_links), como na Alimentação do hub
      creatorId
        ? supabase
            .from("creator_recipe_links")
            .select(`sort_order, content:content!inner(${CONTENT_CARD_SELECT}, status, publish_at)`)
            .eq("creator_id", creatorId)
            .eq("status", "validated")
            .eq("content.status", "published")
            .or(liveContentFilter(), { referencedTable: "content" })
            .order("sort_order")
            .limit(CONTENT_LIMIT)
        : null,
    ]);
    const heroContents = ((heroContentRes?.data ?? []) as unknown as ContentCardData[]).filter(isNutritionContent);
    const endorsed = ((endorsedRes?.data ?? []) as unknown as { content: ContentCardData | null }[]).map((r) => r.content).filter((c): c is ContentCardData => Boolean(c));
    const contents = mergeUnique([programNutrition, heroContents, endorsed], CONTENT_LIMIT);

    const productsAllowed = nutritionProductsAllowed({ commerceEnabled: Boolean(settingsRes && !settingsRes.error && isCommerceEnabled(settingsRes.data)), nativeApp });
    const products = productsAllowed ? await loadProducts(supabase, { creatorId, programIds, userId }) : [];
    return { contents, products, productsAllowed };
  } catch {
    // leitura falhou: o card mostra só o que já veio com o programa
    return { contents: mergeUnique([programNutrition], CONTENT_LIMIT), products: [], productsAllowed: false };
  }
}

type LinkRow = CreatorProductLinkRow<NutritionProductData>;
type DirectRow = CreatorProductDirectRow<NutritionProductData>;
const LINK_SELECT = `id, content:content!inner(id, slug, title, creator_id, status), product:products(${PRODUCT_SELECT})`;

async function loadProducts(supabase: Client, { creatorId, programIds, userId }: { creatorId: string | null; programIds: string[]; userId: string | null }): Promise<NutritionProduct[]> {
  const [programLinksRes, heroLinksRes, directRes] = await Promise.all([
    programIds.length > 0
      ? supabase.from("content_product_links").select(LINK_SELECT).in("content_id", programIds).eq("content.status", "published").eq("status", "validated").limit(50)
      : null,
    creatorId
      ? supabase
          .from("content_product_links")
          .select(LINK_SELECT)
          .eq("content.creator_id", creatorId)
          .eq("content.status", "published")
          .eq("status", "validated")
          .order("validated_at", { ascending: false })
          .order("id")
          .limit(100)
      : null,
    creatorId ? supabase.from("creator_products").select(`id, status, sort_order, product:products(${PRODUCT_SELECT})`).eq("creator_id", creatorId).eq("status", "validated").order("sort_order").order("id").limit(100) : null,
  ]);
  if (programLinksRes?.error || heroLinksRes?.error || directRes?.error) return [];

  // ordem: ligados aos conteúdos do programa → alocação direta do herói → ligados aos conteúdos do herói
  const fromProgram = groupCreatorProducts((programLinksRes?.data ?? []) as unknown as LinkRow[]);
  const fromHero = mergeCreatorProducts((directRes?.data ?? []) as unknown as DirectRow[], groupCreatorProducts((heroLinksRes?.data ?? []) as unknown as LinkRow[]));
  const seen = new Set<string>();
  const candidates = [...fromProgram, ...fromHero]
    .filter(({ product }) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return isNutritionProduct(product);
    })
    .slice(0, PRODUCT_LIMIT);
  if (candidates.length === 0) return [];

  const [purchasable, cartRes] = await Promise.all([
    Promise.all(candidates.map(async ({ product }) => Boolean((await supabase.rpc("product_is_purchasable", { p_product: product.id })).data))),
    userId ? supabase.from("cart_items").select("product_id, quantity").in("product_id", candidates.map(({ product }) => product.id)) : null,
  ]);
  const inCart = new Map((cartRes?.data ?? []).map((row) => [row.product_id, row.quantity]));
  return candidates
    .filter((_, i) => purchasable[i])
    .map((item) => ({ ...item, maxQuantity: maxCartQuantity(item.product.demo_stock), inCart: inCart.get(item.product.id) ?? 0 }));
}
