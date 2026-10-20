import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveContentAction } from "@/app/admin/content-actions";
import type { ContentFormValues } from "@/components/editors/types";
import {
  FORBIDDEN_CLAIMS,
  PRODUCT_IMAGES,
  centsToPriceInput,
  createProductSchema,
  emptyProductValues,
  findForbiddenClaim,
  flattenProductIssues,
  parsePriceToCents,
} from "@/components/editors/product/schema";
import {
  CONTENT_TYPE_VALUES,
  SAME_ORIGIN_PATH,
  bodyHasSubstance,
  bodyKindFor,
  bodySchema,
  contentChecklist,
  emptyBody,
  mediaSchema,
  normalizeBody,
  parseContentForm,
  toFormValues,
  type ContentTypeValue,
} from "@/components/editors/content/schema";
import * as mediaParsers from "@/components/editors/content/media";
import * as embedParsers from "@/lib/video/providers/embed";

const SELLER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const CATEGORY = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const FOOD_CATEGORY = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const MODULE = "9c5b94b1-35ad-49bb-b118-8e8fc24abf80";
const YOUTUBE_ID = "dQw4w9WgXcQ";

// saveContentAction (server action do admin) roda sem Next nem Supabase: traduções viram
// "<namespace>.<chave>" e as escritas no banco ficam registradas em `server.writes`.
const server = vi.hoisted(() => ({
  NEW_CONTENT_ID: "5d1f3a2e-8c4b-4e6f-9a7d-2b3c4d5e6f70",
  clientCreated: 0,
  writes: [] as { table: string; op: "insert" | "update" | "upsert"; payload: Record<string, unknown> }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }),
  hasRole: async () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    server.clientCreated++;
    return {
      from: (table: string) => ({
        update: (payload: Record<string, unknown>) => {
          server.writes.push({ table, op: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
        insert: (payload: Record<string, unknown>) => {
          server.writes.push({ table, op: "insert", payload });
          return { select: () => ({ single: async () => ({ data: { id: server.NEW_CONTENT_ID }, error: null }) }) };
        },
        upsert: async (payload: Record<string, unknown>) => {
          server.writes.push({ table, op: "upsert", payload });
          return { error: null };
        },
      }),
    };
  },
}));

// ============================================================== produto

function validProduct(overrides: Record<string, unknown> = {}) {
  return {
    seller_org_id: SELLER,
    category_id: CATEGORY,
    title: "Pasta de amendoim integral",
    description: "Pasta de amendoim 100% integral, sem açúcar adicionado.",
    image_url: PRODUCT_IMAGES[1],
    price_cents_demo: 2990,
    product_type: "physical",
    attributes: { peso_g: 500, vegano: true, sabores: ["tradicional", "cacau"], origem: "MG" },
    food_info: null,
    status: "draft",
    availability: "available",
    demo_stock: 12,
    ...overrides,
  };
}

const validFoodInfo = { ingredients: ["amendoim torrado"], allergens: ["amendoim"], storage: "Local seco e arejado." };

const productSchema = createProductSchema({ isFoodCategory: (id) => id === FOOD_CATEGORY });

function productErrors(input: unknown): Record<string, string> {
  const result = productSchema.safeParse(input);
  return result.success ? {} : flattenProductIssues(result.error);
}

describe("findForbiddenClaim", () => {
  it("detecta alegações ignorando maiúsculas e acentos", () => {
    expect(findForbiddenClaim("Chá MILAGROSO para o dia a dia")).toBe("milagroso");
    expect(findForbiddenClaim("Fórmula sem contraindicação")).toBe("sem contraindicacao");
    expect(findForbiddenClaim("Aprovado pela ANVISA")).toBe("aprovado pela anvisa");
    expect(findForbiddenClaim("¡Quema grasa rápido!")).toBe("quema grasa");
    expect(findForbiddenClaim("Burns Fat while you sleep")).toBe("burns fat");
  });

  it("devolve o termo canônico da lista, não o trecho digitado", () => {
    const found = findForbiddenClaim("SEM CONTRAINDICAÇÃO");
    expect(found).not.toBeNull();
    expect(FORBIDDEN_CLAIMS).toContain(found);
  });

  it("respeita limite de palavra (não pega 'cura' dentro de 'procura')", () => {
    expect(findForbiddenClaim("Procura um lanche prático?")).toBeNull();
    expect(findForbiddenClaim("Curadoria de grãos especiais")).toBeNull();
  });

  it("aceita pontuação e início/fim do texto como fronteira", () => {
    expect(findForbiddenClaim("Cura!")).toBe("cura");
    expect(findForbiddenClaim("Resultado (milagre) em dias")).toBe("milagre");
    expect(findForbiddenClaim("Produto 100% seguro.")).toBe("100% seguro");
  });

  it("texto comum ou vazio não tem alegação", () => {
    expect(findForbiddenClaim("Granola artesanal com castanhas e mel")).toBeNull();
    expect(findForbiddenClaim("")).toBeNull();
  });
});

