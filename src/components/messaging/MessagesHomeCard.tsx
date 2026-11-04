import { getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { messagesHref, type MessagingPortal } from "@/lib/messaging/logic";
import { unreadConversations } from "@/lib/messaging/queries";

// Cartão "Mensagens" do início de cada portal (0115): conversas não lidas, leva à aba Mensagens (só as não lidas
// quando há alguma). Sem a 0115: some.
export async function MessagesHomeCard({ portal, basePath }: { portal: MessagingPortal; basePath: string }) {
  const [t, unread] = await Promise.all([getTranslations("messaging"), unreadConversations(portal)]);
  if (unread === null) return null;
  return (
    <KpiCard
      href={messagesHref(basePath, { unread: unread > 0 })}
      label={t("homeCard")}
      value={unread}
      hint={t("homeCardHint", { count: unread })}
      tone={unread > 0 ? "danger" : "default"}
    />
  );
}
