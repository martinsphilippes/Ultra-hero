"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { requireUser } from "@/lib/auth/session";
import { toZonedIso } from "@/lib/deals/schemas";
import { sendInviteEmail } from "@/lib/email/invite";
import { cleanSignerName, clientIpFrom, taxIdKind } from "@/lib/signature/tax-id";
import { createClient } from "@/lib/supabase/server";
import { clippingHref, guessRoomMime, ROOM_MAX_BYTES, ROOM_PORTALS, roomHref, type RoomPortal } from "./vocab";

// Sala do projeto (0110): o servidor só valida a forma e lê IP/navegador da requisição (NDA); as RPCs conferem o lado
// (agência, staff externo, herói, marca), o NDA, a situação da sala e o papel. Erros pelo código, traduzidos em
// agency.errors.

export type RoomResult = { ok: true; message: string; id?: string; path?: string; url?: string; link?: string; emailed?: boolean; dealId?: string } | { ok: false; error: string };

const uuid = z.uuid();
const portalSchema = z.enum(ROOM_PORTALS);

function revalidateRoom(portal: RoomPortal, dealId: string) {
  revalidatePath(roomHref(portal, dealId));
  if (portal !== "staff") revalidatePath(clippingHref(portal, dealId));
  if (portal === "agency") revalidatePath(`/agencia/negocios/${dealId}`, "layout");
  if (portal === "staff") revalidatePath("/projetos");
}

async function done(key: string, values?: Record<string, string | number>): Promise<string> {
  const t = await getTranslations("projectRoom.toasts");
  return t(key, values);
}

// ---------------------------------------------------------------- mensagens e arquivos
const postSchema = z.object({
  portal: portalSchema,
  dealId: uuid,
  body: z.string().max(4000),
  internal: z.boolean(),
  attachmentId: uuid.nullable(),
});

export async function postRoomMessageAction(input: z.input<typeof postSchema>): Promise<RoomResult> {
  await requireUser();
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (!d.body.trim() && !d.attachmentId) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_room_post", { p_deal: d.dealId, p_body: d.body.trim(), p_internal: d.internal, p_attachment: d.attachmentId });
    if (error) return agencyFail(error);
    revalidateRoom(d.portal, d.dealId);
    return { ok: true, message: await done("sent"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

const reserveSchema = z.object({ dealId: uuid, name: z.string().trim().min(1).max(200), type: z.string().max(100), size: z.number().int().min(1).max(ROOM_MAX_BYTES) });

export async function reserveRoomFileAction(input: z.input<typeof reserveSchema>): Promise<RoomResult> {
  await requireUser();
  const parsed = reserveSchema.safeParse(input);
  if (!parsed.success) return agencyFail(input.size > ROOM_MAX_BYTES ? "file_too_large" : "invalid_input");
  const mime = guessRoomMime(parsed.data.name, parsed.data.type);
  if (!mime) return agencyFail("invalid_file_type");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_room_attach_reserve", {
      p_deal: parsed.data.dealId,
      p_meta: { mime_type: mime, size_bytes: parsed.data.size, name: parsed.data.name.slice(0, 120) },
    });
    if (error) return agencyFail(error);
    const row = (data ?? {}) as { id?: string; path?: string };
    if (!row.id || !row.path) return agencyFail("generic");
    return { ok: true, message: "", id: row.id, path: row.path };
  } catch (error) {
    return agencyFail(error);
  }
}