describe("parsePriceToCents e centsToPriceInput", () => {
  it("aceita vírgula decimal (pt-BR), inclusive com uma casa", () => {
    expect(parsePriceToCents("29,90")).toBe(2990);
    expect(parsePriceToCents("29,9")).toBe(2990);
    expect(parsePriceToCents("0,29")).toBe(29); // 0.29 * 100 não é exato em ponto flutuante
    expect(parsePriceToCents("4,35")).toBe(435);
  });

  it("aceita ponto decimal", () => {
    expect(parsePriceToCents("29.90")).toBe(2990);
  });

  it("aceita milhar com ponto quando há vírgula decimal, com ou sem prefixo R$", () => {
    expect(parsePriceToCents("1.234,56")).toBe(123456);
    expect(parsePriceToCents("  R$ 1.234,56  ")).toBe(123456);
    expect(parsePriceToCents("1.234.567,89")).toBe(123456789);
  });

  it.each(["", "   ", "abc", "R$", ",", ".", "-", "1,2,3"])("entrada inválida %j vira NaN", (input) => {
    expect(Number.isNaN(parsePriceToCents(input))).toBe(true);
  });

  it("número negativo é convertido, mas o esquema do produto o rejeita", () => {
    const cents = parsePriceToCents("-5,00");
    expect(cents).toBe(-500);
    expect(productErrors(validProduct({ price_cents_demo: cents }))).toEqual({ price_cents_demo: "price_invalid" });
  });

  it("NaN (preço ilegível) é rejeitado pelo esquema com price_invalid", () => {
    expect(productErrors(validProduct({ price_cents_demo: parsePriceToCents("abc") }))).toEqual({ price_cents_demo: "price_invalid" });
  });

  it("centsToPriceInput usa vírgula, duas casas e nenhum separador de milhar", () => {
    expect(centsToPriceInput(2990)).toBe("29,90");
    expect(centsToPriceInput(5)).toBe("0,05");
    expect(centsToPriceInput(0)).toBe("0,00");
    expect(centsToPriceInput(123456)).toBe("1234,56");
  });

  it("ida e volta (centavos → texto → centavos) preserva o valor", () => {
    const samples = [...Array.from({ length: 20_001 }, (_, i) => i), 123_456, 9_999_999, 99_999_999, 100_000_000];
    const mismatches = samples.filter((cents) => parsePriceToCents(centsToPriceInput(cents)) !== cents);
    expect(mismatches).toEqual([]);
  });

  it("milhar pt-BR sem vírgula: '1.500' é R$ 1.500,00 (150000 centavos), não R$ 1,50", () => {
    expect(parsePriceToCents("1.500")).toBe(150_000);
    expect(parsePriceToCents("R$ 1.500")).toBe(150_000);
    expect(parsePriceToCents("29.900")).toBe(2_990_000);
    expect(parsePriceToCents("1.500.000")).toBe(150_000_000);
    expect(parsePriceToCents("1.234.567")).toBe(123_456_700);
    expect(parsePriceToCents("-1.500")).toBe(-150_000);
  });

  it("ponto com 1 ou 2 casas continua decimal; sem separador continua em reais", () => {
    expect(parsePriceToCents("29.90")).toBe(2990);
    expect(parsePriceToCents("29.9")).toBe(2990);
    expect(parsePriceToCents("0.29")).toBe(29);
    expect(parsePriceToCents("1500")).toBe(150_000);
    expect(parsePriceToCents("1.234,56")).toBe(123456);
  });

  // "0.500": R$ 0,50 ou R$ 500? Grupos malformados e 3+ casas com ponto também não têm leitura única.
  it.each(["0.500", "00.500", "1234.567", "1.2345", "1.234.56", "1.23.456", "12.34.567", "1.", ".5", "1..500"])(
    "ponto ambíguo ou malformado %j é rejeitado (NaN), nunca reinterpretado",
    (input) => {
      expect(Number.isNaN(parsePriceToCents(input))).toBe(true);
    },
  );

  // Mesma regra do ponto: 3+ dígitos depois da vírgula nunca são centavos. "1,500" seria R$ 1,50 (pt) ou
  // R$ 1.500 (en) e "1,500.00" (formato en) virava R$ 1,50 em silêncio; agora são rejeitados.
  it.each(["1,500", "29,999", "1,500.00", "12.34,56", "1.234,567", "0.500,00", "1,234,567", "1.23,45"])(
    "vírgula ambígua ou malformada %j é rejeitada (NaN), nunca arredondada ou reinterpretada",
    (input) => {
      expect(Number.isNaN(parsePriceToCents(input))).toBe(true);
    },
  );

  it("vírgula decimal pt-BR bem formada continua aceita", () => {
    expect(parsePriceToCents(",50")).toBe(50);
    expect(parsePriceToCents("1,")).toBe(100);
    expect(parsePriceToCents("1.000,5")).toBe(100_050);
    expect(parsePriceToCents("R$ 1.500,00")).toBe(150_000);
    expect(parsePriceToCents("1500,00")).toBe(150_000);
    expect(parsePriceToCents("-1.500,00")).toBe(-150_000);
  });

  it("'1.500' e '1.500,00' significam o mesmo valor (milhar pt-BR com ou sem centavos)", () => {
    expect(parsePriceToCents("1.500")).toBe(parsePriceToCents("1.500,00"));
    expect(parsePriceToCents("1.234.567")).toBe(parsePriceToCents("1.234.567,00"));
  });

  it("milhar convertido passa pelo esquema até o teto (R$ 1.000.000,00); acima dele, price_invalid", () => {
    expect(productErrors(validProduct({ price_cents_demo: parsePriceToCents("1.500") }))).toEqual({});
    expect(productErrors(validProduct({ price_cents_demo: parsePriceToCents("1.000.000") }))).toEqual({});
    expect(productErrors(validProduct({ price_cents_demo: parsePriceToCents("1.500.000") }))).toEqual({ price_cents_demo: "price_invalid" });
    expect(productErrors(validProduct({ price_cents_demo: parsePriceToCents("0.500") }))).toEqual({ price_cents_demo: "price_invalid" });
  });
});

