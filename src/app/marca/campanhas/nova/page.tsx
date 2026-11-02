import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CampaignForm, EMPTY_CAMPAIGN } from "@/components/brand-portal/CampaignForm";
import { TemplatePicker } from "@/components/brief/TemplatePicker";
import { PageHeader } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { listBriefTemplates } from "@/lib/brief/queries";
import { getTalentForBrand } from "@/lib/deals/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("newCampaign") };
}

type Props = { searchParams: Promise<{ creator?: string }> };

// Nova proposta: vazia ou já endereçada a um creator do catálogo (?creator=<id>, só se ele for do
// catálogo autorizado), ou a partir de um modelo de briefing da marca (0080; só sem creator escolhido, porque o
// modelo não guarda creator). O admin geral só lê o portal: volta para a lista.
export default async function NewCampaignPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  if (!ctx.role || !ctx.agency) redirect("/marca/campanhas");
  const sp = await searchParams;
  const [t, creator, templates] = await Promise.all([getTranslations("brandPortal.campaigns"), sp.creator ? getTalentForBrand(ctx.brand.id, sp.creator) : Promise.resolve(null), listBriefTemplates(ctx.brand.id)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription", { agency: ctx.agency.name })} backHref="/marca/campanhas" backLabel={t("title")} />
      {!creator && templates.items.length > 0 ? <TemplatePicker templates={templates.items} /> : null}
      {/* 0081: só o diretor envia à agência; a equipe pede aprovação interna */}
      <CampaignForm initial={{ ...EMPTY_CAMPAIGN, talentId: creator?.id ?? "" }} creatorName={creator?.name ?? null} canEdit submitMode={ctx.role === "owner" ? "submit" : "ask"} />
    </div>
  );
}
