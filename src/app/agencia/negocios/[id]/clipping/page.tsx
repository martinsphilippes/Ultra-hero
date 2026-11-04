import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ClippingView } from "@/components/project-room/ClippingView";
import { EmptyState } from "@/components/ui";
import { suggestNextDeal } from "@/lib/project-room/next-deal";
import { getClipping } from "@/lib/project-room/queries";
import { engagementRate } from "@/lib/project-room/vocab";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.meta");
  return { title: t("clipping") };
}

type Props = { params: Promise<{ id: string }> };

// Fechamento (0110): clipping do projeto (ao vivo enquanto a sala está aberta; congelado no arquivamento), as notas do
// cliente e o "próximo negócio" com o formulário de negócio novo já preenchido (gestor+).
export default async function DealClippingPage({ params }: Props) {
  const { id } = await params;
  const { deal, isManager } = await loadDeal(id);
  const [t, clip] = await Promise.all([getTranslations("projectRoom.clipping"), getClipping(deal.id)]);
  if (!clip.data) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid={clip.available ? "clipping-none" : "module-unavailable"}>
        <EmptyState icon={<ScrollText />} title={clip.available ? t("none") : t("unavailable")} />
      </div>
    );
  }
  const c = clip.data;
  const next = suggestNextDeal({ serviceSlug: c.serviceSlug, talent: c.talent, brand: c.brand, engagementRate: engagementRate(c.totals.engagement, c.totals.reach, c.totals.views), published: c.totals.published });
  const qs = new URLSearchParams();
  if (c.brandId) qs.set("marca", c.brandId);
  if (c.clientTalentId) qs.set("heroi", c.clientTalentId);
  qs.set("servico", next.service);
  // 0111: o negócio novo nasce ligado a este (conta na taxa de nova venda)
  qs.set("origem", deal.id);
  return <ClippingView clip={c} newDealHref={isManager ? `/agencia/pipeline/novo?${qs.toString()}` : null} />;
}
