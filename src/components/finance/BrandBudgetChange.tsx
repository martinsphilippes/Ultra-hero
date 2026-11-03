"use client";

import { ArrowRightLeft, Check, Send, Undo2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, MoneyInput, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { brandChangeActions, changeFinalCents, isOpenChange, NOTE_MIN, REASON_MAX, REASON_MIN, type BudgetChange } from "@/lib/finance/budget-change";
import { answerBudgetChangeAction, requestBudgetChangeAction, reviewBudgetChangeAction } from "@/lib/finance/change-actions";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import { ChangeStatusBadge, ChangeTimeline, ChangeValues, PlanView } from "./BudgetChangeShared";

type Talent = { dealTalentId: string; talentName: string; reservedCents: number | null };
type Props = {
  requestId: string;
  role: "owner" | "staff" | null;
  canRequest: boolean;
  currentCents: number | null;
  talents: Talent[];
  items: BudgetChange[];
};

// Pedido de alteração de verba, lado da marca (0090): a verba definida fica travada; "Pedir alteração" leva o novo
// valor e o motivo (equipe monta, dono envia); a agência recusa ou propõe o realinhamento; o dono confirma ou recusa.
// Enquanto o pedido está aberto, vale a verba antiga.
export function BrandBudgetChange({ requestId, role, canRequest, currentCents, talents, items }: Props) {
  const t = useTranslations("payments.change");
  const [asking, setAsking] = useState(false);
  const open = items.find((c) => isOpenChange(c.status)) ?? null;
  const history = items.filter((c) => c !== open);
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3" id="budget-change" data-testid="brand-budget-change">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{t("title")}</h3>
        {canRequest && role ? (
          <Button type="button" size="sm" variant="secondary" leadingIcon={<ArrowRightLeft />} onClick={() => setAsking(true)} data-testid="budget-change-request">
            {t("request")}
          </Button>
        ) : null}
      </div>
      {!open ? <p className="type-caption text-fg-muted">{t("flowHint")}</p> : <OpenChange change={open} requestId={requestId} role={role} />}
      {history.length > 0 ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">{t("history", { count: history.length })}</summary>
          <ul className="mt-3 flex flex-col gap-4">
            {history.map((c) => (
              <li key={c.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ChangeStatusBadge status={c.status} />
                  {c.values ? <HistoryLine change={c} /> : null}
                </div>
                {c.values?.plan && c.status === "confirmed" ? <PlanView plan={c.values.plan} /> : null}
                <ChangeTimeline change={c} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {asking ? <RequestDialog requestId={requestId} role={role} currentCents={currentCents} talents={talents} onClose={() => setAsking(false)} /> : null}
    </div>
  );
}

function HistoryLine({ change }: { change: BudgetChange }) {
  const t = useTranslations("payments.change");
  const locale = useLocale() as Locale;
  const v = change.values!;
  return (
    <span className="type-caption text-fg-muted">
      {t("requested")}: {formatCents(v.requestedCents, locale)}
      {v.finalCents !== null ? ` · ${t("final")}: ${formatCents(v.finalCents, locale)}` : ""}
    </span>
  );
}

function OpenChange({ change, requestId, role }: { change: BudgetChange; requestId: string; role: "owner" | "staff" | null }) {
  const t = useTranslations("payments.change");
  const locale = useLocale() as Locale;
  const [dialog, setDialog] = useState<null | "return" | "decline" | "confirm">(null);
  const actions = brandChangeActions(change, role);
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function quick(decision: "send" | "withdraw") {
    setError(null);
    start(async () => {
      const r = await reviewBudgetChangeAction({ id: change.id, requestId, decision, note: "" });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 p-3" data-testid="budget-change-open">
      <div className="flex flex-wrap items-center gap-2">
        <ChangeStatusBadge status={change.status} />
        <span className="type-caption text-fg-muted">{t(`openHint.${change.status as "pending_owner" | "open" | "proposed"}`)}</span>
      </div>
      <ChangeValues change={change} showReserved />
      {change.status === "proposed" && change.values?.plan ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
          <h4 className="text-sm font-semibold text-fg">{t("plan.title")}</h4>
          {change.values.agencyNote ? <p className="whitespace-pre-line type-body-sm text-fg">“{change.values.agencyNote}”</p> : null}
          <PlanView plan={change.values.plan} />
        </div>
      ) : null}
      <ChangeTimeline change={change} />
      {error ? (
        <p className="type-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.includes("confirm") ? (
            <Button type="button" leadingIcon={<Check />} onClick={() => setDialog("confirm")} disabled={pending} data-testid="budget-change-confirm">
              {t("confirm", { amount: change.values ? formatCents(changeFinalCents(change.values), locale) : "" })}
            </Button>
          ) : null}
          {actions.includes("decline") ? (
            <Button type="button" variant="secondary" leadingIcon={<X />} onClick={() => setDialog("decline")} disabled={pending}>
              {t("decline")}
            </Button>
          ) : null}
          {actions.includes("send") ? (
            <Button type="button" leadingIcon={<Send />} onClick={() => quick("send")} loading={pending} data-testid="budget-change-send">
              {t("sendToAgency")}
            </Button>
          ) : null}
          {actions.includes("return") ? (
            <Button type="button" variant="secondary" leadingIcon={<Undo2 />} onClick={() => setDialog("return")} disabled={pending}>
              {t("returnToTeam")}
            </Button>
          ) : null}
          {actions.includes("withdraw") ? (
            <Button type="button" variant="ghost" onClick={() => quick("withdraw")} disabled={pending}>
              {t("withdraw")}
            </Button>
          ) : null}
        </div>
      ) : role === "staff" && change.status === "proposed" ? (
        <p className="type-caption text-fg-muted">{t("ownerConfirms")}</p>
      ) : null}
      {dialog ? <NoteDialog change={change} requestId={requestId} mode={dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function NoteDialog({ change, requestId, mode, onClose }: { change: BudgetChange; requestId: string; mode: "return" | "decline" | "confirm"; onClose: () => void }) {
  const t = useTranslations("payments.change");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (mode !== "confirm" && note.trim().length < NOTE_MIN) return setError(t("noteRequired"));
    start(async () => {
      const r =
        mode === "return"
          ? await reviewBudgetChangeAction({ id: change.id, requestId, decision: "return", note })
          : await answerBudgetChangeAction({ id: change.id, requestId, decision: mode, note });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t(`dialogs.${mode}`)}
      description={mode === "confirm" ? t("confirmHint") : undefined}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} data-testid="budget-change-note-submit">
            {t(`dialogs.${mode}Submit`)}
          </Button>
        </>
      }
    >
      <FormField label={mode === "confirm" ? t("noteOptional") : t("note")} error={error}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} disabled={pending} />
      </FormField>
    </Dialog>
  );
}

function RequestDialog({ requestId, role, currentCents, talents, onClose }: { requestId: string; role: "owner" | "staff" | null; currentCents: number | null; talents: Talent[]; onClose: () => void }) {
  const t = useTranslations("payments.change");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [amount, setAmount] = useState(centsToBrl(currentCents));
  const [reason, setReason] = useState("");
  const [talentText, setTalentText] = useState<Record<string, string>>(Object.fromEntries(talents.map((x) => [x.dealTalentId, centsToBrl(x.reservedCents)])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    const cents = brlToCents(amount);
    if (cents === null) return setError(t("amountInvalid"));
    if (reason.trim().length < REASON_MIN) return setError(t("reasonShort"));
    const changedTalents = talents
      .map((x) => ({ dealTalentId: x.dealTalentId, cents: brlToCents(talentText[x.dealTalentId] ?? ""), before: x.reservedCents }))
      .filter((x): x is { dealTalentId: string; cents: number; before: number | null } => x.cents !== null && x.cents !== x.before)
      .map(({ dealTalentId, cents: c }) => ({ dealTalentId, cents: c }));
    start(async () => {
      const r = await requestBudgetChangeAction({ requestId, cents, reason, talents: changedTalents });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("requestTitle")}
      description={role === "owner" ? t("ownerHint") : t("toOwnerHint")}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} leadingIcon={<Send />} data-testid="budget-change-submit">
            {role === "owner" ? t("submitOwner") : t("submitStaff")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label={t("newAmount")} hint={currentCents !== null ? t("newAmountHint", { amount: formatCents(currentCents, locale) }) : undefined} required>
          <MoneyInput value={amount} maxCents={10_000_000_000} onValueChange={(v) => setAmount(v)} disabled={pending} data-testid="budget-change-amount" />
        </FormField>
        <FormField label={t("reason")} hint={t("reasonHint")} required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={REASON_MAX} disabled={pending} data-testid="budget-change-reason" />
        </FormField>
        {talents.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-fg">{t("talentsTitle")}</legend>
            <p className="type-caption text-fg-muted">{t("talentsHint")}</p>
            {talents.map((x) => (
              <FormField key={x.dealTalentId} label={x.talentName}>
                <MoneyInput value={talentText[x.dealTalentId] ?? ""} maxCents={10_000_000_000} onValueChange={(v) => setTalentText((cur) => ({ ...cur, [x.dealTalentId]: v }))} disabled={pending} />
              </FormField>
            ))}
          </fieldset>
        ) : null}
        {error ? (
          <p className="type-body-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
