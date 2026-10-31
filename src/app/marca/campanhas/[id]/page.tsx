import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentsPanel } from "@/components/agency/DocumentsPanel";
import { CampaignForm } from "@/components/brand-portal/CampaignForm";
import { CancelCampaignButton } from "@/components/brand-portal/CancelCampaignButton";
import { TalentCardCompact } from "@/components/brand-portal/TalentCardView";
import { MessageThread } from "@/components/deals/MessageThread";
import { RequestSummary } from "@/components/deals/RequestSummary";
import { BrandStatusBadge, DeliverableStatusBadge } from "@/components/deals/StatusBadges";
import { PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { getBrandCampaign, getRequestBudget, listMessages } from "@/lib/deals/queries";
import { BRAND_STATUSES } from "@/lib/deals/stages";
import { formatCents } from "@/lib/deals/schemas";
import type { DeliverableStatus } from "@/lib/deals/vocab";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("campaign") };
}

type Props = { params: Promise<{ id: string }> };

// Campanha da marca: rascunho editável; depois de enviada, resumo, situação, creators (o escolhido
// sempre; os demais a partir da confirmação), entregas, conversa com a agência e anexos.
export default async function BrandCampaignPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, tc, locale, detail, budget] = await Promise.all([getTranslations("brandPortal.campaigns"), getTranslations("commercial"), getLocale() as Promise<Locale>, getBrandCampaign(id), getRequestBudget(id)]);
  if (!detail) notFound();
  const { request, deal } = detail;
  const isDraft = request.status === "draft";
  const canEdit = Boolean(ctx.role);
  const editable = isDraft && canEdit;
  const stepIndex = BRAND_STATUSES.indexOf(detail.brandStatus);
  const steps = BRAND_STATUSES.filter((s) => s !== "cancelled");
  const [messages, docs] = await Promise.all([
    deal ? listMessages(deal.id, "brand_agency") : Promise.resolve([]),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from("documents").select("id, title, kind, created_at, share_talent, restricted, uploader_side").eq("request_id", id).eq("status", "ready").order("created_at", { ascending: false });
      return (data ?? []).map((d) => ({ id: d.id, title: d.title, kind: d.kind, createdAt: d.created_at, shareTalent: d.share_talent, restricted: d.restricted, uploaderSide: d.uploader_side }));
    })(),
  ]);
  const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const preConfirmation = ["received", "building", "proposal"].includes(detail.brandStatus) || isDraft;

  if (editable) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={request.title || t("untitled")} description={<BrandStatusBadge status="draft" size="md" />} backHref="/marca/campanhas" backLabel={t("title")} actions={<CancelCampaignButton requestId={request.id} />} />
        <CampaignForm
          initial={{
            id: request.id,
            talentId: request.talentId ?? "",
            title: request.title,
            objective: (request.objective ?? "") as "" | NonNullable<typeof request.objective> & ("awareness" | "engagement" | "conversion" | "launch" | "content" | "event" | "other"),
            product: request.product,
            targetAudience: request.targetAudience,
            targetAgeBands: request.targetAgeBands as ("13-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55+")[],
            targetStates: request.targetStates as never[],
            regionNote: request.regionNote,
            periodStart: request.periodStart ?? "",
            periodEnd: request.periodEnd ?? "",
            desiredTime: request.desiredAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(request.desiredAt)) : "",
            durationMinutes: request.durationMinutes ?? "",
            format: (request.format ?? "") as "" | "remote" | "in_person" | "hybrid",
            location: request.location,
            networks: request.networks as never[],
            deliverables: request.deliverables as never[],
            notes: request.notes,
            budgetText: budget?.max !== null && budget?.max !== undefined ? formatCents(budget.max, "pt-BR").replace(/[^\d,.]/g, "") : "",
            budgetNote: budget?.note ?? "",
          }}
          creatorName={detail.requestedTalent?.name ?? null}
          canEdit
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="campaign-detail">
      <PageHeader
        title={request.title || t("untitled")}
        backHref="/marca/campanhas"
        backLabel={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BrandStatusBadge status={detail.brandStatus} size="md" />
            {request.submittedAt ? <span className="text-fg-muted">{t("submittedAt", { date: formatDateTime(request.submittedAt, locale) })}</span> : null}
          </span>
        }
        actions={canEdit && preConfirmation && detail.brandStatus !== "cancelled" ? <CancelCampaignButton requestId={request.id} /> : null}
      />
      {detail.brandStatus !== "cancelled" ? (
        <ol className="flex flex-wrap gap-2" aria-label={t("stepsLabel")} data-testid="campaign-steps">
          {steps.map((s, i) => (
            <li key={s} className={`rounded-full border px-3 py-1 type-caption ${i <= stepIndex ? "border-accent/40 bg-accent-soft text-accent-text" : "border-border text-fg-muted"}`} aria-current={s === detail.brandStatus ? "step" : undefined}>
              {tc(`brandStatus.${s}`)}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className={card} aria-labelledby="camp-summary">
            <h2 id="camp-summary" className="text-base font-semibold text-fg">
              {t("sections.summary")}
            </h2>
            <RequestSummary request={request} budget={budget} />
          </section>
          {deal ? (
            <section className={card} aria-labelledby="camp-messages">
              <h2 id="camp-messages" className="text-base font-semibold text-fg">
                {t("sections.messages")}
              </h2>
              <MessageThread portal="brand" dealId={deal.id} channel="brand_agency" talentId={null} messages={messages} mySide="brand" canPost={canEdit && detail.brandStatus !== "cancelled" && detail.brandStatus !== "done"} revalidate={`/marca/campanhas/${request.id}`} />
            </section>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <section className={card} aria-labelledby="camp-talents">
            <h2 id="camp-talents" className="text-base font-semibold text-fg">
              {t("sections.talents")}
            </h2>
            {detail.requestedTalent ? (
              <div className="flex flex-col gap-2">
                <span className="type-caption text-fg-muted">{t("requestedTalent")}</span>
                <TalentCardCompact card={detail.requestedTalent} href={`/marca/creators/${detail.requestedTalent.id}`} />
              </div>
            ) : null}
            {detail.talents.filter((x) => x.id !== detail.requestedTalent?.id || x.status === "proposed" || x.status === "contracted").length > 0 ? (
              <ul className="flex flex-col gap-2">
                {detail.talents.map((x) => (
                  <li key={x.dealTalentId} className="flex flex-col gap-1">
                    <span className="type-caption text-fg-muted">{t(`talentStatus.${x.status === "contracted" ? "contracted" : "proposed"}`)}</span>
                    <TalentCardCompact card={x} href={`/marca/creators/${x.id}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body-sm text-fg-muted">{preConfirmation ? t("talentsPending") : t("talentsNone")}</p>
            )}
          </section>
          <section className={card} aria-labelledby="camp-deliverables">
            <h2 id="camp-deliverables" className="text-base font-semibold text-fg">
              {t("sections.deliverables")}
            </h2>
            {detail.deliverables.length === 0 ? (
              <p className="type-body-sm text-fg-muted">{t("deliverablesNone")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {detail.deliverables.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-fg">{d.title || d.kind}</span>
                      <span className="type-caption text-fg-muted">
                        {d.talentName}
                        {d.dueAt ? ` · ${t("dueAt", { date: formatPlainDate(d.dueAt.slice(0, 10), locale) })}` : ""}
                      </span>
                    </span>
                    <DeliverableStatusBadge status={d.status as DeliverableStatus} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {ctx.agency ? (
            <section className={card} aria-labelledby="camp-docs">
              <h2 id="camp-docs" className="text-base font-semibold text-fg">
                {t("sections.attachments")}
              </h2>
              <DocumentsPanel agencyId={ctx.agency.id} scope={{ type: "request", id: request.id }} documents={docs} canUpload={canEdit && detail.brandStatus !== "cancelled"} canContract={false} revalidate={`/marca/campanhas/${request.id}`} />
            </section>
          ) : null}
          <p className="type-caption text-fg-muted">
            {t("agencyNote")}{" "}
            <Link href="/marca/creators" className="font-medium text-accent-text underline-offset-2 hover:underline">
              {t("seeCatalog")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
