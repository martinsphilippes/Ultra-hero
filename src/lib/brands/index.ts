// Marcas, produtos externos e Smart Tags (0062). Regras puras (sem Supabase/React): links externos,
// tipos de relação, o que aparece para o público e o formato das linhas lidas do banco.
import { isLabelSide, type LabelSide } from "./geometry";
import { isMissingSchema } from "@/lib/supabase/helpers";

export * from "./geometry";

// ---------------------------------------------------------------- relação herói/conteúdo ↔ marca
export const RELATIONSHIPS = ["sponsor", "mentioned", "identified"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export function isRelationship(value: unknown): value is Relationship {
  return typeof value === "string" && (RELATIONSHIPS as readonly string[]).includes(value);
}

/** Ordem na faixa de marcas: patrocinador primeiro, depois citada, depois identificada. */
export const RELATIONSHIP_RANK: Record<Relationship, number> = { sponsor: 0, mentioned: 1, identified: 2 };

/** Chave do texto (namespace brands.relationship) e estilo visual de cada relação. */
export function relationshipStyle(rel: Relationship): { labelKey: `relationship.${Relationship}`; tone: "solid" | "outline" | "dashed" } {
  return { labelKey: `relationship.${rel}`, tone: rel === "sponsor" ? "solid" : rel === "mentioned" ? "outline" : "dashed" };
}

// ---------------------------------------------------------------- links externos
export const EXTERNAL_URL_MAX = 500;
const HOST_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

/**
 * Link externo aceito (mesma regra de brand_https_url_ok no banco): só https, host com domínio,
 * sem usuário/senha, sem espaço, até 500 caracteres. Devolve a URL normalizada ou null.
 */
export function parseExternalUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > EXTERNAL_URL_MAX || /[\s<>"]/.test(raw)) return null;
  if (!/^https:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const labels = url.hostname.split(".");
  if (labels.length < 2 || !labels.every((l) => HOST_LABEL.test(l))) return null;
  // o banco confere o texto como veio: o original (sem espaços nas pontas) precisa casar a mesma regra
  if (!/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{2,5})?([/?#]|$)/.test(raw)) return null;
  return raw;
}

/** Imagem/logo aceita: arquivo do site (/brands/...) ou link https; vazio = sem imagem. */
export function parseImageUrl(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false };
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  if (/^\/brands\/[a-z0-9][a-z0-9/_-]{0,80}\.(svg|png|webp|jpg)$/.test(raw)) return { ok: true, value: raw };
  const url = parseExternalUrl(raw);
  return url ? { ok: true, value: url } : { ok: false };
}

/** Destino de "Comprar no site da marca": o link do produto; sem ele, o site da marca. */
export function buyHref(product: { external_url: string | null }, brand: { site_url: string | null }): string | null {
  return parseExternalUrl(product.external_url) ?? parseExternalUrl(brand.site_url);
}

/** rel dos links para fora: nova aba, sem acesso à janela de origem, marcado como comercial. */
export const OUTBOUND_REL = "noopener noreferrer sponsored";

/** Domínio para mostrar ao lado do botão (ex.: "example.com"). */
export function displayHost(url: string | null | undefined): string | null {
  const parsed = parseExternalUrl(url);
  if (!parsed) return null;
  return new URL(parsed).hostname.replace(/^www\./, "");
}

// ---------------------------------------------------------------- preço (informativo)
/** Preço só quando o admin informou; o site da marca é quem manda (nota "sujeito a alteração"). */
export function formatBrandPrice(cents: number | null | undefined, currency: string | null | undefined, locale: string): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents < 0) return null;
  const code = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "BRL";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return null;
  }
}

/** "129,90" ou "129.90" → 12990; vazio → null; inválido → undefined. */
export function parsePriceInput(input: unknown): number | null | undefined {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(raw)) return undefined;
  return Math.round(Number(raw.replace(",", ".")) * 100);
}

// ---------------------------------------------------------------- formato das linhas (públicas)
export type BrandView = { id: string; slug: string; name: string; logo_url: string | null; site_url: string; is_demo: boolean };
export type BrandChipView = BrandView & { relationship: Relationship };
export type BrandProductView = {
  id: string;
  name: string;
  image_url: string | null;
  description: string;
  external_url: string;
  price_cents: number | null;
  currency: string;
  is_demo: boolean;
  brand: BrandView;
};
export type SmartTagView = { id: string; x: number; y: number; side: LabelSide; product: BrandProductView };
export type RecommendedProductView = BrandProductView & { note: string };

type RawBrand = { id?: unknown; slug?: unknown; name?: unknown; logo_url?: unknown; site_url?: unknown; is_demo?: unknown; status?: unknown } | null | undefined;
type RawProduct = {
  id?: unknown;
  status?: unknown;
  name?: unknown;
  image_url?: unknown;
  description?: unknown;
  external_url?: unknown;
  price_cents?: unknown;
  currency?: unknown;
  is_demo?: unknown;
  brand?: RawBrand;
} | null | undefined;

