import type { Metadata } from "next";
import { Handshake } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { SponsorshipStatusBadge, sponsorshipWhen } from "@/components/sponsorship/SponsorshipView";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
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
export default async function BrandSponsorshipsPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
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
                <span className="type-caption text-fg-muted">
                  {o.talent.name} · {sponsorshipWhen(o, locale, o.timezone)}
                  {o.location ? ` · ${o.location}` : ""}
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
