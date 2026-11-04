import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoomPage } from "@/components/project-room/RoomPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("room") };
}

// Sala do projeto para o staff externo (0110): NDA primeiro; depois normas, briefing, diária com "Cheguei ao local" e a
// conversa (inclusive as mensagens internas da equipe). No fechamento, a sala some.
export default async function StaffRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoomPage portal="staff" dealId={id} backHref="/projetos" />;
}
