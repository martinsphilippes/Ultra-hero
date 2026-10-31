"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";
import { dealRateSchema, entryStatusSchema, rateSchema, sponsorshipSchema } from "./vocab";

// Financeiro simulado e patrocínio (0069): o servidor valida a forma; a RPC confere papel, estado e audita.

export type FinanceResult = { ok: true; message: string } | { ok: false; error: string };

/** Situação de um lançamento (Adm): a vencer, liquidado ou cancelado (com nota). */
export async function setEntryStatusAction(input: z.input<typeof entryStatusSchema> & { dealId?: string | null }): Promise<FinanceResult> {
  await requireAgency("admin");
  const parsed = entryStatusSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_entry_set_status", { p_entry: parsed.data.entryId, p_status: parsed.data.status, p_note: parsed.data.note || null });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/financeiro");
    revalidatePath("/agencia");
    if (input.dealId && /^[0-9a-f-]{36}$/i.test(input.dealId)) revalidatePath(`/agencia/negocios/${input.dealId}`);
    const t = await getTranslations("agency.finance");
    return { ok: true, message: t(`statusSet.${parsed.data.status}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Taxa de serviço padrão da agência (Adm). */
export async function setAgencyRateAction(input: { rateBp: number }): Promise<FinanceResult> {
  const ctx = await requireAgency("admin");
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_rate_set", { p_agency: ctx.agency.id, p_rate_bp: parsed.data.rateBp });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("agency.finance");
    return { ok: true, message: t("rateSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Taxa de serviço de um negócio (Adm, antes da contratação); null volta ao padrão. */
export async function setDealRateAction(input: { dealId: string; rateBp: number | null }): Promise<FinanceResult> {
  await requireAgency("admin");
  const parsed = dealRateSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deal_rate_set", { p_deal: parsed.data.dealId, p_rate_bp: parsed.data.rateBp });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    const t = await getTranslations("agency.finance");
    return { ok: true, message: t("rateSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Publica a marca como patrocinadora do herói ligado ao creator contratado (gestor+; ação humana). */
export async function publishSponsorshipAction(input: { dealTalentId: string; dealId: string }): Promise<FinanceResult> {
  await requireAgency("manager");
  const parsed = sponsorshipSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_publish_sponsorship", { p_deal_talent: parsed.data.dealTalentId });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    const t = await getTranslations("agency.sponsorship");
    return { ok: true, message: data ? t("published") : t("alreadyPublished") };
  } catch (error) {
    return agencyFail(error);
  }
}
