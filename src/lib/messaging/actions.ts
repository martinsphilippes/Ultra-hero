"use server";

import { isMessagingPortal } from "./logic";
import { unreadConversations } from "./queries";

// Sino: contagem de conversas não lidas do portal (consulta de reserva a cada 30 s, junto com a dos avisos).
export async function conversationUnreadAction(portal: string): Promise<number | null> {
  if (!isMessagingPortal(portal)) return null;
  return unreadConversations(portal);
}
