"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Destaques do Início: reescreve as posições 1..n via admin_set_featured (auditado por item).

const fail = failWith;

async function requireAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

export async function reorderFeaturedAction(kind: "content" | "program", orderedIds: string[]): Promise<ActionResult> {
  const parsed = z.object({ kind: z.enum(["content", "program"]), orderedIds: z.array(z.uuid()).min(1).max(100) }).safeParse({ kind, orderedIds });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      const { error } = await supabase.rpc("admin_set_featured", { p_kind: parsed.data.kind, p_id: parsed.data.orderedIds[i], p_featured: true, p_rank: i + 1 });
      if (error) return fail(error);
    }
    revalidatePath("/admin/featured");
    revalidatePath("/");
    const t = await getTranslations("adminContent.featured");
    return { ok: true, message: t("reordered") };
  } catch (error) {
    return fail(error);
  }
}
