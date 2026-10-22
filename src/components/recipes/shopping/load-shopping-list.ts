import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { maxCartQuantity } from "@/lib/catalog/creator-products";
import { RECIPE_UNITS, type RecipeUnit } from "@/lib/recipes/codes";
import { isMissingRelation } from "@/lib/recipes/history";
import { formatAmount } from "@/lib/recipes/quantity";
import { groupShoppingItems, otherRecipesWithProduct, productOfferState, SHOPPING_LIST_LIMIT, type OfferState, type ShoppingItemRow } from "@/lib/recipes/shopping";
import { formatIngredientAmount, type UnitLabels } from "@/lib/recipes/view-model";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type ShoppingProduct = { id: string; slug: string; title: string; priceCents: number; maxQuantity: number; inCart: number };
/** Produto ligado (kit da receita ou produto avulso do ingrediente) no estado da seção 4.4. */
export type ShoppingOffer = { state: OfferState; product: ShoppingProduct | null };
export type ShoppingListItemView = {
  id: string;
  name: string;
  /** "600 g", "1/2 maço", "3 colheres", "a gosto" (ingrediente a gosto sem quantidade) ou null. */
  amount: string | null;
  /** Texto inicial do campo "Editar quantidade" (sem a unidade, que o item mantém). */
  amountInput: string;
  unit: RecipeUnit | null;
  checked: boolean;
  offer: ShoppingOffer;
  alsoIn: { slug: string; title: string }[];
};
export type ShoppingListGroupView = {
  key: string;
  contentId: string | null;
  title: string | null;
  slug: string | null;
  /** Kits ou produtos da receita (content_product_links validados); vazio = sem produto. */
  kits: ShoppingOffer[];
  items: ShoppingListItemView[];
};
export type ShoppingListData = {
  status: "ok" | "unavailable" | "error";
  commerceEnabled: boolean;
  groups: ShoppingListGroupView[];
  total: number;
  checked: number;
};

const PRODUCT_SELECT = "id, slug, title, price_cents_demo, demo_stock";
type ProductRow = { id: string; slug: string; title: string; price_cents_demo: number; demo_stock: number | null };
type LinkRow = { product_id: string; product: ProductRow | ProductRow[] | null };

const one = (p: ProductRow | ProductRow[] | null): ProductRow | null => (Array.isArray(p) ? (p[0] ?? null) : p);
const asUnit = (u: string | null): RecipeUnit | null => ((RECIPE_UNITS as readonly string[]).includes(u ?? "") ? (u as RecipeUnit) : null);

/**
 * Lista da pessoa agrupada por receita, com o kit de cada receita (content_product_links validados,
 * o mesmo reúso do RelatedProducts) e o produto avulso validado de cada ingrediente
 * (recipe_ingredient_products), cada um num dos 4 estados. O vínculo vale pelo que está validado
 * agora (o product_id gravado na linha pode ter envelhecido). Sem a tabela: "indisponível".
 */
