import "server-only";
import { getUser } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { inboxParams, isInboxKind, safeInboxLink, type InboxKind } from "./kinds";

// Caixa de avisos (0064): cada um lê só os próprios (RLS). Sem a 0064: indisponível, sem erro.

export type InboxItem = { id: string; kind: InboxKind; params: Record<string, string>; link: string; createdAt: string; readAt: string | null };

export type InboxPage = { available: boolean; items: InboxItem[]; unread: number };

export async function listInbox(opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<InboxPage> {
  const user = await getUser();
  if (!user) return { available: false, items: [], unread: 0 };
  const supabase = await createClient();
  let query = supabase
    .from("inbox_notifications")
    .select("id, kind, params, link, created_at, read_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 20, 1), 100));
  if (opts.unreadOnly) query = query.is("read_at", null);
  const [{ data, error }, { count }] = await Promise.all([
    query,
    supabase.from("inbox_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  if (error) return { available: !isMissingSchema(error), items: [], unread: 0 };
  const items = (data ?? []).flatMap((n) =>
    isInboxKind(n.kind) ? [{ id: n.id, kind: n.kind, params: inboxParams(n.params), link: safeInboxLink(n.link), createdAt: n.created_at, readAt: n.read_at }] : [],
  );
  return { available: true, items, unread: count ?? 0 };
}

export async function unreadInboxCount(): Promise<number | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { count, error } = await supabase.from("inbox_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
  if (error) return null;
  return count ?? 0;
}
