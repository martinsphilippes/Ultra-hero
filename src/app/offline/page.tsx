import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/layout/Logo";
import { EmptyState } from "@/components/ui/empty-state";
import { ReloadButton } from "./ReloadButton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.offline");
  return { title: t("title") };
}

// Página servida pelo service worker quando não há rede.
export default async function OfflinePage() {
  const t = await getTranslations("errors.offline");
  const tc = await getTranslations("common.actions");

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-grid px-gutter py-12">
      <Logo size="lg" />
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-lg">
        <EmptyState icon={<WifiOff />} title={t("title")} description={t("description")} action={<ReloadButton label={tc("reload")} />} />
      </div>
    </main>
  );
}