describe("createProductSchema", () => {
  it("aceita produto válido e apara espaços de título e descrição", () => {
    const result = productSchema.safeParse(validProduct({ title: "  Pasta de amendoim  ", description: "  Pasta integral sem açúcar.  " }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("Pasta de amendoim");
    expect(result.data.description).toBe("Pasta integral sem açúcar.");
  });

  it("valores iniciais + vendedor, categoria, título e descrição formam um rascunho válido", () => {
    const values = { ...emptyProductValues(SELLER), category_id: CATEGORY, title: "Granola", description: "Granola artesanal crocante." };
    expect(productSchema.safeParse(values).success).toBe(true);
    expect(productErrors({ ...values, seller_org_id: emptyProductValues().seller_org_id })).toEqual({ seller_org_id: "seller_required" });
  });

  it("produto novo começa como rascunho (não publicado), sem estoque definido e com imagem da lista", () => {
    const values = emptyProductValues(SELLER);
    expect(values.status).toBe("draft");
    expect(values.demo_stock).toBeNull();
    expect(PRODUCT_IMAGES).toContain(values.image_url);
    // por ser rascunho, uma alegação ainda em edição não impede salvar
    const withClaim = { ...values, category_id: CATEGORY, title: "Chá milagroso", description: "Descrição em revisão." };
    expect(productErrors(withClaim)).toEqual({});
  });

  it("descrição: de 10 a 4000 caracteres, contados depois de aparar espaços", () => {
    expect(productErrors(validProduct({ description: "0123456789" }))).toEqual({});
    expect(productErrors(validProduct({ description: "   012345678   " }))).toEqual({ description: "description_length" });
    expect(productErrors(validProduct({ description: "d".repeat(4000) }))).toEqual({});
    expect(productErrors(validProduct({ description: "d".repeat(4001) }))).toEqual({ description: "description_length" });
  });

  it("estoque demonstrativo: zero é válido, negativo não", () => {
    expect(productErrors(validProduct({ demo_stock: 0 }))).toEqual({});
    expect(productErrors(validProduct({ demo_stock: -1 }))).toEqual({ demo_stock: "demo_stock_invalid" });
  });

  it("rejeita campos ausentes ou inválidos com chaves de tradução", () => {
    const errors = productErrors(
      validProduct({
        seller_org_id: undefined,
        category_id: "não-é-uuid",
        title: "  ab  ",
        description: "curta",
        image_url: "https://cdn.example.com/produto.png",
        price_cents_demo: 29.9,
        demo_stock: 1.5,
      }),
    );
    expect(errors).toEqual({
      seller_org_id: "seller_required",
      category_id: "category_required",
      title: "title_length",
      description: "description_length",
      image_url: "image_invalid",
      price_cents_demo: "price_invalid",
      demo_stock: "demo_stock_invalid",
    });
  });

  it("título: até 120 caracteres; preço: inteiro de 0 a 100.000.000; estoque: até 100.000", () => {
    expect(productErrors(validProduct({ title: "a".repeat(120), price_cents_demo: 100_000_000, demo_stock: 100_000 }))).toEqual({});
    expect(productErrors(validProduct({ title: "a".repeat(121), price_cents_demo: 100_000_001, demo_stock: 100_001 }))).toEqual({
      title: "title_length",
      price_cents_demo: "price_invalid",
      demo_stock: "demo_stock_invalid",
    });
    expect(productErrors(validProduct({ price_cents_demo: 0, demo_stock: null }))).toEqual({});
  });

  it("categoria alimentar exige ingredientes e modo de conservação", () => {
    expect(productErrors(validProduct({ category_id: FOOD_CATEGORY, food_info: null }))).toEqual({
      "food_info.ingredients": "food_info_required",
      "food_info.storage": "food_info_required",
    });
    expect(productErrors(validProduct({ category_id: FOOD_CATEGORY, food_info: { ingredients: [], allergens: [], storage: "   " } }))).toEqual({
      "food_info.ingredients": "food_info_required",
      "food_info.storage": "food_info_required",
    });
    expect(productErrors(validProduct({ category_id: FOOD_CATEGORY, food_info: validFoodInfo }))).toEqual({});
  });

  it("categoria não alimentar dispensa a ficha alimentar", () => {
    expect(productErrors(validProduct({ category_id: CATEGORY, food_info: null }))).toEqual({});
  });

  it("alegações proibidas só bloqueiam ao publicar", () => {
    const claim = { title: "Chá milagroso", description: "Queima gordura enquanto você dorme." };
    expect(productErrors(validProduct({ ...claim, status: "draft" }))).toEqual({});
    expect(productErrors(validProduct({ ...claim, status: "archived" }))).toEqual({});
    expect(productErrors(validProduct({ ...claim, status: "published" }))).toEqual({
      title: "forbidden_claim:milagroso",
      description: "forbidden_claim:queima gordura",
    });
  });

  it("atributos: aceita chaves snake_case e valores simples, rejeita objetos aninhados", () => {
    expect(productErrors(validProduct({ attributes: { peso_g: 500, sem_gluten: false, cores: ["azul"] } }))).toEqual({});
    expect(Object.keys(productErrors(validProduct({ attributes: { medidas: { altura: 10 } } })))).toEqual(["attributes.medidas"]);
  });

  it("atributos: chave fora do padrão é rejeitada no caminho attributes.<chave>", () => {
    expect(Object.keys(productErrors(validProduct({ attributes: { Cor: "azul" } })))).toEqual(["attributes.Cor"]);
    expect(Object.keys(productErrors(validProduct({ attributes: { ["a".repeat(33)]: 1 } })))).toEqual([`attributes.${"a".repeat(33)}`]);
  });

  it("atributos: chave inválida gera a chave de tradução attribute_key_invalid, não o texto em inglês do Zod", () => {
    const long = "a".repeat(33);
    expect(productErrors(validProduct({ attributes: { Cor: "azul" } }))).toEqual({ "attributes.Cor": "attribute_key_invalid" });
    expect(productErrors(validProduct({ attributes: { [long]: 1 } }))).toEqual({ [`attributes.${long}`]: "attribute_key_invalid" });
    expect(productErrors(validProduct({ attributes: { "peso-g": 500, peso_g: 500, "": true } }))).toEqual({
      "attributes.peso-g": "attribute_key_invalid",
      "attributes.": "attribute_key_invalid",
    });
    // chave inválida com valor também inválido: o erro reportado é o da chave
    expect(productErrors(validProduct({ attributes: { Medidas: { altura: 10 } } }))).toEqual({ "attributes.Medidas": "attribute_key_invalid" });
  });

  it("atributos: a chave attribute_key_invalid existe em commerce.productForm.errors nos três idiomas", () => {
    for (const locale of ["pt-BR", "en", "es"]) {
      const messages = JSON.parse(readFileSync(new URL(`../../messages/${locale}/commerce.json`, import.meta.url), "utf8"));
      expect(typeof messages.productForm.errors.attribute_key_invalid, locale).toBe("string");
    }
  });
});

describe("flattenProductIssues", () => {
  it("indexa por caminho com ponto, inclusive índices de lista", () => {
    const errors = productErrors(validProduct({ category_id: FOOD_CATEGORY, food_info: { ...validFoodInfo, ingredients: ["aveia", "   "] } }));
    expect(Object.keys(errors)).toEqual(["food_info.ingredients.1"]);
  });

  it("mantém só a primeira mensagem de cada campo", () => {
    // título longo demais E com alegação: o erro de tamanho (validação base) vem antes da blocklist
    const errors = productErrors(validProduct({ title: `Cura ${"x".repeat(120)}`, status: "published" }));
    expect(errors).toEqual({ title: "title_length" });
  });

  it("erro na raiz (entrada que não é objeto) vai para _form", () => {
    expect(Object.keys(productErrors(null))).toEqual(["_form"]);
  });
});

// ============================================================== conteúdo

function validVideoForm(overrides: Record<string, unknown> = {}) {
  return {
    title: "Mobilidade matinal",
    summary: "Sequência de 10 minutos para começar o dia.",
    pillar: "routine",
    type: "video",
    source_locale: "pt-BR",
    cover_url: "/placeholders/content-1.svg",
    duration_minutes: 10,
    difficulty: "beginner",
    tags: ["mobilidade", "manhã"],
    has_captions: true,
    disclaimer_kind: "training",
    body: { kind: "video", intro: "Solte o corpo.", key_points: ["Respire fundo"], transcript: [{ t: 0, text: "Olá!" }] },
    media: { provider: "embed_youtube", ref: `https://www.youtube.com/watch?v=${YOUTUBE_ID}`, captions_url: "" },
    ...overrides,
  };
}

const NO_MEDIA = { provider: "none", ref: null, captions_url: null };

const validBodies: Record<ContentTypeValue, Record<string, unknown>> = {
  video: { kind: "video", intro: "Intro", key_points: [], transcript: [] },
  recipe: {
    kind: "recipe",
    servings: 2,
    prep_minutes: 10,
    cook_minutes: null,
    ingredients: [{ item: "Aveia", qty: "40 g" }],
    steps: ["Misture tudo."],
    allergens: ["glúten"],
    note: "",
  },
  workout: {
    kind: "workout",
    equipment: ["halter"],
    blocks: [{ name: "Aquecimento", exercises: [{ name: "Agachamento", sets: 3, reps: "12", rest_seconds: 60 }] }],
    safety_note: "",
  },
  guide: { kind: "guide", intro: "", sections: [{ heading: "Hidratação", text: "Beba água ao longo do dia." }], key_points: [] },
  article: { kind: "article", intro: "", sections: [{ heading: "", text: "Texto do artigo." }], key_points: [] },
};

function contentErrors(input: unknown): Record<string, string> {
  const result = parseContentForm(input);
  return result.ok ? {} : result.errors;
}

const CONTENT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const CREATOR_ID = "a3bb189e-8bf9-3888-9912-ace4e6543002";

function asFormValues(values: Record<string, unknown>): ContentFormValues {
  return values as unknown as ContentFormValues;
}

function writesTo(table: string, op: "insert" | "update" | "upsert") {
  return server.writes.filter((w) => w.table === table && w.op === op).map((w) => w.payload);
}

describe("parseContentForm / contentFormSchema", () => {
  it("aceita vídeo válido e normaliza mídia, tags e legendas", () => {
    const result = parseContentForm(validVideoForm({ title: "  Mobilidade matinal  ", tags: ["mobilidade", "manhã", "mobilidade"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("Mobilidade matinal");
    expect(result.data.tags).toEqual(["mobilidade", "manhã"]);
    expect(result.data.media).toEqual({ provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: null });
  });

  it("Vimeo: guarda só o ID numérico extraído da URL do player", () => {
    const result = parseContentForm(validVideoForm({ media: { provider: "embed_vimeo", ref: "https://player.vimeo.com/video/76979871", captions_url: null } }));
    expect(result.ok && result.data.media).toEqual({ provider: "embed_vimeo", ref: "76979871", captions_url: null });
  });

  // Regressão: a cópia local de parseVimeoId gravava o primeiro número do caminho (ID do showcase/álbum),
  // que depois passava na reprodução como ID puro e tocava o vídeo errado.
  it.each([
    ["showcase", "https://vimeo.com/showcase/10234567/video/76979871"],
    ["álbum", "https://vimeo.com/album/10234567/video/76979871"],
  ])("Vimeo: URL de %s grava o ID do vídeo, não o do contêiner", (_label, ref) => {
    const result = parseContentForm(validVideoForm({ media: { provider: "embed_vimeo", ref, captions_url: null } }));
    expect(result.ok && result.data.media).toEqual({ provider: "embed_vimeo", ref: "76979871", captions_url: null });
  });

  it.each([
    ["dois números soltos", "https://vimeo.com/10234567/76979871"],
    ["showcase sem vídeo", "https://vimeo.com/showcase/10234567"],
    ["não listado com hash", "https://vimeo.com/76979871/a1b2c3d4e5"],
  ])("Vimeo: caminho fora dos formatos conhecidos (%s) é rejeitado, nunca 'chuta' um número", (_label, ref) => {
    expect(contentErrors(validVideoForm({ media: { provider: "embed_vimeo", ref, captions_url: null } }))).toEqual({ "media.ref": "invalidMediaRef" });
  });

  it("formulário e reprodução usam os mesmos parsers de mídia (sem cópia que possa divergir)", () => {
    expect(mediaParsers.parseVimeoId).toBe(embedParsers.parseVimeoId);
    expect(mediaParsers.parseYouTubeId).toBe(embedParsers.parseYouTubeId);
  });

  it.each(["recipe", "workout", "guide", "article"] as const)("aceita %s com corpo do tipo certo e sem mídia", (type) => {
    expect(contentErrors(validVideoForm({ type, body: validBodies[type], media: NO_MEDIA }))).toEqual({});
  });

  it("guia e artigo compartilham o editor (corpo 'guide' serve para artigo e vice-versa)", () => {
    expect(contentErrors(validVideoForm({ type: "article", body: validBodies.guide, media: NO_MEDIA }))).toEqual({});
    expect(contentErrors(validVideoForm({ type: "guide", body: validBodies.article, media: NO_MEDIA }))).toEqual({});
  });

  it("provedor 'none' descarta a referência e normaliza legendas vazias para null", () => {
    const result = parseContentForm(validVideoForm({ media: { provider: "none", ref: "qualquer-coisa", captions_url: "" } }));
    expect(result.ok && result.data.media).toEqual({ provider: "none", ref: null, captions_url: null });
  });

  it("título só com espaços é obrigatório", () => {
    expect(contentErrors(validVideoForm({ title: "   " }))).toEqual({ title: "required" });
  });

  it("rejeita corpo de outro tipo", () => {
    expect(contentErrors(validVideoForm({ body: validBodies.recipe }))).toEqual({ body: "bodyTypeMismatch" });
  });

  it("premium exige módulo; gratuito não", () => {
    expect(contentErrors(validVideoForm({ access_level: "premium", required_module_id: null }))).toEqual({ required_module_id: "moduleRequired" });
    expect(contentErrors(validVideoForm({ access_level: "premium", required_module_id: MODULE }))).toEqual({});
    expect(contentErrors(validVideoForm({ access_level: "free", required_module_id: null }))).toEqual({});
  });

  it("YouTube/Vimeo exigem referência válida do próprio provedor", () => {
    const media = (provider: string, ref: string | null) => validVideoForm({ media: { provider, ref, captions_url: null } });
    expect(contentErrors(media("embed_youtube", null))).toEqual({ "media.ref": "mediaRefRequired" });
    expect(contentErrors(media("embed_youtube", "   "))).toEqual({ "media.ref": "mediaRefRequired" });
    expect(contentErrors(media("embed_youtube", `https://evil.example.com/watch?v=${YOUTUBE_ID}`))).toEqual({ "media.ref": "invalidMediaRef" });
    expect(contentErrors(media("embed_youtube", "https://vimeo.com/76979871"))).toEqual({ "media.ref": "invalidMediaRef" });
    expect(contentErrors(media("embed_vimeo", `https://youtu.be/${YOUTUBE_ID}`))).toEqual({ "media.ref": "invalidMediaRef" });
  });

  it("legendas: só caminho da própria origem ou https", () => {
    const captions = (captions_url: string) => validVideoForm({ media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url } });
    expect(contentErrors(captions("/captions/pt-BR.vtt"))).toEqual({});
    expect(contentErrors(captions("https://cdn.example.com/legendas.vtt"))).toEqual({});
    for (const bad of ["http://cdn.example.com/legendas.vtt", "//cdn.example.com/legendas.vtt", "javascript:alert(1)"]) {
      expect(contentErrors(captions(bad))).toEqual({ "media.captions_url": "invalidUrl" });
    }
  });

  it("duração, tags e números fora dos limites geram chaves de erro", () => {
    expect(contentErrors(validVideoForm({ duration_minutes: 0 }))).toEqual({ duration_minutes: "invalidNumber" });
    expect(contentErrors(validVideoForm({ duration_minutes: 601 }))).toEqual({ duration_minutes: "invalidNumber" });
    expect(contentErrors(validVideoForm({ duration_minutes: 1.5 }))).toEqual({ duration_minutes: "invalidNumber" });
    expect(contentErrors(validVideoForm({ duration_minutes: 1 }))).toEqual({});
    expect(contentErrors(validVideoForm({ duration_minutes: 600 }))).toEqual({});
    expect(contentErrors(validVideoForm({ tags: Array.from({ length: 12 }, (_, i) => `tag${i}`) }))).toEqual({});
    expect(contentErrors(validVideoForm({ tags: Array.from({ length: 13 }, (_, i) => `tag${i}`) }))).toEqual({ tags: "tooMany" });
    expect(contentErrors(validVideoForm({ tags: ["ok", "  "] }))).toEqual({ "tags.1": "required" });
    expect(contentErrors(validVideoForm({ tags: ["x".repeat(31)] }))).toEqual({ "tags.0": "tooLong" });
  });

  it("erros do corpo são indexados pelo caminho completo", () => {
    const recipe = { ...validBodies.recipe, steps: ["Misture.", "   "], servings: 0 };
    expect(contentErrors(validVideoForm({ type: "recipe", body: recipe, media: NO_MEDIA }))).toEqual({
      "body.servings": "invalidNumber",
      "body.steps.1": "required",
    });
    const video = { kind: "video", intro: "", key_points: [], transcript: [{ t: -1, text: "Oi" }] };
    expect(contentErrors(validVideoForm({ body: video }))).toEqual({ "body.transcript.0.t": "invalidNumber" });
  });

  it("entrada que não é objeto vira erro 'form'", () => {
    const result = parseContentForm(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors)).toEqual(["form"]);
  });
});

describe("SAME_ORIGIN_PATH e capa", () => {
  it.each(["/placeholders/content-1.svg", "/", "/img/capa_01-final.png", "/a%20b.png"])("aceita caminho da própria origem %j", (path) => {
    expect(SAME_ORIGIN_PATH.test(path)).toBe(true);
  });

  it.each([
    "//evil.example.com/x.png",
    "https://evil.example.com/x.png",
    "http://localhost/x.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "placeholders/x.svg",
    "/\\evil.example.com/x.png",
    "/x.png?track=1",
    "/x y.png",
    "",
  ])("rejeita URL externa ou malformada %j", (path) => {
    expect(SAME_ORIGIN_PATH.test(path)).toBe(false);
  });

  it("capa vazia é permitida; capa externa ou protocolo-relativa é rejeitada", () => {
    expect(contentErrors(validVideoForm({ cover_url: "" }))).toEqual({});
    expect(contentErrors(validVideoForm({ cover_url: "https://images.example.com/capa.jpg" }))).toEqual({ cover_url: "invalidCover" });
    expect(contentErrors(validVideoForm({ cover_url: "//images.example.com/capa.jpg" }))).toEqual({ cover_url: "invalidCover" });
  });

  it("o servidor do admin (saveContentAction) também rejeita capa externa, sem tocar no banco", async () => {
    server.clientCreated = 0;
    server.writes.length = 0;
    for (const cover_url of ["https://images.example.com/capa.jpg", "//images.example.com/capa.jpg", "javascript:alert(1)"]) {
      const result = await saveContentAction({ id: CONTENT_ID, creatorId: CREATOR_ID }, asFormValues(validVideoForm({ cover_url })));
      expect(result).toEqual({ ok: false, error: "adminContent.errors.invalid_input" });
    }
    expect(server.clientCreated).toBe(0);
    expect(server.writes).toEqual([]);
  });
});

// ============================================================== server action do admin

describe("saveContentAction (admin) valida com o esquema compartilhado", () => {
  beforeEach(() => {
    server.clientCreated = 0;
    server.writes.length = 0;
  });

  const save = (values: Record<string, unknown>, context: { id?: string | null; creatorId?: string | null } = { id: CONTENT_ID, creatorId: CREATOR_ID }) =>
    saveContentAction(context, asFormValues(values));

  it.each<[string, Record<string, unknown>]>([
    ["capa externa", { cover_url: "https://images.example.com/capa.jpg" }],
    ["provedor não habilitado (mux)", { media: { provider: "mux", ref: "abc123", captions_url: null } }],
    ["provedor não habilitado (upload)", { media: { provider: "upload", ref: "uploads/video.mp4", captions_url: null } }],
    ["provedor não habilitado (cloudflare_stream)", { media: { provider: "cloudflare_stream", ref: "abc123", captions_url: null } }],
    ["ref do YouTube em host falso", { media: { provider: "embed_youtube", ref: `https://evil.example.com/watch?v=${YOUTUBE_ID}`, captions_url: null } }],
    ["ref do Vimeo apontando para o YouTube", { media: { provider: "embed_vimeo", ref: `https://youtu.be/${YOUTUBE_ID}`, captions_url: null } }],
    ["YouTube sem ref", { media: { provider: "embed_youtube", ref: null, captions_url: null } }],
    ["legenda javascript:", { media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: "javascript:alert(1)" } }],
    ["legenda http (sem TLS)", { media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: "http://cdn.example.com/legendas.vtt" } }],
    ["legenda protocolo-relativa", { media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: "//cdn.example.com/legendas.vtt" } }],
    ["corpo de outro tipo", { body: validBodies.recipe }],
    ["corpo livre sem a forma do tipo", { body: { kind: "video", html: "<script>alert(1)</script>" } }],
    ["tags demais", { tags: Array.from({ length: 13 }, (_, i) => `tag${i}`) }],
  ])("rejeita %s com invalid_input traduzido e sem tocar no banco", async (_label, overrides) => {
    expect(await save(validVideoForm(overrides))).toEqual({ ok: false, error: "adminContent.errors.invalid_input" });
    expect(server.clientCreated).toBe(0);
    expect(server.writes).toEqual([]);
  });

  it("contexto inválido (id ou personalidade que não são UUID) é rejeitado antes do banco", async () => {
    expect(await save(validVideoForm(), { id: "1; drop table content", creatorId: CREATOR_ID })).toEqual({ ok: false, error: "adminContent.errors.invalid_input" });
    expect(await save(validVideoForm(), { id: CONTENT_ID, creatorId: "x" })).toEqual({ ok: false, error: "adminContent.errors.invalid_input" });
    expect(server.writes).toEqual([]);
  });

  it("grava a referência de mídia já extraída (ID), nunca a URL colada, e legendas vazias como null", async () => {
    const result = await save(validVideoForm({ media: { provider: "embed_youtube", ref: `https://www.youtube.com/watch?v=${YOUTUBE_ID}&t=42`, captions_url: "" } }));
    expect(result).toEqual({ ok: true, id: CONTENT_ID, message: "adminContent.content.form.updated" });
    expect(writesTo("content_bodies", "upsert")).toEqual([
      {
        content_id: CONTENT_ID,
        body: { kind: "video", intro: "Solte o corpo.", key_points: ["Respire fundo"], transcript: [{ t: 0, text: "Olá!" }] },
        media_provider: "embed_youtube",
        media_ref: YOUTUBE_ID,
        captions_url: null,
      },
    ]);
  });

  it("URL de showcase do Vimeo é gravada com o ID do vídeo (o mesmo que o player usa), não o do showcase", async () => {
    const result = await save(validVideoForm({ media: { provider: "embed_vimeo", ref: "https://vimeo.com/showcase/10234567/video/76979871", captions_url: null } }));
    expect(result.ok).toBe(true);
    expect(writesTo("content_bodies", "upsert")[0]).toMatchObject({ media_provider: "embed_vimeo", media_ref: "76979871" });
  });

  it("grava os valores normalizados pelo esquema (título aparado, tags sem repetição, corpo sem campos extras)", async () => {
    const body = { ...validBodies.guide, html: "<b>extra</b>" };
    await save(validVideoForm({ type: "guide", title: "  Hidratação  ", tags: ["agua", "agua"], body, media: NO_MEDIA }));
    expect(writesTo("content", "update")[0]).toMatchObject({ title: "Hidratação", tags: ["agua"] });
    expect(writesTo("content_bodies", "upsert")[0]?.body).toEqual(validBodies.guide);
  });

  it("mantém os campos só do admin: acesso premium com módulo, modo de conclusão e troca de personalidade", async () => {
    const result = await save(validVideoForm({ access_level: "premium", required_module_id: MODULE, completion_mode: "auto" }));
    expect(result.ok).toBe(true);
    expect(writesTo("content", "update")).toEqual([
      expect.objectContaining({
        access_level: "premium",
        required_module_id: MODULE,
        completion_mode: "auto",
        creator_id: CREATOR_ID,
        cover_url: "/placeholders/content-1.svg",
      }),
    ]);
  });

  it("acesso gratuito descarta o módulo; campos de admin ausentes viram null", async () => {
    await save(validVideoForm({ access_level: "free", required_module_id: MODULE }));
    await save(validVideoForm());
    const [free, unset] = writesTo("content", "update");
    expect(free).toMatchObject({ access_level: "free", required_module_id: null, completion_mode: null });
    expect(unset).toMatchObject({ access_level: null, required_module_id: null, completion_mode: null });
  });

  it("premium sem módulo devolve a mensagem específica, sem tocar no banco", async () => {
    expect(await save(validVideoForm({ access_level: "premium", required_module_id: null }))).toEqual({
      ok: false,
      error: "adminContent.errors.premium_requires_module",
    });
    expect(server.writes).toEqual([]);
  });

  it("criação: insere rascunho da personalidade escolhida e grava o corpo no id novo", async () => {
    const result = await save(validVideoForm({ type: "recipe", body: validBodies.recipe, media: NO_MEDIA }), { id: null, creatorId: CREATOR_ID });
    expect(result).toEqual({ ok: true, id: server.NEW_CONTENT_ID, message: "adminContent.content.form.created" });
    expect(writesTo("content", "insert")).toEqual([expect.objectContaining({ creator_id: CREATOR_ID, status: "draft", review_status: "none", type: "recipe" })]);
    expect(writesTo("content_bodies", "upsert")).toEqual([expect.objectContaining({ content_id: server.NEW_CONTENT_ID, media_provider: "none", media_ref: null })]);
  });

  it("criação sem personalidade é rejeitada", async () => {
    expect(await save(validVideoForm(), { id: null, creatorId: null })).toEqual({ ok: false, error: "adminContent.errors.invalid_input" });
    expect(server.writes).toEqual([]);
  });
});

// ============================================================== seed (0008_seed.sql)
// O admin precisa conseguir salvar de novo QUALQUER conteúdo do seed. O teste lê as 40 linhas de
// `seed_content` e os corpos de receita do próprio SQL, reproduz seed_body() e seed_uuid() (md5 + versão/variante RFC 4122)
// e percorre o caminho real: página de edição → toFormValues → parseContentForm (cliente) →
// saveContentAction (servidor).

const SEED_SQL = readFileSync(new URL("../../supabase/migrations/0008_seed.sql", import.meta.url), "utf8");

type SqlValue = string | number | null;

/** Tuplas de um `insert into <tabela> values (...), (...);` (strings com '' escapado, números e null). */
function seedTuples(sql: string, header: string): SqlValue[][] {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`seed sem "${header}"`);
  const rows: SqlValue[][] = [];
  let row: SqlValue[] | null = null;
  let token = "";
  for (let i = start + header.length; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && row) {
      let text = "";
      for (i++; i < sql.length; i++) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          text += "'";
          i++;
        } else if (sql[i] === "'") break;
        else text += sql[i];
      }
      row.push(text);
    } else if (ch === "(") {
      row = [];
      token = "";
    } else if ((ch === "," || ch === ")") && row) {
      const raw = token.trim();
      if (raw) row.push(raw === "null" ? null : Number(raw));
      token = "";
      if (ch === ")") {
        rows.push(row);
        row = null;
      }
    } else if (ch === ";" && !row) break;
    else if (row) token += ch;
  }
  return rows;
}

