import "server-only";
import { cache } from "react";
import { getUser } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { parseAccountAccess, parseQueue, type AccountAccess, type QueueItem } from "./status";

/** A sessão é da Presidência (quem aprova os cadastros)? O banco decide (public.is_presidency, 0141). */
export const isPresidency = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_presidency");
  return !error && data === true;
});

export type QueueResult = { available: true; items: QueueItem[] } | { available: false };

/** Fila (pendentes, mais antigos primeiro) ou decididos pela Presidência (mais recentes primeiro). */
export async function getPresidencyQueue(view: "pending" | "decided"): Promise<QueueResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("presidency_access_queue", { p_view: view });
  if (error) return { available: false };
  return { available: true, items: parseQueue(data) };
}

/** Quantos cadastros esperam (cartão do painel). Nulo fora da Presidência ou sem a 0141. */
export async function getPresidencyPendingCount(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("presidency_access_pending_count");
  if (error || typeof data !== "number") return null;
  return data;
}

export type MyAccessResult = { available: true; access: AccountAccess } | { available: false; missingSchema: boolean };

/** Situação do cadastro da própria sessão (liberada pela trava mesmo pendente). */
export async function getMyAccess(): Promise<MyAccessResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_access_status");
  if (error) return { available: false, missingSchema: isMissingSchema(error) };
  const access = parseAccountAccess(data);
  return access ? { available: true, access } : { available: false, missingSchema: false };
}
