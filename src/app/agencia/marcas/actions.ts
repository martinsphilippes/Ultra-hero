"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getOrigin } from "@/lib/auth/origin";
import { sendInviteEmail } from "@/lib/email/invite";
import { accessEmailSchema, accessErrorCode, accessPhoneSchema, contactNameSchema, parseAccessProvision } from "@/lib/agency/access-contact";
import { deliverAccess, type AccessOutcome } from "@/lib/agency/access-deliver";
import { agencyFail } from "@/lib/agency/errors";
import { brandCreateSchema, brandInviteSchema } from "@/lib/agency/schemas";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";

// Marcas da agência: gestor+ cria (nasce fora do app, D7), vincula marca existente e convida a equipe.

export type BrandResult = { ok: true; message: string; id?: string; link?: string; emailed?: boolean } | { ok: false; error: string };

// 0112: fora da agência de exemplo, a marca nasce com o acesso do contato (nome, e-mail e celular obrigatórios):
// conta existente vira Dona na hora; senão convite de 14 dias. A de exemplo segue sem contato (não convida ninguém).
const brandContactSchema = z.object({ contactName: contactNameSchema, email: accessEmailSchema, phone: accessPhoneSchema });

export type BrandCreateResult = ({ ok: true; message: string; id?: string } & Partial<AccessOutcome>) | { ok: false; error: string };

export async function createBrandAction(input: {
  name: string;
  slug: string;
  siteUrl: string;
  logoUrl?: string;
  intent?: string;
  evidenceUrl?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}): Promise<BrandCreateResult> {
  const ctx = await requireAgency("manager");
  const parsed = brandCreateSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const p_data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    site_url: parsed.data.siteUrl,
    logo_url: parsed.data.logoUrl ?? "",
    intent: parsed.data.intent ?? "",
    evidence_url: parsed.data.evidenceUrl ?? "",
  };
  try {
    const supabase = await createClient();
    const t = await getTranslations("agency.brands");
    if (ctx.agency.isDemo) {
      const { data, error } = await supabase.rpc("agency_brand_create", { p_agency: ctx.agency.id, p_data });
      if (error) return agencyFail(error);
      revalidatePath("/agencia", "layout");
      return { ok: true, message: t("created"), id: data ?? undefined };
    }
    const contact = brandContactSchema.safeParse({ contactName: input.contactName ?? "", email: input.email ?? "", phone: input.phone ?? "" });
    if (!contact.success) return agencyFail(accessErrorCode(contact.error));
    const { data, error } = await supabase.rpc("agency_brand_create_with_access", {
      p_agency: ctx.agency.id,
      p_data,
      p_contact_name: contact.data.contactName,
      p_email: contact.data.email,
      p_phone: contact.data.phone,
    });
    if (error) return agencyFail(error);
    const id = (data as { brand_id?: unknown } | null)?.brand_id;
    const result = parseAccessProvision(data);
    if (typeof id !== "string" || !result) return agencyFail("generic");
    revalidatePath("/agencia", "layout");
    const outcome = await deliverAccess({ kind: "brand", result, email: contact.data.email, name: parsed.data.name, agencyName: ctx.agency.name });
    return { ok: true, id, ...outcome, message: `${t("created")} ${outcome.message}` };
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
    const [t, tr, { data: brand }] = await Promise.all([getTranslations("agency.brands"), getTranslations("agency.roles"), supabase.from("brands").select("name").eq("id", parsed.data.brandId).maybeSingle()]);
    const link = `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    const emailed = await sendInviteEmail({ to: parsed.data.email, link, scopeName: brand?.name ?? ctx.agency.name, roleLabel: tr(parsed.data.role === "staff" ? "brandStaff" : parsed.data.role), days: parsed.data.days });
    return { ok: true, message: t("inviteCreated"), link, emailed };
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
