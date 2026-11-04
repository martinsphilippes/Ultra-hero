"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { toZonedIso } from "@/lib/deals/schemas";
import { createClient } from "@/lib/supabase/server";
import { checkTokens } from "./contrast";
import { ASSET_BUCKET, ASSET_MAX_BYTES, DECOR_POSITIONS, DECOR_SIZES, isAssetUrl, isBannerHref, MAX_DECORATIONS, MAX_LEAD_DAYS, SEASON_AREAS, SEASON_CACHE_TAG, SEASON_PREVIEW_COOKIE } from "./vocab";

// Layout dinâmico (0100): escrita só do admin geral — cada RPC confere is_platform_admin no banco. Erros por código,
// traduzidos em seasonalTheme.errors. Salvar/publicar invalida o cache do tema ativo (tag) na hora.

export type ThemeResult = { ok: true; message: string; id?: string; url?: string } | { ok: false; error: string };
type ErrorCode = "forbidden" | "not_found" | "invalid_input" | "invalid_state" | "unauthenticated" | "contrast" | "window" | "file_type" | "file_size" | "upload_failed" | "generic";

function errorCode(error: unknown): ErrorCode {
  if (typeof error === "string") return (error as ErrorCode) ?? "generic";
  const e = error as { code?: string | null; message?: string | null; details?: string | null } | null;
  const code = e?.code ?? "";
  const message = e?.message ?? "";
  if (/invalid_state/.test(message) || code === "P0001") return "invalid_state";
  if (/not_found/.test(message) || code === "P0002") return "not_found";
  if (/unauthenticated/.test(message)) return "unauthenticated";
  if (code === "42501" || /forbidden|permission denied|row-level security/i.test(message)) return "forbidden";
  if (/window/.test(e?.details ?? "")) return "window";
  if (["22023", "23514", "23502", "22P02", "22007", "22008"].includes(code) || /invalid_input/.test(message)) return "invalid_input";
  return "generic";
}

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("seasonalTheme.errors");
  return { ok: false, error: t(errorCode(error)) };
}

function refresh() {
  revalidateTag(SEASON_CACHE_TAG);
  revalidatePath("/admin/temas", "layout");
}

const hex = z.string().regex(/^#[0-9a-f]{6}$/);
const optHex = z.union([z.literal(""), hex]);
const modeTokens = z.object({ accent: optHex, accentSoft: optHex, bg: optHex, surface: optHex });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);

const themeSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  notes: text(500),
  eventId: z.union([z.literal(""), z.uuid()]),
  startMode: z.enum(["date", "lead_days"]),
  startDate: z.union([z.literal(""), date]),
  startTime: time,
  leadDays: z.number().int().min(0).max(MAX_LEAD_DAYS),
  endMode: z.enum(["date", "event_end"]),
  endDate: z.union([z.literal(""), date]),
  endTime: time,
  timezone: z.string().min(1).max(64),
  priority: z.number().int().min(0).max(1000),
  areas: z.array(z.enum(SEASON_AREAS)).min(1).max(3),
  light: modeTokens,
  dark: modeTokens,
  background: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("gradient"), from: hex, to: hex, angle: z.number().int().min(0).max(360), intensity: z.number().int().min(5).max(40) }),
    z.object({ type: z.literal("image"), url: z.string().refine(isAssetUrl), fit: z.enum(["cover", "repeat"]), intensity: z.number().int().min(5).max(40) }),
  ]),
  decorations: z.array(z.object({ url: z.string().refine(isAssetUrl), position: z.enum(DECOR_POSITIONS), size: z.enum(DECOR_SIZES) })).max(MAX_DECORATIONS),
  animations: z.boolean(),
  banner: z.object({
    enabled: z.boolean(),
    text: z.object({ "pt-BR": text(120), en: text(120), es: text(120) }),
    label: z.object({ "pt-BR": text(40), en: text(40), es: text(40) }),
    href: z.union([z.literal(""), z.string().trim().refine(isBannerHref)]),
  }),
});
export type ThemeInput = z.input<typeof themeSchema>;

function compactTokens(m: z.infer<typeof modeTokens>) {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v));
}

