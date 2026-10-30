import type { Metadata } from "next";
import { ChevronRight, Eye, Gavel, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { photoUnoptimized } from "@/components/collectibles/CollectibleCard";
import { Badge, Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { fetchCollectibleViews, PHASE_BADGE } from "@/lib/collectibles/admin";
import { coverPhoto, phaseOf } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";

// Colecionáveis (admin): todos os itens com a fase efetiva, preço, lances e visualizações.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectibles.admin");
  return { title: t("title") };
}

type Row = {
  id: string;
  title: string;
  photos: string[];
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  current_cents: number;
  bids_count: number;
  is_demo: boolean;
  creator: { name: string } | null;
};

export default async function AdminCollectiblesPage() {
  const [t, locale, supabase] = await Promise.all([getTranslations("collectibles.admin"), getLocale(), createClient()]);
  const { data, error } = await supabase
    .from("collectibles")
    .select("id, title, photos, status, starts_at, ends_at, current_cents, bids_count, is_demo, creator:creator_profiles(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("description")} />
        <p role="status" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
          {t("unavailable")}
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Row[];
  const views = await fetchCollectibleViews(supabase);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild leadingIcon={<Plus />}>
            <Link href="/admin/collectibles/new">{t("new")}</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="admin-collectibles">
          {rows.map((row) => {
            const phase = phaseOf({ status: row.status, startsAt: row.starts_at, endsAt: row.ends_at }, now);
            const photo = coverPhoto({ photos: row.photos ?? [] });
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/collectibles/${row.id}`}
                  data-testid="admin-collectible-row"
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
                    <Image src={photo} alt="" fill unoptimized={photoUnoptimized(photo)} sizes="56px" className="object-cover" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={PHASE_BADGE[phase] ?? "neutral"} size="sm">
                        {t(`phase.${phase}`)}
                      </Badge>
                      {row.is_demo ? (
                        <Badge variant="demo" size="sm">
                          {t("demo")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="truncate text-sm font-semibold text-fg">{row.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-muted">
                      {row.creator ? <span>{row.creator.name}</span> : null}
                      <span className="type-numeric font-semibold text-fg">{formatCurrency(row.current_cents / 100, locale as Locale)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Gavel aria-hidden="true" className="size-3" />
                        {t("bids", { n: row.bids_count })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye aria-hidden="true" className="size-3" />
                        {t("views", { n: views.get(row.id) ?? 0 })}
                      </span>
                      {row.ends_at && phase !== "draft" ? <span>{t("endsAt", { date: formatDateTime(row.ends_at, locale as Locale) })}</span> : null}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
