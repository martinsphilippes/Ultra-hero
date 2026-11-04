import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CampaignForm } from "@/components/brand-portal/CampaignForm";
import { EMPTY_CAMPAIGN } from "@/lib/brand-portal/campaign-form";
import { TemplatePicker } from "@/components/brief/TemplatePicker";
import { PageHeader } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { listBriefTemplates } from "@/lib/brief/queries";
import { getTalentForBrand } from "@/lib/deals/queries";
import { FromEventNotice } from "@/components/culture/EventCommerce";
import { campaignPrefill } from "@/lib/culture/prefill";
import { eventForProposal } from "@/lib/culture/from-event";
import { eventHref } from "@/lib/culture/links";
import { EMPTY_BRIEF_DRAFT } from "@/lib/brief/brief";
import { defaultTimeZone } from "@/i18n/config";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("newCampaign") };
}

type Props = { searchParams: Promise<{ creator?: string; evento?: string }> };

// Nova proposta: vazia ou já endereçada a um creator do catálogo (?creator=<id>, só se ele for do
// catálogo autorizado), ou a partir de um modelo de briefing da marca (0080; só sem creator escolhido, porque o
// modelo não guarda creator). O admin geral só lê o portal: volta para a lista.
export default async function NewCampaignPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  if (!ctx.role || !ctx.agency) redirect("/marca/campanhas");
  const sp = await searchParams;
  const [t, creator, templates, from] = await Promise.all([
    getTranslations("brandPortal.campaigns"),
    sp.creator ? getTalentForBrand(ctx.brand.id, sp.creator) : Promise.resolve(null),
    listBriefTemplates(ctx.brand.id),
    eventForProposal(sp.evento),
  ]);
  // 0101: "Criar campanha a partir deste evento" — título, datas, local, notas, hashtags (briefing), segmento e vínculo
  const pre = from.event ? campaignPrefill(from.event, localDay(new Date(), defaultTimeZone)) : null;
  const initial = pre
    ? {
        ...EMPTY_CAMPAIGN,
        talentId: creator?.id ?? "",
        title: pre.title,
        periodStart: pre.periodStart,
        periodEnd: pre.periodEnd,
        desiredTime: pre.desiredTime,
        location: pre.location,
        notes: pre.notes,
        briefDraft: { ...EMPTY_BRIEF_DRAFT, hashtags: pre.hashtagsText },
        calendarEventId: pre.calendarEventId,
        eventSegments: pre.segmentSlugs,
      }
    : { ...EMPTY_CAMPAIGN, talentId: creator?.id ?? "" };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} description={t("newDescription", { agency: ctx.agency.name })} backHref="/marca/campanhas" backLabel={t("title")} />
      {from.requested ? <FromEventNotice event={from.event} href={from.event ? eventHref("brand", from.event.id) : undefined} missing={!from.event} /> : null}
      {!creator && !from.event && templates.items.length > 0 ? <TemplatePicker templates={templates.items} /> : null}
      {/* 0081: só o diretor envia à agência; a equipe pede aprovação interna */}
      <CampaignForm initial={initial} creatorName={creator?.name ?? null} canEdit submitMode={ctx.role === "owner" ? "submit" : "ask"} />
    </div>
  );
}
