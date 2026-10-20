import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tabs");
  return { title: t("home") };
}

// Início (placeholder; será substituído pela jornada real).
export default async function HomePage() {
  const t = await getTranslations();
  return <PlaceholderPage title={t("nav.tabs.home")} description={t("common.app.tagline")} eyebrow="Ultra Hero" />;
}