const str = (v: unknown) => (typeof v === "string" ? v : null);

// status presente e diferente de "active" = fora do ar (o admin lê tudo pela RLS; a página mostra o
// mesmo que o público)
export function toBrandView(raw: RawBrand): BrandView | null {
  if (!raw || (raw.status !== undefined && raw.status !== "active")) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const site = parseExternalUrl(raw.site_url);
  if (!id || !name || !site) return null;
  const logo = parseImageUrl(raw.logo_url);
  return { id, slug: str(raw.slug) ?? "", name, logo_url: logo.ok ? logo.value : null, site_url: site, is_demo: raw.is_demo === true };
}

/** Produto completo (com marca) ou null quando falta algo essencial (a RLS já tirou o inativo). */
export function toProductView(raw: RawProduct): BrandProductView | null {
  if (!raw || (raw.status !== undefined && raw.status !== "active")) return null;
  const brand = toBrandView(raw.brand);
  const id = str(raw.id);
  const name = str(raw.name);
  const url = parseExternalUrl(raw.external_url);
  if (!brand || !id || !name || !url) return null;
  const image = parseImageUrl(raw.image_url);
  const price = typeof raw.price_cents === "number" && Number.isInteger(raw.price_cents) && raw.price_cents >= 0 ? raw.price_cents : null;
  return {
    id,
    name,
    image_url: image.ok ? image.value : null,
    description: str(raw.description) ?? "",
    external_url: url,
    price_cents: price,
    currency: str(raw.currency) ?? "BRL",
    is_demo: raw.is_demo === true,
    brand,
  };
}

// ---------------------------------------------------------------- gating (o que aparece)
export type RawTag = { id?: unknown; x_pct?: unknown; y_pct?: unknown; label_side?: unknown; media_url?: unknown; product?: RawProduct };

/**
 * Marcações que aparecem sobre a foto: só com produto/marca válidos e só se a foto ainda é a mesma
 * da marcação (foto trocada = marcação escondida até o admin revisar). Ordem preservada, até 8.
 */
export function visibleSmartTags(rows: readonly RawTag[] | null | undefined, currentImage: string | null | undefined): SmartTagView[] {
  if (!rows || !currentImage) return [];
  const out: SmartTagView[] = [];
  for (const row of rows) {
    const media = str(row.media_url);
    if (media && media !== currentImage) continue;
    const x = Number(row.x_pct);
    const y = Number(row.y_pct);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) continue;
    const product = toProductView(row.product);
    const id = str(row.id);
    if (!product || !id) continue;
    out.push({ id, x, y, side: isLabelSide(row.label_side) ? row.label_side : "right", product });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Faixa de marcas do herói/conteúdo: junta as listas (a primeira que cita a marca define a relação),
 * sem repetir marca, ordenada por relação (patrocinador primeiro) e mantendo a ordem do admin.
 */
export function mergeBrandChips(...lists: readonly (readonly { relationship: unknown; brand: RawBrand }[] | null | undefined)[]): BrandChipView[] {
  const seen = new Map<string, { chip: BrandChipView; order: number }>();
  let order = 0;
  for (const list of lists) {
    for (const row of list ?? []) {
      const brand = toBrandView(row.brand);
      if (!brand || !isRelationship(row.relationship) || seen.has(brand.id)) continue;
      seen.set(brand.id, { chip: { ...brand, relationship: row.relationship }, order: order++ });
    }
  }
  return [...seen.values()]
    .sort((a, b) => RELATIONSHIP_RANK[a.chip.relationship] - RELATIONSHIP_RANK[b.chip.relationship] || a.order - b.order)
    .map((v) => v.chip);
}

// ---------------------------------------------------------------- clique (contador agregado)
export const CLICK_SOURCES = ["strip", "tag", "card", "recommended"] as const;
export type ClickSource = (typeof CLICK_SOURCES)[number];
export type BrandClick = { kind: "brand" | "product"; id: string; source: ClickSource };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Corpo do POST /api/brand-clicks; qualquer coisa fora do formato é ignorada. */
export function parseBrandClick(body: unknown): BrandClick | null {
  if (!body || typeof body !== "object") return null;
  const { kind, id, source } = body as Record<string, unknown>;
  if (kind !== "brand" && kind !== "product") return null;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (typeof source !== "string" || !(CLICK_SOURCES as readonly string[]).includes(source)) return null;
  return { kind, id: id.toLowerCase(), source: source as ClickSource };
}

// ---------------------------------------------------------------- erros de schema
/** Banco sem a 0062 (tabela/função ausente): a vitrine some sem quebrar a página. */
export function isMissingBrandsSchema(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return isMissingSchema(error);
}
