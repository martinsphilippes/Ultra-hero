"use client";

import { Ban, CheckCircle2, Send, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { decideBrandCallAction, reviewBrandCallAction, submitBrandCallAction } from "@/lib/brand-call/actions";
import type { BrandCallDetail } from "@/lib/brand-call/logic";
import { callBrandControls } from "@/lib/brand-call/logic";

type Props = { detail: BrandCallDetail };

// Rascunho da chamada (0089 + aprovação interna da 0081): a equipe pede ao dono; o dono publica ou devolve com nota;
// quem pediu retira. O dono também cancela o rascunho. Depois de publicada, as decisões ficam no painel das propostas.
export function BrandCallControls({ detail }: Props) {
  const t = useTranslations("brandCall.approval");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const { call, role } = detail;
  const can = callBrandControls({ status: call.status, approval: call.approval, decidedAt: call.decidedAt }, role);
  const [note, setNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      setConfirmCancel(false);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setNote("");
      router.refresh();
    });
  }

  if (call.status !== "draft") return null;
  return (
    <section aria-labelledby="call-approval" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="brand-call-controls">
      <h2 id="call-approval" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      {call.approval === "pending" ? (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="brand-call-pending">
          {t("pending", { name: call.approvalRequestedLabel || "—", date: call.approvalRequestedAt ? formatDateTime(call.approvalRequestedAt, locale) : "—" })}
          {call.approvalRequestNote ? ` “${call.approvalRequestNote}”` : ""}
        </p>
      ) : call.approval === "returned" ? (
        <p className="rounded-xl border border-border bg-surface-hover px-3 py-2 type-body-sm text-fg" data-testid="brand-call-returned">
          {t("returned", { name: call.approvalDecidedLabel || "—" })}
          {call.approvalDecisionNote ? ` “${call.approvalDecisionNote}”` : ""}
        </p>
      ) : (
        <p className="type-body-sm text-fg-muted">{role === "owner" ? t("draftOwner") : t("draftStaff")}</p>
      )}
      {can.review || can.submit ? (
        <FormField label={can.review ? t("reviewNote") : t("requestNote")}>
          <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {can.review ? (
          <>
            <Button type="button" size="lg" leadingIcon={<CheckCircle2 />} onClick={() => run(() => reviewBrandCallAction({ id: call.id, decision: "approve", note }))} disabled={pending} data-testid="brand-call-approve">
              {t("approve")}
            </Button>
            <Button type="button" size="lg" variant="secondary" leadingIcon={<Undo2 />} onClick={() => run(() => reviewBrandCallAction({ id: call.id, decision: "return", note }))} disabled={pending}>
              {t("return")}
            </Button>
          </>
        ) : can.submit ? (
          <Button type="button" size="lg" leadingIcon={<Send />} onClick={() => run(() => submitBrandCallAction({ id: call.id, note }))} disabled={pending} data-testid="brand-call-submit">
            {role === "owner" ? t("publish") : t("ask")}
          </Button>
        ) : null}
        {can.withdraw && (role === "owner" || call.approvalRequestedByMe) && !can.review ? (
          <Button type="button" size="lg" variant="secondary" leadingIcon={<Undo2 />} onClick={() => run(() => reviewBrandCallAction({ id: call.id, decision: "withdraw", note: "" }))} disabled={pending}>
            {t("withdraw")}
          </Button>
        ) : null}
        {can.cancel ? (
          <Button type="button" size="lg" variant="ghost" leadingIcon={<Ban />} onClick={() => setConfirmCancel(true)} disabled={pending}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("confirmCancelTitle")}
        description={t("confirmCancel")}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirmCancel(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="danger" onClick={() => run(() => decideBrandCallAction({ id: call.id, action: "cancel", proposalIds: [], note: "" }))} disabled={pending}>
              {t("cancel")}
            </Button>
          </div>
        }
      />
    </section>
  );
}
