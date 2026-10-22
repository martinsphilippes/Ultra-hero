import type { Metadata } from "next";
import { Bookmark, ChefHat, Layers, LibraryBig, ShoppingBag } from "lucide-react";
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
import { RecipeCatalog } from "@/components/recipes/catalog/RecipeCatalog";
import { RecipeCatalogSkeleton } from "@/components/recipes/catalog/RecipeCatalogSkeleton";
import { RecipeSearchForm } from "@/components/recipes/catalog/RecipeFilters";
import { RecipeInviteBand } from "@/components/recipes/catalog/RecipeInviteBand";
import { PageHeader } from "@/components/ui";
import { parseRecipeCatalogParams, recipeCatalogHref, type RecipeCatalogParams } from "@/lib/recipes/catalog-params";
import { getRecipeGate } from "@/lib/recipes/gate";

type Props = { searchParams: Promise<RawSearchParams> };

// Como no Instagram, o Explorar tem só a caixa de busca: filtros antigos na URL (links salvos) são
// ignorados em vez de dar erro. A aba Receitas é a exceção (decisão 1): lê os próprios filtros.
async function readParams(searchParams: Promise<RawSearchParams>): Promise<ExploreParams & { recipes: RecipeCatalogParams | null }> {
  const raw = await searchParams;
  const { tab, q } = parseExploreParams(raw);
  return { tab, q, recipes: tab === "receitas" ? parseRecipeCatalogParams(raw) : null };
}

const RECIPES_FIXED: [string, string][] = [["tab", "receitas"]];

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, t] = await Promise.all([readParams(searchParams), getTranslations("discover")]);
  const title = params.q
    ? t("explore.search.resultsFor", { q: params.q })
    : params.tab === "listas"
      ? t("meta.lists")
      : params.tab === "receitas"
        ? t("meta.recipes")
        : t("meta.explore");
  return { title, description: t("explore.description") };
}

// Explorar: busca (GET) e abas (conteúdos, receitas, programas, produtos, listas). Só a aba
// Receitas tem filtros; nela a caixa do cabeçalho busca receitas por nome, chef ou ingrediente.
export default async function ExplorePage({ searchParams }: Props) {
  const [{ recipes, ...params }, t] = await Promise.all([readParams(searchParams), getTranslations("discover.explore")]);
  const gate = recipes ? await getRecipeGate() : null;

  const tabs: { value: ExploreTab; label: string; icon: ReactNode }[] = [
    { value: "conteudos", label: t("tabs.contents"), icon: <LibraryBig /> },
    { value: "receitas", label: t("tabs.recipes"), icon: <ChefHat /> },
    { value: "programas", label: t("tabs.programs"), icon: <Layers /> },
    { value: "produtos", label: t("tabs.products"), icon: <ShoppingBag /> },
    { value: "listas", label: t("tabs.lists"), icon: <Bookmark /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={recipes ? t("recipesDescription") : t("description")} eyebrow={t("eyebrow")}>
        {recipes ? <RecipeSearchForm params={recipes} base="/explore" fixed={RECIPES_FIXED} idPrefix="explore-recipes" /> : <SearchForm params={params} />}
      </PageHeader>

      <UrlTabs value={params.tab} aria-label={t("tabs.label")} tabs={tabs.map((tab) => ({ ...tab, href: exploreHref(params, { tab: tab.value }) }))}>
        {recipes && gate ? (
          <div className="flex flex-col gap-4">
            {/* P2: cards abertos a todos; abrir a receita pede a etapa demonstrativa */}
            {!gate.completed ? <RecipeInviteBand nextPath={recipeCatalogHref("/explore", recipes, RECIPES_FIXED)} loggedIn={gate.loggedIn} /> : null}
            <Suspense key={JSON.stringify(recipes)} fallback={<RecipeCatalogSkeleton />}>
              <RecipeCatalog params={recipes} base="/explore" fixed={RECIPES_FIXED} track="explore" idPrefix="explore-recipes" />
            </Suspense>
          </div>
        ) : null}
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
