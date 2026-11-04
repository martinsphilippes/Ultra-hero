import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxPage } from "@/components/inbox/InboxPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

// Avisos do staff externo (0110): mensagens novas na sala e a ficha da diária.
export default async function ProjectsInboxPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const unreadOnly = (await searchParams).filtro === "nao-lidas";
  return <InboxPage basePath="/projetos/avisos" unreadOnly={unreadOnly} />;
}
