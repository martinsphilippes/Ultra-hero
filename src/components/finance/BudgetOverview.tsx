import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { budgetNeedsAttention, budgetTone, type BudgetOverview as Overview, type BudgetTone } from "@/lib/finance/budget";

const TONE_VARIANT: Record<BudgetTone, BadgeVariant> = { none: "neutral", ok: "success", near: "warning", over: "danger" };

// Visão geral da verba na página inicial da marca (0082): totais e cada campanha enviada com verba ou
// contratação, as estouradas primeiro (a ordem vem do banco). Linhas inteiras levam ao painel da campanha.
export async function BudgetOverview({ overview, locale }: { overview: Overview; locale: Locale }) {
  const t = await getTranslations("brandPortal.budget");
  const money = (c: number | null) => (c === null ? "—" : formatCents(c, locale));
  return (
    <section aria-labelledby="brand-budget" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="brand-budget">
      <div className="flex flex-col gap-0.5">
        <h2 id="brand-budget" className="text-sm font-semibold text-fg">
          {t("overviewTitle")}
        </h2>
        <p className="type-caption text-fg-muted">{t("overviewHint")}</p>
      </div>
      {overview.items.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("overviewEmpty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              [t("reserved"), overview.reservedCents],
              [t("committed"), overview.committedCents],
              [t("paid"), overview.paidCents],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex min-h-14 min-w-0 flex-row items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 sm:flex-col sm:items-start sm:justify-center sm:gap-0">
                <span className="type-caption text-fg-muted">{label}</span>
                <span className="min-w-0 font-mono text-sm font-semibold text-fg [overflow-wrap:anywhere]">{money(Number(value))}</span>
              </div>
            ))}
          </div>
          {overview.overCount > 0 ? <p className="type-caption font-medium text-danger">{t("overCount", { count: overview.overCount })}</p> : null}
          <ul className="-mx-1 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {overview.items.map((b) => {
              const tone = budgetTone(b.reservedCents, b.committedCents);
              return (
                <li key={b.requestId}>
                  <Link
                    href={`/marca/campanhas/${b.requestId}#camp-budget`}
                    className="flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-hover"
                    data-testid="brand-budget-item"
                    data-attention={budgetNeedsAttention(b) ? "true" : undefined}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-fg">{b.title || t("seeCampaign")}</span>
                      <span className="type-caption text-fg-muted">
                        {money(b.committedCents)} / {money(b.reservedCents)}
                        {b.paidCents > 0 ? ` · ${t("paid")} ${money(b.paidCents)}` : ""}
                      </span>
                      {b.talentsOver > 0 ? <span className="type-caption text-danger">{t("talentsOver", { count: b.talentsOver })}</span> : null}
                    </span>
                    <Badge size="sm" variant={TONE_VARIANT[tone]}>
                      {t(`tone.${tone}`)}
                    </Badge>
                    <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
