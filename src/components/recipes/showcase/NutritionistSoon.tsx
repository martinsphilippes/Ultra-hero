import { Salad } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { NUTRITIONIST_ACTION } from "@/lib/recipes/showcase";

// "Contratar nutricionista" (0051): profissionais chegam na Etapa 3. Até lá, só uma linha discreta,
// sem botão nem link. A Etapa 3 troca NUTRITIONIST_ACTION para "live" e põe a ação de verdade aqui.
export async function NutritionistSoon() {
  if (NUTRITIONIST_ACTION !== "soon") return null;
  const t = await getTranslations("recipes.showcase");
  return (
    <p className="flex items-center gap-2 type-caption text-fg-subtle" data-testid="recipe-nutritionist-soon">
      <Salad className="size-3.5 shrink-0" aria-hidden="true" />
      {t("nutritionistSoon")}
    </p>
  );
}
