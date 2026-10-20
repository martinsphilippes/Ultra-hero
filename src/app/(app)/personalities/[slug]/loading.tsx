import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";
import { CardsSkeleton } from "@/components/discover/SectionSkeleton";

// Esqueleto do perfil da personalidade (capa, avatar, identidade, abas e grade).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton variant="text" className="h-3 w-28" />
      <Skeleton className="aspect-[21/9] w-full rounded-2xl sm:aspect-[3/1]" />
      <div className="-mt-14 flex flex-col gap-4 px-2 sm:-mt-16 sm:flex-row sm:items-end sm:px-4">
        <Skeleton variant="circle" className="size-24 border-4 border-bg sm:size-28" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-9 w-2/3 max-w-sm" />
          <Skeleton variant="text" className="w-1/2 max-w-xs" />
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl sm:mx-4 sm:w-[calc(100%-2rem)]" />
      <div className="flex gap-3 border-b border-border pb-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-28" />
      </div>
      <CardsSkeleton />
    </div>
  );
}
