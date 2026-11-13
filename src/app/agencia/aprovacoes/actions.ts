"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { presidencyError, REQUESTED_PROFILES, type PresidencyError } from "@/lib/access/status";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type DecideState = { status: "idle" } | { status: "done"; decision: "approved" | "rejected" } | { status: "error"; error: PresidencyError };

const schema = z.object({
  userId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
  // o perfil que a tela mostrou: se a pessoa trocou o pedido depois, o banco recusa (profile_changed)
  expectedProfile: z.enum(REQUESTED_PROFILES).optional(),
  // a situação que a tela mostrou (fila = pendente, "Decididos" = recusada): se outro aprovador decidiu nesse meio-tempo,
  // o banco recusa (already_decided) em vez de sobrescrever a decisão dele (0144)
  expectedStatus: z.enum(["pending", "rejected"]).optional(),
});

/**
 * Aprova ou recusa um cadastro. Quem decide é o banco (presidency_access_decide confere a identidade do token: a
 * Presidência e os ADMs); aqui só valida a entrada e redesenha a fila e os painéis.
 */
export async function decideAccessAction(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const text = (name: string) => (typeof formData.get(name) === "string" ? formData.get(name) : undefined);
  const parsed = schema.safeParse({
    userId: formData.get("userId"),
    decision: formData.get("decision"),
    note: text("note"),
    expectedProfile: text("expectedProfile"),
    expectedStatus: text("expectedStatus"),
  });
  if (!parsed.success) return { status: "error", error: "invalid_input" };
  await requireUser("/agencia/aprovacoes");
  const supabase = await createClient();
  const args = {
    p_user: parsed.data.userId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ? parsed.data.note : null,
    p_expected_profile: parsed.data.expectedProfile ?? null,
  };
  let { error } = await supabase.rpc("presidency_access_decide", { ...args, p_expected_status: parsed.data.expectedStatus ?? null });
  // banco ainda sem a 0144 (publicação antes da migração): a mesma decisão, sem a trava de "já decidido"
  if (error?.code === "PGRST202") ({ error } = await supabase.rpc("presidency_access_decide", args));
  if (error) return { status: "error", error: presidencyError(error.message) };
  revalidatePath("/agencia/aprovacoes");
  revalidatePath("/agencia");
  revalidatePath("/admin");
  return { status: "done", decision: parsed.data.decision };
}
