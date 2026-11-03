import { describe, expect, it } from "vitest";
import { groupEventsByDay } from "@/lib/calendar/grid";
import { EVENT_KINDS, HERO_ONLY_EVENT_KINDS } from "@/lib/calendar/vocab";
import {
  checklistProgress,
  eventToCalendar,
  heroEventRange,
  heroEventToInput,
  HERO_KIND_TO_EVENT_KIND,
  mergeAgenda,
  newHeroEventDefaults,
  nextEvent,
  serviceDateToCalendar,
  toChecklist,
  toggleChecklist,
  type HeroEvent,
} from "@/lib/hero-work/agenda";
import { daysOverdue, dueThisMonth, earningsDueThisMonth, effectiveStatus, financeSummary, groupServices, SERVICE_GROUP_ORDER, toHeroService, type HeroService } from "@/lib/hero-work/finance";
import { heroRights } from "@/lib/hero-work/rules";
import { HERO_EVENT_KINDS, heroEventSchema, heroServiceSchema, isHeroEventKind, isProofPath, proofExtension } from "@/lib/hero-work/vocab";

// 0094: agenda e financeiro do herói independente — status vencido, previsão, agrupamento, agenda e regras de acesso.

const SP = "America/Sao_Paulo";
const HERO = "11111111-1111-4111-8111-111111111111";
const SVC = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-03";

const svc = (over: Partial<HeroService> & { id: string }): HeroService => ({
  creatorId: HERO,
  title: "Serviço",
  client: "Cliente",
  serviceOn: "2026-10-20",
  amountCents: 100_00,
  dueOn: null,
  status: "receivable",
  receivedOn: null,
  paymentNote: "",
  proofPath: null,
  proofMime: null,
  ...over,
});

describe("situação do serviço (vencido é calculado)", () => {
  it("a receber com vencimento anterior a hoje vira vencido; no dia do vencimento ainda é a receber", () => {
    expect(effectiveStatus({ status: "receivable", dueOn: "2026-11-02" }, TODAY)).toBe("overdue");
    expect(effectiveStatus({ status: "receivable", dueOn: TODAY }, TODAY)).toBe("receivable");
    expect(effectiveStatus({ status: "receivable", dueOn: "2026-11-04" }, TODAY)).toBe("receivable");
  });
  it("sem vencimento nunca vence; recebido e cancelado nunca viram vencido", () => {
    expect(effectiveStatus({ status: "receivable", dueOn: null }, TODAY)).toBe("receivable");
    expect(effectiveStatus({ status: "received", dueOn: "2026-01-01" }, TODAY)).toBe("received");
    expect(effectiveStatus({ status: "cancelled", dueOn: "2026-01-01" }, TODAY)).toBe("cancelled");
  });
  it("dias de atraso", () => {
    expect(daysOverdue({ status: "receivable", dueOn: "2026-10-30" }, TODAY)).toBe(4);
    expect(daysOverdue({ status: "receivable", dueOn: TODAY }, TODAY)).toBe(0);
    expect(daysOverdue({ status: "received", dueOn: "2026-10-30" }, TODAY)).toBe(0);
  });
  it("linha do banco vira serviço (centavos como número, situação desconhecida = a receber)", () => {
    const s = toHeroService({ id: SVC, creator_profile_id: HERO, title: "T", client: "C", service_on: "2026-11-01", amount_cents: "123456", due_on: null, status: "xyz", received_on: null, payment_note: "", proof_path: null, proof_mime: null });
    expect(s.amountCents).toBe(123456);
    expect(s.status).toBe("receivable");
  });
});

