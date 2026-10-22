import { useTranslations } from "next-intl";
import { Skeleton, SkeletonCard, VisuallyHidden } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RECIPE_GRID as GRID } from "./grid";

// Esqueleto do catálogo de receitas: atalhos de filtro e 8 cards (fallback do Suspense).
export function RecipeCatalogSkeleton({ count = 8 }: { count?: number }) {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4" data-testid="recipe-catalog-skeleton">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className={GRID}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} className={cn(i >= 4 && "hidden md:flex", i >= 6 && "md:hidden lg:flex")} />
        ))}
      </div>
    </div>
  );
}
