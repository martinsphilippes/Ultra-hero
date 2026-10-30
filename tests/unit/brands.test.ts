import { describe, expect, it } from "vitest";
import { PORTAL_LINKS } from "@/components/layout/portal-nav";
import {
  buyHref,
  displayHost,
  fitLabelSide,
  formatBrandPrice,
  framePointToImagePct,
  isMissingBrandsSchema,
  mergeBrandChips,
  OUTBOUND_REL,
  parseBrandClick,
  parseExternalUrl,
  parseImageUrl,
  parsePriceInput,
  relationshipStyle,
  renderedImageBox,
  suggestLabelSide,
  tagFramePosition,
  toProductView,
  visibleSmartTags,
} from "@/lib/brands";
import { brandErrorCode, normalizeBrandInput, normalizeBrandLinks, normalizeProductInput, normalizeProductLinks, normalizeSmartTags, slugify } from "@/lib/brands/admin";
import { supportPlan } from "@/lib/programs/support";

// Marcas, produtos externos e Smart Tags (0062): posição em % da foto, links externos, rótulos de
// relação e o que o público vê.

const BRAND = { id: "11111111-1111-4111-8111-111111111111", slug: "volta-sports", name: "Volta Sports", logo_url: "/brands/volta-sports.svg", site_url: "https://example.com/volta", is_demo: true };
const PRODUCT = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Copo de treino",
  image_url: "/brands/products/volta-copo.svg",
  description: "Copo",
  external_url: "https://example.com/volta/copo",
  price_cents: 4990,
  currency: "BRL",
  is_demo: true,
  brand: BRAND,
};

describe("geometria das Smart Tags (cover/contain)", () => {
  it("contain: foto 4:5 num quadro 4:3 fica centralizada com sobras laterais", () => {
    const box = renderedImageBox({ width: 400, height: 300 }, { width: 1080, height: 1350 }, "contain");
    expect(box.height).toBeCloseTo(300);
    expect(box.width).toBeCloseTo(240);
    expect(box.left).toBeCloseTo(80);
    expect(box.top).toBeCloseTo(0);
  });

  it("cover: foto 4:5 num quadro 1:1 corta em cima e embaixo", () => {
    const box = renderedImageBox({ width: 400, height: 400 }, { width: 1080, height: 1350 }, "cover");
    expect(box.width).toBeCloseTo(400);
    expect(box.height).toBeCloseTo(500);
    expect(box.top).toBeCloseTo(-50);
  });

  it("ponto da foto vira % do quadro (contain) e o centro fica no centro", () => {
    const frame = { width: 400, height: 300 };
    const image = { width: 1080, height: 1350 };
    expect(tagFramePosition({ x: 50, y: 50 }, frame, image, "contain")).toEqual({ leftPct: 50, topPct: 50, visible: true });
    // canto esquerdo da foto = 80 px do quadro = 20%
    expect(tagFramePosition({ x: 0, y: 100 }, frame, image, "contain")).toEqual({ leftPct: 20, topPct: 100, visible: true });
  });

  it("cover: ponto na parte cortada fica invisível; sem o tamanho da foto, % direto", () => {
    const frame = { width: 400, height: 400 };
    const image = { width: 1080, height: 1350 };
    expect(tagFramePosition({ x: 50, y: 2 }, frame, image, "cover").visible).toBe(false);
    expect(tagFramePosition({ x: 50, y: 50 }, frame, image, "cover")).toEqual({ leftPct: 50, topPct: 50, visible: true });
    expect(tagFramePosition({ x: 30, y: 70 }, frame, null, "cover")).toEqual({ leftPct: 30, topPct: 70, visible: true });
  });

  it("mesma proporção (feed 4:5 com foto 4:5): % da foto = % do quadro", () => {
    const pos = tagFramePosition({ x: 66, y: 68 }, { width: 390, height: 487.5 }, { width: 1080, height: 1350 }, "cover");
    expect(pos.leftPct).toBeCloseTo(66);
    expect(pos.topPct).toBeCloseTo(68);
  });

  it("clique do admin volta para % da foto (ida e volta) e clique na sobra do contain é ignorado", () => {
    const frame = { width: 400, height: 300 };
    const image = { width: 1080, height: 1350 };
    const pos = tagFramePosition({ x: 37.5, y: 61.25 }, frame, image, "contain");
    const back = framePointToImagePct({ x: (pos.leftPct / 100) * 400, y: (pos.topPct / 100) * 300 }, frame, image, "contain");
    expect(back).toEqual({ x: 37.5, y: 61.25 });
    expect(framePointToImagePct({ x: 10, y: 150 }, frame, image, "contain")).toBeNull();
    expect(framePointToImagePct({ x: 200, y: 150 }, { width: 0, height: 0 }, image, "contain")).toBeNull();
  });

  it("rótulo vira para dentro quando o ponto está colado na borda", () => {
    expect(fitLabelSide("right", { leftPct: 90, topPct: 50 })).toBe("left");
    expect(fitLabelSide("left", { leftPct: 10, topPct: 50 })).toBe("right");
    expect(fitLabelSide("top", { leftPct: 50, topPct: 5 })).toBe("bottom");
    expect(fitLabelSide("bottom", { leftPct: 50, topPct: 95 })).toBe("top");
    expect(fitLabelSide("right", { leftPct: 40, topPct: 50 })).toBe("right");
    expect(suggestLabelSide({ x: 80, y: 10 })).toBe("left");
    expect(suggestLabelSide({ x: 20, y: 10 })).toBe("right");
  });
});

