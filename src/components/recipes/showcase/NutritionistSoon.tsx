import { Salad } from "lucide-react";
import { getTranslations } from "next-intl/server";

// "Nutricionista: em breve" (0051): linha discreta, sem botão nem link. Desde a Etapa 3 (0058) é só o
// que aparece quando o banco não tem os profissionais (ou nenhum nutricionista aprovado); com eles,
// HireNutritionist mostra os sugeridos com "Contratar".
export async function NutritionistSoon() {
  const t = await getTranslations("recipes.showcase");
  return (
    <p className="flex items-center gap-2 type-caption text-fg-subtle" data-testid="recipe-nutritionist-soon">
      <Salad className="size-3.5 shrink-0" aria-hidden="true" />
      {t("nutritionistSoon")}
    </p>
  );
}
