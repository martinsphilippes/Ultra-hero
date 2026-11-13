import "server-only";
import { cache } from "react";
import { getUser } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { parseAccountAccess, parseQueue, type AccountAccess, type QueueItem } from "./status";

/**
 * A sessão aprova os cadastros? A Presidência e os ADMs (admin da plataforma e Adm da indústria Groscove) — o banco
 * decide pela identidade do token (public.can_approve_access, 0144). Banco ainda sem a 0144: vale a regra da 0141
 * (só a Presidência), para a fila não sumir durante a publicação.
 */
export const canApproveAccess = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_approve_access");
  if (!error) return data === true;
  if (!isMissingSchema(error)) return false;
  const legacy = await supabase.rpc("is_presidency");
  return !legacy.error && legacy.data === true;
});

export type QueueResult = { available: true; items: QueueItem[] } | { available: false };

/** Fila (pendentes, mais antigos primeiro) ou decididos pela Presidência e pelos ADMs (mais recentes primeiro). */
export async function getPresidencyQueue(view: "pending" | "decided"): Promise<QueueResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("presidency_access_queue", { p_view: view });
  if (error) return { available: false };
  return { available: true, items: parseQueue(data) };
}

/** Quantos cadastros esperam (cartão dos painéis). Nulo para quem não aprova ou sem a 0141. */
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
