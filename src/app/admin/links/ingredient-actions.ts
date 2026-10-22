"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Fila de vínculos ingrediente ↔ produto (fase 5): só o admin valida, suspende ou recusa, pela RPC
// admin_set_ingredient_product da 0027 (auditada em admin_audit; validar suspende o validado anterior
// do mesmo ingrediente). Recusar e suspender exigem motivo, que vai para a auditoria e para o herói.

const schema = z
  .object({ linkId: z.uuid(), status: z.enum(["validated", "suspended", "rejected"]), note: z.string().trim().max(200) })
  .refine((v) => v.status === "validated" || v.note.length >= 5, { path: ["note"] });

export async function setIngredientLinkStatusAction(linkId: string, status: "validated" | "suspended" | "rejected", note: string): Promise<ActionResult> {
  const parsed = schema.safeParse({ linkId, status, note });
  if (!parsed.success) return failWith(parsed.error.issues.some((i) => i.path[0] === "note") ? "justification_required" : "invalid_input");
  try {
    const user = await getUser();
    if (!user) return failWith("unauthenticated");
    if (!(await hasRole("admin"))) return failWith("forbidden");
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_ingredient_product", { p_link: parsed.data.linkId, p_status: parsed.data.status, p_note: parsed.data.note || (null as unknown as string) });
    if (error) return failWith(error);
    revalidatePath("/admin/links");
    const t = await getTranslations("shopping.admin.actions");
    return { ok: true, message: t("done") };
  } catch (error) {
    return failWith(error);
  }
}
