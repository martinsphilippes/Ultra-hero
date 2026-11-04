import { describe, expect, it } from "vitest";
import { agencyNavKeys } from "@/lib/agency/roles";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { installmentState, openCents, toClientReceivables } from "@/lib/finance/client-payments";
import { insightMark, insightsState, isInsightLate } from "@/lib/media/insights";
import { addMonths, cycleAnchors, cycleAt, cycleStart, occurrenceDates, recurrenceUnits } from "@/lib/roadmap/recurrence";
import { monthKey, reportRange, sendHref, shiftMonth, strategyActions, strategyIdeaSchema } from "@/lib/strategy/vocab";

// Roteiros de entrega — Fase 3 (0111): espelhos puros das regras do banco (recorrência, insights), estratégias,
// herói-cliente que paga a agência e a entrada Estratégias no menu.

describe("serviço recorrente (ciclos)", () => {
  it("unidades em semanas; diária não se multiplica", () => {
    expect(recurrenceUnits("weekly")).toBe(1);
    expect(recurrenceUnits("biweekly")).toBe(2);
    expect(recurrenceUnits("monthly")).toBe(4);
    expect(recurrenceUnits("daily")).toBeNull();
  });

  it("meses como o Postgres (31/01 + 1 mês = fim de fevereiro)", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(cycleStart("monthly", "2027-03-10", 2)).toBe("2027-05-10");
    expect(cycleStart("biweekly", "2027-03-01", 1)).toBe("2027-03-15");
  });

  it("ciclo que contém o dia; antes do início e depois do fim, nenhum", () => {
    expect(cycleAt("monthly", "2027-03-10", null, "2027-03-09")).toBeNull();
    expect(cycleAt("monthly", "2027-03-10", null, "2027-03-10")).toBe(0);
    expect(cycleAt("monthly", "2027-03-10", null, "2027-04-09")).toBe(0);
    expect(cycleAt("monthly", "2027-03-10", null, "2027-04-10")).toBe(1);
    expect(cycleAt("weekly", "2027-03-01", "2027-03-15", "2027-03-16")).toBeNull();
  });

  it("mensal: 4 semanais, 2 quinzenais e 1 mensal por ciclo (\"4 pautas/mês\")", () => {
    expect(cycleAnchors("weekly", "monthly", "2027-03-01", 0)).toEqual(["2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22"]);
    expect(cycleAnchors("biweekly", "monthly", "2027-03-01", 0)).toEqual(["2027-03-01", "2027-03-15"]);
    expect(cycleAnchors("monthly", "monthly", "2027-03-01", 0)).toEqual(["2027-03-01"]);
    expect(cycleAnchors("daily", "monthly", "2027-03-01", 0)).toEqual([]);
  });

  it("etapa maior que o ciclo sai a cada N ciclos; fim do contrato corta", () => {
    expect(cycleAnchors("monthly", "weekly", "2027-03-01", 0)).toEqual(["2027-03-01"]);
    expect(cycleAnchors("monthly", "weekly", "2027-03-01", 1)).toEqual([]);
    expect(cycleAnchors("monthly", "weekly", "2027-03-01", 4)).toEqual(["2027-03-29"]);
    expect(cycleAnchors("biweekly", "weekly", "2027-03-01", 1)).toEqual([]);
    expect(cycleAnchors("weekly", "monthly", "2027-03-01", 0, "2027-03-10")).toEqual(["2027-03-01", "2027-03-08"]);
  });

  it("ocorrência: âncora rola para dia útil e vence em n dias úteis", () => {
    // sábado → segunda; 3 dias úteis = quarta
    expect(occurrenceDates("2027-03-06", 3)).toEqual({ availableOn: "2027-03-08", dueOn: "2027-03-10" });
    // Tiradentes (21/04/2027, quarta) não conta
    expect(occurrenceDates("2027-04-20", 2)).toEqual({ availableOn: "2027-04-20", dueOn: "2027-04-22" });
  });
});

describe("insights do publipost (24 h e 7 dias)", () => {
  const now = new Date("2027-03-20T12:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  it("marcos e carência de 2 dias", () => {
    expect(insightsState(ago(2), now, false, false)).toBe("waiting");
    expect(insightsState(ago(30), now, false, false)).toBe("due_24h");
    expect(insightsState(ago(80), now, false, false)).toBe("late_24h");
    expect(insightsState(ago(80), now, true, false)).toBe("waiting");
    expect(insightsState(ago(170), now, true, false)).toBe("due_7d");
    expect(insightsState(ago(170), now, false, false)).toBe("due_7d");
    expect(insightsState(ago(240), now, true, false)).toBe("late_7d");
    expect(insightsState(ago(240), now, false, true)).toBe("done");
    expect(insightsState(null, now, false, false)).toBe("waiting");
  });
  it("marco e atraso para a tela", () => {
    expect(insightMark("late_24h")).toBe("24h");
    expect(insightMark("due_7d")).toBe("7d");
    expect(insightMark("done")).toBeNull();
    expect(isInsightLate("late_7d")).toBe(true);
    expect(isInsightLate("due_24h")).toBe(false);
  });
});

