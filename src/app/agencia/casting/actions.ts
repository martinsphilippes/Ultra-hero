"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { daysSchema, emailSchema, justificationSchema } from "@/lib/agency/schemas";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";
import { talentSchema, type TalentInput } from "@/lib/talent/schemas";
import { CONSENT_VERSION } from "@/lib/talent/vocab";

// Casting da agência (6.2 e 7.1): o papel é conferido pela RPC (gestor+ grava; colaborador só lê;
// arquivar é do Adm). Redes e kit usam as ações comuns de src/lib/talent/actions.ts.

export type CastingResult = { ok: true; message: string; id?: string; link?: string } | { ok: false; error: string };

const uuid = z.uuid();

function revalidateTalent(id?: string) {
  revalidatePath("/agencia/casting");
  if (id) revalidatePath(`/agencia/casting/${id}`, "layout");
}

export async function saveTalentAction(input: Omit<TalentInput, "state"> & { state: string; id?: string | null }): Promise<CastingResult> {
  const ctx = await requireAgency("staff");
  const parsed = talentSchema.safeParse(input);
  const id = input.id ? uuid.safeParse(input.id) : null;
  if (!parsed.success || (id && !id.success)) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_talent_save", {
      p_id: id?.success ? id.data : null,
      p_agency: ctx.agency.id,
      p_data: {
        display_name: d.displayName,
        city: d.city,
        state: d.state,
        manager_id: d.managerId,
        commercial_status: d.commercialStatus,
        availability: d.availability,
        availability_note: d.availabilityNote,
        contact_email: d.contactEmail,
        contact_phone: d.contactPhone,
        internal_notes: d.internalNotes,
        last_contact_at: d.lastContactAt ? `${d.lastContactAt}T12:00:00Z` : "",
      },
    });
    if (error) return agencyFail(error);
    revalidateTalent(data ?? undefined);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: id ? t("saved") : t("created"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setSegmentsAction(input: { talentId: string; segmentIds: string[] }): Promise<CastingResult> {
  await requireAgency("staff");
  const parsed = z.object({ talentId: uuid, segmentIds: z.array(uuid).max(5) }).safeParse(input);
  if (!parsed.success) return agencyFail("too_many_segments");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_talent_set_segments", { p_talent: parsed.data.talentId, p_segment_ids: parsed.data.segmentIds });
    if (error) return agencyFail(error);
    revalidateTalent(parsed.data.talentId);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: t("segmentsSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function linkCreatorAction(input: { talentId: string; creatorId: string | null }): Promise<CastingResult> {
  await requireAgency("staff");
  const parsed = z.object({ talentId: uuid, creatorId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_talent_link_creator", { p_talent: parsed.data.talentId, p_creator: parsed.data.creatorId });
    if (error) return agencyFail(error);
    revalidateTalent(parsed.data.talentId);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: parsed.data.creatorId ? t("heroLinked") : t("heroUnlinked") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setCatalogAction(input: { talentId: string; visible: boolean }): Promise<CastingResult> {
  await requireAgency("staff");
  const parsed = z.object({ talentId: uuid, visible: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_talent_set_catalog", { p_talent: parsed.data.talentId, p_visible: parsed.data.visible });
    if (error) return agencyFail(error);
    revalidateTalent(parsed.data.talentId);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: parsed.data.visible ? t("catalogOn") : t("catalogOff") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function archiveTalentAction(input: { talentId: string; justification: string }): Promise<CastingResult> {
  await requireAgency("admin");
  const parsed = z.object({ talentId: uuid, justification: justificationSchema }).safeParse(input);
  if (!parsed.success) return agencyFail("justification_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_talent_archive", { p_talent: parsed.data.talentId, p_justification: parsed.data.justification });
    if (error) return agencyFail(error);
    revalidateTalent(parsed.data.talentId);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: t("archived") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Convite do talento sem página: o link aparece UMA vez (o banco guarda só o hash). */
export async function inviteTalentAction(input: { talentId: string; email: string; days?: number }): Promise<CastingResult> {
  await requireAgency("staff");
  const parsed = z.object({ talentId: uuid, email: emailSchema, days: daysSchema }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_email");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_invite_talent", { p_talent: parsed.data.talentId, p_email: parsed.data.email, p_days: parsed.data.days });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidateTalent(parsed.data.talentId);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: t("inviteCreated"), link: `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}` };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Consentimento registrado pela agência (talento sem login), com o termo assinado já enviado. */
export async function recordConsentAction(input: { talentId: string; documentId: string }): Promise<CastingResult> {
  await requireAgency("staff");
  const parsed = z.object({ talentId: uuid, documentId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_talent_record_consent", { p_talent: parsed.data.talentId, p_version: CONSENT_VERSION, p_document: parsed.data.documentId });
    if (error) return agencyFail(error);
    revalidateTalent(parsed.data.talentId);
    const t = await getTranslations("agency.casting");
    return { ok: true, message: t("consentRecorded") };
  } catch (error) {
    return agencyFail(error);
  }
}
