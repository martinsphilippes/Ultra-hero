"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Ações do "Hoje" (Perfil): itens de rotina manuais e marcação diária. A RLS só aceita linhas do
// próprio usuário; mesmo assim o user_id vem sempre da sessão, nunca do cliente. Sugestões de
// programa usam completeContent (content/actions.ts): mesma RPC, mesmo feedback de sequência.

export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

export type RoutineItemInput = {
  title: string;
  note?: string | null;
  /** "HH:MM"; vazio/null = sem horário. */
  timeOfDay?: string | null;
  /** 0 = domingo … 6 = sábado; vazio/null = todos os dias. */
  weekdays?: number[] | null;
};

// Códigos do banco que a interface traduz (me.today.rhythm.errors.*); o resto vira "failed".
const KNOWN_ERRORS = new Set(["routine_limit", "routine_item_not_found", "invalid_timezone", "unauthenticated"]);

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  const code = rpcErrorCode(message);
  return { ok: false, error: KNOWN_ERRORS.has(code) ? code : "failed" };
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const uuid = z.uuid();
const timezoneSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/).refine(isValidTimeZone, "invalid_timezone");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdaysSchema = z.array(z.number().int().min(0).max(6)).min(1).max(7);

const itemSchema = z.object({
  title: z.string().trim().min(1).max(80),
  note: z.string().trim().max(120).nullish(),
  timeOfDay: z.union([timeSchema, z.literal(""), z.null()]).optional(),
  weekdays: weekdaysSchema.nullish(),
});

// Normaliza a entrada validada para as colunas da tabela (sem user_id: entra só da sessão).
function toRow(data: z.infer<typeof itemSchema>) {
  const days = data.weekdays ? Array.from(new Set(data.weekdays)).sort((a, b) => a - b) : null;
  return {
    title: data.title,
    note: data.note ? data.note : null,
    time_of_day: data.timeOfDay ? `${data.timeOfDay}:00` : null,
    // Sete dias marcados = todos os dias: guarda null para manter a semântica simples.
    weekdays: days && days.length === 7 ? null : days,
  };
}

function revalidateToday() {
  revalidatePath("/profile");
  revalidatePath("/evolution");
}

// ---------------------------------------------------------------- itens manuais
export async function createRoutineItem(input: RoutineItemInput): Promise<Result<{ id: string }>> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("routine_items")
      .insert({ user_id: user.id, ...toRow(parsed.data) })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "failed");
    revalidateToday();
    return { ok: true, id: data.id };
  } catch (error) {
    return fail(error);
  }
}

export async function updateRoutineItem(input: RoutineItemInput & { itemId: string }): Promise<Result> {
  const parsed = itemSchema.extend({ itemId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    const { itemId, ...rest } = parsed.data;
    const { data, error } = await supabase.from("routine_items").update(toRow(rest)).eq("id", itemId).eq("user_id", user.id).select("id");
    if (error) return fail(error.message);
    if (!data || data.length === 0) return { ok: false, error: "routine_item_not_found" };
    revalidateToday();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRoutineItem(input: { itemId: string }): Promise<Result> {
  const parsed = z.object({ itemId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const supabase = await createClient();
    // Apagar remove também as marcações (FK on delete cascade); o histórico de sequência já
    // consolidado segue sendo recalculado pelo banco a partir do que restar.
    const { error } = await supabase.from("routine_items").delete().eq("id", parsed.data.itemId).eq("user_id", user.id);
    if (error) return fail(error.message);
    revalidateToday();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- marcação diária
export type RoutineCheckResult = { done: boolean; localDate: string; streak: number };

function parseCheck(value: unknown): RoutineCheckResult {
  const raw = (value && typeof value === "object" ? value : {}) as { done?: unknown; local_date?: unknown; streak?: unknown };
  return {
    done: Boolean(raw.done),
    localDate: typeof raw.local_date === "string" ? raw.local_date : "",
    streak: Number(raw.streak ?? 0),
  };
}

export async function toggleRoutineItem(input: { itemId: string; done: boolean; timezone: string }): Promise<Result<{ check: RoutineCheckResult }>> {
  const parsed = z.object({ itemId: uuid, done: z.boolean(), timezone: timezoneSchema }).safeParse(input);
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
    revalidateToday();
    return { ok: true, check: parseCheck(data) };
  } catch (error) {
    return fail(error);
  }
}
