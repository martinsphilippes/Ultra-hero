// Editor de tema do admin (0100): valores do formulário e conversões (módulo puro).
import { zonedDayKey } from "@/lib/calendar/grid";
import { toZonedIso } from "@/lib/deals/schemas";
import { computeWindow, type ThemeWindow } from "./resolve";
import type { Decoration, ModeTokens, SeasonArea, ThemeBackground } from "./vocab";
import { isSeasonArea, SEASON_AREAS } from "./vocab";

export type FormModeTokens = { accent: string; accentSoft: string; bg: string; surface: string };
export type ThemeFormValues = {
  id: string | null;
  name: string;
  notes: string;
  eventId: string;
  startMode: "date" | "lead_days";
  startDate: string;
  startTime: string;
  leadDays: number;
  endMode: "date" | "event_end";
  endDate: string;
  endTime: string;
  timezone: string;
  priority: number;
  areas: SeasonArea[];
  light: FormModeTokens;
  dark: FormModeTokens;
  background: ThemeBackground;
  decorations: Decoration[];
  animations: boolean;
  banner: { enabled: boolean; text: { "pt-BR": string; en: string; es: string }; label: { "pt-BR": string; en: string; es: string }; href: string };
};

export type AdminEventRef = { id: string; title: string; startsAt: string; endsAt: string; status: string; timezone: string };

/** Tema como a RPC seasonal_themes_admin devolve (snake_case) já tipado para as telas. */
export type AdminTheme = {
  id: string;
  name: string;
  notes: string;
  status: "draft" | "published";
  eventId: string | null;
  event: AdminEventRef | null;
  startMode: "date" | "lead_days";
  startsAt: string | null;
  leadDays: number;
  endMode: "date" | "event_end";
  endsAt: string | null;
  timezone: string;
  priority: number;
  areas: SeasonArea[];
  tokens: { light?: ModeTokens; dark?: ModeTokens };
  background: ThemeBackground;
  decorations: Decoration[];
  animations: boolean;
  banner: { text?: Record<string, string>; label?: Record<string, string>; href?: string };
  windowStart: string | null;
  windowEnd: string | null;
  eventCancelled: boolean;
  updatedAt: string;
};

const EMPTY_TOKENS: FormModeTokens = { accent: "", accentSoft: "", bg: "", surface: "" };
export const DEFAULT_THEME_TZ = "America/Sao_Paulo";

export function newThemeForm(today: string): ThemeFormValues {
  return {
    id: null,
    name: "",
    notes: "",
    eventId: "",
    startMode: "date",
    startDate: today,
    startTime: "00:00",
    leadDays: 7,
    endMode: "date",
    endDate: "",
    endTime: "00:00",
    timezone: DEFAULT_THEME_TZ,
    priority: 100,
    areas: [...SEASON_AREAS],
    light: { ...EMPTY_TOKENS },
    dark: { ...EMPTY_TOKENS },
    background: { type: "none" },
    decorations: [],
    animations: false,
    banner: { enabled: false, text: { "pt-BR": "", en: "", es: "" }, label: { "pt-BR": "", en: "", es: "" }, href: "" },
  };
}

