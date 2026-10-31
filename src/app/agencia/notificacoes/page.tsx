import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxPage } from "@/components/inbox/InboxPage";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default async function AgencyInboxPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await requireAgency("staff");
  const unreadOnly = (await searchParams).filtro === "nao-lidas";
  return <InboxPage basePath="/agencia/notificacoes" unreadOnly={unreadOnly} />;
}
