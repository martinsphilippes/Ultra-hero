import { describe, expect, it } from "vitest";
import { toZonedIso } from "@/lib/deals/schemas";
import { canManageEvent, eventToInput, newEventDefaults, zonedTime, type EditableEvent } from "@/lib/calendar/form";
import { eventSchema } from "@/lib/calendar/vocab";

// 0086: data padrão do compromisso novo, evento salvo → formulário (fuso da agência) e quem pode editar.

const SP = "America/Sao_Paulo";
const TOKYO = "Asia/Tokyo";
const DEAL = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const base: EditableEvent = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "meeting",
  title: "Reunião",
  description: "",
  location: "",
  startsAt: "2026-11-10T12:00:00.000Z",
  endsAt: "2026-11-10T13:00:00.000Z",
  allDay: false,
  brandId: null,
  dealId: null,
  talentId: null,
  source: "manual",
  visibleToBrand: false,
  visibleToTalent: false,
};

describe("compromisso novo: data padrão", () => {
  it("usa o dia selecionado na grade, das 09:00 às 10:00, sem dia inteiro", () => {
    const v = newEventDefaults("2026-11-20", "2026-11-03");
    expect(v).toMatchObject({ id: null, kind: "meeting", date: "2026-11-20", endDate: "", startTime: "09:00", endTime: "10:00", allDay: false, dealId: "" });
  });
  it("sem dia selecionado (ou inválido), usa hoje", () => {
    expect(newEventDefaults(null, "2026-11-03").date).toBe("2026-11-03");
    expect(newEventDefaults(undefined, "2026-11-03").date).toBe("2026-11-03");
    expect(newEventDefaults("20/11/2026", "2026-11-03").date).toBe("2026-11-03");
  });
  it("na ficha do negócio, o negócio já vem fixo", () => {
    expect(newEventDefaults(null, "2026-11-03", DEAL).dealId).toBe(DEAL);
  });
  it("o padrão salva no fuso da agência (09:00 local)", () => {
    const v = newEventDefaults("2026-11-20", "2026-11-03");
    expect(eventSchema.safeParse({ ...v, title: "x" }).success).toBe(true);
    expect(toZonedIso(v.date, v.startTime ?? "", SP)).toBe("2026-11-20T09:00:00-03:00");
  });
});

describe("evento salvo → formulário", () => {
  it("hora local no fuso da agência", () => {
    expect(zonedTime("2026-11-10T12:00:00.000Z", SP)).toBe("09:00");
    expect(zonedTime("2026-11-10T12:00:00.000Z", TOKYO)).toBe("21:00");
    expect(zonedTime("2026-11-10T03:00:00.000Z", SP)).toBe("00:00");
  });
  it("com hora, no mesmo dia: data, início e fim; data final vazia", () => {
    const v = eventToInput(base, SP);
    expect(v).toMatchObject({ id: base.id, date: "2026-11-10", endDate: "", startTime: "09:00", endTime: "10:00", allDay: false });
  });
  it("com hora, virando o dia no fuso: data final preenchida", () => {
    const v = eventToInput({ ...base, startsAt: "2026-11-10T23:00:00.000Z", endsAt: "2026-11-11T04:00:00.000Z" }, SP);
    expect(v).toMatchObject({ date: "2026-11-10", endDate: "2026-11-11", startTime: "20:00", endTime: "01:00" });
  });
  it("dia inteiro de um dia: fim exclusivo vira data final vazia", () => {
    const v = eventToInput({ ...base, allDay: true, startsAt: "2026-11-10T03:00:00.000Z", endsAt: "2026-11-11T03:00:00.000Z" }, SP);
    expect(v).toMatchObject({ date: "2026-11-10", endDate: "", allDay: true });
  });
  it("dia inteiro de três dias: data final é o último dia", () => {
    const v = eventToInput({ ...base, allDay: true, startsAt: "2026-11-10T03:00:00.000Z", endsAt: "2026-11-13T03:00:00.000Z" }, SP);
    expect(v).toMatchObject({ date: "2026-11-10", endDate: "2026-11-12" });
  });
  it("ida e volta: salvar o formulário sem mudar reproduz os instantes", () => {
    const v = eventToInput({ ...base, startsAt: "2026-11-10T23:00:00.000Z", endsAt: "2026-11-11T04:30:00.000Z" }, SP);
    expect(new Date(toZonedIso(v.date, v.startTime ?? "", SP) ?? "").toISOString()).toBe("2026-11-10T23:00:00.000Z");
    expect(new Date(toZonedIso(v.endDate || v.date, v.endTime ?? "", SP) ?? "").toISOString()).toBe("2026-11-11T04:30:00.000Z");
  });
  it("negócio, creator e visibilidade vêm preenchidos; marca só na data comercial", () => {
    const v = eventToInput({ ...base, kind: "recording", dealId: DEAL, talentId: OTHER, brandId: OTHER, visibleToBrand: true, visibleToTalent: true, location: "Estúdio", description: "Figurino" }, SP);
    expect(v).toMatchObject({ kind: "recording", dealId: DEAL, talentId: OTHER, brandId: "", visibleToBrand: true, visibleToTalent: true, location: "Estúdio", description: "Figurino" });
    const c = eventToInput({ ...base, kind: "commercial_date", brandId: OTHER, visibleToBrand: true }, SP);
    expect(c).toMatchObject({ kind: "commercial_date", brandId: OTHER, dealId: "", talentId: "" });
  });
  it("o resultado passa no schema do formulário", () => {
    expect(eventSchema.safeParse(eventToInput({ ...base, dealId: DEAL }, SP)).success).toBe(true);
  });
});

describe("quem pode editar/remover", () => {
  const manager = { isManager: true, dealIds: [DEAL, OTHER] };
  const staff = { isManager: false, dealIds: [DEAL] };
  it("gestor+: qualquer manual, com ou sem negócio (aberto)", () => {
    expect(canManageEvent(base, manager)).toBe(true);
    expect(canManageEvent({ ...base, dealId: OTHER }, manager)).toBe(true);
    expect(canManageEvent({ ...base, dealId: "44444444-4444-4444-8444-444444444444" }, manager)).toBe(false);
  });
  it("colaborador: só nos negócios dele; reunião geral não", () => {
    expect(canManageEvent({ ...base, dealId: DEAL }, staff)).toBe(true);
    expect(canManageEvent({ ...base, dealId: OTHER }, staff)).toBe(false);
    expect(canManageEvent(base, staff)).toBe(false);
  });
  it("evento de sistema e oportunidade de patrocínio nunca", () => {
    expect(canManageEvent({ ...base, source: "system", kind: "campaign" }, manager)).toBe(false);
    expect(canManageEvent({ ...base, source: "system", kind: "sponsorship" }, manager)).toBe(false);
    expect(canManageEvent({ ...base, kind: "sponsorship" }, manager)).toBe(false);
  });
  it("sem permissões (marca, creator), nada", () => {
    expect(canManageEvent(base, null)).toBe(false);
  });
});
