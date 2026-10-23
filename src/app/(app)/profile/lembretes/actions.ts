"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import {
  parseReminderCheck,
  reminderErrorCode,
  reminderIdSchema,
  reminderSchema,
  reminderToggleSchema,
  toReminderRow,
  type ReminderError,
  type ReminderInput,
} from "@/lib/routine/reminders";
import { createClient } from "@/lib/supabase/server";

// Lembretes (Q5): os itens de rotina que saíram do Hoje, com a mesma validação de antes (recuperada do
// histórico). A RLS só aceita linhas do próprio usuário; mesmo assim o user_id vem sempre da sessão.
// Marcar um lembrete não conta na sequência (Q10): a resposta nunca traz sequência.

export type ReminderResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: ReminderError };

function fail(error: unknown): { ok: false; error: ReminderError } {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return { ok: false, error: reminderErrorCode(message) };
}

function revalidateReminders() {
  revalidatePath("/profile/lembretes");
  revalidatePath("/profile");
}

export async function createReminder(input: ReminderInput): Promise<ReminderResult<{ id: string }>> {
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("routine_items")
      .insert({ user_id: user.id, ...toReminderRow(parsed.data) })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "failed");
    revalidateReminders();
    return { ok: true, id: data.id };
  } catch (error) {
    return fail(error);
  }
}

export async function updateReminder(input: ReminderInput & { itemId: string }): Promise<ReminderResult> {
  const parsed = reminderSchema.extend({ itemId: reminderIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { itemId, ...rest } = parsed.data;
    const { data, error } = await supabase.from("routine_items").update(toReminderRow(rest)).eq("id", itemId).eq("user_id", user.id).select("id");
    if (error) return fail(error.message);
    if (!data || data.length === 0) return { ok: false, error: "routine_item_not_found" };
    revalidateReminders();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteReminder(input: { itemId: string }): Promise<ReminderResult> {
  const parsed = z.object({ itemId: reminderIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    // As marcações do lembrete vão junto (FK on delete cascade). A sequência não depende delas (0037).
    const { data, error } = await supabase.from("routine_items").delete().eq("id", parsed.data.itemId).eq("user_id", user.id).select("id");
    if (error) return fail(error.message);
    if (!data || data.length === 0) return { ok: false, error: "routine_item_not_found" };
    revalidateReminders();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleReminder(input: { itemId: string; done: boolean; timezone: string }): Promise<ReminderResult<{ done: boolean; localDate: string }>> {
  const parsed = reminderToggleSchema.safeParse(input);
  if (!parsed.success) {
    const tz = parsed.error.issues.some((i) => i.path[0] === "timezone");
    return { ok: false, error: tz ? "invalid_timezone" : "invalid" };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("routine_check", { p_item: parsed.data.itemId, p_timezone: parsed.data.timezone, p_done: parsed.data.done });
    if (error) return fail(error.message);
    revalidateReminders();
    // Só done e data: mesmo que o banco ainda devolva a sequência (antes da 0037), ela não sai daqui.
    const check = parseReminderCheck(data);
    return { ok: true, done: check.done, localDate: check.localDate };
  } catch (error) {
    return fail(error);
  }
}
