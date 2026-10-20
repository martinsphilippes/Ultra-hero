"use client";

import { Archive, RotateCcw, Star, StarOff, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { reviewContentAction, setContentStatusAction, setFeaturedAction } from "@/app/admin/content-actions";
import { ConfirmActionDialog } from "@/components/admin";
import { ActionButton } from "./ActionButton";

type Props = {
  contentId: string;
  status: "draft" | "published" | "archived";
  reviewStatus: "none" | "in_review" | "returned" | "approved" | "rejected";
  isFeatured: boolean;
  hasOpenRound: boolean;
};

// Painel de ações do detalhe do conteúdo: decisão editorial, status e destaque.
export function ContentReviewActions({ contentId, status, reviewStatus, isFeatured, hasOpenRound }: Props) {
  const t = useTranslations("adminContent.content.review");
  const ts = useTranslations("adminContent.content.statusActions");

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="review-actions" className="flex flex-col gap-2">
        <h3 id="review-actions" className="text-sm font-semibold text-fg">
          {t("title")}
        </h3>
        <p className="type-caption text-fg-muted">{t("description")}</p>
        {!hasOpenRound && reviewStatus !== "in_review" && <p className="type-caption text-warning">{t("notInReview")}</p>}
        <div className="flex flex-wrap gap-2">
          <ConfirmActionDialog
            triggerLabel={t("approve")}
            triggerVariant="primary"
            title={t("approveTitle")}
            description={t("description")}
            confirmLabel={t("approve")}
            disabled={status === "archived"}
            action={(feedback) => reviewContentAction(contentId, "approved", feedback)}
          >
            <p className="type-caption text-fg-muted">{t("feedbackHint")}</p>
          </ConfirmActionDialog>
          <ConfirmActionDialog
            triggerLabel={t("return")}
            title={t("returnTitle")}
            requireJustification
            confirmLabel={t("return")}
            action={(feedback) => reviewContentAction(contentId, "returned", feedback)}
          />
          <ConfirmActionDialog
            triggerLabel={t("reject")}
            triggerVariant="danger"
            destructive
            title={t("rejectTitle")}
            requireJustification
            confirmLabel={t("reject")}
            action={(feedback) => reviewContentAction(contentId, "rejected", feedback)}
          />
        </div>
      </section>

      <section aria-labelledby="status-actions" className="flex flex-col gap-2">
        <h3 id="status-actions" className="text-sm font-semibold text-fg">
          {ts("title")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {status !== "published" && (
            <ConfirmActionDialog
              triggerLabel={
                <>
                  <Upload className="size-4" aria-hidden="true" /> {ts("publish")}
                </>
              }
              title={ts("publishTitle")}
              description={ts("publishDescription")}
              requireJustification
              action={(j) => setContentStatusAction(contentId, "published", j)}
            />
          )}
          {status !== "archived" && (
            <ConfirmActionDialog
              triggerLabel={
                <>
                  <Archive className="size-4" aria-hidden="true" /> {ts("archive")}
                </>
              }
              title={ts("archiveTitle")}
              description={ts("archiveDescription")}
              requireJustification
              destructive
              action={(j) => setContentStatusAction(contentId, "archived", j)}
            />
          )}
          {status !== "draft" && (
            <ConfirmActionDialog
              triggerLabel={
                <>
                  <RotateCcw className="size-4" aria-hidden="true" /> {ts("unarchive")}
                </>
              }
              title={ts("draftTitle")}
              requireJustification
              action={(j) => setContentStatusAction(contentId, "draft", j)}
            />
          )}
          <ActionButton
            icon={isFeatured ? <StarOff /> : <Star />}
            variant={isFeatured ? "ghost" : "secondary"}
            action={() => setFeaturedAction("content", contentId, !isFeatured, null)}
          >
            {isFeatured ? ts("featureOff") : ts("featureOn")}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
