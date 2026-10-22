import { ChefHat } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Aviso do editor antigo (herói e admin): desde a 0027 a receita tem modelo estruturado e só o editor
// novo grava; aqui ela aparece só para leitura, sem Publicar nem Despublicar.
export async function RecipeLegacyNotice() {
  const t = await getTranslations("recipes.structured.legacyEditor");
  return (
    <div role="status" data-testid="recipe-legacy-notice" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-fg">
      <ChefHat className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t("title")}</p>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
    </div>
  );
}
