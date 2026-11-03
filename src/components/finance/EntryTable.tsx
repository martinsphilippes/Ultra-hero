"use client";

import { CalendarClock, Check, Eye, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, DatePicker, Dialog, FormField, Select, Textarea, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import { signedUrlAction } from "@/lib/documents/actions";
import { reviewInvoiceAction, schedulePayoutAction, setEntryStatusAction } from "@/lib/finance/actions";
import { validPayDate } from "@/lib/finance/earnings";
import type { Entry } from "@/lib/finance/queries";
import { nextEntryStatuses, type EntryStatus } from "@/lib/finance/vocab";

type Props = {
  entries: Entry[];
  /** Adm: muda a situação (a vencer, liquidado, cancelado com nota). */
  canAct?: boolean;
  /** Na ficha do negócio: sem link e sem coluna da marca. */
  compact?: boolean;
  emptyText: string;
};

const STATUS_VARIANT: Record<EntryStatus, BadgeVariant> = { planned: "neutral", due: "warning", settled: "success", cancelled: "neutral" };
const KIND_VARIANT = { brand_receivable: "info", commission: "accent", talent_payout: "neutral" } as const;

// Lançamentos simulados: tipo, negócio, valor, vencimento e situação. O Adm avança a situação; cancelar pede nota.
export function EntryTable({ entries, canAct = false, compact = false, emptyText }: Props) {
  const t = useTranslations("agency.finance");
  const tc = useTranslations("commercial.finance");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cancelFor, setCancelFor] = useState<Entry | null>(null);
  // 0082: nota fiscal (aprovar/recusar) e agendamento do repasse
  const [reviewFor, setReviewFor] = useState<{ entry: Entry; decision: "approve" | "reject" } | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Entry | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  function viewInvoice(documentId: string) {
    start(async () => {
      const result = await signedUrlAction({ id: documentId });
      if (!result.ok || !result.url) {
        toast({ title: result.ok ? t("openInvoice") : result.error, variant: "error" });
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function change(entry: Entry, status: string) {
    if (status === "cancelled") return setCancelFor(entry);
    if (status !== "due" && status !== "settled") return;
    start(async () => {
      const result = await setEntryStatusAction({ entryId: entry.id, status, note: "", dealId: entry.dealId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  if (entries.length === 0) return <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{emptyText}</p>;
  return (
    <>
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="entry-table">
        {entries.map((e) => {
          const overdue = e.dueOn !== null && e.dueOn < today && (e.status === "planned" || e.status === "due");
          const next = canAct ? nextEntryStatuses(e.status) : [];
          return (
            <li key={e.id} className="flex flex-wrap items-start gap-3 p-3" data-testid="entry-item" data-kind={e.kind} data-status={e.status}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" variant={KIND_VARIANT[e.kind]}>
                    {tc(`kinds.${e.kind}`)}
                  </Badge>
                  <Badge size="sm" variant={STATUS_VARIANT[e.status]}>
                    {tc(`status.${e.status}`)}
                  </Badge>
                  {e.kind === "talent_payout" && e.talentName ? <span className="text-sm font-medium text-fg">{e.talentName}</span> : null}
                </span>
                {!compact ? (
                  <span className="type-caption text-fg-muted">
                    <Link href={`/agencia/negocios/${e.dealId}`} className="font-medium text-fg underline-offset-2 hover:underline">
                      {e.dealTitle}
                    </Link>
                    {" · "}
                    {e.brandName}
                  </span>
                ) : null}
                <span className="type-caption text-fg-muted">
                  {e.dueOn ? <span className={overdue ? "font-medium text-danger" : ""}>{t("dueOn", { date: formatPlainDate(e.dueOn, locale) })}</span> : t("noDue")}
                  {e.settledAt ? ` · ${t("settledAt", { date: formatDateTime(e.settledAt, locale) })}` : ""}
                </span>
                {e.note ? <span className="type-caption text-fg-muted">“{e.note}”</span> : null}
                {e.kind === "talent_payout" && e.status !== "cancelled" ? (
                  <span className="flex flex-wrap items-center gap-1.5 type-caption text-fg-muted" data-testid="entry-invoice" data-invoice={e.invoice?.status ?? "none"}>
                    <Badge size="sm" variant={e.invoice?.status === "submitted" ? "warning" : e.invoice?.status === "approved" ? "success" : e.invoice?.status === "rejected" ? "danger" : "neutral"}>
                      {t(`invoiceStatus.${e.invoice?.status ?? "none"}`)}
                    </Badge>
                    {e.scheduledOn && e.status !== "settled" ? <span className="font-medium text-fg">{t("scheduledOn", { date: formatPlainDate(e.scheduledOn, locale) })}</span> : null}
                  </span>
                ) : null}
                {canAct && e.kind === "talent_payout" && (e.invoice?.documentId || e.status === "planned" || e.status === "due") ? (
                  <span className="flex flex-wrap gap-1.5 pt-1">
                    {e.invoice?.documentId ? (
                      <Button type="button" size="sm" variant="secondary" leadingIcon={<Eye />} onClick={() => viewInvoice(e.invoice!.documentId!)} disabled={pending}>
                        {t("openInvoice")}
                      </Button>
                    ) : null}
                    {e.invoice?.status === "submitted" ? (
                      <>
                        <Button type="button" size="sm" leadingIcon={<Check />} onClick={() => setReviewFor({ entry: e, decision: "approve" })} disabled={pending} data-testid="invoice-approve">
                          {t("approveInvoice")}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" leadingIcon={<X />} onClick={() => setReviewFor({ entry: e, decision: "reject" })} disabled={pending} data-testid="invoice-reject">
                          {t("rejectInvoice")}
                        </Button>
                      </>
                    ) : null}
                    {e.status === "planned" || e.status === "due" ? (
                      <Button type="button" size="sm" variant="secondary" leadingIcon={<CalendarClock />} onClick={() => setScheduleFor(e)} disabled={pending} data-testid="payout-schedule">
                        {e.scheduledOn ? t("reschedule") : t("schedule")}
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-col items-end gap-2">
                <span className="font-mono text-base font-semibold text-fg" data-testid="entry-amount">
                  {formatCents(e.amountCents, locale)}
                </span>
                {next.length > 0 ? (
                  <Select value="" selectSize="sm" onChange={(ev) => change(e, ev.target.value)} disabled={pending} aria-label={t("changeStatus")} data-testid="entry-status">
                    <option value="">{t("changeStatus")}</option>
                    {next.map((s) => (
                      <option key={s} value={s}>
                        {t(`actions.${s}`)}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {cancelFor ? <CancelDialog entry={cancelFor} onClose={() => setCancelFor(null)} /> : null}
      {reviewFor ? <ReviewDialog entry={reviewFor.entry} decision={reviewFor.decision} today={today} onClose={() => setReviewFor(null)} /> : null}
      {scheduleFor ? <ScheduleDialog entry={scheduleFor} today={today} onClose={() => setScheduleFor(null)} /> : null}
    </>
  );
}

function CancelDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useTranslations("agency.finance");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (note.trim().length < 5) return setError(t("noteRequired"));
    start(async () => {
      const result = await setEntryStatusAction({ entryId: entry.id, status: "cancelled", note: note.trim(), dealId: entry.dealId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("cancelTitle")}
      description={t("cancelHint")}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" variant="danger" onClick={run} loading={pending} data-testid="entry-cancel-run">
            {t("actions.cancelled")}
          </Button>
        </>
      }
    >
      <FormField label={t("cancelNote")} required error={error}>
        <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
    </Dialog>
  );
}

// 0082: conferir a nota fiscal (aprovar pode já agendar; recusar pede o motivo, que o influenciador vê)
function ReviewDialog({ entry, decision, today, onClose }: { entry: Entry; decision: "approve" | "reject"; today: string; onClose: () => void }) {
  const t = useTranslations("agency.finance");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [payOn, setPayOn] = useState(entry.scheduledOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (decision === "reject" && note.trim().length < 5) return setError(t("noteRequired"));
    if (decision === "approve" && payOn && !validPayDate(payOn, today)) return setError(t("payOnInvalid"));
    if (!entry.invoice) return;
    const invoiceId = entry.invoice.id;
    start(async () => {
      const result = await reviewInvoiceAction({ invoiceId, decision, note: note.trim(), payOn: decision === "approve" && payOn ? payOn : null, dealId: entry.dealId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("reviewTitle")}
      description={t("reviewHint")}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" variant={decision === "reject" ? "danger" : "primary"} onClick={run} loading={pending} data-testid="invoice-review-run">
            {decision === "approve" ? t("approveInvoice") : t("rejectInvoice")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg">
          {entry.talentName} · {entry.dealTitle}
        </p>
        {decision === "approve" ? (
          <FormField label={t("payOnLabel")} hint={t("payOnHint")}>
            <DatePicker value={payOn} min={today} onChange={(value) => setPayOn(value)} disabled={pending} />
          </FormField>
        ) : null}
        <FormField label={t("reviewNote")} required={decision === "reject"} error={error}>
          <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
      </div>
    </Dialog>
  );
}

// 0082: agendar, mudar ou tirar a data do pagamento do repasse
function ScheduleDialog({ entry, today, onClose }: { entry: Entry; today: string; onClose: () => void }) {
  const t = useTranslations("agency.finance");
  const { toast } = useToast();
  const [payOn, setPayOn] = useState(entry.scheduledOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run(clear: boolean) {
    setError(null);
    if (!clear && !validPayDate(payOn, today)) return setError(t("payOnInvalid"));
    start(async () => {
      const result = await schedulePayoutAction({ entryId: entry.id, payOn: clear ? null : payOn, dealId: entry.dealId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("scheduleTitle")}
      description={t("scheduleHint")}
      size="sm"
      footer={
        <>
          {entry.scheduledOn ? (
            <Button type="button" variant="ghost" onClick={() => run(true)} disabled={pending}>
              {t("unschedule")}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" onClick={() => run(false)} loading={pending} data-testid="payout-schedule-run">
            {t("scheduleSave")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg">
          {entry.talentName} · {entry.dealTitle}
        </p>
        <FormField label={t("payOnLabel")} error={error} required>
          <DatePicker value={payOn} min={today} onChange={(value) => setPayOn(value)} disabled={pending} />
        </FormField>
      </div>
    </Dialog>
  );
}
