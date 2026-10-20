"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackProgress } from "@/app/(app)/content/actions";
import { ProgressBar } from "@/components/ui";
import { useCompletionFeedback } from "@/components/library/useCompletionFeedback";
import { getDeviceTimeZone } from "@/lib/utils/timezone";

type Props = {
  contentId: string;
  /** id do elemento que contém o texto (medimos a rolagem até o fim dele). */
  targetId: string;
  alreadyCompleted?: boolean;
  threshold: number;
  path?: string;
};

const MILESTONES = [25, 50, 75, 100];

// Progresso de leitura para tipos com conclusão automática (artigo): reporta marcos de
// 25/50/75/100% e ao sair da aba; ao chegar ao fim, o servidor conclui.
export function ReadingTracker({ contentId, targetId, alreadyCompleted = false, threshold, path }: Props) {
  const t = useTranslations("consume.body.guide");
  const announce = useCompletionFeedback();
  const [pct, setPct] = useState(0);
  const pctRef = useRef(0);
  const sentRef = useRef<number>(-1);
  const announced = useRef(alreadyCompleted);

  const report = useCallback(
    async (value: number) => {
      if (value <= sentRef.current) return;
      sentRef.current = value;
      const result = await trackProgress({ contentId, positionSeconds: 0, pct: value, timezone: getDeviceTimeZone(), path });
      if (result.ok && result.completed && result.feedback && !announced.current) {
        announced.current = true;
        announce(result.feedback);
      }
    },
    [announce, contentId, path],
  );

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    let ticking = false;
    function measure() {
      ticking = false;
      const rect = target!.getBoundingClientRect();
      const viewport = window.innerHeight;
      // Fração do texto já passada pela base da janela.
      const read = Math.min(1, Math.max(0, (viewport - rect.top) / Math.max(1, rect.height)));
      const value = Math.round(read * 100);
      if (value !== pctRef.current) {
        pctRef.current = value;
        setPct(value);
        const milestone = [...MILESTONES].reverse().find((m) => value >= m);
        if (milestone) void report(milestone);
      }
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    function onHide() {
      if (document.visibilityState === "hidden" && pctRef.current > 0) void report(Math.min(pctRef.current, 99));
    }
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [targetId, report]);

  return (
    <div className="sticky top-[calc(var(--spacing-topbar,3.5rem)+0.5rem)] z-20 flex flex-col gap-1 rounded-xl border border-border bg-surface/90 px-3 py-2 backdrop-blur-md">
      <ProgressBar value={pct} label={t("readingProgress")} size="sm" showValue />
      {!alreadyCompleted && <p className="type-caption text-fg-muted">{t("readingAutoHint")} ({threshold}%)</p>}
    </div>
  );
}
