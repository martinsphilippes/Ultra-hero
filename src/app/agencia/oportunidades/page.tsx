import type { Metadata } from "next";
import { Handshake, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { SponsorshipStatusBadge, sponsorshipWhen } from "@/components/sponsorship/SponsorshipView";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { listAgencySponsorships } from "@/lib/sponsorship/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("sponsorships") };
}

// Oportunidades de patrocínio (0085), gestor+: as abertas primeiro, com quantas marcas quiseram, recusaram e
// ainda não responderam; a ficha mostra marca por marca e a decisão.
export default async function AgencySponsorshipsPage() {
  const ctx = await requireAgency("manager");
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const [t, locale, list] = await Promise.all([getTranslations("sponsorship.agency"), getLocale() as Promise<Locale>, listAgencySponsorships(ctx.agency.id)]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Handshake />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const newButton = (
    <Button asChild size="sm" leadingIcon={<Plus />}>
      <Link href="/agencia/oportunidades/nova">{t("new")}</Link>
    </Button>
  );
  return (
    <div className="flex flex-col gap-5" data-testid="agency-sponsorships">
      <PageHeader title={t("title")} description={t("description")} actions={newButton} />
      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Handshake />} title={t("empty")} description={t("emptyHint")} action={newButton} />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="sponsorship-list">
          {list.items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/agencia/oportunidades/${o.id}`}
                className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SponsorshipStatusBadge status={o.status} closedReason={o.closedReason} />
                  <span className="text-sm font-semibold text-fg">{o.title}</span>
                  {o.awaitingAgency > 0 ? (
                    <Badge size="sm" variant="warning">
                      {t("awaitingAgency", { count: o.awaitingAgency })}
                    </Badge>
                  ) : null}
                  {o.agreed > 0 ? (
                    <Badge size="sm" variant="accent">
                      {t("agreedCount", { count: o.agreed })}
                    </Badge>
                  ) : null}
                  {o.status === "open" && o.missingPrice > 0 ? (
                    <Badge size="sm" variant="neutral">
                      {t("missingPrice")}
                    </Badge>
                  ) : null}
                </span>
                <span className="type-caption text-fg-muted">
                  {o.talentName} · {sponsorshipWhen(o, locale, tz)}
                  {o.location ? ` · ${o.location}` : ""}
                </span>
                <span className="type-caption text-fg-muted">
                  {o.status === "sponsored" && o.winners.length > 0
                    ? t("sponsoredBy", { brands: o.winners.join(", ") })
                    : t("counts", { interested: o.interested, declined: o.declined, pending: Math.max(0, o.audienceCount - o.interested - o.declined) })}
                  {o.status === "open" ? ` · ${t("respondUntil", { date: formatDateTime(o.respondBy, locale, tz) })}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
