"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { toZonedIso } from "@/lib/deals/schemas";
import { createClient } from "@/lib/supabase/server";
import { MAX_IMPORT_ROWS } from "./import";
import { TERRITORIES } from "./vocab";

// Calendário Groscove (0098): escrita pelo admin (o banco confere platform_calendar_can_write em cada RPC) e interesse
// de Hero/marca. Erros por código, traduzidos em groscoveCalendar.errors.

export type PlatformResult = { ok: true; message: string; id?: string; state?: string; counts?: Record<string, number> } | { ok: false; error: string };

type ErrorCode = "forbidden" | "not_found" | "invalid_input" | "invalid_state" | "unauthenticated" | "generic";

function errorCode(error: unknown): ErrorCode {
  if (typeof error === "string") return (["forbidden", "not_found", "invalid_input", "invalid_state", "unauthenticated"] as const).find((c) => c === error) ?? "generic";
  const e = error as { code?: string | null; message?: string | null } | null;
  const code = e?.code ?? "";
  const message = e?.message ?? "";
  if (/invalid_state/.test(message) || code === "P0001") return "invalid_state";
  if (/not_found/.test(message) || code === "P0002") return "not_found";
  if (/unauthenticated/.test(message)) return "unauthenticated";
  if (code === "42501" || /forbidden|permission denied|row-level security/i.test(message)) return "forbidden";
  if (["22023", "23514", "23502", "22P02", "22007", "22008"].includes(code) || /invalid_input/.test(message)) return "invalid_input";
  return "generic";
}

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("groscoveCalendar.errors");
  const detail = (error as { details?: string | null } | null)?.details ?? "";
  const row = /^row:(\d+)/.exec(detail);
  const code = errorCode(error);
  return { ok: false, error: row && code === "invalid_input" ? t("invalidRow", { row: Number(row[1]) }) : t(code) };
}

function revalidateAgendas() {
  for (const p of ["/admin/agenda", "/agencia/agenda", "/marca/agenda", "/heroi/agenda"]) revalidatePath(p, "layout");
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]);
const territory = z.union([z.literal(""), z.enum(TERRITORIES)]);

const eventSchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(200),
  territory,
  category: z.string().trim().max(60),
  collection: z.union([z.literal(""), z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60)]),
  hashtags: z.string().max(2000),
  highlight: z.boolean(),
  tentative: z.boolean(),
  allDay: z.boolean(),
  date,
  endDate: z.union([z.literal(""), date]),
  startTime: time,
  endTime: time,
  timezone: z.string().min(1).max(64),
  status: z.enum(["draft", "published", "scheduled", "cancelled"]),
  publishDate: z.union([z.literal(""), date]),
  publishTime: time,
});
export type PlatformEventInput = z.input<typeof eventSchema>;

export async function savePlatformEventAction(input: PlatformEventInput): Promise<PlatformResult> {
  await requireUser();
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const d = parsed.data;
  const endDate = d.endDate || d.date;
  if (endDate < d.date) return fail("invalid_input");
  const data: Record<string, unknown> = {
    title: d.title,
    description: d.description,
    location: d.location,
    territory: d.territory || null,
    category: d.category || null,
    hashtags: d.hashtags.split(/[\s,;]+/).filter(Boolean),
    highlight: d.highlight,
    tentative: d.tentative,
    all_day: d.allDay,
    timezone: d.timezone,
    status: d.status,
  };
  if (d.collection) data.collection = d.collection;
  if (d.allDay) {
    data.start_date = d.date;
    data.end_date = endDate;
  } else {
    const startsAt = toZonedIso(d.date, d.startTime || "09:00", d.timezone);
    const endsAt = toZonedIso(endDate, d.endTime || d.startTime || "09:00", d.timezone);
    if (!startsAt || !endsAt) return fail("invalid_input");
    data.starts_at = startsAt;
    data.ends_at = endsAt;
  }
  if (d.status === "scheduled") {
    const at = d.publishDate ? toZonedIso(d.publishDate, d.publishTime || "00:00", d.timezone) : null;
    if (!at) return fail("invalid_input");
    data.publish_at = at;
  }
  try {
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("platform_event_save", { p_id: d.id, p_data: data as never });
    if (error) return fail(error);
    revalidateAgendas();
    const t = await getTranslations("groscoveCalendar.admin");
    return { ok: true, message: t("saved"), id: id ?? undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelPlatformEventAction(input: { id: string; reason: string }): Promise<PlatformResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), reason: z.string().trim().max(300) }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("platform_event_cancel", { p_id: parsed.data.id, p_reason: parsed.data.reason });
    if (error) return fail(error);
    revalidateAgendas();
    const t = await getTranslations("groscoveCalendar.admin");
    return { ok: true, message: t("cancelled") };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePlatformEventAction(input: { id: string }): Promise<PlatformResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("platform_event_delete", { p_id: parsed.data.id });
    if (error) return fail(error);
    revalidateAgendas();
    const t = await getTranslations("groscoveCalendar.admin");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(error);
  }
}

