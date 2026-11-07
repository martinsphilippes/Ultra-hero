"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/** A Groscove coloca/tira uma página da Onda (0127). */
export async function setOndaAction(input: { creatorId: string; on: boolean }): Promise<Result> {
  await requireUser("/personalities");
  const parsed = z.object({ creatorId: z.uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_set", { p_creator: parsed.data.creatorId, p_on: parsed.data.on });
  if (error) return { ok: false, error: error.message.includes("forbidden") ? "forbidden" : "generic" };
  revalidatePath("/explore");
  revalidatePath("/personalities", "layout");
  return { ok: true };
}

/** A Groscove tira um conteúdo do ar, com o motivo (0127). */
export async function takedownContentAction(input: { contentId: string; reason: string }): Promise<Result> {
  await requireUser("/content");
  const parsed = z.object({ contentId: z.uuid(), reason: z.string().trim().min(3).max(300) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "reason_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("content_takedown", { p_content: parsed.data.contentId, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: error.message.includes("forbidden") ? "forbidden" : "generic" };
  revalidatePath("/", "layout");
  return { ok: true };
}
