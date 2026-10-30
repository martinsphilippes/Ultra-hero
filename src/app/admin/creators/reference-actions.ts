"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { COMPARE_METRIC_DEFS, COMPARE_METRICS, parseReferenceInput, type CompareMetricKey } from "@/lib/heroes/compare";
import { isMissingFollowSchema } from "@/lib/heroes/follows";
import { createClient } from "@/lib/supabase/server";

// Referências para comparação do herói (0056): escrita direta sob a RLS de admin; cada mudança é
// auditada pelo gatilho do banco (admin_audit, resource_type 'creator_reference'). Em branco = apaga
// (o indicador deixa de ser comparado). Só grava o que mudou.

const inputSchema = z.object({
  creatorId: z.uuid(),
  values: z.record(z.enum(COMPARE_METRICS), z.string().max(20)),
});

export async function saveCreatorReferencesAction(creatorId: string, values: Partial<Record<CompareMetricKey, string>>): Promise<ActionResult> {
  const parsed = inputSchema.safeParse({ creatorId, values });
  if (!parsed.success) return failWith("invalid_input");
  const t = await getTranslations("follows.admin");
  const tm = await getTranslations("follows.compare.metrics");
  try {
    const user = await getUser();
    if (!user) return failWith("unauthenticated");
    if (!(await hasRole("admin"))) return failWith("forbidden");

    const next = new Map<CompareMetricKey, number | null>();
    for (const key of COMPARE_METRICS) {
      const result = parseReferenceInput(key, parsed.data.values[key] ?? "");
      if (!result.ok) return { ok: false, error: t("invalid", { metric: tm(`${key}.label`), max: COMPARE_METRIC_DEFS[key].max }) };
      next.set(key, result.value);
    }

    const supabase = await createClient();
    const { data: current, error: readError } = await supabase.from("creator_reference_metrics").select("metric_key, value").eq("creator_id", parsed.data.creatorId);
    if (readError) return { ok: false, error: isMissingFollowSchema(readError) ? t("unavailable") : t("error") };
    const before = new Map((current ?? []).map((r) => [r.metric_key, Number(r.value)]));

    const upserts = COMPARE_METRICS.flatMap((key) => {
      const value = next.get(key);
      return value !== null && value !== undefined && before.get(key) !== value
        ? [{ creator_id: parsed.data.creatorId, metric_key: key, value, unit: COMPARE_METRIC_DEFS[key].unit, updated_by: user.id }]
        : [];
    });
    const removals = COMPARE_METRICS.filter((key) => next.get(key) === null && before.has(key));

    if (upserts.length > 0) {
      const { error } = await supabase.from("creator_reference_metrics").upsert(upserts, { onConflict: "creator_id,metric_key" });
      if (error) return { ok: false, error: t("error") };
    }
    if (removals.length > 0) {
      const { error } = await supabase.from("creator_reference_metrics").delete().eq("creator_id", parsed.data.creatorId).in("metric_key", removals);
      if (error) return { ok: false, error: t("error") };
    }
    revalidatePath(`/admin/creators/${parsed.data.creatorId}`);
    revalidatePath("/profile/today");
    revalidatePath("/profile/evolution");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return failWith(error);
  }
}
