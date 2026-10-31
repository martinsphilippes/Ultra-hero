"use client";

import { EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { Button, useToast } from "@/components/ui";
import { dismissRecommendation, trackRecommendationEvent } from "@/lib/recommendations/actions";

type Props = {
  contentId: string;
  title: string;
  rank: number;
  engine: "deterministic" | "openai" | "gemini";
  /** Justificativa já traduzida (uma linha). */
  reason: string;
  /** O ContentCard (Server Component) vem como filho. */
  children: ReactNode;
};

// Envolve um card recomendado: justificativa e "Não me interessa" (some ao confirmar).
export function RecommendationItem({ contentId, title, rank, engine, reason, children }: Props) {
  const t = useTranslations("me.recommendations");
  const { toast } = useToast();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  function onDismiss() {
    startTransition(async () => {
      const result = await dismissRecommendation({ contentId });
      if (!result.ok) {
        toast({ title: t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"), variant: "error" });
        return;
      }
      toast({ title: t("notInterestedDone"), variant: "info" });
      setHidden(true);
    });
  }

  // Clique no card (link interno) → recommendation.click, sem bloquear a navegação.
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("a")) void trackRecommendationEvent({ kind: "click", contentId, engine, rank });
  }

  return (
    <li className="flex h-full flex-col gap-2">
      <div onClickCapture={onClickCapture} className="flex-1">
        {children}
      </div>
      <p className="type-caption text-fg-muted">{reason}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        leadingIcon={<EyeOff />}
        onClick={onDismiss}
        loading={pending}
        aria-label={t("notInterestedFor", { title })}
        className="self-start text-fg-muted"
      >
        {t("notInterested")}
      </Button>
    </li>
  );
}
