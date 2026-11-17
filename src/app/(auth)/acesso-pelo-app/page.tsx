import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { CreatorAppOnlyNotice } from "@/components/auth/CreatorAppOnlyNotice";
import { NativeAppRecover } from "@/components/auth/NativeAppRecover";
import { isCreatorAppOnlyEnabled } from "@/lib/access/gate";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("access.meta");
  return { title: t("appOnly") };
}

// Hero/Creator só pelo aplicativo (0141), quando a regra está ligada (CREATOR_APP_ONLY=true). O middleware traz para cá
// quem abre a área do Hero no navegador e encerra a sessão de conta Hero aberta no navegador (login, Google, convite, URL
// direta ou sessão antiga). Regra desligada (padrão desde 17/11/2026): link antigo ou favorito vai ao login, sem a
// mensagem, que não vale mais.
export default async function AppOnlyPage() {
  if (!isCreatorAppOnlyEnabled()) redirect("/login");
  const t = await getTranslations("access.appOnly");
  return (
    <AuthCard title={t("title")}>
      <NativeAppRecover />
      <CreatorAppOnlyNotice backHref="/login" />
    </AuthCard>
  );
}
