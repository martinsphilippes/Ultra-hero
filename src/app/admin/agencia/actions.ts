"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getOrigin } from "@/lib/auth/origin";
import { sendInviteEmail } from "@/lib/email/invite";
import { agencyFail } from "@/lib/agency/errors";
import { emailSchema } from "@/lib/agency/schemas";
import { AGENCY_ROLES } from "@/lib/agency/roles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// /admin/agencia: só o admin geral (is_platform_admin).

export type AdminAgencyResult = { ok: true; message: string; id?: string; link?: string; emailed?: boolean } | { ok: false; error: string };

async function platformAdmin() {
  const { user } = await requireRole("admin", "/admin/agencia");
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) throw new Error("forbidden");
  return { user, supabase };
}

const agencySchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  status: z.enum(["active", "suspended"]),
  contactEmail: z.union([z.literal(""), emailSchema]),
});

export async function saveAgencyAction(input: { id: string | null; name: string; slug: string; status: string; contactEmail: string }): Promise<AdminAgencyResult> {
  try {
    const { supabase } = await platformAdmin();
    const parsed = agencySchema.safeParse(input);
    if (!parsed.success) return agencyFail("invalid_input");
    const { data, error } = await supabase.rpc("admin_agency_save", {
      p_id: parsed.data.id,
      p_data: { name: parsed.data.name, slug: parsed.data.slug, status: parsed.data.status, contact_email: parsed.data.contactEmail },
    });
    if (error) return agencyFail(error);
    revalidatePath("/admin/agencia");
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("adminAgency");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

// Convite do primeiro Adm (ou de qualquer nível) de uma agência, pelo admin geral.
export async function inviteAgencyMemberAction(input: { agencyId: string; email: string; role: string }): Promise<AdminAgencyResult> {
  try {
    const { supabase } = await platformAdmin();
    const parsed = z.object({ agencyId: z.uuid(), email: emailSchema, role: z.enum(AGENCY_ROLES) }).safeParse(input);
    if (!parsed.success) return agencyFail("invalid_input");
    const { data, error } = await supabase.rpc("agency_invite_member", { p_agency: parsed.data.agencyId, p_email: parsed.data.email, p_role: parsed.data.role });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidatePath("/admin/agencia");
    const [t, tr, { data: agency }] = await Promise.all([getTranslations("adminAgency"), getTranslations("agency.roles"), supabase.from("agencies").select("name").eq("id", parsed.data.agencyId).maybeSingle()]);
    const link = `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    // e-mail automático quando o provedor está configurado; o link segue na tela de todo jeito
    const emailed = await sendInviteEmail({ to: parsed.data.email, link, scopeName: agency?.name ?? "Groscove Ultra", roleLabel: tr(parsed.data.role), days: 7 });
    return { ok: true, message: t("inviteCreated"), link, emailed };
  } catch (error) {
    return agencyFail(error);
  }
}

// Transferência de marca entre agências (D18): só o admin geral, arquivando o vínculo anterior.
export async function transferBrandAction(input: { agencyId: string; brandId: string }): Promise<AdminAgencyResult> {
  try {
    const { supabase } = await platformAdmin();
    const parsed = z.object({ agencyId: z.uuid(), brandId: z.uuid() }).safeParse(input);
    if (!parsed.success) return agencyFail("invalid_input");
    const { error } = await supabase.rpc("agency_brand_link", { p_agency: parsed.data.agencyId, p_brand: parsed.data.brandId, p_on: true });
    if (error) return agencyFail(error);
    revalidatePath("/admin/agencia");
    const t = await getTranslations("adminAgency");
    return { ok: true, message: t("transferred") };
  } catch (error) {
    return agencyFail(error);
  }
}
