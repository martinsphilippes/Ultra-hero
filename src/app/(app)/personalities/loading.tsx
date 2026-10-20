import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";
import { CardsSkeleton } from "@/components/discover/SectionSkeleton";

// Esqueleto da grade de personalidades.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton variant="text" className="w-2/3 max-w-md" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-11 w-20 rounded-full" />
          <Skeleton className="h-11 w-24 rounded-full" />
          <Skeleton className="h-11 w-24 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
      </div>
      <CardsSkeleton />
    </div>
  );
}
