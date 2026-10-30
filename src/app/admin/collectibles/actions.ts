"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { getUser, hasRole } from "@/lib/auth/session";
import { CONTACT_STATUSES, normalizeIncrements, type ContactStatus } from "@/lib/collectibles/rules";
import { createClient } from "@/lib/supabase/server";

// Colecionáveis no admin: criar/editar, lançar (agora ou agendado), cancelar e marcar o contato com
// o vencedor (sem pagamento online: a equipe combina a entrega). As regras e a
// auditoria (admin_audit) ficam nas RPCs da 0057; aqui só validamos a forma e traduzimos o erro.

const ERROR_CODES = [
  "forbidden",
  "not_found",
  "collectible_locked",
  "invalid_increment",
  "invalid_photo",
  "invalid_creator",
  "invalid_start",
  "reason_required",
  "no_winner",
  "invalid_contact_status",
] as const;

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("collectibles.admin.errors");
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  const code = ERROR_CODES.find((c) => message.includes(c)) ?? (message.includes("_check") ? "invalid_input" : "generic");
  return { ok: false, error: t(code) };
}

async function requireAdmin() {
  const user = await getUser();
  if (!user) throw new Error("forbidden");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

function revalidateAll(id?: string) {
  revalidatePath("/admin/collectibles");
  if (id) revalidatePath(`/admin/collectibles/${id}`);
  revalidatePath("/shop/colecionaveis");
  if (id) revalidatePath(`/shop/colecionaveis/${id}`);
}

export type CollectibleFormValues = {
  title: string;
  description: string;
  creator_id: string | null;
  photos: string[];
  authenticity_note: string;
  start_price_cents: number;
  bid_increments_cents: number[];
  duration_minutes: number;
};

const photo = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || v.startsWith("https://"), "invalid_photo");

const values = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000),
  creator_id: z.uuid().nullable(),
  photos: z.array(photo).max(8),
  authenticity_note: z.string().trim().max(2000),
  start_price_cents: z.number().int().min(100).max(100_000_000),
  bid_increments_cents: z.array(z.number().int()).min(1).max(4),
  duration_minutes: z.number().int().min(5).max(43200),
});

export async function saveCollectibleAction(id: string | null, input: CollectibleFormValues): Promise<ActionResult & { id?: string }> {
  const parsedId = z.uuid().nullable().safeParse(id);
  const parsed = values.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    const photoIssue = parsed.success ? false : parsed.error.issues.some((i) => i.message === "invalid_photo");
    return fail(photoIssue ? "invalid_photo" : "invalid_input");
  }
  const increments = normalizeIncrements(parsed.data.bid_increments_cents);
  if (!increments) return fail("invalid_increment");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_collectible_save", {
      p_id: parsedId.data ?? undefined,
      p_data: { ...parsed.data, bid_increments_cents: increments },
    });
    if (error || !data) return fail(error ?? "generic");
    revalidateAll(data);
    const t = await getTranslations("collectibles.admin.form");
    return { ok: true, id: data, message: parsedId.data ? t("updated") : t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function launchCollectibleAction(id: string, startsAt: string | null): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), startsAt: z.iso.datetime({ offset: true }).nullable() }).safeParse({ id, startsAt });
  if (!parsed.success) return fail("invalid_start");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_collectible_launch", { p_id: parsed.data.id, p_starts_at: parsed.data.startsAt ?? undefined });
    if (error) return fail(error);
    revalidateAll(parsed.data.id);
    const t = await getTranslations("collectibles.admin.launch");
    return { ok: true, message: parsed.data.startsAt ? t("scheduledDone") : t("liveDone") };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelCollectibleAction(id: string, reason: string): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), reason: z.string().trim().min(5).max(500) }).safeParse({ id, reason });
  if (!parsed.success) return fail("reason_required");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_collectible_cancel", { p_id: parsed.data.id, p_reason: parsed.data.reason });
    if (error) return fail(error);
    revalidateAll(parsed.data.id);
    const t = await getTranslations("collectibles.admin.cancel");
    return { ok: true, message: t("done") };
  } catch (error) {
    return fail(error);
  }
}

/** Andamento do contato com quem arrematou: a contatar → contatado → entregue (auditado no banco). */
export async function setCollectibleContactAction(id: string, status: ContactStatus): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), status: z.enum(CONTACT_STATUSES) }).safeParse({ id, status });
  if (!parsed.success) return fail("invalid_contact_status");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_collectible_set_contact", { p_id: parsed.data.id, p_status: parsed.data.status });
    if (error) return fail(error);
    revalidatePath(`/admin/collectibles/${parsed.data.id}`);
    const t = await getTranslations("collectibles.admin.result");
    return { ok: true, message: t("done") };
  } catch (error) {
    return fail(error);
  }
}
