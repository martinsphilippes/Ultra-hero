import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { RightsView } from "@/components/offer/RightsView";
import { Badge, PageHeader, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { rightsBand, type RightsBand } from "@/lib/media/metrics";
import { getBrandLibrary } from "@/lib/media/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("media.library");
  return { title: t("meta") };
}

const TONE: Record<RightsBand, BadgeVariant> = { none: "neutral", pending: "neutral", ok: "success", soon15: "warning", soon7: "warning", today: "danger", expired: "danger" };
const FILTERS = ["all", "expiring", "expired"] as const;
type Filter = (typeof FILTERS)[number];

type Props = { searchParams: Promise<{ f?: string }> };

// Biblioteca de conteúdos da marca (0083): cada entregável aprovado ou publicado, com link, influenciador,
// campanha, direitos de uso (termos da 0079) e vencimento do direito (publicação + prazo). Avisos no sino a 15, 7
// e 0 dias (cron diário). Filtros: todos, vencendo (até 15 dias) e vencidos.
export default async function BrandLibraryPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { f } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(f ?? "") ? (f as Filter) : "all";
  const [t, tc, tn, locale, lib] = await Promise.all([getTranslations("media.library"), getTranslations("commercial"), getTranslations("mediaKit.networks"), getLocale() as Promise<Locale>, getBrandLibrary(ctx.brand.id)]);
  const items = lib.items.map((x) => ({ ...x, band: rightsBand({ published: x.published, expiresOn: x.expiresOn, daysLeft: x.daysLeft, perpetual: x.rights?.perpetual ?? false }) }));
  const expiring = items.filter((x) => ["soon15", "soon7", "today"].includes(x.band));
  const expired = items.filter((x) => x.band === "expired");
  const shown = filter === "expiring" ? expiring : filter === "expired" ? expired : items;
  const counts: Record<Filter, number> = { all: items.length, expiring: expiring.length, expired: expired.length };

  return (
    <div className="flex flex-col gap-5" data-testid="brand-library">
      <PageHeader title={t("title")} description={t("description")} />
      {!lib.available ? <p className="rounded-xl border border-dashed border-border-strong px-3 py-2 type-body-sm text-fg-muted">{t("unavailable")}</p> : null}
      <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-2">
        {FILTERS.map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/marca/biblioteca" : `/marca/biblioteca?f=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${filter === key ? "border-accent/40 bg-accent-soft text-accent-text" : "border-border text-fg-muted hover:bg-surface-hover"}`}
          >
            {t(`filters.${key}`)} <span className="font-mono">{counts[key]}</span>
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{filter === "all" ? t("empty") : t("emptyFilter")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="library-item" data-band={x.band}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-fg">{x.title || tc(`deliverableKinds.${x.kind}`)}</span>
                <Badge size="sm">{tc(`deliverableKinds.${x.kind}`)}</Badge>
                {x.network ? <Badge size="sm">{tn(x.network)}</Badge> : null}
              </div>
              <p className="type-caption text-fg-muted">
                {x.talentName} ·{" "}
                {x.requestId ? (
                  <Link href={`/marca/campanhas/${x.requestId}`} className="font-medium text-accent-text underline-offset-2 hover:underline">
                    {x.campaign}
                  </Link>
                ) : (
                  x.campaign
                )}
              </p>
              <p className="type-caption text-fg-muted">
                {x.publishedAt ? t("publishedOn", { date: formatPlainDate(x.publishedAt.slice(0, 10), locale) }) : t("approvedNotPublished")}
              </p>
              <Badge size="md" variant={TONE[x.band]} className="w-fit">
                {x.band === "none"
                  ? x.rights?.perpetual
                    ? t("band.perpetual")
                    : t("band.none")
                  : x.band === "pending"
                    ? t("band.pending")
                    : x.band === "expired"
                      ? t("band.expired", { date: formatPlainDate(x.expiresOn as string, locale) })
                      : x.band === "today"
                        ? t("band.today")
                        : t("band.until", { date: formatPlainDate(x.expiresOn as string, locale), days: x.daysLeft ?? 0 })}
              </Badge>
              {x.rights ? <RightsView rights={x.rights} compact /> : <p className="type-caption text-fg-muted">{t("noTerms")}</p>}
              {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {x.published ? t("openPublished") : t("openApproved")}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
