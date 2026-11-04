"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";
import { dealClientSchema, roadmapAssignSchema, roadmapStartSchema, roadmapTaskSchema, sectorsSchema, serviceSaveSchema, toServicePayload } from "./schemas";

// Roteiros de entrega (0107): catálogo (Adm), setores da equipe (Adm), roteiro do negócio e etapas. O servidor só
// valida a forma; as RPCs conferem papel, setor e escopo.

export type RoadmapResult = { ok: true; message: string; id?: string; count?: number } | { ok: false; error: string };

function revalidateRoadmap(dealId?: string | null) {
  if (dealId && /^[0-9a-f-]{36}$/i.test(dealId)) revalidatePath(`/agencia/negocios/${dealId}`, "layout");
  revalidatePath("/agencia");
  revalidatePath("/agencia/tarefas");
}

// ---------------------------------------------------------------- catálogo
export async function saveServiceAction(input: z.input<typeof serviceSaveSchema>): Promise<RoadmapResult> {
  const ctx = await requireAgency("admin");
  const parsed = serviceSaveSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_service_save", {
      p_agency: ctx.agency.id,
      p_id: parsed.data.id === "" ? null : parsed.data.id,
      p_data: toServicePayload(parsed.data) as never,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/configuracoes/servicos", "layout");
    const t = await getTranslations("roadmap.catalog");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function restoreServicesAction(): Promise<RoadmapResult> {
  const ctx = await requireAgency("admin");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_services_restore", { p_agency: ctx.agency.id });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/configuracoes/servicos", "layout");
    const t = await getTranslations("roadmap.catalog");
    return { ok: true, message: t("restored", { count: data ?? 0 }), count: data ?? 0 };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- setores da equipe
export async function setMemberSectorsAction(input: z.input<typeof sectorsSchema>): Promise<RoadmapResult> {
  const ctx = await requireAgency("admin");
  const parsed = sectorsSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_member_sectors_set", { p_agency: ctx.agency.id, p_user: parsed.data.userId, p_sectors: parsed.data.sectors });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/equipe");
    revalidatePath("/agencia");
    const t = await getTranslations("roadmap.team");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- roteiro do negócio
export async function startRoadmapAction(input: z.input<typeof roadmapStartSchema>): Promise<RoadmapResult> {
  await requireAgency("staff");
  const parsed = roadmapStartSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("deal_roadmap_start", { p_deal: d.dealId, p_service: d.serviceId, p_start: d.startOn === "" ? null : d.startOn, p_replace: d.replace });
    if (error) return agencyFail(error);
    revalidateRoadmap(d.dealId);
    const t = await getTranslations("roadmap.deal");
    return { ok: true, message: t("started", { count: data ?? 0 }), count: data ?? 0 };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setRoadmapTaskAction(input: z.input<typeof roadmapTaskSchema> & { dealId?: string }): Promise<RoadmapResult> {
  await requireAgency("staff");
  const parsed = roadmapTaskSchema.safeParse({ taskId: input.taskId, done: input.done });
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("roadmap_task_set", { p_task: parsed.data.taskId, p_done: parsed.data.done });
    if (error) return agencyFail(error);
    revalidateRoadmap(input.dealId ?? null);
    const t = await getTranslations("roadmap.deal");
    return { ok: true, message: parsed.data.done ? t("stepDone") : t("stepReopened") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function assignRoadmapTaskAction(input: z.input<typeof roadmapAssignSchema> & { dealId?: string }): Promise<RoadmapResult> {
  await requireAgency("staff");
  const parsed = roadmapAssignSchema.safeParse({ taskId: input.taskId, assigneeId: input.assigneeId, sector: input.sector });
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("roadmap_task_assign", { p_task: d.taskId, p_assignee: d.assigneeId === "" ? null : d.assigneeId, p_sector: d.sector });
    if (error) return agencyFail(error);
    revalidateRoadmap(input.dealId ?? null);
    const t = await getTranslations("roadmap.deal");
    return { ok: true, message: t("assigned") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setDealClientAction(input: z.input<typeof dealClientSchema>): Promise<RoadmapResult> {
  await requireAgency("staff");
  const parsed = dealClientSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("deal_client_set", { p_deal: parsed.data.dealId, p_talent: parsed.data.talentId === "" ? null : parsed.data.talentId });
    if (error) return agencyFail(error);
    revalidateRoadmap(parsed.data.dealId);
    revalidatePath("/agencia/pipeline");
    const t = await getTranslations("roadmap.deal");
    return { ok: true, message: t("clientSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}
