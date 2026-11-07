"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { DeliverableRating } from "@/lib/deals/queries";
import { rateDeliverableAction } from "@/lib/selection/actions";
import { canRate, COMMENT_MAX, ratingInputValid, RATABLE_STATUSES, suggestOnTime } from "@/lib/selection/logic";

export type RatableDeliverable = {
  id: string;
  title: string;
  kind: string;
  talentName: string;
  status: string;
  dueAt: string | null;
  publishAt: string | null;
  publishedAt: string | null;
  proofAt: string | null;
};

type Props = {
  requestId: string;
  deliverables: RatableDeliverable[];
  ratings: DeliverableRating[];
  canAct: boolean;
};

// Nota do influenciador (0081): uma avaliação por entrega publicada/comprovada — cumpriu o prazo (sim/não),
// qualidade 1–5 e comentário opcional. A sugestão de prazo vem das datas, mas quem decide é a marca.
export function RatingPanel({ requestId, deliverables, ratings, canAct }: Props) {
  const t = useTranslations("selection.rating");
  const locale = useLocale() as Locale;
  const closed = deliverables.filter((d) => (RATABLE_STATUSES as readonly string[]).includes(d.status));
  const byDeliverable = new Map(ratings.map((r) => [r.deliverableId, r]));
  if (closed.length === 0) return <p className="type-body-sm text-fg-muted">{t("none")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border" data-testid="rating-list">
      {closed.map((d) => {
        const done = byDeliverable.get(d.id);
        return (
          <li key={d.id} className="flex flex-col gap-2 py-3">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-fg">{d.title || d.kind}</span>
              <span className="type-caption text-fg-muted">{d.talentName}</span>
            </span>
            {done ? (
              <div className="flex flex-col gap-1" data-testid="rating-done">
                <Stars value={done.quality} label={t("star", { count: done.quality })} />
                <p className="type-caption text-fg-muted">
                  {t("done", {
                    quality: done.quality,
                    onTime: done.onTime ? t("onTimeYes") : t("onTimeNo"),
                    name: done.ratedLabel || "—",
                    date: formatDateTime(done.createdAt, locale),
                  })}
                </p>
                {done.comment ? <p className="type-body-sm text-fg">“{done.comment}”</p> : null}
              </div>
            ) : canAct && canRate(d.status, false) ? (
              <RatingForm requestId={requestId} deliverable={d} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// 0126: score de 0 a 10 (pedido da Groscove), no lugar das 5 estrelas
function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold text-accent-text" role="img" aria-label={label}>
      <Star className="size-3.5 fill-accent text-accent" aria-hidden="true" />
      {value}/10
    </span>
  );
}

function RatingForm({ requestId, deliverable }: { requestId: string; deliverable: RatableDeliverable }) {
  const t = useTranslations("selection.rating");
  const router = useRouter();
  const { toast } = useToast();
  const suggested = suggestOnTime(deliverable);
  const [onTime, setOnTime] = useState<boolean | null>(suggested);
  const [quality, setQuality] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choice = "min-h-11 min-w-16 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  const on = "border-accent bg-accent-soft text-accent-text";
  const off = "border-border text-fg hover:bg-surface-hover";

  function save() {
    setError(null);
    if (quality === null || !ratingInputValid({ onTime, quality, comment })) return setError(t("pickOnTime"));
    start(async () => {
      const result = await rateDeliverableAction({
        deliverableId: deliverable.id,
        requestId,
        onTime: onTime === true,
        quality,
        comment: comment.trim(),
      });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid="rating-form">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-fg">{t("onTime")}</legend>
        <div className="flex gap-2">
          <button type="button" className={`${choice} ${onTime === true ? on : off}`} aria-pressed={onTime === true} onClick={() => setOnTime(true)} disabled={pending}>
            {t("yes")}
          </button>
          <button type="button" className={`${choice} ${onTime === false ? on : off}`} aria-pressed={onTime === false} onClick={() => setOnTime(false)} disabled={pending}>
            {t("no")}
          </button>
        </div>
        {suggested !== null ? (
          <span className="type-caption text-fg-muted">
            {t("suggested", {
              answer: suggested ? t("onTimeYes") : t("onTimeNo"),
            })}
          </span>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-fg">{t("quality")}</legend>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              className={`inline-flex size-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${quality === n ? on : off}`}
              aria-label={t("star", { count: n })}
              aria-pressed={quality === n}
              onClick={() => setQuality(n)}
              disabled={pending}
              data-testid={`rating-star-${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <FormField label={t("comment")} error={error}>
        <Textarea value={comment} maxLength={COMMENT_MAX} rows={2} onChange={(e) => setComment(e.target.value)} disabled={pending} />
      </FormField>
      <div>
        <Button type="button" onClick={save} loading={pending} data-testid="rating-save">
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
