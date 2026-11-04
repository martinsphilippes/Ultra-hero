import type { Metadata } from "next";
import { Columns3, ListChecks, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TalentCardCompact } from "@/components/brand-portal/TalentCardView";
import { DecideItem, RemoveItemButton, ShortlistToolbar } from "@/components/selection/ShortlistControls";
import { Badge, type BadgeVariant, Button, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { canCompare, compareHref, COMPARE_MAX, formatAvg, shortlistActions, shortlistProgress, type ShortlistStatus } from "@/lib/selection/logic";
import { getShortlist } from "@/lib/selection/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selection.meta");
  return { title: t("shortlist") };
}

type Props = { params: Promise<{ id: string }> };

const STATUS_VARIANT: Record<ShortlistStatus, BadgeVariant> = {
  draft: "neutral",
  sent: "warning",
  decided: "success",
};

// Uma pré-seleção (0081): creators com o motivo do analista e a decisão do diretor (quem e quando). O analista monta
// e envia; o diretor aprova/recusa cada um; os aprovados viram campanha. Comparar leva os primeiros 4.
export default async function ShortlistPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, tr, locale, list] = await Promise.all([getTranslations("selection.shortlists"), getTranslations("selection.rating"), getLocale() as Promise<Locale>, getShortlist(id)]);
  if (!list || list.brandId !== ctx.brand.id) notFound();
  const can = shortlistActions(ctx.role, list, list.items);
  const progress = shortlistProgress(list.items);
  const inCatalog = list.items.filter((i) => i.inCatalog);
  const approved = inCatalog.filter((i) => i.decision === "approved");
  // compara os aprovados quando há decisão; senão, os primeiros da lista (até 4)
  const compareIds = (approved.length >= 2 ? approved : inCatalog).slice(0, COMPARE_MAX).map((i) => i.talentId);
  const hint = list.status === "draft" ? t("draftHint") : list.status === "sent" && progress.pending > 0 ? (ctx.role === "owner" ? t("ownerHint") : t("staffWaiting")) : null;
  const decisionText = (i: (typeof list.items)[number]) =>
    i.decision
      ? t(`decision.${i.decision}`, {
          name: i.decidedLabel || "—",
          date: i.decidedAt ? formatDateTime(i.decidedAt, locale) : "",
        })
      : t("decision.pending");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={list.title}
        backHref="/marca/herois/pre-selecao"
        backLabel={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge size="md" variant={STATUS_VARIANT[list.status]}>
              {t(`status.${list.status}`)}
            </Badge>
            <span className="text-fg-muted">
              {t("counts", {
                items: progress.total,
                approved: progress.approved,
                rejected: progress.rejected,
              })}
            </span>
          </span>
        }
      />
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="sl-info">
        <h2 id="sl-info" className="sr-only">
          {t("title")}
        </h2>
        {list.note ? <p className="type-body-sm whitespace-pre-line text-fg">{list.note}</p> : null}
        <p className="type-caption text-fg-muted">
          {list.createdLabel ? t("by", { name: list.createdLabel }) : null}
          {list.sentAt ? ` · ${t("sentAt", { date: formatDateTime(list.sentAt, locale) })}` : ""}
          {list.decidedAt ? ` · ${t("decidedAt", { date: formatDateTime(list.decidedAt, locale) })}` : ""}
        </p>
        {hint ? <p className="type-body-sm text-fg">{hint}</p> : null}
        {list.requestId && list.requestStatus !== "cancelled" ? (
          <p className="flex flex-wrap items-center gap-2 type-body-sm text-fg" data-testid="shortlist-campaign">
            {t("campaignLinked")}
            <Link href={`/marca/campanhas/${list.requestId}`} className="font-semibold text-accent-text underline-offset-2 hover:underline">
              {t("seeCampaign")}
            </Link>
          </p>
        ) : null}
        <ShortlistToolbar id={list.id} title={list.title} canSend={can.send} canDelete={can.remove} canCampaign={can.toCampaign} />
        {canCompare(compareIds) ? (
          <div>
            <Button asChild variant="secondary" size="sm" leadingIcon={<Columns3 />}>
              <Link href={compareHref(compareIds)} data-testid="shortlist-compare">
                {t("compare")}
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sl-items">
        <h2 id="sl-items" className="text-base font-semibold text-fg">
          {t("items")}
        </h2>
        {list.items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState
              icon={<ListChecks />}
              title={t("empty")}
              description={t("addHint")}
              action={
                <Button asChild>
                  <Link href="/marca/herois">{t("goCatalog")}</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" data-testid="shortlist-items">
            {list.items.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4" data-testid="shortlist-item">
                {i.card ? <TalentCardCompact card={i.card} href={`/marca/herois/${i.talentId}`} /> : null}
                {!i.inCatalog ? (
                  <Badge size="sm" variant="warning">
                    {t("outOfCatalog")}
                  </Badge>
                ) : null}
                {i.rating.count > 0 ? (
                  <span className="flex items-center gap-1.5 type-caption text-fg-muted">
                    <Star className="size-3.5 fill-accent text-accent" aria-hidden="true" />
                    {tr("catalogBadge", {
                      avg: formatAvg(i.rating.avg, locale) ?? "—",
                      count: i.rating.count,
                    })}
                  </span>
                ) : null}
                <div className="flex flex-col gap-0.5">
                  <span className="type-caption font-medium text-fg-muted">{t("reason")}</span>
                  <p className="type-body-sm whitespace-pre-line text-fg">{i.reason}</p>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className={`type-caption font-medium ${i.decision === "approved" ? "text-success" : i.decision === "rejected" ? "text-danger" : "text-fg-muted"}`}>{decisionText(i)}</span>
                  {i.decisionNote ? <span className="type-caption text-fg">“{i.decisionNote}”</span> : null}
                </div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {can.decide ? <DecideItem itemId={i.id} current={i.decision} /> : <span />}
                  {can.edit ? <RemoveItemButton itemId={i.id} name={i.card?.name ?? ""} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {can.edit && list.items.length > 0 ? (
          <p className="type-caption text-fg-muted">
            {t("addHint")}{" "}
            <Link href="/marca/herois" className="font-medium text-accent-text underline-offset-2 hover:underline">
              {t("goCatalog")}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
