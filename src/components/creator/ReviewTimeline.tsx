import { MessageSquareText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/admin";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";

export type ReviewRow = {
  id: string;
  round: number;
  decision: Enums<"review_status">;
  feedback: string | null;
  submitted_at: string;
  decided_at: string | null;
  content?: { id: string; title: string } | null;
};

type Props = { reviews: ReviewRow[]; showContent?: boolean; compact?: boolean };

// Linha do tempo das rodadas de revisão (envio → decisão + feedback do admin).
export async function ReviewTimeline({ reviews, showContent = false, compact = false }: Props) {
  const [t, ts, locale] = await Promise.all([getTranslations("creator.reviews"), getTranslations("adminCommon.status"), getLocale()]);
  const uiLocale = locale as Locale;
  if (reviews.length === 0) {
    return <EmptyState size="sm" icon={<MessageSquareText />} title={t("empty")} description={t("emptyDescription")} />;
  }
  return (
    <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
      {reviews.map((r) => (
        <li key={r.id} className={compact ? "flex flex-col gap-1.5 px-4 py-3" : "flex flex-col gap-2 px-4 py-4"}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.decision} label={ts(r.decision)} />
            <span className="text-sm font-semibold text-fg">{t("round", { n: r.round })}</span>
            {showContent && r.content && (
              <Link href={`/creator/content/${r.content.id}/edit`} className="truncate text-sm text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {r.content.title}
              </Link>
            )}
          </div>
          <p className="type-caption text-fg-muted">
            {t("submittedAt", { date: formatDateTime(r.submitted_at, uiLocale) })}
            {r.decided_at ? ` · ${t("decidedAt", { date: formatDateTime(r.decided_at, uiLocale) })}` : ` · ${t("awaiting")}`}
          </p>
          {r.feedback ? (
            <blockquote className="rounded-lg border-l-4 border-accent/50 bg-surface-elevated px-3 py-2 text-sm text-fg">
              <span className="sr-only">{t("feedback")}: </span>
              {r.feedback}
            </blockquote>
          ) : r.decided_at ? (
            <p className="type-caption text-fg-subtle">{t("noFeedback")}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
