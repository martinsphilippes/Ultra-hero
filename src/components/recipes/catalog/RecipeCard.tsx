import { BadgeCheck, Clock, Lock, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { tileCover } from "@/components/discover/explore/tiles";
import { Avatar } from "@/components/ui";
import { splitMinutes, type RecipeCardData } from "@/lib/recipes/card";
import { recipeSignature, showcaseRecipeHref, type ShowcasePerson } from "@/lib/recipes/showcase";
import { cn } from "@/lib/utils";

type Props = {
  recipe: RecipeCardData;
  priority?: boolean;
  /**
   * Na Alimentação de um herói: o herói da vitrine. Receita de outro chef aparece como "Receita de
   * {chef} · indicada por {herói}"; sem chef, "Indicada por {herói}". O link leva ?vitrine=.
   */
  showcaseHero?: ShowcasePerson | null;
  /** Ações da vitrine (Fazer, Comprar pronto, Lista de compras), abaixo da assinatura. */
  actions?: ReactNode;
  headingLevel?: "h2" | "h3";
};

// Card de receita (catálogo, biblioteca do herói e relacionadas): foto 4:5, título, chef, tempo total,
// porções, dificuldade e os alérgenos e dietas declarados pelo chef. Aberto a todos, inclusive ao
// visitante (P2); a página da receita é que pede a etapa demonstrativa. Nenhum selo de adequação.
export async function RecipeCard({ recipe, priority, showcaseHero = null, actions, headingLevel: Heading = "h3" }: Props) {
  const [t, tl, ta, td, tcat] = await Promise.all([
    getTranslations("recipes.catalog.card"),
    getTranslations("recipes.library"),
    getTranslations("recipes.onboarding.allergies"),
    getTranslations("recipes.onboarding.restrictions"),
    getTranslations("catalog"),
  ]);
  const src = tileCover(recipe.cover_url, recipe.pillar);
  const premium = recipe.access_level === "premium";
  const minutes = recipe.totalMinutes !== null ? splitMinutes(recipe.totalMinutes) : null;
  const time = minutes ? (minutes.h > 0 ? t("hours", { h: minutes.h, m: minutes.m }) : t("minutes", { m: minutes.m })) : null;
  const allergens = !recipe.allergensDeclared
    ? t("allergensUnknown")
    : recipe.allergens.length === 0
      ? t("allergensNone")
      : t("allergensDeclared", { list: recipe.allergens.map((a) => ta(a)).join(", ") });
  // assinatura (0051): o chef escolhido pelo admin ou o autor; o herói da vitrine indica
  const signature = recipeSignature({ author: recipe.creator, signer: recipe.signer, showcaseHero });
  const chef = signature.chef;
  const indicatedBy = signature.hero;
  const diets = recipe.diets.slice(0, 2);
  const moreDiets = recipe.diets.length - diets.length;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface" data-testid="recipe-card" data-slug={recipe.slug}>
      <Link href={showcaseRecipeHref(recipe.slug, showcaseHero?.slug ?? null)} className="group flex flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
        <span className="relative block aspect-[4/5] overflow-hidden bg-surface-elevated">
          <Image
            src={src}
            alt=""
            fill
            priority={priority}
            unoptimized={src.endsWith(".svg")}
            sizes="(min-width: 1024px) 18rem, (min-width: 768px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03] motion-reduce:transition-none"
          />
          {premium ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-obsidian/80 px-2 py-1 text-[0.6875rem] font-semibold text-white">
              <Lock className="size-3.5" aria-hidden="true" />
              {recipe.required_module?.name ?? tcat("premium")}
            </span>
          ) : null}
        </span>
        <span className="flex flex-col gap-1.5 px-3 pt-3">
          <Heading className="line-clamp-2 text-sm font-semibold leading-snug text-fg group-hover:underline sm:text-base">{recipe.title}</Heading>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 type-caption text-fg-muted">
            {time ? (
              <span className="inline-flex items-center gap-1" data-testid="recipe-card-time">
                <Clock className="size-3.5" aria-hidden="true" />
                {time}
              </span>
            ) : null}
            {recipe.servings !== null ? (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden="true" />
                {t("servings", { n: recipe.servings })}
              </span>
            ) : null}
            {recipe.difficulty ? <span>{tcat(`difficulty.${recipe.difficulty}`)}</span> : null}
          </span>
        </span>
      </Link>
      <div className="mt-auto flex flex-col gap-2 px-3 pb-3 pt-2">
        <p className={cn("type-caption", recipe.allergensDeclared && recipe.allergens.length > 0 ? "text-fg" : "text-fg-subtle")} data-testid="recipe-card-allergens">
          {allergens}
        </p>
        {diets.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label={t("dietsLabel")}>
            {diets.map((d) => (
              <li key={d} className="rounded-full bg-success-soft px-2 py-0.5 text-[0.6875rem] font-medium text-success">
                {td(d)}
              </li>
            ))}
            {moreDiets > 0 ? <li className="px-1 text-[0.6875rem] text-fg-muted">+{moreDiets}</li> : null}
          </ul>
        ) : null}
        {chef ? (
          <Link
            href={`/personalities/${chef.slug}`}
            className="flex min-h-11 w-fit max-w-full items-center gap-2 rounded-lg pr-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="recipe-signature"
          >
            <Avatar src={chef.avatar_url} name={chef.name} alt="" size="xs" />
            {/* no card estreito cabe só o nome; o "Receita de" fica para o leitor de tela */}
            <span className="truncate type-caption text-fg">
              <span className="sr-only">{tl("signedBy", { chef: chef.name })}</span>
              <span aria-hidden="true">{chef.name}</span>
            </span>
          </Link>
        ) : null}
        {indicatedBy ? (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-accent-text" data-testid="recipe-endorsed">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            {tl("endorsedBy", { hero: indicatedBy.name })}
          </p>
        ) : null}
        {actions}
      </div>
    </article>
  );
}
