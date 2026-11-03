import { describe, expect, it } from "vitest";
import { distinctKinds, eventDays, gridRange, groupEventsByDay, initialDay, mondayIndex, monthWeeks, moveFocus, queryRange, zonedDayKey } from "@/lib/calendar/grid";

// Bloco 9: calendário em grade (semanas do mês começando na segunda, eventos por dia no fuso, vários dias).

const SP = "America/Sao_Paulo";

describe("semanas do mês", () => {
  it("começa na segunda e termina no domingo, com vizinhos fora do mês", () => {
    // novembro de 2026: dia 1 é domingo
    const weeks = monthWeeks(2026, 11);
    expect(weeks[0][0]).toEqual({ date: "2026-10-26", day: 26, inMonth: false });
    expect(weeks[0][6]).toEqual({ date: "2026-11-01", day: 1, inMonth: true });
    expect(weeks.at(-1)?.[6].date).toBe("2026-12-06");
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it("mês que começa na segunda e cabe em 4 semanas", () => {
    // fevereiro de 2027: dia 1 é segunda, 28 dias
    const weeks = monthWeeks(2027, 2);
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0].date).toBe("2027-02-01");
    expect(gridRange(2027, 2)).toEqual({ first: "2027-02-01", last: "2027-02-28" });
  });

  it("ano bissexto e virada de ano", () => {
    expect(monthWeeks(2028, 2).flat().filter((d) => d.inMonth)).toHaveLength(29);
    expect(gridRange(2026, 12)).toEqual({ first: "2026-11-30", last: "2027-01-03" });
    expect(mondayIndex("2026-11-02")).toBe(0);
    expect(mondayIndex("2026-11-01")).toBe(6);
  });

  it("intervalo da consulta cobre a grade com folga de fuso", () => {
    expect(queryRange(2026, 11)).toEqual({ from: "2026-10-25T00:00:00.000Z", to: "2026-12-08T00:00:00.000Z" });
  });
});

describe("eventos por dia no fuso", () => {
  it("o dia é o do fuso, não o UTC", () => {
    expect(zonedDayKey("2026-11-10T02:00:00Z", SP)).toBe("2026-11-09");
    expect(zonedDayKey("2026-11-10T02:00:00Z", "UTC")).toBe("2026-11-10");
  });

  it("evento pontual ocupa um dia; fim à meia-noite não vaza", () => {
    expect(eventDays({ startsAt: "2026-11-10T12:00:00Z", endsAt: "2026-11-10T12:00:00Z", allDay: false }, SP)).toEqual(["2026-11-10"]);
    // 22h às 0h (SP) fica só no dia 10
    expect(eventDays({ startsAt: "2026-11-11T01:00:00Z", endsAt: "2026-11-11T03:00:00Z", allDay: false }, SP)).toEqual(["2026-11-10"]);
    // fim antes do início (dado ruim) não quebra
    expect(eventDays({ startsAt: "2026-11-10T12:00:00Z", endsAt: "2026-11-09T12:00:00Z", allDay: false }, SP)).toEqual(["2026-11-10"]);
  });

  it("dia inteiro de vários dias aparece em cada dia (fim exclusivo)", () => {
    // 10 a 12/11 em SP: 10/11 00:00-03 até 13/11 00:00-03
    const e = { startsAt: "2026-11-10T03:00:00Z", endsAt: "2026-11-13T03:00:00Z", allDay: true };
    expect(eventDays(e, SP)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  });

  it("com hora atravessando a meia-noite ocupa os dois dias", () => {
    expect(eventDays({ startsAt: "2026-11-10T23:00:00Z", endsAt: "2026-11-11T05:00:00Z", allDay: false }, SP)).toEqual(["2026-11-10", "2026-11-11"]);
  });

  it("agrupa, ordena (dia inteiro antes, depois horário) e respeita a grade", () => {
    const events = [
      { id: "b", kind: "meeting", title: "Reunião", startsAt: "2026-11-10T17:00:00Z", endsAt: "2026-11-10T18:00:00Z", allDay: false },
      { id: "a", kind: "campaign", title: "Campanha", startsAt: "2026-10-20T03:00:00Z", endsAt: "2026-11-11T03:00:00Z", allDay: true },
      { id: "c", kind: "recording", title: "Gravação", startsAt: "2026-11-10T12:00:00Z", endsAt: "2026-11-10T13:00:00Z", allDay: false },
    ];
    const map = groupEventsByDay(events, SP, gridRange(2026, 11));
    expect(map.get("2026-11-10")?.map((e) => e.id)).toEqual(["a", "c", "b"]);
    expect(map.get("2026-10-26")?.map((e) => e.id)).toEqual(["a"]);
    expect(map.has("2026-10-25")).toBe(false); // antes da grade
    expect(map.has("2026-11-11")).toBe(false); // fim exclusivo
    expect(distinctKinds(map.get("2026-11-10") ?? [], 2)).toEqual(["campaign", "recording"]);
  });
});

describe("teclado e seleção", () => {
  const range = gridRange(2026, 11);
  it("setas andam dia/semana; Home/End vão ao início/fim da semana; presas à grade", () => {
    expect(moveFocus("2026-11-10", "ArrowRight", range)).toBe("2026-11-11");
    expect(moveFocus("2026-11-10", "ArrowLeft", range)).toBe("2026-11-09");
    expect(moveFocus("2026-11-10", "ArrowDown", range)).toBe("2026-11-17");
    expect(moveFocus("2026-11-10", "ArrowUp", range)).toBe("2026-11-03");
    expect(moveFocus("2026-11-11", "Home", range)).toBe("2026-11-09");
    expect(moveFocus("2026-11-11", "End", range)).toBe("2026-11-15");
    expect(moveFocus("2026-10-26", "ArrowLeft", range)).toBe("2026-10-26");
    expect(moveFocus("2026-12-06", "ArrowDown", range)).toBe("2026-12-06");
    expect(moveFocus("2026-11-10", "Enter", range)).toBeNull();
  });

  it("dia inicial: pedido válido, hoje no mês, primeiro com evento, ou dia 1", () => {
    expect(initialDay(2026, 11, "2026-11-03", [], "2026-11-20")).toBe("2026-11-20");
    expect(initialDay(2026, 11, "2026-11-03", [], "2027-01-20")).toBe("2026-11-03");
    expect(initialDay(2026, 11, "2026-11-03", [], "lixo")).toBe("2026-11-03");
    expect(initialDay(2026, 12, "2026-11-03", ["2026-11-30", "2026-12-15", "2026-12-04"])).toBe("2026-12-04");
    expect(initialDay(2026, 12, "2026-11-03", [])).toBe("2026-12-01");
  });
});
