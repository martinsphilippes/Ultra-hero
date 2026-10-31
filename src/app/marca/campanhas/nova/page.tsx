import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CampaignForm, EMPTY_CAMPAIGN } from "@/components/brand-portal/CampaignForm";
import { PageHeader } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { getTalentForBrand } from "@/lib/deals/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("newCampaign") };
}

type Props = { searchParams: Promise<{ creator?: string }> };

// Nova proposta: vazia ou já endereçada a um creator do catálogo (?creator=<id>, só se ele for do
// catálogo autorizado). O admin geral só lê o portal: volta para a lista.
export default async function NewCampaignPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  if (!ctx.role || !ctx.agency) redirect("/marca/campanhas");
  const sp = await searchParams;
  const [t, creator] = await Promise.all([getTranslations("brandPortal.campaigns"), sp.creator ? getTalentForBrand(ctx.brand.id, sp.creator) : Promise.resolve(null)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription", { agency: ctx.agency.name })} backHref="/marca/campanhas" backLabel={t("title")} />
      <CampaignForm initial={{ ...EMPTY_CAMPAIGN, talentId: creator?.id ?? "" }} creatorName={creator?.name ?? null} canEdit />
    </div>
  );
}
