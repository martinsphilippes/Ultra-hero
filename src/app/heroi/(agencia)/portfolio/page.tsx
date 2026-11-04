import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KitStatsView, PortfolioList } from "@/components/talent/KitAutoSections";
import { getKit, getKitInsights } from "@/lib/talent/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mediaKit.auto");
  return { title: t("portfolio") };
}

// Portfólio do influenciador (0084): campanhas feitas, marca e entregas publicadas com link e métricas, mais os
// números do kit calculados na hora. Tudo vem do trabalho já registrado no app — nada para digitar de novo.
// No link público do media kit, o portfólio só aparece se o campo "Portfólio" estiver ligado.
export default async function OfficePortfolioPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const [t, insights, kit] = await Promise.all([getTranslations("mediaKit.auto"), getKitInsights(ctx.talent.id), getKit(ctx.talent.id)]);
  const shown = kit.visibleFields.includes("portfolio");
  return (
    <div className="flex flex-col gap-5" data-testid="office-portfolio">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg">{t("portfolio")}</h2>
        <p className="type-body-sm text-fg-muted">{t("portfolioHint")}</p>
      </div>
      {!insights.available ? <p className="rounded-xl border border-dashed border-border-strong px-3 py-2 type-body-sm text-fg-muted">{t("unavailable")}</p> : null}
      {insights.stats ? <KitStatsView stats={insights.stats} /> : null}
      <PortfolioList items={insights.portfolio} />
      <p className="rounded-xl border border-border bg-surface px-3 py-3 type-body-sm text-fg-muted">
        {shown ? t("inKit") : t("notInKit")}{" "}
        <Link href="/heroi/media-kit" className="inline-flex min-h-11 items-center font-medium text-accent-text underline-offset-2 hover:underline">
          {t("openKit")}
        </Link>
      </p>
    </div>
  );
}
