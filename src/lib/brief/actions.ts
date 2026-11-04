"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireBrand } from "@/lib/brand-portal/server";
import { createClient } from "@/lib/supabase/server";
import { briefPayload, briefSchema, type Brief } from "./brief";
import { clampTitle, templateNameValid } from "./templates";

// Briefing estruturado (agência ajusta depois do envio), modelos de briefing da marca e duplicar campanha (0080).
// O servidor valida a forma; o banco confere quem pode (marca dona da campanha; agência: gestor+ ou responsável).

export type BriefResult = { ok: true; message: string; id?: string } | { ok: false; error: string };

const uuid = z.uuid();

export async function saveDealBriefAction(input: { dealId: string; brief: Brief }): Promise<BriefResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, brief: briefSchema }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_brief_save", { p_deal: parsed.data.dealId, p_brief: briefPayload(parsed.data.brief) });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${parsed.data.dealId}`, "layout");
    revalidatePath("/heroi", "layout");
    revalidatePath("/marca/campanhas", "layout");
    const t = await getTranslations("brief");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function saveTemplateAction(input: { requestId: string; name: string }): Promise<BriefResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ requestId: uuid, name: z.string().trim().max(80) }).safeParse(input);
  if (!parsed.success || !templateNameValid(parsed.data.name)) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_template_save", { p_request: parsed.data.requestId, p_name: parsed.data.name.trim() });
    if (error) return agencyFail(error);
    revalidatePath("/marca/campanhas/nova");
    const t = await getTranslations("brief.templates");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function deleteTemplateAction(input: { id: string }): Promise<BriefResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_template_delete", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidatePath("/marca/campanhas/nova");
    const t = await getTranslations("brief.templates");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Rascunho novo a partir de um modelo (título = nome do modelo; a marca muda no formulário). */
export async function applyTemplateAction(input: { id: string }): Promise<BriefResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_request_from_template", { p_template: parsed.data.id });
    if (error) return agencyFail(error);
    if (!data) return agencyFail("generic");
    revalidatePath("/marca/campanhas");
    const t = await getTranslations("brief.templates");
    return { ok: true, message: t("used"), id: data };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Duplicar campanha: rascunho novo "Cópia de …" (sem datas, valor e situação). */
export async function duplicateCampaignAction(input: { requestId: string; title: string }): Promise<BriefResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = z.object({ requestId: uuid, title: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const t = await getTranslations("brief.duplicate");
    const supabase = await createClient();
    const title = parsed.data.title.trim() ? clampTitle(t("titlePattern", { title: parsed.data.title.trim() })) : "";
    const { data, error } = await supabase.rpc("brand_request_duplicate", { p_request: parsed.data.requestId, p_title: title || undefined });
    if (error) return agencyFail(error);
    if (!data) return agencyFail("generic");
    revalidatePath("/marca/campanhas");
    return { ok: true, message: t("done"), id: data };
  } catch (error) {
    return agencyFail(error);
  }
}