/** "HH:MM" de um instante no fuso. */
export function zonedTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function parseAdminTheme(raw: unknown): AdminTheme | null {
  const r = rec(raw);
  if (typeof r.id !== "string") return null;
  const ev = r.event ? rec(r.event) : null;
  const bg = rec(r.background) as ThemeBackground;
  return {
    id: r.id,
    name: str(r.name),
    notes: str(r.notes),
    status: r.status === "published" ? "published" : "draft",
    eventId: typeof r.event_id === "string" ? r.event_id : null,
    event: ev && typeof ev.id === "string" ? { id: ev.id, title: str(ev.title), startsAt: str(ev.starts_at), endsAt: str(ev.ends_at), status: str(ev.status), timezone: str(ev.timezone) || DEFAULT_THEME_TZ } : null,
    startMode: r.start_mode === "lead_days" ? "lead_days" : "date",
    startsAt: typeof r.starts_at === "string" ? r.starts_at : null,
    leadDays: typeof r.lead_days === "number" ? r.lead_days : 0,
    endMode: r.end_mode === "event_end" ? "event_end" : "date",
    endsAt: typeof r.ends_at === "string" ? r.ends_at : null,
    timezone: str(r.timezone) || DEFAULT_THEME_TZ,
    priority: typeof r.priority === "number" ? r.priority : 100,
    areas: (Array.isArray(r.areas) ? r.areas : []).filter(isSeasonArea),
    tokens: rec(r.tokens) as AdminTheme["tokens"],
    background: bg.type ? bg : { type: "none" },
    decorations: Array.isArray(r.decorations) ? (r.decorations as Decoration[]) : [],
    animations: r.animations === true,
    banner: rec(r.banner) as AdminTheme["banner"],
    windowStart: typeof r.window_start === "string" ? r.window_start : null,
    windowEnd: typeof r.window_end === "string" ? r.window_end : null,
    eventCancelled: r.event_cancelled === true,
    updatedAt: str(r.updated_at),
  };
}

function formTokens(m: ModeTokens | undefined): FormModeTokens {
  return { accent: m?.accent ?? "", accentSoft: m?.accentSoft ?? "", bg: m?.bg ?? "", surface: m?.surface ?? "" };
}

export function themeToForm(t: AdminTheme): ThemeFormValues {
  const tz = t.timezone;
  const banner = t.banner ?? {};
  const loc = (o: Record<string, string> | undefined) => ({ "pt-BR": o?.["pt-BR"] ?? "", en: o?.en ?? "", es: o?.es ?? "" });
  return {
    id: t.id,
    name: t.name,
    notes: t.notes,
    eventId: t.eventId ?? "",
    startMode: t.startMode,
    startDate: t.startsAt ? zonedDayKey(t.startsAt, tz) : "",
    startTime: t.startsAt ? zonedTime(t.startsAt, tz) : "00:00",
    leadDays: t.leadDays,
    endMode: t.endMode,
    endDate: t.endsAt ? zonedDayKey(t.endsAt, tz) : "",
    endTime: t.endsAt ? zonedTime(t.endsAt, tz) : "00:00",
    timezone: tz,
    priority: t.priority,
    areas: t.areas.length ? t.areas : [...SEASON_AREAS],
    light: formTokens(t.tokens.light),
    dark: formTokens(t.tokens.dark),
    background: t.background,
    decorations: t.decorations,
    animations: t.animations,
    banner: { enabled: Boolean(banner.text?.["pt-BR"]), text: loc(banner.text), label: loc(banner.label), href: banner.href ?? "" },
  };
}

/** Janela que o formulário vai gerar (mesma regra do banco), para mostrar antes de salvar. */
export function formWindow(v: ThemeFormValues, event: AdminEventRef | null): ThemeWindow | null {
  return computeWindow(
    {
      startMode: v.startMode,
      startsAt: v.startMode === "date" && v.startDate ? toZonedIso(v.startDate, v.startTime || "00:00", v.timezone) : null,
      leadDays: v.leadDays,
      endMode: v.endMode,
      endsAt: v.endMode === "date" && v.endDate ? toZonedIso(v.endDate, v.endTime || "00:00", v.timezone) : null,
      timezone: v.timezone,
    },
    event && v.eventId === event.id ? { startsAt: event.startsAt, endsAt: event.endsAt } : null,
  );
}

/** Tokens do formulário sem campos vazios (o que vai ao banco e à prévia). */
export function formTokensOf(v: Pick<ThemeFormValues, "light" | "dark">): { light?: ModeTokens; dark?: ModeTokens } {
  const pick = (m: FormModeTokens) => Object.fromEntries(Object.entries(m).filter(([, x]) => /^#[0-9a-f]{6}$/.test(x))) as ModeTokens;
  const light = pick(v.light);
  const dark = pick(v.dark);
  return { ...(Object.keys(light).length ? { light } : {}), ...(Object.keys(dark).length ? { dark } : {}) };
}