describe("painel financeiro e previsão", () => {
  const list: HeroService[] = [
    svc({ id: "a", amountCents: 1000_00, dueOn: "2026-10-28" }), // vencido
    svc({ id: "b", amountCents: 500_00, dueOn: "2026-11-10" }), // 7 dias
    svc({ id: "c", amountCents: 300_00, dueOn: "2026-12-01" }), // 28 dias
    svc({ id: "d", amountCents: 200_00, dueOn: "2026-12-20" }), // 47 dias
    svc({ id: "e", amountCents: 100_00, dueOn: "2027-01-20" }), // 78 dias
    svc({ id: "f", amountCents: 50_00, dueOn: "2027-03-01" }), // fora dos 90
    svc({ id: "g", amountCents: 70_00, dueOn: null }), // sem vencimento
    svc({ id: "h", amountCents: 400_00, status: "received", receivedOn: "2026-11-02" }), // recebido no mês
    svc({ id: "i", amountCents: 900_00, status: "received", receivedOn: "2026-10-30" }), // recebido no mês passado
    svc({ id: "j", amountCents: 999_00, status: "cancelled", dueOn: "2026-11-05" }),
  ];
  const s = financeSummary(list, TODAY);
  it("a receber (não vencido), vencidos, recebido no mês e em aberto", () => {
    expect(s.receivableCents).toBe(500_00 + 300_00 + 200_00 + 100_00 + 50_00 + 70_00);
    expect(s.receivableCount).toBe(6);
    expect(s.overdueCents).toBe(1000_00);
    expect(s.overdueCount).toBe(1);
    expect(s.receivedMonthCents).toBe(400_00);
    expect(s.receivedMonthCount).toBe(1);
    expect(s.openCents).toBe(s.receivableCents + s.overdueCents);
  });
  it("previsão acumulada de 30, 60 e 90 dias, sem vencidos nem cancelados; sem vencimento à parte", () => {
    expect(s.forecast.d30).toBe(500_00 + 300_00);
    expect(s.forecast.d60).toBe(500_00 + 300_00 + 200_00);
    expect(s.forecast.d90).toBe(500_00 + 300_00 + 200_00 + 100_00);
    expect(s.forecast.noDueCents).toBe(70_00);
    expect(s.forecast.noDueCount).toBe(1);
  });
  it("o limite de cada janela é inclusivo (hoje+30)", () => {
    const edge = financeSummary([svc({ id: "x", amountCents: 10_00, dueOn: "2026-12-03" }), svc({ id: "y", amountCents: 20_00, dueOn: "2026-12-04" })], TODAY);
    expect(edge.forecast.d30).toBe(10_00);
    expect(edge.forecast.d60).toBe(30_00);
  });
  it("lista vazia zera tudo", () => {
    const z = financeSummary([], TODAY);
    expect(z.openCents).toBe(0);
    expect(z.forecast).toEqual({ d30: 0, d60: 0, d90: 0, noDueCents: 0, noDueCount: 0 });
  });
  it("a receber este mês (Perfil): em aberto com vencimento no mês, vencidos do mês incluídos", () => {
    expect(dueThisMonth(list, TODAY)).toEqual({ cents: 500_00, count: 1 });
    const withLate = [...list, svc({ id: "k", amountCents: 60_00, dueOn: "2026-11-01" })];
    expect(dueThisMonth(withLate, TODAY)).toEqual({ cents: 560_00, count: 2 });
  });
  it("ganhos do herói com agência: repasse aberto com data prevista no mês (agendada manda sobre o vencimento)", () => {
    const e = [
      { status: "planned", amountCents: 1000_00, scheduledOn: null, dueOn: "2026-11-20" },
      { status: "due", amountCents: 500_00, scheduledOn: "2026-11-25", dueOn: "2026-12-10" },
      { status: "due", amountCents: 700_00, scheduledOn: "2026-12-02", dueOn: "2026-11-15" },
      { status: "settled", amountCents: 900_00, scheduledOn: null, dueOn: "2026-11-02" },
      { status: "planned", amountCents: 300_00, scheduledOn: null, dueOn: null },
    ];
    expect(earningsDueThisMonth(e, TODAY)).toEqual({ cents: 1500_00, count: 2 });
  });
});