const importEvent = z.object({
  source_key: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,119}$/),
  action: z.enum(["create", "update", "skip"]),
  target_id: z.uuid().nullable(),
  title: z.string().max(400),
  all_day: z.boolean(),
  start_date: z.string().max(20),
  end_date: z.string().max(20).nullable(),
  starts_at: z.string().max(40).optional(),
  ends_at: z.string().max(40).optional(),
  timezone: z.string().max(64),
  territory: z.enum(TERRITORIES).nullable(),
  description: z.string().max(2000),
  hashtags: z.array(z.string().max(80)).max(30),
  highlight: z.boolean(),
  tentative: z.boolean(),
  category: z.string().max(60).nullable(),
  collection: z.string().max(60).nullable(),
  status: z.enum(["published", "draft"]),
  extra: z.record(z.string(), z.unknown()),
});
const importSchema = z.object({
  source: z.string().trim().min(1).max(200),
  fileName: z.string().max(200),
  fileHash: z.union([z.literal(""), z.string().regex(/^[0-9a-f]{64}$/)]),
  format: z.enum(["json", "csv"]),
  year: z.number().int().min(2000).max(2100).nullable(),
  meta: z.record(z.string(), z.unknown()),
  events: z.array(importEvent).min(1).max(MAX_IMPORT_ROWS),
});
export type ImportInput = z.input<typeof importSchema>;

/** Confirmação da importação: o lote inteiro numa RPC transacional (tudo ou nada). */
export async function importPlatformEventsAction(input: ImportInput): Promise<PlatformResult> {
  await requireUser();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("platform_events_import", {
      p_import: { source_name: d.source, file_name: d.fileName, file_hash: d.fileHash || null, format: d.format, year: d.year, meta: d.meta } as never,
      p_events: d.events as never,
    });
    if (error) return fail(error);
    revalidateAgendas();
    const counts = (data ?? {}) as Record<string, number>;
    const t = await getTranslations("groscoveCalendar.import");
    return { ok: true, message: t("done", { created: Number(counts.created ?? 0), updated: Number(counts.updated ?? 0), skipped: Number(counts.skipped ?? 0) }), counts };
  } catch (error) {
    return fail(error);
  }
}

/** "Tenho interesse" / "Retirar interesse": Hero (titular) ou marca (dono/equipe). Nunca cria negócio. */
export async function setInterestAction(input: { eventId: string; party: "hero" | "brand"; ownerId: string; interested: boolean }): Promise<PlatformResult> {
  await requireUser();
  const parsed = z.object({ eventId: z.uuid(), party: z.enum(["hero", "brand"]), ownerId: z.uuid(), interested: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("platform_event_set_interest", { p_event: d.eventId, p_party: d.party, p_owner: d.ownerId, p_interested: d.interested });
    if (error) return fail(error);
    const base = d.party === "hero" ? "/heroi/agenda" : "/marca/agenda";
    revalidatePath(`${base}/groscove/${d.eventId}`);
    revalidatePath(`/agencia/agenda/groscove/${d.eventId}`);
    revalidatePath(`/admin/agenda/${d.eventId}`);
    const t = await getTranslations("groscoveCalendar.interest");
    return { ok: true, message: d.interested ? t("saved") : t("withdrawnMessage"), state: data ?? undefined };
  } catch (error) {
    return fail(error);
  }
}

