"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { setRoadmapTaskAction } from "@/lib/roadmap/actions";
import { cn } from "@/lib/utils";

// Marcar uma etapa do roteiro como feita direto do painel (o banco confere setor/responsável/equipe).
export function RoadmapDoneButton({ taskId, dealId, title }: { taskId: string; dealId: string; title: string }) {
  const t = useTranslations("roadmap.today");
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          const result = await setRoadmapTaskAction({ taskId, done: true, dealId });
          if (result.ok) setDone(true);
          toast(result.ok ? { title: result.message, variant: "success" } : { title: result.error, variant: "error" });
        })
      }
      aria-label={t("markDone", { title })}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60"
      data-testid="today-done"
    >
      {done ? <CheckCircle2 className="size-6 text-success" aria-hidden="true" /> : <Circle className={cn("size-6", pending && "animate-pulse")} aria-hidden="true" />}
    </button>
  );
}
