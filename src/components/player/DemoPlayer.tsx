"use client";

import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { trackProgress } from "@/app/(app)/content/actions";
import { Badge, IconButton, useToast } from "@/components/ui";
import { useCompletionFeedback } from "@/components/library/useCompletionFeedback";
import { cn } from "@/lib/utils";
import { getDeviceTimeZone } from "@/lib/utils/timezone";
import type { TranscriptLine } from "@/lib/video/types";

type Props = {
  contentId: string;
  title: string;
  durationSec: number;
  transcript: TranscriptLine[];
  poster?: string | null;
  initialPositionSec?: number;
  /** Já concluído: não anuncia conclusão de novo. */
  alreadyCompleted?: boolean;
  /** Limiar (%) de conclusão automática, só para informar. */
  threshold: number;
  path?: string;
  className?: string;
};

const REPORT_INTERVAL_MS = 10_000;
const SEEK_STEP = 5;
const SKIP_STEP = 10;

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Player simulado para conteúdos sem mídia real: linha do tempo, legendas a partir da
// transcrição e progresso reportado ao servidor (a cada ~10 s, ao pausar e ao terminar).
export function DemoPlayer({
  contentId,
  title,
  durationSec,
  transcript,
  poster,
  initialPositionSec = 0,
  alreadyCompleted = false,
  threshold,
  path,
  className,
}: Props) {
  const t = useTranslations("consume.player");
  const { toast } = useToast();
  const announce = useCompletionFeedback();
  const duration = Math.max(1, Math.floor(durationSec));
  const startAt = initialPositionSec >= duration ? 0 : Math.max(0, Math.floor(initialPositionSec));
  const [position, setPosition] = useState(startAt);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const positionRef = useRef(startAt);
  const lastReportedRef = useRef<{ pos: number; at: number }>({ pos: startAt, at: 0 });
  const completionAnnounced = useRef(alreadyCompleted);
  const stageRef = useRef<HTMLDivElement>(null);
  const transcriptId = useId();

  const captionIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < transcript.length; i++) {
      if (transcript[i].t <= position) idx = i;
      else break;
    }
    return idx;
  }, [transcript, position]);
  const caption = captionIndex >= 0 ? transcript[captionIndex].text : null;

  // Envia progresso ao servidor; conclusão automática chega como `completed`.
  const report = useCallback(
    async (pos: number, force = false) => {
      const now = Date.now();
      const last = lastReportedRef.current;
      if (!force && (now - last.at < REPORT_INTERVAL_MS || pos === last.pos)) return;
      lastReportedRef.current = { pos, at: now };
      const pct = Math.min(100, Math.round((pos / duration) * 100));
      const result = await trackProgress({ contentId, positionSeconds: pos, pct, timezone: getDeviceTimeZone(), path });
      if (!result.ok) {
        if (result.error !== "unauthenticated") toast({ title: t("syncError"), variant: "error", duration: 3000 });
        return;
      }
      if (result.completed && result.feedback && !completionAnnounced.current) {
        completionAnnounced.current = true;
        announce(result.feedback);
      }
    },
    [announce, contentId, duration, path, t, toast],
  );

  // Linha do tempo simulada (1 tick por segundo enquanto reproduz).
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = positionRef.current + 1;
      if (next >= duration) {
        positionRef.current = duration;
        setPosition(duration);
        setPlaying(false);
        setEnded(true);
        void report(duration, true);
        return;
      }
      positionRef.current = next;
      setPosition(next);
      void report(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, duration, report]);

  // Salva ao sair da página / aba em segundo plano.
  useEffect(() => {
    function flush() {
      if (document.visibilityState === "hidden") void report(positionRef.current, true);
    }
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [report]);

  const seekTo = useCallback(
    (value: number) => {
      const clamped = Math.min(duration, Math.max(0, Math.floor(value)));
      positionRef.current = clamped;
      setPosition(clamped);
      if (clamped < duration) setEnded(false);
    },
    [duration],
  );

  function togglePlay() {
    if (ended || position >= duration) {
      seekTo(0);
      setEnded(false);
      setPlaying(true);
      return;
    }
    if (playing) {
      setPlaying(false);
      void report(positionRef.current, true);
    } else {
      setPlaying(true);
    }
  }

  // Teclado só quando o foco está no palco (botões e slider mantêm o comportamento nativo).
  function onStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seekTo(positionRef.current + SEEK_STEP);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekTo(positionRef.current - SEEK_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      seekTo(duration);
    }
  }

  const pct = Math.round((position / duration) * 100);
  const playLabel = ended ? t("replay") : playing ? t("pause") : t("play");

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-label={t("label", { title })}>
      <div
        ref={stageRef}
        role="group"
        tabIndex={0}
        aria-label={t("label", { title })}
        aria-describedby={`${transcriptId}-hint`}
        onKeyDown={onStageKeyDown}
        onClick={(event) => {
          if (event.target === event.currentTarget) togglePlay();
        }}
        className="relative aspect-video w-full cursor-pointer select-none overflow-hidden rounded-2xl border border-border bg-obsidian text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {poster && <Image src={poster} alt="" fill unoptimized={poster.endsWith(".svg")} sizes="(min-width: 1024px) 60vw, 100vw" className="pointer-events-none object-cover opacity-50" />}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/30 to-transparent" />
        <div className="pointer-events-none absolute left-3 top-3">
          <Badge variant="demo" size="sm">
            {t("demoBadge")}
          </Badge>
        </div>
        {!playing && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg">
              {ended ? <RotateCcw className="size-7" /> : <Play className="ml-1 size-7" />}
            </span>
          </div>
        )}
        {/* Legenda atual (a transcrição completa abaixo é a versão acessível) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
          {caption && (
            <p className="max-w-prose rounded-md bg-black/70 px-3 py-1.5 text-center text-sm font-medium leading-snug text-white md:text-base">{caption}</p>
          )}
          {ended && <p className="type-caption text-white/80">{t("ended")}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 md:p-4">
        <div className="flex items-center gap-2">
          <IconButton label={playLabel} icon={ended ? <RotateCcw /> : playing ? <Pause /> : <Play />} variant="primary" onClick={togglePlay} />
          <IconButton label={t("back10")} icon={<SkipBack />} onClick={() => seekTo(positionRef.current - SKIP_STEP)} />
          <IconButton label={t("forward10")} icon={<SkipForward />} onClick={() => seekTo(positionRef.current + SKIP_STEP)} />
          <span className="ml-auto type-numeric text-sm font-semibold text-fg" aria-live="off">
            <span className="sr-only">{t("time", { current: formatClock(position), total: formatClock(duration) })}</span>
            <span aria-hidden="true">
              {formatClock(position)} / {formatClock(duration)}
            </span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={position}
          onChange={(e) => seekTo(Number(e.target.value))}
          onPointerUp={() => void report(positionRef.current, true)}
          onKeyUp={() => void report(positionRef.current)}
          aria-label={t("seek")}
          aria-valuetext={t("time", { current: formatClock(position), total: formatClock(duration) })}
          className="h-11 w-full cursor-pointer accent-accent"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`${transcriptId}-hint`} className="type-caption text-fg-muted">
            {t("keyboardHint")}
          </p>
          <p className="type-caption text-fg-muted">{t("autoCompleteHint", { pct: threshold })}</p>
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {playing ? t("pause") : ended ? t("ended") : null} {pct}%
        </div>
      </div>

      <p className="type-caption text-fg-muted">{t("demoNote")}</p>

      {transcript.length > 0 && (
        <details className="group rounded-2xl border border-border bg-surface" open>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
            {t("transcript")}
            <span className="type-caption font-normal text-fg-muted">{t("transcriptHint")}</span>
          </summary>
          <ol className="flex flex-col divide-y divide-border border-t border-border" aria-label={t("transcript")}>
            {transcript.map((line, index) => {
              const current = index === captionIndex;
              return (
                <li key={`${line.t}-${index}`}>
                  <button
                    type="button"
                    onClick={() => seekTo(line.t)}
                    aria-current={current ? "true" : undefined}
                    // nome acessível = o texto visível ("0:20 frase"): leitor de voz e comando de voz batem
                    title={t("jumpTo", { time: formatClock(line.t) })}
                    className={cn(
                      "flex min-h-11 w-full items-start gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                      current ? "bg-accent-soft text-fg" : "text-fg-muted",
                    )}
                  >
                    <span className="type-numeric w-10 shrink-0 font-semibold text-accent-text">{formatClock(line.t)}</span>
                    <span>{line.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
