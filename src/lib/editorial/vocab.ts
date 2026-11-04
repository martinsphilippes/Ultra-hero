// Conteúdos editoriais da agenda (0101: notícias e dicas da Groscove e das agências). Lógica pura, testada em
// tests/unit/culture.test.ts. Estados como no Calendário Groscove: rascunho | programado | publicado; "programado" com a
// data já passada é publicado para quem lê (sem cron). O planejamento editorial agrupa por dia no fuso de quem planeja.

import { zonedDayKey, weekdayIndex } from "@/lib/calendar/grid";
import { plusDays } from "@/lib/calendar/ics";
import { z } from "zod";

export const POST_KINDS = ["news", "tip"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_TITLE_MAX = 140;
export const POST_BODY_MAX = 3000;
export const POST_URL_MAX = 500;

export type AgendaPost = {
  id: string;
  scope: "platform" | "agency";
  agencyId: string | null;
  agencyName: string | null;
  kind: PostKind;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  eventId: string | null;
  eventTitle: string | null;
  status: PostStatus;
  /** o que quem lê enxerga agora */
  effective: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
};

export function isPostKind(v: unknown): v is PostKind {
  return typeof v === "string" && (POST_KINDS as readonly string[]).includes(v);
}

export function isPostStatus(v: unknown): v is PostStatus {
  return typeof v === "string" && (POST_STATUSES as readonly string[]).includes(v);
}

export function effectivePostStatus(status: PostStatus, publishedAt: string | null, now: Date = new Date()): PostStatus {
  if (status === "scheduled" && publishedAt && new Date(publishedAt).getTime() <= now.getTime()) return "published";
  return status;
}

const HTTPS_RE = /^https:\/\/[^\s<>"]+$/;

export function isHttpsUrl(v: string): boolean {
  return v.length <= POST_URL_MAX && HTTPS_RE.test(v);
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]);
const url = z.union([z.literal(""), z.string().trim().max(POST_URL_MAX).refine(isHttpsUrl)]);

export const postSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(POST_KINDS),
  title: z.string().trim().min(3).max(POST_TITLE_MAX),
  body: z.string().trim().max(POST_BODY_MAX),
  imageUrl: url,
  linkUrl: url,
  eventId: z.union([z.literal(""), z.uuid()]),
  status: z.enum(POST_STATUSES),
  publishDate: z.union([z.literal(""), date]),
  publishTime: time,
});
export type PostInput = z.input<typeof postSchema>;

/** Monday da semana do dia (a agenda começa na segunda). */
export function weekStartOf(day: string): string {
  return plusDays(day, -weekdayIndex(day, 1));
}

/** Os 7 dias (YYYY-MM-DD) da semana que começa em `start`. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => plusDays(start, i));
}

/** "?semana=" válido → segunda-feira daquela semana; senão a semana de hoje. */
export function parseWeek(value: string | undefined, today: string): string {
  return weekStartOf(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : today);
}

/** Planejamento editorial: dia (no fuso) → posts com data; rascunhos (sem data) à parte. Ordem por horário. */
export function planByDay<P extends Pick<AgendaPost, "id" | "publishedAt" | "status">>(posts: readonly P[], timeZone: string): { byDay: Map<string, P[]>; undated: P[] } {
  const byDay = new Map<string, P[]>();
  const undated: P[] = [];
  const sorted = [...posts].sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.id.localeCompare(b.id));
  for (const p of sorted) {
    if (!p.publishedAt || p.status === "draft") {
      undated.push(p);
      continue;
    }
    const key = zonedDayKey(p.publishedAt, timeZone);
    const list = byDay.get(key) ?? [];
    list.push(p);
    byDay.set(key, list);
  }
  return { byDay, undated };
}
