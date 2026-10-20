import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto da lista de pedidos de teste.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton variant="text" className="h-3 w-24" />
      <Skeleton className="h-9 w-1/2 max-w-xs" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
