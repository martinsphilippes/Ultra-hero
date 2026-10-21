import { describe, expect, it } from "vitest";
import { itemsForDate, pickProgramSuggestions, rhythmCounter, shortTime, sortRoutine, timeToMinutes, weekdayOf, type EnrollmentLike, type RoutineItemLike } from "@/lib/routine/today";

// Lógica pura do "Hoje" (Perfil): filtro por dia da semana, ordenação, sugestões de programa e contador.

function item(overrides: Partial<RoutineItemLike> & { id: string }): RoutineItemLike {
  return { title: overrides.id, note: null, time_of_day: null, weekdays: null, active: true, sort_order: 100, ...overrides };
}

describe("weekdayOf", () => {
  it("usa 0 = domingo … 6 = sábado sem depender do fuso do servidor", () => {
    expect(weekdayOf("2026-10-18")).toBe(0); // domingo
    expect(weekdayOf("2026-10-21")).toBe(3); // quarta
    expect(weekdayOf("2026-10-24")).toBe(6); // sábado
  });

  it("rejeita data fora do formato YYYY-MM-DD", () => {
    expect(() => weekdayOf("21/10/2026")).toThrow();
  });
});

describe("itemsForDate", () => {
  const items = [
    item({ id: "all" }),
    item({ id: "weekdays", weekdays: [1, 2, 3, 4, 5] }),
    item({ id: "sunday", weekdays: [0] }),
    item({ id: "inactive", active: false }),
    item({ id: "saturday", weekdays: [6] }),
  ];

  it("numa quarta devolve os de todos os dias e os de dias úteis, nunca os inativos", () => {
    expect(itemsForDate(items, "2026-10-21").map((i) => i.id)).toEqual(["all", "weekdays"]);
  });

  it("num domingo devolve todos os dias + domingo", () => {
    expect(itemsForDate(items, "2026-10-18").map((i) => i.id)).toEqual(["all", "sunday"]);
  });

  it("num sábado devolve todos os dias + sábado", () => {
    expect(itemsForDate(items, "2026-10-24").map((i) => i.id)).toEqual(["all", "saturday"]);
  });
});

describe("timeToMinutes / shortTime", () => {
  it("aceita HH:MM e HH:MM:SS (coluna time) e rejeita inválidos", () => {
    expect(timeToMinutes("07:30")).toBe(450);
    expect(timeToMinutes("07:30:00")).toBe(450);
    expect(timeToMinutes("7:05")).toBe(425);
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("abc")).toBeNull();
  });

  it("shortTime normaliza para HH:MM", () => {
    expect(shortTime("07:30:00")).toBe("07:30");
    expect(shortTime("7:05")).toBe("07:05");
    expect(shortTime(null)).toBeNull();
  });
});

describe("sortRoutine", () => {
  it("com horário primeiro (crescente), depois sem horário por sort_order e título", () => {
    const sorted = sortRoutine([
      item({ id: "z", title: "Zeta", sort_order: 100 }),
      item({ id: "late", time_of_day: "21:00:00" }),
      item({ id: "a", title: "Alfa", sort_order: 100 }),
      item({ id: "early", time_of_day: "06:15:00" }),
      item({ id: "first", title: "Último no nome", sort_order: 1 }),
      item({ id: "noon", time_of_day: "12:00:00" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["early", "noon", "late", "first", "a", "z"]);
  });

  it("não altera a lista original", () => {
    const list = [item({ id: "b", time_of_day: "10:00" }), item({ id: "a", time_of_day: "09:00" })];
    sortRoutine(list);
    expect(list.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("pickProgramSuggestions", () => {
  const content = (id: string) => ({ id, slug: `slug-${id}`, title: `Título ${id}`, cover_url: null, creatorName: "Helena" });
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
    expect(picked[0]).toMatchObject({ enrollmentId: "A", programName: "Programa A", programSlug: "programa-A", contentSlug: "slug-a3", creatorName: "Helena" });
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
