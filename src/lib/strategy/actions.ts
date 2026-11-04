"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";
import { strategyIdeaSchema, strategyStatusSchema } from "./vocab";

// Estratégias para marcas (0111, D3): o servidor valida a forma; as RPCs conferem papel, setor (Estratégia/Adm) e
// situação, e avisam quem precisa.

export type StrategyResult = { ok: true; message: string; id?: string } | { ok: false; error: string };

function revalidate(id?: string) {
  revalidatePath("/agencia/estrategias", "layout");
  if (id && /^[0-9a-f-]{36}$/i.test(id)) revalidatePath(`/agencia/estrategias/${id}`);
}

export async function saveStrategyIdeaAction(input: z.input<typeof strategyIdeaSchema>): Promise<StrategyResult> {
  const ctx = await requireAgency();
  const parsed = strategyIdeaSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations("strategy.form");
    return { ok: false, error: parsed.error.issues.some((i) => i.message === "target_required") ? t("targetRequired") : t("invalid") };
  }
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("strategy_idea_save", {
      p_agency: ctx.agency.id,
      p_id: d.id || null,
      p_data: {
        month: d.month,
        brand_id: d.brandId,
        brand_label: d.brandId ? "" : d.brandLabel,
        segment_id: d.segmentId,
        talent_id: d.talentId,
        calendar_event_id: d.calendarEventId,
        idea_on: d.ideaOn,
        title: d.title,
        body: d.body,
      },
    });
    if (error) return agencyFail(error);
    revalidate(data ?? undefined);
    const t = await getTranslations("strategy");
    return { ok: true, message: d.id ? t("saved") : t("created"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setStrategyStatusAction(input: z.input<typeof strategyStatusSchema>): Promise<StrategyResult> {
  await requireAgency();
  const parsed = strategyStatusSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("strategy_idea_status", { p_id: parsed.data.id, p_status: parsed.data.status, p_note: parsed.data.note || null });
    if (error) return agencyFail(error);
    revalidate(parsed.data.id);
    const t = await getTranslations("strategy.statusSet");
    return { ok: true, message: t(parsed.data.status) };
  } catch (error) {
    return agencyFail(error);
  }
}

const idSchema = z.object({ id: z.uuid() });

export async function deleteStrategyIdeaAction(input: z.input<typeof idSchema>): Promise<StrategyResult> {
  await requireAgency();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("strategy_idea_delete", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidate();
    const t = await getTranslations("strategy");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return agencyFail(error);
  }
}

const linkSchema = z.object({ id: z.uuid(), sponsorshipId: z.uuid() });

/** Liga a ideia à oportunidade de patrocínio criada a partir dela (publicada = enviada). Gestor+. */
export async function linkStrategyIdeaAction(input: z.input<typeof linkSchema>): Promise<StrategyResult> {
  await requireAgency("manager");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("strategy_idea_link", { p_id: parsed.data.id, p_sponsorship: parsed.data.sponsorshipId });
    if (error) return agencyFail(error);
    revalidate(parsed.data.id);
    const t = await getTranslations("strategy");
    return { ok: true, message: t("linked") };
  } catch (error) {
    return agencyFail(error);
  }
}
