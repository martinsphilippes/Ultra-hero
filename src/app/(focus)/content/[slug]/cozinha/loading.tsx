import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto do Modo Cozinha: topo, progresso, etapa grande e a navegação embaixo.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-gutter py-4">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12" />
        <Skeleton variant="text" className="w-48" />
      </div>
      <Skeleton variant="text" className="w-32" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="mt-auto grid grid-cols-2 gap-3">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </div>
  );
}
