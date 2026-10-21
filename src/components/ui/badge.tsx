import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Pillar = "routine" | "training" | "nutrition" | "gastronomy";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "demo"
  | "free"
  | "premium"
  | Pillar;

export const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-hover text-fg-muted border-border",
  accent: "bg-accent-soft text-accent-text border-accent/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  demo: "bg-warning-soft text-warning border-warning/40 border-dashed",
  free: "bg-surface-hover text-fg border-border-strong",
  premium: "bg-accent text-accent-fg border-transparent",
  routine: "bg-pillar-routine-soft text-pillar-routine border-pillar-routine/30",
  training: "bg-pillar-training-soft text-pillar-training border-pillar-training/30",
  nutrition: "bg-pillar-nutrition-soft text-pillar-nutrition border-pillar-nutrition/30",
  gastronomy: "bg-pillar-gastronomy-soft text-pillar-gastronomy border-pillar-gastronomy/30",
};

const sizes = {
  sm: "h-5 px-1.5 text-[0.6875rem] gap-1 [&_svg]:size-3",
  md: "h-6 px-2 text-xs gap-1 [&_svg]:size-3.5",
};

type BadgeProps = ComponentProps<"span"> & {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
};

// Etiqueta não interativa (pilar, plano, status…).
export function Badge({ variant = "neutral", size = "md", icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-mono font-medium uppercase leading-none tracking-wider whitespace-nowrap",
        badgeVariants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

// Etiqueta de pilar já traduzida.
// Na parte do consumidor a etiqueta é neutra (a cor vem do conteúdo, não da interface). Os portais de
// trabalho (admin e herói) ainda usam a cor do pilar para varrer listas: passam tone="pillar".
export function PillarBadge({ pillar, tone = "neutral", ...props }: Omit<BadgeProps, "variant" | "children"> & { pillar: Pillar; tone?: "neutral" | "pillar" }) {
  const t = useTranslations("common.pillars");
  return (
    <Badge variant={tone === "pillar" ? pillar : "neutral"} {...props}>
      {t(pillar)}
    </Badge>
  );
}

// Etiqueta de plano (gratuito/premium) traduzida.
export function PlanBadge({ plan, ...props }: Omit<BadgeProps, "variant" | "children"> & { plan: "free" | "premium" }) {
  const t = useTranslations("common.plans");
  return (
    <Badge variant={plan} {...props}>
      {t(plan)}
    </Badge>
  );
}

// Etiqueta "Demonstração" para tudo que simula comércio.
export function DemoBadge(props: Omit<BadgeProps, "variant" | "children">) {
  const t = useTranslations("common.demo");
  return (
    <Badge variant="demo" {...props}>
      {t("tag")}
    </Badge>
  );
}

type ChipProps = Omit<ComponentProps<"button">, "children"> & {
  selected?: boolean;
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
};

// Chip interativo (filtros, seleção múltipla). Toque mínimo garantido por min-h.
export function Chip({ selected = false, variant = "neutral", icon, className, children, type, ...props }: ChipProps) {
  return (
    <button
      type={type ?? "button"}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        selected
          ? variant === "neutral"
            ? "border-fg bg-fg text-bg"
            : badgeVariants[variant]
          : "border-border-strong bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg",
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className="[&_svg]:size-4">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
