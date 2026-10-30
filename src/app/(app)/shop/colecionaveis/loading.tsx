import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto dos Colecionáveis (cabeçalho, seletor Loja | Colecionáveis e cartões).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-sm" />
      </div>
      <Skeleton className="h-12 w-full rounded-2xl sm:w-[22rem]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="text" className="w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
