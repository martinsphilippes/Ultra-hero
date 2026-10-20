import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tabs");
  return { title: t("personalities") };
}

// Personalidades (placeholder).
export default async function PersonalitiesPage() {
  const t = await getTranslations("nav.tabs");
  return <PlaceholderPage title={t("personalities")} />;
}
