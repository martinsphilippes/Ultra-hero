import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";
import { CardsSkeleton } from "@/components/discover/SectionSkeleton";

// Esqueleto do Explorar: cabeçalho, busca, abas, filtros e grade.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton className="h-9 w-48" />
        <Skeleton variant="text" className="w-2/3 max-w-sm" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-24" />
        </div>
      </div>
      <div className="flex gap-3 border-b border-border pb-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-20 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
      <CardsSkeleton />
    </div>
  );
}
