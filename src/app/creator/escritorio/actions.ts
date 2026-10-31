"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { respondSchema } from "@/lib/deals/schemas";
import { talentFail } from "@/lib/talent/errors";
import { CONSENT_VERSION } from "@/lib/talent/vocab";

// Escritório do creator (6.4): o consentimento é só do próprio talento (com login). As redes e o kit
// usam as ações comuns de src/lib/talent/actions.ts com portal "office". Oportunidades (0066): o
// creator aceita, recusa com motivo ou pede conversa; nada disso é vínculo contratual.

export type OfficeResult = { ok: true; message: string } | { ok: false; error: string };

export async function respondOpportunityAction(input: { dealTalentId: string; response: "interested" | "declined" | "talk_requested"; note: string }): Promise<OfficeResult> {
  await requireUser("/creator/escritorio/oportunidades");
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return talentFail("invalid_input");
  const d = parsed.data;
  if (d.response === "declined" && d.note.length < 3) return talentFail("note_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_opportunity_respond", { p_deal_talent: d.dealTalentId, p_response: d.response, p_note: d.note || undefined });
    if (error) return talentFail(error);
    revalidatePath("/creator/escritorio", "layout");
    const t = await getTranslations("talent.opportunities");
    return { ok: true, message: t(`responded.${d.response}`) };
  } catch (error) {
    return talentFail(error);
  }
}

export async function setConsentAction(input: { on: boolean }): Promise<OfficeResult> {
  await requireUser("/creator/escritorio/consentimento");
  const parsed = z.object({ on: z.boolean() }).safeParse(input);
  if (!parsed.success) return talentFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_set_consent", { p_on: parsed.data.on, p_version: parsed.data.on ? CONSENT_VERSION : null });
    if (error) return talentFail(error);
    revalidatePath("/creator/escritorio", "layout");
    const t = await getTranslations("talent.consent");
    return { ok: true, message: parsed.data.on ? t("given") : t("revoked") };
  } catch (error) {
    return talentFail(error);
  }
}
