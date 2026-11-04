"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { getOrigin } from "@/lib/auth/origin";
import { requireRole } from "@/lib/auth/session";
import { sendInviteEmail } from "@/lib/email/invite";
import { ADMIN_INVITE_ROLES, HERO_MODES, TEAM_MODES, adminInviteOptions, validateAdminInvite, type AdminInviteForm } from "@/lib/invitations/rules";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Convite do admin (0091 + 0097): e-mail, papel e validade (+ as opções do Herói: novo, equipe ou casting). A RPC admin_invite
// confere tudo de novo (Admin só até 48h e com a confirmação; auditoria própria). O link de cada convite
// aparece uma única vez (o banco guarda só o hash) e, com e-mail configurado, também vai por e-mail.

export type AdminInviteLink = { email: string; link: string; emailed: boolean; kind: string };
export type AdminInviteResult = { ok: true; links: AdminInviteLink[] } | { ok: false; error: string };

const formSchema = z.object({
  email: z.string().trim().max(254),
  role: z.enum(ADMIN_INVITE_ROLES),
  days: z.coerce.number().int(),
  confirmAdmin: z.boolean().optional(),
  heroMode: z.enum(HERO_MODES).optional(),
  heroId: z.string().optional(),
  heroName: z.string().max(120).optional(),
  talentId: z.string().optional(),
  teamMode: z.enum(TEAM_MODES).optional(),
  teamUserId: z.string().optional(),
  teamEmail: z.string().max(254).optional(),
});

export async function adminInviteAction(input: AdminInviteForm): Promise<AdminInviteResult> {
  await requireRole("admin", "/admin/invitations");
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const form = { ...parsed.data, email: parsed.data.email.toLowerCase() } as AdminInviteForm;
  const errors = validateAdminInvite(form);
  if (errors.length > 0) {
    const code = errors.includes("admin_max_48h") ? "admin_invite_max_48h" : errors.includes("admin_confirm") ? "admin_confirm_required" : errors.includes("email") || errors.includes("team_email") ? "invalid_email" : errors.includes("hero_name") ? "name_required" : "invalid_input";
    return agencyFail(code);
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_invite", {
      p_email: form.email,
      p_role: form.role,
      p_days: form.days,
      p_options: adminInviteOptions(form) as Json,
    });
    if (error) return agencyFail(error);
    const rows = ((data as { invitations?: Array<{ id: string; email: string; token: string; kind: string | null }> } | null)?.invitations ?? []).filter((r) => r.token);
    if (rows.length === 0) return agencyFail("generic");
    const [origin, t] = await Promise.all([getOrigin(), getTranslations("invites.roles")]);
    const links: AdminInviteLink[] = [];
    for (const row of rows) {
      const link = `${origin}/invite?token=${encodeURIComponent(row.token)}`;
      const roleLabel = row.kind === "hero_team" ? t("heroTeam") : t(form.role);
      const emailed = await sendInviteEmail({ to: row.email, link, scopeName: "Groscove Ultra", roleLabel, days: form.days });
      links.push({ email: row.email, link, emailed, kind: row.kind ?? "talent" });
    }
    revalidatePath("/admin/invitations");
    return { ok: true, links };
  } catch (error) {
    return agencyFail(error);
  }
}