describe("links externos", () => {
  it("aceita só https com domínio, sem usuário/senha nem espaço", () => {
    expect(parseExternalUrl("https://example.com/volta/copo?x=1#a")).toBe("https://example.com/volta/copo?x=1#a");
    expect(parseExternalUrl("  https://shop.example.com.br  ")).toBe("https://shop.example.com.br");
    expect(parseExternalUrl("http://example.com")).toBeNull();
    expect(parseExternalUrl("javascript:alert(1)")).toBeNull();
    expect(parseExternalUrl("https://localhost/x")).toBeNull();
    expect(parseExternalUrl("https://user:pw@example.com")).toBeNull();
    expect(parseExternalUrl("https://exa mple.com")).toBeNull();
    expect(parseExternalUrl("https://example.com/<script>")).toBeNull();
    expect(parseExternalUrl(`https://example.com/${"a".repeat(500)}`)).toBeNull();
    expect(parseExternalUrl(42)).toBeNull();
  });

  it("imagem: arquivo do site em /brands, https ou vazio", () => {
    expect(parseImageUrl("/brands/products/volta-copo.svg")).toEqual({ ok: true, value: "/brands/products/volta-copo.svg" });
    expect(parseImageUrl("https://abc.supabase.co/storage/v1/object/public/brand-media/a.webp").ok).toBe(true);
    expect(parseImageUrl("")).toEqual({ ok: true, value: null });
    expect(parseImageUrl(null)).toEqual({ ok: true, value: null });
    expect(parseImageUrl("/brands/../etc/passwd").ok).toBe(false);
    expect(parseImageUrl("/placeholders/x.svg").ok).toBe(false);
    expect(parseImageUrl("data:image/svg+xml,<svg>").ok).toBe(false);
  });

  it("Comprar vai ao produto; sem link do produto, ao site da marca; rel marca o link como comercial", () => {
    expect(buyHref({ external_url: "https://example.com/p" }, { site_url: "https://example.com" })).toBe("https://example.com/p");
    expect(buyHref({ external_url: "ftp://x" }, { site_url: "https://example.com" })).toBe("https://example.com");
    expect(buyHref({ external_url: null }, { site_url: null })).toBeNull();
    expect(OUTBOUND_REL).toBe("noopener noreferrer sponsored");
    expect(displayHost("https://www.example.com/a")).toBe("example.com");
  });
});

describe("relação e faixa de marcas", () => {
  it("cada relação tem rótulo e estilo próprios", () => {
    expect(relationshipStyle("sponsor")).toEqual({ labelKey: "relationship.sponsor", tone: "solid" });
    expect(relationshipStyle("mentioned")).toEqual({ labelKey: "relationship.mentioned", tone: "outline" });
    expect(relationshipStyle("identified")).toEqual({ labelKey: "relationship.identified", tone: "dashed" });
  });

  it("junta conteúdo + herói sem repetir marca, patrocinador primeiro, e descarta marca fora do ar ou relação estranha", () => {
    const b = (id: string, extra: Record<string, unknown> = {}) => ({ ...BRAND, id, name: id, ...extra });
    const chips = mergeBrandChips(
      [
        { relationship: "identified", brand: b("a") },
        { relationship: "mentioned", brand: b("b") },
      ],
      [
        { relationship: "sponsor", brand: b("a") },
        { relationship: "sponsor", brand: b("c") },
        { relationship: "sponsor", brand: b("d", { status: "inactive" }) },
        { relationship: "parceiro", brand: b("e") },
        { relationship: "mentioned", brand: b("f", { site_url: "http://inseguro.com" }) },
      ],
    );
    expect(chips.map((c) => [c.id, c.relationship])).toEqual([
      ["c", "sponsor"],
      ["b", "mentioned"],
      ["a", "identified"],
    ]);
  });
});

