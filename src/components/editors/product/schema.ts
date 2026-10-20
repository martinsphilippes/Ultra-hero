import { z } from "zod";
import type { ProductFormValues } from "@/components/editors/types";

// Esquema do formulário de produto (compartilhado entre cliente e server actions).
// Mensagens são CHAVES de tradução (commerce.productForm.errors.*), nunca texto final.

export const PRODUCT_IMAGES = ["/placeholders/product-1.svg", "/placeholders/product-2.svg", "/placeholders/product-3.svg", "/placeholders/product-4.svg"] as const;
export const PRODUCT_TYPES = ["physical", "kit", "digital"] as const;
export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export const AVAILABILITIES = ["available", "unavailable"] as const;

// Alegações proibidas (saúde/resultado). Comparação sem acento e sem maiúsculas, por palavra.
export const FORBIDDEN_CLAIMS = [
  "cura",
  "cures",
  "emagrece",
  "emagrecimento garantido",
  "adelgaza",
  "aprovado pela anvisa",
  "aprobado por anvisa",
  "fda approved",
  "milagroso",
  "milagrosa",
  "milagre",
  "miracle",
  "100% seguro",
  "100% safe",
  "queima gordura",
  "quema grasa",
  "burns fat",
  "sem contraindicacao",
  "garantia de resultado",
] as const;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Devolve o termo proibido encontrado (ou null). Usa limite de palavra para não pegar "procura".
export function findForbiddenClaim(text: string): string | null {
  const haystack = normalize(text);
  for (const term of FORBIDDEN_CLAIMS) {
    const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack)) return term;
  }
  return null;
}

const attributeValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.array(z.string().max(60)).max(20)]);

export const foodInfoSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).max(50),
  allergens: z.array(z.string().trim().min(1).max(80)).max(30),
  storage: z.string().trim().max(300),
});

export const productBaseSchema = z.object({
  id: z.uuid().optional(),
  seller_org_id: z.uuid("seller_required"),
  category_id: z.uuid("category_required"),
  title: z.string().trim().min(3, "title_length").max(120, "title_length"),
  description: z.string().trim().min(10, "description_length").max(4000, "description_length"),
  image_url: z.enum(PRODUCT_IMAGES, "image_invalid"),
  price_cents_demo: z.number("price_invalid").int("price_invalid").min(0, "price_invalid").max(100_000_000, "price_invalid"),
  product_type: z.enum(PRODUCT_TYPES),
  // z.record não propaga a mensagem do esquema da chave: o issue "invalid_key" usa o erro do
  // próprio record (senão a UI recebe o texto em inglês "Invalid key in record").
  attributes: z.record(z.string().regex(/^[a-z0-9_]{1,32}$/), attributeValue, {
    error: (issue) => (issue.code === "invalid_key" ? "attribute_key_invalid" : undefined),
  }),
  food_info: foodInfoSchema.nullable(),
  status: z.enum(PRODUCT_STATUSES),
  availability: z.enum(AVAILABILITIES),
  demo_stock: z.number("demo_stock_invalid").int("demo_stock_invalid").min(0, "demo_stock_invalid").max(100_000, "demo_stock_invalid").nullable(),
});

export type ProductSchemaOptions = {
  /** Diz se a categoria escolhida é alimentar (exige ficha alimentar). */
  isFoodCategory: (categoryId: string) => boolean;
};

// Regras cruzadas: ficha alimentar obrigatória e blocklist de alegações ao publicar.
export function createProductSchema({ isFoodCategory }: ProductSchemaOptions) {
  return productBaseSchema.superRefine((v, ctx) => {
    if (isFoodCategory(v.category_id)) {
      if (!v.food_info || v.food_info.ingredients.length === 0) {
        ctx.addIssue({ code: "custom", path: ["food_info", "ingredients"], message: "food_info_required" });
      }
      if (!v.food_info || v.food_info.storage.trim().length === 0) {
        ctx.addIssue({ code: "custom", path: ["food_info", "storage"], message: "food_info_required" });
      }
    }
    if (v.status === "published") {
      const inTitle = findForbiddenClaim(v.title);
      if (inTitle) ctx.addIssue({ code: "custom", path: ["title"], message: `forbidden_claim:${inTitle}` });
      const inDescription = findForbiddenClaim(v.description);
      if (inDescription) ctx.addIssue({ code: "custom", path: ["description"], message: `forbidden_claim:${inDescription}` });
    }
  });
}

export type ProductFieldErrors = Record<string, string>;

// Achata os issues do Zod em { "food_info.ingredients": "food_info_required", ... }.
export function flattenProductIssues(error: z.ZodError): ProductFieldErrors {
  const out: ProductFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// Valores iniciais seguros para o formulário.
export function emptyProductValues(sellerOrgId = ""): ProductFormValues {
  return {
    seller_org_id: sellerOrgId,
    category_id: "",
    title: "",
    description: "",
    image_url: PRODUCT_IMAGES[0],
    price_cents_demo: 0,
    product_type: "physical",
    attributes: {},
    food_info: null,
    status: "draft",
    availability: "available",
    demo_stock: null,
  };
}

// Sem vírgula, ponto seguido de grupos de 3 dígitos é milhar pt-BR ("1.500", "1.500.000").
// O primeiro grupo não começa com 0: "0.500" é ambíguo (R$ 0,50 ou R$ 500?) e é rejeitado.
const THOUSANDS_ONLY = /^-?[1-9]\d{0,2}(\.\d{3})+$/;
// Sem vírgula e fora do padrão de milhar: inteiro ou ponto decimal com 1–2 casas ("29.9", "29.90").
const DOT_DECIMAL = /^-?\d+(\.\d{1,2})?$/;
// Com vírgula (decimal pt-BR): parte inteira sem separador ou com milhar pt-BR bem formado, e 0–2 casas.
// Mesma regra do ponto: 3+ dígitos depois do separador decimal nunca são centavos. "1,500" (milhar en?),
// "29,999", "1,500.00" (formato en) e "12.34,56" não têm leitura única em reais e são rejeitados.
const COMMA_DECIMAL = /^-?(\d*|[1-9]\d{0,2}(\.\d{3})+),\d{0,2}$/;

// "28,90" | "28.90" | "R$ 1.234,56" | "1.500" -> centavos (NaN se inválido ou ambíguo).
export function parsePriceToCents(input: string): number {
  const raw = input.replace(/[^\d.,-]/g, "").trim();
  if (!raw) return Number.NaN;
  let normalized = raw;
  if (raw.includes(",")) {
    if (!COMMA_DECIMAL.test(raw)) return Number.NaN;
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (THOUSANDS_ONLY.test(raw)) normalized = raw.replace(/\./g, "");
  else if (!DOT_DECIMAL.test(raw)) return Number.NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100);
}

export function centsToPriceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
