import { useTranslations } from "next-intl";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

// Esqueleto genérico das páginas do consumidor.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-sm" />
        <Skeleton variant="text" className="w-1/2 max-w-xs" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard className="hidden lg:flex" />
      </div>
    </div>
  );
}
