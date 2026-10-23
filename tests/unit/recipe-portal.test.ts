import { describe, expect, it } from "vitest";
import { credentialsState } from "@/lib/recipes/credentials";
import { fitWithin, isLive, isRecipeMediaUrl, parseRecipeMediaPath, recipeMediaCacheControl, recipeMediaPath, recipeMediaUrl, sniffImageMime } from "@/lib/recipes/media";
import { dateRange, escapeLike, hasActiveFilters, hasAnyStats, myRecipeStatus, parseMyRecipesFilters, recipeActions, statsDisplay } from "@/lib/recipes/portal";

// Minhas Receitas (situação derivada, filtros com .catch, indicadores só com dado real, ações por
// situação), fotos (caminho, bytes mágicos, cache do proxy) e a fila de credenciais (P7).

const NOW = new Date("2026-10-22T12:00:00Z");

describe("myRecipeStatus", () => {
  it.each([
    [{ status: "draft", review_status: "none", publish_at: null }, "draft"],
    [{ status: "draft", review_status: "in_review", publish_at: null }, "in_review"],
    [{ status: "draft", review_status: "returned", publish_at: null }, "returned"],
    [{ status: "draft", review_status: "rejected", publish_at: null }, "returned"],
    [{ status: "published", review_status: "approved", publish_at: "2026-10-30T00:00:00Z" }, "scheduled"],
    [{ status: "published", review_status: "approved", publish_at: "2026-10-01T00:00:00Z" }, "published"],
    [{ status: "published", review_status: "approved", publish_at: null }, "published"],
    [{ status: "archived", review_status: "none", publish_at: null }, "archived"],
  ] as const)("%o → %s", (row, expected) => {
    expect(myRecipeStatus(row, NOW)).toBe(expected);
  });
});

