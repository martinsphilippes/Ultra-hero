import { describe, expect, it } from "vitest";
import { PROGRAM_ITEM_FOREIGN_CONTENT, canUseInProgram, foreignProgramItems } from "@/lib/programs/item-ownership";

const NEYMAR = "11111111-1111-4111-8111-111111111111";
const JOAO = "22222222-2222-4222-8222-222222222222";

describe("canUseInProgram", () => {
  it("programa do herói aceita só conteúdo do próprio herói", () => {
    expect(canUseInProgram(NEYMAR, NEYMAR)).toBe(true);
    expect(canUseInProgram(NEYMAR, JOAO)).toBe(false);
  });

  it("conteúdo sem autor não entra em programa de herói", () => {
    expect(canUseInProgram(NEYMAR, null)).toBe(false);
    expect(canUseInProgram(NEYMAR, undefined)).toBe(false);
  });

  it("programa editorial (sem herói) aceita qualquer conteúdo", () => {
    expect(canUseInProgram(null, JOAO)).toBe(true);
    expect(canUseInProgram(undefined, null)).toBe(true);
  });
});

describe("foreignProgramItems", () => {
  it("devolve, na ordem, só as etapas de outro herói", () => {
    const items = [
      { id: "a", creatorId: NEYMAR },
      { id: "b", creatorId: JOAO },
      { id: "c", creatorId: null },
      { id: "d", creatorId: NEYMAR },
    ];
    expect(foreignProgramItems(NEYMAR, items).map((i) => i.id)).toEqual(["b", "c"]);
    expect(foreignProgramItems(null, items)).toEqual([]);
  });

  it("o código de erro é o mesmo do gatilho do banco", () => {
    expect(PROGRAM_ITEM_FOREIGN_CONTENT).toBe("program_item_foreign_content");
  });
});
