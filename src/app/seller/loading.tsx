import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto genérico das páginas do portal do fornecedor.
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
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
