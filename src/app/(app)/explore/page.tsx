import type { Metadata } from "next";
import { Bookmark, Layers, LibraryBig, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { ContentFilters } from "@/components/discover/explore/Filters";
import { ListsTab } from "@/components/discover/explore/ListsTab";
import { exploreHref, parseExploreParams, type ExploreTab, type RawSearchParams } from "@/components/discover/explore/params";
import { ProductsTab } from "@/components/discover/explore/ProductsTab";
import { ProgramsTab } from "@/components/discover/explore/ProgramsTab";
import { SearchForm } from "@/components/discover/explore/SearchForm";
import { SearchResults } from "@/components/discover/explore/SearchResults";
import { CardsSkeleton } from "@/components/discover/SectionSkeleton";
import { UrlTabs } from "@/components/discover/UrlTabs";
import { PageHeader } from "@/components/ui";

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, t] = await Promise.all([searchParams.then(parseExploreParams), getTranslations("discover")]);
  const title = params.q ? t("explore.search.resultsFor", { q: params.q }) : params.tab === "listas" ? t("meta.lists") : t("meta.explore");
  return { title, description: t("explore.description") };
}

// Explorar: busca (GET), filtros na URL e abas (conteúdos, programas, produtos, listas).
export default async function ExplorePage({ searchParams }: Props) {
  const [params, t] = await Promise.all([searchParams.then(parseExploreParams), getTranslations("discover.explore")]);

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
          <div className="flex flex-col gap-5">
            <ContentFilters params={params} />
            <Suspense key={JSON.stringify(params)} fallback={<CardsSkeleton />}>
              <SearchResults params={params} />
            </Suspense>
          </div>
        )}
        {params.tab === "programas" && (
          <Suspense key={params.pillar ?? "all"} fallback={<CardsSkeleton />}>
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
