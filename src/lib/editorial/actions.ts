"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { defaultTimeZone } from "@/i18n/config";
import { requireAgency } from "@/lib/agency/server";
import { requireUser } from "@/lib/auth/session";
import { toZonedIso } from "@/lib/deals/schemas";
import { createClient } from "@/lib/supabase/server";
import { postSchema, type PostInput } from "./vocab";

// Notícias e dicas da agenda (0101). Escopo "platform" = Groscove (admin / co-editora: o banco confere
// platform_calendar_can_write); escopo "agency" = agência atual (gestor+: o banco confere agency_can). Erros por código,
// traduzidos em culture.errors.

export type EditorialResult = { ok: true; message: string; id?: string } | { ok: false; error: string };
export type EventOption = { id: string; title: string; startsAt: string; timezone: string };

type Code = "forbidden" | "not_found" | "invalid_input" | "invalid_state" | "unauthenticated" | "generic";

function code(error: unknown): Code {
  if (typeof error === "string") return (["forbidden", "not_found", "invalid_input", "invalid_state", "unauthenticated"] as const).find((c) => c === error) ?? "generic";
  const e = error as { code?: string | null; message?: string | null } | null;
  const c = e?.code ?? "";
  const m = e?.message ?? "";
  if (/not_found/.test(m) || c === "P0002") return "not_found";
  if (/invalid_state/.test(m) || c === "P0001") return "invalid_state";
  if (/unauthenticated/.test(m)) return "unauthenticated";
  if (c === "42501" || /forbidden|permission denied/i.test(m)) return "forbidden";
  if (["22023", "23514", "23502", "22P02", "22007", "22008"].includes(c) || /invalid_input/.test(m)) return "invalid_input";
  return "generic";
}

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("culture.errors");
  return { ok: false, error: t(code(error)) };
}

function refresh(scope: "platform" | "agency") {
  revalidatePath(scope === "platform" ? "/admin/agenda" : "/agencia/agenda", "layout");
  for (const p of ["/heroi/agenda/cultura", "/marca/agenda/cultura", "/agencia/agenda/cultura", "/admin/agenda/cultura", "/heroi", "/marca", "/agencia", "/admin"]) revalidatePath(p);
}

async function agencyFor(scope: "platform" | "agency"): Promise<string | null> {
  if (scope === "platform") {
    await requireUser();
    return null;
  }
  const ctx = await requireAgency("manager");
  return ctx.agency.id;
}

const scopeSchema = z.enum(["platform", "agency"]);

export async function savePostAction(scope: "platform" | "agency", input: PostInput): Promise<EditorialResult> {
  const s = scopeSchema.safeParse(scope);
  const parsed = postSchema.safeParse(input);
  if (!s.success || !parsed.success) return { ok: false, error: (await getTranslations("culture.editorial.form"))("invalid") };
  const d = parsed.data;
  let publishAt = "";
  if (d.status === "scheduled") {
    if (!d.publishDate) return { ok: false, error: (await getTranslations("culture.editorial.form"))("invalid") };
    publishAt = toZonedIso(d.publishDate, d.publishTime || "09:00", defaultTimeZone) ?? "";
    if (!publishAt) return { ok: false, error: (await getTranslations("culture.editorial.form"))("invalid") };
  }
  try {
    const agencyId = await agencyFor(s.data);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agenda_post_save", {
      p_id: d.id,
      p_agency: agencyId,
      p_data: {
        kind: d.kind,
        title: d.title,
        body: d.body,
        image_url: d.imageUrl,
        link_url: d.linkUrl,
        calendar_event_id: d.eventId,
        status: d.status,
        publish_at: publishAt,
      },
    });
    if (error) return fail(error);
    refresh(s.data);
    return { ok: true, id: data ?? undefined, message: (await getTranslations("culture.editorial.form"))("saved") };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePostAction(scope: "platform" | "agency", id: string): Promise<EditorialResult> {
  const s = scopeSchema.safeParse(scope);
  const parsed = z.uuid().safeParse(id);
  if (!s.success || !parsed.success) return fail("invalid_input");
  try {
    await agencyFor(s.data);
    const supabase = await createClient();
    const { error } = await supabase.rpc("agenda_post_delete", { p_id: parsed.data });
    if (error) return fail(error);
    refresh(s.data);
    return { ok: true, message: (await getTranslations("culture.editorial.form"))("deleted") };
  } catch (error) {
    return fail(error);
  }
}

/** Busca de evento do Calendário Groscove para ligar à notícia (o que a pessoa vê; até 20, do mais próximo). */
export async function searchEventsAction(query: string): Promise<EventOption[]> {
  await requireUser();
  const q = String(query ?? "")
    .trim()
    .replace(/[%_,()]/g, " ")
    .trim()
    .slice(0, 80);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("calendar_events")
    .select("id, title, starts_at, timezone")
    .eq("scope", "platform")
    .neq("status", "draft")
    .gte("ends_at", since)
    .ilike("title", `%${q}%`)
    .order("starts_at")
    .limit(20);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at, timezone: r.timezone }));
}
