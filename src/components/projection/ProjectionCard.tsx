import { ArrowRight, TrendingUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { bucketTotal } from "@/lib/projection/campaign";
import { loadCampaignProjection } from "@/lib/projection/queries";

// Resumo da projeção de campanhas (0139) no Início da agência: "no seu segmento" e "para você" no ano atual, com o
// atalho para a aba Projeção do Financeiro (onde ficam o filtro de período, as partes e o ranking por segmento).
export async function ProjectionCard({ agencyId, year, href }: { agencyId: string; year: number; href: string }) {
  const [t, locale, data] = await Promise.all([getTranslations("projection"), getLocale(), loadCampaignProjection(agencyId, year)]);
  if (!data) return null;
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="projection-title" data-testid="projection">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <h2 id="projection-title" className="type-h3 text-fg">
          {t("home.title", { period: String(year) })}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
          <p className="type-caption text-fg-muted">{t("segment.title")}</p>
          <p className="text-xl font-bold tabular-nums text-fg">{money(bucketTotal(data.segment))}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-3">
          <p className="type-caption text-fg-muted">{t("mine.title")}</p>
          <p className="text-xl font-bold tabular-nums text-fg">{money(bucketTotal(data.mine))}</p>
        </div>
      </div>
      <Link href={href} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
        {t("home.open")}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