/** URL assinada de 60 s com o cliente da pessoa (a política do Storage repete a regra de project_room_file). */
export async function roomFileUrlAction(input: { messageId: string }): Promise<RoomResult> {
  await requireUser();
  const parsed = z.object({ messageId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_room_file", { p_message: parsed.data.messageId });
    if (error) return agencyFail(error);
    const path = (data as { path?: string } | null)?.path;
    if (!path) return agencyFail("not_found");
    const signed = await supabase.storage.from("agency-docs").createSignedUrl(path, 60);
    if (signed.error || !signed.data?.signedUrl) return agencyFail("not_found");
    return { ok: true, message: "", url: signed.data.signedUrl };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- agência: sala, staff, guia de uso
export async function updateRoomAction(input: { dealId: string; briefing: string; ndaHeroes: boolean }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, briefing: z.string().max(6000), ndaHeroes: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("project_room_update", { p_deal: parsed.data.dealId, p_briefing: parsed.data.briefing, p_nda_heroes: parsed.data.ndaHeroes });
    if (error) return agencyFail(error);
    revalidateRoom("agency", parsed.data.dealId);
    return { ok: true, message: await done("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setRoomOpenAction(input: { dealId: string; open: boolean }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, open: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = parsed.data.open
      ? await supabase.rpc("project_room_open", { p_deal: parsed.data.dealId })
      : await supabase.rpc("project_room_archive", { p_deal: parsed.data.dealId });
    if (error) return agencyFail(error);
    revalidateRoom("agency", parsed.data.dealId);
    return { ok: true, message: await done(parsed.data.open ? "opened" : "archived") };
  } catch (error) {
    return agencyFail(error);
  }
}

const inviteSchema = z.object({ dealId: uuid, email: z.email().max(254), name: z.string().trim().min(2).max(80), jobFunction: z.string().trim().min(2).max(60), days: z.number().int().min(1).max(30) });

export async function inviteStaffAction(input: z.input<typeof inviteSchema>): Promise<RoomResult> {
  const ctx = await requireAgency("staff");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return agencyFail(input.email && !z.email().safeParse(input.email).success ? "invalid_email" : "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_staff_invite", { p_deal: d.dealId, p_email: d.email.toLowerCase(), p_name: d.name, p_function: d.jobFunction, p_days: d.days });
    if (error) return agencyFail(error);
    const token = (data as { token?: string } | null)?.token;
    if (!token) return agencyFail("generic");
    const link = `${await getOrigin()}/projetos/convite?token=${encodeURIComponent(token)}`;
    const emailed = await sendInviteEmail({ to: d.email, link, scopeName: ctx.agency.name, roleLabel: d.jobFunction, days: d.days });
    revalidateRoom("agency", d.dealId);
    return { ok: true, message: await done(emailed ? "invitedEmailed" : "invited"), link, emailed };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function removeStaffAction(input: { dealId: string; memberId: string }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, memberId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("project_staff_remove", { p_member: parsed.data.memberId });
    if (error) return agencyFail(error);
    revalidateRoom("agency", parsed.data.dealId);
    return { ok: true, message: await done("removed") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setUsageGuideAction(input: { dealId: string; messageId: string | null }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, messageId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("project_room_usage_guide_set", { p_deal: parsed.data.dealId, p_message: parsed.data.messageId });
    if (error) return agencyFail(error);
    revalidateRoom("agency", parsed.data.dealId);
    return { ok: true, message: await done(parsed.data.messageId ? "guideSet" : "guideCleared") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- staff externo: aceite e NDA
export async function acceptStaffInviteAction(input: { token: string }): Promise<RoomResult> {
  await requireUser();
  const parsed = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(input);
  if (!parsed.success) return agencyFail("invitation_invalid");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_staff_accept", { p_token: parsed.data.token });
    if (error || !data) return agencyFail(error ?? "generic");
    revalidatePath("/projetos");
    return { ok: true, message: await done("accepted"), dealId: data };
  } catch (error) {
    return agencyFail(error);
  }
}

export type NdaPreview = { version: number; text: string; sha256: string; required: boolean; signed: boolean };

export async function ndaPreviewAction(input: { dealId: string }): Promise<{ ok: true; preview: NdaPreview } | { ok: false; error: string }> {
  await requireUser();
  const parsed = z.object({ dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_nda_preview", { p_deal: parsed.data.dealId });
    if (error) return agencyFail(error);
    const r = (data ?? {}) as Record<string, unknown>;
    return { ok: true, preview: { version: Number(r.version ?? 1), text: String(r.text ?? ""), sha256: String(r.sha256 ?? ""), required: r.required === true, signed: r.signed === true } };
  } catch (error) {
    return agencyFail(error);
  }
}

const ndaSchema = z.object({ portal: portalSchema, dealId: uuid, fullName: z.string().max(200), taxId: z.string().max(40), expectedHash: z.string().regex(/^[0-9a-f]{64}$/) });

export async function ndaSignAction(input: z.input<typeof ndaSchema>): Promise<RoomResult> {
  await requireUser();
  const parsed = ndaSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const name = cleanSignerName(d.fullName);
  if (!name) return agencyFail("name_required");
  if (!taxIdKind(d.taxId)) return agencyFail("invalid_tax_id");
  try {
    const h = await headers();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_nda_sign", {
      p_deal: d.dealId,
      p_full_name: name,
      p_tax_id: d.taxId,
      p_expected_hash: d.expectedHash,
      p_ip: clientIpFrom(h),
      p_user_agent: (h.get("user-agent") ?? "").slice(0, 400),
    });
    if (error || !data) return agencyFail(error ?? "generic");
    revalidateRoom(d.portal, d.dealId);
    return { ok: true, message: await done("ndaSigned"), id: data };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- ficha da diária e check-in
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const shootSchema = z.object({
  dealId: uuid,
  id: uuid.nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(timeRe),
  endTime: z.string().regex(timeRe).or(z.literal("")),
  location: z.string().trim().min(2).max(200),
  mapUrl: z.string().trim().max(500),
  parking: z.string().trim().max(300),
  food: z.string().trim().max(300),
  peopleLimit: z.number().int().min(1).max(999).nullable(),
  notes: z.string().trim().max(2000),
  crew: z.array(z.object({ userId: uuid, role: z.string().trim().max(60) })).max(80),
});

export async function saveShootDayAction(input: z.input<typeof shootSchema>): Promise<RoomResult> {
  const ctx = await requireAgency("staff");
  const parsed = shootSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.mapUrl && !/^https:\/\//i.test(d.mapUrl)) return agencyFail("invalid_url");
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const startsAt = toZonedIso(d.date, d.startTime, tz);
  // fim antes do início = atravessa a meia-noite (diária noturna)
  let endsAt = d.endTime ? toZonedIso(d.date, d.endTime, tz) : null;
  if (!startsAt) return agencyFail("invalid_input");
  if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) endsAt = new Date(new Date(endsAt).getTime() + 24 * 3600_000).toISOString();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_shoot_day_save", {
      p_deal: d.dealId,
      p_id: d.id,
      p_data: {
        starts_at: startsAt,
        ends_at: endsAt ?? "",
        location: d.location,
        map_url: d.mapUrl,
        parking: d.parking,
        food: d.food,
        people_limit: d.peopleLimit === null ? "" : String(d.peopleLimit),
        notes: d.notes,
        crew: d.crew.map((c) => ({ user_id: c.userId, role: c.role })),
      },
    });
    if (error) return agencyFail(error);
    revalidateRoom("agency", d.dealId);
    revalidatePath("/agencia/agenda");
    return { ok: true, message: await done("shootSaved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function cancelShootDayAction(input: { dealId: string; id: string }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("project_shoot_day_cancel", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidateRoom("agency", parsed.data.dealId);
    revalidatePath("/agencia/agenda");
    return { ok: true, message: await done("shootCancelled") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function checkinAction(input: { portal: RoomPortal; dealId: string; shootDayId: string }): Promise<RoomResult> {
  await requireUser();
  const parsed = z.object({ portal: portalSchema, dealId: uuid, shootDayId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("project_checkin", { p_shoot_day: parsed.data.shootDayId });
    if (error) return agencyFail(error);
    revalidateRoom(parsed.data.portal, parsed.data.dealId);
    return { ok: true, message: await done("checkedIn") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- feedback
export async function requestFeedbackAction(input: { dealId: string; moment: "production_day" | "closing" }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, moment: z.enum(["production_day", "closing"]) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_feedback_request", { p_deal: parsed.data.dealId, p_moment: parsed.data.moment });
    if (error) return agencyFail(error);
    revalidateRoom("agency", parsed.data.dealId);
    return { ok: true, message: await done(data ? "feedbackRequested" : "feedbackAlready") };
  } catch (error) {
    return agencyFail(error);
  }
}

const answerSchema = z.object({ portal: z.enum(["brand", "talent"]), dealId: uuid, id: uuid, score: z.number().int().min(0).max(10), comment: z.string().trim().max(1000) });

export async function answerFeedbackAction(input: z.input<typeof answerSchema>): Promise<RoomResult> {
  await requireUser();
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("project_feedback_answer", { p_id: d.id, p_score: d.score, p_comment: d.comment });
    if (error) return agencyFail(error);
    revalidateRoom(d.portal, d.dealId);
    return { ok: true, message: await done("feedbackThanks") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- configurações (Adm): normas e NDA
export async function saveProjectSettingsAction(input: { norms: string; nda: string }): Promise<RoomResult> {
  const ctx = await requireAgency("admin");
  const parsed = z.object({ norms: z.string().trim().min(10).max(6000), nda: z.string().trim().min(50).max(20000) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_project_settings_save", { p_agency: ctx.agency.id, p_norms: parsed.data.norms, p_nda: parsed.data.nda });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/configuracoes/projetos");
    return { ok: true, message: await done("settingsSaved", { version: data ?? 1 }) };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- prévia nas entregas
export async function setPreviewAction(input: { dealId: string; versionId: string; preview: boolean }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, versionId: uuid, preview: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("deliverable_preview_set", { p_version: parsed.data.versionId, p_preview: parsed.data.preview });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    return { ok: true, message: await done(parsed.data.preview ? "previewMarked" : "previewUnmarked") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setPreviewDateAction(input: { dealId: string; deliverableId: string; date: string }): Promise<RoomResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, deliverableId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("deliverable_preview_date_set", { p_deliverable: parsed.data.deliverableId, p_date: parsed.data.date || null });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    return { ok: true, message: await done("previewDateSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}
