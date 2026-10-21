import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto do hub do herói (capa, avatar, identidade e a lista de bibliotecas).
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
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-56 max-w-full" />
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex min-h-16 items-center gap-4 px-4 py-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-5 w-28" />
                <Skeleton variant="text" className="h-3 w-16" />
              </div>
              <Skeleton className="size-5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}
