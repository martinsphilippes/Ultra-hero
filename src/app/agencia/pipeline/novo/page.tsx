import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DealForm } from "@/components/deals/DealForms";
import { Building2, UserPlus } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState, PageHeader } from "@/components/ui";
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
// 0107: o cliente pode ser a marca, o Hero (ficha do casting) ou os dois; escolher o serviço gera o roteiro na hora.
type Props = { searchParams: Promise<{ marca?: string; heroi?: string; servico?: string; origem?: string }> };

// 0110: ?marca=&heroi=&servico=<slug> vêm do "próximo negócio" sugerido no clipping (só preenchem; a agência confere).
export default async function NewDealPage({ searchParams }: Props) {
  const ctx = await requireAgency("manager");
  const sp = await searchParams;
  const [t, brands, team, talents, services] = await Promise.all([
    getTranslations("agency.pipeline"),
    listAgencyBrands(ctx.agency.id),
    listTeam(ctx.agency.id),
    listTalents(ctx.agency.id),
    listServices(ctx.agency.id, { activeOnly: true }),
  ]);
  const clientTalents = talents.items.map((x) => ({ id: x.id, name: x.name, city: x.city, state: x.state, avatarUrl: x.hero?.avatarUrl ?? null }));
  const brandPick = brands.find((b) => b.brand.id === sp.marca)?.brand.id ?? null;
  const talentPick = clientTalents.find((x) => x.id === sp.heroi)?.id ?? "";
  const servicePick = services.items.find((x) => x.slug === sp.servico)?.id ?? "";
  // 0111: ?origem=<negócio> liga o negócio novo ao de origem (taxa de nova venda); o banco confere a agência
  const originDealId = sp.origem && /^[0-9a-f-]{36}$/i.test(sp.origem) ? sp.origem : "";
  const prefill =
    brandPick || talentPick || servicePick || originDealId
      ? { client: brandPick && talentPick ? ("both" as const) : talentPick ? ("talent" as const) : brandPick ? ("brand" as const) : undefined, talentId: talentPick, serviceId: servicePick, originDealId }
      : undefined;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/agencia/pipeline" backLabel={t("title")} />
      {brands.length === 0 && clientTalents.length === 0 ? (
        // agência recém-criada: sem marca nem Hero não há para quem abrir o negócio. Antes o formulário aparecia
        // inteiro travado (cinza) e parecia que o celular não respondia; agora mostra o que fazer primeiro.
        <section className="rounded-2xl border border-border bg-surface" data-testid="deal-new-no-clients">
          <EmptyState
            icon={<Building2 />}
            title={t("noClientsTitle")}
            description={t("noClientsBody")}
            action={
              <>
                <Button asChild leadingIcon={<Building2 />}>
                  <Link href="/agencia/marcas/nova">{t("noClientsBrand")}</Link>
                </Button>
                <Button asChild variant="secondary" leadingIcon={<UserPlus />}>
                  <Link href="/agencia/casting/novo">{t("noClientsHero")}</Link>
                </Button>
              </>
            }
          />
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <DealForm
            initial={{ brandId: brandPick ?? brands[0]?.brand.id ?? "", title: "", talentBrief: "", expectedStart: "", expectedEnd: "", ownerId: "", notes: "" }}
            dealId={null}
            brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name, logoUrl: b.brand.logoUrl }))}
            members={team.map((m) => ({ userId: m.userId, name: m.name, role: m.role, jobTitle: m.jobTitle }))}
            canEdit
            canSetOwner
            talents={clientTalents}
            services={services.items.map((x) => ({ id: x.id, name: x.name, clientKind: x.clientKind, slaDays: x.slaDays }))}
            prefill={prefill}
          />
        </section>
      )}
    </div>
  );
}
