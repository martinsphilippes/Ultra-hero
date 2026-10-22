"use client";

import { Archive, CalendarClock, RotateCcw, Star, StarOff, Upload, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { reviewContentAction, setContentStatusAction, setFeaturedAction } from "@/app/admin/content-actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Badge, FormField, Input } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getDeviceTimeZone } from "@/lib/utils/timezone";
import { ActionButton } from "./ActionButton";
import { isScheduled, isoToLocalInput, localInputToIso, parsePublishAt } from "./lib/publish-at";

type Props = {
  contentId: string;
  /** Tipo do conteúdo: receita no ar não volta a rascunho na fase 1 (sem editor para corrigir). */
  type: string;
  status: "draft" | "published" | "archived";
  reviewStatus: "none" | "in_review" | "returned" | "approved" | "rejected";
  isFeatured: boolean;
  hasOpenRound: boolean;
  /** Agendamento atual (ISO) ou null. */
  publishAt: string | null;
};

// Painel de ações do detalhe do conteúdo: decisão editorial, agendamento (RF-007), status e destaque.
// O campo "Publicar em" alimenta tanto a aprovação quanto a publicação direta; vazio = agora.
export function ContentReviewActions({ contentId, type, status, reviewStatus, isFeatured, hasOpenRound, publishAt }: Props) {
  const t = useTranslations("adminContent.content.review");
  const ts = useTranslations("adminContent.content.statusActions");
  const tsch = useTranslations("adminContent.content.schedule");
  const locale = useLocale() as Locale;
  const scheduled = isScheduled(status, publishAt);
  const [tz, setTz] = useState("");
  const [input, setInput] = useState("");

  // O fuso do dispositivo só existe no cliente: evita divergência entre servidor e navegador.
  useEffect(() => {
    const zone = getDeviceTimeZone();
    setTz(zone);
    if (scheduled && publishAt) setInput(isoToLocalInput(publishAt, zone));
  }, [scheduled, publishAt]);

  // ISO do campo (null = publicar agora); erro imediato quando inválido ou no passado (o servidor revalida).
  const schedule = useMemo(() => {
    if (!input.trim()) return { ok: true as const, value: null };
    const iso = localInputToIso(input);
    if (!iso) return { ok: false as const, error: "publish_at_invalid" as const };
    return parsePublishAt(iso);
  }, [input]);
  const scheduleError = schedule.ok ? null : tsch(schedule.error);
  const scheduleValue = schedule.ok ? schedule.value : null;
  const scheduleLabel = scheduleValue ? formatDateTime(scheduleValue, locale, tz || undefined) : null;
  const scheduledLabel = scheduled && publishAt ? formatDateTime(publishAt, locale, tz || undefined) : null;
  // Receita antiga que sai do ar não volta até o editor novo (recipe_incomplete): só arquivar, com aviso.
  const liveRecipe = type === "recipe" && status === "published";

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="schedule-field" className="flex flex-col gap-2">
        <h3 id="schedule-field" className="text-sm font-semibold text-fg">
          {tsch("title")}
        </h3>
        {scheduledLabel && (
          <div>
            <Badge variant="info" icon={<CalendarClock />}>
              {tsch("scheduledFor", { date: scheduledLabel })}
            </Badge>
          </div>
        )}
        <FormField label={tsch("publishAt")} hint={tz ? tsch("hint", { tz }) : tsch("hintNoTz")} error={scheduleError ?? undefined}>
          <Input type="datetime-local" value={input} onChange={(e) => setInput(e.target.value)} />
        </FormField>
        {scheduled && (
          <div className="flex flex-wrap gap-2">
            <ConfirmActionDialog
              triggerLabel={
                <>
                  <Zap className="size-4" aria-hidden="true" /> {ts("publishNow")}
                </>
              }
              triggerVariant="primary"
              title={ts("publishNowTitle")}
              description={ts("publishNowDescription")}
              requireJustification
              action={(j) => setContentStatusAction(contentId, "published", j, null)}
            />
            <ConfirmActionDialog
              triggerLabel={
                <>
                  <CalendarClock className="size-4" aria-hidden="true" /> {ts("reschedule")}
                </>
              }
              title={ts("rescheduleTitle")}
              description={scheduleLabel ? tsch("willPublishAt", { date: scheduleLabel }) : undefined}
              requireJustification
              disabled={!scheduleValue}
              action={(j) => setContentStatusAction(contentId, "published", j, scheduleValue)}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="review-actions" className="flex flex-col gap-2">
        <h3 id="review-actions" className="text-sm font-semibold text-fg">
          {t("title")}
        </h3>
        <p className="type-caption text-fg-muted">{t("description")}</p>
        {!hasOpenRound && reviewStatus !== "in_review" && <p className="type-caption text-warning">{t("notInReview")}</p>}
        <div className="flex flex-wrap gap-2">
          <ConfirmActionDialog
            triggerLabel={scheduleValue ? t("approveSchedule") : t("approve")}
            triggerVariant="primary"
            title={t("approveTitle")}
            description={t("description")}
            confirmLabel={scheduleValue ? t("approveSchedule") : t("approve")}
            disabled={status === "archived" || Boolean(scheduleError)}
            action={(feedback) => reviewContentAction(contentId, "approved", feedback, scheduleValue)}
          >
            <p className="type-caption text-fg-muted">{t("feedbackHint")}</p>
            {scheduleLabel && <p className="type-caption text-info">{tsch("willPublishAt", { date: scheduleLabel })}</p>}
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
                  {scheduleValue ? <CalendarClock className="size-4" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />} {scheduleValue ? ts("schedule") : ts("publish")}
                </>
              }
              title={ts("publishTitle")}
              description={scheduleLabel ? `${ts("publishDescription")} ${tsch("willPublishAt", { date: scheduleLabel })}` : ts("publishDescription")}
              requireJustification
              disabled={Boolean(scheduleError)}
              action={(j) => setContentStatusAction(contentId, "published", j, scheduleValue)}
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
            >
              {liveRecipe && <p className="type-caption text-warning">{ts("archiveRecipeWarning")}</p>}
            </ConfirmActionDialog>
          )}
          {status !== "draft" && !liveRecipe && (
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
