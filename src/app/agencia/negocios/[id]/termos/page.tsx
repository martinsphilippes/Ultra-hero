import type { Metadata } from "next";
import { FileSignature } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TermsPanel } from "@/components/execution/TermsPanel";
import { EmptyState } from "@/components/ui";
import { listDealTalents } from "@/lib/deals/queries";
import { getDealExecution } from "@/lib/execution/queries";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealTerms") };
}

type Props = { params: Promise<{ id: string }> };

// Termos demonstrativos do negócio: versões, envio, aceites (marca e creators) e a confirmação da contratação,
// que leva o negócio à produção e gera as tarefas do modelo. Sem valores nesta aba.
export default async function DealTermsPage({ params }: Props) {
  const { id } = await params;
  const { deal, canEdit, isManager } = await loadDeal(id);
  const [t, exec, talents] = await Promise.all([getTranslations("agency.terms"), getDealExecution(deal.id), listDealTalents(deal.id)]);
  if (!exec.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<FileSignature />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const confirmed = talents.filter((x) => ["proposed", "contracted"].includes(x.status));
  return (
    <div className="flex flex-col gap-4" data-testid="deal-terms">
      <p className="type-body-sm text-fg-muted">{["approved", "contracting", "production", "closed"].includes(deal.stage) ? t("intro") : t("introEarly")}</p>
      <TermsPanel portal="agency" dealId={deal.id} stage={deal.stage} terms={exec.data?.terms ?? []} canEdit={canEdit} isManager={isManager} talents={confirmed.map((x) => ({ dealTalentId: x.id, name: x.talent.name, hasLogin: x.talent.hasLogin }))} />
    </div>
  );
}
