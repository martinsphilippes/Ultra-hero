"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { QUESTIONS, scorePersonality } from "./test";

/** Calcula no servidor (as respostas vêm da tela) e guarda o tipo e a pontuação por eixo. */
export async function savePersonalityAction(answers: Record<string, number>): Promise<{ ok: true; type: string } | { ok: false; error: string }> {
  await requireUser("/teste-de-personalidade");
  const shape = z.record(z.string(), z.number().int().min(1).max(5));
  const parsed = shape.safeParse(answers);
  if (!parsed.success || QUESTIONS.some((q) => parsed.data[q.id] === undefined)) return { ok: false, error: "missing" };
  const { type, scores } = scorePersonality(parsed.data);
  const supabase = await createClient();
  const { error } = await supabase.rpc("personality_save", { p_type: type, p_scores: scores });
  if (error) return { ok: false, error: error.message.includes("forbidden") ? "forbidden" : "generic" };
  revalidatePath("/teste-de-personalidade");
  revalidatePath("/agencia/equipe");
  return { ok: true, type };
}
