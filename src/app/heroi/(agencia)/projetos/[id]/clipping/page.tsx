import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClippingPage } from "@/components/project-room/ClippingPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("clipping") };
}

// Clipping do projeto para o Hero-cliente (0110).
export default async function HeroClippingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClippingPage dealId={id} backHref="/heroi/projetos" />;
}
