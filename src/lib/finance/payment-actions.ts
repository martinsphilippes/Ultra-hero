"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireBrand } from "@/lib/brand-portal/server";
import { dispatchWorkEmails } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_TYPES, MAX_INSTALLMENTS, PIX_KEY_TYPES, settingsProblem, splitProblem } from "./payments";

// Pagamentos da marca (0090): registro/controle simulado — nada cobra nem move dinheiro. A marca (dono e equipe)
// informa; só o Adm da agência grava os dados de pagamento, divide em parcelas e confirma/recusa. As RPCs conferem
// tudo de novo e geram os avisos (sino e fila de e-mail).

export type PaymentResult = { ok: true; message: string } | { ok: false; error: string };

const uuid = z.uuid();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function refresh() {
  revalidatePath("/marca/pagamentos");
  revalidatePath("/agencia/financeiro");
}

const settingsSchema = z.object({
  pixKeyType: z.union([z.literal(""), z.enum(PIX_KEY_TYPES)]),
  pixKey: z.string().max(120),
  bankName: z.string().max(80),
  bankBranch: z.string().max(10),
  bankAccount: z.string().max(20),
  bankAccountType: z.enum(ACCOUNT_TYPES),
  holderName: z.string().max(120),
  holderTaxId: z.string().max(30),
  instructions: z.string().max(300),
});

/** Dados de pagamento da agência (só o Adm). */
export async function savePaymentSettingsAction(input: z.input<typeof settingsSchema>): Promise<PaymentResult> {
  const ctx = await requireAgency("admin");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const t = await getTranslations("payments.settings");
  const problem = settingsProblem(d);
  if (problem) return { ok: false, error: t(`errors.${problem}`) };
  const hasBank = d.bankName.trim() !== "";
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_payment_settings_save", {
      p_agency: ctx.agency.id,
      p_data: {
        pix_key_type: d.pixKeyType || null,
        pix_key: d.pixKeyType ? d.pixKey : null,
        bank_name: hasBank ? d.bankName : null,
        bank_branch: hasBank ? d.bankBranch : null,
        bank_account: hasBank ? d.bankAccount : null,
        bank_account_type: hasBank ? d.bankAccountType : null,
        holder_name: d.holderName,
        holder_tax_id: d.holderTaxId,
        instructions: d.instructions,
      },
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/configuracoes");
    refresh();
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const splitSchema = z.object({
  entryId: uuid,
  totalCents: z.number().int().min(0),
  parts: z.array(z.object({ label: z.string().max(60), amountCents: z.number().int().min(1).nullable(), dueOn: z.string() })).min(1).max(MAX_INSTALLMENTS),
});

/** Adm divide o "a receber" em parcelas (somando o total). */
export async function splitReceivableAction(input: z.input<typeof splitSchema>): Promise<PaymentResult> {
  await requireAgency("admin");
  const parsed = splitSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const t = await getTranslations("payments.agency");
  const problem = splitProblem(parsed.data.totalCents, parsed.data.parts);
  if (problem) return { ok: false, error: t(`splitErrors.${problem}`) };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_receivable_split", {
      p_entry: parsed.data.entryId,
      p_parts: parsed.data.parts.map((p) => ({ label: p.label.trim(), amount_cents: p.amountCents, due_on: p.dueOn })),
    });
    if (error) return agencyFail(error);
    refresh();
    await dispatchWorkEmails();
    return { ok: true, message: t("splitSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const reportSchema = z.object({
  installmentId: uuid,
  paidOn: isoDay,
  amountCents: z.number().int().min(1).max(10_000_000_000),
  documentId: uuid.nullable(),
  note: z.string().trim().max(500),
});

/** Marca (dono ou equipe) informa o pagamento de uma parcela. */
export async function reportPaymentAction(input: z.input<typeof reportSchema>): Promise<PaymentResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_payment_report", {
      p_installment: parsed.data.installmentId,
      p_paid_on: parsed.data.paidOn,
      p_amount_cents: parsed.data.amountCents,
      p_document: parsed.data.documentId,
      p_note: parsed.data.note || null,
    });
    if (error) return agencyFail(error);
    refresh();
    await dispatchWorkEmails();
    const t = await getTranslations("payments.brand");
    return { ok: true, message: t("reported") };
  } catch (error) {
    return agencyFail(error);
  }
}

const reviewSchema = z.object({ reportId: uuid, decision: z.enum(["confirm", "reject"]), note: z.string().trim().max(500) });

/** Adm confirma o recebimento ou recusa (com nota). */
export async function reviewPaymentAction(input: z.input<typeof reviewSchema>): Promise<PaymentResult> {
  await requireAgency("admin");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  if (parsed.data.decision === "reject" && parsed.data.note.length < 5) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_payment_review", { p_report: parsed.data.reportId, p_decision: parsed.data.decision, p_note: parsed.data.note || null });
    if (error) return agencyFail(error);
    refresh();
    revalidatePath("/agencia");
    await dispatchWorkEmails();
    const t = await getTranslations("payments.agency");
    return { ok: true, message: t(parsed.data.decision === "confirm" ? "confirmed" : "rejected") };
  } catch (error) {
    return agencyFail(error);
  }
}
