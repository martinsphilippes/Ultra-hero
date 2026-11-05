"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { sendInviteEmail } from "@/lib/email/invite";
import { createClient } from "@/lib/supabase/server";

// Convites da agência (0091): marca por e-mail (marca nova → passo a passo já ligado à agência; dono de marca
// existente → pedido de vínculo que ele aceita) e Hero (titular para Hero do casting sem dono, ou Hero novo
// pendente para creator do casting sem Hero). Gestor+; as RPCs conferem de novo.

export type AgencyInviteResult = { ok: true; message: string; link: string; emailed: boolean } | { ok: false; error: string };

const base = z.object({ email: z.email().max(254), days: z.number().int().min(1).max(30) });

export async function inviteBrandByEmailAction(input: { email: string; days: number }): Promise<AgencyInviteResult> {
  const ctx = await requireAgency("manager");
  const parsed = base.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_email");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_invite_brand", { p_agency: ctx.agency.id, p_email: parsed.data.email.toLowerCase(), p_days: parsed.data.days });
    if (error) return agencyFail(error);
    const row = (data ?? {}) as { token?: string; kind?: string };
    if (!row.token) return agencyFail("generic");
    revalidatePath("/agencia/marcas");
    const t = await getTranslations("invites.agency");
    const link = `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    const linkRequest = row.kind === "brand_link";
    const emailed = await sendInviteEmail({ to: parsed.data.email, link, scopeName: ctx.agency.name, roleLabel: linkRequest ? t("linkRole") : t("newBrandRole"), days: parsed.data.days });
    return { ok: true, message: linkRequest ? t("linkSent") : t("newBrandSent"), link, emailed };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function inviteHeroAction(input: { talentId: string; heroName: string; email: string; days: number }): Promise<AgencyInviteResult> {
  const ctx = await requireAgency("manager");
  const parsed = base.extend({ talentId: z.uuid(), heroName: z.string().trim().max(80) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_invite_hero", {
      p_talent: parsed.data.talentId,
      p_name: parsed.data.heroName,
      p_email: parsed.data.email.toLowerCase(),
      p_days: parsed.data.days,
    });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidatePath("/agencia/herois");
    revalidatePath(`/agencia/casting/${parsed.data.talentId}`);
    const t = await getTranslations("invites.agency");
    const link = `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    const emailed = await sendInviteEmail({ to: parsed.data.email, link, scopeName: ctx.agency.name, roleLabel: t("heroRole"), days: parsed.data.days });
    return { ok: true, message: t("heroSent"), link, emailed };
  } catch (error) {
    return agencyFail(error);
  }
}
