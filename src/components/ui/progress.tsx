import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "accent" | "success" | "warning" | "danger" | "info" | "routine" | "training" | "nutrition" | "gastronomy";

const toneBar: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  routine: "bg-pillar-routine",
  training: "bg-pillar-training",
  nutrition: "bg-pillar-nutrition",
  gastronomy: "bg-pillar-gastronomy",
};

const toneStroke: Record<Tone, string> = {
  accent: "stroke-accent",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
  info: "stroke-info",
  routine: "stroke-pillar-routine",
  training: "stroke-pillar-training",
  nutrition: "stroke-pillar-nutrition",
  gastronomy: "stroke-pillar-gastronomy",
};

function clamp(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

type ProgressBarProps = {
  value: number;
  max?: number;
  /** Rótulo acessível (obrigatório para leitores de tela). */
  label: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  /** Mostra o valor em % ao lado. */
  showValue?: boolean;
  className?: string;
};

// Barra de progresso (role=progressbar).
export function ProgressBar({ value, max = 100, label, tone = "accent", size = "md", showValue = false, className }: ProgressBarProps) {
  const safe = clamp(value, max);
  const percent = max > 0 ? Math.round((safe / max) * 100) : 0;
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={safe}
        aria-valuetext={`${percent}%`}
        className={cn("w-full overflow-hidden rounded-full bg-surface-hover", heights[size])}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out-expo", toneBar[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue && <span className="type-caption type-numeric w-10 shrink-0 text-right text-fg-muted">{percent}%</span>}
    </div>
  );
}

type ProgressRingProps = {
  value: number;
  max?: number;
  label: string;
  tone?: Tone;
  size?: number;
  strokeWidth?: number;
  /** Conteúdo central (padrão: percentual). */
  children?: ReactNode;
  className?: string;
};

// Anel de progresso em SVG, com conteúdo central opcional.
export function ProgressRing({ value, max = 100, label, tone = "accent", size = 72, strokeWidth = 7, children, className }: ProgressRingProps) {
  const safe = clamp(value, max);
  const percent = max > 0 ? safe / max : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={safe}
      aria-valuetext={`${Math.round(percent * 100)}%`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-surface-hover" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out-expo", toneStroke[tone])}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold type-numeric text-fg">
        {children ?? `${Math.round(percent * 100)}%`}
      </span>
    </div>
  );
}
