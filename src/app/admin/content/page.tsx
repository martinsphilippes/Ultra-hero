import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { ActingHeroForCreator } from "@/components/admin-ops/ActingHeroForCreator";
import { FilterBar, type FilterField } from "@/components/admin-content";
import { isScheduled } from "@/components/admin-content/lib/publish-at";
import { escapeLike, hasAnyFilter, pickEnum, pickSearch, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { Badge, Button, PageHeader, PillarBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { CONTENT_TYPES, PILLARS, type Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Lista administrativa de conteúdos: contagens por estado de revisão + filtros + busca por título.

const REVIEW_STATES = ["none", "in_review", "returned", "approved", "rejected"] as const;
const CONTENT_STATES = ["draft", "published", "archived"] as const;
const LIMIT = 100;

type Row = {
  id: string;
  slug: string;
  title: string;
  pillar: Enums<"pillar">;
  type: Enums<"content_type">;
  status: Enums<"content_status">;
  review_status: Enums<"review_status">;
  is_featured: boolean;
  publish_at: string | null;
  updated_at: string;
  creator: { name: string } | null;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content");
  return { title: t("title") };
}

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [t, tc, ts, tp, locale] = await Promise.all([
    getTranslations("adminContent.content"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon"),
    getTranslations("common.pillars"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const q = pickSearch(params);
  const status = pickEnum(params, "status", CONTENT_STATES);
  const review = pickEnum(params, "review", REVIEW_STATES);
  const pillar = pickEnum(params, "pillar", PILLARS);
  const type = pickEnum(params, "type", CONTENT_TYPES);
  const creator = pickUuid(params, "creator");

  let query = supabase
    .from("content")
    .select("id, slug, title, pillar, type, status, review_status, is_featured, publish_at, updated_at, creator:creator_profiles(name)")
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  if (status) query = query.eq("status", status);
  if (review) query = query.eq("review_status", review);
  if (pillar) query = query.eq("pillar", pillar);
  if (type) query = query.eq("type", type);
  if (creator) query = query.eq("creator_id", creator);

  const [listRes, creatorsRes, ...countRes] = await Promise.all([
    query,
    supabase.from("creator_profiles").select("id, name").order("name"),
    ...REVIEW_STATES.map((state) => supabase.from("content").select("id", { count: "exact", head: true }).eq("review_status", state)),
  ]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as Row[];
  const creators = creatorsRes.data ?? [];
  const counts = Object.fromEntries(REVIEW_STATES.map((state, i) => [state, countRes[i]?.count ?? 0])) as Record<(typeof REVIEW_STATES)[number], number>;

  const fields: FilterField[] = [
    { name: "q", label: tc("search"), type: "text", value: q, placeholder: tc("searchPlaceholder") },
    { name: "status", label: tc("status"), type: "select", value: status ?? "", options: CONTENT_STATES.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "review", label: tc("reviewStatus"), type: "select", value: review ?? "", options: REVIEW_STATES.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "pillar", label: tc("pillar"), type: "select", value: pillar ?? "", options: PILLARS.map((p) => ({ value: p, label: tp(p) })) },
    { name: "type", label: tc("type"), type: "select", value: type ?? "", options: CONTENT_TYPES.map((v) => ({ value: v, label: tc(`types.${v}`) })) },
    { name: "creator", label: tc("creator"), type: "select", value: creator ?? "", options: creators.map((c) => ({ value: c.id, label: c.name })) },
  ];

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: t("table.title"),
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/admin/content/${row.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.title}
          </Link>
          <span className="truncate text-xs text-fg-muted">{row.creator?.name ?? tc("noCreator")}</span>
        </div>
      ),
    },
    { key: "pillar", header: t("table.pillar"), hideOnMobile: true, cell: (row) => <PillarBadge tone="pillar" pillar={row.pillar} size="sm" /> },
    { key: "type", header: t("table.type"), hideOnMobile: true, cell: (row) => tc(`types.${row.type}`) },
    {
      key: "status",
      header: t("table.status"),
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={row.status} label={ts(`status.${row.status}`)} />
          {isScheduled(row.status, row.publish_at) && row.publish_at && (
            <Badge variant="info" size="sm">
              {t("schedule.scheduledFor", { date: formatDateTime(row.publish_at, locale as Locale) })}
            </Badge>
          )}
        </span>
      ),
    },
    { key: "review", header: t("table.review"), cell: (row) => <StatusBadge status={row.review_status} label={ts(`status.${row.review_status}`)} /> },
    { key: "updated", header: t("table.updated"), hideOnMobile: true, cell: (row) => <span className="type-numeric text-fg-muted">{formatDate(row.updated_at, locale as Locale)}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* atalho "Conteúdos" de Publicar como hero: a faixa do herói escolhido */}
      <ActingHeroForCreator creatorId={creator} />
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="ghost" size="sm" leadingIcon={<Settings2 />}>
              <Link href="/admin/content/settings">{t("settings")}</Link>
            </Button>
            <Button asChild size="sm" leadingIcon={<Plus />}>
              <Link href={creator ? `/admin/content/new?creator=${creator}` : "/admin/content/new"}>{t("new")}</Link>
            </Button>
          </>
        }
      />

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label={tc("reviewStatus")}>
        {REVIEW_STATES.map((state) => (
          <li key={state}>
            <Link
              href={`/admin/content?review=${state}`}
              aria-current={review === state ? "true" : undefined}
              className={`flex min-h-16 flex-col justify-center rounded-xl border px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${review === state ? "border-accent bg-accent-soft/40" : "border-border bg-surface"}`}
            >
              <span className="type-numeric text-2xl font-bold text-fg">{counts[state]}</span>
              <span className="type-caption text-fg-muted">{t(`counts.${state}`)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <FilterBar action="/admin/content" fields={fields} active={hasAnyFilter(params, ["q", "status", "review", "pillar", "type", "creator"])} />

      <div className="flex flex-col gap-2">
        <p className="type-caption text-fg-muted" aria-live="polite">
          {tc("results", { n: rows.length })}
          {rows.length >= LIMIT ? ` · ${tc("resultsCapped", { n: LIMIT })}` : ""}
        </p>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("table.caption")} emptyTitle={ts("table.noResults")} emptyDescription={ts("table.noResultsDescription")} />
      </div>
    </div>
  );
}
