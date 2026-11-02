"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyErrorCode, agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireUser } from "@/lib/auth/session";
import { requireBrand } from "@/lib/brand-portal/server";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "@/lib/talent/errors";
import { METRIC_KEYS } from "./metrics";

// Bloco 6 (0083): métricas, comentários no segundo, link rastreável/cupom, vendas e músicas. O servidor valida a
// forma (zod) e chama as RPCs; o banco decide quem pode (marca, agência ou influenciador) e as regras.

export type MediaResult = { ok: true; message: string; id?: string } | { ok: false; error: string };
type Portal = "agency" | "brand" | "office";
type Ref = { dealId: string; requestId?: string | null; dealTalentId?: string | null };

const uuid = z.uuid();
const ID = /^[0-9a-f-]{36}$/i;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function fail(portal: Portal, error: unknown, dateKey?: "metricsDate" | "salesDate"): Promise<{ ok: false; error: string }> {
  if (dateKey && agencyErrorCode(error) === "invalid_date") {
    const t = await getTranslations("media.errors");
    return { ok: false, error: t(dateKey) };
  }
  return portal === "office" ? talentFail(error) : agencyFail(error);
}

/** Revalida as telas que mostram o negócio (o cliente só passa ids; os caminhos são montados aqui). */
function refresh(ref: Ref) {
  if (ID.test(ref.dealId)) revalidatePath(`/agencia/negocios/${ref.dealId}`, "layout");
  if (ref.requestId && ID.test(ref.requestId)) {
    revalidatePath(`/marca/campanhas/${ref.requestId}`);
    revalidatePath(`/marca/campanhas/${ref.requestId}/relatorio`);
  }
  if (ref.dealTalentId && ID.test(ref.dealTalentId)) revalidatePath(`/creator/escritorio/oportunidades/${ref.dealTalentId}`);
  revalidatePath("/marca/biblioteca");
}

async function gate(portal: Portal) {
  if (portal === "agency") await requireAgency("staff");
  else if (portal === "brand") await requireBrand();
  else await requireUser("/creator/escritorio/oportunidades");
}

const refSchema = z.object({ dealId: uuid, requestId: uuid.nullish(), dealTalentId: uuid.nullish() });

// ---------------------------------------------------------------- métricas
const metricsSchema = refSchema.extend({
  deliverableId: uuid,
  measuredOn: day,
  values: z.partialRecord(z.enum(METRIC_KEYS), z.number().int().min(0).max(1_000_000_000_000).nullable()),
});

export async function recordMetricsAction(portal: "agency" | "office", input: z.input<typeof metricsSchema>): Promise<MediaResult> {
  await gate(portal);
  const parsed = metricsSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  if (!Object.values(d.values).some((v) => v !== null && v !== undefined)) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("deliverable_metrics_record", { p_deliverable: d.deliverableId, p_measured_on: d.measuredOn, p_data: d.values });
    if (error) return fail(portal, error, "metricsDate");
    refresh(d);
    const t = await getTranslations("media.metrics");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return fail(portal, error, "metricsDate");
  }
}

// ---------------------------------------------------------------- comentários
const commentSchema = refSchema.extend({ versionId: uuid, body: z.string().trim().min(1).max(1000), atSeconds: z.number().int().min(0).max(86400).nullable() });

export async function addCommentAction(portal: "agency" | "brand", input: z.input<typeof commentSchema>): Promise<MediaResult> {
  await gate(portal);
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("deliverable_comment_add", { p_version: d.versionId, p_body: d.body, p_at_seconds: d.atSeconds });
    if (error) return fail(portal, error);
    refresh(d);
    const t = await getTranslations("media.comments");
    return { ok: true, message: t("added"), id: data ?? undefined };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function deleteCommentAction(portal: "agency" | "brand", input: z.input<typeof refSchema> & { id: string }): Promise<MediaResult> {
  await gate(portal);
  const parsed = refSchema.extend({ id: uuid }).safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("deliverable_comment_delete", { p_id: parsed.data.id });
    if (error) return fail(portal, error);
    refresh(parsed.data);
    const t = await getTranslations("media.comments");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(portal, error);
  }
}

// ---------------------------------------------------------------- link rastreável e cupom (agência)
const linkSchema = refSchema.extend({
  linkDealTalentId: uuid,
  destination: z.string().trim().max(500).refine((v) => v === "" || v.startsWith("https://")),
  coupon: z.string().trim().max(40).regex(/^[A-Za-z0-9_-]*$/),
});

export async function saveTrackingLinkAction(input: z.input<typeof linkSchema>): Promise<MediaResult> {
  await requireAgency("staff");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_tracking_link_save", { p_deal_talent: d.linkDealTalentId, p_destination: d.destination || null, p_coupon: d.coupon });
    if (error) return agencyFail(error);
    refresh(d);
    const t = await getTranslations("media.links");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- vendas (marca)
const saleSchema = refSchema.extend({
  linkId: uuid,
  quantity: z.number().int().min(0).max(10_000_000),
  revenueCents: z.number().int().min(0).max(1_000_000_000_000),
  reportedOn: day,
  note: z.string().trim().max(280),
});

export async function recordSaleAction(input: z.input<typeof saleSchema>): Promise<MediaResult> {
  await requireBrand();
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success || (parsed.data.quantity === 0 && parsed.data.revenueCents === 0)) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_sales_record", { p_link: d.linkId, p_quantity: d.quantity, p_revenue_cents: d.revenueCents, p_reported_on: d.reportedOn, p_note: d.note || null });
    if (error) return fail("brand", error, "salesDate");
    refresh(d);
    const t = await getTranslations("media.sales");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return fail("brand", error, "salesDate");
  }
}

export async function deleteSaleAction(input: z.input<typeof refSchema> & { id: string }): Promise<MediaResult> {
  await requireBrand();
  const parsed = refSchema.extend({ id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_sales_delete", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    refresh(parsed.data);
    const t = await getTranslations("media.sales");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- músicas liberadas (agência)
const NETWORKS = ["instagram", "tiktok", "youtube", "x", "facebook", "kwai", "twitch", "linkedin", "pinterest", "threads", "other"] as const;
const musicSchema = refSchema.extend({
  id: uuid.nullable(),
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().max(120),
  source: z.string().trim().max(200),
  url: z.string().trim().max(500).refine((v) => v === "" || v.startsWith("https://")),
  networks: z.array(z.enum(NETWORKS)).max(NETWORKS.length),
  validUntil: z.union([day, z.literal("")]),
});

export async function saveMusicAction(input: z.input<typeof musicSchema>): Promise<MediaResult> {
  await requireAgency("staff");
  const parsed = musicSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_music_save", {
      p_id: d.id,
      p_deal: d.dealId,
      p_data: { title: d.title, artist: d.artist, source: d.source, url: d.url, networks: d.networks, valid_until: d.validUntil },
    });
    if (error) return agencyFail(error);
    refresh(d);
    const t = await getTranslations("media.music");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function deleteMusicAction(input: z.input<typeof refSchema> & { id: string }): Promise<MediaResult> {
  await requireAgency("staff");
  const parsed = refSchema.extend({ id: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_music_delete", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    refresh(parsed.data);
    const t = await getTranslations("media.music");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return agencyFail(error);
  }
}
