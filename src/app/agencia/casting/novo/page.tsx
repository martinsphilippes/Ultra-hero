import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TalentForm } from "@/components/agency/CastingForms";
import { NewHeroForm } from "@/components/agency/NewHeroForm";
import { EMPTY_TALENT } from "@/lib/talent/form-values";
import { PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { listManagers, listSegments } from "@/lib/talent/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newTalent") };
}

// 0112: um só "Novo Hero" — a pessoa (ficha do casting) com e-mail e celular obrigatórios (o acesso nasce junto),
// gestor, segmentos e a página pública opcional já ligada. A agência de exemplo segue com a ficha simples (não convida).
export default async function NewTalentPage() {
  const ctx = await requireAgency("manager");
  const [t, managers, segments] = await Promise.all([getTranslations("agency.casting"), listManagers(ctx.agency.id), listSegments(ctx.agency.id)]);
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("newTitle")} description={ctx.agency.isDemo ? t("newDescription") : t("newHero.description")} backHref="/agencia/casting" backLabel={t("title")} />
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        {ctx.agency.isDemo ? (
          <TalentForm initial={EMPTY_TALENT} managers={managers} canEdit />
        ) : (
          <NewHeroForm managers={managers} segments={segments.map((s) => ({ id: s.id, name: s.name }))} />
        )}
      </div>
    </div>
  );
}
