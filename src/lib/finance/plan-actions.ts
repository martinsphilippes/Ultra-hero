"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { planToJson, savePlanSchema, type PaymentPlan } from "./payment-plan";

// Condições de pagamento (0108): só o Adm grava, antes da contratação. O banco valida tudo de novo, refaz o PREVISTO
// (marca, Hero e agência) e avisa a marca. Registro simulado: nada cobra nem move dinheiro.

export type PlanResult = { ok: true; message: string } | { ok: false; error: string };

export async function savePaymentPlanAction(input: z.input<typeof savePlanSchema>): Promise<PlanResult> {
  await requireAgency("admin");
  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_payment_plan_save", {
      p_deal: d.dealId,
      p_data: { total_cents: d.totalCents, plan: planToJson(d.plan as PaymentPlan) } as Json,
    });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${d.dealId}`, "layout");
    revalidatePath("/agencia/financeiro");
    revalidatePath("/marca/pagamentos");
    revalidatePath("/heroi/financeiro");
    const t = await getTranslations("payments.plan");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const dealOnly = z.object({ dealId: z.uuid() });

/** Efetiva a cobrança do Hero-cliente (Adm): o previsto vira em aberto com as datas do plano. */
export async function confirmClientBillingAction(input: z.input<typeof dealOnly>): Promise<PlanResult> {
  await requireAgency("admin");
  const parsed = dealOnly.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_client_billing_confirm", { p_deal: parsed.data.dealId });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    revalidatePath("/agencia/financeiro");
    revalidatePath("/heroi/projetos", "layout");
    const t = await getTranslations("payments.client");
    return { ok: true, message: t("confirmed") };
  } catch (error) {
    return agencyFail(error);
  }
}

const installmentSchema = z.object({ installmentId: z.uuid(), paid: z.boolean() });

/** Parcela do Hero-cliente recebida (ou desfeita) pelo Adm; todas recebidas quitam o lançamento. */
export async function setClientInstallmentAction(input: z.input<typeof installmentSchema>): Promise<PlanResult> {
  await requireAgency("admin");
  const parsed = installmentSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_client_installment_paid", { p_installment: parsed.data.installmentId, p_paid: parsed.data.paid });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/financeiro");
    revalidatePath("/heroi/projetos", "layout");
    const t = await getTranslations("payments.client");
    return { ok: true, message: parsed.data.paid ? t("markedPaid") : t("markedOpen") };
  } catch (error) {
    return agencyFail(error);
  }
}
