import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto padrão das páginas de operação do admin (cabeçalho + filtros + lista).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" className="h-3 w-16" />
        <Skeleton className="h-9 w-56" />
        <Skeleton variant="text" className="w-2/3 max-w-md" />
      </div>
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
