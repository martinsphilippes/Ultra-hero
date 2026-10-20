import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto da página de produto (imagem quadrada + coluna de informações).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-8">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton variant="text" className="h-3 w-16" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="flex flex-col gap-4">
          <Skeleton variant="text" className="w-24" />
          <Skeleton className="h-9 w-5/6" />
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
