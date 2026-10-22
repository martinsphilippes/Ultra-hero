import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Bookmark, ChefHat, Heart, History, ListChecks } from "lucide-react";
import { ContentCard } from "@/components/catalog";
import { RemoveFromListButton } from "@/components/discover/explore/RemoveFromListButton";
import { CARD_GRID } from "@/components/discover/grid";
import { UrlTabs } from "@/components/discover/UrlTabs";
import { HistoryPanel } from "@/components/recipes/collection/HistoryPanel";
import { RemoveRecipeButton } from "@/components/recipes/collection/RemoveRecipeButton";
import { Button, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatRelativeTime } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { categoryCounts, collectionHref, parseCollectionParams, type CollectionTab } from "@/lib/recipes/collection";
import { historyCutoff, loadHistoryPref, RECIPE_HISTORY_LIMIT } from "@/lib/recipes/history";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("kitchen.collection");
  return { title: t("title") };
}

type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type CardRow = { content_id: string; content: ContentCardData | null };

const chipClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Minha coleção de receitas (o nome "Coleções" já é dos programas): receitas salvas (favoritos de
// receita) com filtro por categoria, as listas pessoais que têm receitas e o histórico opcional.
export default async function RecipeCollectionPage({ searchParams }: SearchParams) {
  const user = await requireUser("/profile/receitas");
  const [params, t, tc, ts, locale] = await Promise.all([
    searchParams.then(parseCollectionParams),
    getTranslations("kitchen.collection"),
    getTranslations("common"),
    getTranslations("recipes.structured"),
    getLocale(),
  ]);
  const uiLocale = locale as Locale;
  const supabase = await createClient();

  const tabs: { value: CollectionTab; label: string; icon: ReactNode }[] = [
    { value: "salvas", label: t("tabs.saved"), icon: <Heart /> },
    { value: "listas", label: t("tabs.lists"), icon: <ListChecks /> },
    { value: "vistas", label: t("tabs.history"), icon: <History /> },
  ];

  let panel: ReactNode;

  if (params.tab === "salvas") {
    const { data, error } = await supabase
      .from("favorites")
      .select(`content_id, created_at, content:content!inner(${CONTENT_CARD_SELECT})`)
      .eq("user_id", user.id)
      .eq("content.type", "recipe")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as unknown as CardRow[]).filter((r): r is CardRow & { content: ContentCardData } => Boolean(r.content));
    const ids = rows.map((r) => r.content_id);
    const [linksRes, catsRes] = ids.length
      ? await Promise.all([
          supabase.from("recipe_category_links").select("content_id, category_code").in("content_id", ids),
          supabase.from("recipe_categories").select("code, name, sort_order").order("sort_order"),
        ])
      : [null, null];
    // sem as tabelas de receita (banco antigo) a coleção segue sem o filtro de categoria
    const links = (linksRes?.data ?? []) as { content_id: string; category_code: string }[];
    const catRows = (catsRes?.data ?? []) as { code: string; name: Record<string, string> | null }[];
    const catName = (code: string) => (ts.has(`categories.${code}`) ? ts(`categories.${code}`) : (catRows.find((c) => c.code === code)?.name?.[uiLocale] ?? catRows.find((c) => c.code === code)?.name?.["pt-BR"] ?? code));
    const counts = categoryCounts(links, ids, catRows.map((c) => c.code));
    const inCategory = params.category ? new Set(links.filter((l) => l.category_code === params.category).map((l) => l.content_id)) : null;
    const visible = inCategory ? rows.filter((r) => inCategory.has(r.content_id)) : rows;

    panel = error ? (
      <ErrorState />
    ) : rows.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60" data-testid="saved-empty">
        <EmptyState
          icon={<Heart />}
          title={t("saved.emptyTitle")}
          description={t("saved.emptyDescription")}
          action={
            <Button asChild variant="primary">
              <Link href="/explore">{t("saved.emptyCta")}</Link>
            </Button>
          }
        />
      </div>
    ) : (
      <div className="flex flex-col gap-5">
        {counts.length > 0 && (
          <nav aria-label={t("saved.categoriesLabel")}>
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={collectionHref("salvas")}
                  aria-current={params.category === null ? "page" : undefined}
                  className={cn(chipClass, params.category === null ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg hover:bg-surface-hover")}
                >
                  {t("saved.all", { n: rows.length })}
                </Link>
              </li>
              {counts.map((c) => (
                <li key={c.code}>
                  <Link
                    href={collectionHref("salvas", c.code)}
                    aria-current={params.category === c.code ? "page" : undefined}
                    className={cn(chipClass, params.category === c.code ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg hover:bg-surface-hover")}
                  >
                    {catName(c.code)} <span className="type-numeric opacity-80">({c.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <p className="type-caption text-fg-muted" aria-live="polite">
          {t("saved.count", { n: visible.length })}
        </p>
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState size="sm" icon={<ChefHat />} title={t("saved.emptyCategory")} />
          </div>
        ) : (
          <ul className={CARD_GRID} aria-label={t("tabs.saved")} data-testid="saved-list">
            {visible.map((row, index) => (
              <li key={row.content_id} className="flex h-full flex-col gap-2">
                <div className="flex-1">
                  <ContentCard content={row.content} priority={index === 0} />
                </div>
                <RemoveRecipeButton kind="saved" contentId={row.content_id} title={row.content.title} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (params.tab === "listas") {
    const { data: lists, error } = await supabase.from("custom_lists").select("id, name, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
    const listIds = (lists ?? []).map((l) => l.id);
    const { data: items } = listIds.length
      ? await supabase
          .from("list_items")
          .select(`list_id, added_at, content:content!inner(${CONTENT_CARD_SELECT})`)
          .in("list_id", listIds)
          .eq("content.type", "recipe")
          .order("added_at", { ascending: false })
      : { data: [] };
    const byList = new Map<string, ContentCardData[]>();
    for (const item of (items ?? []) as unknown as { list_id: string; content: ContentCardData | null }[]) {
      if (!item.content) continue;
      byList.set(item.list_id, [...(byList.get(item.list_id) ?? []), item.content]);
    }
    const withRecipes = (lists ?? []).filter((l) => byList.has(l.id));
    const withoutRecipes = (lists ?? []).length - withRecipes.length;

    panel = error ? (
      <ErrorState />
    ) : withRecipes.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60" data-testid="lists-empty">
        <EmptyState
          icon={<Bookmark />}
          title={t("lists.emptyTitle")}
          description={t("lists.emptyDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/explore?tab=listas">{t("lists.manage")}</Link>
            </Button>
          }
        />
      </div>
    ) : (
      <div className="flex flex-col gap-8">
        {withRecipes.map((list) => {
          const recipes = byList.get(list.id) ?? [];
          return (
            <section key={list.id} aria-labelledby={`list-${list.id}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`list-${list.id}`} className="type-h3 text-fg">
                  {list.name} <span className="type-caption text-fg-muted">· {t("lists.count", { n: recipes.length })}</span>
                </h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/explore/lists/${list.id}`}>{t("lists.open")}</Link>
                </Button>
              </div>
              <ul className={CARD_GRID}>
                {recipes.map((content) => (
                  <li key={content.id} className="flex h-full flex-col gap-2">
                    <div className="flex-1">
                      <ContentCard content={content} />
                    </div>
                    <RemoveFromListButton listId={list.id} contentId={content.id} title={content.title} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {withoutRecipes > 0 && (
          <p className="type-caption text-fg-muted">
            {t("lists.others", { n: withoutRecipes })}{" "}
            <Link href="/explore?tab=listas" className="font-semibold text-accent-text hover:underline">
              {t("lists.manage")}
            </Link>
          </p>
        )}
      </div>
    );
  } else {
    const pref = await loadHistoryPref(supabase, user.id);
    const { data: history } =
      pref.available && pref.enabled
        ? await supabase
            .from("recipe_view_history")
            .select(`content_id, viewed_at, content:content(${CONTENT_CARD_SELECT})`)
            .eq("user_id", user.id)
            .gte("viewed_at", historyCutoff().toISOString())
            .order("viewed_at", { ascending: false })
            .limit(RECIPE_HISTORY_LIMIT)
        : { data: [] };
    const rows = ((history ?? []) as unknown as (CardRow & { viewed_at: string })[]).filter((r): r is CardRow & { viewed_at: string; content: ContentCardData } => Boolean(r.content));

    panel = !pref.available ? (
      <div className="rounded-2xl border border-border bg-surface" data-testid="history-unavailable">
        <EmptyState size="sm" icon={<History />} title={t("history.unavailableTitle")} description={t("history.unavailableDescription")} />
      </div>
    ) : (
      <div className="flex flex-col gap-6">
        <HistoryPanel
          enabled={pref.enabled}
          enabledLabel={pref.enabledAt ? t("history.since", { date: formatDate(pref.enabledAt, uiLocale) }) : null}
          hasItems={rows.length > 0}
        />
        {!pref.enabled ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60" data-testid="history-off">
            <EmptyState size="sm" icon={<History />} title={t("history.offTitle")} description={t("history.offDescription")} />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60" data-testid="history-empty">
            <EmptyState size="sm" icon={<History />} title={t("history.emptyTitle")} description={t("history.emptyDescription")} />
          </div>
        ) : (
          <ul className={CARD_GRID} aria-label={t("tabs.history")} data-testid="history-list">
            {rows.map((row) => (
              <li key={row.content_id} className="flex h-full flex-col gap-2">
                <div className="flex-1">
                  <ContentCard content={row.content} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="type-caption text-fg-muted">{t("history.viewed", { when: formatRelativeTime(row.viewed_at, uiLocale) })}</p>
                  <RemoveRecipeButton kind="history" contentId={row.content_id} title={row.content.title} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />
      <UrlTabs value={params.tab} aria-label={t("tabs.label")} tabs={tabs.map((tab) => ({ ...tab, href: collectionHref(tab.value) }))}>
        {panel}
      </UrlTabs>
    </div>
  );
}
