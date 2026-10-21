import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/server";
import Link from "next/link";
import { ContentTile } from "@/components/catalog";
import { Button, EmptyState } from "@/components/ui";
import { InlineError } from "../InlineError";
import { exploreFeedPage, type FeedPage, type SearchQuery } from "./feed";
import { activeFilterCount, exploreHref, type ExploreParams } from "./params";
import { SearchTracker } from "./SearchTracker";
import { TileGrid } from "./TileGrid";
import { daySeed } from "./tiles";

// Aba Conteúdos do Explorar: grade estilo Instagram. Primeira página no servidor
// (explore_feed sem texto, search_content com texto) + rolagem infinita no cliente.
export async function SearchResults({ params }: { params: ExploreParams }) {
  const t = await getTranslations("discover.explore.search");
  const query: SearchQuery = { q: params.q, pillar: params.pillar, type: params.type, access: params.access, difficulty: params.difficulty };
  const queryKey = JSON.stringify(query);
  const hasCriteria = Boolean(params.q) || activeFilterCount(params) > 0;
  const seed = daySeed();
  // A grade remonta quando muda o que gerou a 1ª página: busca, semente (virada do dia) ou idioma.
  // Qualquer re-render do servidor (troca de idioma/tema, renovação de sessão numa action) preserva o
  // estado do cliente; sem a semente e o idioma na key, os lotes antigos ficariam misturados aos novos.
  const gridKey = JSON.stringify({ ...query, seed, locale: await getLocale() });

  let page: FeedPage;
  try {
    page = await exploreFeedPage(query, seed, 0);
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
      {params.q ? <h2 className="type-h3 text-fg">{t("resultsFor", { q: params.q })}</h2> : <h2 className="sr-only">{t("resultsHeading")}</h2>}

      <TileGrid key={gridKey} gridKey={gridKey} query={query} seed={seed} nextOffset={page.nextOffset} hasMore={page.hasMore} initialCount={page.items.length}>
        {page.items.map((item, index) => (
          <ContentTile key={item.id} content={item} priority={index < 3} />
        ))}
      </TileGrid>

      {hasCriteria ? (
        <p className="type-caption text-fg-subtle">
          <Link href={exploreHref(params, { q: null, pillar: null, type: null, access: null, difficulty: null })} className="font-semibold text-accent-text hover:underline">
            {t("clearAllAction")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
