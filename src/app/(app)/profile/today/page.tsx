import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegacyTodayCleanup } from "@/components/me/today/LegacyTodayCleanup";
import { TodayHub } from "@/components/me/today/TodayHub";
import { DemoBadge, PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { isValidTimeZone } from "@/components/me/dates";
import { getProfile, requireUser } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { loadEvolutionSummary } from "@/lib/routine/evolution-summary";
import { loadWatchView, wantsExample } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.today");
  return { title: t("title") };
}

// Hoje em tela própria: a conta demo vê o seu relógio simulado; a conta real vê o "Exemplo"
// (?exemplo=1, aberto pelo botão "Ver um exemplo"), sempre separado do perfil da pessoa. Mesmos 3
// cards do Perfil (Seu dia, Sua noite, Evolução); no "Exemplo" a Evolução não traz a comparação.
export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const example = wantsExample(params.exemplo);
  const next = example ? "/profile/today?exemplo=1" : "/profile/today";
  const user = await requireUser(next);
  const profile = await getProfile();
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const [view, t, evolution] = await Promise.all([loadWatchView(next, example), getTranslations("me.today"), loadEvolutionSummary(user.id, tz)]);

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
      <TodayHub view={view} evolution={evolution} compare={view.kind !== "example"} />
    </div>
  );
}
