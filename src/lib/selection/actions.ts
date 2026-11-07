"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireBrand } from "@/lib/brand-portal/server";
import { createClient } from "@/lib/supabase/server";
import { COMMENT_MAX, NOTE_MAX, REASON_MAX, REASON_MIN, RETURN_NOTE_MIN } from "./logic";

// Aprovação interna, pré-seleção e nota do influenciador (0081). O servidor valida a forma; o banco confere o papel
// (só o diretor aprova, devolve, decide a lista e envia à agência) e guarda quem fez e quando.

export type SelectionResult = { ok: true; message: string; id?: string } | { ok: false; error: string };

const uuid = z.uuid();
const LIST_BASE = "/marca/herois/pre-selecao";

export async function askApprovalAction(input: { id: string; note: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: uuid, note: z.string().trim().max(NOTE_MAX) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_request_ask_approval", {
      p_id: parsed.data.id,
      p_note: parsed.data.note,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("selection.approval");
    return { ok: true, message: t("asked") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function decideApprovalAction(input: { id: string; decision: "approve" | "return" | "withdraw"; note: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z
    .object({
      id: uuid,
      decision: z.enum(["approve", "return", "withdraw"]),
      note: z.string().trim().max(NOTE_MAX),
    })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  if (parsed.data.decision === "return" && parsed.data.note.length < RETURN_NOTE_MIN) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_request_approval_decide", {
      p_id: parsed.data.id,
      p_decision: parsed.data.decision,
      p_note: parsed.data.note,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("selection.approval");
    return { ok: true, message: t(`decided.${parsed.data.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function saveShortlistAction(input: { id: string | null; title: string; note: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z
    .object({
      id: uuid.nullable(),
      title: z.string().trim().min(3).max(120),
      note: z.string().trim().max(1000),
    })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_shortlist_save", {
      p_id: parsed.data.id,
      p_brand: ctx.brand.id,
      p_title: parsed.data.title,
      p_note: parsed.data.note,
    });
    if (error) return agencyFail(error);
    revalidatePath(LIST_BASE, "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setShortlistItemAction(input: { shortlistId: string; talentId: string; reason: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z
    .object({
      shortlistId: uuid,
      talentId: uuid,
      reason: z.string().trim().min(REASON_MIN).max(REASON_MAX),
    })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_shortlist_item_set", {
      p_shortlist: parsed.data.shortlistId,
      p_talent: parsed.data.talentId,
      p_reason: parsed.data.reason,
    });
    if (error) return agencyFail(error);
    revalidatePath(LIST_BASE, "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t("itemSaved"), id: parsed.data.shortlistId };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function removeShortlistItemAction(input: { itemId: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ itemId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_shortlist_item_remove", {
      p_item: parsed.data.itemId,
    });
    if (error) return agencyFail(error);
    revalidatePath(LIST_BASE, "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t("itemRemoved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function sendShortlistAction(input: { id: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_shortlist_send", {
      p_id: parsed.data.id,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t("sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function decideShortlistItemAction(input: { itemId: string; decision: "approved" | "rejected"; note: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (ctx.role !== "owner") return agencyFail("forbidden");
  const parsed = z
    .object({
      itemId: uuid,
      decision: z.enum(["approved", "rejected"]),
      note: z.string().trim().max(NOTE_MAX),
    })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_shortlist_decide", {
      p_item: parsed.data.itemId,
      p_decision: parsed.data.decision,
      p_note: parsed.data.note,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t(`decided.${parsed.data.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function deleteShortlistAction(input: { id: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_shortlist_delete", {
      p_id: parsed.data.id,
    });
    if (error) return agencyFail(error);
    revalidatePath(LIST_BASE, "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function shortlistToCampaignAction(input: { id: string; title: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: uuid, title: z.string().trim().max(120) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_shortlist_to_campaign", {
      p_id: parsed.data.id,
      p_title: parsed.data.title,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("selection.shortlists");
    return { ok: true, message: t("campaignCreated"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function rateDeliverableAction(input: { deliverableId: string; requestId: string; onTime: boolean; quality: number; comment: string }): Promise<SelectionResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z
    .object({
      deliverableId: uuid,
      requestId: uuid,
      onTime: z.boolean(),
      quality: z.number().int().min(0).max(10),
      comment: z.string().trim().max(COMMENT_MAX),
    })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_deliverable_rate", {
      p_deliverable: parsed.data.deliverableId,
      p_on_time: parsed.data.onTime,
      p_quality: parsed.data.quality,
      p_comment: parsed.data.comment,
    });
    if (error) return agencyFail(error);
    revalidatePath(`/marca/campanhas/${parsed.data.requestId}`);
    revalidatePath("/marca", "layout");
    const t = await getTranslations("selection.rating");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}
