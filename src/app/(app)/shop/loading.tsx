import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto da aba Comprar (cabeçalho, chips de filtro e grade de 3 por linha).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-sm" />
        <Skeleton variant="text" className="w-1/2 max-w-xs" />
      </div>
      <div className="flex gap-2 overflow-hidden py-2">
        <Skeleton className="h-11 w-16 shrink-0 rounded-full" />
        <Skeleton className="h-11 w-28 shrink-0 rounded-full" />
        <Skeleton className="h-11 w-28 shrink-0 rounded-full" />
        <Skeleton className="h-11 w-20 shrink-0 rounded-full" />
      </div>
      <div className="-mx-gutter grid grid-cols-3 gap-x-0.5 gap-y-3 md:mx-0 md:grid-cols-4 md:gap-x-4 md:gap-y-6 lg:grid-cols-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5" aria-hidden="true">
            <Skeleton className="aspect-square w-full rounded-none" />
            <Skeleton variant="text" className="mx-1.5 w-3/4 md:mx-0" />
            <Skeleton variant="text" className="mx-1.5 w-1/3 md:mx-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
