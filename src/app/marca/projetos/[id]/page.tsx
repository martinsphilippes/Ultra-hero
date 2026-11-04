import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoomPage } from "@/components/project-room/RoomPage";
import { getBrandContext } from "@/lib/brand-portal/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("room") };
}

// Sala do projeto vista pela marca (0110): conversa sem as mensagens internas, diária, guia de uso e pesquisa.
export default async function BrandRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  return <RoomPage portal="brand" dealId={id} backHref="/marca/campanhas" />;
}