/** Réplica de public.seed_uuid(p): md5('ultra-hero:' || p) com versão 4 e variante RFC 4122 (0008_seed.sql). */
function seedUuid(key: string): string {
  const h = createHash("md5").update(`ultra-hero:${key}`).digest("hex");
  const variant = "89ab"[parseInt(h[16], 16) % 4];
  const x = `${h.slice(0, 12)}4${h.slice(13, 16)}${variant}${h.slice(17)}`;
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Réplica de public.seed_body(type, title, summary). */
function seedBody(type: string, title: string, summary: string): Record<string, unknown> {
  switch (type) {
    case "video":
      return {
        kind: "video",
        demo: true,
        intro: summary,
        transcript: [
          { t: 0, text: `Olá! Neste vídeo de demonstração vamos falar sobre: ${title}.` },
          { t: 20, text: `Primeiro, o contexto: ${summary}` },
          { t: 60, text: "Agora, a prática: comece pequeno, repita amanhã e ajuste o que não funcionou." },
          { t: 110, text: "Lembrete: este conteúdo é educativo e não substitui orientação profissional individual." },
        ],
        key_points: ["Comece com o mínimo viável", "Consistência vence intensidade", "Ajuste à sua realidade"],
      };
    case "recipe":
      return {
        kind: "recipe",
        servings: 2,
        prep_minutes: 15,
        cook_minutes: 20,
        ingredients: [
          { item: "Ingrediente principal", qty: "300 g" },
          { item: "Legumes da estação", qty: "2 xícaras" },
          { item: "Azeite", qty: "1 colher de sopa" },
          { item: "Sal, pimenta e ervas", qty: "a gosto" },
        ],
        steps: [
          "Pré-aqueça o forno ou a frigideira.",
          "Tempere o ingrediente principal e deixe descansar 10 minutos.",
          "Cozinhe até dourar, virando uma vez.",
          "Finalize com ervas e sirva com os legumes.",
        ],
        allergens: [],
        note: "Receita demonstrativa. Quantidades ilustrativas.",
      };
    case "workout":
      return {
        kind: "workout",
        equipment: ["peso do corpo"],
        blocks: [
          {
            name: "Aquecimento",
            exercises: [
              { name: "Marcha no lugar", sets: 1, reps: "2 min", rest_seconds: 0 },
              { name: "Círculos de braço", sets: 1, reps: "10 cada lado", rest_seconds: 0 },
            ],
          },
          {
            name: "Principal",
            exercises: [
              { name: "Agachamento", sets: 3, reps: "10", rest_seconds: 45 },
              { name: "Flexão (joelhos no chão se precisar)", sets: 3, reps: "8", rest_seconds: 45 },
              { name: "Prancha", sets: 3, reps: "20 s", rest_seconds: 30 },
            ],
          },
          { name: "Volta à calma", exercises: [{ name: "Alongamento de posterior", sets: 1, reps: "30 s cada", rest_seconds: 0 }] },
        ],
        safety_note: "Conteúdo educativo. Pare se sentir dor e procure um profissional habilitado.",
      };
    default:
      // guia e artigo usam o mesmo template, sempre com kind 'article'
      return {
        kind: "article",
        sections: [
          { heading: "Por que isso importa", text: summary },
          { heading: "Como começar hoje", text: `Escolha uma única ação pequena relacionada a "${title}" e repita por três dias. Só então aumente.` },
          { heading: "Erros comuns", text: "Tentar mudar tudo de uma vez, comparar-se com os outros e desistir no primeiro dia ruim." },
          { heading: "Lembrete", text: "Este conteúdo é educativo e não substitui avaliação profissional individual." },
        ],
      };
  }
}

/** Corpos de receita sobrescritos no seed (`body || '{...}'::jsonb`). */
function seedRecipeOverrides(sql: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const re = /update public\.content_bodies set body = body \|\| '((?:[^']|'')*)'::jsonb where content_id = public\.seed_uuid\('content:(\w+)'\);/g;
  for (const m of sql.matchAll(re)) out.set(m[2], JSON.parse(m[1].replace(/''/g, "'")));
  return out;
}

