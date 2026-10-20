import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tabs");
  return { title: t("explore") };
}

// Explorar (placeholder).
export default async function ExplorePage() {
  const t = await getTranslations("nav.tabs");
  return <PlaceholderPage title={t("explore")} />;
}
