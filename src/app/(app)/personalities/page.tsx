import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CreatorCard } from "@/components/catalog";
import { FollowButton } from "@/components/heroes/FollowButton";
import { ChipLink, ChipRow } from "@/components/discover/ChipLink";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { CREATOR_CARD_SELECT, localizedLabel, type CreatorCardData } from "@/lib/catalog/queries";
import {
  categoriesByCreator,
  creatorsForCategory,
  HERO_CATEGORY_PARAM,
  HERO_PAGE_PARAM,
  heroPageSlice,
  parseCategoryParam,
  parsePageParam,
  personalitiesHref,
  resolveCategory,
  visibleCategories,
} from "@/lib/heroes/categories";
import { fetchHeroCategories } from "@/lib/heroes/category-queries";
import { getFollowContext } from "@/lib/heroes/follow-context";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover");
  return { title: t("meta.personalities"), description: t("personalities.description") };
}

// Heros ativos (ordem editorial sort_order), com filtro por categoria do Hero na URL
// (?categoria=slug, 0049). Sem a 0049 no banco: só "Todos" e cards sem selo. Chips com navegação de
// documento: no roteador do Next, trocar só a query na mesma rota abortava o payload (tela parada).
// Com o Casting Groscove (0123, ~260 Heros) a grade mostra blocos de 48 e um "Ver mais Heros" (?pagina=N, também
// navegação de documento), que leva direto ao primeiro card novo (âncora #heroi-N).
export default async function PersonalitiesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const [raw, locale, t, { data, error }, categoryData, follow] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("discover.personalities"),
    supabase.from("creator_profiles").select(CREATOR_CARD_SELECT).eq("status", "active").order("sort_order").order("name"),
    fetchHeroCategories(supabase),
    getFollowContext(),
  ]);
  const allCreators = (data ?? []) as unknown as CreatorCardData[];
  const chips = visibleCategories(
    categoryData.categories,
    categoryData.links,
    allCreators.map((c) => c.id),
  );
  const selected = resolveCategory(parseCategoryParam(raw[HERO_CATEGORY_PARAM]), chips);
  const creators = creatorsForCategory(allCreators, categoryData.links, selected?.id ?? null);
  const badges = categoriesByCreator(categoryData.links, categoryData.categories);
  const page = parsePageParam(raw[HERO_PAGE_PARAM]);
  const { shown, nextPage } = heroPageSlice(creators, page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
      >
        <ChipRow label={t("filterLabel")}>
          <span className="contents" data-testid="hero-category-chips" data-available={categoryData.available ? "true" : "false"}>
            <ChipLink href={personalitiesHref(null)} selected={!selected} document>
              {t("all")}
            </ChipLink>
            {chips.map((category) => (
              <ChipLink key={category.id} href={personalitiesHref(category.slug)} selected={selected?.id === category.id} document>
                {localizedLabel(category.name, locale)}
              </ChipLink>
            ))}
          </span>
        </ChipRow>
      </PageHeader>

      {error ? (
        <InlineError />
      ) : creators.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Users />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              selected ? (
                <Button asChild variant="secondary">
                  <Link href={personalitiesHref(null)}>{t("all")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <p className="type-caption text-fg-muted" aria-live="polite">
            {t("count", { count: creators.length })}
          </p>
          <ul className={CARD_GRID}>
            {shown.map((creator, index) => (
              // botão Seguir fora do link do card (botão dentro de link não é válido), sobre a capa
              <li key={creator.id} id={`heroi-${index}`} className="relative scroll-mt-24">
                <CreatorCard
                  creator={creator}
                  categories={(badges.get(creator.id) ?? []).map((c) => ({ id: c.id, label: localizedLabel(c.name, locale) }))}
                  priority={index < 2}
                />
                {follow.available ? (
                  // pílula pequena no canto da capa, em vidro escuro (legível sobre qualquer foto)
                  <div className="absolute right-2.5 top-2.5">
                    <FollowButton
                      creatorId={creator.id}
                      heroName={creator.name}
                      initialFollowing={follow.following.has(creator.id)}
                      signedIn={follow.signedIn}
                      path="/personalities"
                      pushReady={follow.pushReady}
                      size="compact"
                      tone="overlay"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {nextPage !== null ? (
            <div className="flex flex-col items-center gap-2">
              <p className="type-caption text-fg-muted">{t("showing", { shown: shown.length, total: creators.length })}</p>
              <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
                {/* navegação de documento, como os chips; a âncora leva ao primeiro card do bloco novo */}
                <a href={`${personalitiesHref(selected?.slug ?? null, nextPage)}#heroi-${shown.length}`} data-testid="heroes-load-more">
                  {t("loadMore")}
                </a>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
