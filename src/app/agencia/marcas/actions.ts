"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getOrigin } from "@/lib/auth/origin";
import { agencyFail } from "@/lib/agency/errors";
import { brandCreateSchema, brandInviteSchema } from "@/lib/agency/schemas";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";

// Marcas da agência: gestor+ cria (nasce fora do app, D7), vincula marca existente e convida a equipe.

export type BrandResult = { ok: true; message: string; id?: string; link?: string } | { ok: false; error: string };

export async function createBrandAction(input: { name: string; slug: string; siteUrl: string; logoUrl?: string }): Promise<BrandResult> {
  const ctx = await requireAgency("manager");
  const parsed = brandCreateSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_brand_create", {
      p_agency: ctx.agency.id,
      p_data: { name: parsed.data.name, slug: parsed.data.slug, site_url: parsed.data.siteUrl, logo_url: parsed.data.logoUrl ?? "" },
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.brands");
    return { ok: true, message: t("created"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function linkBrandAction(input: { brandId: string; on: boolean }): Promise<BrandResult> {
  const ctx = await requireAgency("manager");
  const parsed = z.object({ brandId: z.uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_brand_link", { p_agency: ctx.agency.id, p_brand: parsed.data.brandId, p_on: parsed.data.on });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.brands");
    return { ok: true, message: parsed.data.on ? t("linked") : t("archived"), id: parsed.data.brandId };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function inviteBrandMemberAction(input: { brandId: string; email: string; role: string; days?: number }): Promise<BrandResult> {
  const ctx = await requireAgency("manager");
  const parsed = brandInviteSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_invite_brand_member", {
      p_agency: ctx.agency.id,
      p_brand: parsed.data.brandId,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
      p_days: parsed.data.days,
    });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidatePath(`/agencia/marcas/${parsed.data.brandId}`);
    const t = await getTranslations("agency.brands");
    return { ok: true, message: t("inviteCreated"), link: `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}` };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function removeBrandMemberAction(input: { brandId: string; userId: string }): Promise<BrandResult> {
  await requireAgency("manager");
  const parsed = z.object({ brandId: z.uuid(), userId: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_member_remove", { p_brand: parsed.data.brandId, p_user: parsed.data.userId });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/marcas/${parsed.data.brandId}`);
    const t = await getTranslations("agency.brands");
    return { ok: true, message: t("memberRemoved") };
  } catch (error) {
    return agencyFail(error);
  }
}
