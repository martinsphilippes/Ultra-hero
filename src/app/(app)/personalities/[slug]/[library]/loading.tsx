import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";
import { TilesSkeleton } from "@/components/discover/SectionSkeleton";

// Esqueleto de uma biblioteca do herói (cabeçalho com volta e grade de quadrados).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-32" />
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton className="h-9 w-48 max-w-full" />
        <Skeleton variant="text" className="w-2/3 max-w-md" />
      </div>
      <TilesSkeleton count={9} />
    </div>
  );
}
