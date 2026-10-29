import { describe, expect, it } from "vitest";
import { RECIPE_CHECKLIST_CODES } from "@/lib/recipes/codes";
import { CHECKLIST_STEP, checklistTarget, MEDIA_GALLERY_SECTION_ID, stepForPath } from "@/lib/recipes/editor-steps";

describe("Revisão → etapa: para onde cada item do checklist leva", () => {
  it("todo item tem etapa e alvo", () => {
    for (const code of RECIPE_CHECKLIST_CODES) {
      expect(CHECKLIST_STEP[code], code).toBeTruthy();
      expect(checklistTarget(code), code).toMatch(/^recipe-/);
    }
  });
  it("o alvo de campo fica na mesma etapa do item", () => {
    const fieldTargets = { title: "content.title", summary: "content.summary", servings: "details.servings", times: "details.total_minutes", allergens: "details.allergens_declared", license: "content.media_license_kind", category: "categories" } as const;
    for (const [code, path] of Object.entries(fieldTargets)) {
      expect(stepForPath(path), code).toBe(CHECKLIST_STEP[code as keyof typeof fieldTargets]);
    }
  });
  it("texto alternativo: vai direto à primeira foto sem texto; sem ela, à Galeria", () => {
    expect(checklistTarget("gallery_alt", { firstGalleryWithoutAlt: 2 })).toBe("recipe-media-2-alt_text");
    expect(checklistTarget("gallery_alt")).toBe(MEDIA_GALLERY_SECTION_ID);
    expect(checklistTarget("cover")).toBe(MEDIA_GALLERY_SECTION_ID);
  });
});
