import { BadgeCheck, ChefHat, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { tileCover, type ContentTileData } from "@/components/discover/explore/tiles";
import { Avatar } from "@/components/ui";

type Hero = { slug: string; name: string };
type Props = { recipes: ContentTileData[]; hero: Hero };

// Receitas da biblioteca do herói: cada uma assinada pelo chef que a fez. Quando o chef é outro, o
// herói aparece como quem indica (endosso); quando é dele mesmo, a assinatura já é a dele.
export async function RecipeList({ recipes, hero }: Props) {
  const t = await getTranslations("recipes.library");
  const hasEndorsed = recipes.some((r) => r.creator && r.creator.slug !== hero.slug);

  return (
    <div className="flex flex-col gap-4">
      {hasEndorsed ? (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 type-body-sm text-fg-muted" data-testid="recipe-endorsement-note">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          {t("endorsementNote", { hero: hero.name })}
        </p>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="recipe-list">
        {recipes.map((recipe, index) => {
          const chef = recipe.creator;
          const own = chef?.slug === hero.slug;
          const src = tileCover(recipe.cover_url, recipe.pillar);
          return (
            <li key={recipe.id}>
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface" data-testid="recipe-card">
                <Link href={`/content/${recipe.slug}`} className="group flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <span className="relative block aspect-[4/3] overflow-hidden bg-surface-elevated">
                    <Image src={src} alt="" fill priority={index < 2} unoptimized={src.endsWith(".svg")} sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
                    {recipe.access_level === "premium" ? (
                      <Lock aria-hidden="true" className="absolute bottom-3 left-3 size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                    ) : null}
                  </span>
                  <span className="flex flex-col gap-1 px-4 pt-3">
                    <span className="type-caption inline-flex items-center gap-1.5 text-fg-muted">
                      <ChefHat className="size-3.5" aria-hidden="true" />
                      {t("type")}
                    </span>
                    <span className="text-base font-semibold leading-snug text-fg group-hover:underline">{recipe.title}</span>
                  </span>
                </Link>
                <div className="mt-auto flex flex-col gap-2 px-4 pb-4 pt-3">
                  {chef ? (
                    <Link href={`/personalities/${chef.slug}`} className="flex w-fit min-h-11 items-center gap-2 rounded-lg pr-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="recipe-signature">
                      <Avatar src={chef.avatar_url} name={chef.name} alt="" size="xs" />
                      <span className="type-body-sm text-fg">{t("signedBy", { chef: chef.name })}</span>
                    </Link>
                  ) : null}
                  {chef && !own ? (
                    <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-accent-text" data-testid="recipe-endorsed">
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      {t("endorsedBy", { hero: hero.name })}
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
