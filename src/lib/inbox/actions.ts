"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listInbox, type InboxItem } from "./queries";

// Ações do sino: listar os últimos avisos e marcar como lidos (só os próprios, pela RPC).

export async function listInboxAction(input: { limit?: number } = {}): Promise<{ items: InboxItem[]; unread: number }> {
  const limit = z.number().int().min(1).max(50).catch(20).parse(input.limit ?? 20);
  const page = await listInbox({ limit });
  return { items: page.items, unread: page.unread };
}

export async function markReadAction(input: { ids?: string[] } = {}): Promise<{ ok: boolean; changed: number }> {
  const user = await getUser();
  if (!user) return { ok: false, changed: 0 };
  const ids = z.array(z.uuid()).max(100).optional().safeParse(input.ids);
  if (!ids.success) return { ok: false, changed: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inbox_mark_read", { p_ids: ids.data && ids.data.length > 0 ? ids.data : undefined });
  if (error) return { ok: false, changed: 0 };
  return { ok: true, changed: typeof data === "number" ? data : 0 };
}
