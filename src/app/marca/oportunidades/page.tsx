import type { Metadata } from "next";
import { Handshake, Megaphone, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { LinkTabsNav } from "@/components/admin-content/LinkTabsNav";
import { CallStatusBadge } from "@/components/brand-call/shared";
import { SponsorshipStatusBadge, sponsorshipWhen } from "@/components/sponsorship/SponsorshipView";
import { Avatar, Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { listBrandCalls } from "@/lib/brand-call/queries";
import { getBrandContext } from "@/lib/brand-portal/server";
import { formatCents } from "@/lib/deals/schemas";
import { listBrandSponsorships } from "@/lib/sponsorship/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("sponsorships") };
}

// Oportunidades de patrocínio que a agência ofereceu a esta marca (0085): as abertas primeiro, com a resposta da
// marca. 0088: o valor PEDIDO (a menor cota com vaga, ou "Valor a combinar") e em quem está a vez da negociação.
// Nunca as respostas nem as propostas de outras marcas.
// 0089: aba "Minhas chamadas" (?aba=chamadas) — a necessidade que parte da marca, com as propostas das agências.
type Props = { searchParams: Promise<{ aba?: string }> };

export default async function BrandSponsorshipsPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const tab = sp.aba === "chamadas" ? "calls" : "offers";
  const tbc = await getTranslations("brandCall.brand");
  const tabs = (
    <LinkTabsNav
      label={tbc("tabsLabel")}
      value={tab}
      tabs={[
        { value: "offers", label: tbc("tabOffers"), href: "/marca/oportunidades" },
        { value: "calls", label: tbc("tabCalls"), href: "/marca/oportunidades?aba=chamadas" },
      ]}
    />
  );
  if (tab === "calls") return <BrandCallsTab tabs={tabs} brandId={ctx.brand.id} canCreate={Boolean(ctx.role)} />;
  const [t, locale, list] = await Promise.all([getTranslations("sponsorship.brand"), getLocale() as Promise<Locale>, listBrandSponsorships(ctx.brand.id)]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Handshake />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const priceLine = (tiers: (typeof list.items)[number]["tiers"]) => {
    const priced = tiers.filter((z) => !z.full && z.priceCents !== null).map((z) => z.priceCents as number);
    if (tiers.length > 0 && tiers.every((z) => z.full)) return t("allTiersFull");
    if (priced.length === 0) return t("priceToCombine");
    const min = Math.min(...priced);
    return tiers.filter((z) => !z.full).length > 1 ? t("priceFrom", { amount: formatCents(min, locale) }) : formatCents(min, locale);
  };
  return (
    <div className="flex flex-col gap-5" data-testid="brand-sponsorships">
      <PageHeader title={t("title")} description={ctx.agency ? t("description", { agency: ctx.agency.name }) : t("descriptionNoAgency")} />
      {tabs}
      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Handshake />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="sponsorship-list">
          {list.items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/marca/oportunidades/${o.id}`}
                className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SponsorshipStatusBadge status={o.status} />
                  {o.negotiation && (o.negotiation.status === "open" || o.negotiation.status === "draft") ? (
                    <Badge size="sm" variant={o.negotiation.awaiting === "brand" || o.negotiation.pendingOwner || o.negotiation.status === "draft" ? "warning" : "info"}>
                      {t(o.negotiation.awaiting === "brand" && !o.negotiation.pendingOwner ? "badgeYourTurn" : o.negotiation.pendingOwner || o.negotiation.status === "draft" ? "badgeOwner" : "badgeAgencyTurn")}
                    </Badge>
                  ) : o.myResponse && o.status !== "won" ? (
                    <Badge size="sm" variant={o.myResponse.response === "interested" ? "info" : "neutral"}>
                      {t(o.myResponse.response === "interested" ? "badgeInterested" : "badgeDeclined")}
                    </Badge>
                  ) : o.status === "open" ? (
                    <Badge size="sm" variant="warning">
                      {t("badgePending")}
                    </Badge>
                  ) : null}
                  <span className="text-sm font-semibold text-fg">{o.title}</span>
                </span>
                <span className="flex items-center gap-2 type-caption text-fg-muted" data-testid="sponsorship-hero-line">
                  <Avatar src={o.hero.avatarUrl} name={o.hero.name || o.talent.name} size="xs" alt="" />
                  <span className="min-w-0">
                    <span className="font-medium text-fg">{o.hero.name || o.talent.name}</span> · {sponsorshipWhen(o, locale, o.timezone)}
                    {o.location ? ` · ${o.location}` : ""}
                  </span>
                </span>
                <span className="text-sm font-medium text-fg" data-testid="sponsorship-price">{priceLine(o.tiers)}</span>
                {o.status === "open" ? <span className="type-caption text-fg-muted">{t("respondUntil", { date: formatDateTime(o.respondBy, locale, o.timezone) })}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Minhas chamadas (0089): rascunhos, abertas e decididas, com quantas propostas chegaram e em quem está a vez.
async function BrandCallsTab({ tabs, brandId, canCreate }: { tabs: ReactNode; brandId: string; canCreate: boolean }) {
  const [t, locale, list] = await Promise.all([getTranslations("brandCall.brand"), getLocale() as Promise<Locale>, listBrandCalls(brandId)]);
  const newButton = canCreate ? (
    <Button asChild size="sm" leadingIcon={<Plus />}>
      <Link href="/marca/oportunidades/nova" data-testid="brand-call-new">
        {t("new")}
      </Link>
    </Button>
  ) : null;
  return (
    <div className="flex flex-col gap-5" data-testid="brand-calls">
      <PageHeader title={t("title")} description={t("description")} actions={newButton} />
      {tabs}
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<Megaphone />} title={t("unavailable")} />
        </div>
      ) : list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Megaphone />} title={t("empty")} description={t("emptyHint")} action={newButton} />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="brand-call-list">
          {list.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/marca/oportunidades/chamadas/${c.id}`}
                className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <CallStatusBadge status={c.status} closedReason={c.closedReason} />
                  {c.approval === "pending" ? (
                    <Badge size="sm" variant="warning">
                      {t("badgeApproval")}
                    </Badge>
                  ) : null}
                  {c.awaitingBrand > 0 ? (
                    <Badge size="sm" variant="warning">
                      {t("badgeYourTurn", { count: c.awaitingBrand })}
                    </Badge>
                  ) : null}
                  {c.pendingOwner > 0 ? (
                    <Badge size="sm" variant="warning">
                      {t("badgeOwner")}
                    </Badge>
                  ) : null}
                  <span className="text-sm font-semibold text-fg">{c.title}</span>
                </span>
                <span className="type-caption text-fg-muted">
                  {formatPlainDate(c.startsOn, locale)}
                  {c.endsOn !== c.startsOn ? ` – ${formatPlainDate(c.endsOn, locale)}` : ""}
                  {c.status !== "draft" ? ` · ${t("proposals", { count: c.proposals })}` : ""}
                  {c.agreed > 0 ? ` · ${t("agreed", { count: c.agreed })}` : ""}
                </span>
                {c.status === "open" && c.respondBy ? <span className="type-caption text-fg-muted">{t("respondUntil", { date: formatDateTime(c.respondBy, locale) })}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
