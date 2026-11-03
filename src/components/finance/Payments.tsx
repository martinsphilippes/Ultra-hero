"use client";

import { Check, Copy, Eye, FileUp, Plus, Split, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Badge, Button, DatePicker, Dialog, FormField, Input, MoneyInput, Textarea, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import { confirmDocumentAction, reserveDocumentAction, signedUrlAction } from "@/lib/documents/actions";
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, type DocumentMime } from "@/lib/documents/constants";
import { reportPaymentAction, reviewPaymentAction, splitReceivableAction } from "@/lib/finance/payment-actions";
import {
  canReport,
  daysUntil,
  formatPixKey,
  installmentState,
  MAX_INSTALLMENTS,
  splitEvenly,
  splitRemaining,
  type Installment,
  type InstallmentState,
  type PaymentSettings,
  type Receivable,
  type SplitPart,
} from "@/lib/finance/payments";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import { formatTaxId } from "@/lib/signature/tax-id";
import { createClient } from "@/lib/supabase/client";

// Pagamentos da marca (0090): a marca vê o que deve, os dados da agência (copiar a chave PIX) e informa o pagamento
// com comprovante; o Adm da agência divide em parcelas e confirma ou recusa. Registro/controle simulado: nada aqui
// cobra nem move dinheiro.

const STATE_VARIANT: Record<InstallmentState, BadgeVariant> = { upcoming: "info", overdue: "danger", reported: "warning", paid: "success" };
const REVALIDATE = "/marca/pagamentos";

export function InstallmentBadge({ state }: { state: InstallmentState }) {
  const t = useTranslations("payments.state");
  return (
    <Badge size="sm" variant={STATE_VARIANT[state]} data-testid="installment-state" data-state={state}>
      {t(state)}
    </Badge>
  );
}

