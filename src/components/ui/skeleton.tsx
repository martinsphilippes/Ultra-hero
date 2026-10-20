import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = ComponentProps<"div"> & {
  variant?: "rect" | "text" | "circle";
};

// Placeholder de carregamento. Decorativo: aria-hidden; anuncie o estado no container.
export function Skeleton({ className, variant = "rect", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "shimmer",
        variant === "rect" && "rounded-lg",
        variant === "text" && "h-4 rounded-sm",
        variant === "circle" && "rounded-full",
        className,
      )}
      {...props}
    />
  );
}

// Esqueleto de card de conteúdo (capa 16:9 + duas linhas).
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} aria-hidden="true">
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Skeleton variant="text" className="w-3/4" />
      <Skeleton variant="text" className="w-1/2" />
    </div>
  );
}
