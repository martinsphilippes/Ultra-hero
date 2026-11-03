import type { Metadata } from "next";
import { Clock, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { HeroFinance } from "@/components/hero-work/HeroFinance";
import { HeroWorkTabs } from "@/components/hero-work/HeroWorkTabs";
import { EmptyState, PageHeader } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import { zonedDayKey } from "@/lib/calendar/grid";
import { getHeroWorkspace, listHeroServices } from "@/lib/hero-work/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heroWork.meta");
  return { title: t("finance") };
}

// Financeiro do herói (0094): "Serviços e ganhos" do herói independente — quanto vai receber de cada serviço. Herói
// com agência: os ganhos (só o cachê do creator) moram no escritório. Só o titular vê (e escreve); a equipe não vê
// o que o titular recebe. Registro e controle simulados: nada aqui movimenta dinheiro.
export default async function HeroFinancePage() {
  const ws = await getHeroWorkspace();
  if (ws.hasAgency) redirect("/creator/escritorio/ganhos");
  const t = await getTranslations("heroWork.finance");
  if (!ws.canSeeFinance) {
    return (
      <div className="flex flex-col gap-5" data-testid="hero-finance-locked">
        <PageHeader eyebrow={ws.hero.name} title={t("title")} />
        <HeroWorkTabs current="finance" showFinance={false} />
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Lock />} title={t("ownerOnly")} description={t("ownerOnlyHint")} />
        </div>
      </div>
    );
  }
  const services = await listHeroServices(ws.hero.id);
  if (!services.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState title={t("unavailable")} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-testid="hero-finance-page">
      <PageHeader eyebrow={ws.hero.name} title={t("title")} description={t("intro")} />
      <HeroWorkTabs current="finance" showFinance />
      {ws.hero.status === "suspended" ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="hero-suspended">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t("suspended")}
        </p>
      ) : null}
      <HeroFinance creatorId={ws.hero.id} services={services.items} today={zonedDayKey(new Date(), defaultTimeZone)} canWrite={ws.canWriteFinance} />
    </div>
  );
}
