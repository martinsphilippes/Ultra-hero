"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireUser } from "@/lib/auth/session";
import { requireBrand } from "@/lib/brand-portal/server";
import { toZonedIso } from "@/lib/deals/schemas";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "@/lib/talent/errors";
import { acceptSchema, closeSchema, decideSchema, publishSchema, recordAcceptanceSchema, submitSchema, taskDecideSchema, taskSaveSchema, taskStatusSchema, termsSchema, type TaskSaveInput } from "./vocab";

// Execução (0068): termos, contratação, tarefas e entregas. O servidor valida a forma e chama as RPCs; o banco
// decide o lado (agência, marca ou creator) e as transições. Nada aqui carrega valor.

export type ExecResult = { ok: true; message: string; id?: string; count?: number } | { ok: false; error: string };
export type ExecPortal = "agency" | "brand" | "office";

const fail = (portal: ExecPortal, error: unknown) => (portal === "office" ? talentFail(error) : agencyFail(error));
const uuid = z.uuid();

/** Caminhos que as ações revalidam (o cliente só passa o id do negócio; o caminho é montado aqui). */
function revalidateDeal(portal: ExecPortal, dealId: string, requestId?: string | null, dealTalentId?: string | null) {
  if (portal === "agency" && /^[0-9a-f-]{36}$/i.test(dealId)) revalidatePath(`/agencia/negocios/${dealId}`, "layout");
  revalidatePath("/agencia/tarefas");
  if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) revalidatePath(`/marca/campanhas/${requestId}`);
  if (dealTalentId && /^[0-9a-f-]{36}$/i.test(dealTalentId)) revalidatePath(`/creator/escritorio/oportunidades/${dealTalentId}`);
  revalidatePath("/creator/escritorio/tarefas");
}

