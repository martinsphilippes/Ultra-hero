import { describe, expect, it } from "vitest";
import {
  addMonthsToDay,
  canShowMonth,
  clampDay,
  datePart,
  initialFocusDay,
  initialView,
  isDateKey,
  isDateTimeKey,
  isOutOfRange,
  joinDateTime,
  localTodayKey,
  minuteOptions,
  pickerMoveFocus,
  pickerWeeks,
  splitDateTime,
} from "@/lib/calendar/date-picker";
import { monthWeeks, weekdayIndex } from "@/lib/calendar/grid";

// Seletor de data em calendário (caixa da agenda em todo campo de data): grade, limites, teclado e formatos.

describe("grade do seletor", () => {
  it("começa no domingo e tem sempre 6 semanas", () => {
    // novembro de 2026: dia 1 é domingo
    const weeks = pickerWeeks(2026, 11);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ date: "2026-11-01", day: 1, inMonth: true });
    expect(weeks[0][6].date).toBe("2026-11-07");
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
    expect(weeks[5][6].date).toBe("2026-12-12");
  });

  it("fevereiro de 2026 (começa no domingo, 28 dias) completa 6 semanas com março", () => {
    const weeks = pickerWeeks(2026, 2);
    expect(weeks[0][0].date).toBe("2026-02-01");
    expect(weeks[4][0]).toEqual({ date: "2026-03-01", day: 1, inMonth: false });
    expect(weeks[5][6].date).toBe("2026-03-14");
  });

  it("virada de ano e ano bissexto", () => {
    const dec = pickerWeeks(2026, 12);
    expect(dec[0][0].date).toBe("2026-11-29");
    expect(dec[5][6].date).toBe("2027-01-09");
    expect(pickerWeeks(2028, 2).flat().filter((d) => d.inMonth)).toHaveLength(29);
  });

  it("a agenda continua começando na segunda", () => {
    expect(monthWeeks(2026, 11)[0][0].date).toBe("2026-10-26");
    expect(weekdayIndex("2026-11-01", 0)).toBe(0);
    expect(weekdayIndex("2026-11-01", 1)).toBe(6);
  });
});

describe("formatos sem fuso", () => {
  it("valida chaves de data e data-hora", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("")).toBe(false);
    expect(isDateTimeKey("2026-11-03T09:05")).toBe(true);
    expect(isDateTimeKey("2026-11-03T09:05:30")).toBe(true);
    expect(isDateTimeKey("2026-11-03T24:00")).toBe(false);
    expect(isDateTimeKey("2026-11-03")).toBe(false);
  });

  it("separa e junta data e hora", () => {
    expect(splitDateTime("2026-11-03T18:40")).toEqual({ date: "2026-11-03", time: "18:40" });
    expect(splitDateTime("2026-11-03")).toEqual({ date: "2026-11-03", time: "" });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(joinDateTime("2026-11-03", "07:15")).toBe("2026-11-03T07:15");
    expect(joinDateTime("2026-11-03", "")).toBe("2026-11-03T09:00");
    expect(joinDateTime("", "07:15")).toBe("");
    expect(datePart("2026-11-03T07:15")).toBe("2026-11-03");
  });

  it("hoje vem do relógio local, não de UTC", () => {
    // 23h30 do dia 3 no horário local continua sendo dia 3 (em UTC já seria dia 4 no Brasil)
    expect(localTodayKey(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03");
    expect(localTodayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

describe("limites min/max", () => {
  it("marca dias fora do intervalo e prende o foco", () => {
    expect(isOutOfRange("2026-11-02", "2026-11-03")).toBe(true);
    expect(isOutOfRange("2026-11-03", "2026-11-03")).toBe(false);
    expect(isOutOfRange("2026-11-10", undefined, "2026-11-09")).toBe(true);
    expect(isOutOfRange("2026-11-10", "2026-11-03T10:00", "2026-11-30T08:00")).toBe(false);
    expect(clampDay("2026-10-01", "2026-11-03")).toBe("2026-11-03");
    expect(clampDay("2026-12-01", null, "2026-11-30")).toBe("2026-11-30");
  });

  it("abre no valor, senão em hoje, sempre dentro dos limites", () => {
    expect(initialFocusDay("2027-01-15", "2026-11-03")).toBe("2027-01-15");
    expect(initialFocusDay("", "2026-11-03")).toBe("2026-11-03");
    expect(initialFocusDay("", "2026-11-03", "2026-12-10")).toBe("2026-12-10");
    expect(initialView("", "2026-11-03", undefined, "2026-09-01")).toEqual({ year: 2026, month: 9 });
  });

  it("só deixa ir para meses que têm algum dia permitido", () => {
    expect(canShowMonth(2026, 10, "2026-11-03")).toBe(false);
    expect(canShowMonth(2026, 11, "2026-11-03")).toBe(true);
    expect(canShowMonth(2027, 1, undefined, "2026-12-31")).toBe(false);
    expect(canShowMonth(1999, 1)).toBe(true);
  });
});

describe("teclado", () => {
  it("setas atravessam semana, mês e ano", () => {
    expect(pickerMoveFocus("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(pickerMoveFocus("2027-01-01", "ArrowLeft")).toBe("2026-12-31");
    expect(pickerMoveFocus("2026-11-03", "ArrowDown")).toBe("2026-11-10");
    expect(pickerMoveFocus("2026-11-03", "ArrowUp")).toBe("2026-10-27");
  });

  it("Home/End vão para domingo/sábado; PageUp/PageDown trocam de mês", () => {
    // 2026-11-04 é quarta
    expect(pickerMoveFocus("2026-11-04", "Home")).toBe("2026-11-01");
    expect(pickerMoveFocus("2026-11-04", "End")).toBe("2026-11-07");
    expect(pickerMoveFocus("2027-01-31", "PageDown")).toBe("2027-02-28");
    expect(pickerMoveFocus("2026-03-31", "PageUp")).toBe("2026-02-28");
    expect(pickerMoveFocus("2026-11-04", "PageDown", { shiftKey: true })).toBe("2027-11-04");
    expect(addMonthsToDay("2028-03-31", -1)).toBe("2028-02-29");
  });

  it("não sai dos limites e ignora outras teclas", () => {
    expect(pickerMoveFocus("2026-11-03", "ArrowLeft", { min: "2026-11-03" })).toBe("2026-11-03");
    expect(pickerMoveFocus("2026-11-28", "ArrowDown", { max: "2026-11-30" })).toBe("2026-11-30");
    expect(pickerMoveFocus("2026-11-03", "a")).toBeNull();
  });
});

describe("hora", () => {
  it("minutos de 5 em 5, mantendo um minuto fora do passo", () => {
    expect(minuteOptions()).toHaveLength(12);
    expect(minuteOptions(5, "07")).toContain("07");
    expect(minuteOptions(5, "07").indexOf("07")).toBe(2);
    expect(minuteOptions(15)).toEqual(["00", "15", "30", "45"]);
  });
});
