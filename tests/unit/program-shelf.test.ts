import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  joinMeta,
  nextStepIndex,
  orderShelves,
  pickEnrollment,
  resolveShelfSteps,
  sectionStarts,
  shelfProgress,
  shelfSectionKind,
  shelfStepState,
  stepAccessibleName,
  type ShelfEnrollment,
  type ShelfItemRow,
  type ShelfStepState,
} from "@/lib/catalog/program-shelf";

// Prateleiras de programas: resolução das etapas (= program_required_items), estado de cada
// quadrado, rótulos de seção, progresso, ordem das prateleiras e nome acessível.

const item = (version: string, content: string, position: number, required = true, section: string | null = required ? "Essencial" : "Para ir além"): ShelfItemRow => ({
  version_id: version,
  content_id: content,
  position,
  section,
  is_required: required,
});

describe("resolveShelfSteps", () => {
  const items = [item("v1", "c3", 101, false), item("v1", "c1", 1), item("v2", "x", 1), item("v1", "c2", 2)];

  it("filtra a versão e ordena por position", () => {
    expect(resolveShelfSteps("v1", items, []).map((s) => s.contentId)).toEqual(["c1", "c2", "c3"]);
    expect(resolveShelfSteps("v2", items, []).map((s) => s.contentId)).toEqual(["x"]);
    expect(resolveShelfSteps("v9", items, [])).toEqual([]);
  });

  it("aplica a substituição só da própria versão e guarda o original", () => {
    const steps = resolveShelfSteps("v1", items, [
      { version_id: "v1", original_content_id: "c2", replacement_content_id: "r2" },
      { version_id: "v2", original_content_id: "c1", replacement_content_id: "nope" },
    ]);
    expect(steps.map((s) => [s.contentId, s.originalContentId, s.substituted])).toEqual([
      ["c1", "c1", false],
      ["r2", "c2", true],
      ["c3", "c3", false],
    ]);
  });

  it("empate de position é estável pelo conteúdo e não muta a entrada", () => {
    const tie = [item("v", "b", 1), item("v", "a", 1)];
    expect(resolveShelfSteps("v", tie, []).map((s) => s.contentId)).toEqual(["a", "b"]);
    expect(tie.map((i) => i.content_id)).toEqual(["b", "a"]);
  });
});

describe("shelfStepState", () => {
  const step = { contentId: "c1", originalContentId: "c0" };
  const free = { access_level: "free" as const, required_module_id: null };
  const premium = { access_level: "premium" as const, required_module_id: "m-base" };
  const none = new Set<string>();

  it("conteúdo escondido pela RLS ou sem nível de acesso fica indisponível (mesmo concluído)", () => {
    expect(shelfStepState({ step, content: null, enrolled: true, completedIds: new Set(["c1"]), entitledModules: none })).toBe("unavailable");
    expect(shelfStepState({ step, content: { access_level: null, required_module_id: null }, enrolled: false, completedIds: none, entitledModules: none })).toBe("unavailable");
  });

  it("concluída só para inscrito, pelo conteúdo efetivo ou pelo original", () => {
    expect(shelfStepState({ step, content: free, enrolled: true, completedIds: new Set(["c1"]), entitledModules: none })).toBe("done");
    expect(shelfStepState({ step, content: free, enrolled: true, completedIds: new Set(["c0"]), entitledModules: none })).toBe("done");
    expect(shelfStepState({ step, content: free, enrolled: false, completedIds: new Set(["c1"]), entitledModules: none })).toBe("open");
  });

  it("premium sem o módulo tem cadeado; com o módulo, abre; concluída vence o cadeado", () => {
    expect(shelfStepState({ step, content: premium, enrolled: false, completedIds: none, entitledModules: none })).toBe("locked");
    expect(shelfStepState({ step, content: premium, enrolled: false, completedIds: none, entitledModules: new Set(["m-base"]) })).toBe("open");
    expect(shelfStepState({ step, content: { access_level: "premium", required_module_id: null }, enrolled: false, completedIds: none, entitledModules: new Set(["m-base"]) })).toBe("locked");
    expect(shelfStepState({ step, content: premium, enrolled: true, completedIds: new Set(["c1"]), entitledModules: none })).toBe("done");
  });
});

