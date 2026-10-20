"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

// Traduz o código devolvido pelas ações de lista; códigos desconhecidos caem em "failed".
export function useListError() {
  const t = useTranslations("discover.explore.lists.errors");
  return useCallback((code: string) => (t.has(code) ? t(code) : t("failed")), [t]);
}
