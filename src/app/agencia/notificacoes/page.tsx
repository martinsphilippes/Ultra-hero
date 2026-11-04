import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxHub } from "@/components/messaging/InboxHub";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging");
  return { title: t("title") };
}

export default async function AgencyInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAgency("staff");
  return <InboxHub portal="agency" basePath="/agencia/notificacoes" searchParams={await searchParams} />;
}