describe("seções", () => {
  it("reconhece as seções do seed (com e sem acento, caixa) e mantém outras como texto livre", () => {
    expect(shelfSectionKind("Essencial")).toBe("essential");
    expect(shelfSectionKind(" essencial ")).toBe("essential");
    expect(shelfSectionKind("Para ir além")).toBe("beyond");
    expect(shelfSectionKind("PARA IR ALEM")).toBe("beyond");
    expect(shelfSectionKind("Bônus")).toBe("custom");
    expect(shelfSectionKind(null)).toBeNull();
    expect(shelfSectionKind("  ")).toBeNull();
  });

  it("o rótulo aparece só no primeiro quadrado de cada seção", () => {
    expect(sectionStarts([{ section: "Essencial" }, { section: "Essencial" }, { section: "Para ir além" }, { section: "Para ir além" }])).toEqual([true, false, true, false]);
    expect(sectionStarts([{ section: null }, { section: "A" }, { section: "A" }])).toEqual([false, true, false]);
    expect(sectionStarts([])).toEqual([]);
  });
});

describe("progresso e próxima etapa", () => {
  const steps = [{ isRequired: true }, { isRequired: true }, { isRequired: false }, { isRequired: true }];

  it("conta só as obrigatórias, como a página do programa", () => {
    const states: ShelfStepState[] = ["done", "open", "done", "locked"];
    expect(shelfProgress(steps, states)).toEqual({ done: 1, total: 3 });
  });

  it("sem obrigatórias, conta todas", () => {
    expect(shelfProgress([{ isRequired: false }, { isRequired: false }], ["done", "open"])).toEqual({ done: 1, total: 2 });
  });

  it("Continuar leva à primeira obrigatória aberta; senão à primeira opcional aberta; senão nenhuma", () => {
    expect(nextStepIndex(steps, ["done", "locked", "open", "open"])).toBe(3);
    expect(nextStepIndex(steps, ["done", "done", "open", "done"])).toBe(2);
    expect(nextStepIndex(steps, ["done", "done", "done", "locked"])).toBe(-1);
  });
});

describe("inscrição e ordem das prateleiras", () => {
  const e = (program: string, status: ShelfEnrollment["status"], at: string, version = `${program}-v1`): ShelfEnrollment => ({ program_id: program, version_id: version, status, enrolled_at: at });

  it("ativa vence concluída; abandonada não conta", () => {
    const rows = [e("p", "completed", "2026-01-02", "p-v1"), e("p", "active", "2026-01-01", "p-v2"), e("q", "abandoned", "2026-01-03")];
    expect(pickEnrollment(rows, "p")?.version_id).toBe("p-v2");
    expect(pickEnrollment(rows, "q")).toBeNull();
    expect(pickEnrollment(rows, "z")).toBeNull();
    expect(pickEnrollment([e("r", "completed", "2026-01-01", "old"), e("r", "completed", "2026-02-01", "new")], "r")?.version_id).toBe("new");
  });

  it("inscrito em andamento primeiro; o resto mantém a ordem da consulta (destaque, mais recentes)", () => {
    const programs = [{ id: "featured" }, { id: "recent" }, { id: "older" }];
    expect(orderShelves(programs, []).map((p) => p.id)).toEqual(["featured", "recent", "older"]);
    expect(orderShelves(programs, [e("older", "active", "2026-01-01")]).map((p) => p.id)).toEqual(["older", "featured", "recent"]);
    // concluído e abandonado não sobem
    expect(orderShelves(programs, [e("older", "completed", "2026-01-01"), e("recent", "abandoned", "2026-01-01")]).map((p) => p.id)).toEqual(["featured", "recent", "older"]);
  });
});

describe("rótulos", () => {
  it("nome acessível: 'Etapa 2 de 6: Título, concluída' e sem estado quando aberta", () => {
    expect(stepAccessibleName({ position: "Etapa 2 de 6: Ritual matinal", state: "concluída" })).toBe("Etapa 2 de 6: Ritual matinal, concluída");
    expect(stepAccessibleName({ position: "Etapa 1 de 6: Ritual matinal", state: null })).toBe("Etapa 1 de 6: Ritual matinal");
    expect(stepAccessibleName({ position: " Etapa 3 de 6: X ", state: "  " })).toBe("Etapa 3 de 6: X");
  });

  it("meta curta junta só as partes presentes", () => {
    expect(joinMeta(["6 etapas", "2 semanas", "2 de 4 concluídas"])).toBe("6 etapas · 2 semanas · 2 de 4 concluídas");
    expect(joinMeta(["6 etapas", null, undefined, false, ""])).toBe("6 etapas");
  });

  it("mensagens da prateleira nos 3 idiomas com o formato pedido", () => {
    const load = (locale: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "catalog.json"), "utf8")).programShelf;
    expect(load("pt-BR").stepOf).toBe("Etapa {n} de {total}: {title}");
    expect(load("pt-BR").listLabel).toBe("Etapas de {title}");
    for (const locale of ["pt-BR", "en", "es"]) {
      const m = load(locale);
      expect(Object.keys(m).sort()).toEqual(Object.keys(load("pt-BR")).sort());
      expect(m.stepOf).toMatch(/\{n\}.*\{total\}.*\{title\}/);
    }
  });
});