export async function saveThemeAction(input: ThemeInput): Promise<ThemeResult> {
  await requireUser();
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const d = parsed.data;
  if ((d.startMode === "lead_days" || d.endMode === "event_end") && !d.eventId) return fail("invalid_input");
  if (d.banner.enabled && !d.banner.text["pt-BR"]) return fail("invalid_input");
  const tokens: Record<string, Record<string, string>> = {};
  const light = compactTokens(d.light);
  const dark = compactTokens(d.dark);
  if (Object.keys(light).length) tokens.light = light;
  if (Object.keys(dark).length) tokens.dark = dark;
  // fundo/superfície que deixam o texto ilegível em algum template: não salva (o editor já mostra onde falha)
  if (!checkTokens(tokens).ok) return fail("contrast");
  const startsAt = d.startMode === "date" ? (d.startDate ? toZonedIso(d.startDate, d.startTime, d.timezone) : null) : null;
  const endsAt = d.endMode === "date" ? (d.endDate ? toZonedIso(d.endDate, d.endTime, d.timezone) : null) : null;
  if ((d.startMode === "date" && !startsAt) || (d.endMode === "date" && !endsAt)) return fail("window");
  const strip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  const banner = d.banner.enabled ? { text: strip(d.banner.text), label: strip(d.banner.label), ...(d.banner.href ? { href: d.banner.href } : {}) } : {};
  const data = {
    name: d.name,
    notes: d.notes,
    event_id: d.eventId || null,
    start_mode: d.startMode,
    lead_days: d.leadDays,
    starts_at: startsAt,
    end_mode: d.endMode,
    ends_at: endsAt,
    timezone: d.timezone,
    priority: d.priority,
    areas: d.areas,
    tokens,
    background: d.background,
    decorations: d.decorations,
    animations: d.animations,
    banner,
  };
  try {
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("seasonal_theme_save", { p_id: d.id, p_data: data as never });
    if (error) return fail(error);
    refresh();
    const t = await getTranslations("seasonalTheme.admin");
    return { ok: true, message: t("saved"), id: id ?? undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function setThemeStatusAction(input: { id: string; status: "draft" | "published" }): Promise<ThemeResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), status: z.enum(["draft", "published"]) }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("seasonal_theme_set_status", { p_id: parsed.data.id, p_status: parsed.data.status });
    if (error) return fail(error);
    refresh();
    const t = await getTranslations("seasonalTheme.admin");
    return { ok: true, message: t(parsed.data.status === "published" ? "published" : "unpublished") };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteThemeAction(input: { id: string }): Promise<ThemeResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("seasonal_theme_delete", { p_id: parsed.data.id });
    if (error) return fail(error);
    refresh();
    const t = await getTranslations("seasonalTheme.admin");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreDefaultAction(): Promise<ThemeResult> {
  await requireUser();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("seasonal_theme_restore_default");
    if (error) return fail(error);
    refresh();
    const t = await getTranslations("seasonalTheme.admin");
    return { ok: true, message: t("restored", { count: data ?? 0 }) };
  } catch (error) {
    return fail(error);
  }
}

export async function setThemesEnabledAction(input: { enabled: boolean }): Promise<ThemeResult> {
  await requireUser();
  const parsed = z.object({ enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("seasonal_themes_set_enabled", { p_enabled: parsed.data.enabled });
    if (error) return fail(error);
    refresh();
    const t = await getTranslations("seasonalTheme.admin");
    return { ok: true, message: t(parsed.data.enabled ? "enabledOn" : "enabledOff") };
  } catch (error) {
    return fail(error);
  }
}

/** Pré-visualizar: cookie de 1 h lido pelos layouts das áreas; o tema só aparece se a sessão for do admin geral. */
export async function startPreviewAction(input: { id: string }): Promise<ThemeResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_platform_admin");
  if (admin !== true) return fail("forbidden");
  (await cookies()).set(SEASON_PREVIEW_COOKIE, parsed.data.id, { path: "/", maxAge: 3600, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  const t = await getTranslations("seasonalTheme.admin");
  return { ok: true, message: t("previewOn") };
}

export async function stopPreviewAction(): Promise<ThemeResult> {
  (await cookies()).delete(SEASON_PREVIEW_COOKIE);
  revalidatePath("/", "layout");
  const t = await getTranslations("seasonalTheme.admin");
  return { ok: true, message: t("previewOff") };
}

// Envio de imagem (decorativo/fundo): confere o tipo pelos bytes, tamanho e grava no bucket público theme-assets com a
// sessão do admin (política de storage da 0100). Nome <uuid>.<ext>; a URL pública volta para o editor.
function sniff(bytes: Uint8Array): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function uploadThemeAssetAction(form: FormData): Promise<ThemeResult> {
  await requireUser();
  const file = form.get("file");
  const kind = form.get("kind") === "background" ? "background" : "decoration";
  if (!(file instanceof File) || file.size === 0) return fail("file_type");
  if (file.size > ASSET_MAX_BYTES[kind]) return fail("file_size");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return fail("file_type");
  try {
    const supabase = await createClient();
    const { data: admin } = await supabase.rpc("is_platform_admin");
    if (admin !== true) return fail("forbidden");
    const path = `${randomUUID()}.${type.ext}`;
    const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
    if (error) return fail("upload_failed");
    const url = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
    const t = await getTranslations("seasonalTheme.admin");
    return { ok: true, message: t("uploaded"), url };
  } catch {
    return fail("upload_failed");
  }
}

/** Busca de evento do Calendário Groscove para vincular ao tema (admin lê a agenda toda pela RLS da 0098). */
export async function searchThemeEventsAction(input: { q: string }): Promise<{ ok: true; items: { id: string; title: string; startsAt: string; endsAt: string; status: string; timezone: string }[] } | { ok: false; error: string }> {
  await requireUser();
  const parsed = z.object({ q: z.string().trim().min(2).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: true, items: [] };
  try {
    const supabase = await createClient();
    const { data: admin } = await supabase.rpc("is_platform_admin");
    if (admin !== true) return fail("forbidden");
    const term = parsed.data.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, status, timezone")
      .eq("scope", "platform")
      .ilike("title", `%${term}%`)
      .gte("ends_at", since)
      .order("starts_at", { ascending: true })
      .limit(12);
    if (error) return fail(error);
    return { ok: true, items: (data ?? []).map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, endsAt: e.ends_at, status: e.status, timezone: e.timezone })) };
  } catch (error) {
    return fail(error);
  }
}
