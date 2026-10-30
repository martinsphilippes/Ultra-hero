import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentTile, ProductActionCard } from "@/components/catalog";
import { CARD_GRID, TILE_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { LIBRARY_ICONS } from "@/components/discover/personalities/library-icons";
import { ProgramShelf } from "@/components/programs/ProgramShelf";
import { ChefRecipes } from "@/components/recipes/catalog/ChefRecipes";
import { RecipeInviteBand } from "@/components/recipes/catalog/RecipeInviteBand";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { hubHref, loadCreator, loadCreatorHub, type HubLibrary } from "@/lib/catalog/creator-hub";
import { isLibraryKey, type LibraryKey } from "@/lib/catalog/creator-libraries";
import { maxCartQuantity } from "@/lib/catalog/creator-products";
import { loadProgramShelves } from "@/lib/catalog/program-shelves";
import { parseRecipeCatalogParams, recipeCatalogHref } from "@/lib/recipes/catalog-params";
import type { LocaleCode } from "@/lib/supabase/helpers";
import { getRecipeGate } from "@/lib/recipes/gate";

type Props = { params: Promise<{ slug: string; library: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, library } = await params;
  if (!isLibraryKey(library)) return {};
  const [creator, t] = await Promise.all([loadCreator(slug), getTranslations("discover")]);
  if (!creator) return {};
  // rótulo configurado pelo admin (0050) ou o padrão; loadCreatorHub é memoizado com a página
  const hub = await loadCreatorHub(creator);
  const label = hub.tabs[library].text ?? t(`personalities.libraries.labels.${library}`);
  return { title: t("meta.library", { library: label, name: creator.name }), description: t(`personalities.libraries.descriptions.${library}`, { name: creator.name }) };
}

// Uma biblioteca do herói (RF-004): grade de quadrados para conteúdos, catálogo para Alimentação,
// prateleiras para programas (uma por programa, etapas com rolagem lateral) e cards com ação para
// produtos. Segmento fora de LIBRARY_KEYS é 404 (os antigos rotina/receitas viram 308 no middleware).
// Título e ícone seguem a configuração do admin (0050); atalho oculto continua acessível pela URL.
export default async function LibraryPage({ params, searchParams }: Props) {
  const [{ slug, library }, raw] = await Promise.all([params, searchParams]);
  if (!isLibraryKey(library)) notFound();

  const [creator, t, tp] = await Promise.all([loadCreator(slug), getTranslations("discover.personalities.libraries"), getTranslations("discover.personalities.profile")]);
  if (!creator) notFound();

  // Alimentação (P2): os cards ficam abertos a todos, com a faixa da etapa demonstrativa para quem ainda
  // não a fez; abrir a receita é que pede a etapa (o banco garante por can_access_content).
  const recipeParams = library === "alimentacao" ? parseRecipeCatalogParams(raw) : null;
  const gate = recipeParams ? await getRecipeGate() : null;

  const hub = await loadCreatorHub(creator);
  const current = hub.libraries.find((item) => item.key === library);
  const error = library === "programas" ? hub.errors.programs : library === "produtos" ? hub.errors.products : hub.errors.contents;
  const tab = hub.tabs[library];
  const Icon = LIBRARY_ICONS[tab.icon];
  const hubPath = hubHref(creator.slug);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={hubPath}
        backLabel={t("back", { name: creator.name })}
        eyebrow={creator.name}
        title={tab.text ?? t(`labels.${library}`)}
        description={t(`descriptions.${library}`, { name: creator.name })}
      />

      {recipeParams && gate && !gate.completed ? (
        <RecipeInviteBand nextPath={recipeCatalogHref(hubHref(creator.slug, "alimentacao"), recipeParams)} loggedIn={gate.loggedIn} />
      ) : null}

      {error ? (
        <InlineError />
      ) : !current || current.count === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Icon />}
            title={library === "produtos" ? tp("productsEmptyTitle") : library === "programas" ? tp("programsEmptyTitle") : t("libraryEmpty")}
            description={library === "produtos" ? tp("productsEmptyDescription") : library === "programas" ? tp("programsEmptyDescription") : t("libraryEmptyDescription", { name: creator.name })}
            action={
              <Button asChild variant="secondary">
                <Link href={library === "produtos" ? "/shop" : hubPath}>{library === "produtos" ? tp("productsGoToShop") : t("back", { name: creator.name })}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <LibraryBody library={current} slug={creator.slug} hub={hub} hero={{ id: creator.id, slug: creator.slug, name: creator.name }} recipeParams={recipeParams} />
      )}
    </div>
  );
}

type BodyProps = {
  library: HubLibrary;
  slug: string;
  hub: Awaited<ReturnType<typeof loadCreatorHub>>;
  hero: { id: string; slug: string; name: string };
  recipeParams: ReturnType<typeof parseRecipeCatalogParams> | null;
};

async function LibraryBody({ library, slug, hub, hero, recipeParams }: BodyProps) {
  const tp = await getTranslations("discover.personalities.profile");
  const tl = await getTranslations("discover.personalities.libraries");
  const key: LibraryKey = library.key;

  // Alimentação: as receitas assinadas pelo herói (com busca e filtros) e depois as que ele indica.
  if (library.kind === "content" && key === "alimentacao") {
    return <ChefRecipes recipes={library.items} hero={hero} params={recipeParams ?? parseRecipeCatalogParams({})} />;
  }

  if (library.kind === "content") {
    // Mesma grade do Explorar: 3 colunas de quadrados, sangrando no celular e centrada no desktop.
    return (
      <div className="flex flex-col gap-3">
        <p className="sr-only">{tl("count", { count: library.count })}</p>
        <div className={TILE_GRID} data-testid="library-grid" data-library={key}>
          {library.items.map((content, index) => (
            <ContentTile key={content.id} content={content} priority={index < 3} />
          ))}
        </div>
      </div>
    );
  }

  // Programas: uma prateleira por programa (estilo playlist), inscrito em andamento primeiro.
  if (library.kind === "programs") {
    const [locale, ts] = await Promise.all([getLocale(), getTranslations("catalog.programShelf")]);
    const { shelves, error } = await loadProgramShelves(library.items, locale as LocaleCode);
    return (
      <div className="flex flex-col gap-8" data-testid="library-programs">
        <p className="sr-only">{ts("count", { count: shelves.length })}</p>
        {error ? <InlineError /> : null}
        {shelves.map((shelf, index) => (
          <ProgramShelf key={shelf.id} shelf={shelf} priority={index === 0} />
        ))}
      </div>
    );
  }

  // Produtos: nota de demonstração + cards com carrinho de teste; o login volta para esta biblioteca.
  const productsPath = hubHref(slug, "produtos");
  return (
    <div className="flex flex-col gap-4">
      <p className="type-body-sm text-fg-muted">{tp("productsNote")}</p>
      <ul className={CARD_GRID} data-testid="library-products">
        {library.items.map(({ product, usedIn }, index) => (
          <li key={product.id}>
            <ProductActionCard
              product={product}
              usedIn={usedIn}
              purchasable
              maxQuantity={maxCartQuantity(product.demo_stock)}
              isLoggedIn={hub.isLoggedIn}
              inCart={hub.inCartByProduct.get(product.id) ?? 0}
              nextPath={productsPath}
              interestContentId={usedIn[0]?.id}
              priority={index < 2}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
