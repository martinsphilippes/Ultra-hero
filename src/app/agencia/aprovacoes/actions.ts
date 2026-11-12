"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { presidencyError, type PresidencyError } from "@/lib/access/status";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type DecideState = { status: "idle" } | { status: "done"; decision: "approved" | "rejected" } | { status: "error"; error: PresidencyError };

const schema = z.object({
  userId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Aprova ou recusa um cadastro. Quem decide é o banco (presidency_access_decide confere a identidade do token: só a
 * Presidência); aqui só valida a entrada e redesenha a fila e o painel.
 */
export async function decideAccessAction(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const parsed = schema.safeParse({
    userId: formData.get("userId"),
    decision: formData.get("decision"),
    note: typeof formData.get("note") === "string" ? formData.get("note") : undefined,
  });
  if (!parsed.success) return { status: "error", error: "invalid_input" };
  await requireUser("/agencia/aprovacoes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("presidency_access_decide", {
    p_user: parsed.data.userId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ? parsed.data.note : null,
  });
  if (error) return { status: "error", error: presidencyError(error.message) };
  revalidatePath("/agencia/aprovacoes");
  revalidatePath("/agencia");
  return { status: "done", decision: parsed.data.decision };
}
