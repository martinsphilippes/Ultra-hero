"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/** Código de erro das actions de receita ("recipe_incomplete", "stale_draft"…) → texto traduzido. */
export function useRecipeErrorText() {
  const t = useTranslations("recipes.structured.errors");
  return useCallback((code: string | null | undefined) => {
    const key = (code ?? "").split(":")[0].trim();
    return key && t.has(key) ? t(key) : t("generic");
  }, [t]);
}
