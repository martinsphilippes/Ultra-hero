import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeliverablesEditor } from "@/components/deals/DeliverablesEditor";
import { listDealTalents, listDeliverables } from "@/lib/deals/queries";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealDeliverables") };
}

type Props = { params: Promise<{ id: string }> };

// Entregáveis planejados por creator (os que seguem no negócio). Envio de versões e aprovação: P2.
export default async function DealDeliverablesPage({ params }: Props) {
  const { id } = await params;
  const { deal, canEdit } = await loadDeal(id);
  const [t, talents, items] = await Promise.all([getTranslations("agency.deal.deliverables"), listDealTalents(deal.id), listDeliverables(deal.id)]);
  const active = talents.filter((x) => !["declined", "removed"].includes(x.status));
  return (
    <div className="flex flex-col gap-4">
      <p className="type-body-sm text-fg-muted">{t("intro")}</p>
      <DeliverablesEditor dealId={deal.id} talents={active.map((x) => ({ dealTalentId: x.id, name: x.talent.name }))} items={items.filter((d) => d.status !== "cancelled")} canEdit={canEdit} />
    </div>
  );
}
