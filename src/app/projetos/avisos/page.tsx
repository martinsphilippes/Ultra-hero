import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxHub } from "@/components/messaging/InboxHub";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging");
  return { title: t("title") };
}

// Avisos do staff externo (0110): mensagens novas na sala e a ficha da diária.
export default async function ProjectsInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <InboxHub portal="staff" basePath="/projetos/avisos" searchParams={await searchParams} />;
}
