// Checklist de publicação da receita no editor: mesmos códigos e mesma ordem de
// public.recipe_publishable_missing (0027). É ajuda na tela; quem decide é o banco (gatilho e RPC),
// que confere também o que o navegador não sabe (vídeo do Stream ainda válido, por exemplo).
import { RECIPE_CHECKLIST_CODES, type RecipeChecklistCode } from "./codes";
import { allergensPending, effectiveTotal, isBlankIngredient, isBlankStep, timesSum, toInt, type RecipeDraft } from "./draft";
import { allowedRecipeLicenses, coerceRecipeLicense } from "./payload";

export type ChecklistEntry = { code: RecipeChecklistCode; ok: boolean };

const filled = (s: string | null | undefined) => Boolean(s && s.trim());

/**
 * `currentCoverUrl` é a capa gravada hoje (placeholder do pilar nas receitas novas e antigas): sem
 * foto escolhida ela continua valendo, salvo quando é uma foto desta receita que deixou de ser capa.
 * `activeCategories` são os códigos ainda ativos (categoria desligada pelo admin não conta).
 */
export function recipeChecklist(draft: RecipeDraft, opts: { currentCoverUrl: string | null; activeCategories?: readonly string[] }): ChecklistEntry[] {
  const gallery = draft.media.filter((m) => m.role === "gallery");
  const cover = draft.coverMediaId ? gallery.find((m) => m.id === draft.coverMediaId) : undefined;
  const fallbackCover = opts.currentCoverUrl && !opts.currentCoverUrl.startsWith("/media/recipe/") ? opts.currentCoverUrl : null;
  const total = effectiveTotal(draft);
  const active = opts.activeCategories;
  const provider = draft.video.provider;

  const missing = new Set<RecipeChecklistCode>();
  if (!filled(draft.title)) missing.add("title");
  if (!filled(draft.summary)) missing.add("summary");
  if (!(cover ? filled(cover.alt) : filled(fallbackCover))) missing.add("cover");
  if (gallery.some((m) => !filled(m.alt))) missing.add("gallery_alt");
  const servings = toInt(draft.servings);
  if (servings === null || Number.isNaN(servings)) missing.add("servings");
  if (total === null || Number.isNaN(total)) missing.add("total_minutes");
  else if (total < timesSum(draft)) missing.add("times");
  if (!draft.ingredients.some((i) => !isBlankIngredient(i))) missing.add("ingredients");
  if (!draft.steps.some((s) => !isBlankStep(s))) missing.add("steps");
  if (!draft.categories.some((c) => !active || active.includes(c))) missing.add("category");
  if (!draft.allergensDeclared || allergensPending(draft)) missing.add("allergens");
  if (!(allowedRecipeLicenses(provider) as readonly string[]).includes(coerceRecipeLicense(provider, draft.licenseKind))) missing.add("license");
  if (provider === "cloudflare_stream" && !filled(draft.video.ref)) missing.add("stream");

  return RECIPE_CHECKLIST_CODES.map((code) => ({ code, ok: !missing.has(code) }));
}

export function checklistComplete(entries: ChecklistEntry[]): boolean {
  return entries.every((e) => e.ok);
}

const RECIPE_MEDIA_PREFIX = "/media/recipe/";

/**
 * cover_url que o banco deixa depois de recipe_save (0027): foto escolhida vira /media/recipe/<id>;
 * sem foto escolhida, uma foto desta receita que era capa sai e o placeholder do pilar continua.
 * O editor espelha a regra para o checklist não aceitar uma capa que o banco já zerou.
 */
export function coverUrlAfterSave(current: string | null, coverMediaId: string | null): string | null {
  if (coverMediaId) return `${RECIPE_MEDIA_PREFIX}${coverMediaId}`;
  return current?.startsWith(RECIPE_MEDIA_PREFIX) ? null : current;
}

/** recipe_delete_media zera cover_url quando a foto apagada era a capa. */
export function coverUrlAfterDelete(current: string | null, mediaId: string): string | null {
  return current === `${RECIPE_MEDIA_PREFIX}${mediaId}` ? null : current;
}

/**
 * Itens que o banco recusou (recipe_incomplete) valem só para o rascunho daquela tentativa: qualquer
 * mudança volta ao checklist da tela, e a pessoa pode tentar de novo depois de corrigir.
 */
export function serverMissingFor<D>(entry: { codes: RecipeChecklistCode[]; draft: D } | null, draft: D): RecipeChecklistCode[] {
  return entry && entry.draft === draft ? entry.codes : [];
}
