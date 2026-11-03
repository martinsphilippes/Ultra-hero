"use client";

import { useLocale, useTranslations } from "next-intl";
import { DeliverablesText } from "@/components/brand-call/shared";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import type { BudgetChange, ChangePlan, ChangeStatus } from "@/lib/finance/budget-change";

// Peças do pedido de alteração de verba (0090) que servem à marca e à agência: selo da situação, plano de
// realinhamento em texto e a linha do tempo (quem, quando, o quê). Valores só quando quem lê pode ver.

const VARIANT: Record<ChangeStatus, BadgeVariant> = {
  pending_owner: "warning",
  open: "info",
  proposed: "accent",
  confirmed: "success",
  agency_declined: "danger",
  brand_declined: "danger",
  returned: "neutral",
  withdrawn: "neutral",
};

export function ChangeStatusBadge({ status }: { status: ChangeStatus }) {
  const t = useTranslations("payments.change.status");
  return (
    <Badge size="sm" variant={VARIANT[status]} data-testid="change-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}

export function PlanView({ plan }: { plan: ChangePlan }) {
  const t = useTranslations("payments.change.plan");
  const locale = useLocale() as Locale;
  const changed = plan.creators.filter((c) => c.action !== "keep" || c.note);
  const period = plan.periodStart || plan.periodEnd;
  const empty = changed.length === 0 && !plan.deliverables && !period && !plan.scheduleNote && plan.perks.length === 0 && !plan.note;
  if (empty) return <p className="type-body-sm text-fg-muted">{t("empty")}</p>;
  return (
    <dl className="flex flex-col gap-2 text-sm" data-testid="change-plan">
      {changed.length > 0 ? (
        <div>
          <dt className="type-caption text-fg-muted">{t("creators")}</dt>
          <dd>
            <ul className="flex flex-col gap-0.5">
              {changed.map((c, i) => (
                <li key={`${c.dealTalentId ?? "new"}-${i}`} className="text-fg">
                  <span className="font-medium">{t(`actions.${c.action}`)}:</span> {c.name}
                  {c.note ? <span className="text-fg-muted"> — {c.note}</span> : null}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ) : null}
      {plan.deliverables ? (
        <div>
          <dt className="type-caption text-fg-muted">{t("deliverables")}</dt>
          <dd>
            <DeliverablesText items={plan.deliverables} />
          </dd>
        </div>
      ) : null}
      {period ? (
        <div>
          <dt className="type-caption text-fg-muted">{t("period")}</dt>
          <dd className="text-fg">
            {plan.periodStart ? formatPlainDate(plan.periodStart, locale) : "…"} – {plan.periodEnd ? formatPlainDate(plan.periodEnd, locale) : "…"}
          </dd>
        </div>
      ) : null}
      {plan.scheduleNote ? (
        <div>
          <dt className="type-caption text-fg-muted">{t("schedule")}</dt>
          <dd className="whitespace-pre-line text-fg">{plan.scheduleNote}</dd>
        </div>
      ) : null}
      {plan.perks.length > 0 ? (
        <div>
          <dt className="type-caption text-fg-muted">{t("perks")}</dt>
          <dd>
            <ul className="list-inside list-disc text-fg">
              {plan.perks.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </dd>
        </div>
      ) : null}
      {plan.note ? (
        <div>
          <dt className="type-caption text-fg-muted">{t("note")}</dt>
          <dd className="whitespace-pre-line text-fg">{plan.note}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Valores do pedido: atual, pedido, contraproposta e o que passou a valer. */
export function ChangeValues({ change, showReserved }: { change: BudgetChange; showReserved: boolean }) {
  const t = useTranslations("payments.change");
  const locale = useLocale() as Locale;
  const v = change.values;
  if (!v) return null;
  const before = showReserved ? (v.beforeReservedCents ?? v.beforeOfferedCents) : v.beforeOfferedCents;
  const tile = (label: string, value: number | null, strong = false) => (
    <div className="flex min-h-14 flex-col justify-center rounded-xl border border-border px-3 py-2">
      <span className="type-caption text-fg-muted">{label}</span>
      <span className={`font-mono text-sm font-semibold ${strong ? "text-accent-text" : "text-fg"}`}>{value === null ? "—" : formatCents(value, locale)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {tile(t("before"), before)}
        {tile(t("requested"), v.requestedCents, v.counterCents === null && v.finalCents === null)}
        {v.counterCents !== null ? tile(t("counter"), v.counterCents, v.finalCents === null) : null}
        {v.finalCents !== null ? tile(t("final"), v.finalCents, true) : null}
      </div>
      {v.talents.length > 0 ? (
        <p className="type-caption text-fg-muted">
          {t("talentsLine")} {v.talents.map((x) => `${x.name}: ${formatCents(x.cents, locale)}`).join(" · ")}
        </p>
      ) : null}
      <p className="whitespace-pre-line rounded-xl bg-surface-elevated px-3 py-2 type-body-sm text-fg">
        <span className="type-caption block text-fg-muted">{t("reasonLabel")}</span>
        {v.reason}
      </p>
    </div>
  );
}

export function ChangeTimeline({ change }: { change: BudgetChange }) {
  const t = useTranslations("payments.change");
  const locale = useLocale() as Locale;
  if (change.events.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5 border-l border-border pl-3" data-testid="change-timeline">
      {change.events.map((e, i) => (
        <li key={`${e.action}-${i}`} className="flex flex-col">
          <span className="text-sm text-fg">
            {t(`events.${e.action}`, { side: e.side })}
            {e.label ? <span className="text-fg-muted"> · {e.label}</span> : null}
          </span>
          <span className="type-caption text-fg-muted">{e.at ? formatDateTime(e.at, locale) : ""}</span>
          {e.note ? <span className="whitespace-pre-line type-body-sm text-fg-muted">“{e.note}”</span> : null}
        </li>
      ))}
    </ol>
  );
}