function useReceiptViewer() {
  const t = useTranslations("payments");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  function view(documentId: string) {
    start(async () => {
      const r = await signedUrlAction({ id: documentId });
      if (!r.ok || !r.url) {
        toast({ title: r.ok ? t("openFailed") : r.error, variant: "error" });
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  }
  return { view, pending };
}

function dueText(t: ReturnType<typeof useTranslations>, i: Installment, state: InstallmentState, today: string, locale: Locale): string {
  if (state === "paid") return i.paidAt ? t("paidAt", { date: formatDateTime(i.paidAt, locale) }) : t("state.paid");
  if (!i.dueOn) return t("noDue");
  const days = daysUntil(i.dueOn, today);
  const date = formatPlainDate(i.dueOn, locale);
  if (days < 0) return t("overdueSince", { date, days: -days });
  if (days === 0) return t("dueToday", { date });
  return t("dueOn", { date, days });
}

// ---------------------------------------------------------------- dados de pagamento da agência (marca lê)

export function PaymentDataCard({ agencyName, settings }: { agencyName: string; settings: PaymentSettings | null }) {
  const t = useTranslations("payments.data");
  const tt = useTranslations("payments.settings");
  const { toast } = useToast();
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("copied"), variant: "success" });
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  }
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="payment-data">
      <h2 className="text-base font-semibold text-fg">{t("title", { agency: agencyName })}</h2>
      {!settings ? (
        <p className="type-body-sm text-fg-muted">{t("missing")}</p>
      ) : (
        <dl className="flex flex-col gap-3 text-sm">
          {settings.pixKey && settings.pixKeyType ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
              <dt className="type-caption text-fg-muted">{t("pix", { type: tt(`pixTypes.${settings.pixKeyType}`) })}</dt>
              <dd className="break-all font-mono text-base font-semibold text-fg" data-testid="pix-key">
                {formatPixKey(settings.pixKeyType, settings.pixKey)}
              </dd>
              <Button type="button" size="md" leadingIcon={<Copy />} onClick={() => copy(settings.pixKey!)} className="w-full sm:w-fit" data-testid="pix-copy">
                {t("copy")}
              </Button>
            </div>
          ) : null}
          {settings.bankName ? (
            <div>
              <dt className="type-caption text-fg-muted">{t("bank")}</dt>
              <dd className="text-fg">
                {settings.bankName} · {t("branch")} {settings.bankBranch} · {t("account")} {settings.bankAccount}
                {settings.bankAccountType ? ` (${tt(`accountTypes.${settings.bankAccountType}`)})` : ""}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="type-caption text-fg-muted">{t("holder")}</dt>
            <dd className="text-fg">
              {settings.holderName} · {formatTaxId(settings.holderTaxId)}
            </dd>
          </div>
          {settings.instructions ? (
            <div>
              <dt className="type-caption text-fg-muted">{t("instructions")}</dt>
              <dd className="whitespace-pre-line text-fg">{settings.instructions}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- marca: lista e "Informar pagamento"

export function BrandPaymentsList({ items, today, canAct }: { items: Receivable[]; today: string; canAct: boolean }) {
  const t = useTranslations("payments");
  const locale = useLocale() as Locale;
  const [reporting, setReporting] = useState<{ receivable: Receivable; installment: Installment } | null>(null);
  const { view, pending } = useReceiptViewer();
  return (
    <ul className="flex flex-col gap-3" data-testid="brand-payments">
      {items.map((r) => (
        <li key={r.entryId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="receivable">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-base font-semibold text-fg">{r.title}</span>
              <span className="type-caption text-fg-muted">
                {t(`origin.${r.origin}`)} · {r.agencyName}
              </span>
            </div>
            <span className="font-mono text-base font-semibold text-fg">{formatCents(r.totalCents, locale)}</span>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {r.installments.map((i) => {
              const state = r.entryStatus === "settled" ? "paid" : installmentState(i, today);
              const report = i.report;
              return (
                <li key={i.id} className="flex flex-col gap-2 p-3" data-testid="installment">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">{i.label || t("installment", { n: i.seq, total: r.installments.length })}</span>
                    <InstallmentBadge state={state} />
                    <span className="ml-auto font-mono text-sm font-semibold text-fg">{formatCents(i.amountCents, locale)}</span>
                  </div>
                  <span className={`type-caption ${state === "overdue" ? "text-danger" : "text-fg-muted"}`}>{dueText(t, i, state, today, locale)}</span>
                  {report && state !== "paid" ? (
                    <div className={`rounded-lg px-3 py-2 type-body-sm ${report.status === "rejected" ? "bg-danger-soft text-fg" : "bg-surface-elevated text-fg"}`}>
                      {report.status === "rejected"
                        ? t("rejectedNote", { note: report.reviewNote })
                        : t("reportedLine", { date: formatPlainDate(report.paidOn, locale), amount: formatCents(report.amountCents, locale), name: report.reportedLabel || "—" })}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {canAct && canReport(i, r.entryStatus) ? (
                      <Button type="button" size="md" leadingIcon={<FileUp />} onClick={() => setReporting({ receivable: r, installment: i })} data-testid="payment-report">
                        {report?.status === "rejected" ? t("reportAgain") : t("report")}
                      </Button>
                    ) : null}
                    {report?.documentId ? (
                      <Button type="button" size="sm" variant="ghost" leadingIcon={<Eye />} onClick={() => view(report.documentId!)} disabled={pending}>
                        {t("viewReceipt")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
      {reporting ? <ReportDialog receivable={reporting.receivable} installment={reporting.installment} today={today} onClose={() => setReporting(null)} /> : null}
    </ul>
  );
}

function ReportDialog({ receivable, installment, today, onClose }: { receivable: Receivable; installment: Installment; today: string; onClose: () => void }) {
  const t = useTranslations("payments.brand");
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(centsToBrl(installment.amountCents));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    const cents = brlToCents(amount);
    if (!paidOn) return setError(t("dateRequired"));
    if (cents === null || cents < 1) return setError(t("amountInvalid"));
    const file = fileRef.current?.files?.[0] ?? null;
    if (file && !(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return setError(t("badType"));
    if (file && (file.size < 1 || file.size > DOCUMENT_MAX_BYTES)) return setError(t("tooLarge"));
    start(async () => {
      let documentId: string | null = null;
      if (file) {
        const reserved = await reserveDocumentAction({
          agencyId: receivable.agencyId,
          scopeType: "deal",
          scopeId: receivable.dealId,
          kind: "other",
          title: t("receiptTitle", { title: receivable.title }).slice(0, 120),
          mimeType: file.type as DocumentMime,
          sizeBytes: file.size,
          revalidate: REVALIDATE,
        });
        if (!reserved.ok || !reserved.id || !reserved.path) return setError(reserved.ok ? t("uploadFailed") : reserved.error);
        const { error: uploadError } = await createClient().storage.from("agency-docs").upload(reserved.path, file, { upsert: false, contentType: file.type });
        if (uploadError) return setError(t("uploadFailed"));
        const confirmed = await confirmDocumentAction({ id: reserved.id, revalidate: REVALIDATE });
        if (!confirmed.ok) return setError(confirmed.error);
        documentId = reserved.id;
      }
      const r = await reportPaymentAction({ installmentId: installment.id, paidOn, amountCents: cents, documentId, note });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("reportTitle")}
      description={t("reportHint")}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} data-testid="payment-report-submit">
            {t("submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label={t("paidOn")} required>
          <DatePicker value={paidOn} onChange={setPaidOn} max={today} required disabled={pending} />
        </FormField>
        <FormField label={t("amount")} required>
          <MoneyInput value={amount} maxCents={10_000_000_000} onValueChange={(v) => setAmount(v)} disabled={pending} />
        </FormField>
        <FormField label={t("file")} hint={t("fileHint")}>
          <input
            ref={fileRef}
            type="file"
            accept={DOCUMENT_MIME_TYPES.join(",")}
            disabled={pending}
            className="block w-full text-sm text-fg file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:text-sm file:font-semibold file:text-accent-text"
          />
        </FormField>
        <FormField label={t("note")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} disabled={pending} />
        </FormField>
        {error ? (
          <p className="type-body-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- agência (Adm): parcelas, conferir e confirmar

export function AgencyPaymentsList({ items, today }: { items: Receivable[]; today: string }) {
  const t = useTranslations("payments");
  const ta = useTranslations("payments.agency");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const { view, pending: viewing } = useReceiptViewer();
  const [splitting, setSplitting] = useState<Receivable | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function confirm(reportId: string) {
    start(async () => {
      const r = await reviewPaymentAction({ reportId, decision: "confirm", note: "" });
      toast({ title: r.ok ? r.message : r.error, variant: r.ok ? "success" : "error" });
    });
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="agency-payments">
      {items.map((r) => {
        const splittable =
          (r.entryStatus === "planned" || r.entryStatus === "due") && r.installments.every((i) => i.status === "open" && i.report?.status !== "reported");
        return (
          <li key={r.entryId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="receivable">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-semibold text-fg">{r.brandName}</span>
                <span className="type-caption text-fg-muted">
                  {r.title} · {t(`origin.${r.origin}`)}
                </span>
              </div>
              <span className="font-mono text-base font-semibold text-fg">{formatCents(r.totalCents, locale)}</span>
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {r.installments.map((i) => {
                const state = r.entryStatus === "settled" ? "paid" : installmentState(i, today);
                const report = i.report;
                return (
                  <li key={i.id} className="flex flex-col gap-2 p-3" data-testid="installment">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{i.label || t("installment", { n: i.seq, total: r.installments.length })}</span>
                      <InstallmentBadge state={state} />
                      <span className="ml-auto font-mono text-sm font-semibold text-fg">{formatCents(i.amountCents, locale)}</span>
                    </div>
                    <span className={`type-caption ${state === "overdue" ? "text-danger" : "text-fg-muted"}`}>{dueText(t, i, state, today, locale)}</span>
                    {report && report.status === "reported" ? (
                      <div className="flex flex-col gap-2 rounded-lg bg-warning-soft/50 px-3 py-2" data-testid="payment-reported">
                        <span className="type-body-sm text-fg">
                          {t("reportedLine", { date: formatPlainDate(report.paidOn, locale), amount: formatCents(report.amountCents, locale), name: report.reportedLabel || "—" })}
                        </span>
                        {report.amountCents !== i.amountCents ? <span className="type-caption text-warning">{ta("amountDiffers")}</span> : null}
                        {report.note ? <span className="type-body-sm text-fg-muted">“{report.note}”</span> : null}
                        <div className="flex flex-wrap gap-2">
                          {report.documentId ? (
                            <Button type="button" size="sm" variant="secondary" leadingIcon={<Eye />} onClick={() => view(report.documentId!)} disabled={viewing}>
                              {t("viewReceipt")}
                            </Button>
                          ) : (
                            <span className="self-center type-caption text-fg-muted">{ta("noReceipt")}</span>
                          )}
                          <Button type="button" size="sm" leadingIcon={<Check />} onClick={() => confirm(report.id)} loading={pending} data-testid="payment-confirm">
                            {ta("confirm")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" leadingIcon={<X />} onClick={() => setRejecting(report.id)} disabled={pending}>
                            {ta("reject")}
                          </Button>
                        </div>
                      </div>
                    ) : report?.status === "rejected" && state !== "paid" ? (
                      <span className="type-caption text-fg-muted">{ta("lastRejected", { note: report.reviewNote })}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {splittable ? (
              <Button type="button" size="sm" variant="secondary" leadingIcon={<Split />} className="w-fit" onClick={() => setSplitting(r)} data-testid="payment-split">
                {ta("split")}
              </Button>
            ) : null}
          </li>
        );
      })}
      {splitting ? <SplitDialog receivable={splitting} today={today} onClose={() => setSplitting(null)} /> : null}
      {rejecting ? <RejectDialog reportId={rejecting} onClose={() => setRejecting(null)} /> : null}
    </ul>
  );
}

function RejectDialog({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const t = useTranslations("payments.agency");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (note.trim().length < 5) return setError(t("noteRequired"));
    start(async () => {
      const r = await reviewPaymentAction({ reportId, decision: "reject", note });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("rejectTitle")}
      description={t("rejectHint")}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending}>
            {t("reject")}
          </Button>
        </>
      }
    >
      <FormField label={t("note")} error={error} required>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} disabled={pending} />
      </FormField>
    </Dialog>
  );
}

type PartRow = { label: string; amount: string; dueOn: string };

function SplitDialog({ receivable, today, onClose }: { receivable: Receivable; today: string; onClose: () => void }) {
  const t = useTranslations("payments.agency");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [rows, setRows] = useState<PartRow[]>(
    receivable.installments.map((i) => ({ label: i.label, amount: centsToBrl(i.amountCents), dueOn: i.dueOn ?? today })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parts: SplitPart[] = rows.map((r) => ({ label: r.label, amountCents: brlToCents(r.amount), dueOn: r.dueOn }));
  const remaining = splitRemaining(receivable.totalCents, parts);
  const first = receivable.installments[0]?.dueOn ?? today;

  function preset(n: number) {
    const amounts = splitEvenly(receivable.totalCents, n);
    const labels = n === 2 ? [t("presetSign"), t("presetDelivery")] : [];
    setRows(amounts.map((a, i) => ({ label: labels[i] ?? "", amount: centsToBrl(a), dueOn: rows[i]?.dueOn ?? first })));
  }
  function run() {
    setError(null);
    start(async () => {
      const r = await splitReceivableAction({ entryId: receivable.entryId, totalCents: receivable.totalCents, parts });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("splitTitle")}
      description={t("splitHint", { total: formatCents(receivable.totalCents, locale) })}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} disabled={remaining !== 0} data-testid="payment-split-submit">
            {t("splitSave")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => preset(1)} disabled={pending}>
            {t("presetSingle")}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => preset(2)} disabled={pending}>
            {t("presetHalf")}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => preset(3)} disabled={pending}>
            {t("presetThree")}
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
              <FormField label={t("partLabel", { n: i + 1 })} className="sm:col-span-2">
                <Input value={row.label} onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={60} placeholder={t("partLabelPlaceholder")} disabled={pending} />
              </FormField>
              <FormField label={t("amount")}>
                <MoneyInput value={row.amount} maxCents={receivable.totalCents} onValueChange={(v) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, amount: v } : x)))} disabled={pending} />
              </FormField>
              <FormField label={t("dueOn")}>
                <DatePicker value={row.dueOn} onChange={(v) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, dueOn: v } : x)))} required disabled={pending} />
              </FormField>
              {rows.length > 1 ? (
                <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} className="w-fit sm:col-span-2" onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))} disabled={pending}>
                  {t("removePart")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          leadingIcon={<Plus />}
          className="w-fit"
          onClick={() => setRows((cur) => [...cur, { label: "", amount: centsToBrl(Math.max(remaining, 0) || null), dueOn: cur[cur.length - 1]?.dueOn ?? first }])}
          disabled={pending || rows.length >= MAX_INSTALLMENTS}
        >
          {t("addPart")}
        </Button>
        <p className={`type-body-sm ${remaining === 0 ? "text-success" : "text-warning"}`} data-testid="split-remaining">
          {remaining === 0 ? t("sumOk") : remaining > 0 ? t("sumMissing", { amount: formatCents(remaining, locale) }) : t("sumOver", { amount: formatCents(-remaining, locale) })}
        </p>
        {error ? (
          <p className="type-body-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
