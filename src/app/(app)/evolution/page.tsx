import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tabs");
  return { title: t("evolution") };
}

// Evolução (placeholder; rota protegida).
export default async function EvolutionPage() {
  await requireUser("/evolution");
  const t = await getTranslations("nav.tabs");
  return <PlaceholderPage title={t("evolution")} />;
}
