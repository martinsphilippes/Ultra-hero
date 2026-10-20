import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto da página de programa.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-8">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton variant="text" className="h-3 w-20" />
      <Skeleton className="aspect-[21/9] w-full rounded-2xl sm:aspect-[3/1]" />
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="w-28" />
        <Skeleton className="h-9 w-2/3 max-w-lg" />
        <Skeleton variant="text" className="w-1/2 max-w-md" />
        <Skeleton className="mt-2 h-12 w-56 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}
