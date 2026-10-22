import type { Metadata } from "next";
import { ChefHat, Plus, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { RecipeRowActions } from "@/components/recipes/portal/RecipeRowActions";
import { Badge, Button, Input, PageHeader, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { RECIPE_DIFFICULTIES } from "@/lib/recipes/payload";
import {
  MY_RECIPE_STATUSES,
  dateRange,
  escapeLike,
  hasActiveFilters,
  hasAnyStats,
  myRecipeStatus,
  parseMyRecipesFilters,
  recipeActions,
  statsDisplay,
  type MyRecipeStatus,
  type RecipeStats,
  type StatsDisplay,
} from "@/lib/recipes/portal";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../_lib/creator";
import { loadRecipeCategories } from "./_lib/load";

export async function generateMetadata(): Promise<Metadata> {
  const [tn, t] = await Promise.all([getTranslations("nav"), getTranslations("recipes.portal")]);
  return { title: `${tn("portals.creator")} · ${t("title")}` };
}

type Row = {
  id: string;
  slug: string;
  title: string;
  status: string;
  review_status: string;
  publish_at: string | null;
  published_at: string | null;
  archived_by: string | null;
  difficulty: string | null;
  updated_at: string;
};

type ViewRow = Row & { situation: MyRecipeStatus; categories: string[]; stats: StatsDisplay };

const SITUATION_BADGE: Record<MyRecipeStatus, string> = {
  draft: "draft",
  in_review: "in_review",
  returned: "returned",
  scheduled: "scheduled",
  published: "published",
  archived: "archived",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Minhas Receitas: lista das receitas do herói com busca, filtros (GET, funciona sem JS),
// situação derivada (agendada = publicada com data futura), indicadores reais e ações.
export default async function MyRecipesPage({ searchParams }: Props) {
  const filters = parseMyRecipesFilters(await searchParams);
  const [t, tn, locale, ctx] = await Promise.all([getTranslations("recipes.portal"), getTranslations("nav"), getLocale(), getMyCreator()]);
  const tcat = await getTranslations("catalog");
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("title")} />;

  const supabase = await createClient();
  const categories = await loadRecipeCategories(supabase, locale);
  const categoryLabel = new Map(categories.map((c) => [c.code, c.label]));

  // filtro de categoria: ids das receitas ligadas (o herói lê os vínculos das próprias receitas)
  let idsInCategory: string[] | null = null;
  if (filters.cat) {
    const { data } = await supabase.from("recipe_category_links").select("content_id").eq("category_code", filters.cat);
    idsInCategory = ((data ?? []) as { content_id: string }[]).map((r) => r.content_id);
  }

  let query = supabase
    .from("content")
    .select("id, slug, title, status, review_status, publish_at, published_at, archived_by, difficulty, updated_at")
    .eq("creator_id", ctx.creatorId)
    .eq("type", "recipe")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters.status === "archived") query = query.eq("status", "archived");
  else if (filters.status === "published" || filters.status === "scheduled") query = query.eq("status", "published");
  else if (filters.status === "in_review") query = query.eq("status", "draft").eq("review_status", "in_review");
  else if (filters.status === "returned") query = query.eq("status", "draft").in("review_status", ["returned", "rejected"]);
  else if (filters.status === "draft") query = query.eq("status", "draft").not("review_status", "in", "(in_review,returned,rejected)");
  if (filters.diff !== "all") query = query.eq("difficulty", filters.diff);
  if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
  const range = dateRange(filters.from, filters.to);
  if (range.gte) query = query.gte("updated_at", range.gte);
  if (range.lt) query = query.lt("updated_at", range.lt);
  if (idsInCategory) query = query.in("id", idsInCategory.length > 0 ? idsInCategory : ["00000000-0000-0000-0000-000000000000"]);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const now = new Date();
  const base = ((data ?? []) as Row[])
    .map((row) => ({ ...row, situation: myRecipeStatus(row, now) }))
    .filter((row) => filters.status === "all" || row.situation === filters.status);

  const ids = base.map((r) => r.id);
  const [linksRes, statsRes] = await Promise.all([
    ids.length > 0 ? supabase.from("recipe_category_links").select("content_id, category_code").in("content_id", ids) : null,
    // agregados e aproximados (0027); sem a função no banco, sem indicadores
    supabase.rpc("creator_recipe_stats", { p_days: 30 }),
  ]);
  const linksBy = new Map<string, string[]>();
  for (const l of (linksRes?.data ?? []) as { content_id: string; category_code: string }[]) {
    linksBy.set(l.content_id, [...(linksBy.get(l.content_id) ?? []), l.category_code]);
  }
  const statsBy = new Map<string, RecipeStats>();
  for (const s of (statsRes.error ? [] : (statsRes.data ?? [])) as { content_id: string; visitors: number; favorites: number; rating_count: number; rating_avg: number | null }[]) {
    statsBy.set(s.content_id, { visitors: s.visitors, favorites: s.favorites, ratingCount: s.rating_count, ratingAvg: s.rating_avg === null ? null : Number(s.rating_avg) });
  }
  const rows: ViewRow[] = base.map((r) => ({ ...r, categories: linksBy.get(r.id) ?? [], stats: statsDisplay(statsBy.get(r.id)) }));
  const showStats = hasAnyStats(rows.map((r) => r.stats));
  const uiLocale = locale as Locale;
  const filtered = hasActiveFilters(filters);

  const columns: Column<ViewRow>[] = [
    {
      key: "title",
      header: t("columns.title"),
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/creator/recipes/${row.id}/edit`}
            className="line-clamp-2 font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="recipe-row-title"
          >
            {row.title}
          </Link>
          <span className="flex flex-wrap gap-1">
            {row.categories.map((c) => (
              <Badge key={c} size="sm">
                {categoryLabel.get(c) ?? c}
              </Badge>
            ))}
            {row.difficulty ? <Badge size="sm" variant="neutral">{tcat(`difficulty.${row.difficulty}`)}</Badge> : null}
          </span>
          {row.situation === "scheduled" && row.publish_at ? <span className="type-caption text-info">{t("scheduledFor", { date: formatDateTime(row.publish_at, uiLocale) })}</span> : null}
        </span>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (row) => <StatusBadge status={SITUATION_BADGE[row.situation]} label={t(`statuses.${row.situation}`)} /> },
    { key: "updated", header: t("columns.updated"), hideOnMobile: true, cell: (row) => <span className="text-fg-muted">{formatDateTime(row.updated_at, uiLocale)}</span> },
    ...(showStats
      ? [
          {
            key: "stats",
            header: t("columns.stats"),
            // visível também no celular (portal mobile-first): só aparece quando há dado real
            cell: (row: ViewRow) => (
              <span className="flex flex-col gap-0.5 type-caption text-fg-muted" title={t("stats.hint")}>
                <span>{row.stats.visitors !== null ? t("stats.visitors", { n: row.stats.visitors }) : t("stats.none")}</span>
                {row.stats.favorites !== null ? <span>{t("stats.favorites", { n: row.stats.favorites })}</span> : null}
                {row.stats.rating !== null ? <span>{t("stats.rating", { n: row.stats.rating })}</span> : null}
              </span>
            ),
          } satisfies Column<ViewRow>,
        ]
      : []),
    {
      key: "actions",
      header: t("columns.actions"),
      align: "right",
      cell: (row) => <RecipeRowActions id={row.id} title={row.title} slug={row.slug} situation={row.situation} allowed={recipeActions(row.situation, row)} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.creator")}>
        <div>
          <Button asChild size="lg" leadingIcon={<Plus />} className="min-h-12">
            <Link href="/creator/recipes/new" data-testid="new-recipe">
              {t("new")}
            </Link>
          </Button>
        </div>
        <form method="get" action="/creator/recipes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]" aria-label={t("filters")}>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg sm:col-span-2 lg:col-span-1">
            {t("search")}
            <Input name="q" defaultValue={filters.q} placeholder={t("searchPlaceholder")} leadingIcon={<Search />} maxLength={80} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {t("category")}
            <Select name="cat" defaultValue={filters.cat}>
              <option value="">{t("allCategories")}</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {t("status")}
            <Select name="status" defaultValue={filters.status}>
              <option value="all">{t("allStatuses")}</option>
              {MY_RECIPE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {t("difficulty")}
            <Select name="diff" defaultValue={filters.diff}>
              <option value="all">{t("allDifficulties")}</option>
              {RECIPE_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {tcat(`difficulty.${d}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {t("from")}
            <Input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-fg">
            {t("to")}
            <Input type="date" name="to" defaultValue={filters.to} />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
            {filtered && (
              <Button asChild variant="ghost">
                <Link href="/creator/recipes">{t("clear")}</Link>
              </Button>
            )}
          </div>
        </form>
      </PageHeader>

      <div className="flex flex-col gap-1">
        <p className="type-caption text-fg-muted" aria-live="polite" data-testid="recipes-count">
          {t("count", { count: rows.length })}
        </p>
        {!showStats && rows.length > 0 ? <p className="type-caption text-fg-subtle">{t("stats.empty")}</p> : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption={t("tableCaption")}
        emptyTitle={filtered ? t("noResultsTitle") : t("emptyTitle")}
        emptyDescription={filtered ? t("noResultsDescription") : t("emptyDescription")}
        emptyAction={
          filtered ? undefined : (
            <Button asChild leadingIcon={<ChefHat />}>
              <Link href="/creator/recipes/new">{t("new")}</Link>
            </Button>
          )
        }
      />
    </div>
  );
}
