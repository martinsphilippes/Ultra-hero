import { describe, expect, it } from "vitest";
import { buildIcs, icsDate, icsDateTime, icsEscape, icsFold, monthKey, parseMonth, plusDays, shiftMonth } from "@/lib/calendar/ics";
import { eventSchema } from "@/lib/calendar/vocab";

// P1b (0067): iCalendar puro (datas UTC, dia inteiro, escape, dobra de linha) e o mês da agenda.

describe("ics", () => {
  it("datas em UTC e dia civil no fuso", () => {
    expect(icsDateTime("2026-11-10T14:30:00-03:00")).toBe("20261110T173000Z");
    expect(icsDate("2026-11-10T02:00:00Z", "America/Sao_Paulo")).toBe("20261109");
  });

  it("escapa vírgula, ponto e vírgula, barra e quebra de linha", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(icsEscape("x\ry\u0007z")).toBe("x\\nyz");
  });

  it("dobra linhas longas em 75 octetos com continuação por espaço", () => {
    const folded = icsFold(`SUMMARY:${"x".repeat(100)}`);
    const lines = folded.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(new TextEncoder().encode(lines[0]).length).toBeLessThanOrEqual(75);
    expect(lines[1].startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"x".repeat(100)}`);
    // acentos contam em bytes, não em caracteres
    const acc = icsFold(`DESCRIPTION:${"ã".repeat(60)}`);
    for (const line of acc.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("calendário com evento de hora e de dia inteiro (fim exclusivo), sem valores", () => {
    const ics = buildIcs(
      [
        { id: "e1", title: "Reunião; marca", startsAt: "2026-11-10T13:00:00Z", endsAt: "2026-11-10T14:00:00Z", allDay: false, location: "Sala 1", description: "Pauta, roteiro" },
        { id: "e2", title: "Campanha", subtitle: "Atleta Exemplo", startsAt: "2026-11-20T03:00:00Z", endsAt: "2026-11-23T03:00:00Z", allDay: true },
      ],
      { calendarName: "Teste", timeZone: "America/Sao_Paulo", now: new Date("2026-10-31T12:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:e1@groscove-ultra");
    expect(ics).toContain("DTSTART:20261110T130000Z");
    expect(ics).toContain("SUMMARY:Reunião\\; marca");
    expect(ics).toContain("DESCRIPTION:Pauta\\, roteiro");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("DTEND;VALUE=DATE:20261123");
    expect(ics).toContain("SUMMARY:Campanha · Atleta Exemplo");
    expect(ics).toContain("DTSTAMP:20261031T120000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/R\$|cents/);
  });

  it("evento de hora sem fim ganha 30 minutos", () => {
    const ics = buildIcs([{ id: "e", title: "x", startsAt: "2026-11-10T13:00:00Z", endsAt: "2026-11-10T13:00:00Z", allDay: false }], { calendarName: "c", timeZone: "UTC" });
    expect(ics).toContain("DTEND:20261110T133000Z");
  });
});

describe("mês da agenda", () => {
  it("parâmetro válido, inválido e padrão no fuso", () => {
    expect(parseMonth("2026-03", "UTC")).toEqual({ year: 2026, month: 3 });
    expect(parseMonth("2026-13", "UTC", new Date("2026-10-31T12:00:00Z"))).toEqual({ year: 2026, month: 10 });
    expect(parseMonth(undefined, "America/Sao_Paulo", new Date("2026-11-01T01:00:00Z"))).toEqual({ year: 2026, month: 10 });
    expect(monthKey(2026, 3)).toBe("2026-03");
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(plusDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formulário de evento", () => {
  const base = { id: null, kind: "meeting", title: "Reunião", description: "", location: "", date: "2026-11-10", endDate: "", startTime: "09:00", endTime: "10:00", allDay: false, dealId: "", talentId: "", brandId: "", visibleToBrand: false, visibleToTalent: false };
  it("aceita só os tipos manuais e datas ISO", () => {
    expect(eventSchema.safeParse(base).success).toBe(true);
    expect(eventSchema.safeParse({ ...base, kind: "campaign" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, date: "10/11/2026" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });
});
