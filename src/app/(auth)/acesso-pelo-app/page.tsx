import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { CreatorAppOnlyNotice } from "@/components/auth/CreatorAppOnlyNotice";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("access.meta");
  return { title: t("appOnly") };
}

// Hero/Creator só pelo aplicativo (0141). O middleware traz para cá quem abre a área do Hero no navegador e encerra a
// sessão de conta Hero aberta no navegador (login, Google, convite, URL direta ou sessão antiga).
export default async function AppOnlyPage() {
  const t = await getTranslations("access.appOnly");
  return (
    <AuthCard title={t("title")}>
      <CreatorAppOnlyNotice backHref="/login" />
    </AuthCard>
  );
}
