import { MessageSquareHeart } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/i18n/format";
import type { FeedbackIndicator } from "@/lib/project-room/queries";
import { npsScore } from "@/lib/project-room/vocab";

// Satisfação dos clientes no painel da agência (0110, D10; gestor+): nota média, NPS e as últimas respostas.
export async function FeedbackIndicatorCard({ data }: { data: FeedbackIndicator }) {
  const [t, locale] = await Promise.all([getTranslations("projectRoom.indicator"), getLocale() as Promise<Locale>]);
  const nps = npsScore(data.promoters, data.passives, data.detractors);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="feedback-indicator">
      <header className="flex items-center gap-2">
        <MessageSquareHeart className="size-5 text-accent-text" aria-hidden="true" />
        <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
      </header>
      {data.answered === 0 ? (
        <p className="type-body-sm text-fg-muted">{data.pending > 0 ? t("onlyPending", { n: data.pending }) : t("empty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center rounded-xl border border-border p-2 text-center">
              <span className="text-lg font-bold text-fg">{data.avg !== null ? formatNumber(data.avg, locale, { maximumFractionDigits: 1 }) : "—"}</span>
              <span className="type-caption text-fg-muted">{t("avg")}</span>
            </div>
            <div className="flex flex-col items-center rounded-xl border border-border p-2 text-center">
              <span className="text-lg font-bold text-fg">{nps !== null ? nps : "—"}</span>
              <span className="type-caption text-fg-muted">{t("nps")}</span>
            </div>
            <div className="flex flex-col items-center rounded-xl border border-border p-2 text-center">
              <span className="text-lg font-bold text-fg">{data.answered}</span>
              <span className="type-caption text-fg-muted">{t("answers", { days: data.days })}</span>
            </div>
          </div>
          <p className="type-caption text-fg-muted">{t("split", { promoters: data.promoters, passives: data.passives, detractors: data.detractors, pending: data.pending })}</p>
          <ul className="flex flex-col divide-y divide-border">
            {data.recent.map((r, i) => (
              <li key={`${r.dealId}:${i}`} className="flex items-start gap-2 py-2">
                <Badge size="sm" variant={r.score >= 9 ? "success" : r.score >= 7 ? "warning" : "danger"}>
                  {r.score}
                </Badge>
                <span className="flex min-w-0 flex-col">
                  <Link href={`/agencia/negocios/${r.dealId}/clipping`} className="truncate text-sm font-medium text-fg underline-offset-2 hover:underline">
                    {r.deal}
                  </Link>
                  <span className="type-caption text-fg-muted">
                    {t(`parties.${r.party}`)} · {t(`moments.${r.moment}`)} · {formatDate(r.answeredAt, locale)}
                  </span>
                  {r.comment ? <span className="type-caption text-fg">“{r.comment}”</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
