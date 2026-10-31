"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { REPORT_DETAILS_MAX, REPORT_REASONS } from "./reasons";

// Denunciar e bloquear (0071, diretriz 1.2 da App Store). O banco confere a sessão, o limite diário e o alvo.

type Result = { ok: true } | { ok: false; error: string };

const KNOWN = new Set(["unauthenticated", "not_found", "too_many_reports", "invalid_input"]);
function fail(error: { message?: string } | null | undefined): Result {
  const code = rpcErrorCode(error?.message ?? "");
  return { ok: false, error: code && KNOWN.has(code) ? code : "generic" };
}

const reportSchema = z
  .object({
    contentId: z.uuid().nullable().optional(),
    creatorId: z.uuid().nullable().optional(),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(REPORT_DETAILS_MAX).optional().default(""),
  })
  .refine((v) => Boolean(v.contentId || v.creatorId));

export async function reportAction(input: z.input<typeof reportSchema>): Promise<Result> {
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", {
    p_content: parsed.data.contentId ?? null,
    p_creator: parsed.data.creatorId ?? null,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  return error ? fail(error) : { ok: true };
}

export async function blockHeroAction(creatorId: string): Promise<Result> {
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };
  if (!z.uuid().safeParse(creatorId).success) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_hero", { p_creator: creatorId });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unblockHeroAction(creatorId: string): Promise<Result> {
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };
  if (!z.uuid().safeParse(creatorId).success) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_hero", { p_creator: creatorId });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
