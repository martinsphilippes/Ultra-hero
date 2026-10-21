import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { recipeStepHref, type RecipeAllergy, type RecipeRestriction } from "@/lib/recipes/onboarding";

type Props = { restrictions: RecipeRestriction[]; allergies: RecipeAllergy[]; path: string };

// Lembrete na página da receita com o que a pessoa informou na etapa. Não diz que a receita é segura:
// os ingredientes não têm revisão profissional, então a conferência é sempre da pessoa.
export async function AllergyReminder({ restrictions, allergies, path }: Props) {
  if (restrictions.length === 0 && allergies.length === 0) return null;
  const t = await getTranslations("recipes.reminder");
  const to = await getTranslations("recipes.onboarding");
  const items = [...allergies.map((a) => to(`allergies.${a}`)), ...restrictions.map((r) => to(`restrictions.${r}`))];
  return (
    <aside aria-labelledby="allergy-reminder-title" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4" data-testid="allergy-reminder">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h2 id="allergy-reminder-title" className="text-sm font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("description", { items: items.join(", ") })}</p>
        <Link href={recipeStepHref(path)} className="w-fit text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("edit")}
        </Link>
      </div>
    </aside>
  );
}
