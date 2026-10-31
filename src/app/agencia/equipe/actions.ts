"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getOrigin } from "@/lib/auth/origin";
import { agencyFail } from "@/lib/agency/errors";
import { inviteMemberSchema, removeMemberSchema, setRoleSchema } from "@/lib/agency/schemas";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";

// Equipe da agência: só o Adm convida, troca papel e remove (a RPC confere de novo e audita).

export type TeamResult = { ok: true; message: string; link?: string } | { ok: false; error: string };

export async function inviteMemberAction(input: { email: string; role: string; days?: number }): Promise<TeamResult> {
  const ctx = await requireAgency("admin");
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_invite_member", {
      p_agency: ctx.agency.id,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
      p_days: parsed.data.days,
    });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidatePath("/agencia/equipe");
    const t = await getTranslations("agency.team");
    return { ok: true, message: t("inviteCreated"), link: `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}` };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setMemberRoleAction(input: { userId: string; role: string; justification: string }): Promise<TeamResult> {
  const ctx = await requireAgency("admin");
  const parsed = setRoleSchema.safeParse(input);
  if (!parsed.success) return agencyFail("justification_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_member_set_role", {
      p_agency: ctx.agency.id,
      p_user: parsed.data.userId,
      p_role: parsed.data.role,
      p_justification: parsed.data.justification,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.team");
    return { ok: true, message: t("roleChanged") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function removeMemberAction(input: { userId: string; justification: string }): Promise<TeamResult> {
  const ctx = await requireAgency("admin");
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return agencyFail("justification_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_member_remove", {
      p_agency: ctx.agency.id,
      p_user: parsed.data.userId,
      p_justification: parsed.data.justification,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.team");
    return { ok: true, message: t("removed") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function revokeInvitationAction(input: { id: string }): Promise<TeamResult> {
  await requireAgency("staff");
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_invitation_revoke", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.team");
    return { ok: true, message: t("inviteRevoked") };
  } catch (error) {
    return agencyFail(error);
  }
}
