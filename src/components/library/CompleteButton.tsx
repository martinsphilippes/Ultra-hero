"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { completeContent } from "@/app/(app)/content/actions";
import { Badge, Button, ProgressBar, useToast } from "@/components/ui";
import { getDeviceTimeZone } from "@/lib/utils/timezone";
import { useActionError, useCompletionFeedback } from "./useCompletionFeedback";

type Props = {
  contentId: string;
  /** Modo efetivo (override do conteúdo ou padrão do tipo). */
  mode: "manual" | "auto";
  /** Permite marcar manualmente mesmo em modo auto (ex.: embed sem progresso mensurável). */
  allowManual?: boolean;
  /** Limiar de conclusão automática (content_type_settings). */
  threshold: number;
  completedLabel: string | null;
  progressPct: number;
  path?: string;
  className?: string;
};

// Conclusão manual (tipos manuais) ou estado de progresso (tipos automáticos).
// "Concluído em <data>" chega já formatado do servidor (fuso do perfil).
export function CompleteButton({ contentId, mode, allowManual = false, threshold, completedLabel, progressPct, path, className }: Props) {
  const t = useTranslations("consume.library");
  const { toast } = useToast();
  const errorMessage = useActionError();
  const announce = useCompletionFeedback();
  const [pending, startTransition] = useTransition();

  if (completedLabel) {
    return (
      <Badge variant="success" icon={<CircleCheck />} className={className} role="status">
        {completedLabel}
      </Badge>
    );
  }

  function onComplete() {
    startTransition(async () => {
      const result = await completeContent({ contentId, timezone: getDeviceTimeZone(), path });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      announce(result.feedback);
    });
  }

  const manual = mode === "manual" || allowManual;

  return (
    <div className={className}>
      {manual ? (
        <Button variant="primary" onClick={onComplete} loading={pending} leadingIcon={<CircleCheck />}>
          {pending ? t("completing") : t("complete")}
        </Button>
      ) : (
        <div className="flex min-w-48 flex-col gap-1.5">
          <ProgressBar value={progressPct} label={t("autoProgress", { pct: progressPct })} size="sm" showValue />
          <p className="type-caption text-fg-muted">{t("autoProgressHint", { threshold })}</p>
        </div>
      )}
    </div>
  );
}
