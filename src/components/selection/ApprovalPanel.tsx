"use client";

import { CheckCircle2, CornerUpLeft, Send, ShieldCheck, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { CampaignApproval } from "@/lib/deals/queries";
import { askApprovalAction, decideApprovalAction } from "@/lib/selection/actions";
import { approvalActions, NOTE_MAX, RETURN_NOTE_MIN, type ApprovalAction } from "@/lib/selection/logic";

type Props = {
  requestId: string;
  role: "owner" | "staff" | null;
  approval: CampaignApproval;
  isDraft: boolean;
};

// Aprovação interna da marca (0081): o analista pede, o diretor aprova (e envia à agência) ou devolve com nota.
// No rascunho mostra a situação e os botões do papel; depois do envio, quem aprovou e quando.
export function ApprovalPanel({ requestId, role, approval, isDraft }: Props) {
  const t = useTranslations("selection.approval");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState<Exclude<ApprovalAction, "submit"> | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const when = (v: string | null) => (v ? formatDateTime(v, locale) : "");
  const actions = isDraft ? approvalActions(role, approval.status, approval.requestedByMe).filter((a) => a !== "submit") : [];

  function run(action: Exclude<ApprovalAction, "submit">) {
    setError(null);
    const value = note.trim();
    if (action === "return" && value.length < RETURN_NOTE_MIN) return setError(t("returnNoteShort"));
    start(async () => {
      const result =
        action === "ask"
          ? await askApprovalAction({ id: requestId, note: value })
          : await decideApprovalAction({
              id: requestId,
              decision: action,
              note: value,
            });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(null);
      setNote("");
      router.refresh();
    });
  }

  function openDialog(action: Exclude<ApprovalAction, "submit">) {
    setError(null);
    setNote("");
    if (action === "withdraw") return run("withdraw");
    setOpen(action);
  }

  // depois do envio: só o registro (quem pediu, quem aprovou e quando)
  if (!isDraft) {
    if (approval.status !== "approved" || !approval.decidedAt) return null;
    return (
      <section className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4" aria-labelledby="camp-approval-title" id="camp-approval" data-testid="campaign-approval">
        <h2 id="camp-approval-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          {t("approvedBy", {
            name: approval.decidedLabel || "—",
            date: when(approval.decidedAt),
          })}
        </h2>
        {approval.requestedAt ? (
          <p className="type-caption text-fg-muted">
            {t("requestedBy", {
              name: approval.requestedLabel || "—",
              date: when(approval.requestedAt),
            })}
          </p>
        ) : null}
        {approval.decisionNote ? <p className="type-caption text-fg">{t("note", { note: approval.decisionNote })}</p> : null}
      </section>
    );
  }

  const statusLine = () => {
    if (approval.status === "pending")
      return (
        <>
          <Badge size="md" variant="warning">
            {t("pending")}
          </Badge>
          <p className="type-body-sm text-fg">
            {t("requestedBy", {
              name: approval.requestedLabel || "—",
              date: when(approval.requestedAt),
            })}
          </p>
          {approval.requestNote ? <p className="type-caption text-fg">{t("note", { note: approval.requestNote })}</p> : null}
          <p className="type-caption text-fg-muted">{role === "owner" ? t("ownerPendingHint") : t("lockedStaff")}</p>
        </>
      );
    if (approval.status === "returned")
      return (
        <>
          <Badge size="md" variant="danger">
            {t("returned")}
          </Badge>
          <p className="type-body-sm text-fg">
            {t("returnedBy", {
              name: approval.decidedLabel || "—",
              date: when(approval.decidedAt),
            })}
          </p>
          {approval.decisionNote ? <p className="type-body-sm text-fg">{t("note", { note: approval.decisionNote })}</p> : null}
          {role === "staff" ? <p className="type-caption text-fg-muted">{t("staffHint")}</p> : null}
        </>
      );
    return <p className="type-body-sm text-fg-muted">{role === "owner" ? t("ownerHint") : t("staffHint")}</p>;
  };

  const ICON = {
    ask: <Send />,
    approve: <CheckCircle2 />,
    return: <CornerUpLeft />,
    withdraw: <Undo2 />,
  } as const;
  const VARIANT = {
    ask: "primary",
    approve: "primary",
    return: "secondary",
    withdraw: "ghost",
  } as const;
  const dialog = open
    ? {
        title: t(`${open}Title` as "askTitle"),
        hint: t(`${open}Hint` as "askHint"),
        label: open === "return" ? t("returnNote") : open === "approve" ? t("approveNote") : t("askNote"),
      }
    : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="camp-approval-title" id="camp-approval" data-testid="campaign-approval">
      <h2 id="camp-approval-title" className="flex items-center gap-2 text-base font-semibold text-fg">
        <ShieldCheck className="size-4 text-accent-text" aria-hidden="true" />
        {t("title")}
      </h2>
      <div className="flex flex-col items-start gap-1.5">{statusLine()}</div>
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              type="button"
              variant={VARIANT[a]}
              leadingIcon={ICON[a]}
              onClick={() => openDialog(a as Exclude<ApprovalAction, "submit">)}
              loading={pending && a === "withdraw"}
              disabled={pending}
              data-testid={`approval-${a}`}
            >
              {t(a)}
            </Button>
          ))}
        </div>
      ) : null}
      {error && !open ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Dialog
        open={open !== null}
        onOpenChange={(v) => (v ? null : setOpen(null))}
        title={dialog?.title ?? ""}
        description={dialog?.hint}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(null)} disabled={pending}>
              {t("back")}
            </Button>
            {open ? (
              <Button type="button" variant={open === "return" ? "danger" : "primary"} onClick={() => run(open)} loading={pending} leadingIcon={ICON[open]} data-testid="approval-confirm">
                {t(open)}
              </Button>
            ) : null}
          </>
        }
      >
        <FormField label={dialog?.label ?? ""} required={open === "return"} error={error}>
          <Textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
      </Dialog>
    </section>
  );
}
