import { describe, expect, it } from "vitest";
import {
  BLOCK_KINDS,
  MENU_OPTIONS_MAX,
  NUTRITION_ITEMS_MAX,
  PILLAR_BLOCK,
  PILLAR_BLOCK_KINDS,
  PROGRAM_NOTE_MAX,
  WORKOUT_STEPS_MAX,
  draftIsEmpty,
  draftToBlock,
  draftsFromBlocks,
  emptyDrafts,
  parsePostBlock,
  pillarBlockSchema,
  postBlockSchema,
  programDraftToBlock,
  workoutProgress,
} from "@/lib/post-blocks/schema";

// Blocos por pilar do Novo post (0075) e programa (0076): lógica pura compartilhada por composer,
// formulário do admin, actions e página. As regras do banco (dono, forma, referências, dois slots,
// marcação por pessoa) são testadas de verdade no S82 e no S83.

const R1 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const P1 = "5d1f5c2e-3b8a-4c7d-9e0f-1a2b3c4d5e6f";
const G1 = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("pilar → bloco", () => {
  it("Rotina não abre bloco; Treino, Nutrição e Gastronomia abrem o seu; programa é slot à parte", () => {
    expect(PILLAR_BLOCK).toEqual({ routine: null, training: "workout", nutrition: "nutrition", gastronomy: "menu" });
    expect(PILLAR_BLOCK_KINDS).toEqual(["workout", "nutrition", "menu"]);
    expect(BLOCK_KINDS).toEqual(["workout", "nutrition", "menu", "program"]);
  });

  it("rascunho vazio (ou Rotina) publica sem bloco", () => {
    const drafts = emptyDrafts();
    expect(draftIsEmpty("workout", drafts)).toBe(true);
    expect(draftIsEmpty("nutrition", drafts)).toBe(true);
    expect(draftIsEmpty("menu", drafts)).toBe(true);
    expect(draftToBlock("routine", drafts)).toEqual({ ok: true, block: null });
    expect(draftToBlock("training", drafts)).toEqual({ ok: true, block: null });
    expect(draftToBlock("gastronomy", drafts)).toEqual({ ok: true, block: null });
  });

  it("treino: passos em branco saem, ao menos um fica; só a explicação sem passo é erro", () => {
    const drafts = emptyDrafts();
    drafts.workout = { description: "Aquecer 5 min", steps: ["10 agachamentos", "", "  ", "1 min de prancha"] };
    expect(draftToBlock("training", drafts)).toEqual({ ok: true, block: { kind: "workout", data: { description: "Aquecer 5 min", steps: [{ text: "10 agachamentos" }, { text: "1 min de prancha" }] } } });
    drafts.workout = { description: "Só explicação", steps: ["", ""] };
    expect(draftToBlock("training", drafts)).toEqual({ ok: false, error: "workout_steps" });
    drafts.workout = { description: "", steps: Array.from({ length: WORKOUT_STEPS_MAX + 1 }, (_, i) => `passo ${i}`) };
    expect(draftToBlock("training", drafts)).toEqual({ ok: false, error: "invalid_block" });
  });

  it("nutrição: receita, produto e prato; limite de itens", () => {
    const drafts = emptyDrafts();
    drafts.nutrition = { items: [{ kind: "recipe", content_id: R1 }, { kind: "product", product_id: P1 }, { kind: "dish", name: "Salada", description: "" }] };
    const result = draftToBlock("nutrition", drafts);
    expect(result.ok && result.block?.kind).toBe("nutrition");
    drafts.nutrition = { items: Array.from({ length: NUTRITION_ITEMS_MAX + 1 }, () => ({ kind: "dish" as const, name: "x", description: "" })) };
    expect(draftToBlock("nutrition", drafts)).toEqual({ ok: false, error: "nutrition_items" });
  });

  it("cardápio: opção sem nome é erro; linha vazia no fim é descartada; limite de opções", () => {
    const drafts = emptyDrafts();
    drafts.menu = { options: [{ name: "Risoto", description: "de cogumelos", recipe_id: R1 }, { name: "", description: "", recipe_id: null }] };
    expect(draftToBlock("gastronomy", drafts)).toEqual({ ok: true, block: { kind: "menu", data: { options: [{ name: "Risoto", description: "de cogumelos", recipe_id: R1 }] } } });
    drafts.menu = { options: [{ name: "", description: "descrição sem nome", recipe_id: null }] };
    expect(draftToBlock("gastronomy", drafts)).toEqual({ ok: false, error: "menu_name" });
    drafts.menu = { options: Array.from({ length: MENU_OPTIONS_MAX + 1 }, (_, i) => ({ name: `op ${i}`, description: "", recipe_id: null })) };
    expect(draftToBlock("gastronomy", drafts)).toEqual({ ok: false, error: "invalid_block" });
  });
});

