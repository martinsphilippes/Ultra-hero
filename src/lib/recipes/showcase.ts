// Alimentação na vitrine do herói (Etapa 2, 0051). Regras puras (servidor, navegador e testes):
// quem assina a receita, a linha de assinatura, quais ações aparecem e a validação do contador.

/** Pessoa da assinatura (herói): o slug identifica (os cards não trazem o id). */
export type ShowcasePerson = { slug: string; name: string; avatar_url: string | null; is_fictional?: boolean };

/**
 * Assinatura escolhida pelo admin (recipe_signers). `undefined` = sem linha (o autor assina, como
 * antes da 0051, e também quando a 0051 não está no banco); `{ chef: null }` = sem chef, só indicada;
 * `{ chef }` = esse herói chef assina (embed nulo = chef fora do ar, tratado como sem chef).
 */
export type SignerOverride = { chef: ShowcasePerson | null } | undefined;

/** Quem assina de fato: a escolha do admin, ou o autor quando não há escolha. */
export function effectiveChef(author: ShowcasePerson | null, signer: SignerOverride): ShowcasePerson | null {
  return signer === undefined ? author : signer.chef;
}

export type RecipeSignature =
  | { kind: "chef"; chef: ShowcasePerson; hero: null }
  | { kind: "chefIndicated"; chef: ShowcasePerson; hero: ShowcasePerson }
  | { kind: "indicated"; chef: null; hero: ShowcasePerson }
  | { kind: "none"; chef: null; hero: null };

/**
 * Linha de assinatura. O herói da vitrine é o da página de onde a pessoa veio (?vitrine=) ou, sem
 * ele, o autor (a receita sempre está na vitrine do autor).
 *   chef = herói da vitrine (ou sem herói) → "Receita de <chef>"
 *   chef ≠ herói da vitrine               → "Receita de <chef> · indicada por <herói>"
 *   sem chef                               → "Indicada por <herói>"
 */
export function recipeSignature(input: { author: ShowcasePerson | null; signer: SignerOverride; showcaseHero?: ShowcasePerson | null }): RecipeSignature {
  const chef = effectiveChef(input.author, input.signer);
  const hero = input.showcaseHero ?? input.author;
  if (chef && (!hero || hero.slug === chef.slug)) return { kind: "chef", chef, hero: null };
  if (chef && hero) return { kind: "chefIndicated", chef, hero };
  if (hero) return { kind: "indicated", chef: null, hero };
  return { kind: "none", chef: null, hero: null };
}

// ---------------------------------------------------------------- ações
/**
 * "Contratar nutricionista": profissionais chegam na Etapa 3. Até lá, uma linha discreta "em breve"
 * (sem botão). A Etapa 3 troca para "live" e liga a ação de verdade.
 */
export const NUTRITIONIST_ACTION: "soon" | "live" = "soon";

export type RecipeActionInput = {
  /** Receita aberta (etapa demonstrativa feita e acesso ao conteúdo): Fazer e Lista dependem disso. */
  recipeOpen: boolean;
  hasIngredients: boolean;
  /** Produto "Comprar pronto" ligado e visível (null = sem produto ou 0051 ausente). */
  readyProduct: { purchasable: boolean } | null;
  commerceEnabled: boolean;
};

export type RecipeActions = { fazer: boolean; comprarPronto: boolean; listaCompras: boolean; nutricionista: "soon" | "live" | null };

/** Quais ações aparecem na página da receita. Comprar pronto não depende de abrir a receita. */
export function recipeActionVisibility(input: RecipeActionInput): RecipeActions {
  return {
    fazer: input.recipeOpen,
    comprarPronto: Boolean(input.commerceEnabled && input.readyProduct?.purchasable),
    listaCompras: input.recipeOpen && input.hasIngredients,
    nutricionista: NUTRITIONIST_ACTION,
  };
}

/** Ações nos cards da vitrine (Alimentação): a cozinha e a página pedem a etapa sozinhas. */
export function cardActionVisibility(input: { readyProduct: { purchasable: boolean } | null; commerceEnabled: boolean }): RecipeActions {
  return {
    fazer: true,
    comprarPronto: Boolean(input.commerceEnabled && input.readyProduct?.purchasable),
    listaCompras: true,
    nutricionista: null,
  };
}

// ---------------------------------------------------------------- contador de toques
export const RECIPE_ACTIONS = ["fazer", "comprar_pronto", "lista_compras"] as const;
export type RecipeActionKey = (typeof RECIPE_ACTIONS)[number];
/** Origem do toque: card da Alimentação do herói ou página da receita. */
export const RECIPE_ACTION_SOURCES = ["alimentacao", "receita"] as const;
export type RecipeActionSource = (typeof RECIPE_ACTION_SOURCES)[number];

/** O que o navegador manda (serializável): sem nada da pessoa. */
export type RecipeActionTrack = { creatorId: string; contentId: string; source: RecipeActionSource };
export type RecipeActionEvent = RecipeActionTrack & { action: RecipeActionKey };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validação da entrada do contador; qualquer coisa fora do formato vira null (e nada é gravado). */
export function parseRecipeActionEvent(input: unknown): RecipeActionEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const { creatorId, contentId, source, action } = input as Record<string, unknown>;
  if (typeof creatorId !== "string" || !UUID.test(creatorId)) return null;
  if (typeof contentId !== "string" || !UUID.test(contentId)) return null;
  if (typeof source !== "string" || !(RECIPE_ACTION_SOURCES as readonly string[]).includes(source)) return null;
  if (typeof action !== "string" || !(RECIPE_ACTIONS as readonly string[]).includes(action)) return null;
  return { creatorId: creatorId.toLowerCase(), contentId: contentId.toLowerCase(), source: source as RecipeActionSource, action: action as RecipeActionKey };
}

/**
 * Limite ingênuo por instância do servidor: no máximo `max` toques por janela de `windowMs`, para um
 * laço de chamadas não encher o banco. Estado no fechamento (nada da pessoa).
 */
export function createBumpLimiter(max: number, windowMs: number) {
  let windowStart = 0;
  let used = 0;
  return (now: number): boolean => {
    if (now - windowStart >= windowMs) {
      windowStart = now;
      used = 0;
    }
    if (used >= max) return false;
    used += 1;
    return true;
  };
}

/** Slug de herói vindo da URL (?vitrine=): só o formato de slug; o resto o servidor confere. */
export function parseShowcaseSlug(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 ? slug : null;
}

// ---------------------------------------------------------------- admin: quem assina
export type SignerChoice = { mode: "author" } | { mode: "none" } | { mode: "hero"; chefId: string };

/** Valor do seletor do admin para a linha de recipe_signers (sem linha = "author"). */
export function signerChoiceValue(row: { chef_id: string | null } | null | undefined): string {
  if (!row) return "author";
  return row.chef_id ?? "none";
}

/** Valor do seletor → escolha. Qualquer outra coisa (inclusive uuid malformado) é null. */
export function parseSignerChoice(value: unknown): SignerChoice | null {
  if (value === "author") return { mode: "author" };
  if (value === "none") return { mode: "none" };
  if (typeof value === "string" && UUID.test(value)) return { mode: "hero", chefId: value.toLowerCase() };
  return null;
}

/** Endereço da receita levando o herói da vitrine (para a assinatura e os contadores). */
export function showcaseRecipeHref(slug: string, heroSlug: string | null, hash?: string): string {
  const base = heroSlug ? `/content/${slug}?vitrine=${encodeURIComponent(heroSlug)}` : `/content/${slug}`;
  return hash ? `${base}#${hash}` : base;
}
