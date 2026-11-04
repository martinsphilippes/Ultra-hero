"use client";

import { CalendarClock, Save, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Badge, Button, DatePicker, FormField, Input, MoneyInput, QuantityInput, SegmentedControl, Select, Switch, Textarea, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import {
  DUE_RULES,
  draftToPlan,
  manualDates,
  MAX_PLAN_INSTALLMENTS,
  MAX_RULE_DAYS,
  MIN_INSTALLMENTS,
  PAY_METHODS,
  PAYOUT_RULES,
  payoutDue,
  planCommission,
  planParts,
  planToDraft,
  type DueRule,
  type PaymentPlan,
  type PaymentPlanView,
  type PlanDraft,
  type PlanEvents,
  type PlanStatus,
} from "@/lib/finance/payment-plan";
import { savePaymentPlanAction } from "@/lib/finance/plan-actions";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";

// Condições de pagamento (0108): o Adm define o valor ACORDADO e como/quando a marca paga e o herói recebe; a
// prévia (parcelas, repasse, comissão) é a mesma conta do banco (payment-plan.ts). Gestor/equipe, marca e herói veem
// o resumo do que lhes cabe (o banco já corta os valores de quem não pode). Registro simulado: nada é cobrado.

const STATUS_VARIANT: Record<PlanStatus, BadgeVariant> = { none: "warning", saved: "info", forecast: "info", effective: "success" };

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const t = useTranslations("payments.plan.status");
  return (
    <Badge size="sm" variant={STATUS_VARIANT[status]} data-testid="plan-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}

function useRuleText() {
  const t = useTranslations("payments.plan");
  const locale = useLocale() as Locale;
  return (rule: DueRule | null, days: number | null, on: string | null) => {
    if (rule === "date") return on ? t("ruleText.date", { date: formatPlainDate(on, locale) }) : "—";
    if (!rule) return "—";
    return t(`ruleText.${rule}`, { days: days ?? 0 });
  };
}

/** Texto curto de quando o herói recebe. */
function usePayoutText() {
  const t = useTranslations("payments.plan");
  const locale = useLocale() as Locale;
  return (plan: Pick<PaymentPlan, "payoutRule" | "payoutDays" | "payoutOn">) =>
    plan.payoutRule === "fixed_date"
      ? t("payoutText.fixed_date", { date: plan.payoutOn ? formatPlainDate(plan.payoutOn, locale) : "—" })
      : t(`payoutText.${plan.payoutRule}`, { days: plan.payoutDays });
}

// ---------------------------------------------------------------- campo de regra de data
function RuleField({
  label,
  rule,
  days,
  on,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  rule: DueRule;
  days: number;
  on: string;
  onChange: (patch: { rule?: DueRule; days?: number; on?: string }) => void;
  disabled: boolean;
  testId: string;
}) {
  const t = useTranslations("payments.plan");
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid={testId}>
      <FormField label={label}>
        <Select value={rule} onChange={(e) => onChange({ rule: e.target.value as DueRule })} disabled={disabled}>
          {DUE_RULES.map((r) => (
            <option key={r} value={r}>
              {t(`rules.${r}`)}
            </option>
          ))}
        </Select>
      </FormField>
      {rule === "date" ? (
        <FormField label={t("dueOn")}>
          <DatePicker value={on} onChange={(v) => onChange({ on: v })} disabled={disabled} />
        </FormField>
      ) : (
        <FormField label={t("plusDays")} hint={t("plusDaysHint")}>
          <QuantityInput min={0} max={MAX_RULE_DAYS} value={days} onValueChange={(n) => onChange({ days: n })} disabled={disabled} />
        </FormField>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- prévia (parcelas e repasse)
function PartsList({ parts, structure, locale }: { parts: { seq: number; amountCents: number | null; dueOn: string | null; status?: string | null }[]; structure: PaymentPlan["structure"] | null; locale: Locale }) {
  const t = useTranslations("payments.plan");
  return (
    <ol className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="plan-parts">
      {parts.map((p) => (
        <li key={p.seq} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="font-medium text-fg">
            {structure === "down_payment" ? (p.seq === 1 ? t("downPayment") : t("balance")) : parts.length === 1 ? t("single") : t("part", { n: p.seq, total: parts.length })}
          </span>
          <span className="type-caption text-fg-muted">{p.dueOn ? formatPlainDate(p.dueOn, locale) : t("noDate")}</span>
          {p.status === "paid" ? <Badge size="sm" variant="success">{t("paid")}</Badge> : null}
          {p.amountCents !== null ? <span className="ml-auto font-mono font-semibold text-fg">{formatCents(p.amountCents, locale)}</span> : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- resumo (todos os lados)
export function PaymentPlanSummary({ view }: { view: PaymentPlanView }) {
  const t = useTranslations("payments.plan");
  const locale = useLocale() as Locale;
  const ruleText = useRuleText();
  const payoutText = usePayoutText();
  const plan = view.plan;
  if (view.viewer === "talent") {
    const my = view.myPayout;
    return (
      <div className="flex flex-col gap-2 text-sm" data-testid="plan-summary-talent">
        {!plan ? (
          <p className="type-body-sm text-fg-muted">{t("talentNone")}</p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="type-caption text-fg-muted">{t("myPayout")}</dt>
              <dd className="font-mono font-semibold text-fg native:hidden">{my?.amountCents !== null && my?.amountCents !== undefined ? formatCents(my.amountCents, locale) : "—"}</dd>
            </div>
            <div>
              <dt className="type-caption text-fg-muted">{t("when")}</dt>
              <dd className="text-fg">
                {payoutText(plan)}
                {my?.dueOn ? ` · ${t("expectedOn", { date: formatPlainDate(my.dueOn, locale) })}` : ""}
              </dd>
            </div>
            <div>
              <dt className="type-caption text-fg-muted">{t("payoutMethodLabel")}</dt>
              <dd className="text-fg">{t(`payoutMethods.${plan.payoutMethod}`)}</dd>
            </div>
            <div>
              <dt className="type-caption text-fg-muted">{t("invoiceTalentLabel")}</dt>
              <dd className={plan.invoiceTalent ? "font-medium text-warning" : "text-fg"}>{plan.invoiceTalent ? t("invoiceRequired") : t("invoiceNotRequired")}</dd>
            </div>
          </dl>
        )}
        {my?.status === "forecast" ? <p className="type-caption text-fg-muted">{t("forecastBanner")}</p> : null}
      </div>
    );
  }
  if (!plan) return <p className="type-body-sm text-fg-muted" data-testid="plan-summary-none">{view.viewer === "brand" ? t("brandNone") : t("agencyNone")}</p>;
  const manual = plan.structure === "installments" && plan.interval === "manual";
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="plan-summary">
      <dl className="grid gap-2 sm:grid-cols-2">
        {view.totalCents !== null ? (
          <div>
            <dt className="type-caption text-fg-muted">{t("total")}</dt>
            <dd className="font-mono text-base font-semibold text-fg">{formatCents(view.totalCents, locale)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="type-caption text-fg-muted">{t("methodLabel")}</dt>
          <dd className="text-fg">
            {t(`method.${plan.method}`)}
            {plan.method === "other" && plan.methodNote ? ` (${plan.methodNote})` : ""}
          </dd>
        </div>
        <div>
          <dt className="type-caption text-fg-muted">{t("structureLabel")}</dt>
          <dd className="text-fg">
            {plan.structure === "down_payment"
              ? t("structureText.down_payment", { pct: plan.downPaymentPct ?? 0 })
              : plan.structure === "installments"
                ? t("structureText.installments", { n: plan.installments ?? 0, interval: t(`intervals.${plan.interval ?? "monthly"}`) })
                : t("structure.single")}
          </dd>
        </div>
        {!manual ? (
          <div>
            <dt className="type-caption text-fg-muted">{plan.structure === "down_payment" ? t("downPaymentDue") : t("firstDue")}</dt>
            <dd className="text-fg">{ruleText(plan.firstRule, plan.firstDays, plan.firstOn)}</dd>
          </div>
        ) : null}
        {plan.structure === "down_payment" ? (
          <div>
            <dt className="type-caption text-fg-muted">{t("balanceDue")}</dt>
            <dd className="text-fg">{ruleText(plan.balanceRule, plan.balanceDays, plan.balanceOn)}</dd>
          </div>
        ) : null}
        {view.viewer === "agency" ? (
          <div>
            <dt className="type-caption text-fg-muted">{t("payoutLabel")}</dt>
            <dd className="text-fg">
              {payoutText(plan)} · {t(`payoutMethods.${plan.payoutMethod}`)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="type-caption text-fg-muted">{t("invoiceLabel")}</dt>
          <dd className="text-fg">
            {[plan.invoiceAgency ? t("invoiceAgencyShort") : null, view.viewer === "agency" && plan.invoiceTalent ? t("invoiceTalentShort") : null].filter(Boolean).join(" · ") || t("invoiceNone")}
          </dd>
        </div>
      </dl>
      {view.parts.length > 0 ? <PartsList parts={view.parts} structure={plan.structure} locale={locale} /> : null}
      {view.status === "forecast" || view.status === "saved" ? <p className="type-caption text-fg-muted">{t("forecastBanner")}</p> : null}
      {plan.notes ? <p className="whitespace-pre-line type-body-sm text-fg-muted">“{plan.notes}”</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- editor (Adm)
export function PaymentPlanEditor({ dealId, view, today }: { dealId: string; view: PaymentPlanView; today: string }) {
  const t = useTranslations("payments.plan");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const payoutText = usePayoutText();
  const suggested = view.suggested?.cents ?? null;
  const [amount, setAmount] = useState(centsToBrl(view.totalCents ?? suggested));
  const [d, setD] = useState<PlanDraft>(() => planToDraft(view.plan, today));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<PlanDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const total = brlToCents(amount);
  const payouts = view.payoutsCents ?? 0;
  const ev: PlanEvents = view.events ?? { signature: today, delivery: today, publication: today };
  const checked = useMemo(() => draftToPlan(d, total, payouts, today), [d, total, payouts, today]);
  const parts = checked.ok && total ? planParts(checked.plan, total, ev) : [];
  const last = parts.reduce<string | null>((acc, p) => (p.dueOn && (!acc || p.dueOn > acc) ? p.dueOn : acc), null);
  const payDue = checked.ok ? payoutDue(checked.plan, last, ev.delivery) : null;
  const commission = total !== null ? planCommission(total, payouts) : null;
  const manual = d.structure === "installments" && d.interval === "manual";
  const dates = manual ? manualDates(d, today) : [];

  function save() {
    setError(null);
    if (!checked.ok) return setError(t(`errors.${checked.problem}`));
    start(async () => {
      const r = await savePaymentPlanAction({ dealId, totalCents: total!, plan: checked.plan });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="plan-editor">
      <FormField
        label={t("total")}
        required
        hint={
          suggested !== null && view.suggested ? (
            <span className="flex flex-wrap items-center gap-2">
              {t(`suggested.${view.suggested.source}`, { value: formatCents(suggested, locale) })}
              {total !== suggested ? (
                <button type="button" className="font-medium text-accent-text underline-offset-2 hover:underline" onClick={() => setAmount(centsToBrl(suggested))} disabled={pending}>
                  {t("useSuggested")}
                </button>
              ) : null}
            </span>
          ) : (
            t("totalHint")
          )
        }
      >
        <MoneyInput value={amount} maxCents={10_000_000_000} onValueChange={(v) => setAmount(v)} disabled={pending} data-testid="plan-total" />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("methodLabel")}>
          <Select value={d.method} onChange={(e) => set({ method: e.target.value as PlanDraft["method"] })} disabled={pending} data-testid="plan-method">
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`method.${m}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {d.method === "other" ? (
          <FormField label={t("methodNote")} required>
            <Input value={d.methodNote} maxLength={120} onChange={(e) => set({ methodNote: e.target.value })} disabled={pending} />
          </FormField>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg">{t("structureLabel")}</span>
        <SegmentedControl
          aria-label={t("structureLabel")}
          value={d.structure}
          onValueChange={(v) => set({ structure: v })}
          options={[
            { value: "single", label: t("structure.single"), disabled: pending },
            { value: "down_payment", label: t("structure.down_payment"), disabled: pending },
            { value: "installments", label: t("structure.installments"), disabled: pending },
          ]}
          className="w-full sm:w-fit"
        />
      </div>

      {d.structure === "down_payment" ? (
        <FormField label={t("downPaymentPct")} hint={t("downPaymentPctHint")}>
          <QuantityInput min={1} max={99} value={d.downPaymentPct} onValueChange={(n) => set({ downPaymentPct: n })} disabled={pending} data-testid="plan-down-pct" />
        </FormField>
      ) : null}

      {d.structure === "installments" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("installmentsLabel")}>
            <QuantityInput min={MIN_INSTALLMENTS} max={MAX_PLAN_INSTALLMENTS} value={d.installments} onValueChange={(n) => set({ installments: n })} disabled={pending} data-testid="plan-installments" />
          </FormField>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t("intervalLabel")}</span>
            <SegmentedControl
              aria-label={t("intervalLabel")}
              value={d.interval}
              onValueChange={(v) => set({ interval: v, dates: v === "manual" ? manualDates(d, today) : d.dates })}
              options={[
                { value: "monthly", label: t("intervals.monthly"), disabled: pending },
                { value: "biweekly", label: t("intervals.biweekly"), disabled: pending },
                { value: "manual", label: t("intervals.manual"), disabled: pending },
              ]}
              size="sm"
              className="w-full sm:w-fit"
            />
          </div>
        </div>
      ) : null}

      {manual ? (
        <ol className="grid gap-2 sm:grid-cols-2" data-testid="plan-dates">
          {dates.map((day, i) => (
            <li key={i}>
              <FormField label={t("part", { n: i + 1, total: dates.length })}>
                <DatePicker value={day} onChange={(v) => set({ dates: dates.map((x, j) => (j === i ? v : x)) })} disabled={pending} />
              </FormField>
            </li>
          ))}
        </ol>
      ) : (
        <RuleField
          label={d.structure === "down_payment" ? t("downPaymentDue") : d.structure === "installments" ? t("firstDue") : t("singleDue")}
          rule={d.firstRule}
          days={d.firstDays}
          on={d.firstOn}
          onChange={(p) => set({ ...(p.rule ? { firstRule: p.rule } : {}), ...(p.days !== undefined ? { firstDays: p.days } : {}), ...(p.on !== undefined ? { firstOn: p.on } : {}) })}
          disabled={pending}
          testId="plan-first"
        />
      )}
      {d.structure === "down_payment" ? (
        <RuleField
          label={t("balanceDue")}
          rule={d.balanceRule}
          days={d.balanceDays}
          on={d.balanceOn}
          onChange={(p) => set({ ...(p.rule ? { balanceRule: p.rule } : {}), ...(p.days !== undefined ? { balanceDays: p.days } : {}), ...(p.on !== undefined ? { balanceOn: p.on } : {}) })}
          disabled={pending}
          testId="plan-balance"
        />
      ) : null}

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid="plan-payout">
        <legend className="px-1 text-sm font-semibold text-fg">{t("payoutLabel")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("when")}>
            <Select value={d.payoutRule} onChange={(e) => set({ payoutRule: e.target.value as PlanDraft["payoutRule"] })} disabled={pending}>
              {PAYOUT_RULES.map((r) => (
                <option key={r} value={r}>
                  {t(`payoutRules.${r}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {d.payoutRule === "fixed_date" ? (
            <FormField label={t("dueOn")}>
              <DatePicker value={d.payoutOn} onChange={(v) => set({ payoutOn: v })} disabled={pending} />
            </FormField>
          ) : (
            <FormField label={t("plusDays")}>
              <QuantityInput min={0} max={MAX_RULE_DAYS} value={d.payoutDays} onValueChange={(n) => set({ payoutDays: n })} disabled={pending} />
            </FormField>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t("payoutMethodLabel")}</span>
          <SegmentedControl
            aria-label={t("payoutMethodLabel")}
            value={d.payoutMethod}
            onValueChange={(v) => set({ payoutMethod: v })}
            options={[
              { value: "pix", label: t("payoutMethods.pix"), disabled: pending },
              { value: "transfer", label: t("payoutMethods.transfer"), disabled: pending },
            ]}
            size="sm"
            className="w-full sm:w-fit"
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Switch checked={d.invoiceTalent} onCheckedChange={(v) => set({ invoiceTalent: v })} label={t("invoiceTalent")} description={t("invoiceTalentHint")} disabled={pending} />
        <Switch checked={d.invoiceAgency} onCheckedChange={(v) => set({ invoiceAgency: v })} label={t("invoiceAgency")} disabled={pending} />
      </div>
      <FormField label={t("notes")}>
        <Textarea value={d.notes} rows={2} maxLength={500} onChange={(e) => set({ notes: e.target.value })} disabled={pending} />
      </FormField>

      <section className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-soft/40 p-3" aria-label={t("preview")} data-testid="plan-preview">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <CalendarClock className="size-4" aria-hidden="true" />
          {t("preview")}
        </h3>
        {parts.length > 0 ? <PartsList parts={parts} structure={d.structure} locale={locale} /> : <p className="type-caption text-fg-muted">{t("previewEmpty")}</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="type-caption text-fg-muted">{t("payouts")}</dt>
            <dd className="font-mono font-semibold text-fg">{formatCents(payouts, locale)}</dd>
          </div>
          <div>
            <dt className="type-caption text-fg-muted">{t("commission")}</dt>
            <dd className={`font-mono font-semibold ${commission && !commission.ok ? "text-danger" : "text-fg"}`} data-testid="plan-commission">
              {commission ? formatCents(commission.commissionCents, locale) : "—"}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="type-caption text-fg-muted">{t("payoutLabel")}</dt>
            <dd className="text-fg">
              {checked.ok ? payoutText(checked.plan) : "—"}
              {payDue ? ` · ${formatPlainDate(payDue, locale)}` : ""}
            </dd>
          </div>
        </dl>
        {commission && !commission.ok ? <p className="type-caption text-danger">{t("errors.belowPayouts")}</p> : null}
        {view.payouts.length > 0 ? (
          <ul className="flex flex-col gap-0.5 type-caption text-fg-muted">
            {view.payouts.map((p) => (
              <li key={p.dealTalentId}>
                {p.name}: {p.feeCents !== null ? formatCents(p.feeCents, locale) : t("feeMissing")}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="type-caption text-fg-muted">{t("previewHint")}</p>
      </section>

      {error ? (
        <p className="type-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" leadingIcon={<Save />} onClick={save} loading={pending} className="w-full sm:w-fit" data-testid="plan-save">
        {view.hasPlan ? t("saveChanges") : t("save")}
      </Button>
    </div>
  );
}

/** Cartão do negócio (agência): editor para o Adm antes da contratação; resumo para os demais e depois dela. */
export function DealPaymentPlanCard({ dealId, view, today }: { dealId: string; view: PaymentPlanView; today: string }) {
  const t = useTranslations("payments.plan");
  return (
    <section id="payment-plan" className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="payment-plan-title" data-testid="deal-payment-plan">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="payment-plan-title" className="flex items-center gap-2 text-base font-semibold text-fg">
          <Wallet className="size-4" aria-hidden="true" />
          {t("title")}
        </h2>
        <PlanStatusBadge status={view.status} />
      </div>
      {view.agreed && !view.hasPlan ? (
        <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="plan-needed">
          {view.canEdit ? t("neededAdmin") : t("neededOthers")}
        </p>
      ) : null}
      {view.termsPending ? (
        <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="plan-terms-pending">
          {t("termsPending")}
        </p>
      ) : null}
      {view.canEdit ? <PaymentPlanEditor dealId={dealId} view={view} today={today} /> : <PaymentPlanSummary view={view} />}
      <p className="type-caption text-fg-subtle">{t("simulated")}</p>
    </section>
  );
}