export async function loadShoppingList(supabase: Client, userId: string, opts: { labels: UnitLabels; locale: string; toTasteLabel?: string }): Promise<ShoppingListData> {
  const empty = (status: ShoppingListData["status"]): ShoppingListData => ({ status, commerceEnabled: true, groups: [], total: 0, checked: 0 });
  const itemsRes = await supabase
    .from("shopping_list_items")
    // to_taste do ingrediente (a RLS de recipe_ingredients usa can_access_content): a linha da lista não
    // guarda "a gosto", e sem isto o item aparecia "Sem quantidade" enquanto a receita diz "a gosto"
    .select("id, content_id, ingredient_id, name, quantity, unit, quantity_text, product_id, checked, position, created_at, ingredient:recipe_ingredients(to_taste)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(SHOPPING_LIST_LIMIT);
  if (itemsRes.error) return empty(isMissingRelation(itemsRes.error) ? "unavailable" : "error");
  const toTaste = new Set<string>();
  const rows: ShoppingItemRow[] = (itemsRes.data ?? []).map(({ ingredient, ...r }) => {
    const ing = (Array.isArray(ingredient) ? ingredient[0] : ingredient) as { to_taste: boolean } | null | undefined;
    if (ing?.to_taste) toTaste.add(r.id);
    return { ...r, quantity: r.quantity === null ? null : Number(r.quantity), unit: asUnit(r.unit) };
  });

  const contentIds = [...new Set(rows.map((r) => r.content_id).filter((id): id is string => Boolean(id)))];
  const ingredientIds = [...new Set(rows.map((r) => r.ingredient_id).filter((id): id is string => Boolean(id)))];
  const [contentRes, kitRes, ingredientRes, settingsRes] = await Promise.all([
    contentIds.length ? supabase.from("content").select("id, slug, title").in("id", contentIds) : null,
    contentIds.length ? supabase.from("content_product_links").select(`content_id, product_id, product:products(${PRODUCT_SELECT})`).in("content_id", contentIds).eq("status", "validated") : null,
    ingredientIds.length ? supabase.from("recipe_ingredient_products").select(`ingredient_id, product_id, product:products(${PRODUCT_SELECT})`).in("ingredient_id", ingredientIds).eq("status", "validated") : null,
    supabase.rpc("public_settings"),
  ]);
  const commerceEnabled = !settingsRes.error && isCommerceEnabled(settingsRes.data);
  const contents = new Map((contentRes?.data ?? []).map((c) => [c.id, c]));
  const kitsByContent = new Map<string, LinkRow[]>();
  for (const k of (kitRes?.data ?? []) as unknown as (LinkRow & { content_id: string })[]) kitsByContent.set(k.content_id, [...(kitsByContent.get(k.content_id) ?? []), k]);
  // sem a tabela de vínculos (ou sem leitura) os ingredientes ficam "sem produto correspondente"
  const ingredientLinks = new Map(((ingredientRes?.data ?? []) as unknown as (LinkRow & { ingredient_id: string })[]).map((l) => [l.ingredient_id, l]));

  // produto visível (a RLS esconde o que saiu do ar: conta como indisponível, sem nome)
  const productIds = [...new Set([...[...kitsByContent.values()].flat(), ...ingredientLinks.values()].map((l) => one(l.product)?.id).filter((id): id is string => Boolean(id)))];
  const [purchasable, cartRes] = await Promise.all([
    commerceEnabled ? Promise.all(productIds.map(async (id) => [id, Boolean((await supabase.rpc("product_is_purchasable", { p_product: id })).data)] as const)) : Promise.resolve([] as (readonly [string, boolean])[]),
    commerceEnabled && productIds.length ? supabase.from("cart_items").select("product_id, quantity").in("product_id", productIds) : null,
  ]);
  const canBuy = new Map(purchasable);
  const inCart = new Map((cartRes?.data ?? []).map((c) => [c.product_id, c.quantity]));

  const offerFor = (link: LinkRow | undefined): ShoppingOffer => {
    if (!link) return { state: "none", product: null };
    const p = one(link.product);
    const state = productOfferState({ commerceEnabled, product: { purchasable: Boolean(p && canBuy.get(p.id)) } });
    return {
      state,
      product: p ? { id: p.id, slug: p.slug, title: p.title, priceCents: p.price_cents_demo, maxQuantity: maxCartQuantity(p.demo_stock), inCart: inCart.get(p.id) ?? 0 } : null,
    };
  };

  const groups = groupShoppingItems(rows);
  const productOfItem = (r: ShoppingItemRow) => (r.ingredient_id ? (one(ingredientLinks.get(r.ingredient_id)?.product ?? null)?.id ?? null) : null);
  const others = otherRecipesWithProduct([
    ...rows.map((r) => ({ contentId: r.content_id, productId: productOfItem(r) })),
    ...[...kitsByContent.entries()].flatMap(([contentId, links]) => links.map((l) => ({ contentId, productId: one(l.product)?.id ?? null }))),
  ]);

  return {
    status: "ok",
    commerceEnabled,
    total: rows.length,
    checked: rows.filter((r) => r.checked).length,
    groups: groups.map((g) => {
      const content = g.contentId ? contents.get(g.contentId) : undefined;
      return {
        key: g.contentId ?? "other",
        contentId: g.contentId,
        title: content?.title ?? null,
        slug: content?.slug ?? null,
        kits: g.contentId ? (kitsByContent.get(g.contentId) ?? []).map(offerFor) : [],
        items: g.items.map((r) => ({
          id: r.id,
          name: r.name,
          amount: formatIngredientAmount(r.quantity, r.unit, r.quantity_text, opts.labels, opts.locale) ?? (toTaste.has(r.id) ? (opts.toTasteLabel ?? null) : null),
          amountInput: r.quantity !== null ? (opts.locale.startsWith("en") ? formatAmount(r.quantity, r.unit).replace(",", ".") : formatAmount(r.quantity, r.unit)) : (r.quantity_text ?? ""),
          unit: r.unit,
          checked: r.checked,
          offer: offerFor(r.ingredient_id ? ingredientLinks.get(r.ingredient_id) : undefined),
          alsoIn: others(productOfItem(r), r.content_id)
            .map((id) => contents.get(id))
            .filter((c): c is { id: string; slug: string; title: string } => Boolean(c))
            .map((c) => ({ slug: c.slug, title: c.title })),
        })),
      };
    }),
  };
}
