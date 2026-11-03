// Formulário de compromisso (agenda da agência): lógica pura, testada em tests/unit/calendar-form.test.ts.
// - Novo: abre na data do dia selecionado na grade (ou hoje, no fuso da agência, calculado no servidor), das
//   09:00 às 10:00, "dia inteiro" desmarcado.
// - Editar (0086): converte o evento salvo (instantes UTC) de volta para data/hora locais no fuso da agência. Dia
//   inteiro tem fim exclusivo (meia-noite do dia seguinte, a convenção de saveEventAction), então a data final do
//   formulário é o dia anterior ao fim; data final igual à inicial fica vazia (como na criação).
// - Quem pode editar/remover: a mesma regra de agency_event_save/agency_event_delete — só eventos manuais; com
//   negócio, só se o negócio está aberto e é "trabalhável" pela pessoa (gestor+: qualquer aberto; colaborador:
//   dono ou equipe); sem negócio (reunião geral, data comercial), só gestor+. A RPC confere de novo no servidor.

import { zonedDayKey } from "./grid";
import { MANUAL_EVENT_KINDS, type EventInput, type EventKind, type ManualEventKind } from "./vocab";

export type EditableEvent = {
  id: string;
  kind: EventKind;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  brandId: string | null;
  dealId: string | null;
  talentId: string | null;
  source: "manual" | "system";
  visibleToBrand: boolean;
  visibleToTalent: boolean;
};

/** Quem pode mexer: gestor+ e os negócios abertos que a pessoa pode trabalhar. Serializável (vai ao cliente). */
export type EventPermissions = { isManager: boolean; dealIds: readonly string[] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Valores iniciais de um compromisso novo: no dia escolhido (ou hoje), 09:00–10:00. */
export function newEventDefaults(day: string | null | undefined, today: string, fixedDealId: string | null = null): EventInput {
  const date = day && DAY.test(day) ? day : today;
  return {
    id: null,
    kind: "meeting",
    title: "",
    description: "",
    location: "",
    date,
    endDate: "",
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    dealId: fixedDealId ?? "",
    talentId: "",
    brandId: "",
    visibleToBrand: false,
    visibleToTalent: false,
  };
}

/** Hora local (HH:mm, 24h) de um instante num fuso IANA. */
export function zonedTime(value: string | number | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

function isManualKind(kind: string): kind is ManualEventKind {
  return (MANUAL_EVENT_KINDS as readonly string[]).includes(kind);
}

/** Evento salvo → valores do formulário, no fuso da agência. */
export function eventToInput(event: EditableEvent, timeZone: string): EventInput {
  const start = new Date(event.startsAt).getTime();
  const endRaw = new Date(event.endsAt).getTime();
  const end = Number.isFinite(endRaw) && endRaw >= start ? endRaw : start;
  const date = zonedDayKey(start, timeZone);
  let endDate: string;
  let startTime = "09:00";
  let endTime = "10:00";
  if (event.allDay) {
    // fim exclusivo: o último dia é o anterior à meia-noite final (nunca antes do início)
    const last = end > start ? zonedDayKey(end - 1, timeZone) : date;
    endDate = last > date ? last : "";
  } else {
    const last = zonedDayKey(end, timeZone);
    endDate = last > date ? last : "";
    startTime = zonedTime(start, timeZone);
    endTime = zonedTime(end, timeZone);
  }
  const commercial = event.kind === "commercial_date";
  return {
    id: event.id,
    kind: isManualKind(event.kind) ? event.kind : "other",
    title: event.title,
    description: event.description,
    location: event.location,
    date,
    endDate,
    startTime,
    endTime,
    allDay: event.allDay,
    dealId: commercial ? "" : (event.dealId ?? ""),
    talentId: commercial ? "" : (event.talentId ?? ""),
    // a marca só se escolhe na data comercial; nos outros, a do negócio é preenchida pelo banco
    brandId: commercial ? (event.brandId ?? "") : "",
    visibleToBrand: event.visibleToBrand,
    visibleToTalent: event.visibleToTalent,
  };
}

/** A pessoa pode editar/remover este evento aqui? (eventos de sistema e de patrocínio: nunca) */
export function canManageEvent(event: Pick<EditableEvent, "source" | "kind" | "dealId">, perms: EventPermissions | null | undefined): boolean {
  if (!perms || event.source !== "manual" || !isManualKind(event.kind)) return false;
  if (event.dealId) return perms.dealIds.includes(event.dealId);
  return perms.isManager;
}
