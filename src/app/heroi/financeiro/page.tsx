import type { Metadata } from "next";
import { Clock, Lock, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HeroFinance } from "@/components/hero-work/HeroFinance";
import { EmptyState, PageHeader } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import { zonedDayKey } from "@/lib/calendar/grid";
import { heroPortalSections } from "@/lib/hero-work/rules";
import { findHeroWorkspace, listHeroServices } from "@/lib/hero-work/server";
import { getTalentContext } from "@/lib/talent/server";
import { AgencyEarnings } from "./AgencyEarnings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heroWork.meta");
  return { title: t("finance") };
}

// Financeiro do Portal do Herói (0094 + 0097), uma tela só. Com agência: os ganhos com a agência (só o cachê do herói,
// nunca o valor da marca nem a comissão) e, se houver, os serviços próprios. Sem agência: "Serviços e ganhos" do herói
// independente. Os serviços próprios só o titular vê (e escreve); a equipe não vê o que o titular recebe (nem os ganhos
// da agência: o casting é do titular). Registro e controle simulados: nada aqui movimenta dinheiro.
export default async function HeroFinancePage() {
  const [t, talent, ws] = await Promise.all([getTranslations("heroWork.finance"), getTalentContext(), findHeroWorkspace()]);
  const casting = talent.state === "ok";
  // membro da equipe (0091/0094): vê o casting do titular, mas não o que o titular recebe (o banco também não devolve)
  const agencyFinance = casting && !talent.talent.isTeamMember;
  const services = ws?.canSeeFinance ? await listHeroServices(ws.hero.id) : null;
  const show = heroPortalSections({ casting: agencyFinance, hasHero: ws !== null, heroHasAgency: ws?.hasAgency ?? false, ownCount: services?.items.length ?? 0 });
  const eyebrow = casting ? talent.talent.displayName : (ws?.hero.name ?? undefined);

  if (casting && !agencyFinance && !show.own) {
    return (
      <div className="flex flex-col gap-5" data-testid="hero-finance-locked">
        <PageHeader eyebrow={eyebrow} title={t("title")} />
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Lock />} title={t("ownerOnly")} description={t("ownerOnlyHint")} />
        </div>
      </div>
    );
  }

  if (!show.agency && !show.own) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid="office-none">
          <EmptyState icon={<Wallet />} title={t("unavailable")} />
        </div>
      </div>
    );
  }

  // membro da equipe sem agência: o financeiro é do titular
  if (!show.agency && ws && !ws.canSeeFinance) {
    return (
      <div className="flex flex-col gap-5" data-testid="hero-finance-locked">
        <PageHeader eyebrow={eyebrow} title={t("title")} />
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Lock />} title={t("ownerOnly")} description={t("ownerOnlyHint")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="hero-finance-portal">
      <PageHeader eyebrow={eyebrow} title={t("title")} description={show.agency ? undefined : t("intro")} />
      {show.agency ? <AgencyEarnings /> : null}
      {show.own && ws && services && ws.canSeeFinance ? (
        <section className="flex flex-col gap-4" aria-labelledby="hero-own-finance" data-testid="hero-finance-page">
          {show.agency ? (
            <div className="flex flex-col gap-1">
              <h2 id="hero-own-finance" className="text-base font-semibold text-fg">
                {t("ownTitle", { name: ws.hero.name })}
              </h2>
              <p className="type-body-sm text-fg-muted">{t("intro")}</p>
            </div>
          ) : (
            <h2 id="hero-own-finance" className="sr-only">
              {t("ownTitle", { name: ws.hero.name })}
            </h2>
          )}
          {!services.available ? (
            <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
              <EmptyState title={t("unavailable")} />
            </div>
          ) : (
            <>
              {ws.hero.status === "suspended" ? (
                <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="hero-suspended">
                  <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  {t("suspended")}
                </p>
              ) : null}
              <HeroFinance creatorId={ws.hero.id} services={services.items} today={zonedDayKey(new Date(), defaultTimeZone)} canWrite={ws.canWriteFinance} />
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
