"use client";

import { CircleCheck, Compass } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { completeContent } from "@/app/(app)/content/actions";
import { useActionError, useCompletionFeedback } from "@/components/library/useCompletionFeedback";
import { Badge, Button, EmptyState, useToast } from "@/components/ui";
import { rhythmCounter, type ProgramSuggestion } from "@/lib/routine/today";
import { cn } from "@/lib/utils";
import { getDeviceTimeZone } from "@/lib/utils/timezone";

const PLACEHOLDER_COVER = "/placeholders/cover-routine-1.svg";

// "Continue seus programas": os próximos passos obrigatórios dos programas ativos, que antes
// ficavam no Hoje. Mesma ação de concluir (completeContent → mesma RPC e o mesmo feedback de
// sequência); o estado "feito" é otimista e a revalidação do servidor confirma.
export function ContinuePrograms({ suggestions }: { suggestions: ProgramSuggestion[] }) {
  const t = useTranslations("me.today.programs");
  const { toast } = useToast();
  const announce = useCompletionFeedback();
  const contentError = useActionError();
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const counter = rhythmCounter(suggestions.filter((s) => done.has(s.contentId)).length, suggestions.length);

  async function onComplete(suggestion: ProgramSuggestion) {
    setBusy(suggestion.contentId);
    try {
      const result = await completeContent({ contentId: suggestion.contentId, timezone: getDeviceTimeZone() });
      if (!result.ok) {
        toast({ title: contentError(result.error), variant: "error" });
        return;
      }
      setDone((prev) => new Set(prev).add(suggestion.contentId));
      announce(result.feedback);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="continue-programs-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" data-testid="continue-programs">
      <div className="flex flex-col gap-0.5">
        <h2 id="continue-programs-title" className="type-h3 text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("description")}</p>
        {suggestions.length > 0 ? (
          <p className="type-caption text-fg-muted" aria-live="polite" aria-atomic="true">
            <span className="font-mono type-numeric text-sm font-semibold text-fg" aria-hidden="true">
              {counter.label}
            </span>
            <span className="sr-only">{t("counter", { done: counter.done, total: counter.total })}</span>
          </p>
        ) : null}
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/60">
          <EmptyState
            size="sm"
            icon={<Compass />}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/explore?tab=programas">{t("emptyCta")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="continue-programs-list">
          {suggestions.map((suggestion) => {
            const isDone = done.has(suggestion.contentId);
            return (
              <li key={suggestion.contentId} className="flex min-h-16 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="relative mt-0.5 h-10 w-14 shrink-0 overflow-hidden rounded-md bg-surface-elevated">
                    <Image src={suggestion.coverUrl ?? PLACEHOLDER_COVER} alt="" fill unoptimized sizes="56px" className="object-cover" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/content/${suggestion.contentSlug}`}
                      aria-label={t("openContent", { title: suggestion.title })}
                      className={cn("line-clamp-2 text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", isDone ? "text-fg-muted line-through" : "text-fg")}
                    >
                      {suggestion.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-fg-muted">
                      {suggestion.creatorName ? <span>{t("byHero", { name: suggestion.creatorName })}</span> : null}
                      <Badge variant="info" size="sm" className="h-auto whitespace-normal py-0.5 text-left">
                        {t("fromProgram", { name: suggestion.programName })}
                      </Badge>
                    </span>
                  </div>
                </div>
                {isDone ? (
                  <Badge variant="success" icon={<CircleCheck />} role="status" className="self-start sm:self-auto">
                    {t("done")}
                  </Badge>
                ) : (
                  <Button variant="secondary" size="sm" leadingIcon={<CircleCheck />} loading={busy === suggestion.contentId} onClick={() => onComplete(suggestion)} className="self-end sm:self-auto">
                    {t("markDone")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
