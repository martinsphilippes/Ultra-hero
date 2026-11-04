import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClippingPage } from "@/components/project-room/ClippingPage";
import { getBrandContext } from "@/lib/brand-portal/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("clipping") };
}

// Clipping do projeto para a marca (0110): entregas, links, métricas, equipe, prévia, guia de uso; imprimível.
export default async function BrandClippingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  return <ClippingPage dealId={id} backHref="/marca/campanhas" />;
}
