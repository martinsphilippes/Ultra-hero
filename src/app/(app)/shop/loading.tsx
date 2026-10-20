import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto da loja (cabeçalho, filtros e grade de cards quadrados).
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
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="text" className="w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
