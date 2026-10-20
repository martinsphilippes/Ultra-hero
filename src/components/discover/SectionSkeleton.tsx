import { useTranslations } from "next-intl";
import { Skeleton, SkeletonCard, VisuallyHidden } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CARD_GRID, RAIL, RAIL_ITEM, SCROLL_CARD } from "./grid";

type Layout = "grid" | "scroll" | "rail";

type Props = {
  /** grid: 3 colunas; scroll: carrossel; rail: carrossel no mobile e grade de 4 no desktop. */
  layout?: Layout;
  cards?: number;
  className?: string;
};

// Esqueleto de uma seção do Início (título + cards). Síncrono para servir de fallback de Suspense.
export function SectionSkeleton({ layout = "grid", cards = 3, className }: Props) {
  const t = useTranslations("common.states");
  const container = layout === "scroll" ? "-mx-gutter flex gap-3 overflow-hidden px-gutter" : layout === "rail" ? cn(RAIL, "overflow-hidden") : CARD_GRID;
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-3", className)}>
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton variant="text" className="w-56 max-w-[60vw]" />
        </div>
        <Skeleton variant="text" className="w-16" />
      </div>
      <div className={container}>
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard
            key={i}
            className={cn(
              layout === "scroll" && cn(SCROLL_CARD, "shrink-0"),
              layout === "rail" && RAIL_ITEM,
              layout === "grid" && i >= 2 && "hidden lg:flex",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// Esqueleto de grade de cards (resultados, listas, perfis).
export function CardsSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className={cn(CARD_GRID, className)}>
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className={cn(i >= 2 && "hidden sm:flex", i >= 4 && "hidden lg:flex")} />
      ))}
    </div>
  );
}
