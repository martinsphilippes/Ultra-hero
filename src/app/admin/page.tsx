import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.dashboard")}` };
}

// Painel do admin (placeholder).
export default async function AdminHomePage() {
  const t = await getTranslations("nav");
  return <PlaceholderPage title={t("admin.dashboard")} description={t("portalDescription.admin")} eyebrow={t("portals.admin")} />;
}
