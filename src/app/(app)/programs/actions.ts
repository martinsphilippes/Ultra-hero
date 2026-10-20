"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Ações de programas: inscrição (RPC enroll_program) e abandono (update permitido pelo guard de RLS).

export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const pathSchema = z.string().regex(/^\/programs\/[a-z0-9-]+$/);

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return { ok: false, error: rpcErrorCode(message) || "generic" };
}

export async function enrollProgram(input: { programId: string; timezone: string; path: string }): Promise<Result<{ enrollmentId: string }>> {
  const parsed = z.object({ programId: z.uuid(), timezone: z.string().trim().min(1).max(64), path: pathSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("enroll_program", { p_program: parsed.data.programId, p_timezone: parsed.data.timezone });
    if (error) return fail(error.message);
    await trackEvent("program.enroll", { program_id: parsed.data.programId });
    revalidatePath(parsed.data.path);
    return { ok: true, enrollmentId: String(data) };
  } catch (error) {
    return fail(error);
  }
}

export async function abandonEnrollment(input: { enrollmentId: string; path: string }): Promise<Result> {
  const parsed = z.object({ enrollmentId: z.uuid(), path: pathSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    // Só active -> abandoned passa no trigger enrollment_status_guard; RLS limita ao dono.
    const { data, error } = await supabase
      .from("enrollments")
      .update({ status: "abandoned" })
      .eq("id", parsed.data.enrollmentId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return { ok: false, error: "not_found" };
    revalidatePath(parsed.data.path);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
