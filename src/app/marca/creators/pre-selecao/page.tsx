import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { NewShortlistButton } from "@/components/selection/ShortlistControls";
import { Badge, type BadgeVariant, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import type { ShortlistStatus } from "@/lib/selection/logic";
import { listShortlists } from "@/lib/selection/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selection.meta");
  return { title: t("shortlists") };
}

const STATUS_VARIANT: Record<ShortlistStatus, BadgeVariant> = {
  draft: "neutral",
  sent: "warning",
  decided: "success",
};

// Pré-seleção da marca (0081): listas montadas pelo analista para o diretor aprovar (só a marca vê).
export default async function ShortlistsPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const [t, locale, list] = await Promise.all([getTranslations("selection.shortlists"), getLocale() as Promise<Locale>, listShortlists(ctx.brand.id)]);
  const canCreate = Boolean(ctx.role) && Boolean(ctx.agency);

  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ListChecks />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} backHref="/marca/creators" backLabel={t("goCatalog")} actions={canCreate ? <NewShortlistButton /> : null} />
      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<ListChecks />} title={t("empty")} description={t("emptyHint")} action={canCreate ? <NewShortlistButton /> : undefined} />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="shortlist-list">
          {list.items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/marca/creators/pre-selecao/${s.id}`}
                className="flex min-h-14 flex-wrap items-center gap-3 p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold break-words text-fg">{s.title}</span>
                  <span className="type-caption text-fg-muted">
                    {t("counts", {
                      items: s.items,
                      approved: s.approved,
                      rejected: s.rejected,
                    })}
                  </span>
                  <span className="type-caption text-fg-muted">
                    {s.createdLabel ? `${t("by", { name: s.createdLabel })} · ` : ""}
                    {s.sentAt ? t("sentAt", { date: formatDateTime(s.sentAt, locale) }) : formatDateTime(s.updatedAt, locale)}
                  </span>
                </span>
                <Badge size="md" variant={STATUS_VARIANT[s.status]}>
                  {t(`status.${s.status}`)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
