"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import { answerFeedbackAction } from "@/lib/project-room/actions";
import type { Feedback } from "@/lib/project-room/queries";
import { cn } from "@/lib/utils";

type Props = { portal: "brand" | "talent"; dealId: string; feedback: Feedback; agency: string };

// Pesquisa curta do cliente (0110, D10): nota 0–10 (botões grandes) + comentário opcional. Responder de novo atualiza.
export function FeedbackForm({ portal, dealId, feedback, agency }: Props) {
  const t = useTranslations("projectRoom.feedback");
  const { toast } = useToast();
  const [score, setScore] = useState<number | null>(feedback.score);
  const [comment, setComment] = useState(feedback.comment);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answered = feedback.answeredAt !== null;

  function send() {
    setError(null);
    if (score === null) return setError(t("pickScore"));
    start(async () => {
      const result = await answerFeedbackAction({ portal, dealId, id: feedback.id, score, comment: comment.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <section id="feedback" className="flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft/30 p-4 print:hidden" data-testid="feedback-form">
      <div className="flex flex-col gap-1">
        <span className="type-caption font-semibold uppercase tracking-wider text-accent-text">{t(`moments.${feedback.moment}`)}</span>
        <h3 className="text-base font-semibold text-fg">{t("question", { agency })}</h3>
        {answered ? <p className="type-caption text-fg-muted">{t("answered")}</p> : null}
      </div>
      <div role="radiogroup" aria-label={t("scaleLabel")} className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={score === i}
            onClick={() => setScore(i)}
            disabled={pending}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-xl border text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              score === i ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg hover:bg-surface-hover",
            )}
            data-testid={`feedback-score-${i}`}
          >
            {i}
          </button>
        ))}
      </div>
      <p className="flex justify-between type-caption text-fg-muted">
        <span>{t("low")}</span>
        <span>{t("high")}</span>
      </p>
      <FormField label={t("comment")}>
        <Textarea value={comment} maxLength={1000} rows={2} onChange={(e) => setComment(e.target.value)} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="button" onClick={send} loading={pending} leadingIcon={<Send />} className="w-full sm:w-fit" data-testid="feedback-send">
        {answered ? t("update") : t("send")}
      </Button>
    </section>
  );
}
