import type { Metadata } from "next";
import { Handshake, Megaphone, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { LinkTabsNav } from "@/components/admin-content/LinkTabsNav";
import { AgencyCallStatusBadge, BudgetText } from "@/components/brand-call/shared";
import { SponsorshipStatusBadge, sponsorshipWhen } from "@/components/sponsorship/SponsorshipView";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { listAgencyBrandCalls } from "@/lib/brand-call/queries";
import { listAgencySponsorships } from "@/lib/sponsorship/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("sponsorships") };
}

// Oportunidades de patrocínio (0085), gestor+: as abertas primeiro, com quantas marcas quiseram, recusaram e
// ainda não responderam; a ficha mostra marca por marca e a decisão.
// 0089: aba "Pedidos de marcas" (?aba=pedidos) — chamadas das marcas cujo alvo inclui esta agência.
type Props = { searchParams: Promise<{ aba?: string }> };

export default async function AgencySponsorshipsPage({ searchParams }: Props) {
  const ctx = await requireAgency("manager");
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const sp = await searchParams;
  const tab = sp.aba === "pedidos" ? "calls" : "offers";
  const tbc = await getTranslations("brandCall.agency");
  const tabs = (
    <LinkTabsNav
      label={tbc("tabsLabel")}
      value={tab}
      tabs={[
        { value: "offers", label: tbc("tabOffers"), href: "/agencia/oportunidades" },
        { value: "calls", label: tbc("tabCalls"), href: "/agencia/oportunidades?aba=pedidos" },
      ]}
    />
  );
  if (tab === "calls") return <BrandCallsTab tabs={tabs} agencyId={ctx.agency.id} canValues={agencyCan(ctx.role, "admin", ctx.platformAdmin)} />;
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
      {tabs}
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

// Pedidos de marcas (0089): as abertas primeiro; a verba só para o Adm (na forma escolhida pela marca), a situação da
// própria proposta e quantos creators demonstraram interesse. Nunca quem mais foi convidado nem quantas propostas há.
async function BrandCallsTab({ tabs, agencyId, canValues }: { tabs: ReactNode; agencyId: string; canValues: boolean }) {
  const [t, locale, list] = await Promise.all([getTranslations("brandCall.agency"), getLocale() as Promise<Locale>, listAgencyBrandCalls(agencyId)]);
  return (
    <div className="flex flex-col gap-5" data-testid="agency-brand-calls">
      <PageHeader title={t("title")} description={t("description")} />
      {tabs}
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<Megaphone />} title={t("unavailable")} />
        </div>
      ) : list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Megaphone />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="agency-brand-call-list">
          {list.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/agencia/oportunidades/pedidos/${c.id}`}
                className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <AgencyCallStatusBadge status={c.viewStatus} />
                  {c.proposal ? (
                    <Badge size="sm" variant={c.proposal.status === "open" && c.proposal.awaiting === "agency" ? "warning" : "neutral"}>
                      {t(`proposalBadge.${c.proposal.status === "open" ? (c.proposal.awaiting === "agency" ? "yourTurn" : "withBrand") : c.proposal.status}`)}
                    </Badge>
                  ) : null}
                  {c.interests > 0 ? (
                    <Badge size="sm" variant="accent">
                      {t("interests", { count: c.interests })}
                    </Badge>
                  ) : null}
                  <span className="text-sm font-semibold text-fg">{c.title}</span>
                </span>
                <span className="type-caption text-fg-muted">
                  {c.brandName} · {formatPlainDate(c.startsOn, locale)}
                  {c.endsOn !== c.startsOn ? ` – ${formatPlainDate(c.endsOn, locale)}` : ""} · {t("creatorsWanted", { count: c.creatorsWanted })}
                </span>
                <span className="type-caption text-fg-muted">
                  <BudgetText display={c.budgetDisplay} cents={c.budgetCents} canValues={canValues} />
                  {c.viewStatus === "open" && c.respondBy ? ` · ${t("respondUntil", { date: formatDateTime(c.respondBy, locale) })}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
