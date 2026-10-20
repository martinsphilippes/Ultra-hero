"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useToast } from "@/components/ui";
import type { CompletionFeedback } from "@/app/(app)/content/actions";

// Transforma o retorno de complete_content/track_progress em toasts: conclusão, sequência,
// conquistas (nome traduzido pelo código, com fallback ao nome do banco) e programas concluídos.
export function useCompletionFeedback() {
  const t = useTranslations("consume.library");
  const ta = useTranslations("consume.achievements");
  const { toast } = useToast();

  return useCallback(
    (feedback: CompletionFeedback) => {
      toast({
        title: feedback.isNew ? t("completedToast") : t("alreadyCompleted"),
        description: feedback.streak > 0 ? t("streak", { n: feedback.streak }) : t("streakNone"),
        variant: "success",
      });
      for (const achievement of feedback.achievements) {
        const name = ta.has(achievement.code) ? ta(achievement.code) : achievement.name;
        toast({ title: t("achievementUnlocked", { name }), variant: "info", duration: 6000 });
      }
      if (feedback.programsCompleted.length > 0) {
        toast({ title: t("programCompleted"), variant: "success", duration: 7000 });
      }
    },
    [t, ta, toast],
  );
}

// Mensagem de erro traduzida a partir do código devolvido pelas ações.
export function useActionError() {
  const t = useTranslations("consume.errors");
  return useCallback((code: string) => (t.has(code) ? t(code) : t("generic")), [t]);
}
