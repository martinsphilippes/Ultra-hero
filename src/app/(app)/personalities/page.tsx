import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CreatorCard } from "@/components/catalog";
import { ChipLink, ChipRow } from "@/components/discover/ChipLink";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { CREATOR_CARD_SELECT, localizedLabel, type CreatorCardData } from "@/lib/catalog/queries";
import {
  categoriesByCreator,
  creatorsForCategory,
  HERO_CATEGORY_PARAM,
  parseCategoryParam,
  personalitiesHref,
  resolveCategory,
  visibleCategories,
} from "@/lib/heroes/categories";
import { fetchHeroCategories } from "@/lib/heroes/category-queries";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover");
  return { title: t("meta.personalities"), description: t("personalities.description") };
}

// Heróis ativos (ordem editorial sort_order), com filtro por categoria do herói na URL
// (?categoria=slug, 0049). Sem a 0049 no banco: só "Todos" e cards sem selo. Chips com navegação de
// documento: no roteador do Next, trocar só a query na mesma rota abortava o payload (tela parada).
export default async function PersonalitiesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const [raw, locale, t, tcat, { data, error }, categoryData] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("discover.personalities"),
    getTranslations("catalog"),
    supabase.from("creator_profiles").select(CREATOR_CARD_SELECT).eq("status", "active").order("sort_order").order("name"),
    fetchHeroCategories(supabase),
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
        actions={
          <Badge variant="demo" className="hidden sm:inline-flex">
            {tcat("fictional")}
          </Badge>
        }
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
            {creators.map((creator, index) => (
              <li key={creator.id}>
                <CreatorCard
                  creator={creator}
                  categories={(badges.get(creator.id) ?? []).map((c) => ({ id: c.id, label: localizedLabel(c.name, locale) }))}
                  priority={index < 2}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
