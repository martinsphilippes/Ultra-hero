import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxHub } from "@/components/messaging/InboxHub";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging");
  return { title: t("title") };
}

// Avisos do Portal do Hero (0097): os do sino de quem tem Hero ou está num casting (agência, equipe, marcas).
export default async function HeroInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <InboxHub portal="hero" basePath="/heroi/avisos" searchParams={await searchParams} />;
}
