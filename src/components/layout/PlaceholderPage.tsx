import { Construction } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type PlaceholderPageProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
};

// Página "em construção" usada enquanto as jornadas reais não existem.
export async function PlaceholderPage({ title, description, eyebrow, children }: PlaceholderPageProps) {
  const t = await getTranslations("common.states");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} eyebrow={eyebrow} />
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
        <EmptyState icon={<Construction />} title={t("underConstruction")} description={t("underConstructionDescription")} />
      </div>
      {children}
    </div>
  );
}
