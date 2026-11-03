"use client";

import { Lock, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, Button, Dialog, FormField, MoneyInput, ProgressBar, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { formatCents, parseBrlToCents } from "@/lib/deals/schemas";
import { centsToBrl } from "@/lib/money/brl-input";
import { setBrandBudgetAction } from "@/lib/finance/actions";
import { budgetTone, budgetUsedPercent, type BudgetSummary, type BudgetTone } from "@/lib/finance/budget";
import { budgetRowLocked } from "@/lib/finance/budget-change";

const TONE_VARIANT: Record<BudgetTone, BadgeVariant> = { none: "neutral", ok: "success", near: "warning", over: "danger" };
const TONE_BAR = { none: "accent", ok: "success", near: "warning", over: "danger" } as const;

// Verba da campanha (0082): reservado, comprometido (o que a marca paga pelos contratados), pago e saldo, com a
// conta por influenciador. Só o dono da marca define a verba (o banco confere); valores simulados.
// 0090: depois de enviada a campanha, a verba definida fica travada (só a 1ª definição é livre); mudar é pelo pedido de
// alteração (BrandBudgetChange, logo abaixo no mesmo cartão).
export function BudgetPanel({ summary }: { summary: BudgetSummary }) {
  const t = useTranslations("brandPortal.budget");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState<{ dealTalentId: string | null; name: string | null; current: number | null } | null>(null);
  const tone = budgetTone(summary.reservedCents, summary.committedCents);
  const used = budgetUsedPercent(summary.reservedCents, summary.committedCents);
  const money = (c: number | null) => (c === null ? "—" : formatCents(c, locale));
  const campaignLocked = budgetRowLocked(summary.locked, summary.reservedSource === "set" ? summary.reservedCents : null);
  const anyLocked = campaignLocked || summary.talents.some((x) => budgetRowLocked(summary.locked, x.reservedCents));

  const tile = (label: string, value: string, extra?: string, danger = false) => (
    <div className="flex min-h-16 flex-col justify-center rounded-xl border border-border px-3 py-2">
      <span className="type-caption text-fg-muted">{label}</span>
      <span className={`font-mono text-base font-semibold ${danger ? "text-danger" : "text-fg"}`}>{value}</span>
      {extra ? <span className="type-caption text-fg-muted">{extra}</span> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="budget-panel" data-tone={tone}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="md" variant={TONE_VARIANT[tone]}>
          {t(`tone.${tone}`)}
        </Badge>
        <span className="type-caption text-fg-muted">
          {summary.reservedSource === "offered" ? t("sourceOffered") : summary.reservedSource === "set" ? t("sourceSet") : t("none")}
        </span>
        {summary.canEdit && !campaignLocked ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leadingIcon={<Pencil />}
            className="ml-auto"
            onClick={() => setEditing({ dealTalentId: null, name: null, current: summary.reservedSource === "set" ? summary.reservedCents : null })}
            data-testid="budget-edit"
          >
            {t("edit")}
          </Button>
        ) : null}
      </div>
      {used !== null ? <ProgressBar value={Math.min(used, 100)} label={t("used", { percent: used })} tone={TONE_BAR[tone]} /> : null}
      {used !== null ? <p className="type-caption text-fg-muted">{t("used", { percent: used })}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {tile(t("reserved"), money(summary.reservedCents))}
        {tile(t("committed"), money(summary.committedCents), undefined, tone === "over")}
        {tile(t("paid"), money(summary.paidCents))}
        {tile(t("remaining"), money(summary.remainingCents), undefined, (summary.remainingCents ?? 0) < 0)}
      </div>
      <p className="type-caption text-fg-muted">{t("committedHint")}</p>
      {summary.paymentDueOn ? <p className="type-caption text-fg">{t("paymentDue", { date: formatPlainDate(summary.paymentDueOn, locale) })}</p> : null}

      <h3 className="text-sm font-semibold text-fg">{t("byTalent")}</h3>
      {summary.talents.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("noTalents")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="budget-talents">
          {summary.talents.map((x) => (
            <li key={x.dealTalentId} className="flex flex-wrap items-center gap-2 p-3" data-over={x.over ? "true" : undefined}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-fg">{x.talentName}</span>
                <span className="type-caption text-fg-muted">
                  {x.status === "contracted" ? t("talentContracted") : t("talentProposed")}
                  {x.reservedCents !== null ? ` · ${t("reserved")} ${money(x.reservedCents)}` : ""}
                  {x.paidCents > 0 ? ` · ${t("paid")} ${money(x.paidCents)}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {x.over ? (
                  <Badge size="sm" variant="danger">
                    {t("tone.over")}
                  </Badge>
                ) : null}
                <span className={`font-mono text-sm font-semibold ${x.over ? "text-danger" : "text-fg"}`}>{money(x.committedCents)}</span>
                {summary.canEdit && !budgetRowLocked(summary.locked, x.reservedCents) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Pencil />}
                    aria-label={t("editTalent", { name: x.talentName })}
                    onClick={() => setEditing({ dealTalentId: x.dealTalentId, name: x.talentName, current: x.reservedCents })}
                  >
                    <span className="sr-only">{t("editTalent", { name: x.talentName })}</span>
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {anyLocked ? (
        <p className="flex items-center gap-1.5 type-caption text-fg-muted" data-testid="budget-locked">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          {t("lockedHint")}
        </p>
      ) : null}
      {!summary.canEdit ? <p className="type-caption text-fg-muted">{t("ownerOnly")}</p> : null}
      {editing ? <BudgetDialog requestId={summary.requestId} target={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function BudgetDialog({ requestId, target, onClose }: { requestId: string; target: { dealTalentId: string | null; name: string | null; current: number | null }; onClose: () => void }) {
  const t = useTranslations("brandPortal.budget");
  const { toast } = useToast();
  const [text, setText] = useState(target.current === null ? "" : centsToBrl(target.current));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    const cents = parseBrlToCents(text);
    if (cents === undefined) return setError(t("amountInvalid"));
    start(async () => {
      const result = await setBrandBudgetAction({ requestId, dealTalentId: target.dealTalentId, totalCents: cents });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={target.name ? t("editTalentTitle", { name: target.name }) : t("editTitle")}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} data-testid="budget-save">
            {t("save")}
          </Button>
        </>
      }
    >
      <FormField label={t("amount")} hint={target.dealTalentId ? t("amountTalentHint") : t("amountHint")} error={error}>
        <MoneyInput value={text} maxCents={10_000_000_000} onValueChange={(v) => setText(v)} disabled={pending} />
      </FormField>
    </Dialog>
  );
}
