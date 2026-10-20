import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto da página de conteúdo (capa, título, ações e corpo).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-8">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton variant="text" className="h-3 w-20" />
      <Skeleton className="aspect-[21/9] w-full rounded-2xl sm:aspect-[3/1]" />
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="w-32" />
        <Skeleton className="h-9 w-3/4 max-w-lg" />
        <Skeleton variant="text" className="w-2/3 max-w-md" />
        <div className="flex items-center gap-3 pt-1">
          <Skeleton variant="circle" className="size-10" />
          <Skeleton variant="text" className="w-40" />
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton className="size-11" />
          <Skeleton className="size-11" />
          <Skeleton className="size-11" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="aspect-video w-full rounded-2xl" />
    </div>
  );
}
