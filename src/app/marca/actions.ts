"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getOrigin } from "@/lib/auth/origin";
import { agencyFail } from "@/lib/agency/errors";
import { daysSchema, emailSchema } from "@/lib/agency/schemas";
import { BRAND_COOKIE, getBrandContext, requireBrand } from "@/lib/brand-portal/server";
import { brandRequestSchema, toZonedIso, type BrandRequestInput } from "@/lib/deals/schemas";
import { defaultTimeZone } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

// Portal da marca: o dono convida e remove a equipe (a RPC confere e audita). Propostas de campanha
// (0066): salvar rascunho, enviar à agência e cancelar; o valor oferecido vai à tabela de valor
// (campaign_request_budgets), que só a própria marca e o Adm da agência leem.

export type BrandPortalResult = { ok: true; message: string; link?: string; id?: string } | { ok: false; error: string };

export async function saveRequestAction(input: BrandRequestInput): Promise<BrandPortalResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = brandRequestSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_request_save", {
      p_id: d.id,
      p_brand: ctx.brand.id,
      p_data: {
        talent_id: d.talentId,
        title: d.title,
        objective: d.objective,
        product: d.product,
        target_audience: d.targetAudience,
        target_age_bands: d.targetAgeBands,
        target_states: d.targetStates,
        region_note: d.regionNote,
        period_start: d.periodStart,
        period_end: d.periodEnd,
        desired_at: d.periodStart && d.desiredTime ? toZonedIso(d.periodStart, d.desiredTime, defaultTimeZone) : "",
        duration_minutes: d.durationMinutes === "" ? "" : String(d.durationMinutes),
        format: d.format,
        location: d.location,
        networks: d.networks,
        deliverables: d.deliverables,
        notes: d.notes,
        budget_max_cents: d.budgetMaxCents === null ? "" : String(d.budgetMaxCents),
        budget_note: d.budgetNote,
      },
    });
    if (error) return agencyFail(error);
    if (!data) return agencyFail("generic");
    revalidatePath("/marca/campanhas");
    revalidatePath(`/marca/campanhas/${data}`);
    const t = await getTranslations("brandPortal.campaigns");
    return { ok: true, message: t("draftSaved"), id: data };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function submitRequestAction(input: { id: string }): Promise<BrandPortalResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_request_submit", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("brandPortal.campaigns");
    return { ok: true, message: t("submitted"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function cancelRequestAction(input: { id: string; note: string }): Promise<BrandPortalResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: z.uuid(), note: z.string().trim().min(5).max(500) }).safeParse(input);
  if (!parsed.success) return agencyFail("justification_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_request_cancel", { p_id: parsed.data.id, p_note: parsed.data.note });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("brandPortal.campaigns");
    return { ok: true, message: t("cancelled") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function inviteStaffAction(input: { email: string; days?: number }): Promise<BrandPortalResult> {
  const ctx = await requireBrand();
  const parsed = z.object({ email: emailSchema, days: daysSchema }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_invite_member", { p_brand: ctx.brand.id, p_email: parsed.data.email, p_days: parsed.data.days });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidatePath("/marca/equipe");
    const t = await getTranslations("brandPortal.team");
    return { ok: true, message: t("inviteCreated"), link: `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}` };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function removeBrandStaffAction(input: { userId: string }): Promise<BrandPortalResult> {
  const ctx = await requireBrand();
  const parsed = z.object({ userId: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_member_remove", { p_brand: ctx.brand.id, p_user: parsed.data.userId });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("brandPortal.team");
    return { ok: true, message: t("removed") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function revokeBrandInviteAction(input: { id: string }): Promise<BrandPortalResult> {
  await requireBrand();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_invitation_revoke", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidatePath("/marca/equipe");
    const t = await getTranslations("brandPortal.team");
    return { ok: true, message: t("inviteRevoked") };
  } catch (error) {
    return agencyFail(error);
  }
}

// Quem tem mais de uma marca (ou o admin geral) escolhe qual está vendo.
export async function selectBrandAction(input: { id: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getBrandContext();
  if (ctx.state !== "ok" || !ctx.brands.some((b) => b.id === parsed.data.id)) return { ok: false };
  (await cookies()).set(BRAND_COOKIE, parsed.data.id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}