/** O que /admin/content/[id]/edit monta a partir das linhas `content` + `content_bodies` do seed. */
function seededInitialValues(): { key: string; creatorId: string; initial: Partial<ContentFormValues> }[] {
  const overrides = seedRecipeOverrides(SEED_SQL);
  return seedTuples(SEED_SQL, "insert into seed_content values").map((row) => {
    const [key, creator, pillar, type, title, summary, minutes, difficulty, tags, access, cover] = row as [
      string, string, string, string, string, string, number, string, string, string, number,
    ];
    const disclaimer = pillar === "training" ? "training" : pillar === "nutrition" || pillar === "gastronomy" ? "nutrition" : "general";
    return {
      key,
      creatorId: seedUuid(`creator:${creator}`),
      initial: asFormValues({
        id: seedUuid(`content:${key}`),
        title,
        summary,
        pillar,
        type,
        source_locale: "pt-BR",
        cover_url: `/placeholders/cover-${pillar}-${cover}.svg`,
        duration_minutes: minutes,
        difficulty,
        tags: tags.replace(/^\{|\}$/g, "").split(","),
        has_captions: type === "video",
        disclaimer_kind: disclaimer,
        body: { ...seedBody(type, title, summary), ...overrides.get(key) },
        media: { provider: "none", ref: null, captions_url: null },
        access_level: access === "free" ? "free" : "premium",
        required_module_id: access === "free" ? null : seedUuid(`module:${access}`),
        completion_mode: null,
      }),
    };
  });
}

