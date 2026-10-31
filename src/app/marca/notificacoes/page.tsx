import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxPage } from "@/components/inbox/InboxPage";
import { requireBrand } from "@/lib/brand-portal/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default async function BrandInboxPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await requireBrand();
  const unreadOnly = (await searchParams).filtro === "nao-lidas";
  return <InboxPage basePath="/marca/notificacoes" unreadOnly={unreadOnly} />;
}
