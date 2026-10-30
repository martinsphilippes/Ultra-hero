import { describe, expect, it } from "vitest";
import { pickProgramSuggestions, rhythmCounter, type EnrollmentLike } from "@/lib/routine/today";

// Itens de rotina manuais saíram do Hoje (F1 do Hoje com relógio): ficam só as sugestões dos programas.
describe("pickProgramSuggestions", () => {
  const content = (id: string) => ({ id, slug: `slug-${id}`, title: `Título ${id}`, cover_url: null, creatorName: "Érick" });
  const enrollment = (id: string, status: EnrollmentLike["status"], contents: Array<[string, boolean]>): EnrollmentLike => ({
    id,
    status,
    programName: `Programa ${id}`,
    programSlug: `programa-${id}`,
    items: contents.map(([cid, required], index) => ({ position: contents.length - index, is_required: required, content: content(cid) })),
  });

  it("devolve só obrigatórios não concluídos, em ordem de posição, até 2 por programa e 3 no total", () => {
    const enrollments = [
      // posições decrescentes na construção: p1 = pos 4, p2 = pos 3, p3 = pos 2, p4 = pos 1
      enrollment("A", "active", [["a1", true], ["a2", true], ["a3", true], ["a4", true]]),
      enrollment("B", "active", [["b1", true], ["b2", false], ["b3", true]]),
      enrollment("C", "active", [["c1", true]]),
    ];
    const picked = pickProgramSuggestions(enrollments, ["a4"]);
    expect(picked.map((s) => s.contentId)).toEqual(["a3", "a2", "b3"]);
    expect(picked[0]).toMatchObject({ enrollmentId: "A", programName: "Programa A", programSlug: "programa-A", contentSlug: "slug-a3", creatorName: "Érick" });
  });

  it("ignora inscrições concluídas ou abandonadas, itens sem conteúdo e conteúdo repetido entre programas", () => {
    const shared: EnrollmentLike[] = [
      enrollment("done", "completed", [["x1", true]]),
      enrollment("gone", "abandoned", [["x2", true]]),
      { ...enrollment("A", "active", [["s1", true]]), items: [{ position: 1, is_required: true, content: null }, { position: 2, is_required: true, content: content("s1") }] },
      enrollment("B", "active", [["s1", true], ["b2", true]]),
    ];
    expect(pickProgramSuggestions(shared, []).map((s) => s.contentId)).toEqual(["s1", "b2"]);
  });

  it("respeita max e perProgram personalizados e devolve vazio sem inscrições", () => {
    const enrollments = [enrollment("A", "active", [["a1", true], ["a2", true], ["a3", true]])];
    expect(pickProgramSuggestions(enrollments, [], 5, 3)).toHaveLength(3);
    expect(pickProgramSuggestions(enrollments, [], 1)).toHaveLength(1);
    expect(pickProgramSuggestions([], [])).toEqual([]);
  });
});

describe("rhythmCounter", () => {
  it("formata feito/total e marca completo só quando total > 0", () => {
    expect(rhythmCounter(0, 2)).toEqual({ done: 0, total: 2, label: "0/2", complete: false });
    expect(rhythmCounter(2, 2)).toEqual({ done: 2, total: 2, label: "2/2", complete: true });
    expect(rhythmCounter(0, 0)).toEqual({ done: 0, total: 0, label: "0/0", complete: false });
  });

  it("limita a 0..total e tolera valores estranhos", () => {
    expect(rhythmCounter(5, 2).label).toBe("2/2");
    expect(rhythmCounter(-1, 2).label).toBe("0/2");
    expect(rhythmCounter(Number.NaN, Number.POSITIVE_INFINITY).label).toBe("0/0");
    expect(rhythmCounter(1.9, 3.7).label).toBe("1/3");
  });
});
