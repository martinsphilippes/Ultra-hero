import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConnectWatchCard } from "@/components/me/today/ConnectWatchCard";
import { LegacyTodayCleanup } from "@/components/me/today/LegacyTodayCleanup";
import { SyncingCard } from "@/components/me/today/SyncingCard";
import { WatchToday } from "@/components/me/today/WatchToday";
import { DemoBadge, PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { getNativeApp } from "@/lib/native-app/server";
import { loadWatchView, wantsExample } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.today");
  return { title: t("title") };
}

// Hoje em tela própria: a conta demo vê o seu relógio simulado; a conta real vê o "Exemplo"
// (?exemplo=1, aberto pelo botão "Ver um exemplo"), sempre separado do perfil da pessoa.
export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const example = wantsExample(params.exemplo);
  const [view, t] = await Promise.all([loadWatchView(example ? "/profile/today?exemplo=1" : "/profile/today", example), getTranslations("me.today")]);

  // app das lojas: sem relógio simulado (TodaySection)
  if ((view.kind === "demo" || view.kind === "example") && (await getNativeApp())) redirect("/profile");

  return (
    <div className="flex flex-col gap-6">
      <LegacyTodayCleanup />
      <PageHeader
        title={view.kind === "example" ? t("example.pageTitle") : t("title")}
        description={view.kind === "connect" ? ((view.providers?.length ?? 0) > 0 ? t("descriptionConnectAvailable") : t("descriptionConnect")) : t("description")}
        backHref="/profile"
        backLabel={t("example.back")}
        actions={view.kind === "demo" || view.kind === "example" ? <DemoBadge /> : null}
      />
      {view.kind === "connect" ? (
        <ConnectWatchCard headingLevel="h2" providers={view.providers} />
      ) : view.kind === "syncing" ? (
        <SyncingCard provider={view.provider} deviceName={view.deviceName} />
      ) : view.kind === "real" ? (
        <WatchToday snapshot={view.snapshot} mode="real" lastSync={view.lastSync} stale={view.stale} blockHeading="h2" />
      ) : (
        <WatchToday snapshot={view.snapshot} mode={view.kind} blockHeading="h2" />
      )}
    </div>
  );
}
