import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { OpenRoomButton } from "@/components/project-room/OpenRoomButton";
import { ProjectRoom } from "@/components/project-room/ProjectRoom";
import { EmptyState } from "@/components/ui";
import { roomKey } from "@/lib/messaging/logic";
import { markConversationRead } from "@/lib/messaging/queries";
import { getRoom } from "@/lib/project-room/queries";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("room") };
}

type Props = { params: Promise<{ id: string }> };

// Sala do projeto (0110) vista pela agência: tudo (inclusive interno), staff externo com e-mail/NDA, diária com chegada,
// ferramentas (briefing, diária, feedback, arquivar). Abre sozinha com o roteiro ou a confirmação; antes disso, botão.
export default async function DealRoomPage({ params }: Props) {
  const { id } = await params;
  const { deal, canEdit } = await loadDeal(id);
  // 0115: abrir a sala marca a conversa como lida
  const [t, room] = await Promise.all([getTranslations("projectRoom.room"), getRoom(deal.id), markConversationRead(roomKey(deal.id))]);
  if (!room.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<MessagesSquare />} title={t("unavailable")} />
      </div>
    );
  }
  if (!room.room) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="room-none">
        <EmptyState icon={<MessagesSquare />} title={t("none")} description={t("noneHint")} action={canEdit ? <OpenRoomButton dealId={deal.id} /> : undefined} />
      </div>
    );
  }
  return <ProjectRoom portal="agency" room={room.room} />;
}
