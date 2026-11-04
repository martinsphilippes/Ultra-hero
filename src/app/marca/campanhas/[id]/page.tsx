import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentsPanel } from "@/components/agency/DocumentsPanel";
import { CampaignForm } from "@/components/brand-portal/CampaignForm";
import { BriefView } from "@/components/brief/BriefView";
import { CampaignTools } from "@/components/brief/CampaignTools";
import { CancelCampaignButton } from "@/components/brand-portal/CancelCampaignButton";
import { TalentCardCompact } from "@/components/brand-portal/TalentCardView";
import { MessageThread } from "@/components/deals/MessageThread";
import { RequestSummary } from "@/components/deals/RequestSummary";
import { BrandStatusBadge, DeliverableStatusBadge } from "@/components/deals/StatusBadges";
import { DeliverablesBoard } from "@/components/execution/DeliverablesBoard";
import { TaskList } from "@/components/execution/TaskList";
import { ApprovalPanel } from "@/components/selection/ApprovalPanel";
import { RatingPanel } from "@/components/selection/RatingPanel";
import { TermsPanel } from "@/components/execution/TermsPanel";
import { BrandBudgetChange } from "@/components/finance/BrandBudgetChange";
import { BudgetPanel } from "@/components/finance/BudgetPanel";
import { MusicPanel } from "@/components/media/MusicPanel";
import { TrackingPanel } from "@/components/media/TrackingPanel";
import { buttonBase, buttonSizes, buttonVariants, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { getOrigin } from "@/lib/auth/origin";
import { getUser } from "@/lib/auth/session";
import { getBrandContext } from "@/lib/brand-portal/server";
import { briefDefined, briefToDraft } from "@/lib/brief/brief";
import { getBrandCampaign, getRequestBudget, listMessages } from "@/lib/deals/queries";
import { BRAND_STATUSES } from "@/lib/deals/stages";
import { centsToBrl } from "@/lib/money/brl-input";
import type { DeliverableStatus } from "@/lib/deals/vocab";
import { getDealExecution } from "@/lib/execution/queries";
import { brandBudgetChanges, brandBudgetSummary } from "@/lib/finance/queries";
import { getDealMedia } from "@/lib/media/queries";
import { youTubeConfigured } from "@/lib/media/youtube-collect";
import { draftEditable } from "@/lib/selection/logic";
import { listBrandSponsorships } from "@/lib/sponsorship/queries";
import { listBrandCalls } from "@/lib/brand-call/queries";
import { createClient } from "@/lib/supabase/server";
import { localDay } from "@/lib/today/logic";
import { cn } from "@/lib/utils";

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
  const [t, tc, tb, ts, tbud, tsp, locale, detail, budget] = await Promise.all([
    getTranslations("brandPortal.campaigns"),
    getTranslations("commercial"),
    getTranslations("brief"),
    getTranslations("selection"),
    getTranslations("brandPortal.budget"),
    getTranslations("sponsorship.brand"),
    getLocale() as Promise<Locale>,
    getBrandCampaign(id),
    getRequestBudget(id),
  ]);
  if (!detail) notFound();
  const { request, deal } = detail;
  const isDraft = request.status === "draft";
  const canEdit = Boolean(ctx.role);
  // 0081: a equipe não edita o rascunho que espera o diretor; só o diretor envia à agência (a equipe pede aprovação)
  const approval = detail.approval ?? { status: "none" as const, requestedLabel: "", requestedAt: null, requestNote: "", requestedByMe: false, decidedLabel: "", decidedAt: null, decisionNote: "" };
  const editable = isDraft && canEdit && draftEditable(ctx.role, approval.status);
  const submitMode = ctx.role === "owner" ? (approval.status === "pending" ? "none" : "submit") : "ask";
  const stepIndex = BRAND_STATUSES.indexOf(detail.brandStatus);
  const steps = BRAND_STATUSES.filter((s) => s !== "cancelled");
  const inExecution = deal !== null && ["contracting", "running", "done"].includes(detail.brandStatus);
  const [messages, docs, exec, budgetPanel, media, tm, origin, user, sponsorships, brandCalls, tbc, changes] = await Promise.all([
    deal ? listMessages(deal.id, "brand_agency") : Promise.resolve([]),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from("documents").select("id, title, kind, created_at, share_talent, restricted, uploader_side").eq("request_id", id).eq("status", "ready").order("created_at", { ascending: false });
      return (data ?? []).map((d) => ({ id: d.id, title: d.title, kind: d.kind, createdAt: d.created_at, shareTalent: d.share_talent, restricted: d.restricted, uploaderSide: d.uploader_side }));
    })(),
    inExecution && deal ? getDealExecution(deal.id) : Promise.resolve({ available: true, data: null }),
    // 0082: verba da campanha (enviada; rascunho e cancelada não têm painel)
    detail.brandStatus !== "cancelled" ? brandBudgetSummary(request.id) : Promise.resolve({ available: true, data: null }),
    // 0083: métricas, comentários no segundo, links/cupons com cliques, vendas e músicas
    inExecution && deal ? getDealMedia(deal.id, { sales: true }) : Promise.resolve(null),
    getTranslations("media"),
    getOrigin(),
    getUser(),
    // 0085: a campanha nasceu de uma oportunidade de patrocínio? (a marca não lê campaign_requests direto)
    request.origin === "brand" ? listBrandSponsorships(ctx.brand.id) : Promise.resolve({ available: false, items: [] }),
    // 0089: a campanha nasceu de um acordo de chamada da marca?
    request.origin === "brand" ? listBrandCalls(ctx.brand.id) : Promise.resolve({ available: false, items: [] }),
    getTranslations("brandCall.brand"),
    // 0090: pedido de alteração de verba (só com a campanha já enviada; rascunho segue livre)
    !isDraft && detail.brandStatus !== "cancelled" ? brandBudgetChanges(request.id) : Promise.resolve(null),
  ]);
  const mediaData = media?.available ? media.data : null;
  const today = localDay(new Date(), "America/Sao_Paulo");
  const linkRows = detail.talents
    .filter((x) => x.status === "proposed" || x.status === "contracted")
    .map((x) => ({ dealTalentId: x.dealTalentId, talentName: x.name, link: mediaData?.links.find((l) => l.dealTalentId === x.dealTalentId) ?? null }));
  const budgetSummary = budgetPanel.available ? budgetPanel.data : null;
  const execution = exec.available ? exec.data : null;
  const liveTerms = execution?.terms.filter((x) => x.status !== "draft") ?? [];
  const brandTasks = execution?.tasks.filter((x) => x.side === "brand") ?? [];
  const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const preConfirmation = ["received", "building", "proposal"].includes(detail.brandStatus) || isDraft;
  const shortlistNote = detail.shortlist ? (
    <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 type-body-sm text-fg" data-testid="campaign-shortlist">
      {ts("shortlists.fromShortlist", { title: detail.shortlist.title, names: detail.shortlist.approved.join(", ") || "—" })}{" "}
      {isDraft ? <span className="text-fg-muted">{ts("shortlists.fromShortlistHint")}</span> : null}
    </p>
  ) : null;
  const fromSponsorship = sponsorships.items.find((o) => o.myResponse?.requestId === request.id) ?? null;
  const fromCall = brandCalls.items.find((c) => c.requestIds.includes(request.id)) ?? null;
  const callNote = fromCall ? (
    <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 type-body-sm text-fg" data-testid="campaign-brand-call">
      {tbc("fromCall", { title: fromCall.title })}{" "}
      <Link href={`/marca/oportunidades/chamadas/${fromCall.id}`} className="font-medium text-accent-text underline-offset-2 hover:underline">
        {tbc("seeCall")}
      </Link>
    </p>
  ) : null;
  const sponsorshipNote = fromSponsorship ? (
    <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 type-body-sm text-fg" data-testid="campaign-sponsorship">
      {tsp("fromSponsorship", { title: fromSponsorship.title, name: fromSponsorship.talent.name })}{" "}
      <Link href={`/marca/oportunidades/${fromSponsorship.id}`} className="font-medium text-accent-text underline-offset-2 hover:underline">
        {tsp("seeOpportunity")}
      </Link>
    </p>
  ) : null;
  const ratable = (execution?.deliverables ?? []).map((d) => ({ id: d.id, title: d.title, kind: d.kind, talentName: d.talentName, status: d.status, dueAt: d.dueAt, publishAt: d.publishAt, publishedAt: d.publishedAt, proofAt: d.proofAt }));

  if (editable) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={request.title || t("untitled")} description={<BrandStatusBadge status="draft" size="md" />} backHref="/marca/campanhas" backLabel={t("title")} actions={
            <span className="flex flex-wrap gap-2">
              <CampaignTools requestId={request.id} title={request.title} />
              <CancelCampaignButton requestId={request.id} />
            </span>
          }
        />
        {request.origin === "brand" ? <ApprovalPanel requestId={request.id} role={ctx.role} approval={approval} isDraft /> : null}
        {shortlistNote}
      {sponsorshipNote}
      {callNote}
        <CampaignForm
          submitMode={submitMode}
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
            budgetText: centsToBrl(budget?.max ?? null),
            valueModel: budget?.valueModel ?? "fixo",
            maxHeroes: budget?.maxHeroes ?? null,
            budgetNote: budget?.note ?? "",
            briefDraft: briefToDraft(request.brief),
          }}
          creatorName={detail.requestedTalent?.name ?? null}
          canEdit
          valueMode={fromCall ? "frozen" : fromSponsorship ? "hidden" : "editable"}
          sponsorshipBudget={fromCall ? "agreed" : fromSponsorship ? (fromSponsorship.negotiation?.status === "agreed" ? "agreed" : "negotiating") : null}
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
        actions={
          canEdit ? (
            <span className="flex flex-wrap gap-2">
              {inExecution ? (
                <Link href={`/marca/campanhas/${request.id}/relatorio`} className={cn(buttonBase, buttonVariants.secondary, buttonSizes.sm)} data-testid="campaign-report">
                  {tm("report.open")}
                </Link>
              ) : null}
              <CampaignTools requestId={request.id} title={request.title} canDuplicate={Boolean(ctx.agency)} />
              {preConfirmation && detail.brandStatus !== "cancelled" ? <CancelCampaignButton requestId={request.id} /> : null}
            </span>
          ) : null
        }
      />
      {request.origin === "brand" && detail.brandStatus !== "cancelled" ? <ApprovalPanel requestId={request.id} role={ctx.role} approval={approval} isDraft={isDraft} /> : null}
      {shortlistNote}
      {sponsorshipNote}
      {callNote}
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
          {briefDefined(request.brief) ? (
            <section className={card} aria-labelledby="camp-brief" data-testid="campaign-brief">
              <h2 id="camp-brief" className="text-base font-semibold text-fg">
                {tb("title")}
              </h2>
              <BriefView brief={request.brief} />
            </section>
          ) : null}
          {deal && execution && liveTerms.length > 0 ? (
            <section className={card} aria-labelledby="camp-terms" data-testid="campaign-terms">
              <h2 id="camp-terms" className="text-base font-semibold text-fg">
                {t("sections.terms")}
              </h2>
              <TermsPanel portal="brand" dealId={deal.id} requestId={request.id} stage={execution.stage} terms={liveTerms} canAccept={ctx.role === "owner"} />
            </section>
          ) : null}
          {deal && execution && brandTasks.length > 0 ? (
            <section className={card} aria-labelledby="camp-tasks" data-testid="campaign-tasks">
              <h2 id="camp-tasks" className="text-base font-semibold text-fg">
                {t("sections.approvals")}
              </h2>
              <p className="type-caption text-fg-muted">{t("approvalsHint")}</p>
              <TaskList portal="brand" tasks={brandTasks} dealId={deal.id} requestId={request.id} canEdit={canEdit && detail.brandStatus !== "cancelled"} emptyText={t("approvalsNone")} />
            </section>
          ) : null}
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
          {budgetSummary ? (
            <section id="camp-budget" className={`${card} scroll-mt-20`} aria-labelledby="camp-budget-title">
              <div className="flex flex-col gap-1">
                <h2 id="camp-budget-title" className="text-base font-semibold text-fg">
                  {tbud("title")}
                </h2>
                <p className="type-caption text-fg-muted">{tbud("hint")}</p>
              </div>
              <BudgetPanel summary={budgetSummary} />
              {changes ? (
                <BrandBudgetChange
                  requestId={request.id}
                  role={changes.role}
                  canRequest={changes.canRequest}
                  currentCents={budgetSummary.reservedCents}
                  talents={budgetSummary.talents.map((x) => ({ dealTalentId: x.dealTalentId, talentName: x.talentName, reservedCents: x.reservedCents }))}
                  items={changes.items}
                />
              ) : null}
            </section>
          ) : null}
          <section className={card} aria-labelledby="camp-talents">
            <h2 id="camp-talents" className="text-base font-semibold text-fg">
              {t("sections.talents")}
            </h2>
            {detail.requestedTalent ? (
              <div className="flex flex-col gap-2">
                <span className="type-caption text-fg-muted">{t("requestedTalent")}</span>
                <TalentCardCompact card={detail.requestedTalent} href={`/marca/herois/${detail.requestedTalent.id}`} />
              </div>
            ) : null}
            {detail.talents.filter((x) => x.id !== detail.requestedTalent?.id || x.status === "proposed" || x.status === "contracted").length > 0 ? (
              <ul className="flex flex-col gap-2">
                {detail.talents.map((x) => (
                  <li key={x.dealTalentId} className="flex flex-col gap-1">
                    <span className="type-caption text-fg-muted">{t(`talentStatus.${x.status === "contracted" ? "contracted" : "proposed"}`)}</span>
                    <TalentCardCompact card={x} href={`/marca/herois/${x.id}`} />
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
            {deal && execution && execution.deliverables.length > 0 ? (
              <DeliverablesBoard
                portal="brand"
                dealId={deal.id}
                requestId={request.id}
                deliverables={execution.deliverables}
                brief={execution.brief}
                canAct={canEdit && detail.brandStatus !== "cancelled"}
                emptyText={t("deliverablesNone")}
                media={mediaData ? { readings: mediaData.metrics, comments: mediaData.comments, youtubeConfigured: youTubeConfigured(), today } : null}
              />
            ) : detail.deliverables.length === 0 ? (
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
          {deal && mediaData && linkRows.length > 0 ? (
            <section className={card} aria-labelledby="camp-links" data-testid="campaign-links">
              <div className="flex flex-col gap-1">
                <h2 id="camp-links" className="text-base font-semibold text-fg">
                  {tm("links.brandTitle")}
                </h2>
                <p className="type-caption text-fg-muted">{tm("links.brandHint")}</p>
              </div>
              <TrackingPanel
                portal="brand"
                origin={origin}
                dealId={deal.id}
                requestId={request.id}
                rows={linkRows}
                sales={mediaData.sales}
                showSales
                canSell={canEdit && detail.brandStatus !== "cancelled"}
                myUserId={user?.id ?? null}
                isOwner={ctx.role === "owner"}
                today={today}
              />
            </section>
          ) : null}
          {deal && mediaData && mediaData.music.length > 0 ? (
            <section className={card} aria-labelledby="camp-music" data-testid="campaign-music">
              <h2 id="camp-music" className="text-base font-semibold text-fg">
                {tm("music.title")}
              </h2>
              <MusicPanel tracks={mediaData.music} canEdit={false} dealId={deal.id} requestId={request.id} today={today} />
            </section>
          ) : null}
          {deal && execution && ratable.some((d) => ["published", "proof_submitted", "done"].includes(d.status)) ? (
            <section className={card} aria-labelledby="camp-ratings" data-testid="campaign-ratings">
              <h2 id="camp-ratings" className="text-base font-semibold text-fg">
                {ts("rating.title")}
              </h2>
              <p className="type-caption text-fg-muted">{ts("rating.hint")}</p>
              <RatingPanel requestId={request.id} deliverables={ratable} ratings={detail.ratings} canAct={canEdit} />
            </section>
          ) : null}
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
            <Link href="/marca/herois" className="font-medium text-accent-text underline-offset-2 hover:underline">
              {t("seeCatalog")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
