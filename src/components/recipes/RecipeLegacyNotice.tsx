import { ChefHat, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui";

// Aviso do editor antigo (herói e admin): desde a 0027 a receita tem modelo estruturado e só o editor
// de receitas grava; aqui ela aparece só para leitura, sem Publicar nem Despublicar. Para o herói,
// "Editar" leva ao editor novo (Portal do Chef); o admin segue só com a leitura nesta fase.
export async function RecipeLegacyNotice({ editHref }: { editHref?: string }) {
  const t = await getTranslations("recipes.structured.legacyEditor");
  return (
    <div role="status" data-testid="recipe-legacy-notice" className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-fg sm:flex-row sm:items-start">
      <ChefHat className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-semibold">{t("title")}</p>
        <p className="type-body-sm text-fg-muted">{editHref ? t("description") : t("adminDescription")}</p>
      </div>
      {editHref && (
        <Button asChild variant="primary" leadingIcon={<Pencil />} className="shrink-0">
          <Link href={editHref} data-testid="recipe-open-editor">
            {t("openEditor")}
          </Link>
        </Button>
      )}
    </div>
  );
}
