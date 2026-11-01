"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { ORDER_STATUSES, validServiceShape } from "@/lib/professionals/rules";
import { profileSchema, serviceSchema, splitCities, type ProfileValues, type ServiceValues } from "@/lib/professionals/schemas";
import { createClient } from "@/lib/supabase/server";

// Ações do portal do profissional (0058). As regras (dono, situação, transições, recado
// obrigatório, limite de serviços) ficam nas RPCs; aqui só a forma e a tradução do erro.

export type PortalResult = { ok: true; message: string } | { ok: false; error: string };

const CODES = [
  "forbidden",
  "not_found",
  "invalid_transition",
  "note_required",
  "note_too_long",
  "order_closed",
  "professional_suspended",
  "not_professional",
  "too_many_services",
  "invalid_service",
] as const;

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("professionals.errors");
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  const code = CODES.find((c) => message.includes(c)) ?? (message.includes("_check") || message.includes("violates") ? "invalid_input" : "generic");
  return { ok: false, error: t(code) };
}

async function signedIn() {
  const user = await getUser();
  if (!user) throw new Error("forbidden");
  return user;
}

// ---------------------------------------------------------------- pedidos
export async function updateOrderAction(input: { orderId: string; to: string | null; note: string }): Promise<PortalResult> {
  const parsed = z
    .object({ orderId: z.uuid(), to: z.enum(ORDER_STATUSES).nullable(), note: z.string().trim().max(1000) })
    .safeParse(input);
  if (!parsed.success) return fail("note_too_long");
  try {
    await signedIn();
    const supabase = await createClient();
    const { error } = await supabase.rpc("service_order_update", {
      p_order: parsed.data.orderId,
      p_to: parsed.data.to ?? undefined,
      p_note: parsed.data.note || undefined,
    });
    if (error) return fail(error);
    revalidatePath("/profissional", "layout");
    revalidatePath(`/admin/professionals`, "layout");
    const t = await getTranslations("professionals.portal.actions");
    return { ok: true, message: parsed.data.to ? t("done") : t("noteSent") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- serviços
export async function saveServiceAction(id: string | null, input: ServiceValues): Promise<PortalResult & { id?: string }> {
  const parsedId = z.uuid().nullable().safeParse(id);
  const parsed = serviceSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return fail("invalid_service");
  const v = parsed.data;
  if (!validServiceShape({ kind: v.kind, mode: v.mode, durationMinutes: v.duration_minutes, planWeeks: v.kind === "plan" ? v.plan_weeks : null })) return fail("invalid_service");
  try {
    await signedIn();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("professional_save_service", { p_id: parsedId.data, p_data: v });
    if (error || !data) return fail(error ?? "generic");
    revalidatePath("/profissional", "layout");
    const t = await getTranslations("professionals.portal.services");
    return { ok: true, id: data, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- perfil
export async function saveProfileAction(input: ProfileValues): Promise<PortalResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const cities = splitCities(parsed.data.cities);
  try {
    await signedIn();
    const supabase = await createClient();
    const { error } = await supabase.rpc("professional_save_profile", { p_data: { ...parsed.data, cities } });
    if (error) return fail(error);
    revalidatePath("/profissional", "layout");
    revalidatePath("/profissionais", "layout");
    const t = await getTranslations("professionals.portal.profile");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}
