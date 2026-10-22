import { describe, expect, it } from "vitest";
import { checklistComplete, recipeChecklist } from "@/lib/recipes/checklist";
import { RECIPE_CHECKLIST_CODES } from "@/lib/recipes/codes";
import { emptyDraft, emptyIngredient, emptyStep, type RecipeDraft } from "@/lib/recipes/draft";
import { draftStorageKey, parseStoredDraft, serializeDraft, shouldOfferRecovery } from "@/lib/recipes/draft-recovery";

// Checklist do editor (mesmos códigos e ordem de recipe_publishable_missing, 0027) e a cópia
// local do rascunho com "Recuperar | Descartar".

function complete(): RecipeDraft {
  const d = emptyDraft();
  d.title = "Panqueca";
  d.summary = "Rápida";
  d.servings = "2";
  d.prep = "5";
  d.cook = "10";
  d.categories = ["cafe-da-manha"];
  d.ingredients = [{ ...emptyIngredient(), name: "Ovo", amount: "1" }];
  d.steps = [{ ...emptyStep(), instruction: "Misture e doure." }];
  d.allergensDeclared = true;
  return d;
}
const missing = (d: RecipeDraft, cover: string | null = "/placeholders/cover-gastronomy-1.svg") =>
  recipeChecklist(d, { currentCoverUrl: cover, activeCategories: ["cafe-da-manha", "almoco"] })
    .filter((e) => !e.ok)
    .map((e) => e.code);

describe("recipeChecklist", () => {
  it("mesma ordem do banco e completo com a capa placeholder (receitas novas e antigas)", () => {
    const entries = recipeChecklist(complete(), { currentCoverUrl: "/placeholders/cover-gastronomy-1.svg" });
    expect(entries.map((e) => e.code)).toEqual([...RECIPE_CHECKLIST_CODES]);
    expect(checklistComplete(entries)).toBe(true);
  });
  it("rascunho vazio: os itens do S28 (cover só sem capa nenhuma)", () => {
    expect(missing(emptyDraft())).toEqual(["title", "summary", "servings", "total_minutes", "ingredients", "steps", "category", "allergens"]);
    expect(missing(emptyDraft(), null)).toContain("cover");
  });
  it("capa: foto escolhida exige texto alternativo; foto desta receita que deixou de ser capa não conta", () => {
    const d = complete();
    d.media = [{ id: "11111111-1111-4111-8111-111111111111", role: "gallery", position: 1, alt: "", caption: "", width: null, height: null }];
    d.coverMediaId = "11111111-1111-4111-8111-111111111111";
    expect(missing(d)).toEqual(["cover", "gallery_alt"]);
    d.media[0].alt = "Panqueca dourada";
    expect(missing(d)).toEqual([]);
    d.coverMediaId = null;
    expect(missing(d, "/media/recipe/11111111-1111-4111-8111-111111111111")).toEqual(["cover"]);
  });
  it("tempos incoerentes (g2/g4) dão 'times'; categoria desativada não conta", () => {
    const d = complete();
    d.totalTouched = true;
    d.total = "10";
    expect(missing(d)).toEqual(["times"]);
    d.categories = ["sobremesa"];
    expect(missing(d)).toContain("category");
  });
  it("vídeo do Stream sem uid dá 'stream'", () => {
    const d = complete();
    d.video = { provider: "cloudflare_stream", ref: null };
    expect(missing(d)).toEqual(["stream"]);
  });
});

describe("cópia local do rascunho", () => {
  const server = complete();
  const local = { ...complete(), title: "Panqueca editada offline" };
  it("chave por receita e formato versionado; lixo é ignorado", () => {
    expect(draftStorageKey("abc")).toBe("uh-recipe-draft:abc");
    const raw = serializeDraft(local, "2026-10-22T10:00:00Z", 1_000);
    expect(parseStoredDraft(raw)).toMatchObject({ v: 1, savedAt: 1_000, baseUpdatedAt: "2026-10-22T10:00:00Z" });
    expect(parseStoredDraft("{")).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ v: 2, savedAt: 1, baseUpdatedAt: "x", draft: local }))).toBeNull();
    expect(parseStoredDraft(null)).toBeNull();
  });
  it("oferece recuperar quando a cópia foi editada sobre a versão atual do servidor, qualquer que seja o relógio", () => {
    const stored = parseStoredDraft(serializeDraft(local, "2026-10-22T10:00:00Z", 0))!;
    expect(shouldOfferRecovery(stored, "2026-10-22T10:00:00Z", server)).toBe(true);
  });
  it("não oferece quando é igual ao servidor ou quando o servidor recebeu algo depois (outro aparelho)", () => {
    const same = parseStoredDraft(serializeDraft(server, "2026-10-22T10:00:00Z", Date.parse("2026-10-22T11:00:00Z")))!;
    expect(shouldOfferRecovery(same, "2026-10-22T10:00:00Z", server)).toBe(false);
    const older = parseStoredDraft(serializeDraft(local, "2026-10-22T09:00:00Z", Date.parse("2026-10-22T09:30:00Z")))!;
    expect(shouldOfferRecovery(older, "2026-10-22T10:00:00Z", server)).toBe(false);
    const newer = parseStoredDraft(serializeDraft(local, "2026-10-22T09:00:00Z", Date.parse("2026-10-22T10:30:00Z")))!;
    expect(shouldOfferRecovery(newer, "2026-10-22T10:00:00Z", server)).toBe(true);
    expect(shouldOfferRecovery(null, "2026-10-22T10:00:00Z", server)).toBe(false);
  });
});
