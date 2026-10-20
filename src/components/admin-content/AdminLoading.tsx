import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

type Props = { variant?: "list" | "detail" | "form" };

// Esqueleto genérico das páginas administrativas (lista, detalhe ou formulário).
export function AdminLoading({ variant = "list" }: Props) {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" className="w-24" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton variant="text" className="w-1/2 max-w-sm" />
      </div>
      {variant === "list" && (
        <>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-36" />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </>
      )}
      {variant === "detail" && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      )}
      {variant === "form" && (
        <div className="flex max-w-2xl flex-col gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton variant="text" className="w-32" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
