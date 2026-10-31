"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireUser } from "@/lib/auth/session";
import { toZonedIso } from "@/lib/deals/schemas";
import { plusDays } from "./ics";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "@/lib/talent/errors";
import { eventSchema, type EventInput } from "./vocab";

// Agenda (0067): eventos manuais da agência e o feed .ics de cada pessoa (token devolvido UMA vez).

export type CalendarResult = { ok: true; message: string; id?: string; token?: string } | { ok: false; error: string };
export type FeedPortal = "agency" | "brand" | "office";

export async function saveEventAction(input: EventInput): Promise<CalendarResult> {
  const ctx = await requireAgency("staff");
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const endDate = d.endDate || d.date;
  const startsAt = d.allDay ? toZonedIso(d.date, "00:00", tz) : toZonedIso(d.date, d.startTime || "09:00", tz);
  // dia inteiro: fim exclusivo (meia-noite do dia seguinte), a mesma convenção dos eventos de sistema e do .ics
  const endsAt = d.allDay ? toZonedIso(plusDays(endDate, 1), "00:00", tz) : toZonedIso(endDate, d.endTime || d.startTime || "09:00", tz);
  if (!startsAt || !endsAt) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_event_save", {
      p_agency: ctx.agency.id,
      p_id: d.id,
      p_data: {
        kind: d.kind,
        title: d.title,
        description: d.description,
        location: d.location,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: d.allDay,
        deal_id: d.dealId,
        talent_id: d.talentId,
        brand_id: d.brandId,
        visible_to_brand: d.visibleToBrand,
        visible_to_talent: d.visibleToTalent,
      },
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/agenda");
    if (d.dealId) revalidatePath(`/agencia/negocios/${d.dealId}`, "layout");
    const t = await getTranslations("agency.agenda");
    return { ok: true, message: d.kind === "commercial_date" && !d.id ? t("published") : t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function deleteEventAction(input: { id: string; dealId?: string | null }): Promise<CalendarResult> {
  await requireAgency("staff");
  const parsed = z.object({ id: z.uuid(), dealId: z.uuid().nullable().optional() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_event_delete", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/agenda");
    if (parsed.data.dealId) revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    const t = await getTranslations("agency.agenda");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return agencyFail(error);
  }
}

const PORTAL_PATH: Record<FeedPortal, string> = { agency: "/agencia/agenda", brand: "/marca/agenda", office: "/creator/escritorio/agenda" };
const fail = (portal: FeedPortal, error: unknown) => (portal === "office" ? talentFail(error) : agencyFail(error));

/** Gera (ou troca) o link do feed: o token volta uma vez; o banco guarda só o SHA-256. */
export async function createFeedAction(portal: FeedPortal): Promise<CalendarResult> {
  await requireUser();
  if (!Object.hasOwn(PORTAL_PATH, portal)) return fail("agency", "invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("calendar_feed_create");
    if (error) return fail(portal, error);
    if (!data) return fail(portal, "generic");
    revalidatePath(PORTAL_PATH[portal]);
    const t = await getTranslations("commercial.feed");
    return { ok: true, message: t("created"), token: data };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function revokeFeedAction(portal: FeedPortal): Promise<CalendarResult> {
  await requireUser();
  if (!Object.hasOwn(PORTAL_PATH, portal)) return fail("agency", "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("calendar_feed_revoke");
    if (error) return fail(portal, error);
    revalidatePath(PORTAL_PATH[portal]);
    const t = await getTranslations("commercial.feed");
    return { ok: true, message: t("revoked") };
  } catch (error) {
    return fail(portal, error);
  }
}