describe("filtros da URL", () => {
  it("valores ruins viram 'sem filtro' (Zod .catch)", () => {
    const f = parseMyRecipesFilters({ q: "  bowl ", cat: "Almoço!", status: "x", diff: "advanced", from: "2026-13-99x", to: ["2026-10-01"] });
    expect(f).toEqual({ q: "bowl", cat: "", status: "all", diff: "advanced", from: "", to: "" });
    expect(hasActiveFilters(f)).toBe(true);
    expect(hasActiveFilters(parseMyRecipesFilters({}))).toBe(false);
  });
  it("intervalo de datas inclui o dia final inteiro e aceita datas invertidas", () => {
    expect(dateRange("2026-10-01", "2026-10-05")).toEqual({ gte: "2026-10-01T00:00:00.000Z", lt: "2026-10-06T00:00:00.000Z" });
    expect(dateRange("2026-10-05", "2026-10-01")).toEqual({ gte: "2026-10-01T00:00:00.000Z", lt: "2026-10-06T00:00:00.000Z" });
    expect(dateRange("", "")).toEqual({ gte: null, lt: null });
  });
  it("busca sem curinga acidental", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("indicadores (creator_recipe_stats)", () => {
  it("visitantes só a partir de 5, favoritos só acima de zero, nota só com 3 avaliações", () => {
    expect(statsDisplay({ visitors: 4, favorites: 0, ratingCount: 2, ratingAvg: 5 })).toEqual({ visitors: null, favorites: null, rating: null });
    expect(statsDisplay({ visitors: 12, favorites: 3, ratingCount: 3, ratingAvg: 4.666 })).toEqual({ visitors: 12, favorites: 3, rating: 4.7 });
    expect(statsDisplay(undefined)).toEqual({ visitors: null, favorites: null, rating: null });
    expect(hasAnyStats([statsDisplay(undefined)])).toBe(false);
    expect(hasAnyStats([statsDisplay({ visitors: 0, favorites: 1, ratingCount: 0, ratingAvg: null })])).toBe(true);
  });
});

describe("ações por situação", () => {
  it("excluir só rascunho que nunca foi ao ar; restaurar só o que o herói arquivou", () => {
    expect(recipeActions("draft", { published_at: null, archived_by: null })).toMatchObject({ edit: true, remove: true, unpublish: false, restore: false });
    expect(recipeActions("draft", { published_at: "2026-01-01", archived_by: null }).remove).toBe(false);
    expect(recipeActions("published", { published_at: "2026-01-01", archived_by: null })).toMatchObject({ edit: false, unpublish: true, archive: true });
    expect(recipeActions("in_review", { published_at: null, archived_by: null })).toMatchObject({ withdraw: true, edit: false, remove: false });
    // 0036: a arquivada pelo próprio herói pode ser excluída de vez; a arquivada pelo admin, não
    expect(recipeActions("archived", { published_at: "2026-01-01", archived_by: "creator" })).toMatchObject({ remove: true, restore: true });
    expect(recipeActions("archived", { published_at: "2026-01-01", archived_by: "admin" })).toMatchObject({ remove: false, restore: false });
    expect(recipeActions("published", { published_at: "2026-01-01", archived_by: null }).remove).toBe(false);
    expect(recipeActions("archived", { published_at: null, archived_by: "admin" })).toMatchObject({ restore: false, archive: false });
    expect(recipeActions("archived", { published_at: null, archived_by: "creator" }).restore).toBe(true);
  });
});

describe("fotos de receita", () => {
  const C = "a3bb189e-8bf9-4888-9912-ace4e6543002";
  const R = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const F = "5d1c6f0e-3f0a-4c1e-9f7a-2b8d4e6a1c33";
  it("caminho <herói>/<receita>/<uuid>.<ext> no formato da política do Storage", () => {
    expect(recipeMediaPath(C, R, F, "image/webp")).toBe(`${C}/${R}/${F}.webp`);
    expect(parseRecipeMediaPath(`${C}/${R}/${F}.jpg`)).toEqual({ creatorId: C, contentId: R, fileId: F, mime: "image/jpeg" });
    expect(parseRecipeMediaPath(`${C}/${R}/${F}.gif`)).toBeNull();
    expect(parseRecipeMediaPath(`${C}/x/${F}.png`)).toBeNull();
    expect(parseRecipeMediaPath(`${C.toUpperCase()}/${R}/${F}.png`)).toBeNull();
  });
  it("bytes mágicos: JPEG, PNG, WEBP; HTML disfarçado não passa", () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageMime(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageMime(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
  });
  it("cache do proxy: só galeria de receita no ar vai para o cache compartilhado", () => {
    expect(recipeMediaCacheControl(true)).toContain("s-maxage=300");
    expect(recipeMediaCacheControl(false)).toBe("private, no-store");
    expect(isLive("published", null, NOW)).toBe(true);
    expect(isLive("published", "2026-10-23T00:00:00Z", NOW)).toBe(false);
    expect(isLive("draft", null, NOW)).toBe(false);
    expect(recipeMediaUrl(F)).toBe(`/media/recipe/${F}`);
    expect(isRecipeMediaUrl(`/media/recipe/${F}`)).toBe(true);
    expect(isRecipeMediaUrl("/placeholders/cover-gastronomy-1.svg")).toBe(false);
  });
  it("redução para até 2048 px sem ampliar", () => {
    expect(fitWithin(4096, 3072)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 10)).toEqual({ width: 0, height: 0 });
  });
});

describe("credenciais do chef (P7)", () => {
  const req = { text: "Chef formada pelo Senac ", updated_at: "2026-10-20T10:00:00Z" };
  it("aprovada quando o perfil tem exatamente o texto pedido com data", () => {
    expect(credentialsState(req, { credentials: "Chef formada pelo Senac", credentials_approved_at: "2026-10-21T00:00:00Z" }, undefined)).toBe("approved");
  });
  it("reprovada quando a última decisão foi 'não' depois do pedido; editar volta a aguardar", () => {
    const no = { after_data: { approved: false }, created_at: "2026-10-21T00:00:00Z" };
    expect(credentialsState(req, { credentials: null, credentials_approved_at: null }, no)).toBe("rejected");
    expect(credentialsState({ ...req, updated_at: "2026-10-22T00:00:00Z" }, { credentials: null, credentials_approved_at: null }, no)).toBe("pending");
    expect(credentialsState(req, undefined, undefined)).toBe("pending");
  });
});
