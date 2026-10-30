import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { maxCartQuantity } from "@/lib/catalog/creator-products";
import type { Database } from "@/lib/supabase/database.types";
import type { ShowcasePerson, SignerOverride } from "./showcase";

// Leituras da Alimentação (0051) com o cliente de quem pede (a RLS decide). Sem a 0051 no banco
// (tabelas ausentes) ou com erro de leitura: mapas vazios — a receita aparece como antes (o autor
// assina) e sem "Comprar pronto".

type Client = SupabaseClient<Database>;

const PERSON_SELECT = "slug, name, avatar_url, is_fictional";

/** Assinaturas escolhidas pelo admin, por receita. Receita sem linha fica de fora (o autor assina). */
export async function fetchRecipeSigners(supabase: Client, ids: readonly string[]): Promise<Map<string, SignerOverride>> {
  const map = new Map<string, SignerOverride>();
  if (ids.length === 0) return map;
  try {
    const { data, error } = await supabase.from("recipe_signers").select(`content_id, chef_id, chef:creator_profiles(${PERSON_SELECT})`).in("content_id", [...ids]);
    if (error || !data) return map;
    for (const row of data as unknown as { content_id: string; chef_id: string | null; chef: ShowcasePerson | ShowcasePerson[] | null }[]) {
      const chef = Array.isArray(row.chef) ? (row.chef[0] ?? null) : row.chef;
      map.set(row.content_id, { chef: row.chef_id ? chef : null });
    }
  } catch {
    // 0051 ausente: como antes
  }
  return map;
}

/** Cards com a assinatura escolhida pelo admin (campo `signer`). */
export async function withRecipeSigners<T extends { id: string }>(supabase: Client, cards: T[]): Promise<(T & { signer?: SignerOverride })[]> {
  const signers = await fetchRecipeSigners(supabase, cards.map((c) => c.id));
  if (signers.size === 0) return cards;
  return cards.map((card) => (signers.has(card.id) ? { ...card, signer: signers.get(card.id) } : card));
}

export type ReadyProduct = {
  id: string;
  slug: string;
  title: string;
  price_cents_demo: number;
  /** Comprável agora (product_is_purchasable) e disponível. */
  purchasable: boolean;
  maxQuantity: number;
};

type ReadyRow = {
  content_id: string;
  product: { id: string; slug: string; title: string; price_cents_demo: number; availability: string; demo_stock: number | null } | null;
};

/** Produto "Comprar pronto" de cada receita (só os visíveis pela RLS), com a regra de compra da loja. */
export async function fetchReadyProducts(supabase: Client, ids: readonly string[]): Promise<Map<string, ReadyProduct>> {
  const map = new Map<string, ReadyProduct>();
  if (ids.length === 0) return map;
  try {
    const { data, error } = await supabase
      .from("recipe_ready_products")
      .select("content_id, product:products(id, slug, title, price_cents_demo, availability, demo_stock)")
      .in("content_id", [...ids]);
    if (error || !data) return map;
    const rows = (data as unknown as ReadyRow[]).filter((r): r is ReadyRow & { product: NonNullable<ReadyRow["product"]> } => Boolean(r.product));
    const purchasable = await Promise.all(
      rows.map(async (r) => (r.product.availability === "available" ? Boolean((await supabase.rpc("product_is_purchasable", { p_product: r.product.id })).data) : false)),
    );
    rows.forEach((r, index) => {
      map.set(r.content_id, {
        id: r.product.id,
        slug: r.product.slug,
        title: r.product.title,
        price_cents_demo: r.product.price_cents_demo,
        purchasable: purchasable[index],
        maxQuantity: maxCartQuantity(r.product.demo_stock),
      });
    });
  } catch {
    // 0051 ausente: sem "Comprar pronto"
  }
  return map;
}

export type ShowcaseCommerce = { commerceEnabled: boolean; isLoggedIn: boolean; inCart: Map<string, number> };

/** Kill switch do comércio e o que já está no carrinho de teste (só dos produtos prontos). */
export async function fetchShowcaseCommerce(supabase: Client, userId: string | null, productIds: readonly string[]): Promise<ShowcaseCommerce> {
  const [settings, cart] = await Promise.all([
    supabase.rpc("public_settings"),
    userId && productIds.length > 0 ? supabase.from("cart_items").select("product_id, quantity").in("product_id", [...productIds]) : Promise.resolve({ data: null }),
  ]);
  return {
    commerceEnabled: !settings.error && isCommerceEnabled(settings.data),
    isLoggedIn: Boolean(userId),
    inCart: new Map(((cart.data ?? []) as { product_id: string; quantity: number }[]).map((row) => [row.product_id, row.quantity])),
  };
}

export type ShowcaseHero = ShowcasePerson & { id: string };

/**
 * Herói da vitrine pedido pela URL (?vitrine=slug), só se a receita está mesmo na vitrine dele
 * (autor ou vínculo validado) e ele está ativo. Fora disso, null (vale o autor).
 */
export async function resolveShowcaseHero(supabase: Client, slug: string | null, content: { id: string; creator_id: string | null }): Promise<ShowcaseHero | null> {
  if (!slug) return null;
  try {
    const { data: hero } = await supabase.from("creator_profiles").select(`id, ${PERSON_SELECT}`).eq("slug", slug).eq("status", "active").maybeSingle();
    if (!hero) return null;
    if (hero.id === content.creator_id) return hero as ShowcaseHero;
    const { data: link } = await supabase.from("creator_recipe_links").select("id").eq("creator_id", hero.id).eq("content_id", content.id).eq("status", "validated").maybeSingle();
    return link ? (hero as ShowcaseHero) : null;
  } catch {
    return null;
  }
}
