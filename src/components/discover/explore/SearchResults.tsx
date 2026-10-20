import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ContentCard } from "@/components/catalog";
import { Button, EmptyState } from "@/components/ui";
import { InlineError } from "../InlineError";
import { LoadMore } from "./LoadMore";
import { activeFilterCount, exploreHref, type ExploreParams } from "./params";
import { PAGE_SIZE, searchContentPage, type SearchQuery } from "./search";
import { SearchTracker } from "./SearchTracker";

// Primeira página da busca (RPC search_content) + "carregar mais" no cliente.
export async function SearchResults({ params }: { params: ExploreParams }) {
  const t = await getTranslations("discover.explore.search");
  const query: SearchQuery = { q: params.q, pillar: params.pillar, type: params.type, access: params.access, difficulty: params.difficulty };
  const queryKey = JSON.stringify(query);
  const hasCriteria = Boolean(params.q) || activeFilterCount(params) > 0;

  let page: Awaited<ReturnType<typeof searchContentPage>>;
  try {
    page = await searchContentPage(query, 0);
  } catch {
    return <InlineError />;
  }

  if (page.items.length === 0) {
    return (
      <>
        {hasCriteria && <SearchTracker queryKey={queryKey} qLen={params.q.length} pillar={params.pillar} type={params.type} />}
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<SearchX />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              hasCriteria ? (
                <Button asChild variant="secondary">
                  <Link href="/explore">{t("clearAllAction")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasCriteria && <SearchTracker queryKey={queryKey} qLen={params.q.length} pillar={params.pillar} type={params.type} />}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {params.q ? <h2 className="type-h3 text-fg">{t("resultsFor", { q: params.q })}</h2> : <h2 className="sr-only">{t("resultsHeading")}</h2>}
        <p className="type-caption text-fg-muted">
          {page.hasMore ? t("showingPartial", { count: page.items.length }) : t("showingAll", { count: page.items.length })}
        </p>
      </div>

      <LoadMore key={queryKey} query={query} nextOffset={page.nextOffset} hasMore={page.hasMore} pageSize={PAGE_SIZE} initialCount={page.items.length}>
        {page.items.map((item, index) => (
          <ContentCard key={item.id} content={item} priority={index === 0} />
        ))}
      </LoadMore>

      {params.q || params.pillar || params.type || params.access || params.difficulty ? (
        <p className="type-caption text-fg-subtle">
          <Link href={exploreHref(params, { q: null, pillar: null, type: null, access: null, difficulty: null })} className="font-semibold text-accent-text hover:underline">
            {t("clearAllAction")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
