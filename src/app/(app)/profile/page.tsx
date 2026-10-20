import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tabs");
  return { title: t("profile") };
}

// Perfil (placeholder; rota protegida).
export default async function ProfilePage() {
  await requireUser("/profile");
  const t = await getTranslations("nav.tabs");
  return <PlaceholderPage title={t("profile")} />;
}
