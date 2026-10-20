"use client";

import { MessageSquare, Send, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { DEFAULT_FEEDBACK_CATEGORY, FEEDBACK_CATEGORIES, type FeedbackCategory } from "@/components/feedback/constants";
import { submitFeedback } from "@/components/me/feedback/actions";
import { Button, FormField, Sheet, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = { context: string; className?: string };

const RATINGS = [1, 2, 3, 4, 5] as const;

// Feedback discreto e contextual: botão → Sheet com nota 1–5 (radio group), categoria (chips, padrão "outro")
// e comentário opcional. Um toque na nota + enviar continua bastando. Nunca abre sozinho.
// Erros do banco (rate_limited, feedback_empty, invalid_category) chegam traduzidos.
export function FeedbackWidget({ context, className }: Props) {
  const t = useTranslations("me.feedback");
  const { toast } = useToast();
  const groupId = useId();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>(DEFAULT_FEEDBACK_CATEGORY);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setRating(null);
    setCategory(DEFAULT_FEEDBACK_CATEGORY);
    setMessage("");
    setError(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating === null) {
      setError(t("errors.feedback_empty"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback({ context, rating, message: message.trim(), category });
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      toast({ title: t("thanks"), variant: "success" });
      setOpen(false);
      reset();
    });
  }

  return (
    <div className={cn("flex", className)}>
      <Button variant="ghost" size="sm" leadingIcon={<MessageSquare />} onClick={() => setOpen(true)} className="text-fg-muted">
        {t("button")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) reset();
        }}
        title={t("title")}
        description={t("description")}
      >
        <form id={`${groupId}-form`} onSubmit={onSubmit} className="flex flex-col gap-5 py-2" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-fg">{t("rating")}</legend>
            <div role="radiogroup" aria-label={t("rating")} className="flex gap-1.5">
              {RATINGS.map((value) => {
                const id = `${groupId}-r${value}`;
                const selected = rating === value;
                const label = `${t("ratingOption", { n: value })} — ${t(`ratingLabels.r${value}`)}`;
                return (
                  <div key={value} className="relative">
                    <input
                      id={id}
                      type="radio"
                      name={`${groupId}-rating`}
                      value={value}
                      checked={selected}
                      onChange={() => setRating(value)}
                      disabled={pending}
                      className="peer sr-only"
                      aria-label={label}
                    />
                    <label
                      htmlFor={id}
                      title={label}
                      className={cn(
                        "flex size-11 cursor-pointer items-center justify-center rounded-lg border transition-colors",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                        rating !== null && value <= rating ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted hover:bg-surface-hover",
                      )}
                    >
                      <Star className={cn("size-5", rating !== null && value <= rating && "fill-current")} aria-hidden="true" />
                    </label>
                  </div>
                );
              })}
            </div>
            <p className="type-caption text-fg-muted" aria-live="polite">
              {rating !== null ? `${t("ratingOption", { n: rating })} · ${t(`ratingLabels.r${rating}`)}` : ""}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-fg">{t("category")}</legend>
            <p className="type-caption text-fg-muted">{t("categoryHint")}</p>
            <div role="radiogroup" aria-label={t("category")} className="flex flex-wrap gap-2">
              {FEEDBACK_CATEGORIES.map((value) => {
                const id = `${groupId}-c-${value}`;
                const selected = category === value;
                return (
                  <div key={value} className="relative">
                    <input
                      id={id}
                      type="radio"
                      name={`${groupId}-category`}
                      value={value}
                      checked={selected}
                      onChange={() => setCategory(value)}
                      disabled={pending}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={id}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                        selected ? "border-fg bg-fg text-bg" : "border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg",
                      )}
                    >
                      {t(`categories.${value}`)}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <FormField label={t("message")} hint={t("messageHint")} error={error ?? undefined}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={4} disabled={pending} />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" leadingIcon={<Send />} loading={pending}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
