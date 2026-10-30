import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isMissingBrandsSchema, type Relationship } from "./index";
import type { BrandStatus, BrandLinkItem, ProductLinkItem } from "./admin";
import type { LabelSide } from "./geometry";

// Leituras do admin (0062): o admin lê tudo pela RLS (inclusive desativado). available = false
// quando o banco ainda não tem a 0062 (as telas mostram o aviso no lugar dos editores).

export type AdminBrand = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  site_url: string;
  status: BrandStatus;
  default_relationship: Relationship;
  is_demo: boolean;
  products: number;
};
export type AdminProduct = {
  id: string;
  brand_id: string;
  name: string;
  description: string;
  external_url: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
  status: BrandStatus;
  is_demo: boolean;
};
export type BrandOption = { id: string; name: string; status: BrandStatus; is_demo: boolean; default_relationship: Relationship };
export type ProductOption = { id: string; name: string; brand: string; status: BrandStatus; image_url: string | null; is_demo: boolean };

type Missing = { available: false };

export async function listAdminBrands(): Promise<{ available: true; brands: AdminBrand[] } | Missing> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, slug, name, logo_url, site_url, status, default_relationship, is_demo, brand_products(count)")
    .order("name");
  if (error) return isMissingBrandsSchema(error) ? { available: false } : { available: true, brands: [] };
  const rows = (data ?? []) as unknown as (Omit<AdminBrand, "products"> & { brand_products: { count: number }[] })[];
  return { available: true, brands: rows.map(({ brand_products, ...b }) => ({ ...b, products: brand_products?.[0]?.count ?? 0 })) };
}

export async function getAdminBrand(id: string): Promise<{ available: true; brand: AdminBrand | null; products: AdminProduct[] } | Missing> {
  const supabase = await createClient();
  const [brandRes, productsRes] = await Promise.all([
    supabase.from("brands").select("id, slug, name, logo_url, site_url, status, default_relationship, is_demo").eq("id", id).maybeSingle(),
    supabase
      .from("brand_products")
      .select("id, brand_id, name, description, external_url, image_url, price_cents, currency, status, is_demo")
      .eq("brand_id", id)
      .order("name"),
  ]);
  if (brandRes.error && isMissingBrandsSchema(brandRes.error)) return { available: false };
  const products = (productsRes.data ?? []) as unknown as AdminProduct[];
  const brand = brandRes.data ? ({ ...(brandRes.data as unknown as Omit<AdminBrand, "products">), products: products.length } as AdminBrand) : null;
  return { available: true, brand, products };
}

export async function brandOptions(): Promise<BrandOption[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brands").select("id, name, status, is_demo, default_relationship").order("name");
  if (error) return isMissingBrandsSchema(error) ? null : [];
  return (data ?? []) as unknown as BrandOption[];
}

export async function productOptions(): Promise<ProductOption[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_products").select("id, name, status, image_url, is_demo, brand:brands(name)").order("name");
  if (error) return isMissingBrandsSchema(error) ? null : [];
  return ((data ?? []) as unknown as (Omit<ProductOption, "brand"> & { brand: { name: string } | null })[]).map((p) => ({ ...p, brand: p.brand?.name ?? "" }));
}

export async function creatorBrandsAdmin(creatorId: string): Promise<BrandLinkItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("creator_brands").select("brand_id, relationship, status").eq("creator_id", creatorId).order("sort_order");
  return ((data ?? []) as { brand_id: string; relationship: Relationship; status: BrandStatus }[]).map((r) => ({ id: r.brand_id, relationship: r.relationship, status: r.status }));
}

export async function programBrandProductsAdmin(programId: string): Promise<ProductLinkItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("program_brand_products").select("brand_product_id, note, status").eq("program_id", programId).order("sort_order");
  return ((data ?? []) as { brand_product_id: string; note: string; status: BrandStatus }[]).map((r) => ({ id: r.brand_product_id, note: r.note, status: r.status }));
}

export type AdminTag = { brand_product_id: string; x_pct: number; y_pct: number; label_side: LabelSide; status: BrandStatus; media_url: string | null };

export async function contentBrandsAdmin(contentId: string): Promise<{ brands: BrandLinkItem[]; products: ProductLinkItem[]; tags: AdminTag[] }> {
  const supabase = await createClient();
  const [brands, products, tags] = await Promise.all([
    supabase.from("content_brands").select("brand_id, relationship, status").eq("content_id", contentId).order("sort_order"),
    supabase.from("content_brand_products").select("brand_product_id, status").eq("content_id", contentId).order("sort_order"),
    supabase.from("media_smart_tags").select("brand_product_id, x_pct, y_pct, label_side, status, media_url").eq("content_id", contentId).eq("media_key", "cover").order("sort_order"),
  ]);
  return {
    brands: ((brands.data ?? []) as { brand_id: string; relationship: Relationship; status: BrandStatus }[]).map((r) => ({ id: r.brand_id, relationship: r.relationship, status: r.status })),
    products: ((products.data ?? []) as { brand_product_id: string; status: BrandStatus }[]).map((r) => ({ id: r.brand_product_id, status: r.status, note: "" })),
    tags: ((tags.data ?? []) as AdminTag[]).map((t) => ({ ...t, x_pct: Number(t.x_pct), y_pct: Number(t.y_pct) })),
  };
}

export type ClickSummary = { brands: { id: string; name: string; clicks: number }[]; products: { id: string; name: string; brand_id: string; clicks: number }[] };

/** Cliques para fora no período (só contagens). null = sem a 0062. */
export async function brandClicks(days = 30): Promise<ClickSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_brand_clicks", { p_days: days });
  if (error || !data) return null;
  const v = data as unknown as Partial<ClickSummary>;
  return { brands: Array.isArray(v.brands) ? v.brands : [], products: Array.isArray(v.products) ? v.products : [] };
}
