import type { Metadata } from "next";
import { Bookmark, Layers, LibraryBig, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { ListsTab } from "@/components/discover/explore/ListsTab";
import { exploreHref, parseExploreParams, type ExploreParams, type ExploreTab, type RawSearchParams } from "@/components/discover/explore/params";
import { ProductsTab } from "@/components/discover/explore/ProductsTab";
import { ProgramsTab } from "@/components/discover/explore/ProgramsTab";
import { SearchForm } from "@/components/discover/explore/SearchForm";
import { SearchResults } from "@/components/discover/explore/SearchResults";
import { CardsSkeleton, TilesSkeleton } from "@/components/discover/SectionSkeleton";
import { UrlTabs } from "@/components/discover/UrlTabs";
import { PageHeader } from "@/components/ui";

type Props = { searchParams: Promise<RawSearchParams> };

// Como no Instagram, o Explorar tem só a caixa de busca: filtros antigos na URL (links salvos) são
// ignorados em vez de dar erro.
async function readParams(searchParams: Promise<RawSearchParams>): Promise<ExploreParams> {
  const { tab, q } = parseExploreParams(await searchParams);
  return { tab, q };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, t] = await Promise.all([readParams(searchParams), getTranslations("discover")]);
  const title = params.q ? t("explore.search.resultsFor", { q: params.q }) : params.tab === "listas" ? t("meta.lists") : t("meta.explore");
  return { title, description: t("explore.description") };
}

// Explorar: busca (GET) e abas (conteúdos, programas, produtos, listas), sem filtros.
export default async function ExplorePage({ searchParams }: Props) {
  const [params, t] = await Promise.all([readParams(searchParams), getTranslations("discover.explore")]);

  const tabs: { value: ExploreTab; label: string; icon: ReactNode }[] = [
    { value: "conteudos", label: t("tabs.contents"), icon: <LibraryBig /> },
    { value: "programas", label: t("tabs.programs"), icon: <Layers /> },
    { value: "produtos", label: t("tabs.products"), icon: <ShoppingBag /> },
    { value: "listas", label: t("tabs.lists"), icon: <Bookmark /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={t("eyebrow")}>
        <SearchForm params={params} />
      </PageHeader>

      <UrlTabs value={params.tab} aria-label={t("tabs.label")} tabs={tabs.map((tab) => ({ ...tab, href: exploreHref(params, { tab: tab.value }) }))}>
        {params.tab === "conteudos" && (
          <Suspense key={JSON.stringify(params)} fallback={<TilesSkeleton />}>
            <SearchResults params={params} />
          </Suspense>
        )}
        {params.tab === "programas" && (
          <Suspense fallback={<CardsSkeleton />}>
            <ProgramsTab params={params} />
          </Suspense>
        )}
        {params.tab === "produtos" && (
          <Suspense fallback={<CardsSkeleton count={8} />}>
            <ProductsTab />
          </Suspense>
        )}
        {params.tab === "listas" && (
          <Suspense fallback={<CardsSkeleton />}>
            <ListsTab />
          </Suspense>
        )}
      </UrlTabs>
    </div>
  );
}