describe("estratégias para marcas", () => {
  it("mês de referência e navegação", () => {
    expect(monthKey("2027-03-18")).toBe("2027-03-01");
    expect(shiftMonth("2027-01-01", -1)).toBe("2026-12-01");
    expect(shiftMonth("2027-12-01", 1)).toBe("2028-01-01");
    expect(reportRange("2027-02-01", "2027-03-10")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(reportRange("2027-03-01", "2027-03-10")).toEqual({ from: "2027-03-01", to: "2027-03-10" });
  });
  it("marca atendida ou empresa-alvo é obrigatória", () => {
    expect(strategyIdeaSchema.safeParse({ month: "2027-03-01", title: "Dia das Mães" }).success).toBe(false);
    expect(strategyIdeaSchema.safeParse({ month: "2027-03-01", title: "Dia das Mães", brandLabel: "Empresa X" }).success).toBe(true);
    expect(strategyIdeaSchema.safeParse({ month: "2027-03-01", title: "Dia das Mães", brandId: "8f8f8f8f-8f8f-4f8f-8f8f-8f8f8f8f8f8f" }).success).toBe(true);
  });
  it("ações por situação e papel", () => {
    const none = { canEdit: false, canDelete: false, canSubmit: false, canDecide: false, canReady: false, canReopen: false, canSend: false };
    expect(strategyActions("idea", { ...none, canSubmit: true })).toEqual(["submit"]);
    expect(strategyActions("review", none)).toEqual([]);
    expect(strategyActions("review", { ...none, canDecide: true })).toEqual(["approve", "return"]);
    expect(strategyActions("approved", { ...none, canReady: true, canSend: true })).toEqual(["ready", "send"]);
    expect(strategyActions("sent", { ...none, canSend: true })).toEqual([]);
  });
  it("envio reaproveita a oportunidade de patrocínio pré-preenchida", () => {
    const href = sendHref({ id: "i1", talentId: "t1", brandId: "b1", calendarEventId: "e1", ideaOn: "2027-05-09" });
    expect(href.startsWith("/agencia/oportunidades/nova?")).toBe(true);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect([qs.get("evento"), qs.get("heroi"), qs.get("marca"), qs.get("data"), qs.get("ideia")]).toEqual(["e1", "t1", "b1", "2027-05-09", "i1"]);
  });
  it("Estratégias no menu para todos os papéis; erro novo conhecido", () => {
    expect(agencyNavKeys("staff")).toContain("strategies");
    expect(agencyNavKeys("manager").indexOf("strategies")).toBe(agencyNavKeys("manager").indexOf("sponsorships") + 1);
    expect(agencyErrorCode({ message: "no_recurring_steps" })).toBe("no_recurring_steps");
  });
});

describe("herói-cliente paga a agência", () => {
  const raw = [
    {
      entry_id: "e1",
      deal_id: "d1",
      title: "Assessoria",
      talent_name: "Herói",
      agency_name: "Agência",
      total_cents: 300000,
      entry_status: "planned",
      due_on: "2027-03-10",
      plan: { method: "pix", method_note: "", notes: "" },
      installments: [
        { id: "i1", seq: 1, amount_cents: 100000, due_on: "2027-03-10", status: "paid", paid_at: "2027-03-09T10:00:00Z" },
        { id: "i2", seq: 2, amount_cents: 100000, due_on: "2027-04-10", status: "open" },
        { id: "i3", seq: 3, amount_cents: 100000, due_on: "2027-05-10", status: "open" },
      ],
    },
    { nope: true },
  ];
  it("lê o a pagar/a receber e ignora linhas inválidas", () => {
    const list = toClientReceivables(raw);
    expect(list).toHaveLength(1);
    expect(list[0].installments.map((i) => i.status)).toEqual(["paid", "open", "open"]);
    expect(openCents(list[0])).toBe(200000);
  });
  it("situação de cada parcela", () => {
    const [r] = toClientReceivables(raw);
    expect(installmentState(r.entryStatus, r.installments[0], "2027-04-11")).toBe("paid");
    expect(installmentState(r.entryStatus, r.installments[1], "2027-04-11")).toBe("late");
    expect(installmentState(r.entryStatus, r.installments[1], "2027-04-10")).toBe("today");
    expect(installmentState(r.entryStatus, r.installments[2], "2027-04-10")).toBe("open");
    expect(installmentState("forecast", r.installments[2], "2027-06-10")).toBe("forecast");
  });
});
