import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Badge } from "@/components/ui";
import type { RecipeSignature, ShowcasePerson } from "@/lib/recipes/showcase";

const LINK = "font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Assinatura da receita na página (0051): "Receita de {chef}", "Receita de {chef} · indicada por
// {herói}" ou "Indicada por {herói}", com a foto de quem assina (ou de quem indica, sem chef).
export async function RecipeSignatureLine({ signature }: { signature: RecipeSignature }) {
  if (signature.kind === "none") return null;
  const [t, tc] = await Promise.all([getTranslations("recipes.showcase.signature"), getTranslations("consume.content")]);
  const face: ShowcasePerson = signature.chef ?? signature.hero;
  const link = (person: ShowcasePerson) =>
    function PersonLink(chunks: ReactNode) {
      return (
        <Link href={`/personalities/${person.slug}`} className={LINK}>
          {chunks}
        </Link>
      );
    };
  const text =
    signature.kind === "chef"
      ? t.rich("chef", { chef: signature.chef.name, chefLink: link(signature.chef) })
      : signature.kind === "chefIndicated"
        ? t.rich("chefIndicated", { chef: signature.chef.name, hero: signature.hero.name, chefLink: link(signature.chef), heroLink: link(signature.hero) })
        : t.rich("indicated", { hero: signature.hero.name, heroLink: link(signature.hero) });
  return (
    <div className="flex min-h-11 w-fit items-center gap-3" data-testid="recipe-page-signature" data-kind={signature.kind}>
      <Link href={`/personalities/${face.slug}`} aria-hidden="true" tabIndex={-1} className="shrink-0">
        <Avatar src={face.avatar_url} name={face.name} alt="" size="md" />
      </Link>
      <span className="flex flex-wrap items-center gap-2 text-sm text-fg">
        <span>{text}</span>
        {face.is_fictional ? (
          <Badge variant="demo" size="sm">
            {tc("creatorFictional")}
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
