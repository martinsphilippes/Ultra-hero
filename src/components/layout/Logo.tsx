import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  /** Cor fixa da marca (padrão) ou herdada de currentColor. */
  monochrome?: boolean;
  title?: string;
};

/** Laranja da marca, igual ao do material oficial (losango). */
export const BRAND_ORANGE = "#FF5A1F";

// Marca: losango laranja (quadrado a 45°), como no material oficial do Ultra Hero.
export function LogoMark({ className, monochrome = false, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      className={cn("size-8 shrink-0", className)}
    >
      {title && <title>{title}</title>}
      <path d="M32 6 58 32 32 58 6 32z" fill={monochrome ? "currentColor" : BRAND_ORANGE} />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
};

const markSizes = { sm: "size-5", md: "size-6", lg: "size-9" };
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" };

// Marca + wordmark "ULTRA HERO": caixa alta, peso extra e espaçamento largo, como no material oficial.
export function Logo({ className, size = "md", withWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markSizes[size]} />
      {withWordmark && <span className={cn("font-extrabold uppercase leading-none tracking-[0.16em] text-fg", textSizes[size])}>Ultra Hero</span>}
    </span>
  );
}
