"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "./errors";
import { kitSchema, shareKitSchema, socialSchema, type SocialInput } from "./schemas";

// Redes declaradas e media kit: as mesmas RPCs servem ao talento (escritório) e à agência (GES+).
// A RPC decide o lado (declared_side) e confere o escopo; source nunca sai daqui (sempre "declared").

export type TalentActionResult = { ok: true; message: string; id?: string; token?: string } | { ok: false; error: string };
type Portal = "agency" | "office";

const fail = (portal: Portal, error: unknown) => (portal === "agency" ? agencyFail(error) : talentFail(error));

function revalidate(portal: Portal, talentId: string) {
  if (portal === "agency") revalidatePath(`/agencia/casting/${talentId}`, "layout");
  else revalidatePath("/creator/escritorio", "layout");
}

export async function saveSocialAction(portal: Portal, input: SocialInput): Promise<TalentActionResult> {
  await requireUser();
  const parsed = socialSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("talent_social_save", {
      p_talent: d.talentId,
      p_id: d.id,
      p_data: {
        network: d.network,
        handle: d.handle,
        url: d.url,
        followers: d.followers,
        avg_views: d.avgViews,
        avg_reach: d.avgReach,
        engagement_bp: d.engagementBp,
        as_of: d.asOf,
        audience: d.audience,
      },
    });
    if (error) return fail(portal, error);
    revalidate(portal, d.talentId);
    const t = await getTranslations("mediaKit.social");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function deleteSocialAction(portal: Portal, input: { talentId: string; id: string }): Promise<TalentActionResult> {
  await requireUser();
  const parsed = z.object({ talentId: z.uuid(), id: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_social_delete", { p_id: parsed.data.id });
    if (error) return fail(portal, error);
    revalidate(portal, parsed.data.talentId);
    const t = await getTranslations("mediaKit.social");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function saveKitAction(portal: Portal, input: z.input<typeof kitSchema>): Promise<TalentActionResult> {
  await requireUser();
  const parsed = kitSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("media_kit_save", {
      p_talent: parsed.data.talentId,
      p_data: { headline: parsed.data.headline, about: parsed.data.about, visible_fields: parsed.data.visibleFields },
    });
    if (error) return fail(portal, error);
    revalidate(portal, parsed.data.talentId);
    const t = await getTranslations("mediaKit.editor");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(portal, error);
  }
}

/** Gera o link público: o token volta UMA vez (o banco guarda só o SHA-256). */
export async function shareKitAction(portal: Portal, input: { talentId: string; days: number }): Promise<TalentActionResult> {
  await requireUser();
  const parsed = shareKitSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("media_kit_share", { p_talent: parsed.data.talentId, p_days: parsed.data.days });
    if (error) return fail(portal, error);
    if (!data) return fail(portal, "generic");
    revalidate(portal, parsed.data.talentId);
    const t = await getTranslations("mediaKit.share");
    return { ok: true, message: t("created"), token: data };
  } catch (error) {
    return fail(portal, error);
  }
}

export async function revokeKitAction(portal: Portal, input: { talentId: string }): Promise<TalentActionResult> {
  await requireUser();
  const parsed = z.object({ talentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("media_kit_revoke", { p_talent: parsed.data.talentId });
    if (error) return fail(portal, error);
    revalidate(portal, parsed.data.talentId);
    const t = await getTranslations("mediaKit.share");
    return { ok: true, message: t("revoked") };
  } catch (error) {
    return fail(portal, error);
  }
}
