// Proposta a partir de um evento da agenda (0101): lógica pura, testada em tests/unit/culture.test.ts.
// O evento (Calendário Groscove) pré-preenche os formulários EXISTENTES — campanha da marca, chamada da marca e
// oportunidade de patrocínio da agência —; quem propõe revisa tudo e segue o fluxo de sempre (aprovação interna,
// negociação, publicação). Decisões:
//   • Datas: dias do evento no fuso DO EVENTO (dia inteiro tem fim exclusivo). Evento que já começou começa "hoje" na
//     proposta (não se propõe para o passado). Limites dos fluxos: chamada até 366 dias; patrocínio até 62 dias.
//   • Hora (evento com hora): a hora local do evento vai para o formulário, que grava no fuso do portal (Brasília para
//     marca; fuso da agência no patrocínio) — os eventos da plataforma são, por padrão, de Brasília.
//   • Título até 120 e descrição até 2000 (limites das tabelas). Hashtags: na campanha vão para o briefing (até 15, com
//     #); na chamada e no patrocínio, numa linha ao fim da descrição.
//   • Território → segmento: só quando existe um segmento equivalente entre os segmentos padrão da agência (0065);
//     o banco resolve o slug para o segmento ativo da agência e nunca sobrescreve um segmento já escolhido.
//     Território → nicho da chamada: o nome do território no idioma de quem cria (texto livre da chamada).

import { zonedDayKey } from "@/lib/calendar/grid";
import { plusDays } from "@/lib/calendar/ics";
import type { Territory } from "@/lib/platform-calendar/vocab";

export type PrefillEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  territory: Territory | null;
  hashtags: string[];
};

/** Segmentos padrão da agência (slugs de agency_seed_defaults, 0065) equivalentes a cada território. */
export const TERRITORY_SEGMENTS: Record<Territory, readonly string[]> = {
  futebol: ["esportes"],
  esporte: ["esportes"],
  saude: ["bem-estar"],
  moda: ["beleza", "lifestyle"],
  entretenimento: [],
  musica: [],
  geek_tech: [],
  social: [],
  varejo: [],
  feriados: [],
  sustentabilidade: [],
};

export function segmentSlugsFor(territory: Territory | null): string[] {
  return territory ? [...TERRITORY_SEGMENTS[territory]] : [];
}

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_CALL_DAYS = 366;
export const MAX_SPONSORSHIP_DAYS = 62;

/** Primeiro e último dia do evento no fuso dele (dia inteiro e "termina à meia-noite": fim exclusivo). */
export function eventDayRange(e: Pick<PrefillEvent, "startsAt" | "endsAt" | "timezone">): { first: string; last: string } {
  const start = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime();
  const first = zonedDayKey(start, e.timezone);
  const last = zonedDayKey(end > start ? end - 1 : start, e.timezone);
  return { first, last: last < first ? first : last };
}

/** "HH:MM" local do instante no fuso dado. */
export function localTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

const tagLine = (tags: readonly string[]) => tags.map((h) => `#${h.replace(/^#+/, "")}`).join(" ");

/** Descrição + linha de hashtags, dentro do limite (as hashtags cabem primeiro; o texto é cortado se preciso). */
export function descriptionWithTags(description: string, tags: readonly string[], max = MAX_DESCRIPTION): string {
  const line = clip(tagLine(tags), Math.min(400, max));
  const body = description.trim();
  if (!line) return clip(body, max);
  if (!body) return line;
  return `${clip(body, Math.max(0, max - line.length - 2))}\n\n${line}`;
}

/** Período da proposta: do primeiro dia (ou hoje, se já começou) ao último, com teto de dias. */
export function proposalPeriod(e: Pick<PrefillEvent, "startsAt" | "endsAt" | "timezone">, today: string, maxDays: number): { start: string; end: string } {
  const { first, last } = eventDayRange(e);
  const start = first < today ? today : first;
  const capped = plusDays(start, maxDays - 1);
  const end = last < start ? start : last > capped ? capped : last;
  return { start, end };
}

/** Prazo para respostas/propostas: 3 dias antes do início; se não der, amanhã; se o evento é hoje, o próprio dia. */
export function defaultRespondDate(start: string, today: string): string {
  const before = plusDays(start, -3);
  if (before > today) return before;
  const tomorrow = plusDays(today, 1);
  return tomorrow <= start ? tomorrow : start;
}

export type CampaignPrefill = {
  title: string;
  periodStart: string;
  periodEnd: string;
  desiredTime: string;
  location: string;
  notes: string;
  hashtagsText: string;
  segmentSlugs: string[];
  calendarEventId: string;
};

/** Campanha da marca a partir do evento. */
export function campaignPrefill(e: PrefillEvent, today: string): CampaignPrefill {
  const { start, end } = proposalPeriod(e, today, MAX_CALL_DAYS);
  return {
    title: clip(e.title, MAX_TITLE),
    periodStart: start,
    periodEnd: end,
    desiredTime: e.allDay ? "" : localTime(e.startsAt, e.timezone),
    location: clip(e.location, 200),
    notes: clip(e.description, MAX_DESCRIPTION),
    hashtagsText: tagLine(e.hashtags.slice(0, 15)),
    segmentSlugs: segmentSlugsFor(e.territory),
    calendarEventId: e.id,
  };
}

export type CallPrefill = {
  title: string;
  description: string;
  startsOn: string;
  endsOn: string;
  location: string;
  nichesText: string;
  respondDate: string;
  calendarEventId: string;
};

/** Chamada da marca para agências a partir do evento. `territoryLabel`: nome do território no idioma de quem cria. */
export function callPrefill(e: PrefillEvent, today: string, territoryLabel: string | null): CallPrefill {
  const { start, end } = proposalPeriod(e, today, MAX_CALL_DAYS);
  return {
    title: clip(e.title, MAX_TITLE),
    description: descriptionWithTags(e.description, e.hashtags),
    startsOn: start,
    endsOn: end,
    location: clip(e.location, 200),
    nichesText: territoryLabel ? territoryLabel.trim() : "",
    respondDate: defaultRespondDate(start, today),
    calendarEventId: e.id,
  };
}

export type SponsorshipPrefill = {
  title: string;
  description: string;
  location: string;
  date: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  respondDate: string;
  calendarEventId: string;
};

/** Oportunidade de patrocínio da agência a partir do evento (o Hero é escolhido depois, no formulário). */
export function sponsorshipPrefill(e: PrefillEvent, today: string): SponsorshipPrefill {
  const { start, end } = proposalPeriod(e, today, MAX_SPONSORSHIP_DAYS);
  const sameDay = start === end;
  // com hora: hora local do evento; se termina em outro dia, o patrocínio vira de dia inteiro (o formulário só tem um par de horas)
  const timed = !e.allDay && sameDay;
  const startTime = timed ? localTime(e.startsAt, e.timezone) : "09:00";
  let endTime = timed ? localTime(e.endsAt, e.timezone) : "12:00";
  if (timed && endTime <= startTime) endTime = "23:59";
  return {
    title: clip(e.title, MAX_TITLE),
    description: descriptionWithTags(e.description, e.hashtags),
    location: clip(e.location, 200),
    date: start,
    endDate: sameDay ? "" : end,
    allDay: !timed,
    startTime,
    endTime,
    respondDate: defaultRespondDate(start, today),
    calendarEventId: e.id,
  };
}
