import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatDuration, formatPlainDate } from "@/i18n/format";
import { CompensationView } from "@/components/compensation/CompensationView";
import { isMoneyOnly, type Compensation } from "@/lib/compensation/model";
import type { RequestRow } from "@/lib/deals/queries";
import { ValueTermsView } from "@/components/value-model/ValueTermsView";
import type { ValueModel } from "@/lib/value-model/model";

type Props = {
  request: RequestRow;
  /** 0140: `compensation` = forma de pagamento (valor, permuta e/ou performance); sem ela, só valor. */
  budget: { min: number | null; max: number | null; note: string; valueModel?: ValueModel; maxHeroes?: number | null; compensation?: Compensation } | null;
  showHeader?: boolean;
};

// Resumo do briefing/proposta da marca, igual nos três lugares que o mostram (agência, marca e, em
// parte, o Hero). O valor oferecido só aparece quando a página recebeu a linha (marca dona ou Adm).
export function RequestSummary({ request, budget }: Props) {
  const t = useTranslations("commercial.request");
  const tc = useTranslations("commercial");
  const tn = useTranslations("mediaKit.networks");
  const tcomp = useTranslations("compensation");
  const locale = useLocale() as Locale;
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex flex-col">
        <dt className="type-caption text-fg-muted">{label}</dt>
        <dd className="text-sm text-fg">{value}</dd>
      </div>
    ) : null;
  const period = request.periodStart ? `${formatPlainDate(request.periodStart, locale)}${request.periodEnd && request.periodEnd !== request.periodStart ? ` – ${formatPlainDate(request.periodEnd, locale)}` : ""}` : null;
  const comp = budget?.compensation ?? null;
  const money = comp?.money ?? true;
  const extra = comp !== null && !isMoneyOnly(comp);

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
      {budget ? (
        <div className="flex flex-col" data-testid="request-budget">
          <dt className="type-caption text-fg-muted">{extra ? tcomp("label") : t("budget")}</dt>
          <dd className="flex flex-col gap-1 text-sm text-fg">
            {/* 0140: sem "Valor" não há dinheiro: nada de "não informado", e sim a permuta/performance (com a observação) */}
            {money ? budget.max !== null ? <ValueTermsView model={budget.valueModel ?? "fixo"} amountCents={budget.max} maxHeroes={budget.maxHeroes ?? null} /> : <span>{t("budgetNotInformed")}</span> : null}
            {extra ? <CompensationView compensation={comp} /> : null}
            {budget.note && (!money || budget.max !== null) ? <span className="type-caption text-fg-muted">{budget.note}</span> : null}
          </dd>
        </div>
      ) : null}
      {request.notes ? (
        <div className="flex flex-col sm:col-span-2">
          <dt className="type-caption text-fg-muted">{t("notes")}</dt>
          <dd className="whitespace-pre-wrap text-sm text-fg">{request.notes}</dd>
        </div>
      ) : null}
    </dl>
  );
}
