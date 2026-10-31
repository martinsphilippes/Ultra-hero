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

  it("agrupa por seção na ordem em que cada uma aparece, como a página do programa (seções intercaladas)", () => {
    // o admin pode adicionar A (Essencial), B (Para ir além) e C (Essencial): a página mostra A, C, B
    const mixed = [item("v", "A", 1, true, "Essencial"), item("v", "B", 2, false, "Para ir além"), item("v", "C", 3, true, "Essencial")];
    const steps = resolveShelfSteps("v", mixed, []);
    expect(steps.map((s) => s.contentId)).toEqual(["A", "C", "B"]);
    // e o rótulo de cada seção aparece uma vez só
    expect(sectionStarts(steps)).toEqual([true, false, true]);
    // sem seção conta como um grupo próprio, na posição em que aparece
    const loose = [item("v", "x", 1, true, null), item("v", "y", 2, true, "Essencial"), item("v", "z", 3, true, null)];
    expect(resolveShelfSteps("v", loose, []).map((s) => s.contentId)).toEqual(["x", "z", "y"]);
  });

  it("empate de position é estável pelo conteúdo e não muta a entrada", () => {
    const tie = [item("v", "b", 1), item("v", "a", 1)];
    expect(resolveShelfSteps("v", tie, []).map((s) => s.contentId)).toEqual(["a", "b"]);
    expect(tie.map((i) => i.content_id)).toEqual(["b", "a"]);
  });
});

describe("shelfStepState", () => {
  const step = { contentId: "c1", originalContentId: "c0" };
  const free = { access_level: "free" as const };
  const none = new Set<string>();

  it("conteúdo escondido pela RLS ou sem nível de acesso fica indisponível", () => {
    expect(shelfStepState({ step, content: null, enrolled: true, completedIds: none })).toBe("unavailable");
    expect(shelfStepState({ step, content: null, enrolled: false, completedIds: new Set(["c1"]) })).toBe("unavailable");
    expect(shelfStepState({ step, content: { access_level: null }, enrolled: false, completedIds: none })).toBe("unavailable");
  });

  it("inscrito que já concluiu uma etapa que saiu do ar continua com ela concluída (= página do programa)", () => {
    expect(shelfStepState({ step, content: null, enrolled: true, completedIds: new Set(["c1"]) })).toBe("done");
    expect(shelfStepState({ step, content: null, enrolled: true, completedIds: new Set(["c0"]) })).toBe("done");
  });

  it("concluída só para inscrito, pelo conteúdo efetivo ou pelo original", () => {
    expect(shelfStepState({ step, content: free, enrolled: true, completedIds: new Set(["c1"]) })).toBe("done");
    expect(shelfStepState({ step, content: free, enrolled: true, completedIds: new Set(["c0"]) })).toBe("done");
    expect(shelfStepState({ step, content: free, enrolled: false, completedIds: new Set(["c1"]) })).toBe("open");
  });

  it("app gratuito (0069): conteúdo no ar sempre abre (nenhum cadeado por plano)", () => {
    expect(shelfStepState({ step, content: free, enrolled: false, completedIds: none })).toBe("open");
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
    const states: ShelfStepState[] = ["done", "open", "done", "unavailable"];
    expect(shelfProgress(steps, states)).toEqual({ done: 1, total: 3 });
  });

  it("obrigatória concluída que saiu do ar continua contando (2 de 4, como a página e check_program_completion)", () => {
    // Manhãs com Intenção: obrigatórias r1, r4, r2, r9; concluiu r1 e r4; o admin arquivou r4
    const ids = ["r1", "r4", "r2", "r9"];
    const done = new Set(["r1", "r4"]);
    const states = ids.map((id) =>
      shelfStepState({ step: { contentId: id, originalContentId: id }, content: id === "r4" ? null : { access_level: "free" }, enrolled: true, completedIds: done }),
    );
    expect(states).toEqual(["done", "done", "open", "open"]);
    expect(shelfProgress(ids.map(() => ({ isRequired: true })), states)).toEqual({ done: 2, total: 4 });
  });

  it("sem obrigatórias, conta todas", () => {
    expect(shelfProgress([{ isRequired: false }, { isRequired: false }], ["done", "open"])).toEqual({ done: 1, total: 2 });
  });

  it("Continuar leva à primeira obrigatória aberta; senão à primeira opcional aberta; senão nenhuma", () => {
    expect(nextStepIndex(steps, ["done", "unavailable", "open", "open"])).toBe(3);
    expect(nextStepIndex(steps, ["done", "done", "open", "done"])).toBe(2);
    expect(nextStepIndex(steps, ["done", "done", "done", "unavailable"])).toBe(-1);
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

describe("selo 'Concluída' legível nos dois temas", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const source = readFileSync(path.join(process.cwd(), "src/components/programs/ProgramShelf.tsx"), "utf8");
  // :root é o escuro; [data-theme="light"] é o claro
  const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
  const token = (selector: string, name: string) => block(selector).match(new RegExp(`--uh-${name}:\\s*(#[0-9a-f]{6})`, "i"))![1];
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("usa bg-success com text-bg (branco daria 1,87:1 no escuro)", () => {
    const badge = source.split("\n").find((line) => line.includes('data-testid="shelf-done-badge"'))!;
    expect(badge).toContain("bg-success");
    expect(badge).toContain("text-bg");
    expect(badge).not.toContain("text-white");
    expect(contrast("#ffffff", token(":root", "success"))).toBeLessThan(4.5);
  });

  it("text-bg sobre bg-success passa 4,5:1 no escuro e no claro", () => {
    for (const selector of [":root", ':root[data-theme="light"]']) {
      expect(contrast(token(selector, "bg"), token(selector, "success")), selector).toBeGreaterThanOrEqual(4.5);
    }
  });
});
