import { MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { roomKey } from "@/lib/messaging/logic";
import { markConversationRead } from "@/lib/messaging/queries";
import { getRoom, getRoomAccess } from "@/lib/project-room/queries";
import { clippingHref, isUuid, type RoomPortal } from "@/lib/project-room/vocab";
import { ProjectRoom } from "./ProjectRoom";

// Página da sala para marca, Hero e staff externo (0110): sem acesso → 404; sala arquivada → clipping (marca e Hero).
export async function RoomPage({ portal, dealId, backHref }: { portal: Exclude<RoomPortal, "agency">; dealId: string; backHref: string }) {
  if (!isUuid(dealId)) notFound();
  // 0115: abrir a sala marca a conversa como lida (lista "Avisos e mensagens" e o aviso "Nova mensagem")
  const [t, room] = await Promise.all([getTranslations("projectRoom.room"), getRoom(dealId), markConversationRead(roomKey(dealId))]);
  if (!room.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<MessagesSquare />} title={t("unavailable")} />
      </div>
    );
  }
  if (!room.room) {
    const access = await getRoomAccess(dealId);
    if (access?.status === "archived" && portal !== "staff") redirect(clippingHref(portal, dealId));
    notFound();
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={room.room.deal.title} description={[room.room.deal.service, room.room.deal.agency].filter(Boolean).join(" · ")} backHref={backHref} backLabel={t("back")} />
      <ProjectRoom portal={portal} room={room.room} />
    </div>
  );
}
