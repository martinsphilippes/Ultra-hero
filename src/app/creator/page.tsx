import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.creator")} · ${t("creator.dashboard")}` };
}

// Painel da personalidade (placeholder).
export default async function CreatorHomePage() {
  const t = await getTranslations("nav");
  return <PlaceholderPage title={t("creator.dashboard")} description={t("portalDescription.creator")} eyebrow={t("portals.creator")} />;
}
