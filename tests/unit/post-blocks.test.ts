import { describe, expect, it } from "vitest";
import {
  BLOCK_KINDS,
  MENU_OPTIONS_MAX,
  NUTRITION_ITEMS_MAX,
  PILLAR_BLOCK,
  WORKOUT_STEPS_MAX,
  draftIsEmpty,
  draftToBlock,
  emptyDrafts,
  parsePostBlock,
  postBlockSchema,
  workoutProgress,
} from "@/lib/post-blocks/schema";

// Blocos por pilar do Novo post (0075): lógica pura compartilhada por composer, actions e página.
// As regras do banco (dono, forma, referências, marcação por pessoa) são testadas de verdade no S82.

const R1 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const P1 = "5d1f5c2e-3b8a-4c7d-9e0f-1a2b3c4d5e6f";

describe("pilar → bloco", () => {
  it("Rotina não abre bloco; Treino, Nutrição e Gastronomia abrem o seu", () => {
    expect(PILLAR_BLOCK).toEqual({ routine: null, training: "workout", nutrition: "nutrition", gastronomy: "menu" });
    expect(BLOCK_KINDS).toEqual(["workout", "nutrition", "menu"]);
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

describe("linha do banco e progresso", () => {
  it("parsePostBlock aceita o que o banco guarda e ignora lixo", () => {
    expect(parsePostBlock({ kind: "workout", data: { description: "", steps: [{ text: "a" }] } })).toEqual({ kind: "workout", data: { description: "", steps: [{ text: "a" }] } });
    expect(parsePostBlock({ kind: "menu", data: { options: [{ name: "x", description: "", recipe_id: null }] } })?.kind).toBe("menu");
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
