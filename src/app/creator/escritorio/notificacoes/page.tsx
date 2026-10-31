import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxPage } from "@/components/inbox/InboxPage";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default async function OfficeInboxPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const unreadOnly = (await searchParams).filtro === "nao-lidas";
  return <InboxPage basePath="/creator/escritorio/notificacoes" unreadOnly={unreadOnly} />;
}
