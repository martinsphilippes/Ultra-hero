import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  invalidPayloadPath,
  parseRecipeIncomplete,
  RECIPE_ALLERGENS,
  RECIPE_CATEGORY_CODES,
  RECIPE_CHECKLIST_CODES,
  RECIPE_DIETS,
  RECIPE_LIMITS,
  RECIPE_NUTRITION_SOURCES,
  RECIPE_UNITS,
  RECIPE_VERSION_REASONS,
  recipeErrorCode,
} from "@/lib/recipes/codes";

// Os códigos em TS espelham os checks do banco: se a migração mudar, este teste aponta a diferença.
const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0027_recipes_structured.sql"), "utf8");

function sqlArray(after: string): string[] {
  const start = sql.indexOf(after);
  expect(start).toBeGreaterThan(-1);
  const m = /array\[([^\]]+)\]/.exec(sql.slice(start));
  return (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/^'|'$/g, "").replace(/'::text$/, "").replace(/'$/, ""));
}

describe("códigos de receita espelhados do banco (0027)", () => {
  it("dietas e alérgenos são os mesmos da etapa demonstrativa e dos checks de recipe_details", () => {
    expect(sqlArray("diets text[] not null default '{}' check (diets <@")).toEqual([...RECIPE_DIETS]);
    expect(sqlArray("allergens text[] not null default '{}' check (allergens <@")).toEqual([...RECIPE_ALLERGENS]);
  });

  it("unidades do check de recipe_ingredients", () => {
    const m = /unit text check \(unit in \(([^)]+)\)\)/.exec(sql);
    expect(m?.[1].split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual([...RECIPE_UNITS]);
  });

  it("as 10 categorias semeadas, na ordem de exibição", () => {
    const seeded = [...sql.matchAll(/\('([a-z-]+)', '\{"pt-BR":"[^"]+","en":"[^"]+","es":"[^"]+"\}', (\d+)\)/g)].map((m) => m[1]);
    expect(seeded).toEqual([...RECIPE_CATEGORY_CODES]);
  });

  it("checklist na ordem de recipe_publishable_missing", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.recipe_publishable_missing"), sql.indexOf("create or replace function public.recipe_assert_publishable"));
    const order = [...fn.matchAll(/array_append\(v, '([a-z_]+)'\)/g)].map((m) => m[1]);
    expect(order).toEqual([...RECIPE_CHECKLIST_CODES]);
  });

  it("origens da nutrição e motivos de versão", () => {
    expect(sql).toContain(`check (source in (${RECIPE_NUTRITION_SOURCES.map((s) => `'${s}'`).join(", ")}))`);
    expect(sql).toContain(`check (reason in (${RECIPE_VERSION_REASONS.map((s) => `'${s}'`).join(", ")}))`);
  });

  it("limites usados pelas RPCs", () => {
    expect(sql).toContain(`jsonb_array_length(v_list) > ${RECIPE_LIMITS.ingredients} then raise exception 'too_many_ingredients'`);
    expect(sql).toContain(`jsonb_array_length(v_list) > ${RECIPE_LIMITS.steps} then raise exception 'too_many_steps'`);
    expect(sql).toContain(`jsonb_array_length(v_list) > ${RECIPE_LIMITS.categories} then raise exception 'too_many_categories'`);
    expect(sql).toContain(`v_total >= ${RECIPE_LIMITS.media} or (p_role = 'gallery' and v_gallery >= ${RECIPE_LIMITS.gallery})`);
    expect(sql).toContain(`>= ${RECIPE_LIMITS.shoppingItems}`);
  });
});

describe("leitura dos erros do banco", () => {
  it("recipeErrorCode pega o prefixo conhecido", () => {
    expect(recipeErrorCode("recipe_incomplete: cover,steps")).toBe("recipe_incomplete");
    expect(recipeErrorCode("stale_draft")).toBe("stale_draft");
    expect(recipeErrorCode("algo estranho")).toBeNull();
    expect(recipeErrorCode(undefined)).toBeNull();
  });

  it("parseRecipeIncomplete devolve só códigos conhecidos, na ordem do checklist", () => {
    expect(parseRecipeIncomplete("recipe_incomplete: allergens,cover,xyz,ingredients")).toEqual(["cover", "ingredients", "allergens"]);
    expect(parseRecipeIncomplete("stale_draft")).toEqual([]);
  });

  it("invalidPayloadPath devolve o caminho do campo", () => {
    expect(invalidPayloadPath("invalid_payload: ingredients.3.unit")).toBe("ingredients.3.unit");
    expect(invalidPayloadPath("forbidden")).toBeNull();
  });
});