describe("agrupamento da lista de serviços", () => {
  const list: HeroService[] = [
    svc({ id: "v2", title: "B", dueOn: "2026-10-30" }),
    svc({ id: "v1", title: "A", dueOn: "2026-10-20" }),
    svc({ id: "r2", title: "Y", dueOn: null }),
    svc({ id: "r1", title: "X", dueOn: "2026-11-05" }),
    svc({ id: "p1", status: "received", receivedOn: "2026-10-01" }),
    svc({ id: "p2", status: "received", receivedOn: "2026-10-25" }),
    svc({ id: "c1", status: "cancelled", serviceOn: "2026-09-01" }),
    svc({ id: "c2", status: "cancelled", serviceOn: "2026-10-01" }),
  ];
  const g = groupServices(list, TODAY);
  it("separa por situação mostrada e ordena dentro do grupo", () => {
    expect(g.overdue.map((s) => s.id)).toEqual(["v1", "v2"]);
    expect(g.receivable.map((s) => s.id)).toEqual(["r1", "r2"]);
    expect(g.received.map((s) => s.id)).toEqual(["p2", "p1"]);
    expect(g.cancelled.map((s) => s.id)).toEqual(["c2", "c1"]);
  });
  it("vencidos aparecem primeiro na tela", () => {
    expect(SERVICE_GROUP_ORDER[0]).toBe("overdue");
  });
});

