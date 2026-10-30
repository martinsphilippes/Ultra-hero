// Admin de marcas, produtos e Smart Tags (0062): validação pura do que vai para as RPCs (o banco
// confere tudo de novo). Testada em tests/unit/brands.test.ts.
import { clampPct, isLabelSide, type LabelSide } from "./geometry";
import { isRelationship, parseExternalUrl, parseImageUrl, parsePriceInput, type Relationship } from "./index";

export const BRAND_STATUSES = ["active", "inactive"] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];
export const MAX_CREATOR_BRANDS = 12;
export const MAX_CONTENT_LINKS = 8;
export const MAX_PROGRAM_PRODUCTS = 8;
export const MAX_SMART_TAGS = 8;
export const PRODUCT_DESCRIPTION_MAX = 280;
export const PROGRAM_NOTE_MAX = 160;

export type AdminError = "invalid_input" | "invalid_url" | "invalid_image" | "too_many_items" | "duplicate_item";
type Out<T> = { ok: true; value: T } | { ok: false; error: AdminError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isStatus = (v: unknown): v is BrandStatus => v === "active" || v === "inactive";
const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** "Maré Surf Co." → "mare-surf-co" (mesma regra do banco: minúsculas, números e hífen, até 60). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export type BrandInput = { name: string; slug: string; site_url: string; logo_url: string | null; status: BrandStatus; default_relationship: Relationship; is_demo: boolean };

export function normalizeBrandInput(raw: Record<string, unknown>): Out<BrandInput> {
  const name = text(raw.name);
  if (name.length < 1 || name.length > 60) return { ok: false, error: "invalid_input" };
  const slug = slugify(text(raw.slug) || name);
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: "invalid_input" };
  const site = parseExternalUrl(raw.site_url);
  if (!site) return { ok: false, error: "invalid_url" };
  const logo = parseImageUrl(raw.logo_url);
  if (!logo.ok) return { ok: false, error: "invalid_image" };
  const status = raw.status ?? "active";
  const rel = raw.default_relationship ?? "mentioned";
  if (!isStatus(status) || !isRelationship(rel)) return { ok: false, error: "invalid_input" };
  return { ok: true, value: { name, slug, site_url: site, logo_url: logo.value, status, default_relationship: rel, is_demo: raw.is_demo === true } };
}

export type ProductInput = {
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

export function normalizeProductInput(raw: Record<string, unknown>): Out<ProductInput> {
  const brandId = typeof raw.brand_id === "string" && UUID.test(raw.brand_id) ? raw.brand_id.toLowerCase() : null;
  const name = text(raw.name);
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!brandId || name.length < 1 || name.length > 80 || description.length > PRODUCT_DESCRIPTION_MAX) return { ok: false, error: "invalid_input" };
  const url = parseExternalUrl(raw.external_url);
  if (!url) return { ok: false, error: "invalid_url" };
  const image = parseImageUrl(raw.image_url);
  if (!image.ok) return { ok: false, error: "invalid_image" };
  const price = typeof raw.price_cents === "number" ? (Number.isInteger(raw.price_cents) && raw.price_cents >= 0 ? raw.price_cents : undefined) : parsePriceInput(raw.price);
  if (price === undefined) return { ok: false, error: "invalid_input" };
  const status = raw.status ?? "active";
  if (!isStatus(status)) return { ok: false, error: "invalid_input" };
  return { ok: true, value: { brand_id: brandId, name, description, external_url: url, image_url: image.value, price_cents: price, currency: "BRL", status, is_demo: raw.is_demo === true } };
}

/** Lista ordenada de ligações (marca ou produto), sem repetir, até o limite. */
function normalizeList<T extends { id: string }>(items: readonly unknown[], max: number, map: (raw: Record<string, unknown>, id: string) => T | null): Out<T[]> {
  if (!Array.isArray(items)) return { ok: false, error: "invalid_input" };
  if (items.length > max) return { ok: false, error: "too_many_items" };
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid_input" };
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" && UUID.test(raw.id) ? raw.id.toLowerCase() : null;
    if (!id) return { ok: false, error: "invalid_input" };
    if (seen.has(id)) return { ok: false, error: "duplicate_item" };
    seen.add(id);
    const mapped = map(raw, id);
    if (!mapped) return { ok: false, error: "invalid_input" };
    out.push(mapped);
  }
  return { ok: true, value: out };
}

export type BrandLinkItem = { id: string; relationship: Relationship; status: BrandStatus };
export type ProductLinkItem = { id: string; status: BrandStatus; note: string };

export function normalizeBrandLinks(items: readonly unknown[], max = MAX_CREATOR_BRANDS): Out<BrandLinkItem[]> {
  return normalizeList(items, max, (raw, id) => {
    const status = raw.status ?? "active";
    if (!isRelationship(raw.relationship) || !isStatus(status)) return null;
    return { id, relationship: raw.relationship, status };
  });
}

export function normalizeProductLinks(items: readonly unknown[], max = MAX_PROGRAM_PRODUCTS): Out<ProductLinkItem[]> {
  return normalizeList(items, max, (raw, id) => {
    const status = raw.status ?? "active";
    const note = text(raw.note);
    if (!isStatus(status) || note.length > PROGRAM_NOTE_MAX) return null;
    return { id, status, note };
  });
}

export type SmartTagInput = { brand_product_id: string; x_pct: number; y_pct: number; label_side: LabelSide; status: BrandStatus };

/** Marcações do editor → p_tags da RPC (até 8; posição arredondada a 2 casas, dentro de 0..100). */
export function normalizeSmartTags(items: readonly unknown[]): Out<SmartTagInput[]> {
  if (!Array.isArray(items)) return { ok: false, error: "invalid_input" };
  if (items.length > MAX_SMART_TAGS) return { ok: false, error: "too_many_items" };
  const out: SmartTagInput[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid_input" };
    const raw = item as Record<string, unknown>;
    const product = typeof raw.brand_product_id === "string" && UUID.test(raw.brand_product_id) ? raw.brand_product_id.toLowerCase() : null;
    const x = Number(raw.x_pct);
    const y = Number(raw.y_pct);
    const status = raw.status ?? "active";
    if (!product || !Number.isFinite(x) || !Number.isFinite(y) || !isLabelSide(raw.label_side) || !isStatus(status)) return { ok: false, error: "invalid_input" };
    out.push({ brand_product_id: product, x_pct: Math.round(clampPct(x) * 100) / 100, y_pct: Math.round(clampPct(y) * 100) / 100, label_side: raw.label_side, status });
  }
  return { ok: true, value: out };
}

/** Código de erro da RPC (mensagem do Postgres) → chave de adminOps.brands.errors. */
export const BRAND_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_url",
  "invalid_image",
  "duplicate_slug",
  "too_many_items",
  "duplicate_item",
  "invalid_brand",
  "invalid_product",
  "no_image",
  "invalid_input",
] as const;
export type BrandErrorCode = (typeof BRAND_ERROR_CODES)[number] | "generic" | "unavailable";

export function brandErrorCode(error: unknown): BrandErrorCode {
  if (typeof error === "string") return (BRAND_ERROR_CODES as readonly string[]).includes(error) ? (error as BrandErrorCode) : "generic";
  const raw = error as { code?: string; message?: string } | null;
  const code = raw?.code ?? "";
  if (["42P01", "PGRST205", "42883", "PGRST202"].includes(code)) return "unavailable";
  const message = raw?.message ?? "";
  return BRAND_ERROR_CODES.find((c) => message.includes(c)) ?? (code === "23505" ? "duplicate_slug" : "generic");
}
