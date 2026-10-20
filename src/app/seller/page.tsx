import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.seller")} · ${t("seller.dashboard")}` };
}

// Painel do fornecedor (placeholder).
export default async function SellerHomePage() {
  const t = await getTranslations("nav");
  return <PlaceholderPage title={t("seller.dashboard")} description={t("portalDescription.seller")} eyebrow={t("portals.seller")} />;
}
