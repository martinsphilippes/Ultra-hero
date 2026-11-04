import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxPage } from "@/components/inbox/InboxPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

// Avisos do Portal do Herói (0097): os do sino de quem tem herói ou está num casting (agência, equipe, marcas).
export default async function HeroInboxPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const unreadOnly = (await searchParams).filtro === "nao-lidas";
  return <InboxPage basePath="/heroi/avisos" unreadOnly={unreadOnly} />;
}