describe("programa (0076)", () => {
  it("sem programa escolhido não há bloco (a nota sozinha não vale); com programa, id e nota aparada", () => {
    const drafts = emptyDrafts();
    expect(programDraftToBlock(drafts)).toEqual({ ok: true, block: null });
    drafts.program = { program_id: null, note: "só a nota" };
    expect(programDraftToBlock(drafts)).toEqual({ ok: true, block: null });
    drafts.program = { program_id: G1, note: "  Comece pela semana 1  " };
    expect(programDraftToBlock(drafts)).toEqual({ ok: true, block: { kind: "program", data: { program_id: G1, note: "Comece pela semana 1" } } });
    drafts.program = { program_id: "nao-uuid", note: "" };
    expect(programDraftToBlock(drafts)).toEqual({ ok: false, error: "invalid_block" });
    drafts.program = { program_id: G1, note: "n".repeat(PROGRAM_NOTE_MAX + 1) };
    expect(programDraftToBlock(drafts)).toEqual({ ok: false, error: "invalid_block" });
  });

  it("o post rápido só aceita bloco do pilar; o conteúdo estruturado aceita também o programa", () => {
    const program = { kind: "program", data: { program_id: G1, note: "" } };
    expect(pillarBlockSchema.safeParse(program).success).toBe(false);
    expect(postBlockSchema.safeParse(program).success).toBe(true);
    expect(postBlockSchema.safeParse({ kind: "program", data: { program_id: G1 } }).success).toBe(false);
  });

  it("blocos gravados viram rascunhos para edição; os ausentes ficam vazios", () => {
    const drafts = draftsFromBlocks([
      { kind: "workout", data: { description: "Semana 1", steps: [{ text: "Correr" }, { text: "Alongar" }] } },
      { kind: "program", data: { program_id: G1, note: "Siga o programa" } },
    ]);
    expect(drafts.workout).toEqual({ description: "Semana 1", steps: ["Correr", "Alongar"] });
    expect(drafts.program).toEqual({ program_id: G1, note: "Siga o programa" });
    expect(drafts.nutrition).toEqual({ items: [] });
    expect(drafts.menu.options).toHaveLength(1);
    expect(draftsFromBlocks([])).toEqual(emptyDrafts());
  });
});

describe("linha do banco e progresso", () => {
  it("parsePostBlock aceita o que o banco guarda e ignora lixo", () => {
    expect(parsePostBlock({ kind: "workout", data: { description: "", steps: [{ text: "a" }] } })).toEqual({ kind: "workout", data: { description: "", steps: [{ text: "a" }] } });
    expect(parsePostBlock({ kind: "menu", data: { options: [{ name: "x", description: "", recipe_id: null }] } })?.kind).toBe("menu");
    expect(parsePostBlock({ kind: "program", data: { program_id: G1, note: "" } })?.kind).toBe("program");
    expect(parsePostBlock({ kind: "workout", data: { steps: [] } })).toBeNull();
    expect(parsePostBlock({ kind: "outro", data: {} })).toBeNull();
    expect(postBlockSchema.safeParse({ kind: "nutrition", data: { items: [{ kind: "recipe", content_id: "nao-uuid" }] } }).success).toBe(false);
  });

  it("progresso conta só índices válidos, sem repetir", () => {
    const data = { description: "", steps: [{ text: "a" }, { text: "b" }, { text: "c" }] };
    expect(workoutProgress(data, [0, 2, 2, 7, -1])).toEqual({ done: 2, total: 3 });
    expect(workoutProgress(data, [])).toEqual({ done: 0, total: 3 });
  });
});
