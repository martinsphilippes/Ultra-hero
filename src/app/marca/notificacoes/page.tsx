import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxHub } from "@/components/messaging/InboxHub";
import { requireBrand } from "@/lib/brand-portal/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging");
  return { title: t("title") };
}

export default async function BrandInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireBrand();
  return <InboxHub portal="brand" basePath="/marca/notificacoes" searchParams={await searchParams} />;
}
