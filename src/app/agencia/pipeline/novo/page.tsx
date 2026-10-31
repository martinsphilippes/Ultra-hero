import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DealForm } from "@/components/deals/DealForms";
import { PageHeader } from "@/components/ui";
import { listAgencyBrands, listTeam } from "@/lib/agency/queries";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newDeal") };
}

// Negócio aberto pela própria agência (briefing recebido fora do portal): cria o pedido de origem
// "agência" e o negócio em "briefing recebido". A marca só vê quando a agência confirmar.
export default async function NewDealPage() {
  const ctx = await requireAgency("manager");
  const [t, brands, team] = await Promise.all([getTranslations("agency.pipeline"), listAgencyBrands(ctx.agency.id), listTeam(ctx.agency.id)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/agencia/pipeline" backLabel={t("title")} />
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <DealForm
          initial={{ brandId: brands[0]?.brand.id ?? "", title: "", talentBrief: "", expectedStart: "", expectedEnd: "", ownerId: "", notes: "" }}
          dealId={null}
          brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name }))}
          members={team.map((m) => ({ userId: m.userId, name: m.name }))}
          canEdit={brands.length > 0}
          canSetOwner
        />
        {brands.length === 0 ? <p className="mt-3 type-body-sm text-fg-muted">{t("noBrands")}</p> : null}
      </section>
    </div>
  );
}
