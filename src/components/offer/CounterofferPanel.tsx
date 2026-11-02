"use client";

import { CalendarClock, CheckCircle2, Undo2, Wallet, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { formatCents, parseBrlToCents } from "@/lib/deals/schemas";
import { createCounterofferAction, withdrawCounterofferAction } from "@/lib/offer/actions";
import { lastDecided, openCounteroffer, type Counteroffer, type CounterStatus } from "@/lib/offer/counteroffer";

export type CounterDeliverable = { id: string; label: string; refDate: string | null };

type Props = {
  dealTalentId: string;
  counteroffers: Counteroffer[];
  canFee: boolean;
  canDate: boolean;
  currentFeeCents: number | null;
  deliverables: CounterDeliverable[];
  /** início previsto (data da campanha, quando a contraproposta não é de uma entrega) */
  expectedStart: string | null;
  dateMin: string;
  dateMax: string;
};

const STATUS_VARIANT: Record<CounterStatus, "warning" | "success" | "danger" | "neutral"> = { open: "warning", accepted: "success", rejected: "danger", withdrawn: "neutral" };

// Contraproposta do creator (0079): outra data (de uma entrega ou do início) ou outro valor (com justificativa).
// Uma aberta por vez; enquanto a agência não responde, dá para retirar. O histórico fica abaixo.
export function CounterofferPanel({ dealTalentId, counteroffers, canFee, canDate, currentFeeCents, deliverables, expectedStart, dateMin, dateMax }: Props) {
  const t = useTranslations("offer.counter");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"fee" | "date" | null>(null);
  const open = openCounteroffer(counteroffers);
  const decided = lastDecided(counteroffers);
  if (!open && !decided && counteroffers.length === 0 && !canFee && !canDate) return null;

  function withdraw(c: Counteroffer) {
    if (!window.confirm(t("confirmWithdraw"))) return;
    start(async () => {
      const result = await withdrawCounterofferAction({ counterofferId: c.id, dealTalentId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="opp-counter" data-testid="counteroffer-panel">
      <h2 id="opp-counter" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      {decided && !open ? (
        <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm text-fg ${decided.status === "accepted" ? "bg-success-soft/40" : "bg-danger-soft/40"}`} data-testid="counteroffer-result">
          {decided.status === "accepted" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />}
          <span>
            {decided.status === "accepted" ? t("resultAccepted") : t("resultRejected")}
            {decided.decisionNote ? <span className="block type-caption text-fg-muted">{t("agencyNote", { note: decided.decisionNote })}</span> : null}
          </span>
        </p>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft/30 px-3 py-2" data-testid="counteroffer-open">
          <p className="text-sm text-fg">{t("openNotice")}</p>
          <CounterLine c={open} locale={locale} />
          <Button type="button" size="sm" variant="ghost" leadingIcon={<Undo2 />} onClick={() => withdraw(open)} loading={pending} className="w-fit">
            {t("withdraw")}
          </Button>
        </div>
      ) : canFee || canDate ? (
        <div className="flex flex-wrap gap-2">
          {canDate ? (
            <Button type="button" variant="secondary" leadingIcon={<CalendarClock />} onClick={() => setDialog("date")} disabled={pending} data-testid="counter-date-open">
              {t("proposeDate")}
            </Button>
          ) : null}
          {canFee ? (
            <Button type="button" variant="secondary" leadingIcon={<Wallet />} onClick={() => setDialog("fee")} disabled={pending} className="native:hidden" data-testid="counter-fee-open">
              {t("proposeFee")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {counteroffers.length > 0 ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">
            {t("history")} ({counteroffers.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {counteroffers.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 py-2">
                <CounterLine c={c} locale={locale} />
                {c.decisionNote ? <span className="type-caption text-fg-muted">{t("agencyNote", { note: c.decisionNote })}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {dialog === "fee" ? <FeeDialog dealTalentId={dealTalentId} currentFeeCents={currentFeeCents} onClose={() => setDialog(null)} /> : null}
      {dialog === "date" ? <DateDialog dealTalentId={dealTalentId} deliverables={deliverables} expectedStart={expectedStart} dateMin={dateMin} dateMax={dateMax} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}

/** Uma contraproposta em uma linha: tipo, de → para, situação, data e justificativa. */
export function CounterLine({ c, locale, feeHidden }: { c: Counteroffer; locale: Locale; feeHidden?: string }) {
  const t = useTranslations("offer.counter");
  const change =
    c.kind === "fee"
      ? c.feeCents === null
        ? (feeHidden ?? "—")
        : c.previousFeeCents !== null
          ? t("change", { from: formatCents(c.previousFeeCents, locale), to: formatCents(c.feeCents, locale) })
          : formatCents(c.feeCents, locale)
      : c.proposedDate
        ? c.previousDate
          ? t("change", { from: formatPlainDate(c.previousDate, locale), to: formatPlainDate(c.proposedDate, locale) })
          : formatPlainDate(c.proposedDate, locale)
        : "—";
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2 text-sm text-fg">
        <span className="font-medium">{t(`kind.${c.kind}`)}</span>
        {c.deliverableTitle ? <span className="text-fg-muted">· {c.deliverableTitle}</span> : null}
        <span className={c.kind === "fee" ? "font-mono native:hidden" : undefined}>{change}</span>
        <Badge size="sm" variant={STATUS_VARIANT[c.status]}>
          {t(`status.${c.status}`)}
        </Badge>
      </span>
      <span className="type-caption text-fg-muted">
        {c.createdAt ? formatDateTime(c.createdAt, locale) : ""}
        {c.reason ? ` · ${t("reasonLine", { reason: c.reason })}` : ""}
      </span>
    </span>
  );
}

function FeeDialog({ dealTalentId, currentFeeCents, onClose }: { dealTalentId: string; currentFeeCents: number | null; onClose: () => void }) {
  const t = useTranslations("offer.counter");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const cents = parseBrlToCents(text);
    if (cents === null || cents === undefined || cents < 1 || cents === currentFeeCents) return setError(t("invalidFee"));
    if (reason.trim().length < 3) return setError(t("reasonRequired"));
    start(async () => {
      const result = await createCounterofferAction({ dealTalentId, kind: "fee", feeCents: cents, reason: reason.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("feeTitle")} description={t("feeHint")} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="counter-fee-form">
        {currentFeeCents !== null ? <p className="type-body-sm text-fg">{t("currentFee", { value: formatCents(currentFeeCents, locale) })}</p> : null}
        <FormField label={t("newFee")} required>
          <Input inputMode="decimal" value={text} maxLength={20} placeholder="0,00" onChange={(e) => setText(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("reason")} hint={t("reasonHint")} required>
          <Textarea value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="counter-fee-send">
            {t("send")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DateDialog({ dealTalentId, deliverables, expectedStart, dateMin, dateMax, onClose }: { dealTalentId: string; deliverables: CounterDeliverable[]; expectedStart: string | null; dateMin: string; dateMax: string; onClose: () => void }) {
  const t = useTranslations("offer.counter");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [deliverableId, setDeliverableId] = useState(deliverables[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = deliverableId ? (deliverables.find((d) => d.id === deliverableId)?.refDate ?? null) : expectedStart;
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < dateMin || date > dateMax || date === current) return setError(t("invalidDate"));
    start(async () => {
      const result = await createCounterofferAction({ dealTalentId, kind: "date", proposedDate: date, deliverableId, reason: reason.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("dateTitle")} description={t("dateHint")} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="counter-date-form">
        <FormField label={t("deliverable")}>
          <Select value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)} disabled={pending}>
            {deliverables.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
            <option value="">{t("deliverableNone")}</option>
          </Select>
        </FormField>
        {current ? <p className="type-body-sm text-fg">{t("currentDate", { date: formatPlainDate(current, locale) })}</p> : null}
        <FormField label={t("newDate")} required>
          <Input type="date" value={date} min={dateMin} max={dateMax} onChange={(e) => setDate(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("reasonOptional")} hint={t("reasonHint")}>
          <Textarea value={reason} maxLength={300} rows={2} onChange={(e) => setReason(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="counter-date-send">
            {t("send")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
