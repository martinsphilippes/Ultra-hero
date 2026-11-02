"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "@/lib/talent/errors";
import { counterDecideSchema, counterofferPayload, counterofferSchema, type CounterofferInput } from "./counteroffer";

// Contraproposta (0079): o creator propõe outro valor ou outra data; a agência aceita ou recusa com nota.
// O servidor só valida a forma; o banco confere quem pode (valor: Adm; data: gestor+), a etapa e "uma aberta por vez".

export type OfferResult = { ok: true; message: string } | { ok: false; error: string };

const uuid = z.uuid();

function revalidateOffer(dealTalentId: string, dealId?: string | null) {
  revalidatePath(`/creator/escritorio/oportunidades/${dealTalentId}`);
  revalidatePath("/creator/escritorio");
  if (dealId && /^[0-9a-f-]{36}$/i.test(dealId)) revalidatePath(`/agencia/negocios/${dealId}`, "layout");
}

export async function createCounterofferAction(input: CounterofferInput): Promise<OfferResult> {
  await requireUser("/creator/escritorio/oportunidades");
  const parsed = counterofferSchema.safeParse(input);
  if (!parsed.success) return talentFail(input?.kind === "fee" && typeof input.reason === "string" && input.reason.trim().length < 3 ? "note_required" : "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_counteroffer_create", { p_deal_talent: parsed.data.dealTalentId, p_kind: parsed.data.kind, p_data: counterofferPayload(parsed.data) });
    if (error) return talentFail(error);
    revalidateOffer(parsed.data.dealTalentId);
    const t = await getTranslations("offer.counter");
    return { ok: true, message: t(`sent.${parsed.data.kind}`) };
  } catch (error) {
    return talentFail(error);
  }
}

export async function withdrawCounterofferAction(input: { counterofferId: string; dealTalentId: string }): Promise<OfferResult> {
  await requireUser("/creator/escritorio/oportunidades");
  const parsed = z.object({ counterofferId: uuid, dealTalentId: uuid }).safeParse(input);
  if (!parsed.success) return talentFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_counteroffer_withdraw", { p_id: parsed.data.counterofferId });
    if (error) return talentFail(error);
    revalidateOffer(parsed.data.dealTalentId);
    const t = await getTranslations("offer.counter");
    return { ok: true, message: t("withdrawn") };
  } catch (error) {
    return talentFail(error);
  }
}

export async function decideCounterofferAction(input: z.input<typeof counterDecideSchema> & { dealTalentId: string }): Promise<OfferResult> {
  await requireAgency("manager");
  const parsed = counterDecideSchema.safeParse(input);
  if (!parsed.success) return agencyFail(input?.decision === "rejected" ? "note_required" : "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_counteroffer_decide", { p_id: d.counterofferId, p_decision: d.decision, p_note: d.note || undefined });
    if (error) return agencyFail(error);
    if (uuid.safeParse(input.dealTalentId).success) revalidateOffer(input.dealTalentId, d.dealId);
    else revalidatePath(`/agencia/negocios/${d.dealId}`, "layout");
    const t = await getTranslations("offer.review");
    return { ok: true, message: t(`decided.${d.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}
