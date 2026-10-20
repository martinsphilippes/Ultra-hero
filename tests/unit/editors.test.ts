import { describe, expect, it, test } from "vitest";
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

const SELLER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const CATEGORY = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const FOOD_CATEGORY = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const MODULE = "9c5b94b1-35ad-49bb-b118-8e8fc24abf80";
const YOUTUBE_ID = "dQw4w9WgXcQ";

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

  it.each(["", "   ", "abc", "R$", ",", ".", "-", "1,2,3", "1.234.567"])("entrada inválida %j vira NaN", (input) => {
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

  test.todo(
    "BUG: '1.500' (milhar pt-BR sem decimais) deveria virar 150000 centavos (R$ 1.500,00); hoje vira 150 (R$ 1,50) sem erro, enquanto '1.500.000' é rejeitado",
  );
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

  test.todo(
    "BUG: chave de atributo inválida deveria gerar a chave de tradução 'attribute_key_invalid'; hoje flattenProductIssues devolve o texto em inglês do Zod 'Invalid key in record' (z.record não propaga a mensagem da chave)",
  );
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

  test.todo(
    "BUG (fora de editors/): saveContentAction em src/app/admin/content-actions.ts não reutiliza contentFormSchema, apesar do comentário do schema; no servidor aceita capa externa, provedores não habilitados (mux/upload/cloudflare_stream) e ref de mídia sem validação",
  );
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
