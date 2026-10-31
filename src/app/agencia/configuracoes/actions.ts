"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { agencyFail } from "@/lib/agency/errors";
import { selfSchema, settingsSchema } from "@/lib/agency/schemas";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string };

// Dados da agência: gestor+ (a RPC confere e audita).
export async function saveSettingsAction(input: { name: string; timezone: string; relationshipAlertDays: number | string; contactEmail: string }): Promise<SettingsResult> {
  const ctx = await requireAgency("manager");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_settings_save", {
      p_agency: ctx.agency.id,
      p_data: {
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        relationship_alert_days: parsed.data.relationshipAlertDays,
        contact_email: parsed.data.contactEmail,
      },
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.settings");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

// Nome e cargo da própria pessoa na equipe (qualquer membro).
export async function updateSelfAction(input: { displayName: string; jobTitle: string }): Promise<SettingsResult> {
  await requireAgency("staff");
  const parsed = selfSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_member_update_self", { p_display_name: parsed.data.displayName, p_job_title: parsed.data.jobTitle });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.settings");
    return { ok: true, message: t("selfSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}