const ev = (over: Partial<HeroEvent> & { id: string }): HeroEvent => ({
  creatorId: HERO,
  kind: "shoot",
  title: "Gravar",
  startsAt: "2026-11-10T15:00:00.000Z",
  endsAt: "2026-11-10T17:00:00.000Z",
  allDay: false,
  location: "",
  notes: "",
  client: "",
  serviceId: null,
  checklist: [],
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("agenda do herói", () => {
  it("cada tipo do herói tem um tipo de agenda; evento e serviço são só do herói", () => {
    for (const k of HERO_EVENT_KINDS) expect(EVENT_KINDS).toContain(HERO_KIND_TO_EVENT_KIND[k]);
    expect(HERO_KIND_TO_EVENT_KIND.shoot).toBe("recording");
    expect(HERO_KIND_TO_EVENT_KIND.delivery).toBe("deliverable");
    expect(HERO_ONLY_EVENT_KINDS).toEqual(["hero_event", "hero_service"]);
    expect(isHeroEventKind("shoot")).toBe(true);
    expect(isHeroEventKind("campaign")).toBe(false);
  });
  it("serviço com data aparece sozinho como dia inteiro; o já vinculado a um compromisso não repete", () => {
    const events = [ev({ id: "e1", serviceId: SVC })];
    const services = [
      { id: SVC, title: "Reels", client: "Loja", serviceOn: "2026-11-10" },
      { id: "33333333-3333-4333-8333-333333333333", title: "Palestra", client: "Escola", serviceOn: "2026-11-12" },
    ];
    const merged = mergeAgenda(events, services, SP);
    expect(merged.map((m) => m.id)).toEqual(["e1", "service:33333333-3333-4333-8333-333333333333"]);
    const item = merged[1];
    expect(item.kind).toBe("hero_service");
    expect(item.allDay).toBe(true);
    expect(item.hero.source).toBe("service");
    expect(item.subtitle).toBe("Escola");
  });
  it("a grade (groupEventsByDay) põe o serviço no dia certo, no fuso do herói", () => {
    const item = serviceDateToCalendar({ id: SVC, title: "Reels", client: "Loja", serviceOn: "2026-11-12" }, SP)!;
    const byDay = groupEventsByDay([item], SP);
    expect([...byDay.keys()]).toEqual(["2026-11-12"]);
  });
  it("compromisso de vários dias aparece em cada dia", () => {
    const e = eventToCalendar(ev({ id: "m", startsAt: "2026-11-10T03:00:00.000Z", endsAt: "2026-11-12T03:00:00.000Z", allDay: true }));
    expect([...groupEventsByDay([e], SP).keys()]).toEqual(["2026-11-10", "2026-11-11"]);
  });
  it("o que executar viaja com o item (contratante, observações, checklist)", () => {
    const e = eventToCalendar(ev({ id: "c", client: "Loja Sol", notes: "Levar tripé", checklist: [{ text: "Roteiro", done: false }] }));
    expect(e.hero).toMatchObject({ source: "event", heroKind: "shoot", client: "Loja Sol", notes: "Levar tripé" });
    expect(e.subtitle).toBe("Loja Sol");
    expect(e.description).toBe("Levar tripé");
  });
  it("checklist: progresso, marcar e desmarcar sem mexer nos outros; índice inválido não muda nada", () => {
    const items = [{ text: "a", done: true }, { text: "b", done: false }];
    expect(checklistProgress(items)).toEqual({ done: 1, total: 2 });
    expect(toggleChecklist(items, 1)).toEqual([{ text: "a", done: true }, { text: "b", done: true }]);
    expect(toggleChecklist(items, 0)[0].done).toBe(false);
    expect(toggleChecklist(items, 9)).toEqual(items);
    expect(items[1].done).toBe(false);
  });
  it("checklist cru (jsonb) é normalizado", () => {
    expect(toChecklist([{ text: "x", done: true }, { text: "y" }, 3, null, { done: true }])).toEqual([{ text: "x", done: true }, { text: "y", done: false }]);
    expect(toChecklist("lixo")).toEqual([]);
  });
  it("compromisso novo: no dia pedido (ou hoje), 09:00–10:00", () => {
    expect(newHeroEventDefaults(HERO, "2026-11-20", TODAY)).toMatchObject({ date: "2026-11-20", startTime: "09:00", endTime: "10:00", allDay: false, kind: "other", id: null, creatorId: HERO });
    expect(newHeroEventDefaults(HERO, "lixo", TODAY).date).toBe(TODAY);
  });
  it("formulário → instantes no fuso do herói (com hora e dia inteiro com fim exclusivo)", () => {
    expect(heroEventRange({ date: "2026-11-10", endDate: "", startTime: "14:00", endTime: "16:30", allDay: false }, SP)).toEqual({ startsAt: "2026-11-10T14:00:00-03:00", endsAt: "2026-11-10T16:30:00-03:00" });
    expect(heroEventRange({ date: "2026-11-10", endDate: "2026-11-11", startTime: "", endTime: "", allDay: true }, SP)).toEqual({ startsAt: "2026-11-10T00:00:00-03:00", endsAt: "2026-11-12T00:00:00-03:00" });
    expect(heroEventRange({ date: "2026-11-10", endDate: "2026-11-09", startTime: "", endTime: "", allDay: true }, SP)).toBeNull();
    expect(heroEventRange({ date: "2026-11-10", endDate: "", startTime: "16:00", endTime: "15:00", allDay: false }, SP)).toBeNull();
  });
  it("compromisso salvo → formulário e de volta (ida e volta preserva datas e horas)", () => {
    const saved = ev({ id: "r", startsAt: "2026-11-10T17:00:00.000Z", endsAt: "2026-11-10T19:30:00.000Z", checklist: [{ text: "a", done: true }] });
    const input = heroEventToInput(saved, SP);
    expect(input).toMatchObject({ date: "2026-11-10", startTime: "14:00", endTime: "16:30", endDate: "", allDay: false });
    expect(heroEventRange(input, SP)).toEqual({ startsAt: "2026-11-10T14:00:00-03:00", endsAt: "2026-11-10T16:30:00-03:00" });
    const allDay = heroEventToInput(ev({ id: "d", allDay: true, startsAt: "2026-11-10T03:00:00.000Z", endsAt: "2026-11-12T03:00:00.000Z" }), SP);
    expect(allDay).toMatchObject({ date: "2026-11-10", endDate: "2026-11-11", allDay: true });
  });
  it("próximo compromisso: o mais cedo que ainda não terminou; dia inteiro de ontem não conta", () => {
    const now = new Date("2026-11-03T15:00:00.000Z");
    const list = [
      { startsAt: "2026-11-01T03:00:00.000Z", endsAt: "2026-11-02T03:00:00.000Z", allDay: true, id: "ontem" },
      { startsAt: "2026-11-03T12:00:00.000Z", endsAt: "2026-11-03T13:00:00.000Z", allDay: false, id: "passou" },
      { startsAt: "2026-11-05T12:00:00.000Z", endsAt: "2026-11-05T13:00:00.000Z", allDay: false, id: "depois" },
      { startsAt: "2026-11-04T12:00:00.000Z", endsAt: "2026-11-04T13:00:00.000Z", allDay: false, id: "amanha" },
    ];
    expect(nextEvent(list, now)?.id).toBe("amanha");
    expect(nextEvent([], now)).toBeNull();
  });
});

describe("formulários, comprovante e quem pode o quê", () => {
  const baseEvent = { id: null, creatorId: HERO, kind: "meeting", title: "Reunião", date: "2026-11-10", endDate: "", startTime: "09:00", endTime: "10:00", allDay: false, location: "", notes: "", client: "", serviceId: "", checklist: [] };
  it("compromisso: título obrigatório, checklist até 30 itens com texto", () => {
    expect(heroEventSchema.safeParse(baseEvent).success).toBe(true);
    expect(heroEventSchema.safeParse({ ...baseEvent, title: "  " }).success).toBe(false);
    expect(heroEventSchema.safeParse({ ...baseEvent, kind: "campaign" }).success).toBe(false);
    expect(heroEventSchema.safeParse({ ...baseEvent, checklist: Array.from({ length: 31 }, () => ({ text: "x", done: false })) }).success).toBe(false);
    expect(heroEventSchema.safeParse({ ...baseEvent, checklist: [{ text: "", done: false }] }).success).toBe(false);
  });
  const baseService = { id: null, creatorId: HERO, title: "Reels", client: "Loja", serviceOn: "2026-11-01", amountCents: 150_000, dueOn: "", status: "receivable", receivedOn: "", paymentNote: "" };
  it("serviço: valor em centavos inteiro, contratante e título obrigatórios, situação conhecida", () => {
    expect(heroServiceSchema.safeParse(baseService).success).toBe(true);
    expect(heroServiceSchema.safeParse({ ...baseService, amountCents: -1 }).success).toBe(false);
    expect(heroServiceSchema.safeParse({ ...baseService, amountCents: 10.5 }).success).toBe(false);
    expect(heroServiceSchema.safeParse({ ...baseService, client: "" }).success).toBe(false);
    expect(heroServiceSchema.safeParse({ ...baseService, status: "overdue" }).success).toBe(false);
    expect(heroServiceSchema.safeParse({ ...baseService, dueOn: "10/11/2026" }).success).toBe(false);
  });
  it("caminho do comprovante: herói/serviço/arquivo, só tipos aceitos", () => {
    const ok = `${HERO}/${SVC}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`;
    expect(isProofPath(ok, HERO, SVC)).toBe(true);
    expect(isProofPath(ok, "99999999-9999-4999-8999-999999999999", SVC)).toBe(false);
    expect(isProofPath(`${HERO}/${SVC}/x.exe`, HERO, SVC)).toBe(false);
    expect(isProofPath(`${HERO}/${SVC}/../a.pdf`, HERO, SVC)).toBe(false);
    expect(proofExtension("image/jpeg")).toBe("jpg");
    expect(proofExtension("text/html")).toBeNull();
  });
  it("titular escreve (se não suspenso); membro só lê a agenda e não vê o financeiro; suspenso lê", () => {
    expect(heroRights("owner", "active")).toEqual({ teamRole: "owner", canWriteAgenda: true, canSeeFinance: true, canWriteFinance: true });
    expect(heroRights("owner", "pending").canWriteAgenda).toBe(true);
    expect(heroRights("owner", "suspended")).toMatchObject({ canWriteAgenda: false, canSeeFinance: true, canWriteFinance: false });
    expect(heroRights("member", "active")).toEqual({ teamRole: "member", canWriteAgenda: false, canSeeFinance: false, canWriteFinance: false });
  });
});
