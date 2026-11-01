"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { WORKOUT_STEPS_MAX } from "@/lib/post-blocks/schema";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Marcar um passo do treino de um post (0075): por pessoa, pela RPC post_step_toggle (o banco confere
// o acesso ao conteúdo e se o passo existe). Devolve quantos passos a pessoa já marcou.

export type StepToggleResult = { ok: true; done: number } | { ok: false; error: "unauthenticated" | "forbidden" | "not_found" | "invalid_step" | "generic" };

const schema = z.object({ contentId: z.uuid(), step: z.number().int().min(0).max(WORKOUT_STEPS_MAX - 1), done: z.boolean() });

export async function toggleStepAction(input: { contentId: string; step: number; done: boolean }): Promise<StepToggleResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_step" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_step_toggle", { p_content: parsed.data.contentId, p_step: parsed.data.step, p_done: parsed.data.done });
    if (error) {
      const code = rpcErrorCode(error.message);
      return { ok: false, error: code === "forbidden" || code === "not_found" || code === "invalid_step" || code === "unauthenticated" ? code : "generic" };
    }
    return { ok: true, done: typeof data === "number" ? data : 0 };
  } catch {
    return { ok: false, error: "generic" };
  }
}