describe("seed: conteúdo existente continua salvável pelo admin", () => {
  const seeded = seededInitialValues();

  it("o seed tem 40 conteúdos (10 por pilar), 8 receitas com corpo próprio e capas que existem em public/", () => {
    expect(seeded).toHaveLength(40);
    expect(new Set(seeded.map((s) => s.initial.pillar))).toEqual(new Set(["routine", "training", "nutrition", "gastronomy"]));
    expect([...seedRecipeOverrides(SEED_SQL).keys()]).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g8", "g9"]);
    for (const { initial } of seeded) {
      expect(SAME_ORIGIN_PATH.test(initial.cover_url ?? "")).toBe(true);
      expect(() => readFileSync(new URL(`../../public${initial.cover_url}`, import.meta.url))).not.toThrow();
    }
  });

  it("IDs do seed seguem o RFC 4122 (versão 4, variante 10xx) e passam no z.uuid() estrito: conteúdo e módulo premium", () => {
    const premium = seeded.find((s) => s.key === "t7");
    expect(premium?.initial.required_module_id).toBe(seedUuid("module:training_full"));
    const rfc4122 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const { key, creatorId } of seeded) {
      expect(seedUuid(`content:${key}`)).toMatch(rfc4122);
      expect(creatorId).toMatch(rfc4122);
    }
    expect(premium?.initial.required_module_id).toMatch(rfc4122);
    const parsed = parseContentForm(toFormValues(premium?.initial));
    expect(parsed.ok && { id: parsed.data.id, module: parsed.data.required_module_id }).toEqual({
      id: seedUuid("content:t7"),
      module: seedUuid("module:training_full"),
    });
  });

  it("todas as 40 linhas passam no formulário (cliente) e no saveContentAction (servidor)", async () => {
    const failures: Record<string, unknown> = {};
    for (const { key, creatorId, initial } of seeded) {
      const client = parseContentForm(toFormValues(initial));
      if (!client.ok) {
        failures[key] = client.errors;
        continue;
      }
      const result = await saveContentAction({ id: initial.id ?? null, creatorId }, client.data);
      if (!result.ok) failures[key] = result.error;
    }
    expect(failures).toEqual({});
  });

  it.each(["r1", "r2", "r3", "t1", "g1", "g2", "n6"])("%s: o corpo regravado é o do seed normalizado (sem perder campos do tipo)", async (key) => {
    server.writes.length = 0;
    const row = seeded.find((s) => s.key === key);
    expect(row).toBeDefined();
    if (!row) return;
    const client = parseContentForm(toFormValues(row.initial));
    expect(client.ok).toBe(true);
    if (!client.ok) return;
    await saveContentAction({ id: row.initial.id ?? null, creatorId: row.creatorId }, client.data);
    const [upsert] = writesTo("content_bodies", "upsert");
    expect(upsert?.body).toEqual(normalizeBody(row.initial.type as ContentTypeValue, row.initial.body));
    expect(upsert).toMatchObject({ media_provider: "none", media_ref: null, captions_url: null });
    const [update] = writesTo("content", "update");
    expect(update).toMatchObject({
      cover_url: row.initial.cover_url,
      access_level: row.initial.access_level,
      required_module_id: row.initial.required_module_id,
      creator_id: row.creatorId,
    });
  });
});

