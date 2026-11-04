import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoomPage } from "@/components/project-room/RoomPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("room") };
}

// Sala do projeto vista pelo herói (cliente ou contratado; 0110): sem as mensagens internas; NDA quando a agência pedir.
export default async function HeroRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoomPage portal="talent" dealId={id} backHref="/heroi/projetos" />;
}
