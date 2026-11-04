import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DealForm } from "@/components/deals/DealForms";
import { PageHeader } from "@/components/ui";
import { listAgencyBrands, listTeam } from "@/lib/agency/queries";
import { requireAgency } from "@/lib/agency/server";
import { listServices } from "@/lib/roadmap/queries";
import { listTalents } from "@/lib/talent/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newDeal") };
}

// Negócio aberto pela própria agência (briefing recebido fora do portal): cria o pedido de origem
// "agência" e o negócio em "briefing recebido". A marca só vê quando a agência confirmar.
// 0107: o cliente pode ser a marca, o herói (ficha do casting) ou os dois; escolher o serviço gera o roteiro na hora.
export default async function NewDealPage() {
  const ctx = await requireAgency("manager");
  const [t, brands, team, talents, services] = await Promise.all([
    getTranslations("agency.pipeline"),
    listAgencyBrands(ctx.agency.id),
    listTeam(ctx.agency.id),
    listTalents(ctx.agency.id),
    listServices(ctx.agency.id, { activeOnly: true }),
  ]);
  const clientTalents = talents.items.map((x) => ({ id: x.id, name: x.name, city: x.city, state: x.state, avatarUrl: x.hero?.avatarUrl ?? null }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/agencia/pipeline" backLabel={t("title")} />
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <DealForm
          initial={{ brandId: brands[0]?.brand.id ?? "", title: "", talentBrief: "", expectedStart: "", expectedEnd: "", ownerId: "", notes: "" }}
          dealId={null}
          brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name, logoUrl: b.brand.logoUrl }))}
          members={team.map((m) => ({ userId: m.userId, name: m.name, role: m.role, jobTitle: m.jobTitle }))}
          canEdit={brands.length > 0 || clientTalents.length > 0}
          canSetOwner
          talents={clientTalents}
          services={services.items.map((x) => ({ id: x.id, name: x.name, clientKind: x.clientKind, slaDays: x.slaDays }))}
        />
        {brands.length === 0 && clientTalents.length === 0 ? <p className="mt-3 type-body-sm text-fg-muted">{t("noBrands")}</p> : null}
      </section>
    </div>
  );
}
