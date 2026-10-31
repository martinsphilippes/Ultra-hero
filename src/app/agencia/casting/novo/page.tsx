import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EMPTY_TALENT, TalentForm } from "@/components/agency/CastingForms";
import { PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { listManagers } from "@/lib/talent/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newTalent") };
}

// Cadastro de talento (com ou sem página pública: o herói é ligado depois, na ficha).
export default async function NewTalentPage() {
  const ctx = await requireAgency("manager");
  const [t, managers] = await Promise.all([getTranslations("agency.casting"), listManagers(ctx.agency.id)]);
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/agencia/casting" backLabel={t("title")} />
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <TalentForm initial={EMPTY_TALENT} managers={managers} canEdit />
      </div>
    </div>
  );
}