describe("mediaSchema e provedores habilitados", () => {
  it("mediaSchema rejeita provedores desconhecidos (hosts de vídeo fora da lista)", () => {
    for (const provider of ["embed_dailymotion", "tiktok", "https://www.dailymotion.com/video/x8"]) {
      expect(mediaSchema.safeParse({ provider, ref: "abc", captions_url: null }).success).toBe(false);
    }
  });

  it("mediaSchema limita o tamanho da referência e da URL de legendas", () => {
    expect(mediaSchema.safeParse({ provider: "embed_youtube", ref: "x".repeat(301), captions_url: null }).success).toBe(false);
    expect(mediaSchema.safeParse({ provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: `/${"x".repeat(500)}` }).success).toBe(false);
  });

  it.each(["cloudflare_stream", "mux", "upload"])("o formulário rejeita o provedor não configurado %s", (provider) => {
    // a forma (mediaSchema) conhece o provedor; a restrição aos habilitados fica no contentFormSchema
    expect(mediaSchema.safeParse({ provider, ref: "abc123", captions_url: null }).success).toBe(true);
    expect(contentErrors(validVideoForm({ media: { provider, ref: "abc123", captions_url: null } }))).toEqual({
      "media.provider": "providerNotConfigured",
    });
  });

  it("o formulário aceita os provedores habilitados (none, YouTube, Vimeo)", () => {
    expect(contentErrors(validVideoForm({ media: NO_MEDIA }))).toEqual({});
    expect(contentErrors(validVideoForm({ media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: null } }))).toEqual({});
    expect(contentErrors(validVideoForm({ media: { provider: "embed_vimeo", ref: "76979871", captions_url: null } }))).toEqual({});
  });
});

describe("toFormValues (estado inicial do formulário)", () => {
  it("formulário novo: idioma pt-BR, sem mídia, vídeo vazio; só falta o título para ser válido", () => {
    const values = toFormValues();
    expect(values.source_locale).toBe("pt-BR");
    expect(values.type).toBe("video");
    expect(values.media).toEqual({ provider: "none", ref: null, captions_url: null });
    expect(values.body).toEqual(emptyBody("video"));
    expect(contentErrors(values)).toEqual({ title: "required" });
  });

  it("edição: preserva o idioma e a mídia informados e normaliza o corpo vindo do banco", () => {
    const values = toFormValues({
      type: "recipe",
      source_locale: "es",
      media: { provider: "embed_vimeo", ref: "76979871", captions_url: null },
      body: { ingredients: ["Avena"], steps: ["Mezclar"] },
    });
    expect(values.source_locale).toBe("es");
    expect(values.media).toEqual({ provider: "embed_vimeo", ref: "76979871", captions_url: null });
    expect(values.body).toMatchObject({ kind: "recipe", ingredients: [{ item: "Avena", qty: "" }], steps: ["Mezclar"] });
  });
});

describe("bodyKindFor", () => {
  it("vídeo, receita e treino têm editor próprio; guia, artigo e desconhecidos usam o de guia", () => {
    expect(bodyKindFor("video")).toBe("video");
    expect(bodyKindFor("recipe")).toBe("recipe");
    expect(bodyKindFor("workout")).toBe("workout");
    expect(bodyKindFor("guide")).toBe("guide");
    expect(bodyKindFor("article")).toBe("guide");
    expect(bodyKindFor("podcast")).toBe("guide");
  });
});

