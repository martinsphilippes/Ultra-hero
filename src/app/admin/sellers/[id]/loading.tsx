import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto das abas da organização (o cabeçalho e as abas já estão no layout).
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