describe("o que aparece (gating)", () => {
  const cover = "/content/foto.webp";
  const tag = (extra: Record<string, unknown> = {}) => ({ id: "t1", x_pct: 40, y_pct: 60, label_side: "left", media_url: cover, product: PRODUCT, ...extra });

  it("marcação só aparece com produto/marca válidos e na mesma foto da marcação", () => {
    expect(visibleSmartTags([tag()], cover)).toHaveLength(1);
    expect(visibleSmartTags([tag({ media_url: "/content/outra.webp" })], cover)).toEqual([]);
    expect(visibleSmartTags([tag({ media_url: null })], cover)).toHaveLength(1);
    expect(visibleSmartTags([tag({ product: { ...PRODUCT, status: "inactive" } })], cover)).toEqual([]);
    expect(visibleSmartTags([tag({ product: { ...PRODUCT, brand: { ...BRAND, status: "inactive" } } })], cover)).toEqual([]);
    expect(visibleSmartTags([tag({ x_pct: 120 })], cover)).toEqual([]);
    expect(visibleSmartTags([tag()], null)).toEqual([]);
    expect(visibleSmartTags([tag({ label_side: "diagonal" })], cover)[0].side).toBe("right");
  });

  it("no máximo 8 marcações por foto", () => {
    const rows = Array.from({ length: 12 }, (_, i) => tag({ id: `t${i}` }));
    expect(visibleSmartTags(rows, cover)).toHaveLength(8);
  });

  it("produto sem link https não vira card; preço só quando informado", () => {
    expect(toProductView({ ...PRODUCT, external_url: "http://x.com" })).toBeNull();
    expect(toProductView({ ...PRODUCT, price_cents: -1 })?.price_cents).toBeNull();
    expect(formatBrandPrice(4990, "BRL", "pt-BR")).toMatch(/49,90/);
    expect(formatBrandPrice(null, "BRL", "pt-BR")).toBeNull();
  });

  it("equipamentos de marca aparecem no card Apoio mesmo sem comércio e no app das lojas", () => {
    expect(supportPlan({ products: 0, professionals: 0, commerceEnabled: false, nativeApp: true, equipment: 2 }).apoioScreens).toEqual(["equipment"]);
    expect(supportPlan({ products: 2, professionals: 1, commerceEnabled: true, nativeApp: false, equipment: 1 }).apoioScreens).toEqual(["products", "equipment", "professionals"]);
    // Próximos passos continua só com produto da loja/profissional
    expect(supportPlan({ products: 0, professionals: 0, commerceEnabled: true, nativeApp: false, equipment: 3 }).showActions).toBe(false);
    expect(supportPlan({ products: 0, professionals: 0, commerceEnabled: true, nativeApp: false }).apoioScreens).toEqual([]);
  });

  it("banco sem a 0062 é reconhecido (vitrine some sem quebrar)", () => {
    expect(isMissingBrandsSchema({ code: "PGRST205" })).toBe(true);
    expect(isMissingBrandsSchema({ code: "42P01" })).toBe(true);
    expect(isMissingBrandsSchema({ code: "42501" })).toBe(false);
    expect(isMissingBrandsSchema(null)).toBe(false);
  });
});

describe("clique para fora (contador agregado)", () => {
  it("aceita só alvo/origem conhecidos e uuid", () => {
    expect(parseBrandClick({ kind: "product", id: PRODUCT.id.toUpperCase(), source: "tag" })).toEqual({ kind: "product", id: PRODUCT.id, source: "tag" });
    expect(parseBrandClick({ kind: "user", id: PRODUCT.id, source: "tag" })).toBeNull();
    expect(parseBrandClick({ kind: "brand", id: "x", source: "strip" })).toBeNull();
    expect(parseBrandClick({ kind: "brand", id: BRAND.id, source: "email" })).toBeNull();
    expect(parseBrandClick(null)).toBeNull();
  });
});