describe("emptyBody e normalizeBody", () => {
  it.each(CONTENT_TYPE_VALUES)("emptyBody(%s) é do tipo pedido e ainda não tem substância", (type) => {
    const body = emptyBody(type);
    expect(body.kind).toBe(type);
    expect(bodyHasSubstance(type, body)).toBe(false);
  });

  it("formulário intocado: vídeo e receita vazios são válidos; treino e guia exigem preencher a primeira linha", () => {
    expect(bodySchema.safeParse(emptyBody("video")).success).toBe(true);
    expect(bodySchema.safeParse(emptyBody("recipe")).success).toBe(true);
    expect(bodySchema.safeParse(emptyBody("workout")).success).toBe(false);
    expect(bodySchema.safeParse(emptyBody("guide")).success).toBe(false);
  });

  it.each([null, undefined, "texto solto", 42, ["lista"]])("tolera corpo bruto inválido (%j) sem lançar erro", (raw) => {
    expect(normalizeBody("video", raw)).toEqual({ kind: "video", intro: "", key_points: [], transcript: [] });
    expect(normalizeBody("workout", raw)).toEqual({ kind: "workout", equipment: [], blocks: [], safety_note: "" });
    expect(normalizeBody("article", raw)).toEqual({ kind: "article", intro: "", sections: [], key_points: [] });
  });

  it("vídeo: descarta pontos e falas vazias e converte tempo em texto para número", () => {
    const body = normalizeBody("video", {
      intro: "Oi",
      key_points: ["  ", "Respire", 3, null],
      transcript: [{ t: "12", text: "Começando" }, { text: "sem tempo" }, { t: 5, text: "   " }, "lixo"],
    });
    expect(body).toEqual({
      kind: "video",
      intro: "Oi",
      key_points: ["Respire", "3"],
      transcript: [
        { t: 12, text: "Começando" },
        { t: 0, text: "sem tempo" },
      ],
    });
  });

  it("receita: aceita ingredientes legados (texto ou {name, quantity}) e números como texto", () => {
    const body = normalizeBody("recipe", {
      servings: "4",
      prep_minutes: "abc",
      cook_minutes: 12.6,
      ingredients: ["Aveia", { name: "Leite", quantity: "200 ml" }, { item: "  ", qty: "1" }, 42],
      steps: ["Misture", ""],
      allergens: ["lactose"],
    });
    expect(body).toEqual({
      kind: "recipe",
      servings: 4,
      prep_minutes: null,
      cook_minutes: 13,
      ingredients: [
        { item: "Aveia", qty: "" },
        { item: "Leite", qty: "200 ml" },
      ],
      steps: ["Misture"],
      allergens: ["lactose"],
      note: "",
    });
    expect(bodySchema.safeParse(body).success).toBe(true);
  });

  it("treino: ignora blocos e exercícios que não são objetos", () => {
    const body = normalizeBody("workout", {
      blocks: [{ name: "A", exercises: [{ name: "Agachamento", sets: "3", reps: 12, rest_seconds: "60" }, "x"] }, "lixo"],
    });
    expect(body).toEqual({
      kind: "workout",
      equipment: [],
      blocks: [{ name: "A", exercises: [{ name: "Agachamento", sets: 3, reps: "12", rest_seconds: 60 }] }],
      safety_note: "",
    });
  });

  it("guia/artigo: aceita seções em texto ou {title, body} e preserva o tipo", () => {
    const body = normalizeBody("article", { sections: ["Texto solto", { title: "Dica", body: "Beba água" }, null] });
    expect(body).toEqual({
      kind: "article",
      intro: "",
      sections: [
        { heading: "", text: "Texto solto" },
        { heading: "Dica", text: "Beba água" },
      ],
      key_points: [],
    });
  });
});

describe("bodyHasSubstance", () => {
  it("vídeo: basta introdução, ponto-chave ou transcrição", () => {
    expect(bodyHasSubstance("video", { intro: "Oi" })).toBe(true);
    expect(bodyHasSubstance("video", { key_points: ["Respire"] })).toBe(true);
    expect(bodyHasSubstance("video", { transcript: [{ t: 0, text: "Olá" }] })).toBe(true);
    expect(bodyHasSubstance("video", { intro: "   ", key_points: [" "] })).toBe(false);
  });

  it("receita: exige ingredientes E modo de preparo", () => {
    expect(bodyHasSubstance("recipe", { ingredients: ["Aveia"] })).toBe(false);
    expect(bodyHasSubstance("recipe", { steps: ["Misture"] })).toBe(false);
    expect(bodyHasSubstance("recipe", { ingredients: ["Aveia"], steps: ["Misture"] })).toBe(true);
  });

  it("treino: exige ao menos um bloco com exercício", () => {
    expect(bodyHasSubstance("workout", { blocks: [{ name: "Aquecimento", exercises: [] }] })).toBe(false);
    expect(bodyHasSubstance("workout", validBodies.workout)).toBe(true);
    // basta UM bloco com exercício, mesmo que outro ainda esteja vazio
    const mixed = { blocks: [{ name: "Aquecimento", exercises: [] }, { name: "Principal", exercises: [{ name: "Prancha" }] }] };
    expect(bodyHasSubstance("workout", mixed)).toBe(true);
  });

  it("guia/artigo: exige seção com texto (só título não conta)", () => {
    expect(bodyHasSubstance("guide", { sections: [{ heading: "Título", text: "  " }] })).toBe(false);
    expect(bodyHasSubstance("article", { sections: ["Texto do artigo"] })).toBe(true);
    // basta UMA seção com texto, mesmo que outra ainda esteja vazia
    expect(bodyHasSubstance("guide", { sections: [{ heading: "Hidratação", text: "Beba água." }, { heading: "Sono", text: "" }] })).toBe(true);
  });

  it.each(CONTENT_TYPE_VALUES)("corpo ausente (%s) não tem substância", (type) => {
    expect(bodyHasSubstance(type, null)).toBe(false);
  });
});

describe("contentChecklist", () => {
  const complete = {
    type: "video" as ContentTypeValue,
    title: "Mobilidade matinal",
    summary: "Sequência curta",
    cover_url: "/placeholders/content-1.svg",
    disclaimer_kind: "training",
    body: validBodies.video,
    media: { provider: "embed_youtube", ref: YOUTUBE_ID },
  };
  const blocking = (items: { key: string; ok: boolean }[]) => items.filter((i) => !i.ok).map((i) => i.key);

  it("vídeo completo: tudo ok, com o item de mídia antes do aviso", () => {
    const items = contentChecklist(complete);
    expect(items.map((i) => i.key)).toEqual(["title", "summary", "cover", "body", "media", "disclaimer"]);
    expect(blocking(items)).toEqual([]);
  });

  it("outros tipos não têm item de mídia", () => {
    const items = contentChecklist({ ...complete, type: "recipe", body: validBodies.recipe, media: null });
    expect(items.map((i) => i.key)).toEqual(["title", "summary", "cover", "body", "disclaimer"]);
    expect(blocking(items)).toEqual([]);
  });

  it("aponta tudo o que bloqueia o envio para revisão", () => {
    const items = contentChecklist({
      type: "video",
      title: "   ",
      summary: null,
      cover_url: "",
      disclaimer_kind: null,
      body: {},
      media: { provider: "embed_youtube", ref: null },
    });
    expect(blocking(items)).toEqual(["title", "summary", "cover", "body", "media", "disclaimer"]);
  });

  it("mídia exige provedor diferente de 'none' e referência", () => {
    expect(blocking(contentChecklist({ ...complete, media: null }))).toEqual(["media"]);
    expect(blocking(contentChecklist({ ...complete, media: { provider: "none", ref: YOUTUBE_ID } }))).toEqual(["media"]);
  });

  it("capa só com espaços não conta como capa", () => {
    expect(blocking(contentChecklist({ ...complete, cover_url: "   " }))).toEqual(["cover"]);
  });

  it("aviso 'none' conta como escolha explícita; vazio não", () => {
    expect(blocking(contentChecklist({ ...complete, disclaimer_kind: "none" }))).toEqual([]);
    expect(blocking(contentChecklist({ ...complete, disclaimer_kind: "" }))).toEqual(["disclaimer"]);
  });
});
