import { describe, expect, it } from "vitest";
import { buildCreatorLibraries } from "@/lib/catalog/creator-libraries";
import { CLOSED_GATE, pickKnown, RECIPE_ALLERGIES, RECIPE_RESTRICTIONS, RECIPE_STEPS, recipeStepHref, safeNext } from "@/lib/recipes/onboarding";

describe("etapa demonstrativa de receitas", () => {
  it("tem 4 passos na ordem combinada", () => {
    expect(RECIPE_STEPS).toEqual(["notice", "diet", "interests", "confirm"]);
  });

  it("visitante começa com a etapa fechada", () => {
    expect(CLOSED_GATE).toEqual({ loggedIn: false, completed: false, restrictions: [], allergies: [] });
  });

  it("pickKnown descarta valores fora da lista, repetidos e não-texto, e segue a ordem da lista", () => {
    expect(pickKnown(["egg", "x", "peanut", "egg", 3, null], RECIPE_ALLERGIES)).toEqual(["peanut", "egg"]);
    expect(pickKnown(null, RECIPE_RESTRICTIONS)).toEqual([]);
  });

  it("safeNext só aceita caminhos internos", () => {
    expect(safeNext("/personalities/lia-monteiro/receitas")).toBe("/personalities/lia-monteiro/receitas");
    expect(safeNext("https://evil.example")).toBe("/explore");
    expect(safeNext("//evil.example")).toBe("/explore");
    expect(safeNext("/\\evil.example")).toBe("/explore");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });

  it("recipeStepHref leva à etapa e codifica o retorno", () => {
    expect(recipeStepHref("/content/bolo?x=1")).toBe("/recipes/onboarding?next=%2Fcontent%2Fbolo%3Fx%3D1");
    expect(recipeStepHref("https://evil.example")).toBe("/recipes/onboarding?next=%2Fexplore");
  });
});

describe("Receitas sempre presente no hub do herói", () => {
  it("aparece mesmo sem receitas quando está em always; as outras vazias continuam ocultas", () => {
    const libs = buildCreatorLibraries({ contents: [{ type: "video", pillar: "routine" }], programs: [], products: [], always: ["receitas"] });
    expect(libs.map((l) => l.key)).toEqual(["rotina", "receitas"]);
    expect(libs.find((l) => l.key === "receitas")!.count).toBe(0);
  });

  it("receitas de outro chef entram em Receitas (tipo recipe vence o pilar)", () => {
    const libs = buildCreatorLibraries({ contents: [{ type: "recipe", pillar: "gastronomy" }, { type: "recipe", pillar: "nutrition" }], always: ["receitas"] });
    expect(libs).toHaveLength(1);
    expect(libs[0]).toMatchObject({ key: "receitas", count: 2 });
  });
});
