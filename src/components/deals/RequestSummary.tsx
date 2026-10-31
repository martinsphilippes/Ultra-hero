import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatDuration, formatPlainDate } from "@/i18n/format";
import type { RequestRow } from "@/lib/deals/queries";
import { formatCents } from "@/lib/deals/schemas";

type Props = { request: RequestRow; budget: { min: number | null; max: number | null; note: string } | null; showHeader?: boolean };

// Resumo do briefing/proposta da marca, igual nos três lugares que o mostram (agência, marca e, em
// parte, o creator). O valor oferecido só aparece quando a página recebeu a linha (marca dona ou Adm).
export function RequestSummary({ request, budget }: Props) {
  const t = useTranslations("commercial.request");
  const tc = useTranslations("commercial");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex flex-col">
        <dt className="type-caption text-fg-muted">{label}</dt>
        <dd className="text-sm text-fg">{value}</dd>
      </div>
    ) : null;
  const period = request.periodStart ? `${formatPlainDate(request.periodStart, locale)}${request.periodEnd && request.periodEnd !== request.periodStart ? ` – ${formatPlainDate(request.periodEnd, locale)}` : ""}` : null;

  return (
    <dl className="grid gap-3 sm:grid-cols-2" data-testid="request-summary">
      {row(t("objective"), request.objective ? tc(`objectives.${request.objective}`) : null)}
      {row(t("product"), request.product)}
      {row(t("period"), period)}
      {row(t("desiredAt"), request.desiredAt ? formatDateTime(request.desiredAt, locale) : null)}
      {row(t("duration"), request.durationMinutes ? formatDuration(request.durationMinutes) : null)}
      {row(t("format"), request.format ? tc(`formats.${request.format}`) : null)}
      {row(t("location"), request.location)}
      {row(t("networks"), request.networks.length > 0 ? request.networks.map((n) => tn(n)).join(", ") : null)}
      {row(t("deliverables"), request.deliverables.length > 0 ? request.deliverables.map((d) => `${d.quantity}× ${tc(`deliverableKinds.${d.kind}`)}${d.network ? ` (${tn(d.network)})` : ""}`).join(", ") : null)}
      {row(t("audience"), request.targetAudience)}
      {row(t("ageBands"), request.targetAgeBands.length > 0 ? request.targetAgeBands.join(", ") : null)}
      {row(t("states"), [request.targetStates.join(", "), request.regionNote].filter(Boolean).join(" · ") || null)}
      {budget ? row(t("budget"), budget.max !== null ? `${formatCents(budget.max, locale)}${budget.note ? ` · ${budget.note}` : ""}` : t("budgetNotInformed")) : null}
      {request.notes ? (
        <div className="flex flex-col sm:col-span-2">
          <dt className="type-caption text-fg-muted">{t("notes")}</dt>
          <dd className="whitespace-pre-wrap text-sm text-fg">{request.notes}</dd>
        </div>
      ) : null}
    </dl>
  );
}
