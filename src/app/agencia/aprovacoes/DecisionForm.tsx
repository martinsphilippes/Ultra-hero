"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Textarea } from "@/components/ui";
import { decideAccessAction, type DecideState } from "./actions";

const INITIAL: DecideState = { status: "idle" };

// Aprovar (um toque) ou recusar (com motivo opcional e confirmação). Recusado ainda pode ser aprovado depois.
export function DecisionForm({ userId, mode }: { userId: string; mode: "pending" | "rejected" }) {
  const t = useTranslations("access.queue");
  const [state, action, pending] = useActionState(decideAccessAction, INITIAL);
  const [rejecting, setRejecting] = useState(false);

  if (state.status === "done") {
    return (
      <p role="status" className="type-body-sm font-medium text-fg" data-testid="decision-done">
        {state.decision === "approved" ? t("approved") : t("rejected")}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2" data-testid={`decision-form-${userId}`}>
      <input type="hidden" name="userId" value={userId} />
      {rejecting ? (
        <>
          <label className="flex flex-col gap-1 type-body-sm text-fg">
            {t("note")}
            <Textarea name="note" maxLength={500} rows={2} placeholder={t("notePlaceholder")} data-testid="decision-note" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value="rejected" variant="danger" size="sm" loading={pending} data-testid="decision-reject-confirm">
              {t("confirmReject")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={pending}>
              {t("cancel")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="decision" value="approved" size="sm" loading={pending} data-testid="decision-approve">
            {mode === "rejected" ? t("reconsider") : t("approve")}
          </Button>
          {mode === "pending" ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setRejecting(true)} disabled={pending} data-testid="decision-reject">
              {t("reject")}
            </Button>
          ) : null}
        </div>
      )}
      {state.status === "error" ? (
        <p role="alert" className="type-caption font-medium text-danger" data-testid="decision-error">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