describe("admin: validação antes da RPC", () => {
  it("marca: slug a partir do nome, site https, logo válido", () => {
    expect(slugify("Maré Surf Co.")).toBe("mare-surf-co");
    const ok = normalizeBrandInput({ name: " Maré  Surf Co. ", site_url: "https://example.com/mare", logo_url: "", default_relationship: "identified", is_demo: true });
    expect(ok).toEqual({ ok: true, value: { name: "Maré Surf Co.", slug: "mare-surf-co", site_url: "https://example.com/mare", logo_url: null, status: "active", default_relationship: "identified", is_demo: true } });
    expect(normalizeBrandInput({ name: "X", site_url: "http://example.com" })).toEqual({ ok: false, error: "invalid_url" });
    expect(normalizeBrandInput({ name: "X", site_url: "https://example.com", logo_url: "ftp://a" })).toEqual({ ok: false, error: "invalid_image" });
    expect(normalizeBrandInput({ name: "", site_url: "https://example.com" })).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeBrandInput({ name: "X", site_url: "https://example.com", default_relationship: "parceiro" })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("produto: link https obrigatório e preço opcional em reais", () => {
    const base = { brand_id: BRAND.id, name: "Copo", external_url: "https://example.com/copo" };
    expect(normalizeProductInput({ ...base, price: "129,90" })).toMatchObject({ ok: true, value: { price_cents: 12990, currency: "BRL", status: "active" } });
    expect(normalizeProductInput({ ...base, price: "" })).toMatchObject({ ok: true, value: { price_cents: null } });
    expect(normalizeProductInput({ ...base, price: "12,999" })).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeProductInput({ ...base, external_url: "www.example.com" })).toEqual({ ok: false, error: "invalid_url" });
    expect(normalizeProductInput({ ...base, description: "a".repeat(281) })).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeProductInput({ ...base, brand_id: "nope" })).toEqual({ ok: false, error: "invalid_input" });
    expect(parsePriceInput("0")).toBe(0);
    expect(parsePriceInput("abc")).toBeUndefined();
  });

  it("listas: sem repetir, dentro do limite, relação conhecida", () => {
    expect(normalizeBrandLinks([{ id: BRAND.id, relationship: "sponsor" }])).toEqual({ ok: true, value: [{ id: BRAND.id, relationship: "sponsor", status: "active" }] });
    expect(normalizeBrandLinks([{ id: BRAND.id, relationship: "sponsor" }, { id: BRAND.id, relationship: "mentioned" }])).toEqual({ ok: false, error: "duplicate_item" });
    expect(normalizeBrandLinks([{ id: BRAND.id, relationship: "x" }])).toEqual({ ok: false, error: "invalid_input" });
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, status: "active" }));
    expect(normalizeProductLinks(many, 8)).toEqual({ ok: false, error: "too_many_items" });
    expect(normalizeProductLinks([{ id: PRODUCT.id, note: "a".repeat(161) }])).toEqual({ ok: false, error: "invalid_input" });
  });

  it("Smart Tags: posição presa em 0..100 com 2 casas, lado conhecido, até 8", () => {
    expect(normalizeSmartTags([{ brand_product_id: PRODUCT.id, x_pct: 104, y_pct: 33.3333, label_side: "top" }])).toEqual({
      ok: true,
      value: [{ brand_product_id: PRODUCT.id, x_pct: 100, y_pct: 33.33, label_side: "top", status: "active" }],
    });
    expect(normalizeSmartTags([{ brand_product_id: PRODUCT.id, x_pct: 1, y_pct: 1, label_side: "diagonal" }])).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeSmartTags(Array.from({ length: 9 }, () => ({ brand_product_id: PRODUCT.id, x_pct: 1, y_pct: 1, label_side: "left" })))).toEqual({ ok: false, error: "too_many_items" });
  });

  it("erro da RPC vira chave traduzível; banco sem a 0062 vira 'unavailable'", () => {
    expect(brandErrorCode({ message: "invalid_url" })).toBe("invalid_url");
    expect(brandErrorCode({ code: "23505", message: "duplicate key" })).toBe("duplicate_slug");
    expect(brandErrorCode({ code: "PGRST202", message: "x" })).toBe("unavailable");
    expect(brandErrorCode("too_many_items")).toBe("too_many_items");
    expect(brandErrorCode("??")).toBe("generic");
  });

  it("menu do admin tem Marcas e produtos", () => {
    expect(PORTAL_LINKS.admin.find((l) => l.key === "brands")?.href).toBe("/admin/marcas");
  });
});
