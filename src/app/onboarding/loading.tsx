import { useTranslations } from "next-intl";
import { Skeleton, VisuallyHidden } from "@/components/ui";

// Esqueleto do onboarding.
export default function Loading() {
  const t = useTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <Skeleton variant="text" className="h-3 w-24" />
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
