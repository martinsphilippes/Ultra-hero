import "server-only";
import { getUser } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_PAGE, PAGE_SIZE, parseConversationPage, type ConversationKind, type ConversationPage, type MessagingPortal } from "./logic";

// Conversas da pessoa num portal (0115): uma chamada à RPC conversation_list, que aplica as mesmas regras de quem lê
// cada conversa. Sem a 0115 aplicada: indisponível, sem erro (a aba mostra o vazio).

export async function listConversations(
  portal: MessagingPortal,
  opts: { limit?: number; offset?: number; kind?: ConversationKind | null; unread?: boolean; q?: string } = {},
): Promise<ConversationPage> {
  const user = await getUser();
  if (!user) return EMPTY_PAGE;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conversation_list", {
    p_portal: portal,
    p_limit: opts.limit ?? PAGE_SIZE,
    p_offset: opts.offset ?? 0,
    p_kind: opts.kind ?? null,
    p_unread: opts.unread ?? false,
    p_q: opts.q?.trim() ? opts.q.trim() : null,
  });
  if (error) return { ...EMPTY_PAGE, available: !isMissingSchema(error) };
  return parseConversationPage(data);
}

/** Conversas com mensagem não lida (sino e cartão do início); null = indisponível. */
export async function unreadConversations(portal: MessagingPortal): Promise<number | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conversation_unread", { p_portal: portal });
  if (error) return null;
  return typeof data === "number" ? data : 0;
}

/**
 * Marca a conversa como lida ao abrir a página dela (e os avisos "Nova mensagem" dela). Sem efeito para quem não
 * participa; erro (ex.: banco sem a 0115) não derruba a página.
 */
export async function markConversationRead(key: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("conversation_mark_read", { p_key: key });
  } catch {
    // melhor esforço: a conversa segue legível; a contagem acerta na próxima abertura
  }
}
