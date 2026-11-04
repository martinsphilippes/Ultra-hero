// Formulário do admin para um evento do Calendário Groscove (0098): lógica pura (testada).
import { zonedTime } from "@/lib/calendar/form";
import { zonedDayKey } from "@/lib/calendar/grid";
import { PLATFORM_DEFAULT_TZ, type PlatformStatus, type Territory } from "./vocab";

export type PlatformFormValues = {
  id: string | null;
  title: string;
  description: string;
  location: string;
  territory: Territory | "";
  category: string;
  collection: string;
  hashtags: string;
  highlight: boolean;
  tentative: boolean;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: PlatformStatus;
  publishDate: string;
  publishTime: string;
};

/** Novo evento: dia inteiro no dia dado, rascunho, fuso padrão. */
export function newPlatformForm(day: string): PlatformFormValues {
  return {
    id: null,
    title: "",
    description: "",
    location: "",
    territory: "",
    category: "",
    collection: "",
    hashtags: "",
    highlight: false,
    tentative: false,
    allDay: true,
    date: day,
    endDate: "",
    startTime: "09:00",
    endTime: "10:00",
    timezone: PLATFORM_DEFAULT_TZ,
    status: "draft",
    publishDate: "",
    publishTime: "09:00",
  };
}

type Saved = {
  id: string;
  title: string;
  description: string;
  location: string;
  territory: Territory | null;
  category: string | null;
  collection: string | null;
  hashtags: string[];
  highlight: boolean;
  tentative: boolean;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: PlatformStatus;
  publishedAt: string | null;
};

/** Evento salvo → formulário (datas/horas no fuso do evento; dia inteiro tem fim exclusivo). */
export function platformEventToForm(e: Saved): PlatformFormValues {
  const tz = e.timezone || PLATFORM_DEFAULT_TZ;
  const start = new Date(e.startsAt).getTime();
  const end = Math.max(new Date(e.endsAt).getTime(), start);
  const date = zonedDayKey(start, tz);
  const last = e.allDay ? (end > start ? zonedDayKey(end - 1, tz) : date) : zonedDayKey(end, tz);
  const scheduled = e.status === "scheduled" && e.publishedAt;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    territory: e.territory ?? "",
    category: e.category ?? "",
    collection: e.collection ?? "",
    hashtags: e.hashtags.map((h) => `#${h}`).join(" "),
    highlight: e.highlight,
    tentative: e.tentative,
    allDay: e.allDay,
    date,
    endDate: last > date ? last : "",
    startTime: e.allDay ? "09:00" : zonedTime(start, tz),
    endTime: e.allDay ? "10:00" : zonedTime(end, tz),
    timezone: tz,
    status: e.status,
    publishDate: scheduled ? zonedDayKey(e.publishedAt as string, tz) : "",
    publishTime: scheduled ? zonedTime(e.publishedAt as string, tz) : "09:00",
  };
}
