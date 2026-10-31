import type { Metadata } from "next";
import { Megaphone, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrandStatusBadge } from "@/components/deals/StatusBadges";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { listBrandCampaigns } from "@/lib/deals/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("campaigns") };
}

// Campanhas da marca: rascunhos, propostas enviadas e o andamento (situação em 8 etapas, sem valores).
export default async function BrandCampaignsPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const [t, locale, list] = await Promise.all([getTranslations("brandPortal.campaigns"), getLocale() as Promise<Locale>, listBrandCampaigns(ctx.brand.id)]);
  const canCreate = Boolean(ctx.role) && Boolean(ctx.agency);

  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Megaphone />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canCreate ? (
            <Button asChild size="sm" leadingIcon={<Plus />}>
              <Link href="/marca/campanhas/nova">{t("new")}</Link>
            </Button>
          ) : null
        }
      />
      {!ctx.agency ? <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{t("noAgency")}</p> : null}
      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Megaphone />}
            title={t("empty")}
            description={canCreate ? t("emptyHint") : undefined}
            action={
              canCreate ? (
                <Button asChild leadingIcon={<Plus />}>
                  <Link href="/marca/campanhas/nova">{t("new")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="campaign-list">
          {list.items.map((c) => (
            <li key={c.requestId}>
              <Link href={`/marca/campanhas/${c.requestId}`} className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-fg">{c.title}</span>
                  <span className="type-caption text-fg-muted">
                    {c.talentName ? `${t("forCreator", { name: c.talentName })} · ` : ""}
                    {c.periodStart ? `${t("startsOn", { date: formatPlainDate(c.periodStart, locale) })} · ` : ""}
                    {t("updatedAt", { date: formatDateTime(c.updatedAt, locale) })}
                  </span>
                </span>
                <BrandStatusBadge status={c.status} size="md" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
