"use server";

import { heroChannelBlocked } from "@/lib/access/server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { getOrigin } from "@/lib/auth/origin";
import { requireUser } from "@/lib/auth/session";
import { sendInviteEmail } from "@/lib/email/invite";
import { createClient } from "@/lib/supabase/server";

// Equipe do Hero (0091): o titular (ou o admin) convida, remove e transfere; o creator sem Hero cria o dele
// (pendente de aprovação). As RPCs conferem quem pode e auditam.

export type HeroTeamResult = { ok: true; message: string; link?: string; emailed?: boolean } | { ok: false; error: string };

function refresh(creatorId: string) {
  revalidatePath("/heroi/equipe");
  revalidatePath(`/admin/herois/${creatorId}`);
}

export async function inviteHeroTeamAction(input: { creatorId: string; email: string; days: number }): Promise<HeroTeamResult> {
  await requireUser("/heroi/equipe");
  const parsed = z.object({ creatorId: z.uuid(), email: z.email().max(254), days: z.number().int().min(1).max(30) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_email");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("hero_team_invite", { p_creator: parsed.data.creatorId, p_email: parsed.data.email.toLowerCase(), p_days: parsed.data.days });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    refresh(parsed.data.creatorId);
    const [t, { data: hero }] = await Promise.all([
      getTranslations("invites.team"),
      supabase.from("creator_profiles").select("name").eq("id", parsed.data.creatorId).maybeSingle(),
    ]);
    const link = `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    const emailed = await sendInviteEmail({ to: parsed.data.email, link, scopeName: hero?.name ?? "Groscove Ultra", roleLabel: t("memberRole"), days: parsed.data.days });
    return { ok: true, message: t("invited"), link, emailed };
  } catch (error) {
    return agencyFail(error);
  }
}

const pairSchema = z.object({ creatorId: z.uuid(), userId: z.uuid() });

export async function removeHeroTeamAction(input: { creatorId: string; userId: string }): Promise<HeroTeamResult> {
  await requireUser("/heroi/equipe");
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("hero_team_remove", { p_creator: parsed.data.creatorId, p_user: parsed.data.userId });
    if (error) return agencyFail(error);
    refresh(parsed.data.creatorId);
    return { ok: true, message: (await getTranslations("invites.team"))("removed") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function transferHeroAction(input: { creatorId: string; userId: string }): Promise<HeroTeamResult> {
  await requireUser("/heroi/equipe");
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("hero_team_transfer", { p_creator: parsed.data.creatorId, p_user: parsed.data.userId });
    if (error) return agencyFail(error);
    refresh(parsed.data.creatorId);
    revalidatePath("/profile");
    return { ok: true, message: (await getTranslations("invites.team"))("transferred") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function revokeHeroTeamInviteAction(input: { creatorId: string; id: string }): Promise<HeroTeamResult> {
  await requireUser("/heroi/equipe");
  const parsed = z.object({ creatorId: z.uuid(), id: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_invitation_revoke", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    refresh(parsed.data.creatorId);
    return { ok: true, message: (await getTranslations("invites.team"))("inviteRevoked") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function createMyHeroAction(input: { name: string }): Promise<HeroTeamResult> {
  await requireUser("/heroi/equipe");
  // 0141: Hero/Creator só pelo aplicativo
  if (await heroChannelBlocked()) return agencyFail("creator_app_only");
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(input);
  if (!parsed.success) return agencyFail("name_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("creator_create_my_hero", { p_name: parsed.data.name });
    if (error) return agencyFail(error);
    revalidatePath("/heroi", "layout");
    revalidatePath("/profile");
    return { ok: true, message: (await getTranslations("invites.team"))("heroCreated") };
  } catch (error) {
    return agencyFail(error);
  }
}
