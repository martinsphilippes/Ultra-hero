"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Triagem de denúncias (0071): dispensar ou agir (arquivar o conteúdo e/ou suspender o herói). Auditado no banco.
const schema = z.object({ id: z.uuid(), status: z.enum(["dismissed", "actioned"]), archiveContent: z.boolean(), suspendCreator: z.boolean() });

export async function resolveReportAction(input: z.input<typeof schema>): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole("admin");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_archive_content: parsed.data.archiveContent,
    p_suspend_creator: parsed.data.suspendCreator,
  });
  if (error) return { ok: false, error: "generic" };
  revalidatePath("/admin/denuncias");
  revalidatePath("/", "layout");
  return { ok: true };
}
