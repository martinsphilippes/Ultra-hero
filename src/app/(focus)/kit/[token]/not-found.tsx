import { Link2Off } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui";

// Link revogado, vencido, sem consentimento ou inexistente: a mesma página (sem dizer qual caso).
export default async function KitNotFound() {
  const t = await getTranslations("mediaKit.public");
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4" data-testid="kit-unavailable">
      <div className="w-full rounded-2xl border border-border bg-surface">
        <EmptyState icon={<Link2Off />} title={t("unavailableTitle")} description={t("unavailableBody")} />
      </div>
    </main>
  );
}