// ---------------------------------------------------------------- termos
export async function saveTermsAction(input: z.input<typeof termsSchema>): Promise<ExecResult> {
  await requireAgency("staff");
  const parsed = termsSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_terms_save", { p_deal: d.dealId, p_data: { summary: d.summary, usage_rights: d.usageRights, exclusivity: d.exclusivity, valid_until: d.validUntil } });
    if (error) return agencyFail(error);
    revalidateDeal("agency", d.dealId);
    const t = await getTranslations("agency.terms");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function sendTermsAction(input: { termsId: string; dealId: string }): Promise<ExecResult> {
  await requireAgency("manager");
  const parsed = z.object({ termsId: uuid, dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_terms_send", { p_terms: parsed.data.termsId });
    if (error) return agencyFail(error);
    revalidateDeal("agency", parsed.data.dealId);
    const t = await getTranslations("agency.terms");
    return { ok: true, message: t("sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function withdrawTermsAction(input: { termsId: string; dealId: string }): Promise<ExecResult> {
  await requireAgency("manager");
  const parsed = z.object({ termsId: uuid, dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_terms_withdraw", { p_terms: parsed.data.termsId });
    if (error) return agencyFail(error);
    revalidateDeal("agency", parsed.data.dealId);
    const t = await getTranslations("agency.terms");
    return { ok: true, message: t("withdrawn") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function recordAcceptanceAction(input: z.input<typeof recordAcceptanceSchema> & { dealId: string }): Promise<ExecResult> {
  await requireAgency("manager");
  const parsed = recordAcceptanceSchema.extend({ dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("note_required");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_record_acceptance", { p_terms: d.termsId, p_party: d.party, p_deal_talent: d.dealTalentId || undefined, p_document: d.documentId || undefined, p_note: d.note });
    if (error) return agencyFail(error);
    revalidateDeal("agency", d.dealId);
    const t = await getTranslations("agency.terms");
    return { ok: true, message: t("acceptanceRecorded") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function confirmContractAction(input: { dealId: string }): Promise<ExecResult> {
  await requireAgency("manager");
  const parsed = z.object({ dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_contract_confirm", { p_deal: parsed.data.dealId });
    if (error) return agencyFail(error);
    revalidateDeal("agency", parsed.data.dealId);
    revalidatePath("/agencia/pipeline");
    const t = await getTranslations("agency.terms");
    return { ok: true, message: t("contractConfirmed", { count: data ?? 0 }), count: data ?? 0 };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Aceite demonstrativo da marca (só o dono) ou do creator confirmado. */
export async function acceptTermsAction(portal: "brand" | "office", input: z.input<typeof acceptSchema> & { dealId: string; requestId?: string | null; dealTalentId?: string | null }): Promise<ExecResult> {
  if (portal === "brand") {
    const ctx = await requireBrand();
    if (ctx.role !== "owner") return agencyFail("forbidden");
  } else {
    await requireUser("/creator/escritorio/oportunidades");
  }
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = portal === "brand" ? await supabase.rpc("brand_terms_accept", { p_terms: parsed.data.termsId, p_note: parsed.data.note || undefined }) : await supabase.rpc("talent_terms_accept", { p_terms: parsed.data.termsId, p_note: parsed.data.note || undefined });
    if (error) return fail(portal, error);
    revalidateDeal(portal, input.dealId, input.requestId, input.dealTalentId);
    const t = await getTranslations("commercial.terms");
    return { ok: true, message: t("accepted") };
  } catch (error) {
    return fail(portal, error);
  }
}

// ---------------------------------------------------------------- tarefas
export async function saveTaskAction(input: TaskSaveInput): Promise<ExecResult> {
  const ctx = await requireAgency("staff");
  const parsed = taskSaveSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.agencyId !== ctx.agency.id) return agencyFail("not_found");
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("task_save", {
      p_id: d.id,
      p_data: { agency_id: d.agencyId, deal_id: d.dealId, talent_id: d.talentId, title: d.title, description: d.description, side: d.side, assignee_id: d.assigneeId, due_at: d.dueDate ? (toZonedIso(d.dueDate, "18:00", tz) ?? "") : "" },
    });
    if (error) return agencyFail(error);
    if (d.dealId) revalidateDeal("agency", d.dealId);
    else revalidatePath("/agencia/tarefas");
    const t = await getTranslations("agency.tasks");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setTaskStatusAction(portal: "agency" | "office", input: z.input<typeof taskStatusSchema> & { dealId?: string | null; dealTalentId?: string | null }): Promise<ExecResult> {
  if (portal === "agency") await requireAgency("staff");
  else await requireUser("/creator/escritorio/tarefas");
  const parsed = taskStatusSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const attachment = d.url || d.documentId ? { url: d.url || null, document_id: d.documentId || null } : undefined;
    const { error } = await supabase.rpc("task_set_status", { p_task: d.taskId, p_status: d.status, p_attachment: attachment });
    if (error) return fail(portal, error);
    if (input.dealId && /^[0-9a-f-]{36}$/i.test(input.dealId)) revalidateDeal(portal, input.dealId, null, input.dealTalentId);
    else {
      revalidatePath("/agencia/tarefas");
      revalidatePath("/creator/escritorio/tarefas");
    }
    const t = await getTranslations("commercial.tasks");
    return { ok: true, message: t(`statusSet.${d.status}`) };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function decideTaskAction(portal: "agency" | "brand", input: z.input<typeof taskDecideSchema> & { dealId: string; requestId?: string | null }): Promise<ExecResult> {
  if (portal === "agency") await requireAgency("staff");
  else await requireBrand();
  const parsed = taskDecideSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_task_decide", { p_task: d.taskId, p_decision: d.decision, p_feedback: d.feedback || undefined });
    if (error) return agencyFail(error);
    revalidateDeal(portal, input.dealId, input.requestId);
    const t = await getTranslations("commercial.tasks");
    return { ok: true, message: t(`decided.${d.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- entregas
type DealRef = { dealId: string; requestId?: string | null; dealTalentId?: string | null };

export async function submitDeliverableAction(portal: "agency" | "office", input: z.input<typeof submitSchema> & DealRef): Promise<ExecResult> {
  if (portal === "agency") await requireAgency("staff");
  else await requireUser("/creator/escritorio/oportunidades");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  if (!d.url && !d.documentId) return fail(portal, "file_missing");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("deliverable_submit", { p_deliverable: d.deliverableId, p_url: d.url || undefined, p_document: d.documentId || undefined, p_note: d.note || undefined });
    if (error) return fail(portal, error);
    revalidateDeal(portal, input.dealId, input.requestId, input.dealTalentId);
    const t = await getTranslations("commercial.deliverables");
    return { ok: true, message: t("submitted"), id: data ?? undefined };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function decideDeliverableAction(portal: "agency" | "brand", input: z.input<typeof decideSchema> & DealRef): Promise<ExecResult> {
  if (portal === "agency") await requireAgency("staff");
  else await requireBrand();
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("deliverable_decide", { p_deliverable: d.deliverableId, p_decision: d.decision, p_feedback: d.feedback || undefined });
    if (error) return agencyFail(error);
    revalidateDeal(portal, input.dealId, input.requestId, input.dealTalentId);
    const t = await getTranslations("commercial.deliverables");
    return { ok: true, message: t(`decided.${d.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function publishDeliverableAction(portal: "agency" | "office", input: z.input<typeof publishSchema> & DealRef): Promise<ExecResult> {
  if (portal === "agency") await requireAgency("staff");
  else await requireUser("/creator/escritorio/oportunidades");
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_url");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("deliverable_publish", { p_deliverable: parsed.data.deliverableId, p_url: parsed.data.url });
    if (error) return fail(portal, error);
    revalidateDeal(portal, input.dealId, input.requestId, input.dealTalentId);
    const t = await getTranslations("commercial.deliverables");
    return { ok: true, message: t("published") };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function proofDeliverableAction(portal: "agency" | "office", input: z.input<typeof submitSchema> & DealRef): Promise<ExecResult> {
  if (portal === "agency") await requireAgency("staff");
  else await requireUser("/creator/escritorio/oportunidades");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  if (!d.url && !d.documentId) return fail(portal, "file_missing");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("deliverable_proof", { p_deliverable: d.deliverableId, p_url: d.url || undefined, p_document: d.documentId || undefined });
    if (error) return fail(portal, error);
    revalidateDeal(portal, input.dealId, input.requestId, input.dealTalentId);
    const t = await getTranslations("commercial.deliverables");
    return { ok: true, message: t("proofSent"), id: data ?? undefined };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function closeDeliverableAction(input: z.input<typeof closeSchema> & DealRef): Promise<ExecResult> {
  await requireAgency("staff");
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deliverable_close", { p_deliverable: d.deliverableId, p_status: d.status, p_note: d.note || undefined });
    if (error) return agencyFail(error);
    revalidateDeal("agency", input.dealId, input.requestId, input.dealTalentId);
    const t = await getTranslations("commercial.deliverables");
    return { ok: true, message: t(`closed.${d.status}`) };
  } catch (error) {
    return agencyFail(error);
  }
}
