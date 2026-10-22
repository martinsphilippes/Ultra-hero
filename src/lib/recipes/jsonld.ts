// SEO da receita: JSON-LD schema.org/Recipe, só com RECIPES_SEO_INDEX ligada (P6: desligada enquanto
// os chefs forem fictícios). Puro e testável. Regras: duração em ISO 8601, ingredientes e preparo só
// para quem pode abrir a receita, `<` escapado no JSON embutido e, quando o herói é fictício, o autor
// é a Organization "Ultra Hero" (não se atribui receita a uma pessoa que não existe).
import type { RecipeDiet } from "./codes";

/** Interruptor da indexação de receitas (sitemap e JSON-LD). Só "1" ou "true" ligam. */
export function recipesSeoIndexEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = (env.RECIPES_SEO_INDEX ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

/** Minutos → "PT1H5M" (ISO 8601). Nulo ou fora de faixa → undefined. */
export function isoDuration(minutes: number | null | undefined): string | undefined {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
}

// Só as dietas com equivalente em schema.org/RestrictedDiet; as demais ficam de fora.
const DIET_SCHEMA: Partial<Record<RecipeDiet, string>> = {
  vegetarian: "https://schema.org/VegetarianDiet",
  vegan: "https://schema.org/VeganDiet",
  gluten_free: "https://schema.org/GlutenFreeDiet",
  lactose_free: "https://schema.org/LowLactoseDiet",
  low_sodium: "https://schema.org/LowSaltDiet",
};

export type RecipeJsonLdInput = {
  url: string;
  title: string;
  summary: string | null;
  image: string | null;
  publishedAt: string | null;
  chef: { name: string; url: string; fictional: boolean } | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  servings: number | null;
  categories: string[];
  diets: RecipeDiet[];
  keywords: string[];
  /** Ingredientes e etapas só entram quando quem pede pode abrir a receita. */
  ingredients?: string[];
  steps?: string[];
  ratingAvg?: number | null;
  ratingCount?: number;
};

export function buildRecipeJsonLd(input: RecipeJsonLdInput): Record<string, unknown> {
  const author = !input.chef || input.chef.fictional ? { "@type": "Organization", name: "Ultra Hero" } : { "@type": "Person", name: input.chef.name, url: input.chef.url };
  const diets = input.diets.map((d) => DIET_SCHEMA[d]).filter((d): d is string => Boolean(d));
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: input.title,
    url: input.url,
    author,
  };
  if (input.summary) out.description = input.summary;
  if (input.image) out.image = [input.image];
  if (input.publishedAt) out.datePublished = input.publishedAt;
  const prep = isoDuration(input.prepMinutes);
  const cook = isoDuration(input.cookMinutes);
  const total = isoDuration(input.totalMinutes);
  if (prep) out.prepTime = prep;
  if (cook) out.cookTime = cook;
  if (total) out.totalTime = total;
  if (input.servings) out.recipeYield = String(input.servings);
  if (input.categories.length) out.recipeCategory = input.categories;
  if (diets.length) out.suitableForDiet = diets;
  if (input.keywords.length) out.keywords = input.keywords.join(", ");
  if (input.ingredients?.length) out.recipeIngredient = input.ingredients;
  if (input.steps?.length) out.recipeInstructions = input.steps.map((text) => ({ "@type": "HowToStep", text }));
  if (input.ratingAvg && input.ratingCount && input.ratingCount >= 3) {
    out.aggregateRating = { "@type": "AggregateRating", ratingValue: input.ratingAvg, ratingCount: input.ratingCount };
  }
  return out;
}

/** JSON para <script type="application/ld+json">: `<` vira o escape unicode (nada fecha a tag nem abre outra). */
export function serializeJsonLd(data: unknown): string {
  // U+2028/U+2029 também saem escapados (quebram scripts em navegadores antigos)
  return JSON.stringify(data).replace(/</g, "\\u003c").replaceAll(String.fromCharCode(0x2028), "\\u2028").replaceAll(String.fromCharCode(0x2029), "\\u2029");
}
