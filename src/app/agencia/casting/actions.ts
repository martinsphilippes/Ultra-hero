"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { accessEmailSchema, accessErrorCode, accessPhoneSchema, parseAccessProvision } from "@/lib/agency/access-contact";
import { deliverAccess, type AccessOutcome } from "@/lib/agency/access-deliver";
import { agencyFail } from "@/lib/agency/errors";
import { daysSchema, emailSchema, justificationSchema } from "@/lib/agency/schemas";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { sendInviteEmail } from "@/lib/email/invite";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { talentSchema, type TalentInput } from "@/lib/talent/schemas";
import { CONSENT_VERSION } from "@/lib/talent/vocab";

// Casting da agência (6.2 e 7.1): o papel é conferido pela RPC (gestor+ grava; colaborador só lê;
// arquivar é do Adm). Redes e kit usam as ações comuns de src/lib/talent/actions.ts.

export type CastingResult = { ok: true; message: string; id?: string; link?: string; emailed?: boolean } | { ok: false; error: string };

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
    const [t, { data: talent }] = await Promise.all([getTranslations("agency.casting"), supabase.from("talent_profiles").select("display_name").eq("id", parsed.data.talentId).maybeSingle()]);
    const link = `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    const emailed = await sendInviteEmail({ to: parsed.data.email, link, scopeName: talent?.display_name ?? "Groscove Ultra", roleLabel: t("inviteTalentRole"), days: parsed.data.days });
    return { ok: true, message: t("inviteCreated"), link, emailed };
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

// ---------------------------------------------------------------- 0112: um só "Novo Hero"
// Talento + e-mail e celular obrigatórios (acesso: conta existente ligada na hora ou convite de 14 dias) + gestor e
// segmentos + página pública opcional já ligada ao talento. Tudo numa transação no banco (agency_hero_create).
const pageSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/)
    .max(60),
  pillars: z.array(z.enum(PILLARS as [Pillar, ...Pillar[]])).min(1).max(4),
  headline: z.string().trim().max(160),
  bio: z.string().trim().max(2000),
});
const newHeroSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: accessEmailSchema,
  phone: accessPhoneSchema,
  managerId: z.union([z.literal(""), uuid]),
  segmentIds: z.array(uuid).max(5),
  page: pageSchema.nullable(),
});

export type NewHeroResult = ({ ok: true; talentId: string; creatorId: string | null } & AccessOutcome) | { ok: false; error: string };

export async function createHeroAction(input: z.input<typeof newHeroSchema>): Promise<NewHeroResult> {
  const ctx = await requireAgency("manager");
  const parsed = newHeroSchema.safeParse(input);
  if (!parsed.success) return agencyFail(accessErrorCode(parsed.error));
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_hero_create", {
      p_agency: ctx.agency.id,
      p_talent: { display_name: d.displayName, manager_id: d.managerId, commercial_status: "active" },
      p_email: d.email,
      p_phone: d.phone,
      p_segment_ids: d.segmentIds,
      p_page: d.page ? { slug: d.page.slug, pillars: d.page.pillars, headline: d.page.headline, bio: d.page.bio } : null,
    });
    if (error) return agencyFail(error);
    const row = (data ?? {}) as { talent_id?: unknown; creator_id?: unknown };
    const result = parseAccessProvision(data);
    if (typeof row.talent_id !== "string" || !result) return agencyFail("generic");
    revalidateTalent(row.talent_id);
    revalidatePath("/agencia/herois");
    if (d.page) revalidatePath("/personalities");
    const outcome = await deliverAccess({ kind: "talent", result, email: d.email, name: d.displayName, agencyName: ctx.agency.name });
    return { ok: true, talentId: row.talent_id, creatorId: typeof row.creator_id === "string" ? row.creator_id : null, ...outcome };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Página pública depois, pela ficha: já nasce ligada ao talento (sem passar pelo "Ligar Hero"). */
export async function createTalentPageAction(input: { talentId: string } & z.input<typeof pageSchema>): Promise<CastingResult> {
  await requireAgency("manager");
  const parsed = pageSchema.extend({ talentId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_talent_create_page", {
      p_talent: parsed.data.talentId,
      p_page: { slug: parsed.data.slug, pillars: parsed.data.pillars, headline: parsed.data.headline, bio: parsed.data.bio },
    });
    if (error) return agencyFail(error);
    revalidateTalent(parsed.data.talentId);
    revalidatePath("/agencia/herois");
    revalidatePath("/personalities");
    const t = await getTranslations("agency.casting.newHero");
    return { ok: true, message: t("pageCreated"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}
