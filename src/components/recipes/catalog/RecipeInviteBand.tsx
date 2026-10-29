import { BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { RECIPE_STEPS, recipeStepHref } from "@/lib/recipes/onboarding";

type Props = { nextPath: string; loggedIn: boolean };

// Faixa do catálogo para quem ainda não fez a etapa demonstrativa (P2): os cards ficam abertos a
// todos, e abrir a receita (ingredientes, preparo, modo cozinha) pede a etapa. O visitante passa
// pelo login antes (o middleware devolve para a etapa e depois para cá).
export async function RecipeInviteBand({ nextPath, loggedIn }: Props) {
  const t = await getTranslations("recipes.catalog.invite");
  return (
    <aside aria-labelledby="recipe-invite-title" className="uh-inverse flex flex-col gap-3 rounded-2xl bg-obsidian p-4 text-white sm:flex-row sm:items-center sm:justify-between" data-testid="recipe-invite">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <BookOpen className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="recipe-invite-title" className="text-sm font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-white/75">{t("description", { total: RECIPE_STEPS.length })}</p>
        </div>
      </div>
      <Link
        href={recipeStepHref(nextPath)}
        className="flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        data-testid="recipe-invite-start"
      >
        {loggedIn ? t("action") : t("visitorAction")}
      </Link>
    </aside>
  );
}
