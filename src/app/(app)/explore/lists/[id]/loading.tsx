import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";
import { CardsSkeleton } from "@/components/discover/SectionSkeleton";

// Esqueleto da página de lista pessoal.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-sm" />
        <Skeleton variant="text" className="w-40" />
      </div>
      <CardsSkeleton />
    </div>
  );
}
