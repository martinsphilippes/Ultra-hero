"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { closeRetentionException, revokeInvitation, revokeMembership, setCreatorStatus, setFeedbackStatus, setSellerStatus } from "@/app/admin/ops-actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Button, useToast } from "@/components/ui";

// Botões de ação crítica (2 passos + justificativa) que chamam as RPCs auditadas.

export function RevokeInvitationButton({ id }: { id: string }) {
  const t = useTranslations("adminOps.invitations");
  return (
    <ConfirmActionDialog
      triggerSize="md"
      triggerLabel={t("revoke")}
      triggerVariant="ghost"
      title={t("revokeTitle")}
      description={t("revokeDescription")}
      requireJustification
      destructive
      action={(justification) => revokeInvitation({ id }, justification)}
    />
  );
}

export function CreatorStatusButton({ id, status }: { id: string; status: "pending" | "active" | "suspended" }) {
  const t = useTranslations("adminOps.creators.status");
  const suspend = status === "active";
  return (
    <ConfirmActionDialog
      triggerSize="md"
      triggerLabel={suspend ? t("suspend") : t("activate")}
      triggerVariant={suspend ? "ghost" : "secondary"}
      title={suspend ? t("suspendTitle") : t("activateTitle")}
      description={suspend ? t("suspendDescription") : undefined}
      requireJustification
      destructive={suspend}
      action={(justification) => setCreatorStatus({ id, status: suspend ? "suspended" : "active" }, justification)}
    />
  );
}

export function SellerStatusButton({ id, status }: { id: string; status: "pending" | "active" | "suspended" }) {
  const t = useTranslations("adminOps.sellers.status");
  const suspend = status === "active";
  return (
    <ConfirmActionDialog
      triggerSize="md"
      triggerLabel={suspend ? t("suspend") : t("activate")}
      triggerVariant={suspend ? "ghost" : "secondary"}
      title={suspend ? t("suspendTitle") : t("activateTitle")}
      description={suspend ? t("suspendDescription") : undefined}
      requireJustification
      destructive={suspend}
      action={(justification) => setSellerStatus({ id, status: suspend ? "suspended" : "active" }, justification)}
    />
  );
}

export function MembershipRevokeButton({ membershipId, orgId }: { membershipId: string; orgId: string }) {
  const t = useTranslations("adminOps.sellers.memberships");
  return (
    <ConfirmActionDialog
      triggerSize="md"
      triggerLabel={t("revoke")}
      triggerVariant="ghost"
      title={t("revokeTitle")}
      description={t("revokeDescription")}
      requireJustification
      destructive
      action={(justification) => revokeMembership({ membershipId, orgId }, justification)}
    />
  );
}

export function CloseExceptionButton({ id }: { id: string }) {
  const t = useTranslations("adminOps.settings.retention");
  return (
    <ConfirmActionDialog
      triggerSize="md"
      triggerLabel={t("close")}
      triggerVariant="ghost"
      title={t("closeTitle")}
      description={t("closeDescription")}
      requireJustification
      action={(justification) => closeRetentionException({ id }, justification)}
    />
  );
}

// Feedback: ações simples (sem justificativa), com toast.
export function FeedbackStatusButtons({ id, status }: { id: string; status: "new" | "reviewed" | "archived" }) {
  const t = useTranslations("adminOps.feedback");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function set(next: "new" | "reviewed" | "archived") {
    startTransition(async () => {
      const result = await setFeedbackStatus({ id, status: next });
      toast(result.ok ? { title: result.message ?? t("updated"), variant: "success" } : { title: result.error, variant: "error" });
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "reviewed" && (
        <Button type="button" size="sm" variant="secondary" loading={pending} onClick={() => set("reviewed")}>
          {t("markReviewed")}
        </Button>
      )}
      {status !== "archived" && (
        <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => set("archived")}>
          {t("markArchived")}
        </Button>
      )}
      {status !== "new" && (
        <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => set("new")}>
          {t("markNew")}
        </Button>
      )}
    </div>
  );
}
