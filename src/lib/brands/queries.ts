import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  mergeBrandChips,
  toProductView,
  visibleSmartTags,
  type BrandChipView,
  type RawTag,
  type RecommendedProductView,
  type SmartTagView,
} from "./index";

// Leituras públicas da vitrine de marcas (0062). Toda falha (inclusive banco sem a 0062) vira lista
// vazia: a página segue igual, só sem marcas. O status vem junto para o admin ver o mesmo que o público.

type Client = Awaited<ReturnType<typeof createClient>>;

const BRAND = "id, slug, name, logo_url, site_url, is_demo, status";
export const PRODUCT_SELECT = `id, name, image_url, description, external_url, price_cents, currency, is_demo, status, brand:brands(${BRAND})`;

type ChipRow = { relationship: string; brand: Record<string, unknown> | null };

/** Marcas do herói (faixa ao lado do nome). */
export async function loadCreatorBrandChips(supabase: Client, creatorId: string | null | undefined): Promise<BrandChipView[]> {
  if (!creatorId) return [];
  try {
    const { data, error } = await supabase
      .from("creator_brands")
      .select(`relationship, brand:brands(${BRAND})`)
      .eq("creator_id", creatorId)
      .eq("status", "active")
      .order("sort_order");
    if (error) return [];
    return mergeBrandChips(data as unknown as ChipRow[]);
  } catch {
    return [];
  }
}

/** Marcas do conteúdo (citadas no post) + as do herói; o conteúdo vem primeiro. */
export async function loadContentBrandChips(supabase: Client, contentId: string, creatorId: string | null | undefined): Promise<BrandChipView[]> {
  try {
    const [own, hero] = await Promise.all([
      supabase.from("content_brands").select(`relationship, brand:brands(${BRAND})`).eq("content_id", contentId).eq("status", "active").order("sort_order"),
      creatorId
        ? supabase.from("creator_brands").select(`relationship, brand:brands(${BRAND})`).eq("creator_id", creatorId).eq("status", "active").order("sort_order")
        : null,
    ]);
    return mergeBrandChips(own.error ? [] : (own.data as unknown as ChipRow[]), hero && !hero.error ? (hero.data as unknown as ChipRow[]) : []);
  } catch {
    return [];
  }
}

const TAG_SELECT = `id, content_id, x_pct, y_pct, label_side, media_url, product:brand_products(${PRODUCT_SELECT})`;
type TagRow = RawTag & { content_id: string };

/** Smart Tags de vários posts de uma vez (feed): só as da foto atual de cada post. */
export async function loadSmartTagsFor(supabase: Client, posts: readonly { id: string; cover_url: string | null }[]): Promise<Map<string, SmartTagView[]>> {
  const out = new Map<string, SmartTagView[]>();
  const ids = posts.filter((p) => p.cover_url).map((p) => p.id);
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from("media_smart_tags")
      .select(TAG_SELECT)
      .in("content_id", ids)
      .eq("status", "active")
      .eq("media_key", "cover")
      .order("sort_order");
    if (error || !data) return out;
    const rows = data as unknown as TagRow[];
    for (const post of posts) {
      const tags = visibleSmartTags(
        rows.filter((r) => r.content_id === post.id),
        post.cover_url,
      );
      if (tags.length > 0) out.set(post.id, tags);
    }
  } catch {
    // sem marcações
  }
  return out;
}

/** Smart Tags de um conteúdo (página do post). */
export async function loadContentSmartTags(supabase: Client, contentId: string, coverUrl: string | null): Promise<SmartTagView[]> {
  return (await loadSmartTagsFor(supabase, [{ id: contentId, cover_url: coverUrl }])).get(contentId) ?? [];
}

type RecRow = { note?: string | null; product: Record<string, unknown> | null };

function toRecommended(rows: readonly RecRow[]): RecommendedProductView[] {
  const seen = new Set<string>();
  const out: RecommendedProductView[] = [];
  for (const row of rows) {
    const product = toProductView(row.product as Parameters<typeof toProductView>[0]);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    out.push({ ...product, note: typeof row.note === "string" ? row.note : "" });
  }
  return out;
}

/** Equipamentos e produtos recomendados do conteúdo (bloco sob o conteúdo). */
export async function loadContentRecommended(supabase: Client, contentId: string): Promise<RecommendedProductView[]> {
  try {
    const { data, error } = await supabase
      .from("content_brand_products")
      .select(`product:brand_products(${PRODUCT_SELECT})`)
      .eq("content_id", contentId)
      .eq("status", "active")
      .order("sort_order");
    if (error || !data) return [];
    return toRecommended(data as unknown as RecRow[]);
  } catch {
    return [];
  }
}

/** Equipamentos e produtos recomendados do programa (card "Equipamentos"). */
export async function loadProgramRecommended(supabase: Client, programId: string): Promise<RecommendedProductView[]> {
  try {
    const { data, error } = await supabase
      .from("program_brand_products")
      .select(`note, product:brand_products(${PRODUCT_SELECT})`)
      .eq("program_id", programId)
      .eq("status", "active")
      .order("sort_order");
    if (error || !data) return [];
    return toRecommended(data as unknown as RecRow[]);
  } catch {
    return [];
  }
}
