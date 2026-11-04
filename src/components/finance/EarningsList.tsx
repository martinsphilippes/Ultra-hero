"use client";

import { Eye, FileUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Badge, Button, FilePicker, FormField, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import { confirmDocumentAction, reserveDocumentAction, signedUrlAction } from "@/lib/documents/actions";
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, type DocumentMime } from "@/lib/documents/constants";
import { attachInvoiceAction } from "@/lib/finance/actions";
import { canSendInvoice, earningGroup, payStep, type Earning, type PayStep } from "@/lib/finance/earnings";
import { createClient } from "@/lib/supabase/client";

const STEP_VARIANT: Record<PayStep, BadgeVariant> = {
  awaiting_contract: "info",
  awaiting_invoice: "warning",
  invoice_sent: "info",
  invoice_approved: "info",
  scheduled: "accent",
  paid: "success",
  cancelled: "neutral",
};
const REVALIDATE = "/heroi/financeiro";

// Lista de pagamentos do influenciador (0082): situação, data prevista e a nota fiscal de cada um. O valor só
// aparece na web (native:hidden, regra da 0072). Enviar a nota: reserva no armazenamento de documentos (escopo do
// negócio), envio direto ao Storage, confirmação e ligação ao repasse — o banco torna o arquivo restrito ao Adm.
export function EarningsList({ items }: { items: Earning[] }) {
  const t = useTranslations("talent.earnings");
  const tc = useTranslations("commercial.finance");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function view(documentId: string) {
    start(async () => {
      const result = await signedUrlAction({ id: documentId });
      if (!result.ok || !result.url) {
        toast({ title: result.ok ? t("openFailed") : result.error, variant: "error" });
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" aria-label={t("listLabel")} data-testid="earnings-list">
      {items.map((e) => {
        const step = payStep(e);
        const group = earningGroup(e);
        const date =
          e.status === "settled" && e.settledAt
            ? t("paidAt", { date: formatDateTime(e.settledAt, locale) })
            : e.scheduledOn
              ? t("scheduledFor", { date: formatPlainDate(e.scheduledOn, locale) })
              : e.dueOn
                ? t(e.status === "forecast" ? "forecastOn" : "expected", { date: formatPlainDate(e.dueOn, locale) })
                : t("noDate");
        const sendable = canSendInvoice(e);
        return (
          <li key={e.id} id={`pay-${e.id}`} className={`flex scroll-mt-20 flex-col gap-2 p-3 sm:p-4 ${e.status === "cancelled" ? "opacity-60" : ""}`} data-testid="earning-item" data-step={step}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{e.dealTitle}</span>
                <span className="type-caption text-fg-muted">{e.brandName}</span>
              </span>
              <span className="font-mono text-base font-semibold text-fg native:hidden">{formatCents(e.amountCents, locale)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge size="sm" variant={STEP_VARIANT[step]}>
                {tc(`payStep.${step}`)}
              </Badge>
              {group ? <span className="type-caption text-fg-muted">{t(`groups.${group}`)}</span> : null}
              <span className="type-caption text-fg">{date}</span>
            </div>
            {e.payoutMethod || (e.invoiceRequired && e.status !== "settled" && e.status !== "cancelled") ? (
              <p className="type-caption text-fg-muted" data-testid="earning-terms">
                {e.payoutMethod ? t(`payoutMethod.${e.payoutMethod}`) : null}
                {e.payoutMethod && e.invoiceRequired ? " · " : null}
                {e.invoiceRequired ? <span className={!e.invoice && e.status !== "forecast" ? "font-medium text-warning" : undefined}>{t("invoiceRequired")}</span> : null}
              </p>
            ) : null}
            {e.invoice?.status === "rejected" && e.invoice.reviewNote ? <p className="type-caption text-danger">{t("rejectedNote", { note: e.invoice.reviewNote })}</p> : null}
            {sendable && !e.delivered ? <p className="type-caption text-fg-muted">{t("inProduction")}</p> : null}
            <div className="flex flex-wrap gap-2">
              {e.invoice?.documentId ? (
                <Button type="button" size="sm" variant="secondary" leadingIcon={<Eye />} onClick={() => view(e.invoice!.documentId!)} disabled={pending}>
                  {t("viewInvoice")}
                </Button>
              ) : null}
              {sendable && openFor !== e.id ? (
                <Button type="button" size="sm" variant={e.delivered ? "primary" : "secondary"} leadingIcon={<FileUp />} onClick={() => setOpenFor(e.id)} data-testid="earning-send-invoice">
                  {e.invoice?.status === "rejected" ? t("sendAnother") : t("sendInvoice")}
                </Button>
              ) : null}
            </div>
            {sendable && openFor === e.id ? <InvoiceForm earning={e} onDone={() => setOpenFor(null)} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function InvoiceForm({ earning, onDone }: { earning: Earning; onDone: () => void }) {
  const t = useTranslations("talent.earnings");
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError(t("pickFile"));
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return setError(t("badType"));
    if (file.size < 1 || file.size > DOCUMENT_MAX_BYTES) return setError(t("tooLarge"));
    start(async () => {
      const reserved = await reserveDocumentAction({
        agencyId: earning.agencyId,
        scopeType: "deal",
        scopeId: earning.dealId,
        kind: "other",
        title: t("invoiceDocTitle", { deal: earning.dealTitle }).slice(0, 120),
        mimeType: file.type as DocumentMime,
        sizeBytes: file.size,
        revalidate: REVALIDATE,
      });
      if (!reserved.ok || !reserved.id || !reserved.path) return setError(reserved.ok ? t("uploadFailed") : reserved.error);
      const { error: uploadError } = await createClient().storage.from("agency-docs").upload(reserved.path, file, { upsert: false, contentType: file.type });
      if (uploadError) return setError(t("uploadFailed"));
      const confirmed = await confirmDocumentAction({ id: reserved.id, revalidate: REVALIDATE });
      if (!confirmed.ok) return setError(confirmed.error);
      const attached = await attachInvoiceAction({ entryId: earning.id, documentId: reserved.id });
      if (!attached.ok) return setError(attached.error);
      toast({ title: attached.message, variant: "success" });
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-border p-3" noValidate data-testid="invoice-form">
      <FormField label={t("file")} hint={t("fileHint")} required error={error}>
        <FilePicker ref={fileRef} accept={DOCUMENT_MIME_TYPES.join(",")} disabled={pending} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} leadingIcon={<FileUp />} data-testid="invoice-submit">
          {t("submit")}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
