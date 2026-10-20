import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  /** Cores fixas da marca (padrão) ou herdadas de currentColor. */
  monochrome?: boolean;
  title?: string;
};

// Marca: triângulo em degraus (três trapézios empilhados, subindo).
export function LogoMark({ className, monochrome = false, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      className={cn("size-8 shrink-0", className)}
    >
      {title && <title>{title}</title>}
      <path d="M4 58h56L50 42H14z" fill={monochrome ? "currentColor" : "#FF8A2B"} />
      <path d="M15 37h34l-8-16H23z" fill={monochrome ? "currentColor" : "#FFA45C"} opacity={monochrome ? 0.75 : 1} />
      <path d="M24.5 16h15L35 6h-6z" fill={monochrome ? "currentColor" : "#E8E3DB"} opacity={monochrome ? 0.5 : 1} />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
};

const markSizes = { sm: "size-7", md: "size-8", lg: "size-12" };
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" };

// Marca + wordmark "ULTRA HERO".
export function Logo({ className, size = "md", withWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markSizes[size]} />
      {withWordmark && (
        <span className={cn("font-extrabold uppercase leading-none tracking-[0.18em] text-fg", textSizes[size])}>
          Ultra <span className="text-accent-text">Hero</span>
        </span>
      )}
    </span>
  );
}
