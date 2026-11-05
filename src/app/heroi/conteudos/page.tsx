import type { Metadata } from "next";
import { Camera, ExternalLink, FileText, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DataTable, type Column } from "@/components/admin";
import { ContentStatusBadges } from "@/components/creator/ContentStatusBadges";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { MyHeroSwitcher } from "@/components/creator/content/MyHeroSwitcher";
import { Badge, Button, Input, PageHeader, PillarBadge, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { hasRole } from "@/lib/auth/session";
import { creatorContentHref } from "@/lib/creator-content/rules";
import type { Enums, Pillar } from "@/lib/supabase/helpers";
import { getContentWorkspace, getManagedCreator } from "../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.creator")} · ${t("creator.content")}` };
}

const STATUS = ["all", "draft", "published", "archived"] as const;
const REVIEW = ["all", "none", "in_review", "returned", "approved", "rejected"] as const;
const filterSchema = z.object({
  status: z.enum(STATUS).catch("all"),
  review: z.enum(REVIEW).catch("all"),
  q: z.string().trim().max(80).catch(""),
});

type Row = {
  id: string;
  slug: string;
  title: string;
  pillar: Pillar;
  type: Enums<"content_type">;
  status: Enums<"content_status">;
  review_status: Enums<"review_status">;
  updated_at: string;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Meus conteúdos (0092): o creator (titular ou membro) vê os conteúdos do Hero dele em todos os estados, com
// "Novo post" (rápido) e "Novo conteúdo" (estruturado) no alto. O admin continua no módulo de conteúdo do admin,
// já filtrado pelo Hero escolhido em "Publicar como hero" (sem mudança).
export default async function CreatorContentPage({ searchParams }: Props) {
  const raw = await searchParams;
  const filters = filterSchema.parse({
    status: typeof raw.status === "string" ? raw.status : undefined,
    review: typeof raw.review === "string" ? raw.review : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
  });

  if (await hasRole("admin")) {
    const ctx = await getManagedCreator("content");
    if (!ctx.creatorId) {
      const tn = await getTranslations("nav");
      return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} title={tn("creator.content")} />;
    }
    const query = new URLSearchParams({ creator: ctx.creatorId });
    if (filters.status !== "all") query.set("status", filters.status);
    if (filters.review !== "all") query.set("review", filters.review);
    redirect(`/admin/content?${query.toString()}`);
  }

  const [t, tn, ts, tcat, tc, tnc, locale, ctx] = await Promise.all([
    getTranslations("creator"),
    getTranslations("nav"),
    getTranslations("adminCommon"),
    getTranslations("catalog"),
    getTranslations("common.actions"),
    getTranslations("creator.newContent"),
    getLocale(),
    getContentWorkspace("content", { followChoice: true }),
  ]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={tn("creator.content")} />;

  let query = ctx.supabase
    .from("content")
    .select("id, slug, title, pillar, type, status, review_status, updated_at")
    .eq("creator_id", ctx.creatorId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.review !== "all") query = query.eq("review_status", filters.review);
  if (filters.q) query = query.ilike("title", `%${filters.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const uiLocale = locale as Locale;
  const hasFilters = filters.status !== "all" || filters.review !== "all" || filters.q !== "";

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: t("content.columns.title"),
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-1">
          <Link href={creatorContentHref(row)} data-content-type={row.type} className="line-clamp-2 font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.title}
          </Link>
          <span className="flex flex-wrap gap-1">
            <PillarBadge tone="pillar" pillar={row.pillar} size="sm" />
            <Badge size="sm">{tcat(`types.${row.type}`)}</Badge>
          </span>
        </span>
      ),
    },
    { key: "status", header: ts("table.status"), cell: (row) => <ContentStatusBadges status={row.status} review={row.review_status} /> },
    { key: "updated", header: ts("table.updatedAt"), hideOnMobile: true, cell: (row) => <span className="text-fg-muted">{formatDateTime(row.updated_at, uiLocale)}</span> },
    {
      key: "actions",
      header: ts("table.actions"),
      align: "right",
      cell: (row) => (
        <span className="flex flex-wrap justify-end gap-1">
          <Button asChild variant="secondary" size="sm">
            <Link href={creatorContentHref(row)}>{row.status === "draft" && row.review_status !== "in_review" ? tc("edit") : tc("open")}</Link>
          </Button>
          {row.status === "published" && (
            <Button asChild variant="ghost" size="sm" trailingIcon={<ExternalLink />}>
              <Link href={`/content/${row.slug}`}>{t("content.viewPublic")}</Link>
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tn("creator.content")} description={t("content.description")} eyebrow={ctx.profile?.name ?? tn("portals.creator")} backHref="/profile" backLabel={tn("backToProfile")}>
        {/* dois caminhos claros: Novo post (rápido, foto ou vídeo) e Novo conteúdo (estruturado, com blocos) */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild size="lg" leadingIcon={<Camera />} className="min-h-14 text-base">
            <Link href="/heroi/post/novo" data-testid="new-post">
              {tn("creator.post")}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg" leadingIcon={<FileText />} className="min-h-14 text-base">
            <Link href="/heroi/conteudos/novo" data-testid="new-content">
              {tnc("title")}
            </Link>
          </Button>
        </div>
        <MyHeroSwitcher heroes={ctx.heroes} heroId={ctx.creatorId} />
        <form method="get" action="/heroi/conteudos" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" aria-label={t("content.filters")}>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {tc("search")}
            <Input name="q" defaultValue={filters.q} placeholder={t("content.searchPlaceholder")} leadingIcon={<Search />} maxLength={80} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {ts("table.status")}
            <Select name="status" defaultValue={filters.status}>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? t("content.allStatuses") : ts(`status.${s}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {t("content.columns.review")}
            <Select name="review" defaultValue={filters.review}>
              {REVIEW.map((r) => (
                <option key={r} value={r}>
                  {r === "all" ? t("content.allReviews") : ts(`status.${r}`)}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              {tc("filter")}
            </Button>
            {hasFilters && (
              <Button asChild variant="ghost">
                <Link href="/heroi/conteudos">{tc("clear")}</Link>
              </Button>
            )}
          </div>
        </form>
      </PageHeader>

      <p className="type-caption text-fg-muted" aria-live="polite">
        {t("content.count", { count: rows.length })}
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption={t("content.tableCaption")}
        emptyTitle={hasFilters ? ts("table.noResults") : t("content.emptyTitle")}
        emptyDescription={hasFilters ? ts("table.noResultsDescription") : t("content.emptyDescription")}
        emptyAction={
          hasFilters ? undefined : (
            <Button asChild leadingIcon={<FileText />}>
              <Link href="/heroi/conteudos/novo">{tnc("title")}</Link>
            </Button>
          )
        }
      />
    </div>
  );
}
