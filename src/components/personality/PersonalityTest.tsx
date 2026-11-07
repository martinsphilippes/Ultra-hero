"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, ProgressBar } from "@/components/ui";
import { savePersonalityAction } from "@/lib/personality/actions";
import { QUESTION_ORDER } from "@/lib/personality/test";
import { cn } from "@/lib/utils";

// 32 frases, uma resposta de 1 a 5 cada (toque grande, uma frase por cartão). Envia tudo de uma vez no fim.
export function PersonalityTest() {
  const t = useTranslations("personality");
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = Object.keys(answers).length;
  const total = QUESTION_ORDER.length;

  return (
    <div className="flex flex-col gap-4" data-testid="personality-test">
      <div className="sticky top-0 z-10 flex flex-col gap-1 bg-bg/95 py-2 backdrop-blur">
        <ProgressBar value={(done / total) * 100} label={t("progress", { done, total })} />
        <p className="type-caption text-fg-muted">{t("progress", { done, total })}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {QUESTION_ORDER.map((id, i) => (
          <li key={id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <p className="font-medium text-fg">
              <span className="mr-2 text-fg-subtle">{i + 1}.</span>
              {t(`questions.${id}`)}
            </p>
            <div role="radiogroup" aria-label={t(`questions.${id}`)} className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={answers[id] === v}
                  aria-label={t(`scale.${v}`)}
                  title={t(`scale.${v}`)}
                  onClick={() => setAnswers((a) => ({ ...a, [id]: v }))}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    answers[id] === v ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-muted hover:bg-surface-hover",
                  )}
                  data-testid={`q-${id}-${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex justify-between type-caption text-fg-subtle">
              <span>{t("scale.1")}</span>
              <span>{t("scale.5")}</span>
            </div>
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        block
        loading={pending}
        onClick={() => {
          if (done < total) return setError(t("missing"));
          setError(null);
          start(async () => {
            const r = await savePersonalityAction(answers);
            if (!r.ok) return setError(r.error === "forbidden" ? t("notAllowed") : t("missing"));
            router.refresh();
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        }}
        data-testid="personality-submit"
      >
        {t("submit")}
      </Button>
    </div>
  );
}
