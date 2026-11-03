import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate, formatRelativeTime } from "@/i18n/format";
import { countByKind, type TodayItem, type Urgency } from "@/lib/today/logic";

// "Hoje" (0078): lista única, já ordenada por urgência, com contagem por tipo e link direto para a ação.
// Serve à marca ("Depende de mim hoje") e ao creator ("Hoje"). Mobile first: linhas inteiras clicáveis.

const URGENCY_VARIANT: Record<Urgency, BadgeVariant> = { overdue: "danger", today: "warning", soon: "info", waiting: "neutral" };
const URGENCY_ICON = { overdue: AlertTriangle, today: Clock, soon: CalendarClock, waiting: Clock } as const;
const VISIBLE = 6;

type Props<K extends string> = {
  portal: "brand" | "talent";
  items: TodayItem<K>[];
  kinds: readonly K[];
  locale: Locale;
  timezone: string;
  now: Date;
};

export async function TodayPanel<K extends string>({ portal, items, kinds, locale, timezone, now }: Props<K>) {
  const [t, tc] = await Promise.all([getTranslations("today"), getTranslations("commercial")]);
  const counts = countByKind(items, kinds);
  const urgent = items.filter((i) => i.urgency === "overdue" || i.urgency === "today").length;

  const deadlineText = (i: TodayItem<K>) => {
    if (i.deadline) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(i.deadline) ? formatPlainDate(i.deadline, locale) : formatDateTime(i.deadline, locale, timezone);
      if (i.kind === "payment") return t("payOn", { date });
      if (i.kind === "invoice") return t("payDue", { date });
      return i.kind === "offer" || i.kind === "sponsorship" ? t("respondBy", { date }) : t("deadline", { date });
    }
    if (i.since) return t("waitingSince", { ago: formatRelativeTime(i.since, locale, now) });
    return null;
  };
  const extra = (i: TodayItem<K>) => {
    if (i.kind === "terms" && i.status === "owner_only") return t("brand.termsOwnerOnly");
    // 0081: aprovação interna e pré-seleção dizem o que a pessoa faz agora
    if (i.kind === "internalApproval") return t(i.status === "returned" ? "brand.internalReturned" : "brand.internalPending");
    if (i.kind === "shortlist") return t(i.status === "decided" ? "brand.shortlistDecided" : "brand.shortlistSent");
    // 0082: verba estourada (marca) e nota fiscal (creator)
    if (i.kind === "budget") return t(i.status === "over" ? "brand.budgetOver" : "brand.budgetTalentsOver");
    // 0085: oportunidade de patrocínio esperando a resposta da marca
    if (i.kind === "sponsorship") return t("brand.sponsorshipHint");
    if (i.kind === "invoice") return t(i.status === "rejected" ? "talent.invoiceRejected" : "talent.invoiceMissing");
    if (i.kind === "payment") return t("talent.paymentScheduled");
    if (i.status === "approved") return t("approvedToPublish");
    if (i.kind === "offer" && (i.status === "counter_open" || i.status === "counter_accepted" || i.status === "counter_rejected")) return t(`talent.${i.status}`);
    return null;
  };
  const title = (i: TodayItem<K>) => (i.kind === "task" && i.step !== null ? tc(`taskSteps.${i.step}`) : i.title) || t("untitled");

  const row = (i: TodayItem<K>) => {
    const Icon = URGENCY_ICON[i.urgency];
    const when = deadlineText(i);
    const hint = extra(i);
    return (
      <li key={i.key}>
        <Link
          href={i.href}
          className="flex min-h-14 items-start gap-3 px-3 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-4"
          data-testid={`today-item-${i.kind}`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge size="sm" variant={URGENCY_VARIANT[i.urgency]} icon={<Icon aria-hidden="true" />}>
                {t(`urgency.${i.urgency}`)}
              </Badge>
              <span className="type-caption font-medium text-fg-muted">{t(`${portal}.kinds.${String(i.kind)}` as string)}</span>
            </span>
            <span className="text-sm font-semibold text-fg">{title(i)}</span>
            {i.context ? <span className="type-caption text-fg-muted">{i.context}</span> : null}
            {i.note ? <span className="line-clamp-2 type-caption text-fg">“{i.note}”</span> : null}
            {when || hint ? <span className="type-caption text-fg-muted">{[when, hint].filter(Boolean).join(" · ")}</span> : null}
          </span>
          <ArrowRight className="mt-1 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        </Link>
      </li>
    );
  };

  return (
    <section aria-labelledby={`today-${portal}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid={`today-${portal}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={`today-${portal}`} className="text-base font-semibold text-fg">
            {t(`${portal}.title`)}
          </h2>
          <p className="type-caption text-fg-muted">{t(`${portal}.hint`)}</p>
        </div>
        <Badge size="md" variant={urgent > 0 ? "danger" : items.length > 0 ? "accent" : "success"} data-testid="today-count">
          {t("count", { count: items.length })}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 type-body-sm text-fg-muted">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          {t(`${portal}.empty`)}
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label={t("byKind")}>
            {kinds
              .filter((k) => counts[k] > 0)
              .map((k) => (
                <li key={k}>
                  <Badge size="md" variant="neutral">
                    {t(`${portal}.kindsShort.${String(k)}` as string)} · {counts[k]}
                  </Badge>
                </li>
              ))}
          </ul>
          <ul className="-mx-1 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">{items.slice(0, VISIBLE).map(row)}</ul>
          {items.length > VISIBLE ? (
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
                {t("more", { count: items.length - VISIBLE })}
              </summary>
              <ul className="-mx-1 mt-2 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">{items.slice(VISIBLE).map(row)}</ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
