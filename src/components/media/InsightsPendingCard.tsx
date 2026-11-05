import { BarChart3 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { insightMark, isInsightLate } from "@/lib/media/insights";
import type { InsightItem } from "@/lib/roadmap/phase3-queries";

// Insights do publipost (0111, D1): o que falta enviar 24 h e 7 dias depois da publicação (print + números nas
// métricas da entrega, 0083). Agência: pendentes e atrasados por negócio; Hero: os dele, com o link da oportunidade.
export async function InsightsPendingCard({ items, side }: { items: InsightItem[]; side: "agency" | "talent" }) {
  if (items.length === 0) return null;
  const [t, tk, locale] = await Promise.all([getTranslations("media.insights"), getTranslations("commercial.deliverableKinds"), getLocale() as Promise<Locale>]);
  const late = items.filter((x) => isInsightLate(x.state)).length;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby={`insights-${side}`} data-testid={`insights-${side}`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`insights-${side}`} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <BarChart3 className="size-4 text-accent-text" aria-hidden="true" />
          {side === "agency" ? t("agencyTitle") : t("heroTitle")}
          {late > 0 ? (
            <Badge size="sm" variant="danger">
              {t("lateCount", { count: late })}
            </Badge>
          ) : null}
        </h2>
        <p className="type-caption text-fg-muted">{side === "agency" ? t("agencyHint") : t("heroHint")}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((x) => {
          const mark = insightMark(x.state) ?? "24h";
          const href = side === "agency" ? `/agencia/negocios/${x.dealId}/entregas` : `/heroi/oportunidades/${x.dealTalentId ?? ""}`;
          const label = x.title || (tk.has(x.kind) ? tk(x.kind) : x.kind);
          return (
            <li key={x.deliverableId}>
              <Link href={href} className="flex min-h-11 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="insight-item">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-fg">{label}</span>
                  <span className="type-caption text-fg-muted">
                    {side === "agency" ? `${x.talent} · ${x.dealTitle}` : x.dealTitle}
                    {` · ${t("publishedOn", { date: formatDate(x.publishedAt, locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}`}
                    {x.hasPrint ? ` · ${t("hasPrint")}` : ""}
                  </span>
                </span>
                <Badge size="sm" variant={isInsightLate(x.state) ? "danger" : "warning"}>
                  {t(`marks.${mark}`)} · {isInsightLate(x.state) ? t("late") : t("due")}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
